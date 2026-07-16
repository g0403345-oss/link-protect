import Foundation
import SwiftUI

// MARK: - Identity

struct DiscordUser: Codable, Equatable, Identifiable {
    let id: String
    let username: String
    let globalName: String?
    let avatar: String?

    enum CodingKeys: String, CodingKey {
        case id, username, avatar
        case globalName = "global_name"
    }

    var displayName: String { globalName ?? username }

    /// The super-admin gets the in-app Admin panel.
    var isAdmin: Bool { id == AppConfig.adminUserID }

    var avatarURL: URL? {
        guard let avatar else {
            let idx = (Int(id.suffix(1)) ?? 0) % 5
            return URL(string: "\(AppConfig.Discord.cdnBase)/embed/avatars/\(idx).png")
        }
        let ext = avatar.hasPrefix("a_") ? "gif" : "png"
        return URL(string: "\(AppConfig.Discord.cdnBase)/avatars/\(id)/\(avatar).\(ext)?size=128")
    }
}

// MARK: - Server / guild summary (mobile /guilds)

struct ManagedGuild: Codable, Equatable, Hashable, Identifiable {
    let id: String
    let name: String
    let icon: String?
    let owner: Bool
    /// Whether the bot is a member of this guild. If false, the app offers an invite.
    let botPresent: Bool
    let activeProtections: Int
    let warnedUsers: Int

    var iconURL: URL? {
        guard let icon else { return nil }
        let ext = icon.hasPrefix("a_") ? "gif" : "png"
        return URL(string: "\(AppConfig.Discord.cdnBase)/icons/\(id)/\(icon).\(ext)?size=128")
    }

    /// Bot invite pre-targeted at this server (and locked to it).
    var inviteURL: URL {
        URL(string: "https://discord.com/oauth2/authorize?client_id=\(AppConfig.Discord.clientID)&permissions=1376537111638&scope=bot&guild_id=\(id)&disable_guild_select=true")!
    }
}

// MARK: - Full server configuration

struct ServerData: Codable, Equatable {
    var protect = Protect()
    var silent = false
    var channel = Channels()
    var link = LinkConfig()
    var log = LogConfig()
    var warn = WarnConfig()
    var decay = Decay()
    var raid = Raid()
    var scamguard = ScamGuard()
    var overrides: [String: ChannelOverride] = [:]

    enum CodingKeys: String, CodingKey { case protect, silent, channel, link, log, warn, decay, raid, scamguard, overrides }

