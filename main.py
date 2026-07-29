import discord
import os
import asyncio
import time
import datetime as dt
from datetime import datetime
from discord import AutoShardedClient
from discord.ext import commands, tasks
import re
import aiohttp

# === SQLite storage layer (replaces Firebase) ===
import sqlite3, json, threading, contextlib, os

_DB_PATH = os.environ.get("BOT_DB_PATH", "bot.sqlite3")

def _get_conn():
    conn = sqlite3.connect(_DB_PATH, check_same_thread=False)
    # sensible defaults for a bot
    try:
        conn.execute("PRAGMA journal_mode=WAL;")
        conn.execute("PRAGMA synchronous=NORMAL;")
    except Exception:
        pass
    return conn

def _init_db():
    with _get_conn() as conn:
        conn.execute("""
        CREATE TABLE IF NOT EXISTS servers (
            guild_id INTEGER PRIMARY KEY,
            data TEXT NOT NULL
        )""")
        conn.execute("""
        CREATE TABLE IF NOT EXISTS kv (
            path TEXT PRIMARY KEY,
            value TEXT NOT NULL
        )""")

_init_db()

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
        if k not in cur or not isinstance(cur[k], dict):
            cur[k] = {}
        cur = cur[k]
    cur[keys[-1]] = value
    return obj

def _deep_delete(obj, keys):
    cur = obj
    for k in keys[:-1]:
        if k not in cur or not isinstance(cur[k], dict):
            return obj
        cur = cur[k]
    cur.pop(keys[-1], None)
    return obj

_DEFAULT_TEMPLATE = {
    "channel": {"channel": [], "member": [], "role": []},
    "link": {"links": []},
    "log": {"Activated": False, "log-channel": 0, "link": 0, "onlylink": False},
    "onlylink": False,
    "safe": {
        "google": False, "youtube": False, "nsfw": False, "gif": False,
        "invite": False, "twitch": False, "bit": False, "nitro": True, "steam": False
    },
    "warn": {"kick": 3, "ban": 5},
    "protect": {
        "google": False, "youtube": False, "nsfw": False, "gif": False,
        "invite": False, "twitch": False, "bit": False, "nitro": True,
        "all": False, "steam": False, "malware": True,
        "files": True, "webhook": True, "mentions": False
    }
}

def _ensure_server(guild_id:int):
    with _get_conn() as conn:
        cur = conn.execute("SELECT data FROM servers WHERE guild_id=?", (guild_id,))
        row = cur.fetchone()
        if row is None:
            conn.execute(
                "INSERT INTO servers (guild_id, data) VALUES (?, ?)",
                (guild_id, json.dumps(_DEFAULT_TEMPLATE))
            )
            return json.loads(json.dumps(_DEFAULT_TEMPLATE))
        return json.loads(row[0])

def _save_server(guild_id:int, data:dict):
    with _get_conn() as conn:
        conn.execute(
            "INSERT INTO servers (guild_id, data) VALUES (?, ?) "
            "ON CONFLICT(guild_id) DO UPDATE SET data=excluded.data",
            (guild_id, json.dumps(data))
        )

def _queue_push_event(guild_id):
    """Record a config-change event so the API server can push a 'settings
    changed' alert to the owner's phone. Fire-and-forget: never let a failure
    here break the actual settings write."""
    try:
        with _get_conn() as conn:
            conn.execute(
                "CREATE TABLE IF NOT EXISTS push_events ("
                "id INTEGER PRIMARY KEY AUTOINCREMENT, guild_id TEXT NOT NULL, "
                "kind TEXT NOT NULL DEFAULT 'settings_changed', ts INTEGER NOT NULL)"
            )
            conn.execute(
                "INSERT INTO push_events(guild_id, kind, ts) VALUES(?, 'settings_changed', ?)",
                (str(guild_id), int(time.time()))
            )
    except Exception:
        pass

class DBRef:
    def __init__(self, path:str):
        # normalize
        self.path = "/" + path.strip("/")

    def child(self, key:str):
        return DBRef(self.path.rstrip("/") + "/" + key.strip("/"))

    def get(self):
        # /servers -> dict of all servers
        if self.path == "/servers":
            with _get_conn() as conn:
                cur = conn.execute("SELECT guild_id, data FROM servers")
                result = {}
                for gid, data in cur.fetchall():
                    result[str(gid)] = json.loads(data)
                return result
        # /servers/{id}[/{...}]
        if self.path.startswith("/servers/"):
            parts = self.path.split("/")
            # ['', 'servers', '{id}', ...]
            if len(parts) >= 3 and parts[2].isdigit():
                gid = int(parts[2])
                data = _ensure_server(gid)
                if len(parts) == 3:
                    return data
                keys = parts[3:]
                return _deep_get(data, keys)
            else:
                return None
        # other paths -> kv
        with _get_conn() as conn:
            cur = conn.execute("SELECT value FROM kv WHERE path=?", (self.path,))
            row = cur.fetchone()
            return (json.loads(row[0]) if row else None)

    def set(self, value):
        # /servers
        if self.path == "/servers":
            # replacing entire /servers is unsupported
            raise RuntimeError("Setting /servers root is not supported.")
        if self.path.startswith("/servers/"):
            parts = self.path.split("/")
            if len(parts) >= 3 and parts[2].isdigit():
                gid = int(parts[2])
                data = _ensure_server(gid)
                if len(parts) == 3:
                    # set whole server document
                    if not isinstance(value, dict):
                        raise ValueError("Whole server document must be a dict")
                    _save_server(gid, value)
                    return
                keys = parts[3:]
                data = _deep_set(data, keys, value)
                _save_server(gid, data)
                if keys and keys[0] != "warn":
                    _queue_push_event(gid)
                return
            else:
                raise ValueError("Invalid servers path")
        # other -> kv
        with _get_conn() as conn:
            conn.execute(
                "INSERT INTO kv(path, value) VALUES(?, ?) "
                "ON CONFLICT(path) DO UPDATE SET value=excluded.value",
                (self.path, json.dumps(value))
            )

    def delete(self):
        if self.path.startswith("/servers/"):
            parts = self.path.split("/")
            if len(parts) >= 3 and parts[2].isdigit():
                gid = int(parts[2])
                if len(parts) == 3:
                    with _get_conn() as conn:
                        conn.execute("DELETE FROM servers WHERE guild_id=?", (gid,))
                    return
                data = _ensure_server(gid)
                keys = parts[3:]
                data = _deep_delete(data, keys)
                _save_server(gid, data)
                if keys and keys[0] != "warn":
                    _queue_push_event(gid)
                return
        # other -> kv
        with _get_conn() as conn:
            conn.execute("DELETE FROM kv WHERE path=?", (self.path,))


    def update(self, values: dict):
        # Merge dict into existing object at path
        if not isinstance(values, dict):
            raise ValueError("update() expects a dict")
        if self.path.startswith("/servers/"):
            parts = self.path.split("/")
            if len(parts) >= 3 and parts[2].isdigit():
                gid = int(parts[2])
                data = _ensure_server(gid)
                if len(parts) == 3:
                    base = data
                    if isinstance(base, dict):
                        base.update(values)
                    else:
                        base = values
                    _save_server(gid, base)
                    return
                keys = parts[3:]
                # navigate to parent
                cur = data
                for k in keys:
                    if k not in cur or not isinstance(cur[k], dict):
                        cur[k] = {}
                    cur = cur[k]
                if isinstance(cur, dict):
                    cur.update(values)
                else:
                    parent = data
                    for k in keys[:-1]:
                        parent = parent[k]
                    parent[keys[-1]] = values
                _save_server(gid, data)
                if keys and keys[0] != "warn":
                    _queue_push_event(gid)
                return
            else:
                raise ValueError("Invalid servers path")
        # kv path
        with _get_conn() as conn:
            cur = conn.execute("SELECT value FROM kv WHERE path=?", (self.path,))
            row = cur.fetchone()
            if row:
                try:
                    existing = json.loads(row[0])
                except Exception:
                    existing = {}
            else:
                existing = {}
            if isinstance(existing, dict):
                existing.update(values)
            else:
                existing = values
            conn.execute(
                "INSERT INTO kv(path, value) VALUES(?, ?) "
                "ON CONFLICT(path) DO UPDATE SET value=excluded.value",
                (self.path, json.dumps(existing))
            )
        return

class DB:
    def reference(self, path:str):
        return DBRef(path)

# Expose firebase-like "db"
db = DB()
# === end SQLite layer ===


async def safe_defer(ctx):
    try:
        await ctx.defer()
        return True
    except discord.NotFound:
        return False
    except Exception as e:
        print(f"[defer] {type(e).__name__}: {e}")
        return False


intents = discord.Intents.default()
intents.message_content = True
# Scam Shield join check (privileged — must also be enabled in the Developer
# Portal). Set LP_NO_MEMBERS_INTENT=1 to boot without it if Discord rejects the
# identify; the Scam Shield cog then falls back to first-message checks.
intents.members = os.environ.get("LP_NO_MEMBERS_INTENT") != "1"
bot = commands.AutoShardedBot(command_prefix="!", intents=intents, sync_commands=False,
                              max_messages=0, chunk_guilds_at_startup=False)

_boot_synced = False
_startup_time = time.monotonic()


async def _boot_sync_once():
    global _boot_synced
    await bot.wait_until_ready()
    await asyncio.sleep(15)
    if _boot_synced:
        return
    try:
        await bot.sync_commands()
        print("✅ Global commands synced (one-time on boot).")
    except Exception as e:
        print(f"[boot-sync] {type(e).__name__}: {e}  (retry in 60s)")
        await asyncio.sleep(60)
        try:
            await bot.sync_commands()
            print("✅ Global commands synced (retry).")
        except Exception as e2:
            print(f"[boot-sync:final] {e2}")
    _boot_synced = True


bot.loop.create_task(_boot_sync_once())

# ── Brand / embed design system ───────────────────────────────────────────────
# One version string, one color, one footer — every reply goes through
# brand_embed() so the bot looks like a single product, not 61 commands.
BOT_VERSION = "3.0.1"
BRAND_COLOR = 0x5B6CFF          # matches website + iOS app accent
_EMBED_KINDS = {
    "brand": BRAND_COLOR,
    "success": 0x23A55A,
    "error": 0xF23F43,
    "info": 0xF0B232,
}


def brand_embed(title: str = "", description: str = "", *, kind: str = "brand",
                footer: bool = True) -> discord.Embed:
    e = discord.Embed(title=title, description=description,
                      color=_EMBED_KINDS.get(kind, BRAND_COLOR))
    if footer:
        e.set_footer(text="Link Protect • link-protect.com")
    return e


# Secrets come from the environment (systemd drop-in on the Pi) — never from
# source. Missing values degrade gracefully instead of crashing.
SAFE_BROWSING_KEY = os.environ.get("SAFE_BROWSING_KEY", "")
TOPGG_TOKEN = os.environ.get("TOPGG_TOKEN", "")

# ── Command redirect mode ─────────────────────────────────────────────────────
# When the super-admin turns this on (admin panel on web/app → kv config:lock_commands),
# every settings command stops applying and instead points users to the dashboard/app.
# Moderation and info commands keep working.
SETTINGS_COMMANDS = {
    # blockers + silent mode
    "blocker",
    # access control (whitelist group)
    "whitelist channel-add", "whitelist channel-remove",
    "whitelist member-add", "whitelist member-remove",
    "whitelist role-add", "whitelist role-remove",
    "whitelist only-link", "whitelist only-link-off",
    # warning configuration ("warn add/list/…" stay — that's moderation)
    "warn kick-at", "warn ban-at", "warn timeout", "warn decay",
    "warn log", "warn log-off",
    # presets
    "setup-preset",
    # per-channel rules (channel-rules stays — it's read-only)
    "channel-mode", "channel-block", "channel-reset",
    # blacklist writes ("blacklist list" stays readable)
    "blacklist add", "blacklist remove",
}

_redirect_cache = {"value": False, "ts": 0.0}

def _redirect_enabled() -> bool:
    """Read the kv flag config:lock_commands (cached 5 s)."""
    now = time.monotonic()
    if now - _redirect_cache["ts"] < 5.0:
        return _redirect_cache["value"]
    val = False
    try:
        with _get_conn() as conn:
            row = conn.execute("SELECT value FROM kv WHERE path=?", ("config:lock_commands",)).fetchone()
        if row:
            val = json.loads(row[0]) in (True, 1, "1", "true")
    except Exception:
        val = False
    _redirect_cache.update(value=val, ts=now)
    return val


def _redirect_embed(ctx) -> discord.Embed:
    gid = ctx.guild.id if ctx.guild else ""
    e = discord.Embed(
        title="⚙️ Settings have moved",
        description=(
            "Configuration commands are disabled. Manage **Link Protect** from the "
            "web dashboard or the iOS app — it's faster, clearer, and shows exactly "
            "what each setting does."),
        color=0x5B6CFF,
    )
    e.add_field(name="🌐 Web Dashboard",
                value=f"**[link-protect.com/dashboard/{gid}](https://link-protect.com/dashboard/{gid})**",
                inline=False)
    e.add_field(name="📱 iOS App",
                value="Download on the **[App Store](https://apps.apple.com/de/app/link-protect-server-guard/id6783911538)**", inline=False)
    e.set_footer(text="Moderation commands (warn, kick, stats…) still work here.")
    return e


@bot.check
async def _settings_redirect_check(ctx) -> bool:
    """Global slash-command gate: blocks settings commands when redirect mode is on."""
    cmd = getattr(ctx, "command", None)
    name = getattr(cmd, "qualified_name", None) or getattr(cmd, "name", "") or ""
    if name in SETTINGS_COMMANDS and _redirect_enabled():
        try:
            await ctx.respond(embed=_redirect_embed(ctx), ephemeral=True)
        except Exception:
            pass
        return False
    return True


@bot.event
async def on_application_command_error(ctx, error):
    # The redirect check raises CheckFailure after already responding — swallow it.
    # py-cord raises discord.errors.CheckFailure for slash-command checks, which is a
    # different class than commands.CheckFailure, so catch both.
    if isinstance(error, (commands.CheckFailure, discord.errors.CheckFailure)):
        return
    # 10062 "Unknown interaction": the token expired before we could respond
    # (event backlog right after a restart / gateway hiccup). Nothing can be
    # sent to that interaction anymore — log one line instead of a stack spam.
    original = getattr(error, "original", None)
    if isinstance(original, discord.NotFound) and getattr(original, "code", 0) == 10062:
        print(f"[cmd] interaction expired before response ({ctx.command.qualified_name})", flush=True)
        return
    raise error

_SKIP_COGS = {'shared', 'logger'}
for filename in os.listdir('./cogs'):
    if filename.endswith('.py') and filename[:-3] not in _SKIP_COGS:
        bot.load_extension(f'cogs.{filename[:-3]}')
        print(f"loaded cogs.{filename[:-3]}")


