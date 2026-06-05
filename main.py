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
        "invite": False, "twitch": False, "bit": False, "nitro": False, "steam": False
    },
    "warn": {"kick": 3, "ban": 5},
    "protect": {
        "google": False, "youtube": False, "nsfw": False, "gif": False,
        "invite": False, "twitch": False, "bit": False, "nitro": False,
        "all": False, "steam": False, "malware": False
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
API_KEY = '6d4d6172480f35c0246c23707521c5d37b91317741e6f262a1052ee770d18dcf'

for filename in os.listdir('./cogs'):
    if filename.endswith('.py'):
        bot.load_extension(f'cogs.{filename[:-3]}')
        print(f"loaded cogs.{filename[:-3]}")


async def post_stats():
    url = "https://top.gg/api/bots/888390889892892684/stats"
    headers = {
        "Authorization": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6Ijg4ODM5MDg4OTg5Mjg5MjY4NCIsImJvdCI6dHJ1ZSwiaWF0IjoxNjM2NjU1NTM2fQ.txNDT50-BQ1z7Uuwjqhen6vbCXX9IQ2gLWtbUHOVgmM",
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

@bot.event
async def on_shard_ready(shard_id: int):
    print(f"✅ Shard {shard_id} ready")


@bot.event
async def on_ready():
    print(f"✅ Eingeloggt als {bot.user}")
    await bot.change_presence(activity=discord.Activity(type=discord.ActivityType.watching,
            name="https://norecoil.de"))
    update_topgg_stats.start()



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
            "nitro": False,
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
            "nitro": False,
            "all": False,
            "steam": False,
            "malware": False
        }
    }
    await asyncio.to_thread(
        lambda: db.reference(f"/servers/{guild.id}").set(data)
    )
    owner_id = guild.owner_id
    total_text_channels = len(guild.text_channels)
    total_voice_channels = len(guild.voice_channels)
    total_channels = total_text_channels + total_voice_channels
    create = guild.created_at.strftime("%d.%m.%Y, %H:%M")
    embed = discord.Embed(title=f"{guild.name} (ID: {guild.id})", color=0x7a7aff)
    embed.add_field(name=" ", value=f"Owner: <@{owner_id}>", inline=False)
    embed.add_field(name="Members:", value=f"```{guild.member_count}```", inline=True)
    embed.add_field(name=f"Total channel:", value=f"```{total_channels}```", inline=True)
    embed.add_field(name=f"Text channel:", value=f"```{total_text_channels}```", inline=True)
    embed.add_field(name=f"Voice channel:", value=f"```{total_voice_channels}```", inline=True)
    embed.add_field(name=f"Createt at:", value=f"```{create}```", inline=True)
    embed.set_footer(text=f"Total Server: {len(bot.guilds)}")
    channel = bot.get_channel(889218205636247582)
    await channel.send(embed=embed)
    try:
        owner = await bot.fetch_user(owner_id)
    except discord.NotFound:
        return
    except discord.Forbidden:
        return
    except discord.HTTPException as e:
        return
    embed = discord.Embed(
        title="Welcome to Link Protect V2!",
        description="Hey! Thanks for your Invite. I'm here to help you keep your server safe and organized.",
        color=0x7a7aff)
    embed.add_field(name="Features", value=(
        "🔒 **Malware Protection**: \nBlocks malicious links to protect your server.\n"
        "🔗 **Link Detection**: \nDeletes unwanted links (e.g., YouTube, Nitro, Bit.ly, NSFW, Google, Twitch, Discord invites, GIFs).\n"
        "🛠️ **Customizable Management**: \nSet which links to block and configure kick/ban settings.\n"
        "🔒 **Control Access**: \nDefine which channels, roles, or members can send links.\n"
        "📝 **Warning System**: \nConfigure warning thresholds and actions with `/warn-kick` and `/warn-ban`.\n"
        "🕵️‍♂️ **Malware Scanner**: \nUse `/enable-link-scanner` to verify links with green (safe) and red (unsafe) indicators.\n"
        "⚠️ **Manage Warnings**: \nView `/warnings @User`, delete `/warn-delete @User`, or reset all with `/warn-delete-server`.\n"
        "🚫 **Log Management**: \nCreate logs with `/enable-warn-log #channelname` and disable with `/disable-warn-log`.\n"
        "🐞 **Feedback & Reporting**: \nReport issues with `/bug-report`.\n"
        "🔄 **Updates**: \nCheck for updates with `/update`."))
    embed.add_field(name="Take Time",
                    value="Use ``/`` and go through the commands of Link Protect. Every command has a description to show you what it does. If you need help, use /report and send a help message",
                    inline=False)
    embed.add_field(name="**NEW**",
                    value="💰 Now you can also try the [VIP CASINO MASTER](https://discord.com/oauth2/authorize?client_id=1370064293697163326&permissions=2147608640&integration_type=0&scope=bot) Bot!")
    try:
        await owner.send(embed=embed)
    except Exception as e:
        return
    guild = bot.get_guild(876501708912603157)
    channel = guild.get_channel(1284546741936459887)
    new_name = f"📈| - {len(bot.guilds)} Server"
    try:
        await channel.edit(name=new_name)
    except discord.errors.HTTPException as e:
        if e.status == 429:
            retry_after = int(e.response.headers.get('Retry-After', 0)) / 1000
            await asyncio.sleep(retry_after)
            await channel.edit(name=new_name)
    timechannel = guild.get_channel(1284945488298115095)
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
    data = await asyncio.to_thread(lambda: db.reference("/servers").get()) or {}
    if str(guild.id) in data:
        db.reference(f"/servers/{guild.id}").delete()


@bot.slash_command(name="z-database-controle",
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
            "invite": False, "twitch": False, "bit": False, "nitro": False, "steam": False
        },
        "warn": {"kick": 3, "ban": 5},
        "protect": {
            "google": False, "youtube": False, "nsfw": False, "gif": False,
            "invite": False, "twitch": False, "bit": False, "nitro": False, "all": False, "steam": False, "malware": False
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
        embed = discord.Embed(
            title="⛔ ERROR",
            description="These z- commands are only for the bot owner.",
            color=discord.Color.red())
        await ctx.respond(embed=embed, ephemeral=True)


@bot.slash_command(name="z-user-notification", description="Notify all server owners about update")
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
                title="🚀 Link Protect – Update to Version 2.0.00",
                description=(
                    "**We're excited to announce that Link Protect has been successfully updated to version `2.0.00`.**\n\n"
                    "🔒 All link types are now **reliably detected and filtered** again – including Discord invites, suspicious URLs, and custom patterns.\n"
                    "⚙️ Core features like `/enable-google`, `/dashboard`, and advanced filtering have been updated, optimized, and fully restored.\n"
                    "🧪 Despite rigorous testing, bugs may still occur – if you notice anything unusual, please use `/support` to reach out on our support server.\nIts also important to tell me if the Bot does not detect a link!\n\n"
                    "💙 Thank you for trusting Link Protect for over **4 years**.\n"
                    "Your feedback and support have helped us grow into one of the most reliable anti-link bots on Discord.\n\n"
                    "🔧 More improvements and new features are on the way – stay tuned!\n\n"
                    "*– The Link Protect Dev Team*"),color=discord.Color.blurple())
            embed.set_footer(text="⚠️ You have to set up the bot again! ⚠️")
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
        await log_channel.send(embed=result_embed)
    await ctx.respond("✅ Benachrichtigung gestartet, siehe Log-Channel.")


@nootification.error
async def nootification_error(ctx, error):
    if isinstance(error, commands.NotOwner):
        embed = discord.Embed(
            title="⛔ ERROR",
            description="These z- commands are only for the bot owner.",
            color=discord.Color.red()
        )
        await ctx.respond(embed=embed, ephemeral=True)

@bot.slash_command(name="help", description="Get all commands and information")
async def _help(ctx):
    await ctx.defer()
    embed = discord.Embed(title="📖 Link Protect — Commands", color=0x7a7aff)
    embed.add_field(
        name="🔒 Link Blocker",
        value="```"
              "/enable-<type>     Enable a blocker (google, youtube, nsfw, gif,\n"
              "                   invite, bitly, nitro, twitch, steam, all)\n"
              "/disable-<type>    Disable a blocker\n"
              "/enable-malware-secure   Scan links for malware\n"
              "/disable-malware-secure  Disable malware scan\n"
              "/dashboard         Show all current settings```",
        inline=False,
    )
    embed.add_field(
        name="📋 Blacklist",
        value="```"
              "/link-disable <url>   Add a link to the blacklist\n"
              "/link-enable  <url>   Remove a link from the blacklist\n"
              "/list-blacklist       Show all blacklisted links```",
        inline=False,
    )
    embed.add_field(
        name="🚪 Access Control",
        value="```"
              "/enable-channel  #channel   Allow links in this channel\n"
              "/disable-channel #channel   Remove channel exception\n"
              "/enable-member   @user      Allow user to send links\n"
              "/disable-member  @user      Remove user exception\n"
              "/enable-role     @role      Allow role to send links\n"
              "/disable-role    @role      Remove role exception\n"
              "/enable-only-link  #channel Only allow links in channel\n"
              "/disable-only-link          Disable only-link mode```",
        inline=False,
    )
    embed.add_field(
        name="⚠️ Warning System",
        value="```"
              "/warn @user [reason]     Manually warn a user\n"
              "/warnings @user          Show warnings for a user\n"
              "/warn-delete @user <#>   Delete specific warning\n"
              "/warn-reset @user        Reset ALL warnings for a user\n"
              "/warn-delete-server      Delete all warnings on server\n"
              "/warn-kick <number>      Kicks after X warnings (0 = off)\n"
              "/warn-ban  <number>      Bans after X warnings (0 = off)\n"
              "/warn-timeout <warns> <min>  Timeout after X warnings\n"
              "/enable-warn-log  #ch    Log warns/kicks/bans to channel\n"
              "/disable-warn-log        Stop logging```",
        inline=False,
    )
    embed.add_field(
        name="🛠️ Utility",
        value="```"
              "/ping        Show bot latency\n"
              "/stats       Bot statistics\n"
              "/check-link  Manually scan a link for malware\n"
              "/dashboard   Full settings overview\n"
              "/invite      Invite Link Protect\n"
              "/support     Join the support server\n"
              "/update      Latest bot updates```",
        inline=False,
    )
    embed.add_field(
        name="⚠️ IMPORTANT",
        value="Make sure **Link Protect** has the **highest role** in your server so it can delete messages and kick/ban members.",
        inline=False,
    )
    embed.add_field(name="Support Server", value="[Click to join](https://discord.gg/BjDC9t329E)", inline=True)
    embed.add_field(
        name="Try VIP CASINO MASTER",
        value="[Click to Invite](https://discord.com/oauth2/authorize?client_id=1370064293697163326&permissions=2147608640&integration_type=0&scope=bot)",
        inline=True,
    )
    await ctx.respond(embed=embed)


