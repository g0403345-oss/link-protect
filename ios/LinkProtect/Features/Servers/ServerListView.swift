import SwiftUI
import UIKit

/// Home after sign-in: a clean title, optional search, and a grouped list of the
/// servers you manage. Quiet and legible — no decoration competing with content.
struct ServerListView: View {
    let user: DiscordUser
    @EnvironmentObject private var auth: AuthStore
    @EnvironmentObject private var toasts: ToastCenter
    @EnvironmentObject private var lock: AppLock
    @EnvironmentObject private var push: PushManager
    @StateObject private var vm: ServerListViewModel
    @State private var showSettings = false
    @State private var showAdmin = false
    @State private var search = ""
    @State private var path = NavigationPath()
    @State private var setupGuild: ManagedGuild?

    init(user: DiscordUser, api: APIClient) {
        self.user = user
        _vm = StateObject(wrappedValue: ServerListViewModel(api: api))
    }

    var body: some View {
        NavigationStack(path: $path) {
            ZStack {
                AppBackgroundView()
                ScrollView {
                    VStack(alignment: .leading, spacing: 20) {
                        header
                        content
                    }
                    .padding(.horizontal, 20)
                    .padding(.top, 12)
                    .padding(.bottom, 36)
                }
                .refreshable { await vm.load() }
            }
            .toolbar(.hidden, for: .navigationBar)
            .navigationDestination(for: ManagedGuild.self) { GuildConfigView(guild: $0, api: auth.api) }
        }
        .onChange(of: push.openGuildId) { gid in
            guard let gid else { return }
            let guild = loadedGuild(gid) ?? ManagedGuild(id: gid, name: gid, icon: nil, owner: false,
                                                         botPresent: true, activeProtections: 0, warnedUsers: 0)
            path.append(guild)
            push.openGuildId = nil
        }
        .sheet(isPresented: $showSettings) { SettingsView(user: user).environmentObject(lock) }
        .sheet(isPresented: $showAdmin) { AdminView(user: user, api: auth.api).environmentObject(toasts).environmentObject(push) }
        .sheet(item: $setupGuild) { guild in
            QuickSetupSheet(guild: guild, api: auth.api) { Task { await vm.load() } }
        }
        .task { await vm.load(initial: true) }
    }

    // MARK: Header

    private var header: some View {
        HStack(alignment: .firstTextBaseline) {
            VStack(alignment: .leading, spacing: 3) {
                Text("Servers").font(.system(size: 30, weight: .bold)).foregroundStyle(Theme.text)
                if case .loaded(let g) = vm.phase {
                    Text("\(g.count) \(g.count == 1 ? "server" : "servers")")
                        .font(.system(size: 14)).foregroundStyle(Theme.faint)
                }
            }
            Spacer(minLength: 0)
            HStack(spacing: 10) {
                if user.isAdmin {
                    iconButton("shield.lefthalf.filled") { showAdmin = true }
                }
                Button { showSettings = true } label: {
                    GuildIcon(name: user.displayName, url: user.avatarURL, size: 38)
                        .clipShape(Circle())
                        .overlay(Circle().strokeBorder(Theme.border, lineWidth: 1))
                }
                .buttonStyle(PressScaleStyle())
            }
        }
    }

