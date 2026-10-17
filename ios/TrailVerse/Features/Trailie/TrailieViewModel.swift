import Foundation
import Observation

@Observable
@MainActor
final class TrailieViewModel {
    var messages: [TrailieMessage] = []
    var input = ""
    var isStreaming = false
    var isThinking = false
    var errorMessage: String?
    var canSendMore = true
    var guestMessageCount = 0
    var savedTripId: String?
    var canonicalPlan: JSONValue?
    var planningState: JSONValue?
    private var pendingTargetMutation: JSONValue?
    private var completedResponses: Set<UUID> = []
    var parkCode: String?
    var parkName: String?

    private let chatService = TrailieChatService()
    private let tripsService = TripsService()

    var systemPrompt: String? {
        guard let parkCode, let parkName else { return nil }
        return "User is viewing \(parkName) (\(parkCode)). Help them plan a trip there."
    }

    var metadata: TrailieChatMetadata? {
        return TrailieChatMetadata(parkCode: parkCode, parkName: parkName, tripId: savedTripId,
            planningState: planningState,
            priorResponseVersion: messages.compactMap { $0.response?["responseVersion"]?.int }.max())
    }

    func restore(_ trip: TripPlanDTO) {
        savedTripId = trip.resolvedId
        parkCode = trip.parkCode
        parkName = trip.parkName
        canonicalPlan = trip.plan
        planningState = trip.planningState
        messages = (trip.conversation ?? []).map {
            TrailieMessage(role: $0.role == "user" ? .user : .assistant, content: $0.content, response: $0.raw)
        }
    }

    func configure(parkCode: String?, parkName: String?) {
        self.parkCode = parkCode
        self.parkName = parkName
    }

    func loadGuestStatus(anonymousId: String) async {
        if let status = try? await chatService.sessionStatus(anonymousId: anonymousId) {
            planningState = status.planningState
            canonicalPlan = status.messages?.reversed().compactMap { $0.raw["canonicalPlan"]?.nonNull }.first
            canSendMore = status.canSendMore ?? true
            guestMessageCount = status.messageCount ?? 0
            if let history = status.messages, messages.isEmpty, !history.isEmpty {
                messages = history.map {
                    TrailieMessage(
                        role: $0.role == "user" ? .user : .assistant,
                        content: $0.content, response: $0.raw
                    )
                }
            }
        }
    }

    func send(authenticated: Bool, anonymousId: String?, markGuestChat: () -> Void) async {
        let text = input.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty, !isStreaming else { return }
        guard authenticated || canSendMore else {
            errorMessage = "Guest limit reached. Sign in for unlimited Trailie."
            return
        }

        input = ""
        errorMessage = nil
        messages.append(TrailieMessage(role: .user, content: text))
        if !authenticated {
            markGuestChat()
        }

        let assistantId = UUID()
        let outbound = messages.filter { !($0.role == .assistant && $0.content.isEmpty) }
        messages.append(TrailieMessage(id: assistantId, role: .assistant, content: ""))
        isStreaming = true
        isThinking = false

        do {
            let done = try await chatService.streamChat(
                messages: outbound,
                systemPrompt: systemPrompt,
                metadata: metadata,
                anonymousId: authenticated ? nil : anonymousId,
                authenticated: authenticated,
                onChunk: { [weak self] chunk in
                    Task { @MainActor in
                        guard let self, !self.completedResponses.contains(assistantId) else { return }
                        self.isThinking = false
                        if let index = self.messages.firstIndex(where: { $0.id == assistantId }) {
                            self.messages[index].content += chunk
                        }
                    }
                },
                onThinking: { [weak self] in
                    Task { @MainActor in self?.isThinking = true }
                }
            )

            completedResponses.insert(assistantId)
            if let index = messages.firstIndex(where: { $0.id == assistantId }), let done {
                // Terminal canonical text supersedes speculative stream chunks.
                if let content = done.content { messages[index].content = content }
                messages[index].response = done.raw
            }

            if let done {
                if let plan = done.canonicalPlan { canonicalPlan = plan }
                if let state = done.planningState { planningState = state }
                pendingTargetMutation = done.targetPlanMutation
                if authenticated, done.raw["persisted"]?.bool == true,
                   let id = done.raw["tripId"]?.string {
                    savedTripId = id
                    pendingTargetMutation = nil
                } else if authenticated, let id = savedTripId {
                    _ = try await tripsService.updateTrip(id: id, conversation: messages, plan: canonicalPlan, planningState: planningState)
                    try await saveTargetMutation(sourceTripId: id)
                }
                canSendMore = done.canSendMore ?? canSendMore
                guestMessageCount = done.messageCount ?? guestMessageCount
                if let returnedId = done.anonymousId {
                    // Server may normalize anonymous id — caller can persist if needed.
                    _ = returnedId
                }
            }
        } catch {
            messages.removeAll { $0.id == assistantId && $0.content.isEmpty }
            errorMessage = error.localizedDescription
        }

        isStreaming = false
        isThinking = false
    }

    func saveTrip(auth: AuthSession) async throws -> String {
        guard auth.isAuthenticated, auth.user != nil else {
            throw APIError.unauthorized
        }

        if let id = savedTripId {
            if messages.last(where: { $0.role == .assistant })?.response?["persisted"]?.bool == true {
                return id
            }
            _ = try await tripsService.updateTrip(id: id, conversation: messages, plan: canonicalPlan, planningState: planningState)
            try await saveTargetMutation(sourceTripId: id)
            return id
        }
        if let migrated = try await auth.migrateChatIfNeeded() {
            savedTripId = migrated
            return migrated
        }

        let title: String
        if let parkName {
            title = "\(parkName) Trip"
        } else {
            title = "Trailie Trip"
        }

        let trip = try await tripsService.createTrip(
            title: title,
            parkCode: parkCode,
            parkName: parkName,
            conversation: messages.filter { !$0.content.isEmpty || $0.canonicalPlan != nil },
            plan: canonicalPlan, planningState: planningState
        )
        savedTripId = trip.resolvedId
        try await saveTargetMutation(sourceTripId: trip.resolvedId)
        return trip.resolvedId
    }

    private func saveTargetMutation(sourceTripId: String) async throws {
        guard let mutation = pendingTargetMutation,
              let responseId = messages.last(where: { $0.role == .assistant })?.response?["responseId"]?.string else { return }
        // Active source response must be durable before claiming cross-trip ownership.
        try await tripsService.persistTargetMutation(mutation, sourceTripId: sourceTripId, sourceResponseId: responseId)
        pendingTargetMutation = nil
    }
}
