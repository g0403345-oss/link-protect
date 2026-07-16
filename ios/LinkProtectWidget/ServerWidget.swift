import WidgetKit
import SwiftUI
import AppIntents

// A configurable widget (iOS 17+): pick one server (or all), choose which metric
// to feature, and an accent colour.

@available(iOS 17.0, *)
struct ServerEntity: AppEntity {
    let id: String
    let name: String

    static var typeDisplayRepresentation: TypeDisplayRepresentation { "Server" }
    var displayRepresentation: DisplayRepresentation { DisplayRepresentation(title: "\(name)") }
    static var defaultQuery = ServerQuery()
}

@available(iOS 17.0, *)
struct ServerQuery: EntityQuery {
    func entities(for identifiers: [String]) async throws -> [ServerEntity] {
        LPWidgetStore.load().servers
            .filter { identifiers.contains($0.id) }
            .map { ServerEntity(id: $0.id, name: $0.name) }
    }
    func suggestedEntities() async throws -> [ServerEntity] {
        LPWidgetStore.load().servers.map { ServerEntity(id: $0.id, name: $0.name) }
    }
}

@available(iOS 17.0, *)
enum WidgetMetric: String, AppEnum {
    case warnings
    case blockers
    case scams

    static var typeDisplayRepresentation: TypeDisplayRepresentation { "Highlight" }
    static var caseDisplayRepresentations: [WidgetMetric: DisplayRepresentation] {
        [.warnings: "Warned users", .blockers: "Active blockers", .scams: "Scam Shield catches"]
    }
}

@available(iOS 17.0, *)
enum WidgetAccent: String, AppEnum {
    case blurple
    case green
    case amber
    case minimal

    static var typeDisplayRepresentation: TypeDisplayRepresentation { "Accent" }
    static var caseDisplayRepresentations: [WidgetAccent: DisplayRepresentation] {
        [.blurple: "Blurple", .green: "Green", .amber: "Amber", .minimal: "Minimal"]
    }
    var color: Color {
        switch self {
        case .blurple: return wAccent
        case .green:   return wGreen
        case .amber:   return wYellow
        case .minimal: return wText
        }
    }
}

@available(iOS 17.0, *)
struct SelectServerIntent: WidgetConfigurationIntent {
    static var title: LocalizedStringResource = "Server"
    static var description = IntentDescription("Show one server or an overview — choose what to highlight and the accent colour.")

    @Parameter(title: "Server")
    var server: ServerEntity?

    @Parameter(title: "Highlight", default: .warnings)
    var metric: WidgetMetric

    @Parameter(title: "Accent", default: .blurple)
    var accent: WidgetAccent
}

@available(iOS 17.0, *)
struct ServerEntry: TimelineEntry {
    let date: Date
    let snapshot: LPWidgetSnapshot
    let serverId: String?
    let metric: WidgetMetric
    let accent: WidgetAccent
}

@available(iOS 17.0, *)
struct ServerProvider: AppIntentTimelineProvider {
    func placeholder(in context: Context) -> ServerEntry {
        ServerEntry(date: Date(), snapshot: .placeholder, serverId: nil, metric: .warnings, accent: .blurple)
    }
    func snapshot(for configuration: SelectServerIntent, in context: Context) async -> ServerEntry {
        ServerEntry(date: Date(), snapshot: LPWidgetStore.load(), serverId: configuration.server?.id,
                    metric: configuration.metric, accent: configuration.accent)
    }
    func timeline(for configuration: SelectServerIntent, in context: Context) async -> Timeline<ServerEntry> {
        let entry = ServerEntry(date: Date(), snapshot: LPWidgetStore.load(), serverId: configuration.server?.id,
                                metric: configuration.metric, accent: configuration.accent)
        let next = Calendar.current.date(byAdding: .minute, value: 30, to: Date()) ?? Date().addingTimeInterval(1800)
        return Timeline(entries: [entry], policy: .after(next))
    }
}

@available(iOS 17.0, *)
struct ServerWidget: Widget {
    var body: some WidgetConfiguration {
        AppIntentConfiguration(kind: "LinkProtectServer", intent: SelectServerIntent.self, provider: ServerProvider()) { entry in
            ServerWidgetView(entry: entry)
        }
        .configurationDisplayName("Server")
        .description("One server or an overview — pick what to highlight and the accent.")
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
    }
}

@available(iOS 17.0, *)
struct ServerWidgetView: View {
    let entry: ServerEntry
    @Environment(\.widgetFamily) private var family

    private var accent: Color { entry.accent.color }

    private var server: LPWidgetSnapshot.Server? {
        guard let id = entry.serverId else { return nil }
        return entry.snapshot.servers.first { $0.id == id }
    }

    // The featured (big) value + label, driven by the chosen metric.
    private func featured(_ warned: Int, _ blockers: Int, _ scams: Int = 0) -> (Int, String) {
        switch entry.metric {
        case .warnings: return (warned, warned == 1 ? "warned user" : "warned users")
        case .blockers: return (blockers, blockers == 1 ? "active blocker" : "active blockers")
        case .scams:    return (scams, scams == 1 ? "scam catch" : "scam catches")
        }
    }

