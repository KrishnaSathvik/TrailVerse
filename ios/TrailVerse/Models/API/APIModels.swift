import Foundation

// MARK: - Auth

struct UserDTO: Codable, Identifiable, Equatable {
    let id: String?
    let underscoreId: String?
    let name: String?
    let firstName: String?
    let lastName: String?
    let email: String
    let role: String?
    let avatar: String?
    let isEmailVerified: Bool?

    enum CodingKeys: String, CodingKey {
        case id
        case underscoreId = "_id"
        case name, firstName, lastName, email, role, avatar, isEmailVerified
    }

    var resolvedId: String {
        id ?? underscoreId ?? email
    }

    var displayName: String {
        if let firstName, !firstName.isEmpty { return firstName }
        if let name, !name.isEmpty { return name }
        return email
    }
}

struct LoginResponse: Decodable {
    let success: Bool
    let token: String
    let data: UserDTO
}

struct SignupResponse: Decodable {
    let success: Bool
    let message: String?
    let data: UserDTO?
}

struct APIErrorBody: Decodable {
    let success: Bool?
    let error: String?
    let message: String?
}

// MARK: - Trips

struct TripPlanDTO: Codable, Identifiable, Hashable {
    let id: String?
    let underscoreId: String?
    let title: String?
    let parkCode: String?
    let parkName: String?
    let status: String?
    let conversation: [TripMessageDTO]?
    let plan: TripPlanDocument?
    let planningState: JSONValue?
    let summary: TripSummaryDTO?
    let createdAt: String?
    let updatedAt: String?

    enum CodingKeys: String, CodingKey {
        case id
        case underscoreId = "_id"
        case title, parkCode, parkName, status, conversation, plan, planningState, summary, createdAt, updatedAt
    }

    var resolvedId: String {
        id ?? underscoreId ?? UUID().uuidString
    }

    var displayTitle: String {
        title ?? parkName ?? "Trip"
    }
}

struct TripMessageDTO: Codable, Hashable {
    let raw: JSONValue
    var role: String { raw["role"]?.string ?? "assistant" }
    var content: String { raw["content"]?.string ?? "" }
    var timestamp: String? { raw["timestamp"]?.string }
    init(role: String, content: String, timestamp: String?) {
        var fields: [String: JSONValue] = ["role": .string(role), "content": .string(content)]
        if let timestamp { fields["timestamp"] = .string(timestamp) }
        raw = .object(fields)
    }
    init(raw: JSONValue) { self.raw = raw }
    init(from decoder: Decoder) throws { raw = try JSONValue(from: decoder) }
    func encode(to encoder: Encoder) throws { try raw.encode(to: encoder) }
}

struct TripSummaryDTO: Codable, Hashable {
    let totalMessages: Int?
    let hasPlan: Bool?
    let planPreview: String?
}

typealias TripPlanDocument = JSONValue

struct MigrateChatResponse: Decodable {
    let success: Bool
    let data: MigrateChatData?
}

struct MigrateChatData: Decodable {
    let tripId: String
    let message: String?
}

// MARK: - Trailie

struct ChatMessageDTO: Encodable {
    let role: String
    let content: String
}

struct TrailieChatMetadata: Encodable {
    let parkCode: String?
    let parkName: String?
    var tripId: String? = nil
    var planningState: JSONValue? = nil
    var priorResponseVersion: Int? = nil
}

struct AnonymousSessionStatus: Decodable {
    let canSendMore: Bool?
    let messageCount: Int?
    let messages: [TripMessageDTO]?
    let planningState: JSONValue?
}

struct TrailieDonePayload: Decodable, Sendable {
    let raw: JSONValue
    init(from decoder: Decoder) throws { raw = try JSONValue(from: decoder) }
    var content: String? { raw["content"]?.string }
    var anonymousId: String? { raw["anonymousId"]?.string }
    var canSendMore: Bool? { raw["canSendMore"]?.bool }
    var messageCount: Int? { raw["messageCount"]?.int }
    var hasItinerary: Bool? { raw["hasItinerary"]?.bool }
    var canonicalPlan: JSONValue? { raw["canonicalPlan"]?.nonNull }
    var planningState: JSONValue? { raw["planningState"]?.nonNull }
    var targetPlanMutation: JSONValue? { raw["targetPlanMutation"]?.nonNull }
}

/// Lossless server contract storage: unknown canonical/provenance fields survive
/// decode → display → save instead of being dropped by a narrow mobile schema.
indirect enum JSONValue: Codable, Hashable, Sendable {
    case object([String: JSONValue]), array([JSONValue]), string(String), number(Double), bool(Bool), null
    init(from decoder: Decoder) throws {
        let c = try decoder.singleValueContainer()
        if c.decodeNil() { self = .null }
        else if let v = try? c.decode(Bool.self) { self = .bool(v) }
        else if let v = try? c.decode(String.self) { self = .string(v) }
        else if let v = try? c.decode(Double.self) { self = .number(v) }
        else if let v = try? c.decode([String: JSONValue].self) { self = .object(v) }
        else { self = .array(try c.decode([JSONValue].self)) }
    }
    func encode(to encoder: Encoder) throws {
        var c = encoder.singleValueContainer()
        switch self {
        case .object(let v): try c.encode(v)
        case .array(let v): try c.encode(v)
        case .string(let v): try c.encode(v)
        case .number(let v): try c.encode(v)
        case .bool(let v): try c.encode(v)
        case .null: try c.encodeNil()
        }
    }
    subscript(_ key: String) -> JSONValue? { object?[key] }
    var object: [String: JSONValue]? { if case .object(let v) = self { return v }; return nil }
    var array: [JSONValue] { if case .array(let v) = self { return v }; return [] }
    var string: String? { if case .string(let v) = self { return v }; return nil }
    var int: Int? { if case .number(let v) = self, v.isFinite, v >= Double(Int.min), v < Double(Int.max) { return Int(v) }; return nil }
    var bool: Bool? { if case .bool(let v) = self { return v }; return nil }
    var nonNull: JSONValue? { self == .null ? nil : self }
}
