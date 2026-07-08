import SwiftUI

struct TrailieView: View {
    @Environment(\.colorScheme) private var colorScheme
    @State private var messages: [TrailieMessage] = []
    @State private var input = ""
    @State private var isStreaming = false
    @State private var errorMessage: String?

    var body: some View {
        let palette = TVColorPalette.palette(for: colorScheme)
        NavigationStack {
            VStack(spacing: 0) {
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: TVSpacing.md) {
                        if messages.isEmpty {
                            TVEmptyState(
                                title: "Trailie",
                                message: "Plan a trip, check park info, or compare destinations. Trailie uses live TrailVerse data.",
                                actionTitle: "Plan a 3-day trip",
                                action: { input = "Help me plan a 3-day national park trip" }
                            )
                        } else {
                            ForEach(messages) { message in
                                TVTrailieMessageBubble(
                                    role: message.role == .user ? .user : .assistant,
                                    text: message.content
                                )
                            }
                            if isStreaming {
                                ProgressView()
                                    .padding(.leading, TVSpacing.md)
                            }
                        }
                    }
                    .padding(TVSpacing.screenHorizontal)
                }

                if let errorMessage {
                    Text(errorMessage)
                        .font(TVTypography.caption)
                        .foregroundStyle(TVColors.errorRed)
                        .padding(.horizontal, TVSpacing.screenHorizontal)
                }

                HStack(spacing: TVSpacing.sm) {
                    TextField("Ask Trailie…", text: $input, axis: .vertical)
                        .lineLimit(1...4)
                        .padding(TVSpacing.sm)
                        .background(palette.surface)
                        .clipShape(RoundedRectangle(cornerRadius: TVRadius.button, style: .continuous))
                    Button {
                        Task { await send() }
                    } label: {
                        Image(systemName: "arrow.up.circle.fill")
                            .font(.title2)
                            .foregroundStyle(TVColors.accentGreen)
                    }
                    .disabled(input.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || isStreaming)
                    .frame(minWidth: TVSpacing.minTouchTarget, minHeight: TVSpacing.minTouchTarget)
                }
                .padding(TVSpacing.screenHorizontal)
                .padding(.vertical, TVSpacing.sm)
                .background(.ultraThinMaterial)
            }
            .navigationTitle("Trailie")
        }
    }

    private func send() async {
        let text = input.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }
        input = ""
        errorMessage = nil
        messages.append(TrailieMessage(role: .user, content: text))
        isStreaming = true
        defer { isStreaming = false }

        do {
            let stream = TrailieChatService()
            let reply = try await stream.send(messages: messages)
            messages.append(TrailieMessage(role: .assistant, content: reply))
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

struct TrailieMessage: Identifiable {
    let id = UUID()
    let role: Role
    var content: String

    enum Role {
        case user
        case assistant
    }
}

/// SSE streaming against existing `/api/ai/chat-anonymous` — mobile v1 endpoint will replace.
actor TrailieChatService {
    private let client = APIClient()

    func send(messages: [TrailieMessage]) async throws -> String {
        struct ChatRequest: Encodable {
            let messages: [ChatMessageDTO]
        }
        struct ChatMessageDTO: Encodable {
            let role: String
            let content: String
        }
        struct ChatResponse: Decodable {
            let message: String?
            let content: String?
        }

        let payload = ChatRequest(messages: messages.map {
            ChatMessageDTO(role: $0.role == .user ? "user" : "assistant", content: $0.content)
        })

        // Journey 1: non-streaming fallback until SSE parser ships
        let envelope: APIEnvelope<ChatResponse> = try await client.request(
            "/ai/chat-anonymous",
            method: "POST",
            body: payload
        )
        if let message = envelope.data?.message ?? envelope.data?.content {
            return message
        }
        throw APIError.httpStatus(500, envelope.error)
    }
}
