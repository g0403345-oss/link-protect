import WidgetKit
import SwiftUI

struct LPEntry: TimelineEntry {
    let date: Date
    let snapshot: LPWidgetSnapshot
}

struct LPProvider: TimelineProvider {
    func placeholder(in context: Context) -> LPEntry { LPEntry(date: Date(), snapshot: .placeholder) }
    func getSnapshot(in context: Context, completion: @escaping (LPEntry) -> Void) {
        completion(LPEntry(date: Date(), snapshot: LPWidgetStore.load()))
    }
    func getTimeline(in context: Context, completion: @escaping (Timeline<LPEntry>) -> Void) {
        let entry = LPEntry(date: Date(), snapshot: LPWidgetStore.load())
        let next = Calendar.current.date(byAdding: .minute, value: 30, to: Date()) ?? Date().addingTimeInterval(1800)
        completion(Timeline(entries: [entry], policy: .after(next)))
    }
}

struct StatusWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "LinkProtectStatus", provider: LPProvider()) { entry in
            LPWidgetView(snapshot: entry.snapshot)
        }
        .configurationDisplayName("Overview")
        .description("Bot status and your servers at a glance.")
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
    }
}

struct LPWidgetView: View {
    let snapshot: LPWidgetSnapshot
    @Environment(\.widgetFamily) private var family

    var body: some View {
        Group {
            if !snapshot.signedIn {
                signedOut
            } else {
                switch family {
                case .systemSmall: small
                case .systemLarge: large
                default: medium
                }
            }
        }
        .widgetBackgroundCompat(wBG)
    }

    // MARK: shared pieces

    private var logo: some View {
        Image("Logo").resizable().scaledToFit().frame(width: 20, height: 20)
            .clipShape(RoundedRectangle(cornerRadius: 5, style: .continuous))
    }

    private func header(compact: Bool) -> some View {
        HStack(spacing: 7) {
            logo
            if !compact {
                Text("Link Protect").font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(wText).lineLimit(1)
            }
            Spacer(minLength: 4)
            statusPill(compact: compact)
        }
    }

    private func statusPill(compact: Bool) -> some View {
        HStack(spacing: 4) {
            Circle().fill(snapshot.botOnline ? wGreen : wRed).frame(width: 6, height: 6)
            if !compact {
                Text(snapshot.botOnline ? "Online" : "Offline")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(snapshot.botOnline ? wGreen : wRed)
                    .lineLimit(1).fixedSize()
            }
        }
    }

    /// A bordered metric tile — gives medium/large structure so they never look empty.
    private func tile(_ value: Int, _ label: String, _ icon: String, _ color: Color) -> some View {
        VStack(alignment: .leading, spacing: 5) {
            Image(systemName: icon).font(.system(size: 13, weight: .semibold)).foregroundStyle(color)
            Text("\(value)").font(.system(size: 22, weight: .bold)).foregroundStyle(wText)
                .minimumScaleFactor(0.6).lineLimit(1)
            Text(label).font(.system(size: 10, weight: .medium)).foregroundStyle(wFaint).lineLimit(1)
        }
        .padding(.vertical, 9).padding(.horizontal, 10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 11, style: .continuous).fill(Color.white.opacity(0.05)))
        .overlay(RoundedRectangle(cornerRadius: 11, style: .continuous).stroke(Color.white.opacity(0.06), lineWidth: 1))
    }

    private func miniStat(_ icon: String, _ color: Color, _ value: Int) -> some View {
        HStack(spacing: 4) {
            Image(systemName: icon).font(.system(size: 10)).foregroundStyle(color)
            Text("\(value)").font(.system(size: 13, weight: .semibold)).foregroundStyle(wText)
        }
    }

    private var footer: some View {
        HStack(spacing: 5) {
            Image(systemName: snapshot.botOnline ? "checkmark.shield.fill" : "exclamationmark.shield.fill")
                .font(.system(size: 10)).foregroundStyle(snapshot.botOnline ? wGreen : wRed)
            Text(snapshot.botOnline ? "Protection active" : "Bot offline")
                .font(.system(size: 11)).foregroundStyle(wMuted).lineLimit(1)
            Spacer(minLength: 4)
            Text(snapshot.updated, style: .time).font(.system(size: 11)).foregroundStyle(wFaint)
        }
    }

    // MARK: sizes

    private var small: some View {
        VStack(alignment: .leading, spacing: 0) {
            header(compact: true)
            Spacer(minLength: 6)
            Text("\(snapshot.serverCount)").font(.system(size: 42, weight: .bold)).foregroundStyle(wText)
                .minimumScaleFactor(0.6).lineLimit(1)
            Text(snapshot.serverCount == 1 ? "server protected" : "servers protected")
                .font(.system(size: 11)).foregroundStyle(wMuted).lineLimit(1).minimumScaleFactor(0.8)
            Spacer(minLength: 8)
            HStack(spacing: 14) {
                miniStat("shield.fill", wGreen, snapshot.totalBlockers)
                miniStat("exclamationmark.triangle.fill", wYellow, snapshot.totalWarned)
            }
        }
    }

    private var medium: some View {
        VStack(spacing: 10) {
            header(compact: false)
            HStack(spacing: 8) {
                tile(snapshot.serverCount, "Servers", "server.rack", wAccent)
                tile(snapshot.totalBlockers, "Blockers", "shield.fill", wGreen)
                tile(snapshot.totalWarned, "Warned", "exclamationmark.triangle.fill", wYellow)
            }
            Spacer(minLength: 0)
            footer
        }
    }

    private var large: some View {
        VStack(alignment: .leading, spacing: 12) {
            header(compact: false)
            HStack(spacing: 8) {
                tile(snapshot.serverCount, "Servers", "server.rack", wAccent)
                tile(snapshot.totalBlockers, "Blockers", "shield.fill", wGreen)
                tile(snapshot.totalWarned, "Warned", "exclamationmark.triangle.fill", wYellow)
            }
            if !snapshot.servers.isEmpty {
                Text("YOUR SERVERS").font(.system(size: 10, weight: .bold)).foregroundStyle(wFaint)
                    .tracking(0.6).padding(.top, 2)
                VStack(spacing: 9) {
                    ForEach(snapshot.servers.prefix(4)) { s in serverRow(s) }
                }
            }
            Spacer(minLength: 0)
            footer
        }
    }

    private func serverRow(_ s: LPWidgetSnapshot.Server) -> some View {
        HStack(spacing: 8) {
            Circle().fill(wAccent.opacity(0.9)).frame(width: 6, height: 6)
            Text(s.name).font(.system(size: 14, weight: .medium)).foregroundStyle(wText).lineLimit(1)
            Spacer(minLength: 8)
            miniStat("shield.fill", wGreen, s.blockers)
            miniStat("exclamationmark.triangle.fill", wYellow, s.warned)
        }
    }

    private var signedOut: some View {
        VStack(spacing: 8) {
            Image("Logo").resizable().scaledToFit().frame(width: 34, height: 34)
                .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
            Text("Sign in").font(.system(size: 14, weight: .semibold)).foregroundStyle(wText)
            Text("Open Link Protect").font(.system(size: 11)).foregroundStyle(wFaint)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}
