"""
Shared DB layer + TTL settings cache for all cogs.
- Thread-local SQLite connections (no new connection per call)
- 5-second in-memory cache so all 14 on_message handlers share one DB read
"""

import asyncio
import json
import os
import re
import sqlite3
import threading
import time
import unicodedata

_BASE_DIR = os.path.dirname(os.path.abspath(__file__))
_DB_PATH = os.path.join(_BASE_DIR, "..", "bot.sqlite3")

_tls = threading.local()

def _get_conn() -> sqlite3.Connection:
    if not hasattr(_tls, "conn"):
        conn = sqlite3.connect(_DB_PATH, check_same_thread=False)
        conn.execute("PRAGMA journal_mode=WAL;")
        conn.execute("PRAGMA synchronous=NORMAL;")
        # Wait for a competing writer (bot vs. api_server vs. observer flush)
        # instead of raising "database is locked" immediately.
        conn.execute("PRAGMA busy_timeout=10000;")
        _tls.conn = conn
    conn = _tls.conn
    # Self-heal: a failed write leaves the implicit transaction open (we never
    # rollback on error). A stuck transaction pins a stale WAL snapshot, so this
    # thread reads outdated data and every write fails instantly with
    # SQLITE_BUSY_SNAPSHOT ("database is locked") — forever. Roll it back here
    # so each helper starts from a fresh snapshot.
    # LOUD on purpose: firing during normal operation means some code path calls
    # a _get_conn()-using helper inside its own transaction — the guard would
    # then silently discard the pending writes (bit us in _update_report).
    if conn.in_transaction:
        import traceback
        print("[db] WARNING: rolling back stray open transaction", flush=True)
        traceback.print_stack(limit=6)
        try:
            conn.rollback()
        except sqlite3.Error:
            pass
    return conn

def _init_db():
    c = _get_conn()
    c.execute("""CREATE TABLE IF NOT EXISTS servers (
        guild_id INTEGER PRIMARY KEY, data TEXT NOT NULL
    )""")
    c.execute("""CREATE TABLE IF NOT EXISTS kv (
        path TEXT PRIMARY KEY, value TEXT NOT NULL
    )""")
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
    # Threat-intel: every link the bot blocks, aggregated. Stores the link +
    # category + counts only — never who posted it (no personal data).
    c.execute("""CREATE TABLE IF NOT EXISTS blocked_links (
        url TEXT PRIMARY KEY,
        domain TEXT NOT NULL,
        category TEXT NOT NULL,
        source TEXT NOT NULL DEFAULT 'blocked',
        hits INTEGER NOT NULL DEFAULT 0,
        first_seen INTEGER NOT NULL,
        last_seen INTEGER NOT NULL
    )""")
    c.execute("CREATE INDEX IF NOT EXISTS idx_blocked_domain ON blocked_links (domain)")
    c.execute("CREATE INDEX IF NOT EXISTS idx_blocked_hits ON blocked_links (hits DESC)")
    c.execute("CREATE INDEX IF NOT EXISTS idx_blocked_last ON blocked_links (last_seen DESC)")
    # Older DBs: add the source column if the table predates it.
    try:
        c.execute("ALTER TABLE blocked_links ADD COLUMN source TEXT NOT NULL DEFAULT 'blocked'")
    except sqlite3.OperationalError:
        pass
    # Distinct (link, guild) pairs → how many servers have seen each link.
    c.execute("""CREATE TABLE IF NOT EXISTS blocked_link_guilds (
        url TEXT NOT NULL,
        guild_id INTEGER NOT NULL,
        PRIMARY KEY (url, guild_id)
    )""")
    # Every link the bot SEES (not just blocked), aggregated by domain — the
    # "what actually circulates on Discord" picture. URL-only, no author.
    c.execute("""CREATE TABLE IF NOT EXISTS seen_domains (
        domain TEXT PRIMARY KEY,
        hits INTEGER NOT NULL DEFAULT 0,
        first_seen INTEGER NOT NULL,
        last_seen INTEGER NOT NULL
    )""")
    c.execute("CREATE INDEX IF NOT EXISTS idx_seen_hits ON seen_domains (hits DESC)")
    # Safe Browsing scan cache: every URL we've checked + verdict, so we never
    # rescan the same link (and don't burn API quota).
    c.execute("""CREATE TABLE IF NOT EXISTS scanned_urls (
        url TEXT PRIMARY KEY,
        domain TEXT NOT NULL,
        malicious INTEGER,
        scanned_at INTEGER NOT NULL DEFAULT 0
    )""")
    c.execute("CREATE INDEX IF NOT EXISTS idx_scanned_malicious ON scanned_urls (malicious)")
    # User-submitted reports (malicious link / false positive / bug / feedback).
    # Surfaced in the operator admin panel (web + app). No message content stored
    # beyond what the reporter types.
    c.execute("""CREATE TABLE IF NOT EXISTS reports (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        username TEXT,
        guild_id TEXT,
        type TEXT NOT NULL,
        url TEXT,
        category TEXT,
        message TEXT,
        status TEXT NOT NULL DEFAULT 'open',
        created_at INTEGER NOT NULL
    )""")
    c.execute("CREATE INDEX IF NOT EXISTS idx_reports_status ON reports (status, created_at DESC)")
    c.execute("CREATE INDEX IF NOT EXISTS idx_reports_type ON reports (type, created_at DESC)")
    # Scam Shield: accounts the bot has caught mass-posting scam content,
    # shared across all servers (cross-server intel). Stores ONLY the user id +
    # counts — no message content, no usernames.
    c.execute("""CREATE TABLE IF NOT EXISTS flagged_users (
        user_id TEXT PRIMARY KEY,
        reason TEXT NOT NULL,
        incidents INTEGER NOT NULL DEFAULT 0,
        first_seen INTEGER NOT NULL,
        last_seen INTEGER NOT NULL
    )""")
    # Distinct (user, guild) pairs → on how many servers each account was caught.
    c.execute("""CREATE TABLE IF NOT EXISTS flagged_user_guilds (
        user_id TEXT NOT NULL,
        guild_id INTEGER NOT NULL,
        PRIMARY KEY (user_id, guild_id)
    )""")
    c.execute("CREATE INDEX IF NOT EXISTS idx_flagged_last ON flagged_users (last_seen DESC)")
    # Evidence for flagged accounts: the offending scam message itself (text +
    # attachment metadata), kept ONLY while the account is flagged so appeal
    # reviews can see what was actually posted. Deleted together with the flag.
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
    # top.gg votes — drives the public supporter leaderboard + vote reminders.
    # One row per user: lifetime total + this-month count (for the monthly board).
    c.execute("""CREATE TABLE IF NOT EXISTS votes (
        user_id TEXT PRIMARY KEY,
        last_voted INTEGER NOT NULL,
        total INTEGER NOT NULL DEFAULT 0,
        monthly INTEGER NOT NULL DEFAULT 0,
        month TEXT NOT NULL DEFAULT ''
    )""")
    c.execute("CREATE INDEX IF NOT EXISTS idx_votes_month ON votes (month, monthly DESC)")
    c.commit()

