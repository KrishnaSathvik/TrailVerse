import Foundation

enum MainTab: Hashable {
    case home
    case trips
    case trailie
    case map
    case saved

    var title: String {
        switch self {
        case .home: "Home"
        case .trips: "Trips"
        case .trailie: "Trailie"
        case .map: "Map"
        case .saved: "Saved"
        }
    }

    var icon: String {
        switch self {
        case .home: TVIcons.home
        case .trips: TVIcons.trips
        case .trailie: TVIcons.trailie
        case .map: TVIcons.map
        case .saved: TVIcons.saved
        }
    }
}
