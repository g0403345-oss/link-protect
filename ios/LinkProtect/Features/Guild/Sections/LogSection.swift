import SwiftUI

struct LogSection: View {
    @ObservedObject var vm: GuildConfigViewModel
    /// Drives the 5-second auto-refresh while this tab is visible.
    @State private var ticker = Timer.publish(every: 5, on: .main, in: .common).autoconnect()
    @State private var filter: ActionFilter = .all
    @State private var search = ""

    enum ActionFilter: String, CaseIterable, Identifiable {
        case all, warned, kicked, banned, timeout
        var id: String { rawValue }
        var label: String { self == .all ? "All" : rawValue.capitalized }
    }

    private var filtered: [ModerationAction] {
        vm.actions.filter { a in
            (filter == .all || a.action == filter.rawValue) &&
            (search.isEmpty
                || a.username.localizedCaseInsensitiveContains(search)
                || a.reason.localizedCaseInsensitiveContains(search))
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack(alignment: .top) {
                SectionHeader(title: "Activity Log",
                              subtitle: "Live moderation feed — refreshes every 5 seconds",
                              systemImage: "waveform.path.ecg")
                LiveBadge()
            }

            WarnLogCard(vm: vm)

            SearchField(text: $search, placeholder: "Search user or reason")

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(ActionFilter.allCases) { f in
                        let active = f == filter
                        Button { filter = f } label: {
                            Text(LocalizedStringKey(f.label))
                                .font(.system(size: 13, weight: .semibold))
                                .foregroundStyle(active ? .white : Theme.muted)
                                .padding(.horizontal, 13).padding(.vertical, 6)
                                .background(active ? Theme.blurple : Theme.surface, in: Capsule())
                                .overlay(Capsule().strokeBorder(active ? .clear : Theme.border, lineWidth: 1))
                        }
                        .buttonStyle(.plain)
                    }
                }
            }

            DiscordCard(filtered.isEmpty ? "Recent Actions" : "Recent Actions (\(filtered.count))") {
                if filtered.isEmpty {
                    VStack(spacing: 8) {
                        Image(systemName: "waveform.path.ecg").font(.system(size: 26)).foregroundStyle(Theme.surface3)
                        Text(vm.actions.isEmpty ? "No moderation actions yet" : "Nothing matches your filter")
                            .font(LPFont.caption).foregroundStyle(Theme.dim)
                    }
                    .frame(maxWidth: .infinity).padding(.vertical, 20)
                } else {
                    VStack(spacing: 2) {
                        ForEach(filtered) { action in
                            ActionRow(action: action,
                                      channelName: vm.channels?.first { $0.id == action.channelId }.map { "#\($0.name)" })
                        }
                    }
                }
            }
        }
        .onReceive(ticker) { _ in Task { await vm.refreshActions() } }
        .task { await vm.refreshActions() }
        .task { await vm.loadChannels() }
    }
}

private struct ActionRow: View {
    let action: ModerationAction
    var channelName: String? = nil

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            Text(action.kindLabel.uppercased())
                .font(.system(size: 10, weight: .heavy))
                .foregroundStyle(action.kindColor)
                .padding(.horizontal, 7).padding(.vertical, 3)
                .background(action.kindColor.opacity(0.12))
                .clipShape(Capsule())

            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 6) {
                    Text(action.username).font(LPFont.caption).foregroundStyle(Theme.text).lineLimit(1)
                    Text("warn #\(action.warnCount)").font(LPFont.tiny).fontWeight(.regular).foregroundStyle(Theme.dim)
                    Text("·").foregroundStyle(Theme.surface3)
                    Text(channelName ?? "#\(action.channelId.suffix(4))").font(LPFont.tiny.monospaced()).fontWeight(.regular).foregroundStyle(Theme.dim).lineLimit(1)
                }
                Text(action.reason).font(LPFont.tiny).fontWeight(.regular).foregroundStyle(Theme.faint).lineLimit(1)
            }
            Spacer(minLength: 4)
            Text(action.relativeTime).font(LPFont.tiny).fontWeight(.regular).foregroundStyle(Theme.dim)
        }
        .padding(.horizontal, 10).padding(.vertical, 8)
    }
}

/// Warn-Log channel configuration — the app equivalent of `/enable-warn-log`.
/// Pick a channel to have every warning, kick and ban posted there.
private struct WarnLogCard: View {
    @ObservedObject var vm: GuildConfigViewModel
    @State private var showPicker = false

    private var log: ServerData.LogConfig { vm.data?.log ?? ServerData.LogConfig() }
    private var enabled: Bool { !log.logChannel.isEmpty && log.logChannel != "0" }
    private var saving: Bool { vm.savingPath == "log.log-channel" }

    private var channelName: String {
        vm.channels?.first { $0.id == log.logChannel }.map { "#\($0.name)" }
            ?? "#\(log.logChannel.suffix(4))"
    }

    var body: some View {
        DiscordCard("Warn-Log Channel") {
            VStack(alignment: .leading, spacing: 12) {
                Text("Send every warning, kick and ban to a channel.")
                    .font(LPFont.caption).foregroundStyle(Theme.dim)

                HStack(spacing: 10) {
                    Image(systemName: enabled ? "number" : "xmark.circle")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(enabled ? Theme.green : Theme.faint)
                    Text(enabled ? channelName : "Disabled")
                        .font(LPFont.bodyStrong)
                        .foregroundStyle(enabled ? Theme.text : Theme.faint)
                        .lineLimit(1)
                    Spacer(minLength: 8)
                    if saving { Spinner(size: 16) }
                }
                .padding(12)
                .background(Theme.surface)
                .overlay(RoundedRectangle(cornerRadius: 8).stroke(Theme.border, lineWidth: 1))
                .clipShape(RoundedRectangle(cornerRadius: 8))

                HStack(spacing: 16) {
                    Button { showPicker = true } label: {
                        Label(enabled ? "Change channel" : "Choose channel", systemImage: "number")
                            .font(LPFont.label).foregroundStyle(Theme.blurple)
                    }
                    .buttonStyle(.plain).disabled(saving)

                    if enabled {
                        Button { Task { await vm.setWarnLog(channelId: nil) } } label: {
                            Label("Disable", systemImage: "xmark.circle")
                                .font(LPFont.label).foregroundStyle(Theme.red)
                        }
                        .buttonStyle(.plain).disabled(saving)
                    }
                }
            }
        }
        .sheet(isPresented: $showPicker) {
            AddPickerSheet(vm: vm, type: .channel, color: Theme.blurple,
                           selected: enabled ? [log.logChannel] : [], textOnly: true) { id in
                Task { await vm.setWarnLog(channelId: id) }
            }
        }
        .task { await vm.loadChannels() }
    }
}

/// Pulsing "LIVE" badge.
private struct LiveBadge: View {
    @State private var pulse = false
    var body: some View {
        HStack(spacing: 5) {
            Circle().fill(Theme.green).frame(width: 7, height: 7)
                .opacity(pulse ? 0.3 : 1)
                .animation(.easeInOut(duration: 1).repeatForever(autoreverses: true), value: pulse)
            Text("LIVE").font(LPFont.tiny).foregroundStyle(Theme.green)
        }
        .padding(.horizontal, 8).padding(.vertical, 4)
        .background(Theme.green.opacity(0.1)).clipShape(Capsule())
        .onAppear { pulse = true }
    }
}
