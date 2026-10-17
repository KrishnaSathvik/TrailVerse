import SwiftUI
import MapKit

struct TrailieView: View {
    @Environment(AuthSession.self) private var authSession
    @Environment(AppState.self) private var appState
    @Environment(\.colorScheme) private var colorScheme
    @State private var viewModel = TrailieViewModel()
    @State private var tripRoute: TripRoute?
    var initialTrip: TripPlanDTO? = nil
    @State private var restoredInitialTrip = false

    var body: some View {
        let palette = TVColorPalette.palette(for: colorScheme)
        NavigationStack {
            VStack(spacing: 0) {
                if viewModel.parkName != nil {
                    parkContextBanner
                }

                if !authSession.isAuthenticated {
                    guestBanner
                }

                ScrollViewReader { proxy in
                    ScrollView {
                        LazyVStack(alignment: .leading, spacing: TVSpacing.md) {
                            if viewModel.messages.isEmpty {
                                emptyState
                            } else {
                                ForEach(viewModel.messages) { message in
                                    TVTrailieMessageBubble(
                                        role: message.role == .user ? .user : .assistant,
                                        text: message.content.isEmpty && viewModel.isThinking ? "Thinking…" : message.content
                                    )
                                    .id(message.id)
                                    if let plan = message.canonicalPlan {
                                        TrailieCanonicalPlanCard(plan: plan)
                                    }
                                }
                            }
                        }
                        .padding(TVSpacing.screenHorizontal)
                    }
                    .onChange(of: viewModel.messages.count) { _, _ in
                        if let last = viewModel.messages.last {
                            withAnimation { proxy.scrollTo(last.id, anchor: .bottom) }
                        }
                    }
                }

                if let error = viewModel.errorMessage {
                    Text(error)
                        .font(TVTypography.caption)
                        .foregroundStyle(TVColors.errorRed)
                        .padding(.horizontal, TVSpacing.screenHorizontal)
                }

                if !viewModel.messages.isEmpty {
                    HStack(spacing: TVSpacing.sm) {
                        if authSession.isAuthenticated {
                            TVSecondaryButton(title: viewModel.savedTripId == nil ? "Save Trip" : "Save Changes") {
                                Task { await saveTrip() }
                            }
                            .disabled(viewModel.isStreaming)
                        } else {
                            TVOutlineButton(title: "Sign in to Save") {
                                authSession.shouldMigrateChatOnLogin = true
                                authSession.promptSignIn("Save your Trailie conversation across devices.")
                            }
                        }
                    }
                    .padding(.horizontal, TVSpacing.screenHorizontal)
                    .padding(.top, TVSpacing.sm)
                }

                HStack(spacing: TVSpacing.sm) {
                    TextField("Ask Trailie…", text: $viewModel.input, axis: .vertical)
                        .lineLimit(1...4)
                        .padding(TVSpacing.sm)
                        .background(palette.surface)
                        .clipShape(RoundedRectangle(cornerRadius: TVRadius.button, style: .continuous))
                    Button {
                        Task { await sendMessage() }
                    } label: {
                        Image(systemName: "arrow.up.circle.fill")
                            .font(.title2)
                            .foregroundStyle(TVColors.accentGreen)
                    }
                    .disabled(
                        viewModel.input.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                        || viewModel.isStreaming
                        || (!authSession.isAuthenticated && !viewModel.canSendMore)
                    )
                    .frame(minWidth: TVSpacing.minTouchTarget, minHeight: TVSpacing.minTouchTarget)
                }
                .padding(TVSpacing.screenHorizontal)
                .padding(.vertical, TVSpacing.sm)
                .background(.ultraThinMaterial)
            }
            .navigationTitle("Trailie")
            .navigationDestination(item: $tripRoute) { route in
                TripDetailView(tripId: route.id)
            }
            .onAppear {
                if let initialTrip, !restoredInitialTrip {
                    viewModel.restore(initialTrip)
                    restoredInitialTrip = true
                } else if initialTrip == nil { applyTrailiePrefill() }
            }
            .onChange(of: appState.trailieParkCode) { _, _ in applyTrailiePrefill() }
            .task(id: authSession.isAuthenticated) {
                if !authSession.isAuthenticated {
                    await viewModel.loadGuestStatus(anonymousId: authSession.anonymousId)
                }
            }
        }
    }

    private func applyTrailiePrefill() {
        viewModel.configure(parkCode: appState.trailieParkCode, parkName: appState.trailieParkName)
    }

    private var parkContextBanner: some View {
        HStack {
            Image(systemName: TVIcons.location)
            Text("Planning for \(viewModel.parkName ?? "this park")")
                .font(TVTypography.caption)
            Spacer()
        }
        .foregroundStyle(TVColors.accentGreen)
        .padding(.horizontal, TVSpacing.md)
        .padding(.vertical, TVSpacing.sm)
        .background(TVColors.accentGreen.opacity(0.1))
    }

