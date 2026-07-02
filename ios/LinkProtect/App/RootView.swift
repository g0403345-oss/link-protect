import SwiftUI

/// Auth-gated routing. The app shows exactly one of: a splash while we restore
/// the session, the Discord sign-in screen, or the signed-in server list.
struct RootView: View {
    @EnvironmentObject private var auth: AuthStore

    var body: some View {
        ZStack {
            switch auth.state {
            case .loading:
                LoadingScreen()
                    .transition(.opacity)
            case .signedOut:
                LoginView()
                    .transition(.opacity)
            case .signedIn(let user):
                ServerListView(user: user, api: auth.api)
                    .transition(.opacity)
            }
        }
        .animation(.easeInOut(duration: 0.35), value: auth.state)
    }
}
