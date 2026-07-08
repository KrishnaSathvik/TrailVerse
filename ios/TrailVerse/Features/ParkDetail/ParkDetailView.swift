import SwiftUI

struct ParkDetailView: View {
    @Environment(\.colorScheme) private var colorScheme
    @Environment(AppState.self) private var appState
    let parkSlug: String
    @State private var viewModel: ParkDetailViewModel

    init(parkSlug: String) {
        self.parkSlug = parkSlug
        _viewModel = State(initialValue: ParkDetailViewModel(slug: parkSlug))
    }

    var body: some View {
        let palette = TVColorPalette.palette(for: colorScheme)
        Group {
            switch viewModel.phase {
            case .loading:
                TVLoadingState(message: "Loading park…")
            case .failed(let message):
                TVErrorState(message: message) {
                    Task { await viewModel.load() }
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
                            TVPrimaryButton(title: "Plan a Trip") {
                                appState.selectedTab = .trailie
                            }
                            Button("Save") {}
                                .buttonStyle(TVOutlineButtonStyle())
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
        .task { await viewModel.load() }
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
        let name: String
        let states: String
        let sampleAlert: (title: String, message: String, updatedAt: String)?
        let weatherCondition: String
        let temperature: String
        let weatherSummary: String
        let weatherUpdated: String?
    }

    var phase: Phase = .loading
    private let slug: String
    private let client = APIClient()

    init(slug: String) {
        self.slug = slug
    }

    func load() async {
        phase = .loading
        do {
            struct ParkDTO: Decodable {
                let fullName: String
                let states: String
            }
            let envelope: APIEnvelope<ParkDTO> = try await client.request("/parks/\(slug)/details")
            guard let park = envelope.data else {
                phase = .failed("Park not found.")
                return
            }
            phase = .loaded(ParkDetail(
                name: park.fullName,
                states: park.states,
                sampleAlert: nil,
                weatherCondition: "—",
                temperature: "—",
                weatherSummary: "Weather loads in Journey 1 wiring",
                weatherUpdated: nil
            ))
        } catch {
            phase = .failed(error.localizedDescription)
        }
    }
}
