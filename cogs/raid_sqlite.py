"""
Raid / compromised-account defense.

When enabled, if >= `threshold` *distinct* members post the same link within
`window` seconds, it's treated as a coordinated raid (often hijacked accounts
mass-dropping a scam link). Instead of dozens of individual warnings, the bot
deletes those messages, times out every involved account, posts a single alarm,
and (best-effort) pushes an alert to the server's managers.

Defaults to OFF — existing servers are unaffected until an admin enables it.
"""

import os
import time
import asyncio
from datetime import timedelta

import aiohttp
import discord
from discord.ext import commands, tasks

from .shared import (get_settings, resolve_channel, is_whitelisted,
                     link_allowlisted, extract_urls, record_blocked,
                     notify_action_failure)

_API_SECRET = os.environ.get("BOT_API_SECRET")
_INTERNAL_API = os.environ.get("INTERNAL_API_URL", "http://127.0.0.1:3002")


class RaidProtection(commands.Cog):
    def __init__(self, bot):
        self.bot = bot
        # {(guild_id, domain): [(user_id, message, monotonic_ts), …]}
        self._window: dict[tuple[int, str], list] = {}
        # {(guild_id, domain): last_fired_monotonic} — debounce repeat triggers.
        self._cooldown: dict[tuple[int, str], float] = {}
        self._started = False

    def _ensure_started(self):
        """py-cord never calls cog_load — start the cleanup loop lazily."""
        if self._started:
            return
        self._started = True
        self._cleanup.start()

    @commands.Cog.listener()
    async def on_ready(self):
        self._ensure_started()

    @tasks.loop(minutes=5)
    async def _cleanup(self):
        """Drop stale buckets/cooldowns so memory doesn't grow unbounded."""
        now = time.monotonic()
        for key, entries in list(self._window.items()):
            fresh = [e for e in entries if now - e[2] < 60]
            if fresh:
                self._window[key] = fresh
            else:
                self._window.pop(key, None)
        for key, ts in list(self._cooldown.items()):
            if now - ts > 600:
                self._cooldown.pop(key, None)

    @commands.Cog.listener()
    async def on_message(self, message: discord.Message):
        if message.author.bot or not message.guild or "." not in message.content:
            return
        self._ensure_started()

        settings = await get_settings(str(message.guild.id))
        settings = resolve_channel(settings, message.channel)
        raid = settings.get("raid", {}) or {}
        if not raid.get("enabled"):
            return
        if settings.get("_lp_channel_off"):
            return
        if is_whitelisted(message, settings):
            return

        items = extract_urls(message.content)
        if not items:
            return

        now = time.monotonic()
        threshold = max(2, int(raid.get("threshold", 5) or 5))
        window = max(2, int(raid.get("window", 10) or 10))

        for _url, domain in items:
            if link_allowlisted(_url, settings):
                continue
            key = (message.guild.id, domain)
            if now - self._cooldown.get(key, 0) < window * 3:
                continue  # already handled this campaign very recently

            bucket = [e for e in self._window.get(key, []) if now - e[2] < window]
            bucket.append((message.author.id, message, now))
            self._window[key] = bucket

            distinct = len({e[0] for e in bucket})
            if distinct >= threshold:
                self._cooldown[key] = now
                self._window[key] = []           # reset so it doesn't re-trigger
                await self._handle_raid(message.guild, domain, bucket, raid)
                return

    async def _handle_raid(self, guild, domain, entries, raid_cfg):
        minutes = max(1, int(raid_cfg.get("timeout_minutes", 60) or 60))
        until = discord.utils.utcnow() + timedelta(minutes=minutes)

        # Unique members + their messages (snapshot taken before reset).
        members: dict[int, discord.Member] = {}
        messages = []
        for uid, msg, _ts in entries:
            messages.append(msg)
            if isinstance(msg.author, discord.Member):
                members[uid] = msg.author

        # Delete the raid messages (best-effort).
        deleted = 0
        for msg in messages:
            try:
                await msg.delete()
                deleted += 1
            except Exception:
                pass

        # Time out every involved account (best-effort).
        timed_out = 0
        perm_failed = None  # first member the timeout bounced off — for the admin alert
        for member in members.values():
            try:
                await member.timeout(until, reason=f"Raid defense: mass-posted {domain}")
                timed_out += 1
            except Exception:
                if perm_failed is None:
                    perm_failed = member

        # Record the campaign domain for threat-intel (link only, no authors).
        try:
            await record_blocked(guild.id, "scam", domain)
        except Exception:
            pass

        settings = await get_settings(str(guild.id))

        # Timeouts bounced off missing permissions → the admins must know.
        if perm_failed is not None:
            await notify_action_failure(self.bot, guild, settings,
                                        feature="Raid Protection", action="timeout",
                                        member=perm_failed)

        # One alarm embed → log channel if set, else the triggering channel.
        _log_cfg = settings.get("log", {})
        log_id = _log_cfg.get("log-channel", 0)
        if (_log_cfg.get("show") or {}).get("raid", True) is False:
            log_id = 0  # log filter: raid alarms muted — in-channel fallback stays
        target = self.bot.get_channel(int(log_id)) if log_id else None
        if target is None and messages:
            target = messages[-1].channel
        if target is not None:
            embed = discord.Embed(
                title="🚨 Raid blocked",
                description=(f"**{len(members)} accounts** mass-posted the same link in a few seconds — "
                            f"likely a raid or hijacked accounts.\n\n"
                            f"**Link:** `{domain[:120]}`"),
                color=discord.Color.red(),
            )
            embed.add_field(name="Messages removed", value=str(deleted), inline=True)
            embed.add_field(name="Accounts timed out", value=f"{timed_out} · {minutes}m", inline=True)
            try:
                await target.send(embed=embed)
            except Exception:
                pass

        # Best-effort push to the server's managers (needs BOT_API_SECRET in env).
        await self._push(guild.id,
                         title=f"🚨 Raid blocked in {guild.name}",
                         body=f"{len(members)} accounts mass-posted {domain} — timed out for {minutes}m.")

    async def _push(self, guild_id, title, body):
        if not _API_SECRET:
            return
        try:
            async with aiohttp.ClientSession() as s:
                await s.post(
                    f"{_INTERNAL_API}/api/internal/notify",
                    json={"guild_id": str(guild_id), "kind": "rule_triggered", "title": title, "body": body},
                    headers={"Authorization": f"Bearer {_API_SECRET}"},
                    timeout=aiohttp.ClientTimeout(total=5),
                )
        except Exception:
            pass


def setup(bot):
    bot.add_cog(RaidProtection(bot))
