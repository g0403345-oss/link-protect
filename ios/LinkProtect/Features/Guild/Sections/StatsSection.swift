import SwiftUI
import Charts

struct StatsSection: View {
    @ObservedObject var vm: GuildConfigViewModel

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack(alignment: .top) {
                SectionHeader(title: "Server Statistics",
                              subtitle: "Warning history and moderation data",
                              systemImage: "chart.bar.fill")
                Button { Task { await vm.refreshStats() } } label: {
                    Image(systemName: "arrow.clockwise").font(.system(size: 13, weight: .semibold)).foregroundStyle(Theme.faint)
                        .padding(8).background(Theme.surface)
                        .overlay(RoundedRectangle(cornerRadius: Theme.Radius.sm).stroke(Theme.borderStrong, lineWidth: 1))
                        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.sm))
                }
                .buttonStyle(PressScaleStyle())
            }

            if let stats = vm.stats {
                LazyVGrid(columns: [.init(.flexible(), spacing: 10), .init(.flexible(), spacing: 10)], spacing: 10) {
                    StatCard(label: "Total warnings", value: "\(stats.totalWarnings)", systemImage: "exclamationmark.triangle.fill", color: Theme.yellow)
                    StatCard(label: "Users warned", value: "\(stats.warnedUsers)", systemImage: "person.2.fill", color: Theme.blurple)
                    StatCard(label: "Kick threshold", value: "\(stats.kickThreshold)", systemImage: "arrow.up.forward", color: Theme.yellow)
                    StatCard(label: "Ban threshold", value: "\(stats.banThreshold)", systemImage: "nosign", color: Theme.red)
                }

                trendsCard

                DiscordCard("Top Warned Users") {
                    if stats.topWarned.isEmpty {
                        VStack(spacing: 8) {
                            Image(systemName: "checkmark.circle.fill").font(.system(size: 26)).foregroundStyle(Theme.green)
                            Text("No warned users yet").font(LPFont.caption).foregroundStyle(Theme.dim)
                        }
                        .frame(maxWidth: .infinity).padding(.vertical, 12)
                    } else {
                        let top = stats.topWarned
                        let maxWarns = max(top.first?.warnings ?? 1, 1)
                        VStack(spacing: 10) {
                            ForEach(Array(top.enumerated()), id: \.element.id) { index, user in
                                row(rank: index + 1, user: user, fraction: Double(user.warnings) / Double(maxWarns))
                            }
                        }
                    }
                }
            } else {
                Spinner().frame(maxWidth: .infinity).padding(.vertical, 40)
            }
        }
        .task {
            if vm.stats == nil { await vm.refreshStats() }
            await vm.loadTrends()
            await vm.resolveMembers((vm.stats?.topWarned ?? []).map { $0.userId })
        }
    }

    @ViewBuilder
    private var trendsCard: some View {
        if let t = vm.trends {
            DiscordCard("Activity · Last \(t.days) days") {
                VStack(alignment: .leading, spacing: 16) {
                    if t.total == 0 {
                        Text("No moderation actions in this period.")
                            .font(.system(size: 13)).foregroundStyle(Theme.faint)
                            .frame(maxWidth: .infinity).padding(.vertical, 12)
                    } else {
                        Chart(t.perDay) { day in
                            BarMark(
                                x: .value("Day", day.date),
                                y: .value("Actions", day.count)
                            )
                            .foregroundStyle(Theme.blurple)
                            .cornerRadius(3)
                        }
                        .chartXAxis(.hidden)
                        .chartYAxis {
                            AxisMarks(position: .leading) { _ in
                                AxisGridLine().foregroundStyle(Theme.border)
                                AxisValueLabel().foregroundStyle(Theme.dim)
                            }
                        }
                        .frame(height: 130)

                        if !t.topReasons.isEmpty {
                            VStack(alignment: .leading, spacing: 8) {
                                Text("TOP REASONS").font(.system(size: 11, weight: .semibold)).tracking(0.8).foregroundStyle(Theme.faint)
                                let maxR = max(t.topReasons.first?.count ?? 1, 1)
                                ForEach(t.topReasons) { r in
                                    HStack(spacing: 10) {
                                        Text(r.reason).font(.system(size: 13)).foregroundStyle(Theme.muted).lineLimit(1)
                                        Spacer(minLength: 8)
                                        GeometryReader { geo in
                                            ZStack(alignment: .leading) {
                                                Capsule().fill(Theme.surface2).frame(height: 4)
                                                Capsule().fill(Theme.blurple).frame(width: geo.size.width * Double(r.count) / Double(maxR), height: 4)
                                            }.frame(maxHeight: .infinity, alignment: .center)
                                        }.frame(width: 70, height: 16)
                                        Text("\(r.count)").font(.system(size: 13, weight: .semibold)).foregroundStyle(Theme.text).frame(minWidth: 22, alignment: .trailing)
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    private func row(rank: Int, user: GuildStats.TopWarned, fraction: Double) -> some View {
        HStack(spacing: 10) {
            ZStack {
                Circle().fill(rankColor(rank).opacity(0.15)).frame(width: 26, height: 26)
                Text("\(rank)").font(LPFont.tiny).foregroundStyle(rankColor(rank))
            }
            VStack(alignment: .leading, spacing: 1) {
                Text(vm.memberNames[user.userId] ?? user.userId)
                    .font(vm.memberNames[user.userId] != nil ? LPFont.caption : LPFont.caption.monospaced())
                    .foregroundStyle(vm.memberNames[user.userId] != nil ? Theme.text : Theme.muted).lineLimit(1)
                if let reason = user.reasons.last {
                    Text(reason).font(LPFont.tiny).fontWeight(.regular).foregroundStyle(Theme.dim).lineLimit(1)
                }
            }
            Spacer(minLength: 8)
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    Capsule().fill(Theme.surface3).frame(height: 4)
                    Capsule().fill(Theme.blurple).frame(width: geo.size.width * fraction, height: 4)
                }
                .frame(maxHeight: .infinity, alignment: .center)
            }
            .frame(width: 64, height: 26)
            Text("\(user.warnings)").font(LPFont.bodyStrong).foregroundStyle(Theme.text).frame(minWidth: 24, alignment: .trailing)
        }
    }

    private func rankColor(_ rank: Int) -> Color {
        switch rank { case 1: return Theme.yellow; case 2: return Theme.muted; default: return Theme.dim }
    }
}
