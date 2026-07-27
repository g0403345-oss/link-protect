"""
Link Protect — Bot API Server
Läuft auf demselben Server wie der Bot und gibt der Website Zugriff auf die SQLite-DB.
Start: uvicorn api_server:app --host 0.0.0.0 --port 3001
"""

import asyncio
import hashlib
import hmac
import ipaddress
import json
import os
import re
import secrets
import socket
import sqlite3
import threading
import time
import traceback
import unicodedata
from functools import wraps
from typing import Any
from urllib.parse import urljoin, urlparse

import httpx
import datetime as _dt

from fastapi import FastAPI, HTTPException, Query, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

# ── Config ──────────────────────────────────────────────────────────────────
DB_PATH = os.environ.get("BOT_DB_PATH", "bot.sqlite3")
API_SECRET = os.environ.get("BOT_API_SECRET", "change-me-in-production")
BOT_TOKEN = os.environ.get("BOT_TOKEN", "")
DISCORD_API = "https://discord.com/api/v10"
ALLOWED_ORIGINS = os.environ.get("ALLOWED_ORIGINS", "http://localhost:3000").split(",")

# OAuth — used by the iOS app's server-side code exchange (no secret on device).
DISCORD_CLIENT_ID = os.environ.get("DISCORD_CLIENT_ID", "")
DISCORD_CLIENT_SECRET = os.environ.get("DISCORD_CLIENT_SECRET", "")
MANAGE_GUILD = 0x20  # "Manage Server" permission bit
# Mirrors website/lib/admin.ts — the single super-admin who can see every guild.
ADMIN_USER_ID = os.environ.get("ADMIN_USER_ID", "624317230955626507")

app = FastAPI(title="Link Protect API", docs_url=None, redoc_url=None)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["GET", "POST", "PATCH", "DELETE"],
    allow_headers=["Authorization", "Content-Type"],
)

# ── Thread-local DB connections ──────────────────────────────────────────────
_tls = threading.local()

def _get_conn() -> sqlite3.Connection:
    if not hasattr(_tls, "conn"):
        conn = sqlite3.connect(DB_PATH, check_same_thread=False)
        conn.execute("PRAGMA journal_mode=WAL;")
        conn.execute("PRAGMA synchronous=NORMAL;")
        # Wait up to 5s for a competing writer (bot vs. api_server) instead of
        # raising "database is locked" immediately.
        conn.execute("PRAGMA busy_timeout=5000;")
        conn.row_factory = sqlite3.Row
        _tls.conn = conn
    conn = _tls.conn
    # Self-heal: a failed write leaves the implicit transaction open, pinning a
    # stale WAL snapshot on this connection — all reads go stale and all writes
    # fail instantly with "database is locked" until rolled back.
    # LOUD on purpose: if this fires during normal operation, some code path is
    # calling a _get_conn()-using helper in the middle of its own transaction —
    # that helper call would silently discard the pending writes.
    if conn.in_transaction:
        print("[db] WARNING: rolling back stray open transaction", flush=True)
        traceback.print_stack(limit=6)
        try:
            conn.rollback()
        except sqlite3.Error:
            pass
    return conn

def _ensure_actions_table():
    c = _get_conn()
    c.execute("""CREATE TABLE IF NOT EXISTS actions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        guild_id INTEGER NOT NULL,
        user_id TEXT NOT NULL,
        username TEXT NOT NULL,
        channel_id TEXT NOT NULL,
        action TEXT NOT NULL,
        reason TEXT NOT NULL,
        warn_count INTEGER NOT NULL DEFAULT 0,
        timestamp INTEGER NOT NULL
    )""")
    c.execute("CREATE INDEX IF NOT EXISTS idx_actions_guild ON actions (guild_id, timestamp DESC)")
    c.commit()

_ensure_actions_table()

def _ensure_blocked_links_table():
    """Defensive: the bot creates these, but guard against the API querying first."""
    c = _get_conn()
    c.execute("""CREATE TABLE IF NOT EXISTS blocked_links (
        url TEXT PRIMARY KEY,
        domain TEXT NOT NULL,
        category TEXT NOT NULL,
        source TEXT NOT NULL DEFAULT 'blocked',
        hits INTEGER NOT NULL DEFAULT 0,
        first_seen INTEGER NOT NULL,
        last_seen INTEGER NOT NULL
    )""")
    try:
        c.execute("ALTER TABLE blocked_links ADD COLUMN source TEXT NOT NULL DEFAULT 'blocked'")
    except sqlite3.OperationalError:
        pass
    c.execute("""CREATE TABLE IF NOT EXISTS blocked_link_guilds (
        url TEXT NOT NULL,
        guild_id INTEGER NOT NULL,
        PRIMARY KEY (url, guild_id)
    )""")
    c.execute("""CREATE TABLE IF NOT EXISTS seen_domains (
        domain TEXT PRIMARY KEY,
        hits INTEGER NOT NULL DEFAULT 0,
        first_seen INTEGER NOT NULL,
        last_seen INTEGER NOT NULL
    )""")
    c.execute("""CREATE TABLE IF NOT EXISTS scanned_urls (
        url TEXT PRIMARY KEY,
        domain TEXT NOT NULL,
        malicious INTEGER,
        scanned_at INTEGER NOT NULL DEFAULT 0
    )""")
    c.commit()

_ensure_blocked_links_table()

def _ensure_audit_table():
    """Per-guild settings audit: who changed which setting, when."""
    c = _get_conn()
    c.execute("""CREATE TABLE IF NOT EXISTS audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        guild_id INTEGER NOT NULL,
        user_id TEXT NOT NULL DEFAULT '',
        username TEXT,
        path TEXT NOT NULL,
        description TEXT,
        old_value TEXT,
        new_value TEXT,
        ts INTEGER NOT NULL
    )""")
    c.execute("CREATE INDEX IF NOT EXISTS idx_audit_guild ON audit_log (guild_id, id DESC)")
    c.commit()

_ensure_audit_table()


def _ensure_vote_tables():
    """Defensive: the bot creates these, but guard against the API querying
    first. Also runs the `synced` migration (marks votes whose exact timestamp
    is unknown — recorded via the top.gg /check fallback, which has no time)."""
    c = _get_conn()
    c.execute("""CREATE TABLE IF NOT EXISTS votes (
        user_id TEXT PRIMARY KEY,
        last_voted INTEGER NOT NULL,
        total INTEGER NOT NULL DEFAULT 0,
        monthly INTEGER NOT NULL DEFAULT 0,
        month TEXT NOT NULL DEFAULT ''
    )""")
    try:
        c.execute("ALTER TABLE votes ADD COLUMN synced INTEGER NOT NULL DEFAULT 0")
    except sqlite3.OperationalError:
        pass
    # Streak migration: consecutive-day vote streaks (voter perk).
    for ddl in ("streak INTEGER NOT NULL DEFAULT 0", "best_streak INTEGER NOT NULL DEFAULT 0"):
        try:
            c.execute(f"ALTER TABLE votes ADD COLUMN {ddl}")
        except sqlite3.OperationalError:
            pass
    c.execute("CREATE INDEX IF NOT EXISTS idx_votes_month ON votes (month, monthly DESC)")
    # Which users currently hold the ♥ Supporter role on the support server —
    # lets the expiry sweep remove roles without listing guild members.
    c.execute("""CREATE TABLE IF NOT EXISTS supporter_roles (
        user_id TEXT PRIMARY KEY,
        granted_at INTEGER NOT NULL
    )""")
    c.execute("""CREATE TABLE IF NOT EXISTS kv (
        path TEXT PRIMARY KEY, value TEXT NOT NULL
    )""")
    c.commit()

_ensure_vote_tables()


# ── Settings audit log + change descriptions ──────────────────────────────────

_PROTECT_LABELS = {
    "all": "Block all links", "nsfw": "NSFW", "nitro": "Nitro scams",
    "malware": "Malware / Phishing", "invite": "Discord invites", "youtube": "YouTube",
    "google": "Google", "gif": "GIFs", "twitch": "Twitch", "steam": "Steam", "bit": "Shorteners",
}
_CHANNEL_LABELS = {
    "channel.channel": "whitelisted channels", "channel.category": "whitelisted categories",
    "channel.member": "whitelisted members", "channel.role": "whitelisted roles",
}


def _describe_change(path: str, value) -> str:
    """Human-readable description of a settings change (for push + audit)."""
    on = "enabled" if value else "disabled"
    if path.startswith("protect."):
        return f"{_PROTECT_LABELS.get(path.split('.', 1)[1], path)} {on}"
    if path == "silent":
        return f"Silent mode {on}"
    if path == "warn.kick":
        return f"Kick threshold set to {value}"
    if path == "warn.ban":
        return f"Ban threshold set to {value}"
    if path == "warn.timeout.warnings":
        return f"Timeout threshold set to {value}"
    if path == "warn.timeout.time":
        return f"Timeout duration set to {value} min"
    if path == "decay.enabled":
        return f"Warning decay {on}"
    if path == "decay.days":
        return f"Warning decay set to {value} days"
    if path == "log.Activated":
        return f"Warn-log {on}"
    if path == "log.log-channel":
        return "Warn-log channel changed" if value and str(value) != "0" else "Warn-log disabled"
    if path in _CHANNEL_LABELS:
        n = len(value) if isinstance(value, list) else 0
        return f"Updated {_CHANNEL_LABELS[path]} ({n})"
    if path == "link.links":
        n = len(value) if isinstance(value, list) else 0
        return f"Blacklist updated ({n} entries)"
    return "Settings updated"


def _audit_record(guild_id, actor_id, actor_name, path: str, description: str, old, new) -> None:
    """Append one audit entry; keep the last 500 per guild. Never raises."""
    try:
        c = _get_conn()
        c.execute(
            "INSERT INTO audit_log(guild_id, user_id, username, path, description, old_value, new_value, ts) "
            "VALUES(?,?,?,?,?,?,?,?)",
            (int(guild_id), str(actor_id or ""), actor_name, path, description,
             json.dumps(old)[:2000] if old is not None else None,
             json.dumps(new)[:2000] if new is not None else None, int(time.time())),
        )
        c.execute(
            "DELETE FROM audit_log WHERE guild_id=? AND id NOT IN "
            "(SELECT id FROM audit_log WHERE guild_id=? ORDER BY id DESC LIMIT 500)",
            (int(guild_id), int(guild_id)),
        )
        c.commit()
    except Exception:
        pass


def _web_actor(request: Request):
    """Acting user for a website-originated change (set by the Next.js route from
    the verified session; trusted because the route authenticates with the secret).
    The name arrives URL-encoded (headers are latin-1; Discord names may have emoji)."""
    from urllib.parse import unquote
    name = request.headers.get("X-Actor-Name")
    return request.headers.get("X-Actor-Id", ""), (unquote(name) if name else None)


def _audit_payload(guild_id: str, limit: int) -> dict:
    rows = _get_conn().execute(
        "SELECT user_id, username, path, description, ts "
        "FROM audit_log WHERE guild_id=? ORDER BY id DESC LIMIT ?",
        (int(guild_id), max(1, min(int(limit or 100), 300))),
    ).fetchall()
    return {"entries": [
        {"userId": r["user_id"], "username": r["username"], "path": r["path"],
         "description": r["description"] or _describe_change(r["path"], None),
         "timestamp": r["ts"]}
        for r in rows
    ]}

# ── In-memory cache (same as bot's shared.py) ────────────────────────────────
_cache: dict[str, tuple[float, dict]] = {}
_CACHE_TTL = 5.0

def _invalidate(guild_id: str):
    _cache.pop(guild_id, None)

def _get_server(guild_id: str) -> dict | None:
    now = time.monotonic()
    entry = _cache.get(guild_id)
    if entry and now - entry[0] < _CACHE_TTL:
        return entry[1]
    row = _get_conn().execute(
        "SELECT data FROM servers WHERE guild_id=?", (int(guild_id),)
    ).fetchone()
    if not row:
        return None
    data = json.loads(row["data"])
    _cache[guild_id] = (time.monotonic(), data)
    return data

def _client_safe(data: dict) -> dict:
    """Discord snowflake IDs must be strings for JS clients — a 19-digit number
    loses its last digits past 2^53 in JavaScript. Stringify log-channel so the
    dashboard can resolve it to a channel name. Returns a shallow copy; never
    mutates the cached dict."""
    log = data.get("log")
    if isinstance(log, dict) and isinstance(log.get("log-channel"), int) and log["log-channel"] != 0:
        return {**data, "log": {**log, "log-channel": str(log["log-channel"])}}
    return data


def _save_server(guild_id: str, data: dict):
    conn = _get_conn()
    conn.execute(
        "INSERT INTO servers(guild_id, data) VALUES(?,?) "
        "ON CONFLICT(guild_id) DO UPDATE SET data=excluded.data",
        (int(guild_id), json.dumps(data)),
    )
    conn.commit()
    _invalidate(guild_id)

def _deep_set(obj: dict, path: str, value: Any) -> dict:
    keys = path.split(".")
    cur = obj
    for k in keys[:-1]:
        cur = cur.setdefault(k, {})
    cur[keys[-1]] = value
    return obj

def _deep_get(obj: dict, path: str) -> Any:
    cur = obj
    for k in path.split("."):
        if not isinstance(cur, dict):
            return None
        cur = cur.get(k)
    return cur

# ── Auth middleware ──────────────────────────────────────────────────────────
def require_auth(func):
    @wraps(func)
    async def wrapper(request: Request, *args, **kwargs):
        auth = request.headers.get("Authorization", "")
        if not auth.startswith("Bearer ") or auth[7:] != API_SECRET:
            raise HTTPException(status_code=401, detail="Unauthorized")
        return await func(request, *args, **kwargs)
    return wrapper

# ── Models ───────────────────────────────────────────────────────────────────
class PatchBody(BaseModel):
    path: str
    value: Any

class BlacklistBody(BaseModel):
    action: str  # "add" | "remove"
    link: str


class OverrideBody(BaseModel):
    mode: str                       # "default" | "off" | "custom"
    protect: dict | None = None     # only for "custom": {blocker: bool}
    silent: bool | None = None      # only for "custom": optional
    allow: dict | None = None       # only for "custom": {"member":[...],"role":[...]}
                                    # members/roles exempt from blocking IN THIS channel


class ModerateBody(BaseModel):
    user_id: str
    action: str                     # warn | timeout | untimeout | kick | ban | unban
    username: str | None = None     # display name for logs (resolved client-side)
    reason: str | None = None
    minutes: int | None = None      # timeout duration (defaults to the guild's setting)


# Blocker keys a channel override may toggle (mirrors cogs.shared.PROTECT_KEYS).
PROTECT_KEYS = ("all", "nsfw", "nitro", "malware", "invite",
                "youtube", "google", "gif", "twitch", "steam", "bit")


def _apply_override(guild_id: str, channel_id: str, body: "OverrideBody"):
    """Write a single channel's override into the guild's settings document."""
    row = _get_conn().execute("SELECT data FROM servers WHERE guild_id=?", (int(guild_id),)).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Guild not found")
    data = json.loads(row["data"])
    overrides = data.setdefault("overrides", {})
    cid = str(channel_id)
    if body.mode == "default":
        overrides.pop(cid, None)
    elif body.mode == "off":
        overrides[cid] = {"mode": "off"}
    elif body.mode == "custom":
        # Merge onto any existing custom override so a partial update (e.g. just
        # toggling one blocker) never wipes the allow-list or silent flag.
        prev = overrides.get(cid) if isinstance(overrides.get(cid), dict) and \
            overrides.get(cid).get("mode") == "custom" else {}
        if body.protect is not None:
            protect = {k: bool(v) for k, v in body.protect.items() if k in PROTECT_KEYS}
        else:
            protect = prev.get("protect", {}) or {}
        ov = {"mode": "custom", "protect": protect}
        silent = body.silent if body.silent is not None else prev.get("silent")
        if silent is not None:
            ov["silent"] = bool(silent)
        allow = body.allow if body.allow is not None else prev.get("allow")
        if allow:
            ov["allow"] = {
                "enabled": bool(allow.get("enabled", True)),
                "member": [str(x) for x in (allow.get("member") or [])][:50],
                "role": [str(x) for x in (allow.get("role") or [])][:50],
            }
        overrides[cid] = ov
    else:
        raise HTTPException(status_code=400, detail="mode must be 'default', 'off' or 'custom'")
    _save_server(guild_id, data)


def _remove_override(guild_id: str, channel_id: str):
    row = _get_conn().execute("SELECT data FROM servers WHERE guild_id=?", (int(guild_id),)).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Guild not found")
    data = json.loads(row["data"])
    (data.get("overrides") or {}).pop(str(channel_id), None)
    _save_server(guild_id, data)


# ── Dashboard team (delegated access) ────────────────────────────────────────
class EditorsBody(BaseModel):
    editors: list[str]


def _set_guild_editors(guild_id: str, editors: list) -> list:
    """Persist the cleaned editor ID list for a guild; returns the saved list."""
    row = _get_conn().execute("SELECT data FROM servers WHERE guild_id=?", (int(guild_id),)).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Guild not found")
    data = json.loads(row["data"])
    clean: list[str] = []
    for e in (editors or [])[:50]:
        s = str(e).strip()
        if s.isdigit() and s not in clean:
            clean.append(s)
    data.setdefault("dashboard", {})["editors"] = clean
    _save_server(guild_id, data)
    return clean


# Codepoints that LOOK blank but aren't classified as marks/format/space:
# Hangul fillers, braille blank, Mongolian vowel separator.
_BLANK_LOOKING = {"ㅤ", "ᅟ", "ᅠ", "⠀", "᠎"}
# Unicode categories that render nothing on their own: marks (a bare combining
# char like '⃟' U+20DF has no base glyph), format/control chars, separators.
_INVISIBLE_CATEGORIES = {"Mn", "Me", "Mc", "Cf", "Cc", "Zs", "Zl", "Zp"}


def _visible_name(name: str | None) -> str | None:
    """The name if it actually renders, else None. Discord allows display names
    made purely of combining marks or zero-width filler — those paint as an
    empty string in every UI, so callers should fall back."""
    if not name:
        return None
    for ch in name:
        if ch in _BLANK_LOOKING:
            continue
        if unicodedata.category(ch) in _INVISIBLE_CATEGORIES:
            continue
        return name  # at least one visible base character
    return None


# Resolved names live for an hour; on a FAILED lookup we serve the last good
# value no matter how old — a stale name beats the "User …1234" fallback that
# used to litter the leaderboard whenever one Discord call timed out.
_name_cache: dict[str, tuple[float, dict]] = {}
_NAME_TTL = 3600.0


async def _resolve_users(ids: list) -> list:
    """Best-effort {id, username, avatar} for each user id (cached)."""
    out = []
    if not ids:
        return out
    if not BOT_TOKEN:
        return [{"id": str(i), "username": None, "avatar": None} for i in ids]
    now = time.monotonic()
    async with httpx.AsyncClient() as client:
        for i in list(ids)[:50]:
            key = str(i)
            cached = _name_cache.get(key)
            if cached and now - cached[0] < _NAME_TTL:
                out.append(dict(cached[1]))
                continue
            info = {"id": key, "username": None, "avatar": None}
            try:
                r = await client.get(f"{DISCORD_API}/users/{i}",
                                     headers={"Authorization": f"Bot {BOT_TOKEN}"}, timeout=5)
                if r.status_code == 200:
                    u = r.json()
                    # Invisible display name → fall back to the @handle, which
                    # Discord restricts to visible ASCII.
                    info["username"] = (_visible_name(u.get("global_name"))
                                        or _visible_name(u.get("username")))
                    info["avatar"] = u.get("avatar")
            except Exception:
                pass
            if info["username"] is not None:
                _name_cache[key] = (now, dict(info))
            elif cached:
                info = dict(cached[1])  # lookup failed → keep the stale name
            out.append(info)
    return out


# ── Routes ───────────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {"status": "ok"}


def _kv_int(path: str) -> int:
    try:
        row = _get_conn().execute("SELECT value FROM kv WHERE path=?", (path,)).fetchone()
        return int(row["value"]) if row else 0
    except Exception:
        return 0


# ── Global admin config (kv-backed) ──────────────────────────────────────────
LOCK_COMMANDS_KEY = "config:lock_commands"

def _kv_get_bool(path: str) -> bool:
    try:
        row = _get_conn().execute("SELECT value FROM kv WHERE path=?", (path,)).fetchone()
        return bool(row) and json.loads(row["value"]) in (True, 1, "1", "true")
    except Exception:
        return False

def _kv_set(path: str, value) -> None:
    conn = _get_conn()
    conn.execute(
        "INSERT INTO kv(path, value) VALUES(?, ?) ON CONFLICT(path) DO UPDATE SET value=excluded.value",
        (path, json.dumps(value)),
    )
    conn.commit()


class AdminConfigBody(BaseModel):
    lockCommands: bool


@app.get("/api/admin/config")
@require_auth
async def get_admin_config(request: Request):
    """Global super-admin config (web — gated by the Next route's isAdmin check)."""
    return {"lockCommands": _kv_get_bool(LOCK_COMMANDS_KEY)}


@app.post("/api/admin/config")
@require_auth
async def set_admin_config(request: Request, body: AdminConfigBody):
    _kv_set(LOCK_COMMANDS_KEY, bool(body.lockCommands))
    return {"ok": True, "lockCommands": bool(body.lockCommands)}


_BLOCKED_SORTS = {
    "hits": "bl.hits DESC, guild_count DESC",
    "guilds": "guild_count DESC, bl.hits DESC",
    "recent": "bl.last_seen DESC",
    "first": "bl.first_seen ASC",
}


_THREAT_IN = "('malware','phishing','scam','nitro')"


def _blocked_links_payload(q: str, category: str, sort: str, limit: int,
                           kind: str = "", caught: int = 0) -> dict:
    """Aggregated threat-intel: every link the bot has blocked or matched against
    a known-bad feed, with how often and across how many servers. Powers the
    admin dashboard's Threat Data tab.

    kind:   'threats' (malware/phishing/scam/nitro) | 'policy' (the rest) | ''
    caught: 1 → only entries actually seen live on our servers (hits > 0)
    """
    c = _get_conn()
    order = _BLOCKED_SORTS.get(sort, _BLOCKED_SORTS["hits"])
    limit = max(1, min(int(limit or 200), 1000))

    # Summary tiles
    srow = c.execute(
        "SELECT COUNT(*) AS unique_urls, COUNT(DISTINCT domain) AS unique_domains, "
        "COALESCE(SUM(hits),0) AS total_hits FROM blocked_links"
    ).fetchone()
    by_cat = [
        {"category": r["category"], "count": r["c"], "hits": r["hits"]}
        for r in c.execute(
            "SELECT category, COUNT(*) AS c, COALESCE(SUM(hits),0) AS hits "
            "FROM blocked_links GROUP BY category ORDER BY hits DESC"
        ).fetchall()
    ]

    # Passive observation + scan stats
    seen = c.execute(
        "SELECT COUNT(*) AS domains, COALESCE(SUM(hits),0) AS hits FROM seen_domains"
    ).fetchone()
    scan = c.execute(
        "SELECT COUNT(*) AS scanned, "
        "COALESCE(SUM(CASE WHEN malicious=1 THEN 1 ELSE 0 END),0) AS malicious "
        "FROM scanned_urls WHERE malicious IS NOT NULL"
    ).fetchone()
    extra = c.execute(
        f"SELECT "
        f"  COALESCE(SUM(CASE WHEN source='feed' THEN 1 ELSE 0 END),0) AS feed_known, "
        f"  COALESCE(SUM(CASE WHEN category IN {_THREAT_IN} THEN 1 ELSE 0 END),0) AS threats_total, "
        f"  COALESCE(SUM(CASE WHEN category IN {_THREAT_IN} AND hits>0 THEN 1 ELSE 0 END),0) AS caught_live "
        f"FROM blocked_links"
    ).fetchone()
    top_domains = [
        {"domain": r["domain"], "hits": r["hits"], "lastSeen": r["last_seen"]}
        for r in c.execute(
            "SELECT domain, hits, last_seen FROM seen_domains "
            "ORDER BY hits DESC LIMIT 100"
        ).fetchall()
    ]

    params: list = []
    where = []
    if q:
        where.append("(bl.domain LIKE ? OR bl.url LIKE ?)")
        params += [f"%{q}%", f"%{q}%"]
    if category:
        where.append("bl.category = ?")
        params.append(category)
    if kind == "threats":
        where.append(f"bl.category IN {_THREAT_IN}")
    elif kind == "policy":
        where.append(f"bl.category NOT IN {_THREAT_IN}")
    if caught:
        where.append("bl.hits > 0")
    where_sql = ("WHERE " + " AND ".join(where)) if where else ""

    rows = c.execute(
        f"SELECT bl.url, bl.domain, bl.category, bl.source, bl.hits, bl.first_seen, bl.last_seen, "
        f"  (SELECT COUNT(*) FROM blocked_link_guilds g WHERE g.url = bl.url) AS guild_count "
        f"FROM blocked_links bl {where_sql} ORDER BY {order} LIMIT ?",
        (*params, limit),
    ).fetchall()

    return {
        "summary": {
            "uniqueUrls": srow["unique_urls"],
            "uniqueDomains": srow["unique_domains"],
            "totalHits": srow["total_hits"],
            "byCategory": by_cat,
            "seenDomains": seen["domains"],
            "seenHits": seen["hits"],
            "scannedUrls": scan["scanned"],
            "maliciousFound": scan["malicious"],
            "feedKnown": extra["feed_known"],
            "threatsTotal": extra["threats_total"],
            "caughtLive": extra["caught_live"],
        },
        "links": [
            {
                "url": r["url"], "domain": r["domain"], "category": r["category"],
                "source": r["source"], "hits": r["hits"], "guildCount": r["guild_count"],
                "firstSeen": r["first_seen"], "lastSeen": r["last_seen"],
            }
            for r in rows
        ],
        "topDomains": top_domains,
    }


@app.get("/api/admin/blocked-links")
@require_auth
async def admin_blocked_links(request: Request, q: str = "", category: str = "",
                             sort: str = "hits", limit: int = 200,
                             kind: str = "", caught: int = 0):
    """Threat-intel feed for the admin dashboard (web — gated by the Next route's
    isAdmin check)."""
    return _blocked_links_payload(q, category, sort, limit, kind, caught)


# ── Public link checker (threat DB first, Safe Browsing fallback) ─────────────

_CHECK_THREAT_CATS = ("malware", "phishing", "scam", "nitro")
SAFE_BROWSING_KEY = os.environ.get(
    "SAFE_BROWSING_KEY", "AIzaSyAHR6g2nl9mGhie60t8p9Ns4utZv_8OR9c")
SAFE_BROWSING_URL = ("https://safebrowsing.googleapis.com/v4/threatMatches:find?key="
                     + SAFE_BROWSING_KEY)


def _domain_of(url: str) -> str:
    s = re.sub(r"^https?://", "", (url or "").strip(), flags=re.IGNORECASE).lstrip("/")
    if s[:4].lower() == "www.":
        s = s[4:]
    host = re.split(r"[/?#]", s, 1)[0]
    return host.lower().strip(".")


async def _safe_browsing_unsafe(url: str) -> bool:
    """True if Google Safe Browsing flags this URL. Best-effort (False on error)."""
    payload = {
        "client": {"clientId": "link-protect-checker", "clientVersion": "2.0"},
        "threatInfo": {
            "threatTypes": ["MALWARE", "SOCIAL_ENGINEERING",
                            "POTENTIALLY_HARMFUL_APPLICATION", "UNWANTED_SOFTWARE"],
            "platformTypes": ["ANY_PLATFORM"],
            "threatEntryTypes": ["URL"],
            "threatEntries": [{"url": url}],
        },
    }
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(SAFE_BROWSING_URL, json=payload, timeout=6)
            return bool(resp.json().get("matches"))
    except Exception:
        return False


def _threat_db_hit(c: sqlite3.Connection, raw: str, domain: str):
    """blocked_links row matching this exact URL or its domain, if any."""
    ph = ",".join("?" * len(_CHECK_THREAT_CATS))
    return c.execute(
        f"SELECT category, source, hits FROM blocked_links "
        f"WHERE (url=? OR domain=?) AND category IN ({ph}) "
        f"ORDER BY hits DESC LIMIT 1",
        (raw, domain, *_CHECK_THREAT_CATS),
    ).fetchone()


