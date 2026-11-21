"use client";

import { useEffect, useRef, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { MetroIcon } from "@hugeicons/core-free-icons";
import { googleMapId, loadGoogleMaps, mapPoint } from "../lib/google-maps.mjs";
import mbtaLines from "./data/mbta-lines.json";

const routePurple = "#5839b5";
const routePurpleLight = "#aa9cdd";

function lineScale(zoom = 14) {
  const normalized = Math.max(0, Math.min(1, (zoom - 10) / 5));
  return normalized ** 2;
}

function tLineWeights(zoom = 14) {
  const closeUp = lineScale(zoom);
  return { outline: 4 + (10 * closeUp), color: 2 + (6 * closeUp) };
}

function walkLineWeights(zoom = 14) {
  const closeUp = lineScale(zoom);
  return { outline: 3.5 + (8.5 * closeUp), color: 2 + (5 * closeUp) };
}

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

export function GoogleBostonMap({ walk, walks, selected, onSelect, activeWalkId, onOpenWalk, location, following, locationStatus, onPlaceClick, directions }) {
  const container = useRef(null);
  const stops = useRef([]);
  const browseView = useRef(null);
  const previousActiveWalk = useRef(activeWalkId);
  const [context, setContext] = useState(null);
  const [transit, setTransit] = useState(false);
  const [mapError, setMapError] = useState("");
  const placeClick = useRef(onPlaceClick);
  placeClick.current = onPlaceClick; // the map listener is set up once; always call the latest handler
  const walkClick = useRef(onOpenWalk);
  walkClick.current = onOpenWalk;

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
    const overlays = transit ? mbtaLines.lines.map(line => {
      const path = line.path.map(mapPoint);
      return {
        outline: new context.maps.Polyline({
          map: context.map, path, strokeColor: "#111111", strokeOpacity: .96,
          clickable: false, zIndex: 12,
        }),
        color: new context.maps.Polyline({
          map: context.map, path, strokeColor: line.color, strokeOpacity: 1,
          clickable: false, zIndex: 13,
        }),
      };
    }) : [];
    const resizeLines = () => {
      const weights = tLineWeights(context.map.getZoom());
      for (const overlay of overlays) {
        overlay.outline.setOptions({ strokeWeight: weights.outline });
        overlay.color.setOptions({ strokeWeight: weights.color });
      }
    };
    resizeLines();
    const zoomListener = context.map.addListener("zoom_changed", resizeLines);
    return () => {
      layer.setMap(null);
      zoomListener.remove();
      for (const overlay of overlays) {
        overlay.outline.setMap(null);
        overlay.color.setMap(null);
      }
    };
  }, [context, transit]);

  useEffect(() => {
    if (!context) return;
    const { map, maps } = context;
    const wasActive = previousActiveWalk.current;
    const enteringWalk = !wasActive && Boolean(activeWalkId);
    const leavingWalk = Boolean(wasActive) && !activeWalkId;
    if (enteringWalk) {
      const center = map.getCenter();
      browseView.current = center ? { center: center.toJSON(), zoom: map.getZoom() } : null;
    }
    const lines = walks.flatMap(item => {
      const path = item.path.map(mapPoint);
      if (!path.length) return [];
      const active = item.id === activeWalkId;
      const hit = new maps.Polyline({
        map, path, strokeColor: "#000000", strokeOpacity: .01, strokeWeight: 24,
        clickable: true, cursor: "pointer", zIndex: active ? 24 : 8,
      });
      const clickListener = hit.addListener("click", () => walkClick.current?.(item.id));
      return [{
        active,
        outline: new maps.Polyline({
          map, path, strokeColor: "#111111", strokeOpacity: active ? 1 : .14,
          clickable: false, zIndex: active ? 20 : 4,
        }),
        color: new maps.Polyline({
          map, path, strokeColor: active ? routePurple : routePurpleLight,
          strokeOpacity: active ? 1 : .58, clickable: false, zIndex: active ? 21 : 5,
        }),
        hit,
        clickListener,
      }];
    });
    const resizeLines = () => {
      const weights = walkLineWeights(map.getZoom());
      for (const line of lines) {
        line.outline.setOptions({ strokeWeight: weights.outline });
        line.color.setOptions({ strokeWeight: weights.color });
      }
    };
    resizeLines();
    const zoomListener = map.addListener("zoom_changed", resizeLines);
    stops.current = walk.stops.map((stop, index) => addMarker(context, {
      point: stop.point, label: `Stop ${index + 1}: ${stop.name}`, onClick: () => onSelect(index),
      className: "google-pin", text: String(index + 1), zIndex: 30,
    }));
    if (leavingWalk && browseView.current) {
      map.setCenter(browseView.current.center);
      map.setZoom(browseView.current.zoom);
      browseView.current = null;
    } else {
      fitWalks(context, walks);
    }
    previousActiveWalk.current = activeWalkId;
    return () => {
      zoomListener.remove();
      for (const line of lines) {
        line.outline.setMap(null);
        line.color.setMap(null);
        line.hit.setMap(null);
        line.clickListener.remove();
      }
      for (const marker of stops.current) marker.map = null;
      stops.current = [];
    };
  }, [context, walk, walks, onSelect, activeWalkId]);

  // In-app directions: dotted walking legs, rides in their line's color, you and the destination.
  useEffect(() => {
    if (!context || !directions) return;
    const { map, maps } = context;
    const overlays = [];
    for (const segment of directions.segments ?? []) {
      const path = segment.path.map(mapPoint);
      if (path.length < 2) continue;
      if (segment.kind === "transit") {
        overlays.push(new maps.Polyline({ map, path, strokeColor: "#111111", strokeWeight: 12, clickable: false, zIndex: 2 }));
        overlays.push(new maps.Polyline({ map, path, strokeColor: segment.line.color, strokeWeight: 7, clickable: false, zIndex: 3 }));
      } else {
        overlays.push(new maps.Polyline({
          map, path, strokeOpacity: 0, clickable: false, zIndex: 4,
          icons: [{ icon: { path: maps.SymbolPath.CIRCLE, scale: 3.4, fillColor: "#269ad5", fillOpacity: 1, strokeColor: "#111111", strokeWeight: 2 }, offset: "0", repeat: "12px" }],
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
    <button className="transit-toggle catalog-button" type="button" disabled={!context}
      aria-label={transit ? "Hide T lines" : "Show T lines"} aria-pressed={transit}
      title={transit ? "Hide T lines" : "Show T lines"}
      onClick={() => setTransit(value => !value)}>
      <HugeiconsIcon icon={MetroIcon} aria-hidden="true" />
    </button>
    {(mapError || !context || locationStatus) && <div className="map-notice" role="status">{mapError || locationStatus || "Loading Google Maps…"}</div>}
  </section>;
}
