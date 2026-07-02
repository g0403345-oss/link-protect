import SwiftUI

struct WarningsSection: View {
    @ObservedObject var vm: GuildConfigViewModel
    @State private var selected: WarnedUser?
    @State private var showModerate = false

    private var warn: WarnConfig { vm.data?.warn ?? WarnConfig() }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            SectionHeader(title: "Warning System",
                          subtitle: "Configure automatic actions when users accumulate warnings",
                          systemImage: "nosign")

            DiscordCard("Action Thresholds") {
                VStack(spacing: 20) {
                    NumberStepper(label: "Kick threshold",
                                  description: "User is kicked at this many warnings (0 = disabled)",
                                  systemImage: "arrow.up.forward", color: Theme.yellow,
                                  value: warn.kick, saving: vm.savingPath == "warn.kick") { v in
                        Task { await vm.patch(path: "warn.kick", value: v, label: "Kick threshold") { $0.warn.kick = v } }
                    }
                    NumberStepper(label: "Ban threshold",
                                  description: "User is banned at this many warnings (0 = disabled)",
                                  systemImage: "nosign", color: Theme.red,
                                  value: warn.ban, saving: vm.savingPath == "warn.ban") { v in
                        Task { await vm.patch(path: "warn.ban", value: v, label: "Ban threshold") { $0.warn.ban = v } }
                    }
                    NumberStepper(label: "Timeout threshold",
                                  description: "User is timed out at this many warnings (0 = disabled)",
                                  systemImage: "clock.fill", color: Theme.blurple,
                                  value: warn.timeoutWarnings, saving: vm.savingPath == "warn.timeout.warnings") { v in
                        Task { await vm.patch(path: "warn.timeout.warnings", value: v, label: "Timeout threshold") { $0.warn.timeoutWarnings = v } }
                    }
                }
            }

            DiscordCard("Timeout Duration") {
                NumberStepper(label: "Duration (minutes)",
                              description: "How long the timeout lasts when triggered",
                              systemImage: "clock.fill", color: Theme.blurple,
                              value: warn.timeoutMinutes, saving: vm.savingPath == "warn.timeout.time") { v in
                    Task { await vm.patch(path: "warn.timeout.time", value: v, label: "Timeout duration") { $0.warn.timeoutMinutes = v } }
                }
            }

            decayCard

            moderateCard

            warnedUsersCard
        }
        // Resolve warned-user IDs → names so the list shows who they are.
        .task(id: warn.warnedUsers.map(\.id)) {
            await vm.resolveMembers(warn.warnedUsers.map(\.id))
        }
        .sheet(item: $selected) { user in
            WarnedUserDetailSheet(vm: vm, user: user, name: vm.memberNames[user.id])
                .presentationDetents([.medium, .large])
        }
        .sheet(isPresented: $showModerate) {
            ModerateMemberSheet(vm: vm).presentationDetents([.medium, .large])
        }
    }

    @ViewBuilder
    private var moderateCard: some View {
        DiscordCard("Moderate a Member") {
            VStack(alignment: .leading, spacing: 12) {
                Text("Warn, time out, kick or ban any member straight from the app — no need to open Discord.")
                    .font(LPFont.caption).foregroundStyle(Theme.dim)
                Button { showModerate = true } label: {
                    HStack(spacing: 8) {
                        Image(systemName: "person.badge.shield.checkmark")
                        Text("Moderate a member").font(LPFont.label)
                        Spacer(minLength: 0)
                        Image(systemName: "chevron.right").font(.system(size: 12))
                    }
                    .foregroundStyle(Theme.blurple)
                    .padding(12)
                    .background(Theme.blurple.opacity(0.12))
                    .overlay(RoundedRectangle(cornerRadius: 8).stroke(Theme.blurple.opacity(0.4), lineWidth: 1))
                    .clipShape(RoundedRectangle(cornerRadius: 8))
                }
                .buttonStyle(PressScaleStyle())
            }
        }
    }

    private var decay: ServerData.Decay { vm.data?.decay ?? ServerData.Decay() }

    @ViewBuilder
    private var decayCard: some View {
        DiscordCard("Warning Decay") {
            VStack(alignment: .leading, spacing: 12) {
                ToggleRow(
                    label: "Auto-expire old warnings",
                    description: "Warnings are forgiven after a while, so one old mistake doesn't count forever",
                    isOn: vm.boolBinding(\.decay.enabled, path: "decay.enabled", label: "Warning decay"),
                    saving: vm.savingPath == "decay.enabled"
                )
                if decay.enabled {
                    Rectangle().fill(Theme.border).frame(height: 1)
                    NumberStepper(label: "Expire after (days)",
                                  description: "A warning is removed once it's older than this many days",
                                  systemImage: "hourglass", color: Theme.green,
                                  value: decay.days, saving: vm.savingPath == "decay.days") { v in
                        let days = max(1, v)
                        Task { await vm.patch(path: "decay.days", value: days, label: "Decay window") { $0.decay.days = days } }
                    }
                }
                InfoBox(decay.enabled
                        ? "Each warning is timestamped. Once older than \(decay.days) day(s) it's removed automatically and stops counting toward kick/ban. Cleaned up hourly."
                        : "When off, warnings stay until you reset them. Turn this on so well-behaved members are gradually forgiven.")
            }
        }
    }

    @ViewBuilder
    private var warnedUsersCard: some View {
        let users = warn.warnedUsers
        DiscordCard(users.isEmpty ? "Warned Users" : "Warned Users (\(users.count))") {
            if users.isEmpty {
                VStack(spacing: 8) {
                    Image(systemName: "checkmark.circle.fill").font(.system(size: 26)).foregroundStyle(Theme.green)
                    Text("No warned users — server is clean!").font(LPFont.caption).foregroundStyle(Theme.dim)
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 12)
            } else {
                VStack(spacing: 6) {
                    ForEach(users) { user in
                        Button { selected = user } label: { WarnedUserRow(user: user, warn: warn, name: vm.memberNames[user.id]) }
                            .buttonStyle(PressScaleStyle())
                    }
                }
            }
        }
    }
}

