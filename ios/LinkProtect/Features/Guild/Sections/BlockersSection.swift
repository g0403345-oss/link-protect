import SwiftUI

struct BlockersSection: View {
    @ObservedObject var vm: GuildConfigViewModel

    private struct Blocker: Identifiable {
        let id: String
        let keyPath: WritableKeyPath<ServerData, Bool>
        let label: String
        let description: String
    }

    private let blockers: [Blocker] = [
        .init(id: "all",     keyPath: \.protect.all,     label: "Block All Links",     description: "Block every external link (overrides all others)"),
        .init(id: "nsfw",    keyPath: \.protect.nsfw,    label: "NSFW Content",        description: "Block known adult / NSFW websites"),
        .init(id: "nitro",   keyPath: \.protect.nitro,   label: "Nitro Scams",         description: "Block fake Discord Nitro scam links"),
        .init(id: "malware", keyPath: \.protect.malware, label: "Malware / Phishing",  description: "Block known malware and phishing URLs"),
        .init(id: "invite",  keyPath: \.protect.invite,  label: "Discord Invites",     description: "Block discord.gg invite links"),
        .init(id: "youtube", keyPath: \.protect.youtube, label: "YouTube",             description: "Block youtube.com and youtu.be links"),
        .init(id: "google",  keyPath: \.protect.google,  label: "Google",              description: "Block google.com links"),
        .init(id: "gif",     keyPath: \.protect.gif,     label: "GIFs",                description: "Block GIF links (tenor, giphy, …)"),
        .init(id: "twitch",  keyPath: \.protect.twitch,  label: "Twitch",              description: "Block twitch.tv links"),
        .init(id: "steam",   keyPath: \.protect.steam,   label: "Steam",               description: "Block Steam community and store links"),
        .init(id: "bit",     keyPath: \.protect.bit,     label: "bit.ly & shorteners", description: "Block URL shortener links"),
    ]

    private var raid: ServerData.Raid { vm.data?.raid ?? ServerData.Raid() }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            SectionHeader(title: "Link Blockers",
                          subtitle: "Toggle which types of links are blocked in your server",
                          systemImage: "exclamationmark.triangle.fill")

            DiscordCard("Quick Setup") {
                VStack(alignment: .leading, spacing: 10) {
                    Text("Apply a preset, then fine-tune below.")
                        .font(.system(size: 13)).foregroundStyle(Theme.faint)
                    HStack(spacing: 8) {
                        ForEach(ProtectionPreset.allCases) { preset in
                            Button { Task { await vm.applyPreset(preset) } } label: {
                                VStack(spacing: 6) {
                                    Image(systemName: preset.icon).font(.system(size: 16, weight: .medium)).foregroundStyle(Theme.blurple)
                                    Text(preset.title).font(.system(size: 13, weight: .semibold)).foregroundStyle(Theme.text)
                                    Text(preset.subtitle).font(.system(size: 10)).foregroundStyle(Theme.dim)
                                        .multilineTextAlignment(.center).lineLimit(2).fixedSize(horizontal: false, vertical: true)
                                }
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 12).padding(.horizontal, 6)
                                .cardSurface(Theme.Radius.md, fill: Theme.surface)
                            }
                            .buttonStyle(PressScaleStyle())
                            .disabled(vm.savingPath == "preset")
                        }
                    }
                    .opacity(vm.savingPath == "preset" ? 0.5 : 1)
                    .overlay {
                        if vm.savingPath == "preset" { Spinner(size: 22) }
                    }
                }
            }

            DiscordCard("Platform Blockers") {
                VStack(spacing: 0) {
                    ForEach(Array(blockers.enumerated()), id: \.element.id) { index, blocker in
                        let path = "protect.\(blocker.id)"
                        ToggleRow(
                            label: blocker.label,
                            description: blocker.description,
                            isOn: vm.boolBinding(blocker.keyPath, path: path, label: blocker.label),
                            saving: vm.savingPath == path
                        )
                        if index < blockers.count - 1 {
                            Divider().overlay(Theme.border)
                        }
                    }
                }
            }

            DiscordCard("Silent Mode") {
                ToggleRow(
                    label: "Silent Mode",
                    description: "Delete links without a public warning — the user gets a DM instead",
                    isOn: vm.boolBinding(\.silent, path: "silent", label: "Silent mode"),
                    saving: vm.savingPath == "silent"
                )
                if vm.data?.silent == true {
                    InfoBox("Links are deleted silently. Users receive a private DM. Warnings are still tracked internally.")
                        .padding(.top, 12)
                }
            }

            DiscordCard("Raid Protection") {
                VStack(alignment: .leading, spacing: 12) {
                    ToggleRow(
                        label: "Auto-defend against raids",
                        description: "If many members post the same link within seconds (hijacked accounts / raids), delete them and time out the accounts automatically.",
                        isOn: vm.boolBinding(\.raid.enabled, path: "raid.enabled", label: "Raid protection"),
                        saving: vm.savingPath == "raid.enabled"
                    )
                    if raid.enabled {
                        Rectangle().fill(Theme.border).frame(height: 1)
                        NumberStepper(label: "Trigger at",
                                      description: "Distinct members posting the same link",
                                      systemImage: "person.3.fill", color: Theme.red,
                                      value: raid.threshold, saving: vm.savingPath == "raid.threshold") { v in
                            let n = max(2, v)
                            Task { await vm.patch(path: "raid.threshold", value: n, label: "Raid threshold") { $0.raid.threshold = n } }
                        }
                        NumberStepper(label: "Within (seconds)",
                                      description: "Time window for the burst",
                                      systemImage: "clock.fill", color: Theme.yellow,
                                      value: raid.window, saving: vm.savingPath == "raid.window") { v in
                            let n = max(2, v)
                            Task { await vm.patch(path: "raid.window", value: n, label: "Raid window") { $0.raid.window = n } }
                        }
                        NumberStepper(label: "Timeout (minutes)",
                                      description: "How long offenders are muted",
                                      systemImage: "hourglass", color: Theme.blurple,
                                      value: raid.timeoutMinutes, saving: vm.savingPath == "raid.timeout_minutes") { v in
                            let n = max(1, v)
                            Task { await vm.patch(path: "raid.timeout_minutes", value: n, label: "Raid timeout") { $0.raid.timeoutMinutes = n } }
                        }
                    }
                    InfoBox("Trusted (allowlisted) domains and whitelisted members never trigger this. Give Link Protect the Moderate Members permission so timeouts work.")
                }
            }
        }
    }
}

/// Blurple-tinted informational callout (matches the dashboard's info boxes).
struct InfoBox: View {
    let text: LocalizedStringKey
    init(_ text: LocalizedStringKey) { self.text = text }
    var body: some View {
        HStack(alignment: .top, spacing: 8) {
            Image(systemName: "info.circle.fill")
                .font(.system(size: 12))
                .foregroundStyle(Theme.blurple)
            Text(text).font(LPFont.caption).foregroundStyle(Theme.faint)
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 12).padding(.vertical, 10)
        .background(Theme.blurple.opacity(0.06))
        .overlay(RoundedRectangle(cornerRadius: 8).stroke(Theme.blurple.opacity(0.15), lineWidth: 1))
        .clipShape(RoundedRectangle(cornerRadius: 8))
    }
}
