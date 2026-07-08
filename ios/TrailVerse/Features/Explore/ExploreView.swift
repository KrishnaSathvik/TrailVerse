import SwiftUI

struct ExploreView: View {
    @Environment(\.colorScheme) private var colorScheme
    @State private var viewModel = ExploreViewModel()

    var body: some View {
        Group {
            switch viewModel.phase {
            case .idle, .loading:
                TVLoadingState(message: "Loading parks…")
            case .failed(let message):
                TVErrorState(message: message) {
                    Task { await viewModel.load() }
                }
            case .loaded(let parks):
                List(parks) { park in
                    NavigationLink(value: park.slug) {
                        TVParkCard(
                            title: park.name,
                            subtitle: park.designation,
                            stateLabel: park.states,
                            imageURL: park.imageURL,
                            rating: nil,
                            onTap: {}
                        )
                    }
                    .listRowSeparator(.hidden)
                    .listRowInsets(EdgeInsets(top: 8, leading: 16, bottom: 8, trailing: 16))
                }
                .listStyle(.plain)
            }
        }
        .navigationTitle("Explore")
        .task { await viewModel.load() }
    }
}

@Observable
@MainActor
final class ExploreViewModel {
    enum Phase {
        case idle
        case loading
        case loaded([ParkSummary])
        case failed(String)
    }

    var phase: Phase = .idle
    private let client = APIClient()

    func load() async {
        phase = .loading
        do {
            let envelope: APIEnvelope<[ParkSummaryDTO]> = try await client.request("/parks?all=true&nationalParksOnly=true")
            guard let items = envelope.data else {
                phase = .failed("No parks returned.")
                return
            }
            phase = .loaded(items.map { ParkSummary(dto: $0) })
        } catch {
            phase = .failed(error.localizedDescription)
        }
    }
}

struct ParkSummary: Identifiable {
    let id: String
    let slug: String
    let name: String
    let states: String
    let designation: String
    let imageURL: URL?

    init(dto: ParkSummaryDTO) {
        id = dto.parkCode
        slug = dto.slug ?? dto.parkCode
        name = dto.fullName
        states = dto.states
        designation = dto.designation
        imageURL = dto.images?.first.flatMap { URL(string: $0.url) }
    }
}

struct ParkSummaryDTO: Decodable {
    let parkCode: String
    let fullName: String
    let states: String
    let designation: String
    let slug: String?
    let images: [ParkImageDTO]?
}

struct ParkImageDTO: Decodable {
    let url: String
}
