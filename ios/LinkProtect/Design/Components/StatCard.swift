import SwiftUI

/// A quiet KPI tile: a muted label with a small icon, and a large primary value.
/// Colour is reserved for meaning, not decoration — values stay neutral.
struct StatCard: View {
    let label: String
    let value: String
    let systemImage: String
    var color: Color = Theme.text

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 6) {
                Image(systemName: systemImage)
                    .font(.system(size: 12, weight: .medium))
                    .foregroundStyle(Theme.faint)
                Text(LocalizedStringKey(label))
                    .font(.system(size: 12, weight: .medium))
                    .foregroundStyle(Theme.faint)
                    .lineLimit(1).minimumScaleFactor(0.85)
            }
            Text(value)
                .font(.system(size: 26, weight: .semibold))
                .foregroundStyle(Theme.text)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 15)
        .padding(.vertical, 14)
        .cardSurface(Theme.Radius.md)
    }
}

/// Small status tag: a coloured dot + neutral label on a quiet surface.
struct Pill: View {
    let text: String
    var systemImage: String? = nil
    var color: Color = Theme.muted

    var body: some View {
        HStack(spacing: 6) {
            Circle().fill(color).frame(width: 6, height: 6)
            Text(LocalizedStringKey(text))
                .font(.system(size: 12, weight: .medium))
                .foregroundStyle(Theme.muted)
        }
        .padding(.leading, 9).padding(.trailing, 11).padding(.vertical, 5)
        .background(Theme.surface, in: Capsule())
        .overlay(Capsule().strokeBorder(Theme.border, lineWidth: 1))
    }
}
