import SwiftUI

struct ParkDetailView: View {
    @Environment(\.colorScheme) private var colorScheme
    @Environment(AppState.self) private var appState
    @Environment(AuthSession.self) private var authSession
    let parkSlug: String
    @State private var viewModel: ParkDetailViewModel
    @State private var showCompare = false

    init(parkSlug: String) {
        self.parkSlug = parkSlug
        _viewModel = State(initialValue: ParkDetailViewModel(identifier: parkSlug))
    }

    var body: some View {
        let palette = TVColorPalette.palette(for: colorScheme)
        Group {
            switch viewModel.phase {
            case .loading:
                TVLoadingState(message: "Loading park…")
            case .failed(let message):
                TVErrorState(message: message) {
                    Task { await reload() }
                }
            case .loaded(let park):
                ScrollView {
                    VStack(alignment: .leading, spacing: TVSpacing.lg) {
                        Text(park.name)
                            .font(TVTypography.parkTitle)
                        Text(park.states)
                            .font(TVTypography.subheadline)
                            .foregroundStyle(palette.textSecondary)

                        HStack(spacing: TVSpacing.sm) {
                            TVPrimaryButton(title: "Plan with Trailie") {
                                appState.openTrailie(parkCode: park.parkCode, parkName: park.name)
                            }
                            Button {
                                if authSession.isAuthenticated {
                                    Task { await toggleSave(park: park) }
                                } else {
                                    authSession.promptSignIn("Sign in to save parks across devices.")
                                }
                            } label: {
                                Label(
                                    viewModel.isSaved ? "Saved" : "Save",
                                    systemImage: viewModel.isSaved ? TVIcons.heartFilled : TVIcons.heart
                                )
                                .frame(maxWidth: .infinity, minHeight: TVSpacing.minTouchTarget)
                            }
                            .buttonStyle(TVOutlineButtonStyle())
                            .disabled(viewModel.isSaving)
                        }

                        TVSecondaryButton(title: "Compare this park") {
                            appState.comparePrefillCodes = [park.parkCode]
                            showCompare = true
                        }

                        if let alert = park.sampleAlert {
                            TVAlertCard(
                                severity: .warning,
                                title: alert.title,
                                message: alert.message,
                                updatedAt: alert.updatedAt
                            )
                        }

                        TVWeatherCard(
                            condition: park.weatherCondition,
                            temperature: park.temperature,
                            summary: park.weatherSummary,
                            updatedAt: park.weatherUpdated
                        )
                    }
                    .padding(TVSpacing.screenHorizontal)
                }
            }
        }
        .navigationBarTitleDisplayMode(.inline)
        .navigationDestination(isPresented: $showCompare) {
            CompareView()
        }
        .task(id: parkSlug) { await reload() }
        .onChange(of: authSession.isAuthenticated) { _, _ in
            Task { await viewModel.refreshSavedState(isAuthenticated: authSession.isAuthenticated) }
        }
    }

    private func reload() async {
        await viewModel.load(isAuthenticated: authSession.isAuthenticated)
    }

    private func toggleSave(park: ParkDetailViewModel.ParkDetail) async {
        if authSession.isAuthenticated {
            await viewModel.toggleSave(parkCode: park.parkCode, parkName: park.name)
        } else {
            authSession.promptSignIn("Sign in to save parks across devices.")
        }
    }
}

@Observable
@MainActor
final class ParkDetailViewModel {
    enum Phase {
        case loading
        case loaded(ParkDetail)
        case failed(String)
    }

    struct ParkDetail {
        let parkCode: String
        let slug: String
        let name: String
        let states: String
        let sampleAlert: (title: String, message: String, updatedAt: String)?
        let weatherCondition: String
        let temperature: String
        let weatherSummary: String
        let weatherUpdated: String?
    }

    var phase: Phase = .loading
    var isSaved = false
    var isSaving = false

    private let identifier: String
    private let client = APIClient()
    private let parksService = ParksService()
    private let userService = UserService()
    private var loadedParkCode: String?

    init(identifier: String) {
        self.identifier = identifier
    }

    func load(isAuthenticated: Bool) async {
        phase = .loading
        do {
            let parkCode = try await parksService.resolveParkCode(for: identifier)

            struct ParkDTO: Decodable {
                let parkCode: String
                let fullName: String
                let states: String
            }
            struct AlertDTO: Decodable {
                let title: String?
                let description: String?
            }
            struct DetailsData: Decodable {
                let park: ParkDTO
                let alerts: [AlertDTO]?
            }

            async let detailsTask: APIEnvelope<DetailsData> = client.request("/parks/\(parkCode)/details")
            async let weatherTask: ParkWeatherDTO? = try? await parksService.weather(parkCode: parkCode)

            let envelope = try await detailsTask
            guard let data = envelope.data else {
                phase = .failed("Park not found.")
                return
            }

            let weather = await weatherTask
            loadedParkCode = data.park.parkCode

            let firstAlert = data.alerts?.first
            let alertTuple: (title: String, message: String, updatedAt: String)? = {
                guard let firstAlert else { return nil }
                let title = firstAlert.title ?? "Alert"
                let message = firstAlert.description ?? ""
                guard !message.isEmpty else { return nil }
                return (title, message, "Live")
            }()

            if isAuthenticated, let loadedParkCode {
                isSaved = (try? await userService.isParkSaved(parkCode: loadedParkCode)) ?? false
            } else {
                isSaved = false
            }

            phase = .loaded(ParkDetail(
                parkCode: data.park.parkCode,
                slug: ParkSlugUtils.parkToSlug(data.park.fullName),
                name: data.park.fullName,
                states: data.park.states,
                sampleAlert: alertTuple,
                weatherCondition: weather?.displayCondition ?? "Unavailable",
                temperature: weather?.displayTemperature ?? "—",
                weatherSummary: weather?.displaySummary ?? "Weather data unavailable",
                weatherUpdated: weather?.displayUpdatedAt
            ))
        } catch {
            phase = .failed(error.localizedDescription)
        }
    }

    func refreshSavedState(isAuthenticated: Bool) async {
        guard isAuthenticated, let loadedParkCode else {
            isSaved = false
            return
        }
        isSaved = (try? await userService.isParkSaved(parkCode: loadedParkCode)) ?? false
    }

    func toggleSave(parkCode: String, parkName: String) async {
        isSaving = true
        defer { isSaving = false }

        do {
            if isSaved {
                _ = try await userService.removeSavedPark(parkCode: parkCode)
                isSaved = false
            } else {
                _ = try await userService.savePark(parkCode: parkCode, parkName: parkName)
                isSaved = true
            }
        } catch {
            // Keep UI state unchanged on failure.
        }
    }
}