@bot.slash_command(name="update", description="Show latest updates from Link Protect Bot")
async def _update(ctx):
    await ctx.defer()
    embed = discord.Embed(
        title="🔄 Update — Version 2.1.0",
        description="05.06.2026",
        color=discord.Color.dark_blue(),
    )
    embed.add_field(
        name="✨ New Commands",
        value="```"
              " • /ping          — Show bot latency (gateway + API)\n"
              " • /stats         — Server count, user count, uptime\n"
              " • /warn-reset    — Reset ALL warnings for a specific user\n"
              " • /check-link    — Manually scan any URL for malware```",
        inline=False,
    )
    embed.add_field(
        name="⚡ Performance",
        value="```"
              " • 10× faster message processing\n"
              "   All 14 detection modules now share a single cached\n"
              "   database read instead of 28 separate queries per message.\n"
              " • Removed unnecessary 16-shard overhead\n"
              " • top.gg stat posting no longer blocks the event loop```",
        inline=False,
    )
    embed.add_field(
        name="🐞 Bug Fixes",
        value="```"
              " • All-link blocker no longer fires on normal text\n"
              "   (was matching any word containing a dot, e.g. 'v2.0')\n"
              " • NSFW filter now URL-only — no longer triggered by\n"
              "   innocent words like 'lesbian' or 'anal' in conversation\n"
              " • Nitro filter now requires an actual suspicious URL,\n"
              "   not just the phrase 'free discord nitro' in chat\n"
              " • Kick/ban error message now mentions role hierarchy fix\n"
              " • Malware scanner no longer blocks the bot on slow APIs```",
        inline=False,
    )
    embed.add_field(
        name="⭐ Other",
        value="```"
              " • /help completely rewritten with all commands\n"
              " • Warn embed now shows remaining warns until kick/ban\n"
              " • Log embeds include channel mention and message content```",
        inline=False,
    )
    await ctx.respond(embed=embed)

@bot.slash_command(name="ping", description="Show bot latency")
async def _ping(ctx):
    await ctx.defer()
    gateway_ms = round(bot.latency * 1000)
    t_start = time.monotonic()
    await ctx.followup.send("⏱️ Measuring…")
    api_ms = round((time.monotonic() - t_start) * 1000)
    embed = discord.Embed(title="🏓 Pong!", color=0x7a7aff)
    embed.add_field(name="Gateway", value=f"```{gateway_ms} ms```", inline=True)
    embed.add_field(name="API Roundtrip", value=f"```{api_ms} ms```", inline=True)
    quality = "🟢 Excellent" if gateway_ms < 100 else ("🟡 Good" if gateway_ms < 250 else "🔴 High latency")
    embed.set_footer(text=quality)
    await ctx.edit(content="", embed=embed)


@bot.slash_command(name="stats", description="Show bot statistics")
async def _stats(ctx):
    await ctx.defer()
    guild_count = len(bot.guilds)
    user_count = sum(g.member_count or 0 for g in bot.guilds)
    shard_count = bot.shard_count or 1
    embed = discord.Embed(title="📊 Link Protect — Stats", color=0x7a7aff)
    embed.add_field(name="Servers", value=f"```{guild_count:,}```", inline=True)
    embed.add_field(name="Users", value=f"```{user_count:,}```", inline=True)
    embed.add_field(name="Shards", value=f"```{shard_count}```", inline=True)
    embed.add_field(name="Latency", value=f"```{round(bot.latency * 1000)} ms```", inline=True)
    uptime_s = int(time.monotonic() - _startup_time)
    h, rem = divmod(uptime_s, 3600)
    m, s = divmod(rem, 60)
    embed.add_field(name="Uptime", value=f"```{h}h {m}m {s}s```", inline=True)
    embed.add_field(name="Version", value="```2.1.0```", inline=True)
    await ctx.respond(embed=embed)


@bot.slash_command(name="check-link", description="Manually scan a URL for malware")
async def _check_link(ctx, url: discord.Option(str, "URL to scan (must start with http:// or https://)")):
    await ctx.defer()
    if not url.startswith(("http://", "https://")):
        url = "https://" + url
    SAFE_BROWSING_URL = (
        "https://safebrowsing.googleapis.com/v4/threatMatches:find"
        "?key=AIzaSyAHR6g2nl9mGhie60t8p9Ns4utZv_8OR9c"
    )
    payload = {
        "client": {"clientId": "link-protect-bot", "clientVersion": "2.0"},
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


@bot.slash_command(name="warn-reset", description="Reset ALL warnings for a specific user")
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
            await log_channel.send(embed=log_embed)


@bot.slash_command(name="advertise", description="See latest payed advertise")
async def _advertise(ctx):
    await ctx.defer()
    embed = discord.Embed(title="NORECOIL.DE - PREMIUM GAMING SCRIPTS",url="https://norecoil.de",
                          description="🔥Anti Recoil for first person shooter Games 2025",colour=0x00f576)
    embed.add_field(name="> ⭐  Available Games:",value="",inline=False)
    embed.add_field(name="",value="```✅ Valorant```",inline=True)
    embed.add_field(name="",value="```✅ CS 2```",inline=True)
    embed.add_field(name="",value="```✅ R6 ```",inline=True)
    embed.add_field(name="",value="```✅ Warzone```",inline=True)
    embed.add_field(name="",value="```✅ Apex Legends```",inline=True)
    embed.add_field(name="",value="```✅ PUBG```",inline=True)
    embed.add_field(name="",value="```✅ The Finals```",inline=True)
    embed.add_field(name="",value="```✅ Battlefield```",inline=True)
    embed.add_field(name="",value="```✅ Rust```",inline=True)
    embed.add_field(name="> 🔥  Advantages",value="- **24/7** support                    - Controls your mouse, not the game\n- Anticheat safe                  - Get **FREE Updates**\n- **20% OFF**",inline=False)
    embed.add_field(name="",value="```✅ SAFE AND SECURE```",inline=True)
    embed.add_field(name="",value="```✅ Money-back```",inline=True)
    embed.add_field(name="> 💰   Payment  Methodes",value="_Choose one of your favourite payment methodes:_\n**Visa - Mastercard - Paypal - Apple Pay - Google Pay -** __safe via Stripe__",inline=False)
    embed.add_field(name="",value="See for yourself and **[click here to visit Norecoil.de](https://norecoil.de)**",inline=False)
    embed.set_image(
        url="https://cdn.discordapp.com/attachments/1377248736916279347/1447212422111821986/image.png?ex=6936cd19&is=69357b99&hm=0ac66dc59a09896070c4426e97554dbaecac289c79609ba0b14b2799fd60454f&")
    embed.set_footer(text="Norecoil.de © - since 2024",
                     icon_url="https://cdn.discordapp.com/attachments/1377248736916279347/1447214780724154560/image.png?ex=6936cf4b&is=69357dcb&hm=24b896ed54e52e385eaa01f99915e872686676ba10ff2d0f9eb51e6917493268&")
    await ctx.respond(embed=embed)

@bot.slash_command(name="invite", description="Invite Link Protect in YOUR Sever")
async def _invite(ctx):
    await ctx.defer()
    embed = discord.Embed(title="Invite Link Protect", description=" ", color=discord.Color.dark_blue())
    embed.add_field(name=" ",
                    value="Its easy, simple and fast\nto invite Link Protect in to\nyour Server, just click [here](https://discord.com/oauth2/authorize?client_id=888390889892892684&permissions=1376537111638&integration_type=0&scope=bot)")
    embed.set_thumbnail(
        url="https://cdn.discordapp.com/attachments/1377248736916279347/1401505929257816114/image.png?ex=6890859c&is=688f341c&hm=33256df0538f3e15e9a962326979c34358304568251f3f83e17aaf02eceeda6a&")
    await ctx.respond(embed=embed)


@bot.slash_command(name="support", description="Invite Link Protect in YOUR Sever")
async def _support(ctx):
    await ctx.defer()
    embed = discord.Embed(title="SUPPORT", description=" ", color=discord.Color.dark_blue())
    embed.add_field(name=" ", value="Join the support server\nby clicking [here](https://discord.gg/BjDC9t329E)\n")
    embed.set_thumbnail(
        url="https://cdn.discordapp.com/attachments/1402320666346131527/1402323483354202112/Unbenannt_47-Photoroom.png?ex=68937f04&is=68922d84&hm=4f18ad5e934e02d40489afafb81041dc84d98fc9691068136f8a7476fbfc19aa&")
    await ctx.respond(embed=embed)


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
        "invite": False, "twitch": False, "bit": False, "nitro": False, "all": False, "steam": False, "malware": False})
    if "steam" not in protect_data:
        protect_data["steam"] = False
        await asyncio.to_thread(lambda: db.reference(f"{base}/protect/steam").set(False))
    safe_data = await fetch(f"{base}/safe", {
        "google": False, "youtube": False, "nsfw": False, "gif": False,
        "invite": False, "twitch": False, "bit": False, "nitro": False, "steam": False})
    channel_data = await fetch(f"{base}/channel", {"channel": [], "member": [], "role": []})
    link_data = await fetch(f"{base}/link", {"links": 0})
    kick = warn_data.get("kick", 3)
    ban = warn_data.get("ban", 5)
    timeout_data = warn_data.get("timeout", {})
    timeout_warns = timeout_data.get("warnings", 0)
    timeout_time = timeout_data.get("time", 0)
    log_channel = log_data.get("log-channel", 0)
    only_link_channel = log_data.get("link", 0)
    embed = discord.Embed(title="Dashboard", color=0x7a7aff)
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
    roles = channel_data.get("role", [])
    members = channel_data.get("member", [])
    embed.add_field(name="Enabled Channels:",
                    value="```❌ - Empty```" if not channels else ", ".join([f"<#{c}>" for c in channels]), inline=True)
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
        embed.set_footer(text="For blocking your own links, use /link-blacklist")
    else:
        embed.set_footer(text="Need help? Join the support server /support")
    embed.set_image(
        url="https://cdn.discordapp.com/attachments/1377248736916279347/1447212422111821986/image.png?ex=6936cd19&is=69357b99&hm=0ac66dc59a09896070c4426e97554dbaecac289c79609ba0b14b2799fd60454f&")
    try:
        if deferred:
            await ctx.followup.send(embed=embed)
        else:
            await ctx.respond(embed=embed)
    except discord.NotFound:
        print("[dashboard] interaction expired")
    except Exception as e:
        print(f"[dashboard:respond] {e}")


