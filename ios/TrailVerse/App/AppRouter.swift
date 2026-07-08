import Foundation

/// Universal Link and in-app navigation destinations.
enum AppDestination: Hashable {
    case home
    case explore
    case park(slug: String, tab: String?)
    case compare(parkCodes: [String])
    case trailie(tripId: String?, parkCode: String?, parkName: String?)
    case trip(id: String)
    case map(parkCode: String?)
    case saved
    case guide(path: String)
}

/// Parses `https://www.nationalparksexplorerusa.com/...` and `trailverse://` URLs.
struct AppRouter {
    private static let webHosts: Set<String> = [
        "www.nationalparksexplorerusa.com",
        "nationalparksexplorerusa.com",
    ]

    static func destination(from url: URL) -> AppDestination? {
        if url.scheme == "trailverse" {
            return destination(fromPath: url.path, query: URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems ?? [])
        }
        guard let host = url.host, webHosts.contains(host) else { return nil }
        let query = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems ?? []
        return destination(fromPath: url.path, query: query)
    }

    private static func destination(fromPath path: String, query: [URLQueryItem]) -> AppDestination? {
        let trimmed = path.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        let segments = trimmed.split(separator: "/").map(String.init)

        if segments.isEmpty || segments.first == "" || segments.first == "home" {
            return .home
        }

        switch segments.first {
        case "parks" where segments.count >= 2:
            let tab = query.first(where: { $0.name == "tab" })?.value
            return .park(slug: segments[1], tab: tab)
        case "plan-ai":
            return .trailie(
                tripId: query.first(where: { $0.name == "trip" })?.value,
                parkCode: query.first(where: { $0.name == "park" })?.value,
                parkName: query.first(where: { $0.name == "name" })?.value
            )
        case "compare":
            let parks = query.first(where: { $0.name == "parks" })?.value?
                .split(separator: ",").map { String($0).trimmingCharacters(in: .whitespaces).lowercased() } ?? []
            return .compare(parkCodes: parks)
        case "explore":
            return .explore
        case "map":
            return .map(parkCode: query.first(where: { $0.name == "park" })?.value)
        case "trips" where segments.count >= 2:
            return .trip(id: segments[1])
        case "guides":
            return .guide(path: "/" + trimmed)
        default:
            return nil
        }
    }
}
