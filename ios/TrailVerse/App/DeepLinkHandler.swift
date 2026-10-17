import SwiftUI

struct TripRoute: Identifiable, Hashable {
    let id: String
}

/// Consumes `AppState.pendingDestination` and routes within tab stacks.
struct DeepLinkHandler: ViewModifier {
    @Environment(AppState.self) private var appState
    @Binding var navigationPath: NavigationPath
    var onTrip: ((String) -> Void)?

    func body(content: Content) -> some View {
        content
            .onAppear { consumePendingDestination() }
            .onChange(of: appState.pendingDestination) { _, _ in
                consumePendingDestination()
            }
    }

    private func consumePendingDestination() {
        guard let destination = appState.pendingDestination else { return }
        defer { appState.pendingDestination = nil }

        switch destination {
        case .park(let slug, _):
            navigationPath.append(slug)
        case .trip(let id):
            onTrip?(id)
        case .explore:
            navigationPath.append("explore-list")
        case .compare(let codes):
            appState.comparePrefillCodes = codes
            navigationPath.append("compare")
        default:
            break
        }
    }
}

extension View {
    func handleDeepLinks(
        navigationPath: Binding<NavigationPath>,
        onTrip: ((String) -> Void)? = nil
    ) -> some View {
        modifier(DeepLinkHandler(navigationPath: navigationPath, onTrip: onTrip))
    }
}