@bot.slash_command(name="enable-google", description="Enable the Link Blocker for Google")
async def _enable_google(ctx):
    await ctx.defer()
    guild_id = str(ctx.guild.id)
    if not (ctx.author.guild_permissions.manage_messages or ctx.author.guild_permissions.administrator):
        embed = discord.Embed(title="⛔ ERROR",
                              description="You need `Manage Messages` or `Administrator` permissions to run this command",
                              color=discord.Color.red())
        await ctx.followup.send(embed=embed)
        return
    protect_data = await asyncio.to_thread(lambda: db.reference(f"/servers/{guild_id}/protect").get()) or {}
    all_enabled = protect_data.get("all", False)
    google_enabled = protect_data.get("google", False)
    if all_enabled == True:
        embed = discord.Embed(title="⛔ ERROR", description="The Google blocker is included in `all`",
                              color=discord.Color.red())
        embed.set_footer(text="Use /disable-all to manage specific links")
        await ctx.followup.send(embed=embed)
        return
    if google_enabled == True:
        embed = discord.Embed(title="INFO", description="The Google blocker is already enabled.",
                              color=discord.Color.orange())
        await ctx.followup.send(embed=embed)
        return
    try:
        await asyncio.to_thread(lambda: db.reference(f"/servers/{guild_id}/protect/google").set(True))
        embed = discord.Embed(title="GOOGLE", description="The Google blocker has been enabled.",
                              color=discord.Color.green())
        await ctx.followup.send(embed=embed)
    except Exception as e:
        embed = discord.Embed(title="⛔ ERROR",
                              description=f"Something went wrong.\nUse /support for help.\n```{str(e)}```",
                              color=discord.Color.dark_red())
        await ctx.followup.send(embed=embed)


@bot.slash_command(name="disable-google", description="Disable the Link Blocker for google")
async def _disgoogle(ctx):
    await ctx.defer()
    guild_id = str(ctx.guild.id)
    if not (ctx.author.guild_permissions.manage_messages or ctx.author.guild_permissions.administrator):
        embed = discord.Embed(title="⛔ ERROR",
                              description="You need `Manage Messages` or `Administrator` permissions to run this command",
                              color=discord.Color.red())
        await ctx.followup.send(embed=embed)
        return
    else:
        protect_data = await asyncio.to_thread(lambda: db.reference(f"/servers/{guild_id}/protect").get()) or {}
        all_enabled = protect_data.get("all", False)
        google_enabled = protect_data.get("google", False)
        if all_enabled == True:
            embed = discord.Embed(title="⛔ ERROR", description="The Google blocker is included in `all`",
                                  color=discord.Color.red())
            embed.set_footer(text="Use /disable-all to manage specific links")
            await ctx.followup.send(embed=embed)
            return
        try:
            await asyncio.to_thread(lambda: db.reference(f"/servers/{guild_id}/protect/google").set(False))
            embed = discord.Embed(title="GOOGLE", description="The Google blocker has been disabled.",
                                  color=discord.Color.green())
            await ctx.followup.send(embed=embed)
            return
        except:
            embed = discord.Embed(title="INFO", description="The Google blocker is already disabled.",
                                  color=discord.Color.orange())
            await ctx.followup.send(embed=embed)
            return


@bot.slash_command(name="enable-youtube", description="Enable the Link Blocker for YouTube")
async def _enable_youtube(ctx):
    await ctx.defer()
    guild_id = str(ctx.guild.id)
    if not (ctx.author.guild_permissions.manage_messages or ctx.author.guild_permissions.administrator):
        embed = discord.Embed(title="⛔ ERROR",
                              description="You need `Manage Messages` or `Administrator` permissions to run this command",
                              color=discord.Color.red())
        await ctx.followup.send(embed=embed)
        return
    protect_data = await asyncio.to_thread(lambda: db.reference(f"/servers/{guild_id}/protect").get()) or {}
    all_enabled = protect_data.get("all", False)
    youtube_enabled = protect_data.get("youtube", False)
    if all_enabled == True:
        embed = discord.Embed(title="⛔ ERROR", description="The YouTube blocker is included in `all`",
                              color=discord.Color.red())
        embed.set_footer(text="Use /disable-all to manage specific links")
        await ctx.followup.send(embed=embed)
        return
    if youtube_enabled == True:
        embed = discord.Embed(title="INFO", description="The YouTube blocker is already enabled.",
                              color=discord.Color.orange())
        await ctx.followup.send(embed=embed)
        return
    try:
        await asyncio.to_thread(lambda: db.reference(f"/servers/{guild_id}/protect/youtube").set(True))
        embed = discord.Embed(title="YOUTUBE", description="The YouTube blocker has been enabled.",
                              color=discord.Color.green())
        await ctx.followup.send(embed=embed)
    except Exception as e:
        embed = discord.Embed(title="⛔ ERROR",
                              description=f"Something went wrong.\nUse /support for help.\n```{str(e)}```",
                              color=discord.Color.dark_red())
        await ctx.followup.send(embed=embed)


@bot.slash_command(name="disable-youtube", description="Disable the Link Blocker for YouTube")
async def _disyoutube(ctx):
    await ctx.defer()
    guild_id = str(ctx.guild.id)
    if not (ctx.author.guild_permissions.manage_messages or ctx.author.guild_permissions.administrator):
        embed = discord.Embed(title="⛔ ERROR",
                              description="You need `Manage Messages` or `Administrator` permissions to run this command",
                              color=discord.Color.red())
        await ctx.followup.send(embed=embed)
        return
    else:
        protect_data = await asyncio.to_thread(lambda: db.reference(f"/servers/{guild_id}/protect").get()) or {}
        all_enabled = protect_data.get("all", False)
        youtube_enabled = protect_data.get("youtube", False)
        if all_enabled == True:
            embed = discord.Embed(title="⛔ ERROR", description="The YouTube blocker is included in `all`",
                                  color=discord.Color.red())
            embed.set_footer(text="Use /disable-all to manage specific links")
            await ctx.followup.send(embed=embed)
            return
        try:
            await asyncio.to_thread(lambda: db.reference(f"/servers/{guild_id}/protect/youtube").set(False))
            embed = discord.Embed(title="YOUTUBE", description="The YouTube blocker has been disabled.",
                                  color=discord.Color.green())
            await ctx.followup.send(embed=embed)
            return
        except:
            embed = discord.Embed(title="INFO", description="The YouTube blocker is already disabled.",
                                  color=discord.Color.orange())
            await ctx.followup.send(embed=embed)
            return


@bot.slash_command(name="enable-nsfw", description="Enable the Link Blocker for NSFW")
async def _enable_nsfw(ctx):
    await ctx.defer()
    guild_id = str(ctx.guild.id)
    if not (ctx.author.guild_permissions.manage_messages or ctx.author.guild_permissions.administrator):
        embed = discord.Embed(title="⛔ ERROR",
                              description="You need `Manage Messages` or `Administrator` permissions to run this command",
                              color=discord.Color.red())
        await ctx.followup.send(embed=embed)
        return
    protect_data = await asyncio.to_thread(lambda: db.reference(f"/servers/{guild_id}/protect").get()) or {}
    all_enabled = protect_data.get("all", False)
    nsfw_enabled = protect_data.get("nsfw", False)
    if all_enabled == True:
        embed = discord.Embed(title="⛔ ERROR", description="The NSFW blocker is included in `all`",
                              color=discord.Color.red())
        embed.set_footer(text="Use /disable-all to manage specific links")
        await ctx.followup.send(embed=embed)
        return
    if nsfw_enabled == True:
        embed = discord.Embed(title="INFO", description="The NFSW blocker is already enabled.",
                              color=discord.Color.orange())
        await ctx.followup.send(embed=embed)
        return
    try:
        await asyncio.to_thread(lambda: db.reference(f"/servers/{guild_id}/protect/nsfw").set(True))
        embed = discord.Embed(title="NFSW", description="The NFSW blocker has been enabled.",
                              color=discord.Color.green())
        await ctx.followup.send(embed=embed)
    except Exception as e:
        embed = discord.Embed(title="⛔ ERROR",
                              description=f"Something went wrong.\nUse /support for help.\n```{str(e)}```",
                              color=discord.Color.dark_red())
        await ctx.followup.send(embed=embed)


@bot.slash_command(name="disable-nsfw", description="Disable the Link Blocker for NSFW")
async def _disnsfw(ctx):
    await ctx.defer()
    guild_id = str(ctx.guild.id)
    if not (ctx.author.guild_permissions.manage_messages or ctx.author.guild_permissions.administrator):
        embed = discord.Embed(title="⛔ ERROR",
                              description="You need `Manage Messages` or `Administrator` permissions to run this command",
                              color=discord.Color.red())
        await ctx.followup.send(embed=embed)
        return
    else:
        protect_data = await asyncio.to_thread(lambda: db.reference(f"/servers/{guild_id}/protect").get()) or {}
        all_enabled = protect_data.get("all", False)
        nsfw_enabled = protect_data.get("nsfw", False)
        if all_enabled == True:
            embed = discord.Embed(title="⛔ ERROR", description="The NSFW blocker is included in `all`",
                                  color=discord.Color.red())
            embed.set_footer(text="Use /disable-all to manage specific links")
            await ctx.followup.send(embed=embed)
            return
        try:
            await asyncio.to_thread(lambda: db.reference(f"/servers/{guild_id}/protect/nsfw").set(False))
            embed = discord.Embed(title="NSFW", description="The NSFW blocker has been disabled.",
                                  color=discord.Color.green())
            await ctx.followup.send(embed=embed)
            return
        except:
            embed = discord.Embed(title="INFO", description="The NSFW blocker is already disabled.",
                                  color=discord.Color.orange())
            await ctx.followup.send(embed=embed)
            return


@bot.slash_command(name="enable-gif", description="Enable the Link Blocker for Gif")
async def _enablegif(ctx):
    await ctx.defer()
    guild_id = str(ctx.guild.id)
    if not (ctx.author.guild_permissions.manage_messages or ctx.author.guild_permissions.administrator):
        embed = discord.Embed(title="⛔ ERROR",
                              description="You need `Manage Messages` or `Administrator` permissions to run this command",
                              color=discord.Color.red())
        await ctx.followup.send(embed=embed)
        return
    protect_data = await asyncio.to_thread(lambda: db.reference(f"/servers/{guild_id}/protect").get()) or {}
    all_enabled = protect_data.get("all", False)
    gif_enabled = protect_data.get("gif", False)
    if all_enabled == True:
        embed = discord.Embed(title="⛔ ERROR", description="The GIF blocker is included in `all`",
                              color=discord.Color.red())
        embed.set_footer(text="Use /disable-all to manage specific links")
        await ctx.followup.send(embed=embed)
        return
    if gif_enabled == True:
        embed = discord.Embed(title="INFO", description="The GIF blocker is already enabled.",
                              color=discord.Color.orange())
        await ctx.followup.send(embed=embed)
        return
    try:
        await asyncio.to_thread(lambda: db.reference(f"/servers/{guild_id}/protect/gif").set(True))
        embed = discord.Embed(title="GIF", description="The GIF blocker has been enabled.", color=discord.Color.green())
        await ctx.followup.send(embed=embed)
    except Exception as e:
        embed = discord.Embed(title="⛔ ERROR",
                              description=f"Something went wrong.\nUse /support for help.\n```{str(e)}```",
                              color=discord.Color.dark_red())
        await ctx.followup.send(embed=embed)


