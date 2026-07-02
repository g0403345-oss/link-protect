import SwiftUI

/// Primary action — solid accent, flat, quietly confident. No gradient or glow.
struct PrimaryButton: View {
    let title: String
    var systemImage: String? = nil
    var loading: Bool = false
    var fill: Bool = true
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 8) {
                if loading {
                    Spinner(size: 16, color: .white)
                } else if let systemImage {
                    Image(systemName: systemImage).font(.system(size: 15, weight: .semibold))
                }
                Text(LocalizedStringKey(title)).font(.system(size: 16, weight: .semibold))
            }
            .foregroundStyle(.white)
            .frame(maxWidth: fill ? .infinity : nil)
            .padding(.vertical, 15)
            .padding(.horizontal, fill ? 0 : 22)
            .background(Theme.blurple, in: RoundedRectangle(cornerRadius: 13, style: .continuous))
        }
        .buttonStyle(PressScaleStyle())
        .disabled(loading)
    }
}

/// Secondary / neutral — surface fill with a hairline.
struct SecondaryButton: View {
    let title: String
    var systemImage: String? = nil
    var tint: Color = Theme.text
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 7) {
                if let systemImage { Image(systemName: systemImage).font(.system(size: 13, weight: .semibold)) }
                Text(LocalizedStringKey(title)).font(.system(size: 14, weight: .semibold))
            }
            .foregroundStyle(tint)
            .padding(.vertical, 11)
            .padding(.horizontal, 16)
            .cardSurface(11, fill: Theme.surface)
        }
        .buttonStyle(PressScaleStyle())
    }
}

/// Quiet press feedback — a touch of scale + dim, nothing bouncy.
struct PressScaleStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .opacity(configuration.isPressed ? 0.7 : 1)
            .scaleEffect(configuration.isPressed ? 0.985 : 1)
            .animation(.easeOut(duration: 0.12), value: configuration.isPressed)
    }
}
