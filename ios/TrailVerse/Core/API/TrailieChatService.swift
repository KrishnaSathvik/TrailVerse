import Foundation

struct TrailieMessage: Identifiable, Hashable {
    let id: UUID
    let role: Role
    var content: String
    var response: JSONValue? = nil

    enum Role: String, Hashable {
        case user
        case assistant
    }

    init(id: UUID = UUID(), role: Role, content: String, response: JSONValue? = nil) {
        self.id = id
        self.role = role
        self.content = content
        self.response = response
    }

    var apiRole: String { role.rawValue }
    var canonicalPlan: JSONValue? {
        response?["canonicalPlan"]?.nonNull ?? response?["itineraryData"]?.nonNull
            ?? response?["itinerary"]?.nonNull ?? response?["targetPlanMutation"]?["canonicalPlan"]?.nonNull
    }
    var wireValue: JSONValue {
        let keys = Set(["responseId", "responseVersion", "responseRevision", "previousRevision", "lifecycleStatus",
            "contentHash", "itineraryHash", "canonicalPlan", "travelLogistics", "responseArtifacts", "presentation",
            "intent", "activeTripPresentation", "targetTripId", "targetPlanMutation", "proseStatus", "proseMode",
            "mutationSummary", "timestamp", "id"])
        var fields = (response?.object ?? [:]).filter { keys.contains($0.key) }
        fields["role"] = .string(apiRole)
        fields["content"] = .string(content)
        return .object(fields)
    }
}

struct TrailieChatRequest: Encodable {
    let messages: [JSONValue]
    let systemPrompt: String?
    let metadata: TrailieChatMetadata?
    let anonymousId: String?
    let provider: String?
    let temperature: Double?
    let topP: Double?
    let maxTokens: Int?

    enum CodingKeys: String, CodingKey {
        case messages, systemPrompt, metadata, anonymousId, provider, temperature
        case topP = "top_p"
        case maxTokens
    }
}

actor TrailieChatService {
    private let client = APIClient.shared

    func streamChat(
        messages: [TrailieMessage],
        systemPrompt: String?,
        metadata: TrailieChatMetadata?,
        anonymousId: String?,
        authenticated: Bool,
        onChunk: @escaping @Sendable (String) -> Void,
        onThinking: @escaping @Sendable () -> Void
    ) async throws -> TrailieDonePayload? {
        let payload = TrailieChatRequest(
            messages: messages.map(\.wireValue),
            systemPrompt: systemPrompt,
            metadata: metadata,
            anonymousId: anonymousId,
            provider: "auto",
            temperature: 0.4,
            topP: 0.9,
            maxTokens: authenticated ? 2000 : 8000
        )

        let path = authenticated ? "/ai/chat-stream" : "/ai/chat-anonymous-stream"
        let bytes = try await client.streamBytes(
            path,
            method: "POST",
            body: payload,
            authenticated: authenticated
        )

        var donePayload: TrailieDonePayload?
        let result = try await SSEStreamParser.consumeStream(
            bytes: bytes,
            onChunk: onChunk,
            onThinking: onThinking,
            onDone: { payload in
                donePayload = payload
            }
        )
        if donePayload == nil {
            donePayload = result.donePayload
        }
        return donePayload
    }

    func sessionStatus(anonymousId: String) async throws -> AnonymousSessionStatus {
        try await client.request("/ai/session-status/\(anonymousId)")
    }
}