@bot.slash_command(name="disable-gif", description="Disable the Link Blocker for GIF")
async def _disgif(ctx):
    await ctx.defer()
    guild_id = str(ctx.guild.id)
    if not (ctx.author.guild_permissions.manage_messages or ctx.author.guild_permissions.administrator):
        embed = discord.Embed(title="⛔ ERROR",
                              description="You need `Manage Messages` or `Administrator` permissions to run this command",
                              color=discord.Color.red())
        await ctx.followup.send(embed=embed)
        return
    else:
        protect_data = await asyncio.to_thread(lambda: db.reference(f"/servers/{guild_id}/protect").get()) or {}
        all_enabled = protect_data.get("all", False)
        gif_enabled = protect_data.get("gif", False)
        if all_enabled == True:
            embed = discord.Embed(title="⛔ ERROR", description="The GIF blocker is included in `all`",
                                  color=discord.Color.red())
            embed.set_footer(text="Use /disable-all to manage specific links")
            await ctx.followup.send(embed=embed)
            return
        try:
            await asyncio.to_thread(lambda: db.reference(f"/servers/{guild_id}/protect/gif").set(False))
            embed = discord.Embed(title="GIF", description="The GIF blocker has been disabled.",
                                  color=discord.Color.green())
            await ctx.followup.send(embed=embed)
            return
        except:
            embed = discord.Embed(title="INFO", description="The GIF blocker is already disabled.",
                                  color=discord.Color.orange())
            await ctx.followup.send(embed=embed)
            return


@bot.slash_command(name="enable-invite", description="Enable the Link Blocker for Invite")
async def _enableinvite(ctx):
    await ctx.defer()
    guild_id = str(ctx.guild.id)
    if not (ctx.author.guild_permissions.manage_messages or ctx.author.guild_permissions.administrator):
        embed = discord.Embed(title="⛔ ERROR",
                              description="You need `Manage Messages` or `Administrator` permissions to run this command",
                              color=discord.Color.red())
        await ctx.followup.send(embed=embed)
        return
    protect_data = await asyncio.to_thread(lambda: db.reference(f"/servers/{guild_id}/protect").get()) or {}
    all_enabled = protect_data.get("all", False)
    invite_enabled = protect_data.get("invite", False)
    if all_enabled == True:
        embed = discord.Embed(title="⛔ ERROR", description="The Invite blocker is included in `all`",
                              color=discord.Color.red())
        embed.set_footer(text="Use /disable-all to manage specific links")
        await ctx.followup.send(embed=embed)
        return
    if invite_enabled == True:
        embed = discord.Embed(title="INFO", description="The Invite blocker is already enabled.",
                              color=discord.Color.orange())
        await ctx.followup.send(embed=embed)
        return
    try:
        await asyncio.to_thread(lambda: db.reference(f"/servers/{guild_id}/protect/invite").set(True))
        embed = discord.Embed(title="INVITE", description="The Invite blocker has been enabled.",
                              color=discord.Color.green())
        await ctx.followup.send(embed=embed)
    except Exception as e:
        embed = discord.Embed(title="⛔ ERROR",
                              description=f"Something went wrong.\nUse /support for help.\n```{str(e)}```",
                              color=discord.Color.dark_red())
        await ctx.followup.send(embed=embed)


@bot.slash_command(name="disable-invite", description="Disable the Link Blocker for Invite")
async def _disinvite(ctx):
    await ctx.defer()
    guild_id = str(ctx.guild.id)
    if not (ctx.author.guild_permissions.manage_messages or ctx.author.guild_permissions.administrator):
        embed = discord.Embed(title="⛔ ERROR",
                              description="You need `Manage Messages` or `Administrator` permissions to run this command",
                              color=discord.Color.red())
        await ctx.followup.send(embed=embed)
        return
    else:
        protect_data = await asyncio.to_thread(lambda: db.reference(f"/servers/{guild_id}/protect").get()) or {}
        all_enabled = protect_data.get("all", False)
        invite_enabled = protect_data.get("invite", False)
        if all_enabled == True:
            embed = discord.Embed(title="⛔ ERROR", description="The Invite blocker is included in `all`",
                                  color=discord.Color.red())
            embed.set_footer(text="Use /disable-all to manage specific links")
            await ctx.followup.send(embed=embed)
            return
        try:
            await asyncio.to_thread(lambda: db.reference(f"/servers/{guild_id}/protect/invite").set(False))
            embed = discord.Embed(title="INVITE", description="The Invite blocker has been disabled.",
                                  color=discord.Color.green())
            await ctx.followup.send(embed=embed)
            return
        except:
            embed = discord.Embed(title="INFO", description="The Invite blocker is already disabled.",
                                  color=discord.Color.orange())
            await ctx.followup.send(embed=embed)
            return


@bot.slash_command(name="enable-bitly", description="Enable the Link Blocker for Bitly")
async def _enablebitly(ctx):
    await ctx.defer()
    guild_id = str(ctx.guild.id)
    if not (ctx.author.guild_permissions.manage_messages or ctx.author.guild_permissions.administrator):
        embed = discord.Embed(title="⛔ ERROR",
                              description="You need `Manage Messages` or `Administrator` permissions to run this command",
                              color=discord.Color.red())
        await ctx.followup.send(embed=embed)
        return
    protect_data = await asyncio.to_thread(lambda: db.reference(f"/servers/{guild_id}/protect").get()) or {}
    all_enabled = protect_data.get("all", False)
    bitly_enabled = protect_data.get("bit", False)
    if all_enabled == True:
        embed = discord.Embed(title="⛔ ERROR", description="The Bitly blocker is included in `all`",
                              color=discord.Color.red())
        embed.set_footer(text="Use /disable-all to manage specific links")
        await ctx.followup.send(embed=embed)
        return
    if bitly_enabled == True:
        embed = discord.Embed(title="INFO", description="The Bitly blocker is already enabled.",
                              color=discord.Color.orange())
        await ctx.followup.send(embed=embed)
        return
    try:
        await asyncio.to_thread(lambda: db.reference(f"/servers/{guild_id}/protect/bit").set(True))
        embed = discord.Embed(title="BITLY", description="The Bitly blocker has been enabled.",
                              color=discord.Color.green())
        await ctx.followup.send(embed=embed)
    except Exception as e:
        embed = discord.Embed(title="⛔ ERROR",
                              description=f"Something went wrong.\nUse /support for help.\n```{str(e)}```",
                              color=discord.Color.dark_red())
        await ctx.followup.send(embed=embed)


@bot.slash_command(name="disable-bitly", description="Disable the Link Blocker for Bitly")
async def _disbitly(ctx):
    await ctx.defer()
    guild_id = str(ctx.guild.id)
    if not (ctx.author.guild_permissions.manage_messages or ctx.author.guild_permissions.administrator):
        embed = discord.Embed(title="⛔ ERROR",
                              description="You need `Manage Messages` or `Administrator` permissions to run this command",
                              color=discord.Color.red())
        await ctx.followup.send(embed=embed)
        return
    else:
        protect_data = await asyncio.to_thread(lambda: db.reference(f"/servers/{guild_id}/protect").get()) or {}
        all_enabled = protect_data.get("all", False)
        bitly_enabled = protect_data.get("bit", False)
        if all_enabled == True:
            embed = discord.Embed(title="⛔ ERROR", description="The Bitly blocker is included in `all`",
                                  color=discord.Color.red())
            embed.set_footer(text="Use /disable-all to manage specific links")
            await ctx.followup.send(embed=embed)
            return
        try:
            await asyncio.to_thread(lambda: db.reference(f"/servers/{guild_id}/protect/bit").set(False))
            embed = discord.Embed(title="BITLY", description="The Bitly blocker has been disabled.",
                                  color=discord.Color.green())
            await ctx.followup.send(embed=embed)
            return
        except:
            embed = discord.Embed(title="INFO", description="The Bitly blocker is already disabled.",
                                  color=discord.Color.orange())
            await ctx.followup.send(embed=embed)
            return


@bot.slash_command(name="enable-nitro", description="Enable the Link Blocker for Discord Nitro")
async def _enablenitro(ctx):
    await ctx.defer()
    guild_id = str(ctx.guild.id)
    if not (ctx.author.guild_permissions.manage_messages or ctx.author.guild_permissions.administrator):
        embed = discord.Embed(title="⛔ ERROR",
                              description="You need `Manage Messages` or `Administrator` permissions to run this command",
                              color=discord.Color.red())
        await ctx.followup.send(embed=embed)
        return
    protect_data = await asyncio.to_thread(lambda: db.reference(f"/servers/{guild_id}/protect").get()) or {}
    all_enabled = protect_data.get("all", False)
    nitro_enabled = protect_data.get("nitro", False)
    if all_enabled == True:
        embed = discord.Embed(title="⛔ ERROR", description="The Nitro blocker is included in `all`",
                              color=discord.Color.red())
        embed.set_footer(text="Use /disable-all to manage specific links")
        await ctx.followup.send(embed=embed)
        return
    if nitro_enabled == True:
        embed = discord.Embed(title="INFO", description="The Nitro blocker is already enabled.",
                              color=discord.Color.orange())
        await ctx.followup.send(embed=embed)
        return
    try:
        await asyncio.to_thread(lambda: db.reference(f"/servers/{guild_id}/protect/nitro").set(True))
        embed = discord.Embed(title="NITRO", description="The Nitro blocker has been enabled.",
                              color=discord.Color.green())
        await ctx.followup.send(embed=embed)
    except Exception as e:
        embed = discord.Embed(title="⛔ ERROR",
                              description=f"Something went wrong.\nUse /support for help.\n```{str(e)}```",
                              color=discord.Color.dark_red())
        await ctx.followup.send(embed=embed)


@bot.slash_command(name="disable-nitro", description="Disable the Link Blocker for Discord Nitro")
async def _disnitroy(ctx):
    await ctx.defer()
    guild_id = str(ctx.guild.id)
    if not (ctx.author.guild_permissions.manage_messages or ctx.author.guild_permissions.administrator):
        embed = discord.Embed(title="⛔ ERROR",
                              description="You need `Manage Messages` or `Administrator` permissions to run this command",
                              color=discord.Color.red())
        await ctx.followup.send(embed=embed)
        return
    else:
        protect_data = await asyncio.to_thread(lambda: db.reference(f"/servers/{guild_id}/protect").get()) or {}
        all_enabled = protect_data.get("all", False)
        nitro_enabled = protect_data.get("nitro", False)
        if all_enabled == True:
            embed = discord.Embed(title="⛔ ERROR", description="The Nitro blocker is included in `all`",
                                  color=discord.Color.red())
            embed.set_footer(text="Use /disable-all to manage specific links")
            await ctx.followup.send(embed=embed)
            return
        try:
            await asyncio.to_thread(lambda: db.reference(f"/servers/{guild_id}/protect/nitro").set(False))
            embed = discord.Embed(title="NITRO", description="The Nitro blocker has been disabled.",
                                  color=discord.Color.green())
            await ctx.followup.send(embed=embed)
            return
        except:
            embed = discord.Embed(title="INFO", description="The Nitro blocker is already disabled.",
                                  color=discord.Color.orange())
            await ctx.followup.send(embed=embed)
            return