async def post_stats():
    if not TOPGG_TOKEN:
        return  # no token configured — skip silently
    url = "https://top.gg/api/bots/888390889892892684/stats"
    headers = {
        "Authorization": TOPGG_TOKEN,
        "Content-Type": "application/json",
    }
    data = {"server_count": len(bot.guilds)}
    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(url, json=data, headers=headers) as resp:
                if resp.status != 200:
                    print(f"top.gg stats failed: {resp.status}")
    except Exception as e:
        print(f"[top.gg] {e}")


def find_urls(message):
    url_pattern = re.compile(r'(https?://[^\s]+)')
    return url_pattern.findall(message)

@tasks.loop(minutes=30)
async def update_topgg_stats():
    await post_stats()


@tasks.loop(seconds=30)
async def heartbeat():
    """Write a liveness timestamp + the bot's real guild/member counts so the
    API/website show accurate live numbers (and can fire a 'bot offline' push)."""
    try:
        guild_count = len(bot.guilds)
        member_count = sum((g.member_count or 0) for g in bot.guilds)
        with _get_conn() as conn:
            for path, val in (
                ("bot:heartbeat", int(time.time())),
                ("bot:guild_count", guild_count),
                ("bot:member_count", member_count),
            ):
                conn.execute(
                    "INSERT INTO kv(path, value) VALUES(?, ?) "
                    "ON CONFLICT(path) DO UPDATE SET value=excluded.value",
                    (path, str(val)),
                )
    except Exception:
        pass

@tasks.loop(hours=1)
async def decay_warns():
    """Expire warnings older than each guild's configured decay window."""
    try:
        from cogs.shared import prune_decayed_warns
        with _get_conn() as conn:
            rows = conn.execute("SELECT guild_id, data FROM servers").fetchall()
        for gid, raw in rows:
            try:
                data = json.loads(raw)
            except Exception:
                continue
            decay = data.get("decay") or {}
            if not decay.get("enabled"):
                continue
            if prune_decayed_warns(data, int(decay.get("days", 0) or 0)):
                _save_server(int(gid), data)
    except Exception as e:
        print(f"[decay] {e}")


@bot.event
async def on_shard_ready(shard_id: int):
    print(f"✅ Shard {shard_id} ready")


@bot.event
async def on_ready():
    print(f"✅ Eingeloggt als {bot.user}")
    await bot.change_presence(activity=discord.Activity(type=discord.ActivityType.watching,
            name="https://link-protect.com"))
    # on_ready fires again after reconnects — a bare start() then raises
    # "Task is already launched and is not completed."
    if not update_topgg_stats.is_running():
        update_topgg_stats.start()
    if not heartbeat.is_running():
        heartbeat.start()
    if not decay_warns.is_running():
        decay_warns.start()



@bot.event
async def on_message(message):
    if message.author == bot.user:
        return


@bot.event
async def on_guild_join(guild):
    data = {
        "channel": {
            "channel": [],
            "member": [],
            "role": []
        },
        "link": {"links": []},
        "log": {
            "Activated": False,
            "log-channel": 0,
            "link": 0
        },
        "onlylink": False,
        "safe": {
            "google": False,
            "youtube": False,
            "nsfw": False,
            "gif": False,
            "invite": False,
            "twitch": False,
            "bit": False,
            "nitro": True,
            "steam": False
        },
        "warn": {
            "kick": 3,
            "ban": 5
        },
        "protect": {
            "google": False,
            "youtube": False,
            "nsfw": False,
            "gif": False,
            "invite": False,
            "twitch": False,
            "bit": False,
            # Core protection is ON for new servers (since 2.6.1): malware and
            # nitro-scam links have zero false-positive risk. 85% of installs
            # never enabled anything — now the bot is useful from minute one.
            # Same logic for dangerous files and compromised webhooks (3.0).
            "nitro": True,
            "all": False,
            "steam": False,
            "malware": True,
            "files": True,
            "webhook": True,
            "mentions": False
        }
    }
    # Re-invites keep every setting: only seed defaults for genuinely new servers.
    existing = await asyncio.to_thread(lambda: db.reference(f"/servers/{guild.id}").get())
    if not existing:
        await asyncio.to_thread(
            lambda: db.reference(f"/servers/{guild.id}").set(data)
        )
    owner_id = guild.owner_id
    total_text_channels = len(guild.text_channels)
    total_voice_channels = len(guild.voice_channels)
    total_channels = total_text_channels + total_voice_channels
    create = guild.created_at.strftime("%d.%m.%Y, %H:%M")
    embed = discord.Embed(title=f"{guild.name} (ID: {guild.id})", color=BRAND_COLOR)
    embed.add_field(name=" ", value=f"Owner: <@{owner_id}>", inline=False)
    embed.add_field(name="Members", value=f"```{guild.member_count}```", inline=True)
    embed.add_field(name="Total channels", value=f"```{total_channels}```", inline=True)
    embed.add_field(name="Text channels", value=f"```{total_text_channels}```", inline=True)
    embed.add_field(name="Voice channels", value=f"```{total_voice_channels}```", inline=True)
    embed.add_field(name="Created at", value=f"```{create}```", inline=True)
    embed.set_footer(text=f"Total servers: {len(bot.guilds)}")
    channel = bot.get_channel(889218205636247582)
    if channel:
        try:
            await channel.send(embed=embed)
        except Exception:
            pass
    try:
        owner = await bot.fetch_user(owner_id)
    except discord.NotFound:
        return
    except discord.Forbidden:
        return
    except discord.HTTPException as e:
        return
    embed = brand_embed(
        "Welcome to Link Protect 👋",
        f"Thanks for adding me to **{guild.name}**! Good news first: "
        "**you're already protected** — the malware/phishing and nitro-scam "
        "blockers are on from this very second, no setup needed.",
    )
    embed.add_field(name="🚀 Level up in 30 seconds", value=(
        "Run **`/setup-preset`** and pick **Balanced** (recommended) to add "
        "raid protection, Scam Shield and more — or fine-tune everything in the "
        "[web dashboard](https://link-protect.com/dashboard). "
        "Tip: set a log channel with **`/warn log`** so you see what I catch."), inline=False)
    embed.add_field(name="🛡️ What I protect you from", value=(
        "• Phishing, nitro scams & malware links\n"
        "• Cross-channel scam spam (Scam Shield) & link raids\n"
        "• Unwanted links — invites, shorteners, NSFW and more\n"
        "• Repeat offenders, via warnings with auto timeout/kick/ban"), inline=False)
    embed.add_field(name="🔗 Good to know", value=(
        "**`/help`** shows every command · **`/dashboard`** shows your settings\n"
        "[Web dashboard](https://link-protect.com/dashboard) · "
        "[iOS app](https://link-protect.com) · "
        "[Support server](https://discord.gg/BjDC9t329E)"), inline=False)
    try:
        await owner.send(embed=embed)
    except Exception as e:
        return
    guild = bot.get_guild(876501708912603157)
    if guild is None:
        return
    channel = guild.get_channel(1284546741936459887)
    if channel is None:
        return
    new_name = f"📈| - {len(bot.guilds)} Server"
    try:
        await channel.edit(name=new_name)
    except discord.errors.HTTPException as e:
        if e.status == 429:
            retry_after = int(e.response.headers.get('Retry-After', 0)) / 1000
            await asyncio.sleep(retry_after)
            await channel.edit(name=new_name)
    timechannel = guild.get_channel(1284945488298115095)
    if timechannel is None:
        return
    current_time = datetime.now().strftime("%H:%M")
    new_time = f"🕒| {current_time} Uhr"
    try:
        await timechannel.edit(name=new_time)
    except discord.errors.HTTPException as e:
        if e.status == 429:
            retry_after = int(e.response.headers.get('Retry-After', 0)) / 1000
            await asyncio.sleep(retry_after)
            await timechannel.edit(name=new_time)


@bot.event
async def on_guild_remove(guild):
    # Settings survive a kick + re-invite — deleting here destroyed every
    # blocker/warn/whitelist config on a normal troubleshooting move.
    # Leave log (mirrors the join log; the leave channel had been dead since
    # Aug 2025) — red embed + running totals so churn vs. growth is visible.
    # Skip "ghost" stubs: Discord lists long-departed guilds as unavailable in
    # the startup payload and deletes them right after connect — same IDs fire
    # on every restart with no name/data. Not real leaves, only log noise.
    if guild.name is None:
        return
    try:
        embed = discord.Embed(title=f"{guild.name} (ID: {guild.id})", color=0xf23f43)
        embed.add_field(name=" ", value=f"Owner: <@{guild.owner_id}>", inline=False)
        embed.add_field(name="Members:", value=f"```{guild.member_count or '?'}```", inline=True)
        joined = guild.me.joined_at.strftime("%d.%m.%Y") if guild.me and guild.me.joined_at else "?"
        embed.add_field(name="Bot joined:", value=f"```{joined}```", inline=True)
        embed.set_footer(text=f"Total Server: {len(bot.guilds)}")
        channel = bot.get_channel(1280441392237252660)
        if channel:
            await channel.send(embed=embed)
    except Exception:
        pass


@bot.slash_command(name="z-database-controle", guild_ids=[864823666952372245],
    description="Admin only: check if every server ID is in the database and clean up old ones")
@commands.is_owner()
async def database(ctx):
    await ctx.defer()
    added_servers = []
    existing_servers = []
    removed_servers = []
    failed_servers = []
    data_template = {
        "channel": {"channel": [], "member": [], "role": []},
        "link": {"links": []},
        "log": {"Activated": False, "log-channel": 0, "link": 0},
        "onlylink": False,
        "safe": {
            "google": False, "youtube": False, "nsfw": False, "gif": False,
            "invite": False, "twitch": False, "bit": False, "nitro": True, "steam": False
        },
        "warn": {"kick": 3, "ban": 5},
        "protect": {
            "google": False, "youtube": False, "nsfw": False, "gif": False,
            "invite": False, "twitch": False, "bit": False, "nitro": True, "all": False, "steam": False, "malware": True,
            "files": True, "webhook": True, "mentions": False
        }
}
    try:
        servers_ref = db.reference("/servers")
        all_db_servers = servers_ref.get() or {}
        db_server_ids = set(all_db_servers.keys())
        current_guild_ids = {str(g.id) for g in bot.guilds}
        for guild in bot.guilds:
            ref = servers_ref.child(str(guild.id))
            if str(guild.id) not in db_server_ids:
                ref.set(data_template)
                added_servers.append(guild)
            else:
                existing_servers.append(guild)
        for server_id in db_server_ids - current_guild_ids:
            try:
                servers_ref.child(server_id).delete()
                removed_servers.append(server_id)
            except Exception as e:
                failed_servers.append((server_id, str(e)))
    except Exception as e:
        await ctx.respond(f"❌ Fehler beim Datenbankzugriff: {e}")
        return
    channel_id = 1402320640546963571
    channel = bot.get_channel(channel_id)
    embed = discord.Embed(
        title="Server Database Update Report",
        color=discord.Color.blue())
    embed.add_field(
        name="Ergebnis",
        value=(
            f"✅ {len(added_servers)} neue Server hinzugefügt\n"
            f"ℹ️ {len(existing_servers)} Server bereits vorhanden\n"
            f"🗑 {len(removed_servers)} alte Server entfernt\n"
            f"❌ {len(failed_servers)} Fehler bei der Verarbeitung"),inline=False)
    embed.set_footer(text="Database Update")
    if channel:
        await channel.send(embed=embed)
    else:
        print(f"Channel mit ID {channel_id} nicht gefunden!")
    await ctx.respond("``✅ - Done``")

@database.error
async def database_error(ctx, error):
    if isinstance(error, commands.NotOwner):
        embed = brand_embed("⛔ Error", "These z- commands are only for the bot owner.", kind="error")
        await ctx.respond(embed=embed, ephemeral=True)


@bot.slash_command(name="z-user-notification", guild_ids=[864823666952372245], description="Notify all server owners about update")
@commands.is_owner()
async def nootification(ctx):
    await ctx.defer()
    log_channel_id = 1402320640546963571
    log_channel = bot.get_channel(log_channel_id)
    sent = 0
    notsend = 0
    failed = []
    for guild in bot.guilds:
        try:
            owner = await bot.fetch_user(guild.owner_id)
            if owner is None:
                raise Exception("Owner not found")
            embed = discord.Embed(
                title=f"🚀 Link Protect — updated to v{BOT_VERSION}",
                description=(
                    f"**Link Protect has been updated to `v{BOT_VERSION}`.** All your settings keep working.**\n\n"
                    "🔒 All link types are now **reliably detected and filtered** again – including Discord invites, suspicious URLs, and custom patterns.\n"
                    "⚙️ Core features like `/blocker`, `/dashboard`, and advanced filtering have been updated, optimized, and fully restored.\n"
                    "🧪 Despite rigorous testing, bugs may still occur – if you notice anything unusual, please use `/support` to reach out on our support server.\nIts also important to tell me if the Bot does not detect a link!\n\n"
                    "💙 Thank you for trusting Link Protect for over **4 years**.\n"
                    "Your feedback and support have helped us grow into one of the most reliable anti-link bots on Discord.\n\n"
                    "🔧 More improvements and new features are on the way – stay tuned!\n\n"
                    "*– The Link Protect Dev Team*"),color=discord.Color.blurple())
            embed.set_footer(text="No action needed — everything keeps working.")
            await owner.send(embed=embed)
            sent += 1
            await asyncio.sleep(0.7)
        except Exception as e:
            notsend += 1
            failed.append(f"{guild.name} ({guild.id}) – {str(e)}")
    if log_channel:
        result_embed = discord.Embed(title="📬 Benachrichtigung abgeschlossen", color=discord.Color.green())
        result_embed.add_field(name="✅ Erfolgreich gesendet", value=f"{sent}", inline=True)
        result_embed.add_field(name="❌ Fehlgeschlagen", value=f"{notsend}", inline=True)
        if failed:
            result_embed.add_field(
                name="Nicht erreicht",
                value=f"```{chr(10).join(failed[:10])}```" if len(failed) > 0 else "Keine",
                inline=False)
        try:
            await log_channel.send(embed=result_embed)
        except discord.Forbidden:
            pass
    await ctx.respond("✅ Benachrichtigung gestartet, siehe Log-Channel.")


@nootification.error
async def nootification_error(ctx, error):
    if isinstance(error, commands.NotOwner):
        embed = brand_embed("⛔ Error", "These z- commands are only for the bot owner.", kind="error")
        await ctx.respond(embed=embed, ephemeral=True)

