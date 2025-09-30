import Foundation
import Combine

final class AgentClient: ObservableObject {
    @Published var messages: [String] = []
    @Published var sessionId: String?

    private let base = URL(string: "http://localhost:4011")! // iOS Simulator can use localhost

    func startSession() {
        var req = URLRequest(url: base.appendingPathComponent("/api/session/start"))
        req.httpMethod = "POST"
        req.addValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = Data("{}".utf8)
        URLSession.shared.dataTask(with: req) { data, _, _ in
            guard let d = data,
                  let j = try? JSONSerialization.jsonObject(with: d) as? [String:Any],
                  let sid = j["sessionId"] as? String
            else { return }
            DispatchQueue.main.async { self.sessionId = sid; self.messages.append("🔗 session: \(sid)") }
        }.resume()
    }

    func send(_ text: String) {
        guard let sid = sessionId else { return }
        var req = URLRequest(url: base.appendingPathComponent("/api/message/stream"))
        req.httpMethod = "POST"
        req.addValue("application/json", forHTTPHeaderField: "Content-Type")
        req.addValue("text/event-stream", forHTTPHeaderField: "Accept")
        let body: [String:Any] = ["sessionId": sid, "text": text]
        req.httpBody = try? JSONSerialization.data(withJSONObject: body)

        let task = URLSession.shared.dataTask(with: req) { data, _, _ in
            // not used; we’ll handle streaming below
        }
        // intercept streaming bytes
        task.progress.totalUnitCount = NSURLSessionTransferSizeUnknown
        let stream = URLSession.shared.streamTask(withHostName: "localhost", port: 4011) // alternative approach not needed
        task.resume()

        // simpler: use bytes via delegate-less API
        URLSession.shared.dataTask(with: req) { _,_,_ in }.resume() // placeholder
    }

    // Simple SSE reader
    func sendStreaming(_ text: String) {
        guard let sid = sessionId else { return }
        var req = URLRequest(url: base.appendingPathComponent("/api/message/stream"))
        req.httpMethod = "POST"
        req.addValue("application/json", forHTTPHeaderField: "Content-Type")
        req.addValue("text/event-stream", forHTTPHeaderField: "Accept")
        req.httpBody = try? JSONSerialization.data(withJSONObject: ["sessionId": sid, "text": text])

        let task = URLSession.shared.dataTask(with: req)
        task.resume()

        // Continuously read with a timer + URLSession’s buffered data approach:
        // For production, prefer an EventSource library. Here’s a minimal parser using URLSession bytes:
        let stream = URLSession.shared.bytes(for: req)
        Task {
            do {
                var partial = ""
                for try await line in stream.lines {
                    if line.hasPrefix("data:") {
                        let json = String(line.dropFirst(5)).trimmingCharacters(in: .whitespaces)
                        if let d = json.data(using: .utf8),
                           let obj = try? JSONSerialization.jsonObject(with: d) as? [String:Any],
                           let msg = (obj["message"] as? [String:Any])?["message"] as? String {
                            partial = msg
                            await MainActor.run {
                                if self.messages.last?.hasPrefix("🤖") == true {
                                    self.messages.removeLast()
                                }
                                self.messages.append("🤖 \(partial)")
                            }
                        }
                    }
                }
            } catch { }
        }
    }
}
