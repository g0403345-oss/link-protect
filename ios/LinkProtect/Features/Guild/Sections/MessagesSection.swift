import SwiftUI

/// Custom bot messages — the six templates the bot uses when it warns, DMs or
/// announces, plus the daily digest switch. Empty template = built-in default.
struct MessagesSection: View {
    @ObservedObject var vm: GuildConfigViewModel

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            SectionHeader(title: "Messages",
                          subtitle: "How the bot talks — customize every message it sends",
                          systemImage: "text.bubble.fill")

            ForEach(MessageTemplate.all) { template in
                MessageTemplateEditor(vm: vm, template: template)
            }

            DiscordCard("Log Volume") {
                ToggleRow(
                    label: "Daily digest",
                    description: "One summary embed per day instead of a message per action — Scam Shield, raid and lockdown alerts stay live.",
                    isOn: vm.boolBinding(\.log.digest, path: "log.digest", label: "Daily digest"),
                    saving: vm.savingPath == "log.digest"
                )
            }

            InfoBox("Tap a variable chip to insert it. Leave a template empty to keep the built-in default text.")
        }
    }
}

// MARK: - Template catalogue

/// One editable message template: settings path `messages.<key>`.
private struct MessageTemplate: Identifiable {
    let key: String
    let title: String
    let description: String
    let defaultText: String
    let variables: [String]
    let keyPath: WritableKeyPath<ServerData, String>

    var id: String { key }
    var path: String { "messages.\(key)" }

    static let standardVars = ["{user}", "{username}", "{server}", "{reason}", "{warnings}", "{remaining}", "{channel}"]

    static let all: [MessageTemplate] = [
        .init(key: "warn_channel",
              title: "Channel warning",
              description: "Posted in the channel when a blocked link is removed.",
              defaultText: "{user} — your message was removed.\n**Reason:** {reason}",
              variables: standardVars,
              keyPath: \.messages.warnChannel),
        .init(key: "warn_manual",
              title: "Manual warning",
              description: "Posted when a moderator warns someone by hand.",
              defaultText: "{user} was warned by a moderator.\n**Reason:** {reason}",
              variables: standardVars,
              keyPath: \.messages.warnManual),
        .init(key: "warn_dm",
              title: "Warning DM",
              description: "Sent to the member by direct message after a warning.",
              defaultText: "Your link in **{server}** was removed.\n**Reason:** {reason}",
              variables: standardVars,
              keyPath: \.messages.warnDm),
        .init(key: "action_dm",
              title: "Punishment DM",
              description: "Sent when a member is kicked, banned or timed out.",
              defaultText: "You were **{action}** on **{server}** after reaching {warnings} warnings.",
              variables: ["{user}", "{username}", "{server}", "{action}", "{warnings}"],
              keyPath: \.messages.actionDm),
        .init(key: "verify_dm",
              title: "Verification DM",
              description: "Sent to new members when the verification gate is on.",
              defaultText: "Welcome to **{server}**! Verify your account to unlock the server: {link}",
              variables: ["{user}", "{username}", "{server}", "{link}"],
              keyPath: \.messages.verifyDm),
        .init(key: "lockdown_announce",
              title: "Lockdown announcement",
              description: "Posted when the emergency lockdown is activated.",
              defaultText: "🚨 **Emergency lockdown active.** Links are blocked and invites are paused while the moderators handle the situation.",
              variables: ["{server}"],
              keyPath: \.messages.lockdownAnnounce),
    ]
}

// MARK: - Editor card

private struct MessageTemplateEditor: View {
    @ObservedObject var vm: GuildConfigViewModel
    let template: MessageTemplate

    @State private var text = ""
    @State private var loaded = false

    private let maxChars = 400

    /// The value currently stored on the server ("" = default in use).
    private var saved: String { vm.data?[keyPath: template.keyPath] ?? "" }
    private var edited: Bool { text != saved }
    private var saving: Bool { vm.savingPath == template.path }

