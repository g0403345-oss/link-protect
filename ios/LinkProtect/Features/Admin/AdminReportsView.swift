import SwiftUI

/// Super-admin reports inbox — mirrors the website's admin "Reports" tab.
/// Lists user-submitted reports with status filters and per-report actions.
struct AdminReportsView: View {
    @ObservedObject var vm: AdminViewModel

    private let statuses = ["open", "reviewed", "resolved", "dismissed", ""]

    var body: some View {
        VStack(spacing: 12) {
            // status filter chips
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 6) {
                    ForEach(statuses, id: \.self) { s in
                        let active = vm.reportStatus == s
                        let count = s.isEmpty ? 0 : (vm.reportCounts[s] ?? 0)
                        Button { Task { await vm.setReportStatus(s) } } label: {
                            Text(s.isEmpty ? "all" : (count > 0 ? "\(s) \(count)" : s))
                                .font(.system(size: 12, weight: .semibold))
                                .foregroundStyle(active ? Theme.blurple : Theme.faint)
                                .padding(.horizontal, 12).padding(.vertical, 6)
                                .background(active ? Theme.blurple.opacity(0.15) : Color.clear)
                                .overlay(Capsule().stroke(active ? Theme.blurple : Theme.borderStrong, lineWidth: 1))
                                .clipShape(Capsule())
                        }
                        .buttonStyle(.plain)
                        .textCase(.lowercase)
                    }
                }
            }

            ScrollView {
                if vm.reportsLoading && vm.reports.isEmpty {
                    Spinner().padding(.top, 40)
                } else if vm.reports.isEmpty {
                    VStack(spacing: 8) {
                        Image(systemName: "flag").font(.system(size: 28)).foregroundStyle(Theme.dim)
                        Text("No reports here").font(.system(size: 14)).foregroundStyle(Theme.faint)
                    }
                    .frame(maxWidth: .infinity).padding(.top, 60)
                } else {
                    VStack(spacing: 10) {
                        ForEach(vm.reports) { r in
                            AdminReportRow(vm: vm, report: r)
                        }
                    }
                }
            }
        }
        .task { await vm.loadReports() }
    }
}

private struct AdminReportRow: View {
    @ObservedObject var vm: AdminViewModel
    let report: Report

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                Text(report.typeLabel)
                    .font(.system(size: 11, weight: .bold))
                    .foregroundStyle(report.typeColor)
                    .padding(.horizontal, 8).padding(.vertical, 3)
                    .background(report.typeColor.opacity(0.12))
                    .overlay(Capsule().stroke(report.typeColor.opacity(0.3), lineWidth: 1))
                    .clipShape(Capsule())
                if let c = report.category {
                    Text(c).font(.system(size: 11)).foregroundStyle(Theme.muted)
                }
                Text(report.status.capitalized)
                    .font(.system(size: 11, weight: .semibold)).foregroundStyle(report.statusColor)
                Spacer(minLength: 0)
                Text(report.relativeTime).font(.system(size: 11)).foregroundStyle(Theme.dim)
            }

            if let url = report.url {
                Text(url).font(LPFont.caption.monospaced()).foregroundStyle(Theme.text).lineLimit(2)
            }
            if let msg = report.message, !msg.isEmpty {
                Text(msg).font(.system(size: 13)).foregroundStyle(Theme.muted).lineLimit(4)
            }

            Text("by \(report.username ?? "…\(report.userId.suffix(4))")")
                .font(.system(size: 11)).foregroundStyle(Theme.dim)

            // actions
            HStack(spacing: 8) {
                if report.type == "malicious_link" {
                    actionButton("Add to threat DB", "shield.lefthalf.filled", Theme.red) {
                        Task { await vm.actOnReport(report.id, status: "resolved", promote: true) }
                    }
                }
                actionButton("Resolve", "checkmark", Theme.green) {
                    Task { await vm.actOnReport(report.id, status: "resolved") }
                }
                actionButton("Dismiss", "archivebox", Theme.muted) {
                    Task { await vm.actOnReport(report.id, status: "dismissed") }
                }
            }
        }
        .padding(14)
        .cardSurface()
    }

    private func actionButton(_ title: String, _ icon: String, _ color: Color, _ action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Label(title, systemImage: icon)
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(color)
                .padding(.horizontal, 11).padding(.vertical, 7)
                .background(color.opacity(0.1))
                .overlay(RoundedRectangle(cornerRadius: 7).stroke(color.opacity(0.3), lineWidth: 1))
                .clipShape(RoundedRectangle(cornerRadius: 7))
        }
        .buttonStyle(.plain)
    }
}
