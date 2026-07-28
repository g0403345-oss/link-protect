import re
import discord
from discord.ext import commands
from .shared import get_settings, apply_warn, is_whitelisted, resolve_channel, normalize_scan_text

_RE = re.compile(
    # Videos (watch/embed/v/shorts/live + youtu.be) …
    r"(?:https?://)?(?:[\w-]+\.)?(?:youtube\.com/(?:watch\?v=|embed/|v/|shorts/|live/)|youtu\.be/)[\w-]{11}"
    # … plus channels, handles and playlists — "block YouTube" should mean all of it.
    r"|(?:https?://)?(?:[\w-]+\.)?youtube\.com/(?:@[\w.-]{3,}|channel/[\w-]+|c/[\w-]+|user/[\w-]+|playlist\?list=[\w-]+)",
    re.IGNORECASE,
)


class YouTubeProtection(commands.Cog):
    def __init__(self, bot):
        self.bot = bot

    @commands.Cog.listener()
    async def on_message(self, message):
        if message.author.bot or not message.guild:
            return

        content = normalize_scan_text(message.content)
        content_lower = content.lower()
        if "youtube" not in content_lower and "youtu.be" not in content_lower:
            return

        if not _RE.search(content):
            return

        guild_id = str(message.guild.id)
        settings = await get_settings(guild_id)
        settings = resolve_channel(settings, message.channel)

        log_s = settings.get("log", {})
        if log_s.get("onlylink") and str(message.channel.id) == str(log_s.get("link", 0)):
            return

        if not settings.get("protect", {}).get("youtube", False):
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

        await apply_warn(self.bot, message, settings, "Sending a YouTube link")


def setup(bot):
    bot.add_cog(YouTubeProtection(bot))