@bot.slash_command(name="enable-twitch", description="Enable the Link Blocker for Twitch")
async def _enabletwitch(ctx):
    await ctx.defer()
    guild_id = str(ctx.guild.id)
    if not (ctx.author.guild_permissions.manage_messages or ctx.author.guild_permissions.administrator):
        embed = discord.Embed(title="⛔ ERROR",
                              description="You need `Manage Messages` or `Administrator` permissions to run this command",
                              color=discord.Color.red())
        await ctx.followup.send(embed=embed)
        return
    protect_data = await asyncio.to_thread(lambda: db.reference(f"/servers/{guild_id}/protect").get()) or {}
    all_enabled = protect_data.get("all", False)
    twitch_enabled = protect_data.get("twitch", False)
    if all_enabled == True:
        embed = discord.Embed(title="⛔ ERROR", description="The Twitch blocker is included in `all`",
                              color=discord.Color.red())
        embed.set_footer(text="Use /disable-all to manage specific links")
        await ctx.followup.send(embed=embed)
        return
    if twitch_enabled == True:
        embed = discord.Embed(title="INFO", description="The Twitch blocker is already enabled.",
                              color=discord.Color.orange())
        await ctx.followup.send(embed=embed)
        return
    try:
        await asyncio.to_thread(lambda: db.reference(f"/servers/{guild_id}/protect/twitch").set(True))
        embed = discord.Embed(title="TWITCH", description="The Twitch blocker has been enabled.",
                              color=discord.Color.green())
        await ctx.followup.send(embed=embed)
    except Exception as e:
        embed = discord.Embed(title="⛔ ERROR",
                              description=f"Something went wrong.\nUse /support for help.\n```{str(e)}```",
                              color=discord.Color.dark_red())
        await ctx.followup.send(embed=embed)


@bot.slash_command(name="disable-twitch", description="Disable the Link Blocker for Twitch")
async def _distwitch(ctx):
    await ctx.defer()
    guild_id = str(ctx.guild.id)
    if not (ctx.author.guild_permissions.manage_messages or ctx.author.guild_permissions.administrator):
        embed = discord.Embed(title="⛔ ERROR",
                              description="You need `Manage Messages` or `Administrator` permissions to run this command",
                              color=discord.Color.red())
        await ctx.followup.send(embed=embed)
        return
    else:
        protect_data = await asyncio.to_thread(lambda: db.reference(f"/servers/{guild_id}/protect").get()) or {}
        all_enabled = protect_data.get("all", False)
        twitch_enabled = protect_data.get("twitch", False)
        if all_enabled == True:
            embed = discord.Embed(title="⛔ ERROR", description="The Twitch blocker is included in `all`",
                                  color=discord.Color.red())
            embed.set_footer(text="Use /disable-all to manage specific links")
            await ctx.followup.send(embed=embed)
            return
        try:
            await asyncio.to_thread(lambda: db.reference(f"/servers/{guild_id}/protect/twitch").set(False))
            embed = discord.Embed(title="TWITCH", description="The Twitch blocker has been disabled.",
                                  color=discord.Color.green())
            await ctx.followup.send(embed=embed)
            return
        except:
            embed = discord.Embed(title="INFO", description="The Twitch blocker is already disabled.",
                                  color=discord.Color.orange())
            await ctx.followup.send(embed=embed)
            return

@bot.slash_command(name="enable-steam", description="Enable the Link Blocker for Steam")
async def _enablesteam(ctx):
    await ctx.defer()
    guild_id = str(ctx.guild.id)
    if not (ctx.author.guild_permissions.manage_messages or ctx.author.guild_permissions.administrator):
        embed = discord.Embed(title="⛔ ERROR",
                              description="You need `Manage Messages` or `Administrator` permissions to run this command",
                              color=discord.Color.red())
        await ctx.followup.send(embed=embed)
        return
    protect_data = await asyncio.to_thread(lambda: db.reference(f"/servers/{guild_id}/protect").get()) or {}
    all_enabled = protect_data.get("all", False)
    steam_enabled = protect_data.get("steam", False)
    if all_enabled == True:
        embed = discord.Embed(title="⛔ ERROR", description="The Steam blocker is included in `all`",
                              color=discord.Color.red())
        embed.set_footer(text="Use /disable-all to manage specific links")
        await ctx.followup.send(embed=embed)
        return
    if steam_enabled == True:
        embed = discord.Embed(title="INFO", description="The Steam blocker is already enabled.",
                              color=discord.Color.orange())
        await ctx.followup.send(embed=embed)
        return
    try:
        await asyncio.to_thread(lambda: db.reference(f"/servers/{guild_id}/protect/steam").set(True))
        embed = discord.Embed(title="STEAM", description="The Steam blocker has been enabled.",
                              color=discord.Color.green())
        await ctx.followup.send(embed=embed)
    except Exception as e:
        embed = discord.Embed(title="⛔ ERROR",
                              description=f"Something went wrong.\nUse /support for help.\n```{str(e)}```",
                              color=discord.Color.dark_red())
        await ctx.followup.send(embed=embed)


@bot.slash_command(name="disable-steam", description="Disable the Link Blocker for Steam")
async def _dissteam(ctx):
    await ctx.defer()
    guild_id = str(ctx.guild.id)
    if not (ctx.author.guild_permissions.manage_messages or ctx.author.guild_permissions.administrator):
        embed = discord.Embed(title="⛔ ERROR",
                              description="You need `Manage Messages` or `Administrator` permissions to run this command",
                              color=discord.Color.red())
        await ctx.followup.send(embed=embed)
        return
    else:
        protect_data = await asyncio.to_thread(lambda: db.reference(f"/servers/{guild_id}/protect").get()) or {}
        all_enabled = protect_data.get("all", False)
        steam_enabled = protect_data.get("steam", False)
        if all_enabled == True:
            embed = discord.Embed(title="⛔ ERROR", description="The Steam blocker is included in `all`",
                                  color=discord.Color.red())
            embed.set_footer(text="Use /disable-all to manage specific links")
            await ctx.followup.send(embed=embed)
            return
        try:
            await asyncio.to_thread(lambda: db.reference(f"/servers/{guild_id}/protect/steam").set(False))
            embed = discord.Embed(title="STEAM", description="The Steam blocker has been disabled.",
                                  color=discord.Color.green())
            await ctx.followup.send(embed=embed)
            return
        except:
            embed = discord.Embed(title="INFO", description="The Steam blocker is already disabled.",
                                  color=discord.Color.orange())
            await ctx.followup.send(embed=embed)
            return

@bot.slash_command(name="enable-silent-mode",
                   description="Delete links silently (DM user instead of public channel warning)")
async def _enable_silent(ctx):
    await ctx.defer()
    guild_id = str(ctx.guild.id)
    if not (ctx.author.guild_permissions.manage_messages or ctx.author.guild_permissions.administrator):
        await ctx.followup.send(embed=discord.Embed(
            title="⛔ ERROR",
            description="You need `Manage Messages` or `Administrator` permissions.",
            color=discord.Color.red()))
        return
    current = await asyncio.to_thread(lambda: db.reference(f"/servers/{guild_id}/silent").get())
    if current:
        await ctx.followup.send(embed=discord.Embed(
            title="INFO", description="Silent mode is already enabled.",
            color=discord.Color.orange()))
        return
    await asyncio.to_thread(lambda: db.reference(f"/servers/{guild_id}/silent").set(True))
    embed = discord.Embed(
        title="🔇 Silent Mode Enabled",
        description="Links are deleted **without** a public warning message.\n"
                    "The user receives a **DM** instead (if DMs are open).\n"
                    "Kicks/bans/logs still work normally.",
        color=discord.Color.green())
    await ctx.followup.send(embed=embed)


@bot.slash_command(name="disable-silent-mode",
                   description="Re-enable public warning messages when a link is deleted")
async def _disable_silent(ctx):
    await ctx.defer()
    guild_id = str(ctx.guild.id)
    if not (ctx.author.guild_permissions.manage_messages or ctx.author.guild_permissions.administrator):
        await ctx.followup.send(embed=discord.Embed(
            title="⛔ ERROR",
            description="You need `Manage Messages` or `Administrator` permissions.",
            color=discord.Color.red()))
        return
    await asyncio.to_thread(lambda: db.reference(f"/servers/{guild_id}/silent").set(False))
    await ctx.followup.send(embed=discord.Embed(
        title="🔔 Silent Mode Disabled",
        description="Warning messages are now sent publicly in the channel again.",
        color=discord.Color.green()))


@bot.slash_command(name="enable-malware-secure", description="Enable the malware check for your server")
async def _enablemalware(ctx):
    await ctx.defer()
    guild_id = str(ctx.guild.id)
    if not (ctx.author.guild_permissions.manage_messages or ctx.author.guild_permissions.administrator):
        embed = discord.Embed(title="⛔ ERROR",
                              description="You need `Manage Messages` or `Administrator` permissions to run this command",
                              color=discord.Color.red())
        await ctx.followup.send(embed=embed)
        return
    protect_data = await asyncio.to_thread(lambda: db.reference(f"/servers/{guild_id}/protect").get()) or {}
    malware_enabled = protect_data.get("malware", False)
    if malware_enabled == True:
        embed = discord.Embed(title="INFO", description="The Malware Secuire is already enabled.",
                              color=discord.Color.orange())
        await ctx.followup.send(embed=embed)
        return
    try:
        await asyncio.to_thread(lambda: db.reference(f"/servers/{guild_id}/protect/malware").set(True))
        embed = discord.Embed(title="MALWARE SECURE", description="The Malware Secure has been enabled.",
                              color=discord.Color.green())
        await ctx.followup.send(embed=embed)
    except Exception as e:
        embed = discord.Embed(title="⛔ ERROR",
                              description=f"Something went wrong.\nUse /support for help.\n```{str(e)}```",
                              color=discord.Color.dark_red())
        await ctx.followup.send(embed=embed)

@bot.slash_command(name="disable-malware-secure", description="Disable the malware check for your server")
async def _dismalware(ctx):
    await ctx.defer()
    guild_id = str(ctx.guild.id)
    if not (ctx.author.guild_permissions.manage_messages or ctx.author.guild_permissions.administrator):
        embed = discord.Embed(title="⛔ ERROR",
                              description="You need `Manage Messages` or `Administrator` permissions to run this command",
                              color=discord.Color.red())
        await ctx.followup.send(embed=embed)
        return
    else:
        protect_data = await asyncio.to_thread(lambda: db.reference(f"/servers/{guild_id}/protect").get()) or {}
        steam_enabled = protect_data.get("malware", False)
        try:
            await asyncio.to_thread(lambda: db.reference(f"/servers/{guild_id}/protect/malware").set(False))
            embed = discord.Embed(title="MALWARE SECURE", description="The Malware Secure has been disabled.",
                                  color=discord.Color.green())
            await ctx.followup.send(embed=embed)
            return
        except:
            embed = discord.Embed(title="INFO", description="The Malware Secure is already disabled.",
                                  color=discord.Color.orange())
            await ctx.followup.send(embed=embed)
            return

