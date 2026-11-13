import SwiftUI

/// The full app exists because an App Clip must ship inside one. For customers the
/// clip is the product; this screen only explains how to get to it.
@main
struct QReaderApp: App {
    var body: some Scene {
        WindowGroup {
            VStack(spacing: 12) {
                Image(systemName: "qrcode.viewfinder").font(.system(size: 64))
                Text("QReader").font(.largeTitle.bold())
                Text("Siparişinizin QR kodunu tarayın.\nScan your order's QR code.")
                    .multilineTextAlignment(.center)
            }.padding()
        }
    }
}
