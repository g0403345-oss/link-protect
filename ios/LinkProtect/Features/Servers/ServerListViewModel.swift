import Foundation
import WidgetKit

@MainActor
final class ServerListViewModel: ObservableObject {
    enum Phase: Equatable {
        case loading
        case loaded([ManagedGuild])
        case empty
        case failed(String)
    }

    @Published private(set) var phase: Phase = .loading
    private let api: APIClient

    init(api: APIClient) { self.api = api }

    func load(initial: Bool = false) async {
        if initial, case .loaded = phase { return }
        if initial { phase = .loading }
        do {
            let guilds = try await api.guilds()
            // Only servers that actually have the bot get push alerts.
            PushManager.shared.updateManagedGuilds(guilds.filter(\.botPresent).map(\.id))
            phase = guilds.isEmpty ? .empty : .loaded(guilds)
            await writeWidgetSnapshot(guilds)
        } catch {
            phase = .failed((error as? LocalizedError)?.errorDescription ?? "Couldn't load your servers.")
        }
    }

    /// Push a summary into the shared App Group container for the Home Screen widget.
    private func writeWidgetSnapshot(_ guilds: [ManagedGuild]) async {
        let present = guilds.filter(\.botPresent)
        let status = try? await api.status()
        let topServers = Array(present.sorted { $0.warnedUsers > $1.warnedUsers }.prefix(12))
        let snap = LPWidgetSnapshot(
            signedIn: true,
            botOnline: status?.botOnline ?? true,
            serverCount: present.count,
            totalWarned: present.reduce(0) { $0 + $1.warnedUsers },
            totalBlockers: present.reduce(0) { $0 + $1.activeProtections },
            updated: Date(),
            servers: topServers.map { .init(id: $0.id, name: $0.name, warned: $0.warnedUsers,
                                            blockers: $0.activeProtections, catches: $0.scamCatches) },
            scamCatches: present.reduce(0) { $0 + ($1.scamCatches ?? 0) }
        )
        LPWidgetStore.save(snap)
        WidgetCenter.shared.reloadAllTimelines()
        WatchSync.shared.send(snap)
    }
}