_init_db()

_DEFAULT = {
    "channel": {"channel": [], "category": [], "member": [], "role": []},
    # links = custom blacklist (always blocked); allow = trusted domains that
    # bypass blocking (per-server allowlist).
    "link": {"links": [], "allow": []},
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
    # Auto-expire warnings after N days of good behaviour (0/disabled = keep forever).
    "decay": {"enabled": False, "days": 30},
    # Per-channel rule overrides. Keyed by channel **or** category id (string):
    #   {"mode": "default"}                       → inherit server-wide settings
    #   {"mode": "off"}                            → Link Protect ignores this channel
    #   {"mode": "custom", "protect": {...},       → only the listed blockers apply here
    #                      "silent": true|false}     (silent optional; inherits if absent)
    "overrides": {},
    # Extra Discord user IDs granted dashboard/app access beyond owner & Manage
    # Server. Owners manage this list; editors get access but can't edit the team.
    "dashboard": {"editors": []},
    # Raid / compromised-account defense. When enabled, ≥ `threshold` distinct
    # members posting the same link within `window` seconds triggers a coordinated
    # response: their messages are deleted and they're timed out for
    # `timeout_minutes`, with one alarm instead of dozens of warnings.
    "raid": {"enabled": False, "threshold": 5, "window": 10, "timeout_minutes": 60},
    # Scam Shield: ONE account posting the same scam (link/image/wall of text)
    # into ≥ `channels` different channels within `window` seconds → messages are
    # deleted and `action` (delete|timeout|kick|ban) is applied. Caught accounts
    # are flagged in the cross-server intel DB. `join_check` additionally
    # kicks/bans accounts already flagged on ≥ `min_servers` other servers the
    # moment they join (or first post, if the join event isn't available).
    "scamguard": {
        "enabled": False, "channels": 3, "window": 10,
        "action": "ban", "timeout_minutes": 60,
        "join_check": False, "join_action": "kick", "min_servers": 2,
    },
}

