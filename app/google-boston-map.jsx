"use client";

import { useEffect, useRef, useState } from "react";
import { googleMapId, loadGoogleMaps, mapPoint } from "../lib/google-maps.mjs";
import { Icon } from "./icons";

function fitWalks({ map, maps }, walks) {
  const visible = walks.filter(walk => walk?.path?.length);
  if (!visible.length) return;
  const bounds = new maps.LatLngBounds();
  for (const walk of visible) {
    for (const point of walk.path) bounds.extend(mapPoint(point));
    for (const stop of walk.stops) bounds.extend(mapPoint(stop.point));
  }
  // One place (e.g. a plan you just started) would zoom all the way in: stay at street level so nearby places show.
  const ne = bounds.getNorthEast(), sw = bounds.getSouthWest();
  if (Math.abs(ne.lat() - sw.lat()) < 0.0008 && Math.abs(ne.lng() - sw.lng()) < 0.0008) {
    map.setCenter(bounds.getCenter());
    map.setZoom(16);
    return;
  }
  const wide = map.getDiv().clientWidth >= 900;
  map.fitBounds(bounds, wide ? { top: 100, left: 450, right: 80, bottom: 60 }
    : { top: 120, left: 40, right: 70, bottom: 40 });
}

// Fit the map to a set of [lat, lng] points, leaving room for the top bar and the sheet/panel.
function fitPoints({ map, maps }, points) {
  if (!points.length) return;
  const bounds = new maps.LatLngBounds();
  for (const point of points) bounds.extend(mapPoint(point));
  const ne = bounds.getNorthEast(), sw = bounds.getSouthWest();
  if (Math.abs(ne.lat() - sw.lat()) < 0.0008 && Math.abs(ne.lng() - sw.lng()) < 0.0008) {
    map.setCenter(bounds.getCenter());
    map.setZoom(17);
    return;
  }
  const wide = map.getDiv().clientWidth >= 900;
  map.fitBounds(bounds, wide ? { top: 100, left: 450, right: 80, bottom: 60 } : { top: 120, left: 40, right: 70, bottom: 40 });
}

function addMarker({ map, AdvancedMarkerElement }, { point, label, onClick, className, text, zIndex, collisionBehavior }) {
  const marker = new AdvancedMarkerElement({
    map, position: mapPoint(point), title: label, gmpClickable: Boolean(onClick),
    anchorTop: "-50%", zIndex, collisionBehavior,
  });
  const content = document.createElement("span");
  content.className = className;
  content.textContent = text;
  content.setAttribute("aria-hidden", "true");
  marker.append(content);
  if (onClick) marker.addEventListener("gmp-click", onClick);
  return marker;
}

