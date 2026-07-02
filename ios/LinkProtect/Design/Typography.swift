import SwiftUI

/// Type scale mirrored from the website (which uses Inter). We default to the
/// system font — on iOS that's SF Pro, the closest high-quality grotesque to
/// Inter — so there's nothing to bundle and text renders crisply at every size.
///
/// To match the website pixel-for-pixel you can drop `Inter-*.ttf` files into
/// `Resources/Fonts/`, declare them under `UIAppFonts` in Info.plist, and flip
/// `usesInter` to `true`.
enum LPFont {
    static let usesInter = false
    private static let interName = "Inter"

    static func custom(_ size: CGFloat, weight: Font.Weight) -> Font {
        if usesInter {
            return .custom(interName, size: size).weight(weight)
        }
        return .system(size: size, weight: weight, design: .default)
    }

    // Display / headings — tight tracking like the website's `letter-spacing: -0.02em`.
    static var titleXL: Font { custom(32, weight: .black) }
    static var title:   Font { custom(22, weight: .heavy) }
    static var section: Font { custom(18, weight: .heavy) }

    // Body
    static var body:      Font { custom(15, weight: .regular) }
    static var bodyStrong: Font { custom(15, weight: .semibold) }
    static var label:     Font { custom(13, weight: .semibold) }
    static var caption:   Font { custom(12, weight: .medium) }
    static var tiny:      Font { custom(11, weight: .semibold) }

    // Numeric callouts (stat cards)
    static var statValue: Font { custom(26, weight: .black) }
}

extension Text {
    /// Apply tight tracking to mimic the website's negative letter-spacing on headings.
    func tightTracking() -> Text { self.tracking(-0.4) }
}
