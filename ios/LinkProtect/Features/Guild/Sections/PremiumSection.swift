import SwiftUI

/// Link Protect Premium — subscription status, upgrade, and the two premium
/// tools that make sense on the phone: the watchlist and automation (night
/// schedule + event mode). Checkout and billing run via Stripe on the website;
/// the app deep-links there. Protection itself is never behind the paywall.
struct PremiumSection: View {
    @ObservedObject var vm: GuildConfigViewModel

    @State private var showMemberPicker = false

    private var active: Bool { vm.premiumActive }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            SectionHeader(title: "Premium",
                          subtitle: "Personalization and extras — every protection feature stays free, forever",
                          systemImage: "diamond.fill")

            statusCard
            watchlistCard
            automationCard

            if active {
                InfoBox("More Premium lives in the other tabs: embed color, footer, welcome & leave messages under Messages, your logo and vanity link under Verification.")
            }
        }
        .task { await vm.loadPremiumFeatures() }
        .sheet(isPresented: $showMemberPicker) {
            AddPickerSheet(vm: vm, type: .member, color: Theme.blurple,
                           selected: vm.watchlist?.entries.map(\.userId) ?? []) { id in
                Task { await vm.addToWatchlist(userId: id, days: 7, reason: nil) }
            }
        }
    }

    // MARK: Status / upgrade

    private var upgradeURL: URL {
        URL(string: "https://link-protect.com/dashboard/\(vm.guildId)?premium=1")!
    }

    @ViewBuilder
    private var statusCard: some View {
        if let premium = vm.premium {
            if premium.active {
                DiscordCard("Subscription") {
                    VStack(alignment: .leading, spacing: 10) {
                        HStack(spacing: 9) {
                            Image(systemName: "diamond.fill")
                                .font(.system(size: 15, weight: .semibold))
                                .foregroundStyle(Theme.blurple)
                            VStack(alignment: .leading, spacing: 1) {
                                Text("Premium is active")
                                    .font(LPFont.bodyStrong).foregroundStyle(Theme.text)
                                if let until = premium.until {
                                    Text("Renews \(Date(timeIntervalSince1970: TimeInterval(until)).formatted(date: .abbreviated, time: .omitted))")
                                        .font(LPFont.caption).foregroundStyle(Theme.dim)
                                }
                            }
                        }
                        Text("Thanks for supporting Link Protect. Manage or cancel anytime — settings are always kept.")
                            .font(LPFont.caption).foregroundStyle(Theme.faint)
                            .fixedSize(horizontal: false, vertical: true)
                        Button {
                            UIApplication.shared.open(upgradeURL)
                        } label: {
                            HStack(spacing: 6) {
                                Image(systemName: "gearshape")
                                Text("Manage subscription")
                            }
                            .font(LPFont.label).foregroundStyle(Theme.muted)
                            .padding(.horizontal, 14).padding(.vertical, 8)
                            .background(Theme.surface)
                            .overlay(RoundedRectangle(cornerRadius: 8).stroke(Theme.border, lineWidth: 1))
                            .clipShape(RoundedRectangle(cornerRadius: 8))
                        }
                        .buttonStyle(PressScaleStyle())
                    }
                }
            } else {
                DiscordCard("Get Premium") {
                    VStack(alignment: .leading, spacing: 12) {
                        HStack(alignment: .firstTextBaseline, spacing: 5) {
                            Text("3,49 €").font(.system(size: 28, weight: .heavy)).foregroundStyle(Theme.text)
                            Text("/month · or 29 €/year, per server")
                                .font(LPFont.caption).foregroundStyle(Theme.dim)
                        }
                        VStack(alignment: .leading, spacing: 7) {
                            perkRow("Your embed color, footer & welcome messages")
                            perkRow("Watchlist with the strictest checks")
                            perkRow("Night schedule & event mode")
                            perkRow("Verify page: your logo, rules gate & vanity link")
                            perkRow("Templates up to 1,500 characters · 10× API limits")
                        }
                        Button {
                            UIApplication.shared.open(upgradeURL)
                        } label: {
                            HStack(spacing: 7) {
                                Image(systemName: "diamond.fill").font(.system(size: 12, weight: .bold))
                                Text("Get Premium")
                                Image(systemName: "arrow.up.forward").font(.system(size: 11, weight: .bold))
                            }
                            .font(LPFont.label).foregroundStyle(.white)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 12)
                            .background(Theme.blurple)
                            .clipShape(RoundedRectangle(cornerRadius: 10))
                        }
                        .buttonStyle(PressScaleStyle())
                        Text("Checkout and billing run via Stripe in your browser — sign in with Discord there. Every security feature stays free, this is personalization only.")
                            .font(.system(size: 11)).foregroundStyle(Theme.faint)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
            }
        } else {
            DiscordCard("Subscription") { Spinner(size: 18).frame(maxWidth: .infinity) }
        }
    }

    private func perkRow(_ text: String) -> some View {
        HStack(alignment: .top, spacing: 8) {
            Image(systemName: "checkmark")
                .font(.system(size: 10, weight: .bold))
                .foregroundStyle(Theme.green)
                .padding(.top, 3)
            Text(text).font(LPFont.caption).fontWeight(.regular).foregroundStyle(Theme.muted)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private var lockNote: some View {
        HStack(alignment: .top, spacing: 8) {
            Image(systemName: "diamond.fill").font(.system(size: 10)).foregroundStyle(Theme.blurple).padding(.top, 2)
            Text("A Premium feature — unlock it with the button above.")
                .font(LPFont.caption).foregroundStyle(Theme.faint)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(10)
        .background(Theme.blurple.opacity(0.05))
        .overlay(RoundedRectangle(cornerRadius: 8).stroke(Theme.blurple.opacity(0.2), lineWidth: 1))
        .clipShape(RoundedRectangle(cornerRadius: 8))
    }

    // MARK: Watchlist

    private var watchlistCard: some View {
        DiscordCard("Watchlist", accessory: AnyView(PremiumTag())) {
            VStack(alignment: .leading, spacing: 12) {
                Text("Watchlisted members get every message checked with the strictest rules for a limited time — perfect for \u{201C}one more chance\u{201D} cases. Entries expire on their own.")
                    .font(LPFont.caption).fontWeight(.regular).foregroundStyle(Theme.dim)
                    .fixedSize(horizontal: false, vertical: true)

                if !active {
                    lockNote
                } else if let wl = vm.watchlist {
                    if wl.entries.isEmpty {
                        Text("No one is being watched right now.")
                            .font(LPFont.caption).foregroundStyle(Theme.faint)
                    } else {
                        VStack(spacing: 8) {
                            ForEach(wl.entries) { entry in
                                watchRow(entry)
                            }
                        }
                    }
                    Button {
                        showMemberPicker = true
                    } label: {
                        HStack(spacing: 6) {
                            Image(systemName: "plus")
                            Text("Add member · 7 days")
                        }
                        .font(LPFont.label).foregroundStyle(Theme.blurple)
                        .padding(.horizontal, 13).padding(.vertical, 8)
                        .background(Theme.blurple.opacity(0.08))
                        .overlay(RoundedRectangle(cornerRadius: 8).stroke(Theme.blurple.opacity(0.3), lineWidth: 1))
                        .clipShape(RoundedRectangle(cornerRadius: 8))
                    }
                    .buttonStyle(PressScaleStyle())
                } else {
                    Spinner(size: 16)
                }
            }
        }
    }

    private func watchRow(_ entry: WatchlistEntry) -> some View {
        let daysLeft = max(0, (entry.until - Int(Date().timeIntervalSince1970)) / 86400)
        return HStack(spacing: 10) {
            VStack(alignment: .leading, spacing: 2) {
                Text(vm.memberNames[entry.userId] ?? "User …\(entry.userId.suffix(4))")
                    .font(LPFont.bodyStrong).foregroundStyle(Theme.text)
                Text(entry.reason ?? "No reason given")
                    .font(LPFont.caption).foregroundStyle(Theme.faint)
                    .lineLimit(1)
            }
            Spacer(minLength: 8)
            Text(daysLeft <= 0 ? "expires today" : "\(daysLeft)d left")
                .font(.system(size: 11, weight: .semibold)).foregroundStyle(Theme.dim)
            Button {
                Task { await vm.removeFromWatchlist(userId: entry.userId) }
            } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 11, weight: .bold)).foregroundStyle(Theme.red)
                    .padding(7)
                    .background(Theme.red.opacity(0.08))
                    .clipShape(Circle())
            }
            .buttonStyle(PressScaleStyle())
        }
        .padding(10)
        .background(Theme.surface)
        .overlay(RoundedRectangle(cornerRadius: 10).stroke(Theme.border, lineWidth: 1))
        .clipShape(RoundedRectangle(cornerRadius: 10))
    }

    // MARK: Automation

    private var automationCard: some View {
        DiscordCard("Automation", accessory: AnyView(PremiumTag())) {
            VStack(alignment: .leading, spacing: 14) {
                if !active {
                    Text("Tighten protection automatically at night, and block every link with one tap during events.")
                        .font(LPFont.caption).fontWeight(.regular).foregroundStyle(Theme.dim)
                        .fixedSize(horizontal: false, vertical: true)
                    lockNote
                } else if vm.scheduleState != nil {
                    NightScheduleEditor(vm: vm)
                    Rectangle().fill(Theme.border).frame(height: 1)
                    EventModeControl(vm: vm)
                } else {
                    Spinner(size: 16)
                }
            }
        }
    }
}

