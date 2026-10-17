import Foundation

actor CompareService {
    private let client = APIClient.shared

    func compare(parkCodes: [String]) async throws -> ParkComparisonResult {
        struct Body: Encodable {
            let parkCodes: [String]
        }
        return try await client.requestEnvelope(
            "/parks/compare",
            method: "POST",
            body: Body(parkCodes: parkCodes.map { $0.lowercased() })
        )
    }
}
