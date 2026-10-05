import Foundation

enum SSEStreamEvent {
    case thinking
    case chunk(String)
    case streamEnd
    case done(TrailieDonePayload)
    case error(String)
}

struct SSEStreamResult {
    var fullText: String = ""
    var donePayload: TrailieDonePayload?
    var sawStreamEnd = false
    var sawDone = false
}

/// Consumes Trailie SSE streams (`thinking`, `chunk`, `stream_end`, `done`, `error`).
enum SSEStreamParser {
    private static let decoder = JSONDecoder()

    static func consumeStream(
        bytes: URLSession.AsyncBytes,
        onChunk: @escaping @Sendable (String) -> Void,
        onThinking: @escaping @Sendable () -> Void,
        onDone: @escaping @Sendable (TrailieDonePayload?) -> Void
    ) async throws -> SSEStreamResult {
        var result = SSEStreamResult()
        var streamError: String?

        for try await line in bytes.lines {
            guard line.hasPrefix("data: ") else { continue }
            let json = String(line.dropFirst(6))
            guard let payload = json.data(using: .utf8),
                  let object = try? JSONSerialization.jsonObject(with: payload) as? [String: Any],
                  let type = object["type"] as? String else { continue }

            switch type {
            case "thinking":
                onThinking()
            case "chunk":
                if let content = object["content"] as? String {
                    result.fullText += content
                    onChunk(content)
                }
            case "stream_end":
                result.sawStreamEnd = true
            case "done":
                result.sawDone = true
                if let done = try? decoder.decode(TrailieDonePayload.self, from: payload) {
                    result.donePayload = done
                    if let content = done.content, !content.isEmpty {
                        result.fullText = content
                    }
                    onDone(done)
                } else {
                    onDone(nil)
                }
            case "error":
                streamError = (object["message"] as? String) ?? "Stream error"
            default:
                break
            }
        }

        if let streamError {
            throw APIError.server(streamError)
        }
        return result
    }
}