// MARK: - Night schedule editor

private struct NightScheduleEditor: View {
    @ObservedObject var vm: GuildConfigViewModel

    @State private var enabled = false
    @State private var fromHour = 0
    @State private var toHour = 8
    @State private var preset = "strict"
    @State private var loaded = false
    @State private var saving = false

    private var saved: ScheduleState.Night? { vm.scheduleState?.night }
    private var dirty: Bool {
        guard let s = saved else { return false }
        return enabled != s.enabled || fromHour != s.fromHour || toHour != s.toHour || preset != s.preset
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                Image(systemName: "moon.fill").font(.system(size: 12)).foregroundStyle(Theme.blurple)
                Text("Night schedule").font(LPFont.bodyStrong).foregroundStyle(Theme.text)
                if vm.scheduleState?.nightActive == true {
                    Text("active now").font(.system(size: 10, weight: .bold)).foregroundStyle(Theme.green)
                        .padding(.horizontal, 7).padding(.vertical, 2)
                        .background(Theme.green.opacity(0.1)).clipShape(Capsule())
                }
                Spacer(minLength: 0)
                Toggle("", isOn: $enabled).labelsHidden().toggleStyle(DiscordToggleStyle(disabled: saving))
            }
            Text("While the window is active the chosen preset is applied — your daytime settings come back automatically.")
                .font(LPFont.caption).foregroundStyle(Theme.faint)
                .fixedSize(horizontal: false, vertical: true)

