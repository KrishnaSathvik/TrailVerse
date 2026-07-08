import SwiftUI

struct SavedView: View {
    var body: some View {
        NavigationStack {
            TVEmptyState(
                title: "Saved",
                message: "Parks, guides, events, and offline trips you save will appear here.",
                actionTitle: "Explore parks",
                action: {}
            )
            .navigationTitle("Saved")
        }
    }
}
