import Foundation
import Observation

@Observable
@MainActor
final class AuthSession {
    enum Mode: Equatable {
        case loading
        case guest
        case authenticated(UserDTO)
    }

    var mode: Mode = .loading
    var anonymousId: String = AnonymousIDStore.getOrCreate()
    var lastError: String?
    var showAuthSheet = false
    var authPromptMessage: String?

    private let authService = AuthService()

    var user: UserDTO? {
        if case .authenticated(let user) = mode { return user }
        return nil
    }

    var isAuthenticated: Bool {
        if case .authenticated = mode { return true }
        return false
    }

    var isGuest: Bool {
        mode == .guest
    }

    func bootstrap() async {
        if let user = await authService.restoreSession() {
            mode = .authenticated(user)
        } else {
            mode = .guest
        }
    }

    func continueAsGuest() {
        mode = .guest
        showAuthSheet = false
    }

    func promptSignIn(_ message: String? = nil) {
        authPromptMessage = message
        showAuthSheet = true
    }

    func login(email: String, password: String) async throws {
        lastError = nil
        let user = try await authService.login(email: email, password: password)
        mode = .authenticated(user)
        showAuthSheet = false
        if shouldMigrateChatOnLogin {
            _ = try? await migrateChatIfNeeded()
        }
    }

    func signup(firstName: String, lastName: String, email: String, password: String) async throws {
        lastError = nil
        try await authService.signup(firstName: firstName, lastName: lastName, email: email, password: password)
        if let user = try? await authService.currentUser() {
            mode = .authenticated(user)
        }
        showAuthSheet = false
        if shouldMigrateChatOnLogin {
            _ = try? await migrateChatIfNeeded()
        }
    }

    func logout() async {
        await authService.logout()
        mode = .guest
    }

    // Set by Trailie when guest has chat worth migrating on login.
    var shouldMigrateChatOnLogin = false

    func migrateChatIfNeeded() async throws -> String? {
        guard isAuthenticated, shouldMigrateChatOnLogin else { return nil }
        let tripId = try await authService.migrateAnonymousChat(anonymousId: anonymousId)
        shouldMigrateChatOnLogin = false
        return tripId
    }
}