    var body: some View {
        Group {
            if !entry.snapshot.signedIn {
                placeholderState(title: "Sign in", sub: "Open Link Protect")
            } else if let server {
                singleServer(server)
            } else {
                overview
            }
        }
        .widgetBackgroundCompat(wBG)
    }

    private func header(_ title: String) -> some View {
        HStack(spacing: 6) {
            Image("Logo").resizable().scaledToFit().frame(width: 18, height: 18)
                .clipShape(RoundedRectangle(cornerRadius: 4, style: .continuous))
            Text(title).font(.system(size: 13, weight: .semibold)).foregroundStyle(wText)
                .lineLimit(1).minimumScaleFactor(0.7)
            Spacer(minLength: 4)
            Circle().fill(entry.snapshot.botOnline ? wGreen : wRed).frame(width: 8, height: 8)
        }
    }

    private func hero(_ value: Int, _ label: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text("\(value)").font(.system(size: 44, weight: .bold)).foregroundStyle(accent)
                .minimumScaleFactor(0.5).lineLimit(1)
            Text(label).font(.system(size: 12)).foregroundStyle(wMuted).lineLimit(1).minimumScaleFactor(0.8)
        }
    }

    private func chip(_ icon: String, _ color: Color, _ value: Int, _ label: String) -> some View {
        HStack(spacing: 5) {
            Image(systemName: icon).font(.system(size: 11)).foregroundStyle(color)
            Text("\(value)").font(.system(size: 13, weight: .semibold)).foregroundStyle(wText)
            if !label.isEmpty {
                Text(label).font(.system(size: 12)).foregroundStyle(wFaint)
                    .lineLimit(1).fixedSize()
            }
        }
        .fixedSize()
    }

    // MARK: single server

    private func singleServer(_ s: LPWidgetSnapshot.Server) -> some View {
        let f = featured(s.warned, s.blockers, s.catches ?? 0)
        return VStack(alignment: .leading, spacing: 0) {
            header(s.name)
            Spacer(minLength: 8)
            hero(f.0, f.1)
            Spacer(minLength: 8)
            if family == .systemSmall {
                chip(entry.metric == .warnings ? "shield.fill" : "exclamationmark.triangle.fill",
                     entry.metric == .warnings ? wGreen : wYellow,
                     entry.metric == .warnings ? s.blockers : s.warned,
                     "")
            } else {
                HStack(spacing: 16) {
                    chip("shield.fill", wGreen, s.blockers, "blockers")
                    chip("exclamationmark.triangle.fill", wYellow, s.warned, "warned")
                    chip("shield.lefthalf.filled", wRed, s.catches ?? 0, "scams")
                    Spacer(minLength: 0)
                    Text(entry.snapshot.updated, style: .time).font(.system(size: 11)).foregroundStyle(wFaint)
                }
            }
        }
    }

    // MARK: overview (no server picked)

    private var overview: some View {
        let f = featured(entry.snapshot.totalWarned, entry.snapshot.totalBlockers)
        return VStack(alignment: .leading, spacing: 0) {
            header("All servers")
            Spacer(minLength: 8)
            if family == .systemLarge {
                HStack(alignment: .firstTextBaseline, spacing: 14) {
                    hero(entry.snapshot.serverCount, "servers")
                    hero(f.0, f.1)
                }
            } else {
                hero(entry.snapshot.serverCount, entry.snapshot.serverCount == 1 ? "server protected" : "servers protected")
            }
            Spacer(minLength: 8)

            if family == .systemLarge, !entry.snapshot.servers.isEmpty {
                VStack(spacing: 9) {
                    ForEach(entry.snapshot.servers.prefix(5)) { s in
                        HStack(spacing: 8) {
                            Circle().fill(accent).frame(width: 6, height: 6)
                            Text(s.name).font(.system(size: 14, weight: .medium)).foregroundStyle(wText).lineLimit(1)
                            Spacer(minLength: 8)
                            chip("shield.fill", wGreen, s.blockers, "")
                            chip("exclamationmark.triangle.fill", wYellow, s.warned, "")
                        }
                    }
                }
                Spacer(minLength: 0)
            } else {
                let compact = family == .systemSmall
                HStack(spacing: compact ? 14 : 16) {
                    chip("shield.fill", wGreen, entry.snapshot.totalBlockers, compact ? "" : "blockers")
                    chip("exclamationmark.triangle.fill", wYellow, entry.snapshot.totalWarned, compact ? "" : "warned")
                }
            }
        }
    }

    private func placeholderState(title: String, sub: String) -> some View {
        VStack(spacing: 8) {
            Image("Logo").resizable().scaledToFit().frame(width: 30, height: 30)
                .clipShape(RoundedRectangle(cornerRadius: 7, style: .continuous))
            Text(title).font(.system(size: 14, weight: .semibold)).foregroundStyle(wText)
            Text(sub).font(.system(size: 11)).foregroundStyle(wFaint)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}
