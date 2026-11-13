import Foundation

enum OrderStatus: String, Decodable {
    case pending, preparing, ready, collected, cancelled
}

struct Order: Decodable, Equatable {
    let storeName: String
    let orderNumber: Int
    let status: OrderStatus
    let customerComingAt: String?
    var coming: Bool { customerComingAt != nil }
    /// Changes every time staff tap "Ring again".
    let ringRequestedAt: String?

    enum CodingKeys: String, CodingKey {
        case storeName = "store_name", orderNumber = "order_number", status
        case customerComingAt = "customer_coming_at", ringRequestedAt = "ring_requested_at"
    }
}

enum OrderError: Error { case invalid, expired, offline }

/// Talks to the Next.js site's /api/track routes (same ones the web phone page uses).
struct OrderClient {
    let base: URL      // e.g. https://qreader.example.com
    let token: String

    private func url(_ action: String) -> URL {
        base.appendingPathComponent("api/track/\(token)\(action)")
    }

    private func send(_ action: String, method: String, body: [String: Any]? = nil) async throws -> Data {
        var req = URLRequest(url: url(action))
        req.httpMethod = method
        req.cachePolicy = .reloadIgnoringLocalCacheData
        if let body {
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
            req.httpBody = try JSONSerialization.data(withJSONObject: body)
        }
        let data: Data, res: URLResponse
        do { (data, res) = try await URLSession.shared.data(for: req) } catch { throw OrderError.offline }
        switch (res as? HTTPURLResponse)?.statusCode ?? 0 {
        case 200..<300: return data
        case 410: throw OrderError.expired
        case 404, 422: throw OrderError.invalid
        default: throw OrderError.offline
        }
    }

    func fetch() async throws -> Order {
        try JSONDecoder().decode(Order.self, from: try await send("", method: "GET"))
    }

    func imComing() async throws -> Order {
        try JSONDecoder().decode(Order.self, from: try await send("/coming", method: "POST", body: [:]))
    }

    func subscribe(deviceToken: String, sandbox: Bool) async throws {
        _ = try await send("/subscribe", method: "POST", body: [
            "provider": "apns",
            "device_token": deviceToken,
            "environment": sandbox ? "sandbox" : "production",
        ])
    }

    /// Pulls the order token out of https://host/track/<token>.
    static func parse(_ url: URL) -> (base: URL, token: String)? {
        let parts = url.pathComponents
        guard let i = parts.firstIndex(of: "track"), parts.indices.contains(i + 1),
              var c = URLComponents(url: url, resolvingAgainstBaseURL: false) else { return nil }
        c.path = ""; c.query = nil; c.fragment = nil
        guard let base = c.url else { return nil }
        return (base, parts[i + 1])
    }
}
