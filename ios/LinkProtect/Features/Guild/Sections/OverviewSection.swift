import SwiftUI

struct OverviewSection: View {
    @ObservedObject var vm: GuildConfigViewModel
    @EnvironmentObject private var push: PushManager

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