_CHANGELOG = [
    {
        "version": "3.0.1",
        "date": "29.07.2026",
        "fields": [
            ("🎯 False-positive fix: shorteners",
             " • The public threat feeds list bit.ly, tinyurl & co. as\n"
             "   'phishing' — the malware blocker treated ordinary shortened\n"
             "   links as threats. Shorteners are now permanently excluded\n"
             "   from domain-level blocking (existing entries cleaned up).\n"
             " • Blocking shorteners stays what it always was: the separate\n"
             "   opt-in Shorteners blocker (now incl. ouo.io).\n"
             " • Feed imports also skip trusted big platforms outright."),
        ],
    },
    {
        "version": "3.0.0",
        "date": "28.07.2026",
        "fields": [
            ("🛡️ Five new protections",
             " • **Edit Guard** — links edited into old messages are now\n"
             "   scanned exactly like new ones. The edit bypass is closed.\n"
             " • **Dangerous Files** — blocks executable / script / macro\n"
             "   attachments (.exe, .scr, .bat, .docm …), incl. double\n"
             "   extensions like invoice.pdf.exe.\n"
             " • **Webhook Guard** — a hijacked webhook posting a scam link\n"
             "   loses the message AND the webhook itself.\n"
             " • **Mention Spam** — mass-mention messages (8+ users/roles,\n"
             "   configurable) are removed and warned.\n"
             " • Invisible-character tricks (zero-width spaces inside\n"
             "   d​iscord.gg links) no longer fool any blocker."),
            ("📡 Always-fresh threat intel",
             " • The public anti-scam feeds are now re-imported every 24h\n"
             "   automatically — new phishing domains become live blocks\n"
             "   within minutes of publication.\n"
             " • New servers start with Dangerous Files & Webhook Guard on.\n"
             " • Fixed: the Scam Shield appeal DM was never delivered."),
        ],
    },
    {
        "version": "2.6.3",
        "date": "27.07.2026",
        "fields": [
            ("🧰 Audit release",
             " • Re-inviting the bot keeps ALL your settings now.\n"
             " • Every new-server path ships with malware & nitro-scam\n"
             "   protection already on.\n"
             " • /check-link uses the Link Protect threat DB first.\n"
             " • New /premium command · clearer command descriptions ·\n"
             "   admin commands hidden from members."),
        ],
    },
    {
        "version": "2.6.2",
        "date": "25.07.2026",
        "fields": [
            ("🖱️ Right-click moderation",
             " • Right-click any message → Apps → **Warn for this\n"
             "   message**: warns the author with the message as reason\n"
             "   and evidence — same engine, zero typing.\n"
             " • **Check links in message**: every link goes through the\n"
             "   threat database + Google Safe Browsing, verdict only\n"
             "   visible to you."),
        ],
    },
    {
        "version": "2.6.1",
        "date": "25.07.2026",
        "fields": [
            ("🛡️ Protected from minute one",
             " • New servers start with the malware/phishing and nitro-scam\n"
             "   blockers already on (zero false-positive risk).\n"
             " • On servers with protection off, spotting a KNOWN scam link\n"
             "   now triggers a one-time hint with a one-click\n"
             "   'Enable Balanced protection' button. Shown once, ever."),
        ],
    },
    {
        "version": "2.6.0",
        "date": "25.07.2026",
        "fields": [
            ("💬 Message Studio",
             " • Customize every bot message — warnings, DMs, verify &\n"
             "   lockdown texts — in the dashboard's new Messages tab,\n"
             "   with variables and tone presets."),
            ("✨ Smarter embeds",
             " • Log entries show avatars, timestamps and action colors.\n"
             " • Buttons: remove a warning or open the dashboard right\n"
             "   from the log — removals are logged transparently.\n"
             " • Optional daily digest: one summary embed per day.\n"
             " • Warned members always see their count and how many\n"
             "   warnings remain until timeout, kick or ban."),
            ("🧹 61 commands → 18",
             " • All enable-/disable- pairs became /blocker.\n"
             " • /warn add · list · remove · kick-at · ban-at · timeout\n"
             "   · decay · log — one clean command group.\n"
             " • /whitelist and /blacklist groups, rewritten /help."),
        ],
    },
    {
        "version": "2.5.1",
        "date": "25.07.2026",
        "fields": [
            ("⚠️ Missing-permission alerts",
             " • When Scam Shield, Raid Shield or a warn escalation can't\n"
             "   kick/ban/timeout someone (missing permission or role rank),\n"
             "   you now get an orange alert in your log channel, a banner\n"
             "   in the web dashboard and a push to the app — with the exact\n"
             "   fix. No more silently failed actions.\n"
             " • The invite link now requests Manage Roles & Manage Server\n"
             "   up front — the verification gate and lockdown need them."),
        ],
    },
    {
        "version": "2.5.0",
        "date": "24.07.2026",
        "fields": [
            ("🚨 Emergency Lockdown",
             " • /lockdown freezes the whole server in seconds: slowmode\n"
             "   everywhere, invites paused, every link blocked.\n"
             " • /unlock restores everything exactly as it was.\n"
             " • Also available as a button in the web dashboard & app."),
            ("✅ Verification Gate",
             " • New members verify on your personal page at\n"
             "   link-protect.com/verify/<server> — one Discord login.\n"
             " • Quarantine or verified-role mode, minimum account age,\n"
             "   customizable page. Set it up in the dashboard."),
        ],
    },
    {
        "version": "2.4.1",
        "date": "23.07.2026",
        "fields": [
            ("✨ New Features",
             " • /setup-preset — set up full protection with one command\n"
             "   (Minimal · Balanced · Strict).\n"
             " • Web: Security Score, deep link checker with redirect\n"
             "   tracing, and a developer platform (API, webhooks).\n"
             " • Manual /warn now escalates exactly like automatic\n"
             "   warnings — incl. timeout, decay and clear error hints."),
            ("🎨 Polish",
             " • One consistent look for all bot replies.\n"
             " • Rewritten welcome message with a real quick-start."),
        ],
    },
    {
        "version": "2.4.0",
        "date": "16.07.2026",
        "fields": [
            ("🛡️ Scam Shield (new!)",
             " • Stops hijacked accounts that paste the same scam into\n"
             "   every channel: all copies are deleted and the account is\n"
             "   timed out / kicked / banned — your choice.\n"
             " • Cross-server intel: accounts caught scam-spamming are\n"
             "   flagged network-wide. Enable the join check and known\n"
             "   scam accounts are removed the moment they join.\n"
             " • Set it up in the web dashboard → Scam Shield tab."),
            ("🐞 Bug Fixes",
             " • Sessions on the website no longer expire after 7 days.\n"
             " • /warn and warn-log commands no longer fail when the\n"
             "   log channel is inaccessible."),
        ],
    },
    {
        "version": "2.3.0",
        "date": "26.06.2026",
        "fields": [
            ("✨ New Features",
             " • Warning Decay — old warnings can now expire automatically\n"
             "   after a set number of days (/warn-decay).\n"
             " • Per-Channel Rules — give one channel its own rules: follow\n"
             "   the server, turn protection off, or pick custom blockers\n"
             "   (/channel-mode, /channel-block, /channel-rules).\n"
             " • iOS app: pick your app background in Settings."),
            ("🐞 Bug Fixes",
             " • Fixed 'database is locked' errors under load.\n"
             " • Kick/ban failures now explain why (owner / perms / role)\n"
             "   and show the fix directly in the warning.\n"
             " • Warnings now show how many remain until kick/ban."),
        ],
    },
]




@bot.slash_command(name="update", description="Show latest updates from Link Protect Bot")
async def _update(ctx):
    await ctx.defer()
    latest = _CHANGELOG[0]
    embed = discord.Embed(
        title=f"🔄 Update — Version {latest['version']}",
        description=f"The two most recent updates · latest {latest['date']}",
        color=discord.Color.dark_blue(),
    )
    for entry in _CHANGELOG[:2]:
        embed.add_field(
            name=f"━━━ Version {entry['version']} · {entry['date']} ━━━",
            value="​",
            inline=False,
        )
        for name, body in entry["fields"]:
            embed.add_field(name=name, value="```" + body + "```", inline=False)
    embed.set_footer(text="Older changes are no longer shown here.")
    await ctx.respond(embed=embed)

def _latency_ms():
    """Gateway latency in ms, or None when unavailable (bot.latency can be inf/NaN
    right after a (re)connect before the first heartbeat ACK)."""
    lat = bot.latency
    if lat is None or lat != lat or lat in (float("inf"), float("-inf")):
        return None
    return round(lat * 1000)


@bot.slash_command(name="ping", description="Show bot latency")
async def _ping(ctx):
    await ctx.defer()
    gateway_ms = _latency_ms()
    t_start = time.monotonic()
    await ctx.followup.send("⏱️ Measuring…")
    api_ms = round((time.monotonic() - t_start) * 1000)
    embed = discord.Embed(title="🏓 Pong!", color=BRAND_COLOR)
    embed.add_field(name="Gateway", value=f"```{gateway_ms if gateway_ms is not None else '—'} ms```", inline=True)
    embed.add_field(name="API Roundtrip", value=f"```{api_ms} ms```", inline=True)
    if gateway_ms is None:
        quality = "⚪ Connecting…"
    elif gateway_ms < 100:
        quality = "🟢 Excellent"
    elif gateway_ms < 250:
        quality = "🟡 Good"
    else:
        quality = "🔴 High latency"
    embed.set_footer(text=quality)
    await ctx.edit(content="", embed=embed)


@bot.slash_command(name="stats", description="Show bot statistics")
async def _stats(ctx):
    await ctx.defer()
    guild_count = len(bot.guilds)
    user_count = sum(g.member_count or 0 for g in bot.guilds)
    shard_count = bot.shard_count or 1
    embed = discord.Embed(title="📊 Link Protect — Stats", color=BRAND_COLOR)
    embed.add_field(name="Servers", value=f"```{guild_count:,}```", inline=True)
    embed.add_field(name="Users", value=f"```{user_count:,}```", inline=True)
    embed.add_field(name="Shards", value=f"```{shard_count}```", inline=True)
    _lat_ms = _latency_ms()
    embed.add_field(name="Latency", value=f"```{_lat_ms if _lat_ms is not None else '—'} ms```", inline=True)
    uptime_s = int(time.monotonic() - _startup_time)
    h, rem = divmod(uptime_s, 3600)
    m, s = divmod(rem, 60)
    embed.add_field(name="Uptime", value=f"```{h}h {m}m {s}s```", inline=True)
    embed.add_field(name="Version", value=f"```{BOT_VERSION}```", inline=True)
    await ctx.respond(embed=embed)


@bot.slash_command(name="check-link", description="Manually scan a URL for malware")
async def _check_link(ctx, url: discord.Option(str, "URL to scan (must start with http:// or https://)")):
    await ctx.defer()
    if not url.startswith(("http://", "https://")):
        url = "https://" + url
    # Our own threat DB first — the same source the blockers use. Without this,
    # /check-link called domains "safe" that the bot itself blocks.
    try:
        from cogs.shared import load_known_bad_sync, known_bad_category, _domain_of
        kb = await asyncio.to_thread(load_known_bad_sync)
        cat = known_bad_category(_domain_of(url), kb) if kb else None
        if cat:
            await ctx.followup.send(embed=discord.Embed(
                title="🚨 Dangerous Link Detected",
                description=f"**URL:** ||`{url[:300]}`||\n**Threat:** `{cat}` "
                            f"(Link Protect threat database)\n\n⛔ Do **not** click or share this link.",
                color=discord.Color.red()))
            return
    except Exception:
        pass
    if not SAFE_BROWSING_KEY:
        await ctx.followup.send(embed=discord.Embed(
            title="⚠️ Partial scan only",
            description="Nothing found in the Link Protect threat database, but the external "
                        "malware scanner is currently unavailable — treat unknown links with care.",
            color=discord.Color.orange()))
        return
    SAFE_BROWSING_URL = (
        "https://safebrowsing.googleapis.com/v4/threatMatches:find"
        f"?key={SAFE_BROWSING_KEY}"
    )
    payload = {
        "client": {"clientId": "link-protect-bot", "clientVersion": BOT_VERSION},
        "threatInfo": {
            "threatTypes": ["MALWARE", "SOCIAL_ENGINEERING",
                            "POTENTIALLY_HARMFUL_APPLICATION", "UNWANTED_SOFTWARE"],
            "platformTypes": ["ANY_PLATFORM"],
            "threatEntryTypes": ["URL"],
            "threatEntries": [{"url": url}],
        },
    }
    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(SAFE_BROWSING_URL, json=payload,
                                    timeout=aiohttp.ClientTimeout(total=8)) as resp:
                result = await resp.json()
                matches = result.get("matches", [])
        if matches:
            threat_type = matches[0].get("threatType", "UNKNOWN")
            embed = discord.Embed(
                title="🚨 Dangerous Link Detected",
                description=f"**URL:** ||`{url[:300]}`||\n**Threat:** `{threat_type}`\n\n"
                            "⛔ Do **not** click or share this link.",
                color=discord.Color.red(),
            )
        else:
            embed = discord.Embed(
                title="✅ Link appears safe",
                description=f"**URL:** `{url[:300]}`\n\nNo threats found in Google Safe Browsing database.\n"
                            "*Note: This does not guarantee the link is 100% safe.*",
                color=discord.Color.green(),
            )
    except Exception as e:
        embed = discord.Embed(
            title="⛔ Scan Failed",
            description=f"Could not reach the malware database.\n```{str(e)[:200]}```\nTry again later or use `/support`.",
            color=discord.Color.red(),
        )
    await ctx.followup.send(embed=embed)



# ═══════════════════ Consolidated commands (v2.6.0) ═══════════════════
# 47 legacy commands (enable-X/disable-X pairs, warn-*, link-*) became four
# clean entry points: /blocker, /warn …, /whitelist …, /blacklist ….
_MOD_PERMS = discord.Permissions(manage_guild=True)
warn_grp = bot.create_group("warn", "Warnings — issue, inspect and configure",
                            default_member_permissions=discord.Permissions(kick_members=True))
wl_grp = bot.create_group("whitelist", "Let channels, members or roles bypass the blockers",
                          default_member_permissions=_MOD_PERMS)
bl_grp = bot.create_group("blacklist", "Your server's custom blocked links",
                          default_member_permissions=_MOD_PERMS)

_BLOCKER_MAP = {"all": "all", "google": "google", "youtube": "youtube", "nsfw": "nsfw",
                "gif": "gif", "invites": "invite", "shorteners": "bit", "nitro": "nitro",
                "twitch": "twitch", "steam": "steam", "malware": "malware",
                "dangerous-files": "files", "webhooks": "webhook", "mention-spam": "mentions"}


@bot.slash_command(name="blocker", description="Turn a link blocker (or silent mode) on or off",
                   default_member_permissions=_MOD_PERMS)
