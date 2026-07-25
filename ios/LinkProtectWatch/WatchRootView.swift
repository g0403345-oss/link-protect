import SwiftUI

/// Watch app — four vertically paged tabs, fed live from the iPhone over
/// WatchConnectivity (see WatchSync): Status, Servers (with remote lockdown,
/// relayed through the phone), Activity feed and Vote streak.
struct WatchRootView: View {
    @EnvironmentObject private var sync: WatchSync
    private var snap: LPWidgetSnapshot { sync.snapshot }

    var body: some View {
        if !snap.signedIn {
            VStack(spacing: 10) {
                Image(systemName: "iphone").font(.system(size: 28)).foregroundStyle(.blue)
                Text("Open Link Protect on your iPhone to sign in.")
                    .font(.system(size: 13)).multilineTextAlignment(.center)
            }
            .padding()
        } else {
            TabView {
                WatchStatusView(snap: snap)
                WatchServersView(snap: snap)
                WatchActivityView(snap: snap)
                WatchVoteView(snap: snap)
            }
            .tabViewStyle(.page)
        }
    }
}

// MARK: - Status

struct WatchStatusView: View {
    let snap: LPWidgetSnapshot

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 10) {
                    HStack(spacing: 8) {
                        Image(systemName: snap.botOnline ? "checkmark.shield.fill" : "exclamationmark.shield.fill")
                            .foregroundStyle(snap.botOnline ? .green : .red)
                            .font(.system(size: 22))
                        VStack(alignment: .leading, spacing: 1) {
                            Text(snap.botOnline ? "Protection active" : "Bot offline")
                                .font(.system(size: 15, weight: .semibold))
                            Text("\(snap.serverCount) server\(snap.serverCount == 1 ? "" : "s")")
                                .font(.system(size: 12)).foregroundStyle(.secondary)
                        }
                        Spacer(minLength: 0)
                    }
                    .padding(12)
                    .background(.quaternary.opacity(0.5), in: RoundedRectangle(cornerRadius: 12))

                    HStack(spacing: 8) {
                        stat("shield.fill", .green, snap.totalBlockers, "Blockers")
                        stat("exclamationmark.triangle.fill", .yellow, snap.totalWarned, "Warned")
                    }
                    HStack(spacing: 8) {
                        stat("exclamationmark.shield.fill", .red, snap.scamCatches ?? 0, "Scams")
                        stat("flame.fill", .orange, snap.vote?.streak ?? 0, "Streak")
                    }
                }
                .padding(.horizontal, 4)
            }
            .navigationTitle("Link Protect")
        }
    }

    private func stat(_ icon: String, _ color: Color, _ value: Int, _ label: String) -> some View {
        VStack(spacing: 3) {
            Image(systemName: icon).foregroundStyle(color).font(.system(size: 14))
            Text("\(value)").font(.system(size: 19, weight: .bold))
            Text(label).font(.system(size: 10)).foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 10)
        .background(.quaternary.opacity(0.5), in: RoundedRectangle(cornerRadius: 12))
    }
}

// MARK: - Servers (+ remote lockdown)

struct WatchServersView: View {
    let snap: LPWidgetSnapshot

    var body: some View {
        NavigationStack {
            Group {
                if snap.servers.isEmpty {
                    Text("No protected servers yet.")
                        .font(.system(size: 13)).foregroundStyle(.secondary)
                        .multilineTextAlignment(.center).padding()
                } else {
                    List(snap.servers) { s in
                        NavigationLink(value: s.id) {
                            VStack(alignment: .leading, spacing: 3) {
                                Text(s.name).font(.system(size: 15, weight: .medium)).lineLimit(1)
                                HStack(spacing: 10) {
                                    Label("\(s.blockers)", systemImage: "shield.fill").foregroundStyle(.green)
                                    Label("\(s.warned)", systemImage: "exclamationmark.triangle.fill").foregroundStyle(.yellow)
                                    if let c = s.catches, c > 0 {
                                        Label("\(c)", systemImage: "exclamationmark.shield.fill").foregroundStyle(.red)
                                    }
                                }
                                .font(.system(size: 11))
                            }
                            .padding(.vertical, 2)
                        }
                    }
                    .navigationDestination(for: String.self) { gid in
                        if let server = snap.servers.first(where: { $0.id == gid }) {
                            WatchServerDetailView(server: server)
                        }
                    }
                }
            }
            .navigationTitle("Servers")
        }
    }
}

