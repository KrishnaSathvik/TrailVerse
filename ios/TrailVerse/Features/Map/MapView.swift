import SwiftUI
import MapKit

struct MapView: View {
    @Environment(AppState.self) private var appState
    @Environment(\.colorScheme) private var colorScheme
    @State private var viewModel = MapViewModel()
    @State private var selectedPark: ParkListItem?
    @State private var showParkDetail = false
    @State private var detailSlug: String?

    var body: some View {
        NavigationStack {
            ZStack(alignment: .top) {
                mapContent

                if viewModel.isLoading {
                    ProgressView()
                        .padding(TVSpacing.md)
                        .background(.ultraThinMaterial)
                        .clipShape(RoundedRectangle(cornerRadius: TVRadius.button))
                        .padding(.top, TVSpacing.md)
                }
            }
            .navigationTitle("Map")
            .navigationDestination(isPresented: $showParkDetail) {
                if let detailSlug {
                    ParkDetailView(parkSlug: detailSlug)
                }
            }
            .sheet(item: $selectedPark) { park in
                MapParkSheet(
                    park: park,
                    onViewPark: {
                        detailSlug = park.slug ?? park.parkCode
                        selectedPark = nil
                        showParkDetail = true
                    },
                    onPlanTrip: {
                        appState.openTrailie(parkCode: park.parkCode, parkName: park.fullName)
                        selectedPark = nil
                        appState.selectedTab = .trailie
                    },
                    onCompare: {
                        appState.openCompare(parkCodes: [park.parkCode])
                        selectedPark = nil
                    }
                )
                .presentationDetents([.medium])
            }
            .task { await viewModel.load() }
            .onChange(of: appState.mapFocusParkCode) { _, code in
                guard let code else { return }
                Task {
                    await viewModel.focus(on: code)
                    appState.mapFocusParkCode = nil
                }
            }
            .onAppear {
                if let code = appState.mapFocusParkCode {
                    Task {
                        await viewModel.focus(on: code)
                        appState.mapFocusParkCode = nil
                    }
                }
            }
        }
    }

    @ViewBuilder
    private var mapContent: some View {
        Map(position: $viewModel.position, selection: $selectedPark) {
            ForEach(viewModel.parks) { park in
                if let coordinate = park.coordinate {
                    Annotation(park.fullName, coordinate: CLLocationCoordinate2D(
                        latitude: coordinate.latitude,
                        longitude: coordinate.longitude
                    )) {
                        Image(systemName: "leaf.circle.fill")
                            .font(.title2)
                            .foregroundStyle(TVColors.accentGreen)
                            .shadow(radius: 2)
                    }
                    .tag(park)
                }
            }
        }
        .mapStyle(.standard(elevation: .realistic))
        .ignoresSafeArea(edges: .bottom)
    }
}

@Observable
@MainActor
final class MapViewModel {
    var parks: [ParkListItem] = []
    var isLoading = false
    var position: MapCameraPosition = .region(
        MKCoordinateRegion(
            center: CLLocationCoordinate2D(latitude: 39.5, longitude: -98.0),
            span: MKCoordinateSpan(latitudeDelta: 25, longitudeDelta: 25)
        )
    )

    private let parksService = ParksService()

    func load() async {
        isLoading = true
        defer { isLoading = false }
        do {
            parks = try await parksService.mapParks()
        } catch {
            parks = []
        }
    }

    func focus(on parkCode: String) async {
        if parks.isEmpty {
            await load()
        }
        guard let park = parks.first(where: { $0.parkCode == parkCode.lowercased() }),
              let coordinate = park.coordinate else { return }
        position = .region(MKCoordinateRegion(
            center: CLLocationCoordinate2D(latitude: coordinate.latitude, longitude: coordinate.longitude),
            span: MKCoordinateSpan(latitudeDelta: 2.5, longitudeDelta: 2.5)
        ))
    }
}

private struct MapParkSheet: View {
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.dismiss) private var dismiss

    let park: ParkListItem
    let onViewPark: () -> Void
    let onPlanTrip: () -> Void
    let onCompare: () -> Void

    var body: some View {
        let palette = TVColorPalette.palette(for: colorScheme)
        VStack(alignment: .leading, spacing: TVSpacing.lg) {
            VStack(alignment: .leading, spacing: TVSpacing.xs) {
                Text(park.fullName)
                    .font(TVTypography.title3)
                Text("\(park.states) · \(park.designation)")
                    .font(TVTypography.subheadline)
                    .foregroundStyle(palette.textSecondary)
            }

            TVPrimaryButton(title: "View Park", action: onViewPark)
            TVSecondaryButton(title: "Plan with Trailie", action: onPlanTrip)
            Button("Add to Compare") { onCompare() }
                .buttonStyle(TVOutlineButtonStyle())

            Spacer(minLength: 0)
        }
        .padding(TVSpacing.screenHorizontal)
        .padding(.top, TVSpacing.lg)
    }
}