async def _blocker_cmd(ctx,
                       blocker: discord.Option(str, "Which blocker",
                                               choices=sorted(_BLOCKER_MAP.keys()) + ["silent-mode"]),
                       state: discord.Option(str, "New state", choices=["on", "off"])):
    await ctx.defer()
    if not (ctx.author.guild_permissions.manage_messages or ctx.author.guild_permissions.administrator):
        return await ctx.followup.send(embed=brand_embed(
            "⛔ Error", "You need `Manage Messages` or `Administrator` permissions.", kind="error"))
    guild_id = str(ctx.guild.id)
    on = state == "on"
    if blocker == "silent-mode":
        path, label = f"/servers/{guild_id}/silent", "Silent mode"
    else:
        path, label = f"/servers/{guild_id}/protect/{_BLOCKER_MAP[blocker]}", f"{blocker.capitalize()} blocker"
    try:
        await asyncio.to_thread(lambda: db.reference(path).set(on))
        note = ""
        if blocker not in ("all", "silent-mode"):
            protect = await asyncio.to_thread(lambda: db.reference(f"/servers/{guild_id}/protect").get()) or {}
            if protect.get("all"):
                note = "\n-# Heads up: **Block All Links** is on — it overrides individual blockers."
        await ctx.followup.send(embed=brand_embed(
            f"{'✅' if on else '🛑'} {label} {'enabled' if on else 'disabled'}",
            f"{label} is now **{'on' if on else 'off'}**.{note}", kind="success" if on else "info"))
    except Exception as e:
        await ctx.followup.send(embed=brand_embed(
            "⛔ Error", f"Something went wrong.\nUse /support for help.\n```{e}```", kind="error"))


_HELP_PAGES = {
    "start": ("🚀 Getting started",
              "**/setup-preset** — full protection in one command (Minimal · Balanced · Strict)\n"
              "**/dashboard** — your server's status + a link to the web dashboard\n"
              "**/blocker** — turn any link blocker on or off\n"
              "**/check-link** — scan a URL against the threat database"),
    "warn": ("⚠️ Warnings",
             "**/warn add** — warn a member  ·  **/warn list** — their warnings\n"
             "**/warn remove · reset · clear-server** — manage records\n"
             "**/warn kick-at · ban-at · timeout · decay** — escalation thresholds\n"
             "**/warn log** — send every action into a mod channel (**/warn log-off** stops it)\n"
             "-# Tip: right-click any message → **Apps** → *Warn for this message* / *Check links*"),
    "lists": ("📋 Whitelist & blacklist",
              "**/whitelist channel-add / member-add / role-add** — let them bypass blockers\n"
              "**/whitelist only-link** — links allowed only in one channel\n"
              "**/blacklist add / remove / list** — your custom blocked links\n"
              "**/channel-mode · channel-block · channel-rules · channel-reset** — per-channel rules"),
    "security": ("🛡️ Security",
                 "**/lockdown** — freeze the whole server in an emergency (**/unlock** restores)\n"
                 "Scam Shield, Raid Shield & the verification gate are configured in the "
                 "[web dashboard](https://link-protect.com/dashboard)"),
    "info": ("ℹ️ Info",
             "**/stats · /ping · /modstats · /update** — numbers & news\n"
             "**/invite** — add Link Protect to another server\n"
             "**/support** — join the support server\n"
             "**/premium** — what Premium adds (protection itself is free forever)"),
}


class _HelpView(discord.ui.View):
    def __init__(self):
        super().__init__(timeout=300)

    @discord.ui.select(placeholder="Pick a topic…", options=[
        discord.SelectOption(label="Getting started", value="start", emoji="🚀"),
        discord.SelectOption(label="Warnings", value="warn", emoji="⚠️"),
        discord.SelectOption(label="Whitelist & blacklist", value="lists", emoji="📋"),
        discord.SelectOption(label="Security", value="security", emoji="🛡️"),
        discord.SelectOption(label="Info", value="info", emoji="ℹ️"),
    ])
    async def _pick(self, select, interaction):
        title, body = _HELP_PAGES[select.values[0]]
        await interaction.response.edit_message(embed=brand_embed(title, body))


@bot.slash_command(name="premium", description="What Link Protect Premium adds — and what stays free forever")
async def _premium_cmd(ctx):
    from cogs.shared import _get_conn as _pc
    import json as _json
    active = False
    try:
        row = _pc().execute("SELECT value FROM kv WHERE path=?", (f"premium:{ctx.guild.id}",)).fetchone()
        d = _json.loads(row[0]) if row else {}
        active = bool(d.get("active"))
    except Exception:
        pass
    e = brand_embed(
        "💎 Link Protect Premium",
        ("**This server has Premium — thank you!** 💜\n\n" if active else "") +
        "**Every security feature is free — for every server, forever.** "
        "Premium adds personalization and extras, never protection:\n\n"
        "• Custom embed color & footer, welcome/leave messages\n"
        "• Verify page: your logo, own rules gate, vanity link\n"
        "• Watchlist, night schedule & event mode, one-click undo\n"
        "• Settings sync across servers · 10× API limits\n\n"
        f"**3,49 €/month per server** — manage it in the "
        f"[dashboard](https://link-protect.com/dashboard/{ctx.guild.id}).")
    await ctx.respond(embed=e, ephemeral=True)


@bot.slash_command(name="help", description="All commands and how to set up Link Protect")
async def _help(ctx):
    title, body = _HELP_PAGES["start"]
    e = brand_embed(title, body)
    e.set_footer(text="Link Protect • Most settings live in the dashboard: link-protect.com")
    await ctx.respond(embed=e, view=_HelpView())


@warn_grp.command(name="reset", description="Reset ALL warnings for a specific user")
async def _warn_reset(ctx, member: discord.Member):
    await ctx.defer()
    if not (ctx.author.guild_permissions.manage_messages or ctx.author.guild_permissions.administrator):
        embed = discord.Embed(
            title="⛔ ERROR",
            description="You need `Manage Messages` or `Administrator` permissions to run this command.",
            color=discord.Color.red(),
        )
        await ctx.followup.send(embed=embed)
        return
    guild_id = str(ctx.guild.id)
    user_id = str(member.id)
    ref = db.reference(f"/servers/{guild_id}/warn/{user_id}")
    data = await asyncio.to_thread(ref.get)
    if not data or data.get("Warn", 0) == 0:
        embed = discord.Embed(
            title="INFO",
            description=f"{member.mention} has no warnings.",
            color=discord.Color.orange(),
        )
        await ctx.followup.send(embed=embed)
        return
    old_count = data.get("Warn", 0)
    await asyncio.to_thread(ref.set, {"Warn": 0, "reason": []})
    embed = discord.Embed(
        title="✅ Warnings Reset",
        description=f"Reset **{old_count}** warning(s) for {member.mention}.",
        color=discord.Color.green(),
    )
    await ctx.followup.send(embed=embed)
    log_ref = db.reference(f"/servers/{guild_id}/log")
    log_data = await asyncio.to_thread(log_ref.get) or {}
    if log_data.get("Activated") and log_data.get("log-channel", 0):
        log_channel = bot.get_channel(int(log_data["log-channel"]))
        if log_channel:
            log_embed = discord.Embed(
                title="[AUTO-MOD] Warnings Reset",
                description=f"{ctx.author.mention} reset all {old_count} warning(s) for {member.mention}.",
                color=discord.Color.blurple(),
            )
            try:
                await log_channel.send(embed=log_embed)
            except discord.Forbidden:
                pass  # No access to the configured log channel.


@bot.slash_command(name="invite", description="Invite Link Protect to your server")
async def _invite(ctx):
    await ctx.defer()
    embed = brand_embed(
        "➕ Invite Link Protect",
        "Protect another server in 30 seconds — "
        "[**click here to invite Link Protect**](https://discord.com/oauth2/authorize?client_id=888390889892892684&permissions=1376805547126&integration_type=0&scope=bot)",
    )
    await ctx.respond(embed=embed)


@bot.slash_command(name="support", description="Join the Link Protect support server")
async def _support(ctx):
    await ctx.defer()
    embed = brand_embed(
        "💬 Support",
        "Questions, bug reports or feature ideas?\n"
        "[**Join the support server**](https://discord.gg/BjDC9t329E) — we usually reply within a few hours.",
    )
    await ctx.respond(embed=embed)


# ── One-command setup presets (mirrors the iOS app's Quick Setup) ─────────────
# Only security-relevant settings are touched — taste blockers like YouTube or
# GIFs are never changed by a preset.
_PRESETS = {
    "minimal": {
        "label": "Minimal", "emoji": "🟢",
        "protect": {"malware": True, "nitro": True, "bit": False, "nsfw": False, "invite": False,
                    "files": True, "webhook": True, "mentions": False},
        "raid": False, "scam": False, "join_check": False,
        "blurb": "Just the essentials: malware/phishing links, nitro scams, dangerous files and hijacked webhooks are blocked.",
    },
    "balanced": {
        "label": "Balanced", "emoji": "🔵",
        "protect": {"malware": True, "nitro": True, "bit": True, "nsfw": True, "invite": False,
                    "files": True, "webhook": True, "mentions": False},
        "raid": True, "scam": True, "join_check": False,
        "blurb": "Recommended: threat blockers plus raid protection and Scam Shield.",
    },
    "strict": {
        "label": "Strict", "emoji": "🔴",
        "protect": {"malware": True, "nitro": True, "bit": True, "nsfw": True, "invite": True,
                    "files": True, "webhook": True, "mentions": True},
        "raid": True, "scam": True, "join_check": True,
        "blurb": "Maximum protection: everything in Balanced plus invite blocking, mention-spam defense and the known-scammer join check.",
    },
}


def _apply_preset_sync(guild_id: str, preset: str) -> bool:
    """Write a preset's settings. Returns True when warn thresholds were set."""
    p = _PRESETS[preset]
    for key, val in p["protect"].items():
        db.reference(f"/servers/{guild_id}/protect/{key}").set(val)
    db.reference(f"/servers/{guild_id}/raid/enabled").set(p["raid"])
    db.reference(f"/servers/{guild_id}/scamguard/enabled").set(p["scam"])
    db.reference(f"/servers/{guild_id}/scamguard/join_check").set(p["join_check"])
    warn = db.reference(f"/servers/{guild_id}/warn").get() or {}
    timeout_cfg = warn.get("timeout") or {}
    if preset != "minimal" and not warn.get("kick") and not warn.get("ban") \
            and not timeout_cfg.get("warnings"):
        db.reference(f"/servers/{guild_id}/warn/timeout").set({"warnings": 3, "time": 10})
        db.reference(f"/servers/{guild_id}/warn/kick").set(5)
        db.reference(f"/servers/{guild_id}/warn/ban").set(8)
        return True
    return False


@bot.slash_command(name="setup-preset", default_member_permissions=discord.Permissions(manage_guild=True),
                   description="Set up protection with one command: Minimal, Balanced or Strict")
async def _setup_preset(ctx, preset: discord.Option(str, "Protection level",
                                                    choices=["minimal", "balanced", "strict"])):
    await ctx.defer()
    if not (ctx.author.guild_permissions.manage_guild or ctx.author.guild_permissions.administrator):
        await ctx.followup.send(embed=brand_embed(
            "⛔ Missing permission",
            "You need `Manage Server` or `Administrator` permission to apply a preset.",
            kind="error"))
        return
    p = _PRESETS[preset]
    guild_id = str(ctx.guild.id)

    try:
        touched_warn = await asyncio.to_thread(_apply_preset_sync, guild_id, preset)
    except Exception as e:
        await ctx.followup.send(embed=brand_embed(
            "⛔ Error", f"Couldn't apply the preset.\n```{str(e)[:200]}```", kind="error"))
        return

    def onoff(v):
        return "✅" if v else "▫️"
    lines = [
        f"{onoff(p['protect']['malware'])} Malware & phishing blocker",
        f"{onoff(p['protect']['nitro'])} Nitro-scam blocker",
        f"{onoff(p['protect']['nsfw'])} NSFW blocker",
        f"{onoff(p['protect']['bit'])} URL-shortener blocker",
        f"{onoff(p['protect']['invite'])} Discord-invite blocker",
        f"{onoff(p['raid'])} Raid protection",
        f"{onoff(p['scam'])} Scam Shield (cross-channel spam)",
        f"{onoff(p['join_check'])} Known-scammer join check",
    ]
    embed = brand_embed(f"{p['emoji']} Preset applied — {p['label']}", p["blurb"], kind="success")
    embed.add_field(name="Your protection now", value="\n".join(lines), inline=False)
    if touched_warn:
        embed.add_field(name="⚠️ Warning thresholds",
                        value="Set to sensible defaults: timeout at 3 (10 min) · kick at 5 · ban at 8.",
                        inline=False)
    embed.add_field(name="Fine-tuning",
                    value=f"Everything can be adjusted in the [web dashboard](https://link-protect.com/dashboard/{guild_id}).",
                    inline=False)
    await ctx.followup.send(embed=embed)


# ── Emergency lockdown ────────────────────────────────────────────────────────
# The heavy lifting (slowmode on every channel, invite pause, link freeze,
# restore state) lives in api_server.py so web dashboard, iOS app and this
# command share ONE implementation. The bot calls it over localhost.
LP_API_URL = os.environ.get("LP_API_URL", "http://127.0.0.1:3002")
LP_API_SECRET = os.environ.get("BOT_API_SECRET", "")


async def _call_lockdown(ctx, active: bool, reason: str | None) -> None:
    if not (ctx.author.guild_permissions.manage_guild or ctx.author.guild_permissions.administrator):
        await ctx.followup.send(embed=brand_embed(
            "⛔ Missing permission",
            "You need `Manage Server` or `Administrator` permission for lockdown controls.",
            kind="error"))
        return
    if not LP_API_SECRET:
        await ctx.followup.send(embed=brand_embed(
            "⛔ Not configured",
            "Lockdown isn't configured on this bot instance — use the web dashboard instead.",
            kind="error"))
        return
    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(
                f"{LP_API_URL}/api/guild/{ctx.guild.id}/lockdown",
                json={"active": active, "reason": reason},
                headers={"Authorization": f"Bearer {LP_API_SECRET}",
                         "X-Actor-Id": str(ctx.author.id),
                         "X-Actor-Name": ctx.author.display_name},
                timeout=aiohttp.ClientTimeout(total=180),
            ) as resp:
                d = await resp.json()
    except Exception:
        await ctx.followup.send(embed=brand_embed(
            "⛔ Error", "Couldn't reach the lockdown service — try the web dashboard.",
            kind="error"))
        return
    if active:
        steps = d.get("steps") or {}
        if d.get("alreadyActive"):
            await ctx.followup.send(embed=brand_embed(
                "ℹ️ Already locked down", "This server is already in lockdown — use `/unlock` to lift it.",
                kind="info"))
            return
        embed = brand_embed("🚨 Lockdown active",
                            "The server is frozen. Lift it any time with `/unlock`.", kind="error")
        embed.add_field(name="What just happened", value=(
            f"⏳ Slowmode ({_LOCKDOWN_SLOWMODE_TEXT}) on **{steps.get('slowmode', 0)}** channels\n"
            f"{'📪 Invites paused' if steps.get('invites') else '📪 Invites: no change (check Manage Server perm)'}\n"
            f"{'🔗 All links blocked' if steps.get('links') else '🔗 Links were already fully blocked'}"),
            inline=False)
        if reason:
            embed.add_field(name="Reason", value=reason[:200], inline=False)
        await ctx.followup.send(embed=embed)
    else:
        if d.get("alreadyInactive"):
            await ctx.followup.send(embed=brand_embed(
                "ℹ️ Not locked down", "This server isn't in lockdown.", kind="info"))
            return
        steps = d.get("steps") or {}
        await ctx.followup.send(embed=brand_embed(
            "✅ Lockdown lifted",
            f"Slowmode restored on **{steps.get('slowmode', 0)}** channels, invites and "
            "link rules are back to normal.", kind="success"))


