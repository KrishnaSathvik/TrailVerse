import Foundation

enum ParkSlugUtils {
    /// Mirrors web `parkToSlug` — kebab-case from full park name.
    static func parkToSlug(_ fullName: String) -> String {
        fullName
            .lowercased()
            .replacingOccurrences(of: "'", with: "")
            .replacingOccurrences(
                of: "[^a-z0-9]+",
                with: "-",
                options: .regularExpression
            )
            .trimmingCharacters(in: CharacterSet(charactersIn: "-"))
    }
}

actor ParksService {
    private let client = APIClient.shared
    private var slugIndex: [String: String]?
    private var cachedParks: [ParkListItem]?

    func weather(parkCode: String) async throws -> ParkWeatherDTO {
        try await client.requestEnvelope("/parks/\(parkCode)/weather")
    }

    func nationalParks() async throws -> [ParkListItem] {
        if let cachedParks {
            return cachedParks
        }

        let envelope: APIEnvelope<[ParkListItemDTO]> = try await client.request(
            "/parks?all=true&nationalParksOnly=true"
        )
        let parks = (envelope.data ?? []).map(ParkListItem.init(dto:))
        cachedParks = parks

        var index: [String: String] = [:]
        for park in parks {
            index[park.parkCode] = park.parkCode
            if let slug = park.slug {
                index[slug] = park.parkCode
            }
            index[ParkSlugUtils.parkToSlug(park.fullName)] = park.parkCode
        }
        slugIndex = index

        return parks
    }

    func mapParks() async throws -> [ParkListItem] {
        try await nationalParks().filter { $0.coordinate != nil }
    }

    func park(withCode code: String) async -> ParkListItem? {
        let parks = (try? await nationalParks()) ?? []
        return parks.first { $0.parkCode == code.lowercased() }
    }

    /// Accepts a 4-char NPS code or canonical slug from Universal Links.
    func resolveParkCode(for identifier: String) async throws -> String {
        let normalized = identifier.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !normalized.isEmpty else {
            throw APIError.server("Park identifier is required.")
        }
        if normalized.count <= 4 {
            return normalized
        }

        let index = try await slugIndexMap()
        if let code = index[normalized] {
            return code
        }
        throw APIError.server("Park not found for slug.")
    }

    private func slugIndexMap() async throws -> [String: String] {
        if let slugIndex {
            return slugIndex
        }
        _ = try await nationalParks()
        return slugIndex ?? [:]
    }
}
