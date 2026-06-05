import re
import asyncio
import discord
from discord.ext import commands
from .shared import get_settings

# URL detection for "only-link" channels — broad but URL-anchored
_RE = re.compile(
    r"(?:https?://|ftp://|www\.)\S+"
    r"|(?<![.\w])[\w-]{2,}\.(?:com|net|org|io|de|co|uk|ru|info|xyz|app|gg|tv|me|ly|be|fr|nl|ca|eu|cc|biz|us|dev|store|shop|online)(?:[/?\s#]|$)",
    re.IGNORECASE,
)


class LinkProtection(commands.Cog):
    def __init__(self, bot):
        self.bot = bot

    @commands.Cog.listener()
    async def on_message(self, message):
        if message.author.bot or not message.guild:
            return

        guild_id = str(message.guild.id)
        settings = await get_settings(guild_id)

        log_s = settings.get("log", {})
        only_link_channel = log_s.get("link", 0)
        if not only_link_channel or str(message.channel.id) != str(only_link_channel):
            return

        if _RE.search(message.content):
            return

        # Message has no link — delete it
        try:
            await message.delete()
        except Exception:
            return

        embed = discord.Embed(
            title="Only Links Allowed",
            description=f"{message.author.mention} — only links are allowed in this channel.",
            color=discord.Color.dark_red(),
        )
        warn_msg = await message.channel.send(embed=embed)
        await asyncio.sleep(4)
        try:
            await warn_msg.delete()
        except Exception:
            pass


def setup(bot):
    bot.add_cog(LinkProtection(bot))
