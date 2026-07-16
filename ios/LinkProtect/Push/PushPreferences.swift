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
    var scamShield = true

    private static let key = "push.preferences"

    // Older saved payloads predate `scamShield` — decode it as optional so a
    // stored preference blob never resets the rest to defaults.
    enum CodingKeys: String, CodingKey { case botOffline, ruleTriggered, settingsChanged, scamShield }
    init() {}
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        botOffline = (try? c.decode(Bool.self, forKey: .botOffline)) ?? true
        ruleTriggered = (try? c.decode(Bool.self, forKey: .ruleTriggered)) ?? true
        settingsChanged = (try? c.decode(Bool.self, forKey: .settingsChanged)) ?? false
        scamShield = (try? c.decode(Bool.self, forKey: .scamShield)) ?? true
    }

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

    var anyEnabled: Bool { botOffline || ruleTriggered || settingsChanged || scamShield }
}
