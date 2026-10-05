import SwiftUI

struct TripsView: View {
    @Environment(AuthSession.self) private var authSession
    @Environment(AppState.self) private var appState
    @State private var trips: [TripPlanDTO] = []
    @State private var isLoading = false
    @State private var errorMessage: String?
    @State private var tripRoute: TripRoute?

    private let tripsService = TripsService()

    var body: some View {
        NavigationStack {
            Group {
                if !authSession.isAuthenticated {
                    TVEmptyState(
                        title: "Your trips",
                        message: "Sign in to sync trips from TrailVerse web and save new plans from Trailie.",
                        actionTitle: "Sign In",
                        action: { authSession.promptSignIn() }
                    )
                } else if isLoading {
                    TVLoadingState(message: "Loading trips…")
                } else if let errorMessage {
                    TVErrorState(message: errorMessage) {
                        Task { await load() }
                    }
                } else if trips.isEmpty {
                    TVEmptyState(
                        title: "No trips yet",
                        message: "Plan with Trailie and tap Save Trip to keep your itinerary here.",
                        actionTitle: "Open Trailie",
                        action: { appState.selectedTab = .trailie }
                    )
                } else {
                    List(trips) { trip in
                        NavigationLink(value: trip.resolvedId) {
                            TVTripCard(
                                title: trip.displayTitle,
                                dateRange: trip.parkName ?? "National park trip",
                                status: trip.status?.capitalized ?? "Active",
                                onTap: {}
                            )
                        }
                        .listRowSeparator(.hidden)
                        .listRowInsets(EdgeInsets(top: 8, leading: 16, bottom: 8, trailing: 16))
                    }
                    .listStyle(.plain)
                }
            }
            .navigationTitle("Trips")
            .navigationDestination(for: String.self) { tripId in
                TripDetailView(tripId: tripId)
            }
            .navigationDestination(item: $tripRoute) { route in
                TripDetailView(tripId: route.id)
            }
            .onAppear { consumeTripDeepLink() }
            .onChange(of: appState.pendingDestination) { _, _ in consumeTripDeepLink() }
            .task(id: authSession.user?.resolvedId) {
                await load()
            }
        }
    }

    private func load() async {
        guard let userId = authSession.user?.resolvedId else {
            trips = []
            return
        }
        isLoading = true
        errorMessage = nil
        do {
            trips = try await tripsService.listTrips(userId: userId)
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }

    private func consumeTripDeepLink() {
        guard case .trip(let id) = appState.pendingDestination else { return }
        appState.pendingDestination = nil
        tripRoute = TripRoute(id: id)
    }
}
