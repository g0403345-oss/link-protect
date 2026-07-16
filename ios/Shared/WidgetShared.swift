import Foundation

/// Snapshot the app writes to the shared App Group container for the Home Screen
/// widgets to read. Compiled into both the app and the widget extension.
struct LPWidgetSnapshot: Codable, Equatable {
    var signedIn: Bool
    var botOnline: Bool
    var serverCount: Int
    var totalWarned: Int
    var totalBlockers: Int
    var updated: Date
    var servers: [Server]
    /// Scam Shield catches across all servers (optional: decodes old snapshots).
    var scamCatches: Int? = nil

    struct Server: Codable, Equatable, Identifiable {
        var id: String
        var name: String
        var warned: Int
        var blockers: Int
        var catches: Int? = nil
    }

    static let placeholder = LPWidgetSnapshot(
        signedIn: true, botOnline: true, serverCount: 6, totalWarned: 12, totalBlockers: 34, updated: Date(),
        servers: [
            .init(id: "1", name: "Bot Management", warned: 1, blockers: 5, catches: 2),
            .init(id: "2", name: "Support", warned: 6, blockers: 5, catches: 1),
            .init(id: "3", name: "Norecoil.de", warned: 3, blockers: 4, catches: 0),
        ],
        scamCatches: 3
    )
    static let signedOut = LPWidgetSnapshot(
        signedIn: false, botOnline: false, serverCount: 0, totalWarned: 0, totalBlockers: 0, updated: Date(), servers: []
    )
}

enum LPWidgetStore {
    static let appGroup = "group.com.linkprotect.app"
    private static let key = "widget.snapshot"

    private static var defaults: UserDefaults? { UserDefaults(suiteName: appGroup) }

    static func load() -> LPWidgetSnapshot {
        guard let data = defaults?.data(forKey: key),
              let snap = try? JSONDecoder().decode(LPWidgetSnapshot.self, from: data)
        else { return .placeholder }
        return snap
    }

    static func save(_ snapshot: LPWidgetSnapshot) {
        if let data = try? JSONEncoder().encode(snapshot) {
            defaults?.set(data, forKey: key)
        }
    }
}
