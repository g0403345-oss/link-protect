import SwiftUI
import LocalAuthentication

/// Optional biometric lock. When enabled, the app contents are hidden behind a
/// Face ID / Touch ID gate on launch and after returning from the background.
@MainActor
final class AppLock: ObservableObject {
    @Published private(set) var isLocked: Bool
    @Published var enabled: Bool {
        didSet {
            UserDefaults.standard.set(enabled, forKey: Self.key)
            isLocked = enabled
        }
    }

    private static let key = "security.appLockEnabled"

    init() {
        let on = UserDefaults.standard.bool(forKey: Self.key)
        enabled = on
        isLocked = on
    }

    /// SF Symbol for the device's biometric type.
    var biometryIcon: String {
        let ctx = LAContext()
        _ = ctx.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: nil)
        switch ctx.biometryType {
        case .faceID: return "faceid"
        case .touchID: return "touchid"
        default: return "lock.fill"
        }
    }

    var biometryName: String {
        let ctx = LAContext()
        _ = ctx.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: nil)
        switch ctx.biometryType {
        case .faceID: return "Face ID"
        case .touchID: return "Touch ID"
        default: return "biometrics"
        }
    }

    /// Lock again (called when the app goes to the background).
    func lockIfEnabled() { if enabled { isLocked = true } }

    /// Prompt for biometrics; unlocks on success. Passcode is allowed as fallback.
    func authenticate() async {
        guard enabled, isLocked else { return }
        let ctx = LAContext()
        ctx.localizedFallbackTitle = "Enter Passcode"
        do {
            let ok = try await ctx.evaluatePolicy(.deviceOwnerAuthentication,
                                                  localizedReason: "Unlock Link Protect")
            if ok { isLocked = false }
        } catch {
            // Stay locked; the user can retry from the lock screen.
        }
    }
}
