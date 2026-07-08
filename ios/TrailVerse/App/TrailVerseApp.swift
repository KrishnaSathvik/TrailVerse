import SwiftUI

@main
struct TrailVerseApp: App {
    @State private var appState = AppState()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(appState)
                .environment(\.appEnvironment, AppEnvironment.current)
                .modelContainer(PersistenceController.shared)
                .onOpenURL { url in
                    appState.handleIncomingURL(url)
                }
        }
    }
}

/// Shared app-level state — auth, deep links, active trip mode.
@Observable
final class AppState {
    var selectedTab: MainTab = .home
    var pendingDestination: AppDestination?
    var isAuthenticated = false
    var hasActiveTripToday = false

    func handleIncomingURL(_ url: URL) {
        guard let destination = AppRouter.destination(from: url) else { return }
        pendingDestination = destination
        route(to: destination)
    }

    func route(to destination: AppDestination) {
        switch destination {
        case .home:
            selectedTab = .home
        case .explore:
            selectedTab = .home
        case .park, .compare, .trip, .trailie, .guide:
            break // Handled by navigation stack in feature views (Journey 1)
        case .map:
            selectedTab = .map
        case .saved:
            selectedTab = .saved
        }
    }
}

private struct AppEnvironmentKey: EnvironmentKey {
    static let defaultValue = AppEnvironment.current
}

extension EnvironmentValues {
    var appEnvironment: AppEnvironment {
        get { self[AppEnvironmentKey.self] }
        set { self[AppEnvironmentKey.self] = newValue }
    }
}
