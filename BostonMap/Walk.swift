import MapKit
import SwiftUI

struct WalkStop: Identifiable {
    let title: String
    let detail: String
    let coordinate: CLLocationCoordinate2D

    var id: String { title }
}

struct Walk: Identifiable {
    let id: String
    let title: String
    let neighborhood: String
    let category: String
    let glyph: String
    let description: String
    let color: Color
    let stops: [WalkStop]
    let path: [CLLocationCoordinate2D]

    var distance: Double {
        zip(path, path.dropFirst()).reduce(0) { total, segment in
            total + MKMapPoint(segment.0).distance(to: MKMapPoint(segment.1))
        }
    }

    var walkingMinutes: Int {
        max(1, Int((distance / 75).rounded()))
    }

    var bounds: MKMapRect {
        var rect = MKMapRect.null
        for coordinate in path {
            let point = MKMapPoint(coordinate)
            rect = rect.union(MKMapRect(x: point.x, y: point.y, width: 1, height: 1))
        }
        return rect.insetBy(dx: -max(rect.width * 0.32, 130), dy: -max(rect.height * 0.6, 190))
    }

    static let all = [
        Walk(
            id: "newbury",
            title: "Newbury Dessert Crawl",
            neighborhood: "Back Bay",
            category: "Desserts",
            glyph: "birthday.cake",
            description: "Cookies, gelato, and a garden stroll down Boston’s Newbury Street.",
            color: Color(red: 0.84, green: 0.22, blue: 0.31),
            stops: [
                WalkStop(title: "Levain Bakery", detail: "Start with a warm, thick cookie.", coordinate: point(42.34829, -71.08346)),
                WalkStop(title: "Amorino", detail: "Stop for a rose-shaped scoop of gelato.", coordinate: point(42.35028, -71.07956)),
                WalkStop(title: "Public Garden", detail: "Take your last bites by the lagoon.", coordinate: point(42.35312, -71.06988))
            ],
            path: [
                point(42.34829, -71.08346), point(42.34841, -71.08343),
                point(42.34902, -71.08160), point(42.34980, -71.07929),
                point(42.35021, -71.07946), point(42.35028, -71.07956),
                point(42.35021, -71.07946), point(42.34980, -71.07929),
                point(42.35056, -71.07703), point(42.35126, -71.07491),
                point(42.35193, -71.07287), point(42.35259, -71.07084),
                point(42.35267, -71.07057), point(42.35279, -71.07030),
                point(42.35312, -71.06988)
            ]
        ),
        Walk(
            id: "harbor",
            title: "Boston Harborwalk",
            neighborhood: "Waterfront",
            category: "Sightseeing",
            glyph: "water.waves",
            description: "Follow the harbor from Long Wharf to the North End, with a stop in the park.",
            color: Color(red: 0.04, green: 0.45, blue: 0.51),
            stops: [
                WalkStop(title: "Long Wharf", detail: "Watch the ferries come and go.", coordinate: point(42.36001, -71.04912)),
                WalkStop(title: "Christopher Columbus Park", detail: "Walk under the trellis by the harbor.", coordinate: point(42.36096, -71.05147)),
                WalkStop(title: "Paul Revere Park", detail: "Finish by the water near the Charlestown Bridge.", coordinate: point(42.36954, -71.06114))
            ],
            path: [
                point(42.36001, -71.04912), point(42.35982, -71.04983),
                point(42.35993, -71.05093), point(42.36034, -71.05138),
                point(42.36096, -71.05147), point(42.36151, -71.05127),
                point(42.36200, -71.05083), point(42.36252, -71.05119),
                point(42.36325, -71.05170), point(42.36426, -71.05224),
                point(42.36517, -71.05291), point(42.36603, -71.05374),
                point(42.36653, -71.05474), point(42.36700, -71.05576),
                point(42.36717, -71.05701), point(42.36733, -71.05819),
                point(42.36753, -71.05903), point(42.36800, -71.05930),
                point(42.36912, -71.06039), point(42.36954, -71.06114)
            ]
        )
    ]
}

private func point(_ latitude: Double, _ longitude: Double) -> CLLocationCoordinate2D {
    CLLocationCoordinate2D(latitude: latitude, longitude: longitude)
}