    var body: some View {
        DiscordCard(template.title) {
            VStack(alignment: .leading, spacing: 10) {
                Text(template.description)
                    .font(LPFont.caption).fontWeight(.regular)
                    .foregroundStyle(Theme.dim)
                    .fixedSize(horizontal: false, vertical: true)

                editor

                HStack(alignment: .center, spacing: 10) {
                    Text("\(text.count)/\(maxChars)")
                        .font(.system(size: 11, weight: .medium, design: .monospaced))
                        .foregroundStyle(text.count >= maxChars ? Theme.red : Theme.faint)
                    Spacer(minLength: 0)
                    if !saved.isEmpty {
                        resetButton
                    }
                    if edited {
                        saveButton
                    }
                }

                chips
            }
        }
        .onAppear {
            if !loaded { text = saved; loaded = true }
        }
        // Keep the editor in sync when the stored value changes underneath us
        // (reset saved, server reload, failed patch rolled back).
        .onChange(of: saved) { newValue in text = newValue }
    }

    private var editor: some View {
        ZStack(alignment: .topLeading) {
            if text.isEmpty {
                // Default text as placeholder — verbatim so **markdown** stays literal.
                Text(verbatim: template.defaultText)
                    .font(LPFont.body)
                    .foregroundStyle(Theme.faint)
                    .padding(.horizontal, 13)
                    .padding(.vertical, 16)
                    .allowsHitTesting(false)
            }
            TextEditor(text: $text)
                .frame(minHeight: 76, maxHeight: 118)   // ~3–5 lines
                .scrollContentBackground(.hidden)
                .padding(8)
                .font(LPFont.body)
                .foregroundStyle(Theme.text)
                .autocorrectionDisabled()
                .textInputAutocapitalization(.sentences)
                .onChange(of: text) { newValue in
                    if newValue.count > maxChars { text = String(newValue.prefix(maxChars)) }
                }
        }
        .background(Theme.surface)
        .overlay(RoundedRectangle(cornerRadius: Theme.Radius.sm).stroke(Theme.borderStrong, lineWidth: 1))
        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.sm))
    }

    private var saveButton: some View {
        Button {
            let value = text
            Task {
                await vm.patch(path: template.path, value: value, label: template.title) {
                    $0[keyPath: template.keyPath] = value
                }
            }
        } label: {
            HStack(spacing: 5) {
                if saving { Spinner(size: 12) } else { Image(systemName: "checkmark") }
                Text("Save")
            }
            .font(LPFont.label)
            .foregroundStyle(.white)
            .padding(.horizontal, 14).padding(.vertical, 7)
            .background(Theme.blurple)
            .clipShape(RoundedRectangle(cornerRadius: 8))
        }
        .buttonStyle(PressScaleStyle())
        .disabled(saving)
    }

    private var resetButton: some View {
        Button {
            Task {
                await vm.patch(path: template.path, value: "", label: template.title) {
                    $0[keyPath: template.keyPath] = ""
                }
            }
        } label: {
            HStack(spacing: 5) {
                Image(systemName: "arrow.uturn.backward")
                Text("Reset to default")
            }
            .font(LPFont.label)
            .foregroundStyle(Theme.muted)
            .padding(.horizontal, 12).padding(.vertical, 7)
            .background(Theme.surface)
            .overlay(RoundedRectangle(cornerRadius: 8).stroke(Theme.border, lineWidth: 1))
            .clipShape(RoundedRectangle(cornerRadius: 8))
        }
        .buttonStyle(PressScaleStyle())
        .disabled(saving)
    }

    /// Tappable variable tokens — appended to the draft on tap.
    private var chips: some View {
        FlowLayout(spacing: 6) {
            ForEach(template.variables, id: \.self) { token in
                Button {
                    insert(token)
                } label: {
                    Text(verbatim: token)
                        .font(.system(size: 11, weight: .medium, design: .monospaced))
                        .foregroundStyle(Theme.blurple)
                        .padding(.horizontal, 8).padding(.vertical, 4)
                        .background(Theme.blurple.opacity(0.08))
                        .overlay(Capsule().stroke(Theme.blurple.opacity(0.25), lineWidth: 1))
                        .clipShape(Capsule())
                }
                .buttonStyle(PressScaleStyle())
            }
        }
    }

    private func insert(_ token: String) {
        var draft = text
        if !draft.isEmpty, let last = draft.last, last != " ", last != "\n" {
            draft += " "
        }
        draft += token
        guard draft.count <= maxChars else { return }
        text = draft
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
    }
}
