"""
Link Protect — Bot API Server
Läuft auf demselben Server wie der Bot und gibt der Website Zugriff auf die SQLite-DB.
Start: uvicorn api_server:app --host 0.0.0.0 --port 3001
"""

import asyncio
import json
import os
import re
import sqlite3
import threading
import time
import traceback
from functools import wraps
from typing import Any

import httpx
from fastapi import FastAPI, HTTPException, Query, Request
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
    c.execute("CREATE INDEX IF NOT EXISTS idx_votes_month ON votes (month, monthly DESC)")
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
        protect = {k: bool(v) for k, v in (body.protect or {}).items() if k in PROTECT_KEYS}
        ov = {"mode": "custom", "protect": protect}
        if body.silent is not None:
            ov["silent"] = bool(body.silent)
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


async def _resolve_users(ids: list) -> list:
    """Best-effort {id, username, avatar} for each user id (for the team UI)."""
    out = []
    if not ids:
        return out
    if not BOT_TOKEN:
        return [{"id": str(i), "username": None, "avatar": None} for i in ids]
    async with httpx.AsyncClient() as client:
        for i in list(ids)[:50]:
            info = {"id": str(i), "username": None, "avatar": None}
            try:
                r = await client.get(f"{DISCORD_API}/users/{i}",
                                     headers={"Authorization": f"Bot {BOT_TOKEN}"}, timeout=5)
                if r.status_code == 200:
                    u = r.json()
                    info["username"] = u.get("global_name") or u.get("username")
                    info["avatar"] = u.get("avatar")
            except Exception:
                pass
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


@app.get("/api/check")
@require_auth
async def check_link(request: Request, url: str = Query(default="")):
    """Verdict for a single URL: our own threat DB first (free, instant), then a
    cached Google Safe Browsing lookup. Called by the website's public /api/check
    proxy (which adds rate limiting)."""
    raw = (url or "").strip()[:500]
    if not raw or "." not in raw:
        raise HTTPException(status_code=400, detail="Provide a url to check")
    domain = _domain_of(raw)
    if not domain or "." not in domain or len(domain) > 255:
        raise HTTPException(status_code=400, detail="That doesn't look like a valid link")

    c = _get_conn()
    ph = ",".join("?" * len(_CHECK_THREAT_CATS))
    hit = c.execute(
        f"SELECT category, source, hits FROM blocked_links "
        f"WHERE (url=? OR domain=?) AND category IN ({ph}) "
        f"ORDER BY hits DESC LIMIT 1",
        (raw, domain, *_CHECK_THREAT_CATS),
    ).fetchone()
    if hit:
        servers = c.execute(
            "SELECT COUNT(DISTINCT g.guild_id) AS n FROM blocked_link_guilds g "
            "JOIN blocked_links b ON b.url = g.url WHERE b.domain=?",
            (domain,),
        ).fetchone()
        return {
            "url": raw, "domain": domain, "safe": False,
            "category": hit["category"], "source": "threat-db",
            "reason": f"Flagged as {hit['category']} in the Link Protect threat database.",
            "seenOnServers": servers["n"] if servers else 0,
            "hits": hit["hits"] or 0,
        }

    seen = c.execute("SELECT hits FROM seen_domains WHERE domain=?", (domain,)).fetchone()
    circulating = seen["hits"] if seen else 0

    cached = c.execute("SELECT malicious FROM scanned_urls WHERE url=?", (raw,)).fetchone()
    if cached and cached["malicious"] is not None:
        malicious = bool(cached["malicious"])
    else:
        malicious = await _safe_browsing_unsafe(raw)
        try:
            c.execute(
                "INSERT INTO scanned_urls(url, domain, malicious, scanned_at) VALUES(?,?,?,?) "
                "ON CONFLICT(url) DO UPDATE SET malicious=excluded.malicious, scanned_at=excluded.scanned_at",
                (raw, domain, 1 if malicious else 0, int(time.time())),
            )
            c.commit()
        except Exception:
            pass

    if malicious:
        return {
            "url": raw, "domain": domain, "safe": False, "category": "malware",
            "source": "safe-browsing",
            "reason": "Google Safe Browsing flagged this link as dangerous.",
            "seenOnServers": 0, "hits": circulating,
        }
    return {
        "url": raw, "domain": domain, "safe": True, "category": None, "source": "clean",
        "reason": ("No threat on record." if not circulating
                   else "Seen circulating on Discord but not flagged as malicious."),
        "seenOnServers": 0, "hits": circulating,
    }


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
    row = c.execute("SELECT monthly, month FROM votes WHERE user_id=?", (str(user_id),)).fetchone()
    if row:
        monthly = (row["monthly"] + 1) if row["month"] == mk else 1
        c.execute("UPDATE votes SET last_voted=?, total=total+1, monthly=?, month=?, synced=? WHERE user_id=?",
                  (now, monthly, mk, synced, str(user_id)))
    else:
        c.execute("INSERT INTO votes(user_id, last_voted, total, monthly, month, synced) VALUES(?,?,1,1,?,?)",
                  (str(user_id), now, mk, synced))
    c.commit()


