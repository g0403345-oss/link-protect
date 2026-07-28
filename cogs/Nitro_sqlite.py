import re
import discord
from discord.ext import commands
from .shared import get_settings, apply_warn, is_whitelisted, resolve_channel, normalize_scan_text

# Nitro scam: fake domains + suspicious URL patterns — NOT plain text keywords.
# Scam tokens must appear in the HOST (before the first "/"), not anywhere in the
# path — otherwise a legit meme URL like tenor.com/view/...no-discord-nitro... would
# be mis-flagged. Real scams live on look-alike *domains* (discord-nitro.ru), so
# [^/\s]* keeps the match inside the hostname.
_RE = re.compile(
    r"(?:https?://|www\.)[^/\s]*(?:"
    r"discordgift|discordnitro|nitrogift|freegift|free-nitro|discord-nitro|"
    r"nitro-free|getnitro|claimnitro|nitroclaim|discordpremium|steampowered-gift"
    r")[^/\s]*"
    r"|(?:https?://|www\.)(?:[\w-]+\.){1,3}(?:xyz|top|site|tk|ml|ga|cf|gq|ru)/\S*(?:nitro|gift|free)\S*",
    re.IGNORECASE,
)


class NitroProtect(commands.Cog):
    def __init__(self, bot):
        self.bot = bot

    @commands.Cog.listener()
    async def on_message(self, message):
        if message.author.bot or not message.guild:
            return

        content = normalize_scan_text(message.content)
        if "http" not in content and "www." not in content:
            return

        if not _RE.search(content):
            return

        guild_id = str(message.guild.id)
        settings = await get_settings(guild_id)
        settings = resolve_channel(settings, message.channel)

        log_s = settings.get("log", {})
        if log_s.get("onlylink") and str(message.channel.id) == str(log_s.get("link", 0)):
            return

        if not settings.get("protect", {}).get("nitro", False):
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

        await apply_warn(self.bot, message, settings, "Sending a Nitro scam link")


def setup(bot):
    bot.add_cog(NitroProtect(bot))
