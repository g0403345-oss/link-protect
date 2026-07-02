import SwiftUI

@MainActor
final class AdminViewModel: ObservableObject {
    enum Phase: Equatable { case loading, ready, failed(String) }

    private let api: APIClient
    private let pageSize = 30
    private var offset = 0
    private var query = ""
    private var lookup: [String: AdminGuild] = [:]

    @Published var phase: Phase = .loading
    @Published var guilds: [AdminGuild] = []
    @Published var total = 0
    @Published var hasMore = false
    @Published var loadingMore = false

    @Published var feed: [GlobalAction] = []
    @Published var feedLoading = false

    // Global config: redirect settings commands to web/app.
    @Published var lockCommands = false
    @Published var lockSaving = false

    init(api: APIClient) { self.api = api }

    func loadConfig() async {
        lockCommands = (try? await api.adminConfig()) ?? lockCommands
    }

    func setLockCommands(_ on: Bool) async {
        lockSaving = true
        let previous = lockCommands
        lockCommands = on
        do { try await api.setAdminConfig(lockCommands: on) }
        catch { lockCommands = previous }
        lockSaving = false
    }

    // MARK: Paginated server list

    func load() async {
        query = ""; offset = 0; guilds = []; lookup = [:]
        phase = .loading
        await fetch(reset: true)
    }

    func search(_ q: String) async {
        guard q != query else { return }
        query = q; offset = 0; guilds = []
        phase = .loading
        await fetch(reset: true)
    }

    func loadMore() async {
        guard hasMore, !loadingMore, phase == .ready else { return }
        loadingMore = true
        await fetch(reset: false)
        loadingMore = false
    }

    private func fetch(reset: Bool) async {
        do {
            let page = try await api.adminGuilds(offset: offset, limit: pageSize, query: query)
            if reset { guilds = page.guilds } else { guilds += page.guilds }
            for g in page.guilds { lookup[g.id] = g }
            total = page.total
            hasMore = page.hasMore
            offset = guilds.count
            phase = .ready
        } catch {
            if reset { phase = .failed((error as? LocalizedError)?.errorDescription ?? "Couldn't load servers.") }
        }
    }

    // MARK: Feed

    func refreshFeed() async {
        feedLoading = true
        feed = (try? await api.adminActions(limit: 200)) ?? feed
        feedLoading = false
    }

    // MARK: Reports

    @Published var reports: [Report] = []
    @Published var reportCounts: [String: Int] = [:]
    @Published var reportsLoading = false
    @Published var reportStatus = "open"

    func loadReports() async {
        reportsLoading = true
        if let page = try? await api.adminReports(status: reportStatus) {
            reports = page.reports
            reportCounts = page.counts
        }
        reportsLoading = false
    }

    func setReportStatus(_ s: String) async {
        guard s != reportStatus else { return }
        reportStatus = s
        await loadReports()
    }

    func actOnReport(_ id: Int, status: String?, promote: Bool = false) async {
        try? await api.updateReport(id, status: status, promote: promote)
        await loadReports()
    }

    // MARK: Navigation helpers

    func managedGuild(for id: String) -> ManagedGuild {
        let g = lookup[id]
        return ManagedGuild(id: id, name: g?.name ?? id, icon: g?.icon,
                            owner: false, botPresent: true, activeProtections: 0, warnedUsers: 0)
    }
}

/// Lightweight navigation value for pushing a user's detail page.
struct AdminUserRef: Hashable {
    let id: String
    let username: String
}
