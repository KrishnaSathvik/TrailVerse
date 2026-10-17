// Standalone Foundation contract check; compile alongside APIModels.swift.
import Foundation

@main
struct ModelFirstContractCheck {
    static func main() throws {
        let bytes = try Data(contentsOf: URL(fileURLWithPath: CommandLine.arguments[1]))
        let response = try JSONDecoder().decode(TrailieDonePayload.self, from: bytes)
        let roundTrip = try JSONDecoder().decode(TrailieDonePayload.self,
            from: JSONEncoder().encode(response.raw))
        precondition(roundTrip.raw == response.raw)
        precondition(response.raw["persisted"]?.bool == true)
        precondition(response.canonicalPlan?["days"]?.array.count == 2)
        precondition(response.raw["contentHash"]?.string?.count == 64)
        precondition(response.canonicalPlan?["itineraryHash"] == response.raw["itineraryHash"])
        precondition(response.raw["responseVersion"]?.int == 2)
        if response.canonicalPlan?["canonicalContract"]?.string == "trailie.itinerary.v2" {
            let stop = response.canonicalPlan?["days"]?.array.first?["stops"]?.array.first
            precondition(stop?["location"]?["status"]?.string == "resolved")
            precondition(stop?["location"]?["sourceRef"]?.string != nil && stop?["latitude"] == nil)
            print("iOS canonical contract: 8/8 PASS")
        } else {
            print("iOS canonical contract: 6/6 PASS")
        }
    }
}
