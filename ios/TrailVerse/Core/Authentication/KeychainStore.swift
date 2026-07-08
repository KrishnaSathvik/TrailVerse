import Foundation
import Security

enum KeychainError: Error {
    case saveFailed
    case readFailed
    case deleteFailed
}

/// Stores auth tokens in the iOS Keychain — never UserDefaults.
final class KeychainStore {
    private let service: String

    init(service: String = AppEnvironment.current.bundleIdentifier) {
        self.service = service
    }

    func save(_ data: Data, account: String) throws {
        try delete(account: account)
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly,
        ]
        let status = SecItemAdd(query as CFDictionary, nil)
        guard status == errSecSuccess else { throw KeychainError.saveFailed }
    }

    func read(account: String) throws -> Data? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]
        var item: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &item)
        if status == errSecItemNotFound { return nil }
        guard status == errSecSuccess, let data = item as? Data else {
            throw KeychainError.readFailed
        }
        return data
    }

    func delete(account: String) throws {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
        let status = SecItemDelete(query as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else {
            throw KeychainError.deleteFailed
        }
    }

    func saveString(_ value: String, account: String) throws {
        guard let data = value.data(using: .utf8) else { throw KeychainError.saveFailed }
        try save(data, account: account)
    }

    func readString(account: String) throws -> String? {
        guard let data = try read(account: account) else { return nil }
        return String(data: data, encoding: .utf8)
    }
}

enum KeychainAccounts {
    static let authToken = "trailverse.auth.token"
    static let refreshToken = "trailverse.auth.refresh"
}
