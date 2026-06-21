"""
Shared DB layer + TTL settings cache for all cogs.
- Thread-local SQLite connections (no new connection per call)
- 5-second in-memory cache so all 14 on_message handlers share one DB read
"""

import asyncio
import json
import os
import sqlite3
import threading
import time

_BASE_DIR = os.path.dirname(os.path.abspath(__file__))
_DB_PATH = os.path.join(_BASE_DIR, "..", "bot.sqlite3")

_tls = threading.local()

def _get_conn() -> sqlite3.Connection:
    if not hasattr(_tls, "conn"):
        conn = sqlite3.connect(_DB_PATH, check_same_thread=False)
        conn.execute("PRAGMA journal_mode=WAL;")
        conn.execute("PRAGMA synchronous=NORMAL;")
        _tls.conn = conn
    return _tls.conn

def _init_db():
    c = _get_conn()
    c.execute("""CREATE TABLE IF NOT EXISTS servers (
        guild_id INTEGER PRIMARY KEY, data TEXT NOT NULL
    )""")
    c.execute("""CREATE TABLE IF NOT EXISTS kv (
        path TEXT PRIMARY KEY, value TEXT NOT NULL
    )""")
    c.commit()

_init_db()

_DEFAULT = {
    "channel": {"channel": [], "category": [], "member": [], "role": []},
    "link": {"links": []},
    "log": {"Activated": False, "log-channel": 0, "link": 0, "onlylink": False},
    "onlylink": False,
    "safe": {
        "google": False, "youtube": False, "nsfw": False, "gif": False,
        "invite": False, "twitch": False, "bit": False, "nitro": False, "steam": False,
    },
    "warn": {"kick": 3, "ban": 5},
    "protect": {
        "google": False, "youtube": False, "nsfw": False, "gif": False,
        "invite": False, "twitch": False, "bit": False, "nitro": False,
        "all": False, "steam": False, "malware": False,
    },
    "silent": False,
}

# ── settings cache ──────────────────────────────────────────────────────────
_cache: dict[str, tuple[float, dict]] = {}
_CACHE_TTL = 5.0  # seconds


def invalidate(guild_id: str) -> None:
    _cache.pop(str(guild_id), None)


def _fetch_sync(guild_id: int) -> dict:
    c = _get_conn()
    row = c.execute("SELECT data FROM servers WHERE guild_id=?", (guild_id,)).fetchone()
    if row is None:
        data = json.loads(json.dumps(_DEFAULT))
        c.execute("INSERT INTO servers (guild_id, data) VALUES (?, ?)",
                  (guild_id, json.dumps(data)))
        c.commit()
        return data
    return json.loads(row[0])


async def get_settings(guild_id: str) -> dict:
    """Return cached settings for guild; refreshes after 5 s."""
    now = time.monotonic()
    entry = _cache.get(guild_id)
    if entry and now - entry[0] < _CACHE_TTL:
        return entry[1]
    data = await asyncio.to_thread(_fetch_sync, int(guild_id))
    _cache[guild_id] = (time.monotonic(), data)
    return data


def get_safe_list(value) -> list:
    if isinstance(value, list):
        return value
    if value in (0, None, "0"):
        return []
    return [str(value)]


def is_whitelisted(message, settings: dict) -> bool:
    """Return True if this message should be skipped (whitelisted channel, category, member, or role)."""
    ch_cfg = settings.get("channel", {})
    ch_wl = get_safe_list(ch_cfg.get("channel"))
    cat_wl = get_safe_list(ch_cfg.get("category"))
    mb_wl = get_safe_list(ch_cfg.get("member"))
    ro_wl = get_safe_list(ch_cfg.get("role"))

    channel_id = str(message.channel.id)
    category_id = str(message.channel.category_id) if getattr(message.channel, "category_id", None) else None
    user_id = str(message.author.id)
    import discord as _discord
    role_ids = [str(r.id) for r in message.author.roles] if isinstance(message.author, _discord.Member) else []

    return (
        channel_id in ch_wl
        or (category_id is not None and category_id in cat_wl)
        or user_id in mb_wl
        or any(r in ro_wl for r in role_ids)
    )


# ── low-level DB writes (used by cogs for warn updates) ─────────────────────

def _deep_get(obj, keys):
    cur = obj
    for k in keys:
        if isinstance(cur, dict) and k in cur:
            cur = cur[k]
        else:
            return None
    return cur


def _deep_set(obj, keys, value):
    cur = obj
    for k in keys[:-1]:
        cur = cur.setdefault(k, {})
    cur[keys[-1]] = value
    return obj


