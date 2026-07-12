"""
Passive link observer (threat-intel data collection).

The bot already reads every message to moderate it. This cog turns that into a
sensor network WITHOUT acting on anything:

  • Stufe 1 — count the domain of every link the bot sees (seen_domains).
  • Stufe 2 — check each *new* link against Google Safe Browsing (de-duplicated
    + rate-limited + daily-capped). Malicious finds land in blocked_links
    (source="scanned"), even on servers without the malware blocker enabled.

We store ONLY the link/domain + verdict + counts — never the author or message.

CRITICAL: on_message does NO database I/O — it only touches in-memory buffers.
A background flusher writes everything every ~20s in one transaction, so the
observer never competes with the bot's own warn/kick/ban writes for the SQLite
write lock (that previously caused "database is locked" errors).
"""

import asyncio
import collections
import time

import aiohttp
import discord
from discord.ext import commands

from .shared import (
    extract_urls, flush_seen_counts_sync, flush_scan_results_sync,
    flush_caught_sync, load_known_bad_sync,
)
from .malware_sqlite import check_url_safety

# Well-known safe hosts we never bother scanning (still counted in seen_domains).
SAFE_ALLOWLIST = {
    "discord.com", "discord.gg", "discordapp.com", "discordapp.net", "discord.media",
    "youtube.com", "youtu.be", "google.com", "gstatic.com", "googleusercontent.com",
    "twitter.com", "x.com", "fxtwitter.com", "vxtwitter.com", "fixupx.com",
    "tenor.com", "giphy.com", "imgur.com", "reddit.com", "redd.it",
    "github.com", "githubusercontent.com", "gitlab.com", "twitch.tv",
    "steamcommunity.com", "steampowered.com", "spotify.com", "soundcloud.com",
    "tiktok.com", "instagram.com", "facebook.com", "fbcdn.net", "wikipedia.org",
    "roblox.com", "rbxcdn.com", "apple.com", "microsoft.com", "amazon.com",
    "cloudflare.com", "wikimedia.org", "medium.com", "pinterest.com",
}

_SCAN_INTERVAL = 0.4       # seconds between Safe Browsing lookups (≈2.5/s)
_DAILY_CAP = 8000          # max lookups per day (free-tier safe)
_QUEUE_MAX = 5000
_SEEN_CACHE_MAX = 200_000
_FLUSH_INTERVAL = 20       # seconds between DB flushes
_KNOWN_BAD_REFRESH = 1800  # reload the known-bad set every 30 min


def _base_domain(domain: str) -> str:
    parts = domain.split(".")
    return ".".join(parts[-2:]) if len(parts) >= 2 else domain


class Observer(commands.Cog):
    def __init__(self, bot):
        self.bot = bot
        self._session: aiohttp.ClientSession | None = None
        self._queue: asyncio.Queue = asyncio.Queue(maxsize=_QUEUE_MAX)
        self._queued: set[str] = set()              # de-dupe scan enqueues (in-memory)
        self._seen_counts: collections.Counter = collections.Counter()
        self._scan_buffer: list = []
        self._caught: dict = {}                     # {(domain, guild_id): count}
        self._known_bad: dict = {}                  # {domain: category}
        self._worker: asyncio.Task | None = None
        self._flusher: asyncio.Task | None = None
        self._refresher: asyncio.Task | None = None
        self._scan_day = ""
        self._scan_count = 0
        self._started = False

    async def _ensure_started(self):
        """py-cord (unlike discord.py 2.x) never calls cog_load, so the session
        and background tasks must start lazily — on_ready or the first message.
        (Before this fix the flusher never ran: observations piled up in memory
        and seen_domains was last updated 2026-06-28.)"""
        if self._started:
            return
        self._started = True
        self._session = aiohttp.ClientSession()
        self._known_bad = await asyncio.to_thread(load_known_bad_sync)
        self._worker = asyncio.create_task(self._scan_worker())
        self._flusher = asyncio.create_task(self._flush_loop())
        self._refresher = asyncio.create_task(self._refresh_loop())
        print("[observer] background tasks started", flush=True)

    @commands.Cog.listener()
    async def on_ready(self):
        await self._ensure_started()

    def _quota_ok(self) -> bool:
        today = time.strftime("%Y-%m-%d")
        if today != self._scan_day:
            self._scan_day = today
            self._scan_count = 0
        return self._scan_count < _DAILY_CAP

    @commands.Cog.listener()
    async def on_message(self, message: discord.Message):
        # In-memory only — never touch the DB here.
        if message.author.bot or not message.guild:
            return
        if not self._started:
            await self._ensure_started()
        content = message.content
        if "http" not in content and "www." not in content:
            return
        items = extract_urls(content)
        if not items:
            return
        gid = message.guild.id
        for url, domain in items[:10]:
            self._seen_counts[domain] += 1                 # Stufe 1 (buffered)
            # Known-bad match: a domain we already know is malicious, seen LIVE
            # on one of our servers. This is the asset — record with prevalence.
            if domain in self._known_bad:
                key = (domain, gid)
                self._caught[key] = self._caught.get(key, 0) + 1
                continue                                   # no need to scan it
            if _base_domain(domain) in SAFE_ALLOWLIST:
                continue
            if url in self._queued:
                continue
            if len(self._queued) >= _SEEN_CACHE_MAX:
                self._queued.clear()
            self._queued.add(url)
            try:
                self._queue.put_nowait((url, domain))      # Stufe 2 (queued)
            except asyncio.QueueFull:
                pass

    async def _scan_worker(self):
        while True:
            url, domain = await self._queue.get()
            try:
                if not self._quota_ok():
                    continue
                if self._session is None or self._session.closed:
                    self._session = aiohttp.ClientSession()
                is_safe = await check_url_safety(self._session, url)
                self._scan_count += 1
                self._scan_buffer.append((url, domain, not is_safe))
                await asyncio.sleep(_SCAN_INTERVAL)
            except asyncio.CancelledError:
                raise
            except Exception:
                pass
            finally:
                self._queue.task_done()

    async def _flush_loop(self):
        while True:
            await asyncio.sleep(_FLUSH_INTERVAL)
            await self._flush_now()

    async def _refresh_loop(self):
        while True:
            await asyncio.sleep(_KNOWN_BAD_REFRESH)
            try:
                kb = await asyncio.to_thread(load_known_bad_sync)
                if kb:
                    self._known_bad = kb
            except Exception:
                pass

    async def _flush_now(self):
        try:
            if self._seen_counts:
                counts = dict(self._seen_counts)
                self._seen_counts.clear()
                await asyncio.to_thread(flush_seen_counts_sync, counts)
            if self._scan_buffer:
                buf = self._scan_buffer
                self._scan_buffer = []
                await asyncio.to_thread(flush_scan_results_sync, buf)
            if self._caught:
                caught = self._caught
                self._caught = {}
                rows = [
                    (domain, gid, n, self._known_bad.get(domain, "scam"))
                    for (domain, gid), n in caught.items()
                ]
                await asyncio.to_thread(flush_caught_sync, rows)
        except Exception:
            pass


def setup(bot):
    bot.add_cog(Observer(bot))
