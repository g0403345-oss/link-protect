import re
import discord
from discord.ext import commands
from .shared import get_settings, get_safe_list, apply_warn

_RE = re.compile(
    r"(?:https?://)?(?:www\.)?(?:go\.)?twitch\.tv/"
    r"(?!directory|downloads|p/|settings|wallet|turbo|jobs|friends|search|user|logout|signup|login)"
    r"[a-zA-Z0-9_]+",
    re.IGNORECASE,
)


class TwitchProtection(commands.Cog):
    def __init__(self, bot):
        self.bot = bot

    @commands.Cog.listener()
    async def on_message(self, message):
        if message.author.bot or not message.guild:
            return

        if "twitch.tv" not in message.content.lower():
            return

        if not _RE.search(message.content):
            return

        guild_id = str(message.guild.id)
        settings = await get_settings(guild_id)

        log_s = settings.get("log", {})
        if log_s.get("onlylink") and str(message.channel.id) == str(log_s.get("link", 0)):
            return

        if not settings.get("protect", {}).get("twitch", False):
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

        await apply_warn(self.bot, message, settings, "Sending a Twitch link")


def setup(bot):
    bot.add_cog(TwitchProtection(bot))
