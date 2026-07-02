import WidgetKit
import SwiftUI

@main
struct LinkProtectWidgetBundle: WidgetBundle {
    var body: some Widget {
        StatusWidget()
        if #available(iOS 16.0, *) {
            LockStatusWidget()
        }
        if #available(iOS 17.0, *) {
            ServerWidget()
        }
    }
}
