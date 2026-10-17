import SwiftUI

struct OnboardingView: View {
    @Environment(AuthSession.self) private var authSession
    @Binding var hasCompletedOnboarding: Bool
    @State private var page = 0

    private let pages: [(title: String, message: String, icon: String)] = [
        (
            "Explore more. Plan better.",
            "Discover 470+ National Park Service sites with live alerts, weather, and permits.",
            TVIcons.explore
        ),
        (
            "Trailie plans your trip",
            "Build realistic day-by-day itineraries with live park context — not generic travel chat.",
            TVIcons.trailie
        ),
        (
            "Stay on track while you travel",
            "Check today's plan, adapt when weather changes, and save trips across web and iPhone.",
            TVIcons.trips
        ),
    ]

    var body: some View {
        VStack(spacing: TVSpacing.lg) {
            TabView(selection: $page) {
                ForEach(Array(pages.enumerated()), id: \.offset) { index, item in
                    VStack(spacing: TVSpacing.lg) {
                        Image(systemName: item.icon)
                            .font(.system(size: 56))
                            .foregroundStyle(TVColors.accentGreen)
                        Text(item.title)
                            .font(TVTypography.title2)
                            .multilineTextAlignment(.center)
                        Text(item.message)
                            .font(TVTypography.body)
                            .foregroundStyle(.secondary)
                            .multilineTextAlignment(.center)
                    }
                    .padding(TVSpacing.xl)
                    .tag(index)
                }
            }
            .tabViewStyle(.page(indexDisplayMode: .always))

            VStack(spacing: TVSpacing.sm) {
                TVPrimaryButton(title: page == pages.count - 1 ? "Get Started" : "Continue") {
                    if page < pages.count - 1 {
                        page += 1
                    } else {
                        hasCompletedOnboarding = true
                        authSession.showAuthSheet = true
                    }
                }
                Button("Explore as Guest") {
                    hasCompletedOnboarding = true
                    authSession.continueAsGuest()
                }
                .buttonStyle(TVGhostButtonStyle())
            }
            .padding(.horizontal, TVSpacing.screenHorizontal)
            .padding(.bottom, TVSpacing.lg)
        }
        .background(TVColorPalette.palette(for: .light).backgroundPrimary)
    }
}