@bot.slash_command(name="enable-all", description="Enable the Link Blocker for all links")
async def _enable_all(ctx):
    await ctx.defer()
    guild_id = str(ctx.guild.id)
    if not (ctx.author.guild_permissions.manage_messages or ctx.author.guild_permissions.administrator):
        embed = discord.Embed(title="⛔ ERROR",
                              description="You need `Manage Messages` or `Administrator` permissions to run this command",
                              color=discord.Color.red())
        await ctx.followup.send(embed=embed)
        return
    protect_ref = db.reference(f"/servers/{guild_id}/protect")
    protect_data = protect_ref.get() or {}
    if protect_data.get("all", False):
        embed = discord.Embed(title="INFO", description="The All Link blocker is already enabled.",
                              color=discord.Color.orange())
        await ctx.followup.send(embed=embed)
        return
    safe_ref = db.reference(f"/servers/{guild_id}/safe")
    to_safe = {key: value for key, value in protect_data.items() if key != "all" and value is True}
    safe_ref.set(to_safe)
    new_protect = {key: False for key in protect_data if key != "all"}
    new_protect["all"] = True
    protect_ref.set(new_protect)
    embed = discord.Embed(title="ALL", description="The All Links blocker has been enabled.",
                          color=discord.Color.green())
    await ctx.followup.send(embed=embed)


@bot.slash_command(name="disable-all", description="Disable the Link Blocker for All links")
async def _disable_all(ctx):
    await ctx.defer()
    guild_id = str(ctx.guild.id)
    if not (ctx.author.guild_permissions.manage_messages or ctx.author.guild_permissions.administrator):
        embed = discord.Embed(title="⛔ ERROR",
                              description="You need `Manage Messages` or `Administrator` permissions to run this command",
                              color=discord.Color.red())
        await ctx.followup.send(embed=embed)
        return
    protect_ref = db.reference(f"/servers/{guild_id}/protect")
    safe_ref = db.reference(f"/servers/{guild_id}/safe")
    protect_data = protect_ref.get() or {}
    if not protect_data.get("all", False):
        embed = discord.Embed(title="⛔ ERROR", description="The All Link blocker is already disabled.",
                              color=discord.Color.red())
        await ctx.followup.send(embed=embed)
        return
    safe_data = safe_ref.get() or {}
    safe_ref.set({key: False for key in safe_data})
    restored_protect = {key: (safe_data.get(key, False)) for key in protect_data if key != "all"}
    restored_protect["all"] = False
    protect_ref.set(restored_protect)
    embed = discord.Embed(title="ALL", description="The All Links blocker has been disabled.",
                          color=discord.Color.green())
    await ctx.followup.send(embed=embed)


@bot.slash_command(name="disable-channel", description="Remove disabled channels the bot deletes links from")
async def _dischannel(ctx, name: discord.Option(str, "Mention the channel to disable (e.g. #general)")):
    await ctx.defer()
    guild_id = str(ctx.guild.id)
    if not (ctx.author.guild_permissions.manage_messages or ctx.author.guild_permissions.administrator):
        embed = discord.Embed(title="⛔ ERROR",
                              description="You need Manage Messages or Administrator permissions to run this command",
                              color=discord.Color.red())
        await ctx.followup.send(embed=embed)
        return
    if not name.startswith("<#") or not name.endswith(">"):
        embed = discord.Embed(title="⛔ ERROR",
                              description="Please provide a valid channel mention like #channel.",
                              color=discord.Color.red())
        await ctx.followup.send(embed=embed)
        return
    channel_id = name.replace("<#", "").replace(">", "")
    ref = db.reference(f"/servers/{guild_id}/channel/channel")
    current_channels = ref.get() or []
    if not isinstance(current_channels, list) or len(current_channels) == 0:
        embed = discord.Embed(title="⛔ ERROR",
                              description="You have no enabled channels.",
                              color=discord.Color.red())
        await ctx.followup.send(embed=embed)
        return
    if channel_id in current_channels:
        current_channels.remove(channel_id)
        ref.set(current_channels)
        embed = discord.Embed(title="Channel",
                              description=f"{name} has been disabled.",
                              color=discord.Color.green())
        await ctx.followup.send(embed=embed)
    else:
        embed = discord.Embed(title="INFO",
                              description=f"{name} is not enabled.",
                              color=discord.Color.orange())
        await ctx.followup.send(embed=embed)


@bot.slash_command(name="enable-channel", description="Set channels the bot should NOT delete links from")
async def _enchannel(ctx, name: discord.Option(str, "Mention the channel to enable (e.g. #general)")):
    await ctx.defer()
    guild_id = str(ctx.guild.id)
    if not (ctx.author.guild_permissions.manage_messages or ctx.author.guild_permissions.administrator):
        embed = discord.Embed(title="⛔ ERROR",
                              description="You need Manage Messages or Administrator permissions to run this command",
                              color=discord.Color.red())
        await ctx.followup.send(embed=embed)
        return
    if not name.startswith("<#") or not name.endswith(">"):
        embed = discord.Embed(title="⛔ ERROR",
                              description="Please provide a valid channel mention like #channel.",
                              color=discord.Color.red()
                              )
        await ctx.followup.send(embed=embed)
        return
    channel_id = name.replace("<#", "").replace(">", "")
    ref = db.reference(f"/servers/{guild_id}/channel/channel")
    current_channels = ref.get()
    if not isinstance(current_channels, list):
        current_channels = []
        ref.set([])
    if channel_id in current_channels:
        embed = discord.Embed(title="INFO", description=f"{name} is already enabled.", color=discord.Color.orange())
        await ctx.followup.send(embed=embed)
        return
    current_channels.append(channel_id)
    ref.set(current_channels)
    embed = discord.Embed(title="Channel", description=f"{name} has been enabled.", color=discord.Color.green())
    await ctx.followup.send(embed=embed)


@bot.slash_command(name="enable-only-link",
                   description="Set a channel where the bot deletes every message that is not a link.")
async def _enlink(ctx, channelname: discord.Option(str, "Mention the channel (e.g. #general)")):
    await ctx.defer()
    guild_id = str(ctx.guild.id)
    if not (ctx.author.guild_permissions.manage_messages or ctx.author.guild_permissions.administrator):
        embed = discord.Embed(
            title="⛔ ERROR",
            description="You need `Manage Messages` or `Administrator` permissions to run this command",
            color=discord.Color.red())
        await ctx.followup.send(embed=embed)
        return
    if not channelname.startswith("<#") or not channelname.endswith(">"):
        embed = discord.Embed(
            title="⛔ ERROR",
            description="Please mention a valid channel like `#general`.",
            color=discord.Color.red())
        await ctx.followup.send(embed=embed)
        return
    channel_id = int(channelname.replace("<#", "").replace(">", ""))
    ref_link = db.reference(f"/servers/{guild_id}/log/link")
    ref_onlylink = db.reference(f"/servers/{guild_id}/log/onlylink")
    current = ref_link.get() or 0
    if current == channel_id:
        embed = discord.Embed(
            title="INFO",
            description=f"<#{current}> is already the only link channel.",
            color=discord.Color.orange())
        await ctx.followup.send(embed=embed)
        return
    ref_link.set(channel_id)
    ref_onlylink.set(True)
    channel = ctx.guild.get_channel(channel_id)
    await channel.send("This channel is set for **Only Links**.")
    embed = discord.Embed(
        title="Only Link",
        description=f"{channel.mention} is now the active Only Link Channel.",
        color=discord.Color.green())
    await ctx.followup.send(embed=embed)


@bot.slash_command(name="disable-only-link",
                   description="Disable the channel where the bot deletes messages that are not links.")
async def _dislink(ctx):
    await ctx.defer()
    guild_id = str(ctx.guild.id)
    if not (ctx.author.guild_permissions.manage_messages or ctx.author.guild_permissions.administrator):
        embed = discord.Embed(
            title="⛔ ERROR",
            description="You need `Manage Messages` or `Administrator` permissions to run this command",
            color=discord.Color.red())
        await ctx.followup.send(embed=embed)
        return
    ref_link = db.reference(f"/servers/{guild_id}/log/link")
    ref_onlylink = db.reference(f"/servers/{guild_id}/log/onlylink")
    current = ref_link.get() or 0
    if current == 0:
        embed = discord.Embed(
            title="INFO",
            description="No 'Only Link' channel is currently enabled.",
            color=discord.Color.orange())
        await ctx.followup.send(embed=embed)
        return
    ref_link.set(0)
    ref_onlylink.set(False)
    embed = discord.Embed(
        title="Only Link",
        description=f"<#{current}> has been disabled as the 'Only Link' channel.",
        color=discord.Color.green())
    await ctx.followup.send(embed=embed)


@bot.slash_command(name="disable-member", description="Don't allow a member to send links")
async def _dismember(ctx, member: discord.Option(str, "Mention the member to disable (e.g. @User)")):
    await ctx.defer()
    guild_id = str(ctx.guild.id)
    if not (ctx.author.guild_permissions.manage_messages or ctx.author.guild_permissions.administrator):
        embed = discord.Embed(title="⛔ ERROR",
                              description="You need Manage Messages or Administrator permissions to run this command",
                              color=discord.Color.red())
        await ctx.followup.send(embed=embed)
        return
    if not member.startswith("<@") or not member.endswith(">"):
        embed = discord.Embed(
            title="⛔ ERROR", description="Please provide a member mention like @username", color=discord.Color.red())
        await ctx.followup.send(embed=embed)
        return
    member_id = member.replace("<@", "").replace(">", "").replace("!", "")
    ref = db.reference(f"/servers/{guild_id}/channel/member")
    member_list = ref.get()
    if not isinstance(member_list, list) or len(member_list) == 0:
        embed = discord.Embed(title="INFO", description="You have no enabled members.", color=discord.Color.orange())
        await ctx.followup.send(embed=embed)
        return
    if member_id in member_list:
        member_list.remove(member_id)
        ref.set(member_list)
        embed = discord.Embed(title="Member", description=f"{member} has been disabled.", color=discord.Color.green())
        await ctx.followup.send(embed=embed)
    else:
        embed = discord.Embed(title="INFO", description=f"{member} is not enabled.", color=discord.Color.orange())
        await ctx.followup.send(embed=embed)