    private func iconButton(_ symbol: String, _ action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: symbol)
                .font(.system(size: 15, weight: .medium))
                .foregroundStyle(Theme.muted)
                .frame(width: 38, height: 38)
                .cardSurface(Theme.Radius.md, fill: Theme.surface)
        }
        .buttonStyle(PressScaleStyle())
    }

    private func loadedGuild(_ id: String) -> ManagedGuild? {
        if case .loaded(let gs) = vm.phase { return gs.first { $0.id == id } }
        return nil
    }

    // MARK: Content

    @ViewBuilder
    private var content: some View {
        switch vm.phase {
        case .loading:
            HStack { Spacer(); Spinner().padding(.top, 100); Spacer() }
        case .failed(let message):
            ErrorState(message: message) { Task { await vm.load(initial: true) } }.padding(.top, 40)
        case .empty:
            EmptyServersState().padding(.top, 24)
        case .loaded(let guilds):
            loaded(guilds)
        }
    }

    @ViewBuilder
    private func loaded(_ guilds: [ManagedGuild]) -> some View {
        let filtered = search.isEmpty ? guilds
            : guilds.filter { $0.name.localizedCaseInsensitiveContains(search) }
        let present = filtered.filter(\.botPresent)
        let absent = filtered.filter { !$0.botPresent }

        if guilds.count >= 6 {
            SearchField(text: $search, placeholder: "Search servers")
        }

        // Freshly invited servers with zero protections → offer one-tap setup.
        let unprotected = present.filter { $0.activeProtections == 0 }
        if !unprotected.isEmpty && search.isEmpty {
            quickSetupBanner(unprotected)
        }

        if filtered.isEmpty {
            Text("No servers match “\(search)”.")
                .font(.system(size: 14)).foregroundStyle(Theme.faint)
                .padding(.top, 24).frame(maxWidth: .infinity)
        } else {
            if !present.isEmpty {
                groupLabel("MANAGED")
                groupedCard(present) { guild in
                    NavigationLink(value: guild) { ServerRow(guild: guild) }
                        .buttonStyle(RowButtonStyle())
                        .contextMenu {
                            if guild.activeProtections == 0 {
                                Button { setupGuild = guild } label: {
                                    Label("Quick setup", systemImage: "bolt.shield")
                                }
                            }
                            Button {
                                push.setMuted(guild.id, !push.isMuted(guild.id))
                            } label: {
                                Label(push.isMuted(guild.id) ? "Unmute notifications" : "Mute notifications",
                                      systemImage: push.isMuted(guild.id) ? "bell" : "bell.slash")
                            }
                        }
                }
            }
            if !absent.isEmpty {
                groupLabel("BOT NOT ADDED")
                    .padding(.top, present.isEmpty ? 0 : 6)
                groupedCard(absent) { guild in
                    InviteRow(guild: guild)
                }
            }
        }
    }

    /// One banner per unprotected server (max 3) — tap opens the setup sheet.
    @ViewBuilder
    private func quickSetupBanner(_ guilds: [ManagedGuild]) -> some View {
        VStack(spacing: 8) {
            ForEach(guilds.prefix(3)) { guild in
                Button { setupGuild = guild } label: {
                    HStack(spacing: 12) {
                        Image(systemName: "bolt.shield.fill")
                            .font(.system(size: 18)).foregroundStyle(Theme.yellow)
                        VStack(alignment: .leading, spacing: 2) {
                            Text("\(guild.name) isn't protected yet")
                                .font(LPFont.bodyStrong).foregroundStyle(Theme.text).lineLimit(1)
                            Text("Set up recommended protection in one tap")
                                .font(LPFont.tiny).fontWeight(.regular).foregroundStyle(Theme.dim)
                        }
                        Spacer(minLength: 0)
                        Text("Set up").font(LPFont.label).foregroundStyle(.white)
                            .padding(.horizontal, 14).padding(.vertical, 7)
                            .background(Theme.blurple).clipShape(Capsule())
                    }
                    .padding(12)
                    .background(Theme.yellow.opacity(0.07))
                    .overlay(RoundedRectangle(cornerRadius: 12).stroke(Theme.yellow.opacity(0.3), lineWidth: 1))
                    .clipShape(RoundedRectangle(cornerRadius: 12))
                }
                .buttonStyle(PressScaleStyle())
            }
        }
    }

    private func groupLabel(_ text: String) -> some View {
        Text(LocalizedStringKey(text)).font(.system(size: 11, weight: .semibold)).tracking(0.8)
            .foregroundStyle(Theme.faint)
            .padding(.leading, 4)
    }

    @ViewBuilder
    private func groupedCard<T: Identifiable, Row: View>(_ items: [T], @ViewBuilder row: @escaping (T) -> Row) -> some View {
        VStack(spacing: 0) {
            ForEach(Array(items.enumerated()), id: \.element.id) { index, item in
                row(item)
                if index < items.count - 1 {
                    Rectangle().fill(Theme.border).frame(height: 1).padding(.leading, 66)
                }
            }
        }
        .cardSurface()
    }
}

