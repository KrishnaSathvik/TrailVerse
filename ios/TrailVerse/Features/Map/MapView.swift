import SwiftUI
import MapKit

struct MapView: View {
    @State private var position: MapCameraPosition = .region(
        MKCoordinateRegion(
            center: CLLocationCoordinate2D(latitude: 39.5, longitude: -98.0),
            span: MKCoordinateSpan(latitudeDelta: 25, longitudeDelta: 25)
        )
    )

    var body: some View {
        NavigationStack {
            Map(position: $position)
                .ignoresSafeArea(edges: .bottom)
                .navigationTitle("Map")
        }
    }
}
