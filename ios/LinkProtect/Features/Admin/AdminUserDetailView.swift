import SwiftUI

/// Full picture of one user across every server: Discord profile, action
/// summary, per-server breakdown and complete history. Pushed from the live feed.
struct AdminUserDetailView: View {
    let ref: AdminUserRef
    let api: APIClient

    @State private var detail: AdminUserDetail?
    @State private var loading = true
    @State private var failed = false

    var body: some View {
        ZStack {
            AppBackgroundView()
            if loading {
                Spinner()
            } else if let detail {
                ScrollView {
                    VStack(spacing: 16) {
                        profile(detail)
                        summary(detail)
                        breakdown(detail)
                        history(detail)
                    }
                    .padding(16)
                }
            } else {
                ErrorState(message: "Couldn't load this user.") { Task { await load() } }
                    .padding(16)
            }
        }
        .navigationTitle(ref.username)
        .navigationBarTitleDisplayMode(.inline)
        .toolbarBackground(.hidden, for: .navigationBar)
        .task { await load() }
    }

    private func load() async {
        loading = true; failed = false
        do { detail = try await api.adminUser(ref.id) }
        catch { failed = true }
        loading = false
    }

    // MARK: Profile

    private func profile(_ d: AdminUserDetail) -> some View {
        let name = d.discord?.displayName ?? ref.username
        return HStack(spacing: 14) {
            UserAvatar(url: d.discord?.avatarURL, seed: d.userId, initial: name.first.map(String.init) ?? "?", size: 60)
            VStack(alignment: .leading, spacing: 3) {
                Text(name).font(.system(size: 18, weight: .bold)).foregroundStyle(.white).lineLimit(1)
                if let u = d.discord?.username, d.discord?.globalName != nil {
                    Text("@\(u)").font(LPFont.caption).foregroundStyle(Theme.dim)
                }
                Text(d.userId).font(LPFont.tiny.monospaced()).fontWeight(.regular).foregroundStyle(Theme.dim)
            }
            Spacer(minLength: 0)
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .glassSurface(cornerRadius: 18)
    }

    // MARK: Summary tiles

    private func summary(_ d: AdminUserDetail) -> some View {
        HStack(spacing: 10) {
            tile(d.count("warned"), "Warned", "exclamationmark.triangle.fill", Theme.yellow)
            tile(d.count("timeout"), "Timeout", "clock.fill", Theme.purple)
            tile(d.count("kicked"), "Kicked", "nosign", Theme.red)
            tile(d.count("banned"), "Banned", "hammer.fill", Theme.red)
        }
    }

    private func tile(_ value: Int, _ label: String, _ icon: String, _ color: Color) -> some View {
        VStack(spacing: 5) {
            Image(systemName: icon).font(.system(size: 13, weight: .semibold)).foregroundStyle(color)
            Text("\(value)").font(.system(size: 18, weight: .black)).foregroundStyle(.white)
            Text(label).font(.system(size: 10, weight: .medium)).foregroundStyle(Theme.dim)
        }
        .frame(maxWidth: .infinity).padding(.vertical, 12)
        .elevatedSurface(cornerRadius: 12)
    }

    // MARK: Per-server breakdown

    @ViewBuilder
    private func breakdown(_ d: AdminUserDetail) -> some View {
        let gids: [String] = d.guildWarns.isEmpty
            ? Array(Set(d.actions.map(\.guildIdString))).sorted()
            : Array(d.guildWarns.keys).sorted()
        if !gids.isEmpty {
            DiscordCard("Servers (\(gids.count))") {
                VStack(spacing: 8) {
                    ForEach(gids, id: \.self) { gid in
                        let acts = d.actions.filter { $0.guildIdString == gid }
                        let warn = d.guildWarns[gid]
                        NavigationLink(value: managedGuild(gid, d)) {
                            HStack(spacing: 10) {
                                GuildIcon(name: d.guildName(gid), url: d.guildIconURL(gid), size: 30)
                                VStack(alignment: .leading, spacing: 1) {
                                    Text(d.guildName(gid)).font(.system(size: 13, weight: .semibold))
                                        .foregroundStyle(Theme.text).lineLimit(1)
                                    Text("\(acts.count) action\(acts.count == 1 ? "" : "s")\(acts.first.map { " · last \($0.relativeTime)" } ?? "")")
                                        .font(.system(size: 10)).foregroundStyle(Theme.dim)
                                }
                                Spacer(minLength: 0)
                                if let warn, warn.count > 0 {
                                    Text("\(warn.count) warns").font(.system(size: 11, weight: .bold))
                                        .foregroundStyle(Theme.yellow)
                                        .padding(.horizontal, 8).padding(.vertical, 3)
                                        .background(Theme.yellow.opacity(0.12), in: Capsule())
                                }
                                Image(systemName: "chevron.right").font(.system(size: 11, weight: .bold)).foregroundStyle(Theme.dim)
                            }
                            .padding(10)
                            .background(Theme.surface, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                            .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).strokeBorder(Theme.borderStrong, lineWidth: 1))
                        }
                        .buttonStyle(PressScaleStyle())
                    }
                }
            }
        }
    }

    // MARK: History

    private func history(_ d: AdminUserDetail) -> some View {
        DiscordCard("Action History (\(d.actions.count))") {
            if d.actions.isEmpty {
                Text("No actions recorded").font(LPFont.caption).foregroundStyle(Theme.dim)
                    .frame(maxWidth: .infinity).padding(.vertical, 12)
            } else {
                VStack(spacing: 0) {
                    ForEach(Array(d.actions.enumerated()), id: \.element.id) { i, a in
                        HStack(alignment: .top, spacing: 10) {
                            Text(ActionStyle.label(a.action))
                                .font(.system(size: 10, weight: .heavy)).foregroundStyle(ActionStyle.color(a.action))
                                .padding(.horizontal, 7).padding(.vertical, 3)
                                .background(ActionStyle.color(a.action).opacity(0.14), in: Capsule())
                            VStack(alignment: .leading, spacing: 2) {
                                Text(a.reason).font(LPFont.caption).foregroundStyle(Theme.muted).lineLimit(2)
                                Text("\(d.guildName(a.guildIdString)) · \(a.relativeTime)")
                                    .font(.system(size: 10)).foregroundStyle(Theme.dim)
                            }
                            Spacer(minLength: 0)
                        }
                        .padding(.vertical, 9)
                        if i < d.actions.count - 1 { Rectangle().fill(Color.white.opacity(0.05)).frame(height: 1) }
                    }
                }
            }
        }
    }

    private func managedGuild(_ gid: String, _ d: AdminUserDetail) -> ManagedGuild {
        ManagedGuild(id: gid, name: d.guildName(gid), icon: d.guildInfo[gid]?.icon,
                     owner: false, botPresent: true, activeProtections: 0, warnedUsers: 0)
    }
}

private struct UserAvatar: View {
    let url: URL?
    let seed: String
    let initial: String
    var size: CGFloat = 60

    var body: some View {
        Group {
            if let url {
                AsyncImage(url: url) { $0.resizable().scaledToFill() } placeholder: { fallback }
            } else { fallback }
        }
        .frame(width: size, height: size)
        .clipShape(Circle())
        .overlay(Circle().strokeBorder(.white.opacity(0.12), lineWidth: 1))
    }

    private var fallback: some View {
        ZStack {
            Color(hue: Double((Int(seed.suffix(3)) ?? 0) % 360) / 360.0, saturation: 0.55, brightness: 0.45)
            Text(initial.uppercased()).font(.system(size: size * 0.4, weight: .bold)).foregroundStyle(.white)
        }
    }
}