@bot.slash_command(name="enable-member", description="Allow a member to send links")
async def _enmember(ctx, member: discord.Option(str, "Mention the member to enable (e.g. @user)")):
    await ctx.defer()
    guild_id = str(ctx.guild.id)
    if not (ctx.author.guild_permissions.manage_messages or ctx.author.guild_permissions.administrator):
        embed = discord.Embed(title="⛔ ERROR",
                              description="You need Manage Messages or Administrator permissions to run this command",
                              color=discord.Color.red())
        await ctx.followup.send(embed=embed)
        return
    if not member.startswith("<@") or not member.endswith(">"):
        embed = discord.Embed(title="⛔ ERROR",
                              description="Please provide a valid member mention like @username.",
                              color=discord.Color.red())
        await ctx.followup.send(embed=embed)
        return
    member_id = member.replace("<@", "").replace(">", "").replace("!", "")
    ref = db.reference(f"/servers/{guild_id}/channel/member")
    member_list = ref.get()
    if not isinstance(member_list, list):
        member_list = []
        ref.set([])
    if member_id in member_list:
        embed = discord.Embed(title="INFO", description=f"{member} is already enabled.", color=discord.Color.orange())
        await ctx.followup.send(embed=embed)
        return
    member_list.append(member_id)
    ref.set(member_list)
    embed = discord.Embed(title="Member", description=f"{member} has been enabled.", color=discord.Color.green())
    await ctx.followup.send(embed=embed)


@bot.slash_command(name="disable-role", description="Don't allow a role to send links")
async def _disrole(ctx, role: discord.Option(str, "Mention the role to disable (e.g. @role)")):
    await ctx.defer()
    guild_id = str(ctx.guild.id)
    if not (ctx.author.guild_permissions.manage_messages or ctx.author.guild_permissions.administrator):
        embed = discord.Embed(title="⛔ ERROR",
                              description="You need `Manage Messages` or `Administrator` permissions to run this command",
                              color=discord.Color.red())
        await ctx.followup.send(embed=embed)
        return
    if not role.startswith("<@&") or not role.endswith(">"):
        embed = discord.Embed(title="⛔ ERROR",
                              description="Please provide a role mention like `@rolename`", color=discord.Color.red())
        await ctx.followup.send(embed=embed)
        return
    role_id = role.replace("<@&", "").replace(">", "")
    ref = db.reference(f"/servers/{guild_id}/channel/role")
    role_list = ref.get()
    if not isinstance(role_list, list) or len(role_list) == 0:
        embed = discord.Embed(title="INFO", description="You have no enabled roles.", color=discord.Color.orange())
        await ctx.followup.send(embed=embed)
        return
    if role_id in role_list:
        role_list.remove(role_id)
        ref.set(role_list)
        embed = discord.Embed(title="Role", description=f"{role} has been disabled.", color=discord.Color.green())
        await ctx.followup.send(embed=embed)
    else:
        embed = discord.Embed(title="INFO", description=f"{role} is not enabled.", color=discord.Color.orange())
        await ctx.followup.send(embed=embed)


@bot.slash_command(name="enable-role", description="Allow a role to send links")
async def _enrole(ctx, role: discord.Option(str, "Mention the role to enable (e.g. @role)")):
    await ctx.defer()
    guild_id = str(ctx.guild.id)
    if not (ctx.author.guild_permissions.manage_messages or ctx.author.guild_permissions.administrator):
        embed = discord.Embed(title="⛔ ERROR",
                              description="You need `Manage Messages` or `Administrator` permissions to run this command",
                              color=discord.Color.red())
        await ctx.followup.send(embed=embed)
        return
    if not role.startswith("<@&") or not role.endswith(">"):
        embed = discord.Embed(title="⛔ ERROR",
                              description="Please provide a valid role mention like `@rolename`.",
                              color=discord.Color.red())
        await ctx.followup.send(embed=embed)
        return
    role_id = role.replace("<@&", "").replace(">", "")
    ref = db.reference(f"/servers/{guild_id}/channel/role")
    role_list = ref.get()
    if not isinstance(role_list, list):
        role_list = []
        ref.set([])
    if role_id in role_list:
        embed = discord.Embed(title="INFO", description=f"{role} is already enabled.", color=discord.Color.orange())
        await ctx.followup.send(embed=embed)
        return
    role_list.append(role_id)
    ref.set(role_list)
    embed = discord.Embed(title="Role", description=f"{role} has been enabled.", color=discord.Color.green())
    await ctx.followup.send(embed=embed)

@bot.slash_command(
    name="warn-timeout",
    description="Set warnings until a member gets timed out and the timeout duration")
async def _warntimeout(
    ctx,
    warnings: discord.Option(int, "Number of warnings before timeout"),
    time: discord.Option(int, "Timeout duration in minutes")
):
    await ctx.defer()
    guild_id = str(ctx.guild.id)
    if not (ctx.author.guild_permissions.manage_messages or ctx.author.guild_permissions.administrator):
        embed = discord.Embed(
            title="⛔ ERROR",
            description="You need `Manage Messages` or `Administrator` permissions to run this command",
            color=discord.Color.red()
        )
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
        embed = discord.Embed(
            title="Warn-timeout",
            description="Warn-timeout has been disabled.",
            color=discord.Color.green()
        )
        await ctx.followup.send(embed=embed)
        return
    if time <= 0:
        embed = discord.Embed(
            title="⛔ ERROR",
            description="Timeout duration must be greater than 0 minutes.",
            color=discord.Color.red()
        )
        await ctx.followup.send(embed=embed)
        return
    if warnings == current_warnings and time == current_time:
        embed = discord.Embed(
            title="INFO",
            description=f"Warn-timeout was already set to ``{warnings}`` warnings → ``{time}`` minutes.",
            color=discord.Color.orange()
        )
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


@bot.slash_command(name="warn-kick", description="Set number of warnings until a member gets kicked")
async def _warnkick(ctx, number: discord.Option(int, "Number of warnings before kick")):
    await ctx.defer()
    guild_id = str(ctx.guild.id)
    if not (ctx.author.guild_permissions.manage_messages or ctx.author.guild_permissions.administrator):
        embed = discord.Embed(title="⛔ ERROR",
                              description="You need `Manage Messages` or `Administrator` permissions to run this command",
                              color=discord.Color.red())
        await ctx.followup.send(embed=embed)
        return
    ref_warn = db.reference(f"/servers/{guild_id}/warn")
    warn_data = ref_warn.get() or {"kick": 3, "ban": 5}
    current_kick = warn_data.get("kick", 0)
    current_ban = warn_data.get("ban", 0)
    if int(number) == 0:
        ref_warn.child("kick").set(0)
        embed = discord.Embed(title="Warn-kick", description="Kick has been disabled.", color=discord.Color.green())
        await ctx.followup.send(embed=embed)
        return
    if current_ban > 0 and int(number) >= current_ban:
        embed = discord.Embed(title="⛔ ERROR",
                              description=f"Please disable warn-ban or set warn-ban higher than ``{int(number)}`` to set warn-kick.",
                              color=discord.Color.red())
        await ctx.followup.send(embed=embed)
        return
    if int(number) == current_kick:
        embed = discord.Embed(title="INFO", description=f"Kick was already set to ``{number}``.",
                              color=discord.Color.orange())
        await ctx.followup.send(embed=embed)
        return
    ref_warn.child("kick").set(int(number))
    embed = discord.Embed(title="Warn-kick",
                          description=f"Warn-Kick has been changed from ``{current_kick}`` to ``{number}``.",
                          color=discord.Color.green())
    await ctx.followup.send(embed=embed)


@bot.slash_command(name="warn-ban", description="Set number of warnings until a member gets banned")
async def _warnban(ctx, number: discord.Option(int, "Number of warnings before ban")):
    await ctx.defer()
    guild_id = str(ctx.guild.id)
    if not (ctx.author.guild_permissions.manage_messages or ctx.author.guild_permissions.administrator):
        embed = discord.Embed(title="⛔ ERROR",
                              description="You need `Manage Messages` or `Administrator` permissions to run this command",
                              color=discord.Color.red())
        await ctx.followup.send(embed=embed)
        return
    ref_warn = db.reference(f"/servers/{guild_id}/warn")
    warn_data = ref_warn.get() or {"kick": 3, "ban": 5}
    current_ban = warn_data.get("ban", 0)
    current_kick = warn_data.get("kick", 0)
    if int(number) == 0:
        ref_warn.child("ban").set(0)
        embed = discord.Embed(title="Warn-ban", description="Ban has been disabled.", color=discord.Color.green())
        await ctx.followup.send(embed=embed)
        return
    if current_kick > 0 and int(number) <= current_kick:
        embed = discord.Embed(title="⛔ ERROR",
                              description=f"Please disable warn-kick or set warn-kick lower than ``{int(number)}`` to set warn-ban.",
                              color=discord.Color.red())
        await ctx.followup.send(embed=embed)
        return
    if int(number) == current_ban:
        embed = discord.Embed(title="INFO", description=f"Ban was already set to ``{number}``.",
                              color=discord.Color.orange())
        await ctx.followup.send(embed=embed)
        return
    ref_warn.child("ban").set(int(number))
    embed = discord.Embed(title="Warn-ban",
                          description=f"Warn-Ban has been changed from ``{current_ban}`` to ``{number}``.",
                          color=discord.Color.green())
    await ctx.followup.send(embed=embed)


@bot.slash_command(name="warn", description="Warn a user")
async def warn_user(ctx, member: discord.Member,
                    reason: discord.Option(str, "Reason", required=False) = "No reason provided."):
    await ctx.defer()
    guild_id = str(ctx.guild.id)
    user_id = str(member.id)
    if not (ctx.author.guild_permissions.manage_messages or ctx.author.guild_permissions.administrator):
        embed = discord.Embed(title="⛔ ERROR",
                              description="You need `Manage Messages` or `Administrator` permissions to run this command.",
                              color=discord.Color.red())
        await ctx.followup.send(embed=embed)
        return
    ref_warn = db.reference(f"/servers/{guild_id}/warn")
    warn_data = ref_warn.get() or {}
    kick = warn_data.get("kick", 0)
    ban = warn_data.get("ban", 0)
    member_ref = ref_warn.child(f"{user_id}")
    user_data = member_ref.get() or {"Warn": 0, "reason": []}
    current_warn = user_data.get("Warn", 0) + 1
    reasons = user_data.get("reason", [])
    reasons.append(reason)
    member_ref.update({
        "Warn": current_warn,
        "reason": reasons})
    embed = discord.Embed(title="WARN",
                          description=f"{ctx.author.mention} has warned {member.mention} for:\n -  {reason}",
                          color=0x7a7aff)
    embed.add_field(name="Total warnings", value=f"{member.name} now has ``{current_warn}`` warning(s).")
    await ctx.followup.send(embed=embed)
    if kick > 0 and current_warn >= kick:
        try:
            await member.kick(reason=f"{kick} warnings")
            embed_kick = discord.Embed(title="WARN-KICK",
                                       description=f"{member.mention} has been kicked for reaching ``{kick}`` warnings.",
                                       color=discord.Color.light_grey())
            await ctx.followup.send(embed=embed_kick)
        except:
            embed_err = discord.Embed(title="⛔ ERROR",
                                      description=f"I could not kick {member.mention}. Check my permissions.",
                                      color=discord.Color.red())
            await ctx.followup.send(embed=embed_err)
    if ban > 0 and current_warn >= ban:
        try:
            await member.ban(reason=f"{ban} warnings")
            embed_ban = discord.Embed(title="WARN-BAN",
                                      description=f"{member.mention} has been banned for reaching ``{ban}`` warnings.",
                                      color=discord.Color.red())
            await ctx.followup.send(embed=embed_ban)
        except:
            embed_err = discord.Embed(title="⛔ ERROR",
                                      description=f"I could not ban {member.mention}. Check my permissions.",
                                      color=discord.Color.red())
            await ctx.followup.send(embed=embed_err)
    log_ref = db.reference(f"/servers/{guild_id}/log/log-channel")
    log_channel_id = log_ref.get()
    if log_channel_id and log_channel_id != 0:
        log_channel = bot.get_channel(log_channel_id)
        if log_channel:
            log_embed = discord.Embed(title="[AUTO-MOD] User Warned",
                                      description=f"{ctx.author.mention} warned {member.mention} for:\n - {reason}",
                                      color=discord.Color.orange())
            await log_channel.send(embed=log_embed)


