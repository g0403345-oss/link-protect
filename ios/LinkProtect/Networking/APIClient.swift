import Foundation

enum APIError: LocalizedError {
    case unauthorized
    case forbidden
    case notFound
    case server(Int, String)
    case decoding
    case offline

    var errorDescription: String? {
        switch self {
        case .unauthorized: return "Your session expired. Please sign in again."
        case .forbidden: return "You don't manage this server."
        case .notFound: return "This server isn't set up with the bot yet."
        case .server(let code, let msg): return "Server error (\(code)): \(msg)"
        case .decoding: return "Received an unexpected response."
        case .offline: return "You appear to be offline."
        }
    }
}

/// Talks to the Link Protect bot API's mobile surface (`/api/mobile/*`). Every
/// request carries the user's Discord access token as a Bearer credential; the
/// server validates it against Discord and enforces "Manage Server" permission
/// per guild — exactly the same authorization the website performs.
struct APIClient {
    /// Supplies a fresh, non-expired access token (refreshing if needed).
    let tokenProvider: () async throws -> String

    /// When true, all calls return built-in sample data (App Store reviewer demo
    /// — no network, no Discord). The normal Discord-login path keeps `demo = false`.
    var demo: Bool = false

    private let session: URLSession = {
        let cfg = URLSessionConfiguration.default
        cfg.waitsForConnectivity = true
        cfg.timeoutIntervalForRequest = 20
        return URLSession(configuration: cfg)
    }()

    private struct PatchBody<V: Encodable>: Encodable { let path: String; let value: V }

    // MARK: Identity & servers

    func me() async throws -> DiscordUser {
        if demo { return DemoData.user }
        return try await request("/api/mobile/me")
    }

    func guilds() async throws -> [ManagedGuild] {
        if demo { return DemoData.guilds }
        struct Resp: Decodable { let guilds: [ManagedGuild] }
        return try await request("/api/mobile/guilds", as: Resp.self).guilds
    }

    func serverData(_ guildId: String) async throws -> ServerData {
        if demo { return DemoData.serverData() }
        struct Resp: Decodable { let data: ServerData }
        return try await request("/api/mobile/guild/\(guildId)", as: Resp.self).data
    }

    // MARK: Mutations

    func patch<V: Encodable>(_ guildId: String, path: String, value: V) async throws {
        if demo { return }  // demo: optimistic UI update stays, nothing persisted
        try await requestVoid(
            "/api/mobile/guild/\(guildId)",
            method: "PATCH",
            body: PatchBody(path: path, value: value)
        )
    }

    func resetWarns(_ guildId: String, userId: String) async throws {
        if demo { return }
        try await requestVoid("/api/mobile/guild/\(guildId)/warns/\(userId)", method: "DELETE")
    }

    /// Remote moderation: warn / timeout / untimeout / kick / ban / unban a member.
    /// Live Discord actions go through the bot; warn mirrors the bot's thresholds.
    @discardableResult
    func moderate(_ guildId: String, userId: String, action: String,
                  username: String? = nil, reason: String? = nil, minutes: Int? = nil) async throws -> ModerationResult {
        struct Body: Encodable {
            let user_id: String; let username: String?; let action: String
            let reason: String?; let minutes: Int?
        }
        let fallback = ModerationResult(ok: true, action: action, warnCount: nil, escalated: nil, escalationError: nil)
        if demo { return fallback }
        let data = try await perform("/api/mobile/guild/\(guildId)/moderate", method: "POST",
                                     body: Body(user_id: userId, username: username, action: action,
                                                reason: reason, minutes: minutes))
        return (try? JSONDecoder().decode(ModerationResult.self, from: data)) ?? fallback
    }

    /// Set or replace a single channel's rule override.
    func setOverride(_ guildId: String, channelId: String, _ override: ChannelOverride) async throws {
        if demo { return }
        try await requestVoid("/api/mobile/guild/\(guildId)/override/\(channelId)", method: "PUT", body: override)
    }

    /// Remove a channel's override (it then follows the server settings again).
    func removeOverride(_ guildId: String, channelId: String) async throws {
        if demo { return }
        try await requestVoid("/api/mobile/guild/\(guildId)/override/\(channelId)", method: "DELETE")
    }

    /// Delegated dashboard team for this guild.
    func editors(_ guildId: String) async throws -> [DashboardEditor] {
        if demo { return [] }
        struct Resp: Decodable { let editors: [DashboardEditor] }
        return try await request("/api/mobile/guild/\(guildId)/editors", as: Resp.self).editors
    }

