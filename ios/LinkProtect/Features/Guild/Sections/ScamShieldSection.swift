import SwiftUI

/// Scam Shield — cross-channel scam-spam defense + known-scammer join check.
/// Mirrors the website's Scam Shield tab.
struct ScamShieldSection: View {
    @ObservedObject var vm: GuildConfigViewModel
    @State private var stats: ScamShieldStats?

    private var sg: ServerData.ScamGuard { vm.data?.scamguard ?? ServerData.ScamGuard() }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            SectionHeader(title: "Scam Shield",
                          subtitle: "Stops hijacked accounts and scam bots that paste the same scam into every channel",
                          systemImage: "exclamationmark.shield.fill")

            statsRow

            detectionCard

            joinCheckCard
        }
        .task { stats = await vm.scamShieldStats() }
    }

    // MARK: Network stats

    @ViewBuilder
    private var statsRow: some View {
        HStack(spacing: 8) {
            statTile("Flagged", value: stats?.flaggedTotal, color: Theme.red, icon: "globe")
            statTile("New (7d)", value: stats?.flaggedWeek, color: Theme.yellow, icon: "chart.line.uptrend.xyaxis")
            statTile("Caught here", value: stats?.guildCatches, color: Theme.green, icon: "shield.fill")
        }
    }

    private func statTile(_ label: String, value: Int?, color: Color, icon: String) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 5) {
                Image(systemName: icon).font(.system(size: 11)).foregroundStyle(color)
                Text(label).font(LPFont.tiny).foregroundStyle(Theme.dim).lineLimit(1)
            }
            Text(value.map { "\($0)" } ?? "—")
                .font(.system(size: 22, weight: .heavy)).foregroundStyle(color)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .background(Theme.surface)
        .overlay(RoundedRectangle(cornerRadius: 10).stroke(Theme.border, lineWidth: 1))
        .clipShape(RoundedRectangle(cornerRadius: 10))
    }

    // MARK: Spam-blitz detection

    @ViewBuilder
    private var detectionCard: some View {
        DiscordCard("Scam Spam Detection") {
            VStack(alignment: .leading, spacing: 12) {
                ToggleRow(
                    label: "Detect cross-channel scam spam",
                    description: "One account posting the same message (link, image or wall of text) into several channels within seconds — every copy is deleted and the action below is applied",
                    isOn: vm.boolBinding(\.scamguard.enabled, path: "scamguard.enabled", label: "Scam spam detection"),
                    saving: vm.savingPath == "scamguard.enabled"
                )
                if sg.enabled {
                    Rectangle().fill(Theme.border).frame(height: 1)

                    segmentPicker(
                        title: "Action on detection",
                        description: "Messages are always deleted — this decides what happens to the account",
                        options: [("delete", "Delete", Theme.muted), ("timeout", "Timeout", Theme.blurple),
                                  ("kick", "Kick", Theme.yellow), ("ban", "Ban", Theme.red)],
                        value: sg.action, path: "scamguard.action", label: "Scam Shield action"
                    ) { $0.scamguard.action = $1 }

                    NumberStepper(label: "Channels",
                                  description: "Same message in this many different channels",
                                  systemImage: "number.square", color: Theme.red,
                                  value: sg.channels, saving: vm.savingPath == "scamguard.channels") { v in
                        let n = max(2, v)
                        Task { await vm.patch(path: "scamguard.channels", value: n, label: "Scam Shield channels") { $0.scamguard.channels = n } }
                    }
                    NumberStepper(label: "Within (seconds)",
                                  description: "Time window for the spam burst",
                                  systemImage: "clock.fill", color: Theme.yellow,
                                  value: sg.window, saving: vm.savingPath == "scamguard.window") { v in
                        let n = min(300, max(5, v))
                        Task { await vm.patch(path: "scamguard.window", value: n, label: "Scam Shield window") { $0.scamguard.window = n } }
                    }
                    if sg.action == "timeout" {
                        NumberStepper(label: "Timeout (minutes)",
                                      description: "How long the account is muted",
                                      systemImage: "hourglass", color: Theme.blurple,
                                      value: sg.timeoutMinutes, saving: vm.savingPath == "scamguard.timeout_minutes") { v in
                            let n = max(1, v)
                            Task { await vm.patch(path: "scamguard.timeout_minutes", value: n, label: "Scam Shield timeout") { $0.scamguard.timeoutMinutes = n } }
                        }
                    }
                }
                InfoBox("Whitelisted members and roles never trigger this. Every catch lands in the Activity log with the reason, and the account is flagged in the Link Protect network. For kicks/bans the Link Protect role must sit above member roles.")
            }
        }
    }

    // MARK: Known-scammer join check

    @ViewBuilder
    private var joinCheckCard: some View {
        DiscordCard("Known Scammer Check") {
            VStack(alignment: .leading, spacing: 12) {
                ToggleRow(
                    label: "Remove known scam accounts",
                    description: "Accounts Link Protect already caught scam-spamming on other servers are removed the moment they join (or first post here)",
                    isOn: vm.boolBinding(\.scamguard.joinCheck, path: "scamguard.join_check", label: "Known scammer check"),
                    saving: vm.savingPath == "scamguard.join_check"
                )
                if sg.joinCheck {
                    Rectangle().fill(Theme.border).frame(height: 1)

                    segmentPicker(
                        title: "Action on join",
                        description: "What happens to a known scam account",
                        options: [("kick", "Kick", Theme.yellow), ("ban", "Ban", Theme.red)],
                        value: sg.joinAction, path: "scamguard.join_action", label: "Join action"
                    ) { $0.scamguard.joinAction = $1 }

                    NumberStepper(label: "Caught on at least (servers)",
                                  description: "Higher = safer against false positives",
                                  systemImage: "globe", color: Theme.blurple,
                                  value: sg.minServers, saving: vm.savingPath == "scamguard.min_servers") { v in
                        let n = max(1, v)
                        Task { await vm.patch(path: "scamguard.min_servers", value: n, label: "Minimum servers") { $0.scamguard.minServers = n } }
                    }
                }
                InfoBox("Flags only come from Link Protect catching the behaviour live — never from reports or keywords. Only the account ID is stored. Owners, admins and whitelisted members are never auto-removed; every removal is logged with the full reason.")
            }
        }
    }

    // MARK: Small segmented picker

    @ViewBuilder
    private func segmentPicker(title: String, description: String,
                               options: [(String, String, Color)],
                               value: String, path: String, label: String,
                               apply: @escaping (inout ServerData, String) -> Void) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title).font(LPFont.label).foregroundStyle(Theme.text)
            Text(description).font(LPFont.tiny).fontWeight(.regular).foregroundStyle(Theme.dim)
            HStack(spacing: 6) {
                ForEach(options, id: \.0) { id, name, color in
                    let active = value == id
                    Button {
                        guard !active else { return }
                        Task { await vm.patch(path: path, value: id, label: label) { apply(&$0, id) } }
                    } label: {
                        Text(name)
                            .font(LPFont.label)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 9)
                            .foregroundStyle(active ? color : Theme.dim)
                            .background(active ? color.opacity(0.15) : Theme.surface)
                            .overlay(RoundedRectangle(cornerRadius: 8)
                                .stroke(active ? color.opacity(0.5) : Theme.border, lineWidth: 1))
                            .clipShape(RoundedRectangle(cornerRadius: 8))
                    }
                    .buttonStyle(PressScaleStyle())
                    .disabled(vm.savingPath == path)
                }
            }
            .padding(.top, 2)
        }
    }
}
