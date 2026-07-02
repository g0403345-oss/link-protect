import SwiftUI

struct AccessSection: View {
    @ObservedObject var vm: GuildConfigViewModel

    private var channel: ServerData.Channels { vm.data?.channel ?? ServerData.Channels() }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            SectionHeader(title: "Access Control",
                          subtitle: "Whitelist channels, members or roles from link restrictions",
                          systemImage: "lock.fill")

            InfoBox("Whitelisted items bypass all link restrictions.")

            PickerList(vm: vm, type: .channel, title: "Whitelisted Channels",
                       description: "Links are allowed in these channels",
                       systemImage: "number", color: Theme.blurple,
                       value: channel.channel, path: "channel.channel", label: "Whitelisted channels") {
                $0.channel.channel = $1
            }
            PickerList(vm: vm, type: .category, title: "Whitelisted Categories",
                       description: "Links are allowed under these categories",
                       systemImage: "folder.fill", color: Theme.purple,
                       value: channel.category, path: "channel.category", label: "Whitelisted categories") {
                $0.channel.category = $1
            }
            PickerList(vm: vm, type: .member, title: "Whitelisted Members",
                       description: "These users can post any links",
                       systemImage: "person.fill", color: Theme.green,
                       value: channel.member, path: "channel.member", label: "Whitelisted members") {
                $0.channel.member = $1
            }
            PickerList(vm: vm, type: .role, title: "Whitelisted Roles",
                       description: "Members with these roles can post any links",
                       systemImage: "shield.fill", color: Theme.yellow,
                       value: channel.role, path: "channel.role", label: "Whitelisted roles") {
                $0.channel.role = $1
            }

            AllowlistCard(vm: vm)

            TeamAccessCard(vm: vm)
        }
        // Resolve channel/role names up-front so existing whitelist chips show
        // friendly names immediately (not raw IDs) — matching the web dashboard.
        .task { await vm.loadChannels(); await vm.loadRoles(); await vm.loadEditors() }
    }
}

/// Trusted domains that bypass blocking (per-server allowlist). Mirrors the
/// custom blacklist editor, but writes to `link.allow`.
private struct AllowlistCard: View {
    @ObservedObject var vm: GuildConfigViewModel
    @State private var newDomain = ""
    @FocusState private var focused: Bool

    private var allow: [String] { vm.data?.link.allow ?? [] }
    private var trimmed: String { newDomain.trimmingCharacters(in: .whitespaces).lowercased() }