    /// Replace the team list (owner / Manage Server only — editors get 403).
    func setEditors(_ guildId: String, editorIds: [String]) async throws {
        if demo { return }
        struct Body: Encodable { let editors: [String] }
        try await requestVoid("/api/mobile/guild/\(guildId)/editors", method: "PUT", body: Body(editors: editorIds))
    }

    /// Deletes the data we hold for the signed-in user (push registrations).
    func deleteAccount() async throws {
        if demo { return }
        try await requestVoid("/api/mobile/account/delete", method: "POST")
    }

    // MARK: Reports

    /// Submit a report (malicious link / false positive / bug / feedback).
    func submitReport(type: String, url: String?, category: String?, message: String?, guildId: String?) async throws {
        if demo { return }
        struct Body: Encodable {
            let type: String
            let url: String?
            let category: String?
            let message: String?
            let guildId: String?
        }
        try await requestVoid("/api/mobile/report", method: "POST",
                              body: Body(type: type, url: url, category: category, message: message, guildId: guildId))
    }

    /// Admin: list submitted reports (super-admin only).
    func adminReports(status: String = "", type: String = "") async throws -> ReportsPage {
        if demo { return ReportsPage(reports: [], counts: [:]) }
        var qs = "?limit=300"
        if !status.isEmpty { qs += "&status=\(status)" }
        if !type.isEmpty { qs += "&type=\(type)" }
        return try await request("/api/mobile/admin/reports\(qs)")
    }

    /// Admin: update a report's status, optionally promoting its link to the threat DB.
    func updateReport(_ id: Int, status: String?, promote: Bool?) async throws {
        if demo { return }
        struct Body: Encodable { let status: String?; let promote: Bool? }
        try await requestVoid("/api/mobile/admin/reports/\(id)", method: "PATCH",
                              body: Body(status: status, promote: promote))
    }

    // MARK: Stats & activity

    func stats(_ guildId: String) async throws -> GuildStats {
        if demo { return DemoData.stats }
        return try await request("/api/mobile/guild/\(guildId)/stats")
    }

    func actions(_ guildId: String, limit: Int = 50) async throws -> [ModerationAction] {
        if demo { return DemoData.actions() }
        struct Resp: Decodable { let actions: [ModerationAction] }
        return try await request("/api/mobile/guild/\(guildId)/actions?limit=\(limit)", as: Resp.self).actions
    }

    func trends(_ guildId: String, days: Int = 14) async throws -> TrendData {
        if demo { return DemoData.trends() }
        return try await request("/api/mobile/guild/\(guildId)/trends?days=\(days)")
    }

    /// Global bot liveness (heartbeat-based).
    func status() async throws -> BotStatus {
        if demo { return DemoData.status }
        return try await request("/api/mobile/status")
    }

    // MARK: Discord pickers

    func channels(_ guildId: String) async throws -> [DiscordChannel] {
        if demo { return DemoData.channels }
        struct Resp: Decodable { let channels: [DiscordChannel] }
        return try await request("/api/mobile/guild/\(guildId)/discord-channels", as: Resp.self).channels
    }

    func roles(_ guildId: String) async throws -> [DiscordRole] {
        if demo { return DemoData.roles }
        struct Resp: Decodable { let roles: [DiscordRole] }
        return try await request("/api/mobile/guild/\(guildId)/discord-roles", as: Resp.self).roles
    }

    func searchMembers(_ guildId: String, query: String) async throws -> [DiscordMember] {
        if demo {
            return query.isEmpty ? DemoData.members
                : DemoData.members.filter { $0.displayName.localizedCaseInsensitiveContains(query) }
        }
        struct Resp: Decodable { let members: [DiscordMember] }
        let q = query.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? ""
        return try await request("/api/mobile/guild/\(guildId)/discord-members/search?q=\(q)", as: Resp.self).members
    }

    /// Resolve whitelisted member IDs to names, so chips show who they are.
    func resolveMembers(_ guildId: String, ids: [String]) async throws -> [DiscordMember] {
        if demo { return DemoData.members.filter { ids.contains($0.id) } }
        guard !ids.isEmpty else { return [] }
        struct Resp: Decodable { let members: [DiscordMember] }
        let csv = ids.joined(separator: ",").addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? ""
        return try await request("/api/mobile/guild/\(guildId)/discord-members/resolve?ids=\(csv)", as: Resp.self).members
    }