def _seen_on_servers(c: sqlite3.Connection, domain: str) -> int:
    row = c.execute(
        "SELECT COUNT(DISTINCT g.guild_id) AS n FROM blocked_link_guilds g "
        "JOIN blocked_links b ON b.url = g.url WHERE b.domain=?",
        (domain,),
    ).fetchone()
    return row["n"] if row else 0


def _host_is_private(host: str) -> bool:
    """SSRF guard for the redirect resolver: True for hosts that resolve to
    loopback/private/link-local/reserved addresses — or don't resolve at all."""
    try:
        infos = socket.getaddrinfo(host, None)
    except OSError:
        return True
    try:
        return any(not ipaddress.ip_address(i[4][0]).is_global for i in infos)
    except ValueError:
        return True


async def _resolve_redirects(url: str, max_hops: int = 6) -> list[dict]:
    """Follow HTTP redirects manually — shorteners hide their real target behind
    them. Body is never read (stream, headers only) and every hop is SSRF-guarded.
    Returns the hops AFTER the submitted URL; best-effort (partial chain on error)."""
    hops: list[dict] = []
    current = url if re.match(r"^https?://", url, re.IGNORECASE) else f"https://{url}"
    seen = {current}
    try:
        async with httpx.AsyncClient(
            timeout=5, headers={"User-Agent": "Mozilla/5.0 (LinkProtect-Checker)"}
        ) as client:
            for _ in range(max_hops):
                parsed = urlparse(current)
                if parsed.scheme not in ("http", "https") or not parsed.hostname:
                    break
                if await asyncio.to_thread(_host_is_private, parsed.hostname):
                    break
                async with client.stream("GET", current, follow_redirects=False) as r:
                    status, location = r.status_code, r.headers.get("location")
                if status not in (301, 302, 303, 307, 308) or not location:
                    break
                nxt = urljoin(current, location)
                if nxt in seen or len(nxt) > 500:
                    break
                seen.add(nxt)
                hops.append({"url": nxt, "domain": _domain_of(nxt), "status": status})
                current = nxt
    except Exception:
        pass
    return hops


async def _check_verdict(url: str, deep: int) -> dict:
    """Verdict for a single URL: our own threat DB first (free, instant), then a
    cached Google Safe Browsing lookup. With deep=1 the redirect chain is resolved
    too and every hop is checked — catches threats hidden behind shorteners.
    Shared by the website checker proxy and the keyed /api/v1/check."""
    raw = (url or "").strip()[:500]
    if not raw or "." not in raw:
        raise HTTPException(status_code=400, detail="Provide a url to check")
    domain = _domain_of(raw)
    if not domain or "." not in domain or len(domain) > 255:
        raise HTTPException(status_code=400, detail="That doesn't look like a valid link")

    c = _get_conn()
    hit = _threat_db_hit(c, raw, domain)
    if hit:
        return {
            "url": raw, "domain": domain, "safe": False,
            "category": hit["category"], "source": "threat-db",
            "reason": f"Flagged as {hit['category']} in the Link Protect threat database.",
            "seenOnServers": _seen_on_servers(c, domain),
            "hits": hit["hits"] or 0,
        }

    redirects: list[dict] = []
    if deep:
        redirects = await _resolve_redirects(raw)
        for hop in redirects:
            hop_hit = _threat_db_hit(c, hop["url"], hop["domain"])
            if hop_hit:
                return {
                    "url": raw, "domain": domain, "safe": False,
                    "category": hop_hit["category"], "source": "threat-db",
                    "reason": (f"This link redirects to {hop['domain']}, which is flagged "
                               f"as {hop_hit['category']} in the Link Protect threat database."),
                    "seenOnServers": _seen_on_servers(c, hop["domain"]),
                    "hits": hop_hit["hits"] or 0,
                    "redirects": redirects,
                    "finalUrl": redirects[-1]["url"], "finalDomain": redirects[-1]["domain"],
                }

    seen = c.execute("SELECT hits FROM seen_domains WHERE domain=?", (domain,)).fetchone()
    circulating = seen["hits"] if seen else 0

    # Safe Browsing on the submitted URL — and, in deep mode, on the redirect
    # target too (the submitted shortener itself is usually clean).
    to_scan = [raw] + ([redirects[-1]["url"]] if redirects else [])
    malicious_url = None
    for u in to_scan:
        cached = c.execute("SELECT malicious FROM scanned_urls WHERE url=?", (u,)).fetchone()
        if cached and cached["malicious"] is not None:
            malicious = bool(cached["malicious"])
        else:
            malicious = await _safe_browsing_unsafe(u)
            try:
                c.execute(
                    "INSERT INTO scanned_urls(url, domain, malicious, scanned_at) VALUES(?,?,?,?) "
                    "ON CONFLICT(url) DO UPDATE SET malicious=excluded.malicious, scanned_at=excluded.scanned_at",
                    (u, _domain_of(u), 1 if malicious else 0, int(time.time())),
                )
                c.commit()
            except Exception:
                pass
        if malicious:
            malicious_url = u
            break

    extra = ({"redirects": redirects,
              "finalUrl": redirects[-1]["url"], "finalDomain": redirects[-1]["domain"]}
             if redirects else ({} if not deep else {"redirects": []}))

    if malicious_url:
        behind = malicious_url != raw
        return {
            "url": raw, "domain": domain, "safe": False, "category": "malware",
            "source": "safe-browsing",
            "reason": ("Google Safe Browsing flagged the destination behind this link as dangerous."
                       if behind else "Google Safe Browsing flagged this link as dangerous."),
            "seenOnServers": 0, "hits": circulating, **extra,
        }
    return {
        "url": raw, "domain": domain, "safe": True, "category": None, "source": "clean",
        "reason": ("No threat on record." if not circulating
                   else "Seen circulating on Discord but not flagged as malicious."),
        "seenOnServers": 0, "hits": circulating, **extra,
    }


@app.get("/api/check")
@require_auth
async def check_link(request: Request, url: str = Query(default=""), deep: int = Query(default=0)):
    return await _check_verdict(url, deep)


# ── User reports (→ operator admin panel) ─────────────────────────────────────

_REPORT_TYPES = {"malicious_link", "false_positive", "bug", "feedback", "appeal"}
_REPORT_STATUSES = {"open", "reviewed", "resolved", "dismissed"}


class ReportBody(BaseModel):
    type: str
    url: str | None = None
    category: str | None = None
    message: str | None = None
    guildId: str | None = None


class ReportPatchBody(BaseModel):
    status: str | None = None
    promote: bool | None = None


def _insert_report(user_id, username, guild_id, rtype, url, category, message) -> int:
    if rtype not in _REPORT_TYPES:
        raise HTTPException(status_code=400, detail="Invalid report type")
    if not ((url or "").strip() or (message or "").strip()):
        raise HTTPException(status_code=400, detail="Report needs a link or a message")
    c = _get_conn()
    c.execute(
        "INSERT INTO reports(user_id, username, guild_id, type, url, category, message, status, created_at) "
        "VALUES(?,?,?,?,?,?,?, 'open', ?)",
        (str(user_id or ""), username, str(guild_id) if guild_id else None, rtype,
         (url or "").strip()[:500] or None, (category or "").strip()[:40] or None,
         (message or "").strip()[:2000] or None, int(time.time())),
    )
    c.commit()
    return c.execute("SELECT last_insert_rowid() AS id").fetchone()["id"]


def _report_counts() -> dict:
    rows = _get_conn().execute("SELECT status, COUNT(*) AS c FROM reports GROUP BY status").fetchall()
    return {r["status"]: r["c"] for r in rows}


def _list_reports(status: str = "", rtype: str = "", limit: int = 200) -> dict:
    where, params = [], []
    if status:
        where.append("status=?"); params.append(status)
    if rtype:
        where.append("type=?"); params.append(rtype)
    where_sql = ("WHERE " + " AND ".join(where)) if where else ""
    rows = _get_conn().execute(
        f"SELECT id, user_id, username, guild_id, type, url, category, message, status, created_at "
        f"FROM reports {where_sql} ORDER BY id DESC LIMIT ?",
        (*params, max(1, min(int(limit or 200), 500))),
    ).fetchall()
    return {
        "reports": [
            {"id": r["id"], "userId": r["user_id"], "username": r["username"],
             "guildId": r["guild_id"], "type": r["type"], "url": r["url"],
             "category": r["category"], "message": r["message"], "status": r["status"],
             "createdAt": r["created_at"]}
            for r in rows
        ],
        "counts": _report_counts(),
    }


def _update_report(report_id: int, status=None, promote: bool = False) -> dict:
    c = _get_conn()
    row = c.execute("SELECT * FROM reports WHERE id=?", (int(report_id),)).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Report not found")
    if status:
        if status not in _REPORT_STATUSES:
            raise HTTPException(status_code=400, detail="Invalid status")
        c.execute("UPDATE reports SET status=? WHERE id=?", (status, int(report_id)))
        # Commit BEFORE calling _notify: helpers acquire the connection via
        # _get_conn(), whose stray-transaction guard would roll our pending
        # UPDATE back (that exact interaction silently ate status changes).
        c.commit()
        if status != row["status"]:
            _notify("user", row["user_id"], "report_status",
                    f"Your report was marked {status}", None, int(report_id))
    if promote and row["type"] == "malicious_link" and row["url"]:
        d = _domain_of(row["url"])
        cat = row["category"] if row["category"] in _CHECK_THREAT_CATS else "scam"
        now = int(time.time())
        c.execute(
            "INSERT INTO blocked_links(url, domain, category, source, hits, first_seen, last_seen) "
            "VALUES(?,?,?, 'report', 0, ?, ?) "
            "ON CONFLICT(url) DO UPDATE SET category=excluded.category, last_seen=excluded.last_seen",
            (row["url"][:500], d, cat, now, now),
        )
    c.commit()
    return {"ok": True}


@app.post("/api/report")
@require_auth
async def post_report(request: Request, body: ReportBody):
    aid, aname = _web_actor(request)
    rid = _insert_report(aid, aname, body.guildId, body.type, body.url, body.category, body.message)
    _notify("user", ADMIN_USER_ID, "report_new",
            f"New {body.type.replace('_', ' ')} report",
            (body.message or body.url or "").strip(), rid)
    return {"ok": True, "id": rid}


@app.get("/api/admin/reports")
@require_auth
async def admin_reports(request: Request, status: str = "", type: str = "", limit: int = 200):
    return _list_reports(status, type, limit)


@app.patch("/api/admin/reports/{report_id}")
@require_auth
async def admin_patch_report(request: Request, report_id: int, body: ReportPatchBody):
    return _update_report(report_id, body.status, bool(body.promote))


@app.post("/api/mobile/report")
async def mobile_post_report(request: Request, body: ReportBody):
    user = await _discord_user(_bearer(request))
    rid = _insert_report(user["id"], user.get("username"), body.guildId,
                         body.type, body.url, body.category, body.message)
    _notify("user", ADMIN_USER_ID, "report_new",
            f"New {body.type.replace('_', ' ')} report",
            (body.message or body.url or "").strip(), rid)
    return {"ok": True, "id": rid}


@app.get("/api/mobile/admin/reports")
async def mobile_admin_reports(request: Request, status: str = "", type: str = "", limit: int = 200):
    await _require_admin(request)
    return _list_reports(status, type, limit)


@app.patch("/api/mobile/admin/reports/{report_id}")
async def mobile_admin_patch_report(request: Request, report_id: int, body: ReportPatchBody):
    await _require_admin(request)
    return _update_report(report_id, body.status, bool(body.promote))


# ── Report threads (two-way) + web notification centre ────────────────────────

def _ensure_ticket_tables():
    c = _get_conn()
    c.execute("""CREATE TABLE IF NOT EXISTS report_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        report_id INTEGER NOT NULL,
        sender TEXT NOT NULL,            -- 'user' | 'admin'
        user_id TEXT,
        username TEXT,
        body TEXT NOT NULL,
        created_at INTEGER NOT NULL
    )""")
    c.execute("CREATE INDEX IF NOT EXISTS idx_rmsg_report ON report_messages (report_id, id)")
    c.execute("""CREATE TABLE IF NOT EXISTS web_notifications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        scope TEXT NOT NULL,             -- 'user' | 'guild'
        scope_id TEXT NOT NULL,
        type TEXT NOT NULL,              -- report_new|report_reply|report_status|settings|warn
        title TEXT NOT NULL,
        body TEXT,
        report_id INTEGER,
        created_at INTEGER NOT NULL
    )""")
    c.execute("CREATE INDEX IF NOT EXISTS idx_wnotif ON web_notifications (scope, scope_id, id DESC)")
    c.commit()

_ensure_ticket_tables()


def _notify(scope: str, scope_id, ntype: str, title: str, body: str | None = None, report_id: int | None = None) -> None:
    """Record one in-app notification. Never raises. Keeps the last 300 per recipient."""
    if not scope_id:
        return
    try:
        c = _get_conn()
        c.execute(
            "INSERT INTO web_notifications(scope, scope_id, type, title, body, report_id, created_at) "
            "VALUES(?,?,?,?,?,?,?)",
            (scope, str(scope_id), ntype, (title or "")[:120], ((body or "").strip()[:500] or None),
             int(report_id) if report_id else None, int(time.time())),
        )
        c.execute(
            "DELETE FROM web_notifications WHERE scope=? AND scope_id=? AND id NOT IN "
            "(SELECT id FROM web_notifications WHERE scope=? AND scope_id=? ORDER BY id DESC LIMIT 300)",
            (scope, str(scope_id), scope, str(scope_id)),
        )
        c.commit()
    except Exception:
        pass


def _serialize_report(r) -> dict:
    return {"id": r["id"], "userId": r["user_id"], "username": r["username"], "guildId": r["guild_id"],
            "type": r["type"], "url": r["url"], "category": r["category"], "message": r["message"],
            "status": r["status"], "createdAt": r["created_at"]}


def _report_messages(report_id: int) -> list:
    rows = _get_conn().execute(
        "SELECT id, sender, user_id, username, body, created_at FROM report_messages "
        "WHERE report_id=? ORDER BY id ASC", (int(report_id),),
    ).fetchall()
    return [{"id": r["id"], "sender": r["sender"], "userId": r["user_id"],
             "username": r["username"], "body": r["body"], "createdAt": r["created_at"]} for r in rows]


class ReportMessageBody(BaseModel):
    message: str


def _report_thread_guard(request: Request, report_id: int):
    aid, aname = _web_actor(request)
    row = _get_conn().execute("SELECT * FROM reports WHERE id=?", (int(report_id),)).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Report not found")
    is_admin = str(aid) == str(ADMIN_USER_ID)
    if not is_admin and str(aid) != str(row["user_id"] or ""):
        raise HTTPException(status_code=403, detail="Forbidden")
    return aid, aname, row, is_admin


def _thread_payload(row) -> dict:
    return {"report": _serialize_report(row), "messages": _report_messages(row["id"])}


@app.get("/api/report/{report_id}")
@require_auth
async def get_report_thread(request: Request, report_id: int):
    _, _, row, _ = _report_thread_guard(request, report_id)
    return _thread_payload(row)


@app.post("/api/report/{report_id}/message")
@require_auth
async def post_report_message(request: Request, report_id: int, body: ReportMessageBody):
    aid, aname, row, is_admin = _report_thread_guard(request, report_id)
    # A closed ticket is read-only for the reporter; only an admin can still reply.
    if not is_admin and row["status"] in ("resolved", "dismissed"):
        raise HTTPException(status_code=409, detail="This ticket is closed.")
    msg = (body.message or "").strip()[:2000]
    if not msg:
        raise HTTPException(status_code=400, detail="Empty message")
    sender = "admin" if is_admin else "user"
    c = _get_conn()
    c.execute(
        "INSERT INTO report_messages(report_id, sender, user_id, username, body, created_at) VALUES(?,?,?,?,?,?)",
        (int(report_id), sender, str(aid), aname, msg, int(time.time())),
    )
    # An admin reply moves an untouched report to 'reviewed'.
    if is_admin and row["status"] == "open":
        c.execute("UPDATE reports SET status='reviewed' WHERE id=?", (int(report_id),))
    c.commit()
    preview = msg[:140]
    if is_admin:
        _notify("user", row["user_id"], "report_reply", "Support replied to your report", preview, report_id)
    else:
        _notify("user", ADMIN_USER_ID, "report_reply", f"New reply on report #{report_id}", preview, report_id)
    row = c.execute("SELECT * FROM reports WHERE id=?", (int(report_id),)).fetchone()
    return _thread_payload(row)


# ── Scam Shield appeals (unban requests) ──────────────────────────────────────
# A flagged account can appeal once (per open case); the appeal is a normal
# report of type 'appeal', so the whole two-way ticket machinery (thread,
# notifications, bell) works unchanged. Accepting an appeal removes the flag
# network-wide; denying keeps it and lets the user file a new appeal later.

class AppealBody(BaseModel):
    message: str


class AppealDecideBody(BaseModel):
    accept: bool


def _flag_info(user_id: str) -> dict | None:
    c = _get_conn()
    row = c.execute(
        "SELECT reason, incidents, first_seen, last_seen FROM flagged_users WHERE user_id=?",
        (str(user_id),),
    ).fetchone()
    if row is None:
        return None
    guilds = c.execute(
        "SELECT COUNT(*) AS c FROM flagged_user_guilds WHERE user_id=?", (str(user_id),)
    ).fetchone()["c"]
    return {"reason": row["reason"], "incidents": row["incidents"],
            "guilds": guilds, "lastSeen": row["last_seen"]}


@app.get("/api/appeal/status")
@require_auth
async def appeal_status(request: Request):
    aid, _ = _web_actor(request)
    if not aid:
        raise HTTPException(status_code=401, detail="No acting user")
    row = _get_conn().execute(
        "SELECT id, status, message, created_at FROM reports "
        "WHERE user_id=? AND type='appeal' ORDER BY id DESC LIMIT 1",
        (str(aid),),
    ).fetchone()
    appeal = ({"id": row["id"], "status": row["status"], "message": row["message"],
               "createdAt": row["created_at"]} if row else None)
    flag = _flag_info(aid)
    return {"flagged": flag is not None, "flag": flag, "appeal": appeal}


@app.post("/api/appeal")
@require_auth
async def post_appeal(request: Request, body: AppealBody):
    aid, aname = _web_actor(request)
    if not aid:
        raise HTTPException(status_code=401, detail="No acting user")
    if _flag_info(aid) is None:
        raise HTTPException(status_code=409, detail="This account is not flagged.")
    c = _get_conn()
    existing = c.execute(
        "SELECT id FROM reports WHERE user_id=? AND type='appeal' "
        "AND status IN ('open','reviewed') ORDER BY id DESC LIMIT 1",
        (str(aid),),
    ).fetchone()
    if existing:
        return {"ok": True, "id": existing["id"], "existing": True}
    msg = (body.message or "").strip()[:2000]
    if not msg:
        raise HTTPException(status_code=400, detail="Please describe what happened.")
    rid = _insert_report(aid, aname, None, "appeal", None, None, msg)
    _notify("user", ADMIN_USER_ID, "report_new", "New unban appeal", msg[:140], rid)
    return {"ok": True, "id": rid}


@app.post("/api/admin/appeals/{report_id}/decide")
@require_auth
async def admin_decide_appeal(request: Request, report_id: int, body: AppealDecideBody):
    c = _get_conn()
    row = c.execute("SELECT * FROM reports WHERE id=?", (int(report_id),)).fetchone()
    if not row or row["type"] != "appeal":
        raise HTTPException(status_code=404, detail="Appeal not found")
    uid = row["user_id"]
    accept = bool(body.accept)
    if accept:
        _delete_flag(uid)
    c.execute("UPDATE reports SET status=? WHERE id=?",
              ("resolved" if accept else "dismissed", int(report_id)))
    verdict = (
        "✅ Appeal accepted — the flag on your account has been removed and the "
        "automatic join check no longer applies to you. (Bans on individual "
        "servers are up to that server's staff.)"
        if accept else
        "❌ Appeal denied — the flag on your account stays in place. If you have "
        "new information, you can submit a new appeal."
    )
    c.execute(
        "INSERT INTO report_messages(report_id, sender, user_id, username, body, created_at) "
        "VALUES(?,?,?,?,?,?)",
        (int(report_id), "admin", ADMIN_USER_ID, "Link Protect", verdict, int(time.time())),
    )
    c.commit()
    _notify("user", uid, "report_status",
            "Your appeal was accepted" if accept else "Your appeal was denied",
            verdict[:140], int(report_id))
    return {"ok": True, "accepted": accept}


@app.get("/api/my/reports")
@require_auth
async def my_reports(request: Request, limit: int = 100):
    aid, _ = _web_actor(request)
    if not aid:
        return {"reports": []}
    rows = _get_conn().execute(
        "SELECT id, user_id, username, guild_id, type, url, category, message, status, created_at "
        "FROM reports WHERE user_id=? ORDER BY id DESC LIMIT ?",
        (str(aid), max(1, min(int(limit or 100), 200))),
    ).fetchall()
    out = []
    for r in rows:
        d = _serialize_report(r)
        last = _get_conn().execute(
            "SELECT sender, created_at FROM report_messages WHERE report_id=? ORDER BY id DESC LIMIT 1", (r["id"],)
        ).fetchone()
        d["replyCount"] = _get_conn().execute(
            "SELECT COUNT(*) AS c FROM report_messages WHERE report_id=?", (r["id"],)
        ).fetchone()["c"]
        d["lastSender"] = last["sender"] if last else None
        d["lastAt"] = last["created_at"] if last else r["created_at"]
        out.append(d)
    return {"reports": out}


def _list_notifications(aid: str, limit: int = 50) -> dict:
    """The notification centre is ticket-only — personal (user-scope) notifications
    for the acting user. Logs/warnings/settings live in the per-guild audit log,
    not here."""
    seen = _kv_int(f"notif_seen:{aid}")
    rows = _get_conn().execute(
        "SELECT id, scope, scope_id, type, title, body, report_id, created_at FROM web_notifications "
        "WHERE scope='user' AND scope_id=? ORDER BY id DESC LIMIT ?",
        (str(aid), max(1, min(int(limit or 50), 200))),
    ).fetchall()
    notifs = [{"id": r["id"], "scope": r["scope"], "scopeId": r["scope_id"], "type": r["type"],
               "title": r["title"], "body": r["body"], "reportId": r["report_id"],
               "createdAt": r["created_at"], "unread": r["created_at"] > seen} for r in rows]
    return {"notifications": notifs, "unread": sum(1 for n in notifs if n["unread"]), "seenAt": seen}


@app.get("/api/notifications")
@require_auth
async def get_notifications(request: Request, limit: int = 50):
    aid, _ = _web_actor(request)
    if not aid:
        return {"notifications": [], "unread": 0, "seenAt": 0}
    return _list_notifications(aid, limit)


