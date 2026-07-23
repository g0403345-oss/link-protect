import WidgetKit
import SwiftUI

/// Watch complications (accessory widgets) — bot status and counts right on the
/// watch face. Reads the snapshot the watch app mirrors into the App Group
/// whenever the iPhone pushes fresh data over WatchConnectivity (see WatchSync).
@main
struct LinkProtectWatchWidgetBundle: WidgetBundle {
    var body: some Widget {
        WatchComplication()
    }
}

struct WatchEntry: TimelineEntry {
    let date: Date
    let snapshot: LPWidgetSnapshot
}

struct WatchProvider: TimelineProvider {
    func placeholder(in context: Context) -> WatchEntry {
        WatchEntry(date: Date(), snapshot: .placeholder)
    }
    func getSnapshot(in context: Context, completion: @escaping (WatchEntry) -> Void) {
        completion(WatchEntry(date: Date(), snapshot: context.isPreview ? .placeholder : LPWidgetStore.load()))
    }
    func getTimeline(in context: Context, completion: @escaping (Timeline<WatchEntry>) -> Void) {
        // Data only changes when the watch app receives a new snapshot (it
        // reloads the timeline then) — the 30 min refresh is just a fallback.
        let entry = WatchEntry(date: Date(), snapshot: LPWidgetStore.load())
        completion(Timeline(entries: [entry], policy: .after(Date().addingTimeInterval(30 * 60))))
    }
}

struct WatchComplication: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "LinkProtectWatchComplication", provider: WatchProvider()) { entry in
            ComplicationView(snapshot: entry.snapshot)
        }
        .configurationDisplayName("Link Protect")
        .description("Bot status, servers and warnings on your watch face.")
        .supportedFamilies([.accessoryCircular, .accessoryCorner, .accessoryInline, .accessoryRectangular])
    }
}

struct ComplicationView: View {
    let snapshot: LPWidgetSnapshot
    @Environment(\.widgetFamily) private var family

    private var statusIcon: String {
        snapshot.botOnline ? "checkmark.shield.fill" : "exclamationmark.shield.fill"
    }

    var body: some View {
        switch family {
        case .accessoryInline:
            Label(
                snapshot.signedIn
                    ? "\(snapshot.serverCount) servers · \(snapshot.totalWarned) warned"
                    : "Link Protect",
                systemImage: statusIcon
            )
        case .accessoryCorner:
            Image(systemName: snapshot.botOnline ? "shield.lefthalf.filled" : "shield.slash")
                .font(.system(size: 22, weight: .semibold))
                .widgetLabel {
                    Text(snapshot.signedIn
                         ? "\(snapshot.serverCount) servers · \(snapshot.totalWarned) warned"
                         : "Sign in on iPhone")
                }
                .widgetAccentable()
        case .accessoryRectangular:
            VStack(alignment: .leading, spacing: 1) {
                HStack(spacing: 4) {
                    Image(systemName: statusIcon)
                    Text("Link Protect").font(.headline).lineLimit(1)
                }
                .widgetAccentable()
                if snapshot.signedIn {
                    Text("\(snapshot.serverCount) servers · \(snapshot.totalBlockers) blockers")
                        .font(.system(size: 13))
                    Text(snapshot.botOnline
                         ? "Active · \(snapshot.totalWarned) warned"
                         : "Bot offline")
                        .font(.system(size: 12))
                        .foregroundStyle(.secondary)
                } else {
                    Text("Sign in on your iPhone").font(.system(size: 13))
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        default: // accessoryCircular
            ZStack {
                AccessoryWidgetBackground()
                VStack(spacing: 0) {
                    Image(systemName: snapshot.botOnline ? "shield.lefthalf.filled" : "shield.slash")
                        .font(.system(size: 12, weight: .semibold))
                    Text("\(snapshot.serverCount)")
                        .font(.system(size: 15, weight: .bold))
                        .minimumScaleFactor(0.6)
                        .lineLimit(1)
                }
            }
            .widgetAccentable()
        }
    }
}
