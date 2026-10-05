import SwiftUI

struct HomeView: View {
    @Environment(AppState.self) private var appState
    @Environment(AuthSession.self) private var authSession
    @Environment(\.colorScheme) private var colorScheme
    @State private var searchText = ""
    @State private var navigationPath = NavigationPath()

    var body: some View {
        let palette = TVColorPalette.palette(for: colorScheme)
        NavigationStack(path: $navigationPath) {
            ScrollView {
                VStack(alignment: .leading, spacing: TVSpacing.lg) {
                    if appState.hasActiveTripToday {
                        todayContent
                    } else {
                        discoveryContent
                    }
                }
                .padding(.horizontal, TVSpacing.screenHorizontal)
                .padding(.vertical, TVSpacing.md)
            }
            .background(palette.backgroundPrimary)
            .navigationTitle(appState.hasActiveTripToday ? "Today" : "Home")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        if authSession.isAuthenticated {
                            Task { await authSession.logout() }
                        } else {
                            authSession.promptSignIn()
                        }
                    } label: {
                        Image(systemName: TVIcons.person)
                    }
                    .accessibilityLabel(authSession.isAuthenticated ? "Sign out" : "Sign in")
                }
            }
            .navigationDestination(for: String.self) { value in
                if value == "explore-list" {
                    ExploreView()
                } else if value == "compare" {
                    CompareView()
                } else {
                    ParkDetailView(parkSlug: value)
                }
            }
            .handleDeepLinks(navigationPath: $navigationPath)
        }
    }

    private var discoveryContent: some View {
        VStack(alignment: .leading, spacing: TVSpacing.lg) {
            Text("Where do you want to go?")
                .font(TVTypography.title2)
                .foregroundStyle(TVColorPalette.palette(for: colorScheme).textPrimary)

            TVSearchField(text: $searchText)

            NavigationLink(value: "explore-list") {
                exploreEntryCard
            }

            NavigationLink(value: "compare") {
                compareEntryCard
            }

            planWithTrailieCard

            Text("Popular this season")
                .font(TVTypography.headline)
            Text("Browse all 64 national parks from Explore.")
                .font(TVTypography.subheadline)
                .foregroundStyle(.secondary)
        }
    }

    private var todayContent: some View {
        VStack(alignment: .leading, spacing: TVSpacing.md) {
            TVWeatherCard(
                condition: "Partly cloudy",
                temperature: "62°",
                summary: "Rain possible after 4 PM",
                updatedAt: "12 min ago"
            )
            TVPrimaryButton(title: "Check Today") {}
            TVSecondaryButton(title: "We're Running Late") {}
        }
    }

    private var exploreEntryCard: some View {
        let palette = TVColorPalette.palette(for: colorScheme)
        return HStack {
            VStack(alignment: .leading, spacing: TVSpacing.xxs) {
                Text("Explore all parks")
                    .font(TVTypography.headline)
                Text("470+ National Park Service sites")
                    .font(TVTypography.subheadline)
                    .foregroundStyle(palette.textSecondary)
            }
            Spacer()
            Image(systemName: TVIcons.chevronRight)
        }
        .padding(TVSpacing.md)
        .background(palette.surface)
        .clipShape(RoundedRectangle(cornerRadius: TVRadius.card, style: .continuous))
    }

    private var compareEntryCard: some View {
        let palette = TVColorPalette.palette(for: colorScheme)
        return HStack {
            VStack(alignment: .leading, spacing: TVSpacing.xxs) {
                Text("Compare parks")
                    .font(TVTypography.headline)
                Text("Weather, crowds, and best months side by side")
                    .font(TVTypography.subheadline)
                    .foregroundStyle(palette.textSecondary)
            }
            Spacer()
            Image(systemName: TVIcons.compare)
        }
        .padding(TVSpacing.md)
        .background(palette.surface)
        .clipShape(RoundedRectangle(cornerRadius: TVRadius.card, style: .continuous))
    }

    private var planWithTrailieCard: some View {
        VStack(alignment: .leading, spacing: TVSpacing.sm) {
            Text("Plan with Trailie")
                .font(TVTypography.headline)
            Text("Tell us where and when you want to travel.")
                .font(TVTypography.subheadline)
                .foregroundStyle(.secondary)
            TVPrimaryButton(title: "Start planning") {
                appState.openTrailie(parkCode: nil, parkName: nil)
            }
        }
        .padding(TVSpacing.md)
        .background(TVColors.accentGreen.opacity(0.08))
        .clipShape(RoundedRectangle(cornerRadius: TVRadius.card, style: .continuous))
    }
}