_LOCKDOWN_SLOWMODE_TEXT = "30s"


@bot.slash_command(name="lockdown", default_member_permissions=discord.Permissions(manage_guild=True),
                   description="EMERGENCY: freeze the server — slowmode everywhere, invites paused, all links blocked")
async def _lockdown_cmd(ctx, reason: discord.Option(str, "What's happening?", required=False) = None):
    await ctx.defer()
    await _call_lockdown(ctx, True, reason)


@bot.slash_command(name="unlock", default_member_permissions=discord.Permissions(manage_guild=True), description="Lift the lockdown and restore everything")
async def _unlock_cmd(ctx):
    await ctx.defer()
    await _call_lockdown(ctx, False, None)


@bot.slash_command(name="dashboard", description="Show dashboard and status")
async def _dashboard(ctx):
    deferred = await safe_defer(ctx)
    guild_id = str(ctx.guild.id)
    def status(val):
        return "<:onn:1406759743309090908>" if val else "<:off:1406759741551808743>"
    async def fetch(ref_path, fallback=None):
        try:
            return await asyncio.to_thread(lambda: db.reference(ref_path).get()) or fallback
        except Exception as e:
            print(f"[dashboard:db] {ref_path} -> {e}")
            return fallback
    base = f"/servers/{guild_id}"
    log_data = await fetch(f"{base}/log", {"Activated": False, "log-channel": 0, "link": 0})
    warn_data = await fetch(f"{base}/warn", {"kick": 3, "ban": 5})
    protect_data = await fetch(f"{base}/protect", {
        "google": False, "youtube": False, "nsfw": False, "gif": False,
        "invite": False, "twitch": False, "bit": False, "nitro": True, "all": False, "steam": False, "malware": True})
    if "steam" not in protect_data:
        protect_data["steam"] = False
        await asyncio.to_thread(lambda: db.reference(f"{base}/protect/steam").set(False))
    safe_data = await fetch(f"{base}/safe", {
        "google": False, "youtube": False, "nsfw": False, "gif": False,
        "invite": False, "twitch": False, "bit": False, "nitro": True, "steam": False})
    channel_data = await fetch(f"{base}/channel", {"channel": [], "category": [], "member": [], "role": []})
    link_data = await fetch(f"{base}/link", {"links": 0})
    kick = warn_data.get("kick", 3)
    ban = warn_data.get("ban", 5)
    timeout_data = warn_data.get("timeout", {})
    timeout_warns = timeout_data.get("warnings", 0)
    timeout_time = timeout_data.get("time", 0)
    log_channel = log_data.get("log-channel", 0)
    only_link_channel = log_data.get("link", 0)
    embed = discord.Embed(title="Dashboard", color=BRAND_COLOR)
    embed.add_field(name="``Link Protection Blocker``", value=f" ", inline=False)
    embed.add_field(name="Google:", value=f"{status(protect_data['google'])} `- {'ON' if protect_data['google'] else 'OFF'}`", inline=True)
    embed.add_field(name="Youtube:", value=f"{status(protect_data['youtube'])} `- {'ON' if protect_data['youtube'] else 'OFF'}`", inline=True)
    embed.add_field(name="NSFW:", value=f"{status(protect_data['nsfw'])} `- {'ON' if protect_data['nsfw'] else 'OFF'}`", inline=True)
    embed.add_field(name="Gif:", value=f"{status(protect_data['gif'])} `- {'ON' if protect_data['gif'] else 'OFF'}`", inline=True)
    embed.add_field(name="Invite:", value=f"{status(protect_data['invite'])} `- {'ON' if protect_data['invite'] else 'OFF'}`", inline=True)
    embed.add_field(name="Bitly:", value=f"{status(protect_data['bit'])} `- {'ON' if protect_data['bit'] else 'OFF'}`", inline=True)
    embed.add_field(name="Nitro:", value=f"{status(protect_data['nitro'])} `- {'ON' if protect_data['nitro'] else 'OFF'}`", inline=True)
    embed.add_field(name="Twitch:", value=f"{status(protect_data['twitch'])} `- {'ON' if protect_data['twitch'] else 'OFF'}`", inline=True)
    embed.add_field(name="Steam:", value=f"{status(protect_data['steam'])} `- {'ON' if protect_data['steam'] else 'OFF'}`", inline=True)
    embed.add_field(name="All Links:", value=f"{status(protect_data['all'])} `- {'ON' if protect_data['all'] else 'OFF'}`", inline=False)
    embed.add_field(name="``Sending permission``", value=f" ", inline=False)
    channels = channel_data.get("channel", [])
    categories = channel_data.get("category", [])
    roles = channel_data.get("role", [])
    members = channel_data.get("member", [])
    embed.add_field(name="Enabled Channels:",
                    value="```❌ - Empty```" if not channels else ", ".join([f"<#{c}>" for c in channels]), inline=True)
    embed.add_field(name="Enabled Categories:",
                    value="```❌ - Empty```" if not categories else ", ".join([f"`{c}`" for c in categories]), inline=True)
    embed.add_field(name="Enabled Roles:",
                    value="```❌ - Empty```" if not roles else ", ".join([f"<@&{c}>" for c in roles]), inline=True)
    embed.add_field(name="Enabled Members:",
                    value="```❌ - Empty```" if not members else ", ".join([f"<@{c}>" for c in members]), inline=True)
    embed.add_field(name="``Warn-Log Channel:``", value=f"<#{log_channel}>" if log_channel else "```❌ - Off```",
                    inline=True)
    embed.add_field(name="``Only Link Channel``",
                    value=f"<#{only_link_channel}>" if only_link_channel else "```❌ - Off```", inline=True)
    embed.add_field(name="``Warn Protection:``", value=f" ", inline=False)
    embed.add_field(name="Warn Timeout:", value=f"```✅ {timeout_warns} → {timeout_time} min```" if timeout_warns else "```❌ - Off```", inline=True)
    embed.add_field(name="Warn Kick:", value=f"```✅ {kick}```" if kick else "```❌ - Off```")
    embed.add_field(name="Warn Ban:", value=f"```✅ {ban}```" if ban else "```❌ - Off```")
    embed.add_field(name="``Malware Secure``", value=" ", inline = False)
    embed.add_field(name=f"Malware Link Scanner is currently {status(protect_data['malware'])} `- {'ON' if protect_data['malware'] else 'OFF'}`", value=f"", inline=True)
    if link_data == 0:
        embed.set_footer(text="For blocking your own links, use /blacklist add")
    else:
        embed.set_footer(text="Need help? Join the support server /support")
    embed.add_field(
        name="``Web Dashboard``",
        value=f"Manage all your settings on the website:\n🌐 **[link-protect.com](https://link-protect.com/dashboard/{guild_id})**",
        inline=False)
    view = discord.ui.View()
    view.add_item(discord.ui.Button(
        label="Open Web Dashboard",
        url=f"https://link-protect.com/dashboard/{guild_id}",
        emoji="🌐"))
    try:
        if deferred:
            await ctx.followup.send(embed=embed, view=view)
        else:
            await ctx.respond(embed=embed, view=view)
    except discord.NotFound:
        print("[dashboard] interaction expired")
    except Exception as e:
        print(f"[dashboard:respond] {e}")


@wl_grp.command(name="channel-remove", description="Remove a channel from the whitelist")
async def _dischannel(ctx, name: discord.Option(str, "Mention the channel to disable (e.g. #general)")):
    await ctx.defer()
    guild_id = str(ctx.guild.id)
    if not (ctx.author.guild_permissions.manage_messages or ctx.author.guild_permissions.administrator):
        embed = brand_embed("⛔ Error", "You need Manage Messages or Administrator permissions to run this command", kind="error")
        await ctx.followup.send(embed=embed)
        return
    if not name.startswith("<#") or not name.endswith(">"):
        embed = brand_embed("⛔ Error", "Please provide a valid channel mention like #channel.", kind="error")
        await ctx.followup.send(embed=embed)
        return
    channel_id = name.replace("<#", "").replace(">", "")
    ref = db.reference(f"/servers/{guild_id}/channel/channel")
    current_channels = ref.get() or []
    if not isinstance(current_channels, list) or len(current_channels) == 0:
        embed = brand_embed("⛔ Error", "You have no enabled channels.", kind="error")
        await ctx.followup.send(embed=embed)
        return
    if channel_id in current_channels:
        current_channels.remove(channel_id)
        ref.set(current_channels)
        embed = brand_embed("Channel", f"{name} has been disabled.", kind="success")
        await ctx.followup.send(embed=embed)
    else:
        embed = brand_embed("ℹ️ Info", f"{name} is not enabled.", kind="info")
        await ctx.followup.send(embed=embed)


@wl_grp.command(name="channel-add", description="Whitelist a channel — links are allowed there")
async def _enchannel(ctx, name: discord.Option(str, "Mention the channel to enable (e.g. #general)")):
    await ctx.defer()
    guild_id = str(ctx.guild.id)
    if not (ctx.author.guild_permissions.manage_messages or ctx.author.guild_permissions.administrator):
        embed = brand_embed("⛔ Error", "You need Manage Messages or Administrator permissions to run this command", kind="error")
        await ctx.followup.send(embed=embed)
        return
    if not name.startswith("<#") or not name.endswith(">"):
        embed = brand_embed("⛔ Error", "Please provide a valid channel mention like #channel.", kind="error")
        await ctx.followup.send(embed=embed)
        return
    channel_id = name.replace("<#", "").replace(">", "")
    ref = db.reference(f"/servers/{guild_id}/channel/channel")
    current_channels = ref.get()
    if not isinstance(current_channels, list):
        current_channels = []
        ref.set([])
    if channel_id in current_channels:
        embed = brand_embed("ℹ️ Info", f"{name} is already enabled.", kind="info")
        await ctx.followup.send(embed=embed)
        return
    current_channels.append(channel_id)
    ref.set(current_channels)
    embed = brand_embed("Channel", f"{name} has been enabled.", kind="success")
    await ctx.followup.send(embed=embed)


@wl_grp.command(name="only-link",
                   description="Set a channel where the bot deletes every message that is not a link.")
async def _enlink(ctx, channelname: discord.Option(str, "Mention the channel (e.g. #general)")):
    await ctx.defer()
    guild_id = str(ctx.guild.id)
    if not (ctx.author.guild_permissions.manage_messages or ctx.author.guild_permissions.administrator):
        embed = brand_embed("⛔ Error", "You need `Manage Messages` or `Administrator` permissions to run this command", kind="error")
        await ctx.followup.send(embed=embed)
        return
    if not channelname.startswith("<#") or not channelname.endswith(">"):
        embed = brand_embed("⛔ Error", "Please mention a valid channel like `#general`.", kind="error")
        await ctx.followup.send(embed=embed)
        return
    channel_id = int(channelname.replace("<#", "").replace(">", ""))
    ref_link = db.reference(f"/servers/{guild_id}/log/link")
    ref_onlylink = db.reference(f"/servers/{guild_id}/log/onlylink")
    current = ref_link.get() or 0
    if current == channel_id:
        embed = brand_embed("ℹ️ Info", f"<#{current}> is already the only link channel.", kind="info")
        await ctx.followup.send(embed=embed)
        return
    ref_link.set(channel_id)
    ref_onlylink.set(True)
    channel = ctx.guild.get_channel(channel_id)
    await channel.send("This channel is set for **Only Links**.")
    embed = brand_embed("Only Link", f"{channel.mention} is now the active Only Link Channel.", kind="success")
    await ctx.followup.send(embed=embed)


@wl_grp.command(name="only-link-off",
                   description="Disable the channel where the bot deletes messages that are not links.")
async def _dislink(ctx):
    await ctx.defer()
    guild_id = str(ctx.guild.id)
    if not (ctx.author.guild_permissions.manage_messages or ctx.author.guild_permissions.administrator):
        embed = brand_embed("⛔ Error", "You need `Manage Messages` or `Administrator` permissions to run this command", kind="error")
        await ctx.followup.send(embed=embed)
        return
    ref_link = db.reference(f"/servers/{guild_id}/log/link")
    ref_onlylink = db.reference(f"/servers/{guild_id}/log/onlylink")
    current = ref_link.get() or 0
    if current == 0:
        embed = brand_embed("ℹ️ Info", "No 'Only Link' channel is currently enabled.", kind="info")
        await ctx.followup.send(embed=embed)
        return
    ref_link.set(0)
    ref_onlylink.set(False)
    embed = brand_embed("Only Link", f"<#{current}> has been disabled as the 'Only Link' channel.", kind="success")
    await ctx.followup.send(embed=embed)


@wl_grp.command(name="member-remove", description="Remove a member from the whitelist")
async def _dismember(ctx, member: discord.Option(str, "Mention the member to disable (e.g. @User)")):
    await ctx.defer()
    guild_id = str(ctx.guild.id)
    if not (ctx.author.guild_permissions.manage_messages or ctx.author.guild_permissions.administrator):
        embed = brand_embed("⛔ Error", "You need Manage Messages or Administrator permissions to run this command", kind="error")
        await ctx.followup.send(embed=embed)
        return
    if not member.startswith("<@") or not member.endswith(">"):
        embed = brand_embed("⛔ Error", "Please provide a member mention like @username", kind="error")
        await ctx.followup.send(embed=embed)
        return
    member_id = member.replace("<@", "").replace(">", "").replace("!", "")
    ref = db.reference(f"/servers/{guild_id}/channel/member")
    member_list = ref.get()
    if not isinstance(member_list, list) or len(member_list) == 0:
        embed = brand_embed("ℹ️ Info", "You have no enabled members.", kind="info")
        await ctx.followup.send(embed=embed)
        return
    if member_id in member_list:
        member_list.remove(member_id)
        ref.set(member_list)
        embed = brand_embed("Member", f"{member} has been disabled.", kind="success")
        await ctx.followup.send(embed=embed)
    else:
        embed = brand_embed("ℹ️ Info", f"{member} is not enabled.", kind="info")
        await ctx.followup.send(embed=embed)


@wl_grp.command(name="member-add", description="Whitelist a member — their links are always allowed")
async def _enmember(ctx, member: discord.Option(str, "Mention the member to enable (e.g. @user)")):
    await ctx.defer()
    guild_id = str(ctx.guild.id)
    if not (ctx.author.guild_permissions.manage_messages or ctx.author.guild_permissions.administrator):
        embed = brand_embed("⛔ Error", "You need Manage Messages or Administrator permissions to run this command", kind="error")
        await ctx.followup.send(embed=embed)
        return
    if not member.startswith("<@") or not member.endswith(">"):
        embed = brand_embed("⛔ Error", "Please provide a valid member mention like @username.", kind="error")
        await ctx.followup.send(embed=embed)
        return
    member_id = member.replace("<@", "").replace(">", "").replace("!", "")
    ref = db.reference(f"/servers/{guild_id}/channel/member")
    member_list = ref.get()
    if not isinstance(member_list, list):
        member_list = []
        ref.set([])
    if member_id in member_list:
        embed = brand_embed("ℹ️ Info", f"{member} is already enabled.", kind="info")
        await ctx.followup.send(embed=embed)
        return
    member_list.append(member_id)
    ref.set(member_list)
    embed = brand_embed("Member", f"{member} has been enabled.", kind="success")
    await ctx.followup.send(embed=embed)