@app.get("/api/notifications/stream")
@require_auth
async def notifications_stream(request: Request):
    """Server-Sent Events: pushes the notification list to the browser in real
    time (no client polling). Emits the current state on connect, then again
    whenever a new ticket notification lands. Ends after ~50s so the client
    (EventSource) reconnects cleanly within serverless time limits."""
    aid, _ = _web_actor(request)

    async def gen():
        if not aid:
            yield "event: end\ndata: {}\n\n"
            return
        payload = _list_notifications(aid, 50)
        last_id = max((n["id"] for n in payload["notifications"]), default=0)
        yield f"data: {json.dumps(payload)}\n\n"
        for i in range(50):
            if await request.is_disconnected():
                break
            await asyncio.sleep(1)
            try:
                row = _get_conn().execute(
                    "SELECT MAX(id) AS m FROM web_notifications WHERE scope='user' AND scope_id=?",
                    (str(aid),),
                ).fetchone()
                mx = row["m"] or 0
            except Exception:
                mx = last_id
            if mx > last_id:
                last_id = mx
                yield f"data: {json.dumps(_list_notifications(aid, 50))}\n\n"
            elif i % 15 == 14:
                yield ": ping\n\n"

    return StreamingResponse(gen(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-store", "X-Accel-Buffering": "no"})


@app.post("/api/notifications/seen")
@require_auth
async def seen_notifications(request: Request):
    aid, _ = _web_actor(request)
    if aid:
        _kv_set(f"notif_seen:{aid}", int(time.time()))
    return {"ok": True}


# ── top.gg votes: supporter leaderboard + per-user status ─────────────────────

VOTE_COOLDOWN = 12 * 3600       # top.gg lets a user vote every 12 hours
SUPPORTER_WINDOW = 30 * 86400   # "supporter" = voted within the last 30 days
# A day-streak survives as long as consecutive votes are ≤48h apart (i.e. you
# may skip up to one calendar day). Deliberately forgiving — streaks should
# motivate, not punish a single late evening.
STREAK_GRACE = 48 * 3600

# Support server where active voters get the ♥ Supporter role for 30 days.
SUPPORT_GUILD_ID = os.environ.get("SUPPORT_GUILD_ID", "864823666952372245")
SUPPORTER_ROLE_NAME = "♥ Supporter"
SUPPORTER_ROLE_KEY = "config:supporter_role_id"


def _utc_day(ts: int) -> str:
    return time.strftime("%Y-%m-%d", time.gmtime(ts))


def _next_streak(last: int, prev_streak: int, now: int) -> int:
    """Day-based streak: another vote on the same UTC day keeps it, a vote on a
    later day within the grace window extends it, anything else restarts at 1."""
    if not last or now - last > STREAK_GRACE:
        return 1
    if _utc_day(last) == _utc_day(now):
        return max(prev_streak, 1)
    return max(prev_streak, 0) + 1


def _live_streak(last: int, streak: int, now: int) -> int:
    """The stored streak counts only while the last vote is within grace."""
    return streak if last and now - last <= STREAK_GRACE else 0


def _month_key() -> str:
    return time.strftime("%Y-%m", time.gmtime())


def _avatar_url(uid: str, avatar: str | None) -> str | None:
    if not avatar:
        return None
    ext = "gif" if str(avatar).startswith("a_") else "png"
    return f"https://cdn.discordapp.com/avatars/{uid}/{avatar}.{ext}?size=64"


def _record_vote(user_id: str, exact: bool = True) -> None:
    """Record a vote. `exact=True` means we know the real vote time (top.gg
    webhook fired now); `exact=False` means we only learned via the /check
    fallback that the user has an active vote — the true time is unknown, so we
    flag it `synced` and the UI won't show a (wrong) precise cooldown."""
    c = _get_conn()
    now = int(time.time())
    mk = _month_key()
    synced = 0 if exact else 1
    row = c.execute("SELECT monthly, month, last_voted, streak, best_streak FROM votes WHERE user_id=?",
                    (str(user_id),)).fetchone()
    if row:
        monthly = (row["monthly"] + 1) if row["month"] == mk else 1
        streak = _next_streak(row["last_voted"], row["streak"], now)
        best = max(row["best_streak"], streak)
        c.execute("UPDATE votes SET last_voted=?, total=total+1, monthly=?, month=?, synced=?, streak=?, best_streak=? "
                  "WHERE user_id=?",
                  (now, monthly, mk, synced, streak, best, str(user_id)))
    else:
        c.execute("INSERT INTO votes(user_id, last_voted, total, monthly, month, synced, streak, best_streak) "
                  "VALUES(?,?,1,1,?,?,1,1)",
                  (str(user_id), now, mk, synced))
    c.commit()
    # Voter perk: grant the ♥ Supporter role on the support server (best-effort).
    try:
        asyncio.create_task(_grant_supporter_role(str(user_id)))
    except RuntimeError:
        pass


def _vote_status(user_id: str) -> dict:
    c = _get_conn()
    now = int(time.time())
    mk = _month_key()
    row = c.execute("SELECT last_voted, total, monthly, month, synced, streak, best_streak FROM votes WHERE user_id=?",
                    (str(user_id),)).fetchone()
    if not row:
        return {"hasVoted": False, "lastVoted": 0, "canVoteAt": now, "synced": False,
                "total": 0, "monthly": 0, "rank": None, "supporter": False,
                "streak": 0, "bestStreak": 0}
    last = row["last_voted"]
    monthly = row["monthly"] if row["month"] == mk else 0
    rank = None
    if monthly > 0:
        better = c.execute(
            "SELECT COUNT(*) AS n FROM votes WHERE month=? AND (monthly>? OR (monthly=? AND last_voted<?))",
            (mk, monthly, monthly, last),
        ).fetchone()["n"]
        rank = better + 1
    return {
        "hasVoted": now < last + VOTE_COOLDOWN,
        "lastVoted": last,
        "canVoteAt": last + VOTE_COOLDOWN,
        # True when last_voted is a best-guess (learned via /check, exact time
        # unknown) — the client shows a soft "already voted" instead of a timer.
        "synced": bool(row["synced"]),
        "total": row["total"],
        "monthly": monthly,
        "rank": rank,
        "supporter": (now - last) < SUPPORTER_WINDOW,
        "streak": _live_streak(last, row["streak"], now),
        "bestStreak": row["best_streak"],
    }


class TopggVoteBody(BaseModel):
    user: str
    type: str | None = None
    isWeekend: bool | None = None


@app.post("/api/topgg/webhook")
@require_auth
async def topgg_webhook(request: Request, body: TopggVoteBody):
    """A recorded vote, relayed by the website's public webhook route (which
    verifies top.gg's own Authorization header before forwarding)."""
    if body.type in ("upvote", "test") and body.user:
        _record_vote(str(body.user), exact=True)  # webhook fires at the true vote time
    return {"ok": True}


# ── Voter perk: ♥ Supporter role on the support server ────────────────────────
# Granted on every vote, removed by a background sweep once the voter's last
# vote is older than the 30-day supporter window. The bot needs Manage Roles on
# the support server (and its top role above ♥ Supporter).

async def _supporter_role_id() -> str | None:
    """Resolve (and lazily create) the ♥ Supporter role. Cached in kv."""
    cached = None
    try:
        row = _get_conn().execute("SELECT value FROM kv WHERE path=?", (SUPPORTER_ROLE_KEY,)).fetchone()
        cached = json.loads(row["value"]) if row else None
    except Exception:
        pass
    if cached:
        return str(cached)
    if not BOT_TOKEN or not SUPPORT_GUILD_ID:
        return None
    headers = {"Authorization": f"Bot {BOT_TOKEN}"}
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.get(f"{DISCORD_API}/guilds/{SUPPORT_GUILD_ID}/roles", headers=headers)
            if r.status_code != 200:
                return None
            role = next((x for x in r.json() if x.get("name") == SUPPORTER_ROLE_NAME), None)
            if not role:
                r = await client.post(
                    f"{DISCORD_API}/guilds/{SUPPORT_GUILD_ID}/roles",
                    headers={**headers, "X-Audit-Log-Reason": "Link Protect voter perk role"},
                    json={"name": SUPPORTER_ROLE_NAME, "color": 0xF23F43,
                          "hoist": True, "mentionable": False, "permissions": "0"},
                )
                if r.status_code not in (200, 201):
                    print(f"[supporter-role] create failed: {r.status_code} {r.text[:200]}")
                    return None
                role = r.json()
    except Exception as e:
        print(f"[supporter-role] resolve failed: {e}")
        return None
    rid = str(role["id"])
    _kv_set(SUPPORTER_ROLE_KEY, rid)
    return rid


async def _grant_supporter_role(user_id: str) -> None:
    """Best-effort: add the role after a vote. 404 = not on the support server."""
    rid = await _supporter_role_id()
    if not rid:
        return
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.put(
                f"{DISCORD_API}/guilds/{SUPPORT_GUILD_ID}/members/{user_id}/roles/{rid}",
                headers={"Authorization": f"Bot {BOT_TOKEN}",
                         "X-Audit-Log-Reason": "top.gg vote — supporter perk (30 days)"},
            )
        if r.status_code == 204:
            c = _get_conn()
            c.execute("INSERT OR REPLACE INTO supporter_roles(user_id, granted_at) VALUES(?,?)",
                      (str(user_id), int(time.time())))
            c.commit()
        elif r.status_code == 404 and '"code": 10011' in r.text:
            _kv_set(SUPPORTER_ROLE_KEY, None)  # role was deleted — re-resolve next vote
    except Exception:
        pass


async def _supporter_role_loop():
    """Hourly sweep: strip the role from voters whose 30-day window lapsed."""
    while True:
        await asyncio.sleep(3600)
        try:
            cutoff = int(time.time()) - SUPPORTER_WINDOW
            rows = _get_conn().execute(
                "SELECT s.user_id FROM supporter_roles s LEFT JOIN votes v ON v.user_id = s.user_id "
                "WHERE v.last_voted IS NULL OR v.last_voted < ?", (cutoff,)
            ).fetchall()
            if not rows:
                continue
            rid = await _supporter_role_id()
            if not rid:
                continue
            async with httpx.AsyncClient(timeout=10) as client:
                for r in rows[:50]:  # gentle: at most 50 removals per sweep
                    uid = r["user_id"]
                    try:
                        resp = await client.delete(
                            f"{DISCORD_API}/guilds/{SUPPORT_GUILD_ID}/members/{uid}/roles/{rid}",
                            headers={"Authorization": f"Bot {BOT_TOKEN}",
                                     "X-Audit-Log-Reason": "Supporter window (30 days) expired"},
                        )
                        # 204 removed · 404 member/role gone — either way, done tracking.
                        if resp.status_code in (204, 404):
                            c = _get_conn()
                            c.execute("DELETE FROM supporter_roles WHERE user_id=?", (uid,))
                            c.commit()
                        await asyncio.sleep(1)  # stay far from the rate limit
                    except Exception:
                        pass
        except Exception:
            pass


_lb_cache: tuple[float, dict] | None = None
_LB_TTL = 20.0  # short enough that the polling landing page feels near-live


@app.get("/api/leaderboard")
@require_auth
async def leaderboard(request: Request, limit: int = 10):
    """Monthly supporter leaderboard (public — surfaced on the landing page)."""
    global _lb_cache
    now = time.monotonic()
    limit = max(1, min(int(limit or 10), 25))
    if _lb_cache and now - _lb_cache[0] < _LB_TTL and _lb_cache[1].get("limit") == limit:
        return _lb_cache[1]
    mk = _month_key()
    wall = int(time.time())
    rows = _get_conn().execute(
        "SELECT user_id, monthly, total, last_voted, streak FROM votes "
        "WHERE month=? AND monthly>0 ORDER BY monthly DESC, last_voted ASC LIMIT ?",
        (mk, limit),
    ).fetchall()
    resolved = {u["id"]: u for u in await _resolve_users([r["user_id"] for r in rows])}
    board = []
    for i, r in enumerate(rows):
        u = resolved.get(r["user_id"], {})
        board.append({
            "rank": i + 1, "id": r["user_id"],
            "username": u.get("username"), "avatarUrl": _avatar_url(r["user_id"], u.get("avatar")),
            "votes": r["monthly"], "total": r["total"],
            "streak": _live_streak(r["last_voted"], r["streak"], wall),
        })
    payload = {"month": mk, "leaderboard": board, "limit": limit}
    _lb_cache = (now, payload)
    return payload


# ── Supporter wall: every voter of the current month (landing page) ───────────

_wall_cache: tuple[float, dict] | None = None
_WALL_TTL = 300.0  # avatars change rarely; keep Discord REST traffic low


@app.get("/api/supporters")
@require_auth
async def supporters(request: Request, limit: int = 48):
    """All of this month's voters — avatar wall on the landing page."""
    global _wall_cache
    now = time.monotonic()
    limit = max(1, min(int(limit or 48), 48))
    if _wall_cache and now - _wall_cache[0] < _WALL_TTL and _wall_cache[1].get("limit") == limit:
        return _wall_cache[1]
    mk = _month_key()
    rows = _get_conn().execute(
        "SELECT user_id, monthly FROM votes WHERE month=? AND monthly>0 "
        "ORDER BY monthly DESC, last_voted ASC",
        (mk,),
    ).fetchall()
    shown = rows[:limit]
    resolved = {u["id"]: u for u in await _resolve_users([r["user_id"] for r in shown])}
    wall = []
    for r in shown:
        u = resolved.get(r["user_id"], {})
        wall.append({
            "id": r["user_id"], "username": u.get("username"),
            "avatarUrl": _avatar_url(r["user_id"], u.get("avatar")),
            "votes": r["monthly"],
        })
    payload = {"month": mk, "count": len(rows), "supporters": wall, "limit": limit}
    _wall_cache = (now, payload)
    return payload


# Fallback when the webhook isn't set up yet: poll top.gg's own /check endpoint
# (using the bot's top.gg token) so a user's existing vote is still picked up.
TOPGG_BOT_ID = os.environ.get("TOPGG_BOT_ID", "888390889892892684")
TOPGG_TOKEN = os.environ.get(
    "TOPGG_TOKEN",
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6Ijg4ODM5MDg4OTg5Mjg5MjY4NCIsImJvdCI6dHJ1ZSwiaWF0IjoxNjM2NjU1NTM2fQ.txNDT50-BQ1z7Uuwjqhen6vbCXX9IQ2gLWtbUHOVgmM",
)
_topgg_poll: dict[str, float] = {}
# Re-poll a user at most once a minute. Short enough that when someone votes and
# returns to the site their vote is picked up quickly (the webhook is the fast
# path; this is the fallback when it isn't delivering).
_TOPGG_POLL_COOLDOWN = 60.0


async def _maybe_sync_topgg_vote(user_id: str) -> None:
    """If our DB has no active vote for this user, ask top.gg whether they've
    voted in the last 12h and record it. Best-effort; never raises."""
    if _vote_status(user_id)["hasVoted"]:
        return  # already counted within the cooldown window
    now = time.monotonic()
    if now - _topgg_poll.get(user_id, 0.0) < _TOPGG_POLL_COOLDOWN or not TOPGG_TOKEN:
        return
    _topgg_poll[user_id] = now
    try:
        async with httpx.AsyncClient() as client:
            r = await client.get(
                f"https://top.gg/api/bots/{TOPGG_BOT_ID}/check",
                params={"userId": str(user_id)},
                headers={"Authorization": TOPGG_TOKEN}, timeout=6,
            )
        if r.status_code == 200 and r.json().get("voted"):
            # /check has no timestamp — record as approximate (synced).
            _record_vote(str(user_id), exact=False)
    except Exception:
        pass


@app.get("/api/user/{user_id}/vote")
@require_auth
async def user_vote(request: Request, user_id: str):
    await _maybe_sync_topgg_vote(user_id)
    return _vote_status(user_id)


# ── Per-user UI flags (kv-backed) ─────────────────────────────────────────────
# Small per-account preferences that must persist across devices / re-logins —
# e.g. whether the dashboard tour has been completed. localStorage alone isn't
# enough because it doesn't follow the user to a new browser or survive a wipe.

class UserFlagsBody(BaseModel):
    tourSeen: bool | None = None
    votePromptSeen: bool | None = None  # "don't show again" on the vote popup


def _flags_key(user_id: str) -> str:
    return f"user:{user_id}:flags"


def _get_flags(user_id: str) -> dict:
    try:
        row = _get_conn().execute("SELECT value FROM kv WHERE path=?", (_flags_key(user_id),)).fetchone()
        return json.loads(row["value"]) if row else {}
    except Exception:
        return {}


def _flags_payload(flags: dict) -> dict:
    return {"tourSeen": bool(flags.get("tourSeen")),
            "votePromptSeen": bool(flags.get("votePromptSeen"))}


@app.get("/api/user/{user_id}/flags")
@require_auth
async def get_user_flags(request: Request, user_id: str):
    return _flags_payload(_get_flags(user_id))


@app.post("/api/user/{user_id}/flags")
@require_auth
async def set_user_flags(request: Request, user_id: str, body: UserFlagsBody):
    flags = _get_flags(user_id)
    if body.tourSeen is not None:
        flags["tourSeen"] = bool(body.tourSeen)
    if body.votePromptSeen is not None:
        flags["votePromptSeen"] = bool(body.votePromptSeen)
    _kv_set(_flags_key(user_id), flags)
    return _flags_payload(flags)


# ── Developer access ─────────────────────────────────────────────────────────
# Users apply from the website's Settings page; the request lands in the
# operator admin panel (+ bell notification), the decision is pushed back to
# the user's bell. Approved developers see the Developer tab in the dashboard.

class DevRequestBody(BaseModel):
    message: str | None = None


class DevDecideBody(BaseModel):
    accept: bool


def _dev_key(user_id: str) -> str:
    return f"user:{user_id}:dev"


def _dev_get(user_id: str) -> dict:
    try:
        row = _get_conn().execute("SELECT value FROM kv WHERE path=?", (_dev_key(user_id),)).fetchone()
        return json.loads(row["value"]) if row else {}
    except Exception:
        return {}


def _dev_payload(d: dict) -> dict:
    return {"status": d.get("status") or "none", "message": d.get("message"),
            "requestedAt": d.get("requestedAt") or 0, "decidedAt": d.get("decidedAt") or 0,
            "beta": bool(d.get("beta"))}


@app.get("/api/user/{user_id}/dev")
@require_auth
async def get_dev_status(request: Request, user_id: str):
    return _dev_payload(_dev_get(user_id))


@app.post("/api/user/{user_id}/dev/request")
@require_auth
async def request_dev_access(request: Request, user_id: str, body: DevRequestBody):
    _, aname = _web_actor(request)
    d = _dev_get(user_id)
    if d.get("status") in ("pending", "approved"):
        return _dev_payload(d)  # idempotent — no duplicate requests or pings
    d = {"status": "pending", "message": (body.message or "").strip()[:500] or None,
         "requestedAt": int(time.time()), "decidedAt": 0,
         "username": aname or d.get("username")}
    _kv_set(_dev_key(user_id), d)
    who = aname or f"User …{user_id[-4:]}"
    _notify("user", ADMIN_USER_ID, "dev_request", "Developer access request",
            f"{who} requests developer access" + (f": {d['message']}" if d["message"] else ""))
    return _dev_payload(d)


@app.get("/api/admin/dev/requests")
@require_auth
async def admin_dev_requests(request: Request):
    rows = _get_conn().execute("SELECT path, value FROM kv WHERE path LIKE 'user:%:dev'").fetchall()
    entries = []
    for r in rows:
        try:
            d = json.loads(r["value"])
        except Exception:
            continue
        uid = r["path"].split(":")[1]
        entries.append({"userId": uid, "username": d.get("username"), **_dev_payload(d)})
    # Pending first, newest on top.
    entries.sort(key=lambda e: (e["status"] != "pending", -(e["requestedAt"] or 0)))
    # Fill in current Discord names/avatars where we can (best-effort).
    resolved = {u["id"]: u for u in await _resolve_users([e["userId"] for e in entries])}
    for e in entries:
        u = resolved.get(e["userId"])
        if u and u.get("username"):
            e["username"] = u["username"]
        e["avatarUrl"] = _avatar_url(e["userId"], u.get("avatar") if u else None)
    return {"requests": entries}


@app.post("/api/admin/dev/requests/{user_id}/decide")
@require_auth
async def admin_decide_dev(request: Request, user_id: str, body: DevDecideBody):
    d = _dev_get(user_id)
    if not d.get("status"):
        raise HTTPException(status_code=404, detail="No developer request from this user")
    accept = bool(body.accept)
    d["status"] = "approved" if accept else "denied"
    d["decidedAt"] = int(time.time())
    _kv_set(_dev_key(user_id), d)
    _notify("user", user_id, "dev_decision",
            "Developer access approved 🎉" if accept else "Developer access request declined",
            ("You now have developer access — open any server dashboard and check the new "
             "Developer tab.") if accept else
            "Your request wasn't approved this time. You can apply again from Settings.")
    return {"ok": True, **_dev_payload(d)}


class DevBetaBody(BaseModel):
    enabled: bool


@app.post("/api/user/{user_id}/dev/beta")
@require_auth
async def set_dev_beta(request: Request, user_id: str, body: DevBetaBody):
    """Early-access opt-in — approved developers get beta features first."""
    d = _dev_get(user_id)
    if d.get("status") != "approved":
        raise HTTPException(status_code=403, detail="Developer access required")
    d["beta"] = bool(body.enabled)
    _kv_set(_dev_key(user_id), d)
    return _dev_payload(d)


# ── Developer platform: API keys, /api/v1/*, webhooks ────────────────────────
# Keys are created per server inside that server's Developer tab (the website
# already enforces guild access + approved-developer status; the endpoints here
# re-check the dev status from the actor header as defense in depth). A key
# grants read-only access to ITS server's stats/trends plus the threat lookup.

def _ensure_dev_tables():
    c = _get_conn()
    c.execute("""CREATE TABLE IF NOT EXISTS dev_api_keys (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        key_hash TEXT UNIQUE NOT NULL,
        prefix TEXT NOT NULL,
        guild_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        label TEXT,
        created_at INTEGER NOT NULL,
        last_used INTEGER,
        total_requests INTEGER NOT NULL DEFAULT 0,
        revoked INTEGER NOT NULL DEFAULT 0
    )""")
    c.execute("""CREATE TABLE IF NOT EXISTS dev_webhooks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        guild_id TEXT NOT NULL,
        url TEXT NOT NULL,
        secret TEXT NOT NULL,
        events TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1,
        created_by TEXT,
        created_at INTEGER NOT NULL,
        last_status INTEGER,
        last_delivery_at INTEGER,
        failure_count INTEGER NOT NULL DEFAULT 0
    )""")
    c.execute("CREATE INDEX IF NOT EXISTS idx_dev_webhooks_guild ON dev_webhooks (guild_id)")
    # Key scopes (v1 writes): 'read' | 'moderate' | 'config', comma-joined.
    try:
        c.execute("ALTER TABLE dev_api_keys ADD COLUMN scopes TEXT NOT NULL DEFAULT 'read'")
    except sqlite3.OperationalError:
        pass
    # Webhook delivery log — the Stripe-style inspector (last 50 per webhook).
    c.execute("""CREATE TABLE IF NOT EXISTS dev_webhook_deliveries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        webhook_id INTEGER NOT NULL,
        guild_id TEXT NOT NULL,
        event TEXT NOT NULL,
        status INTEGER NOT NULL,
        ok INTEGER NOT NULL,
        duration_ms INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL
    )""")
    c.execute("CREATE INDEX IF NOT EXISTS idx_devwd ON dev_webhook_deliveries (webhook_id, id DESC)")
    c.commit()

_ensure_dev_tables()

_WEBHOOK_EVENTS = ("link_blocked", "member_kicked", "member_banned", "member_timeout",
                   "scamshield_catch", "raid_detected")
_MAX_KEYS_PER_GUILD = 5
_MAX_WEBHOOKS_PER_GUILD = 3
_WEBHOOK_DISABLE_AFTER = 25  # consecutive failures


def _hash_key(key: str) -> str:
    return hashlib.sha256(key.encode()).hexdigest()


def _require_dev_actor(request: Request) -> tuple[str, str | None]:
    aid, aname = _web_actor(request)
    if not aid or _dev_get(str(aid)).get("status") != "approved":
        raise HTTPException(status_code=403, detail="Developer access required")
    return str(aid), aname


_KEY_SCOPES = ("read", "moderate", "config")


def _row_scopes(r) -> set:
    try:
        raw = r["scopes"] or "read"
    except (KeyError, IndexError):
        raw = "read"
    return {x for x in raw.split(",") if x in _KEY_SCOPES} or {"read"}


def _key_row_payload(r) -> dict:
    return {"id": r["id"], "label": r["label"], "prefix": r["prefix"],
            "createdAt": r["created_at"], "lastUsed": r["last_used"] or 0,
            "totalRequests": r["total_requests"], "scopes": sorted(_row_scopes(r))}


def _webhook_row_payload(r) -> dict:
    try:
        events = json.loads(r["events"])
    except Exception:
        events = []
    return {"id": r["id"], "url": r["url"], "secret": r["secret"], "events": events,
            "enabled": bool(r["enabled"]), "createdAt": r["created_at"],
            "lastStatus": r["last_status"], "lastDeliveryAt": r["last_delivery_at"] or 0,
            "failureCount": r["failure_count"]}


class DevKeyBody(BaseModel):
    label: str | None = None
    scopes: list[str] | None = None  # subset of read|moderate|config


class DevWebhookBody(BaseModel):
    url: str
    events: list[str]


class DevWebhookPatchBody(BaseModel):
    url: str | None = None
    events: list[str] | None = None
    enabled: bool | None = None


@app.get("/api/guild/{guild_id}/dev/keys")
@require_auth
async def dev_list_keys(request: Request, guild_id: str):
    _require_dev_actor(request)
    rows = _get_conn().execute(
        "SELECT * FROM dev_api_keys WHERE guild_id=? AND revoked=0 ORDER BY id DESC",
        (str(guild_id),)).fetchall()
    return {"keys": [_key_row_payload(r) for r in rows]}


@app.post("/api/guild/{guild_id}/dev/keys")
@require_auth
async def dev_create_key(request: Request, guild_id: str, body: DevKeyBody):
    aid, _ = _require_dev_actor(request)
    c = _get_conn()
    n = c.execute("SELECT COUNT(*) AS n FROM dev_api_keys WHERE guild_id=? AND revoked=0",
                  (str(guild_id),)).fetchone()["n"]
    key_cap = 20 if _is_premium(str(guild_id)) else _MAX_KEYS_PER_GUILD
    if n >= key_cap:
        raise HTTPException(status_code=409, detail=f"Limit of {key_cap} active keys per server")
    key = "lp_" + secrets.token_hex(20)
    prefix = key[:11]  # "lp_" + 8 hex chars — enough to identify, useless to guess
    label = (body.label or "").strip()[:60] or None
    scopes = ",".join(sorted({x for x in (body.scopes or ["read"]) if x in _KEY_SCOPES} | {"read"}))
    c.execute(
        "INSERT INTO dev_api_keys(key_hash, prefix, guild_id, user_id, label, created_at, scopes) "
        "VALUES(?,?,?,?,?,?,?)",
        (_hash_key(key), prefix, str(guild_id), aid, label, int(time.time()), scopes))
    c.commit()
    row = c.execute("SELECT * FROM dev_api_keys WHERE key_hash=?", (_hash_key(key),)).fetchone()
    # The full key is returned exactly once — only its hash is stored.
    return {**_key_row_payload(row), "key": key}


@app.delete("/api/guild/{guild_id}/dev/keys/{key_id}")
@require_auth
async def dev_revoke_key(request: Request, guild_id: str, key_id: int):
    _require_dev_actor(request)
    c = _get_conn()
    c.execute("UPDATE dev_api_keys SET revoked=1 WHERE id=? AND guild_id=?",
              (int(key_id), str(guild_id)))
    c.commit()
    return {"ok": True}


async def _validate_webhook_url(url: str) -> str:
    url = (url or "").strip()[:500]
    parsed = urlparse(url)
    if parsed.scheme != "https" or not parsed.hostname:
        raise HTTPException(status_code=400, detail="Webhook URL must be https://")
    if await asyncio.to_thread(_host_is_private, parsed.hostname):
        raise HTTPException(status_code=400, detail="Webhook URL must be publicly reachable")
    return url


def _validate_events(events: list[str]) -> list[str]:
    ev = [e for e in dict.fromkeys(events or []) if e in _WEBHOOK_EVENTS]
    if not ev:
        raise HTTPException(status_code=400, detail="Subscribe to at least one valid event")
    return ev


@app.get("/api/guild/{guild_id}/dev/webhooks")
@require_auth
async def dev_list_webhooks(request: Request, guild_id: str):
    _require_dev_actor(request)
    rows = _get_conn().execute(
        "SELECT * FROM dev_webhooks WHERE guild_id=? ORDER BY id DESC", (str(guild_id),)).fetchall()
    return {"webhooks": [_webhook_row_payload(r) for r in rows], "events": list(_WEBHOOK_EVENTS)}


@app.post("/api/guild/{guild_id}/dev/webhooks")
@require_auth
async def dev_create_webhook(request: Request, guild_id: str, body: DevWebhookBody):
    aid, _ = _require_dev_actor(request)
    url = await _validate_webhook_url(body.url)
    events = _validate_events(body.events)
    c = _get_conn()
    n = c.execute("SELECT COUNT(*) AS n FROM dev_webhooks WHERE guild_id=?",
                  (str(guild_id),)).fetchone()["n"]
    if n >= (10 if _is_premium(str(guild_id)) else _MAX_WEBHOOKS_PER_GUILD):
        raise HTTPException(status_code=409, detail=f"Limit of {_MAX_WEBHOOKS_PER_GUILD} webhooks per server")
    secret = "whsec_" + secrets.token_hex(24)
    c.execute(
        "INSERT INTO dev_webhooks(guild_id, url, secret, events, created_by, created_at) "
        "VALUES(?,?,?,?,?,?)",
        (str(guild_id), url, secret, json.dumps(events), aid, int(time.time())))
    c.commit()
    row = c.execute("SELECT * FROM dev_webhooks WHERE guild_id=? ORDER BY id DESC LIMIT 1",
                    (str(guild_id),)).fetchone()
    return _webhook_row_payload(row)


@app.patch("/api/guild/{guild_id}/dev/webhooks/{wh_id}")
@require_auth
async def dev_patch_webhook(request: Request, guild_id: str, wh_id: int, body: DevWebhookPatchBody):
    _require_dev_actor(request)
    c = _get_conn()
    row = c.execute("SELECT * FROM dev_webhooks WHERE id=? AND guild_id=?",
                    (int(wh_id), str(guild_id))).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Webhook not found")
    url = await _validate_webhook_url(body.url) if body.url is not None else row["url"]
    events = json.dumps(_validate_events(body.events)) if body.events is not None else row["events"]
    enabled = int(body.enabled) if body.enabled is not None else row["enabled"]
    # Re-enabling clears the failure counter so auto-disable starts fresh.
    failures = 0 if (body.enabled and not row["enabled"]) else row["failure_count"]
    c.execute("UPDATE dev_webhooks SET url=?, events=?, enabled=?, failure_count=? WHERE id=?",
              (url, events, enabled, failures, int(wh_id)))
    c.commit()
    return _webhook_row_payload(c.execute("SELECT * FROM dev_webhooks WHERE id=?", (int(wh_id),)).fetchone())


@app.delete("/api/guild/{guild_id}/dev/webhooks/{wh_id}")
@require_auth
async def dev_delete_webhook(request: Request, guild_id: str, wh_id: int):
    _require_dev_actor(request)
    c = _get_conn()
    c.execute("DELETE FROM dev_webhooks WHERE id=? AND guild_id=?", (int(wh_id), str(guild_id)))
    c.commit()
    return {"ok": True}


async def _deliver_webhook(wh: dict, event: str, data: dict) -> tuple[int, int]:
    """POST one signed event. Returns (status, duration_ms); status 0 = network/SSRF failure."""
    body = json.dumps({"event": event, "guildId": str(wh["guild_id"]), "data": data,
                       "sentAt": int(time.time())}, separators=(",", ":")).encode()
    sig = hmac.new(wh["secret"].encode(), body, hashlib.sha256).hexdigest()
    t0 = time.monotonic()
    try:
        parsed = urlparse(wh["url"])
        if parsed.scheme != "https" or not parsed.hostname or \
                await asyncio.to_thread(_host_is_private, parsed.hostname):
            return 0, 0
        async with httpx.AsyncClient(timeout=6) as client:
            resp = await client.post(wh["url"], content=body, headers={
                "Content-Type": "application/json",
                "User-Agent": "LinkProtect-Webhooks/1.0",
                "X-LinkProtect-Event": event,
                "X-LinkProtect-Signature": f"sha256={sig}",
            })
            return resp.status_code, int((time.monotonic() - t0) * 1000)
    except Exception:
        return 0, int((time.monotonic() - t0) * 1000)


def _record_delivery(wh_id: int, status: int, guild_id: str = "", event: str = "",
                     duration_ms: int = 0) -> None:
    try:
        c = _get_conn()
        ok = 200 <= status < 300
        # Inspector log: every attempt, last 50 kept per webhook.
        c.execute("INSERT INTO dev_webhook_deliveries(webhook_id, guild_id, event, status, ok, "
                  "duration_ms, created_at) VALUES(?,?,?,?,?,?,?)",
                  (wh_id, str(guild_id), event, status, 1 if ok else 0, duration_ms, int(time.time())))
        c.execute("DELETE FROM dev_webhook_deliveries WHERE webhook_id=? AND id NOT IN "
                  "(SELECT id FROM dev_webhook_deliveries WHERE webhook_id=? ORDER BY id DESC LIMIT 50)",
                  (wh_id, wh_id))
        if ok:
            c.execute("UPDATE dev_webhooks SET last_status=?, last_delivery_at=?, failure_count=0 WHERE id=?",
                      (status, int(time.time()), wh_id))
        else:
            c.execute("UPDATE dev_webhooks SET last_status=?, last_delivery_at=?, "
                      "failure_count=failure_count+1, "
                      f"enabled=CASE WHEN failure_count+1 >= {_WEBHOOK_DISABLE_AFTER} THEN 0 ELSE enabled END "
                      "WHERE id=?",
                      (status, int(time.time()), wh_id))
        c.commit()
    except Exception:
        pass


@app.post("/api/guild/{guild_id}/dev/webhooks/{wh_id}/test")
@require_auth
async def dev_test_webhook(request: Request, guild_id: str, wh_id: int):
    _require_dev_actor(request)
    row = _get_conn().execute("SELECT * FROM dev_webhooks WHERE id=? AND guild_id=?",
                              (int(wh_id), str(guild_id))).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Webhook not found")
    event = "test"
    try:
        payload = await request.json()
        if isinstance(payload, dict) and payload.get("event") in _WEBHOOK_EVENTS:
            event = payload["event"]
    except Exception:
        pass
    samples = {
        "link_blocked": {"action": "warned", "reason": "Fake Nitro scam link (test event)", "warn_count": 2},
        "member_kicked": {"action": "kicked", "reason": "Auto-kick: reached 5 warnings (test event)", "warn_count": 5},
        "member_banned": {"action": "banned", "reason": "Auto-ban: reached 8 warnings (test event)", "warn_count": 8},
        "member_timeout": {"action": "timeout", "reason": "Auto-timeout: reached 3 warnings (test event)", "warn_count": 3},
        "scamshield_catch": {"action": "banned", "reason": "Scam Shield: same message in 4 channels (test event)", "warn_count": 0},
        "raid_detected": {"action": "timeout", "reason": "Raid defense: mass-posted scam.example (test event)", "warn_count": 0},
        "test": {"action": "warned", "reason": "Test event from the Developer tab", "warn_count": 0},
    }
    status, ms = await _deliver_webhook(dict(row), event, {
        "user_id": "0", "username": "Link Protect", "channel_id": "0",
        **samples[event], "timestamp": int(time.time()),
    })
    _record_delivery(row["id"], status, guild_id, event, ms)
    return {"ok": 200 <= status < 300, "status": status, "durationMs": ms, "event": event}


@app.get("/api/guild/{guild_id}/dev/webhooks/{wh_id}/deliveries")
@require_auth
async def dev_webhook_deliveries(request: Request, guild_id: str, wh_id: int):
    _require_dev_actor(request)
    rows = _get_conn().execute(
        "SELECT * FROM dev_webhook_deliveries WHERE webhook_id=? AND guild_id=? "
        "ORDER BY id DESC LIMIT 50", (int(wh_id), str(guild_id))).fetchall()
    return {"deliveries": [{"id": r["id"], "event": r["event"], "status": r["status"],
                            "ok": bool(r["ok"]), "durationMs": r["duration_ms"],
                            "createdAt": r["created_at"]} for r in rows]}


def _classify_action_event(action: str, reason: str) -> str:
    r = (reason or "").lower()
    if r.startswith("scam shield"):
        return "scamshield_catch"
    if "raid" in r:
        return "raid_detected"
    return {"warned": "link_blocked", "kicked": "member_kicked",
            "banned": "member_banned", "timeout": "member_timeout"}.get(action, "link_blocked")


async def _webhook_dispatch_loop():
    """Watch the actions table and deliver subscribed events to dev webhooks —
    same cursor pattern as _action_push_loop, so the bot's cogs stay untouched."""
    try:
        row = _get_conn().execute("SELECT MAX(id) AS m FROM actions").fetchone()
        last = row["m"] or 0
    except Exception:
        last = 0
    while True:
        await asyncio.sleep(10)
        try:
            hooks_exist = _get_conn().execute(
                "SELECT COUNT(*) AS n FROM dev_webhooks WHERE enabled=1").fetchone()["n"]
            rows = _get_conn().execute(
                "SELECT * FROM actions WHERE id > ? ORDER BY id ASC LIMIT 100", (last,)).fetchall()
            if not rows:
                continue
            last = rows[-1]["id"]
            if not hooks_exist:
                continue  # cursor still advances, so old rows never flood later
            for r in rows:
                event = _classify_action_event(r["action"], r["reason"])
                hooks = _get_conn().execute(
                    "SELECT * FROM dev_webhooks WHERE guild_id=? AND enabled=1",
                    (str(r["guild_id"]),)).fetchall()
                for h in hooks:
                    try:
                        subscribed = json.loads(h["events"])
                    except Exception:
                        continue
                    if event not in subscribed:
                        continue
                    status, ms = await _deliver_webhook(dict(h), event, {
                        "user_id": str(r["user_id"]), "username": r["username"],
                        "channel_id": str(r["channel_id"]), "action": r["action"],
                        "reason": r["reason"], "warn_count": r["warn_count"],
                        "timestamp": r["timestamp"],
                    })
                    _record_delivery(h["id"], status, str(r["guild_id"]), event, ms)
        except Exception:
            pass


# ── Public v1 API (API-key auth — no internal secret) ────────────────────────

_v1_buckets: dict[int, dict] = {}
_V1_RATE = 60  # requests per minute per key


# Public sandbox: a fixed key everyone may use against synthetic data — lets
# developers try the API (and the docs playground) without owning a server.
SANDBOX_KEY = "lp_sandbox"
_SANDBOX_ROW = {"id": 0, "guild_id": "sandbox", "label": "Sandbox", "scopes": "read",
                "user_id": "0", "prefix": "lp_sandbox"}


def _v1_auth(request: Request, need: str = "read"):
    key = (request.headers.get("x-api-key") or "").strip()
    if not key:
        auth = request.headers.get("authorization") or ""
        if auth.lower().startswith("bearer "):
            key = auth[7:].strip()
    if not key:
        # EventSource can't set headers — the stream endpoint may pass ?key=.
        key = (request.query_params.get("key") or "").strip()
    if not key.startswith("lp_"):
        raise HTTPException(status_code=401, detail="Missing API key (X-Api-Key header)")
    now = time.time()
    if key == SANDBOX_KEY:
        ip = (request.client.host if request.client else "?")
        bkey = f"sb:{ip}"
        b = _v1_buckets.get(bkey)
        if not b or now > b["reset"]:
            _v1_buckets[bkey] = {"n": 1, "reset": now + 60}
        elif b["n"] >= _V1_RATE:
            raise HTTPException(status_code=429, detail="Sandbox rate limit exceeded")
        else:
            b["n"] += 1
        if need != "read":
            raise HTTPException(status_code=403, detail="The sandbox key is read-only")
        return dict(_SANDBOX_ROW)
    row = _get_conn().execute(
        "SELECT * FROM dev_api_keys WHERE key_hash=? AND revoked=0", (_hash_key(key),)).fetchone()
    if not row:
        raise HTTPException(status_code=401, detail="Invalid or revoked API key")
    if need not in _row_scopes(row):
        raise HTTPException(status_code=403,
                            detail=f"This key lacks the '{need}' scope — create one with it in the Developer tab")
    limit = _V1_RATE * 10 if _is_premium(str(row["guild_id"])) else _V1_RATE
    b = _v1_buckets.get(row["id"])
    if not b or now > b["reset"]:
        _v1_buckets[row["id"]] = {"n": 1, "reset": now + 60}
    else:
        b["n"] += 1
        if b["n"] > limit:
            raise HTTPException(status_code=429, detail=f"Rate limit exceeded ({limit} requests/minute)")
    try:
        c = _get_conn()
        c.execute("UPDATE dev_api_keys SET last_used=?, total_requests=total_requests+1 WHERE id=?",
                  (int(now), row["id"]))
        c.commit()
    except Exception:
        pass
    return row


def _sandbox_trends(days: int) -> dict:
    import math
    days = max(1, min(int(days or 14), 30))
    per_day = []
    for i in range(days):
        c = 3 + round(3 * math.sin(i / 2.4)) + (i % 3)
        d = _dt.date.today() - _dt.timedelta(days=days - 1 - i)
        per_day.append({"date": d.isoformat(), "warned": max(0, c - 2), "kicked": 1 if c > 5 else 0,
                        "banned": 1 if c > 6 else 0, "timeout": 1 if c > 4 else 0, "count": c,
                        "scamshield": 1 if i % 4 == 0 else 0, "raid": 1 if i % 9 == 0 else 0})
    return {"days": days, "total": sum(x["count"] for x in per_day), "perDay": per_day,
            "topReasons": [{"reason": "Fake Nitro scam links", "count": 12},
                           {"reason": "Scam Shield: cross-channel spam", "count": 8},
                           {"reason": "bit.ly / shortener links", "count": 5}]}


@app.get("/api/v1/stats")
async def v1_stats(request: Request):
    key = _v1_auth(request)
    gid = key["guild_id"]
    if gid == "sandbox":
        return {"guildId": "sandbox", "totalWarnings": 348, "warnedUsers": 57,
                "activeBlockers": 6,
                "blockers": {"malware": True, "nitro": True, "bit": True, "nsfw": True,
                             "invite": True, "gif": False, "youtube": False, "google": False,
                             "twitch": False, "steam": False, "all": False},
                "thresholds": {"kick": 5, "ban": 8, "timeout": 3}}
    data = _get_server(gid)
    if data is None:
        raise HTTPException(status_code=404, detail="Server not found (bot removed?)")
    warn_data = data.get("warn", {})
    total, users = 0, 0
    for uid, udata in warn_data.items():
        if uid in ("kick", "ban", "timeout"):
            continue
        if isinstance(udata, dict) and udata.get("Warn", 0) > 0:
            total += udata["Warn"]
            users += 1
    protect = data.get("protect", {}) or {}
    return {
        "guildId": str(gid),
        "totalWarnings": total,
        "warnedUsers": users,
        "activeBlockers": sum(1 for v in protect.values() if v),
        "blockers": {k: bool(v) for k, v in protect.items()},
        "thresholds": {"kick": warn_data.get("kick", 0), "ban": warn_data.get("ban", 0),
                       "timeout": (warn_data.get("timeout") or {}).get("warnings", 0)},
    }


@app.get("/api/v1/trends")
async def v1_trends(request: Request, days: int = 14):
    key = _v1_auth(request)
    if key["guild_id"] == "sandbox":
        return _sandbox_trends(days)
    return _trends_payload(key["guild_id"], days)


@app.get("/api/v1/check")
async def v1_check(request: Request, url: str = Query(default=""), deep: int = Query(default=0)):
    _v1_auth(request)
    return await _check_verdict(url, deep)




class V1BatchBody(BaseModel):
    urls: list[str]


@app.post("/api/v1/check/batch")
async def v1_check_batch(request: Request, body: V1BatchBody):
    """Up to 25 URLs per call, threat-DB + cached Safe Browsing (no deep resolve)."""
    _v1_auth(request)
    urls = [u for u in (body.urls or []) if isinstance(u, str) and u.strip()][:25]
    if not urls:
        raise HTTPException(status_code=400, detail="Provide urls: [] (max 25)")
    results = []
    for u in urls:
        try:
            results.append(await _check_verdict(u, 0))
        except HTTPException as e:
            results.append({"url": u, "error": e.detail})
    return {"count": len(results), "results": results}


class V1ModerateBody(BaseModel):
    userId: str
    action: str                    # warn | timeout | untimeout | kick | ban | unban
    reason: str | None = None
    minutes: int | None = None


@app.post("/api/v1/moderate")
async def v1_moderate(request: Request, body: V1ModerateBody):
    """Scope 'moderate': run a moderation action exactly like the dashboard does."""
    key = _v1_auth(request, need="moderate")
    gid = key["guild_id"]
    actor = f"API · {key['label'] or key['prefix']}"
    mb = ModerateBody(user_id=body.userId, action=body.action,
                      reason=(body.reason or "").strip()[:300] or None, minutes=body.minutes)
    result = await _do_moderate(gid, mb, actor_id=f"apikey:{key['id']}", actor_name=actor)
    _audit_record(gid, f"apikey:{key['id']}", actor, f"api.moderate.{body.action}",
                  f"{body.action} via API for user {body.userId}", None, body.reason)
    return result


@app.get("/api/v1/warns/{user_id}")
async def v1_user_warns(request: Request, user_id: str):
    key = _v1_auth(request)
    if key["guild_id"] == "sandbox":
        return {"userId": user_id, "warnings": 2,
                "reasons": ["Fake Nitro scam link", "bit.ly shortener link"], "timestamps": []}
    data = _get_server(key["guild_id"]) or {}
    u = (data.get("warn") or {}).get(str(user_id))
    if not isinstance(u, dict):
        return {"userId": str(user_id), "warnings": 0, "reasons": [], "timestamps": []}
    return {"userId": str(user_id), "warnings": int(u.get("Warn", 0) or 0),
            "reasons": u.get("reason") or [], "timestamps": u.get("ts") or []}


_V1_BLOCKERS = {"all", "google", "youtube", "nsfw", "gif", "invite",
                "twitch", "bit", "nitro", "steam", "malware"}


class V1BlockerBody(BaseModel):
    blocker: str
    enabled: bool


@app.post("/api/v1/blocker")
async def v1_blocker(request: Request, body: V1BlockerBody):
    """Scope 'config': toggle one link blocker."""
    key = _v1_auth(request, need="config")
    if body.blocker not in _V1_BLOCKERS:
        raise HTTPException(status_code=400, detail=f"Unknown blocker (one of {sorted(_V1_BLOCKERS)})")
    gid = key["guild_id"]
    data = _get_server(gid)
    if data is None:
        raise HTTPException(status_code=404, detail="Server not found")
    _deep_set(data, f"protect.{body.blocker}", bool(body.enabled))
    _save_server(gid, data)
    actor = f"API · {key['label'] or key['prefix']}"
    _audit_record(gid, f"apikey:{key['id']}", actor, f"protect.{body.blocker}",
                  f"{'Enabled' if body.enabled else 'Disabled'} {body.blocker} blocker via API",
                  None, body.enabled)
    return {"ok": True, "blocker": body.blocker, "enabled": bool(body.enabled)}


class V1BlacklistBody(BaseModel):
    action: str  # add | remove
    link: str


@app.post("/api/v1/blacklist")
async def v1_blacklist(request: Request, body: V1BlacklistBody):
    """Scope 'config': manage the server's custom blocked links."""
    key = _v1_auth(request, need="config")
    gid = key["guild_id"]
    data = _get_server(gid)
    if data is None:
        raise HTTPException(status_code=404, detail="Server not found")
    link = (body.link or "").strip()[:300]
    if not link or body.action not in ("add", "remove"):
        raise HTTPException(status_code=400, detail="action must be add|remove with a link")
    links = data.setdefault("link", {}).setdefault("links", [])
    if not isinstance(links, list):
        links = data["link"]["links"] = []
    if body.action == "add" and link not in links:
        links.append(link)
    if body.action == "remove" and link in links:
        links.remove(link)
    _save_server(gid, data)
    actor = f"API · {key['label'] or key['prefix']}"
    _audit_record(gid, f"apikey:{key['id']}", actor, f"blacklist.{body.action}",
                  f"{'Added' if body.action == 'add' else 'Removed'} blacklist via API: {link}",
                  None, link)
    return {"ok": True, "links": links}


class V1LockdownBody(BaseModel):
    active: bool
    reason: str | None = None


@app.post("/api/v1/lockdown")
async def v1_lockdown(request: Request, body: V1LockdownBody):
    """Scope 'config': trigger or lift the emergency lockdown."""
    key = _v1_auth(request, need="config")
    actor = f"API · {key['label'] or key['prefix']}"
    result = await _apply_lockdown(key["guild_id"], bool(body.active), body.reason, actor)
    _audit_record(key["guild_id"], f"apikey:{key['id']}", actor, "lockdown",
                  "🚨 Lockdown activated via API" if body.active else "✅ Lockdown lifted via API",
                  None, body.active)
    return result


_sse_conns: dict = {}


@app.get("/api/v1/events/stream")
async def v1_events_stream(request: Request):
    """SSE feed of moderation actions (auth via X-Api-Key or ?key=). Max 2
    concurrent streams per key, auto-closes after 30 minutes — reconnect."""
    key = _v1_auth(request)
    kid = key["id"]
    if _sse_conns.get(kid, 0) >= 2:
        raise HTTPException(status_code=429, detail="Max 2 concurrent streams per key")
    _sse_conns[kid] = _sse_conns.get(kid, 0) + 1
    gid = key["guild_id"]

    async def gen():
        try:
            started = time.monotonic()
            yield ": connected\n\n"
            if gid == "sandbox":
                i = 0
                while time.monotonic() - started < 1800:
                    await asyncio.sleep(8)
                    i += 1
                    ev = ["link_blocked", "scamshield_catch", "member_timeout"][i % 3]
                    data = {"user_id": "0", "username": "sandbox_user", "channel_id": "0",
                            "action": "warned", "reason": "Sandbox event", "warn_count": i % 6,
                            "timestamp": int(time.time())}
                    yield f"event: {ev}\ndata: {json.dumps(data)}\n\n"
                return
            row = _get_conn().execute(
                "SELECT MAX(id) AS m FROM actions WHERE guild_id=?", (int(gid),)).fetchone()
            last = row["m"] or 0
            beat = time.monotonic()
            while time.monotonic() - started < 1800:
                await asyncio.sleep(3)
                rows = _get_conn().execute(
                    "SELECT * FROM actions WHERE guild_id=? AND id>? ORDER BY id ASC LIMIT 50",
                    (int(gid), last)).fetchall()
                for r in rows:
                    last = r["id"]
                    ev = _classify_action_event(r["action"], r["reason"])
                    data = {"user_id": str(r["user_id"]), "username": r["username"],
                            "channel_id": str(r["channel_id"]), "action": r["action"],
                            "reason": r["reason"], "warn_count": r["warn_count"],
                            "timestamp": r["timestamp"]}
                    yield f"event: {ev}\ndata: {json.dumps(data)}\n\n"
                if time.monotonic() - beat > 15:
                    beat = time.monotonic()
                    yield ": ping\n\n"
        finally:
            _sse_conns[kid] = max(0, _sse_conns.get(kid, 1) - 1)

    return StreamingResponse(gen(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@app.get("/api/v1/openapi.json")
async def v1_openapi():
    """Hand-written spec for the public v1 surface (the docs playground uses it)."""
    def op(summary, scope="read", params=None, body=None):
        o = {"summary": summary, "security": [{"ApiKey": []}],
             "description": f"Requires scope: {scope}."}
        if params: o["parameters"] = params
        if body: o["requestBody"] = {"content": {"application/json": {"schema": body}}}
        return o
    q = lambda n, d, t="string": {"name": n, "in": "query", "description": d, "schema": {"type": t}}
    return {
        "openapi": "3.0.3",
        "info": {"title": "Link Protect API", "version": "1.1",
                 "description": "Read + write API for your server's protection. Auth: X-Api-Key. "
                                "Try it with the public sandbox key `lp_sandbox` (read-only)."},
        "servers": [{"url": "https://link-protect.com"}],
        "components": {"securitySchemes": {"ApiKey": {"type": "apiKey", "in": "header", "name": "X-Api-Key"}}},
        "paths": {
            "/api/v1/stats": {"get": op("Server protection stats")},
            "/api/v1/trends": {"get": op("Actions per day", params=[q("days", "1-30", "integer")])},
            "/api/v1/check": {"get": op("Check one URL", params=[q("url", "URL to check"), q("deep", "1 = follow redirects", "integer")])},
            "/api/v1/check/batch": {"post": op("Check up to 25 URLs", body={"type": "object", "properties": {"urls": {"type": "array", "items": {"type": "string"}}}})},
            "/api/v1/warns/{userId}": {"get": op("A member's warning record")},
            "/api/v1/moderate": {"post": op("Warn / timeout / kick / ban a member", scope="moderate",
                body={"type": "object", "properties": {"userId": {"type": "string"}, "action": {"type": "string", "enum": ["warn", "timeout", "untimeout", "kick", "ban", "unban"]}, "reason": {"type": "string"}, "minutes": {"type": "integer"}}})},
            "/api/v1/blocker": {"post": op("Toggle a link blocker", scope="config",
                body={"type": "object", "properties": {"blocker": {"type": "string"}, "enabled": {"type": "boolean"}}})},
            "/api/v1/blacklist": {"post": op("Add/remove a custom blocked link", scope="config",
                body={"type": "object", "properties": {"action": {"type": "string", "enum": ["add", "remove"]}, "link": {"type": "string"}}})},
            "/api/v1/lockdown": {"post": op("Trigger or lift the emergency lockdown", scope="config",
                body={"type": "object", "properties": {"active": {"type": "boolean"}, "reason": {"type": "string"}}})},
            "/api/v1/events/stream": {"get": op("SSE stream of live moderation events (also accepts ?key=)")},
        },
    }


@app.get("/api/mobile/admin/config")
async def mobile_get_admin_config(request: Request):
    await _require_admin(request)
    return {"lockCommands": _kv_get_bool(LOCK_COMMANDS_KEY)}


@app.post("/api/mobile/admin/config")
async def mobile_set_admin_config(request: Request, body: AdminConfigBody):
    await _require_admin(request)
    _kv_set(LOCK_COMMANDS_KEY, bool(body.lockCommands))
    return {"ok": True, "lockCommands": bool(body.lockCommands)}


_stats_cache: tuple[float, dict] | None = None
_STATS_TTL = 20.0

@app.get("/api/stats")
async def stats():
    """Public landing-page stats: live server count, users watched, and lifetime
    warned/kicked/banned totals. Cached briefly so traffic can't hammer the DB."""
    global _stats_cache
    now = time.monotonic()
    if _stats_cache and now - _stats_cache[0] < _STATS_TTL:
        return _stats_cache[1]

    # Lifetime action totals from the actions log (unaffected by warn resets).
    counts: dict[str, int] = {}
    try:
        for r in _get_conn().execute(
            "SELECT action, COUNT(*) AS c FROM actions GROUP BY action"
        ).fetchall():
            counts[r["action"]] = r["c"]
    except Exception:
        pass

    # Prefer the bot's own live counts (written by its heartbeat) — the true
    # number of guilds it's in. Fall back to Discord REST, then the DB.
    guild_count = _kv_int("bot:guild_count")
    watched = _kv_int("bot:member_count")
    if not guild_count:
        guild_count, watched = await _bot_total_members()
    if not guild_count:
        try:
            guild_count = _get_conn().execute("SELECT COUNT(*) AS c FROM servers").fetchone()["c"]
        except Exception:
            guild_count = 0

    payload = {
        "servers": guild_count,
        "watchedUsers": watched,
        "warned": counts.get("warned", 0),
        "kicked": counts.get("kicked", 0),
        "banned": counts.get("banned", 0),
        "timeouts": counts.get("timeout", 0),
    }
    _stats_cache = (now, payload)
    return payload


@app.get("/api/guilds")
@require_auth
async def get_guilds(request: Request):
    rows = _get_conn().execute("SELECT guild_id FROM servers").fetchall()
    return {"guilds": [str(r["guild_id"]) for r in rows]}


@app.get("/api/guild/{guild_id}")
@require_auth
async def get_guild(request: Request, guild_id: str):
    data = _get_server(guild_id)
    if data is None:
        raise HTTPException(status_code=404, detail="Guild not found")
    return {"data": _client_safe(data)}


@app.patch("/api/guild/{guild_id}")
@require_auth
async def patch_guild(request: Request, guild_id: str, body: PatchBody):
    # Whitelist of allowed paths to prevent arbitrary writes
    ALLOWED_PATHS = {
        "protect.google", "protect.youtube", "protect.nsfw", "protect.gif",
        "protect.invite", "protect.twitch", "protect.bit", "protect.nitro",
        "protect.all", "protect.steam", "protect.malware",
        "silent",
        "warn.kick", "warn.ban", "warn.timeout.warnings", "warn.timeout.time",
        "decay.enabled", "decay.days",
        "log.Activated", "log.log-channel", "log.link", "log.onlylink",
        "log.show.automod", "log.show.manual", "log.show.scamshield",
        "log.show.raid", "log.show.lockdown", "log.show.verify",
        "channel.channel", "channel.category", "channel.member", "channel.role",
        "link.links", "link.allow",
        "raid.enabled", "raid.threshold", "raid.window", "raid.timeout_minutes",
        "scamguard.enabled", "scamguard.channels", "scamguard.window",
        "scamguard.action", "scamguard.timeout_minutes",
        "scamguard.join_check", "scamguard.join_action", "scamguard.min_servers",
        "verify.enabled", "verify.role_mode", "verify.role_id",
        "verify.min_account_age_days",
        "verify.page.headline", "verify.page.message", "verify.page.accent",
        "log.digest",
        "messages.warn_channel", "messages.warn_manual", "messages.warn_dm",
        "messages.action_dm", "messages.verify_dm", "messages.lockdown_announce",
        "messages.accent",  # premium-gated below
    }
    if body.path not in ALLOWED_PATHS:
        raise HTTPException(status_code=400, detail=f"Path '{body.path}' is not allowed")
    if body.path == "messages.accent" and not _is_premium(guild_id):
        raise HTTPException(status_code=403, detail="Custom embed colors are a Premium feature")

    data = _get_server(guild_id)
    if data is None:
        raise HTTPException(status_code=404, detail="Guild not found")

    old = _deep_get(data, body.path)
    _deep_set(data, body.path, body.value)
    _save_server(guild_id, data)
    aid, aname = _web_actor(request)
    desc = _describe_change(body.path, body.value)
    _audit_record(guild_id, aid, aname, body.path, desc, old, body.value)
    _notify_settings_changed(guild_id, detail=desc, actor=aname)
    return {"ok": True, "path": body.path, "value": body.value}


@app.patch("/api/guild/{guild_id}/blacklist")
@require_auth
async def patch_blacklist(request: Request, guild_id: str, body: BlacklistBody):
    data = _get_server(guild_id)
    if data is None:
        raise HTTPException(status_code=404, detail="Guild not found")

    links: list = data.setdefault("link", {}).setdefault("links", [])
    if not isinstance(links, list):
        links = []
        data["link"]["links"] = links

    if body.action == "add":
        if body.link not in links:
            links.append(body.link)
    elif body.action == "remove":
        if body.link in links:
            links.remove(body.link)
    else:
        raise HTTPException(status_code=400, detail="action must be 'add' or 'remove'")

    _save_server(guild_id, data)
    aid, aname = _web_actor(request)
    desc = f"{'Added' if body.action == 'add' else 'Removed'} blacklist: {body.link}"
    _audit_record(guild_id, aid, aname, f"blacklist.{body.action}", desc, None, body.link)
    _notify_settings_changed(guild_id, detail=desc, actor=aname)
    return {"ok": True, "links": links}


@app.put("/api/guild/{guild_id}/override/{channel_id}")
@require_auth
async def set_channel_override(request: Request, guild_id: str, channel_id: str, body: OverrideBody):
    _apply_override(guild_id, channel_id, body)
    aid, aname = _web_actor(request)
    desc = f"Channel rule updated for #…{channel_id[-4:]}"
    _audit_record(guild_id, aid, aname, f"override.{channel_id}", desc, None, getattr(body, "mode", None))
    _notify_settings_changed(guild_id, detail=desc, actor=aname)
    return {"ok": True}


@app.delete("/api/guild/{guild_id}/override/{channel_id}")
@require_auth
async def delete_channel_override(request: Request, guild_id: str, channel_id: str):
    _remove_override(guild_id, channel_id)
    aid, aname = _web_actor(request)
    desc = f"Channel rule removed for #…{channel_id[-4:]}"
    _audit_record(guild_id, aid, aname, f"override.{channel_id}", desc, None, None)
    _notify_settings_changed(guild_id, detail=desc, actor=aname)
    return {"ok": True}


@app.get("/api/guild/{guild_id}/editors")
@require_auth
async def get_editors(request: Request, guild_id: str):
    return {"editors": await _resolve_users(_guild_editors(guild_id))}


@app.put("/api/guild/{guild_id}/editors")
@require_auth
async def put_editors(request: Request, guild_id: str, body: EditorsBody):
    saved = _set_guild_editors(guild_id, body.editors)
    aid, aname = _web_actor(request)
    desc = f"Team access updated ({len(saved)} member{'s' if len(saved) != 1 else ''})"
    _audit_record(guild_id, aid, aname, "editors", desc, None, saved)
    _notify_settings_changed(guild_id, detail=desc, actor=aname)
    return {"ok": True, "editors": await _resolve_users(saved)}


@app.get("/api/guild/{guild_id}/audit")
@require_auth
async def get_audit(request: Request, guild_id: str, limit: int = 100):
    """Per-guild settings audit (web — gated by the Next route's access check)."""
    return _audit_payload(guild_id, limit)


# ── Scam Shield (cross-server flagged-account intel) ──────────────────────────

def _ensure_flagged_tables():
    """Defensive: the bot creates these; guard against the API querying first."""
    c = _get_conn()
    c.execute("""CREATE TABLE IF NOT EXISTS flagged_users (
        user_id TEXT PRIMARY KEY,
        reason TEXT NOT NULL,
        incidents INTEGER NOT NULL DEFAULT 0,
        first_seen INTEGER NOT NULL,
        last_seen INTEGER NOT NULL
    )""")
    c.execute("""CREATE TABLE IF NOT EXISTS flagged_user_guilds (
        user_id TEXT NOT NULL,
        guild_id INTEGER NOT NULL,
        PRIMARY KEY (user_id, guild_id)
    )""")
    c.execute("""CREATE TABLE IF NOT EXISTS flag_evidence (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        guild_id INTEGER NOT NULL,
        content TEXT,
        attachments TEXT,
        channels INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL
    )""")
    c.execute("CREATE INDEX IF NOT EXISTS idx_evidence_user ON flag_evidence (user_id, id DESC)")
    c.commit()

_ensure_flagged_tables()


def _delete_flag(user_id: str) -> None:
    """Remove a flag network-wide — including the stored evidence (it exists
    only to review the flag, so it goes when the flag goes)."""
    c = _get_conn()
    c.execute("DELETE FROM flagged_users WHERE user_id=?", (str(user_id),))
    c.execute("DELETE FROM flagged_user_guilds WHERE user_id=?", (str(user_id),))
    c.execute("DELETE FROM flag_evidence WHERE user_id=?", (str(user_id),))
    c.commit()


@app.get("/api/admin/flag-evidence")
@require_auth
async def admin_flag_evidence(request: Request, users: str = ""):
    """Evidence (the offending messages) for up to 50 flagged user ids —
    powers the appeal review in the admin panel (Next route enforces admin)."""
    ids = [u.strip() for u in users.split(",") if u.strip()][:50]
    if not ids:
        return {"evidence": {}}
    c = _get_conn()
    out: dict = {}
    for uid in ids:
        rows = c.execute(
            "SELECT guild_id, content, attachments, channels, created_at "
            "FROM flag_evidence WHERE user_id=? ORDER BY id DESC LIMIT 5",
            (uid,),
        ).fetchall()
        out[uid] = [{
            "guildId": str(r["guild_id"]),
            "content": r["content"],
            "attachments": json.loads(r["attachments"] or "[]"),
            "channels": r["channels"],
            "createdAt": r["created_at"],
        } for r in rows]
    return {"evidence": out}


def _scamshield_stats_payload(guild_id: str) -> dict:
    c = _get_conn()
    total = c.execute("SELECT COUNT(*) AS c FROM flagged_users").fetchone()["c"]
    week = c.execute(
        "SELECT COUNT(*) AS c FROM flagged_users WHERE last_seen >= ?",
        (int(time.time()) - 7 * 86400,),
    ).fetchone()["c"]
    catches = c.execute(
        "SELECT COUNT(*) AS c FROM actions WHERE guild_id=? AND reason LIKE 'Scam Shield%'",
        (int(guild_id),),
    ).fetchone()["c"]
    return {"flaggedTotal": total, "flaggedWeek": week, "guildCatches": catches}


@app.get("/api/guild/{guild_id}/scamshield-stats")
@require_auth
async def scamshield_stats(request: Request, guild_id: str):
    """Network-wide flagged-account counts + this guild's Scam Shield catches."""
    return _scamshield_stats_payload(guild_id)


# ── Scam Shield: retroactive member scan ──────────────────────────────────────
# The join check only sees accounts AS they join. This scans the members already
# in a server against the flag DB, so scammers that sneaked in earlier (or never
# posted again) get caught too. Runs in the API server via Discord REST (needs
# the members intent, which the app has). Safe by construction: same threshold,
# owner/admin/whitelist exclusions and per-server action as the live join check,
# plus a hard cap so a bad flag list can never mass-remove a server.

_SCAN_MEMBER_CAP = 60000     # stop paginating past this (runaway guard)
_SCAN_REMOVE_CAP = 25        # never auto-remove more than this in one scan
_scan_inflight: set = set()  # guild ids currently scanning (no double-run)


@app.post("/api/guild/{guild_id}/scamshield/scan")
@require_auth
async def scamshield_scan(request: Request, guild_id: str):
    actor_id, actor_name = _web_actor(request)
    data = _get_server(guild_id)
    if data is None:
        raise HTTPException(status_code=404, detail="Guild not found")
    if not BOT_TOKEN:
        raise HTTPException(status_code=500, detail="Bot token not configured")
    if guild_id in _scan_inflight:
        raise HTTPException(status_code=409, detail="A scan is already running for this server.")

    sg = data.get("scamguard", {}) or {}
    min_servers = max(1, int(sg.get("min_servers", 2) or 2))
    action = "ban" if str(sg.get("join_action", "kick")).lower() == "ban" else "kick"

    flagged = {r["user_id"] for r in _get_conn().execute(
        "SELECT user_id FROM flagged_users").fetchall()}
    if not flagged:
        return {"membersScanned": 0, "flaggedFound": 0, "eligible": 0,
                "removed": 0, "failed": 0, "action": action, "removedUsers": []}

    ch = data.get("channel", {}) or {}
    wl_members = {str(x) for x in (ch.get("member") or [])}
    wl_roles = {str(x) for x in (ch.get("role") or [])}

    _scan_inflight.add(guild_id)
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            headers = {"Authorization": f"Bot {BOT_TOKEN}"}

            # Owner + which roles carry ADMINISTRATOR — never touch those members.
            owner_id = None
            admin_roles: set = set()
            try:
                gr = await client.get(f"{DISCORD_API}/guilds/{guild_id}", headers=headers)
                if gr.status_code == 200:
                    gj = gr.json()
                    owner_id = str(gj.get("owner_id") or "")
                    for role in gj.get("roles", []):
                        if int(role.get("permissions", 0)) & 0x8:  # ADMINISTRATOR
                            admin_roles.add(str(role["id"]))
            except Exception:
                pass

            # Paginate members (members intent required).
            scanned = 0
            matches = []            # (uid, name) eligible for removal
            after = "0"
            while scanned < _SCAN_MEMBER_CAP:
                resp = await client.get(
                    f"{DISCORD_API}/guilds/{guild_id}/members?limit=1000&after={after}",
                    headers=headers)
                if resp.status_code == 429:
                    await asyncio.sleep(float(resp.headers.get("Retry-After", "1")) + 0.3)
                    continue
                if resp.status_code != 200:
                    raise HTTPException(status_code=502,
                                        detail="Couldn't read the member list (is the members intent enabled?)")
                page = resp.json()
                if not page:
                    break
                for m in page:
                    scanned += 1
                    u = m.get("user") or {}
                    uid = str(u.get("id") or "")
                    if not uid or u.get("bot") or uid not in flagged:
                        continue
                    if uid == owner_id or uid in wl_members:
                        continue
                    mroles = {str(r) for r in (m.get("roles") or [])}
                    if mroles & admin_roles or mroles & wl_roles:
                        continue
                    flag = _flag_info(uid)
                    if not flag or int(flag.get("guilds", 0) or 0) < min_servers:
                        continue
                    name = u.get("global_name") or u.get("username") or uid
                    matches.append((uid, name))
                after = page[-1]["user"]["id"]
                if len(page) < 1000:
                    break
                await asyncio.sleep(0.25)  # gentle on the member-list rate limit

            eligible = len(matches)
            # Safety: a bad/poisoned flag list must never wipe a server.
            if eligible > _SCAN_REMOVE_CAP:
                _audit_record(guild_id, actor_id, actor_name, "scamshield.scan",
                              f"Scan aborted — {eligible} flagged members exceed the safety cap "
                              f"({_SCAN_REMOVE_CAP}); nothing removed.", None, None)
                return {"membersScanned": scanned, "flaggedFound": eligible, "eligible": eligible,
                        "removed": 0, "failed": 0, "action": action, "capped": True,
                        "cap": _SCAN_REMOVE_CAP, "removedUsers": []}

            removed, failed, removed_users = 0, 0, []
            for uid, name in matches:
                reason = (f"Scam Shield member scan: account flagged on "
                          f"{_flag_info(uid).get('guilds', '?')} servers in the network")
                ok, _detail = await _discord_mod_call(guild_id, uid, action, reason, 0)
                if ok:
                    removed += 1
                    removed_users.append({"userId": uid, "username": name})
                    _log_mod_action(guild_id, uid, name, _MOD_LOG_KIND[action], reason, 0)
                else:
                    failed += 1
                await asyncio.sleep(0.4)  # pace kicks/bans under Discord's limits

            desc = (f"Member scan by {actor_name or 'an admin'}: {scanned} scanned, "
                    f"{removed} removed ({action}), {failed} failed")
            _audit_record(guild_id, actor_id, actor_name, "scamshield.scan", desc, None, None)
            if removed:
                _notify_settings_changed(guild_id, detail=f"Scam Shield scan removed {removed} flagged account(s)",
                                         actor=actor_name)
            return {"membersScanned": scanned, "flaggedFound": eligible, "eligible": eligible,
                    "removed": removed, "failed": failed, "action": action,
                    "removedUsers": removed_users}
    finally:
        _scan_inflight.discard(guild_id)


@app.get("/api/admin/flagged")
@require_auth
async def admin_flagged(request: Request, limit: int = 100):
    """Operator view of flagged accounts, with resolved Discord names/avatars."""
    c = _get_conn()
    rows = c.execute(
        "SELECT f.user_id, f.reason, f.incidents, f.first_seen, f.last_seen, "
        "       (SELECT COUNT(*) FROM flagged_user_guilds g WHERE g.user_id = f.user_id) AS guilds "
        "FROM flagged_users f ORDER BY f.last_seen DESC LIMIT ?",
        (max(1, min(int(limit or 100), 500)),),
    ).fetchall()
    resolved = {u["id"]: u for u in await _resolve_users([r["user_id"] for r in rows])}
    return {"flagged": [
        {"userId": r["user_id"], "reason": r["reason"], "incidents": r["incidents"],
         "guilds": r["guilds"], "firstSeen": r["first_seen"], "lastSeen": r["last_seen"],
         "username": resolved.get(r["user_id"], {}).get("username"),
         "avatar": resolved.get(r["user_id"], {}).get("avatar")}
        for r in rows
    ]}


# 10-min cache for full Discord profiles (admin flagged-account inspector).
_profile_cache: dict = {}

# Guild-name fallback: _bot_guilds_info only knows guilds the bot is CURRENTLY
# in — for a guild it already left we fetch (and cache, misses included) once.
_guild_name_cache: dict = {}


async def _guild_names(gids: list, info: dict) -> dict:
    """{gid: name|None} using the bulk info first, then per-guild fallback."""
    out: dict = {}
    now = time.monotonic()
    for gid in dict.fromkeys(str(g) for g in gids):
        name = info.get(gid, {}).get("name")
        if name:
            out[gid] = name
            continue
        hit = _guild_name_cache.get(gid)
        if hit and now - hit[0] < 600:
            out[gid] = hit[1]
            continue
        name = None
        if BOT_TOKEN:
            try:
                async with httpx.AsyncClient() as client:
                    r = await client.get(f"{DISCORD_API}/guilds/{gid}",
                                         headers={"Authorization": f"Bot {BOT_TOKEN}"}, timeout=5)
                if r.status_code == 200:
                    name = r.json().get("name")
            except Exception:
                pass
        _guild_name_cache[gid] = (now, name)
        out[gid] = name
    return out


async def _discord_profile(user_id: str) -> dict | None:
    now = time.monotonic()
    hit = _profile_cache.get(user_id)
    if hit and now - hit[0] < 600:
        return hit[1]
    if not BOT_TOKEN:
        return None
    try:
        async with httpx.AsyncClient() as client:
            r = await client.get(f"{DISCORD_API}/users/{user_id}",
                                 headers={"Authorization": f"Bot {BOT_TOKEN}"}, timeout=6)
        if r.status_code != 200:
            return None
        u = r.json()
        prof = {
            "id": str(u["id"]),
            "username": u.get("username"),
            "globalName": u.get("global_name"),
            "avatar": u.get("avatar"),
            "bot": bool(u.get("bot")),
            "publicFlags": u.get("public_flags", 0),
            "banner": u.get("banner"),
            # Account age is the strongest bot/throwaway signal we have.
            "createdAt": ((int(user_id) >> 22) + 1420070400000) // 1000,
        }
        _profile_cache[user_id] = (now, prof)
        return prof
    except Exception:
        return None


@app.get("/api/admin/flagged/{user_id}/detail")
@require_auth
async def admin_flagged_detail(request: Request, user_id: str):
    """Everything we know about one account — works for unflagged ids too, so
    the admin search can inspect any user before/after removing a flag."""
    uid = str(user_id)
    c = _get_conn()
    row = c.execute(
        "SELECT reason, incidents, first_seen, last_seen FROM flagged_users WHERE user_id=?",
        (uid,),
    ).fetchone()
    flag = ({"reason": row["reason"], "incidents": row["incidents"],
             "firstSeen": row["first_seen"], "lastSeen": row["last_seen"]} if row else None)

    info = await _bot_guilds_info()
    gids = [str(r["guild_id"]) for r in c.execute(
        "SELECT guild_id FROM flagged_user_guilds WHERE user_id=?", (uid,)).fetchall()]
    ev_rows = c.execute(
        "SELECT guild_id, content, attachments, channels, created_at "
        "FROM flag_evidence WHERE user_id=? ORDER BY id DESC LIMIT 10", (uid,)).fetchall()
    act_rows = c.execute(
        "SELECT guild_id, action, reason, warn_count, timestamp FROM actions "
        "WHERE user_id=? ORDER BY id DESC LIMIT 50", (uid,)).fetchall()

    names = await _guild_names(
        gids + [r["guild_id"] for r in ev_rows] + [r["guild_id"] for r in act_rows], info)

    guilds = [{"id": g, "name": names.get(g),
               "icon": info.get(g, {}).get("icon")} for g in gids]

    evidence = [{
        "guildId": str(r["guild_id"]),
        "guildName": names.get(str(r["guild_id"])),
        "content": r["content"],
        "attachments": json.loads(r["attachments"] or "[]"),
        "channels": r["channels"],
        "createdAt": r["created_at"],
    } for r in ev_rows]

    actions = [{
        "guildId": str(r["guild_id"]),
        "guildName": names.get(str(r["guild_id"])),
        "action": r["action"], "reason": r["reason"],
        "warnCount": r["warn_count"], "timestamp": r["timestamp"],
    } for r in act_rows]

    appeals = [{
        "id": r["id"], "status": r["status"], "message": r["message"],
        "createdAt": r["created_at"],
    } for r in c.execute(
        "SELECT id, status, message, created_at FROM reports "
        "WHERE user_id=? AND type='appeal' ORDER BY id DESC LIMIT 10", (uid,)).fetchall()]

    return {"userId": uid, "flag": flag, "guilds": guilds, "evidence": evidence,
            "actions": actions, "appeals": appeals,
            "profile": await _discord_profile(uid)}


@app.delete("/api/admin/flagged/{user_id}")
@require_auth
async def admin_unflag(request: Request, user_id: str):
    """Remove a false-positive flag network-wide."""
    _delete_flag(user_id)
    return {"ok": True}


# ── Protection adoption stats (admin) ─────────────────────────────────────────
# How many servers have each protection enabled — with a daily history so
# adoption changes are visible as a chart. Snapshots are taken by a background
# task (and lazily on endpoint calls), one row per day per key.

_PROTECTION_KEYS = (
    "protect.all", "protect.nsfw", "protect.nitro", "protect.malware",
    "protect.invite", "protect.youtube", "protect.google", "protect.gif",
    "protect.twitch", "protect.steam", "protect.bit",
    "scamguard.enabled", "scamguard.join_check", "raid.enabled",
    "silent", "decay.enabled", "log.Activated", "verify.enabled",
)


def _ensure_protection_stats_table():
    c = _get_conn()
    c.execute("""CREATE TABLE IF NOT EXISTS protection_stats (
        day TEXT NOT NULL,
        key TEXT NOT NULL,
        count INTEGER NOT NULL,
        total INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (day, key)
    )""")
    c.commit()

_ensure_protection_stats_table()


def _compute_protection_counts() -> tuple[dict, int]:
    """One pass over all server configs → {key: enabled-count}, total servers."""
    c = _get_conn()
    counts = {k: 0 for k in _PROTECTION_KEYS}
    total = 0
    for (data_json,) in c.execute("SELECT data FROM servers").fetchall():
        try:
            data = json.loads(data_json)
        except Exception:
            continue
        total += 1
        for key in _PROTECTION_KEYS:
            if bool(_deep_get(data, key)):
                counts[key] += 1
    return counts, total


def _snapshot_protection_stats() -> tuple[dict, int]:
    counts, total = _compute_protection_counts()
    day = time.strftime("%Y-%m-%d", time.gmtime())
    c = _get_conn()
    for key, n in counts.items():
        c.execute(
            "INSERT INTO protection_stats(day, key, count, total) VALUES(?,?,?,?) "
            "ON CONFLICT(day, key) DO UPDATE SET count=excluded.count, total=excluded.total",
            (day, key, n, total),
        )
    c.commit()
    return counts, total


@app.on_event("startup")
async def _protection_stats_loop():
    async def loop():
        while True:
            try:
                await asyncio.to_thread(_snapshot_protection_stats)
            except Exception:
                pass
            await asyncio.sleep(6 * 3600)
    asyncio.get_event_loop().create_task(loop())


@app.get("/api/admin/protection-stats")
@require_auth
async def admin_protection_stats(request: Request, days: int = 90):
    counts, total = await asyncio.to_thread(_snapshot_protection_stats)
    since = time.strftime("%Y-%m-%d", time.gmtime(time.time() - max(7, min(int(days or 90), 365)) * 86400))
    rows = _get_conn().execute(
        "SELECT day, key, count, total FROM protection_stats WHERE day >= ? ORDER BY day",
        (since,),
    ).fetchall()
    history: dict = {}
    for r in rows:
        history.setdefault(r["day"], {"_total": r["total"]})[r["key"]] = r["count"]
    return {
        "current": counts,
        "totalServers": total,
        "history": [{"day": d, **v} for d, v in history.items()],
    }


@app.get("/api/user/{user_id}/editor-guilds")
@require_auth
async def user_editor_guilds(request: Request, user_id: str):
    """Guilds where `user_id` is a delegated dashboard editor (for server lists)."""
    info = await _bot_guilds_info()
    out = []
    for gid in _guilds_where_editor(user_id):
        data = _get_server(gid)
        gi = info.get(gid, {})
        out.append({
            "id": gid,
            "name": gi.get("name"),
            "icon": gi.get("icon"),
            "botPresent": True,
            "activeProtections": sum(1 for v in (data or {}).get("protect", {}).values() if v),
            "warnedUsers": _warned_user_count(data or {}),
        })
    return {"guilds": out}


@app.get("/api/guild/{guild_id}/stats")
@require_auth
async def guild_stats(request: Request, guild_id: str):
    data = _get_server(guild_id)
    if data is None:
        raise HTTPException(status_code=404, detail="Guild not found")

    warn_data = data.get("warn", {})
    total = 0
    users = []
    for uid, udata in warn_data.items():
        if uid in ("kick", "ban", "timeout"):
            continue
        if isinstance(udata, dict) and udata.get("Warn", 0) > 0:
            total += udata["Warn"]
            users.append({"userId": uid, "warnings": udata["Warn"], "reasons": udata.get("reason", [])})

    users.sort(key=lambda x: x["warnings"], reverse=True)
    return {
        "totalWarnings": total,
        "warnedUsers": len(users),
        "kickThreshold": warn_data.get("kick", 5),
        "banThreshold": warn_data.get("ban", 10),
        "topWarned": users[:10],
    }


@app.delete("/api/guild/{guild_id}/warns/{user_id}")
@require_auth
async def reset_user_warns(request: Request, guild_id: str, user_id: str):
    data = _get_server(guild_id)
    if data is None:
        raise HTTPException(status_code=404, detail="Guild not found")
    if user_id in data.get("warn", {}):
        del data["warn"][user_id]
        _save_server(guild_id, data)
    return {"ok": True}


# ── Remote moderation (warn / timeout / kick / ban from the web + app) ────────
# Live Discord actions go straight through the bot token (the API already proxies
# Discord REST elsewhere); warns are a DB mutation that mirrors the bot's
# cogs.shared.apply_warn so thresholds escalate identically. Every action is
# audit-logged with the acting moderator, and warn/timeout/kick/ban also land in
# the `actions` table — which drives the activity feed, trends, and the push loop.

_MOD_ACTIONS = {"warn", "timeout", "untimeout", "kick", "ban", "unban"}
_MOD_PAST = {"warn": "warned", "timeout": "timed out", "untimeout": "timeout removed",
             "kick": "kicked", "ban": "banned", "unban": "unbanned"}
# action → the kind string the activity feed / trends understand (un-actions excluded).
_MOD_LOG_KIND = {"warn": "warned", "timeout": "timeout", "kick": "kicked", "ban": "banned"}


def _log_mod_action(guild_id: str, user_id: str, username: str, kind: str,
                    reason: str, warn_count: int) -> None:
    """Append a row to the same `actions` table the bot writes to, capped at 200
    per guild (matches cogs.shared._log_action_sync)."""
    c = _get_conn()
    c.execute(
        "INSERT INTO actions (guild_id, user_id, username, channel_id, action, reason, warn_count, timestamp) "
        "VALUES (?,?,?,?,?,?,?,?)",
        (int(guild_id), user_id, username, "0", kind, reason, warn_count, int(time.time())),
    )
    c.execute(
        "DELETE FROM actions WHERE guild_id=? AND id NOT IN "
        "(SELECT id FROM actions WHERE guild_id=? ORDER BY id DESC LIMIT 200)",
        (int(guild_id), int(guild_id)),
    )
    c.commit()


async def _discord_mod_call(guild_id: str, user_id: str, action: str,
                            reason: str, minutes: int) -> tuple[bool, str]:
    """Perform a live Discord action with the bot token. Returns (ok, detail)."""
    if not BOT_TOKEN:
        return False, "Bot token not configured on the server."
    headers = {"Authorization": f"Bot {BOT_TOKEN}"}
    if reason:
        from urllib.parse import quote
        headers["X-Audit-Log-Reason"] = quote(reason[:400])
    base = f"{DISCORD_API}/guilds/{guild_id}"
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            if action == "kick":
                resp = await client.delete(f"{base}/members/{user_id}", headers=headers)
            elif action == "ban":
                resp = await client.put(f"{base}/bans/{user_id}", headers=headers, json={})
            elif action == "unban":
                resp = await client.delete(f"{base}/bans/{user_id}", headers=headers)
            elif action == "timeout":
                from datetime import datetime, timezone, timedelta
                until = (datetime.now(timezone.utc) + timedelta(minutes=max(1, minutes or 10))).isoformat()
                resp = await client.patch(f"{base}/members/{user_id}", headers=headers,
                                          json={"communication_disabled_until": until})
            elif action == "untimeout":
                resp = await client.patch(f"{base}/members/{user_id}", headers=headers,
                                          json={"communication_disabled_until": None})
            else:
                return False, f"Unknown action: {action}"
    except Exception:
        return False, "Couldn't reach Discord — please try again."
    if 200 <= resp.status_code < 300:
        return True, ""
    if resp.status_code == 403:
        return False, ("Discord refused this. Make sure Link Protect has the permission AND its "
                       "role sits above the member's roles — and note the server owner can't be actioned.")
    if resp.status_code == 404:
        return False, "That member isn't in the server (or isn't currently banned)."
    try:
        return False, resp.json().get("message") or "Discord rejected the action."
    except Exception:
        return False, "Discord rejected the action."


async def _do_moderate(guild_id: str, body: ModerateBody,
                       actor_id: str, actor_name: str | None) -> dict:
    action = (body.action or "").strip().lower()
    if action not in _MOD_ACTIONS:
        raise HTTPException(status_code=400, detail=f"Unknown action: {action}")
    user_id = (body.user_id or "").strip()
    if not user_id.isdigit():
        raise HTTPException(status_code=400, detail="Invalid user id")

    data = _get_server(guild_id)
    if data is None:
        raise HTTPException(status_code=404, detail="Guild not found")

    name = (body.username or "").strip() or user_id
    reason = (body.reason or "").strip()
    result: dict = {"ok": True, "action": action}

    if action == "warn":
        warn = data.setdefault("warn", {})
        ud = warn.get(user_id)
        if not isinstance(ud, dict):
            ud = {"Warn": 0, "reason": [], "ts": []}
        ud["Warn"] = int(ud.get("Warn", 0) or 0) + 1
        text = reason or f"Manual warning by {actor_name or 'a moderator'}"
        ud.setdefault("reason", []).append(text)
        now = int(time.time())
        ts = list(ud.get("ts", []) or [])
        while len(ts) < ud["Warn"] - 1:        # back-fill legacy entries (oldest first)
            ts.insert(0, now)
        ts.append(now)
        ud["ts"] = ts
        warn[user_id] = ud
        _save_server(guild_id, data)
        warn_count = ud["Warn"]
        result["warnCount"] = warn_count
        _log_mod_action(guild_id, user_id, name, "warned", text, warn_count)

        # Escalate exactly like the bot's on-message warn (ban > kick > timeout).
        kick_limit = int(warn.get("kick", 0) or 0)
        ban_limit = int(warn.get("ban", 0) or 0)
        tcfg = warn.get("timeout", {}) or {}
        timeout_warns = int(tcfg.get("warnings", 0) or 0)
        timeout_minutes = int(tcfg.get("time", 0) or 0)
        escalate = None
        if ban_limit and warn_count >= ban_limit:
            escalate = ("ban", 0)
        elif kick_limit and warn_count >= kick_limit:
            escalate = ("kick", 0)
        elif timeout_warns and warn_count >= timeout_warns:
            escalate = ("timeout", timeout_minutes or 10)
        if escalate:
            esc_action, esc_min = escalate
            ok, detail = await _discord_mod_call(
                guild_id, user_id, esc_action,
                f"Auto-{esc_action}: reached {warn_count} warnings", esc_min)
            if ok:
                result["escalated"] = esc_action
                kind = _MOD_LOG_KIND[esc_action]
                _log_mod_action(guild_id, user_id, name, kind,
                                f"Auto-{kind} (reached {warn_count} warnings)", warn_count)
            else:
                result["escalationError"] = detail
        desc = f"{name} warned (now {warn_count})"
        if result.get("escalated"):
            desc += f" → {_MOD_PAST[result['escalated']]}"
    else:
        ok, detail = await _discord_mod_call(guild_id, user_id, action, reason, body.minutes or 0)
        if not ok:
            raise HTTPException(status_code=400, detail=detail)
        warn_count = 0
        ud = (data.get("warn") or {}).get(user_id)
        if isinstance(ud, dict):
            warn_count = int(ud.get("Warn", 0) or 0)
        kind = _MOD_LOG_KIND.get(action)
        if kind:
            _log_mod_action(guild_id, user_id, name, kind,
                            reason or f"Manual {action} by {actor_name or 'a moderator'}", warn_count)
        desc = f"{name} {_MOD_PAST[action]}"

    if reason:
        desc += f" — {reason}"
    _audit_record(guild_id, actor_id, actor_name, f"moderate.{action}", desc, None, None)
    return result


@app.post("/api/guild/{guild_id}/moderate")
@require_auth
async def moderate_member(request: Request, guild_id: str, body: ModerateBody):
    aid, aname = _web_actor(request)
    return await _do_moderate(guild_id, body, aid, aname)


@app.get("/api/guild/{guild_id}/discord-info")
@require_auth
async def discord_guild_info(request: Request, guild_id: str):
    if not BOT_TOKEN:
        return {"id": guild_id, "name": guild_id, "icon": None}
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{DISCORD_API}/guilds/{guild_id}",
            headers={"Authorization": f"Bot {BOT_TOKEN}"},
            timeout=10,
        )
    if resp.status_code != 200:
        return {"id": guild_id, "name": guild_id, "icon": None}
    g = resp.json()
    return {"id": g["id"], "name": g["name"], "icon": g.get("icon")}


@app.get("/api/guilds/discord-info")
@require_auth
async def all_guilds_discord_info(request: Request):
    if not BOT_TOKEN:
        rows = _get_conn().execute("SELECT guild_id FROM servers").fetchall()
        return {"guilds": {str(r["guild_id"]): {"name": None, "icon": None} for r in rows}}

    # Single Discord call — GET /users/@me/guilds returns all bot guilds with name+icon
    async with httpx.AsyncClient() as client:
        try:
            resp = await client.get(
                f"{DISCORD_API}/users/@me/guilds?limit=200",
                headers={"Authorization": f"Bot {BOT_TOKEN}"},
                timeout=10,
            )
            if resp.status_code == 200:
                guilds = resp.json()
                return {"guilds": {g["id"]: {"name": g["name"], "icon": g.get("icon")} for g in guilds}}
        except Exception:
            pass
    return {"guilds": {}}


@app.get("/api/guild/{guild_id}/actions")
@require_auth
async def guild_actions(request: Request, guild_id: str, limit: int = 50):
    rows = _get_conn().execute(
        "SELECT user_id, username, channel_id, action, reason, warn_count, timestamp FROM actions WHERE guild_id=? ORDER BY timestamp DESC LIMIT ?",
        (int(guild_id), min(limit, 100)),
    ).fetchall()
    return {"actions": [dict(r) for r in rows]}


def _trends_payload(guild_id: str, days: int) -> dict:
    """Daily action counts (broken down by type) + top reasons — dashboard charts
    and the keyed /api/v1/trends."""
    from collections import Counter, defaultdict
    days = max(1, min(days, 60))
    now = int(time.time())
    since = now - days * 86400
    rows = _get_conn().execute(
        "SELECT action, reason, timestamp FROM actions WHERE guild_id=? AND timestamp>=?",
        (int(guild_id), since),
    ).fetchall()
    KINDS = ("warned", "kicked", "banned", "timeout")
    per_day: dict = defaultdict(lambda: {k: 0 for k in KINDS})
    # Event markers: days on which Scam Shield / raid protection fired (these
    # actions are already counted in their kind — markers are extra context).
    events: dict = defaultdict(lambda: {"scamshield": 0, "raid": 0})
    reasons: Counter = Counter()
    totals: Counter = Counter()
    for r in rows:
        day = time.strftime("%Y-%m-%d", time.gmtime(r["timestamp"]))
        act = r["action"] if r["action"] in KINDS else "warned"
        per_day[day][act] += 1
        totals[act] += 1
        reason = r["reason"] or ""
        if reason.startswith("Scam Shield"):
            events[day]["scamshield"] += 1
        elif "raid" in reason.lower():
            events[day]["raid"] += 1
        if reason:
            reasons[reason] += 1
    series = []
    for i in range(days - 1, -1, -1):
        day = time.strftime("%Y-%m-%d", time.gmtime(now - i * 86400))
        d = per_day.get(day)
        entry = {"date": day, **({k: 0 for k in KINDS} if d is None else d)}
        entry["count"] = sum(entry[k] for k in KINDS)
        ev = events.get(day)
        entry["scamshield"] = ev["scamshield"] if ev else 0
        entry["raid"] = ev["raid"] if ev else 0
        series.append(entry)
    return {
        "days": days, "total": len(rows),
        "perDay": series,
        "topReasons": [{"reason": k, "count": v} for k, v in reasons.most_common(6)],
        "totals": {k: totals[k] for k in KINDS},
    }


@app.get("/api/guild/{guild_id}/trends")
@require_auth
async def guild_trends(request: Request, guild_id: str, days: int = 14):
    return _trends_payload(guild_id, days)


class OverviewBody(BaseModel):
    ids: list[str]


@app.post("/api/guilds/overview")
@require_auth
async def guilds_overview(request: Request, body: OverviewBody):
    """Batch stats for the dashboard's all-servers overview + sparklines:
    one call instead of 2×N. The website filters ids to guilds the user
    actually manages before calling."""
    ids = [str(i) for i in (body.ids or []) if str(i).isdigit()][:50]
    if not ids:
        return {"guilds": {}}
    c = _get_conn()
    now = int(time.time())
    since = now - 7 * 86400
    ph = ",".join("?" * len(ids))
    rows = c.execute(
        f"SELECT guild_id, timestamp FROM actions WHERE guild_id IN ({ph}) AND timestamp>=?",
        (*[int(i) for i in ids], since),
    ).fetchall()
    per = {i: [0] * 7 for i in ids}
    today = {i: 0 for i in ids}
    day_start_today = now - (now % 86400)  # UTC day boundary
    for r in rows:
        gid = str(r["guild_id"])
        idx = min(6, max(0, (r["timestamp"] - since) // 86400))
        per[gid][idx] += 1
        if r["timestamp"] >= day_start_today:
            today[gid] += 1
    out = {}
    for gid in ids:
        data = _get_server(gid)
        tw = wu = ab = 0
        if data:
            warn = data.get("warn", {}) or {}
            for uid, ud in warn.items():
                if uid in ("kick", "ban", "timeout"):
                    continue
                if isinstance(ud, dict) and ud.get("Warn", 0) > 0:
                    tw += ud["Warn"]
                    wu += 1
            ab = sum(1 for v in (data.get("protect") or {}).values() if v)
        out[gid] = {"totalWarnings": tw, "warnedUsers": wu, "activeBlockers": ab,
                    "last7": per[gid], "today": today[gid], "known": data is not None}
    return {"guilds": out}


# ── Emergency lockdown + verification gate ───────────────────────────────────

BOT_CLIENT_ID = "888390889892892684"  # bot user id == application id
_LOCKDOWN_SLOWMODE = 30       # seconds applied to every text channel
_LOCKDOWN_CHANNEL_CAP = 75    # safety cap on channel edits per action
_PERM_ADMIN = 0x8
_PERM_MANAGE_GUILD = 0x20
_PERM_MANAGE_CHANNELS = 0x10
_PERM_MANAGE_ROLES = 0x10000000


def _ensure_verify_table():
    c = _get_conn()
    c.execute("""CREATE TABLE IF NOT EXISTS verifications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        guild_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        ts INTEGER NOT NULL
    )""")
    c.execute("CREATE INDEX IF NOT EXISTS idx_verifications_guild ON verifications (guild_id, ts DESC)")
    c.execute("""CREATE TABLE IF NOT EXISTS verify_backgrounds (
        guild_id TEXT PRIMARY KEY,
        data BLOB NOT NULL,
        mime TEXT NOT NULL,
        updated INTEGER NOT NULL
    )""")
    c.commit()

_ensure_verify_table()

_VERIFY_BG_MAX_BYTES = 1_500_000  # ~1.5 MB — the dashboard compresses client-side


def _sniff_image(raw: bytes) -> str | None:
    if raw[:3] == b"\xff\xd8\xff":
        return "image/jpeg"
    if raw[:8] == b"\x89PNG\r\n\x1a\n":
        return "image/png"
    if raw[:4] == b"RIFF" and raw[8:12] == b"WEBP":
        return "image/webp"
    return None


def _verify_bg_meta(guild_id: str) -> tuple[bool, int]:
    row = _get_conn().execute(
        "SELECT updated FROM verify_backgrounds WHERE guild_id=?", (str(guild_id),)).fetchone()
    return (row is not None, row["updated"] if row else 0)


_VERIFY_DEFAULT_PAGE = {
    "headline": "Verify to join the conversation",
    "message": "This server uses Link Protect to keep scam bots out. "
               "One click with your Discord account and you're in.",
    "accent": "#5865f2",
}


def _verify_cfg(data: dict | None) -> dict:
    v = (data or {}).get("verify") or {}
    page = {**_VERIFY_DEFAULT_PAGE, **(v.get("page") or {})}
    accent = str(page.get("accent") or "#5865f2")
    if not re.fullmatch(r"#[0-9a-fA-F]{6}", accent):
        accent = "#5865f2"
    return {
        "enabled": bool(v.get("enabled")),
        "role_mode": v.get("role_mode") if v.get("role_mode") in ("quarantine", "verified") else "verified",
        "role_id": str(v.get("role_id") or "") or None,
        "min_account_age_days": int(v.get("min_account_age_days") or 0),
        "page": {"headline": str(page["headline"])[:80] or _VERIFY_DEFAULT_PAGE["headline"],
                 "message": str(page["message"])[:400] or _VERIFY_DEFAULT_PAGE["message"],
                 "accent": accent},
    }


_BOT_HEADERS = None


def _bot_headers() -> dict:
    global _BOT_HEADERS
    if _BOT_HEADERS is None:
        _BOT_HEADERS = {"Authorization": f"Bot {BOT_TOKEN}"}
    return _BOT_HEADERS


def _log_show(guild_id: str, kind: str) -> bool:
    """Per-category warn-log filter (log.show.*). Everything defaults to on —
    except verifications, which are opt-in."""
    data = _get_server(guild_id) or {}
    show = (data.get("log") or {}).get("show") or {}
    return bool(show.get(kind, kind != "verify"))


async def _post_channel_embed(guild_id: str, title: str, description: str,
                              color: int = 0x5B6CFF, kind: str | None = None) -> None:
    """Best-effort embed into the guild's configured log channel."""
    if kind and not _log_show(guild_id, kind):
        return
    data = _get_server(guild_id)
    ch = (data or {}).get("log", {}).get("log-channel")
    if not ch or str(ch) == "0":
        return
    try:
        async with httpx.AsyncClient() as client:
            await client.post(
                f"{DISCORD_API}/channels/{ch}/messages", headers=_bot_headers(),
                json={"embeds": [{"title": title, "description": description, "color": color,
                                  "footer": {"text": "Link Protect • link-protect.com"}}]},
                timeout=8)
    except Exception:
        pass


async def _bot_guild_permissions(guild_id: str) -> tuple[int, int, list]:
    """(permission bits, bot's highest role position, all guild roles).
    Raises HTTPException(404) when the bot isn't in the guild."""
    async with httpx.AsyncClient() as client:
        g = await client.get(f"{DISCORD_API}/guilds/{guild_id}", headers=_bot_headers(), timeout=8)
        if g.status_code != 200:
            raise HTTPException(status_code=404, detail="Bot is not in this server")
        roles = g.json().get("roles", [])
        m = await client.get(f"{DISCORD_API}/guilds/{guild_id}/members/{BOT_CLIENT_ID}",
                             headers=_bot_headers(), timeout=8)
        if m.status_code != 200:
            raise HTTPException(status_code=404, detail="Bot member not found")
        member_role_ids = set(m.json().get("roles", []))
    perms = 0
    top_pos = 0
    for r in roles:
        if r["id"] == str(guild_id) or r["id"] in member_role_ids:  # @everyone + assigned
            try:
                perms |= int(r.get("permissions") or 0)
            except (TypeError, ValueError):
                pass
        if r["id"] in member_role_ids:
            top_pos = max(top_pos, int(r.get("position") or 0))
    return perms, top_pos, roles


def _lockdown_key(gid: str) -> str:
    return f"lockdown:{gid}"


def _lockdown_state(gid: str) -> dict:
    try:
        row = _get_conn().execute("SELECT value FROM kv WHERE path=?", (_lockdown_key(gid),)).fetchone()
        return json.loads(row["value"]) if row else {}
    except Exception:
        return {}


# ── Message Studio (must stay in sync with cogs/shared.py DEFAULT_MESSAGES) ──
_MESSAGE_DEFAULTS = {
    "warn_channel": "{user} — your message was removed.\n**Reason:** {reason}",
    "warn_manual": "{user} was warned by a moderator.\n**Reason:** {reason}",
    "warn_dm": "Your link in **{server}** was removed.\n**Reason:** {reason}",
    "action_dm": "You were **{action}** on **{server}** after reaching {warnings} warnings.",
    "verify_dm": "Welcome to **{server}**! Verify your account to unlock the server: {link}",
    "lockdown_announce": "🚨 **Emergency lockdown active.** Links are blocked and invites are "
                         "paused while the moderators handle the situation.",
}


def _render_guild_message(data: dict, key: str, **vars) -> str:
    tpl = ((data.get("messages") or {}).get(key) or "").strip() or _MESSAGE_DEFAULTS.get(key, "")
    out = tpl[:700]
    for name, val in vars.items():
        if val is not None:
            out = out.replace("{" + name + "}", str(val))
    return out


def _guild_accent(data: dict) -> int:
    raw = str((data.get("messages") or {}).get("accent") or "").lstrip("#")
    try:
        if len(raw) == 6:
            return int(raw, 16)
    except ValueError:
        pass
    return 0x5B6CFF


class MessageTestBody(BaseModel):
    kind: str


@app.post("/api/guild/{guild_id}/messages/test")
@require_auth
async def messages_test(request: Request, guild_id: str, body: MessageTestBody):
    """Send the acting dashboard user a DM previewing one of their templates."""
    if body.kind not in _MESSAGE_DEFAULTS:
        raise HTTPException(status_code=400, detail="Unknown template")
    aid, _ = _web_actor(request)
    if not aid:
        raise HTTPException(status_code=401, detail="No Discord account in session")
    data = _get_server(guild_id) or {}
    info = await _bot_guilds_info()
    gname = info.get(guild_id, {}).get("name") or "Your server"
    verify_link = f"https://link-protect.com/verify/{guild_id}"
    text = _render_guild_message(
        data, body.kind,
        user=f"<@{aid}>", username="you", server=gname,
        reason="Posted a phishing link (test)", warnings=3, remaining=2,
        channel="#general", action="kicked",
        link=verify_link)

    # Mirror the REAL embed the bot sends — title, fields, footer and buttons —
    # so the test never looks like the bot would drop parts of the message.
    embed: dict = {"description": text, "color": _guild_accent(data)}
    components: list = []

    def _link_btn(label: str, url: str):
        components.append({"type": 1, "components": [
            {"type": 2, "style": 5, "label": label, "url": url}]})

    warn_footer = "⚠️ 2 more warnings → you will be timed out for 20 min"
    if body.kind == "warn_channel":
        embed.update({"title": "🔗 Link Blocked", "color": 0xF0B232,
                      "fields": [{"name": "Total Warnings", "value": "**3** warning(s)"}],
                      "footer": {"text": warn_footer}})
    elif body.kind == "warn_manual":
        embed.update({"title": "⚠️ Warning issued", "color": 0xF0B232,
                      "fields": [{"name": "Total Warnings", "value": "**3** warning(s)"}],
                      "footer": {"text": warn_footer}})
    elif body.kind == "warn_dm":
        embed.update({"title": "🔗 Your link was removed", "color": 0xF0B232,
                      "fields": [{"name": "Total Warnings", "value": "**3** warning(s)"}],
                      "footer": {"text": warn_footer}})
    elif body.kind == "action_dm":
        embed.update({"color": 0xE0683C})
    elif body.kind == "verify_dm":
        embed.update({"title": f"Verify to unlock {gname}",
                      "footer": {"text": "Link Protect • link-protect.com"}})
        _link_btn("Verify now", verify_link)
    elif body.kind == "lockdown_announce":
        embed.update({"title": "🚨 Server lockdown activated", "color": 0xF23F43,
                      "description": text + "\n\nSlowmode on 12 channels · invites paused · "
                                            "all links blocked.\nLift it with /unlock or the dashboard."})

    payload: dict = {
        "content": f"-# Test preview of **{body.kind}** — sent from the dashboard, exactly as members would see it.",
        "embeds": [embed],
    }
    if components:
        payload["components"] = components

    async with httpx.AsyncClient() as client:
        dm = await client.post(f"{DISCORD_API}/users/@me/channels", headers=_bot_headers(),
                               json={"recipient_id": str(aid)}, timeout=8)
        if dm.status_code != 200:
            raise HTTPException(status_code=502, detail="Couldn't open a DM with you")
        r = await client.post(
            f"{DISCORD_API}/channels/{dm.json()['id']}/messages", headers=_bot_headers(),
            json=payload, timeout=8)
        if r.status_code not in (200, 201):
            raise HTTPException(status_code=502, detail="DM failed — are your DMs open?")
    return {"ok": True}


def _lockdown_payload(gid: str) -> dict:
    s = _lockdown_state(gid)
    return {"active": bool(s.get("active")), "since": s.get("since") or 0,
            "by": s.get("by"), "reason": s.get("reason"),
            "channelsLimited": len((s.get("prev") or {}).get("slowmode") or {})}


async def _apply_lockdown(gid: str, active: bool, reason: str | None, actor: str | None) -> dict:
    """Freeze / unfreeze a server: slowmode everywhere, invites paused, links
    blocked for everyone. Every step is best-effort and reported back."""
    state = _lockdown_state(gid)
    steps: dict = {"slowmode": 0, "invites": False, "links": False}
    async with httpx.AsyncClient() as client:
        if active:
            if state.get("active"):
                return {"ok": True, "alreadyActive": True, **_lockdown_payload(gid)}
            prev: dict = {"slowmode": {}, "invites_disabled": False, "protect_all": False}
            # 1) Slowmode on every text channel (keep faster ones' old value for restore)
            try:
                r = await client.get(f"{DISCORD_API}/guilds/{gid}/channels",
                                     headers=_bot_headers(), timeout=10)
                channels = [c for c in (r.json() if r.status_code == 200 else [])
                            if c.get("type") == 0][:_LOCKDOWN_CHANNEL_CAP]
                for c in channels:
                    old = int(c.get("rate_limit_per_user") or 0)
                    if old >= _LOCKDOWN_SLOWMODE:
                        continue
                    resp = await client.patch(
                        f"{DISCORD_API}/channels/{c['id']}", headers=_bot_headers(),
                        json={"rate_limit_per_user": _LOCKDOWN_SLOWMODE},
                        timeout=8)
                    if resp.status_code == 200:
                        prev["slowmode"][str(c["id"])] = old
                        steps["slowmode"] += 1
                    await asyncio.sleep(0.25)  # stay well under channel-edit rate limits
            except Exception:
                pass
            # 2) Pause invites
            try:
                g = await client.get(f"{DISCORD_API}/guilds/{gid}", headers=_bot_headers(), timeout=8)
                features = g.json().get("features", []) if g.status_code == 200 else []
                if "INVITES_DISABLED" not in features:
                    resp = await client.patch(
                        f"{DISCORD_API}/guilds/{gid}", headers=_bot_headers(),
                        json={"features": features + ["INVITES_DISABLED"]}, timeout=8)
                    if resp.status_code == 200:
                        prev["invites_disabled"] = True
                        steps["invites"] = True
            except Exception:
                pass
            # 3) Block all links (reuses the existing enforcement 1:1)
            data = _get_server(gid) or {}
            prev["protect_all"] = bool(_deep_get(data, "protect.all"))
            if not prev["protect_all"]:
                _deep_set(data, "protect.all", True)
                _save_server(gid, data)
                steps["links"] = True
            _kv_set(_lockdown_key(gid), {"active": True, "since": int(time.time()),
                                         "by": actor, "reason": (reason or "").strip()[:200] or None,
                                         "prev": prev})
            _ginfo = await _bot_guilds_info()
            await _post_channel_embed(
                gid, "🚨 Server lockdown activated",
                _render_guild_message(data, "lockdown_announce",
                                      server=_ginfo.get(gid, {}).get("name") or "this server")
                + "\n\n"
                f"{'By **' + actor + '**. ' if actor else ''}"
                f"{'Reason: ' + reason.strip()[:200] if reason and reason.strip() else ''}\n"
                f"Slowmode on {steps['slowmode']} channels · invites paused · all links blocked.\n"
                "Lift it with /unlock or the dashboard.", 0xF23F43, kind="lockdown")
        else:
            if not state.get("active"):
                return {"ok": True, "alreadyInactive": True, **_lockdown_payload(gid)}
            prev = state.get("prev") or {}
            # 1) Restore slowmode
            for cid, old in (prev.get("slowmode") or {}).items():
                try:
                    resp = await client.patch(f"{DISCORD_API}/channels/{cid}",
                                              headers=_bot_headers(),
                                              json={"rate_limit_per_user": int(old)}, timeout=8)
                    if resp.status_code == 200:
                        steps["slowmode"] += 1
                    await asyncio.sleep(0.25)
                except Exception:
                    pass
            # 2) Re-enable invites (only if the lockdown disabled them)
            if prev.get("invites_disabled"):
                try:
                    g = await client.get(f"{DISCORD_API}/guilds/{gid}", headers=_bot_headers(), timeout=8)
                    features = [f for f in g.json().get("features", []) if f != "INVITES_DISABLED"]
                    resp = await client.patch(f"{DISCORD_API}/guilds/{gid}", headers=_bot_headers(),
                                              json={"features": features}, timeout=8)
                    steps["invites"] = resp.status_code == 200
                except Exception:
                    pass
            # 3) Restore link blocking to what it was
            data = _get_server(gid) or {}
            if not prev.get("protect_all", False):
                _deep_set(data, "protect.all", False)
                _save_server(gid, data)
                steps["links"] = True
            try:
                c = _get_conn()
                c.execute("DELETE FROM kv WHERE path=?", (_lockdown_key(gid),))
                c.commit()
            except Exception:
                pass
            await _post_channel_embed(
                gid, "✅ Lockdown lifted",
                f"{'By **' + actor + '**. ' if actor else ''}"
                "Slowmode, invites and link rules are back to normal.", 0x23A55A, kind="lockdown")
    _invalidate(gid)
    return {"ok": True, "steps": steps, **_lockdown_payload(gid)}


class LockdownBody(BaseModel):
    active: bool
    reason: str | None = None


@app.get("/api/guild/{guild_id}/lockdown")
@require_auth
async def get_lockdown(request: Request, guild_id: str):
    return _lockdown_payload(guild_id)


@app.post("/api/guild/{guild_id}/lockdown")
@require_auth
async def set_lockdown(request: Request, guild_id: str, body: LockdownBody):
    aid, aname = _web_actor(request)
    result = await _apply_lockdown(guild_id, bool(body.active), body.reason, aname)
    _audit_record(guild_id, aid, aname, "lockdown",
                  "🚨 Lockdown activated" if body.active else "✅ Lockdown lifted",
                  None, body.active)
    return result


@app.get("/api/mobile/guild/{guild_id}/lockdown")
async def mobile_get_lockdown(request: Request, guild_id: str):
    await _require_access(request, guild_id)
    return _lockdown_payload(guild_id)


@app.post("/api/mobile/guild/{guild_id}/lockdown")
async def mobile_set_lockdown(request: Request, guild_id: str, body: LockdownBody):
    aid = await _require_access(request, guild_id)
    aname = await _mobile_actor_name(request)
    result = await _apply_lockdown(guild_id, bool(body.active), body.reason, aname)
    _audit_record(guild_id, aid, aname, "lockdown",
                  "🚨 Lockdown activated" if body.active else "✅ Lockdown lifted",
                  None, body.active)
    return result


# ── Link Protect Premium (Stripe) ────────────────────────────────────────────
# The website's Stripe webhook writes the state here; everything else only
# reads. kv premium:<gid> = {active, customerId, subscriptionId, until}.

_premium_cache: dict[str, tuple[float, bool]] = {}


def _premium_state(gid: str) -> dict:
    row = _get_conn().execute("SELECT value FROM kv WHERE path=?", (f"premium:{gid}",)).fetchone()
    try:
        d = json.loads(row["value"]) if row else {}
    except Exception:
        d = {}
    return d if isinstance(d, dict) else {}


def _is_premium(gid: str) -> bool:
    now = time.monotonic()
    hit = _premium_cache.get(str(gid))
    if hit and now - hit[0] < 60:
        return hit[1]
    st = _premium_state(str(gid))
    active = bool(st.get("active")) and (not st.get("until") or int(st["until"]) > time.time() - 86400)
    _premium_cache[str(gid)] = (now, active)
    return active


class PremiumSetBody(BaseModel):
    guildId: str
    active: bool
    customerId: str | None = None
    subscriptionId: str | None = None
    until: int | None = None


@app.post("/api/internal/premium")
@require_auth
async def internal_set_premium(request: Request, body: PremiumSetBody):
    _kv_set(f"premium:{body.guildId}", {"active": bool(body.active),
                                        "customerId": body.customerId,
                                        "subscriptionId": body.subscriptionId,
                                        "until": body.until, "updatedAt": int(time.time())})
    _premium_cache.pop(str(body.guildId), None)
    return {"ok": True}


@app.get("/api/guild/{guild_id}/premium")
@require_auth
async def get_premium(request: Request, guild_id: str):
    st = _premium_state(guild_id)
    return {"active": _is_premium(guild_id), "until": st.get("until"),
            "customerId": st.get("customerId")}


# ── Permission-failure alerts ────────────────────────────────────────────────
# The bot records refused kick/ban/timeout attempts in kv permfail:<gid>
# (see cogs/shared.py notify_action_failure). The dashboard shows a banner for
# every item newer than dismissedAt.

def _permfails_payload(guild_id: str) -> dict:
    row = _get_conn().execute(
        "SELECT value FROM kv WHERE path=?", (f"permfail:{guild_id}",)
    ).fetchone()
    try:
        data = json.loads(row["value"]) if row else {}
    except Exception:
        data = {}
    if not isinstance(data, dict):
        data = {}
    items = [i for i in (data.get("items") or []) if isinstance(i, dict)]
    return {"items": items, "dismissedAt": int(data.get("dismissedAt", 0) or 0)}


def _permfails_dismiss(guild_id: str) -> dict:
    data = _permfails_payload(guild_id)
    data["dismissedAt"] = int(time.time())
    c = _get_conn()
    c.execute(
        "INSERT INTO kv(path, value) VALUES(?, ?) "
        "ON CONFLICT(path) DO UPDATE SET value=excluded.value",
        (f"permfail:{guild_id}", json.dumps(data)),
    )
    c.commit()
    return {"ok": True, "dismissedAt": data["dismissedAt"]}


@app.get("/api/guild/{guild_id}/permfails")
@require_auth
async def get_permfails(request: Request, guild_id: str):
    return _permfails_payload(guild_id)


@app.post("/api/guild/{guild_id}/permfails/dismiss")
@require_auth
async def dismiss_permfails(request: Request, guild_id: str):
    return _permfails_dismiss(guild_id)


@app.get("/api/mobile/guild/{guild_id}/permfails")
async def mobile_get_permfails(request: Request, guild_id: str):
    await _require_access(request, guild_id)
    return _permfails_payload(guild_id)


@app.post("/api/mobile/guild/{guild_id}/permfails/dismiss")
async def mobile_dismiss_permfails(request: Request, guild_id: str):
    await _require_access(request, guild_id)
    return _permfails_dismiss(guild_id)


# ── Verification gate ────────────────────────────────────────────────────────

@app.get("/api/guild/{guild_id}/verify/public")
@require_auth
async def verify_public(request: Request, guild_id: str):
    """Everything the public /verify/<id> page needs — no member data."""
    data = _get_server(guild_id)
    cfg = _verify_cfg(data)
    info = (await _bot_guilds_info()).get(str(guild_id), {})
    has_bg, bg_ver = _verify_bg_meta(guild_id)
    return {"enabled": cfg["enabled"] and data is not None,
            "guildId": str(guild_id),
            "name": info.get("name"), "icon": info.get("icon"),
            "minAccountAgeDays": cfg["min_account_age_days"],
            "page": cfg["page"],
            "background": has_bg, "backgroundVersion": bg_ver}


class VerifyCompleteBody(BaseModel):
    userId: str


@app.post("/api/guild/{guild_id}/verify/complete")
@require_auth
async def verify_complete(request: Request, guild_id: str, body: VerifyCompleteBody):
    """Called by the website AFTER the user authenticated via Discord OAuth —
    userId is the verified session user, never client input."""
    uid = str(body.userId)
    if not uid.isdigit():
        raise HTTPException(status_code=400, detail="Invalid user")
    data = _get_server(guild_id)
    cfg = _verify_cfg(data)
    if not cfg["enabled"] or data is None:
        raise HTTPException(status_code=404, detail="Verification is not enabled here")

    # Account age straight from the snowflake — no extra API call.
    if cfg["min_account_age_days"] > 0:
        created_ms = (int(uid) >> 22) + 1420070400000
        age_days = (time.time() * 1000 - created_ms) / 86400000
        if age_days < cfg["min_account_age_days"]:
            wait = int(cfg["min_account_age_days"] - age_days) + 1
            return {"ok": False, "error": "too_young",
                    "detail": f"This server requires accounts older than "
                              f"{cfg['min_account_age_days']} days. Try again in ~{wait} day(s)."}

    async with httpx.AsyncClient() as client:
        m = await client.get(f"{DISCORD_API}/guilds/{guild_id}/members/{uid}",
                             headers=_bot_headers(), timeout=8)
        if m.status_code != 200:
            return {"ok": False, "error": "not_member",
                    "detail": "Join the server on Discord first, then verify here."}
        role_ok = True
        if cfg["role_id"]:
            if cfg["role_mode"] == "quarantine":
                r = await client.delete(
                    f"{DISCORD_API}/guilds/{guild_id}/members/{uid}/roles/{cfg['role_id']}",
                    headers=_bot_headers(), timeout=8)
            else:
                r = await client.put(
                    f"{DISCORD_API}/guilds/{guild_id}/members/{uid}/roles/{cfg['role_id']}",
                    headers=_bot_headers(), timeout=8)
            role_ok = r.status_code in (200, 204)
        if not role_ok:
            return {"ok": False, "error": "role_failed",
                    "detail": "I couldn't update your roles — the server's mods need to "
                              "check the bot's permissions."}

    try:
        c = _get_conn()
        c.execute("INSERT INTO verifications(guild_id, user_id, ts) VALUES(?,?,?)",
                  (str(guild_id), uid, int(time.time())))
        c.commit()
    except Exception:
        pass
    await _post_channel_embed(guild_id, "✅ Member verified",
                              f"<@{uid}> passed the verification gate.", 0x23A55A, kind="verify")
    return {"ok": True}


@app.get("/api/guild/{guild_id}/verify/health")
@require_auth
async def verify_health(request: Request, guild_id: str):
    return await _verify_health_payload(guild_id)


@app.get("/api/mobile/guild/{guild_id}/verify/health")
async def mobile_verify_health(request: Request, guild_id: str):
    await _require_access(request, guild_id)
    return await _verify_health_payload(guild_id)


async def _verify_health_payload(guild_id: str) -> dict:
    """Permission checklist: does the bot ACTUALLY have what the gate (and the
    lockdown button) need — and is the role hierarchy right?"""
    cfg = _verify_cfg(_get_server(guild_id))
    checks = []
    try:
        perms, top_pos, roles = await _bot_guild_permissions(guild_id)
    except HTTPException:
        return {"ok": False, "checks": [{"id": "bot", "ok": False,
                                         "label": "Bot is in this server",
                                         "detail": "Link Protect isn't a member of this server."}]}
    is_admin = bool(perms & _PERM_ADMIN)
    checks.append({"id": "manage_roles", "ok": is_admin or bool(perms & _PERM_MANAGE_ROLES),
                   "label": "Manage Roles permission",
                   "detail": "Needed to grant/remove the verification role."})
    checks.append({"id": "manage_channels", "ok": is_admin or bool(perms & _PERM_MANAGE_CHANNELS),
                   "label": "Manage Channels permission",
                   "detail": "Needed for lockdown slowmode."})
    checks.append({"id": "manage_guild", "ok": is_admin or bool(perms & _PERM_MANAGE_GUILD),
                   "label": "Manage Server permission",
                   "detail": "Needed to pause invites during a lockdown."})
    if cfg["role_id"]:
        role = next((r for r in roles if r["id"] == cfg["role_id"]), None)
        if role is None:
            checks.append({"id": "role_exists", "ok": False, "label": "Verification role exists",
                           "detail": "The configured role was deleted — pick a new one."})
        else:
            checks.append({"id": "role_exists", "ok": True, "label": "Verification role exists",
                           "detail": f"@{role.get('name', 'role')}"})
            checks.append({"id": "role_rank", "ok": top_pos > int(role.get("position") or 0),
                           "label": "Bot role ranks above the verification role",
                           "detail": "Drag the Link Protect role above it in Server Settings → Roles."})
    else:
        checks.append({"id": "role_set", "ok": not cfg["enabled"], "label": "Verification role configured",
                       "detail": "Pick the role the gate should remove or grant."})
    return {"ok": all(c["ok"] for c in checks), "checks": checks}


@app.get("/api/guild/{guild_id}/verify/stats")
@require_auth
async def verify_stats(request: Request, guild_id: str):
    return _verify_stats_payload(guild_id)


@app.get("/api/mobile/guild/{guild_id}/verify/stats")
async def mobile_verify_stats(request: Request, guild_id: str):
    await _require_access(request, guild_id)
    return _verify_stats_payload(guild_id)


def _verify_stats_payload(guild_id: str) -> dict:
    c = _get_conn()
    total = c.execute("SELECT COUNT(*) AS n FROM verifications WHERE guild_id=?",
                      (str(guild_id),)).fetchone()["n"]
    week = c.execute("SELECT COUNT(*) AS n FROM verifications WHERE guild_id=? AND ts>=?",
                     (str(guild_id), int(time.time()) - 7 * 86400)).fetchone()["n"]
    return {"total": total, "last7": week}


# ── One-click quarantine setup: role + channel locks + info channel ──────────

_PERM_VIEW_CHANNEL = 0x400
_PERM_SEND_MESSAGES = 0x800
_SETUP_CHANNEL_CAP = 150


class VerifySetupBody(BaseModel):
    roleName: str | None = None
    createInfoChannel: bool = True


async def _verify_setup_role(guild_id: str, body: VerifySetupBody, actor: str | None) -> dict:
    """Everything the user otherwise does by hand: ensure the quarantine role
    exists, deny VIEW_CHANNEL for it on every category & channel (preserving
    all other overwrite bits — idempotent, safe to re-run), optionally create a
    #verify info channel only that role can see, and switch the gate to
    quarantine mode."""
    data = _get_server(guild_id)
    if data is None:
        raise HTTPException(status_code=404, detail="Guild not found")
    cfg = _verify_cfg(data)
    name = (body.roleName or "").strip()[:80] or "Unverified"

    async with httpx.AsyncClient() as client:
        # 1) Role: reuse the configured one when it still exists, else create.
        g = await client.get(f"{DISCORD_API}/guilds/{guild_id}", headers=_bot_headers(), timeout=8)
        if g.status_code != 200:
            raise HTTPException(status_code=404, detail="Bot is not in this server")
        roles = {r["id"]: r for r in g.json().get("roles", [])}
        role = roles.get(cfg["role_id"]) if cfg["role_id"] else None
        created = False
        if role is None:
            r = await client.post(f"{DISCORD_API}/guilds/{guild_id}/roles", headers=_bot_headers(),
                                  json={"name": name, "permissions": "0", "mentionable": False,
                                        "color": 0x546E7A}, timeout=8)
            if r.status_code != 200:
                raise HTTPException(status_code=400,
                                    detail="Couldn't create the role — give me the Manage Roles permission.")
            role = r.json()
            created = True
        role_id = role["id"]

        # 2) Deny VIEW_CHANNEL on every category + channel (keep other bits).
        ch = await client.get(f"{DISCORD_API}/guilds/{guild_id}/channels", headers=_bot_headers(), timeout=10)
        channels = ch.json() if ch.status_code == 200 else []
        locked = skipped = failed = 0
        existing_verify_channel = next(
            (c for c in channels if c.get("type") == 0 and c.get("name") == "verify"), None)
        for c in channels[:_SETUP_CHANNEL_CAP]:
            if existing_verify_channel and c["id"] == existing_verify_channel["id"]:
                continue  # the info channel must stay visible to the role
            ow = next((o for o in c.get("permission_overwrites", [])
                       if o.get("id") == role_id), None)
            allow = int(ow["allow"]) if ow else 0
            deny = int(ow["deny"]) if ow else 0
            if deny & _PERM_VIEW_CHANNEL:
                skipped += 1
                continue
            resp = await client.put(
                f"{DISCORD_API}/channels/{c['id']}/permissions/{role_id}", headers=_bot_headers(),
                json={"type": 0, "allow": str(allow & ~_PERM_VIEW_CHANNEL),
                      "deny": str(deny | _PERM_VIEW_CHANNEL)}, timeout=8)
            if resp.status_code in (200, 204):
                locked += 1
            else:
                failed += 1
            await asyncio.sleep(0.2)  # stay well under per-channel rate limits

        # 3) Info channel: the ONLY thing unverified members can see, with the
        #    verify link — DMs may be closed, so this is their signpost.
        info_status = None
        if body.createInfoChannel:
            if existing_verify_channel:
                info_status = "existing"
            else:
                cr = await client.post(
                    f"{DISCORD_API}/guilds/{guild_id}/channels", headers=_bot_headers(),
                    json={"name": "verify", "type": 0, "topic": "Verify to unlock this server",
                          "permission_overwrites": [
                              {"id": str(guild_id), "type": 0, "deny": str(_PERM_VIEW_CHANNEL)},
                              {"id": role_id, "type": 0, "allow": str(_PERM_VIEW_CHANNEL),
                               "deny": str(_PERM_SEND_MESSAGES)},
                              {"id": BOT_CLIENT_ID, "type": 1,
                               "allow": str(_PERM_VIEW_CHANNEL | _PERM_SEND_MESSAGES)},
                          ]}, timeout=8)
                if cr.status_code in (200, 201):
                    info_status = "created"
                    try:
                        await client.post(
                            f"{DISCORD_API}/channels/{cr.json()['id']}/messages", headers=_bot_headers(),
                            json={"embeds": [{
                                "title": "👋 One step to unlock this server",
                                "description": f"**[Click here to verify]"
                                               f"(https://link-protect.com/verify/{guild_id})** — "
                                               "one click with your Discord account and you're in.",
                                "color": 0x5B6CFF,
                                "footer": {"text": "Link Protect • link-protect.com"}}]},
                            timeout=8)
                    except Exception:
                        pass

    # 4) Flip the gate to quarantine mode with this role.
    _deep_set(data, "verify.role_id", str(role_id))
    _deep_set(data, "verify.role_mode", "quarantine")
    _deep_set(data, "verify.enabled", True)
    _save_server(guild_id, data)
    _invalidate(guild_id)
    _audit_record(guild_id, None, actor, "verify.setup",
                  f"⚡ Verification auto-setup: @{role['name']} locked out of {locked} channels", None, None)
    return {"ok": True, "roleId": str(role_id), "roleName": role["name"], "roleCreated": created,
            "channelsLocked": locked, "channelsSkipped": skipped, "channelsFailed": failed,
            "infoChannel": info_status}


@app.post("/api/guild/{guild_id}/verify/setup-role")
@require_auth
async def verify_setup_role(request: Request, guild_id: str, body: VerifySetupBody):
    _, aname = _web_actor(request)
    return await _verify_setup_role(guild_id, body, aname)


@app.post("/api/mobile/guild/{guild_id}/verify/setup-role")
async def mobile_verify_setup_role(request: Request, guild_id: str, body: VerifySetupBody):
    await _require_access(request, guild_id)
    aname = await _mobile_actor_name(request)
    return await _verify_setup_role(guild_id, body, aname)


# ── Verification page background image (stored as a small blob) ──────────────

@app.get("/api/guild/{guild_id}/verify/background")
@require_auth
async def get_verify_background(request: Request, guild_id: str):
    row = _get_conn().execute(
        "SELECT data, mime FROM verify_backgrounds WHERE guild_id=?", (str(guild_id),)).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="No background")
    return Response(content=row["data"], media_type=row["mime"])


@app.put("/api/guild/{guild_id}/verify/background")
@require_auth
async def set_verify_background(request: Request, guild_id: str):
    raw = await request.body()
    if len(raw) > _VERIFY_BG_MAX_BYTES:
        raise HTTPException(status_code=413, detail="Image too large (max 1.5 MB)")
    mime = _sniff_image(raw)
    if not mime:
        raise HTTPException(status_code=400, detail="Only JPEG, PNG or WebP images")
    now = int(time.time())
    c = _get_conn()
    c.execute("INSERT INTO verify_backgrounds(guild_id, data, mime, updated) VALUES(?,?,?,?) "
              "ON CONFLICT(guild_id) DO UPDATE SET data=excluded.data, mime=excluded.mime, updated=excluded.updated",
              (str(guild_id), raw, mime, now))
    c.commit()
    aid, aname = _web_actor(request)
    _audit_record(guild_id, aid, aname, "verify.background", "🖼️ Verification page background updated", None, None)
    return {"ok": True, "version": now}


@app.delete("/api/guild/{guild_id}/verify/background")
@require_auth
async def delete_verify_background(request: Request, guild_id: str):
    c = _get_conn()
    c.execute("DELETE FROM verify_backgrounds WHERE guild_id=?", (str(guild_id),))
    c.commit()
    aid, aname = _web_actor(request)
    _audit_record(guild_id, aid, aname, "verify.background", "🖼️ Verification page background removed", None, None)
    return {"ok": True}


@app.get("/api/actions")
@require_auth
async def all_actions(request: Request, limit: int = Query(default=200)):
    rows = _get_conn().execute(
        "SELECT guild_id, user_id, username, channel_id, action, reason, warn_count, timestamp "
        "FROM actions ORDER BY timestamp DESC LIMIT ?",
        (min(limit, 500),)
    ).fetchall()
    return {"actions": [dict(r) for r in rows]}


@app.get("/api/admin/user/{user_id}")
@require_auth
async def admin_user_info(request: Request, user_id: str):
    # All actions for this user across all guilds
    rows = _get_conn().execute(
        "SELECT guild_id, action, reason, warn_count, timestamp FROM actions "
        "WHERE user_id=? ORDER BY timestamp DESC LIMIT 300",
        (user_id,)
    ).fetchall()
    actions = [dict(r) for r in rows]

    # Current warn state per guild from servers table
    guild_ids = list({str(r["guild_id"]) for r in rows})
    guild_warns: dict = {}
    for gid in guild_ids:
        row = _get_conn().execute("SELECT data FROM servers WHERE guild_id=?", (int(gid),)).fetchone()
        if row:
            data = json.loads(row["data"])
            udata = data.get("warn", {}).get(user_id)
            if isinstance(udata, dict):
                guild_warns[gid] = {"count": udata.get("Warn", 0), "reasons": udata.get("reason", [])}
            elif isinstance(udata, int):
                guild_warns[gid] = {"count": udata, "reasons": []}

    # Discord user profile via REST (no intents required)
    discord_user = None
    if BOT_TOKEN:
        async with httpx.AsyncClient() as client:
            try:
                resp = await client.get(
                    f"{DISCORD_API}/users/{user_id}",
                    headers={"Authorization": f"Bot {BOT_TOKEN}"},
                    timeout=5,
                )
                if resp.status_code == 200:
                    discord_user = resp.json()
            except Exception:
                pass

    return {"user_id": user_id, "discord": discord_user, "actions": actions, "guild_warns": guild_warns}


@app.get("/api/guild/{guild_id}/discord-channels")
@require_auth
async def discord_channels(request: Request, guild_id: str):
    if not BOT_TOKEN:
        raise HTTPException(status_code=503, detail="Bot token not configured")
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{DISCORD_API}/guilds/{guild_id}/channels",
            headers={"Authorization": f"Bot {BOT_TOKEN}"},
            timeout=10,
        )
    if resp.status_code != 200:
        raise HTTPException(status_code=502, detail="Discord API error")
    channels = resp.json()
    return {"channels": sorted([
        {"id": c["id"], "name": c["name"], "type": c["type"],
         "position": c.get("position", 0), "parent_id": c.get("parent_id")}
        for c in channels
    ], key=lambda c: c["position"])}


@app.get("/api/guild/{guild_id}/discord-roles")
@require_auth
async def discord_roles(request: Request, guild_id: str):
    if not BOT_TOKEN:
        raise HTTPException(status_code=503, detail="Bot token not configured")
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{DISCORD_API}/guilds/{guild_id}/roles",
            headers={"Authorization": f"Bot {BOT_TOKEN}"},
            timeout=10,
        )
    if resp.status_code != 200:
        raise HTTPException(status_code=502, detail="Discord API error")
    roles = resp.json()
    return {"roles": sorted([
        {"id": r["id"], "name": r["name"], "color": r["color"], "position": r["position"]}
        for r in roles if r["name"] != "@everyone"
    ], key=lambda r: -r["position"])}


@app.get("/api/guild/{guild_id}/discord-members/search")
@require_auth
async def discord_members_search(request: Request, guild_id: str, q: str = Query(default="")):
    if not BOT_TOKEN or len(q) < 1:
        return {"members": []}
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{DISCORD_API}/guilds/{guild_id}/members/search",
            params={"query": q, "limit": 25},
            headers={"Authorization": f"Bot {BOT_TOKEN}"},
            timeout=10,
        )
    if resp.status_code != 200:
        return {"members": []}
    members = resp.json()
    return {"members": [
        {"id": m["user"]["id"], "username": m["user"]["username"],
         "avatar": m["user"].get("avatar"), "nick": m.get("nick")}
        for m in members
    ]}


def _resolved_members(ids_csv: str) -> list:
    return [x for x in (ids_csv or "").split(",") if x.strip().isdigit()][:50]


async def _resolve_members_payload(ids_csv: str) -> dict:
    """Resolve a comma-separated list of user IDs to {id, username, avatar, nick}
    so whitelist chips can show names, not raw IDs. Username always non-null."""
    members = await _resolve_users(_resolved_members(ids_csv))
    for m in members:
        if not m.get("username"):
            m["username"] = "User " + str(m["id"])[-4:]
        m["nick"] = None
    return {"members": members}


@app.get("/api/guild/{guild_id}/discord-members/resolve")
@require_auth
async def discord_members_resolve(request: Request, guild_id: str, ids: str = Query(default="")):
    return await _resolve_members_payload(ids)


# ══════════════════════════════════════════════════════════════════════════════
#  MOBILE API  (/api/mobile/*)
#
#  The iOS app authenticates with the user's *Discord* access token (Bearer),
#  exactly mirroring the website's authorization: we validate the token against
#  Discord and require "Manage Server" on each guild. The Discord client secret
#  lives only here — the app performs the code exchange through us, never holds
#  it. This is what keeps the app a pure client of Discord (Guideline 4.8).
# ══════════════════════════════════════════════════════════════════════════════

# Token → (timestamp, value) caches keyed by the user's bearer token.
_user_cache: dict[str, tuple[float, dict]] = {}
_user_guilds_cache: dict[str, tuple[float, list]] = {}
_bot_guilds_cache: tuple[float, set] | None = None
_bot_guilds_info_cache: tuple[float, dict] | None = None
_bot_members_cache: tuple[float, tuple[int, int]] | None = None
_BOT_MEMBERS_TTL = 600.0
_USER_TTL = 60.0
_USER_GUILDS_TTL = 30.0
_BOT_GUILDS_TTL = 60.0

MOBILE_ALLOWED_PATHS = {
    "protect.google", "protect.youtube", "protect.nsfw", "protect.gif",
    "protect.invite", "protect.twitch", "protect.bit", "protect.nitro",
    "protect.all", "protect.steam", "protect.malware",
    "silent",
    "warn.kick", "warn.ban", "warn.timeout.warnings", "warn.timeout.time",
    "decay.enabled", "decay.days",
    "log.Activated", "log.log-channel", "log.link", "log.onlylink",
    "log.show.automod", "log.show.manual", "log.show.scamshield",
    "log.show.raid", "log.show.lockdown", "log.show.verify",
    "channel.channel", "channel.category", "channel.member", "channel.role",
    "link.links", "link.allow",
    "raid.enabled", "raid.threshold", "raid.window", "raid.timeout_minutes",
    "scamguard.enabled", "scamguard.channels", "scamguard.window",
    "scamguard.action", "scamguard.timeout_minutes",
    "scamguard.join_check", "scamguard.join_action", "scamguard.min_servers",
    "verify.enabled", "verify.role_mode", "verify.role_id",
    "verify.min_account_age_days",
    "verify.page.headline", "verify.page.message", "verify.page.accent",    "log.digest",
    "messages.warn_channel", "messages.warn_manual", "messages.warn_dm",
    "messages.action_dm", "messages.verify_dm", "messages.lockdown_announce",
    "messages.accent",
}


def _bearer(request: Request) -> str:
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing bearer token")
    return auth[7:]


async def _discord_user(token: str) -> dict:
    now = time.monotonic()
    cached = _user_cache.get(token)
    if cached and now - cached[0] < _USER_TTL:
        return cached[1]
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{DISCORD_API}/users/@me",
            headers={"Authorization": f"Bearer {token}"}, timeout=10,
        )
    if resp.status_code != 200:
        raise HTTPException(status_code=401, detail="Invalid or expired session")
    user = resp.json()
    _user_cache[token] = (now, user)
    return user


