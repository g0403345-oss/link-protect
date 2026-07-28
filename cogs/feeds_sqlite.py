"""
Threat-feed auto-refresh.

seed_threat_feeds.py fills the threat DB once, by hand — but phishing domains
rotate daily, so a one-off seed goes stale within weeks. This cog re-imports
the public Discord anti-scam feeds every 24 h (INSERT OR IGNORE: links the bot
observed itself keep their hit counts, feed entries arrive with hits=0).

The malware/webhook cogs and the observer reload their known-bad set every
30 min, so new feed entries become live blocks automatically.
"""

import asyncio
import json
import re
import time

import aiohttp
from discord.ext import commands, tasks

from .shared import _get_conn

FEEDS = [
    {"name": "sinkingyachts", "category": "phishing", "kind": "json",
     "url": "https://phish.sinking.yachts/v2/all",
     "headers": {"X-Identity": "LinkProtect threat-intel refresh"}},
    {"name": "nikolaischunk", "category": "phishing", "kind": "json",
     "url": "https://raw.githubusercontent.com/nikolaischunk/discord-phishing-links/main/domain-list.json"},
    {"name": "discord-antiscam", "category": "scam", "kind": "text",
     "url": "https://raw.githubusercontent.com/Discord-AntiScam/scam-links/main/list.txt"},
]

_DOMAIN_RE = re.compile(r"^[a-z0-9.-]+\.[a-z]{2,}$", re.IGNORECASE)
_UA = "LinkProtect-ThreatRefresh/1.0 (+https://link-protect.com)"
_PER_FEED_CAP = 200_000
_STARTUP_DELAY = 120  # let the bot settle before the first import


def _norm(d: str) -> str:
    d = d.strip().lower()
    d = re.sub(r"^https?://", "", d).strip("/")
    d = d.split("/")[0].split()[0] if d else d
    return d[4:] if d.startswith("www.") else d


def _import_sync(domains: list, category: str) -> int:
    """INSERT OR IGNORE all domains in one transaction; returns rows added."""
    c = _get_conn()
    now = int(time.time())
    added = 0
    for d in domains:
        cur = c.execute(
            "INSERT OR IGNORE INTO blocked_links(url, domain, category, source, hits, first_seen, last_seen) "
            "VALUES(?,?,?,'feed',0,?,?)",
            (d, d, category, now, now),
        )
        added += cur.rowcount if cur.rowcount > 0 else 0
    c.commit()
    return added


class FeedRefresh(commands.Cog):
    def __init__(self, bot):
        self.bot = bot
        self._started = False

    async def _ensure_started(self):
        if self._started:
            return
        self._started = True
        self._refresh.start()

    @commands.Cog.listener()
    async def on_ready(self):
        await self._ensure_started()

    @tasks.loop(hours=24)
    async def _refresh(self):
        if self._refresh.current_loop == 0:
            await asyncio.sleep(_STARTUP_DELAY)
        total = 0
        async with aiohttp.ClientSession() as session:
            for feed in FEEDS:
                try:
                    headers = {"User-Agent": _UA, **feed.get("headers", {})}
                    async with session.get(feed["url"], headers=headers,
                                           timeout=aiohttp.ClientTimeout(total=60)) as r:
                        raw = await r.text()
                    if feed["kind"] == "json":
                        data = json.loads(raw)
                        if isinstance(data, dict):     # e.g. {"domains": [...]}
                            data = data.get("domains") or []
                        items = data if isinstance(data, list) else []
                    else:
                        items = [l for l in raw.splitlines() if l and not l.lstrip().startswith("#")]
                    domains = []
                    for it in items[:_PER_FEED_CAP]:
                        d = _norm(str(it))
                        if d and len(d) <= 255 and _DOMAIN_RE.match(d):
                            domains.append(d)
                    added = await asyncio.to_thread(_import_sync, domains, feed["category"])
                    total += added
                    print(f"[feeds] {feed['name']}: {len(domains)} domains, {added} new", flush=True)
                except Exception as e:
                    print(f"[feeds] {feed['name']} failed: {e}", flush=True)
        if total:
            print(f"[feeds] refresh complete — {total} new known-bad domains", flush=True)


def setup(bot):
    bot.add_cog(FeedRefresh(bot))