@wl_grp.command(name="role-remove", description="Remove a role from the whitelist")
async def _disrole(ctx, role: discord.Option(str, "Mention the role to disable (e.g. @role)")):
    await ctx.defer()
    guild_id = str(ctx.guild.id)
    if not (ctx.author.guild_permissions.manage_messages or ctx.author.guild_permissions.administrator):
        embed = brand_embed("⛔ Error", "You need `Manage Messages` or `Administrator` permissions to run this command", kind="error")
        await ctx.followup.send(embed=embed)
        return
    if not role.startswith("<@&") or not role.endswith(">"):
        embed = brand_embed("⛔ Error", "Please provide a role mention like `@rolename`", kind="error")
        await ctx.followup.send(embed=embed)
        return
    role_id = role.replace("<@&", "").replace(">", "")
    ref = db.reference(f"/servers/{guild_id}/channel/role")
    role_list = ref.get()
    if not isinstance(role_list, list) or len(role_list) == 0:
        embed = brand_embed("ℹ️ Info", "You have no enabled roles.", kind="info")
        await ctx.followup.send(embed=embed)
        return
    if role_id in role_list:
        role_list.remove(role_id)
        ref.set(role_list)
        embed = brand_embed("Role", f"{role} has been disabled.", kind="success")
        await ctx.followup.send(embed=embed)
    else:
        embed = brand_embed("ℹ️ Info", f"{role} is not enabled.", kind="info")
        await ctx.followup.send(embed=embed)


@wl_grp.command(name="role-add", description="Whitelist a role — its links are always allowed")
async def _enrole(ctx, role: discord.Option(str, "Mention the role to enable (e.g. @role)")):
    await ctx.defer()
    guild_id = str(ctx.guild.id)
    if not (ctx.author.guild_permissions.manage_messages or ctx.author.guild_permissions.administrator):
        embed = brand_embed("⛔ Error", "You need `Manage Messages` or `Administrator` permissions to run this command", kind="error")
        await ctx.followup.send(embed=embed)
        return
    if not role.startswith("<@&") or not role.endswith(">"):
        embed = brand_embed("⛔ Error", "Please provide a valid role mention like `@rolename`.", kind="error")
        await ctx.followup.send(embed=embed)
        return
    role_id = role.replace("<@&", "").replace(">", "")
    ref = db.reference(f"/servers/{guild_id}/channel/role")
    role_list = ref.get()
    if not isinstance(role_list, list):
        role_list = []
        ref.set([])
    if role_id in role_list:
        embed = brand_embed("ℹ️ Info", f"{role} is already enabled.", kind="info")
        await ctx.followup.send(embed=embed)
        return
    role_list.append(role_id)
    ref.set(role_list)
    embed = brand_embed("Role", f"{role} has been enabled.", kind="success")
    await ctx.followup.send(embed=embed)

@warn_grp.command(
    name="timeout",
    description="Set warnings until a member gets timed out and the timeout duration")
async def _warntimeout(
    ctx,
    warnings: discord.Option(int, "Number of warnings before timeout"),
    time: discord.Option(int, "Timeout duration in minutes")
):
    await ctx.defer()
    guild_id = str(ctx.guild.id)
    if not (ctx.author.guild_permissions.manage_messages or ctx.author.guild_permissions.administrator):
        embed = brand_embed("⛔ Error", "You need `Manage Messages` or `Administrator` permissions to run this command", kind="error")
        await ctx.followup.send(embed=embed)
        return
    ref_warn = db.reference(f"/servers/{guild_id}/warn")
    warn_data = ref_warn.get() or {}
    timeout_data = warn_data.get("timeout", {})
    current_warnings = timeout_data.get("warnings", 0)
    current_time = timeout_data.get("time", 0)
    if warnings == 0:
        ref_warn.child("timeout").set({
            "warnings": 0,
            "time": 0
        })
        embed = brand_embed("Warn-timeout", "Warn-timeout has been disabled.", kind="success")
        await ctx.followup.send(embed=embed)
        return
    if time <= 0:
        embed = brand_embed("⛔ Error", "Timeout duration must be greater than 0 minutes.", kind="error")
        await ctx.followup.send(embed=embed)
        return
    if warnings == current_warnings and time == current_time:
        embed = brand_embed("ℹ️ Info", f"Warn-timeout was already set to ``{warnings}`` warnings → ``{time}`` minutes.", kind="info")
        await ctx.followup.send(embed=embed)
        return
    ref_warn.child("timeout").set({
        "warnings": int(warnings),
        "time": int(time)
    })
    embed = discord.Embed(
        title="Warn-timeout",
        description=(
            f"Warn-timeout has been updated:\n"
            f"• **Warnings:** ``{current_warnings}`` → ``{warnings}``\n"
            f"• **Timeout:** ``{current_time}`` → ``{time}`` minutes"
        ),
        color=discord.Color.green()
    )
    await ctx.followup.send(embed=embed)


@warn_grp.command(name="kick-at", description="Set number of warnings until a member gets kicked")
async def _warnkick(ctx, number: discord.Option(int, "Number of warnings before kick")):
    await ctx.defer()
    guild_id = str(ctx.guild.id)
    if not (ctx.author.guild_permissions.manage_messages or ctx.author.guild_permissions.administrator):
        embed = brand_embed("⛔ Error", "You need `Manage Messages` or `Administrator` permissions to run this command", kind="error")
        await ctx.followup.send(embed=embed)
        return
    ref_warn = db.reference(f"/servers/{guild_id}/warn")
    warn_data = ref_warn.get() or {"kick": 3, "ban": 5}
    current_kick = warn_data.get("kick", 0)
    current_ban = warn_data.get("ban", 0)
    if int(number) == 0:
        ref_warn.child("kick").set(0)
        embed = brand_embed("Warn-kick", "Kick has been disabled.", kind="success")
        await ctx.followup.send(embed=embed)
        return
    if current_ban > 0 and int(number) >= current_ban:
        embed = brand_embed("⛔ Error", f"Please disable warn-ban or set warn-ban higher than ``{int(number)}`` to set warn-kick.", kind="error")
        await ctx.followup.send(embed=embed)
        return
    if int(number) == current_kick:
        embed = brand_embed("ℹ️ Info", f"Kick was already set to ``{number}``.", kind="info")
        await ctx.followup.send(embed=embed)
        return
    ref_warn.child("kick").set(int(number))
    embed = brand_embed("Warn-kick", f"Warn-Kick has been changed from ``{current_kick}`` to ``{number}``.", kind="success")
    await ctx.followup.send(embed=embed)


@warn_grp.command(name="ban-at", description="Set number of warnings until a member gets banned")
async def _warnban(ctx, number: discord.Option(int, "Number of warnings before ban")):
    await ctx.defer()
    guild_id = str(ctx.guild.id)
    if not (ctx.author.guild_permissions.manage_messages or ctx.author.guild_permissions.administrator):
        embed = brand_embed("⛔ Error", "You need `Manage Messages` or `Administrator` permissions to run this command", kind="error")
        await ctx.followup.send(embed=embed)
        return
    ref_warn = db.reference(f"/servers/{guild_id}/warn")
    warn_data = ref_warn.get() or {"kick": 3, "ban": 5}
    current_ban = warn_data.get("ban", 0)
    current_kick = warn_data.get("kick", 0)
    if int(number) == 0:
        ref_warn.child("ban").set(0)
        embed = brand_embed("Warn-ban", "Ban has been disabled.", kind="success")
        await ctx.followup.send(embed=embed)
        return
    if current_kick > 0 and int(number) <= current_kick:
        embed = brand_embed("⛔ Error", f"Please disable warn-kick or set warn-kick lower than ``{int(number)}`` to set warn-ban.", kind="error")
        await ctx.followup.send(embed=embed)
        return
    if int(number) == current_ban:
        embed = brand_embed("ℹ️ Info", f"Ban was already set to ``{number}``.", kind="info")
        await ctx.followup.send(embed=embed)
        return
    ref_warn.child("ban").set(int(number))
    embed = brand_embed("Warn-ban", f"Warn-Ban has been changed from ``{current_ban}`` to ``{number}``.", kind="success")
    await ctx.followup.send(embed=embed)


# ══════════════════════════════════════════════════════════════════════════════
#  WARNING DECAY  +  PER-CHANNEL RULE OVERRIDES
# ══════════════════════════════════════════════════════════════════════════════

# User-friendly labels for every blocker type (keep in sync with cogs.shared.PROTECT_KEYS).
_BLOCKER_LABELS = {
    "all": "All links", "nsfw": "NSFW", "nitro": "Nitro scams",
    "malware": "Malware / Phishing", "invite": "Discord invites",
    "youtube": "YouTube", "google": "Google", "gif": "GIFs",
    "twitch": "Twitch", "steam": "Steam", "bit": "Shorteners (bit.ly)",
}


def _is_mod(ctx) -> bool:
    return bool(ctx.author.guild_permissions.manage_messages or ctx.author.guild_permissions.administrator)


async def _deny(ctx):
    await ctx.followup.send(embed=brand_embed("⛔ Error", "You need `Manage Messages` or `Administrator` permissions to run this command.", kind="error"))


@warn_grp.command(name="decay",
                   description="Auto-expire old warnings after a number of days (0 = turn off)")
async def _warndecay(ctx, days: discord.Option(int, "Warnings older than this many days are removed automatically. 0 disables it.")):
    await ctx.defer()
    if not _is_mod(ctx):
        return await _deny(ctx)
    guild_id = str(ctx.guild.id)
    ref = db.reference(f"/servers/{guild_id}/decay")
    days = int(days)
    if days <= 0:
        ref.set({"enabled": False, "days": 0})
        embed = brand_embed("🕒 Warning Decay — Off", "Old warnings will **no longer expire**. Every warning a member has is kept until you reset it manually.", kind="success")
        return await ctx.followup.send(embed=embed)
    if days > 3650:
        days = 3650
    ref.set({"enabled": True, "days": days})
    embed = discord.Embed(
        title="🕒 Warning Decay — On",
        description=(
            f"Warnings now **expire after {days} day(s)**.\n\n"
            "**What this does:** each warning a member receives is remembered with the day it happened. "
            f"Once a warning is older than {days} day(s) it is automatically removed and stops counting "
            "toward kick/ban thresholds — so members who behave are gradually forgiven.\n\n"
            "**Why use it:** it stops people being punished forever for one old mistake, and keeps your "
            "warning list clean. Run `/warn-decay 0` to turn it off again."),
        color=discord.Color.blurple())
    embed.set_footer(text="Expired warnings are cleaned up automatically once per hour.")
    await ctx.followup.send(embed=embed)


def _ov_ref(guild_id: str):
    return db.reference(f"/servers/{guild_id}/overrides")


@bot.slash_command(name="channel-mode", default_member_permissions=discord.Permissions(manage_guild=True),
                   description="Set how Link Protect behaves in one channel (default / off / custom)")
async def _channelmode(
        ctx,
        channel: discord.Option(discord.TextChannel, "The channel to configure"),
        mode: discord.Option(str, "default = follow server settings · off = ignore channel · custom = its own rules",
                             choices=["default", "off", "custom"])):
    await ctx.defer()
    if not _is_mod(ctx):
        return await _deny(ctx)
    guild_id = str(ctx.guild.id)
    cref = _ov_ref(guild_id).child(str(channel.id))
    if mode == "default":
        cref.delete()
        desc = (f"{channel.mention} now **follows the server-wide settings** again. "
                "Any custom rules for this channel were removed.")
        color = discord.Color.green()
    elif mode == "off":
        cref.set({"mode": "off"})
        desc = (f"Link Protect will now **completely ignore {channel.mention}**. "
                "No links are blocked and no warnings are given here, no matter the server settings.")
        color = discord.Color.orange()
    else:  # custom
        existing = cref.get() or {}
        existing["mode"] = "custom"
        existing.setdefault("protect", {})
        cref.set(existing)
        desc = (f"{channel.mention} now uses its **own custom rules**, independent of the server. "
                "By default nothing is blocked here yet — turn individual blockers on with "
                "`/channel-block`. Example: `/channel-block #" + channel.name + " invite on`.")
        color = discord.Color.blurple()
    embed = discord.Embed(title="⚙️ Channel Rules", description=desc, color=color)
    await ctx.followup.send(embed=embed)


@bot.slash_command(name="channel-block", default_member_permissions=discord.Permissions(manage_guild=True),
                   description="Turn one blocker on/off for a single channel (uses that channel's custom rules)")
async def _channelblock(
        ctx,
        channel: discord.Option(discord.TextChannel, "The channel to configure"),
        blocker: discord.Option(str, "Which blocker to change", choices=list(_BLOCKER_LABELS.keys())),
        state: discord.Option(str, "Turn it on or off in this channel", choices=["on", "off"])):
    await ctx.defer()
    if not _is_mod(ctx):
        return await _deny(ctx)
    guild_id = str(ctx.guild.id)
    cref = _ov_ref(guild_id).child(str(channel.id))
    ov = cref.get() or {}
    if ov.get("mode") != "custom":
        # Switching a channel to custom starts from a clean slate so its rules
        # are fully independent of the server defaults.
        ov = {"mode": "custom", "protect": {}}
    ov.setdefault("protect", {})[blocker] = (state == "on")
    cref.set(ov)
    label = _BLOCKER_LABELS.get(blocker, blocker)
    on = state == "on"
    embed = discord.Embed(
        title="⚙️ Channel Rules",
        description=(f"**{label}** is now **{'ON ✅' if on else 'OFF ❌'}** in {channel.mention}.\n\n"
                     f"This channel uses its **own custom rules** — only the blockers you switch on here apply, "
                     "regardless of the server-wide settings. Use `/channel-rules` to see the full list, or "
                     f"`/channel-mode #{channel.name} default` to make it follow the server again."),
        color=discord.Color.green() if on else discord.Color.greyple())
    await ctx.followup.send(embed=embed)


@bot.slash_command(name="channel-rules",
                   description="Show which links are blocked in a channel and why")
