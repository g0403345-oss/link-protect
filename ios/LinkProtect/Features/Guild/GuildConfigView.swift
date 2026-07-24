import SwiftUI

/// The full server configuration panel. Mirrors the website's seven sections,
/// presented with a quiet underline tab bar and flat cards.
struct GuildConfigView: View {
    @StateObject private var vm: GuildConfigViewModel
    @EnvironmentObject private var toasts: ToastCenter
    @State private var section: ConfigSection = .overview
    @Namespace private var tabNS

    init(guild: ManagedGuild, api: APIClient) {
        _vm = StateObject(wrappedValue: GuildConfigViewModel(guild: guild, api: api))
    }

    var body: some View {
        ZStack {
            AppBackgroundView()
            VStack(spacing: 0) {
                tabBar
                content
            }
        }
        .navigationTitle(vm.guild.name)
        .navigationBarTitleDisplayMode(.inline)
        .onAppear { vm.toasts = toasts }
        .task { await vm.load() }
    }

    // MARK: Tab bar

    private var tabBar: some View {
        VStack(spacing: 0) {
            ScrollViewReader { proxy in
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 22) {
                        ForEach(ConfigSection.allCases) { s in
                            let active = s == section
                            Button {
                                withAnimation(.easeOut(duration: 0.2)) { section = s }
                                withAnimation { proxy.scrollTo(s, anchor: .center) }
                            } label: {
                                VStack(spacing: 9) {
                                    Text(LocalizedStringKey(s.label))
                                        .font(.system(size: 14, weight: .semibold))
                                        .foregroundStyle(active ? Theme.text : Theme.faint)
                                    ZStack {
                                        Capsule().fill(.clear).frame(height: 2)
                                        if active {
                                            Capsule().fill(Theme.blurple).frame(height: 2)
                                                .matchedGeometryEffect(id: "underline", in: tabNS)
                                        }
                                    }
                                }
                            }
                            .buttonStyle(.plain)
                            .id(s)
                        }
                    }
                    .padding(.horizontal, 20)
                    .padding(.top, 12)
                }
            }
            Rectangle().fill(Theme.border).frame(height: 1)
        }
    }

    // MARK: Content

    @ViewBuilder
    private var content: some View {
        switch vm.phase {
        case .loading:
            Spacer(); Spinner(); Spacer()
        case .failed(let message):
            Spacer(); ErrorState(message: message) { Task { await vm.load() } }.padding(20); Spacer()
        case .ready:
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    sectionView
                }
                .padding(20)
                .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
    }

    @ViewBuilder
    private var sectionView: some View {
        switch section {
        case .overview:     OverviewSection(vm: vm)
        case .blockers:     BlockersSection(vm: vm)
        case .scamShield:   ScamShieldSection(vm: vm)
        case .verification: VerificationSection(vm: vm)
        case .warnings:     WarningsSection(vm: vm)
        case .channelRules: ChannelRulesSection(vm: vm)
        case .access:       AccessSection(vm: vm)
        case .blacklist:    BlacklistSection(vm: vm)
        case .stats:        StatsSection(vm: vm)
        case .log:          LogSection(vm: vm)
        case .audit:        AuditSection(vm: vm)
        }
    }
}

enum ConfigSection: String, CaseIterable, Identifiable {
    case overview, blockers, scamShield, verification, warnings, channelRules, access, blacklist, stats, log, audit
    var id: String { rawValue }

    var label: String {
        switch self {
        case .overview: return "Overview"
        case .blockers: return "Blockers"
        case .scamShield: return "Scam Shield"
        case .verification: return "Verification"
        case .warnings: return "Warnings"
        case .channelRules: return "Channels"
        case .access: return "Access"
        case .blacklist: return "Blacklist"
        case .stats: return "Statistics"
        case .log: return "Activity"
        case .audit: return "Audit"
        }
    }
    var icon: String {
        switch self {
        case .overview: return "square.grid.2x2"
        case .blockers: return "link"
        case .scamShield: return "exclamationmark.shield"
        case .verification: return "checkmark.seal"
        case .warnings: return "exclamationmark.triangle"
        case .channelRules: return "number.square"
        case .access: return "lock"
        case .blacklist: return "list.bullet"
        case .stats: return "chart.bar"
        case .log: return "clock.arrow.circlepath"
        case .audit: return "doc.text.magnifyingglass"
        }
    }
}
