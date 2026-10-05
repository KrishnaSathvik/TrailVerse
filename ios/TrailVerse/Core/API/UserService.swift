import Foundation

actor UserService {
    private let client = APIClient.shared

    func savedParks() async throws -> [SavedParkDTO] {
        try await client.requestEnvelope("/users/saved-parks", authenticated: true)
    }

    func savePark(parkCode: String, parkName: String) async throws -> [SavedParkDTO] {
        struct Body: Encodable {
            let parkCode: String
            let parkName: String
        }
        return try await client.requestEnvelope(
            "/users/saved-parks",
            method: "POST",
            body: Body(parkCode: parkCode, parkName: parkName),
            authenticated: true
        )
    }

    func removeSavedPark(parkCode: String) async throws -> [SavedParkDTO] {
        try await client.requestEnvelope(
            "/users/saved-parks/\(parkCode)",
            method: "DELETE",
            authenticated: true
        )
    }

    func isParkSaved(parkCode: String) async throws -> Bool {
        let result: SavedParkCheckDTO = try await client.requestEnvelope(
            "/users/saved-parks/\(parkCode)/check",
            authenticated: true
        )
        return result.isSaved
    }
}
