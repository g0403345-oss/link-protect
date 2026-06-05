import re
import discord
from discord.ext import commands
from .shared import get_settings, get_safe_list, apply_warn

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

        content_lower = message.content.lower()
        if "steam" not in content_lower:
            return

        if not _RE.search(message.content):
            return

        guild_id = str(message.guild.id)
        settings = await get_settings(guild_id)

        log_s = settings.get("log", {})
        if log_s.get("onlylink") and str(message.channel.id) == str(log_s.get("link", 0)):
            return

        if not settings.get("protect", {}).get("steam", False):
            return

        user_id = str(message.author.id)
        channel_id = str(message.channel.id)
        role_ids = [str(r.id) for r in message.author.roles] if isinstance(message.author, discord.Member) else []

        ch_wl = get_safe_list(settings.get("channel", {}).get("channel"))
        mb_wl = get_safe_list(settings.get("channel", {}).get("member"))
        ro_wl = get_safe_list(settings.get("channel", {}).get("role"))
        if channel_id in ch_wl or user_id in mb_wl or any(r in ro_wl for r in role_ids):
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
