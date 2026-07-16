import WidgetKit
import SwiftUI

@main
struct LinkProtectWidgetBundle: WidgetBundle {
    var body: some Widget {
        // Deployment target is iOS 16 — a redundant #available(iOS 16.0) here
        // used the deprecated buildLimitedAvailability, which can break widget
        // discovery entirely (gallery shows no widgets at all).
        StatusWidget()
        LockStatusWidget()
        if #available(iOS 17.0, *) {
            ServerWidget()
        }
    }
}
