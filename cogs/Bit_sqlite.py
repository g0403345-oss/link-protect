import re
import discord
from discord.ext import commands
from .shared import get_settings, apply_warn, is_whitelisted, resolve_channel, normalize_scan_text

# The dashboard sells this blocker as "bit.ly & shorteners" — cover the common
# URL shorteners, not just bit.ly.
_SHORTENERS = ("bit.ly", "tinyurl.com", "is.gd", "v.gd", "t.co", "cutt.ly",
               "rb.gy", "tiny.cc", "shorturl.at", "ow.ly", "buff.ly",
               "rebrand.ly", "t.ly", "kutt.it", "s.id", "shorte.st", "adf.ly")
_RE = re.compile(
    r"(?:https?://)?(?:www\.)?(?:" +
    "|".join(re.escape(d) for d in _SHORTENERS) +
    r")/[\w.-]+",
    re.IGNORECASE,
)


class BitlyProtection(commands.Cog):
    def __init__(self, bot):
        self.bot = bot

    @commands.Cog.listener()
    async def on_message(self, message):
        if message.author.bot or not message.guild:
            return

        content = normalize_scan_text(message.content)
        content_lower = content.lower()
        if not any(d in content_lower for d in _SHORTENERS):
            return

        if not _RE.search(content):
            return

        guild_id = str(message.guild.id)
        settings = await get_settings(guild_id)
        settings = resolve_channel(settings, message.channel)

        log_s = settings.get("log", {})
        if log_s.get("onlylink") and str(message.channel.id) == str(log_s.get("link", 0)):
            return

        if not settings.get("protect", {}).get("bit", False):
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

        await apply_warn(self.bot, message, settings, "Sending a URL-shortener link")


def setup(bot):
    bot.add_cog(BitlyProtection(bot))
