import SwiftUI

struct ClipView: View {
    @ObservedObject var model: ClipModel

    private var title: String {
        switch model.order?.status {
        case .pending: "Sipariş alındı · Order received"
        case .preparing: "Hazırlanıyor · Preparing"
        case .ready: "Hazır! · Ready!"
        case .collected: "Teslim edildi · Collected"
        case .cancelled: "İptal edildi · Cancelled"
        case nil: "Yükleniyor… · Loading…"
        }
    }

    var body: some View {
        VStack(spacing: 20) {
            if let problem = model.problem, model.order == nil || problem != .offline {
                Text(problem == .expired ? "Bu kodun süresi doldu · This code expired"
                     : problem == .offline ? "Bağlanılamıyor · Can't connect"
                     : "Geçersiz kod · Invalid code").font(.title3).multilineTextAlignment(.center)
            } else if let order = model.order {
                Text(order.storeName).font(.headline)
                Text(verbatim: String(order.orderNumber))
                    .font(.system(size: 120, weight: .heavy, design: .rounded))
                    .minimumScaleFactor(0.4).lineLimit(1)
                Text(title).font(.title2.bold()).multilineTextAlignment(.center)

                if order.status == .pending || order.status == .preparing {
                    Button {
                        Task { await model.turnOnPush() }
                    } label: {
                        Label(model.pushOn ? "Bildirim açık · Notifications on" : "Bildirim al · Notify me",
                              systemImage: model.pushOn ? "bell.fill" : "bell")
                    }
                    .buttonStyle(.borderedProminent).controlSize(.large)
                    .disabled(model.pushOn || model.pushDenied)
                    if model.pushDenied {
                        Text("Bildirimler kapalı. Ayarlardan izin verin. / Notifications are off. Allow them in Settings.")
                            .font(.footnote).multilineTextAlignment(.center)
                    } else if model.pushOn {
                        Text("Ekran kilitliyken de haber vereceğiz. / We'll alert you even when the screen is locked.")
                            .font(.footnote).multilineTextAlignment(.center)
                    }
                }
                if order.status == .ready && !order.coming {
                    Button("Geliyorum · I'm coming") { Task { await model.imComing() } }
                        .buttonStyle(.borderedProminent).controlSize(.large)
                }
                if order.status == .ready && order.coming {
                    Label("Mutfağa haber verildi · The kitchen knows", systemImage: "checkmark.circle.fill")
                }
            } else {
                ProgressView()
            }
        }
        .padding(24)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(model.order?.status == .ready ? Color.green.opacity(0.25) : Color(.systemBackground))
        .animation(.easeInOut, value: model.order?.status)
    }
}
