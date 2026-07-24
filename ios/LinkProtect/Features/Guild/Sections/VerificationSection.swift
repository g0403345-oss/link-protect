import SwiftUI

/// Verification gate — mirror of the website's Verification tab: mode, role,
/// minimum account age, the live permission check and the per-server page link.
struct VerificationSection: View {
    @ObservedObject var vm: GuildConfigViewModel
    @EnvironmentObject private var toasts: ToastCenter
    @State private var health: VerifyHealth?
    @State private var stats: VerifyStats?
    @State private var healthLoading = false
    @State private var copied = false
    @State private var setupConfirm = false
    @State private var setupBusy = false

    private var data: ServerData { vm.data ?? ServerData() }
    private var verify: ServerData.Verify { data.verify }
    private var verifyURL: String { "https://link-protect.com/verify/\(vm.guildId)" }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            SectionHeader(title: "Verification Gate",
                          subtitle: "New members verify on your web page — a hurdle scam bots can't take",
                          systemImage: "checkmark.seal.fill")

            if let stats, stats.total > 0 || verify.enabled {
                HStack(spacing: 10) {
                    StatCard(label: "Verified (total)", value: "\(stats.total)",
                             systemImage: "checkmark.seal.fill", color: Theme.green)
                    StatCard(label: "Last 7 days", value: "\(stats.last7)",
                             systemImage: "calendar", color: Theme.blurple)
                }
            }

            DiscordCard("Gate") {
                ToggleRow(
                    label: "Require web verification",
                    description: "New members get a DM with your personal verify link (link-protect.com/verify/…).",
                    isOn: vm.boolBinding(\.verify.enabled, path: "verify.enabled", label: "Verification gate"),
                    saving: vm.savingPath == "verify.enabled"
                )
                if verify.enabled {
                    Rectangle().fill(Theme.border).frame(height: 1)

                    modePicker

                    rolePicker

                    autoSetup

                    NumberStepper(label: "Minimum account age (days)",
                                  description: "Accounts younger than this can't verify. 0 = off.",
                                  systemImage: "clock.fill", color: Theme.yellow,
                                  value: verify.minAccountAgeDays,
                                  saving: vm.savingPath == "verify.min_account_age_days") { v in
                        let n = min(365, max(0, v))
                        Task { await vm.patch(path: "verify.min_account_age_days", value: n, label: "Minimum account age") { $0.verify.minAccountAgeDays = n } }
                    }
                }
            }