# The set of blocker keys a channel override can toggle (mirrors `protect`).
PROTECT_KEYS = ("all", "nsfw", "nitro", "malware", "invite",
                "youtube", "google", "gif", "twitch", "steam", "bit")

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
        try:
            c.execute("INSERT INTO servers (guild_id, data) VALUES (?, ?)",
                      (guild_id, json.dumps(data)))
            c.commit()
        except sqlite3.IntegrityError:
            # Another on_message thread inserted this guild first — use theirs.
            row = c.execute("SELECT data FROM servers WHERE guild_id=?", (guild_id,)).fetchone()
            if row is not None:
                return json.loads(row[0])
        except sqlite3.OperationalError:
            # Write lock contention. Never let a busy DB break moderation: clear
            # the half-open transaction, re-read with a fresh snapshot (the row
            # may exist but was invisible to a stale snapshot), else fall back
            # to defaults without persisting them.
            try:
                c.rollback()
            except sqlite3.Error:
                pass
            row = c.execute("SELECT data FROM servers WHERE guild_id=?", (guild_id,)).fetchone()
            if row is not None:
                return json.loads(row[0])
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


# ── per-channel rule overrides ──────────────────────────────────────────────

def resolve_channel(settings: dict, channel) -> dict:
    """Apply this channel's override (if any) on top of the server-wide settings
    and return the *effective* settings the detection cogs should use.

    A channel's own override wins; otherwise its category's override applies;
    otherwise the server-wide settings are used unchanged. Modes:
      • "default" / missing → inherit everything (returns settings as-is)
      • "off"               → disable Link Protect here (empty protect map)
      • "custom"            → only the blockers listed in the override apply
    """
    overrides = settings.get("overrides") or {}
    if not overrides:
        return settings

    ov = overrides.get(str(channel.id))
    if ov is None:
        cat_id = getattr(channel, "category_id", None)
        if cat_id:
            ov = overrides.get(str(cat_id))
    if not ov:
        return settings

    mode = ov.get("mode", "default")
    if mode == "default":
        return settings

    eff = dict(settings)  # shallow copy — we only swap top-level keys
    if mode == "off":
        eff["protect"] = {}
        eff["_lp_channel_off"] = True
        return eff
    if mode == "custom":
        # Start from "everything off", then apply only what the channel sets —
        # so a custom channel is fully independent of the server defaults.
        merged = {k: False for k in PROTECT_KEYS}
        for k, v in (ov.get("protect") or {}).items():
            merged[k] = bool(v)
        eff["protect"] = merged
        if "silent" in ov:
            eff["silent"] = bool(ov["silent"])
        _apply_channel_allow(eff, settings, ov)
        return eff
    return settings


def _apply_channel_allow(eff: dict, settings: dict, ov: dict) -> None:
    """Per-channel exemptions: members/roles in the override's `allow` list are
    added to the effective whitelist FOR THIS CHANNEL ONLY, so is_whitelisted
    (used by every cog) exempts them here without touching the server-wide list.
    Deep-copies the channel dict so the cached settings are never mutated."""
    allow = ov.get("allow") or {}
    a_members = [str(x) for x in (allow.get("member") or [])]
    a_roles = [str(x) for x in (allow.get("role") or [])]
    if not a_members and not a_roles:
        return
    base = settings.get("channel") or {}
    ch = dict(base)
    ch["member"] = list(get_safe_list(base.get("member"))) + a_members
    ch["role"] = list(get_safe_list(base.get("role"))) + a_roles
    eff["channel"] = ch


# ── warning decay ───────────────────────────────────────────────────────────

def prune_decayed_warns(data: dict, days: int, now: int = None) -> bool:
    """Remove warnings older than `days` from every user in this guild's data.
    Mutates `data` in place; returns True if anything changed.

    Legacy warns without timestamps are back-filled with `now` on first run, so
    they begin their decay window now rather than disappearing immediately."""
    if not days or days <= 0:
        return False
    if now is None:
        now = int(time.time())
    cutoff = now - days * 86400
    warn = data.get("warn", {})
    changed = False
    for uid, ud in list(warn.items()):
        if uid in ("kick", "ban", "timeout") or not isinstance(ud, dict):
            continue
        count = ud.get("Warn", 0) or 0
        if count <= 0:
            continue
        reasons = ud.get("reason", []) or []
        ts = list(ud.get("ts", []) or [])
        while len(ts) < count:           # back-fill legacy entries (oldest first)
            ts.insert(0, now)
        keep = [i for i, t in enumerate(ts) if t >= cutoff]
        if len(keep) == count:
            if ud.get("ts") != ts:       # persist any back-fill we just did
                ud["ts"] = ts
                changed = True
            continue
        changed = True
        if keep:
            ud["Warn"] = len(keep)
            ud["ts"] = [ts[i] for i in keep]
            ud["reason"] = [reasons[i] for i in keep if i < len(reasons)]
        else:
            warn.pop(uid, None)
    return changed


def _log_action_sync(guild_id: int, user_id: str, username: str, channel_id: str, action: str, reason: str, warn_count: int) -> None:
    c = _get_conn()
    c.execute(
        "INSERT INTO actions (guild_id, user_id, username, channel_id, action, reason, warn_count, timestamp) VALUES (?,?,?,?,?,?,?,?)",
        (guild_id, user_id, username, channel_id, action, reason, warn_count, int(time.time())),
    )
    # Keep last 200 actions per guild
    c.execute(
        "DELETE FROM actions WHERE guild_id=? AND id NOT IN (SELECT id FROM actions WHERE guild_id=? ORDER BY id DESC LIMIT 200)",
        (guild_id, guild_id),
    )
    c.commit()


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


