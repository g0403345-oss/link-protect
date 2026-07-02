import SwiftUI

/// The Discord wordmark glyph (same vector path as the website's login button),
/// drawn as a SwiftUI `Shape` so it scales crisply and tints to any colour.
struct DiscordLogo: View {
    var color: Color = .white
    var width: CGFloat = 22

    var body: some View {
        DiscordGlyph()
            .fill(color)
            .frame(width: width, height: width * (55.0 / 71.0))
    }
}

struct DiscordGlyph: Shape {
    func path(in rect: CGRect) -> Path {
        // Original art is 71 × 55; scale to fit `rect`.
        let sx = rect.width / 71.0
        let sy = rect.height / 55.0
        func p(_ x: CGFloat, _ y: CGFloat) -> CGPoint { CGPoint(x: x * sx, y: y * sy) }

        var path = Path()
        // Simplified-but-faithful Discord mark (rounded body + two eyes carved out).
        path.move(to: p(60.1, 4.9))
        path.addCurve(to: p(45.6, 0.4), control1: p(55.6, 2.8), control2: p(50.7, 1.3))
        path.addCurve(to: p(43.6, 4.2), control1: p(45.0, 1.6), control2: p(44.1, 3.1))
        path.addCurve(to: p(27.4, 4.2), control1: p(38.2, 3.4), control2: p(32.7, 3.4))
        path.addCurve(to: p(25.4, 0.4), control1: p(26.2, 3.1), control2: p(26.2, 1.6))
        path.addCurve(to: p(10.9, 4.9), control1: p(20.3, 1.3), control2: p(15.4, 2.8))
        path.addCurve(to: p(0.3, 45.4), control1: p(1.6, 18.7), control2: p(-0.9, 32.1))
        path.addCurve(to: p(18.0, 54.6), control1: p(6.5, 50.1), control2: p(12.3, 52.8))
        path.addCurve(to: p(21.7, 48.8), control1: p(19.6, 52.7), control2: p(20.7, 50.8))
        path.addCurve(to: p(16.3, 45.9), control1: p(19.8, 47.8), control2: p(18.0, 46.9))
        path.addCurve(to: p(17.5, 44.7), control1: p(16.6, 45.3), control2: p(17.0, 45.0))
        path.addCurve(to: p(53.4, 44.7), control1: p(29.2, 49.9), control2: p(41.9, 49.9))
        path.addCurve(to: p(54.7, 45.9), control1: p(54.0, 45.0), control2: p(54.3, 45.3))
        path.addCurve(to: p(49.4, 48.8), control1: p(53.0, 46.9), control2: p(51.2, 47.8))
        path.addCurve(to: p(53.0, 54.6), control1: p(50.3, 50.8), control2: p(51.4, 52.7))
        path.addCurve(to: p(70.5, 45.4), control1: p(58.7, 52.8), control2: p(64.5, 50.1))
        path.addCurve(to: p(60.1, 4.9), control1: p(72.2, 30.1), control2: p(68.2, 16.8))
        path.closeSubpath()

        // Eyes
        path.addEllipse(in: CGRect(x: 22 * sx, y: 24 * sy, width: 9 * sx, height: 11 * sy))
        path.addEllipse(in: CGRect(x: 41 * sx, y: 24 * sy, width: 9 * sx, height: 11 * sy))
        return path
    }
}
