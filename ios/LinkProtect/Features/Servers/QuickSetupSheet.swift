import SwiftUI

/// One-tap protection for freshly invited servers: pick a preset, optionally
/// arm Scam Shield & raid defense, done. Shown from the server list for any
/// server the bot is in that has zero active protections.
struct QuickSetupSheet: View {
    let guild: ManagedGuild
    let api: APIClient
    var onDone: () -> Void = {}

    @Environment(\.dismiss) private var dismiss
    @State private var preset: ProtectionPreset = .balanced
    @State private var enableScamShield = true
    @State private var enableRaid = true
    @State private var applying = false
    @State private var finished = false
    @State private var failed = false

    var body: some View {
        NavigationStack {
            ZStack {
                AppBackgroundView()
                ScrollView {
                    VStack(alignment: .leading, spacing: 16) {
                        if finished { doneCard } else { setupCards }
                    }
                    .padding(16)
                }
            }
            .navigationTitle(guild.name)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Close") { dismiss() }.tint(Theme.muted)
                }
            }
        }
    }

    // MARK: Setup

    @ViewBuilder
    private var setupCards: some View {
        HStack(spacing: 10) {
            Image(systemName: "bolt.shield.fill").font(.system(size: 22)).foregroundStyle(Theme.blurple)
            Text("This server isn't protected yet — pick a level and you're done in one tap.")
                .font(LPFont.caption).foregroundStyle(Theme.muted)
        }
        .padding(12)
        .background(Theme.blurple.opacity(0.10))
        .overlay(RoundedRectangle(cornerRadius: 10).stroke(Theme.blurple.opacity(0.35), lineWidth: 1))
        .clipShape(RoundedRectangle(cornerRadius: 10))

        DiscordCard("Protection level") {
            VStack(spacing: 8) {
                ForEach(ProtectionPreset.allCases) { p in
                    Button { preset = p } label: {
                        HStack(spacing: 12) {
                            Image(systemName: p.icon).font(.system(size: 16))
                                .foregroundStyle(preset == p ? Theme.blurple : Theme.dim)
                                .frame(width: 24)
                            VStack(alignment: .leading, spacing: 2) {
                                HStack(spacing: 6) {
                                    Text(p.title).font(LPFont.bodyStrong)
                                        .foregroundStyle(preset == p ? Theme.text : Theme.muted)
                                    if p == .balanced {
                                        Text("RECOMMENDED").font(.system(size: 9, weight: .heavy)).tracking(0.5)
                                            .foregroundStyle(Theme.green)
                                            .padding(.horizontal, 6).padding(.vertical, 2)
                                            .background(Theme.green.opacity(0.12)).clipShape(Capsule())
                                    }
                                }
                                Text(p.subtitle).font(LPFont.tiny).fontWeight(.regular).foregroundStyle(Theme.dim)
                            }
                            Spacer(minLength: 0)
                            Image(systemName: preset == p ? "checkmark.circle.fill" : "circle")
                                .font(.system(size: 18))
                                .foregroundStyle(preset == p ? Theme.blurple : Theme.faint)
                        }
                        .padding(12)
                        .background(preset == p ? Theme.blurple.opacity(0.08) : Theme.surface)
                        .overlay(RoundedRectangle(cornerRadius: 10)
                            .stroke(preset == p ? Theme.blurple.opacity(0.5) : Theme.border, lineWidth: 1))
                        .clipShape(RoundedRectangle(cornerRadius: 10))
                    }
                    .buttonStyle(PressScaleStyle())
                }
            }
        }

        DiscordCard("Account defense") {
            VStack(alignment: .leading, spacing: 12) {
                ToggleRow(label: "Scam Shield",
                          description: "Catch hijacked accounts spamming the same scam into several channels",
                          isOn: $enableScamShield)
                Rectangle().fill(Theme.border).frame(height: 1)
                ToggleRow(label: "Raid protection",
                          description: "Stop many accounts mass-posting the same link within seconds",
                          isOn: $enableRaid)
            }
        }

        if failed {
            Text("Some settings didn't save — check the server's config afterwards.")
                .font(LPFont.caption).foregroundStyle(Theme.red)
        }

        Button { Task { await apply() } } label: {
            HStack(spacing: 8) {
                if applying { Spinner(size: 15) } else { Image(systemName: "shield.checkered") }
                Text(applying ? "Protecting…" : "Protect this server").font(LPFont.label)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 14)
            .foregroundStyle(.white)
            .background(Theme.blurple)
            .clipShape(RoundedRectangle(cornerRadius: 10))
            .opacity(applying ? 0.6 : 1)
        }
        .buttonStyle(PressScaleStyle())
        .disabled(applying)
    }

    // MARK: Done

    @ViewBuilder
    private var doneCard: some View {
        VStack(spacing: 12) {
            Image(systemName: "checkmark.shield.fill").font(.system(size: 44)).foregroundStyle(Theme.green)
            Text("\(guild.name) is protected").font(LPFont.bodyStrong).foregroundStyle(Theme.text)
            Text("The \(preset.title) preset is live\(enableScamShield ? ", Scam Shield is armed" : "")\(enableRaid ? ", raid defense is on" : ""). Tip: set a warn-log channel in the server's settings to see everything the bot does.")
                .font(LPFont.caption).foregroundStyle(Theme.dim)
                .multilineTextAlignment(.center)
            Button { dismiss() } label: {
                Text("Done").font(LPFont.label)
                    .frame(maxWidth: .infinity).padding(.vertical, 13)
                    .foregroundStyle(.white).background(Theme.green)
                    .clipShape(RoundedRectangle(cornerRadius: 10))
            }
            .buttonStyle(PressScaleStyle())
            .padding(.top, 6)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 28)
    }

    private func apply() async {
        applying = true; failed = false
        var ok = true
        for (key, val) in preset.protect {
            do { try await api.patch(guild.id, path: "protect.\(key)", value: val) } catch { ok = false }
        }
        for (path, val) in [("warn.kick", preset.kick), ("warn.ban", preset.ban), ("warn.timeout.warnings", preset.timeout)] {
            do { try await api.patch(guild.id, path: path, value: val) } catch { ok = false }
        }
        if enableScamShield {
            do { try await api.patch(guild.id, path: "scamguard.enabled", value: true) } catch { ok = false }
            do { try await api.patch(guild.id, path: "scamguard.join_check", value: true) } catch { ok = false }
        }
        if enableRaid {
            do { try await api.patch(guild.id, path: "raid.enabled", value: true) } catch { ok = false }
        }
        applying = false
        failed = !ok
        finished = true
        onDone()
    }
}