def _action_failure_reasons(action: str, member, guild) -> list:
    """Bullet list explaining exactly why the bot couldn't kick/ban/timeout
    `member` (missing permission / role position / owner)."""
    perm_map = {
        "kick": ("Kick Members", lambda p: p.kick_members),
        "ban": ("Ban Members", lambda p: p.ban_members),
        "timeout": ("Moderate Members (Timeout)", lambda p: p.moderate_members),
    }
    perm_name, getter = perm_map.get(action, ("the required permission", lambda p: True))
    me = guild.me
    has_perm = bool(getter(me.guild_permissions)) if me else False
    try:
        hierarchy_ok = me.top_role > member.top_role
    except Exception:
        hierarchy_ok = True
    is_owner = (member.id == guild.owner_id)

    reasons = []
    if is_owner:
        reasons.append("• They are the **server owner** — Discord never lets a bot action the owner.")
    if not has_perm:
        reasons.append(f"• I'm missing the **{perm_name}** permission.\n   → *Server Settings → Roles → Link Protect → enable it.*")
    if not hierarchy_ok and not is_owner:
        reasons.append(f"• My role is **not above** {member.mention}'s highest role.\n   → *Server Settings → Roles → drag **Link Protect** above their role.*")
    if not reasons:
        reasons.append("• Discord refused the action. Check that **Link Protect** has the permission **and** its role sits **above** the user's roles.")
    return reasons


def _action_failure_embed(action: str, member, guild, exc=None):
    """Standalone embed wrapper around _action_failure_reasons."""
    import discord
    past = {"kick": "kicked", "ban": "banned", "timeout": "timed out"}.get(action, action)
    verb = {"kick": "kick", "ban": "ban", "timeout": "time out"}.get(action, action)
    reasons = _action_failure_reasons(action, member, guild)
    e = discord.Embed(
        title=f"⚠️ Couldn't {verb} {getattr(member, 'display_name', 'user')}",
        description=(f"{member.mention} reached the threshold and should have been **{past}**, "
                     f"but I couldn't:\n\n" + "\n".join(reasons)),
        color=discord.Color.orange(),
    )
    e.set_footer(text="Fix the above and it works automatically next time — no re-setup needed.")
    return e


# ── blocked-link capture (threat-intel data collection) ──────────────────────
# Whenever the bot blocks a message we record the link(s) it contained so we can
# build a real-world feed of bad URLs. We store ONLY the link + category + counts
# — never the author or message — so there's no personal data involved.

_URL_RE = re.compile(
    r'(?:https?://|www\.)[^\s<>"\'`\)\]]+'
    r'|(?<![@\w.])(?:[a-z0-9](?:[a-z0-9\-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}(?:/[^\s<>"\'`\)\]]*)?',
    re.IGNORECASE,
)
_URL_TRAILING = ".,!?:;\"')]}>«»…"


def _domain_of(url: str) -> str:
    s = re.sub(r"^https?://", "", url, flags=re.IGNORECASE).lstrip("/")
    if s[:4].lower() == "www.":
        s = s[4:]
    host = re.split(r"[/?#]", s, 1)[0]
    return host.lower().strip(".")


def extract_urls(text: str) -> list:
    """De-duplicated list of (url, domain) found in `text`."""
    found: dict[str, str] = {}
    for raw in _URL_RE.findall(text or ""):
        url = raw.strip().rstrip(_URL_TRAILING)
        if len(url) < 4 or "." not in url:
            continue
        domain = _domain_of(url)
        if not domain or "." not in domain or len(domain) > 255:
            continue
        found[url[:500]] = domain
    return list(found.items())


def link_allowlisted(url: str, settings: dict) -> bool:
    """True if the URL's domain (or a parent domain) is in this guild's trusted
    allowlist (`settings['link']['allow']`). Allowlisted domains bypass blocking.

    Entries may be bare domains ("example.com") or full URLs — both are reduced to
    their domain. A subdomain of an allowlisted domain also matches."""
    allow = (settings.get("link") or {}).get("allow") or []
    if not allow:
        return False
    domain = _domain_of(url)
    if not domain:
        return False
    for entry in allow:
        e = _domain_of(str(entry)) if ("/" in str(entry) or str(entry).lower().startswith("http")) \
            else str(entry).lower().strip().strip(".")
        if not e:
            continue
        if domain == e or domain.endswith("." + e):
            return True
    return False


