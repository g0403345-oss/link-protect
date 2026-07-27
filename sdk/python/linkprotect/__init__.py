"""Link Protect Python SDK (v0.1.0).

Docs: https://link-protect.com/developers — try it with the key "lp_sandbox".

    from linkprotect import LinkProtect
    lp = LinkProtect("lp_...")
    print(lp.stats())
"""

import hashlib
import hmac
import json

import requests

__version__ = "0.1.0"
DEFAULT_BASE = "https://link-protect.com"


class LinkProtectError(RuntimeError):
    def __init__(self, status: int, detail: str):
        super().__init__(f"{status}: {detail}")
        self.status = status
        self.detail = detail


class LinkProtect:
    def __init__(self, api_key: str, base_url: str = DEFAULT_BASE, timeout: float = 15.0):
        if not api_key.startswith("lp_"):
            raise ValueError("pass an lp_… API key (see the Developer tab)")
        self.key = api_key
        self.base = base_url.rstrip("/")
        self.timeout = timeout
        self._s = requests.Session()
        self._s.headers["X-Api-Key"] = api_key

    def _req(self, method: str, path: str, body: dict | None = None) -> dict:
        r = self._s.request(method, self.base + path, json=body, timeout=self.timeout)
        try:
            data = r.json()
        except ValueError:
            data = {}
        if not r.ok:
            raise LinkProtectError(r.status_code, data.get("detail") or data.get("error") or r.reason)
        return data

    # ── read ──
    def stats(self) -> dict:
        return self._req("GET", "/api/v1/stats")

    def trends(self, days: int = 14) -> dict:
        return self._req("GET", f"/api/v1/trends?days={days}")

    def check(self, url: str, deep: bool = False) -> dict:
        return self._req("GET", f"/api/v1/check?url={requests.utils.quote(url, safe='')}&deep={1 if deep else 0}")

    def check_batch(self, urls: list) -> dict:
        return self._req("POST", "/api/v1/check/batch", {"urls": urls})

    def warns(self, user_id: str) -> dict:
        return self._req("GET", f"/api/v1/warns/{user_id}")

    # ── write (key needs the matching scope) ──
    def moderate(self, user_id: str, action: str, reason: str | None = None,
                 minutes: int | None = None) -> dict:
        return self._req("POST", "/api/v1/moderate",
                         {"userId": user_id, "action": action, "reason": reason, "minutes": minutes})

    def set_blocker(self, blocker: str, enabled: bool) -> dict:
        return self._req("POST", "/api/v1/blocker", {"blocker": blocker, "enabled": enabled})

    def blacklist(self, action: str, link: str) -> dict:
        return self._req("POST", "/api/v1/blacklist", {"action": action, "link": link})

    def lockdown(self, active: bool, reason: str | None = None) -> dict:
        return self._req("POST", "/api/v1/lockdown", {"active": active, "reason": reason})

    def stream_events(self, handler):
        """Blocking SSE loop: handler(event_name, data_dict) per event. Reconnect
        after it returns (the server closes streams after ~30 minutes)."""
        with self._s.get(f"{self.base}/api/v1/events/stream", params={"key": self.key},
                         stream=True, timeout=None) as r:
            event, data = "message", ""
            for raw in r.iter_lines(decode_unicode=True):
                if raw is None:
                    continue
                if raw == "":
                    if data:
                        try:
                            handler(event, json.loads(data))
                        except Exception:
                            pass
                    event, data = "message", ""
                elif raw.startswith("event: "):
                    event = raw[7:]
                elif raw.startswith("data: "):
                    data = raw[6:]


def verify_signature(secret: str, raw_body: bytes, signature_header: str) -> bool:
    """Verify a webhook's X-LinkProtect-Signature header ("sha256=…")."""
    expected = "sha256=" + hmac.new(secret.encode(), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature_header or "")
