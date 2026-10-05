import SwiftUI

struct TripDetailView: View {
    @Environment(\.colorScheme) private var colorScheme
    let tripId: String
    @State private var trip: TripPlanDTO?
    @State private var isLoading = true
    @State private var continuePlanning = false
    @State private var errorMessage: String?

    private let tripsService = TripsService()

    var body: some View {
        let palette = TVColorPalette.palette(for: colorScheme)
        Group {
            if isLoading {
                TVLoadingState(message: "Loading trip…")
            } else if let errorMessage {
                TVErrorState(message: errorMessage) {
                    Task { await load() }
                }
            } else if let trip {
                ScrollView {
                    VStack(alignment: .leading, spacing: TVSpacing.lg) {
                        Text(trip.displayTitle)
                            .font(TVTypography.title2)
                        if let parkName = trip.parkName {
                            Text(parkName)
                                .font(TVTypography.subheadline)
                                .foregroundStyle(palette.textSecondary)
                        }

                        if let plan = trip.plan {
                            TrailieCanonicalPlanCard(plan: plan)
                        }
                        TVSecondaryButton(title: "Continue Planning") { continuePlanning = true }

                        if let summary = trip.summary, summary.hasPlan == true {
                            TVStatusRow(title: "Itinerary", value: "Ready")
                        }

                        if let messages = trip.conversation, !messages.isEmpty {
                            Text("Trailie conversation")
                                .font(TVTypography.headline)
                            ForEach(Array(messages.enumerated()), id: \.offset) { _, message in
                                TVTrailieMessageBubble(
                                    role: message.role == "user" ? .user : .assistant,
                                    text: message.content
                                )
                            }
                        } else {
                            TVEmptyState(
                                title: "No messages yet",
                                message: "Continue planning with Trailie to build this trip."
                            )
                        }
                    }
                    .padding(TVSpacing.screenHorizontal)
                }
            }
        }
        .navigationTitle("Trip")
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
        .sheet(isPresented: $continuePlanning, onDismiss: { Task { await load() } }) {
            if let trip { TrailieView(initialTrip: trip) }
        }
    }

    private func load() async {
        isLoading = true
        errorMessage = nil
        do {
            trip = try await tripsService.getTrip(id: tripId)
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }
}
