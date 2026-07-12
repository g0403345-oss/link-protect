import Foundation
import SwiftUI
import WidgetKit

/// Single source of truth for the session. Owns the token bundle, refreshes it
/// transparently, and exposes the signed-in Discord user to the UI.
///
/// Discord is the **only** way to authenticate — there is deliberately no
/// email/password account system (see the App Store review notes). The app is a
/// client for a specific third-party service, so under Guideline 4.8 a separate
/// primary account is neither offered nor required.
@MainActor
final class AuthStore: ObservableObject {

    enum State: Equatable {
        case loading
        case signedOut
        case signedIn(DiscordUser)
    }

    @Published private(set) var state: State = .loading
    @Published var authError: String?

    private let tokenKey = "oauth.tokens"
    private var tokens: TokenBundle?
    private let oauth = DiscordOAuth()
    /// In-flight refresh, shared by concurrent callers. Discord rotates refresh
    /// tokens (single-use), so two parallel refreshes would invalidate each other
    /// and surface as "session expired" on app open — coalesce them into one.
    private var refreshTask: Task<TokenBundle, Error>?

    /// The active API client — real (Discord-token backed) or the reviewer demo.
    private(set) var api: APIClient!

    init() { api = makeRealAPI() }

    private func makeRealAPI() -> APIClient {
        APIClient(tokenProvider: { [weak self] in
            guard let self else { throw OAuthError.cancelled }
            return try await self.validAccessToken()
        }, demo: false)
    }

    /// App Store reviewer demo: enter the app on built-in sample data, no Discord.
    func enterDemo() {
        api = APIClient(tokenProvider: { "demo" }, demo: true)
        withAnimation(.easeInOut(duration: 0.35)) { state = .signedIn(DemoData.user) }
    }

    // MARK: Launch

    func bootstrap() async {
        guard let stored = Keychain.get(TokenBundle.self, for: tokenKey) else {
            state = .signedOut
            return
        }
        tokens = stored
        // Only a definitive rejection (revoked/expired-beyond-refresh) may wipe
        // the stored session. A transient failure (offline, server restart)
        // must keep the Keychain bundle — otherwise a single bad launch forces
        // a full re-login even though the tokens are perfectly valid.
        for attempt in 0..<3 {
            do {
                let user = try await api.me()
                state = .signedIn(user)
                // Restoring a session must also (re)register for push — otherwise a
                // user who stays logged in across installs/updates never registers a
                // device token (only a fresh signIn() did this before).
                await PushManager.shared.registerIfAuthorized(api: api)
                return
            } catch APIError.unauthorized {
                // Token truly dead — fall back to signed-out without nagging.
                signOut(clearError: true)
                return
            } catch {
                if attempt < 2 {
                    try? await Task.sleep(nanoseconds: UInt64(attempt + 1) * 1_000_000_000)
                }
            }
        }
        // Still failing (likely offline): show the sign-in screen but keep the
        // tokens — the next launch restores the session automatically.
        state = .signedOut
    }

    // MARK: Sign in / out

    func signIn() async {
        authError = nil
        do {
            let bundle = try await oauth.signIn()
            persist(bundle)
            let user = try await api.me()
            withAnimation(.easeInOut(duration: 0.35)) { state = .signedIn(user) }
            await PushManager.shared.registerIfAuthorized(api: api)
        } catch OAuthError.cancelled {
            // User backed out — silent.
        } catch {
            authError = (error as? LocalizedError)?.errorDescription ?? "Sign-in failed. Please try again."
        }
    }

    func signOut(clearError: Bool = false) {
        tokens = nil
        Keychain.remove(tokenKey)
        api = makeRealAPI()  // leave demo / restore the Discord-backed client
        if clearError { authError = nil }
        LPWidgetStore.save(.signedOut)
        WidgetCenter.shared.reloadAllTimelines()
        WatchSync.shared.send(.signedOut)
        withAnimation(.easeInOut(duration: 0.3)) { state = .signedOut }
    }

    // MARK: Tokens

    private func persist(_ bundle: TokenBundle) {
        tokens = bundle
        Keychain.set(bundle, for: tokenKey)
    }

    /// Returns a non-expired access token, refreshing via the backend if needed.
    /// Concurrent callers share a single refresh (see `refreshTask`).
    func validAccessToken() async throws -> String {
        guard let current = tokens else { throw OAuthError.cancelled }
        guard current.isExpired else { return current.accessToken }

        // Join an in-flight refresh instead of starting a second one.
        if let task = refreshTask {
            return try await task.value.accessToken
        }
        let rt = current.refreshToken
        let task = Task { [weak self] () throws -> TokenBundle in
            guard let self else { throw OAuthError.cancelled }
            let refreshed = try await self.refresh(using: rt)
            // Persist INSIDE the task: Discord rotates refresh tokens (single
            // use), so if the awaiting caller gets cancelled mid-refresh the
            // new bundle must still reach the Keychain — otherwise the stored
            // refresh token is already consumed and the session dies.
            self.persist(refreshed)
            return refreshed
        }
        refreshTask = task
        defer { refreshTask = nil }
        return try await task.value.accessToken
    }

    private func refresh(using refreshToken: String) async throws -> TokenBundle {
        let url = AppConfig.apiBaseURL.appendingPathComponent("/api/mobile/auth/refresh")
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try JSONEncoder().encode(["refresh_token": refreshToken])

        let (data, response) = try await URLSession.shared.data(for: req)
        guard let http = response as? HTTPURLResponse else { throw APIError.decoding }
        switch http.statusCode {
        case 200:
            return try JSONDecoder().decode(TokenBundle.self, from: data)
        case 400, 401:
            // Refresh token genuinely rejected — a re-login is required.
            throw APIError.unauthorized
        default:
            // Server hiccup / gateway error — retryable, session stays intact.
            throw APIError.server(http.statusCode, "Token refresh failed")
        }
    }
}