# ── homoglyph / look-alike domain detection ──────────────────────────────────
# Catches brand-impersonation domains that use punycode or look-alike unicode
# characters (e.g. xn--dscord-… or a Cyrillic "о"). Deliberately conservative:
# pure-ASCII typosquats are left to the threat DB / Safe Browsing to avoid false
# positives on short brand names (e.g. "steak" vs "steam").

# Brands' real domains — never flag these or their subdomains.
_OFFICIAL_DOMAINS = {
    "discord.com", "discord.gg", "discordapp.com", "discordapp.net", "discord.media",
    "discordstatus.com", "steamcommunity.com", "steampowered.com", "store.steampowered.com",
    "roblox.com", "twitch.tv", "youtube.com", "youtu.be", "google.com", "paypal.com",
}

# Ubiquitous, trusted domains that must NEVER be treated as malware/phishing — a
# safety net so a noisy single catch can't escalate into blocking a domain that
# whole communities rely on (GIFs, CDNs, big platforms).
_SAFE_DOMAINS = {
    "tenor.com", "giphy.com", "gfycat.com", "imgur.com",
    "discord.com", "discord.gg", "discordapp.com", "discordapp.net", "discord.media",
    "youtube.com", "youtu.be", "google.com", "gstatic.com",
    "twitter.com", "x.com", "reddit.com", "github.com", "github.io",
    "twitch.tv", "spotify.com", "soundcloud.com", "wikipedia.org",
    "roblox.com", "steamcommunity.com", "steampowered.com",
    "fandom.com", "medal.tv", "streamable.com", "fixupx.com", "vxtwitter.com",
}


def is_safe_domain(domain: str) -> bool:
    """True for ubiquitous trusted domains (and their subdomains)."""
    d = (domain or "").lower().strip(".")
    return any(d == s or d.endswith("." + s) for s in _SAFE_DOMAINS)


# Brand keywords we defend against look-alike spoofing.
_BRAND_KEYWORDS = ("discord", "discordapp", "steamcommunity", "steampowered",
                   "steam", "roblox", "twitch", "youtube", "paypal")
# Visual look-alike → ASCII folding.
_HOMOGLYPHS = {
    "0": "o", "1": "l", "3": "e", "4": "a", "5": "s", "7": "t", "8": "b", "9": "g",
    "а": "a", "е": "e", "о": "o", "р": "p", "с": "c", "х": "x", "у": "y", "і": "i",
    "ѕ": "s", "ԁ": "d", "ɡ": "g", "ⅼ": "l", "ｏ": "o", "ո": "n", "м": "m", "т": "t",
}


def _fold_homoglyphs(s: str) -> str:
    s = unicodedata.normalize("NFKD", s)
    s = "".join(c for c in s if not unicodedata.combining(c))
    return "".join(_HOMOGLYPHS.get(c, c) for c in s.lower())


def _edit_distance_le1(a: str, b: str) -> bool:
    """True if Levenshtein(a, b) <= 1 — enough for single look-alike swaps."""
    if a == b:
        return True
    la, lb = len(a), len(b)
    if abs(la - lb) > 1:
        return False
    if la == lb:                      # one substitution
        return sum(x != y for x, y in zip(a, b)) == 1
    # one insertion/deletion — walk the shorter against the longer
    if la > lb:
        a, b, la, lb = b, a, lb, la
    i = j = 0
    skipped = False
    while i < la and j < lb:
        if a[i] != b[j]:
            if skipped:
                return False
            skipped = True
            j += 1
        else:
            i += 1; j += 1
    return True


def homoglyph_brand_match(domain: str) -> str | None:
    """If `domain` impersonates a protected brand via punycode / look-alike
    characters (but isn't an official domain), return category 'phishing'."""
    domain = (domain or "").lower().strip(".")
    if not domain:
        return None
    if any(domain == d or domain.endswith("." + d) for d in _OFFICIAL_DOMAINS):
        return None
    try:
        decoded = domain.encode("ascii").decode("idna") if "xn--" in domain else domain
    except Exception:
        decoded = domain
    # Only consider domains that actually carry punycode / non-ASCII (a real
    # look-alike). Pure-ASCII strings are handled elsewhere.
    if decoded == domain and all(ord(c) < 128 for c in domain):
        return None
    for label in _fold_homoglyphs(decoded).replace("-", "").split("."):
        if not label:
            continue
        for brand in _BRAND_KEYWORDS:
            if _edit_distance_le1(label, brand):
                return "phishing"
    return None


def known_bad_category(domain: str, known_bad: dict) -> str | None:
    """Return the threat category if `domain` (or a parent domain) is known-bad."""
    d = (domain or "").lower().strip(".")
    while d:
        if d in known_bad:
            return known_bad[d]
        if "." not in d:
            return None
        d = d.split(".", 1)[1]
    return None


