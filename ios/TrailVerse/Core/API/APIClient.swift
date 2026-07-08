import Foundation

enum APIError: Error, LocalizedError {
    case invalidURL
    case httpStatus(Int, String?)
    case decoding(Error)
    case unauthorized
    case network(Error)

    var errorDescription: String? {
        switch self {
        case .invalidURL: "Invalid API URL."
        case .httpStatus(let code, let message): message ?? "Request failed (\(code))."
        case .decoding: "Could not read server response."
        case .unauthorized: "Please sign in again."
        case .network(let error): error.localizedDescription
        }
    }
}

/// Thin URLSession wrapper — will align with `/api/mobile/v1` as routes ship.
actor APIClient {
    private let baseURL: URL
    private let session: URLSession
    private let keychain = KeychainStore()
    private let decoder: JSONDecoder = {
        let d = JSONDecoder()
        d.keyDecodingStrategy = .convertFromSnakeCase
        d.dateDecodingStrategy = .iso8601
        return d
    }()

    init(environment: AppEnvironment = .current, session: URLSession = .shared) {
        self.baseURL = environment.apiBaseURL
        self.session = session
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

    func requestData(
        _ path: String,
        method: String = "GET",
        body: (any Encodable)? = nil,
        authenticated: Bool = false
    ) async throws -> Data {
        guard let url = URL(string: path, relativeTo: baseURL) else {
            throw APIError.invalidURL
        }
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if let body {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONEncoder().encode(AnyEncodable(body))
        }
        if authenticated, let token = try keychain.readString(account: KeychainAccounts.authToken) {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }

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
            return data
        case 401:
            throw APIError.unauthorized
        default:
            let message = String(data: data, encoding: .utf8)
            throw APIError.httpStatus(http.statusCode, message)
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
    let success: Bool
    let data: T?
    let error: String?
}