@bot.slash_command(name="warnings", description="Show all warnings from a user")
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


@bot.slash_command(name="warn-delete", description="Delete a specific warning from a user")
async def _warndel(ctx, member: discord.Member,
                   index: discord.Option(int, "Which warning to delete (e.g. 1 for first warning)")):
    await ctx.defer()
    guild_id = str(ctx.guild.id)
    user_id = str(member.id)
    if not (ctx.author.guild_permissions.manage_messages or ctx.author.guild_permissions.administrator):
        embed = discord.Embed(
            title="⛔ ERROR",
            description="You need `Manage Messages` or `Administrator` permissions to run this command.",
            color=discord.Color.red()
        )
        await ctx.followup.send(embed=embed)
        return
    ref = db.reference(f"/servers/{guild_id}/warn/{user_id}")
    user_data = ref.get()
    if not user_data:
        embed = discord.Embed(
            title="INFO",
            description=f"{member.mention} has no warnings.",
            color=discord.Color.orange()
        )
        await ctx.followup.send(embed=embed)
        return
    reasons = user_data.get("reason", [])
    warn_count = user_data.get("Warn", 0)
    if index < 1 or index > len(reasons):
        embed = discord.Embed(
            title="⛔ ERROR",
            description=f"{member.mention} only has `{len(reasons)}` warning(s).",
            color=discord.Color.red()
        )
        await ctx.followup.send(embed=embed)
        return
    removed = reasons.pop(index - 1)
    warn_count -= 1
    ref.update({
        "Warn": warn_count,
        "reason": reasons
    })
    embed = discord.Embed(
        title="WARN DELETE",
        description=f"Removed warning #{index} from {member.mention}",
        color=discord.Color.green()
    )
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
            await log_channel.send(embed=log_embed)


@bot.slash_command(name="warn-delete-server", description="Delete all warnings of all users on this server")
async def _warn_delete_server(ctx):
    await ctx.defer()
    guild_id = str(ctx.guild.id)
    if not (ctx.author.guild_permissions.manage_messages or ctx.author.guild_permissions.administrator):
        embed = discord.Embed(
            title="⛔ ERROR",
            description="You need `Manage Messages` or `Administrator` permissions to run this command.",
            color=discord.Color.red()
        )
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
    embed = discord.Embed(
        title="WARN DELETE",
        description=f"Deleted all warnings of **{total_users}** user(s).",
        color=discord.Color.green()
    )
    embed.add_field(name="Total Warnings Removed", value=f"{total_warns}")
    await ctx.followup.send(embed=embed)
    log_ref = db.reference(f"/servers/{guild_id}/log")
    log_data = log_ref.get() or {}
    if log_data.get("Activated") == True and log_data.get("log-channel", 0) != 0:
        log_channel = bot.get_channel(int(log_data["log-channel"]))
        if log_channel:
            log_embed = discord.Embed(
                title="[AUTO-MOD] All Warnings Deleted",
                description=f"{ctx.author.mention} deleted **all warnings** on this server.",
                color=discord.Color.red()
            )
            log_embed.add_field(name="Total Users", value=f"{total_users}")
            log_embed.add_field(name="Total Warnings", value=f"{total_warns}")
            await log_channel.send(embed=log_embed)


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
        color=0x7a7aff,
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


@bot.slash_command(name="enable-warn-log", description="Send warnings, kicks, bans into a channel")
async def _enwarnlog(ctx, channelname):
    await ctx.defer()
    guild_id = str(ctx.guild.id)
    if not (ctx.author.guild_permissions.manage_messages or ctx.author.guild_permissions.administrator):
        embed = discord.Embed(title="⛔ ERROR",
                              description="You need `Manage Messages` or `Administrator` permissions to run this command.",
                              color=discord.Color.red())
        await ctx.followup.send(embed=embed)
        return
    if not channelname.startswith("<#") or not channelname.endswith(">"):
        embed = discord.Embed(title="⛔ ERROR",
                              description="Please provide a valid channel mention like `#general`.",
                              color=discord.Color.red())
        await ctx.followup.send(embed=embed)
        return
    match = re.match(r'<#(\d+)>$', channelname)
    channel_id_str = channelname.replace("<#", "").replace(">", "").strip()
    log_ref = db.reference(f"/servers/{guild_id}/log")
    current_data = log_ref.get() or {}
    current_log_channel = current_data.get("log-channel", 0)
    if str(current_log_channel) == str(channel_id_str):
        embed = discord.Embed(title="INFO",
                              description=f"This channel is already set for warn-logs: <#{channel_id_str}>",
                              color=discord.Color.orange())
        await ctx.followup.send(embed=embed)
        return
    if match:
        channel = ctx.guild.get_channel(int(match.group(1)))
        try:
            await channel.send("This channel is set for **warn-logs**")
        except:
            embed = discord.Embed(title="⛔ ERROR",
                                  description="I do not have permission to send messages in the selected channel.",
                                  color=discord.Color.red())
            await ctx.followup.send(embed=embed)
            return
        log_ref.update({
            "log-channel": int(channel.id),
            "Activated": True
        })
        embed = discord.Embed(title="Warn-Log",
                              description=f"Warn-logs have been enabled in <#{channel.id}>",
                              color=0x7a7aff)
        await ctx.followup.send(embed=embed)


@bot.slash_command(name="disable-warn-log", description="Stop sending warnings, kicks, bans into a channel")
async def _diswarnlog(ctx):
    await ctx.defer()
    guild_id = str(ctx.guild.id)
    if not (ctx.author.guild_permissions.manage_messages or ctx.author.guild_permissions.administrator):
        embed = discord.Embed(title="⛔ ERROR",
                              description="You need `Manage Messages` or `Administrator` permissions to run this command.",
                              color=discord.Color.red())
        await ctx.followup.send(embed=embed)
        return
    log_ref = db.reference(f"/servers/{guild_id}/log")
    current_data = log_ref.get() or {}
    if not current_data.get("Activated", False):
        embed = discord.Embed(title="INFO",
                              description=f"Warn-log system was never activated.",
                              color=discord.Color.orange())
        await ctx.followup.send(embed=embed)
        return
    log_ref.update({
        "log-channel": 0,
        "Activated": False
    })
    embed = discord.Embed(title="Warn-Log",
                          description=f"Warn-log has been disabled.",
                          color=0x7a7aff)
    await ctx.followup.send(embed=embed)


@bot.slash_command(name="link-enable", description="Whitelist a link from your blacklist")
async def enable_link(ctx, link: str):
    await ctx.defer()
    server_id = str(ctx.guild.id)
    if not (ctx.author.guild_permissions.manage_messages or ctx.author.guild_permissions.administrator):
        embed = discord.Embed(title="⛔ ERROR",
                              description="You need `Manage Messages` or `Administrator` permissions to run this command.",
                              color=discord.Color.red())
        await ctx.followup.send(embed=embed)
        return
    regex = re.compile(r'^(https?:\/\/)?([\da-z\.-]+)\.([a-z\.]{2,6})([\/\w \.-]*)*\/?$')
    if re.match(regex, link) is None:
        embed = discord.Embed(title="⛔ ERROR",
                              description=f"{link} is not a valid link.\nUse format: `https://domain.com` or `domain.com/path`",
                              color=discord.Color.red())
        await ctx.followup.send(embed=embed)
        return
    ref = db.reference(f"/servers/{server_id}/link/links")
    current_links = ref.get()
    if not isinstance(current_links, list):
        current_links = [] if not current_links else list(current_links.values()) if isinstance(current_links, dict) else []
        ref.set(current_links)
    if link not in current_links:
        embed = discord.Embed(title="INFO", description=f"{link} is not currently blacklisted.",
                              color=discord.Color.orange())
        await ctx.followup.send(embed=embed)
        return
    current_links.remove(link)
    ref.set(current_links)
    embed = discord.Embed(title="LINK", description=f"{link} has been whitelisted.", color=discord.Color.green())
    await ctx.followup.send(embed=embed)



@bot.slash_command(name="link-disable", description="Blacklist a link (the bot will block this link)")
async def disable_link(ctx, link: str):
    await ctx.defer()
    server_id = str(ctx.guild.id)
    if not (ctx.author.guild_permissions.manage_messages or ctx.author.guild_permissions.administrator):
        embed = discord.Embed(title="ERROR",
                              description="You need `Manage Messages` or `Administrator` permissions to run this command.",
                              color=discord.Color.red())
        await ctx.followup.send(embed=embed)
        return
    regex = re.compile(
        r'^(https?:\/\/)?'
        r'([\da-z\.-]+)\.([a-z\.]{2,6})'
        r'([\/\w \.-]*)*\/?$')
    if re.match(regex, link) is None:
        embed = discord.Embed(title="ERROR",
                              description=f"{link} is not a valid link.\nUse format: `https://domain.com` or `domain.com/path`",
                              color=discord.Color.red())
        await ctx.followup.send(embed=embed)
        return
    ref = db.reference(f"/servers/{server_id}/link/links")
    current_links = ref.get()
    if not isinstance(current_links, list):
        current_links = [] if not current_links else list(current_links.values()) if isinstance(current_links,
                                                                                                dict) else []
        ref.set(current_links)
    if link in current_links:
        embed = discord.Embed(title="INFO", description=f"{link} is already blacklisted.", color=discord.Color.orange())
        await ctx.followup.send(embed=embed)
        return
    current_links.append(link)
    ref.set(current_links)
    embed = discord.Embed(title="LINK", description=f"{link} has been blacklisted.", color=discord.Color.red())
    await ctx.followup.send(embed=embed)


@bot.slash_command(name="list-blacklist", description="Show all blacklisted links for this server")
async def _list_blacklist(ctx):
    await ctx.defer()
    if not (ctx.author.guild_permissions.manage_messages or ctx.author.guild_permissions.administrator):
        embed = discord.Embed(title="ERROR",
                              description="You need `Manage Messages` or `Administrator` permissions to run this command.",
                              color=discord.Color.red())
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

bot.run(os.environ["BOT_TOKEN"])