def category_from_reason(reason: str) -> str:
    """Map an apply_warn reason string to a blocked-link category."""
    r = (reason or "").lower()
    if "nitro" in r: return "nitro"
    if "malware" in r or "phishing" in r or "unsafe" in r: return "malware"
    if "invite" in r: return "invite"
    if "blacklist" in r: return "blacklist"
    if "nsfw" in r: return "nsfw"
    if "gif" in r: return "gif"
    if "youtube" in r: return "youtube"
    if "google" in r: return "google"
    if "twitch" in r: return "twitch"
    if "steam" in r: return "steam"
    if "bit.ly" in r or "short" in r: return "shortener"
    return "link"


def _record_blocked_sync(guild_id, items: list, category: str, source: str = "blocked") -> None:
    c = _get_conn()
    now = int(time.time())
    for url, domain in items:
        c.execute(
            "INSERT INTO blocked_links(url, domain, category, source, hits, first_seen, last_seen) "
            "VALUES(?,?,?,?,1,?,?) "
            "ON CONFLICT(url) DO UPDATE SET "
            "  hits = hits + 1, "
            "  last_seen = excluded.last_seen, "
            "  category = CASE WHEN blocked_links.category IN ('link','') "
            "                  THEN excluded.category ELSE blocked_links.category END",
            (url, domain, category, source, now, now),
        )
        if guild_id is not None:
            c.execute(
                "INSERT OR IGNORE INTO blocked_link_guilds(url, guild_id) VALUES(?,?)",
                (url, int(guild_id)),
            )
    c.commit()


async def record_blocked(guild_id, category: str, content: str) -> None:
    """Persist the link(s) that were just blocked. Best-effort: never raises."""
    try:
        items = extract_urls(content or "")
        if not items:
            return
        await asyncio.to_thread(_record_blocked_sync, int(guild_id), items[:10], category)
    except Exception:
        pass


# ── passive observation + Safe Browsing scan cache (used by the observer cog) ──
#
# IMPORTANT: the observer sees a huge number of messages, so it must NOT write to
# SQLite per message — that floods the single writer lock and makes the bot's own
# warn/kick/ban writes time out ("database is locked"). Instead the observer
# buffers in memory and calls these flush helpers periodically, collapsing
# thousands of tiny commits into one transaction every ~20s.

def flush_seen_counts_sync(counts: dict) -> None:
    """Apply buffered {domain: count} in a single transaction."""
    if not counts:
        return
    c = _get_conn()
    now = int(time.time())
    for domain, n in counts.items():
        c.execute(
            "INSERT INTO seen_domains(domain, hits, first_seen, last_seen) VALUES(?,?,?,?) "
            "ON CONFLICT(domain) DO UPDATE SET hits = hits + ?, last_seen = excluded.last_seen",
            (domain, n, now, now, n),
        )
    c.commit()


def flush_scan_results_sync(results: list) -> None:
    """Apply buffered scan verdicts [(url, domain, malicious_bool), …] in one
    transaction; malicious finds also go into blocked_links (source='scanned')."""
    if not results:
        return
    c = _get_conn()
    now = int(time.time())
    for url, domain, malicious in results:
        c.execute(
            "INSERT INTO scanned_urls(url, domain, malicious, scanned_at) VALUES(?,?,?,?) "
            "ON CONFLICT(url) DO UPDATE SET malicious=excluded.malicious, scanned_at=excluded.scanned_at",
            (url[:500], domain, 1 if malicious else 0, now),
        )
    c.commit()
    mal = [(u[:500], d) for (u, d, m) in results if m]
    if mal:
        _record_blocked_sync(None, mal, "malware", source="scanned")


# ── feed cross-reference (known-bad domains seen live on our servers) ──────────
# The real asset: when a domain the bot SEES matches a known-bad domain (from the
# imported feeds or our own finds), record it as a live catch WITH per-server
# prevalence. No scan quota needed — it's pure in-memory matching in the observer.

THREAT_CATEGORIES = ("malware", "phishing", "scam", "nitro")


def load_known_bad_sync() -> dict:
    """{domain: category} for every *high-confidence* known-bad domain.

    Only imported threat feeds, Safe-Browsing-confirmed finds, and admin-promoted
    reports are trusted for domain-level blocking. The bot's own keyword/policy
    catches (source='blocked') are deliberately excluded — they are per-message
    matches that can land legit domains in the table (e.g. a meme GIF whose slug
    contains "discord-nitro"), which must never become a server-wide block."""
    c = _get_conn()
    rows = c.execute(
        "SELECT domain, category FROM blocked_links "
        "WHERE category IN ('malware','phishing','scam','nitro') "
        "AND source IN ('feed','scanned','report')"
    ).fetchall()
    out: dict = {}
    for domain, category in rows:
        if domain and not is_safe_domain(domain) and domain not in out:
            out[domain] = category
    return out


