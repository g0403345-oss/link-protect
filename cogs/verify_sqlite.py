"""Verification gate — the join-side half of the web verification flow.

When a server enables the gate in quarantine mode, every new member gets the
configured quarantine role the moment they join; verifying on the website
(link-protect.com/verify/<guild>) removes it again. In both modes the member
gets a DM with their personal verification link. The web/API side (role
removal, account-age check, page config) lives in api_server.py.
"""
import discord
from discord.ext import commands

from .shared import get_settings, render_message, message_accent


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
            try:
                import json as _json
                from .shared import _get_conn as _vc
                row = _vc().execute("SELECT value FROM kv WHERE path=?",
                                    (f"vslugof:{member.guild.id}",)).fetchone()
                slug = _json.loads(row[0]) if row else None
                if slug:
                    link = f"https://link-protect.com/verify/{slug}"
            except Exception:
                pass
            embed = discord.Embed(
                title=f"Verify to unlock {member.guild.name}",
                description=render_message(settings, "verify_dm", user=member.mention,
                                           username=member.name, server=member.guild.name,
                                           link=link),
                color=message_accent(settings),
            )
            _foot = ((settings.get("messages") or {}).get("footer_text") or "").strip()[:80]
            embed.set_footer(text=_foot or "Link Protect • link-protect.com")
            view = discord.ui.View(timeout=None)
            view.add_item(discord.ui.Button(label="Verify now", url=link))
            await member.send(embed=embed, view=view)
        except Exception:
            pass


def setup(bot):
    bot.add_cog(VerifyGate(bot))
