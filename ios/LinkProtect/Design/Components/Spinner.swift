import SwiftUI

/// Indeterminate blurple ring spinner (the website's `border-top: transparent` loader).
struct Spinner: View {
    var size: CGFloat = 36
    var color: Color = Theme.blurple
    @State private var spinning = false

    var body: some View {
        Circle()
            .trim(from: 0, to: 0.75)
            .stroke(color, style: StrokeStyle(lineWidth: max(2, size / 14), lineCap: .round))
            .frame(width: size, height: size)
            .rotationEffect(.degrees(spinning ? 360 : 0))
            .animation(.linear(duration: 0.8).repeatForever(autoreverses: false), value: spinning)
            .onAppear { spinning = true }
    }
}

/// Full-screen centred loading state on the app background.
struct LoadingScreen: View {
    var body: some View {
        ZStack {
            AppBackgroundView()
            Spinner()
        }
    }
}
