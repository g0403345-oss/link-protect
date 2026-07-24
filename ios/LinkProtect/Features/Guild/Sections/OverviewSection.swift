import SwiftUI

struct OverviewSection: View {
    @ObservedObject var vm: GuildConfigViewModel
    @EnvironmentObject private var push: PushManager
    @State private var lockdownConfirm = false
    @State private var lockdownBusy = false

    private var data: ServerData { vm.data ?? ServerData() }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            SectionHeader(title: "Overview",
                          subtitle: "Quick summary of your server's protection status",
                          systemImage: "shield.fill")

            HStack(spacing: 10) {
                StatCard(label: "Warnings", value: numeric(vm.stats?.totalWarnings),
                         systemImage: "exclamationmark.triangle.fill", color: Theme.yellow)
                StatCard(label: "Users warned", value: numeric(vm.stats?.warnedUsers),
                         systemImage: "person.2.fill", color: Theme.blurple)
                StatCard(label: "Blockers", value: "\(data.protect.activeCount)",
                         systemImage: "shield.fill", color: Theme.green)
            }

            lockdownCard

            DiscordCard("Active Protections") {
                let tags = activeTags
                if tags.isEmpty && !data.silent {
                    Text("No blockers active").font(LPFont.caption).foregroundStyle(Theme.dim)
                } else {
                    FlowLayout(spacing: 6) {
                        ForEach(tags, id: \.self) { tag in
                            Pill(text: tag, systemImage: "checkmark.circle.fill", color: Theme.green)
                        }
                        if data.silent {
                            Pill(text: "silent", systemImage: "eye.slash.fill", color: Theme.muted)
                        }
                    }
                }
            }

            DiscordCard("Warning Thresholds") {
                HStack {
                    threshold("Kick at", data.warn.kick, Theme.yellow)
                    Divider().frame(height: 40).overlay(Theme.border)
                    threshold("Ban at", data.warn.ban, Theme.red)
                    Divider().frame(height: 40).overlay(Theme.border)
                    threshold("Timeout at", data.warn.timeoutWarnings, Theme.blurple)
                }
                .frame(maxWidth: .infinity)
            }

            DiscordCard("Notifications") {
                ToggleRow(
                    label: "Alerts for this server",
                    description: "Push you when a rule triggers or settings change here.",
                    isOn: Binding(
                        get: { !push.isMuted(vm.guildId) },
                        set: { push.setMuted(vm.guildId, !$0) }
                    )
                )
            }
        }
    }

    // MARK: Emergency lockdown

    @ViewBuilder
    private var lockdownCard: some View {
        let active = vm.lockdown?.active ?? false
        DiscordCard("Emergency Lockdown") {
            VStack(alignment: .leading, spacing: 10) {
                if active {
                    HStack(spacing: 8) {
                        Image(systemName: "light.beacon.max.fill").foregroundStyle(Theme.red)
                        Text("Server frozen\(vm.lockdown?.by.map { " · by \($0)" } ?? "")")
                            .font(LPFont.label).foregroundStyle(Theme.red)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    Text("Slowmode on \(vm.lockdown?.channelsLimited ?? 0) channels, invites paused, all links blocked.\(vm.lockdown?.reason.map { " Reason: \($0)" } ?? "")")
                        .font(LPFont.caption).fontWeight(.regular).foregroundStyle(Theme.dim)
                        .fixedSize(horizontal: false, vertical: true)
                } else {
                    // fixedSize(h:false) forces wrapping — without it this long
                    // Text inflated its ideal width and made the whole overview
                    // tab scroll horizontally.
                    Text("Raid in progress? One tap freezes the server: 30s slowmode everywhere, invites paused, every link blocked. Lifting it restores everything.")
                        .font(LPFont.caption).fontWeight(.regular).foregroundStyle(Theme.dim)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Button {
                    if active {
                        Task { await toggleLockdown(false) }
                    } else {
                        lockdownConfirm = true
                    }
                } label: {
                    HStack(spacing: 7) {
                        if lockdownBusy { Spinner(size: 13) }
                        else { Image(systemName: active ? "lock.open.fill" : "exclamationmark.shield.fill") }
                        Text(lockdownBusy ? (active ? "Restoring…" : "Freezing server…")
                             : (active ? "Lift lockdown" : "Activate lockdown"))
                    }
                    .font(LPFont.label)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 11)
                    .foregroundStyle(active ? Theme.bg : Color.white)
                    .background(active ? Theme.green : Theme.red)
                    .clipShape(RoundedRectangle(cornerRadius: 9))
                }
                .buttonStyle(PressScaleStyle())
                .disabled(lockdownBusy)
            }
        }
        .task { await vm.loadLockdown() }
        .confirmationDialog("Freeze the whole server?", isPresented: $lockdownConfirm, titleVisibility: .visible) {
            Button("Activate lockdown", role: .destructive) { Task { await toggleLockdown(true) } }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("30s slowmode on every channel, invites paused, all links blocked — until you lift it.")
        }
    }

    private func toggleLockdown(_ active: Bool) async {
        lockdownBusy = true
        await vm.setLockdown(active: active, reason: nil)
        lockdownBusy = false
    }

    private func threshold(_ label: String, _ value: Int, _ color: Color) -> some View {
        VStack(spacing: 4) {
            Text("\(value)").font(.system(size: 28, weight: .semibold)).foregroundStyle(Theme.text)
            Text(label).font(.system(size: 12)).foregroundStyle(Theme.faint)
        }
        .frame(maxWidth: .infinity)
    }

    private var activeTags: [String] {
        let p = data.protect
        let pairs: [(Bool, String)] = [
            (p.all, "all"), (p.nsfw, "nsfw"), (p.nitro, "nitro"), (p.malware, "malware"),
            (p.invite, "invite"), (p.youtube, "youtube"), (p.google, "google"),
            (p.gif, "gif"), (p.twitch, "twitch"), (p.steam, "steam"), (p.bit, "bit"),
        ]
        return pairs.filter(\.0).map(\.1)
    }

    private func numeric(_ value: Int?) -> String { value.map(String.init) ?? "—" }
}
