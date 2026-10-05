import Foundation

actor TripsService {
    private let client = APIClient.shared

    func listTrips(userId: String) async throws -> [TripPlanDTO] {
        try await client.requestEnvelope("/trips/user/\(userId)", authenticated: true)
    }

    func getTrip(id: String) async throws -> TripPlanDTO {
        try await client.requestEnvelope("/trips/\(id)", authenticated: true)
    }

    func createTrip(
        title: String,
        parkCode: String?,
        parkName: String?,
        conversation: [TrailieMessage],
        plan: JSONValue? = nil,
        planningState: JSONValue? = nil
    ) async throws -> TripPlanDTO {
        struct Body: Encodable {
            let title: String
            let parkCode: String?
            let parkName: String?
            let conversation: [TripMessageDTO]
            let status: String
            let plan: JSONValue?
            let planningState: JSONValue?
        }

        let messages = conversation.map {
            TripMessageDTO(raw: $0.wireValue)
        }

        return try await client.requestEnvelope(
            "/trips",
            method: "POST",
            body: Body(
                title: title,
                parkCode: parkCode,
                parkName: parkName,
                conversation: messages,
                status: "active",
                plan: plan, planningState: planningState
            ),
            authenticated: true
        )
    }

    func updateTrip(id: String, conversation: [TrailieMessage], plan: JSONValue?, planningState: JSONValue?) async throws -> TripPlanDTO {
        var fields: [String: JSONValue] = ["conversation": .array(conversation.map(\.wireValue)), "provider": .string("auto")]
        if let plan { fields["plan"] = plan }
        if let planningState { fields["planningState"] = planningState }
        if let version = plan?["responseVersion"]?.int { fields["expectedPreviousVersion"] = .number(Double(version - 1)) }
        return try await client.requestEnvelope("/trips/\(id)", method: "PUT", body: JSONValue.object(fields), authenticated: true)
    }
    func persistTargetMutation(_ mutation: JSONValue, sourceTripId: String, sourceResponseId: String) async throws {
        guard let id = mutation["tripId"]?.string, let plan = mutation["canonicalPlan"]?.nonNull else { return }
        var fields: [String: JSONValue] = ["plan": plan, "sourceTripId": .string(sourceTripId), "sourceResponseId": .string(sourceResponseId)]
        if let version = plan["responseVersion"]?.int { fields["expectedPreviousVersion"] = .number(Double(version - 1)) }
        let _: TripPlanDTO = try await client.requestEnvelope("/trips/\(id)", method: "PUT", body: JSONValue.object(fields), authenticated: true)
    }
}
