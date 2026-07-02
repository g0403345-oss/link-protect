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
        do {
            let user = try await api.me()
            state = .signedIn(user)
            // Restoring a session must also (re)register for push — otherwise a
            // user who stays logged in across installs/updates never registers a
            // device token (only a fresh signIn() did this before).
            await PushManager.shared.registerIfAuthorized(api: api)
        } catch {
            // Token invalid / revoked — fall back to signed-out without nagging.
            signOut(clearError: true)
        }
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
            return try await self.refresh(using: rt)
        }
        refreshTask = task
        defer { refreshTask = nil }
        let refreshed = try await task.value
        persist(refreshed)
        return refreshed.accessToken
    }

    private func refresh(using refreshToken: String) async throws -> TokenBundle {
        let url = AppConfig.apiBaseURL.appendingPathComponent("/api/mobile/auth/refresh")
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try JSONEncoder().encode(["refresh_token": refreshToken])

        let (data, response) = try await URLSession.shared.data(for: req)
        guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
            throw OAuthError.exchangeFailed("Session expired. Please sign in again.")
        }
        return try JSONDecoder().decode(TokenBundle.self, from: data)
    }
}
