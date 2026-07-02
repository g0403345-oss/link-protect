import Foundation
import UIKit
import AuthenticationServices

enum OAuthError: LocalizedError {
    case cancelled
    case badCallback
    case stateMismatch
    case exchangeFailed(String)

    var errorDescription: String? {
        switch self {
        case .cancelled: return "Sign-in was cancelled."
        case .badCallback: return "Discord returned an unexpected response."
        case .stateMismatch: return "Security check failed. Please try again."
        case .exchangeFailed(let m): return m
        }
    }
}

/// Drives the "Continue with Discord" flow:
/// 1. open Discord's consent page in `ASWebAuthenticationSession` (PKCE challenge),
/// 2. capture the `code` from the `linkprotect://` redirect,
/// 3. hand the `code` + `verifier` to our backend, which performs the
///    confidential exchange and returns tokens. The client secret never leaves
///    the server.
@MainActor
final class DiscordOAuth: NSObject, ASWebAuthenticationPresentationContextProviding {

    func signIn() async throws -> TokenBundle {
        let pkce = PKCE()
        let state = UUID().uuidString

        var comps = URLComponents(url: AppConfig.Discord.authorizeURL, resolvingAgainstBaseURL: false)!
        comps.queryItems = [
            .init(name: "response_type", value: "code"),
            .init(name: "client_id", value: AppConfig.Discord.clientID),
            .init(name: "scope", value: AppConfig.Discord.scopes.joined(separator: " ")),
            .init(name: "redirect_uri", value: AppConfig.Discord.redirectURI),
            .init(name: "state", value: state),
            .init(name: "code_challenge", value: pkce.challenge),
            .init(name: "code_challenge_method", value: pkce.method),
            .init(name: "prompt", value: "consent"),
        ]

        let callback = try await present(url: comps.url!)

        guard let items = URLComponents(url: callback, resolvingAgainstBaseURL: false)?.queryItems,
              let code = items.first(where: { $0.name == "code" })?.value else {
            throw OAuthError.badCallback
        }
        guard items.first(where: { $0.name == "state" })?.value == state else {
            throw OAuthError.stateMismatch
        }

        return try await exchange(code: code, verifier: pkce.verifier)
    }

    // MARK: - Web session

    private func present(url: URL) async throws -> URL {
        try await withCheckedThrowingContinuation { continuation in
            let session = ASWebAuthenticationSession(
                url: url,
                callbackURLScheme: AppConfig.Discord.callbackScheme
            ) { callbackURL, error in
                if let callbackURL {
                    continuation.resume(returning: callbackURL)
                } else if let error = error as? ASWebAuthenticationSessionError,
                          error.code == .canceledLogin {
                    continuation.resume(throwing: OAuthError.cancelled)
                } else {
                    continuation.resume(throwing: error ?? OAuthError.badCallback)
                }
            }
            session.presentationContextProvider = self
            session.prefersEphemeralWebBrowserSession = false // reuse Discord login if present
            session.start()
        }
    }

    // MARK: - Backend exchange

    private func exchange(code: String, verifier: String) async throws -> TokenBundle {
        let url = AppConfig.apiBaseURL.appendingPathComponent("/api/mobile/auth/exchange")
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try JSONEncoder().encode([
            "code": code,
            "code_verifier": verifier,
            "redirect_uri": AppConfig.Discord.redirectURI,
        ])

        let (data, response) = try await URLSession.shared.data(for: req)
        guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
            let msg = (try? JSONDecoder().decode([String: String].self, from: data))?["detail"]
            throw OAuthError.exchangeFailed(msg ?? "Could not complete sign-in.")
        }
        return try JSONDecoder().decode(TokenBundle.self, from: data)
    }

    nonisolated func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        // ASWebAuthenticationSession always calls this on the main thread.
        MainActor.assumeIsolated {
            let scene = UIApplication.shared.connectedScenes
                .compactMap { $0 as? UIWindowScene }
                .first { $0.activationState == .foregroundActive }
            return scene?.keyWindow ?? ASPresentationAnchor()
        }
    }
}

private extension UIWindowScene {
    var keyWindow: UIWindow? { windows.first { $0.isKeyWindow } ?? windows.first }
}