async def _user_managed_guilds(token: str) -> list[dict]:
    """Guilds where the user is owner or has Manage Server."""
    now = time.monotonic()
    cached = _user_guilds_cache.get(token)
    if cached and now - cached[0] < _USER_GUILDS_TTL:
        return cached[1]
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{DISCORD_API}/users/@me/guilds",
            headers={"Authorization": f"Bearer {token}"}, timeout=10,
        )
    if resp.status_code != 200:
        raise HTTPException(status_code=401, detail="Could not read your servers")
    managed = [
        g for g in resp.json()
        if g.get("owner") or (int(g.get("permissions", 0)) & MANAGE_GUILD)
    ]
    _user_guilds_cache[token] = (now, managed)
    return managed


async def _bot_guild_ids() -> set:
    """Set of every guild id the bot is in (derived from the paginated info)."""
    return set((await _bot_guilds_info()).keys())


def _guild_editors(guild_id: str) -> list:
    """Extra user IDs granted dashboard access for this guild (dashboard.editors)."""
    try:
        row = _get_conn().execute("SELECT data FROM servers WHERE guild_id=?", (int(guild_id),)).fetchone()
        if not row:
            return []
        dash = (json.loads(row["data"]).get("dashboard") or {})
        return [str(x) for x in (dash.get("editors") or [])]
    except Exception:
        return []


