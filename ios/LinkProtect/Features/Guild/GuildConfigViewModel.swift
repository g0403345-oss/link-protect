import SwiftUI

@MainActor
final class GuildConfigViewModel: ObservableObject {
    enum Phase: Equatable { case loading, ready, failed(String) }

    let guild: ManagedGuild
    private let api: APIClient
    weak var toasts: ToastCenter?

    @Published var phase: Phase = .loading
    @Published var data: ServerData?
    @Published var stats: GuildStats?
    @Published var trends: TrendData?
    @Published var actions: [ModerationAction] = []
    @Published var audit: [AuditEntry] = []
    /// The setting path currently being written (drives per-row spinners).
    @Published var savingPath: String?

    // Picker option caches (channels / roles), loaded on demand.
    @Published var channels: [DiscordChannel]?
    @Published var roles: [DiscordRole]?
    // Resolved member names {id: displayName}, so whitelist chips show who they are.
    @Published var memberNames: [String: String] = [:]

    init(guild: ManagedGuild, api: APIClient) {
        self.guild = guild
        self.api = api
    }

    var guildId: String { guild.id }

    // MARK: Loading

    func load() async {
        phase = .loading
        do {
            async let d = api.serverData(guildId)
            async let s = api.stats(guildId)
            async let a = api.actions(guildId, limit: 50)
            data = try await d
            stats = try? await s
            actions = (try? await a) ?? []
            phase = .ready
            premium = try? await api.premium(guildId)
        } catch {
            phase = .failed((error as? LocalizedError)?.errorDescription ?? "Couldn't load this server.")
        }
    }

    // MARK: Premium

    @Published var premium: PremiumStatus?
    @Published var watchlist: WatchlistState?
    @Published var scheduleState: ScheduleState?

    var premiumActive: Bool { premium?.active == true }

    func loadPremium() async {
        if premium == nil { premium = try? await api.premium(guildId) }
    }

    func loadPremiumFeatures() async {
        await loadPremium()
        watchlist = try? await api.watchlist(guildId)
        scheduleState = try? await api.schedule(guildId)
        let ids = (watchlist?.entries.map(\.userId) ?? []).filter { memberNames[$0] == nil }
        if !ids.isEmpty, let members = try? await api.resolveMembers(guildId, ids: ids) {
            for m in members { memberNames[m.id] = m.displayName }
        }
    }

    func addToWatchlist(userId: String, days: Int, reason: String?) async {
        do {
            try await api.addWatchlist(guildId, userId: userId, days: days, reason: reason)
            watchlist = try? await api.watchlist(guildId)
            if memberNames[userId] == nil,
               let members = try? await api.resolveMembers(guildId, ids: [userId]) {
                for m in members { memberNames[m.id] = m.displayName }
            }
            toasts?.success("Added to watchlist")
        } catch {
            toasts?.error((error as? LocalizedError)?.errorDescription ?? "Couldn't add to the watchlist")
        }
    }

    func removeFromWatchlist(userId: String) async {
        do {
            try await api.removeWatchlist(guildId, userId: userId)
            watchlist = try? await api.watchlist(guildId)
            toasts?.success("Removed from watchlist")
        } catch {
            toasts?.error("Couldn't remove this entry")
        }
    }

    func saveSchedule(enabled: Bool, fromHour: Int, toHour: Int, preset: String) async -> Bool {
        do {
            try await api.setSchedule(guildId, enabled: enabled, fromHour: fromHour, toHour: toHour, preset: preset)
            scheduleState = try? await api.schedule(guildId)
            toasts?.success("Schedule saved")
            return true
        } catch {
            toasts?.error((error as? LocalizedError)?.errorDescription ?? "Couldn't save the schedule")
            return false
        }
    }

    func startEvent(hours: Int) async {
        do {
            _ = try await api.startEventMode(guildId, hours: hours)
            scheduleState = try? await api.schedule(guildId)
            toasts?.success("Event mode is on — all links blocked")
        } catch {
            toasts?.error((error as? LocalizedError)?.errorDescription ?? "Couldn't start event mode")
        }
    }

    func stopEvent() async {
        do {
            try await api.stopEventMode(guildId)
            scheduleState = try? await api.schedule(guildId)
            toasts?.success("Event mode ended")
        } catch {
            toasts?.error("Couldn't end event mode")
        }
    }

    func refreshStats() async { stats = try? await api.stats(guildId) }
    func scamShieldStats() async -> ScamShieldStats? { try? await api.scamShieldStats(guildId) }

    // MARK: Emergency lockdown + verification gate

    @Published var lockdown: LockdownStatus?

    func loadLockdown() async { lockdown = try? await api.lockdown(guildId) }

    @discardableResult
    func setLockdown(active: Bool, reason: String?) async -> Bool {
        do {
            lockdown = try await api.setLockdown(guildId, active: active, reason: reason)
            toasts?.success(active ? "Lockdown active — server frozen" : "Lockdown lifted")
            return true
        } catch {
            toasts?.error("Lockdown failed — check my permissions")
            return false
        }
    }

