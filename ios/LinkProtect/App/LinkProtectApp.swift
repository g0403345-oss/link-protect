import SwiftUI

@main
struct LinkProtectApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate

    @StateObject private var auth = AuthStore()
    @StateObject private var toasts = ToastCenter()
    @StateObject private var push = PushManager.shared
    @StateObject private var lock = AppLock()
    @Environment(\.scenePhase) private var scenePhase

    var body: some Scene {
        WindowGroup {
            ZStack {
                RootView()
                    .toastHost()

                if lock.isLocked {
                    LockView()
                        .transition(.opacity)
                        .zIndex(10)
                }
            }
            // Inject on the ZStack so they reach RootView, the toast overlay AND LockView.
            .environmentObject(auth)
            .environmentObject(toasts)
            .environmentObject(push)
            .environmentObject(lock)
            .preferredColorScheme(.dark)
            .tint(Theme.blurple)
            .animation(.easeInOut(duration: 0.2), value: lock.isLocked)
            .task {
                WatchSync.shared.activate()
                await auth.bootstrap()
                await push.refreshAuthorizationStatus()
            }
            .onChange(of: scenePhase) { phase in
                switch phase {
                case .background: lock.lockIfEnabled()
                case .active: Task { await lock.authenticate() }
                default: break
                }
            }
        }
    }
}