async def _channelrules(ctx, channel: discord.Option(discord.TextChannel, "Channel to inspect")):
    await ctx.defer()
    guild_id = str(ctx.guild.id)
    server = db.reference(f"/servers/{guild_id}").get() or {}
    overrides = server.get("overrides") or {}
    ov = overrides.get(str(channel.id))
    cat_id = getattr(channel, "category_id", None)
    source = "this channel"
    if ov is None and cat_id and str(cat_id) in overrides:
        ov = overrides[str(cat_id)]
        source = "its category"

    server_protect = server.get("protect", {})
    if not ov or ov.get("mode", "default") == "default":
        mode_line = "📋 **Follows server settings**" + ("" if source == "this channel" else f" (inherited from {source})")
        active = [(_BLOCKER_LABELS[k], server_protect.get(k, False)) for k in _BLOCKER_LABELS]
    elif ov.get("mode") == "off":
        embed = discord.Embed(
            title=f"⚙️ Rules for #{channel.name}",
            description=("🚫 **Link Protect is OFF in this channel"
                         + ("" if source == "this channel" else f" (inherited from {source})") + ".**\n\n"
                         "Nothing is blocked and no warnings are given here. "
                         f"Run `/channel-mode #{channel.name} default` to follow the server settings again."),
            color=discord.Color.orange())
        return await ctx.followup.send(embed=embed)
    else:  # custom
        mode_line = "🎯 **Custom rules**" + ("" if source == "this channel" else f" (inherited from {source})") + " — independent of the server"
        cp = ov.get("protect", {})
        active = [(_BLOCKER_LABELS[k], bool(cp.get(k, False))) for k in _BLOCKER_LABELS]

    on = [lbl for lbl, v in active if v]
    off = [lbl for lbl, v in active if not v]
    embed = discord.Embed(title=f"⚙️ Rules for #{channel.name}", description=mode_line, color=discord.Color.blurple())
    embed.add_field(name="✅ Blocked here", value=("\n".join(f"• {x}" for x in on) if on else "*Nothing*"), inline=True)
    embed.add_field(name="❌ Allowed here", value=("\n".join(f"• {x}" for x in off) if off else "*Nothing*"), inline=True)
    embed.set_footer(text="Change with /channel-block · reset with /channel-mode default")
    await ctx.followup.send(embed=embed)


@bot.slash_command(name="channel-reset", default_member_permissions=discord.Permissions(manage_guild=True),
                   description="Remove a channel's custom rules so it follows the server again")
async def _channelreset(ctx, channel: discord.Option(discord.TextChannel, "Channel to reset")):
    await ctx.defer()
    if not _is_mod(ctx):
        return await _deny(ctx)
    guild_id = str(ctx.guild.id)
    _ov_ref(guild_id).child(str(channel.id)).delete()
    embed = brand_embed("⚙️ Channel Rules", f"{channel.mention} now **follows the server-wide settings** again. Any custom rules were removed.", kind="success")
    await ctx.followup.send(embed=embed)


@warn_grp.command(name="add", description="Warn a user")
async def warn_user(ctx, member: discord.Member,
                    reason: discord.Option(str, "Reason", required=False) = "No reason provided."):
    """Manual warn — runs through the SAME engine as automatic link-block warns
    (shared.apply_warn_member), so timeout/kick/ban thresholds, warning decay
    and permission-failure diagnostics behave identically on both paths."""
    await ctx.defer()
    if not (ctx.author.guild_permissions.manage_messages or ctx.author.guild_permissions.administrator):
        await ctx.followup.send(embed=brand_embed(
            "⛔ Missing permission",
            "You need `Manage Messages` or `Administrator` permission to run this command.",
            kind="error"))
        return
    from cogs.shared import apply_warn_member, get_settings
    settings = await get_settings(str(ctx.guild.id))
    await apply_warn_member(bot, member, ctx.channel, settings,
                            f"{reason} (manual warn)", moderator=ctx.author)
    await ctx.followup.send(embed=brand_embed(
        "✅ Warning issued",
        f"{member.mention} has been warned. Escalation (timeout/kick/ban) follows "
        "your configured thresholds automatically.",
        kind="success"), ephemeral=True)


@warn_grp.command(name="list", description="Show all warnings from a user")
async def _warnings(ctx, member: discord.Member):
    await ctx.defer()
    guild_id = str(ctx.guild.id)
    user_id = str(member.id)
    ref = db.reference(f"/servers/{guild_id}/warn/{user_id}")
    member_data = ref.get()
    if not member_data:
        embed = discord.Embed(title="Warnings", description=f"{member.mention} has no warnings.",
                              color=discord.Color.blue())
        await ctx.followup.send(embed=embed)
        return
    warn_count = member_data.get("Warn", 0)
    reasons = member_data.get("reason", [])
    reason_text = ""
    for i, r in enumerate(reasons, 1):
        reason_text += f"**{i}.** {r}\n"
    embed = discord.Embed(title="Warnings", description=f"Showing warnings for {member.mention}",
                          color=discord.Color.blue())
    embed.add_field(name="Total warns", value=f"{member.display_name} have: ``{warn_count}`` warn(s)", inline=False)
    embed.add_field(name="Given Reason", value=reason_text or "No reason provided", inline=False)
    await ctx.followup.send(embed=embed)


@warn_grp.command(name="remove", description="Delete a specific warning from a user")
async def _warndel(ctx, member: discord.Member,
                   index: discord.Option(int, "Which warning to delete (e.g. 1 for first warning)")):
    await ctx.defer()
    guild_id = str(ctx.guild.id)
    user_id = str(member.id)
    if not (ctx.author.guild_permissions.manage_messages or ctx.author.guild_permissions.administrator):
        embed = brand_embed("⛔ Error", "You need `Manage Messages` or `Administrator` permissions to run this command.", kind="error")
        await ctx.followup.send(embed=embed)
        return
    ref = db.reference(f"/servers/{guild_id}/warn/{user_id}")
    user_data = ref.get()
    if not user_data:
        embed = brand_embed("ℹ️ Info", f"{member.mention} has no warnings.", kind="info")
        await ctx.followup.send(embed=embed)
        return
    reasons = user_data.get("reason", [])
    warn_count = user_data.get("Warn", 0)
    if index < 1 or index > len(reasons):
        embed = brand_embed("⛔ Error", f"{member.mention} only has `{len(reasons)}` warning(s).", kind="error")
        await ctx.followup.send(embed=embed)
        return
    removed = reasons.pop(index - 1)
    warn_count -= 1
    ref.update({
        "Warn": warn_count,
        "reason": reasons
    })
    embed = brand_embed("WARN DELETE", f"Removed warning #{index} from {member.mention}", kind="success")
    embed.add_field(name="Deleted Reason", value=removed)
    embed.add_field(name="Remaining Warnings", value=f"{warn_count}")
    await ctx.followup.send(embed=embed)
    log_ref = db.reference(f"/servers/{guild_id}/log")
    log_data = log_ref.get() or {}
    if log_data.get("Activated") == True and log_data.get("log-channel", 0) != 0:
        log_channel = bot.get_channel(int(log_data["log-channel"]))
        if log_channel:
            log_embed = discord.Embed(
                title="[AUTO-MOD] Warn Deletion",
                description=f"{ctx.author.mention} has deleted warning #{index} from {member.mention}",
                color=discord.Color.blurple()
            )
            log_embed.add_field(name="Deleted Reason", value=removed, inline=False)
            log_embed.add_field(name="Remaining Warnings", value=warn_count)
            log_embed.set_footer(text=f"Guild: {ctx.guild.name} • User ID: {member.id}")
            try:
                await log_channel.send(embed=log_embed)
            except discord.Forbidden:
                pass  # No access to the configured log channel.


@warn_grp.command(name="clear-server", description="Delete all warnings of all users on this server")
async def _warn_delete_server(ctx):
    await ctx.defer()
    guild_id = str(ctx.guild.id)
    if not (ctx.author.guild_permissions.manage_messages or ctx.author.guild_permissions.administrator):
        embed = brand_embed("⛔ Error", "You need `Manage Messages` or `Administrator` permissions to run this command.", kind="error")
        await ctx.followup.send(embed=embed)
        return
    ref = db.reference(f"/servers/{guild_id}/warn")
    warn_data = ref.get() or {}
    total_users = 0
    total_warns = 0
    cleared_keys = []
    for uid, data in warn_data.items():
        if isinstance(data, dict) and "Warn" in data:
            total_users += 1
            total_warns += data.get("Warn", 0)
            cleared_keys.append(uid)
    # Only delete individual user entries, preserve kick/ban/timeout settings
    for uid in cleared_keys:
        db.reference(f"/servers/{guild_id}/warn/{uid}").delete()
    embed = brand_embed("WARN DELETE", f"Deleted all warnings of **{total_users}** user(s).", kind="success")
    embed.add_field(name="Total Warnings Removed", value=f"{total_warns}")
    await ctx.followup.send(embed=embed)
    log_ref = db.reference(f"/servers/{guild_id}/log")
    log_data = log_ref.get() or {}
    if log_data.get("Activated") == True and log_data.get("log-channel", 0) != 0:
        log_channel = bot.get_channel(int(log_data["log-channel"]))
        if log_channel:
            log_embed = brand_embed("[AUTO-MOD] All Warnings Deleted", f"{ctx.author.mention} deleted **all warnings** on this server.", kind="error")
            log_embed.add_field(name="Total Users", value=f"{total_users}")
            log_embed.add_field(name="Total Warnings", value=f"{total_warns}")
            try:
                await log_channel.send(embed=log_embed)
            except discord.Forbidden:
                pass  # No access to the configured log channel.


@bot.slash_command(name="modstats", description="Show moderation statistics for this server")
async def _modstats(ctx):
    await ctx.defer()
    guild_id = str(ctx.guild.id)

    data = await asyncio.to_thread(lambda: db.reference(f"/servers/{guild_id}").get()) or {}
    warn_data = data.get("warn", {})
    protect_data = data.get("protect", {})
    log_data = data.get("log", {})

    # Collect per-user warn counts
    user_warns = {}
    total_warns = 0
    for uid, udata in warn_data.items():
        if isinstance(udata, dict) and "Warn" in udata:
            count = udata.get("Warn", 0)
            if count > 0:
                user_warns[uid] = count
                total_warns += count

    warned_users = len(user_warns)

    # Top 5 most warned users
    top5 = sorted(user_warns.items(), key=lambda x: x[1], reverse=True)[:5]
    if top5:
        top_text = "\n".join(f"**{i+1}.** <@{uid}> — `{count}` warn(s)" for i, (uid, count) in enumerate(top5))
    else:
        top_text = "No warnings yet."

    # Active blockers
    blocker_names = {
        "google": "Google", "youtube": "YouTube", "nsfw": "NSFW", "gif": "GIF",
        "invite": "Invite", "bit": "Bitly", "nitro": "Nitro", "twitch": "Twitch",
        "steam": "Steam", "all": "All Links", "malware": "Malware Scan",
    }
    active = [label for key, label in blocker_names.items() if protect_data.get(key)]
    blockers_text = ", ".join(f"`{b}`" for b in active) if active else "`None active`"

    kick_limit = warn_data.get("kick", 0)
    ban_limit = warn_data.get("ban", 0)
    timeout_cfg = warn_data.get("timeout", {})
    log_channel_id = log_data.get("log-channel", 0)
    log_active = log_data.get("Activated", False)

    embed = discord.Embed(
        title=f"📊 Moderation Stats — {ctx.guild.name}",
        color=BRAND_COLOR,
    )
    embed.add_field(name="⚠️ Total Warnings", value=f"```{total_warns}```", inline=True)
    embed.add_field(name="👥 Warned Users", value=f"```{warned_users}```", inline=True)
    embed.add_field(name="🏆 Most Warned", value=top_text, inline=False)
    embed.add_field(
        name="🔒 Active Blockers",
        value=blockers_text,
        inline=False,
    )
    warn_cfg_parts = []
    if kick_limit:
        warn_cfg_parts.append(f"Kick at `{kick_limit}` warns")
    if ban_limit:
        warn_cfg_parts.append(f"Ban at `{ban_limit}` warns")
    if timeout_cfg.get("warnings"):
        warn_cfg_parts.append(f"Timeout `{timeout_cfg['time']}min` at `{timeout_cfg['warnings']}` warns")
    embed.add_field(
        name="⚙️ Warn Thresholds",
        value=" · ".join(warn_cfg_parts) if warn_cfg_parts else "`Not configured`",
        inline=False,
    )
    embed.add_field(
        name="📝 Warn Log",
        value=f"<#{log_channel_id}>" if log_active and log_channel_id else "`Off`",
        inline=True,
    )
    embed.set_footer(text=f"Server ID: {ctx.guild.id} • Members: {ctx.guild.member_count}")
    await ctx.followup.send(embed=embed)


@warn_grp.command(name="log", description="Send warnings, kicks, bans into a channel")
async def _enwarnlog(ctx, channelname):
    await ctx.defer()
    guild_id = str(ctx.guild.id)
    if not (ctx.author.guild_permissions.manage_messages or ctx.author.guild_permissions.administrator):
        embed = brand_embed("⛔ Error", "You need `Manage Messages` or `Administrator` permissions to run this command.", kind="error")
        await ctx.followup.send(embed=embed)
        return
    if not channelname.startswith("<#") or not channelname.endswith(">"):
        embed = brand_embed("⛔ Error", "Please provide a valid channel mention like `#general`.", kind="error")
        await ctx.followup.send(embed=embed)
        return
    match = re.match(r'<#(\d+)>$', channelname)
    channel_id_str = channelname.replace("<#", "").replace(">", "").strip()
    log_ref = db.reference(f"/servers/{guild_id}/log")
    current_data = log_ref.get() or {}
    current_log_channel = current_data.get("log-channel", 0)
    if str(current_log_channel) == str(channel_id_str):
        embed = brand_embed("ℹ️ Info", f"This channel is already set for warn-logs: <#{channel_id_str}>", kind="info")
        await ctx.followup.send(embed=embed)
        return
    if match:
        channel = ctx.guild.get_channel(int(match.group(1)))
        try:
            await channel.send("This channel is set for **warn-logs**")
        except:
            embed = brand_embed("⛔ Error", "I do not have permission to send messages in the selected channel.", kind="error")
            await ctx.followup.send(embed=embed)
            return
        log_ref.update({
            "log-channel": int(channel.id),
            "Activated": True
        })
        embed = discord.Embed(title="Warn-Log",
                              description=f"Warn-logs have been enabled in <#{channel.id}>",
                              color=BRAND_COLOR)
        await ctx.followup.send(embed=embed)


@warn_grp.command(name="log-off", description="Stop sending warnings, kicks, bans into a channel")
async def _diswarnlog(ctx):
    await ctx.defer()
    guild_id = str(ctx.guild.id)
    if not (ctx.author.guild_permissions.manage_messages or ctx.author.guild_permissions.administrator):
        embed = brand_embed("⛔ Error", "You need `Manage Messages` or `Administrator` permissions to run this command.", kind="error")
        await ctx.followup.send(embed=embed)
        return
    log_ref = db.reference(f"/servers/{guild_id}/log")
    current_data = log_ref.get() or {}
    if not current_data.get("Activated", False):
        embed = brand_embed("ℹ️ Info", f"Warn-log system was never activated.", kind="info")
        await ctx.followup.send(embed=embed)
        return
    log_ref.update({
        "log-channel": 0,
        "Activated": False
    })
    embed = discord.Embed(title="Warn-Log",
                          description=f"Warn-log has been disabled.",
                          color=BRAND_COLOR)
    await ctx.followup.send(embed=embed)


