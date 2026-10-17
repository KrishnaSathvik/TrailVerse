import SwiftUI

struct SavedView: View {
    @Environment(AuthSession.self) private var authSession
    @Environment(AppState.self) private var appState
    @State private var parks: [SavedParkDTO] = []
    @State private var isLoading = false
    @State private var errorMessage: String?

    private let userService = UserService()

    var body: some View {
        NavigationStack {
            Group {
                if !authSession.isAuthenticated {
                    TVEmptyState(
                        title: "Saved parks",
                        message: "Sign in to sync parks you save on TrailVerse web and iPhone.",
                        actionTitle: "Sign In",
                        action: { authSession.promptSignIn() }
                    )
                } else if isLoading {
                    TVLoadingState(message: "Loading saved parks…")
                } else if let errorMessage {
                    TVErrorState(message: errorMessage) {
                        Task { await load() }
                    }
                } else if parks.isEmpty {
                    TVEmptyState(
                        title: "No saved parks yet",
                        message: "Tap Save on any park page to keep it here for quick access.",
                        actionTitle: "Explore Parks",
                        action: { appState.selectedTab = .home }
                    )
                } else {
                    List(parks) { park in
                        NavigationLink(value: park.parkCode) {
                            TVParkCard(
                                title: park.displayName,
                                subtitle: park.visited == true ? "Visited" : "Saved",
                                stateLabel: park.parkCode.uppercased(),
                                imageURL: nil,
                                rating: nil,
                                onTap: {}
                            )
                        }
                        .listRowSeparator(.hidden)
                        .listRowInsets(EdgeInsets(top: 8, leading: 16, bottom: 8, trailing: 16))
                    }
                    .listStyle(.plain)
                }
            }
            .navigationTitle("Saved")
            .navigationDestination(for: String.self) { parkCode in
                ParkDetailView(parkSlug: parkCode)
            }
            .task(id: authSession.isAuthenticated) {
                await load()
            }
            .refreshable {
                await load()
            }
        }
    }

    private func load() async {
        guard authSession.isAuthenticated else {
            parks = []
            return
        }
        isLoading = parks.isEmpty
        errorMessage = nil
        do {
            parks = try await userService.savedParks()
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }
}
