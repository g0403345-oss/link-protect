import AppIntents
import SwiftUI

/// Siri / Shortcuts integration. "Hey Siri, Link Protect status" reads the
/// latest cached snapshot (shared via the App Group) without opening the app.
@available(iOS 16.0, *)
struct ServerStatusIntent: AppIntent {
    static var title: LocalizedStringResource = "Server protection status"
    static var description = IntentDescription("Hear whether the bot is online and how many servers are protected.")
    static var openAppWhenRun = false

    func perform() async throws -> some IntentResult & ProvidesDialog {
        let snap = LPWidgetStore.load()
        guard snap.signedIn else {
            return .result(dialog: "You're not signed in to Link Protect.")
        }
        let status = snap.botOnline ? "online" : "offline"
        let servers = snap.serverCount == 1 ? "1 server" : "\(snap.serverCount) servers"
        return .result(dialog: "Link Protect is \(status). \(servers) protected, with \(snap.totalWarned) warnings logged.")
    }
}

@available(iOS 16.0, *)
struct OpenLinkProtectIntent: AppIntent {
    static var title: LocalizedStringResource = "Open Link Protect"
    static var openAppWhenRun = true

    func perform() async throws -> some IntentResult { .result() }
}

@available(iOS 16.0, *)
struct LinkProtectShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: ServerStatusIntent(),
            phrases: [
                "\(.applicationName) status",
                "Check my \(.applicationName) status",
                "Are my servers protected in \(.applicationName)",
            ],
            shortTitle: "Status",
            systemImageName: "shield.fill"
        )
        AppShortcut(
            intent: OpenLinkProtectIntent(),
            phrases: ["Open \(.applicationName)"],
            shortTitle: "Open",
            systemImageName: "shield.lefthalf.filled"
        )
    }
}
