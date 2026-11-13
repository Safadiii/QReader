import SwiftUI
import UserNotifications
import AudioToolbox

final class PushDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate {
    static var onToken: ((String) -> Void)?

    func application(_ app: UIApplication, didFinishLaunchingWithOptions o: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
        UNUserNotificationCenter.current().delegate = self
        return true
    }
    func application(_ app: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken token: Data) {
        PushDelegate.onToken?(token.map { String(format: "%02x", $0) }.joined())
    }
    func application(_ app: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        print("APNs registration failed:", error)
    }
    // Show the banner even while the clip is open.
    func userNotificationCenter(_ c: UNUserNotificationCenter, willPresent n: UNNotification) async -> UNNotificationPresentationOptions {
        [.banner, .sound]
    }
}

@MainActor
final class ClipModel: ObservableObject {
    @Published var order: Order?
    @Published var problem: OrderError?
    @Published var pushOn = false
    @Published var pushDenied = false
    @Published var answeredRing: String?
    private var client: OrderClient?
    private var poll: Task<Void, Never>?
    private var lastStatus: OrderStatus?

    func open(_ url: URL) {
        guard let (base, token) = OrderClient.parse(url) else { problem = .invalid; return }
        client = OrderClient(base: base, token: token)
        poll?.cancel()
        poll = Task { [weak self] in
            while !Task.isCancelled {
                await self?.refresh()
                try? await Task.sleep(for: .seconds(3))
            }
        }
    }

    func refresh() async {
        guard let client else { return }
        do {
            let o = try await client.fetch()
            order = o; problem = nil
            if o.status == .ready && lastStatus != .ready {
                UINotificationFeedbackGenerator().notificationOccurred(.success)
            }
            lastStatus = o.status
        } catch let e as OrderError {
            if order == nil || e != .offline { problem = e }
        } catch {}
    }

    func imComing() async {
        guard let client else { return }
        answeredRing = order?.ringRequestedAt ?? "first"
        if let o = try? await client.imComing() { order = o }
    }

    func turnOnPush() async {
        let granted = (try? await UNUserNotificationCenter.current()
            .requestAuthorization(options: [.alert, .sound, .badge])) ?? false
        guard granted else { pushDenied = true; return }
        PushDelegate.onToken = { [weak self] hex in
            Task { @MainActor in
                #if DEBUG
                let sandbox = true
                #else
                let sandbox = false
                #endif
                do { try await self?.client?.subscribe(deviceToken: hex, sandbox: sandbox); self?.pushOn = true }
                catch { self?.pushDenied = false; print("subscribe failed:", error) }
            }
        }
        UIApplication.shared.registerForRemoteNotifications()
    }
}

@main
struct QReaderClipApp: App {
    @UIApplicationDelegateAdaptor(PushDelegate.self) private var delegate
    @StateObject private var model = ClipModel()

    var body: some Scene {
        WindowGroup {
            ClipView(model: model)
                .onContinueUserActivity(NSUserActivityTypeBrowsingWeb) { a in
                    if let url = a.webpageURL { model.open(url) }
                }
                .onOpenURL { model.open($0) }
                #if DEBUG
                // Simulator testing: SIMCTL_CHILD__XCAppClipURL=<url> xcrun simctl launch ...
                .task {
                    if let s = ProcessInfo.processInfo.environment["_XCAppClipURL"], let u = URL(string: s) {
                        model.open(u)
                    }
                }
                #endif
        }
    }
}
