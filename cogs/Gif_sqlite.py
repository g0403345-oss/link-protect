import re
import discord
from discord.ext import commands
from .shared import get_settings, apply_warn, is_whitelisted, resolve_channel

_RE = re.compile(
    r"(?:https?://)?(?:www\.)?(?:tenor\.com/view/|giphy\.com/gifs/|"
    r"media\.giphy\.com/media/|media\.tenor\.com/|klipy\.com/|"
    r"cdn\.discordapp\.com/attachments/)[^\s]*",
    re.IGNORECASE,
)


class GifProtection(commands.Cog):
    def __init__(self, bot):
        self.bot = bot

    @commands.Cog.listener()
    async def on_message(self, message):
        if message.author.bot or not message.guild:
            return

        content_lower = message.content.lower()
        if ("tenor" not in content_lower and "giphy" not in content_lower
                and "klipy" not in content_lower and "cdn.discordapp" not in content_lower):
            return

        if not _RE.search(message.content):
            return

        guild_id = str(message.guild.id)
        settings = await get_settings(guild_id)
        settings = resolve_channel(settings, message.channel)

        log_s = settings.get("log", {})
        if log_s.get("onlylink") and str(message.channel.id) == str(log_s.get("link", 0)):
            return

        if not settings.get("protect", {}).get("gif", False):
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

        await apply_warn(self.bot, message, settings, "Sending a GIF link")


def setup(bot):
    bot.add_cog(GifProtection(bot))