    func auditLog(_ guildId: String) async throws -> [AuditEntry] {
        if demo {
            return [AuditEntry(userId: DemoData.user.id, username: DemoData.user.displayName,
                               path: "protect.nitro", description: "Nitro scams enabled",
                               timestamp: Int(Date().timeIntervalSince1970) - 300)]
        }
        struct Resp: Decodable { let entries: [AuditEntry] }
        return try await request("/api/mobile/guild/\(guildId)/audit?limit=200", as: Resp.self).entries
    }

    // MARK: Admin (super-admin only)

    func adminGuilds(offset: Int, limit: Int = 30, query: String = "") async throws -> AdminGuildsPage {
        let q = query.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? ""
        return try await request("/api/mobile/admin/guilds?offset=\(offset)&limit=\(limit)&q=\(q)")
    }

    func adminActions(limit: Int = 200) async throws -> [GlobalAction] {
        struct Resp: Decodable { let actions: [GlobalAction] }
        return try await request("/api/mobile/admin/actions?limit=\(limit)", as: Resp.self).actions
    }

    func adminUser(_ userId: String) async throws -> AdminUserDetail {
        try await request("/api/mobile/admin/user/\(userId)")
    }

    /// Global config: is the "redirect settings commands" mode on?
    func adminConfig() async throws -> Bool {
        if demo { return false }
        struct Resp: Decodable { let lockCommands: Bool }
        return try await request("/api/mobile/admin/config", as: Resp.self).lockCommands
    }

    func setAdminConfig(lockCommands: Bool) async throws {
        if demo { return }
        struct Body: Encodable { let lockCommands: Bool }
        try await requestVoid("/api/mobile/admin/config", method: "POST", body: Body(lockCommands: lockCommands))
    }

    // MARK: Push registration

    func registerPush(deviceToken: String, preferences: PushPreferences, guildIds: [String]) async throws {
        if demo { return }
        struct Body: Encodable {
            let device_token: String
            let bot_offline: Bool
            let rule_triggered: Bool
            let settings_changed: Bool
            let guild_ids: [String]
            let platform = "ios"
        }
        try await requestVoid("/api/mobile/push/register", method: "POST", body: Body(
            device_token: deviceToken,
            bot_offline: preferences.botOffline,
            rule_triggered: preferences.ruleTriggered,
            settings_changed: preferences.settingsChanged,
            guild_ids: guildIds
        ))
    }

    // MARK: - Core request plumbing

    private func request<T: Decodable>(_ path: String, as type: T.Type = T.self) async throws -> T {
        let data = try await perform(path, method: "GET", body: Optional<Int>.none)
        do { return try JSONDecoder().decode(T.self, from: data) }
        catch { throw APIError.decoding }
    }

    private func requestVoid<B: Encodable>(_ path: String, method: String, body: B? = nil) async throws {
        _ = try await perform(path, method: method, body: body)
    }
    private func requestVoid(_ path: String, method: String) async throws {
        _ = try await perform(path, method: method, body: Optional<Int>.none)
    }

    private func perform<B: Encodable>(_ path: String, method: String, body: B?) async throws -> Data {
        let token = try await tokenProvider()
        // Join by string so query strings (`?limit=…`) survive — appendingPathComponent
        // would percent-encode the `?`.
        var base = AppConfig.apiBaseURL.absoluteString
        if base.hasSuffix("/") { base.removeLast() }
        guard let url = URL(string: base + path) else { throw APIError.decoding }
        var req = URLRequest(url: url)
        req.httpMethod = method
        req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        if let body {
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
            req.httpBody = try JSONEncoder().encode(body)
        }

        let data: Data, response: URLResponse
        do { (data, response) = try await session.data(for: req) }
        catch let e as URLError where e.code == .notConnectedToInternet { throw APIError.offline }

        guard let http = response as? HTTPURLResponse else { throw APIError.decoding }
        switch http.statusCode {
        case 200...299: return data
        case 401: throw APIError.unauthorized
        case 403: throw APIError.forbidden
        case 404: throw APIError.notFound
        default:
            let msg = (try? JSONDecoder().decode([String: String].self, from: data))?["detail"] ?? "Unknown error"
            throw APIError.server(http.statusCode, msg)
        }
    }
}
