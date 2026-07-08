import SwiftUI

struct TripsView: View {
    var body: some View {
        NavigationStack {
            TVEmptyState(
                title: "Your trips",
                message: "Saved itineraries appear here after you plan with Trailie and sign in.",
                actionTitle: "Plan with Trailie",
                action: {}
            )
            .navigationTitle("Trips")
        }
    }
}
