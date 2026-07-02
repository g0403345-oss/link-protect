import SwiftUI

/// Lets any signed-in user report a malicious link, false positive, bug or
/// feedback. Submissions land in the operator's admin panel (web + app).
struct ReportFormView: View {
    let api: APIClient
    var guildId: String? = nil
    @Environment(\.dismiss) private var dismiss

    @State private var type = "malicious_link"
    @State private var url = ""
    @State private var category = "scam"
    @State private var message = ""
    @State private var submitting = false
    @State private var done = false
    @State private var error: String?

    private let types: [(id: String, label: String, icon: String, needsUrl: Bool)] = [
        ("malicious_link", "Malicious link", "exclamationmark.shield.fill", true),
        ("false_positive", "False positive", "shield.slash.fill", true),
        ("bug", "Bug / error", "ladybug.fill", false),
        ("feedback", "Feedback", "bubble.left.fill", false),
    ]
    private let categories = ["scam", "phishing", "malware", "nitro"]
    private var needsUrl: Bool { types.first { $0.id == type }?.needsUrl ?? false }

    var body: some View {
        NavigationStack {
            ZStack {
                AppBackgroundView()
                if done {
                    VStack(spacing: 12) {
                        Image(systemName: "checkmark.circle.fill").font(.system(size: 46)).foregroundStyle(Theme.green)
                        Text("Thanks — report sent!").font(.system(size: 17, weight: .semibold)).foregroundStyle(Theme.text)
                        Text("Our team will take a look.").font(LPFont.caption).foregroundStyle(Theme.dim)
                    }
                } else {
                    ScrollView {
                        VStack(alignment: .leading, spacing: 16) {
                            DiscordCard("What's this about?") {
                                LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 8) {
                                    ForEach(types, id: \.id) { t in
                                        let active = type == t.id
                                        Button { type = t.id } label: {
                                            VStack(alignment: .leading, spacing: 5) {
                                                Image(systemName: t.icon).font(.system(size: 15)).foregroundStyle(active ? Theme.blurple : Theme.muted)
                                                Text(t.label).font(.system(size: 12.5, weight: .semibold)).foregroundStyle(active ? Theme.text : Theme.muted)
                                            }
                                            .frame(maxWidth: .infinity, alignment: .leading)
                                            .padding(11)
                                            .background(active ? Theme.blurple.opacity(0.1) : Theme.surface)
                                            .overlay(RoundedRectangle(cornerRadius: Theme.Radius.sm).stroke(active ? Theme.blurple : Theme.borderStrong, lineWidth: 1))
                                            .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.sm))
                                        }
                                        .buttonStyle(.plain)
                                    }
                                }
                            }

                            if needsUrl {
                                DiscordCard("Link") {
                                    TextField("https://…", text: $url)
                                        .textInputAutocapitalization(.never).autocorrectionDisabled().keyboardType(.URL)
                                        .font(LPFont.body).foregroundStyle(Theme.text)
                                        .padding(.horizontal, 12).padding(.vertical, 10)
                                        .background(Theme.surface)
                                        .overlay(RoundedRectangle(cornerRadius: Theme.Radius.sm).stroke(Theme.borderStrong, lineWidth: 1))
                                        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.sm))
                                }
                            }

                            if type == "malicious_link" {
                                DiscordCard("Threat type") {
                                    FlowLayout(spacing: 6) {
                                        ForEach(categories, id: \.self) { c in
                                            let active = category == c
                                            Button { category = c } label: {
                                                Text(c).font(.system(size: 12, weight: .semibold))
                                                    .foregroundStyle(active ? Theme.blurple : Theme.muted)
                                                    .padding(.horizontal, 12).padding(.vertical, 6)
                                                    .background(active ? Theme.blurple.opacity(0.15) : Color.clear)
                                                    .overlay(Capsule().stroke(active ? Theme.blurple : Theme.borderStrong, lineWidth: 1))
                                                    .clipShape(Capsule())
                                            }
                                            .buttonStyle(.plain)
                                        }
                                    }
                                }
                            }

                            DiscordCard(needsUrl ? "Details (optional)" : "Details") {
                                TextEditor(text: $message)
                                    .frame(minHeight: 90)
                                    .scrollContentBackground(.hidden)
                                    .padding(8)
                                    .background(Theme.surface)
                                    .overlay(RoundedRectangle(cornerRadius: Theme.Radius.sm).stroke(Theme.borderStrong, lineWidth: 1))
                                    .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.sm))
                                    .font(LPFont.body).foregroundStyle(Theme.text)
                            }

                            if let error {
                                Text(error).font(LPFont.caption).foregroundStyle(Theme.red)
                            }

                            PrimaryButton(title: submitting ? "Sending…" : "Send report", systemImage: "flag.fill") {
                                Task { await submit() }
                            }
                            .disabled(submitting)
                        }
                        .padding(16)
                    }
                }
            }
            .navigationTitle("Report")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) { Button("Cancel") { dismiss() }.tint(Theme.blurple) }
            }
        }
    }

    private func submit() async {
        let trimmedUrl = url.trimmingCharacters(in: .whitespaces)
        let trimmedMsg = message.trimmingCharacters(in: .whitespaces)
        if needsUrl && trimmedUrl.isEmpty { error = "Please enter the link."; return }
        if !needsUrl && trimmedMsg.isEmpty { error = "Please describe it."; return }
        submitting = true; error = nil
        do {
            try await api.submitReport(
                type: type,
                url: needsUrl ? trimmedUrl : nil,
                category: type == "malicious_link" ? category : nil,
                message: trimmedMsg.isEmpty ? nil : trimmedMsg,
                guildId: guildId
            )
            done = true
            try? await Task.sleep(nanoseconds: 1_200_000_000)
            dismiss()
        } catch {
            self.error = (error as? LocalizedError)?.errorDescription ?? "Couldn't send — try again."
            submitting = false
        }
    }
}
