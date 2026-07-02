import Foundation

/// Central configuration. Everything environment-specific lives here so there are
/// no secrets scattered through the codebase — and crucially, **no Discord client
/// secret ever ships in the app**. The OAuth code exchange is done server-side by
/// the bot API (see `/api/mobile/auth/exchange` in `api_server.py`).
enum AppConfig {

    /// Base URL of the Link Protect bot API (the FastAPI server in `api_server.py`).
    /// This is the public Cloudflare-Tunnel hostname that maps to the Pi's
    /// `127.0.0.1:3002` (same backend the website uses). Override at launch with
    /// the `LP_API_BASE_URL` env var for local development.
    static let apiBaseURL: URL = {
        if let raw = ProcessInfo.processInfo.environment["LP_API_BASE_URL"],
           let url = URL(string: raw) {
            return url
        }
        return URL(string: "https://linkprotect.norecoil.de")!
    }()

    /// Public website — linked from the about screen.
    /// The single super-admin (mirrors `website/lib/admin.ts`). Only this user
    /// sees the Admin panel.
    static let adminUserID = "624317230955626507"

    static let websiteURL = URL(string: "https://link-protect.com")!
    static let supportServerURL = URL(string: "https://discord.gg/BjDC9t329E")!
    static let privacyURL = URL(string: "https://link-protect.com/privacy")!
    static let termsURL = URL(string: "https://link-protect.com/terms")!

    // MARK: - Discord OAuth (public client + PKCE)

    enum Discord {
        /// The Discord *application* (client) ID. Same application that owns the bot.
        static let clientID = "888390889892892684"

        /// Custom-scheme redirect that maps back into the app (see Info.plist URL types).
        static let redirectURI = "linkprotect://auth/callback"
        static let callbackScheme = "linkprotect"

        /// Identical scopes to the website — read-only identity + the guild list.
        /// We never request `email`, `messages`, or any write scope.
        static let scopes = ["identify", "guilds"]

        static let authorizeURL = URL(string: "https://discord.com/api/oauth2/authorize")!
        static let cdnBase = "https://cdn.discordapp.com"
    }
}
