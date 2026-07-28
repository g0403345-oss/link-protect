"""
Webhook guard (protect.webhook).

Every blocker cog skips bot authors — which means a COMPROMISED WEBHOOK
(leaked URL, hacked integration) can post phishing links completely unseen.
That's a standard attack: grab a webhook URL from a public repo or a hacked
service and blast @everyone + a scam link into the channel.

When enabled, messages posted via plain channel webhooks (not slash-command
responses — those carry an application id) are checked against the threat
database, homoglyph brand spoofing and the nitro-scam patterns. A hit deletes
the message AND the webhook itself (a webhook posting phishing is compromised
— removing the message alone leaves the attacker a live cannon), then alerts
the log channel.
"""

import asyncio
import time

import discord
from discord.ext import commands, tasks

from .shared import (get_settings, resolve_channel, extract_urls, record_blocked,
                     homoglyph_brand_match, known_bad_category, load_known_bad_sync,
                     is_safe_domain, link_allowlisted)
from .Nitro_sqlite import _RE as _NITRO_RE

_ALERT_COOLDOWN = 300  # one alert per webhook per 5 min — no alert storms


class WebhookGuard(commands.Cog):
    def __init__(self, bot):
        self.bot = bot
        self._known_bad: dict = {}
        self._alerted: dict[int, float] = {}
        self._started = False

    async def _ensure_started(self):
        if self._started:
            return
        self._started = True
        try:
            self._known_bad = await asyncio.to_thread(load_known_bad_sync)
        except Exception:
            self._known_bad = {}
        self._refresh.start()

    @commands.Cog.listener()
    async def on_ready(self):
        await self._ensure_started()

    @tasks.loop(minutes=30)
    async def _refresh(self):
        try:
            kb = await asyncio.to_thread(load_known_bad_sync)
            if kb:
                self._known_bad = kb
        except Exception:
            pass

    @commands.Cog.listener()
    async def on_message(self, message: discord.Message):
        # Plain channel webhooks only. Interaction responses / bot followups
        # stay untouched. getattr: py-cord 2.5 has no Message.application_id,
        # so we fall back to the interaction marker.
        if not message.guild or not message.webhook_id:
            return
        if getattr(message, "application_id", None) or getattr(message, "interaction", None):
            return
        content = message.content or ""
        if "http" not in content and "www." not in content and "." not in content:
            return
        await self._ensure_started()

        settings = await get_settings(str(message.guild.id))
        settings = resolve_channel(settings, message.channel)
        if not settings.get("protect", {}).get("webhook", False):
            return

        category = None
        if _NITRO_RE.search(content):
            category = "nitro"
        if category is None:
            for url, domain in extract_urls(content):
                if link_allowlisted(url, settings) or is_safe_domain(domain):
                    continue
                category = known_bad_category(domain, self._known_bad) \
                    or homoglyph_brand_match(domain)
                if category:
                    break
        if category is None:
            return

        try:
            await message.delete()
        except Exception:
            return  # can't delete → nothing else is safe to claim

        await record_blocked(str(message.guild.id), category if category != "nitro" else "nitro", content)

        # Kill the webhook — it's compromised, not just noisy.
        webhook_deleted = False
        try:
            wh = await self.bot.fetch_webhook(message.webhook_id)
            await wh.delete(reason="Link Protect: webhook posted a scam/phishing link")
            webhook_deleted = True
        except Exception:
            pass

        now = time.monotonic()
        if now - self._alerted.get(message.webhook_id, 0) < _ALERT_COOLDOWN:
            return
        self._alerted[message.webhook_id] = now
        if len(self._alerted) > 10_000:
            self._alerted.clear()

        log_id = settings.get("log", {}).get("log-channel", 0)
        target = self.bot.get_channel(int(log_id)) if log_id else None
        target = target or message.channel
        embed = discord.Embed(
            title="🪝 Compromised webhook blocked",
            description=(f"A webhook in {message.channel.mention} posted a **{category}** link. "
                         f"The message was removed"
                         + (" and the **webhook was deleted**." if webhook_deleted else
                            ", but I **couldn't delete the webhook** — please give me "
                            "**Manage Webhooks** and remove it manually (Server Settings → Integrations).")),
            color=discord.Color.red(),
        )
        try:
            await target.send(embed=embed)
        except Exception:
            pass


def setup(bot):
    bot.add_cog(WebhookGuard(bot))