def _guilds_where_editor(user_id: str) -> list:
    """Guild IDs where `user_id` is a delegated dashboard editor."""
    try:
        rows = _get_conn().execute(
            "SELECT guild_id FROM servers WHERE EXISTS "
            "(SELECT 1 FROM json_each(json_extract(data, '$.dashboard.editors')) WHERE value = ?)",
            (str(user_id),),
        ).fetchall()
        return [str(r["guild_id"]) for r in rows]
    except Exception:
        return []


async def _require_manager(request: Request, guild_id: str) -> str:
    """User must OWN / have Manage Server on `guild_id` (or be super-admin).
    Used for actions delegated editors must NOT have — e.g. editing the team."""
    token = _bearer(request)
    user = await _discord_user(token)
    if user["id"] == ADMIN_USER_ID:
        return user["id"]
    guilds = await _user_managed_guilds(token)
    if not any(g["id"] == guild_id for g in guilds):
        raise HTTPException(status_code=403, detail="You don't manage this server")
    return user["id"]


async def _require_access(request: Request, guild_id: str) -> str:
    """User may view/change this guild's settings: owner / Manage Server,
    super-admin, OR a delegated dashboard editor (dashboard.editors)."""
    token = _bearer(request)
    user = await _discord_user(token)
    if user["id"] == ADMIN_USER_ID:
        return user["id"]
    guilds = await _user_managed_guilds(token)
    if any(g["id"] == guild_id for g in guilds):
        return user["id"]
    if user["id"] in _guild_editors(guild_id):
        return user["id"]
    raise HTTPException(status_code=403, detail="You don't have access to this server")


