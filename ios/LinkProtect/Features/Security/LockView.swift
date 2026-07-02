import SwiftUI

/// Full-screen gate shown while the app is locked.
struct LockView: View {
    @EnvironmentObject private var lock: AppLock

    var body: some View {
        ZStack {
            AppBackgroundView()
            VStack(spacing: 20) {
                Image("Logo").resizable().scaledToFit().frame(width: 64, height: 64)
                    .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous)).opacity(0.9)
                Text("Locked").font(.system(size: 20, weight: .semibold)).foregroundStyle(Theme.text)
                Text("Authenticate to continue").font(.system(size: 14)).foregroundStyle(Theme.muted)

                Button { Task { await lock.authenticate() } } label: {
                    HStack(spacing: 9) {
                        Image(systemName: lock.biometryIcon).font(.system(size: 16, weight: .semibold))
                        Text("Unlock with \(lock.biometryName)").font(.system(size: 15, weight: .semibold))
                    }
                    .foregroundStyle(.white)
                    .padding(.vertical, 14).padding(.horizontal, 22)
                    .background(Theme.blurple, in: RoundedRectangle(cornerRadius: 13, style: .continuous))
                }
                .buttonStyle(PressScaleStyle())
                .padding(.top, 8)
            }
            .padding(32)
        }
        .task { await lock.authenticate() }
    }
}
