import asyncio
import discord
from discord.ext import commands

class CommandLogger(commands.Cog):
    def __init__(self, bot: commands.Bot):
        self.bot = bot
        self.log_channel_id = 1401556703492833312

    @commands.Cog.listener()
    async def on_application_command(self, ctx: discord.ApplicationContext):
        channel = self.bot.get_channel(self.log_channel_id)
        if channel is None:
            try:
                channel = await self.bot.fetch_channel(self.log_channel_id)
            except:
                return
        user = ctx.user
        guild = ctx.guild
        command = ctx.command
        name_tag = f"{user.name}#{user.discriminator}"
        cmd_name = ctx.command.name if ctx.command else "unknown"
        try:
            await channel.send(
                f"📝 Guild ID: `{guild.id}`**({guild.name})** | User ID: `{name_tag}` **({user.id})** | nutzte `/{cmd_name}`.")
        except:
            return

def setup(bot: commands.Bot):
    bot.add_cog(CommandLogger(bot))