private struct WarnedUserRow: View {
    let user: WarnedUser
    let warn: WarnConfig
    var name: String? = nil

    private var color: Color {
        if warn.ban > 0, user.warns >= warn.ban { return Theme.red }
        if warn.kick > 0, user.warns >= warn.kick { return Theme.yellow }
        return Theme.blurple
    }

    var body: some View {
        HStack(spacing: 10) {
            ZStack {
                Circle().fill(Theme.surface3).frame(width: 30, height: 30)
                Text(String((name ?? user.id).prefix(2)).uppercased())
                    .font(LPFont.tiny).foregroundStyle(Theme.faint)
            }
            VStack(alignment: .leading, spacing: 2) {
                Text(name ?? user.id)
                    .font(name != nil ? LPFont.caption : LPFont.caption.monospaced())
                    .foregroundStyle(name != nil ? Theme.text : Theme.muted).lineLimit(1)
                if let reason = user.lastReason {
                    Text(reason).font(LPFont.tiny).fontWeight(.regular).foregroundStyle(Theme.dim).lineLimit(1)
                }
            }
            Spacer(minLength: 0)
            Text("\(user.warns) warns")
                .font(LPFont.caption).foregroundStyle(color)
                .padding(.horizontal, 8).padding(.vertical, 3)
                .background(color.opacity(0.10)).clipShape(Capsule())
        }
        .padding(10)
        .background(Theme.surface)
        .overlay(RoundedRectangle(cornerRadius: 8).stroke(Theme.borderStrong, lineWidth: 1))
        .clipShape(RoundedRectangle(cornerRadius: 8))
    }
}

private struct WarnedUserDetailSheet: View {
    @ObservedObject var vm: GuildConfigViewModel
    let user: WarnedUser
    var name: String? = nil
    @Environment(\.dismiss) private var dismiss
    @State private var resetting = false

    var body: some View {
        NavigationStack {
            ZStack {
                AppBackgroundView()
                ScrollView {
                    VStack(alignment: .leading, spacing: 14) {
                        Text("\(user.warns) warning\(user.warns == 1 ? "" : "s") total")
                            .font(LPFont.caption).foregroundStyle(Theme.dim)

                        MemberActionPanel(vm: vm, userId: user.id, name: name) { dismiss() }

                        if user.reasons.isEmpty {
                            Text("No reasons recorded").font(LPFont.caption).foregroundStyle(Theme.dim)
                        } else {
                            Rectangle().fill(Theme.border).frame(height: 1)
                            Text("Warning history").font(LPFont.caption).foregroundStyle(Theme.dim)
                            ForEach(Array(user.reasons.enumerated()), id: \.offset) { i, reason in
                                HStack(alignment: .top, spacing: 12) {
                                    ZStack {
                                        Circle().fill(Theme.blurple.opacity(0.15)).frame(width: 22, height: 22)
                                        Text("\(i + 1)").font(LPFont.tiny).foregroundStyle(Theme.blurple)
                                    }
                                    Text(reason).font(LPFont.caption).foregroundStyle(Theme.muted)
                                    Spacer(minLength: 0)
                                }
                                .padding(10)
                                .background(Theme.surface)
                                .overlay(RoundedRectangle(cornerRadius: 8).stroke(Theme.borderStrong, lineWidth: 1))
                                .clipShape(RoundedRectangle(cornerRadius: 8))
                            }
                        }
                    }
                    .padding(16)
                }
            }
            .navigationTitle(name ?? user.id)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Close") { dismiss() }.tint(Theme.muted)
                }
                ToolbarItem(placement: .bottomBar) {
                    Button(role: .destructive) {
                        Task { resetting = true; await vm.resetWarns(userId: user.id); resetting = false; dismiss() }
                    } label: {
                        Label(resetting ? "Resetting…" : "Reset warnings", systemImage: "trash")
                            .font(LPFont.label)
                    }
                    .tint(Theme.red)
                    .disabled(resetting)
                }
            }
        }
    }
}

