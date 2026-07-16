import Foundation
import UserNotifications
import UIKit

/// Owns the push-notification lifecycle: permission, the APNs device token, and
/// keeping the backend's token registration in sync with the user's preferences.
@MainActor
final class PushManager: NSObject, ObservableObject {
    static let shared = PushManager()

    @Published var authorizationStatus: UNAuthorizationStatus = .notDetermined
    @Published var preferences = PushPreferences.load() {
        didSet { preferences.save() }
    }

    /// Per-server mute list — servers the user doesn't want alerts from.
    @Published private(set) var mutedGuilds: Set<String> = {
        Set(UserDefaults.standard.stringArray(forKey: "push.mutedGuilds") ?? [])
    }()

    /// Set when a notification asks to open a specific server; the server list
    /// observes this and navigates.
    @Published var openGuildId: String?

    private var deviceToken: String?
    /// The guilds the signed-in user can manage — so the backend only pushes a
    /// given server's alerts to devices that actually administer it.
    private var managedGuildIds: [String] = []
    /// Held so we can re-register when the token or prefs change after sign-in.
    /// `APIClient` is a value type whose token closure captures `AuthStore`
    /// weakly, so storing it here introduces no retain cycle.
    private var api: APIClient?

    private override init() {
        super.init()
        registerCategories()
    }

    /// Define the actionable notification categories.
    func registerCategories() {
        let open = UNNotificationAction(identifier: "OPEN_SERVER", title: "Open server", options: [.foreground])
        let reset = UNNotificationAction(identifier: "RESET_WARNS", title: "Reset warnings",
                                         options: [.destructive, .authenticationRequired])
        let ban = UNNotificationAction(identifier: "BAN_USER", title: "Ban user",
                                       options: [.destructive, .authenticationRequired])
        let action = UNNotificationCategory(identifier: "LP_ACTION", actions: [open, reset, ban],
                                            intentIdentifiers: [], options: [])
        // Scam Shield events: the account was caught but not banned yet —
        // banning straight from the notification is the headline action.
        let scam = UNNotificationCategory(identifier: "LP_SCAM", actions: [ban, open],
                                          intentIdentifiers: [], options: [])
        let settings = UNNotificationCategory(identifier: "LP_SETTINGS", actions: [open],
                                              intentIdentifiers: [], options: [])
        UNUserNotificationCenter.current().setNotificationCategories([action, scam, settings])
    }

    /// Handle a tap or action button on a delivered notification.
    func handle(response: UNNotificationResponse) async {
        let info = response.notification.request.content.userInfo
        let gid = info["guild_id"] as? String
        switch response.actionIdentifier {
        case "RESET_WARNS":
            if let gid, let uid = info["user_id"] as? String, let api = await waitForAPI() {
                try? await api.resetWarns(gid, userId: uid)
            }
        case "BAN_USER":
            if let gid, let uid = info["user_id"] as? String, let api = await waitForAPI() {
                _ = try? await api.moderate(gid, userId: uid, action: "ban",
                                            username: info["username"] as? String,
                                            reason: "Banned from Scam Shield notification")
            }
        default: // default tap or "OPEN_SERVER"
            if let gid { openGuildId = gid }
        }
    }

    /// An action can arrive before sign-in restore finished (cold launch from a
    /// notification button) — wait briefly for the API client to become ready.
    private func waitForAPI() async -> APIClient? {
        for _ in 0..<20 where api == nil {
            try? await Task.sleep(nanoseconds: 250_000_000)
        }
        return api
    }

    func refreshAuthorizationStatus() async {
        let settings = await UNUserNotificationCenter.current().notificationSettings()
        authorizationStatus = settings.authorizationStatus
    }

    /// Prompt for permission (called from the notifications screen / first sign-in).
    @discardableResult
    func requestAuthorization() async -> Bool {
        let center = UNUserNotificationCenter.current()
        let granted = (try? await center.requestAuthorization(options: [.alert, .badge, .sound])) ?? false
        await refreshAuthorizationStatus()
        if granted {
            UIApplication.shared.registerForRemoteNotifications()
        }
        return granted
    }

    /// If the user already granted permission, make sure APNs registration is live.
    func registerIfAuthorized(api: APIClient) async {
        await refreshAuthorizationStatus()
        self.api = api
        guard authorizationStatus == .authorized else { return }
        UIApplication.shared.registerForRemoteNotifications()
        await syncRegistration()
    }

    // Called by the AppDelegate.
    func didRegister(deviceToken data: Data) {
        deviceToken = data.map { String(format: "%02x", $0) }.joined()
        Task { await syncRegistration() }
    }

    func didFailToRegister(_ error: Error) {
        // Silent: simulator has no APNs; physical devices will retry on next launch.
        deviceToken = nil
    }

    /// Updated by the server list once the user's manageable guilds are known.
    func updateManagedGuilds(_ ids: [String]) {
        guard ids != managedGuildIds else { return }
        managedGuildIds = ids
        Task { await syncRegistration() }
    }

    func isMuted(_ guildId: String) -> Bool { mutedGuilds.contains(guildId) }

    func setMuted(_ guildId: String, _ muted: Bool) {
        if muted { mutedGuilds.insert(guildId) } else { mutedGuilds.remove(guildId) }
        UserDefaults.standard.set(Array(mutedGuilds), forKey: "push.mutedGuilds")
        Task { await syncRegistration() }
    }

    /// Push the current device token + preferences to the backend. Muted servers
    /// are excluded so their alerts never reach this device.
    func syncRegistration() async {
        guard let deviceToken, let api else { return }
        let effective = managedGuildIds.filter { !mutedGuilds.contains($0) }
        try? await api.registerPush(deviceToken: deviceToken, preferences: preferences, guildIds: effective)
    }

    func updatePreferences(_ new: PushPreferences) {
        preferences = new
        Task { await syncRegistration() }
    }
}
