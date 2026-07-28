import re
import discord
from discord.ext import commands
from .shared import get_settings, apply_warn, is_whitelisted, resolve_channel, normalize_scan_text

# Pre-compiled: require http/https/ftp or www. (no bare-domain false positives)
_RE = re.compile(
    r'(?:https?://|ftp://|www\.)\S+',
    re.IGNORECASE,
)


class All(commands.Cog):
    def __init__(self, bot):
        self.bot = bot

    @commands.Cog.listener()
    async def on_message(self, message):
        if message.author.bot or not message.guild:
            return

        # Fast pre-check — skip regex + DB if there's clearly no URL
        content = normalize_scan_text(message.content)
        if "http" not in content and "www." not in content and "ftp://" not in content:
            return

        if not _RE.search(content):
            return

        guild_id = str(message.guild.id)
        settings = await get_settings(guild_id)
        settings = resolve_channel(settings, message.channel)

        # Skip if this is the "only-link" channel (handled by Link_sqlite cog)
        log_s = settings.get("log", {})
        if log_s.get("onlylink") and str(message.channel.id) == str(log_s.get("link", 0)):
            return

        if not settings.get("protect", {}).get("all", False):
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

        await apply_warn(self.bot, message, settings, "Sending a link")


def setup(bot):
    bot.add_cog(All(bot))
