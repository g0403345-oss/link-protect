import SwiftUI

/// Per-channel rule overrides. Each channel can follow the server settings,
/// be turned off entirely, or run its own custom set of blockers. Mirrors the
/// website's "Channel Rules" tab and the bot's /channel-* commands.
struct ChannelRulesSection: View {
    @ObservedObject var vm: GuildConfigViewModel
    @State private var showAdd = false

    private var overrides: [String: ChannelOverride] { vm.data?.overrides ?? [:] }

    /// Blocker keys + labels (mirrors BlockersSection / cogs.shared.PROTECT_KEYS).
    private static let blockers: [(key: String, label: String)] = [
        ("all", "All Links"), ("nsfw", "NSFW"), ("nitro", "Nitro Scams"),
        ("malware", "Malware / Phishing"), ("invite", "Discord Invites"),
        ("youtube", "YouTube"), ("google", "Google"), ("gif", "GIFs"),
        ("twitch", "Twitch"), ("steam", "Steam"), ("bit", "Shorteners (bit.ly)"),
    ]

    private var ruledIds: [String] {
        overrides.keys.sorted {
            channelName($0).localizedCaseInsensitiveCompare(channelName($1)) == .orderedAscending
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            SectionHeader(title: "Channel Rules",
                          subtitle: "Make individual channels behave differently from the rest of the server",
                          systemImage: "number.square")

            InfoBox("Every channel follows your server settings by default. Override one to turn Link Protect off there (e.g. a #links channel), or give it custom blockers — independent of the server.")

            Button { showAdd = true } label: {
                Label("Add a channel rule", systemImage: "plus")
                    .font(LPFont.label).foregroundStyle(Theme.blurple)
            }
            .buttonStyle(.plain)

            if ruledIds.isEmpty {
                DiscordCard {
                    VStack(spacing: 8) {
                        Image(systemName: "number.square").font(.system(size: 26)).foregroundStyle(Theme.faint)
                        Text("No channel rules yet — every channel follows the server settings.")
                            .font(LPFont.caption).foregroundStyle(Theme.dim).multilineTextAlignment(.center)
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 12)
                }
            } else {
                ForEach(ruledIds, id: \.self) { cid in
                    ruleCard(cid)
                }
            }
        }
        .task { await vm.loadChannels() }
        .sheet(isPresented: $showAdd) {
            AddPickerSheet(vm: vm, type: .channel, color: Theme.blurple, selected: ruledIds) { id in
                Task { await vm.setOverride(channelId: id, ChannelOverride(mode: "off")) }
            }
        }
    }

    private func channelName(_ id: String) -> String {
        vm.channels?.first { $0.id == id }.map { "#\($0.name)" } ?? "#\(id.suffix(4))"
    }

    @ViewBuilder
    private func ruleCard(_ cid: String) -> some View {
        let ov = overrides[cid] ?? ChannelOverride()
        DiscordCard {
            VStack(alignment: .leading, spacing: 14) {
                HStack(spacing: 8) {
                    Image(systemName: "number").foregroundStyle(Theme.blurple)
                    Text(channelName(cid)).font(LPFont.bodyStrong).foregroundStyle(Theme.text).lineLimit(1)
                    Spacer(minLength: 0)
                    if vm.savingPath == "override.\(cid)" { Spinner(size: 14) }
                    Button {
                        Task { await vm.setOverride(channelId: cid, ChannelOverride(mode: "default")) }
                    } label: {
                        Label("Remove", systemImage: "xmark").font(LPFont.tiny).foregroundStyle(Theme.dim)
                    }
                    .buttonStyle(.plain)
                }

                Picker("", selection: modeBinding(cid)) {
                    Text("Server").tag("default")
                    Text("Off").tag("off")
                    Text("Custom").tag("custom")
                }
                .pickerStyle(.segmented)

                Text(LocalizedStringKey(modeHint(ov.mode))).font(LPFont.tiny).foregroundStyle(Theme.dim)
                    .fixedSize(horizontal: false, vertical: true)

                if ov.mode == "custom" {
                    Rectangle().fill(Theme.border).frame(height: 1)
                    Text("Only the blockers switched on here apply in this channel — server settings are ignored.")
                        .font(LPFont.tiny).foregroundStyle(Theme.faint)
                        .fixedSize(horizontal: false, vertical: true)
                    VStack(spacing: 0) {
                        ForEach(Self.blockers, id: \.key) { b in
                            ToggleRow(label: b.label, description: "",
                                      isOn: blockerBinding(cid, key: b.key))
                        }
                    }
                }
            }
        }
    }

    private func modeHint(_ mode: String) -> String {
        switch mode {
        case "off": return "Link Protect ignores this channel — nothing is blocked and no warnings are given here."
        case "custom": return "This channel uses its own blockers, independent of the server."
        default: return "This channel follows your normal server-wide settings."
        }
    }

    // MARK: Bindings (write through the view model)

    private func modeBinding(_ cid: String) -> Binding<String> {
        Binding(
            get: { vm.data?.overrides[cid]?.mode ?? "default" },
            set: { newMode in
                var next = vm.data?.overrides[cid] ?? ChannelOverride()
                next.mode = newMode
                Task { await vm.setOverride(channelId: cid, next) }
            }
        )
    }

    private func blockerBinding(_ cid: String, key: String) -> Binding<Bool> {
        Binding(
            get: { vm.data?.overrides[cid]?.protect[key] ?? false },
            set: { newVal in
                var next = vm.data?.overrides[cid] ?? ChannelOverride(mode: "custom")
                next.mode = "custom"
                next.protect[key] = newVal
                Task { await vm.setOverride(channelId: cid, next) }
            }
        )
    }
}