    var body: some View {
        DiscordCard(allow.isEmpty ? "Allowlisted Domains" : "Allowlisted Domains (\(allow.count))") {
            VStack(alignment: .leading, spacing: 14) {
                Text("Trusted domains that bypass blocking — including the malware/phishing scanner. Subdomains are covered too.")
                    .font(LPFont.caption).foregroundStyle(Theme.dim)
                HStack(spacing: 8) {
                    TextField("youtube.com", text: $newDomain)
                        .focused($focused)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .keyboardType(.URL)
                        .font(LPFont.body)
                        .foregroundStyle(Theme.text)
                        .padding(.horizontal, 12).padding(.vertical, 10)
                        .background(Theme.surface)
                        .overlay(RoundedRectangle(cornerRadius: Theme.Radius.sm)
                            .stroke(focused ? Theme.green : Theme.borderStrong, lineWidth: 1))
                        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.sm))
                        .onSubmit(add)
                    Button(action: add) {
                        Image(systemName: "plus").font(.system(size: 15, weight: .bold)).foregroundStyle(.white)
                            .padding(.horizontal, 16).padding(.vertical, 11)
                            .background(Theme.green)
                            .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.sm))
                    }
                    .buttonStyle(PressScaleStyle())
                    .disabled(trimmed.isEmpty)
                    .opacity(trimmed.isEmpty ? 0.4 : 1)
                }
                if allow.isEmpty {
                    Text("No trusted domains yet").font(LPFont.caption).foregroundStyle(Theme.faint)
                        .frame(maxWidth: .infinity).padding(.vertical, 8)
                } else {
                    VStack(spacing: 4) {
                        ForEach(allow, id: \.self) { dom in
                            HStack {
                                Text(dom).font(LPFont.caption.monospaced()).foregroundStyle(Theme.green)
                                Spacer(minLength: 0)
                                Button { remove(dom) } label: {
                                    Image(systemName: "trash").font(.system(size: 12)).foregroundStyle(Theme.dim)
                                }.buttonStyle(.plain)
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

    private func add() {
        let dom = trimmed
        guard !dom.isEmpty, !allow.contains(dom) else { return }
        focused = false
        let updated = allow + [dom]
        newDomain = ""
        Task { await vm.patch(path: "link.allow", value: updated, label: "Allowlist") { $0.link.allow = updated } }
    }

    private func remove(_ dom: String) {
        let updated = allow.filter { $0 != dom }
        Task { await vm.patch(path: "link.allow", value: updated, label: "Allowlist") { $0.link.allow = updated } }
    }
}

/// Delegate dashboard/app access to specific users by Discord ID — without
/// making them a Discord admin. Owners manage the list; editors only get access.
private struct TeamAccessCard: View {
    @ObservedObject var vm: GuildConfigViewModel
    @State private var showAdd = false

    var body: some View {
        DiscordCard("Team Access") {
            VStack(alignment: .leading, spacing: 12) {
                InfoBox("Give specific people access to this server's dashboard & app without making them a Discord admin. They can change settings but can't manage this team.")

                if vm.editors.isEmpty {
                    Text("No extra members — only owner & Manage Server have access.")
                        .font(LPFont.caption).foregroundStyle(Theme.faint)
                } else {
                    ForEach(vm.editors) { editor in
                        HStack(spacing: 10) {
                            GuildIcon(name: editor.displayName, url: editor.avatarURL, size: 28)
                                .clipShape(Circle())
                            VStack(alignment: .leading, spacing: 1) {
                                Text(editor.displayName).font(LPFont.bodyStrong).foregroundStyle(Theme.text).lineLimit(1)
                                Text(editor.id).font(LPFont.tiny.monospaced()).foregroundStyle(Theme.dim)
                            }
                            Spacer(minLength: 0)
                            Button { Task { await vm.removeEditor(editor.id) } } label: {
                                Image(systemName: "xmark.circle.fill").foregroundStyle(Theme.dim)
                            }
                            .buttonStyle(.plain).disabled(vm.editorsSaving)
                        }
                        .padding(10)
                        .background(Theme.surface)
                        .overlay(RoundedRectangle(cornerRadius: 8).stroke(Theme.borderStrong, lineWidth: 1))
                        .clipShape(RoundedRectangle(cornerRadius: 8))
                    }
                }

                Button { showAdd = true } label: {
                    Label("Add member", systemImage: "plus").font(LPFont.label).foregroundStyle(Theme.blurple)
                }
                .buttonStyle(.plain)
                .disabled(vm.editorsSaving)
            }
        }
        .sheet(isPresented: $showAdd) {
            AddPickerSheet(vm: vm, type: .member, color: Theme.blurple, selected: vm.editors.map(\.id)) { id in
                Task { await vm.addEditor(id) }
            }
        }
    }
}

enum PickerType { case channel, category, member, role }

/// A labelled set of whitelisted Discord IDs, rendered as removable chips with
/// an "Add" sheet that resolves friendly names (channels/roles) or searches
/// members live.
struct PickerList: View {
    @ObservedObject var vm: GuildConfigViewModel
    let type: PickerType
    let title: String
    let description: String
    let systemImage: String
    let color: Color
    let value: [String]
    let path: String
    let label: String
    let apply: (inout ServerData, [String]) -> Void

    @State private var showAdd = false

    var body: some View {
        DiscordCard(title) {
            VStack(alignment: .leading, spacing: 12) {
                Text(description).font(LPFont.caption).foregroundStyle(Theme.dim)

                if value.isEmpty {
                    Text("None whitelisted").font(LPFont.caption).foregroundStyle(Theme.faint)
                } else {
                    FlowLayout(spacing: 6) {
                        ForEach(value, id: \.self) { id in
                            chip(for: id)
                        }
                    }
                }

                Button { showAdd = true } label: {
                    Label("Add", systemImage: "plus")
                        .font(LPFont.label).foregroundStyle(color)
                }
                .buttonStyle(.plain)
            }
        }
        .sheet(isPresented: $showAdd) {
            AddPickerSheet(vm: vm, type: type, color: color, selected: value) { newId in
                guard !value.contains(newId) else { return }
                save(value + [newId])
            }
        }
        // Resolve member names so chips show who they are, not raw IDs.
        .task(id: value) { if type == .member { await vm.resolveMembers(value) } }
    }

    private func chip(for id: String) -> some View {
        HStack(spacing: 6) {
            Text(displayName(for: id)).font(LPFont.caption).foregroundStyle(Theme.text).lineLimit(1)
            Button {
                save(value.filter { $0 != id })
            } label: {
                Image(systemName: "xmark").font(.system(size: 9, weight: .bold)).foregroundStyle(Theme.dim)
            }
            .buttonStyle(.plain)
        }
        .padding(.leading, 10).padding(.trailing, 7).padding(.vertical, 5)
        .background(color.opacity(0.10))
        .overlay(Capsule().stroke(color.opacity(0.25), lineWidth: 1))
        .clipShape(Capsule())
    }

    private func displayName(for id: String) -> String {
        switch type {
        case .channel: return vm.channels?.first { $0.id == id }.map { "#\($0.name)" } ?? "#\(id.suffix(4))"
        case .category: return vm.channels?.first { $0.id == id }?.name ?? id
        case .role: return vm.roles?.first { $0.id == id }.map { "@\($0.name)" } ?? "@\(id.suffix(4))"
        case .member: return vm.memberNames[id] ?? "@\(id.suffix(4))"
        }
    }

    private func save(_ newValue: [String]) {
        Task { await vm.patch(path: path, value: newValue, label: label) { apply(&$0, newValue) } }
    }
}
