"""
Scam Shield — single-account scam-spam defense + cross-server intel.

Two layers, both configurable per server (dashboard → Scam Shield tab):

1. Spam blitz: ONE account posting the same content (link, image or wall of
   text — e.g. the "MrBeast crypto casino" scam) into ≥ `channels` different
   channels within `window` seconds. All copies are deleted and the configured
   action (delete / timeout / kick / ban) is applied. The account is flagged in
   the shared cross-server intel DB (user id + counts only, no content).

2. Join check: an account already flagged on ≥ `min_servers` other servers is
   kicked/banned the moment it joins — or, when the privileged members intent
   isn't available, the moment it posts its first message here.

Defaults to OFF — existing servers are unaffected until an admin enables it.
"""

import asyncio
import hashlib
import os
import time
from datetime import timedelta

import aiohttp
import discord
from discord.ext import commands, tasks

from .shared import (get_settings, is_whitelisted, resolve_channel, extract_urls,
                     record_blocked, flag_scammer_sync, get_flag_sync,
                     load_flagged_ids_sync, _log_action_sync, DBRef)

_API_SECRET = os.environ.get("BOT_API_SECRET")
_INTERNAL_API = os.environ.get("INTERNAL_API_URL", "http://127.0.0.1:3002")

_FLAGGED_REFRESH = 300        # reload the flagged-id set every 5 min
_CHECKED_CACHE_MAX = 100_000  # (guild, user) pairs already join-checked


def _fingerprint(message: discord.Message) -> str | None:
    """Stable hash of what makes two spam messages 'the same'. None = message
    can't be scam spam (short plain text without links or attachments)."""
    content = (message.content or "").strip().lower()
    att = "|".join(sorted(f"{a.filename}:{a.size}" for a in message.attachments))
    has_url = "http" in content or "www." in content or bool(extract_urls(content))
    if not att and not has_url and len(content) < 120:
        return None
    return hashlib.sha1(f"{content}\x00{att}".encode()).hexdigest()


