import SwiftUI

@main
struct LinkProtectWatchApp: App {
    @StateObject private var sync = WatchSync.shared

    var body: some Scene {
        WindowGroup {
            WatchRootView()
                .environmentObject(sync)
                .onAppear { sync.activate() }
        }
    }
}
