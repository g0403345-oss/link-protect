"""
Mention-spam protection (protect.mentions).

Mass-mention raids ping dozens of members to drag eyes onto a scam (or purely
to harass). When enabled, a message mentioning ≥ `mentions.threshold` distinct
users/roles (default 8) is removed and the author is warned through the normal
escalation engine. Deliberately threshold-only: @everyone that actually pings
requires the permission (= trusted member), and scam links in announcements
are already caught by the link blockers — so this cog can't hit a legitimate
mod announcement.
"""

import discord
from discord.ext import commands

from .shared import get_settings, apply_warn, is_whitelisted, resolve_channel

DEFAULT_THRESHOLD = 8


class MentionProtect(commands.Cog):
    def __init__(self, bot):
        self.bot = bot

    @commands.Cog.listener()
    async def on_message(self, message: discord.Message):
        if message.author.bot or not message.guild:
            return
        n_mentions = len(set(m.id for m in message.mentions)) + len(set(r.id for r in message.role_mentions))
        if n_mentions < 2:
            return  # fast path — no configurable threshold goes below 2

        guild_id = str(message.guild.id)
        settings = await get_settings(guild_id)
        settings = resolve_channel(settings, message.channel)
        if not settings.get("protect", {}).get("mentions", False):
            return

        try:
            threshold = max(2, int((settings.get("mentions") or {}).get("threshold", DEFAULT_THRESHOLD)
                                   or DEFAULT_THRESHOLD))
        except Exception:
            threshold = DEFAULT_THRESHOLD
        if n_mentions < threshold:
            return
        if is_whitelisted(message, settings):
            return

        try:
            await message.delete()
        except discord.Forbidden:
            try:
                await message.channel.send(embed=discord.Embed(
                    title="⛔ Missing Permission",
                    description="I cannot delete messages. Please give me **Manage Messages** permission.",
                    color=discord.Color.red()))
            except Exception:
                pass
            return
        except Exception:
            return

        await apply_warn(self.bot, message, settings,
                         f"Mass mentioning ({n_mentions} members/roles in one message)")


def setup(bot):
    bot.add_cog(MentionProtect(bot))
