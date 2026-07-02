# Link Protect — iOS app

A native **SwiftUI** client for the Link Protect Discord bot. Sign in with
Discord, manage every server you administer, watch a live moderation feed, and
get push notifications when something needs your attention.

It is intentionally **Discord-only**: the app is a client for one third-party
service, so under App Store Guideline 4.8 there is no separate account system
(see [`AppStore/ReviewNotes.md`](AppStore/ReviewNotes.md)).

No third-party Swift packages — pure SwiftUI + Apple frameworks.

---

## 1. Generate & open the Xcode project

The repo stores **source + a project definition**, not the generated
`.xcodeproj` (so it stays merge-friendly). Generate it with
[XcodeGen](https://github.com/yonaskolb/XcodeGen):

```bash
brew install xcodegen
cd ios
xcodegen generate
open LinkProtect.xcodeproj
```

Then set your **Team** under *Signing & Capabilities* (or fill `DEVELOPMENT_TEAM`
in [`project.yml`](project.yml)). Deployment target is iOS 16.

> Prefer not to use XcodeGen? Create a new iOS App (SwiftUI, iOS 16) in Xcode and
> drag the `LinkProtect/` group in. The `project.yml` documents the exact
> settings (bundle id, Info.plist, entitlements, URL scheme, push capability).

## 2. Configure the Discord application

In the [Discord Developer Portal](https://discord.com/developers/applications)
open the same application that owns the bot (client id `888390889892892684`):

- **OAuth2 → Redirects:** add `linkprotect://auth/callback`
- The app uses **PKCE** and never holds the client secret. The secret stays on
  the API server, which performs the code exchange (`/api/mobile/auth/exchange`).

If your OAuth client id differs from the bot id, update
`AppConfig.Discord.clientID` in [`LinkProtect/App/AppConfig.swift`](LinkProtect/App/AppConfig.swift).

## 3. Point the app at your API

Default base URL is `https://api.link-protect.com`. Override per-scheme for local
dev by adding an environment variable in the Run scheme:

```
LP_API_BASE_URL = http://<your-machine-ip>:3001
```

(Use your LAN IP or a tunnel — `localhost` won't resolve from a device.)

## 4. Backend env (alongside `api_server.py`)

The mobile endpoints (`/api/mobile/*`) were added to `api_server.py`. They need:

```bash
DISCORD_CLIENT_ID=...        # the OAuth client id
DISCORD_CLIENT_SECRET=...    # stays server-side only
BOT_TOKEN=...                # already used by the bot
BOT_API_SECRET=...           # already used; also guards /api/internal/notify
```

For push (optional), set the APNs token-auth vars and install the extra deps
(`pip install -r requirements_api.txt`):

```bash
APNS_KEY_PATH=/path/AuthKey_XXXXXXXXXX.p8
APNS_KEY_ID=XXXXXXXXXX
APNS_TEAM_ID=XXXXXXXXXX
APNS_BUNDLE_ID=com.linkprotect.app
APNS_USE_SANDBOX=1           # 0 for production/TestFlight
```

To actually fire a push, have the bot POST to `/api/internal/notify` (shared
secret) when an action is logged / the bot starts or stops / settings change:

```json
POST /api/internal/notify
Authorization: Bearer <BOT_API_SECRET>
{ "guild_id": "123", "kind": "rule_triggered",
  "title": "Link blocked", "body": "Nitro scam removed in #general" }
```

`kind` is one of `bot_offline`, `rule_triggered`, `settings_changed`. The server
fans it out only to devices whose user manages that guild and has that alert on.

---

## Architecture

```
LinkProtect/
  App/         entry point, app delegate (APNs), auth-gated routing, AppConfig
  Auth/        Discord OAuth (PKCE + ASWebAuthenticationSession), Keychain, AuthStore
  Networking/  APIClient (Bearer = Discord token), Codable models
  Push/        PushManager + preferences (3 native alert types)
  Design/      DiscordTheme, Typography, reusable components (Discord look)
  Features/    Login, Servers (list), Guild (7-section config panel), Settings
  Resources/   Info.plist, entitlements, asset catalog
```

**Auth & authorization.** The app does Discord OAuth itself, then talks to the
bot API's `/api/mobile/*` surface using the Discord access token as a Bearer
credential. The server validates the token against Discord and requires
"Manage Server" on each guild — the *same* authorization the website performs.
The Discord client secret is never on the device.

**State.** `AuthStore` owns the session and refreshes tokens transparently;
screens use small `@MainActor` view models with optimistic writes (toggling a
setting updates the UI immediately and reverts on failure).

## Design

The colour system, type scale, animated blurple "blob" background, dot grid,
Discord pill toggles, cards, pills and toasts are a native port of
[link-protect.com](https://link-protect.com) (`website/app/globals.css` +
`tailwind.config.ts`), so the app and site feel like one product. Everything is
drawn with SwiftUI — see [`LinkProtect/Design/`](LinkProtect/Design).

### Wanting Figma mockups?

This SwiftUI design system *is* the source of truth (it renders the real thing),
so there's no separate `.fig` to drift out of sync. If you still want Figma:
the tokens to recreate there are documented in `DiscordTheme.swift` /
`Typography.swift`. I can also generate marketing render mockups of these screens
on request.

## What still needs you

- Drop a 1024×1024 `AppIcon-1024.png` into
  `Resources/Assets.xcassets/AppIcon.appiconset/` (logo lives at
  `website/public/logo.webp`).
- Bundle `Inter-*.ttf` + set `LPFont.usesInter = true` for pixel-exact type
  (optional — SF Pro is the default and looks great).
- Wire `/api/internal/notify` calls into the bot for live push (see above).
