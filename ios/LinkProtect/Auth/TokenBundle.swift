import Foundation

/// OAuth tokens as returned by our backend's `/api/mobile/auth/exchange`.
/// We persist this in the Keychain; the access token is sent as the Bearer
/// credential to every bot-API call.
struct TokenBundle: Codable, Equatable {
    var accessToken: String
    var refreshToken: String
    var expiresAt: Date

    enum CodingKeys: String, CodingKey {
        case accessToken = "access_token"
        case refreshToken = "refresh_token"
        case expiresIn = "expires_in"
        case expiresAt // for re-encoding to Keychain
    }

    init(accessToken: String, refreshToken: String, expiresAt: Date) {
        self.accessToken = accessToken
        self.refreshToken = refreshToken
        self.expiresAt = expiresAt
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        accessToken = try c.decode(String.self, forKey: .accessToken)
        refreshToken = try c.decode(String.self, forKey: .refreshToken)
        if let secs = try c.decodeIfPresent(Double.self, forKey: .expiresIn) {
            expiresAt = Date().addingTimeInterval(secs)
        } else {
            expiresAt = try c.decode(Date.self, forKey: .expiresAt)
        }
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(accessToken, forKey: .accessToken)
        try c.encode(refreshToken, forKey: .refreshToken)
        try c.encode(expiresAt, forKey: .expiresAt)
    }

    /// Treat tokens as stale a minute early to avoid mid-request expiry.
    var isExpired: Bool { Date() >= expiresAt.addingTimeInterval(-60) }
}
