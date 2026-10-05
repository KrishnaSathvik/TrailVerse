import SwiftUI

struct RootView: View {
    @Environment(AppState.self) private var appState
    @Environment(AuthSession.self) private var authSession
    @Environment(\.colorScheme) private var colorScheme
    @AppStorage("hasCompletedOnboarding") private var hasCompletedOnboarding = false

    var body: some View {
        Group {
            if !hasCompletedOnboarding {
                OnboardingView(hasCompletedOnboarding: $hasCompletedOnboarding)
            } else {
                mainTabs
            }
        }
        .sheet(isPresented: Bindable(authSession).showAuthSheet) {
            NavigationStack {
                AuthenticationView()
            }
        }
    }

    private var mainTabs: some View {
        let palette = TVColorPalette.palette(for: colorScheme)
        return TabView(selection: Bindable(appState).selectedTab) {
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
