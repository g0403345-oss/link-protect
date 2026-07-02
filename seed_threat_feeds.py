#!/usr/bin/env python3
"""
One-off seeder: fill `blocked_links` from public Discord anti-scam / phishing
feeds so the Threat Data tab has a useful starting set.

Run on the Pi (in /home/justinguel/beta):
    python3 seed_threat_feeds.py

Safe to re-run — uses INSERT OR IGNORE, so it never overwrites links the bot
has observed itself (those keep their hit counts). Feed entries are stored with
source='feed' and hits=0 so the bot's own observations always rank above them.
"""
import json
import os
import re
import sqlite3
import time
import urllib.request

DB_PATH = os.environ.get("BOT_DB_PATH", "bot.sqlite3")
GLOBAL_CAP = 80_000
UA = "LinkProtect-ThreatSeed/1.0 (+https://link-protect.com)"

FEEDS = [
    {"name": "sinkingyachts", "category": "phishing", "kind": "json",
     "url": "https://phish.sinking.yachts/v2/all",
     "headers": {"X-Identity": "LinkProtect threat-intel seed"}},
    {"name": "nikolaischunk", "category": "phishing", "kind": "text",
     "url": "https://raw.githubusercontent.com/nikolaischunk/discord-phishing-links/main/domain-list.txt"},
    {"name": "discord-antiscam", "category": "scam", "kind": "text",
     "url": "https://raw.githubusercontent.com/Discord-AntiScam/scam-links/main/list.txt"},
]

_DOMAIN_RE = re.compile(r"^[a-z0-9.-]+\.[a-z]{2,}$", re.IGNORECASE)


def norm(d: str) -> str:
    d = d.strip().lower()
    d = re.sub(r"^https?://", "", d).strip("/")
    d = d.split("/")[0].split()[0] if d else d
    if d.startswith("www."):
        d = d[4:]
    return d


def fetch(feed: dict) -> list:
    req = urllib.request.Request(feed["url"], headers={"User-Agent": UA, **feed.get("headers", {})})
    with urllib.request.urlopen(req, timeout=30) as r:
        raw = r.read().decode("utf-8", "replace")
    if feed["kind"] == "json":
        data = json.loads(raw)
        items = data if isinstance(data, list) else []
    else:
        items = [l for l in raw.splitlines() if l and not l.lstrip().startswith("#")]
    out = []
    for it in items:
        d = norm(str(it))
        if d and len(d) <= 255 and _DOMAIN_RE.match(d):
            out.append(d)
    return out


def main():
    conn = sqlite3.connect(DB_PATH)
    conn.execute("PRAGMA busy_timeout=10000;")
    conn.execute("""CREATE TABLE IF NOT EXISTS blocked_links (
        url TEXT PRIMARY KEY, domain TEXT NOT NULL, category TEXT NOT NULL,
        source TEXT NOT NULL DEFAULT 'blocked', hits INTEGER NOT NULL DEFAULT 0,
        first_seen INTEGER NOT NULL, last_seen INTEGER NOT NULL
    )""")
    try:
        conn.execute("ALTER TABLE blocked_links ADD COLUMN source TEXT NOT NULL DEFAULT 'blocked'")
    except sqlite3.OperationalError:
        pass

    now = int(time.time())
    total = 0
    for feed in FEEDS:
        try:
            domains = fetch(feed)
        except Exception as e:
            print(f"[{feed['name']}] FAILED: {e}")
            continue
        added = 0
        for d in domains:
            if total >= GLOBAL_CAP:
                break
            cur = conn.execute(
                "INSERT OR IGNORE INTO blocked_links(url, domain, category, source, hits, first_seen, last_seen) "
                "VALUES(?,?,?,?,0,?,?)",
                (d, d, feed["category"], "feed", now, now),
            )
            if cur.rowcount == 1:
                added += 1
                total += 1
        conn.commit()
        print(f"[{feed['name']}] fetched={len(domains)} new={added}")

    grand = conn.execute("SELECT COUNT(*) FROM blocked_links").fetchone()[0]
    print(f"TOTAL new feed entries this run: {total}")
    print(f"blocked_links now holds: {grand} rows")
    conn.close()


if __name__ == "__main__":
    main()
