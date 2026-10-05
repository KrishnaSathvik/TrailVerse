import Foundation

/// Runtime configuration — override via scheme environment variables in Xcode.
struct AppEnvironment: Sendable {
    let apiBaseURL: URL
    let webBaseURL: URL
    let bundleIdentifier: String

    static let production = AppEnvironment(
        apiBaseURL: URL(string: "https://trailverse.onrender.com/api")!,
        webBaseURL: URL(string: "https://www.nationalparksexplorerusa.com")!,
        bundleIdentifier: "com.nationalparksexplorerusa.trailverse"
    )

    private static func normalizeApiBase(_ raw: String) -> URL {
        var value = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        value = value.trimmingCharacters(in: CharacterSet(charactersIn: "/"))

        // Accept either:
        // - http://host:5001/api
        // - http://host:5001
        // Normalize to always end with /api
        if !value.hasSuffix("api") {
            value += "/api"
        }

        // Ensure scheme exists (dev convenience)
        if !value.hasPrefix("http://") && !value.hasPrefix("https://") {
            value = "http://" + value
        }

        return URL(string: value)!
    }

    static let development = AppEnvironment(
        apiBaseURL: normalizeApiBase(
            ProcessInfo.processInfo.environment["TRAILVERSE_API_URL"] ?? "http://127.0.0.1:5001/api"
        ),
        webBaseURL: URL(string: "http://127.0.0.1:3000")!,
        bundleIdentifier: "com.nationalparksexplorerusa.trailverse"
    )

    static var current: AppEnvironment {
        #if DEBUG
        return development
        #else
        return production
        #endif
    }
}
