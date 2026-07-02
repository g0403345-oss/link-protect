import SwiftUI

/// Watch app: bot status, totals, and the user's servers — fed live from the
/// iPhone over WatchConnectivity (see WatchSync).
struct WatchRootView: View {
    @EnvironmentObject private var sync: WatchSync
    private var snap: LPWidgetSnapshot { sync.snapshot }

    var body: some View {
        NavigationStack {
            List {
                if !snap.signedIn {
                    Section {
                        Label("Open Link Protect on your iPhone to sign in.", systemImage: "iphone")
                            .font(.system(size: 14))
                    }
                } else {
                    Section {
                        HStack {
                            Image(systemName: snap.botOnline ? "checkmark.shield.fill" : "exclamationmark.shield.fill")
                                .foregroundStyle(snap.botOnline ? .green : .red)
                            Text(snap.botOnline ? "Online" : "Offline").fontWeight(.semibold)
                            Spacer()
                            Text("\(snap.serverCount)").fontWeight(.bold)
                            Text(snap.serverCount == 1 ? "server" : "servers")
                                .font(.system(size: 12)).foregroundStyle(.secondary)
                        }
                        HStack(spacing: 0) {
                            stat("shield.fill", .green, snap.totalBlockers, "Blockers")
                            stat("exclamationmark.triangle.fill", .yellow, snap.totalWarned, "Warned")
                        }
                    }

                    if !snap.servers.isEmpty {
                        Section("Servers") {
                            ForEach(snap.servers) { s in
                                VStack(alignment: .leading, spacing: 3) {
                                    Text(s.name).font(.system(size: 15, weight: .medium)).lineLimit(1)
                                    HStack(spacing: 12) {
                                        Label("\(s.blockers)", systemImage: "shield.fill").foregroundStyle(.green)
                                        Label("\(s.warned)", systemImage: "exclamationmark.triangle.fill").foregroundStyle(.yellow)
                                    }
                                    .font(.system(size: 12))
                                }
                                .padding(.vertical, 2)
                            }
                        }
                    }
                }
            }
            .navigationTitle("Link Protect")
        }
    }

    private func stat(_ icon: String, _ color: Color, _ value: Int, _ label: String) -> some View {
        VStack(spacing: 2) {
            Image(systemName: icon).foregroundStyle(color)
            Text("\(value)").fontWeight(.bold)
            Text(label).font(.system(size: 10)).foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity)
    }
}
