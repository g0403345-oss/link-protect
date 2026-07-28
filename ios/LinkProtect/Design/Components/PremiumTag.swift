import SwiftUI

/// Small "Premium" capsule for card headers — always visible, also with an
/// active subscription, so the extras stay recognizable (matches the web).
struct PremiumTag: View {
    var body: some View {
        HStack(spacing: 4) {
            Image(systemName: "diamond.fill").font(.system(size: 7, weight: .bold))
            Text("Premium").font(.system(size: 10, weight: .bold))
        }
        .foregroundStyle(Theme.blurple)
        .padding(.horizontal, 7).padding(.vertical, 3)
        .background(Theme.blurple.opacity(0.10))
        .overlay(Capsule().stroke(Theme.blurple.opacity(0.3), lineWidth: 1))
        .clipShape(Capsule())
    }
}
