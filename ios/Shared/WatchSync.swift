import Foundation
#if canImport(WatchConnectivity)
import WatchConnectivity
#endif
#if os(watchOS)
import WidgetKit
#endif

/// Bridges the latest `LPWidgetSnapshot` between the iPhone app and the Watch
/// app via WatchConnectivity (App Groups don't sync across devices). Compiled
/// into both the phone and watch targets.
///
/// - Phone: call `activate()` once, then `send(_:)` whenever the snapshot changes.
/// - Watch: call `activate()` once and observe `snapshot`.
final class WatchSync: NSObject, ObservableObject {
    static let shared = WatchSync()

    @Published var snapshot: LPWidgetSnapshot = .placeholder

    private let localKey = "watch.snapshot.local"

    private override init() {
        super.init()
        if let data = UserDefaults.standard.data(forKey: localKey),
           let snap = try? JSONDecoder().decode(LPWidgetSnapshot.self, from: data) {
            snapshot = snap
        }
    }

    func activate() {
        #if canImport(WatchConnectivity)
        guard WCSession.isSupported() else { return }
        let s = WCSession.default
        s.delegate = self
        s.activate()
        #endif
    }

    /// Phone → Watch: push the latest snapshot (replaces any queued one).
    func send(_ snap: LPWidgetSnapshot) {
        #if canImport(WatchConnectivity)
        guard WCSession.isSupported() else { return }
        let s = WCSession.default
        guard s.activationState == .activated,
              let data = try? JSONEncoder().encode(snap) else { return }
        try? s.updateApplicationContext(["snapshot": data])
        #endif
    }

    private func apply(_ context: [String: Any]) {
        guard let data = context["snapshot"] as? Data,
              let snap = try? JSONDecoder().decode(LPWidgetSnapshot.self, from: data) else { return }
        UserDefaults.standard.set(data, forKey: localKey)
        #if os(watchOS)
        // Mirror into the App Group so the watch-face complication (a separate
        // widget-extension process) sees fresh data, and re-render it.
        LPWidgetStore.save(snap)
        WidgetCenter.shared.reloadAllTimelines()
        #endif
        DispatchQueue.main.async { self.snapshot = snap }
    }
}

#if canImport(WatchConnectivity)
extension WatchSync: WCSessionDelegate {
    func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {
        apply(session.receivedApplicationContext)
    }
    func session(_ session: WCSession, didReceiveApplicationContext applicationContext: [String: Any]) {
        apply(applicationContext)
    }
    #if os(iOS)
    func sessionDidBecomeInactive(_ session: WCSession) {}
    func sessionDidDeactivate(_ session: WCSession) { session.activate() }
    #endif
}
#endif