    private var guestBanner: some View {
        HStack {
            Text("Guest: \(viewModel.guestMessageCount)/5 messages")
                .font(TVTypography.caption)
            Spacer()
            if !viewModel.canSendMore {
                Button("Sign In") {
                    authSession.shouldMigrateChatOnLogin = true
                    authSession.promptSignIn()
                }
                .font(TVTypography.caption)
            }
        }
        .foregroundStyle(.white)
        .padding(.horizontal, TVSpacing.md)
        .padding(.vertical, TVSpacing.sm)
        .background(TVColors.accentGreen)
    }

    private var emptyState: some View {
        TVEmptyState(
            title: "Trailie",
            message: viewModel.parkName.map {
                "Ask about \($0) — permits, weather, day-by-day plans, and what to skip."
            } ?? "Plan a trip, check park info, or compare destinations using live TrailVerse data.",
            actionTitle: "Plan a 3-day trip",
            action: {
                if let parkName = viewModel.parkName {
                    viewModel.input = "Help me plan a 3-day trip to \(parkName)"
                } else {
                    viewModel.input = "Help me plan a 3-day national park trip"
                }
            }
        )
    }

    private func sendMessage() async {
        await viewModel.send(
            authenticated: authSession.isAuthenticated,
            anonymousId: authSession.anonymousId
        ) {
            authSession.shouldMigrateChatOnLogin = true
        }
    }

    private func saveTrip() async {
        do {
            let tripId = try await viewModel.saveTrip(auth: authSession)
            tripRoute = TripRoute(id: tripId)
            appState.selectedTab = .trips
        } catch {
            viewModel.errorMessage = error.localizedDescription
        }
    }
}

private struct TVOutlineButton: View {
    let title: String
    let action: () -> Void

    var body: some View {
        Button(title, action: action)
            .buttonStyle(TVOutlineButtonStyle())
    }
}


struct TrailieCanonicalPlanCard: View {
    let plan: JSONValue
    private var stops: [JSONValue] { (plan["days"]?.array ?? []).flatMap { $0["stops"]?.array ?? [] } }
    private var pins: [JSONValue] {
        let sources = Set(["resolved_metadata", "geocoder", "stored", "trailverse_catalog"])
        return stops.filter { stop in
            let location = stop["location"]
            if let location {
                guard location["status"]?.string == "resolved", location["sourceRef"]?.string != nil,
                      ["official_owner", "official_partner", "trusted_specialist", "commercial_structured", "external_geocoder"].contains(location["authority"]?.string ?? "") else { return false }
            }
            guard sources.contains(location?["source"]?.string ?? stop["coordinateSource"]?.string ?? ""),
                  let coordinate = coordinate(stop) else { return false }
            let lat = coordinate.latitude, lon = coordinate.longitude
            return lat.isFinite && lon.isFinite && abs(lat) <= 90 && abs(lon) <= 180
                && !(lat == 0 && lon == 0)
                && !["drive", "transport", "shuttle", "meal", "restaurant", "logistics"].contains(stop["type"]?.string ?? "")
        }
    }
    private func coordinate(_ stop: JSONValue) -> CLLocationCoordinate2D? {
        let location = stop["location"]
        guard case .number(let lat) = location == nil ? stop["latitude"] : location?["lat"],
              case .number(let lon) = location == nil ? stop["longitude"] : location?["lon"] else { return nil }
        return CLLocationCoordinate2D(latitude: lat, longitude: lon)
    }
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            ForEach(Array((plan["days"]?.array ?? []).enumerated()), id: \.offset) { index, day in
                Text(day["label"]?.string ?? "Day \(index + 1)").font(.headline)
                ForEach(Array((day["stops"]?.array ?? []).enumerated()), id: \.offset) { _, stop in
                    VStack(alignment: .leading, spacing: 4) {
                        Text(stop["name"]?.string ?? "Activity").font(.subheadline.bold())
                        if let minutes = stop["duration"]?.int { Text("\(minutes) minutes").font(.caption) }
                        if let note = stop["note"]?.string, !note.isEmpty { Text(note).font(.subheadline) }
                        if let why = stop["why"]?.string, !why.isEmpty { Text(why).font(.caption) }
                        ForEach(Array((stop["requirements"]?.array ?? []).enumerated()), id: \.offset) { _, requirement in
                            if let text = requirement["text"]?.string ?? requirement["message"]?.string {
                                Text(text).font(.caption).foregroundStyle(.secondary)
                            }
                        }
                    }
                }
            }
            if !pins.isEmpty {
                Map(initialPosition: .automatic) {
                    ForEach(Array(pins.enumerated()), id: \.offset) { _, stop in
                        if let coordinate = coordinate(stop) {
                            Marker(stop["name"]?.string ?? "Stop", coordinate: coordinate)
                        }
                    }
                }.frame(height: 220).id(plan)
            }
        }.padding().background(.quaternary, in: RoundedRectangle(cornerRadius: 12))
    }
}
