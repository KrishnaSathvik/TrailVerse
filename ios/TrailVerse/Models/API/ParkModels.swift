import Foundation

// MARK: - Saved parks

struct SavedParkDTO: Codable, Identifiable, Hashable {
    let parkCode: String
    let parkName: String?
    let savedAt: String?
    let visited: Bool?
    let visitDate: String?

    var id: String { parkCode }

    var displayName: String {
        parkName ?? parkCode.uppercased()
    }
}

struct SavedParkCheckDTO: Decodable {
    let isSaved: Bool
}

// MARK: - Weather

struct ParkWeatherDTO: Decodable {
    struct Current: Decodable {
        let temperature: Int?
        let temp: Int?
        let condition: String?
        let feelsLike: Int?
        let humidity: Int?
        let windSpeed: Int?
    }

    let current: Current?
    let lastUpdated: String?

    var displayTemperature: String {
        guard let value = current?.temperature ?? current?.temp else { return "—" }
        return "\(value)°"
    }

    var displayCondition: String {
        current?.condition?.capitalized ?? "—"
    }

    var displaySummary: String {
        guard let feelsLike = current?.feelsLike else {
            return "Live forecast from OpenWeather"
        }
        return "Feels like \(feelsLike)°"
    }

    var displayUpdatedAt: String? {
        guard let lastUpdated else { return nil }
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = formatter.date(from: lastUpdated) ?? ISO8601DateFormatter().date(from: lastUpdated) {
            let relative = RelativeDateTimeFormatter()
            relative.unitsStyle = .abbreviated
            return relative.localizedString(for: date, relativeTo: .now)
        }
        return "recently"
    }
}

// MARK: - Park list (map, compare picker)

struct ParkImageDTO: Decodable {
    let url: String
}

struct ParkListItem: Identifiable, Hashable, Codable {
    let parkCode: String
    let fullName: String
    let states: String
    let designation: String
    let latitude: Double?
    let longitude: Double?
    let slug: String?
    let imageURL: URL?

    var id: String { parkCode }

    var coordinate: (latitude: Double, longitude: Double)? {
        guard let latitude, let longitude else { return nil }
        return (latitude, longitude)
    }

    init(dto: ParkListItemDTO) {
        parkCode = dto.parkCode.lowercased()
        fullName = dto.fullName
        states = dto.states
        designation = dto.designation
        latitude = Self.parseCoordinate(dto.latitude)
        longitude = Self.parseCoordinate(dto.longitude)
        slug = dto.slug ?? ParkSlugUtils.parkToSlug(dto.fullName)
        imageURL = dto.images?.first.flatMap { URL(string: $0.url) }
    }

    private static func parseCoordinate(_ value: String?) -> Double? {
        guard let value, !value.isEmpty else { return nil }
        return Double(value)
    }
}

struct ParkListItemDTO: Decodable {
    let parkCode: String
    let fullName: String
    let states: String
    let designation: String
    let latitude: String?
    let longitude: String?
    let slug: String?
    let images: [ParkImageDTO]?
}

// MARK: - Compare

struct ParkComparisonResult: Decodable {
    let parks: [ComparedParkDTO]
    let commonActivities: CommonActivitiesDTO?
    let comparisonDate: String?
    let totalParks: Int?
}

struct ComparedParkDTO: Decodable, Identifiable, Hashable {
    let parkCode: String
    let fullName: String
    let states: String
    let designation: String?
    let weather: ComparedWeatherDTO?
    let crowdLevel: ComparedCrowdDTO?
    let bestTimeToVisit: ComparedBestTimeDTO?
    let reviews: ComparedReviewsDTO?

    var id: String { parkCode }

    var displayTemperature: String {
        guard let temp = weather?.current?.temperature ?? weather?.current?.temp else { return "—" }
        return "\(Int(temp.rounded()))°F"
    }

    var displayCondition: String {
        weather?.current?.condition?.capitalized ?? "—"
    }

    var displayCrowd: String {
        crowdLevel?.level ?? "—"
    }

    var displayBestMonths: String {
        bestTimeToVisit?.months?.joined(separator: ", ") ?? "—"
    }

    var displayRating: String {
        guard let rating = reviews?.averageRating, rating > 0 else { return "—" }
        return String(format: "%.1f", rating)
    }
}

struct ComparedWeatherDTO: Decodable, Hashable {
    struct Current: Decodable, Hashable {
        let temperature: Double?
        let temp: Double?
        let condition: String?
    }

    let current: Current?
}

struct ComparedCrowdDTO: Decodable, Hashable {
    let level: String?
}

struct ComparedBestTimeDTO: Decodable, Hashable {
    let months: [String]?
    let reasons: [String]?
}

struct ComparedReviewsDTO: Decodable, Hashable {
    let averageRating: Double?
    let totalReviews: Int?
}

struct CommonActivitiesDTO: Decodable, Hashable {
    let commonToAll: [String]?
    let mostlyCommon: [String]?
}
