import SwiftUI

/// A titled container. Flat raised surface, hairline border, generous padding,
/// a quiet uppercase label. No shadows or gradients.
struct DiscordCard<Content: View>: View {
    let title: String?
    var accessory: AnyView? = nil
    @ViewBuilder var content: () -> Content

    init(_ title: String? = nil,
         accessory: AnyView? = nil,
         @ViewBuilder content: @escaping () -> Content) {
        self.title = title
        self.accessory = accessory
        self.content = content
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            if let title {
                HStack {
                    Text(LocalizedStringKey(title))
                        .textCase(.uppercase)
                        .font(.system(size: 11, weight: .semibold))
                        .tracking(0.8)
                        .foregroundStyle(Theme.faint)
                    Spacer(minLength: 0)
                    if let accessory { accessory }
                }
                .padding(.horizontal, 16)
                .padding(.top, 15)
                .padding(.bottom, 12)
            }
            VStack(alignment: .leading, spacing: 0) {
                content()
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(16)
            .padding(.top, title == nil ? 0 : 0)
        }
        // Fill the available width so wrapping content (e.g. FlowLayout pills)
        // is constrained to the card width instead of pushing it wider than the
        // screen — which previously let the whole tab scroll horizontally.
        .frame(maxWidth: .infinity, alignment: .leading)
        .cardSurface()
    }
}

/// Section heading: small accent icon, title, muted subtitle. Clean and quiet.
struct SectionHeader: View {
    let title: String
    let subtitle: String
    let systemImage: String

    var body: some View {
        HStack(alignment: .center, spacing: 11) {
            Image(systemName: systemImage)
                .font(.system(size: 17, weight: .medium))
                .foregroundStyle(Theme.blurple)
                .frame(width: 24)
            VStack(alignment: .leading, spacing: 1) {
                Text(LocalizedStringKey(title))
                    .font(.system(size: 19, weight: .semibold))
                    .foregroundStyle(Theme.text)
                    .fixedSize(horizontal: false, vertical: true)
                // fixedSize(h:false) forces the subtitle to wrap — inside this
                // HStack it otherwise reports its full single-line width and
                // inflates the whole tab (horizontal panning on Overview).
                Text(LocalizedStringKey(subtitle))
                    .font(.system(size: 13))
                    .foregroundStyle(Theme.faint)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.bottom, 2)
    }
}