async def _require_admin(request: Request) -> str:
    """Allow only the super-admin."""
    user = await _discord_user(_bearer(request))
    if user["id"] != ADMIN_USER_ID:
        raise HTTPException(status_code=403, detail="Admin only")
    return user["id"]


async def _bot_guilds_info() -> dict:
    """{guild_id: {name, icon}} for **every** guild the bot is in.

    Discord caps `/users/@me/guilds` at 200 per page, so we paginate with the
    `after` cursor until exhausted — otherwise a bot in >200 servers would make
    everything past the first 200 look like "bot not in server". Cached 60s."""
    global _bot_guilds_info_cache
    now = time.monotonic()
    if _bot_guilds_info_cache and now - _bot_guilds_info_cache[0] < _BOT_GUILDS_TTL:
        return _bot_guilds_info_cache[1]
    info: dict = {}
    if BOT_TOKEN:
        after = None
        async with httpx.AsyncClient() as client:
            try:
                while True:
                    url = f"{DISCORD_API}/users/@me/guilds?limit=200"
                    if after:
                        url += f"&after={after}"
                    resp = await client.get(url, headers={"Authorization": f"Bot {BOT_TOKEN}"}, timeout=10)
                    if resp.status_code != 200:
                        break
                    batch = resp.json()
                    if not batch:
                        break
                    for g in batch:
                        info[g["id"]] = {"name": g["name"], "icon": g.get("icon")}
                    if len(batch) < 200:
                        break
                    after = batch[-1]["id"]
            except Exception:
                pass
    _bot_guilds_info_cache = (now, info)
    return info


