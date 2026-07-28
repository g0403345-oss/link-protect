import re
import discord
from discord.ext import commands
from .shared import get_settings, apply_warn, is_whitelisted, resolve_channel, normalize_scan_text

# Matches real Steam URLs + common Steam-phishing domains (leet variants)
_RE = re.compile(
    r"(?:https?://)?(?:[\w-]+\.)*"
    r"(?:steampowered\.com|steamcommunity\.com|store\.steampowered\.com"
    r"|s[t5]eam(?:pow[e3]r[e3]d|communit[yi]|gif[t5]|gift|giveaway|trade)\."
    r"(?:com|net|org|ru|xyz|top|store|gift|info))"
    r"(?:/[^\s]*)?",
    re.IGNORECASE,
)


class SteamProtection(commands.Cog):
    def __init__(self, bot):
        self.bot = bot

    @commands.Cog.listener()
    async def on_message(self, message):
        if message.author.bot or not message.guild:
            return

        content = normalize_scan_text(message.content)
        content_lower = content.lower()
        if "steam" not in content_lower:
            return

        if not _RE.search(content):
            return

        guild_id = str(message.guild.id)
        settings = await get_settings(guild_id)
        settings = resolve_channel(settings, message.channel)

        log_s = settings.get("log", {})
        if log_s.get("onlylink") and str(message.channel.id) == str(log_s.get("link", 0)):
            return

        if not settings.get("protect", {}).get("steam", False):
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

        await apply_warn(self.bot, message, settings, "Sending a Steam link")


def setup(bot):
    bot.add_cog(SteamProtection(bot))
