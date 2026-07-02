#!/usr/bin/env python3
"""One-time cleanup: cap each user's warnings at (first-action threshold − 1).

After the old bug, users piled up warnings without ever being actioned. With the
fixed bot those inflated counts would instantly kick/ban them. This caps every
user to one below the lowest configured action threshold (kick, else ban, else
timeout) so the *next* warning triggers exactly the first action.

Usage:
  python3 cleanup_warns.py bot.sqlite3            # dry-run (no writes)
  python3 cleanup_warns.py bot.sqlite3 --apply    # actually write
"""
import json
import sqlite3
import sys

DB = sys.argv[1] if len(sys.argv) > 1 else "bot.sqlite3"
APPLY = "--apply" in sys.argv

conn = sqlite3.connect(DB)
conn.row_factory = sqlite3.Row
rows = conn.execute("SELECT guild_id, data FROM servers").fetchall()

changed_servers = 0
capped_users = 0
removed_warns = 0
examples = []

for r in rows:
    gid = r["guild_id"]
    try:
        data = json.loads(r["data"])
    except Exception:
        continue
    warn = data.get("warn") or {}
    kick = warn.get("kick") or 0
    ban = warn.get("ban") or 0
    to = (warn.get("timeout") or {}).get("warnings") or 0
    thresholds = [t for t in (kick, ban, to) if isinstance(t, int) and t > 0]
    if not thresholds:
        continue  # no action configured → leave warnings untouched
    cap = max(min(thresholds) - 1, 0)  # warnings allowed before the first action

    server_changed = False
    for uid, udata in list(warn.items()):
        if uid in ("kick", "ban", "timeout"):
            continue
        if isinstance(udata, dict):
            cur = udata.get("Warn", 0) or 0
        elif isinstance(udata, int):
            cur = udata
        else:
            continue
        if cur > cap:
            removed_warns += cur - cap
            capped_users += 1
            if len(examples) < 12:
                examples.append(f"  guild {gid} · user {uid}: {cur} -> {cap}")
            if cap == 0:
                del warn[uid]
            else:
                reasons = udata.get("reason", []) if isinstance(udata, dict) else []
                if not isinstance(reasons, list):
                    reasons = []
                warn[uid] = {"Warn": cap, "reason": reasons[-cap:]}
            server_changed = True

    if server_changed:
        changed_servers += 1
        if APPLY:
            data["warn"] = warn
            conn.execute("UPDATE servers SET data=? WHERE guild_id=?", (json.dumps(data), gid))

if APPLY:
    conn.commit()

print(f"{'APPLIED' if APPLY else 'DRY-RUN'}: servers changed={changed_servers}, "
      f"users capped={capped_users}, warnings removed={removed_warns}")
for e in examples:
    print(e)