    /// Empty defaults — used as a non-nil fallback while data loads.
    init() {}

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        protect = (try? c.decode(Protect.self, forKey: .protect)) ?? Protect()
        silent = (try? c.decode(Bool.self, forKey: .silent)) ?? false
        channel = (try? c.decode(Channels.self, forKey: .channel)) ?? Channels()
        link = (try? c.decode(LinkConfig.self, forKey: .link)) ?? LinkConfig()
        log = (try? c.decode(LogConfig.self, forKey: .log)) ?? LogConfig()
        warn = (try? c.decode(WarnConfig.self, forKey: .warn)) ?? WarnConfig()
        decay = (try? c.decode(Decay.self, forKey: .decay)) ?? Decay()
        raid = (try? c.decode(Raid.self, forKey: .raid)) ?? Raid()
        scamguard = (try? c.decode(ScamGuard.self, forKey: .scamguard)) ?? ScamGuard()
        overrides = (try? c.decode([String: ChannelOverride].self, forKey: .overrides)) ?? [:]
    }

    func encode(to encoder: Encoder) throws { /* read-only on device */ }

    /// Auto-expire warnings after N days of good behaviour.
    struct Decay: Codable, Equatable {
        var enabled = false
        var days = 30
        init() {}
        enum CodingKeys: String, CodingKey { case enabled, days }
        init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            enabled = (try? c.decode(Bool.self, forKey: .enabled)) ?? false
            days = (try? c.decode(Int.self, forKey: .days)) ?? 30
        }
        func encode(to encoder: Encoder) throws {}
    }

    /// Scam Shield — cross-channel scam-spam defense + known-scammer join check.
    struct ScamGuard: Codable, Equatable {
        var enabled = false
        var channels = 3
        var window = 10
        var action = "ban"          // delete | timeout | kick | ban
        var timeoutMinutes = 60
        var joinCheck = false
        var joinAction = "kick"     // kick | ban
        var minServers = 2
        init() {}
        enum CodingKeys: String, CodingKey {
            case enabled, channels, window, action
            case timeoutMinutes = "timeout_minutes"
            case joinCheck = "join_check"
            case joinAction = "join_action"
            case minServers = "min_servers"
        }
        init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            enabled = (try? c.decode(Bool.self, forKey: .enabled)) ?? false
            channels = (try? c.decode(Int.self, forKey: .channels)) ?? 3
            window = (try? c.decode(Int.self, forKey: .window)) ?? 10
            action = (try? c.decode(String.self, forKey: .action)) ?? "ban"
            timeoutMinutes = (try? c.decode(Int.self, forKey: .timeoutMinutes)) ?? 60
            joinCheck = (try? c.decode(Bool.self, forKey: .joinCheck)) ?? false
            joinAction = (try? c.decode(String.self, forKey: .joinAction)) ?? "kick"
            minServers = (try? c.decode(Int.self, forKey: .minServers)) ?? 2
        }
        func encode(to encoder: Encoder) throws {}
    }

    /// Raid / compromised-account defense thresholds.
    struct Raid: Codable, Equatable {
        var enabled = false
        var threshold = 5
        var window = 10
        var timeoutMinutes = 60
        init() {}
        enum CodingKeys: String, CodingKey { case enabled, threshold, window; case timeoutMinutes = "timeout_minutes" }
        init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            enabled = (try? c.decode(Bool.self, forKey: .enabled)) ?? false
            threshold = (try? c.decode(Int.self, forKey: .threshold)) ?? 5
            window = (try? c.decode(Int.self, forKey: .window)) ?? 10
            timeoutMinutes = (try? c.decode(Int.self, forKey: .timeoutMinutes)) ?? 60
        }
        func encode(to encoder: Encoder) throws {}
    }

    struct Protect: Codable, Equatable {
        var all = false, nsfw = false, nitro = false, malware = false, invite = false
        var youtube = false, google = false, gif = false, twitch = false, steam = false, bit = false

        var activeCount: Int {
            [all, nsfw, nitro, malware, invite, youtube, google, gif, twitch, steam, bit]
                .filter { $0 }.count
        }
    }

    struct Channels: Codable, Equatable {
        var channel: [String] = []
        var category: [String] = []
        var member: [String] = []
        var role: [String] = []

        init() {}

        enum CodingKeys: String, CodingKey { case channel, category, member, role }

        init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            channel  = Channels.ids(c, .channel)
            category = Channels.ids(c, .category)
            member   = Channels.ids(c, .member)
            role     = Channels.ids(c, .role)
        }

        func encode(to encoder: Encoder) throws {}

        /// Coerce a whitelist field to [String], tolerating legacy shapes
        /// (single value, numbers, 0/empty). Mirrors the bot's `get_safe_list`,
        /// so a non-array value never wipes the rest of the whitelist.
        private static func ids(_ c: KeyedDecodingContainer<CodingKeys>, _ key: CodingKeys) -> [String] {
            if let arr = try? c.decode([String].self, forKey: key) { return arr }
            if let arr = try? c.decode([Int].self, forKey: key) { return arr.map(String.init) }
            if let s = try? c.decode(String.self, forKey: key) { return (s.isEmpty || s == "0") ? [] : [s] }
            if let n = try? c.decode(Int.self, forKey: key) { return n == 0 ? [] : [String(n)] }
            return []
        }
    }

    struct LinkConfig: Codable, Equatable {
        var links: [String] = []
        var allow: [String] = []   // trusted domains that bypass blocking
        init() {}
        enum CodingKeys: String, CodingKey { case links, allow }
        init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            links = (try? c.decode([String].self, forKey: .links)) ?? []
            allow = (try? c.decode([String].self, forKey: .allow)) ?? []
        }
        func encode(to encoder: Encoder) throws {}
    }

    struct LogConfig: Codable, Equatable {
        var activated = false
        var logChannel: String = ""
        var onlylink = false

        enum CodingKeys: String, CodingKey {
            case activated = "Activated"
            case logChannel = "log-channel"
            case onlylink
        }
        init() {}
        init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            activated = (try? c.decode(Bool.self, forKey: .activated)) ?? false
            onlylink = (try? c.decode(Bool.self, forKey: .onlylink)) ?? false
            // log-channel may arrive as a number or string.
            if let n = try? c.decode(Int.self, forKey: .logChannel) {
                logChannel = n == 0 ? "" : String(n)
            } else {
                logChannel = (try? c.decode(String.self, forKey: .logChannel)) ?? ""
            }
        }
        func encode(to encoder: Encoder) throws {}
    }
}

