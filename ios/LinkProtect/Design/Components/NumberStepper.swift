import SwiftUI

/// Editable numeric field with a reveal-on-change "Save" button — mirrors the
/// dashboard's `NumberInput` (only commits when the value differs).
struct NumberStepper: View {
    let label: String
    let description: String
    let systemImage: String
    let color: Color
    /// Currently-persisted value.
    let value: Int
    var saving: Bool = false
    let onSave: (Int) -> Void

    @State private var local: Int = 0
    @FocusState private var focused: Bool

    private var dirty: Bool { local != value }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 6) {
                Image(systemName: systemImage)
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(color)
                Text(LocalizedStringKey(label)).font(LPFont.label).foregroundStyle(Theme.text)
            }
            Text(LocalizedStringKey(description)).font(LPFont.caption).foregroundStyle(Theme.dim)
                .fixedSize(horizontal: false, vertical: true)

            HStack(spacing: 8) {
                HStack(spacing: 0) {
                    stepButton("minus") { local = max(0, local - 1) }
                    TextField("", value: $local, format: .number)
                        .focused($focused)
                        .keyboardType(.numberPad)
                        .multilineTextAlignment(.center)
                        .font(LPFont.bodyStrong)
                        .foregroundStyle(Theme.text)
                        .frame(width: 52)
                    stepButton("plus") { local += 1 }
                }
                .padding(.vertical, 6)
                .background(Theme.surface)
                .overlay(
                    RoundedRectangle(cornerRadius: Theme.Radius.sm)
                        .stroke(dirty ? color : Theme.borderStrong, lineWidth: 1)
                )
                .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.sm))

                if dirty {
                    Button {
                        focused = false
                        onSave(local)
                    } label: {
                        HStack(spacing: 6) {
                            if saving { Spinner(size: 12, color: .white) }
                            else { Image(systemName: "checkmark").font(.system(size: 12, weight: .bold)) }
                            Text("Save").font(LPFont.caption)
                        }
                        .foregroundStyle(.white)
                        .padding(.vertical, 8).padding(.horizontal, 14)
                        .background(color)
                        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.sm))
                    }
                    .buttonStyle(PressScaleStyle())
                    .transition(.opacity.combined(with: .move(edge: .leading)))
                }
            }
            .animation(.easeOut(duration: 0.15), value: dirty)
        }
        .onAppear { local = value }
        .onChange(of: value) { local = $0 }
    }

    private func stepButton(_ symbol: String, _ action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: symbol)
                .font(.system(size: 12, weight: .bold))
                .foregroundStyle(Theme.muted)
                .frame(width: 34, height: 30)
        }
        .buttonStyle(.plain)
    }
}