    func verifyHealth() async -> VerifyHealth? { try? await api.verifyHealth(guildId) }
    func verifyStats() async -> VerifyStats? { try? await api.verifyStats(guildId) }
    func setupVerifyRole() async throws -> VerifySetupResult { try await api.setupVerifyRole(guildId) }
    func refreshActions() async { actions = (try? await api.actions(guildId, limit: 50)) ?? [] }
    func loadAudit() async { audit = (try? await api.auditLog(guildId)) ?? [] }
    func loadTrends() async { if trends == nil { trends = try? await api.trends(guildId, days: 14) } }

    // MARK: Generic optimistic patch

    func patch<V: Encodable>(path: String,
                             value: V,
                             label: String,
                             apply: (inout ServerData) -> Void) async {
        guard var current = data else { return }
        let snapshot = current
        apply(&current)
        data = current
        savingPath = path
        do {
            try await api.patch(guildId, path: path, value: value)
            toasts?.success("\(label) saved")
        } catch {
            data = snapshot
            toasts?.error("Couldn't save \(label)")
        }
        savingPath = nil
    }

    /// Two-way binding for a boolean setting that writes through on change.
    func boolBinding(_ keyPath: WritableKeyPath<ServerData, Bool>,
                     path: String,
                     label: String) -> Binding<Bool> {
        Binding(
            get: { self.data?[keyPath: keyPath] ?? false },
            set: { newValue in
                Task {
                    await self.patch(path: path, value: newValue, label: label) {
                        $0[keyPath: keyPath] = newValue
                    }
                }
            }
        )
    }

    // MARK: Presets

    func applyPreset(_ p: ProtectionPreset) async {
        guard data != nil else { return }
        savingPath = "preset"
        var ok = true
        for (key, val) in p.protect {
            do { try await api.patch(guildId, path: "protect.\(key)", value: val) } catch { ok = false }
        }
        for (path, val) in [("warn.kick", p.kick), ("warn.ban", p.ban), ("warn.timeout.warnings", p.timeout)] {
            do { try await api.patch(guildId, path: path, value: val) } catch { ok = false }
        }
        if let fresh = try? await api.serverData(guildId) { data = fresh }
        savingPath = nil
        if ok { toasts?.success("\(p.title) preset applied") }
        else { toasts?.error("Some settings didn't save") }
    }

    func resetWarns(userId: String) async {
        do {
            try await api.resetWarns(guildId, userId: userId)
            data?.warn.warnedUsers.removeAll { $0.id == userId }
            toasts?.success("Warnings reset")
            await refreshStats()
        } catch {
            toasts?.error("Reset failed")
        }
    }

    // MARK: Remote moderation (warn / timeout / kick / ban a member)

    /// Warn / timeout / kick / ban a member from the app. A manual warn escalates
    /// per the server's kick/ban/timeout thresholds, exactly like the bot does.
    @discardableResult
    func moderate(userId: String, action: String, displayName: String? = nil,
                  reason: String? = nil, minutes: Int? = nil) async -> Bool {
        let past = ["warn": "warned", "timeout": "timed out", "kick": "kicked", "ban": "banned"]
        do {
            let r = try await api.moderate(guildId, userId: userId, action: action,
                                           username: displayName, reason: reason, minutes: minutes)
            let who = displayName ?? "Member"
            var msg = "\(who) \(past[action] ?? action)"
            if let esc = r.escalated { msg += " → " + (past[esc] ?? esc) }
            toasts?.success(msg)
            if let e = r.escalationError { toasts?.error("Couldn't escalate: \(e)") }
            if action == "kick" || action == "ban" {
                data?.warn.warnedUsers.removeAll { $0.id == userId }
            }
            await reloadData()
            await refreshStats()
            return true
        } catch APIError.server(_, let msg) {
            toasts?.error(msg)
            return false
        } catch {
            toasts?.error("Action failed")
            return false
        }
    }

    /// Quietly re-fetch server settings (no loading flicker) after a mutation.
    func reloadData() async { if let d = try? await api.serverData(guildId) { data = d } }

    // MARK: Warn-Log channel

    /// Set or clear the warn-log channel — the app equivalent of `/enable-warn-log`
    /// and `/disable-warn-log`. Passing nil/empty disables it. Writes both the
    /// channel id and the `Activated` flag so the bot logs (or stops) immediately.
    func setWarnLog(channelId: String?) async {
        guard var current = data else { return }
        let snapshot = current
        let id = (channelId ?? "").trimmingCharacters(in: .whitespaces)
        let enabled = !id.isEmpty && id != "0"
        let idInt = enabled ? (Int(id) ?? 0) : 0

        current.log.logChannel = enabled ? id : ""
        current.log.activated = enabled
        data = current
        savingPath = "log.log-channel"
        do {
            try await api.patch(guildId, path: "log.log-channel", value: idInt)
            try await api.patch(guildId, path: "log.Activated", value: enabled)
            toasts?.success(enabled ? "Warn-log channel saved" : "Warn-log disabled")
        } catch {
            data = snapshot
            toasts?.error("Couldn't save warn-log")
        }
        savingPath = nil
    }