@bl_grp.command(name="remove", description="Remove a link from your blacklist")
async def enable_link(ctx, link: str):
    await ctx.defer()
    server_id = str(ctx.guild.id)
    if not (ctx.author.guild_permissions.manage_messages or ctx.author.guild_permissions.administrator):
        embed = brand_embed("⛔ Error", "You need `Manage Messages` or `Administrator` permissions to run this command.", kind="error")
        await ctx.followup.send(embed=embed)
        return
    regex = re.compile(r'^(https?:\/\/)?([\da-z\.-]+)\.([a-z\.]{2,6})([\/\w \.-]*)*\/?$')
    if re.match(regex, link) is None:
        embed = brand_embed("⛔ Error", f"{link} is not a valid link.\nUse format: `https://domain.com` or `domain.com/path`", kind="error")
        await ctx.followup.send(embed=embed)
        return
    ref = db.reference(f"/servers/{server_id}/link/links")
    current_links = ref.get()
    if not isinstance(current_links, list):
        current_links = [] if not current_links else list(current_links.values()) if isinstance(current_links, dict) else []
        ref.set(current_links)
    if link not in current_links:
        embed = brand_embed("ℹ️ Info", f"{link} is not currently blacklisted.", kind="info")
        await ctx.followup.send(embed=embed)
        return
    current_links.remove(link)
    ref.set(current_links)
    embed = brand_embed("LINK", f"{link} has been whitelisted.", kind="success")
    await ctx.followup.send(embed=embed)



@bl_grp.command(name="add", description="Add a link to your blacklist — always blocked")
async def disable_link(ctx, link: str):
    await ctx.defer()
    server_id = str(ctx.guild.id)
    if not (ctx.author.guild_permissions.manage_messages or ctx.author.guild_permissions.administrator):
        embed = brand_embed("ERROR", "You need `Manage Messages` or `Administrator` permissions to run this command.", kind="error")
        await ctx.followup.send(embed=embed)
        return
    regex = re.compile(
        r'^(https?:\/\/)?'
        r'([\da-z\.-]+)\.([a-z\.]{2,6})'
        r'([\/\w \.-]*)*\/?$')
    if re.match(regex, link) is None:
        embed = brand_embed("ERROR", f"{link} is not a valid link.\nUse format: `https://domain.com` or `domain.com/path`", kind="error")
        await ctx.followup.send(embed=embed)
        return
    ref = db.reference(f"/servers/{server_id}/link/links")
    current_links = ref.get()
    if not isinstance(current_links, list):
        current_links = [] if not current_links else list(current_links.values()) if isinstance(current_links,
                                                                                                dict) else []
        ref.set(current_links)
    if link in current_links:
        embed = brand_embed("ℹ️ Info", f"{link} is already blacklisted.", kind="info")
        await ctx.followup.send(embed=embed)
        return
    current_links.append(link)
    ref.set(current_links)
    embed = brand_embed("LINK", f"{link} has been blacklisted.", kind="error")
    await ctx.followup.send(embed=embed)


@bl_grp.command(name="list", description="Show all blacklisted links for this server")
async def _list_blacklist(ctx):
    await ctx.defer()
    if not (ctx.author.guild_permissions.manage_messages or ctx.author.guild_permissions.administrator):
        embed = brand_embed("ERROR", "You need `Manage Messages` or `Administrator` permissions to run this command.", kind="error")
        await ctx.followup.send(embed=embed)
        return
    server_id = str(ctx.guild.id)
    ref = db.reference(f"/servers/{server_id}/link/links")
    links = ref.get()
    if not links or len(links) == 0:
        embed = discord.Embed(
            title="Blacklist",
            description="There are currently **no** blacklisted links.",
            color=discord.Color.orange())
        await ctx.followup.send(embed=embed)
        return

    def split_chunks(input_list, chunk_size):
        for i in range(0, len(input_list), chunk_size):
            yield input_list[i:i + chunk_size]

    chunks = list(split_chunks(links, 10))
    embed = discord.Embed(
        title="📋 Link Blacklist",
        description="Here are all links currently blacklisted on this server:",
        color=discord.Color.dark_red())
    for i, chunk in enumerate(chunks, start=1):
        embed.add_field(
            name=f"Links {i}",
            value="\n".join(f"`{link}`" for link in chunk),
            inline=False)
    embed.set_footer(text=f"Total: {len(links)} blacklisted link(s)")
    await ctx.followup.send(embed=embed)




# ═══ Right-click moderation (message context-menu apps, v2.6.2) ═══
# Apps → "Warn for this message" / "Check links in message" on any message.

@bot.message_command(name="Warn for this message",
                     default_member_permissions=discord.Permissions(manage_messages=True))
async def _ctx_warn_message(ctx, message: discord.Message):
    """Warn the author with the message itself as reason + evidence — same
    engine as /warn add, zero typing for the moderator."""
    await ctx.defer(ephemeral=True)
    if not (ctx.author.guild_permissions.manage_messages or ctx.author.guild_permissions.administrator):
        return await ctx.followup.send(embed=brand_embed(
            "⛔ Missing permission", "You need `Manage Messages` to warn members.", kind="error"))
    member = message.author
    if member.bot:
        return await ctx.followup.send(embed=brand_embed(
            "⛔ Can't warn a bot", "Pick a message from a human member.", kind="error"))
    if not isinstance(member, discord.Member):
        member = ctx.guild.get_member(member.id)
        if member is None:
            return await ctx.followup.send(embed=brand_embed(
                "⛔ Not a member", "This user is no longer on the server.", kind="error"))
    excerpt = (message.content or "").strip().replace("\n", " ")
    reason = f'Inappropriate message: "{excerpt[:140]}"' if excerpt else "Inappropriate message (attachment/embed)"
    from cogs.shared import apply_warn_member, get_settings
    settings = await get_settings(str(ctx.guild.id))
    await apply_warn_member(bot, member, message.channel, settings, reason,
                            content=message.content or None, moderator=ctx.author)
    await ctx.followup.send(embed=brand_embed(
        "✅ Warning issued",
        f"{member.mention} was warned for [this message]({message.jump_url}). "
        "Escalation follows your thresholds automatically.", kind="success"))


@bot.message_command(name="Check links in message")
async def _ctx_check_links(ctx, message: discord.Message):
    """Run every link in the message through the threat DB + Google Safe
    Browsing — verdict stays ephemeral, nobody is called out publicly."""
    await ctx.defer(ephemeral=True)
    from cogs.shared import extract_urls, load_known_bad_sync, known_bad_category
    pairs = extract_urls(message.content or "")[:3]  # [(url, domain), …]
    if not pairs:
        return await ctx.followup.send(embed=brand_embed(
            "ℹ️ No links found", "This message doesn't contain any links.", kind="info"))
    urls = [u for u, _d in pairs]

    verdicts: dict[str, str | None] = {}
    try:
        kb = await asyncio.to_thread(load_known_bad_sync)
    except Exception:
        kb = {}
    pending = []
    for u, domain in pairs:
        cat = known_bad_category(domain, kb) if kb else None
        if cat:
            verdicts[u] = f"known {cat}"
        else:
            pending.append(u if u.startswith(("http://", "https://")) else "https://" + u)

    if pending and SAFE_BROWSING_KEY:
        payload = {
            "client": {"clientId": "link-protect-bot", "clientVersion": BOT_VERSION},
            "threatInfo": {
                "threatTypes": ["MALWARE", "SOCIAL_ENGINEERING",
                                "POTENTIALLY_HARMFUL_APPLICATION", "UNWANTED_SOFTWARE"],
                "platformTypes": ["ANY_PLATFORM"],
                "threatEntryTypes": ["URL"],
                "threatEntries": [{"url": u} for u in pending],
            },
        }
        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(
                        "https://safebrowsing.googleapis.com/v4/threatMatches:find"
                        f"?key={SAFE_BROWSING_KEY}", json=payload,
                        timeout=aiohttp.ClientTimeout(total=8)) as resp:
                    matches = (await resp.json()).get("matches", [])
            flagged = {m.get("threat", {}).get("url"): m.get("threatType", "THREAT") for m in matches}
            for u in pending:
                if u in flagged:
                    verdicts[u] = flagged[u].replace("_", " ").lower()
        except Exception:
            pass

    bad = {u: v for u, v in verdicts.items() if v}
    lines = []
    for u in urls:
        full = u if u.startswith(("http://", "https://")) else "https://" + u
        v = verdicts.get(u) or verdicts.get(full)
        lines.append(f"{'🚨' if v else '✅'} ||`{u[:70]}`|| — {('**' + v + '**') if v else 'no threat found'}")
    e = brand_embed(
        "🚨 Dangerous link detected" if bad else "✅ No threats found",
        "\n".join(lines) + ("\n\n⛔ Do **not** click or share the flagged link(s)." if bad
                             else "\n\n*No guarantee — stay careful with logins and downloads.*"),
        kind="error" if bad else "success")
    await ctx.followup.send(embed=e)


# ═══ Embeds 2.0: "Remove warning" button on log embeds (survives restarts —
# we match on the custom_id prefix, no persistent view registration needed) ═══
@bot.listen("on_interaction")
async def _lp_component_listener(interaction: discord.Interaction):
    try:
        cid = (interaction.data or {}).get("custom_id", "")
    except Exception:
        return
    if not isinstance(cid, str):
        return
    # Activation nudge: "Enable Balanced protection" button (see cogs/nudge_sqlite)
    if cid.startswith("lpn:balanced:"):
        try:
            gid = cid.split(":", 2)[2]
            perms = getattr(interaction.user, "guild_permissions", None)
            if not perms or not (perms.manage_guild or perms.administrator):
                return await interaction.response.send_message(
                    "Only members with `Manage Server` can enable protection — "
                    "ping an admin to press this button.", ephemeral=True)
            await asyncio.to_thread(_apply_preset_sync, gid, "balanced")
            done = brand_embed(
                "🛡️ Balanced protection is live",
                f"Enabled by {interaction.user.mention}: malware & phishing, nitro scams, "
                "shorteners, NSFW, raid protection and Scam Shield.\n"
                "Fine-tune everything (log channel, thresholds, verification) in the dashboard.",
                kind="success")
            view = discord.ui.View(timeout=None)
            view.add_item(discord.ui.Button(label="Open dashboard", style=discord.ButtonStyle.link,
                                            url=f"https://link-protect.com/dashboard/{gid}"))
            await interaction.response.edit_message(embed=done, view=view)
        except Exception:
            try:
                await interaction.response.send_message("Couldn't apply the preset — try /setup-preset.", ephemeral=True)
            except Exception:
                pass
        return
    if not cid.startswith("lpw:rm:"):
        return
    try:
        _, _, gid, uid = cid.split(":", 3)
        perms = getattr(interaction.user, "guild_permissions", None)
        if not perms or not (perms.kick_members or perms.manage_guild or perms.administrator):
            return await interaction.response.send_message(
                "You need `Kick Members` or `Manage Server` to remove warnings.", ephemeral=True)
        ref = db.reference(f"/servers/{gid}/warn/{uid}")
        data = await asyncio.to_thread(ref.get) or {}
        count = int(data.get("Warn", 0) or 0)
        if count <= 0:
            return await interaction.response.send_message("This user has no warnings left.", ephemeral=True)
        data["Warn"] = count - 1
        for k in ("reason", "ts"):
            if isinstance(data.get(k), list) and data[k]:
                data[k] = data[k][:-1]
        await asyncio.to_thread(ref.set, data)
        # Acknowledge silently — the green removal embed below is the feedback,
        # an extra ephemeral "removed" message would just duplicate it.
        try:
            await interaction.response.defer(invisible=True)
        except Exception:
            pass
        # Replace the original log embed with a removal notice — the old entry
        # disappears, the audit trail stays visible in channel AND web log.
        guild = interaction.guild
        target = guild.get_member(int(uid)) if guild else None
        tname = getattr(target, "name", None) or f"User …{uid[-4:]}"
        try:
            await interaction.message.delete()
        except Exception:
            pass
        removed = discord.Embed(
            title="↩️ Warning removed",
            description=(f"{interaction.user.mention} removed a warning from <@{uid}>.\n"
                         f"They now have **{count - 1}** warning(s)."),
            color=0x23A55A,
        )
        removed.timestamp = discord.utils.utcnow()
        try:
            await interaction.channel.send(embed=removed)
        except Exception:
            pass
        try:
            from cogs.shared import _log_action_sync
            await asyncio.to_thread(
                _log_action_sync, int(gid), uid, tname, str(interaction.channel.id),
                "unwarned", f"Warning removed by {interaction.user.name}", count - 1)
        except Exception:
            pass
    except Exception:
        try:
            await interaction.response.send_message("Couldn't remove the warning.", ephemeral=True)
        except Exception:
            try:
                await interaction.followup.send("Couldn't remove the warning.", ephemeral=True)
            except Exception:
                pass


# ═══ Daily digest: one summary embed instead of a message per action.
# Runs 23:30 Berlin time (21:30 UTC), before the nightly restart. ═══
from discord.ext import tasks as _tasks
import datetime as _dt

@_tasks.loop(time=_dt.time(hour=21, minute=30, tzinfo=_dt.timezone.utc))
async def _daily_digest():
    from cogs.shared import _get_conn as _sc, get_settings as _gs, ACTION_COLORS as _AC
    try:
        since = int(time.time()) - 86400
        rows = await asyncio.to_thread(lambda: _sc().execute(
            "SELECT guild_id, action, username, COUNT(*) AS n FROM actions WHERE timestamp > ? "
            "GROUP BY guild_id, action, username", (since,)).fetchall())
    except Exception:
        return
    per_guild: dict = {}
    for gid, action, username, n in rows:
        per_guild.setdefault(int(gid), []).append((action, username, int(n)))
    for gid, items in per_guild.items():
        try:
            settings = await _gs(str(gid))
            log_cfg = settings.get("log", {}) or {}
            if not log_cfg.get("digest") or not log_cfg.get("log-channel"):
                continue
            ch = bot.get_channel(int(log_cfg["log-channel"]))
            if ch is None:
                continue
            totals: dict = {}
            per_user: dict = {}
            for action, username, n in items:
                totals[action] = totals.get(action, 0) + n
                per_user[username] = per_user.get(username, 0) + n
            summary = " · ".join(f"**{n}** {a}" for a, n in sorted(totals.items(), key=lambda x: -x[1]))
            top = "\n".join(f"• **{u}** — {n} action(s)"
                             for u, n in sorted(per_user.items(), key=lambda x: -x[1])[:5])
            from cogs.shared import message_accent as _ma, guild_footer as _gf
            e = brand_embed("📋 Daily moderation digest",
                            f"Last 24 hours: {summary}\n\n**Most active offenders:**\n{top}")
            e.timestamp = discord.utils.utcnow()
            e.color = _ma(settings)
            e.set_footer(text=_gf(settings))
            await ch.send(embed=e)
        except Exception:
            continue


@bot.listen("on_ready")
async def _start_digest_loop():
    if not _daily_digest.is_running():
        _daily_digest.start()


bot.run(os.environ["BOT_TOKEN"])