import SwiftData
import SwiftUI

@main
struct TrailVerseApp: App {
    @State private var appState = AppState()
    @State private var authSession = AuthSession()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(appState)
                .environment(authSession)
                .environment(\.appEnvironment, AppEnvironment.current)
                .modelContainer(PersistenceController.shared)
                .task {
                    await authSession.bootstrap()
                }
                .onOpenURL { url in
                    appState.handleIncomingURL(url)
                }
        }
    }
}

/// Shared app-level state — deep links, active trip mode, Trailie prefill.
@Observable
final class AppState {
    var selectedTab: MainTab = .home
    var pendingDestination: AppDestination?
    var hasActiveTripToday = false
    var trailieParkCode: String?
    var trailieParkName: String?
    var comparePrefillCodes: [String] = []
    var mapFocusParkCode: String?

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
            pendingDestination = .explore
        case .park(let slug, _):
            selectedTab = .home
            pendingDestination = .park(slug: slug, tab: nil)
        case .compare(let codes):
            selectedTab = .home
            comparePrefillCodes = codes
            pendingDestination = .compare(parkCodes: codes)
        case .trip(let id):
            selectedTab = .trips
            pendingDestination = .trip(id: id)
        case .guide:
            break
        case .trailie(let tripId, let parkCode, let parkName):
            trailieParkCode = parkCode
            trailieParkName = parkName
            selectedTab = .trailie
            if let tripId {
                pendingDestination = .trip(id: tripId)
            }
        case .map(let parkCode):
            selectedTab = .map
            mapFocusParkCode = parkCode
        case .saved:
            selectedTab = .saved
        }
    }

    func openTrailie(parkCode: String?, parkName: String?) {
        trailieParkCode = parkCode
        trailieParkName = parkName
        selectedTab = .trailie
    }

    func openCompare(parkCodes: [String] = []) {
        comparePrefillCodes = parkCodes
        selectedTab = .home
        pendingDestination = .compare(parkCodes: parkCodes)
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