async def _bot_total_members() -> tuple[int, int]:
    """(guild_count, total_members) across every guild the bot is in, via
    `with_counts`. Paginated and cached 10 min (member counts move slowly)."""
    global _bot_members_cache
    now = time.monotonic()
    if _bot_members_cache and now - _bot_members_cache[0] < _BOT_MEMBERS_TTL:
        return _bot_members_cache[1]
    guilds = 0
    members = 0
    if BOT_TOKEN:
        after = None
        async with httpx.AsyncClient() as client:
            try:
                while True:
                    url = f"{DISCORD_API}/users/@me/guilds?with_counts=true&limit=200"
                    if after:
                        url += f"&after={after}"
                    resp = await client.get(url, headers={"Authorization": f"Bot {BOT_TOKEN}"}, timeout=15)
                    if resp.status_code != 200:
                        break
                    batch = resp.json()
                    if not batch:
                        break
                    guilds += len(batch)
                    members += sum(int(g.get("approximate_member_count") or 0) for g in batch)
                    if len(batch) < 200:
                        break
                    after = batch[-1]["id"]
            except Exception:
                pass
    result = (guilds, members)
    _bot_members_cache = (now, result)
    return result


def _warned_user_count(data: dict) -> int:
    n = 0
    for uid, ud in data.get("warn", {}).items():
        if uid in ("kick", "ban", "timeout"):
            continue
        if isinstance(ud, dict) and ud.get("Warn", 0) > 0:
            n += 1
    return n


# ── OAuth (server-side code exchange) ─────────────────────────────────────────

class ExchangeBody(BaseModel):
    code: str
    code_verifier: str
    redirect_uri: str

class RefreshBody(BaseModel):
    refresh_token: str


async def _token_request(form: dict) -> dict:
    if not DISCORD_CLIENT_ID or not DISCORD_CLIENT_SECRET:
        raise HTTPException(status_code=500, detail="OAuth is not configured on the server")
    form |= {"client_id": DISCORD_CLIENT_ID, "client_secret": DISCORD_CLIENT_SECRET}
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                f"{DISCORD_API}/oauth2/token",
                data=form,
                headers={"Content-Type": "application/x-www-form-urlencoded"},
                timeout=10,
            )
    except httpx.HTTPError:
        # Transient network trouble — the app must NOT treat this as a dead
        # session (it would wipe its stored tokens and force a re-login).
        raise HTTPException(status_code=502, detail="Couldn't reach Discord — please try again.")
    if resp.status_code in (400, 401):
        # invalid_grant etc. — the code/refresh token is genuinely dead.
        raise HTTPException(status_code=401, detail="Discord rejected the sign-in")
    if resp.status_code != 200:
        raise HTTPException(status_code=502, detail="Discord is unavailable — please try again.")
    t = resp.json()
    return {
        "access_token": t["access_token"],
        "refresh_token": t.get("refresh_token", ""),
        "expires_in": t.get("expires_in", 604800),
    }


@app.post("/api/mobile/auth/exchange")
async def mobile_auth_exchange(body: ExchangeBody):
    return await _token_request({
        "grant_type": "authorization_code",
        "code": body.code,
        "redirect_uri": body.redirect_uri,
        "code_verifier": body.code_verifier,
    })


@app.post("/api/mobile/auth/refresh")
async def mobile_auth_refresh(body: RefreshBody):
    return await _token_request({
        "grant_type": "refresh_token",
        "refresh_token": body.refresh_token,
    })


# ── Identity & servers ────────────────────────────────────────────────────────