def _deep_delete(obj, keys):
    cur = obj
    for k in keys[:-1]:
        if not isinstance(cur, dict) or k not in cur:
            return obj
        cur = cur[k]
    cur.pop(keys[-1], None)
    return obj


def _save_server(guild_id: int, data: dict) -> None:
    c = _get_conn()
    c.execute(
        "INSERT INTO servers (guild_id, data) VALUES (?, ?) "
        "ON CONFLICT(guild_id) DO UPDATE SET data=excluded.data",
        (guild_id, json.dumps(data)),
    )
    c.commit()
    invalidate(str(guild_id))


class DBRef:
    def __init__(self, path: str):
        self.path = "/" + path.strip("/")

    def child(self, key: str) -> "DBRef":
        return DBRef(self.path.rstrip("/") + "/" + key.strip("/"))

    def get(self):
        if self.path == "/servers":
            c = _get_conn()
            return {str(g): json.loads(d)
                    for g, d in c.execute("SELECT guild_id, data FROM servers").fetchall()}
        if self.path.startswith("/servers/"):
            parts = self.path.split("/")
            if len(parts) >= 3 and parts[2].isdigit():
                gid = int(parts[2])
                data = _fetch_sync(gid)
                return data if len(parts) == 3 else _deep_get(data, parts[3:])
        c = _get_conn()
        row = c.execute("SELECT value FROM kv WHERE path=?", (self.path,)).fetchone()
        return json.loads(row[0]) if row else None

    def set(self, value) -> None:
        if self.path.startswith("/servers/"):
            parts = self.path.split("/")
            if len(parts) >= 3 and parts[2].isdigit():
                gid = int(parts[2])
                if len(parts) == 3:
                    _save_server(gid, value)
                    return
                data = _fetch_sync(gid)
                _save_server(gid, _deep_set(data, parts[3:], value))
                return
        c = _get_conn()
        c.execute(
            "INSERT INTO kv(path, value) VALUES(?, ?) "
            "ON CONFLICT(path) DO UPDATE SET value=excluded.value",
            (self.path, json.dumps(value)),
        )
        c.commit()

    def delete(self) -> None:
        if self.path.startswith("/servers/"):
            parts = self.path.split("/")
            if len(parts) >= 3 and parts[2].isdigit():
                gid = int(parts[2])
                if len(parts) == 3:
                    c = _get_conn()
                    c.execute("DELETE FROM servers WHERE guild_id=?", (gid,))
                    c.commit()
                    invalidate(str(gid))
                    return
                data = _fetch_sync(gid)
                _save_server(gid, _deep_delete(data, parts[3:]))
                return
        c = _get_conn()
        c.execute("DELETE FROM kv WHERE path=?", (self.path,))
        c.commit()

    def update(self, values: dict) -> None:
        if self.path.startswith("/servers/"):
            parts = self.path.split("/")
            if len(parts) >= 3 and parts[2].isdigit():
                gid = int(parts[2])
                data = _fetch_sync(gid)
                target = data if len(parts) == 3 else _deep_get(data, parts[3:])
                if isinstance(target, dict):
                    target.update(values)
                else:
                    if len(parts) > 3:
                        _deep_set(data, parts[3:], values)
                    else:
                        data = values
                _save_server(gid, data)
                return
        c = _get_conn()
        row = c.execute("SELECT value FROM kv WHERE path=?", (self.path,)).fetchone()
        existing = json.loads(row[0]) if row else {}
        if isinstance(existing, dict):
            existing.update(values)
        else:
            existing = values
        c.execute(
            "INSERT INTO kv(path, value) VALUES(?, ?) "
            "ON CONFLICT(path) DO UPDATE SET value=excluded.value",
            (self.path, json.dumps(existing)),
        )
        c.commit()


class DB:
    def reference(self, path: str) -> DBRef:
        return DBRef(path)


db = DB()


# ── shared warn helper ───────────────────────────────────────────────────────

