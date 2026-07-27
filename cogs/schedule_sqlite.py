"""
Premium automation: night schedule + event mode (set via the web dashboard).

- kv schedule:<gid> = {"night": {enabled, fromHour, toHour, preset}, "applied": {...}}
  While the Berlin-time window is active, the chosen preset's protection flags
  are applied; the previous state is snapshotted and restored afterwards.
- kv event:<gid> = {"until": ts, "prev_all": bool}
  The dashboard sets protect.all immediately; this loop restores it when the
  timer runs out (or the entry is cleared early via the dashboard).
"""

import asyncio
import json
import time
from zoneinfo import ZoneInfo

import discord
from discord.ext import commands, tasks

from .shared import _get_conn, DBRef, get_settings, invalidate, _premium_active_sync

_TZ = ZoneInfo("Europe/Berlin")

_NIGHT_PRESETS = {
    "balanced": {"protect": {"malware": True, "nitro": True, "bit": True, "nsfw": True},
                 "raid": True, "scam": True},
    "strict": {"protect": {"malware": True, "nitro": True, "bit": True, "nsfw": True, "invite": True},
               "raid": True, "scam": True},
}


def _kv_rows(prefix: str) -> list[tuple[str, dict]]:
    out = []
    for r in _get_conn().execute("SELECT path, value FROM kv WHERE path LIKE ?", (prefix + "%",)).fetchall():
        try:
            v = json.loads(r[1])
        except Exception:
            continue
        if isinstance(v, dict) and v:
            out.append((r[0].split(":", 1)[1], v))
    return out


class PremiumAutomation(commands.Cog):
    def __init__(self, bot):
        self.bot = bot
        self._started = False

    @commands.Cog.listener()
    async def on_ready(self):
        if not self._started:
            self._started = True
            self._tick.start()

    async def _log(self, gid: str, title: str, body: str, color: int = 0x5B6CFF):
        try:
            settings = await get_settings(gid)
            ch_id = int((settings.get("log") or {}).get("log-channel") or 0)
            ch = self.bot.get_channel(ch_id) if ch_id else None
            if ch:
                e = discord.Embed(title=title, description=body, color=color)
                e.set_footer(text="Link Protect • Premium automation")
                await ch.send(embed=e)
        except Exception:
            pass

    @tasks.loop(seconds=60)
    async def _tick(self):
        now = int(time.time())

        # ── event mode: restore when the timer runs out ──
        for gid, ev in await asyncio.to_thread(_kv_rows, "event:"):
            try:
                if int(ev.get("until", 0) or 0) and now >= int(ev["until"]):
                    await asyncio.to_thread(
                        DBRef(f"/servers/{gid}/protect/all").set, bool(ev.get("prev_all")))
                    await asyncio.to_thread(DBRef(f"event:{gid}").set, {})
                    invalidate(gid)
                    await self._log(gid, "🎉 Event mode ended",
                                    "Link blocking is back to your normal settings.")
            except Exception:
                continue

        # ── night schedule ──
        import datetime as dt
        hour = dt.datetime.now(_TZ).hour
        for gid, sc in await asyncio.to_thread(_kv_rows, "schedule:"):
            try:
                if not await asyncio.to_thread(_premium_active_sync, gid):
                    continue  # lapsed subscription — automation pauses
                night = sc.get("night") or {}
                applied = sc.get("applied")
                f, t = int(night.get("fromHour", 0)), int(night.get("toHour", 8))
                in_window = (f <= hour < t) if f < t else (hour >= f or hour < t)
                active = bool(night.get("enabled")) and in_window

                if active and not applied:
                    preset = _NIGHT_PRESETS.get(night.get("preset") or "strict", _NIGHT_PRESETS["strict"])
                    settings = await get_settings(gid)
                    snapshot = {
                        "protect": dict(settings.get("protect") or {}),
                        "raid": bool((settings.get("raid") or {}).get("enabled")),
                        "scam": bool((settings.get("scamguard") or {}).get("enabled")),
                    }
                    for key, val in preset["protect"].items():
                        await asyncio.to_thread(DBRef(f"/servers/{gid}/protect/{key}").set, val)
                    await asyncio.to_thread(DBRef(f"/servers/{gid}/raid/enabled").set, preset["raid"])
                    await asyncio.to_thread(DBRef(f"/servers/{gid}/scamguard/enabled").set, preset["scam"])
                    sc["applied"] = snapshot
                    await asyncio.to_thread(DBRef(f"schedule:{gid}").set, sc)
                    invalidate(gid)
                    await self._log(gid, "🌙 Night protection active",
                                    f"The {night.get('preset', 'strict')} preset is on until "
                                    f"{t:02d}:00 — your daytime settings come back automatically.")
                elif not active and applied:
                    for key, val in (applied.get("protect") or {}).items():
                        await asyncio.to_thread(DBRef(f"/servers/{gid}/protect/{key}").set, bool(val))
                    await asyncio.to_thread(DBRef(f"/servers/{gid}/raid/enabled").set, bool(applied.get("raid")))
                    await asyncio.to_thread(DBRef(f"/servers/{gid}/scamguard/enabled").set, bool(applied.get("scam")))
                    sc.pop("applied", None)
                    await asyncio.to_thread(DBRef(f"schedule:{gid}").set, sc)
                    invalidate(gid)
                    await self._log(gid, "☀️ Night protection lifted",
                                    "Your daytime settings are restored.")
            except Exception:
                continue


def setup(bot):
    bot.add_cog(PremiumAutomation(bot))