class ScamShield(commands.Cog):
    def __init__(self, bot):
        self.bot = bot
        # {(guild_id, user_id): [(fingerprint, channel_id, message, monotonic_ts), …]}
        self._window: dict[tuple[int, int], list] = {}
        # {(guild_id, user_id): last_fired_monotonic} — debounce repeat triggers.
        self._cooldown: dict[tuple[int, int], float] = {}
        # Flagged user ids (cross-server intel), refreshed periodically so the
        # per-message check never touches the DB.
        self._flagged: set[str] = set()
        # (guild_id, user_id) pairs we already join-checked (first-message path).
        self._checked: set[tuple[int, int]] = set()

    async def cog_load(self):
        try:
            self._flagged = await asyncio.to_thread(load_flagged_ids_sync)
        except Exception:
            self._flagged = set()
        self._refresh.start()
        self._cleanup.start()

    async def cog_unload(self):
        self._refresh.cancel()
        self._cleanup.cancel()

    @tasks.loop(seconds=_FLAGGED_REFRESH)
    async def _refresh(self):
        try:
            self._flagged = await asyncio.to_thread(load_flagged_ids_sync)
        except Exception:
            pass

    @tasks.loop(minutes=5)
    async def _cleanup(self):
        now = time.monotonic()
        for key, entries in list(self._window.items()):
            fresh = [e for e in entries if now - e[3] < 300]
            if fresh:
                self._window[key] = fresh
            else:
                self._window.pop(key, None)
        for key, ts in list(self._cooldown.items()):
            if now - ts > 900:
                self._cooldown.pop(key, None)
        if len(self._checked) >= _CHECKED_CACHE_MAX:
            self._checked.clear()

    # ── layer 1: cross-channel spam blitz ────────────────────────────────────

    @commands.Cog.listener()
    async def on_message(self, message: discord.Message):
        if message.author.bot or not message.guild:
            return

        settings = await get_settings(str(message.guild.id))
        sg = settings.get("scamguard", {}) or {}

        # Join-check fallback: first message of a globally flagged account.
        if sg.get("join_check") and str(message.author.id) in self._flagged:
            key = (message.guild.id, message.author.id)
            if key not in self._checked:
                self._checked.add(key)
                if await self._act_on_flagged(message.guild, message.author, sg,
                                              via="first message"):
                    try:
                        await message.delete()
                    except Exception:
                        pass
                    return

        if not sg.get("enabled"):
            return
        eff = resolve_channel(settings, message.channel)
        if eff.get("_lp_channel_off"):
            return
        if is_whitelisted(message, settings):
            return

        fp = _fingerprint(message)
        if fp is None:
            return

        now = time.monotonic()
        channels_needed = max(2, int(sg.get("channels", 3) or 3))
        window = min(300, max(5, int(sg.get("window", 60) or 60)))

        key = (message.guild.id, message.author.id)
        if now - self._cooldown.get(key, 0) < window * 3:
            return  # this account was just handled

        bucket = [e for e in self._window.get(key, []) if now - e[3] < window]
        bucket.append((fp, message.channel.id, message, now))
        self._window[key] = bucket

        hits = [e for e in bucket if e[0] == fp]
        if len({e[1] for e in hits}) >= channels_needed:
            self._cooldown[key] = now
            self._window.pop(key, None)
            await self._handle_blitz(message.guild, message.author, hits, sg, settings)

    async def _handle_blitz(self, guild, member, hits, sg, settings):
        action = str(sg.get("action", "ban") or "ban").lower()
        if action not in ("delete", "timeout", "kick", "ban"):
            action = "ban"
        minutes = max(1, int(sg.get("timeout_minutes", 60) or 60))
        n_channels = len({e[1] for e in hits})
        sample = hits[-1][2]
        reason = f"Scam Shield: same message in {n_channels} channels within seconds"

        # Delete every copy first (works for all actions incl. delete-only).
        deleted = 0
        for _fp, _ch, msg, _ts in hits:
            try:
                await msg.delete()
                deleted += 1
            except Exception:
                pass

        # Apply the configured action (best-effort — hierarchy/permissions apply).
        acted = None
        try:
            if action == "ban":
                await guild.ban(member, reason=reason)
                acted = "banned"
            elif action == "kick":
                await guild.kick(member, reason=reason)
                acted = "kicked"
            elif action == "timeout":
                until = discord.utils.utcnow() + timedelta(minutes=minutes)
                await member.timeout(until, reason=reason)
                acted = "timeout"
        except Exception:
            acted = None

        # Warn entry + dashboard log — the "why" must always be visible.
        uid, uname = str(member.id), getattr(member, "name", str(member.id))
        try:
            warn_ref = DBRef(f"/servers/{guild.id}/warn/{uid}")
            warn_data = await asyncio.to_thread(warn_ref.get) or {"Warn": 0, "reason": []}
            warn_data["Warn"] = int(warn_data.get("Warn", 0) or 0) + 1
            warn_data.setdefault("reason", []).append(reason)
            warn_data.setdefault("ts", []).append(int(time.time()))
            await asyncio.to_thread(warn_ref.set, warn_data)
            warn_count = warn_data["Warn"]
        except Exception:
            warn_count = 0
        try:
            await asyncio.to_thread(
                _log_action_sync, int(guild.id), uid, uname,
                str(sample.channel.id), acted or "warned", reason, warn_count)
        except Exception:
            pass

        # Cross-server flag + threat-intel for any links in the spam.
        try:
            await asyncio.to_thread(flag_scammer_sync, uid, int(guild.id), "scam-spam")
            self._flagged.add(uid)
        except Exception:
            pass
        try:
            await record_blocked(guild.id, "scam", sample.content)
        except Exception:
            pass

        # One alarm embed → log channel if set, else the last spammed channel.
        log_id = settings.get("log", {}).get("log-channel", 0)
        target = self.bot.get_channel(int(log_id)) if log_id else None
        if target is None:
            target = sample.channel
        verb = {"banned": "🔨 banned", "kicked": "👢 kicked",
                "timeout": f"⏳ timed out for {minutes}m"}.get(acted)
        embed = discord.Embed(
            title="🛡️ Scam spam blocked",
            description=(f"{member.mention} posted the **same message in {n_channels} channels** "
                         f"within seconds — the classic scam-spam pattern (hijacked account / bot).\n\n"
                         f"This account is now flagged in the Link Protect network."),
            color=discord.Color.red(),
        )
        embed.add_field(name="Messages removed", value=str(deleted), inline=True)
        embed.add_field(name="Action", value=verb or ("⚠️ none — check my permissions/role position"
                                                      if action != "delete" else "🗑️ delete only"), inline=True)
        try:
            await target.send(embed=embed)
        except Exception:
            pass

        await self._push(guild.id, title=f"🛡️ Scam spam blocked in {guild.name}",
                         body=f"{uname} posted the same message in {n_channels} channels — {acted or 'messages deleted'}.")

    # ── layer 2: flagged account joins ───────────────────────────────────────

    @commands.Cog.listener()
    async def on_member_join(self, member: discord.Member):
        """Requires the privileged members intent; if it's unavailable this never
        fires and the first-message fallback in on_message covers it."""
        if member.bot:
            return
        if str(member.id) not in self._flagged:
            return
        settings = await get_settings(str(member.guild.id))
        sg = settings.get("scamguard", {}) or {}
        if not sg.get("join_check"):
            return
        self._checked.add((member.guild.id, member.id))
        await self._act_on_flagged(member.guild, member, sg, via="join")

    async def _act_on_flagged(self, guild, member, sg, via: str) -> bool:
        """Kick/ban `member` if their cross-server flag clears the configured
        bar. Returns True if an action was taken."""
        # Never action the owner, admins, or whitelisted members/roles.
        if member.id == guild.owner_id:
            return False
        try:
            if member.guild_permissions.administrator:
                return False
        except Exception:
            pass
        settings = await get_settings(str(guild.id))
        ch_cfg = settings.get("channel", {}) or {}
        wl_members = {str(x) for x in (ch_cfg.get("member") or [])}
        wl_roles = {str(x) for x in (ch_cfg.get("role") or [])}
        if str(member.id) in wl_members:
            return False
        try:
            if any(str(r.id) in wl_roles for r in member.roles):
                return False
        except Exception:
            pass

        flag = await asyncio.to_thread(get_flag_sync, str(member.id))
        if not flag:
            return False
        min_servers = max(1, int(sg.get("min_servers", 2) or 2))
        if int(flag.get("guilds", 0) or 0) < min_servers:
            return False

        action = "ban" if str(sg.get("join_action", "kick")).lower() == "ban" else "kick"
        reason = (f"Scam Shield: account was caught scam-spamming on "
                  f"{flag['guilds']} other servers (detected on {via})")
        try:
            if action == "ban":
                await guild.ban(member, reason=reason)
            else:
                await guild.kick(member, reason=reason)
        except Exception:
            return False

        uid, uname = str(member.id), getattr(member, "name", str(member.id))
        try:
            await asyncio.to_thread(
                _log_action_sync, int(guild.id), uid, uname, "0",
                "banned" if action == "ban" else "kicked", reason, 0)
        except Exception:
            pass

        log_id = settings.get("log", {}).get("log-channel", 0)
        target = self.bot.get_channel(int(log_id)) if log_id else None
        if target is not None:
            embed = discord.Embed(
                title="🛡️ Known scam account removed",
                description=(f"**{uname}** (`{uid}`) was **{'banned' if action == 'ban' else 'kicked'}** on {via}: "
                             f"Link Protect caught this account scam-spamming on "
                             f"**{flag['guilds']} other servers** ({flag['incidents']} incidents)."),
                color=discord.Color.red(),
            )
            try:
                await target.send(embed=embed)
            except Exception:
                pass

        await self._push(guild.id, title=f"🛡️ Known scam account removed in {guild.name}",
                         body=f"{uname} was {'banned' if action == 'ban' else 'kicked'} on {via} — "
                              f"flagged on {flag['guilds']} servers.")
        return True

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
    bot.add_cog(ScamShield(bot))