@app.get("/api/mobile/me")
async def mobile_me(request: Request):
    user = await _discord_user(_bearer(request))
    return {
        "id": user["id"],
        "username": user["username"],
        "global_name": user.get("global_name"),
        "avatar": user.get("avatar"),
    }


@app.get("/api/mobile/actions/recent")
async def mobile_recent_actions(request: Request, limit: int = 20):
    """Latest moderation actions across every guild the user manages — feeds
    the Apple Watch Activity tab with ONE call instead of per-guild polling."""
    token = _bearer(request)
    user = await _discord_user(token)
    managed = await _user_managed_guilds(token)
    ids = {g["id"] for g in managed} | set(_guilds_where_editor(user["id"]))
    ids = [i for i in ids if str(i).isdigit()][:100]
    if not ids:
        return {"actions": []}
    ph = ",".join("?" * len(ids))
    rows = _get_conn().execute(
        f"SELECT guild_id, user_id, username, action, reason, warn_count, timestamp "
        f"FROM actions WHERE guild_id IN ({ph}) ORDER BY id DESC LIMIT ?",
        (*[int(i) for i in ids], max(1, min(int(limit or 20), 50))),
    ).fetchall()
    info = await _bot_guilds_info()
    return {"actions": [{
        "guildId": str(r["guild_id"]),
        "guildName": info.get(str(r["guild_id"]), {}).get("name"),
        "userId": r["user_id"], "username": r["username"],
        "action": r["action"], "reason": r["reason"],
        "warnCount": r["warn_count"], "timestamp": r["timestamp"],
    } for r in rows]}


@app.get("/api/mobile/me/vote")
async def mobile_me_vote(request: Request):
    """Vote status for the signed-in user (watch Vote tab / app surfaces)."""
    user = await _discord_user(_bearer(request))
    return _vote_status(str(user["id"]))


@app.get("/api/mobile/guilds")
async def mobile_guilds(request: Request):
    """Every guild the user manages — including ones the bot isn't in yet, so the
    app can offer an invite. `botPresent` distinguishes the two."""
    token = _bearer(request)
    user = await _discord_user(token)  # validates the session
    managed = await _user_managed_guilds(token)
    # "Protected" == the server exists in the bot's DB (servers table) — the same
    # signal the website uses (getAllGuildIds). This is reliable; Discord's bot
    # guild list is not (intents / 200-page caps / propagation delays).
    db_ids = {str(r["guild_id"]) for r in _get_conn().execute("SELECT guild_id FROM servers").fetchall()}

    def _scam_catches(gid: str) -> int:
        try:
            return _get_conn().execute(
                "SELECT COUNT(*) AS c FROM actions WHERE guild_id=? AND reason LIKE 'Scam Shield%'",
                (int(gid),),
            ).fetchone()["c"]
        except Exception:
            return 0

    out = []
    seen: set = set()
    for g in managed:
        gid = g["id"]
        present = gid in db_ids
        data = _get_server(gid) if present else None
        protect = (data or {}).get("protect", {})
        out.append({
            "id": gid,
            "name": g["name"],
            "icon": g.get("icon"),
            "owner": bool(g.get("owner")),
            "botPresent": present,
            "activeProtections": sum(1 for v in protect.values() if v) if present else 0,
            "warnedUsers": _warned_user_count(data or {}) if present else 0,
            "scamCatches": _scam_catches(gid) if present else 0,
        })
        seen.add(gid)

    # Servers the user doesn't manage but was granted delegated access to.
    editor_ids = [gid for gid in _guilds_where_editor(user["id"]) if gid not in seen]
    if editor_ids:
        info = await _bot_guilds_info()
        for gid in editor_ids:
            data = _get_server(gid)
            protect = (data or {}).get("protect", {})
            gi = info.get(gid, {})
            out.append({
                "id": gid,
                "name": gi.get("name") or gid,
                "icon": gi.get("icon"),
                "owner": False,
                "botPresent": True,
                "activeProtections": sum(1 for v in protect.values() if v),
                "warnedUsers": _warned_user_count(data or {}),
                "scamCatches": _scam_catches(gid),
            })

    # Servers with the bot first, then alphabetical.
    out.sort(key=lambda x: (not x["botPresent"], x["name"].lower()))
    return {"guilds": out}


@app.get("/api/mobile/guild/{guild_id}")
async def mobile_guild(request: Request, guild_id: str):
    await _require_access(request, guild_id)
    data = _get_server(guild_id)
    if data is None:
        raise HTTPException(status_code=404, detail="Guild not found")
    return {"data": _client_safe(data)}


@app.get("/api/mobile/guild/{guild_id}/scamshield-stats")
async def mobile_scamshield_stats(request: Request, guild_id: str):
    await _require_access(request, guild_id)
    return _scamshield_stats_payload(guild_id)


@app.patch("/api/mobile/guild/{guild_id}")
async def mobile_patch_guild(request: Request, guild_id: str, body: PatchBody):
    actor_id = await _require_access(request, guild_id)
    if body.path not in MOBILE_ALLOWED_PATHS:
        raise HTTPException(status_code=400, detail=f"Path '{body.path}' is not allowed")
    data = _get_server(guild_id)
    if data is None:
        raise HTTPException(status_code=404, detail="Guild not found")
    user = await _discord_user(_bearer(request))
    aname = user.get("global_name") or user.get("username")
    old = _deep_get(data, body.path)
    _deep_set(data, body.path, body.value)
    _save_server(guild_id, data)
    desc = _describe_change(body.path, body.value)
    _audit_record(guild_id, actor_id, aname, body.path, desc, old, body.value)
    _notify_settings_changed(guild_id, detail=desc, actor=aname)
    return {"ok": True}


async def _mobile_actor_name(request: Request) -> str | None:
    try:
        user = await _discord_user(_bearer(request))
        return user.get("global_name") or user.get("username")
    except Exception:
        return None


@app.put("/api/mobile/guild/{guild_id}/override/{channel_id}")
async def mobile_set_override(request: Request, guild_id: str, channel_id: str, body: OverrideBody):
    uid = await _require_access(request, guild_id)
    _apply_override(guild_id, channel_id, body)
    aname = await _mobile_actor_name(request)
    desc = f"Channel rule updated for #…{channel_id[-4:]}"
    _audit_record(guild_id, uid, aname, f"override.{channel_id}", desc, None, getattr(body, "mode", None))
    _notify_settings_changed(guild_id, detail=desc, actor=aname)
    return {"ok": True}


@app.delete("/api/mobile/guild/{guild_id}/override/{channel_id}")
async def mobile_delete_override(request: Request, guild_id: str, channel_id: str):
    uid = await _require_access(request, guild_id)
    _remove_override(guild_id, channel_id)
    aname = await _mobile_actor_name(request)
    desc = f"Channel rule removed for #…{channel_id[-4:]}"
    _audit_record(guild_id, uid, aname, f"override.{channel_id}", desc, None, None)
    _notify_settings_changed(guild_id, detail=desc, actor=aname)
    return {"ok": True}


@app.get("/api/mobile/guild/{guild_id}/editors")
async def mobile_get_editors(request: Request, guild_id: str):
    await _require_access(request, guild_id)
    return {"editors": await _resolve_users(_guild_editors(guild_id))}


@app.put("/api/mobile/guild/{guild_id}/editors")
async def mobile_put_editors(request: Request, guild_id: str, body: EditorsBody):
    # Only owners / Manage Server can change the team — not delegated editors.
    uid = await _require_manager(request, guild_id)
    saved = _set_guild_editors(guild_id, body.editors)
    aname = await _mobile_actor_name(request)
    desc = f"Team access updated ({len(saved)} member{'s' if len(saved) != 1 else ''})"
    _audit_record(guild_id, uid, aname, "editors", desc, None, saved)
    _notify_settings_changed(guild_id, detail=desc, actor=aname)
    return {"ok": True, "editors": await _resolve_users(saved)}


@app.get("/api/mobile/guild/{guild_id}/audit")
async def mobile_get_audit(request: Request, guild_id: str, limit: int = 100):
    await _require_access(request, guild_id)
    return _audit_payload(guild_id, limit)


@app.delete("/api/mobile/guild/{guild_id}/warns/{user_id}")
async def mobile_reset_warns(request: Request, guild_id: str, user_id: str):
    await _require_access(request, guild_id)
    data = _get_server(guild_id)
    if data is None:
        raise HTTPException(status_code=404, detail="Guild not found")
    if user_id in data.get("warn", {}):
        del data["warn"][user_id]
        _save_server(guild_id, data)
    return {"ok": True}


@app.post("/api/mobile/guild/{guild_id}/moderate")
async def mobile_moderate_member(request: Request, guild_id: str, body: ModerateBody):
    uid = await _require_access(request, guild_id)
    aname = await _mobile_actor_name(request)
    return await _do_moderate(guild_id, body, uid, aname)


@app.get("/api/mobile/guild/{guild_id}/stats")
async def mobile_stats(request: Request, guild_id: str):
    await _require_access(request, guild_id)
    data = _get_server(guild_id)
    if data is None:
        raise HTTPException(status_code=404, detail="Guild not found")
    warn_data = data.get("warn", {})
    total, users = 0, []
    for uid, ud in warn_data.items():
        if uid in ("kick", "ban", "timeout"):
            continue
        if isinstance(ud, dict) and ud.get("Warn", 0) > 0:
            total += ud["Warn"]
            users.append({"userId": uid, "warnings": ud["Warn"], "reasons": ud.get("reason", [])})
    users.sort(key=lambda x: x["warnings"], reverse=True)
    return {
        "totalWarnings": total,
        "warnedUsers": len(users),
        "kickThreshold": warn_data.get("kick", 5),
        "banThreshold": warn_data.get("ban", 10),
        "topWarned": users[:10],
    }


@app.get("/api/mobile/guild/{guild_id}/actions")
async def mobile_actions(request: Request, guild_id: str, limit: int = 50):
    await _require_access(request, guild_id)
    rows = _get_conn().execute(
        "SELECT user_id, username, channel_id, action, reason, warn_count, timestamp "
        "FROM actions WHERE guild_id=? ORDER BY timestamp DESC LIMIT ?",
        (int(guild_id), min(limit, 100)),
    ).fetchall()
    return {"actions": [dict(r) for r in rows]}


@app.get("/api/mobile/guild/{guild_id}/trends")
async def mobile_trends(request: Request, guild_id: str, days: int = 14):
    """Daily action counts + top reasons for the last `days` days (for charts)."""
    await _require_access(request, guild_id)
    from collections import Counter, defaultdict
    days = max(1, min(days, 60))
    now = int(time.time())
    since = now - days * 86400
    rows = _get_conn().execute(
        "SELECT action, reason, timestamp FROM actions WHERE guild_id=? AND timestamp>=?",
        (int(guild_id), since),
    ).fetchall()
    per_day: dict[str, int] = defaultdict(int)
    reasons: Counter = Counter()
    for r in rows:
        day = time.strftime("%Y-%m-%d", time.gmtime(r["timestamp"]))
        per_day[day] += 1
        if r["reason"]:
            reasons[r["reason"]] += 1
    series = []
    for i in range(days - 1, -1, -1):
        day = time.strftime("%Y-%m-%d", time.gmtime(now - i * 86400))
        series.append({"date": day, "count": per_day.get(day, 0)})
    top = [{"reason": k, "count": v} for k, v in reasons.most_common(5)]
    return {"days": days, "total": len(rows), "perDay": series, "topReasons": top}


@app.get("/api/mobile/guild/{guild_id}/discord-channels")
async def mobile_channels(request: Request, guild_id: str):
    await _require_access(request, guild_id)
    if not BOT_TOKEN:
        raise HTTPException(status_code=503, detail="Bot token not configured")
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{DISCORD_API}/guilds/{guild_id}/channels",
            headers={"Authorization": f"Bot {BOT_TOKEN}"}, timeout=10,
        )
    if resp.status_code != 200:
        raise HTTPException(status_code=502, detail="Discord API error")
    return {"channels": sorted([
        {"id": c["id"], "name": c["name"], "type": c["type"],
         "position": c.get("position", 0), "parent_id": c.get("parent_id")}
        for c in resp.json()
    ], key=lambda c: c["position"])}


@app.get("/api/mobile/guild/{guild_id}/discord-roles")
async def mobile_roles(request: Request, guild_id: str):
    await _require_access(request, guild_id)
    if not BOT_TOKEN:
        raise HTTPException(status_code=503, detail="Bot token not configured")
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{DISCORD_API}/guilds/{guild_id}/roles",
            headers={"Authorization": f"Bot {BOT_TOKEN}"}, timeout=10,
        )
    if resp.status_code != 200:
        raise HTTPException(status_code=502, detail="Discord API error")
    return {"roles": sorted([
        {"id": r["id"], "name": r["name"], "color": r["color"], "position": r["position"]}
        for r in resp.json() if r["name"] != "@everyone"
    ], key=lambda r: -r["position"])}


@app.get("/api/mobile/guild/{guild_id}/discord-members/search")
async def mobile_members_search(request: Request, guild_id: str, q: str = Query(default="")):
    await _require_access(request, guild_id)
    if not BOT_TOKEN or len(q) < 1:
        return {"members": []}
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{DISCORD_API}/guilds/{guild_id}/members/search",
            params={"query": q, "limit": 25},
            headers={"Authorization": f"Bot {BOT_TOKEN}"}, timeout=10,
        )
    if resp.status_code != 200:
        return {"members": []}
    return {"members": [
        {"id": m["user"]["id"], "username": m["user"]["username"],
         "avatar": m["user"].get("avatar"), "nick": m.get("nick")}
        for m in resp.json()
    ]}


@app.get("/api/mobile/guild/{guild_id}/discord-members/resolve")
async def mobile_members_resolve(request: Request, guild_id: str, ids: str = Query(default="")):
    await _require_access(request, guild_id)
    return await _resolve_members_payload(ids)


# ── Admin (super-admin only) ──────────────────────────────────────────────────

@app.get("/api/mobile/admin/guilds")
async def mobile_admin_guilds(request: Request,
                              offset: int = Query(default=0),
                              limit: int = Query(default=30),
                              q: str = Query(default="")):
    """Paginated list of every server in the DB. Search (`q`) and paging happen
    server-side so the app never loads thousands of rows at once."""
    await _require_admin(request)
    ids = [str(r["guild_id"]) for r in _get_conn().execute("SELECT guild_id FROM servers").fetchall()]
    info = await _bot_guilds_info()
    full = [{"id": gid,
             "name": info.get(gid, {}).get("name"),
             "icon": info.get(gid, {}).get("icon")} for gid in ids]
    full.sort(key=lambda g: (g["name"] is None, (g["name"] or "").lower()))

    if q:
        ql = q.lower()
        full = [g for g in full if ql in (g["name"] or "").lower() or ql in g["id"]]

    total = len(full)
    limit = max(1, min(limit, 100))
    offset = max(0, offset)
    page = full[offset:offset + limit]
    return {"guilds": page, "total": total, "hasMore": offset + len(page) < total}


@app.get("/api/mobile/admin/actions")
async def mobile_admin_actions(request: Request, limit: int = Query(default=200)):
    await _require_admin(request)
    rows = _get_conn().execute(
        "SELECT guild_id, user_id, username, channel_id, action, reason, warn_count, timestamp "
        "FROM actions ORDER BY timestamp DESC LIMIT ?",
        (min(limit, 500),)
    ).fetchall()
    info = await _bot_guilds_info()  # resolve guild names/icons inline
    out = []
    for r in rows:
        d = dict(r)
        gi = info.get(str(d["guild_id"]), {})
        d["guild_name"] = gi.get("name")
        d["guild_icon"] = gi.get("icon")
        out.append(d)
    return {"actions": out}


@app.get("/api/mobile/admin/user/{user_id}")
async def mobile_admin_user(request: Request, user_id: str):
    await _require_admin(request)
    rows = _get_conn().execute(
        "SELECT guild_id, action, reason, warn_count, timestamp FROM actions "
        "WHERE user_id=? ORDER BY timestamp DESC LIMIT 300",
        (user_id,)
    ).fetchall()
    actions = [dict(r) for r in rows]

    guild_ids = list({str(r["guild_id"]) for r in rows})
    guild_warns: dict = {}
    for gid in guild_ids:
        row = _get_conn().execute("SELECT data FROM servers WHERE guild_id=?", (int(gid),)).fetchone()
        if row:
            data = json.loads(row["data"])
            udata = data.get("warn", {}).get(user_id)
            if isinstance(udata, dict):
                guild_warns[gid] = {"count": udata.get("Warn", 0), "reasons": udata.get("reason", [])}
            elif isinstance(udata, int):
                guild_warns[gid] = {"count": udata, "reasons": []}

    discord_user = None
    if BOT_TOKEN:
        async with httpx.AsyncClient() as client:
            try:
                resp = await client.get(
                    f"{DISCORD_API}/users/{user_id}",
                    headers={"Authorization": f"Bot {BOT_TOKEN}"}, timeout=5,
                )
                if resp.status_code == 200:
                    discord_user = resp.json()
            except Exception:
                pass

    # Names/icons for the guilds this user appears in (so the app needn't load all servers).
    info = await _bot_guilds_info()
    referenced = set(guild_ids) | set(guild_warns.keys())
    guild_info = {gid: {"name": info.get(gid, {}).get("name"), "icon": info.get(gid, {}).get("icon")}
                  for gid in referenced}

    return {"user_id": user_id, "discord": discord_user, "actions": actions,
            "guild_warns": guild_warns, "guild_info": guild_info}


# ── Push registration & delivery ──────────────────────────────────────────────

def _ensure_device_table():
    c = _get_conn()
    c.execute("""CREATE TABLE IF NOT EXISTS device_tokens (
        device_token TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        platform TEXT NOT NULL DEFAULT 'ios',
        bot_offline INTEGER NOT NULL DEFAULT 1,
        rule_triggered INTEGER NOT NULL DEFAULT 1,
        settings_changed INTEGER NOT NULL DEFAULT 0,
        guild_ids TEXT NOT NULL DEFAULT '[]',
        updated_at INTEGER NOT NULL
    )""")
    # Queue the bot writes when a server's config changes via a Discord command;
    # the api server polls it (the web/api edit path notifies in-process instead).
    c.execute("""CREATE TABLE IF NOT EXISTS push_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        guild_id TEXT NOT NULL,
        kind TEXT NOT NULL DEFAULT 'settings_changed',
        ts INTEGER NOT NULL
    )""")
    # Older registrations predate the Scam Shield alert type.
    try:
        c.execute("ALTER TABLE device_tokens ADD COLUMN scam_shield INTEGER NOT NULL DEFAULT 1")
    except sqlite3.OperationalError:
        pass
    c.commit()

_ensure_device_table()


class PushRegisterBody(BaseModel):
    device_token: str
    bot_offline: bool = True
    rule_triggered: bool = True
    settings_changed: bool = False
    scam_shield: bool = True
    guild_ids: list[str] = []
    platform: str = "ios"


@app.post("/api/mobile/push/register")
async def mobile_push_register(request: Request, body: PushRegisterBody):
    token = _bearer(request)
    user = await _discord_user(token)
    managed = {g["id"] for g in await _user_managed_guilds(token)}
    # Trust only guilds the user actually manages.
    verified = [gid for gid in body.guild_ids if gid in managed]
    # ONE connection handle for write + commit: a second _get_conn() call would
    # hit the stray-transaction guard and roll the pending INSERT back.
    c = _get_conn()
    c.execute(
        "INSERT INTO device_tokens(device_token, user_id, platform, bot_offline, rule_triggered, settings_changed, scam_shield, guild_ids, updated_at) "
        "VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(device_token) DO UPDATE SET "
        "user_id=excluded.user_id, platform=excluded.platform, bot_offline=excluded.bot_offline, "
        "rule_triggered=excluded.rule_triggered, settings_changed=excluded.settings_changed, "
        "scam_shield=excluded.scam_shield, guild_ids=excluded.guild_ids, updated_at=excluded.updated_at",
        (body.device_token, user["id"], body.platform, int(body.bot_offline),
         int(body.rule_triggered), int(body.settings_changed), int(body.scam_shield),
         json.dumps(verified), int(time.time())),
    )
    c.commit()
    return {"ok": True, "guilds": verified}


@app.post("/api/mobile/account/delete")
async def mobile_account_delete(request: Request):
    """Delete the data we hold for this user — their push-notification
    registrations. Per-server settings belong to the Discord server and are
    removed by removing the bot from that server."""
    user = await _discord_user(_bearer(request))
    conn = _get_conn()
    conn.execute("DELETE FROM device_tokens WHERE user_id=?", (user["id"],))
    conn.commit()
    return {"ok": True}


class NotifyBody(BaseModel):
    guild_id: str
    kind: str  # "bot_offline" | "rule_triggered" | "settings_changed" | "scam_shield"
    title: str
    body: str
    user_id: str | None = None      # affected member — enables push actions (ban)
    username: str | None = None
    category: str | None = None     # APNs category (LP_SCAM / LP_ACTION / …)


@app.post("/api/internal/notify")
@require_auth
async def internal_notify(request: Request, body: NotifyBody):
    """Called by the bot (shared-secret auth) to fan a push out to every device
    that manages `guild_id` and has the matching alert enabled."""
    pref_col = {
        "bot_offline": "bot_offline",
        "rule_triggered": "rule_triggered",
        "settings_changed": "settings_changed",
        "scam_shield": "scam_shield",
    }.get(body.kind)
    if not pref_col:
        raise HTTPException(status_code=400, detail="Unknown notification kind")

    rows = _get_conn().execute(
        f"SELECT device_token, guild_ids FROM device_tokens WHERE {pref_col}=1"
    ).fetchall()
    tokens = [r["device_token"] for r in rows if body.guild_id in json.loads(r["guild_ids"])]
    if not tokens:
        return {"sent": 0}

    try:
        from push_apns import apns
    except Exception:
        raise HTTPException(status_code=500, detail="Push not configured")

    custom = {"t": body.kind, "guild_id": body.guild_id}
    if body.user_id:
        custom["user_id"] = body.user_id
    if body.username:
        custom["username"] = body.username
    dead = await apns.send_many(tokens, body.title, body.body, thread_id=body.guild_id,
                                category=body.category, custom=custom)
    _prune(dead)
    return {"sent": len(tokens) - len(dead), "pruned": len(dead)}


# ── Bot status (heartbeat) ────────────────────────────────────────────────────

HEARTBEAT_STALE_SECONDS = 90

def _last_heartbeat() -> int:
    try:
        row = _get_conn().execute("SELECT value FROM kv WHERE path='bot:heartbeat'").fetchone()
        return int(row["value"]) if row else 0
    except Exception:
        return 0

def _bot_online() -> bool:
    return (time.time() - _last_heartbeat()) < HEARTBEAT_STALE_SECONDS


@app.get("/api/mobile/status")
async def mobile_status(request: Request):
    await _discord_user(_bearer(request))
    hb = _last_heartbeat()
    return {"botOnline": (time.time() - hb) < HEARTBEAT_STALE_SECONDS, "lastHeartbeat": hb}


# ── Push delivery helpers ─────────────────────────────────────────────────────

def _apns():
    try:
        from push_apns import apns
        return apns if apns.configured else None
    except Exception:
        return None

async def _push_to_guild(guild_id: str, pref_col: str, title: str, body: str,
                         category: str | None = None, custom: dict | None = None):
    apns = _apns()
    if not apns:
        return
    rows = _get_conn().execute(
        f"SELECT device_token, guild_ids FROM device_tokens WHERE {pref_col}=1"
    ).fetchall()
    tokens = [r["device_token"] for r in rows if guild_id in json.loads(r["guild_ids"])]
    if not tokens:
        return
    dead = await apns.send_many(tokens, title, body, thread_id=guild_id, category=category, custom=custom)
    _prune(dead)

async def _push_all(pref_col: str, title: str, body: str, category: str | None = None, custom: dict | None = None):
    apns = _apns()
    if not apns:
        return
    rows = _get_conn().execute(f"SELECT device_token FROM device_tokens WHERE {pref_col}=1").fetchall()
    tokens = [r["device_token"] for r in rows]
    if not tokens:
        return
    dead = await apns.send_many(tokens, title, body, category=category, custom=custom)
    _prune(dead)

def _prune(dead: list[str]):
    if not dead:
        return
    conn = _get_conn()
    for t in dead:
        conn.execute("DELETE FROM device_tokens WHERE device_token=?", (t,))
    conn.commit()

def _notify_settings_changed(guild_id: str, detail: str | None = None, actor: str | None = None):
    """Fire-and-forget push when a server's settings are edited. `detail` says
    WHAT changed; `actor` says who."""
    async def _run():
        info = await _bot_guilds_info()
        name = info.get(guild_id, {}).get("name") or "your server"
        if detail:
            body = f"{actor}: {detail}" if actor else detail
        else:
            body = f"Protection settings for {name} were updated."
        await _push_to_guild(guild_id, "settings_changed",
                             f"{name} · settings changed", body,
                             category="LP_SETTINGS", custom={"t": "settings", "guild_id": guild_id})
    try:
        asyncio.create_task(_run())
    except RuntimeError:
        pass


# ── Background loops (started on app startup) ──────────────────────────────────

async def _action_push_loop():
    """Watch the actions table and push 'rule triggered' alerts for new rows."""
    try:
        row = _get_conn().execute("SELECT MAX(id) AS m FROM actions").fetchone()
        last = row["m"] or 0
    except Exception:
        last = 0
    while True:
        await asyncio.sleep(8)
        if not _apns():
            continue
        try:
            rows = _get_conn().execute(
                "SELECT id, guild_id, user_id, username, action, reason FROM actions "
                "WHERE id > ? ORDER BY id ASC LIMIT 50", (last,)
            ).fetchall()
            if not rows:
                continue
            info = await _bot_guilds_info()
            for r in rows:
                last = r["id"]
                if (r["reason"] or "").startswith("Scam Shield"):
                    continue  # the Scam Shield cog sends its own richer push
                gid = str(r["guild_id"])
                gname = info.get(gid, {}).get("name") or "a server"
                verb = {"warned": "Warning", "kicked": "Kick", "banned": "Ban", "timeout": "Timeout"}.get(r["action"], "Action")
                await _push_to_guild(
                    gid, "rule_triggered",
                    f"{verb} · {gname}",
                    f"{r['username']}: {r['reason']}",
                    category="LP_ACTION",
                    custom={"t": "action", "guild_id": gid, "user_id": str(r["user_id"]),
                            "username": r["username"], "action": r["action"]},
                )
        except Exception:
            pass

async def _settings_push_loop():
    """Watch push_events (written by the bot when a server's config is changed
    via a Discord slash command) and fire a 'settings changed' push per guild.
    Web/dashboard edits notify in-process via _notify_settings_changed instead."""
    try:
        row = _get_conn().execute("SELECT MAX(id) AS m FROM push_events").fetchone()
        last = row["m"] or 0
    except Exception:
        last = 0
    while True:
        await asyncio.sleep(8)
        if not _apns():
            continue
        try:
            rows = _get_conn().execute(
                "SELECT id, guild_id FROM push_events WHERE id > ? AND kind='settings_changed' "
                "ORDER BY id ASC LIMIT 100", (last,)
            ).fetchall()
            if not rows:
                continue
            info = await _bot_guilds_info()
            seen: set[str] = set()
            for r in rows:
                last = r["id"]
                gid = str(r["guild_id"])
                if gid in seen:           # coalesce: one push per guild per batch
                    continue
                seen.add(gid)
                name = info.get(gid, {}).get("name") or "your server"
                await _push_to_guild(gid, "settings_changed",
                                     "Settings changed", f"Protection settings for {name} were updated.",
                                     category="LP_SETTINGS", custom={"t": "settings", "guild_id": gid})
        except Exception:
            pass

async def _bot_offline_loop():
    """Notify once when the bot transitions from online to offline."""
    was_online = _bot_online()
    while True:
        await asyncio.sleep(30)
        try:
            online = _bot_online()
            if was_online and not online:
                await _push_all("bot_offline", "Link Protect is offline",
                                "The bot stopped responding — protection may be paused.",
                                category="LP_BOT", custom={"t": "bot_offline"})
            was_online = online
        except Exception:
            pass


@app.on_event("startup")
async def _start_background_tasks():
    asyncio.create_task(_action_push_loop())
    asyncio.create_task(_bot_offline_loop())
    asyncio.create_task(_settings_push_loop())
    asyncio.create_task(_supporter_role_loop())
    asyncio.create_task(_webhook_dispatch_loop())


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=3001)
