import SwiftUI

/// The "Add to whitelist" sheet. Channels/categories/roles come from the cached
/// guild lists; members are searched live against the bot API.
struct AddPickerSheet: View {
    @ObservedObject var vm: GuildConfigViewModel
    let type: PickerType
    let color: Color
    let selected: [String]
    /// When set (channel picker only), show just text/announcement channels the
    /// bot can actually post to — used by the warn-log picker.
    var textOnly: Bool = false
    let onPick: (String) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var query = ""
    @State private var members: [DiscordMember] = []
    @State private var searching = false
    @State private var loading = true

    var body: some View {
        NavigationStack {
            ZStack {
                AppBackgroundView()
                Group {
                    if type == .member { memberSearch }
                    else { staticList }
                }
            }
            .navigationTitle(navTitle)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .topBarTrailing) { Button("Done") { dismiss() }.tint(Theme.muted) } }
        }
        .task { await loadOptions() }
    }

    private var navTitle: String {
        switch type {
        case .channel: return "Add Channel"
        case .category: return "Add Category"
        case .role: return "Add Role"
        case .member: return "Add Member"
        }
    }

    // MARK: Static lists (channels / categories / roles)

    @ViewBuilder
    private var staticList: some View {
        if loading {
            Spinner()
        } else {
            ScrollView {
                LazyVStack(spacing: 6) {
                    ForEach(rows, id: \.id) { row in
                        optionButton(id: row.id, title: row.title, swatch: row.swatch)
                    }
                    if rows.isEmpty {
                        Text("Nothing to add").font(LPFont.caption).foregroundStyle(Theme.dim).padding(.top, 40)
                    }
                }
                .padding(16)
            }
        }
    }

    private struct Row { let id: String; let title: String; let swatch: Color? }

    private var rows: [Row] {
        switch type {
        case .channel:
            return (vm.channels ?? [])
                .filter { textOnly ? ($0.type == 0 || $0.type == 5) : !$0.isCategory }
                .map { Row(id: $0.id, title: "#\($0.name)", swatch: nil) }
        case .category:
            return (vm.channels ?? []).filter { $0.isCategory }
                .map { Row(id: $0.id, title: $0.name.uppercased(), swatch: nil) }
        case .role:
            return (vm.roles ?? []).map { Row(id: $0.id, title: $0.name, swatch: $0.swiftColor) }
        case .member:
            return []
        }
    }

    // MARK: Member search

    private var memberSearch: some View {
        VStack(spacing: 0) {
            HStack(spacing: 8) {
                Image(systemName: "magnifyingglass").foregroundStyle(Theme.dim)
                TextField("Search members…", text: $query)
                    .textInputAutocapitalization(.never)
                    .foregroundStyle(Theme.text)
                    .onChange(of: query) { _ in Task { await runSearch() } }
            }
            .padding(12)
            .background(Theme.surface)
            .overlay(RoundedRectangle(cornerRadius: 8).stroke(Theme.borderStrong, lineWidth: 1))
            .clipShape(RoundedRectangle(cornerRadius: 8))
            .padding(16)

            if searching {
                Spinner(size: 22).padding(.top, 30)
            }
            ScrollView {
                LazyVStack(spacing: 6) {
                    ForEach(members) { member in
                        optionButton(id: member.id, title: member.displayName, swatch: nil, subtitle: member.id)
                    }
                    if !query.isEmpty && members.isEmpty && !searching {
                        Text("No members found").font(LPFont.caption).foregroundStyle(Theme.dim).padding(.top, 30)
                    }
                }
                .padding(.horizontal, 16)
            }
            Spacer()
        }
    }

    // MARK: Shared row

    private func optionButton(id: String, title: String, swatch: Color?, subtitle: String? = nil) -> some View {
        let already = selected.contains(id)
        return Button {
            onPick(id); dismiss()
        } label: {
            HStack(spacing: 10) {
                if let swatch { Circle().fill(swatch).frame(width: 12, height: 12) }
                VStack(alignment: .leading, spacing: 1) {
                    Text(title).font(LPFont.bodyStrong).foregroundStyle(Theme.text).lineLimit(1)
                    if let subtitle { Text(subtitle).font(LPFont.tiny).fontWeight(.regular).foregroundStyle(Theme.dim) }
                }
                Spacer(minLength: 0)
                Image(systemName: already ? "checkmark.circle.fill" : "plus.circle")
                    .foregroundStyle(already ? Theme.green : color)
            }
            .padding(12)
            .background(Theme.surface)
            .overlay(RoundedRectangle(cornerRadius: 8).stroke(Theme.border, lineWidth: 1))
            .clipShape(RoundedRectangle(cornerRadius: 8))
            .opacity(already ? 0.5 : 1)
        }
        .buttonStyle(PressScaleStyle())
        .disabled(already)
    }

    // MARK: Loading

    private func loadOptions() async {
        switch type {
        case .channel, .category: await vm.loadChannels()
        case .role: await vm.loadRoles()
        case .member: break
        }
        loading = false
    }

    private func runSearch() async {
        let q = query.trimmingCharacters(in: .whitespaces)
        guard q.count >= 1 else { members = []; return }
        searching = true
        let result = await vm.searchMembers(q)
        // Ignore stale responses if the query moved on.
        if q == query.trimmingCharacters(in: .whitespaces) {
            members = result
            searching = false
        }
    }
}
