import Foundation

actor AuthService {
    private let client = APIClient.shared
    private let keychain = KeychainStore()

    func login(email: String, password: String, rememberMe: Bool = true) async throws -> UserDTO {
        struct Body: Encodable {
            let email: String
            let password: String
            let rememberMe: Bool
        }
        let response: LoginResponse = try await client.request(
            "/auth/login",
            method: "POST",
            body: Body(email: email, password: password, rememberMe: rememberMe)
        )
        try await client.setAuthToken(response.token)
        return response.data
    }

    func signup(firstName: String, lastName: String, email: String, password: String) async throws {
        struct Body: Encodable {
            let firstName: String
            let lastName: String
            let email: String
            let password: String
        }
        let _: SignupResponse = try await client.request(
            "/auth/signup",
            method: "POST",
            body: Body(firstName: firstName, lastName: lastName, email: email, password: password)
        )
        _ = try await login(email: email, password: password)
    }

    func currentUser() async throws -> UserDTO {
        try await client.requestEnvelope("/auth/me", authenticated: true)
    }

    func logout() async {
        try? await client.setAuthToken(nil)
    }

    func restoreSession() async -> UserDTO? {
        guard (try? await client.authToken()) != nil else { return nil }
        return try? await currentUser()
    }

    func migrateAnonymousChat(anonymousId: String) async throws -> String {
        struct Body: Encodable { let anonymousId: String }
        let response: MigrateChatResponse = try await client.request(
            "/auth/migrate-chat",
            method: "POST",
            body: Body(anonymousId: anonymousId),
            authenticated: true
        )
        guard let tripId = response.data?.tripId else {
            throw APIError.server("Could not migrate chat.")
        }
        return tripId
    }
}

enum AnonymousIDStore {
    private static let key = "trailverse.anonymousId"

    static func getOrCreate() -> String {
        if let existing = UserDefaults.standard.string(forKey: key), !existing.isEmpty {
            return existing
        }
        let id = "ios_\(UUID().uuidString.lowercased())"
        UserDefaults.standard.set(id, forKey: key)
        return id
    }

    static func clear() {
        UserDefaults.standard.removeObject(forKey: key)
    }
}
