"""
Link Protect — Bot API Server
Läuft auf demselben Server wie der Bot und gibt der Website Zugriff auf die SQLite-DB.
Start: uvicorn api_server:app --host 0.0.0.0 --port 3001
"""

import json
import os
import sqlite3
import threading
import time
from functools import wraps
from typing import Any

import httpx
from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# ── Config ──────────────────────────────────────────────────────────────────
DB_PATH = os.environ.get("BOT_DB_PATH", "bot.sqlite3")
API_SECRET = os.environ.get("BOT_API_SECRET", "change-me-in-production")
BOT_TOKEN = os.environ.get("BOT_TOKEN", "")
DISCORD_API = "https://discord.com/api/v10"
ALLOWED_ORIGINS = os.environ.get("ALLOWED_ORIGINS", "http://localhost:3000").split(",")

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
        conn.row_factory = sqlite3.Row
        _tls.conn = conn
    return _tls.conn

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

# ── Routes ───────────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/api/stats")
def stats():
    rows = _get_conn().execute("SELECT data FROM servers").fetchall()
    total_warnings = 0
    warned_users = 0
    for row in rows:
        try:
            data = json.loads(row["data"])
            for uid, udata in data.get("warn", {}).items():
                if uid in ("kick", "ban", "timeout"):
                    continue
                if isinstance(udata, dict) and udata.get("Warn", 0) > 0:
                    total_warnings += udata["Warn"]
                    warned_users += 1
        except Exception:
            pass
    return {
        "servers": len(rows),
        "warnings": total_warnings,
        "warnedUsers": warned_users,
    }


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
    return {"data": data}


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
        "log.Activated", "log.log-channel", "log.link", "log.onlylink",
        "channel.channel", "channel.category", "channel.member", "channel.role",
    }
    if body.path not in ALLOWED_PATHS:
        raise HTTPException(status_code=400, detail=f"Path '{body.path}' is not allowed")

    data = _get_server(guild_id)
    if data is None:
        raise HTTPException(status_code=404, detail="Guild not found")

    _deep_set(data, body.path, body.value)
    _save_server(guild_id, data)
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
    return {"ok": True, "links": links}


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


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=3001)
