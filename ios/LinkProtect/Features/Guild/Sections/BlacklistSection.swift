import SwiftUI

struct BlacklistSection: View {
    @ObservedObject var vm: GuildConfigViewModel
    @State private var newLink = ""
    @FocusState private var focused: Bool

    private var links: [String] { vm.data?.link.links ?? [] }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            SectionHeader(title: "Custom Blacklist",
                          subtitle: "Add specific domains or URLs to always block",
                          systemImage: "list.bullet")

            DiscordCard(links.isEmpty ? "Blacklisted Links" : "Blacklisted Links (\(links.count))") {
                VStack(spacing: 14) {
                    HStack(spacing: 8) {
                        TextField("example.com", text: $newLink)
                            .focused($focused)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                            .keyboardType(.URL)
                            .font(LPFont.body)
                            .foregroundStyle(Theme.text)
                            .padding(.horizontal, 12).padding(.vertical, 10)
                            .background(Theme.surface)
                            .overlay(RoundedRectangle(cornerRadius: Theme.Radius.sm)
                                .stroke(focused ? Theme.blurple : Theme.borderStrong, lineWidth: 1))
                            .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.sm))
                            .onSubmit(add)

                        Button(action: add) {
                            Image(systemName: "plus").font(.system(size: 15, weight: .bold)).foregroundStyle(.white)
                                .padding(.horizontal, 16).padding(.vertical, 11)
                                .background(Theme.blurple)
                                .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.sm))
                        }
                        .buttonStyle(PressScaleStyle())
                        .disabled(trimmed.isEmpty)
                        .opacity(trimmed.isEmpty ? 0.4 : 1)
                    }

                    if links.isEmpty {
                        VStack(spacing: 8) {
                            Image(systemName: "list.bullet").font(.system(size: 24)).foregroundStyle(Theme.surface3)
                            Text("No links blacklisted yet").font(LPFont.caption).foregroundStyle(Theme.dim)
                        }
                        .frame(maxWidth: .infinity).padding(.vertical, 16)
                    } else {
                        VStack(spacing: 4) {
                            ForEach(links, id: \.self) { link in
                                HStack {
                                    Text(link).font(LPFont.caption.monospaced()).foregroundStyle(Theme.muted)
                                    Spacer(minLength: 0)
                                    Button { remove(link) } label: {
                                        Image(systemName: "trash").font(.system(size: 12)).foregroundStyle(Theme.dim)
                                    }
                                    .buttonStyle(.plain)
                                }
                                .padding(.horizontal, 12).padding(.vertical, 9)
                                .background(Theme.surface)
                                .overlay(RoundedRectangle(cornerRadius: Theme.Radius.sm).stroke(Theme.borderStrong, lineWidth: 1))
                                .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.sm))
                            }
                        }
                    }
                }
            }
        }
    }

    private var trimmed: String { newLink.trimmingCharacters(in: .whitespaces) }

    private func add() {
        let link = trimmed
        guard !link.isEmpty, !links.contains(link) else { return }
        focused = false
        let updated = links + [link]
        newLink = ""
        Task { await vm.patch(path: "link.links", value: updated, label: "Blacklist") { $0.link.links = updated } }
    }

    private func remove(_ link: String) {
        let updated = links.filter { $0 != link }
        Task { await vm.patch(path: "link.links", value: updated, label: "Blacklist") { $0.link.links = updated } }
    }
}