            HStack(spacing: 10) {
                hourStepper("From", value: $fromHour)
                hourStepper("Until", value: $toHour)
                VStack(alignment: .leading, spacing: 4) {
                    Text("Preset").font(.system(size: 10, weight: .semibold)).foregroundStyle(Theme.dim)
                    HStack(spacing: 4) {
                        presetButton("strict", label: "Strict")
                        presetButton("balanced", label: "Balanced")
                    }
                }
            }

            if dirty {
                Button {
                    saving = true
                    Task {
                        _ = await vm.saveSchedule(enabled: enabled, fromHour: fromHour, toHour: toHour, preset: preset)
                        saving = false
                    }
                } label: {
                    HStack(spacing: 5) {
                        if saving { Spinner(size: 12) } else { Image(systemName: "checkmark") }
                        Text("Save schedule")
                    }
                    .font(LPFont.label).foregroundStyle(.white)
                    .padding(.horizontal, 14).padding(.vertical, 7)
                    .background(Theme.blurple)
                    .clipShape(RoundedRectangle(cornerRadius: 8))
                }
                .buttonStyle(PressScaleStyle())
                .disabled(saving)
            }
        }
        .onAppear { sync() }
        .onChange(of: saved) { _ in if !dirty { sync() } }
    }

    private func sync() {
        guard let s = saved else { return }
        enabled = s.enabled; fromHour = s.fromHour; toHour = s.toHour; preset = s.preset
        loaded = true
    }

    private func hourStepper(_ label: String, value: Binding<Int>) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label).font(.system(size: 10, weight: .semibold)).foregroundStyle(Theme.dim)
            HStack(spacing: 0) {
                Button { value.wrappedValue = (value.wrappedValue + 23) % 24 } label: {
                    Image(systemName: "minus").font(.system(size: 10, weight: .bold)).foregroundStyle(Theme.muted).frame(width: 26, height: 30)
                }
                Text(String(format: "%02d:00", value.wrappedValue))
                    .font(.system(size: 13, weight: .semibold, design: .monospaced))
                    .foregroundStyle(Theme.text).frame(width: 48)
                Button { value.wrappedValue = (value.wrappedValue + 1) % 24 } label: {
                    Image(systemName: "plus").font(.system(size: 10, weight: .bold)).foregroundStyle(Theme.muted).frame(width: 26, height: 30)
                }
            }
            .background(Theme.surface)
            .overlay(RoundedRectangle(cornerRadius: 8).stroke(Theme.border, lineWidth: 1))
            .clipShape(RoundedRectangle(cornerRadius: 8))
        }
    }

    private func presetButton(_ id: String, label: String) -> some View {
        let selected = preset == id
        return Button { preset = id } label: {
            Text(label)
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(selected ? Theme.blurple : Theme.dim)
                .padding(.horizontal, 10).padding(.vertical, 7)
                .background(selected ? Theme.blurple.opacity(0.12) : Theme.surface)
                .overlay(RoundedRectangle(cornerRadius: 8).stroke(selected ? Theme.blurple.opacity(0.45) : Theme.border, lineWidth: 1))
                .clipShape(RoundedRectangle(cornerRadius: 8))
        }
        .buttonStyle(PressScaleStyle())
    }
}

