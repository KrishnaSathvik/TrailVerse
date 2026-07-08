import SwiftUI

enum MainTab: String, CaseIterable, Identifiable {
    case home
    case trips
    case trailie
    case map
    case saved

    var id: String { rawValue }

    var title: String {
        switch self {
        case .home: "Home"
        case .trips: "Trips"
        case .trailie: "Trailie"
        case .map: "Map"
        case .saved: "Saved"
        }
    }

    var icon: String {
        switch self {
        case .home: TVIcons.home
        case .trips: TVIcons.trips
        case .trailie: TVIcons.trailie
        case .map: TVIcons.map
        case .saved: TVIcons.saved
        }
    }
}

struct RootView: View {
    @Environment(AppState.self) private var appState
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        let palette = TVColorPalette.palette(for: colorScheme)
        TabView(selection: Binding(
            get: { appState.selectedTab },
            set: { appState.selectedTab = $0 }
        )) {
            HomeView()
                .tabItem { Label(MainTab.home.title, systemImage: MainTab.home.icon) }
                .tag(MainTab.home)

            TripsView()
                .tabItem { Label(MainTab.trips.title, systemImage: MainTab.trips.icon) }
                .tag(MainTab.trips)

            TrailieView()
                .tabItem { Label(MainTab.trailie.title, systemImage: MainTab.trailie.icon) }
                .tag(MainTab.trailie)

            MapView()
                .tabItem { Label(MainTab.map.title, systemImage: MainTab.map.icon) }
                .tag(MainTab.map)

            SavedView()
                .tabItem { Label(MainTab.saved.title, systemImage: MainTab.saved.icon) }
                .tag(MainTab.saved)
        }
        .tint(TVColors.accentGreen)
        .background(palette.backgroundPrimary)
    }
}
