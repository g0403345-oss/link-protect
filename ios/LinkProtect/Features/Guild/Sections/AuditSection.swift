import SwiftUI

/// Server-specific audit log: who changed which setting, and when. Mirrors the
/// website's Audit Log tab. Read-only.
struct AuditSection: View {
    @ObservedObject var vm: GuildConfigViewModel

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            SectionHeader(title: "Audit Log",
                          subtitle: "Who changed which setting, and when",
                          systemImage: "doc.text.magnifyingglass")

            DiscordCard(vm.audit.isEmpty ? "Recent Changes" : "Recent Changes (\(vm.audit.count))") {
                if vm.audit.isEmpty {
                    VStack(spacing: 8) {
                        Image(systemName: "doc.text.magnifyingglass")
                            .font(.system(size: 26)).foregroundStyle(Theme.surface3)
                        Text("No setting changes recorded yet")
                            .font(LPFont.caption).foregroundStyle(Theme.dim)
                    }
                    .frame(maxWidth: .infinity).padding(.vertical, 20)
                } else {
                    VStack(spacing: 2) {
                        ForEach(vm.audit) { entry in
                            AuditRow(entry: entry)
                        }
                    }
                }
            }
        }
        .task { await vm.loadAudit() }
    }
}

private struct AuditRow: View {
    let entry: AuditEntry

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            ZStack {
                Circle().fill(Theme.surface3).frame(width: 28, height: 28)
                Text(entry.actor.prefix(2).uppercased())
                    .font(LPFont.tiny).foregroundStyle(Theme.faint)
            }
            VStack(alignment: .leading, spacing: 2) {
                Text(entry.description).font(LPFont.bodyStrong).foregroundStyle(Theme.text)
                    .fixedSize(horizontal: false, vertical: true)
                Text("\(entry.actor) · \(entry.relativeTime)")
                    .font(LPFont.tiny).fontWeight(.regular).foregroundStyle(Theme.dim)
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 10).padding(.vertical, 8)
    }
}