// MARK: - Event mode

private struct EventModeControl: View {
    @ObservedObject var vm: GuildConfigViewModel
    @State private var hours = 2
    @State private var busy = false

    private var until: Int { vm.scheduleState?.eventUntil ?? 0 }
    private var running: Bool { until > Int(Date().timeIntervalSince1970) }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                Image(systemName: "party.popper.fill").font(.system(size: 12)).foregroundStyle(Theme.yellow)
                Text("Event mode").font(LPFont.bodyStrong).foregroundStyle(Theme.text)
            }
            if running {
                Text("All links are blocked until \(Date(timeIntervalSince1970: TimeInterval(until)).formatted(date: .omitted, time: .shortened)) — your normal settings return automatically.")
                    .font(LPFont.caption).foregroundStyle(Theme.faint)
                    .fixedSize(horizontal: false, vertical: true)
                Button {
                    busy = true
                    Task { await vm.stopEvent(); busy = false }
                } label: {
                    HStack(spacing: 5) {
                        if busy { Spinner(size: 12) } else { Image(systemName: "stop.fill") }
                        Text("End event mode now")
                    }
                    .font(LPFont.label).foregroundStyle(Theme.red)
                    .padding(.horizontal, 13).padding(.vertical, 8)
                    .background(Theme.red.opacity(0.08))
                    .overlay(RoundedRectangle(cornerRadius: 8).stroke(Theme.red.opacity(0.3), lineWidth: 1))
                    .clipShape(RoundedRectangle(cornerRadius: 8))
                }
                .buttonStyle(PressScaleStyle())
                .disabled(busy)
            } else {
                Text("Block every link for a few hours — giveaways, watch parties, big announcements. One tap, auto-restores.")
                    .font(LPFont.caption).foregroundStyle(Theme.faint)
                    .fixedSize(horizontal: false, vertical: true)
                HStack(spacing: 8) {
                    ForEach([2, 4, 6], id: \.self) { h in
                        let selected = hours == h
                        Button { hours = h } label: {
                            Text("\(h)h")
                                .font(.system(size: 12, weight: .semibold))
                                .foregroundStyle(selected ? Theme.blurple : Theme.dim)
                                .padding(.horizontal, 12).padding(.vertical, 7)
                                .background(selected ? Theme.blurple.opacity(0.12) : Theme.surface)
                                .overlay(RoundedRectangle(cornerRadius: 8).stroke(selected ? Theme.blurple.opacity(0.45) : Theme.border, lineWidth: 1))
                                .clipShape(RoundedRectangle(cornerRadius: 8))
                        }
                        .buttonStyle(PressScaleStyle())
                    }
                    Spacer(minLength: 0)
                    Button {
                        busy = true
                        Task { await vm.startEvent(hours: hours); busy = false }
                    } label: {
                        HStack(spacing: 5) {
                            if busy { Spinner(size: 12) } else { Image(systemName: "bolt.fill") }
                            Text("Start")
                        }
                        .font(LPFont.label).foregroundStyle(.white)
                        .padding(.horizontal, 16).padding(.vertical, 8)
                        .background(Theme.blurple)
                        .clipShape(RoundedRectangle(cornerRadius: 8))
                    }
                    .buttonStyle(PressScaleStyle())
                    .disabled(busy)
                }
            }
        }
    }
}