export function GoogleBostonMap({ walk, walks, selected, onSelect, location, locate, following, locationStatus, onPlaceClick, directions }) {
  const container = useRef(null);
  const stops = useRef([]);
  const [context, setContext] = useState(null);
  const [transit, setTransit] = useState(false);
  const [mapError, setMapError] = useState("");
  const placeClick = useRef(onPlaceClick);
  placeClick.current = onPlaceClick; // the map listener is set up once; always call the latest handler

  useEffect(() => {
    let disposed = false;
    let poiClickListener;
    const handleAuthFailure = () => setMapError("Google Maps couldn’t authenticate. Check the key and website restrictions.");
    window.addEventListener("sidewalk-google-auth-failure", handleAuthFailure);

    loadGoogleMaps().then(async maps => {
      const [{ Map }, { AdvancedMarkerElement }] = await Promise.all([
        maps.importLibrary("maps"), maps.importLibrary("marker"),
      ]);
      if (disposed) return;
      const map = new Map(container.current, {
        center: { lat: 42.355, lng: -71.07 }, zoom: 14, mapId: googleMapId,
        disableDefaultUI: true, keyboardShortcuts: true, gestureHandling: "greedy",
        clickableIcons: true, maxZoom: 20, minZoom: 3,
      });
      // Tapping a place icon on the map opens its profile (app/place-profile.jsx) instead of Google's popup.
      poiClickListener = map.addListener("click", event => {
        if (!("placeId" in event) || !event.placeId) return;
        event.stop();
        placeClick.current?.(event.placeId, { point: event.latLng ? [event.latLng.lat(), event.latLng.lng()] : null });
      });
      setContext({ map, maps, AdvancedMarkerElement });
    }).catch(() => {
      if (!disposed) setMapError("Couldn’t load Google Maps. Check your connection and API settings.");
    });

    return () => {
      disposed = true;
      poiClickListener?.remove();
      window.removeEventListener("sidewalk-google-auth-failure", handleAuthFailure);
    };
  }, []);

  useEffect(() => {
    if (!context) return;
    const layer = new context.maps.TransitLayer();
    layer.setMap(transit ? context.map : null);
    return () => layer.setMap(null);
  }, [context, transit]);

  useEffect(() => {
    if (!context) return;
    const { map, maps } = context;
    const lines = walks.flatMap(item => {
      const path = item.path.map(mapPoint);
      if (!path.length) return [];
      return [
        new maps.Polyline({ map, path, strokeColor: "#fff", strokeWeight: walk.path.length ? 10 : 7, clickable: false }),
        new maps.Polyline({ map, path, strokeColor: "#5839b5", strokeWeight: walk.path.length ? 6 : 4, clickable: false, zIndex: 1 }),
      ];
    });
    stops.current = walk.stops.map((stop, index) => addMarker(context, {
      point: stop.point, label: `Stop ${index + 1}: ${stop.name}`, onClick: () => onSelect(index),
      className: "google-pin", text: String(index + 1), zIndex: 30,
    }));
    fitWalks(context, walks);
    return () => {
      for (const line of lines) line.setMap(null);
      for (const marker of stops.current) marker.map = null;
      stops.current = [];
    };
  }, [context, walk, walks, onSelect]);

  // In-app directions: dotted walking legs, rides in their line's color, you and the destination.
  useEffect(() => {
    if (!context || !directions) return;
    const { map, maps } = context;
    const overlays = [];
    for (const segment of directions.segments ?? []) {
      const path = segment.path.map(mapPoint);
      if (path.length < 2) continue;
      if (segment.kind === "transit") {
        overlays.push(new maps.Polyline({ map, path, strokeColor: "#fff", strokeWeight: 11, clickable: false, zIndex: 2 }));
        overlays.push(new maps.Polyline({ map, path, strokeColor: segment.line.color, strokeWeight: 7, clickable: false, zIndex: 3 }));
      } else {
        overlays.push(new maps.Polyline({
          map, path, strokeOpacity: 0, clickable: false, zIndex: 4,
          icons: [{ icon: { path: maps.SymbolPath.CIRCLE, scale: 3.2, fillColor: "#4B33C9", fillOpacity: 1, strokeColor: "#fff", strokeWeight: 1.5 }, offset: "0", repeat: "11px" }],
        }));
      }
    }
    const markers = [
      directions.origin && addMarker(context, { point: directions.origin, label: "Your location", className: "google-location", text: "", zIndex: 40 }),
      addMarker(context, { point: directions.destination, label: directions.destinationName, className: "dir-dest-pin", text: "", zIndex: 41 }),
    ].filter(Boolean);
    return () => {
      for (const line of overlays) line.setMap(null);
      for (const marker of markers) marker.map = null;
    };
  }, [context, directions]);

  // Frame the whole trip, or just the step the user tapped.
  useEffect(() => {
    if (!context || !directions) return;
    const segment = directions.focus != null ? directions.segments?.[directions.focus] : null;
    const points = segment?.path.length ? segment.path
      : [...(directions.origin ? [directions.origin] : []), directions.destination, ...(directions.segments ?? []).flatMap(item => item.path)];
    fitPoints(context, points);
  }, [context, directions]);

  useEffect(() => {
    stops.current.forEach((marker, index) => marker.firstElementChild.classList.toggle("selected", selected === index));
  }, [context, walk, selected]);

  useEffect(() => {
    if (!context || !location) return;
    const dot = addMarker(context, { point: location, label: "Your location", className: "google-location", text: "", zIndex: 40 });
    if (following) context.map.panTo(mapPoint(location));
    return () => { dot.map = null; };
  }, [context, location, following]);

  return <section className="map google-map" aria-label="Interactive Boston map">
    <div className="google-map-canvas" ref={container}/>
    <div className="map-label"><span className="map-label-dot"/> {walk.area ? `${walk.area}, Boston` : walks.length ? `${walks.length} walks · Boston` : "Boston"}</div>
    <div className="map-controls">
      <div className="control-group">
        <button aria-label="Zoom in" disabled={!context} onClick={() => context.map.setZoom(context.map.getZoom() + 1)}><Icon name="plus"/></button>
        <button aria-label="Zoom out" disabled={!context} onClick={() => context.map.setZoom(context.map.getZoom() - 1)}><Icon name="minus"/></button>
      </div>
      <div className="control-group">
        <button aria-label="Fit routes on map" disabled={!context || !walks.some(item => item.path.length)} onClick={() => fitWalks(context, walks)}><Icon name="fit"/></button>
        <button aria-label={following ? "Stop location tracking" : "Show my location"}
          title={following ? "Stop location tracking" : "Show my location"}
          aria-pressed={following} onClick={locate}><Icon name="locate"/></button>
      </div>
    </div>
    <button className="transit-toggle catalog-button" type="button" disabled={!context}
      aria-label={transit ? "Hide T lines" : "Show T lines"} aria-pressed={transit}
      onClick={() => setTransit(value => !value)}>T lines</button>
    {(mapError || !context || locationStatus) && <div className="map-notice" role="status">{mapError || locationStatus || "Loading Google Maps…"}</div>}
  </section>;
}
