import Foundation

/// Which native alerts the user wants. These map directly to the three
/// notification triggers that make the app genuinely useful away from a desk
/// (and satisfy App Store Guideline 4.2 — real, on-device functionality):
///   • the bot going offline,
///   • a protection rule firing (link blocked / member actioned),
///   • a server's settings being changed.
struct PushPreferences: Codable, Equatable {
    var botOffline = true
    var ruleTriggered = true
    var settingsChanged = false

    private static let key = "push.preferences"

    static func load() -> PushPreferences {
        guard let data = UserDefaults.standard.data(forKey: key),
              let prefs = try? JSONDecoder().decode(PushPreferences.self, from: data)
        else { return PushPreferences() }
        return prefs
    }

    func save() {
        if let data = try? JSONEncoder().encode(self) {
            UserDefaults.standard.set(data, forKey: Self.key)
        }
    }

    var anyEnabled: Bool { botOffline || ruleTriggered || settingsChanged }
}
