import SwiftUI

struct ToastItem: Identifiable, Equatable {
    enum Kind { case success, error }
    let id = UUID()
    let kind: Kind
    let message: String
}

/// App-wide toast queue. Inject once at the root and call `show(...)` from anywhere.
@MainActor
final class ToastCenter: ObservableObject {
    @Published private(set) var toasts: [ToastItem] = []

    func success(_ message: String) { push(.init(kind: .success, message: message)) }
    func error(_ message: String) { push(.init(kind: .error, message: message)) }

    private func push(_ item: ToastItem) {
        withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
            toasts.append(item)
        }
        Task {
            try? await Task.sleep(nanoseconds: 3_300_000_000)
            withAnimation(.easeOut(duration: 0.2)) {
                toasts.removeAll { $0.id == item.id }
            }
        }
    }
}

private struct ToastOverlay: ViewModifier {
    @EnvironmentObject var center: ToastCenter

    func body(content: Content) -> some View {
        content.overlay(alignment: .bottom) {
            VStack(spacing: 8) {
                ForEach(center.toasts) { toast in
                    HStack(spacing: 10) {
                        Image(systemName: toast.kind == .success ? "checkmark.circle.fill" : "xmark.circle.fill")
                            .foregroundStyle(toast.kind == .success ? Theme.green : Theme.red)
                            .font(.system(size: 14, weight: .bold))
                        Text(toast.message)
                            .font(LPFont.label)
                            .foregroundStyle(Theme.text)
                    }
                    .padding(.horizontal, 16)
                    .padding(.vertical, 11)
                    .background(Theme.surface)
                    .overlay(
                        RoundedRectangle(cornerRadius: Theme.Radius.md)
                            .stroke((toast.kind == .success ? Theme.green : Theme.red).opacity(0.3), lineWidth: 1)
                    )
                    .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.md))
                    .cardShadow()
                    .transition(.move(edge: .bottom).combined(with: .opacity))
                }
            }
            .padding(.bottom, 24)
            .padding(.horizontal, 16)
            .frame(maxWidth: .infinity)
            .allowsHitTesting(false)
        }
    }
}

extension View {
    func toastHost() -> some View { modifier(ToastOverlay()) }
}
