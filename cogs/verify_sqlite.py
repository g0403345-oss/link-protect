"""Verification gate — the join-side half of the web verification flow.

When a server enables the gate in quarantine mode, every new member gets the
configured quarantine role the moment they join; verifying on the website
(link-protect.com/verify/<guild>) removes it again. In both modes the member
gets a DM with their personal verification link. The web/API side (role
removal, account-age check, page config) lives in api_server.py.
"""
import discord
from discord.ext import commands

from .shared import get_settings, render_message


class VerifyGate(commands.Cog):
    def __init__(self, bot):
        self.bot = bot

    @commands.Cog.listener()
    async def on_member_join(self, member: discord.Member):
        if member.bot:
            return
        settings = await get_settings(str(member.guild.id))
        v = settings.get("verify") or {}
        if not v.get("enabled"):
            return

        # Quarantine mode: lock the newcomer down until they verify.
        if v.get("role_mode") == "quarantine" and v.get("role_id"):
            try:
                await member.add_roles(
                    discord.Object(id=int(v["role_id"])),
                    reason="Link Protect verification gate",
                )
            except Exception:
                pass  # missing perms/role — the dashboard health check surfaces this

        # Both modes: send the personal verify link (best-effort, DMs may be off).
        # Text is admin-customizable (Message Studio: messages.verify_dm).
        try:
            link = f"https://link-protect.com/verify/{member.guild.id}"
            embed = discord.Embed(
                title=f"Verify to unlock {member.guild.name}",
                description=render_message(settings, "verify_dm", user=member.mention,
                                           username=member.name, server=member.guild.name,
                                           link=link),
                color=0x5B6CFF,
            )
            embed.set_footer(text="Link Protect • link-protect.com")
            view = discord.ui.View(timeout=None)
            view.add_item(discord.ui.Button(label="Verify now", url=link))
            await member.send(embed=embed, view=view)
        except Exception:
            pass


def setup(bot):
    bot.add_cog(VerifyGate(bot))
