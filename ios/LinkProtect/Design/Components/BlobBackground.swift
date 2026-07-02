import SwiftUI

/// Calm app background: a flat near-black field with one barely-there accent
/// wash at the top. No animation, no noise — it should recede completely.
struct BlobBackground: View {
    var body: some View {
        ZStack(alignment: .top) {
            Theme.bg
            LinearGradient(
                colors: [Theme.blurple.opacity(0.06), .clear],
                startPoint: .top, endPoint: .center
            )
            .frame(height: 320)
        }
        .ignoresSafeArea()
    }
}
