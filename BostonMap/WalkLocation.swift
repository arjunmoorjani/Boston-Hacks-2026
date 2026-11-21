import CoreLocation
import SwiftUI

@MainActor
final class WalkLocation: NSObject, ObservableObject, CLLocationManagerDelegate {
    @Published private(set) var authorization: CLAuthorizationStatus
    @Published private(set) var current: CLLocation?
    @Published private(set) var failed = false

    private let manager = CLLocationManager()

    override init() {
        authorization = manager.authorizationStatus
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyNearestTenMeters
        manager.distanceFilter = 5
    }

    func start() {
        failed = false
        switch authorization {
        case .notDetermined:
            manager.requestWhenInUseAuthorization()
        case .authorizedAlways, .authorizedWhenInUse:
            manager.startUpdatingLocation()
        default:
            break
        }
    }

    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        authorization = manager.authorizationStatus
        switch authorization {
        case .authorizedAlways, .authorizedWhenInUse:
            start()
        default:
            current = nil
            manager.stopUpdatingLocation()
        }
    }

    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        current = locations.last
        failed = false
    }

    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        if current == nil {
            failed = true
        }
    }
}
