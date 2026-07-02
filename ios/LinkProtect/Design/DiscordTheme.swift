import SwiftUI

/// Calm, restrained dark palette (think Linear / Vercel): a near-black base, a
/// few neutral grays, hairline borders, and a single accent used sparingly.
/// No gradients, glows, or glass — clarity over decoration.
enum Theme {

    // MARK: Surfaces
    static let bg        = Color(hex: 0x0A0A0C) // app background
    static let bgRaised  = Color(hex: 0x141417) // cards
    static let surface   = Color(hex: 0x1A1A1F) // fields / insets
    static let surface2  = Color(hex: 0x212128) // hover / toggle track
    static let surface3  = Color(hex: 0x2B2B33)

    // Hairline borders (rendered over varying surfaces).
    static let border       = Color.white.opacity(0.07)
    static let borderStrong = Color.white.opacity(0.12)

    // MARK: Accent + status (used sparingly)
    static let blurple      = Color(hex: 0x5B6CFF) // the one accent
    static let blurpleHover = Color(hex: 0x4A57E6)
    static let green        = Color(hex: 0x3FB950)
    static let red          = Color(hex: 0xF0544C)
    static let yellow       = Color(hex: 0xD6A22E)
    static let purple       = Color(hex: 0x8B7FF0)

    // MARK: Text
    static let text  = Color(hex: 0xECECEE) // primary (not pure white)
    static let muted = Color(hex: 0x9A9AA4) // secondary
    static let faint = Color(hex: 0x76767F) // tertiary
    static let dim   = Color(hex: 0x5A5A63) // quaternary / meta

    // MARK: Radii
    enum Radius {
        static let sm: CGFloat = 9
        static let md: CGFloat = 13
        static let lg: CGFloat = 18
        static let pill: CGFloat = 999
    }
}

extension Color {
    init(hex: UInt32, alpha: Double = 1) {
        self.init(
            .sRGB,
            red:   Double((hex >> 16) & 0xFF) / 255,
            green: Double((hex >> 8) & 0xFF) / 255,
            blue:  Double(hex & 0xFF) / 255,
            opacity: alpha
        )
    }
}

extension View {
    /// The single surface treatment used everywhere: a flat raised fill with a
    /// 1px hairline border and continuous corners. No shadow, no material.
    func cardSurface(_ cornerRadius: CGFloat = Theme.Radius.lg, fill: Color = Theme.bgRaised) -> some View {
        let shape = RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
        return self
            .background(fill, in: shape)
            .overlay(shape.strokeBorder(Theme.border, lineWidth: 1))
            .clipShape(shape)
    }

    // Back-compat aliases — both now map to the single flat surface.
    func glassSurface(cornerRadius: CGFloat = Theme.Radius.lg) -> some View { cardSurface(cornerRadius) }
    func elevatedSurface(cornerRadius: CGFloat = Theme.Radius.lg) -> some View { cardSurface(cornerRadius) }

    /// Kept for call-site compatibility; intentionally no-ops now (no glow).
    func blurpleGlow(radius: CGFloat = 0, opacity: Double = 0) -> some View { self }

    /// Very subtle lift, used only for floating overlays (toasts).
    func cardShadow() -> some View {
        shadow(color: .black.opacity(0.35), radius: 14, x: 0, y: 8)
    }
}
