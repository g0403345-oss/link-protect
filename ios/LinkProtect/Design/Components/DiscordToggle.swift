import SwiftUI
import UIKit

/// Discord's pill switch: grey track when off, green when on, white thumb that
/// springs across. Mirrors `components/ToggleSwitch.tsx`.
struct DiscordToggleStyle: ToggleStyle {
    var disabled = false

    func makeBody(configuration: Configuration) -> some View {
        Button {
            configuration.isOn.toggle()
            UIImpactFeedbackGenerator(style: .light).impactOccurred()
        } label: {
            ZStack(alignment: configuration.isOn ? .trailing : .leading) {
                Capsule()
                    .fill(configuration.isOn ? Theme.blurple : Theme.surface2)
                    .frame(width: 42, height: 26)
                Circle()
                    .fill(.white)
                    .frame(width: 20, height: 20)
                    .padding(.horizontal, 3)
                    .shadow(color: .black.opacity(0.2), radius: 1, y: 1)
            }
            .animation(.spring(response: 0.26, dampingFraction: 0.75), value: configuration.isOn)
        }
        .buttonStyle(.plain)
        .disabled(disabled)
        .opacity(disabled ? 0.4 : 1)
    }
}

/// A full row: label + description on the left, switch on the right, with an
/// optional saving spinner that replaces the switch while a PATCH is in flight.
struct ToggleRow: View {
    let label: String
    let description: String
    @Binding var isOn: Bool
    var saving: Bool = false

    var body: some View {
        HStack(alignment: .center, spacing: 16) {
            VStack(alignment: .leading, spacing: 2) {
                Text(LocalizedStringKey(label))
                    .font(LPFont.bodyStrong)
                    .foregroundStyle(Theme.text)
                Text(LocalizedStringKey(description))
                    .font(LPFont.caption)
                    .foregroundStyle(Theme.faint)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 8)
            if saving {
                Spinner(size: 16)
                    .frame(width: 40, alignment: .trailing)
            } else {
                Toggle("", isOn: $isOn)
                    .labelsHidden()
                    .toggleStyle(DiscordToggleStyle(disabled: saving))
            }
        }
        .padding(.vertical, 10)
        .contentShape(Rectangle())
    }
}
