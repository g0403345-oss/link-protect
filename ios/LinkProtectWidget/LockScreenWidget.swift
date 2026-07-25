import WidgetKit
import SwiftUI

/// Lock Screen (accessory) widgets — bot status & server count at a glance.
/// Reuses the same App-Group snapshot and timeline provider as the Home Screen
/// widgets. Available on iOS 16+.
@available(iOS 16.0, *)
struct LockStatusWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "LinkProtectLockStatus", provider: LPProvider()) { entry in
            LockStatusView(snapshot: entry.snapshot)
        }
        .configurationDisplayName("Lock Screen")
        .description("Bot status, server count and warnings on your Lock Screen.")
        .supportedFamilies([.accessoryCircular, .accessoryRectangular, .accessoryInline])
    }
}

// iOS 17 refuses to offer widgets that don't adopt the containerBackground
// API ("Please adopt containerBackground") — accessory widgets included.
extension View {
    @ViewBuilder
    func accessoryContainerCompat() -> some View {
        if #available(iOSApplicationExtension 17.0, *) {
            containerBackground(for: .widget) { Color.clear }
        } else {
            self
        }
    }
}

@available(iOS 16.0, *)
struct LockStatusView: View {
    let snapshot: LPWidgetSnapshot
    @Environment(\.widgetFamily) private var family

    var body: some View {
        Group {
            switch family {
            case .accessoryInline:
                Label(
                    snapshot.signedIn
                        ? "\(snapshot.serverCount) servers · \(snapshot.totalWarned) warned"
                        : "Sign in to Link Protect",
                    systemImage: statusIcon
                )
            case .accessoryRectangular:
                rectangular
            default:
                circular
            }
        }
        .accessoryContainerCompat()
    }

    private var statusIcon: String {
        snapshot.botOnline ? "checkmark.shield.fill" : "exclamationmark.shield.fill"
    }

    // MARK: Circular — server count in a ring

    private var circular: some View {
        ZStack {
            AccessoryWidgetBackground()
            VStack(spacing: 0) {
                Image(systemName: snapshot.botOnline ? "shield.lefthalf.filled" : "shield.slash")
                    .font(.system(size: 13, weight: .semibold))
                Text("\(snapshot.serverCount)")
                    .font(.system(size: 16, weight: .bold))
                    .minimumScaleFactor(0.6)
                    .lineLimit(1)
            }
        }
        .widgetAccentable()
    }

    // MARK: Rectangular — status + counts

    private var rectangular: some View {
        VStack(alignment: .leading, spacing: 1) {
            HStack(spacing: 4) {
                Image(systemName: statusIcon)
                Text("Link Protect").font(.headline).fontWeight(.semibold).lineLimit(1)
            }
            .widgetAccentable()
            if snapshot.signedIn {
                Text("\(snapshot.serverCount) servers · \(snapshot.totalBlockers) blockers")
                    .font(.system(size: 13))
                Text(snapshot.botOnline
                     ? "Active · \(snapshot.totalWarned) warned · \(snapshot.scamCatches ?? 0) scams"
                     : "Bot offline")
                    .font(.system(size: 12))
                    .foregroundStyle(.secondary)
            } else {
                Text("Sign in to Link Protect").font(.system(size: 13))
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}
