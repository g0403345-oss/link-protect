import SwiftUI

/// In-app super-admin panel — every server the bot is in, a global live feed,
/// and per-user detail. Mirrors the website's `/dashboard/admin`.
struct AdminView: View {
    let user: DiscordUser
    let api: APIClient
    @Environment(\.dismiss) private var dismiss
    @StateObject private var vm: AdminViewModel
    @State private var tab: Tab = .servers
    @State private var search = ""
    @Namespace private var segNS
    @State private var ticker = Timer.publish(every: 5, on: .main, in: .common).autoconnect()

    enum Tab: String, CaseIterable { case servers = "Servers", feed = "Activity", reports = "Reports" }

    init(user: DiscordUser, api: APIClient) {
        self.user = user
        self.api = api
        _vm = StateObject(wrappedValue: AdminViewModel(api: api))
    }

    var body: some View {
        NavigationStack {
            ZStack {
                AppBackgroundView()
                VStack(spacing: 16) {
                    lockCommandsCard
                    segmented
                    Group {
                        switch tab {
                        case .servers: serversTab
                        case .feed: feedTab
                        case .reports: AdminReportsView(vm: vm)
                        }
                    }
                }
                .padding(.horizontal, 20)
                .padding(.top, 8)
            }
            .navigationTitle("Admin")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) { Button("Done") { dismiss() }.tint(Theme.muted) }
            }
            .navigationDestination(for: ManagedGuild.self) { GuildConfigView(guild: $0, api: api) }
            .navigationDestination(for: AdminUserRef.self) { ref in
                AdminUserDetailView(ref: ref, api: api)
            }
        }
        .task { await vm.load(); await vm.loadConfig() }
    }

    // MARK: Global config

    private var lockCommandsCard: some View {
        DiscordCard {
            ToggleRow(
                label: "Redirect settings commands",
                description: "When on, Discord settings commands stop working and point users to the dashboard & app. Moderation commands keep working.",
                isOn: Binding(get: { vm.lockCommands },
                              set: { v in Task { await vm.setLockCommands(v) } }),
                saving: vm.lockSaving
            )
        }
    }

    // MARK: Segmented control

    private var segmented: some View {
        HStack(spacing: 0) {
            ForEach(Tab.allCases, id: \.self) { t in
                let active = t == tab
                Button { withAnimation(.easeOut(duration: 0.2)) { tab = t } } label: {
                    Text(LocalizedStringKey(t.rawValue))
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(active ? Theme.text : Theme.faint)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 8)
                        .background {
                            if active {
                                RoundedRectangle(cornerRadius: 9, style: .continuous)
                                    .fill(Theme.surface2)
                                    .matchedGeometryEffect(id: "seg", in: segNS)
                            }
                        }
                }
                .buttonStyle(.plain)
            }
        }
        .padding(4)
        .cardSurface(13, fill: Theme.surface)
    }

    // MARK: Servers

    @ViewBuilder
    private var serversTab: some View {
        switch vm.phase {
        case .loading:
            Spacer(); Spinner(); Spacer()
        case .failed(let m):
            Spacer(); ErrorState(message: m) { Task { await vm.load() } }; Spacer()
        case .ready:
            VStack(spacing: 14) {
                SearchField(text: $search, placeholder: "Search by name or ID")
                    .onChange(of: search) { q in Task { await vm.search(q) } }
                ScrollView {
                    HStack {
                        Text("\(vm.total) server\(vm.total == 1 ? "" : "s")")
                            .font(.system(size: 13)).foregroundStyle(Theme.faint)
                        Spacer()
                    }
                    .padding(.bottom, 8)

                    if vm.guilds.isEmpty {
                        Text(search.isEmpty ? "No servers." : "No servers match “\(search)”.")
                            .font(.system(size: 14)).foregroundStyle(Theme.faint).padding(.top, 30)
                    } else {
                        VStack(spacing: 0) {
                            ForEach(Array(vm.guilds.enumerated()), id: \.element.id) { i, guild in
                                NavigationLink(value: vm.managedGuild(for: guild.id)) { AdminGuildRow(guild: guild) }
                                    .buttonStyle(RowButtonStyle())
                                    .onAppear { if i == vm.guilds.count - 4 { Task { await vm.loadMore() } } }
                                if i < vm.guilds.count - 1 {
                                    Rectangle().fill(Theme.border).frame(height: 1).padding(.leading, 62)
                                }
                            }
                        }
                        .cardSurface()

                        if vm.loadingMore {
                            Spinner(size: 22).padding(.vertical, 16)
                        } else if !vm.hasMore {
                            Text("All \(vm.total) loaded").font(.system(size: 12)).foregroundStyle(Theme.dim).padding(.vertical, 16)
                        }
                    }
                }
            }
        }
    }

    // MARK: Activity feed

    private var feedTab: some View {
        ScrollView {
            HStack(spacing: 6) {
                Circle().fill(Theme.green).frame(width: 6, height: 6)
                Text(vm.feedLoading ? "Refreshing…" : "\(vm.feed.count) actions · live")
                    .font(.system(size: 13)).foregroundStyle(Theme.faint)
                Spacer()
            }
            .padding(.bottom, 8)

            if vm.feed.isEmpty {
                VStack(spacing: 8) {
                    Image(systemName: "clock.arrow.circlepath").font(.system(size: 28)).foregroundStyle(Theme.dim)
                    Text("No moderation actions yet").font(.system(size: 14)).foregroundStyle(Theme.faint)
                }.frame(maxWidth: .infinity).padding(.top, 70)
            } else {
                VStack(spacing: 0) {
                    ForEach(Array(vm.feed.enumerated()), id: \.element.id) { i, action in
                        NavigationLink(value: AdminUserRef(id: action.userId, username: action.username)) {
                            FeedRow(action: action)
                        }
                        .buttonStyle(RowButtonStyle())
                        if i < vm.feed.count - 1 {
                            Rectangle().fill(Theme.border).frame(height: 1).padding(.leading, 54)
                        }
                    }
                }
                .cardSurface()
            }
        }
        .onReceive(ticker) { _ in if tab == .feed { Task { await vm.refreshFeed() } } }
        .task { await vm.refreshFeed() }
    }
}

