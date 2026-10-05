import Foundation

enum APIError: Error, LocalizedError {
    case invalidURL
    case httpStatus(Int, String?)
    case decoding(Error)
    case unauthorized
    case network(Error)
    case server(String)

    var errorDescription: String? {
        switch self {
        case .invalidURL: "Invalid API URL."
        case .httpStatus(let code, let message): message ?? "Request failed (\(code))."
        case .decoding: "Could not read server response."
        case .unauthorized: "Please sign in again."
        case .network(let error): error.localizedDescription
        case .server(let message): message
        }
    }

    static func parseMessage(from data: Data) -> String? {
        if let body = try? JSONDecoder().decode(APIErrorBody.self, from: data) {
            return body.error ?? body.message
        }
        return String(data: data, encoding: .utf8)
    }
}

/// Thin URLSession wrapper — will align with `/api/mobile/v1` as routes ship.
actor APIClient {
    static let shared = APIClient()

    private let baseURL: URL
    private let session: URLSession
    private let keychain = KeychainStore()
    private let encoder: JSONEncoder = {
        let e = JSONEncoder()
        e.keyEncodingStrategy = .useDefaultKeys
        return e
    }()
    private let decoder: JSONDecoder = {
        let d = JSONDecoder()
        d.keyDecodingStrategy = .useDefaultKeys
        d.dateDecodingStrategy = .iso8601
        return d
    }()

    init(environment: AppEnvironment = .current, session: URLSession = .shared) {
        self.baseURL = environment.apiBaseURL
        self.session = session
    }

    func setAuthToken(_ token: String?) throws {
        if let token {
            try keychain.saveString(token, account: KeychainAccounts.authToken)
        } else {
            try keychain.delete(account: KeychainAccounts.authToken)
        }
    }

    func authToken() throws -> String? {
        try keychain.readString(account: KeychainAccounts.authToken)
    }

    func request<T: Decodable>(
        _ path: String,
        method: String = "GET",
        body: (any Encodable)? = nil,
        authenticated: Bool = false
    ) async throws -> T {
        let data = try await requestData(path, method: method, body: body, authenticated: authenticated)
        do {
            return try decoder.decode(T.self, from: data)
        } catch {
            throw APIError.decoding(error)
        }
    }

    func requestEnvelope<T: Decodable>(
        _ path: String,
        method: String = "GET",
        body: (any Encodable)? = nil,
        authenticated: Bool = false
    ) async throws -> T {
        let envelope: APIEnvelope<T> = try await request(path, method: method, body: body, authenticated: authenticated)
        guard envelope.success != false else {
            throw APIError.server(envelope.error ?? "The server did not accept this change. Reload the trip and try again.")
        }
        guard let data = envelope.data else {
            throw APIError.server(envelope.error ?? "Missing response data.")
        }
        return data
    }

    func requestData(
        _ path: String,
        method: String = "GET",
        body: (any Encodable)? = nil,
        authenticated: Bool = false
    ) async throws -> Data {
        let request = try buildRequest(path: path, method: method, body: body, authenticated: authenticated)
        let (data, response) = try await perform(request)
        return data
    }

    func streamBytes(
        _ path: String,
        method: String = "POST",
        body: (any Encodable)? = nil,
        authenticated: Bool = false
    ) async throws -> URLSession.AsyncBytes {
        var request = try buildRequest(path: path, method: method, body: body, authenticated: authenticated)
        request.setValue("text/event-stream", forHTTPHeaderField: "Accept")
        let (bytes, response) = try await session.bytes(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw APIError.network(URLError(.badServerResponse))
        }
        guard (200...299).contains(http.statusCode) else {
            var collected = Data()
            for try await byte in bytes {
                collected.append(byte)
            }
            throw APIError.httpStatus(http.statusCode, APIError.parseMessage(from: collected))
        }
        return bytes
    }

    private func buildRequest(
        path: String,
        method: String,
        body: (any Encodable)?,
        authenticated: Bool
    ) throws -> URLRequest {
        guard let url = URL(string: path, relativeTo: baseURL) else {
            throw APIError.invalidURL
        }
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.timeoutInterval = 120
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if let body {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try encoder.encode(AnyEncodable(body))
        }
        if authenticated, let token = try keychain.readString(account: KeychainAccounts.authToken) {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        return request
    }

    private func perform(_ request: URLRequest) async throws -> (Data, HTTPURLResponse) {
        let (data, response): (Data, URLResponse)
        do {
            (data, response) = try await session.data(for: request)
        } catch {
            throw APIError.network(error)
        }
        guard let http = response as? HTTPURLResponse else {
            throw APIError.network(URLError(.badServerResponse))
        }
        switch http.statusCode {
        case 200...299:
            return (data, http)
        case 401:
            throw APIError.unauthorized
        default:
            throw APIError.httpStatus(http.statusCode, APIError.parseMessage(from: data))
        }
    }
}

private struct AnyEncodable: Encodable {
    private let encodeClosure: (Encoder) throws -> Void
    init(_ value: any Encodable) {
        encodeClosure = value.encode
    }
    func encode(to encoder: Encoder) throws {
        try encodeClosure(encoder)
    }
}

struct APIEnvelope<T: Decodable>: Decodable {
    let success: Bool?
    let data: T?
    let error: String?
}
