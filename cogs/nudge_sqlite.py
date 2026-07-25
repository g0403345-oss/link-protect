"""
Activation nudge — the "I would have blocked that" moment.

85% of installed servers never enable a single blocker, so the bot sits idle.
This cog watches those inactive servers passively: when a KNOWN bad link from
the threat database shows up, it posts ONE message (once per guild, ever):
"that was a known scam link — I'd have blocked it, enable me with one click."

No deletion, no warning — the server hasn't opted into moderation. Just the
single most convincing pitch there is: a real threat, caught live.
"""

import asyncio
import time

import discord
from discord.ext import commands

from .shared import (get_settings, extract_urls, load_known_bad_sync,
                     known_bad_category, DBRef)

_KB_TTL = 600  # refresh the known-bad set every 10 min


class ActivationNudge(commands.Cog):
    def __init__(self, bot):
        self.bot = bot
        self._known_bad: dict = {}
        self._kb_loaded = 0.0
        self._nudged: set[int] = set()  # guilds handled this process lifetime

    async def _known(self) -> dict:
        if time.monotonic() - self._kb_loaded > _KB_TTL:
            self._kb_loaded = time.monotonic()
            try:
                self._known_bad = await asyncio.to_thread(load_known_bad_sync)
            except Exception:
                pass
        return self._known_bad

    @commands.Cog.listener()
    async def on_message(self, message: discord.Message):
        if message.author.bot or not message.guild:
            return
        gid = message.guild.id
        if gid in self._nudged:
            return
        content = message.content or ""
        if "http" not in content and "www." not in content and "." not in content:
            return

        settings = await get_settings(str(gid))
        protect = settings.get("protect") or {}
        if any(bool(v) for v in protect.values()):
            return  # server is active — the blockers handle it

        urls = extract_urls(content)
        if not urls:
            return
        kb = await self._known()
        if not kb:
            return
        category = None
        for _url, domain in urls[:5]:
            category = known_bad_category(domain, kb)
            if category:
                break
        if not category:
            return

        # once per guild, EVER — persisted so restarts don't re-nudge
        self._nudged.add(gid)
        try:
            ref = DBRef(f"nudge:{gid}")
            if await asyncio.to_thread(ref.get):
                return
            await asyncio.to_thread(ref.set, int(time.time()))
        except Exception:
            return

        embed = discord.Embed(
            title="⚠️ That was a known scam link",
            description=(
                f"The link just posted here is flagged as **{category}** in the Link Protect "
                f"threat database — caught on real Discord servers.\n\n"
                "I'm on this server, but **my protection is switched off**, so I couldn't "
                "remove it. One click fixes that:"
            ),
            color=0xF0B232,
        )
        embed.set_footer(text="Shown once — Link Protect stays silent until you enable it.")
        view = discord.ui.View(timeout=None)
        view.add_item(discord.ui.Button(label="🛡️ Enable Balanced protection",
                                        style=discord.ButtonStyle.primary,
                                        custom_id=f"lpn:balanced:{gid}"))
        view.add_item(discord.ui.Button(label="Open dashboard", style=discord.ButtonStyle.link,
                                        url=f"https://link-protect.com/dashboard/{gid}"))
        try:
            await message.channel.send(embed=embed, view=view)
        except Exception:
            pass  # no send permission here — maybe next time in another channel


def setup(bot):
    bot.add_cog(ActivationNudge(bot))