    // MARK: Per-channel overrides

    /// Apply a channel override optimistically. `mode == "default"` removes it.
    func setOverride(channelId: String, _ override: ChannelOverride) async {
        guard var current = data else { return }
        let snapshot = current
        if override.mode == "default" {
            current.overrides[channelId] = nil
        } else {
            current.overrides[channelId] = override
        }
        data = current
        savingPath = "override.\(channelId)"
        do {
            if override.mode == "default" {
                try await api.removeOverride(guildId, channelId: channelId)
            } else {
                try await api.setOverride(guildId, channelId: channelId, override)
            }
            toasts?.success("Channel rule saved")
        } catch {
            data = snapshot
            toasts?.error("Couldn't save channel rule")
        }
        savingPath = nil
    }

    // MARK: Dashboard team (delegated access)

    @Published var editors: [DashboardEditor] = []
    @Published var editorsSaving = false

    func loadEditors() async {
        editors = (try? await api.editors(guildId)) ?? editors
    }

    private func saveEditors(_ ids: [String]) async {
        editorsSaving = true
        do {
            try await api.setEditors(guildId, editorIds: ids)
            await loadEditors()
            toasts?.success("Team updated")
        } catch APIError.forbidden {
            toasts?.error("Only server managers can change the team")
        } catch {
            toasts?.error("Couldn't update the team")
        }
        editorsSaving = false
    }

    func addEditor(_ rawId: String) async {
        let id = rawId.trimmingCharacters(in: .whitespaces)
        guard id.allSatisfy(\.isNumber), id.count >= 15, id.count <= 21 else {
            toasts?.error("Enter a valid Discord user ID"); return
        }
        if editors.contains(where: { $0.id == id }) { return }
        await saveEditors(editors.map(\.id) + [id])
    }

    func removeEditor(_ id: String) async {
        await saveEditors(editors.map(\.id).filter { $0 != id })
    }

    // MARK: Pickers

    func loadChannels() async {
        guard channels == nil else { return }
        channels = (try? await api.channels(guildId)) ?? []
    }
    func loadRoles() async {
        guard roles == nil else { return }
        roles = (try? await api.roles(guildId)) ?? []
    }
    func searchMembers(_ query: String) async -> [DiscordMember] {
        (try? await api.searchMembers(guildId, query: query)) ?? []
    }

    /// Resolve member IDs (whitelist, warned users, …) we don't have a name for
    /// yet — so the UI shows names, never raw IDs. Chunked to the API's 50 limit.
    func resolveMembers(_ ids: [String]) async {
        let missing = ids.filter { memberNames[$0] == nil && !$0.isEmpty }
        guard !missing.isEmpty else { return }
        var start = 0
        while start < missing.count {
            let chunk = Array(missing[start..<min(start + 50, missing.count)])
            if let members = try? await api.resolveMembers(guildId, ids: chunk) {
                for m in members { memberNames[m.id] = m.displayName }
            }
            start += 50
        }
    }
}

/// One-tap protection profiles applied from the Blockers section.
enum ProtectionPreset: String, CaseIterable, Identifiable {
    case minimal, balanced, strict
    var id: String { rawValue }

    var title: String {
        switch self {
        case .minimal: return "Minimal"
        case .balanced: return "Balanced"
        case .strict: return "Strict"
        }
    }
    var subtitle: String {
        switch self {
        case .minimal: return "Only the dangerous stuff"
        case .balanced: return "Sensible defaults"
        case .strict: return "Block everything risky"
        }
    }
    var icon: String {
        switch self {
        case .minimal: return "leaf"
        case .balanced: return "scalemass"
        case .strict: return "shield.fill"
        }
    }

    /// Full set of the 11 protect flags (off ones included for a clean apply).
    var protect: [String: Bool] {
        let on: Set<String>
        switch self {
        case .minimal:  on = ["malware", "nitro", "invite"]
        case .balanced: on = ["malware", "nitro", "invite", "nsfw", "bit"]
        case .strict:   on = ["nsfw", "nitro", "malware", "invite", "youtube", "google", "gif", "twitch", "steam", "bit"]
        }
        let all = ["all", "nsfw", "nitro", "malware", "invite", "youtube", "google", "gif", "twitch", "steam", "bit"]
        return Dictionary(uniqueKeysWithValues: all.map { ($0, on.contains($0)) })
    }
    var kick: Int { self == .strict ? 3 : (self == .balanced ? 5 : 0) }
    var ban: Int { self == .strict ? 5 : (self == .balanced ? 10 : 0) }
    var timeout: Int { self == .strict ? 2 : (self == .balanced ? 3 : 0) }
}
