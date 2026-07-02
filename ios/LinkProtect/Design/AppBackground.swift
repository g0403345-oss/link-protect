import SwiftUI

/// User-selectable app background. Persisted in UserDefaults via `@AppStorage`,
/// so every screen (including sheets) reacts live without any environment wiring.
enum AppBackground: String, CaseIterable, Identifiable {
    case midnight, linkProtect, pureBlack, ocean, sunset, aurora

    static let storageKey = "appBackground"
    var id: String { rawValue }

    var title: String {
        switch self {
        case .midnight:    return "Midnight"
        case .linkProtect: return "Link Protect"
        case .pureBlack:   return "Pure Black"
        case .ocean:       return "Ocean"
        case .sunset:      return "Sunset"
        case .aurora:      return "Aurora"
        }
    }

    /// The colour/gradient layers without safe-area handling, so the exact same
    /// definition can fill the whole screen or a small preview swatch.
    @ViewBuilder var layers: some View {
        switch self {
        case .midnight:
            ZStack(alignment: .top) {
                Theme.bg
                LinearGradient(colors: [Theme.blurple.opacity(0.07), .clear],
                               startPoint: .top, endPoint: .center)
            }
        case .linkProtect:
            ZStack {
                Theme.bg
                RadialGradient(colors: [Theme.blurple.opacity(0.28), .clear],
                               center: .topLeading, startRadius: 0, endRadius: 520)
                RadialGradient(colors: [Theme.purple.opacity(0.22), .clear],
                               center: .bottomTrailing, startRadius: 0, endRadius: 480)
            }
        case .pureBlack:
            Color.black
        case .ocean:
            ZStack {
                LinearGradient(colors: [Color(hex: 0x0B1A28), Color(hex: 0x05090E)],
                               startPoint: .top, endPoint: .bottom)
                RadialGradient(colors: [Color(hex: 0x1C7C9C).opacity(0.30), .clear],
                               center: .top, startRadius: 0, endRadius: 460)
            }
        case .sunset:
            ZStack {
                LinearGradient(colors: [Color(hex: 0x160810), Color(hex: 0x07060A)],
                               startPoint: .top, endPoint: .bottom)
                RadialGradient(colors: [Color(hex: 0xE0556B).opacity(0.24), .clear],
                               center: .bottom, startRadius: 0, endRadius: 500)
                RadialGradient(colors: [Color(hex: 0xE0883C).opacity(0.16), .clear],
                               center: .bottomTrailing, startRadius: 0, endRadius: 380)
            }
        case .aurora:
            ZStack {
                Theme.bg
                RadialGradient(colors: [Color(hex: 0x3FB950).opacity(0.20), .clear],
                               center: UnitPoint(x: 0.18, y: 0.08), startRadius: 0, endRadius: 420)
                RadialGradient(colors: [Theme.purple.opacity(0.22), .clear],
                               center: UnitPoint(x: 0.86, y: 0.22), startRadius: 0, endRadius: 460)
            }
        }
    }

    /// Full-screen background — drop-in replacement for `Theme.bg.ignoresSafeArea()`.
    var fullScreen: some View { layers.ignoresSafeArea() }
}

/// Renders the user's currently-selected background, updating live on change.
struct AppBackgroundView: View {
    @AppStorage(AppBackground.storageKey) private var raw = AppBackground.linkProtect.rawValue
    var body: some View {
        (AppBackground(rawValue: raw) ?? .linkProtect).fullScreen
    }
}