async def apply_warn(bot, message, settings: dict, reason: str) -> None:
    """Increment warn count and handle kick/ban/timeout. Send embeds."""
    guild_id = str(message.guild.id)
    user_id = str(message.author.id)

    warn_ref = DBRef(f"/servers/{guild_id}/warn/{user_id}")
    warn_data = await asyncio.to_thread(warn_ref.get) or {"Warn": 0, "reason": []}
    warn_data["Warn"] += 1
    warn_data["reason"].append(reason)
    await asyncio.to_thread(warn_ref.set, warn_data)

    warn_count = warn_data["Warn"]
    kick_limit = settings.get("warn", {}).get("kick", 0)
    ban_limit = settings.get("warn", {}).get("ban", 0)
    timeout_cfg = settings.get("warn", {}).get("timeout", {})
    timeout_warns = timeout_cfg.get("warnings", 0)
    timeout_minutes = timeout_cfg.get("time", 0)
    silent = settings.get("silent", False)

    import discord

    warn_embed = discord.Embed(
        title="🔗 Link Blocked",
        description=f"{message.author.mention} — your message was removed.\n**Reason:** {reason}",
        color=discord.Color.dark_red(),
    )
    warn_embed.add_field(name="Total Warnings", value=f"**{warn_count}** warning(s)")
    if kick_limit and warn_count == kick_limit - 1:
        warn_embed.set_footer(text="❗ One more warning → you will be kicked")
    elif ban_limit and warn_count == ban_limit - 1:
        warn_embed.set_footer(text="❗ One more warning → you will be banned")

    if silent:
        # Silent mode: DM the user instead of posting in channel
        try:
            dm_embed = discord.Embed(
                title="🔗 Your link was removed",
                description=f"**Server:** {message.guild.name}\n**Channel:** {message.channel.mention}\n**Reason:** {reason}",
                color=discord.Color.dark_red(),
            )
            dm_embed.add_field(name="Total Warnings", value=f"**{warn_count}** warning(s)")
            if kick_limit and warn_count == kick_limit - 1:
                dm_embed.set_footer(text="❗ One more warning → you will be kicked")
            elif ban_limit and warn_count == ban_limit - 1:
                dm_embed.set_footer(text="❗ One more warning → you will be banned")
            await message.author.send(embed=dm_embed)
        except Exception:
            pass  # DMs disabled — warn silently only in log
    else:
        await message.channel.send(embed=warn_embed)

    log_channel_id = settings.get("log", {}).get("log-channel", 0)
    log_channel = bot.get_channel(int(log_channel_id)) if log_channel_id else None
    if log_channel:
        log_embed = discord.Embed(
            title="[AUTO-MOD] Message Removed",
            description=f"**User:** {message.author.mention} (`{message.author.id}`)\n"
                        f"**Reason:** {reason}\n"
                        f"**Channel:** {message.channel.mention}"
                        + (" *(silent mode)*" if silent else ""),
            color=discord.Color.blurple(),
        )
        log_embed.add_field(name="Content", value=f"```{message.content[:900]}```", inline=False)
        log_embed.add_field(name="Total Warnings", value=str(warn_count))
        await log_channel.send(embed=log_embed)

    if timeout_warns and warn_count == timeout_warns:
        from datetime import timedelta
        try:
            until = discord.utils.utcnow() + timedelta(minutes=timeout_minutes)
            await message.author.timeout(until=until, reason=f"Auto-timeout: {timeout_warns} warnings")
            t_embed = discord.Embed(
                title="⏳ Timeout",
                description=f"{message.author.mention} timed out for **{timeout_minutes} min** "
                            f"(reached {timeout_warns} warnings).",
                color=discord.Color.orange(),
            )
            await message.channel.send(embed=t_embed)
            if log_channel:
                await log_channel.send(embed=t_embed)
        except Exception:
            err = discord.Embed(title="⛔ ERROR",
                                description=f"Cannot timeout {message.author.mention}. Check permissions.",
                                color=discord.Color.red())
            await message.channel.send(embed=err)

    if settings.get("log", {}).get("Activated"):
        try:
            if kick_limit and warn_count == kick_limit:
                await message.author.kick(reason=f"Auto-kick: {kick_limit} warnings")
                k_embed = discord.Embed(
                    title="👢 Kicked",
                    description=f"{message.author.mention} was kicked ({kick_limit} warnings).",
                    color=discord.Color.red(),
                )
                await message.channel.send(embed=k_embed)
                if log_channel:
                    await log_channel.send(embed=k_embed)
            elif ban_limit and warn_count == ban_limit:
                await message.author.ban(reason=f"Auto-ban: {ban_limit} warnings")
                b_embed = discord.Embed(
                    title="🔨 Banned",
                    description=f"{message.author.mention} was banned ({ban_limit} warnings).",
                    color=discord.Color.dark_red(),
                )
                await message.channel.send(embed=b_embed)
                if log_channel:
                    await log_channel.send(embed=b_embed)
        except discord.Forbidden:
            err = discord.Embed(
                title="⛔ ERROR",
                description=f"Cannot kick/ban {message.author.mention}.\n"
                            f"Make sure **Link Protect** is the highest role.",
                color=discord.Color.red(),
            )
            await message.channel.send(embed=err)
            if log_channel:
                try:
                    await log_channel.send(embed=err)
                except Exception:
                    pass