/// Scam Shield network stats (mobile /guild/{id}/scamshield-stats).
struct ScamShieldStats: Codable, Equatable {
    var flaggedTotal = 0
    var flaggedWeek = 0
    var guildCatches = 0
}

/// `warn` mixes fixed config keys (kick/ban/timeout) with one entry per warned
/// user. We split them apart at decode time.
struct WarnConfig: Codable, Equatable {
    var kick = 0
    var ban = 0
    var timeoutWarnings = 0
    var timeoutMinutes = 0
    var warnedUsers: [WarnedUser] = []

    init() {}

    private struct DynamicKey: CodingKey {
        var stringValue: String; var intValue: Int? = nil
        init(stringValue: String) { self.stringValue = stringValue }
        init?(intValue: Int) { return nil }
    }
    private struct Timeout: Decodable { let warnings: Int?; let time: Int? }
    private struct RawWarn: Decodable { let Warn: Int?; let reason: [String]? }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: DynamicKey.self)
        for key in c.allKeys {
            switch key.stringValue {
            case "kick": kick = (try? c.decode(Int.self, forKey: key)) ?? 0
            case "ban":  ban  = (try? c.decode(Int.self, forKey: key)) ?? 0
            case "timeout":
                if let t = try? c.decode(Timeout.self, forKey: key) {
                    timeoutWarnings = t.warnings ?? 0
                    timeoutMinutes = t.time ?? 0
                }
            default:
                if let raw = try? c.decode(RawWarn.self, forKey: key), let w = raw.Warn, w > 0 {
                    warnedUsers.append(WarnedUser(id: key.stringValue, warns: w, reasons: raw.reason ?? []))
                }
            }
        }
        warnedUsers.sort { $0.warns > $1.warns }
    }

    func encode(to encoder: Encoder) throws {}
}

struct WarnedUser: Identifiable, Equatable {
    let id: String
    let warns: Int
    let reasons: [String]
    var lastReason: String? { reasons.last }
}

/// Result of a remote moderation action. `escalated` is set when a manual warn
/// crossed a kick/ban/timeout threshold and the bot acted automatically.
struct ModerationResult: Decodable {
    let ok: Bool
    let action: String
    let warnCount: Int?
    let escalated: String?
    let escalationError: String?
}

/// A delegated dashboard team member (extra access beyond owner/Manage Server).
struct DashboardEditor: Codable, Equatable, Identifiable {
    let id: String
    let username: String?
    let avatar: String?
    var displayName: String { username ?? "Unknown user" }
    var avatarURL: URL? {
        guard let avatar else { return nil }
        let ext = avatar.hasPrefix("a_") ? "gif" : "png"
        return URL(string: "\(AppConfig.Discord.cdnBase)/avatars/\(id)/\(avatar).\(ext)?size=64")
    }
}

/// One channel's rule override. `mode` is "default" (follow server), "off"
/// (ignore the channel) or "custom" (only the listed blockers apply here).
/// Encodable so it can be sent as the PUT body to the override endpoint.
struct ChannelOverride: Codable, Equatable {
    var mode: String = "default"
    var protect: [String: Bool] = [:]
    var silent: Bool? = nil

    init(mode: String = "default", protect: [String: Bool] = [:], silent: Bool? = nil) {
        self.mode = mode; self.protect = protect; self.silent = silent
    }

    enum CodingKeys: String, CodingKey { case mode, protect, silent }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        mode = (try? c.decode(String.self, forKey: .mode)) ?? "default"
        protect = (try? c.decode([String: Bool].self, forKey: .protect)) ?? [:]
        silent = try? c.decode(Bool.self, forKey: .silent)
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(mode, forKey: .mode)
        try c.encode(protect, forKey: .protect)
        try c.encodeIfPresent(silent, forKey: .silent)
    }
}

// MARK: - Stats / activity

struct GuildStats: Codable, Equatable {
    let totalWarnings: Int
    let warnedUsers: Int
    let kickThreshold: Int
    let banThreshold: Int
    let topWarned: [TopWarned]

    struct TopWarned: Codable, Equatable, Identifiable {
        let userId: String
        let warnings: Int
        let reasons: [String]
        var id: String { userId }
    }
}

struct ModerationAction: Codable, Equatable, Identifiable {
    let userId: String
    let username: String
    let channelId: String
    let action: String
    let reason: String
    let warnCount: Int
    let timestamp: Int