/// List-row press feedback: a faint surface wash, no scale.
struct RowButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .background(configuration.isPressed ? Theme.surface : .clear)
            .animation(.easeOut(duration: 0.12), value: configuration.isPressed)
    }
}

private struct ServerRow: View {
    let guild: ManagedGuild

    var body: some View {
        HStack(spacing: 13) {
            GuildIcon(name: guild.name, url: guild.iconURL, size: 40)
                .overlay(RoundedRectangle(cornerRadius: 40 * 0.3, style: .continuous).strokeBorder(Theme.border, lineWidth: 1))

            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 6) {
                    Text(guild.name).font(.system(size: 16, weight: .semibold)).foregroundStyle(Theme.text).lineLimit(1)
                    if guild.owner {
                        Image(systemName: "crown.fill").font(.system(size: 9)).foregroundStyle(Theme.yellow)
                    }
                }
                meta
            }

            Spacer(minLength: 0)
            Image(systemName: "chevron.right").font(.system(size: 13, weight: .semibold)).foregroundStyle(Theme.dim)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 13)
        .contentShape(Rectangle())
    }

    private var meta: some View {
        Text("\(guild.activeProtections) blockers · \(guild.warnedUsers) warned")
            .font(.system(size: 13)).foregroundStyle(Theme.faint)
    }
}

/// A server the user manages but the bot isn't in yet — offers a one-tap invite.
private struct InviteRow: View {
    let guild: ManagedGuild
    var body: some View {
        HStack(spacing: 13) {
            GuildIcon(name: guild.name, url: guild.iconURL, size: 40)
                .overlay(RoundedRectangle(cornerRadius: 40 * 0.3, style: .continuous).strokeBorder(Theme.border, lineWidth: 1))
                .opacity(0.75)
            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 6) {
                    Text(guild.name).font(.system(size: 16, weight: .semibold)).foregroundStyle(Theme.text).lineLimit(1)
                    if guild.owner {
                        Image(systemName: "crown.fill").font(.system(size: 9)).foregroundStyle(Theme.yellow)
                    }
                }
                Text("Not protected yet").font(.system(size: 13)).foregroundStyle(Theme.faint)
            }
            Spacer(minLength: 0)
            Button { UIApplication.shared.open(guild.inviteURL) } label: {
                HStack(spacing: 5) {
                    Image(systemName: "plus").font(.system(size: 12, weight: .bold))
                    Text("Add").font(.system(size: 13, weight: .semibold))
                }
                .foregroundStyle(.white)
                .padding(.horizontal, 13).padding(.vertical, 7)
                .background(Theme.blurple, in: Capsule())
            }
            .buttonStyle(PressScaleStyle())
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 13)
        .contentShape(Rectangle())
    }
}

// MARK: - States

private struct EmptyServersState: View {
    var body: some View {
        VStack(spacing: 14) {
            Image(systemName: "shield.lefthalf.filled").font(.system(size: 34, weight: .regular)).foregroundStyle(Theme.faint)
            Text("No servers yet").font(.system(size: 18, weight: .semibold)).foregroundStyle(Theme.text)
            Text("You need the “Manage Server” permission on a server that has the Link Protect bot. Invite it, then pull to refresh.")
                .font(.system(size: 14)).foregroundStyle(Theme.faint).multilineTextAlignment(.center)
            PrimaryButton(title: "Invite the bot", systemImage: "plus", fill: false) {
                UIApplication.shared.open(URL(string: "https://discord.com/oauth2/authorize?client_id=\(AppConfig.Discord.clientID)&permissions=1376537111638&scope=bot")!)
            }
            .padding(.top, 4)
        }
        .padding(32)
        .frame(maxWidth: .infinity)
        .cardSurface()
    }
}

struct ErrorState: View {
    let message: String
    let retry: () -> Void
    var body: some View {
        VStack(spacing: 14) {
            Image(systemName: "exclamationmark.triangle").font(.system(size: 30, weight: .regular)).foregroundStyle(Theme.faint)
            Text(message).font(.system(size: 14)).foregroundStyle(Theme.muted).multilineTextAlignment(.center)
            SecondaryButton(title: "Try again", systemImage: "arrow.clockwise", action: retry)
        }
        .padding(32)
        .frame(maxWidth: .infinity)
        .cardSurface()
    }
}