def flush_caught_sync(rows: list) -> None:
    """rows: [(domain, guild_id, count, category), …]. Bump known-bad links with
    live observations + per-server prevalence, in one transaction."""
    if not rows:
        return
    c = _get_conn()
    now = int(time.time())
    for domain, guild_id, count, category in rows:
        c.execute(
            "INSERT INTO blocked_links(url, domain, category, source, hits, first_seen, last_seen) "
            "VALUES(?,?,?,'caught',?,?,?) "
            "ON CONFLICT(url) DO UPDATE SET hits = hits + excluded.hits, last_seen = excluded.last_seen",
            (domain, domain, category, count, now, now),
        )
        c.execute(
            "INSERT OR IGNORE INTO blocked_link_guilds(url, guild_id) VALUES(?,?)",
            (domain, int(guild_id)),
        )
    c.commit()


# ── Scam Shield cross-server intel ───────────────────────────────────────────
# Only the bot's own scam-blitz detection writes here (never keyword matches),
# so a flag always means "this exact account mass-posted scam content live".

def flag_scammer_sync(user_id: str, guild_id: int, reason: str,
                      content: str = "", attachments: list | None = None,
                      channels: int = 0) -> None:
    c = _get_conn()
    now = int(time.time())
    c.execute(
        "INSERT INTO flagged_users(user_id, reason, incidents, first_seen, last_seen) "
        "VALUES(?,?,1,?,?) "
        "ON CONFLICT(user_id) DO UPDATE SET "
        "  incidents = incidents + 1, last_seen = excluded.last_seen",
        (str(user_id), reason, now, now),
    )
    c.execute(
        "INSERT OR IGNORE INTO flagged_user_guilds(user_id, guild_id) VALUES(?,?)",
        (str(user_id), int(guild_id)),
    )
    # Evidence for appeal review: the scam message itself. Keep the last 5
    # incidents per account; everything is deleted when the flag is removed.
    if content or attachments:
        c.execute(
            "INSERT INTO flag_evidence(user_id, guild_id, content, attachments, channels, created_at) "
            "VALUES(?,?,?,?,?,?)",
            (str(user_id), int(guild_id), (content or "")[:2000],
             json.dumps(attachments or [])[:4000], int(channels), now),
        )
        c.execute(
            "DELETE FROM flag_evidence WHERE user_id=? AND id NOT IN "
            "(SELECT id FROM flag_evidence WHERE user_id=? ORDER BY id DESC LIMIT 5)",
            (str(user_id), str(user_id)),
        )
    c.commit()


def get_flag_sync(user_id: str) -> dict | None:
    """{'reason', 'incidents', 'guilds', 'first_seen', 'last_seen'} or None."""
    c = _get_conn()
    row = c.execute(
        "SELECT reason, incidents, first_seen, last_seen FROM flagged_users WHERE user_id=?",
        (str(user_id),),
    ).fetchone()
    if row is None:
        return None
    guilds = c.execute(
        "SELECT COUNT(*) FROM flagged_user_guilds WHERE user_id=?", (str(user_id),)
    ).fetchone()[0]
    return {"reason": row[0], "incidents": row[1], "guilds": guilds,
            "first_seen": row[2], "last_seen": row[3]}


def load_flagged_ids_sync() -> set:
    """All flagged user ids — small set, kept in memory by the cog so the
    per-message membership test never touches the DB."""
    c = _get_conn()
    return {r[0] for r in c.execute("SELECT user_id FROM flagged_users").fetchall()}


# ── shared warn helper ───────────────────────────────────────────────────────

