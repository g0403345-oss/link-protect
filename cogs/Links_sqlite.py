import asyncio
import discord
from discord.ext import commands
from .shared import (get_settings, apply_warn, is_whitelisted, db, resolve_channel,
                     link_allowlisted, extract_urls, normalize_scan_text)


class BlacklistLinkProtection(commands.Cog):
    def __init__(self, bot):
        self.bot = bot

    @commands.Cog.listener()
    async def on_message(self, message):
        if message.author.bot or not message.guild:
            return

        guild_id = str(message.guild.id)
        settings = await get_settings(guild_id)
        settings = resolve_channel(settings, message.channel)

        log_s = settings.get("log", {})
        if log_s.get("onlylink") and str(message.channel.id) == str(log_s.get("link", 0)):
            return

        blacklist = settings.get("link", {}).get("links") or []
        if not blacklist:
            return

        if not any(bl in normalize_scan_text(message.content) for bl in blacklist if bl):
            return

        if is_whitelisted(message, settings):
            return

        # A trusted (allowlisted) domain overrides the custom blacklist: if every
        # URL in the message is on the server's allowlist, let it through.
        urls = [u for u, _ in extract_urls(message.content)]
        if urls and all(link_allowlisted(u, settings) for u in urls):
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

        await apply_warn(self.bot, message, settings, "Sending a blacklisted link")


def setup(bot):
    bot.add_cog(BlacklistLinkProtection(bot))