/// Reason field + Warn / Timeout / Kick / Ban buttons (two-tap confirm on the
/// destructive ones). Shared by the warned-user sheet and the moderate sheet.
struct MemberActionPanel: View {
    @ObservedObject var vm: GuildConfigViewModel
    let userId: String
    var name: String? = nil
    var onDone: () -> Void = {}

    @State private var reason = ""
    @State private var minutes = ""
    @State private var busy: String?
    @State private var confirm: String?

    private struct Act { let kind: String; let label: String; let icon: String; let color: Color; let destructive: Bool }
    private let acts: [Act] = [
        Act(kind: "warn", label: "Warn", icon: "exclamationmark.triangle.fill", color: Theme.blurple, destructive: false),
        Act(kind: "timeout", label: "Timeout", icon: "clock.fill", color: Theme.blurple, destructive: false),
        Act(kind: "kick", label: "Kick", icon: "person.fill.xmark", color: Theme.yellow, destructive: true),
        Act(kind: "ban", label: "Ban", icon: "nosign", color: Theme.red, destructive: true),
    ]

    var body: some View {
        VStack(spacing: 12) {
            TextField("Reason (optional)", text: $reason)
                .textInputAutocapitalization(.sentences)
                .foregroundStyle(Theme.text)
                .padding(12)
                .background(Theme.surface)
                .overlay(RoundedRectangle(cornerRadius: 8).stroke(Theme.borderStrong, lineWidth: 1))
                .clipShape(RoundedRectangle(cornerRadius: 8))

            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 8) {
                ForEach(acts, id: \.kind) { act in
                    Button { Task { await tap(act) } } label: {
                        HStack(spacing: 6) {
                            if busy == act.kind { Spinner(size: 14) } else { Image(systemName: act.icon) }
                            Text(busy == act.kind ? "Working…" : (confirm == act.kind ? "Confirm \(act.label)?" : act.label))
                        }
                        .font(LPFont.label)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 11)
                        .foregroundStyle(confirm == act.kind ? .white : act.color)
                        .background(confirm == act.kind ? act.color : act.color.opacity(0.12))
                        .overlay(RoundedRectangle(cornerRadius: 8)
                            .stroke(act.color.opacity(confirm == act.kind ? 1 : 0.4), lineWidth: 1))
                        .clipShape(RoundedRectangle(cornerRadius: 8))
                        .opacity(busy != nil && busy != act.kind ? 0.4 : 1)
                    }
                    .buttonStyle(PressScaleStyle())
                    .disabled(busy != nil)
                }
            }

            HStack(spacing: 8) {
                Image(systemName: "clock").font(.system(size: 13)).foregroundStyle(Theme.dim)
                TextField("Timeout length (min) — optional", text: $minutes)
                    .keyboardType(.numberPad)
                    .foregroundStyle(Theme.text)
                    .onChange(of: minutes) { _ in minutes = minutes.filter(\.isNumber) }
            }
            .padding(12)
            .background(Theme.surface)
            .overlay(RoundedRectangle(cornerRadius: 8).stroke(Theme.borderStrong, lineWidth: 1))
            .clipShape(RoundedRectangle(cornerRadius: 8))
        }
    }

    private func tap(_ act: Act) async {
        // Destructive actions need a second tap to confirm (auto-clears after 3.5s).
        if act.destructive && confirm != act.kind {
            confirm = act.kind
            Task { try? await Task.sleep(nanoseconds: 3_500_000_000); if confirm == act.kind { confirm = nil } }
            return
        }
        confirm = nil
        busy = act.kind
        let r = reason.trimmingCharacters(in: .whitespaces)
        let mins = Int(minutes.trimmingCharacters(in: .whitespaces))
        let ok = await vm.moderate(userId: userId, action: act.kind, displayName: name,
                                   reason: r.isEmpty ? nil : r, minutes: mins)
        busy = nil
        if ok {
            reason = ""
            minutes = ""
            if act.kind == "kick" || act.kind == "ban" { onDone() }
        }
    }
}