struct WatchServerDetailView: View {
    let server: LPWidgetSnapshot.Server
    @EnvironmentObject private var sync: WatchSync
    @State private var lockdownActive: Bool?   // nil = unknown / loading
    @State private var busy = false
    @State private var unreachable = false
    @State private var confirmLockdown = false

    var body: some View {
        ScrollView {
            VStack(spacing: 10) {
                HStack(spacing: 8) {
                    statChip("shield.fill", .green, server.blockers, "Blockers")
                    statChip("exclamationmark.triangle.fill", .yellow, server.warned, "Warned")
                    statChip("exclamationmark.shield.fill", .red, server.catches ?? 0, "Scams")
                }

                // Emergency lockdown — relayed through the iPhone (the watch
                // holds no tokens). Needs the phone reachable.
                if let active = lockdownActive {
                    Button {
                        if active { Task { await setLockdown(false) } }
                        else { confirmLockdown = true }
                    } label: {
                        HStack(spacing: 6) {
                            if busy { ProgressView().controlSize(.small) }
                            else { Image(systemName: active ? "lock.open.fill" : "light.beacon.max.fill") }
                            Text(busy ? "Working…" : (active ? "Lift lockdown" : "Lockdown"))
                                .font(.system(size: 14, weight: .semibold))
                        }
                        .frame(maxWidth: .infinity)
                    }
                    .tint(active ? .green : .red)
                    .buttonStyle(.borderedProminent)
                    .disabled(busy)
                    if active {
                        Text("Server is frozen — slowmode, invites paused, links blocked.")
                            .font(.system(size: 11)).foregroundStyle(.secondary)
                            .multilineTextAlignment(.center)
                    }
                } else if unreachable {
                    VStack(spacing: 4) {
                        Image(systemName: "iphone.slash").foregroundStyle(.secondary)
                        Text("iPhone not reachable — lockdown needs your phone nearby.")
                            .font(.system(size: 11)).foregroundStyle(.secondary)
                            .multilineTextAlignment(.center)
                    }
                    .padding(.top, 4)
                } else {
                    ProgressView().controlSize(.small).padding(.top, 4)
                }
            }
            .padding(.horizontal, 4)
        }
        .navigationTitle(server.name)
        .task { await loadStatus() }
        .confirmationDialog("Freeze \(server.name)?", isPresented: $confirmLockdown, titleVisibility: .visible) {
            Button("Activate lockdown", role: .destructive) { Task { await setLockdown(true) } }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("Slowmode everywhere, invites paused, all links blocked — until you lift it.")
        }
    }

    private func statChip(_ icon: String, _ color: Color, _ value: Int, _ label: String) -> some View {
        VStack(spacing: 2) {
            Image(systemName: icon).foregroundStyle(color).font(.system(size: 12))
            Text("\(value)").font(.system(size: 15, weight: .bold))
            Text(label).font(.system(size: 9)).foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 8)
        .background(.quaternary.opacity(0.5), in: RoundedRectangle(cornerRadius: 10))
    }

    private func loadStatus() async {
        let reply = await sync.sendCommand(["cmd": "lockdown_status", "guild": server.id])
        if let reply, reply["ok"] as? Bool == true {
            lockdownActive = reply["active"] as? Bool ?? false
        } else {
            unreachable = true
        }
    }

    private func setLockdown(_ active: Bool) async {
        busy = true
        let reply = await sync.sendCommand(["cmd": "lockdown_set", "guild": server.id, "active": active])
        if let reply, reply["ok"] as? Bool == true {
            lockdownActive = active
        } else {
            unreachable = true
            lockdownActive = nil
        }
        busy = false
    }
}