    enum CodingKeys: String, CodingKey {
        case userId = "user_id"
        case username
        case channelId = "channel_id"
        case action, reason
        case warnCount = "warn_count"
        case timestamp
    }

    var id: String { "\(userId)-\(timestamp)-\(action)" }

    var kindColor: Color {
        switch action {
        case "banned": return Theme.red
        case "kicked": return Theme.red
        case "timeout": return Theme.purple
        default: return Theme.yellow
        }
    }
    var kindLabel: String { action.capitalized }

    var relativeTime: String {
        let s = Int(Date().timeIntervalSince1970) - timestamp
        if s < 60 { return "\(max(s, 0))s ago" }
        if s < 3600 { return "\(s / 60)m ago" }
        if s < 86400 { return "\(s / 3600)h ago" }
        return "\(s / 86400)d ago"
    }
}

// MARK: - Settings audit log

struct AuditEntry: Codable, Equatable, Identifiable {
    let userId: String
    let username: String?
    let path: String
    let description: String
    let timestamp: Int

    var id: String { "\(timestamp)-\(path)-\(userId)" }
    var actor: String { username ?? "User …\(userId.suffix(4))" }
    var relativeTime: String { relativeTimestamp(timestamp) }
}

// MARK: - Discord pickers (channels / roles / members)

struct DiscordChannel: Codable, Equatable, Identifiable {
    let id: String
    let name: String
    let type: Int
    let position: Int
    let parentId: String?
    enum CodingKeys: String, CodingKey { case id, name, type, position; case parentId = "parent_id" }
    var isCategory: Bool { type == 4 }
}

struct DiscordRole: Codable, Equatable, Identifiable {
    let id: String
    let name: String
    let color: Int
    let position: Int
    var swiftColor: Color { color == 0 ? Theme.muted : Color(hex: UInt32(color)) }
}

struct DiscordMember: Codable, Equatable, Identifiable {
    let id: String
    let username: String
    let avatar: String?
    let nick: String?
    var displayName: String { nick ?? username }
}

// MARK: - Admin panel

/// Shared visual treatment for a moderation action string.
enum ActionStyle {
    static func color(_ action: String) -> Color {
        switch action {
        case "banned": return Theme.red
        case "kicked": return Theme.red
        case "timeout": return Theme.purple
        default: return Theme.yellow
        }
    }
    static func icon(_ action: String) -> String {
        switch action {
        case "banned", "kicked": return "nosign"
        case "timeout": return "clock.fill"
        default: return "exclamationmark.triangle.fill"
        }
    }
    static func label(_ action: String) -> String { action.capitalized }
}

func relativeTimestamp(_ ts: Int) -> String {
    let s = Int(Date().timeIntervalSince1970) - ts
    if s < 60 { return "\(max(s, 0))s ago" }
    if s < 3600 { return "\(s / 60)m ago" }
    if s < 86400 { return "\(s / 3600)h ago" }
    return "\(s / 86400)d ago"
}

/// One page of the admin server list (server-side paginated).
struct AdminGuildsPage: Decodable {
    let guilds: [AdminGuild]
    let total: Int
    let hasMore: Bool
}

struct AdminGuild: Codable, Equatable, Hashable, Identifiable {
    let id: String
    let name: String?
    let icon: String?

    var displayName: String { name ?? id }
    var iconURL: URL? {
        guard let icon else { return nil }
        let ext = icon.hasPrefix("a_") ? "gif" : "png"
        return URL(string: "\(AppConfig.Discord.cdnBase)/icons/\(id)/\(icon).\(ext)?size=128")
    }
}

/// One row of the global live feed. The server resolves the guild name/icon
/// inline so the app never has to load the full server list.
struct GlobalAction: Codable, Equatable, Identifiable {
    let guildId: Int
    let userId: String
    let username: String
    let channelId: String
    let action: String
    let reason: String
    let warnCount: Int
    let timestamp: Int
    let guildName: String?
    let guildIcon: String?

    enum CodingKeys: String, CodingKey {
        case guildId = "guild_id"
        case userId = "user_id"
        case username
        case channelId = "channel_id"
        case action, reason
        case warnCount = "warn_count"
        case timestamp
        case guildName = "guild_name"
        case guildIcon = "guild_icon"
    }

    var id: String { "\(userId)-\(timestamp)-\(action)" }
    var guildIdString: String { String(guildId) }
    var guildLabel: String { guildName ?? guildIdString }
    var relativeTime: String { relativeTimestamp(timestamp) }
    var guildIconURL: URL? { discordIconURL(guildId: guildIdString, icon: guildIcon) }
}

