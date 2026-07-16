import SwiftUI
import UIKit
import UserNotifications

struct SettingsView: View {
    let user: DiscordUser
    @EnvironmentObject private var auth: AuthStore
    @EnvironmentObject private var push: PushManager
    @EnvironmentObject private var lock: AppLock
    @Environment(\.dismiss) private var dismiss
    @State private var showDelete = false
    @State private var deleting = false
    @State private var showReport = false
    @AppStorage(AppBackground.storageKey) private var background = AppBackground.linkProtect.rawValue

    var body: some View {
        NavigationStack {
            ZStack {
                AppBackgroundView()
                ScrollView {
                    VStack(spacing: 16) {
                        profileHeader
                        appearanceCard
                        notificationsCard
                        securityCard
                        aboutCard
                        reportCard
                        signOutButton
                        deleteButton
                    }
                    .padding(16)
                }
            }
            .navigationTitle("Account")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) { Button("Done") { dismiss() }.tint(Theme.blurple) }
            }
            .sheet(isPresented: $showReport) {
                ReportFormView(api: auth.api)
            }
            .alert("Delete my data?", isPresented: $showDelete) {
                Button("Cancel", role: .cancel) {}
                Button("Delete", role: .destructive) {
                    Task {
                        deleting = true
                        try? await auth.api.deleteAccount()
                        auth.signOut()
                        dismiss()
                    }
                }
            } message: {
                Text("This removes your notification registrations from our server and signs you out. Server protection settings belong to each Discord server — remove the bot from a server to delete its settings.")
            }
        }
        .task { await push.refreshAuthorizationStatus() }
    }

    private var reportCard: some View {
        Button { showReport = true } label: {
            HStack {
                Label("Report a problem", systemImage: "flag.fill").font(LPFont.label).foregroundStyle(Theme.text)
                Spacer()
                Image(systemName: "chevron.right").font(.system(size: 12, weight: .semibold)).foregroundStyle(Theme.dim)
            }
            .padding(.vertical, 14).padding(.horizontal, 14)
            .cardSurface()
        }
        .buttonStyle(.plain)
    }

    private var deleteButton: some View {
        Button { showDelete = true } label: {
            Text(deleting ? "Deleting…" : "Delete my data")
                .font(.system(size: 14, weight: .medium))
                .foregroundStyle(Theme.faint)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 10)
        }
        .buttonStyle(.plain)
        .disabled(deleting)
    }

    // MARK: Appearance

    private var appearanceCard: some View {
        DiscordCard("Appearance") {
            VStack(alignment: .leading, spacing: 12) {
                Text("Choose your app background.")
                    .font(LPFont.caption).foregroundStyle(Theme.dim)
                LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 10), count: 3), spacing: 12) {
                    ForEach(AppBackground.allCases) { bg in
                        let selected = background == bg.rawValue
                        Button {
                            background = bg.rawValue
                            UIImpactFeedbackGenerator(style: .light).impactOccurred()
                        } label: {
                            VStack(spacing: 6) {
                                ZStack {
                                    bg.layers
                                    if selected {
                                        Image(systemName: "checkmark.circle.fill")
                                            .font(.system(size: 17))
                                            .foregroundStyle(.white)
                                            .shadow(color: .black.opacity(0.4), radius: 2)
                                    }
                                }
                                .frame(height: 56)
                                .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                                .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous)
                                    .strokeBorder(selected ? Theme.blurple : Theme.border,
                                                  lineWidth: selected ? 2 : 1))
                                Text(LocalizedStringKey(bg.title))
                                    .font(.system(size: 11, weight: selected ? .semibold : .regular))
                                    .foregroundStyle(selected ? Theme.text : Theme.faint)
                                    .lineLimit(1)
                            }
                        }
                        .buttonStyle(PressScaleStyle())
                    }
                }
            }
        }
    }

    // MARK: Security

    private var securityCard: some View {
        DiscordCard("Security") {
            ToggleRow(
                label: "Require \(lock.biometryName)",
                description: "Lock the app and ask for \(lock.biometryName) on launch.",
                isOn: Binding(get: { lock.enabled }, set: { lock.enabled = $0 })
            )
        }
    }

    // MARK: Profile

    private var profileHeader: some View {
        VStack(spacing: 12) {
            GuildIcon(name: user.displayName, url: user.avatarURL, size: 72)
                .clipShape(Circle())
                .overlay(Circle().strokeBorder(Theme.border, lineWidth: 1))
            Text(user.displayName).font(.system(size: 20, weight: .semibold)).foregroundStyle(Theme.text)
            Text(user.id).font(.system(size: 12, design: .monospaced)).foregroundStyle(Theme.dim)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 24)
        .cardSurface()
    }

    // MARK: Notifications

    private var notificationsCard: some View {
        DiscordCard("Notifications") {
            VStack(alignment: .leading, spacing: 0) {
                if push.authorizationStatus == .denied {
                    InfoBox("Notifications are turned off in iOS Settings. Enable them to receive alerts.")
                        .padding(.bottom, 12)
                    Button { openSystemSettings() } label: {
                        Label("Open iOS Settings", systemImage: "gear").font(LPFont.label).foregroundStyle(Theme.blurple)
                    }.buttonStyle(.plain)
                } else if push.authorizationStatus == .notDetermined {
                    Text("Get a push when something needs your attention — even with the app closed.")
                        .font(LPFont.caption).foregroundStyle(Theme.dim).padding(.bottom, 12)
                    PrimaryButton(title: "Enable notifications", systemImage: "bell.fill") {
                        Task { await push.requestAuthorization() }
                    }
                } else {
                    triggerToggle("Bot goes offline", "Know immediately if the bot stops protecting a server",
                                  isOn: binding(\.botOffline))
                    Divider().overlay(Theme.border)
                    triggerToggle("Protection rule triggered", "A link was blocked or a member was actioned",
                                  isOn: binding(\.ruleTriggered))
                    Divider().overlay(Theme.border)
                    triggerToggle("Scam Shield", "A scam spammer was caught or a known scam account was removed",
                                  isOn: binding(\.scamShield))
                    Divider().overlay(Theme.border)
                    triggerToggle("Server settings changed", "Someone updated a server's configuration",
                                  isOn: binding(\.settingsChanged))
                }
            }
        }
    }

    private func triggerToggle(_ title: String, _ description: String, isOn: Binding<Bool>) -> some View {
        ToggleRow(label: title, description: description, isOn: isOn)
    }

    private func binding(_ keyPath: WritableKeyPath<PushPreferences, Bool>) -> Binding<Bool> {
        Binding(
            get: { push.preferences[keyPath: keyPath] },
            set: { newValue in
                var prefs = push.preferences
                prefs[keyPath: keyPath] = newValue
                push.updatePreferences(prefs)
            }
        )
    }

    // MARK: About

    private var aboutCard: some View {
        DiscordCard("About") {
            VStack(spacing: 0) {
                linkRow("Website", "globe", AppConfig.websiteURL)
                Divider().overlay(Theme.border)
                linkRow("Support server", "bubble.left.and.bubble.right.fill", AppConfig.supportServerURL)
                Divider().overlay(Theme.border)
                linkRow("Privacy Policy", "hand.raised.fill", AppConfig.privacyURL)
                Divider().overlay(Theme.border)
                linkRow("Terms of Service", "doc.text.fill", AppConfig.termsURL)
                Divider().overlay(Theme.border)
                HStack {
                    Label("Version", systemImage: "info.circle.fill").font(LPFont.label).foregroundStyle(Theme.muted)
                    Spacer()
                    Text(appVersion).font(LPFont.caption.monospaced()).foregroundStyle(Theme.dim)
                }.padding(.vertical, 11)
            }
        }
    }

    private func linkRow(_ title: String, _ icon: String, _ url: URL) -> some View {
        Button { UIApplication.shared.open(url) } label: {
            HStack {
                Label(title, systemImage: icon).font(LPFont.label).foregroundStyle(Theme.text)
                Spacer()
                Image(systemName: "arrow.up.right").font(.system(size: 11, weight: .semibold)).foregroundStyle(Theme.dim)
            }.padding(.vertical, 11)
        }.buttonStyle(.plain)
    }

    private var signOutButton: some View {
        Button(role: .destructive) {
            auth.signOut(); dismiss()
        } label: {
            Label("Sign out", systemImage: "rectangle.portrait.and.arrow.right")
                .font(LPFont.bodyStrong).foregroundStyle(Theme.red)
                .frame(maxWidth: .infinity).padding(.vertical, 13)
                .background(Theme.red.opacity(0.08))
                .overlay(RoundedRectangle(cornerRadius: Theme.Radius.md).stroke(Theme.red.opacity(0.2), lineWidth: 1))
                .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.md))
        }
        .buttonStyle(PressScaleStyle())
        .padding(.top, 4)
    }

    private var appVersion: String {
        let v = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "1.0"
        let b = Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? "1"
        return "\(v) (\(b))"
    }

    private func openSystemSettings() {
        if let url = URL(string: UIApplication.openSettingsURLString) { UIApplication.shared.open(url) }
    }
}
