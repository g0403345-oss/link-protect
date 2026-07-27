"""
Premium personalization: welcome & leave messages (Message Studio).

Templates live in settings.messages.welcome / .leave, the target channel in
settings.messages.welcome_channel. Empty template = feature off. Only premium
servers can SET these via the dashboard (PATCH-gated), so the cog just renders.
"""

import asyncio
import json
import time

import discord
from discord.ext import commands

from .shared import get_settings, render_message, message_accent, _get_conn


def _premium_sync(gid: int) -> bool:
    try:
        row = _get_conn().execute("SELECT value FROM kv WHERE path=?", (f"premium:{gid}",)).fetchone()
        d = json.loads(row[0]) if row else {}
        return bool(d.get("active")) and (not d.get("until") or int(d["until"]) > time.time() - 86400)
    except Exception:
        return False


class WelcomeMessages(commands.Cog):
    def __init__(self, bot):
        self.bot = bot

    async def _send(self, member: discord.Member, key: str):
        settings = await get_settings(str(member.guild.id))
        msgs = settings.get("messages") or {}
        tpl = (msgs.get(key) or "").strip()
        ch_id = int(msgs.get("welcome_channel") or 0)
        if not tpl or not ch_id:
            return
        if not await asyncio.to_thread(_premium_sync, member.guild.id):
            return
        ch = member.guild.get_channel(ch_id)
        if ch is None:
            return
        try:
            e = discord.Embed(
                description=render_message(settings, key, user=member.mention,
                                           username=member.name, server=member.guild.name),
                color=message_accent(settings),
            )
            e.set_footer(text=(msgs.get("footer_text") or "").strip()[:80]
                         or "Link Protect • link-protect.com")
            try:
                e.set_thumbnail(url=member.display_avatar.url)
            except Exception:
                pass
            await ch.send(embed=e)
        except Exception:
            pass

    @commands.Cog.listener()
    async def on_member_join(self, member: discord.Member):
        if not member.bot:
            await self._send(member, "welcome")

    @commands.Cog.listener()
    async def on_member_remove(self, member: discord.Member):
        if not member.bot:
            await self._send(member, "leave")


def setup(bot):
    bot.add_cog(WelcomeMessages(bot))
