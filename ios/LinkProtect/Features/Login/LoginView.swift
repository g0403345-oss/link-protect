import SwiftUI
import UIKit

/// Sign-in: the Link Protect logo up front, a large faint Discord mark behind it,
/// and a soft accent gradient. One action — "Continue with Discord".
struct LoginView: View {
    @EnvironmentObject private var auth: AuthStore
    @State private var signingIn = false

    var body: some View {
        ZStack {
            background

            VStack(spacing: 0) {
                Spacer()

                VStack(spacing: 22) {
                    Image("Logo")
                        .resizable()
                        .scaledToFit()
                        .frame(width: 92, height: 92)
                        .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
                        .shadow(color: Theme.blurple.opacity(0.35), radius: 30, y: 10)

                    VStack(spacing: 8) {
                        Text("Link Protect")
                            .font(.system(size: 30, weight: .bold))
                            .foregroundStyle(Theme.text)
                        Text("Manage your Discord server's protection.")
                            .font(.system(size: 15))
                            .foregroundStyle(Theme.muted)
                            .multilineTextAlignment(.center)
                    }
                }

                Spacer()

                VStack(spacing: 16) {
                    if let error = auth.authError {
                        Text(error)
                            .font(.system(size: 13))
                            .foregroundStyle(Theme.red)
                            .multilineTextAlignment(.center)
                            .transition(.opacity)
                    }

                    Button {
                        Task { signingIn = true; await auth.signIn(); signingIn = false }
                    } label: {
                        HStack(spacing: 10) {
                            if signingIn { Spinner(size: 18, color: .white) }
                            else { DiscordLogo(color: .white, width: 22) }
                            Text(signingIn ? "Connecting…" : "Continue with Discord")
                                .font(.system(size: 16, weight: .semibold))
                        }
                        .foregroundStyle(.white)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 16)
                        .background(Theme.blurple, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                    }
                    .buttonStyle(PressScaleStyle())
                    .disabled(signingIn)

                    Text("Uses Discord to sign in. We only read your identity and server list — no messages, no personal data.")
                        .font(.system(size: 12))
                        .foregroundStyle(Theme.dim)
                        .multilineTextAlignment(.center)
                        .lineSpacing(2)
                        .padding(.horizontal, 8)

                    Button { auth.enterDemo() } label: {
                        Text("Explore the demo")
                            .font(.system(size: 13, weight: .semibold))
                            .foregroundStyle(Theme.muted)
                            .padding(.top, 2)
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, 28)
            .padding(.bottom, 28)
            .animation(.easeOut(duration: 0.2), value: auth.authError)
        }
    }

    private var background: some View {
        ZStack {
            Theme.bg

            // Soft accent wash from the top.
            RadialGradient(
                colors: [Theme.blurple.opacity(0.22), .clear],
                center: UnitPoint(x: 0.5, y: 0.32), startRadius: 0, endRadius: 360
            )

            // Large, faint Discord mark watermark behind the hero.
            DiscordGlyph()
                .fill(Color.white.opacity(0.035))
                .frame(width: 440, height: 440 * (55.0 / 71.0))
                .rotationEffect(.degrees(-8))
                .offset(y: -70)
        }
        .ignoresSafeArea()
    }
}
