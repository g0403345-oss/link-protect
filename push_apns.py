"""
Link Protect — APNs push sender (token-based / HTTP/2).

Sends the three notification types the iOS app subscribes to:
  • bot offline
  • protection rule triggered
  • server settings changed

Auth uses an APNs **token** (a .p8 key), so there are no expiring certificates.
Set these env vars (alongside the API server):

  APNS_KEY_PATH      path to AuthKey_XXXXXXXXXX.p8
  APNS_KEY_ID        the 10-char Key ID
  APNS_TEAM_ID       your 10-char Apple Team ID
  APNS_BUNDLE_ID     com.linkprotect.app  (the app's bundle id = APNs topic)
  APNS_USE_SANDBOX   "1" for development builds, "0"/unset for production

Requires:  pip install httpx[http2] pyjwt cryptography
"""

from __future__ import annotations

import os
import time
from typing import Iterable

import httpx

try:
    import jwt  # PyJWT
except ImportError:  # pragma: no cover
    jwt = None


APNS_KEY_PATH = os.environ.get("APNS_KEY_PATH", "")
APNS_KEY_ID = os.environ.get("APNS_KEY_ID", "")
APNS_TEAM_ID = os.environ.get("APNS_TEAM_ID", "")
APNS_BUNDLE_ID = os.environ.get("APNS_BUNDLE_ID", "com.linkprotect.app")
APNS_USE_SANDBOX = os.environ.get("APNS_USE_SANDBOX", "1") == "1"

_HOST = "https://api.sandbox.push.apple.com" if APNS_USE_SANDBOX else "https://api.push.apple.com"


class APNsClient:
    """Caches the provider JWT (valid up to 60 min; we rotate at ~50)."""

    def __init__(self) -> None:
        self._token: str | None = None
        self._token_ts: float = 0.0
        self._client = httpx.AsyncClient(http2=True, base_url=_HOST, timeout=10)

    @property
    def configured(self) -> bool:
        return bool(APNS_KEY_PATH and APNS_KEY_ID and APNS_TEAM_ID and jwt)

    def _provider_token(self) -> str:
        now = time.time()
        if self._token and now - self._token_ts < 3000:
            return self._token
        with open(APNS_KEY_PATH, "r") as f:
            private_key = f.read()
        self._token = jwt.encode(
            {"iss": APNS_TEAM_ID, "iat": int(now)},
            private_key,
            algorithm="ES256",
            headers={"kid": APNS_KEY_ID},
        )
        self._token_ts = now
        return self._token

    async def send(self, device_token: str, title: str, body: str,
                   thread_id: str | None = None, category: str | None = None,
                   custom: dict | None = None) -> bool:
        """Send one alert. Returns True on 200. 410 => caller should prune the token."""
        if not self.configured:
            return False
        payload = {
            "aps": {
                "alert": {"title": title, "body": body},
                "sound": "default",
                "thread-id": thread_id or "linkprotect",
            }
        }
        if category:
            payload["aps"]["category"] = category
        if custom:
            payload.update(custom)  # custom keys live alongside `aps`
        try:
            resp = await self._client.post(
                f"/3/device/{device_token}",
                json=payload,
                headers={
                    "authorization": f"bearer {self._provider_token()}",
                    "apns-topic": APNS_BUNDLE_ID,
                    "apns-push-type": "alert",
                    "apns-priority": "10",
                },
            )
        except Exception:
            return False
        if resp.status_code == 410:  # token no longer valid on this device
            raise TokenExpired(device_token)
        return resp.status_code == 200

    async def send_many(self, tokens: Iterable[str], title: str, body: str,
                        thread_id: str | None = None, category: str | None = None,
                        custom: dict | None = None) -> list[str]:
        """Send to many tokens; returns the list of dead tokens (HTTP 410)."""
        dead: list[str] = []
        for t in tokens:
            try:
                await self.send(t, title, body, thread_id=thread_id, category=category, custom=custom)
            except TokenExpired:
                dead.append(t)
        return dead


class TokenExpired(Exception):
    def __init__(self, token: str):
        self.token = token


# Singleton used by api_server.py
apns = APNsClient()
