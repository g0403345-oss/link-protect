import Foundation
import CryptoKit

/// PKCE (RFC 7636) parameters. The verifier protects the OAuth code against
/// interception on the custom-scheme redirect — required for a public mobile
/// client that holds no client secret.
struct PKCE {
    let verifier: String
    let challenge: String
    let method = "S256"

    init() {
        verifier = Self.randomURLSafe(64)
        let digest = SHA256.hash(data: Data(verifier.utf8))
        challenge = Data(digest).base64URLEncoded()
    }

    private static func randomURLSafe(_ count: Int) -> String {
        var bytes = [UInt8](repeating: 0, count: count)
        _ = SecRandomCopyBytes(kSecRandomDefault, count, &bytes)
        return Data(bytes).base64URLEncoded()
    }
}

extension Data {
    /// Base64-URL without padding (`+`→`-`, `/`→`_`, drop `=`).
    func base64URLEncoded() -> String {
        base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }
}