// MARK: - Rows

private struct AdminGuildRow: View {
    let guild: AdminGuild
    var body: some View {
        HStack(spacing: 12) {
            GuildIcon(name: guild.displayName, url: guild.iconURL, size: 36)
                .overlay(RoundedRectangle(cornerRadius: 36 * 0.3, style: .continuous).strokeBorder(Theme.border, lineWidth: 1))
            VStack(alignment: .leading, spacing: 2) {
                Text(guild.name ?? "Unknown server")
                    .font(.system(size: 15, weight: .medium))
                    .foregroundStyle(guild.name == nil ? Theme.faint : Theme.text).lineLimit(1)
                Text(guild.id).font(.system(size: 11, design: .monospaced)).foregroundStyle(Theme.dim)
            }
            Spacer(minLength: 0)
            Image(systemName: "chevron.right").font(.system(size: 12, weight: .semibold)).foregroundStyle(Theme.dim)
        }
        .padding(.horizontal, 14).padding(.vertical, 12)
        .contentShape(Rectangle())
    }
}

private struct FeedRow: View {
    let action: GlobalAction
    var body: some View {
        HStack(alignment: .top, spacing: 11) {
            GuildIcon(name: action.guildLabel, url: action.guildIconURL, size: 30)
                .overlay(RoundedRectangle(cornerRadius: 9, style: .continuous).strokeBorder(Theme.border, lineWidth: 1))
            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 6) {
                    Text(action.username).font(.system(size: 14, weight: .medium)).foregroundStyle(Theme.text).lineLimit(1)
                    Circle().fill(ActionStyle.color(action.action)).frame(width: 5, height: 5)
                    Text(ActionStyle.label(action.action)).font(.system(size: 12)).foregroundStyle(Theme.muted)
                }
                Text(action.reason).font(.system(size: 12)).foregroundStyle(Theme.faint).lineLimit(1)
                Text("\(action.guildLabel) · \(action.relativeTime)")
                    .font(.system(size: 11)).foregroundStyle(Theme.dim).lineLimit(1)
            }
            Spacer(minLength: 0)
            Image(systemName: "chevron.right").font(.system(size: 12, weight: .semibold)).foregroundStyle(Theme.dim).padding(.top, 3)
        }
        .padding(.horizontal, 14).padding(.vertical, 12)
        .contentShape(Rectangle())
    }
}

/// Reusable search field — flat surface with a hairline.
struct SearchField: View {
    @Binding var text: String
    var placeholder: String = "Search"
    var body: some View {
        HStack(spacing: 9) {
            Image(systemName: "magnifyingglass").font(.system(size: 14)).foregroundStyle(Theme.faint)
            TextField(placeholder, text: $text)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .font(.system(size: 15))
                .foregroundStyle(Theme.text)
            if !text.isEmpty {
                Button { text = "" } label: { Image(systemName: "xmark.circle.fill").foregroundStyle(Theme.dim) }
                    .buttonStyle(.plain)
            }
        }
        .padding(.horizontal, 13).padding(.vertical, 11)
        .cardSurface(Theme.Radius.md, fill: Theme.surface)
    }
}
