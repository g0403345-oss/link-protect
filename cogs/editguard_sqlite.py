"""
Edit bypass defense.

Every blocker only listens to on_message, so "post a harmless message, then
edit the scam link in" used to sail straight past all 14 detections. This cog
re-dispatches edited messages through the normal on_message pipeline, so an
edited-in link is treated exactly like a freshly posted one (same blockers,
same whitelists, same warnings).

Always on — it adds no policy of its own; the blocker cogs still decide
whether anything is actually blocked.
"""

import discord
from discord.ext import commands

# message_id → hash of the last content we scanned. Discord also fires edit
# events when it merely unfurls an embed — those must not re-trigger a scan.
_SCANNED_MAX = 50_000


class EditGuard(commands.Cog):
    def __init__(self, bot):
        self.bot = bot
        self._scanned: dict[int, int] = {}

    def _content_changed(self, message_id: int, content: str) -> bool:
        h = hash(content)
        if self._scanned.get(message_id) == h:
            return False
        if len(self._scanned) >= _SCANNED_MAX:
            self._scanned.clear()
        self._scanned[message_id] = h
        return True

    @commands.Cog.listener()
    async def on_message(self, message: discord.Message):
        # Remember what the pipeline already saw, so an unfurl-only edit
        # doesn't cause a second (pointless) scan.
        if message.guild and not message.author.bot:
            self._content_changed(message.id, message.content or "")

    @commands.Cog.listener()
    async def on_message_edit(self, before: discord.Message, after: discord.Message):
        if not after.guild or after.author.bot:
            return
        if (before.content or "") == (after.content or ""):
            return
        if not self._content_changed(after.id, after.content or ""):
            return
        self.bot.dispatch("message", after)

    @commands.Cog.listener()
    async def on_raw_message_edit(self, payload: discord.RawMessageUpdateEvent):
        # Uncached messages never reach on_message_edit — exactly the sneaky
        # case (edit an hours-old message). The gateway payload tells us whether
        # the content actually changed; embed-only updates carry no "content".
        if payload.cached_message is not None:
            return  # handled by on_message_edit above
        data = payload.data or {}
        content = data.get("content")
        if not content:
            return
        author = data.get("author") or {}
        if author.get("bot") or not data.get("guild_id"):
            return
        if not self._content_changed(payload.message_id, content):
            return
        channel = self.bot.get_channel(payload.channel_id)
        if channel is None:
            return
        try:
            message = await channel.fetch_message(payload.message_id)
        except Exception:
            return
        if message.author.bot or not message.guild:
            return
        self.bot.dispatch("message", message)


def setup(bot):
    bot.add_cog(EditGuard(bot))
