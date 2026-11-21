export const locationWatchOptions = Object.freeze({
  enableHighAccuracy: true,
  maximumAge: 5000,
  timeout: 15000,
});

export function locationErrorMessage(error) {
  if (error?.code === 1) return "Allow location access to see yourself on the map.";
  if (error?.code === 3) return "Finding your location timed out. Try again.";
  return "Couldn’t get your location. Try again.";
}

export function watchUserLocation(geolocation, { onLocation, onError }) {
  const watchId = geolocation.watchPosition(
    position => {
      const latitude = Number(position?.coords?.latitude);
      const longitude = Number(position?.coords?.longitude);
      if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
        onLocation([latitude, longitude]);
      } else {
        onError("Couldn’t get your location. Try again.");
      }
    },
    error => onError(locationErrorMessage(error)),
    locationWatchOptions,
  );

  return () => geolocation.clearWatch(watchId);
}