def _vote_status(user_id: str) -> dict:
    c = _get_conn()
    now = int(time.time())
    mk = _month_key()
    row = c.execute("SELECT last_voted, total, monthly, month, synced FROM votes WHERE user_id=?", (str(user_id),)).fetchone()
    if not row:
        return {"hasVoted": False, "lastVoted": 0, "canVoteAt": now, "synced": False,
                "total": 0, "monthly": 0, "rank": None, "supporter": False}
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
    rows = _get_conn().execute(
        "SELECT user_id, monthly, total, last_voted FROM votes "
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
        })
    payload = {"month": mk, "leaderboard": board, "limit": limit}
    _lb_cache = (now, payload)
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


def _flags_key(user_id: str) -> str:
    return f"user:{user_id}:flags"


def _get_flags(user_id: str) -> dict:
    try:
        row = _get_conn().execute("SELECT value FROM kv WHERE path=?", (_flags_key(user_id),)).fetchone()
        return json.loads(row["value"]) if row else {}
    except Exception:
        return {}


@app.get("/api/user/{user_id}/flags")
@require_auth
async def get_user_flags(request: Request, user_id: str):
    return {"tourSeen": bool(_get_flags(user_id).get("tourSeen"))}


@app.post("/api/user/{user_id}/flags")
@require_auth
async def set_user_flags(request: Request, user_id: str, body: UserFlagsBody):
    flags = _get_flags(user_id)
    if body.tourSeen is not None:
        flags["tourSeen"] = bool(body.tourSeen)
    _kv_set(_flags_key(user_id), flags)
    return {"tourSeen": bool(flags.get("tourSeen"))}


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
        "channel.channel", "channel.category", "channel.member", "channel.role",
        "link.links", "link.allow",
        "raid.enabled", "raid.threshold", "raid.window", "raid.timeout_minutes",
        "scamguard.enabled", "scamguard.channels", "scamguard.window",
        "scamguard.action", "scamguard.timeout_minutes",
        "scamguard.join_check", "scamguard.join_action", "scamguard.min_servers",
    }
    if body.path not in ALLOWED_PATHS:
        raise HTTPException(status_code=400, detail=f"Path '{body.path}' is not allowed")

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


@app.get("/api/admin/flagged")
@require_auth
async def admin_flagged(request: Request, limit: int = 100):
    """Operator view of flagged accounts (false-positive handling)."""
    c = _get_conn()
    rows = c.execute(
        "SELECT f.user_id, f.reason, f.incidents, f.first_seen, f.last_seen, "
        "       (SELECT COUNT(*) FROM flagged_user_guilds g WHERE g.user_id = f.user_id) AS guilds "
        "FROM flagged_users f ORDER BY f.last_seen DESC LIMIT ?",
        (max(1, min(int(limit or 100), 500)),),
    ).fetchall()
    return {"flagged": [
        {"userId": r["user_id"], "reason": r["reason"], "incidents": r["incidents"],
         "guilds": r["guilds"], "firstSeen": r["first_seen"], "lastSeen": r["last_seen"]}
        for r in rows
    ]}


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
    "silent", "decay.enabled", "log.Activated",
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


@app.get("/api/guild/{guild_id}/trends")
@require_auth
async def guild_trends(request: Request, guild_id: str, days: int = 14):
    """Daily action counts (broken down by type) + top reasons, for dashboard charts."""
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
    reasons: Counter = Counter()
    totals: Counter = Counter()
    for r in rows:
        day = time.strftime("%Y-%m-%d", time.gmtime(r["timestamp"]))
        act = r["action"] if r["action"] in KINDS else "warned"
        per_day[day][act] += 1
        totals[act] += 1
        if r["reason"]:
            reasons[r["reason"]] += 1
    series = []
    for i in range(days - 1, -1, -1):
        day = time.strftime("%Y-%m-%d", time.gmtime(now - i * 86400))
        d = per_day.get(day)
        entry = {"date": day, **({k: 0 for k in KINDS} if d is None else d)}
        entry["count"] = sum(entry[k] for k in KINDS)
        series.append(entry)
    return {
        "days": days, "total": len(rows),
        "perDay": series,
        "topReasons": [{"reason": k, "count": v} for k, v in reasons.most_common(6)],
        "totals": {k: totals[k] for k in KINDS},
    }


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
    "channel.channel", "channel.category", "channel.member", "channel.role",
    "link.links", "link.allow",
    "raid.enabled", "raid.threshold", "raid.window", "raid.timeout_minutes",
    "scamguard.enabled", "scamguard.channels", "scamguard.window",
    "scamguard.action", "scamguard.timeout_minutes",
    "scamguard.join_check", "scamguard.join_action", "scamguard.min_servers",
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


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=3001)
