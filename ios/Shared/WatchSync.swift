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

    // Phone side: command handlers the app wires up once its API client exists.
    // The watch has no tokens — every action is relayed through the iPhone.
    var lockdownStatusProvider: ((String) async -> Bool?)?
    var lockdownSetter: ((String, Bool) async -> Bool)?

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

    /// Watch → Phone: send a command and await the reply. nil when the iPhone
    /// isn't reachable (locked/out of range) or the send fails.
    func sendCommand(_ payload: [String: Any]) async -> [String: Any]? {
        #if canImport(WatchConnectivity)
        guard WCSession.isSupported() else { return nil }
        let s = WCSession.default
        guard s.activationState == .activated, s.isReachable else { return nil }
        return await withCheckedContinuation { cont in
            s.sendMessage(payload,
                          replyHandler: { cont.resume(returning: $0) },
                          errorHandler: { _ in cont.resume(returning: nil) })
        }
        #else
        return nil
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

    /// Phone: answers watch commands (lockdown status / toggle).
    func session(_ session: WCSession, didReceiveMessage message: [String: Any],
                 replyHandler: @escaping ([String: Any]) -> Void) {
        #if os(iOS)
        guard let cmd = message["cmd"] as? String else { replyHandler(["ok": false]); return }
        Task {
            switch cmd {
            case "lockdown_status":
                let gid = message["guild"] as? String ?? ""
                let active = await self.lockdownStatusProvider?(gid)
                replyHandler(["ok": active != nil, "active": (active ?? false) as Bool])
            case "lockdown_set":
                let gid = message["guild"] as? String ?? ""
                let active = message["active"] as? Bool ?? false
                let ok = await self.lockdownSetter?(gid, active) ?? false
                replyHandler(["ok": ok, "active": active])
            default:
                replyHandler(["ok": false])
            }
        }
        #else
        replyHandler(["ok": false])
        #endif
    }

    #if os(iOS)
    func sessionDidBecomeInactive(_ session: WCSession) {}
    func sessionDidDeactivate(_ session: WCSession) { session.activate() }
    #endif
}
#endif
