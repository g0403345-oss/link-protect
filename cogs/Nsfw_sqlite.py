import re
import discord
from discord.ext import commands
from .shared import get_settings, apply_warn, is_whitelisted, resolve_channel

# Only triggers on NSFW domains inside actual URLs — not on random words in chat
_RE = re.compile(
    r"(?:https?://|www\.)\S*"
    r"(?:porn|porno|hentai|xnxx|xvideos|redtube|onlyfans|rule34|erome|tnaflix|youjizz|"
    r"spankbang|brazzers|xhamster|chaturbate|pornhub|teenporn|naughtyamerica|realitykings|"
    r"mofos|18plus|livejasmin|stripchat|camgirl|camsex|camwhore|faphouse|"
    r"motherless|xnxx|porntrex|bravotube|drtuber|youporn)\S*",
    re.IGNORECASE,
)


class NsfwProtection(commands.Cog):
    def __init__(self, bot):
        self.bot = bot

    @commands.Cog.listener()
    async def on_message(self, message):
        if message.author.bot or not message.guild:
            return

        if "http" not in message.content and "www." not in message.content:
            return

        if not _RE.search(message.content):
            return

        guild_id = str(message.guild.id)
        settings = await get_settings(guild_id)
        settings = resolve_channel(settings, message.channel)

        log_s = settings.get("log", {})
        if log_s.get("onlylink") and str(message.channel.id) == str(log_s.get("link", 0)):
            return

        if not settings.get("protect", {}).get("nsfw", False):
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

        await apply_warn(self.bot, message, settings, "Sending an NSFW link")


def setup(bot):
    bot.add_cog(NsfwProtection(bot))