/// Discord guild-icon CDN URL, or nil for the default.
func discordIconURL(guildId: String, icon: String?) -> URL? {
    guard let icon else { return nil }
    let ext = icon.hasPrefix("a_") ? "gif" : "png"
    return URL(string: "\(AppConfig.Discord.cdnBase)/icons/\(guildId)/\(icon).\(ext)?size=64")
}

struct AdminUserDetail: Codable, Equatable {
    let userId: String
    let discord: DiscordProfile?
    let actions: [UserActionEntry]
    let guildWarns: [String: GuildWarn]
    let guildInfo: [String: GuildBrief]

    enum CodingKeys: String, CodingKey {
        case userId = "user_id"
        case discord, actions
        case guildWarns = "guild_warns"
        case guildInfo = "guild_info"
    }

    /// Counts per action type, for the summary tiles.
    func count(_ action: String) -> Int { actions.filter { $0.action == action }.count }

    func guildName(_ gid: String) -> String { guildInfo[gid]?.name ?? gid }
    func guildIconURL(_ gid: String) -> URL? { discordIconURL(guildId: gid, icon: guildInfo[gid]?.icon) }

    struct GuildBrief: Codable, Equatable {
        let name: String?
        let icon: String?
    }

    struct DiscordProfile: Codable, Equatable {
        let id: String
        let username: String?
        let globalName: String?
        let avatar: String?
        let discriminator: String?

        enum CodingKeys: String, CodingKey {
            case id, username, avatar, discriminator
            case globalName = "global_name"
        }
        var displayName: String { globalName ?? username ?? id }
        var avatarURL: URL? {
            guard let avatar else { return nil }
            let ext = avatar.hasPrefix("a_") ? "gif" : "png"
            return URL(string: "\(AppConfig.Discord.cdnBase)/avatars/\(id)/\(avatar).\(ext)?size=128")
        }
    }

    struct UserActionEntry: Codable, Equatable, Identifiable {
        let guildId: Int
        let action: String
        let reason: String
        let warnCount: Int
        let timestamp: Int

        enum CodingKeys: String, CodingKey {
            case guildId = "guild_id"
            case action, reason
            case warnCount = "warn_count"
            case timestamp
        }
        var id: String { "\(guildId)-\(timestamp)-\(action)" }
        var guildIdString: String { String(guildId) }
        var relativeTime: String { relativeTimestamp(timestamp) }
    }

    struct GuildWarn: Codable, Equatable {
        let count: Int
        let reasons: [String]
    }
}

// MARK: - User reports

struct Report: Codable, Equatable, Identifiable {
    let id: Int
    let userId: String
    let username: String?
    let guildId: String?
    let type: String
    let url: String?
    let category: String?
    let message: String?
    let status: String
    let createdAt: Int

    var relativeTime: String { relativeTimestamp(createdAt) }
    var typeLabel: String {
        switch type {
        case "malicious_link": return "Malicious link"
        case "false_positive": return "False positive"
        case "bug": return "Bug"
        default: return "Feedback"
        }
    }
    var typeColor: Color {
        switch type {
        case "malicious_link": return Theme.red
        case "false_positive": return Theme.yellow
        case "bug": return Theme.purple
        default: return Theme.blurple
        }
    }
    var statusColor: Color {
        switch status {
        case "resolved": return Theme.green
        case "reviewed": return Theme.blurple
        case "dismissed": return Theme.dim
        default: return Theme.yellow
        }
    }
}

struct ReportsPage: Decodable {
    let reports: [Report]
    let counts: [String: Int]
}

// MARK: - Bot status & trends

struct BotStatus: Codable, Equatable {
    let botOnline: Bool
    let lastHeartbeat: Int
}

struct TrendData: Codable, Equatable {
    let days: Int
    let total: Int
    let perDay: [DayCount]
    let topReasons: [ReasonCount]

    struct DayCount: Codable, Equatable, Identifiable {
        let date: String   // "yyyy-MM-dd"
        let count: Int
        var id: String { date }
        /// Short weekday/day label for the x-axis, e.g. "Mon".
        var label: String {
            let f = DateFormatter(); f.dateFormat = "yyyy-MM-dd"
            guard let d = f.date(from: date) else { return date }
            let out = DateFormatter(); out.dateFormat = "EE"
            return out.string(from: d)
        }
    }

    struct ReasonCount: Codable, Equatable, Identifiable {
        let reason: String
        let count: Int
        var id: String { reason }
    }
}
