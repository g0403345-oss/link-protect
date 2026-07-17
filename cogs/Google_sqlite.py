import re
import discord
from discord.ext import commands
from .shared import get_settings, apply_warn, is_whitelisted, resolve_channel

_RE = re.compile(
    # Delimiter lookahead so e.g. google.community (a non-Google TLD) can't match.
    r"(?:https?://)?(?:[\w-]+\.)?(?:google\.\w{2,6}(?:\.\w{2})?|goo\.gl)(?=[/\s?#]|$)(?:/[^\s]*)?",
    re.IGNORECASE,
)


class GoogleProtection(commands.Cog):
    def __init__(self, bot):
        self.bot = bot

    @commands.Cog.listener()
    async def on_message(self, message):
        if message.author.bot or not message.guild:
            return

        if "google" not in message.content.lower() and "goo.gl" not in message.content.lower():
            return

        if not _RE.search(message.content):
            return

        guild_id = str(message.guild.id)
        settings = await get_settings(guild_id)
        settings = resolve_channel(settings, message.channel)

        log_s = settings.get("log", {})
        if log_s.get("onlylink") and str(message.channel.id) == str(log_s.get("link", 0)):
            return

        if not settings.get("protect", {}).get("google", False):
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

        await apply_warn(self.bot, message, settings, "Sending a Google link")


def setup(bot):
    bot.add_cog(GoogleProtection(bot))
