import Foundation
import SwiftData

@Model
final class CachedPark {
    @Attribute(.unique) var slug: String
    var parkCode: String
    var name: String
    var states: String
    var imageURL: String?
    var fetchedAt: Date

    init(slug: String, parkCode: String, name: String, states: String, imageURL: String? = nil, fetchedAt: Date = .now) {
        self.slug = slug
        self.parkCode = parkCode
        self.name = name
        self.states = states
        self.imageURL = imageURL
        self.fetchedAt = fetchedAt
    }
}

@Model
final class CachedTripSummary {
    @Attribute(.unique) var tripId: String
    var title: String
    var parkName: String?
    var updatedAt: Date

    init(tripId: String, title: String, parkName: String? = nil, updatedAt: Date = .now) {
        self.tripId = tripId
        self.title = title
        self.parkName = parkName
        self.updatedAt = updatedAt
    }
}

enum PersistenceController {
    static let shared: ModelContainer = {
        let schema = Schema([CachedPark.self, CachedTripSummary.self])
        let config = ModelConfiguration(isStoredInMemoryOnly: false)
        do {
            return try ModelContainer(for: schema, configurations: [config])
        } catch {
            fatalError("SwiftData container failed: \(error)")
        }
    }()
}