// MARK: - Activity

struct WatchActivityView: View {
    let snap: LPWidgetSnapshot

    private func color(for action: String) -> Color {
        switch action {
        case "banned": return .red
        case "kicked": return .orange
        case "timeout": return .purple
        default: return .yellow
        }
    }

    private func rel(_ ts: Int) -> String {
        let s = Int(Date().timeIntervalSince1970) - ts
        if s < 60 { return "now" }
        if s < 3600 { return "\(s / 60)m" }
        if s < 86400 { return "\(s / 3600)h" }
        return "\(s / 86400)d"
    }

    var body: some View {
        NavigationStack {
            Group {
                if let actions = snap.recentActions, !actions.isEmpty {
                    List(actions) { a in
                        VStack(alignment: .leading, spacing: 2) {
                            HStack(spacing: 5) {
                                Circle().fill(color(for: a.action)).frame(width: 6, height: 6)
                                Text(a.username).font(.system(size: 13, weight: .semibold)).lineLimit(1)
                                Spacer(minLength: 0)
                                Text(rel(a.ts)).font(.system(size: 10)).foregroundStyle(.secondary)
                            }
                            Text("\(a.action.capitalized)\(a.guildName.map { " · \($0)" } ?? "")")
                                .font(.system(size: 11)).foregroundStyle(.secondary).lineLimit(1)
                            if let reason = a.reason, !reason.isEmpty {
                                Text(reason).font(.system(size: 10)).foregroundStyle(.tertiary).lineLimit(2)
                            }
                        }
                        .padding(.vertical, 1)
                    }
                } else {
                    VStack(spacing: 6) {
                        Image(systemName: "checkmark.circle").foregroundStyle(.green)
                        Text("No recent moderation actions.")
                            .font(.system(size: 12)).foregroundStyle(.secondary)
                            .multilineTextAlignment(.center)
                    }
                    .padding()
                }
            }
            .navigationTitle("Activity")
        }
    }
}

// MARK: - Vote

struct WatchVoteView: View {
    let snap: LPWidgetSnapshot

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 10) {
                    if let vote = snap.vote {
                        VStack(spacing: 2) {
                            Text("🔥").font(.system(size: 34))
                            Text("\(vote.streak)-day streak")
                                .font(.system(size: 16, weight: .bold))
                            Text(vote.streak > 0 ? "Vote daily on your iPhone to keep it alive!" : "Vote on your iPhone to start a streak!")
                                .font(.system(size: 11)).foregroundStyle(.secondary)
                                .multilineTextAlignment(.center)
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 12)
                        .background(.orange.opacity(0.15), in: RoundedRectangle(cornerRadius: 12))

                        HStack(spacing: 8) {
                            voteStat("\(vote.monthly)", "This month")
                            voteStat("\(vote.total)", "All time")
                        }
                        if let rank = vote.rank {
                            HStack(spacing: 6) {
                                Text(rank == 1 ? "🥇" : rank == 2 ? "🥈" : rank == 3 ? "🥉" : "🏆")
                                Text("#\(rank) on the leaderboard")
                                    .font(.system(size: 13, weight: .semibold))
                            }
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 10)
                            .background(.yellow.opacity(0.15), in: RoundedRectangle(cornerRadius: 12))
                        }
                    } else {
                        Text("Vote status syncs from your iPhone.")
                            .font(.system(size: 12)).foregroundStyle(.secondary)
                            .multilineTextAlignment(.center).padding()
                    }
                }
                .padding(.horizontal, 4)
            }
            .navigationTitle("Votes")
        }
    }

    private func voteStat(_ value: String, _ label: String) -> some View {
        VStack(spacing: 2) {
            Text(value).font(.system(size: 18, weight: .bold))
            Text(label).font(.system(size: 10)).foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 10)
        .background(.quaternary.opacity(0.5), in: RoundedRectangle(cornerRadius: 12))
    }
}
