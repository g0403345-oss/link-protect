import re
import discord
from discord.ext import commands
from .shared import get_settings, apply_warn, is_whitelisted, resolve_channel, normalize_scan_text

_RE = re.compile(
    # tenor.com/view/… also comes localized (tenor.com/de/view/…, /en-GB/view/…).
    r"(?:https?://)?(?:www\.)?(?:tenor\.com/(?:[a-z]{2}(?:-[A-Z]{2})?/)?view/|giphy\.com/gifs/|"
    r"media\.giphy\.com/media/|media\.tenor\.com/|(?:[\w-]+\.)?klipy\.com/|"
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

        content = normalize_scan_text(message.content)
        content_lower = content.lower()
        if ("tenor" not in content_lower and "giphy" not in content_lower
                and "klipy" not in content_lower and "cdn.discordapp" not in content_lower):
            return

        if not _RE.search(content):
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
