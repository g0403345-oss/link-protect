import SwiftUI
import WidgetKit

// Shared widget palette (the extension can't see the app's Theme).
extension Color {
    init(h: UInt32) {
        self.init(.sRGB, red: Double((h >> 16) & 0xFF) / 255, green: Double((h >> 8) & 0xFF) / 255,
                  blue: Double(h & 0xFF) / 255, opacity: 1)
    }
}

let wBG = Color(h: 0x121214)
let wText = Color(h: 0xECECEE)
let wMuted = Color(h: 0x9A9AA4)
let wFaint = Color(h: 0x76767F)
let wAccent = Color(h: 0x5B6CFF)
let wGreen = Color(h: 0x3FB950)
let wRed = Color(h: 0xF0544C)
let wYellow = Color(h: 0xD6A22E)

extension View {
    @ViewBuilder
    func widgetBackgroundCompat(_ color: Color) -> some View {
        if #available(iOS 17.0, *) {
            containerBackground(color, for: .widget)
        } else {
            padding(16).background(color)
        }
    }
}
