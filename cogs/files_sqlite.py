"""
Dangerous-file blocker (protect.files).

Links are only half the malware problem — the other half is attachments:
"free cheat.exe", invoice.pdf.scr, macro-armed Office docs. When enabled,
messages carrying an attachment with an executable / installer / script /
macro extension are removed and the author is warned through the normal
escalation engine. Extension matching happens on the FULL filename, so
double-extension tricks (photo.jpg.exe) are caught too.
"""

import discord
from discord.ext import commands

from .shared import get_settings, apply_warn, is_whitelisted, resolve_channel

# Windows executables/scripts, installers, shortcuts, disk images that
# auto-mount, mobile installers, and macro-enabled Office documents.
DANGEROUS_EXTS = (
    ".exe", ".scr", ".com", ".pif", ".bat", ".cmd", ".msi", ".msix",
    ".msixbundle", ".jar", ".js", ".jse", ".vbs", ".vbe", ".wsf", ".wsh",
    ".ps1", ".psm1", ".hta", ".cpl", ".lnk", ".iso", ".img", ".vhd", ".vhdx",
    ".reg", ".dll", ".apk", ".application", ".appref-ms", ".gadget", ".sct",
    ".chm", ".scf", ".docm", ".xlsm", ".pptm",
)


def dangerous_attachment(message: discord.Message) -> str | None:
    """The first dangerous filename in the message, or None."""
    for a in message.attachments:
        name = (a.filename or "").lower().strip()
        if name.endswith(DANGEROUS_EXTS):
            return a.filename
    return None


class FileProtect(commands.Cog):
    def __init__(self, bot):
        self.bot = bot

    @commands.Cog.listener()
    async def on_message(self, message: discord.Message):
        if message.author.bot or not message.guild or not message.attachments:
            return

        bad = dangerous_attachment(message)
        if bad is None:
            return

        guild_id = str(message.guild.id)
        settings = await get_settings(guild_id)
        settings = resolve_channel(settings, message.channel)

        if not settings.get("protect", {}).get("files", False):
            return
        if is_whitelisted(message, settings):
            return

        try:
            await message.delete()
        except discord.Forbidden:
            try:
                await message.channel.send(embed=discord.Embed(
                    title="⛔ Missing Permission",
                    description="I spotted a dangerous file but can't delete it. Please give me **Manage Messages**.",
                    color=discord.Color.red()))
            except Exception:
                pass
            return
        except Exception:
            return

        ext = "." + bad.rsplit(".", 1)[-1].lower() if "." in bad else bad
        await apply_warn(self.bot, message, settings,
                         f"Sending a dangerous file attachment ({ext})")


def setup(bot):
    bot.add_cog(FileProtect(bot))
