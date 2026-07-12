import Foundation

/// Built-in sample data for the App Store reviewer demo. When the reviewer taps
/// "Explore demo" on the login screen, the app runs entirely on this data —
/// no Discord login, no network — so the full configuration panel is always
/// reachable regardless of OAuth/2FA. The real product uses Discord sign-in.
enum DemoData {

    static let user = DiscordUser(
        id: "000000000000000001", username: "appreview", globalName: "App Reviewer", avatar: nil
    )

    static let guilds: [ManagedGuild] = [
        ManagedGuild(id: "100000000000000001", name: "Link Protect Demo", icon: nil,
                     owner: true, botPresent: true, activeProtections: 6, warnedUsers: 3),
        ManagedGuild(id: "100000000000000002", name: "Community Hub", icon: nil,
                     owner: false, botPresent: true, activeProtections: 4, warnedUsers: 1),
        ManagedGuild(id: "100000000000000003", name: "Gaming Lounge", icon: nil,
                     owner: true, botPresent: false, activeProtections: 0, warnedUsers: 0),
    ]

    static func serverData() -> ServerData {
        var d = ServerData()
        d.protect.nsfw = true; d.protect.malware = true; d.protect.nitro = true
        d.protect.invite = true; d.protect.bit = true; d.protect.gif = true
        d.silent = false
        d.warn.kick = 3; d.warn.ban = 5; d.warn.timeoutWarnings = 2; d.warn.timeoutMinutes = 10
        d.warn.warnedUsers = [
            WarnedUser(id: "200000000000000011", warns: 2, reasons: ["Posted a phishing link", "Discord invite spam"]),
            WarnedUser(id: "200000000000000013", warns: 2, reasons: ["Known malware URL", "Fake Nitro scam"]),
            WarnedUser(id: "200000000000000012", warns: 1, reasons: ["NSFW link removed"]),
        ]
        d.link.links = ["grabify.link", "free-nitro.gift", "discord-airdrop.com"]
        d.channel.channel = ["300000000000000001"]
        d.channel.role = ["400000000000000001"]
        d.log.activated = true
        d.log.logChannel = "300000000000000009"
        d.scamguard.enabled = true
        d.scamguard.joinCheck = true
        return d
    }

    static let stats = GuildStats(
        totalWarnings: 18, warnedUsers: 3, kickThreshold: 3, banThreshold: 5,
        topWarned: [
            .init(userId: "200000000000000013", warnings: 2, reasons: ["Known malware URL"]),
            .init(userId: "200000000000000011", warnings: 2, reasons: ["Phishing link"]),
            .init(userId: "200000000000000012", warnings: 1, reasons: ["NSFW link"]),
        ]
    )

    static func actions() -> [ModerationAction] {
        let now = Int(Date().timeIntervalSince1970)
        func a(_ u: String, _ name: String, _ act: String, _ reason: String, _ c: Int, _ ago: Int) -> ModerationAction {
            ModerationAction(userId: u, username: name, channelId: "300000000000000001",
                             action: act, reason: reason, warnCount: c, timestamp: now - ago)
        }
        return [
            a("200000000000000011", "spammer92", "warned", "Phishing link removed", 2, 90),
            a("200000000000000013", "free_nitro", "kicked", "Auto-kick (reached 3 warnings)", 3, 640),
            a("200000000000000012", "newcomer", "warned", "NSFW link removed", 1, 1500),
            a("200000000000000014", "raider", "timeout", "Auto-timeout (reached 2 warnings)", 2, 2400),
            a("200000000000000015", "scambot", "banned", "Auto-ban (reached 5 warnings)", 5, 5400),
        ]
    }

    static func trends() -> TrendData {
        let f = DateFormatter(); f.dateFormat = "yyyy-MM-dd"
        let cal = Calendar.current
        let counts = [2, 0, 1, 3, 1, 0, 4, 2, 1, 5, 2, 0, 3, 2]
        var per: [TrendData.DayCount] = []
        for i in 0..<counts.count {
            let date = cal.date(byAdding: .day, value: -(counts.count - 1 - i), to: Date()) ?? Date()
            per.append(.init(date: f.string(from: date), count: counts[i]))
        }
        return TrendData(days: counts.count, total: counts.reduce(0, +), perDay: per, topReasons: [
            .init(reason: "Phishing / malware", count: 9),
            .init(reason: "Discord invite spam", count: 6),
            .init(reason: "NSFW content", count: 4),
        ])
    }

    static let channels: [DiscordChannel] = [
        .init(id: "300000000000000001", name: "general", type: 0, position: 0, parentId: nil),
        .init(id: "300000000000000002", name: "memes", type: 0, position: 1, parentId: nil),
        .init(id: "300000000000000003", name: "Moderation", type: 4, position: 2, parentId: nil),
    ]
    static let roles: [DiscordRole] = [
        .init(id: "400000000000000001", name: "Moderator", color: 0x5865F2, position: 5),
        .init(id: "400000000000000002", name: "Member", color: 0x3FB950, position: 2),
    ]
    static let members: [DiscordMember] = [
        .init(id: "200000000000000011", username: "spammer92", avatar: nil, nick: nil),
        .init(id: "200000000000000012", username: "newcomer", avatar: nil, nick: "New User"),
        .init(id: "200000000000000016", username: "trusted_mod", avatar: nil, nick: "Trusted Mod"),
    ]
    static let status = BotStatus(botOnline: true, lastHeartbeat: Int(Date().timeIntervalSince1970))
}