/// Search any member and act on them — the app equivalent of the dashboard's
/// "Moderate a Member" card.
private struct ModerateMemberSheet: View {
    @ObservedObject var vm: GuildConfigViewModel
    @Environment(\.dismiss) private var dismiss

    @State private var query = ""
    @State private var members: [DiscordMember] = []
    @State private var searching = false
    @State private var picked: DiscordMember?

    var body: some View {
        NavigationStack {
            ZStack {
                AppBackgroundView()
                ScrollView {
                    VStack(alignment: .leading, spacing: 14) {
                        if let m = picked {
                            pickedHeader(m)
                            MemberActionPanel(vm: vm, userId: m.id, name: m.displayName) { dismiss() }
                        } else {
                            searchField
                            ForEach(members) { m in
                                Button { picked = m } label: { memberRow(m) }
                                    .buttonStyle(PressScaleStyle())
                            }
                            if !query.trimmingCharacters(in: .whitespaces).isEmpty && members.isEmpty && !searching {
                                Text("No members found").font(LPFont.caption).foregroundStyle(Theme.dim).padding(.top, 20)
                            }
                        }
                    }
                    .padding(16)
                }
            }
            .navigationTitle("Moderate a Member")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) { Button("Close") { dismiss() }.tint(Theme.muted) }
                if picked != nil {
                    ToolbarItem(placement: .topBarTrailing) { Button("Change") { picked = nil }.tint(Theme.blurple) }
                }
            }
        }
    }

    private var searchField: some View {
        HStack(spacing: 8) {
            Image(systemName: "magnifyingglass").foregroundStyle(Theme.dim)
            TextField("Search members…", text: $query)
                .textInputAutocapitalization(.never)
                .foregroundStyle(Theme.text)
                .onChange(of: query) { _ in Task { await runSearch() } }
            if searching { Spinner(size: 16) }
        }
        .padding(12)
        .background(Theme.surface)
        .overlay(RoundedRectangle(cornerRadius: 8).stroke(Theme.borderStrong, lineWidth: 1))
        .clipShape(RoundedRectangle(cornerRadius: 8))
    }

    private func pickedHeader(_ m: DiscordMember) -> some View {
        HStack(spacing: 10) {
            ZStack {
                Circle().fill(Theme.surface3).frame(width: 34, height: 34)
                Text(m.displayName.prefix(2).uppercased()).font(LPFont.caption).foregroundStyle(Theme.faint)
            }
            VStack(alignment: .leading, spacing: 1) {
                Text(m.displayName).font(LPFont.bodyStrong).foregroundStyle(Theme.text).lineLimit(1)
                Text(m.id).font(LPFont.tiny).fontWeight(.regular).foregroundStyle(Theme.dim)
            }
            Spacer(minLength: 0)
        }
    }

    private func memberRow(_ m: DiscordMember) -> some View {
        HStack(spacing: 10) {
            ZStack {
                Circle().fill(Theme.surface3).frame(width: 30, height: 30)
                Text(m.displayName.prefix(2).uppercased()).font(LPFont.tiny).foregroundStyle(Theme.faint)
            }
            VStack(alignment: .leading, spacing: 1) {
                Text(m.displayName).font(LPFont.bodyStrong).foregroundStyle(Theme.text).lineLimit(1)
                Text(m.id).font(LPFont.tiny).fontWeight(.regular).foregroundStyle(Theme.dim)
            }
            Spacer(minLength: 0)
            Image(systemName: "chevron.right").font(.system(size: 12)).foregroundStyle(Theme.dim)
        }
        .padding(12)
        .background(Theme.surface)
        .overlay(RoundedRectangle(cornerRadius: 8).stroke(Theme.border, lineWidth: 1))
        .clipShape(RoundedRectangle(cornerRadius: 8))
    }

    private func runSearch() async {
        let q = query.trimmingCharacters(in: .whitespaces)
        guard q.count >= 1 else { members = []; return }
        searching = true
        let result = await vm.searchMembers(q)
        if q == query.trimmingCharacters(in: .whitespaces) { members = result; searching = false }
    }
}