            DiscordCard("Bot Permission Check") {
                if let health {
                    VStack(alignment: .leading, spacing: 8) {
                        ForEach(health.checks) { c in
                            HStack(alignment: .top, spacing: 10) {
                                Image(systemName: c.ok ? "checkmark.circle.fill" : "xmark.circle.fill")
                                    .foregroundStyle(c.ok ? Theme.green : Theme.red)
                                    .font(.system(size: 15))
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(c.label).font(LPFont.label)
                                        .foregroundStyle(c.ok ? Theme.text : Theme.red)
                                    Text(c.detail).font(LPFont.tiny).fontWeight(.regular)
                                        .foregroundStyle(Theme.dim)
                                }
                                Spacer(minLength: 0)
                            }
                        }
                        Button {
                            Task { await reloadHealth() }
                        } label: {
                            HStack(spacing: 6) {
                                if healthLoading { Spinner(size: 12) } else { Image(systemName: "arrow.clockwise") }
                                Text("Re-check")
                            }
                            .font(LPFont.label)
                            .foregroundStyle(Theme.muted)
                        }
                        .buttonStyle(.plain)
                        .padding(.top, 4)
                    }
                } else {
                    HStack(spacing: 8) { Spinner(size: 14); Text("Checking permissions…").font(LPFont.caption).foregroundStyle(Theme.dim) }
                }
            }

            DiscordCard("Your Verification Page") {
                VStack(alignment: .leading, spacing: 10) {
                    Text("Members verify here — the link is DM'd automatically; pin it in your rules channel too. Customize headline, text and color in the web dashboard.")
                        .font(LPFont.caption).fontWeight(.regular).foregroundStyle(Theme.dim)
                .fixedSize(horizontal: false, vertical: true)
                    HStack(spacing: 8) {
                        Text(verifyURL)
                            .font(.system(size: 12, design: .monospaced))
                            .foregroundStyle(Theme.muted)
                            .lineLimit(1).truncationMode(.middle)
                            .padding(.horizontal, 10).padding(.vertical, 8)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .background(Theme.surface)
                            .clipShape(RoundedRectangle(cornerRadius: 8))
                        Button {
                            UIPasteboard.general.string = verifyURL
                            copied = true
                            DispatchQueue.main.asyncAfter(deadline: .now() + 2) { copied = false }
                        } label: {
                            HStack(spacing: 5) {
                                Image(systemName: copied ? "checkmark" : "doc.on.doc")
                                Text(copied ? "Copied" : "Copy")
                            }
                            .font(LPFont.label)
                            .foregroundStyle(copied ? Theme.green : Theme.muted)
                            .padding(.horizontal, 12).padding(.vertical, 8)
                            .background(Theme.surface)
                            .clipShape(RoundedRectangle(cornerRadius: 8))
                        }
                        .buttonStyle(PressScaleStyle())
                    }
                    if let url = URL(string: verifyURL) {
                        Link(destination: url) {
                            HStack(spacing: 5) {
                                Image(systemName: "safari")
                                Text("Open page")
                            }
                            .font(LPFont.label).foregroundStyle(Theme.blurple)
                        }
                    }
                }
            }

            InfoBox("Quarantine mode assigns the role on join and removes it after verification — restrict that role from seeing your channels. Verified mode grants the role only after verification.")
        }
        .task {
            await reloadHealth()
            stats = await vm.verifyStats()
        }
    }

    private func reloadHealth() async {
        healthLoading = true
        health = await vm.verifyHealth()
        healthLoading = false
    }

    // MARK: One-click setup

    private var autoSetup: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 6) {
                Image(systemName: "bolt.fill").foregroundStyle(Theme.yellow).font(.system(size: 12))
                Text("Auto-setup — no manual channel work").font(LPFont.label).foregroundStyle(Theme.text)
            }
            Text("Creates (or reuses) the quarantine role, hides every category & channel from it, adds a #verify info channel and switches the gate to quarantine mode. Safe to re-run.")
                .font(LPFont.tiny).fontWeight(.regular).foregroundStyle(Theme.dim)
                .fixedSize(horizontal: false, vertical: true)
            Button {
                setupConfirm = true
            } label: {
                HStack(spacing: 7) {
                    if setupBusy { Spinner(size: 13) } else { Image(systemName: "bolt.fill") }
                    Text(setupBusy ? "Locking channels…" : "Run auto-setup")
                }
                .font(LPFont.label)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 10)
                .foregroundStyle(.white)
                .background(Theme.blurple)
                .clipShape(RoundedRectangle(cornerRadius: 9))
            }
            .buttonStyle(PressScaleStyle())
            .disabled(setupBusy)
        }
        .padding(12)
        .background(Theme.blurple.opacity(0.06))
        .overlay(RoundedRectangle(cornerRadius: 10).stroke(Theme.blurple.opacity(0.25), lineWidth: 1))
        .clipShape(RoundedRectangle(cornerRadius: 10))
        .confirmationDialog("Lock all channels for unverified members?", isPresented: $setupConfirm, titleVisibility: .visible) {
            Button("Run auto-setup") { Task { await runSetup() } }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("Existing channel locks are kept — this only fills the gaps. Can take up to a minute.")
        }
    }

    private func runSetup() async {
        setupBusy = true
        do {
            let r = try await vm.setupVerifyRole()
            toasts.success("@\(r.roleName) — \(r.channelsLocked) channels locked"
                           + (r.infoChannel == "created" ? " · #verify created" : ""))
            await vm.load()
            await reloadHealth()
        } catch {
            toasts.error("Setup failed — check my permissions")
        }
        setupBusy = false
    }

    // MARK: Mode

    private var modePicker: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Mode").font(LPFont.label).foregroundStyle(Theme.text)
            Text("How the gate uses the role below").font(LPFont.tiny).fontWeight(.regular).foregroundStyle(Theme.dim)
            HStack(spacing: 6) {
                modeButton("verified", "Grant verified role", Theme.green)
                modeButton("quarantine", "Quarantine on join", Theme.yellow)
            }
            .padding(.top, 2)
        }
    }

    private func modeButton(_ id: String, _ label: String, _ color: Color) -> some View {
        let active = verify.roleMode == id
        return Button {
            guard !active else { return }
            Task { await vm.patch(path: "verify.role_mode", value: id, label: "Verification mode") { $0.verify.roleMode = id } }
        } label: {
            Text(label)
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
        .disabled(vm.savingPath == "verify.role_mode")
    }

    // MARK: Role

    private var rolePicker: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(verify.roleMode == "quarantine" ? "Quarantine role" : "Verified role")
                .font(LPFont.label).foregroundStyle(Theme.text)
            Text(verify.roleMode == "quarantine"
                 ? "Assigned on join, removed after verification."
                 : "Granted after verification — only show channels to this role.")
                .font(LPFont.tiny).fontWeight(.regular).foregroundStyle(Theme.dim)
            Menu {
                ForEach(vm.roles ?? []) { role in
                    Button {
                        Task {
                            await vm.patch(path: "verify.role_id", value: role.id, label: "Verification role") { $0.verify.roleId = role.id }
                            await reloadHealth()
                        }
                    } label: {
                        Text("@\(role.name)")
                    }
                }
            } label: {
                HStack(spacing: 8) {
                    if let role = (vm.roles ?? []).first(where: { $0.id == verify.roleId }) {
                        Circle().fill(role.swiftColor).frame(width: 10, height: 10)
                        Text("@\(role.name)").font(LPFont.label).foregroundStyle(Theme.text)
                    } else {
                        Text(verify.roleId == nil ? "Pick a role…" : "Role …\(String((verify.roleId ?? "").suffix(4)))")
                            .font(LPFont.label).foregroundStyle(Theme.dim)
                    }
                    Spacer()
                    Image(systemName: "chevron.up.chevron.down").font(.system(size: 11)).foregroundStyle(Theme.faint)
                }
                .padding(.horizontal, 12).padding(.vertical, 10)
                .background(Theme.surface)
                .overlay(RoundedRectangle(cornerRadius: 8).stroke(Theme.border, lineWidth: 1))
                .clipShape(RoundedRectangle(cornerRadius: 8))
            }
            .task { await vm.loadRoles() }
        }
    }
}