async def apply_warn(bot, message, settings: dict, reason: str) -> None:
    """Increment warn count and handle kick/ban/timeout. Send embeds."""
    guild_id = str(message.guild.id)
    user_id = str(message.author.id)

    # Record the blocked link(s) for threat-intel (link only — no author stored).
    await record_blocked(guild_id, category_from_reason(reason), message.content)

    warn_ref = DBRef(f"/servers/{guild_id}/warn/{user_id}")
    warn_data = await asyncio.to_thread(warn_ref.get) or {"Warn": 0, "reason": []}
    warn_data["Warn"] += 1
    warn_data["reason"].append(reason)
    # Timestamp each warning so the decay task can expire old ones. Back-fill any
    # earlier warns that predate this feature so the lists stay aligned.
    ts = warn_data.get("ts", []) or []
    while len(ts) < warn_data["Warn"] - 1:
        ts.insert(0, int(time.time()))
    ts.append(int(time.time()))
    warn_data["ts"] = ts
    await asyncio.to_thread(warn_ref.set, warn_data)

    warn_count = warn_data["Warn"]
    username = getattr(message.author, "name", str(message.author.id))
    channel_id = str(message.channel.id)
    await asyncio.to_thread(
        _log_action_sync, int(guild_id), user_id, username, channel_id, "warned", reason, warn_count
    )
    kick_limit = settings.get("warn", {}).get("kick", 0)
    ban_limit = settings.get("warn", {}).get("ban", 0)
    timeout_cfg = settings.get("warn", {}).get("timeout", {})
    timeout_warns = timeout_cfg.get("warnings", 0)
    timeout_minutes = timeout_cfg.get("time", 0)
    silent = settings.get("silent", False)

    import discord

    # ── Escalation FIRST (ban > kick > timeout), so its outcome can be shown
    #    inside the warning the user actually sees. Independent of the log toggle.
    attempted = None
    if ban_limit and warn_count >= ban_limit:
        attempted = "ban"
    elif kick_limit and warn_count >= kick_limit:
        attempted = "kick"
    elif timeout_warns and warn_count >= timeout_warns:
        attempted = "timeout"

    action_succeeded = None       # "ban" | "kick" | "timeout"
    action_failed = None          # (action, [reason lines])
    if attempted:
        try:
            if attempted == "ban":
                await message.author.ban(reason=f"Auto-ban: reached {ban_limit} warnings")
            elif attempted == "kick":
                await message.author.kick(reason=f"Auto-kick: reached {kick_limit} warnings")
            else:
                from datetime import timedelta
                mins = timeout_minutes or 10
                until = discord.utils.utcnow() + timedelta(minutes=mins)
                await message.author.timeout(until=until, reason=f"Auto-timeout: reached {timeout_warns} warnings")
            action_succeeded = attempted
            kind = {"ban": "banned", "kick": "kicked", "timeout": "timeout"}[attempted]
            await asyncio.to_thread(
                _log_action_sync, int(guild_id), user_id, username, channel_id,
                kind, f"Auto-{kind} (reached {warn_count} warnings)", warn_count,
            )
        except Exception:
            action_failed = (attempted, _action_failure_reasons(attempted, message.author, message.guild))

    def _progress_footer():
        """'X more warning(s) → kicked/banned' for the nearest upcoming limit."""
        upcoming = []
        if kick_limit and warn_count < kick_limit:
            upcoming.append((kick_limit, "kicked"))
        if ban_limit and warn_count < ban_limit:
            upcoming.append((ban_limit, "banned"))
        if not upcoming:
            return None
        limit, verb = min(upcoming)
        left = limit - warn_count
        return (f"❗ One more warning → you will be {verb}" if left == 1
                else f"⚠️ {left} more warnings → you will be {verb}")

    def _decorate(embed):
        """Attach the punishment outcome / progress to the user-facing warning."""
        embed.add_field(name="Total Warnings", value=f"**{warn_count}** warning(s)")
        if action_failed:
            act, reasons = action_failed
            verb = {"kick": "kick", "ban": "ban", "timeout": "time out"}.get(act, act)
            embed.color = discord.Color.orange()
            embed.add_field(
                name=f"⚠️ I reached the threshold but couldn't {verb} this user",
                value="\n".join(reasons) + "\n\n*Fix the above — it then works automatically, no re-setup needed.*",
                inline=False,
            )
        elif action_succeeded in ("kick", "ban"):
            embed.set_footer(text="👢 User was kicked" if action_succeeded == "kick" else "🔨 User was banned")
        elif action_succeeded == "timeout":
            embed.set_footer(text=f"⏳ User was timed out for {timeout_minutes or 10} min")
        else:
            ft = _progress_footer()
            if ft:
                embed.set_footer(text=ft)
        return embed

    if silent:
        # Silent mode: DM the user instead of posting in channel
        try:
            dm_embed = discord.Embed(
                title="🔗 Your link was removed",
                description=f"**Server:** {message.guild.name}\n**Channel:** {message.channel.mention}\n**Reason:** {reason}",
                color=discord.Color.dark_red(),
            )
            await message.author.send(embed=_decorate(dm_embed))
        except Exception:
            pass  # DMs disabled — warn silently only in log
    else:
        warn_embed = discord.Embed(
            title="🔗 Link Blocked",
            description=f"{message.author.mention} — your message was removed.\n**Reason:** {reason}",
            color=discord.Color.dark_red(),
        )
        try:
            await message.channel.send(embed=_decorate(warn_embed))
        except discord.Forbidden:
            pass  # No permission to post here — message was still removed/warned.

    # ── Log channel record ─────────────────────────────────────────────────
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
        if action_succeeded:
            log_embed.add_field(
                name="Action",
                value={"kick": "👢 Kicked", "ban": "🔨 Banned", "timeout": "⏳ Timed out"}[action_succeeded],
            )
        elif action_failed:
            log_embed.color = discord.Color.orange()
            log_embed.add_field(
                name=f"⚠️ Couldn't {action_failed[0]}",
                value="\n".join(action_failed[1]),
                inline=False,
            )
        try:
            await log_channel.send(embed=log_embed)
        except discord.Forbidden:
            pass  # No permission in the configured log channel — skip logging.
