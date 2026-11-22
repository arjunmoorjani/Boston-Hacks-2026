"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { MetroIcon, UserIcon } from "@hugeicons/core-free-icons";
import { loadGoogleMaps, mapPoint } from "../lib/google-maps.mjs";
import { EXPLORE_GOOGLE_ICONS_STYLE, EXPLORE_STYLE, HIDE_GOOGLE_PARK_T_NAMES, ICON_PATHS, ROUTE_THEME, WALK_OPEN_STYLE, placeIconFor, stopMarker } from "../lib/map-style.mjs";
import { CELL_DEG, LABEL_ZOOM, MIN_ZOOM as PLACES_MIN_ZOOM, isRealPark, minZoomFor, parkAndTNames, parkWeight, placesForView } from "../lib/nearby-places.mjs";
import { CITIES, FEATURES, NEIGHBORHOODS, areaLevel } from "../lib/area-labels.mjs";
import mbtaLines from "./data/mbta-lines.json";
import { Icon } from "./icons";

// Most places and park names on screen at once, at zoom 15 / 16 / 17+, whatever the screen size (a phone's screen
// size usually allows fewer: about 10 / 15 / 24 places and 4 / 5 / 9 park names).
const MAX_PLACES = [15, 25, 40];
const MAX_PARK_NAMES = [6, 10, 15];
const MAX_PLACES_FAR_OUT = 10; // logger maps below zoom 15

// Routes and transit lines top out at 24. Keep every name in one protected layer above them.
const MAP_LABEL_Z_INDEX = 60;

function lineScale(zoom = 14) {
  const normalized = Math.max(0, Math.min(1, (zoom - 10) / 5));
  return normalized ** 2;
}

function tLineWeights(zoom = 14) {
  const closeUp = lineScale(zoom);
  return { outline: 4 + (10 * closeUp), color: 2 + (6 * closeUp) };
}

// Browsing many walks: open on the ones in and around downtown (about 2.5 km), so routes are big enough to read,
// instead of zooming out to show every walk from Medford to Quincy. Farther walks are a pinch away.
const DOWNTOWN = [42.357, -71.062];
const CORE_KM = 2.5;
const BROWSE_MIN_ZOOM = 13;
function nearDowntown(walk) {
  const [lat, lng] = walk.stops[0]?.point ?? walk.path[0];
  const km = Math.hypot((lat - DOWNTOWN[0]) * 111, (lng - DOWNTOWN[1]) * 82);
  return km <= CORE_KM;
}

function fitWalks({ map, maps }, walks) {
  let visible = walks.filter(walk => walk?.path?.length);
  if (!visible.length) return;
  let browsing = false;
  if (visible.length > 3) {
    const core = visible.filter(nearDowntown);
    if (core.length >= 3) { visible = core; browsing = true; }
  }
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
  // On a phone downtown is wider than the screen (MIT to East Boston): stay at city level, centered on it.
  if (browsing) maps.event.addListenerOnce(map, "idle", () => { if (map.getZoom() < BROWSE_MIN_ZOOM) map.setZoom(BROWSE_MIN_ZOOM); });
}

// Fit the map to a set of [lat, lng] points, leaving room for the top bar and the sheet/panel.
function fitPoints({ map, maps }, points, padding) {
  if (!points.length) return;
  const bounds = new maps.LatLngBounds();
  for (const point of points) bounds.extend(mapPoint(point));
  const ne = bounds.getNorthEast(), sw = bounds.getSouthWest();
  if (Math.abs(ne.lat() - sw.lat()) < 0.0008 && Math.abs(ne.lng() - sw.lng()) < 0.0008) {
    map.setCenter(bounds.getCenter());
    map.setZoom(16); // one place: street level with its neighbors around it (17 was too close on the small log maps)
    return;
  }
  const wide = map.getDiv().clientWidth >= 900;
  map.fitBounds(bounds, padding ?? (wide ? { top: 100, left: 450, right: 80, bottom: 60 } : { top: 120, left: 40, right: 70, bottom: 40 }));
}

// Directions on the map: dotted walking, solid bike and car in the route blue, rides in their MBTA line color.
// Returns the lines to remove later.
function drawSegments({ map, maps }, segments) {
  const overlays = [];
  for (const segment of segments ?? []) {
    const path = segment.path.map(mapPoint);
    if (path.length < 2) continue;
    if (segment.kind === "transit") {
      overlays.push(new maps.Polyline({ map, path, strokeColor: ROUTE_THEME.casing, strokeWeight: 10, clickable: false, zIndex: 22 }));
      overlays.push(new maps.Polyline({ map, path, strokeColor: segment.line.color, strokeWeight: 6, clickable: false, zIndex: 23 }));
    } else if (segment.kind === "bike" || segment.kind === "drive") {
      overlays.push(new maps.Polyline({ map, path, strokeColor: ROUTE_THEME.casing, strokeWeight: ROUTE_THEME.casingWeight, clickable: false, zIndex: 22 }));
      overlays.push(new maps.Polyline({ map, path, strokeColor: ROUTE_THEME.line, strokeWeight: ROUTE_THEME.lineWeight, clickable: false, zIndex: 23 }));
    } else {
      overlays.push(new maps.Polyline({
        map, path, strokeOpacity: 0, clickable: false, zIndex: 24,
        icons: [{ icon: { path: maps.SymbolPath.CIRCLE, scale: 3, fillColor: ROUTE_THEME.line, fillOpacity: 1, strokeColor: ROUTE_THEME.casing, strokeWeight: 1.5 }, offset: "0", repeat: "11px" }],
      }));
    }
  }
  return overlays;
}

// HTML markers drawn with an OverlayView (Advanced Markers need a mapId, which this map can't have): your location
// dot, the directions pins, our place markers and our text labels. Centered on the point unless `transform` says
// otherwise; `content` is an element to show instead of an empty span; `onClick` makes it tappable.
// Remove with setMap(null).
function htmlMarkerClass(maps) {
  return class HtmlMarker extends maps.OverlayView {
    constructor({ map, point, label, className, zIndex = 40, content, onClick, transform = "translate(-50%,-50%)" }) {
      super();
      this.position = new maps.LatLng(point[0], point[1]);
      this.interactive = Boolean(onClick);
      this.div = document.createElement("div");
      this.div.style.cssText = `position:absolute;transform:${transform};z-index:${zIndex};pointer-events:${this.interactive ? "auto" : "none"};`;
      this.div.title = label ?? "";
      let inner = content;
      if (!inner) {
        inner = document.createElement("span");
        inner.className = className;
        inner.setAttribute("aria-hidden", "true");
      }
      this.div.append(inner);
      if (onClick) this.div.addEventListener("click", event => { event.stopPropagation(); onClick(); });
      this.setMap(map);
    }
    onAdd() {
      // a tap opens the place, not the map; pinch, scroll-wheel zoom and drags still reach the map (blocking those
      // made the browser zoom the whole page when the pointer was over a marker)
      if (this.interactive) maps.OverlayView.preventMapHitsFrom?.(this.div);
      // labels and pins sit on top of the route lines; they take no taps, so places under them stay tappable
      this.getPanes()[this.interactive ? "overlayMouseTarget" : "floatPane"].appendChild(this.div);
    }
    draw() {
      const at = this.getProjection()?.fromLatLngToDivPixel(this.position);
      if (!at) return;
      this.div.style.left = `${at.x}px`;
      this.div.style.top = `${at.y}px`;
    }
    onRemove() { this.div.remove(); }
  };
}

function addHtmlMarker({ map, HtmlMarker }, options) {
  return new HtmlMarker({ map, ...options });
}

// Text on the map in the app's font (city and neighborhood names, stop names).
function textLabel(context, { point, text, className, transform, zIndex = MAP_LABEL_Z_INDEX }) {
  const span = document.createElement("span");
  span.className = `map-text ${className}`;
  span.textContent = text;
  span.setAttribute("aria-hidden", "true");
  return addHtmlMarker(context, { point, content: span, transform, zIndex });
}

// One of our place markers: our icon in a Google-colored dot, with the place's name (shown when zoomed in close).
function placeMarker(context, place, onClick) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = place.icon === "park" ? "poi-marker is-park" : "poi-marker"; // a park's name is drawn on top instead
  button.style.setProperty("--poi", place.color);
  button.setAttribute("aria-label", place.name);
  const dot = document.createElement("span");
  dot.className = "poi-dot";
  dot.innerHTML = `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${ICON_PATHS[place.icon] ?? ICON_PATHS.place}"/></svg>`;
  const name = document.createElement("span");
  name.className = "poi-name";
  name.textContent = place.name;
  button.append(dot, name);
  return addHtmlMarker(context, {
    point: place.point,
    content: button,
    onClick,
    transform: "translate(-11px,-50%)",
    zIndex: MAP_LABEL_Z_INDEX,
  });
}

// A stop as an image (lib/map-style.mjs): its category icon (fork and knife, tree, …) with a number badge,
// bigger when selected, blue with a check once you've done it.
function stopMarkerIcon(maps, stop, number, { selected = false, done = false, favorite = false } = {}) {
  const { url, width, height, anchor } = stopMarker(number, { icon: placeIconFor(stop.primaryType, stop.name), selected, done, favorite });
  return { url, scaledSize: new maps.Size(width, height), anchor: new maps.Point(anchor[0], anchor[1]) };
}

// Two lines per route: a white casing under the blue line. The open walk is at full strength, others dimmed.
// Popular walks glow: soft light-blue halos under the casing, and they stay at full strength.
// The editor's draft (straight lines between stops) is a dashed, lighter line.
function drawRoute(maps, map, path, { active, draft, popular, favorite }) {
  const { casing, glow, lineWeight, casingWeight, dimOpacity, draftOpacity } = ROUTE_THEME;
  const line = favorite ? ROUTE_THEME.favorite : ROUTE_THEME.line; // hearted walks are pink
  const opacity = draft ? draftOpacity : active || popular || favorite ? 1 : dimOpacity; // favorites stand out too
  const z = active ? 20 : favorite ? 14 : popular ? 10 : 4;
  const halos = popular && !draft ? [
    new maps.Polyline({ map, path, strokeColor: glow, strokeOpacity: 0.12, strokeWeight: casingWeight + 16, clickable: false, zIndex: z }),
    new maps.Polyline({ map, path, strokeColor: glow, strokeOpacity: 0.22, strokeWeight: casingWeight + 8, clickable: false, zIndex: z }),
  ] : [];
  const under = new maps.Polyline({ map, path, strokeColor: casing, strokeOpacity: opacity, strokeWeight: casingWeight, clickable: false, zIndex: z + 1 });
  const over = draft
    ? new maps.Polyline({
        map, path, strokeOpacity: 0, clickable: false, zIndex: z + 2,
        icons: [{ icon: { path: "M 0,-1 0,1", strokeColor: line, strokeOpacity: opacity, strokeWeight: lineWeight, scale: 2 }, offset: "0", repeat: "10px" }],
      })
    : new maps.Polyline({ map, path, strokeColor: line, strokeOpacity: opacity, strokeWeight: lineWeight, clickable: false, zIndex: z + 2 });
  return [...halos, under, over];
}

export function GoogleBostonMap({ walk, walks, selected, onSelect, activeWalkId, onOpenWalk, legSegments, focusPath, doneStops = 0, popularIds, favoriteIds, highlight, location, following, onLocate, locationStatus, onPlaceClick, onMapClick, directions, userLocationIcon = false, showTransitToggle = true, alwaysShowPlaces = false }) {
  const container = useRef(null);
  const stops = useRef([]);
  const browseView = useRef(null);
  const previousActiveWalk = useRef(activeWalkId);
  const [context, setContext] = useState(null);
  const [transit, setTransit] = useState(false);
  const [zoom, setZoom] = useState(14);
  const [nearby, setNearby] = useState([]);           // our place markers while exploring
  const [nearbyFailed, setNearbyFailed] = useState(false); // Nearby Search unavailable: show Google's icons instead
  const [parkNamesFailed, setParkNamesFailed] = useState(false); // park-and-T search unavailable: keep Google's names
  const [mapError, setMapError] = useState("");
  const placeClick = useRef(onPlaceClick);
  placeClick.current = onPlaceClick; // the map listener is set up once; always call the latest handler
  const mapClick = useRef(onMapClick);
  mapClick.current = onMapClick;
  const walkClick = useRef(onOpenWalk);
  walkClick.current = onOpenWalk;

  useEffect(() => {
    let disposed = false;
    let poiClickListener, zoomListener;
    const handleAuthFailure = () => setMapError("Google Maps couldn’t authenticate. Check the key and website restrictions.");
    window.addEventListener("sidewalk-google-auth-failure", handleAuthFailure);

    loadGoogleMaps().then(async maps => {
      const { Map } = await maps.importLibrary("maps");
      if (disposed) return;
      // No mapId on purpose: Google ignores `styles` on a map that has one.
      const map = new Map(container.current, {
        center: { lat: 42.355, lng: -71.07 }, zoom: 14, styles: EXPLORE_STYLE,
        disableDefaultUI: true, keyboardShortcuts: true, gestureHandling: "greedy",
        clickableIcons: true, maxZoom: 20, minZoom: 3,
      });
      // Tapping a place icon on the map opens its profile (app/place-profile.jsx) instead of Google's popup.
      poiClickListener = map.addListener("click", event => {
        if (("placeId" in event) && event.placeId) {
          event.stop();
          placeClick.current?.(event.placeId, { point: event.latLng ? [event.latLng.lat(), event.latLng.lng()] : null });
          return;
        }
        if (event.latLng) mapClick.current?.([event.latLng.lat(), event.latLng.lng()]);
      });
      zoomListener = map.addListener("zoom_changed", () => setZoom(map.getZoom()));
      setContext({ map, maps, HtmlMarker: htmlMarkerClass(maps) });
    }).catch(() => {
      if (!disposed) setMapError("Couldn’t load Google Maps. Check your connection and API settings.");
    });

    return () => {
      disposed = true;
      poiClickListener?.remove();
      zoomListener?.remove();
      window.removeEventListener("sidewalk-google-auth-failure", handleAuthFailure);
    };
  }, []);

  // The map area changes size when the sheet's resting height changes (e.g. opening a walk): frame the walks again.
  const walksRef = useRef(walks);
  walksRef.current = walks;
  useEffect(() => {
    if (!context || typeof ResizeObserver === "undefined") return;
    let lastHeight = container.current.clientHeight;
    let timer;
    const observer = new ResizeObserver(() => {
      const height = container.current?.clientHeight ?? 0;
      if (Math.abs(height - lastHeight) < 4) return;
      lastHeight = height;
      // give Google a moment to pick up the new size first, or it frames for the old one
      clearTimeout(timer);
      timer = setTimeout(() => fitWalks(context, walksRef.current), 150);
    });
    observer.observe(container.current);
    return () => { observer.disconnect(); clearTimeout(timer); };
  }, [context]);

  // Exploring: our own place markers instead of Google's icons (or Google's if ours can't load). A walk is open, or a
  // place is selected (its card is open): no place icons at all, so only the walk's stops or that place show.
  const focused = Boolean(activeWalkId) || Boolean(highlight?.point);
  const showPlaces = !focused && !nearbyFailed && (alwaysShowPlaces || zoom >= PLACES_MIN_ZOOM);
  // From zoom 15 (where our place data loads) park and T names are ours, on top of everything; Google's are off.
  const ourTopNames = !nearbyFailed && !parkNamesFailed && zoom >= PLACES_MIN_ZOOM;
  useEffect(() => {
    if (!context) return;
    const base = focused ? WALK_OPEN_STYLE : nearbyFailed ? EXPLORE_GOOGLE_ICONS_STYLE : EXPLORE_STYLE;
    context.map.setOptions({ styles: ourTopNames ? [...base, ...HIDE_GOOGLE_PARK_T_NAMES] : base, clickableIcons: !focused });
  }, [context, focused, nearbyFailed, ourTopNames]);

  // Load places for the area on screen whenever the map settles (lib/nearby-places.mjs caches by area). Also with a
  // walk open: its park and T names come from the same data.
  useEffect(() => {
    if (!context || nearbyFailed) return;
    const { map } = context;
    let stale = false;
    const load = () => {
      if (!alwaysShowPlaces && map.getZoom() < PLACES_MIN_ZOOM) return;
      const bounds = map.getBounds(), center = map.getCenter();
      if (!bounds || !center) return;
      const visible = bounds.toJSON();
      // Logger maps keep place icons at every zoom. Search only a few cells around the center so zooming far out
      // cannot accidentally request thousands of Nearby Search grid cells.
      const { north, south, east, west } = alwaysShowPlaces ? {
        north: center.lat() + CELL_DEG * 1.5,
        south: center.lat() - CELL_DEG * 1.5,
        east: center.lng() + CELL_DEG * 1.5,
        west: center.lng() - CELL_DEG * 1.5,
      } : visible;
      placesForView({ north, south, east, west }, [center.lat(), center.lng()]).then(({ places, failed, parkNamesFailed: parksDown }) => {
        if (stale) return;
        if (parksDown) setParkNamesFailed(true);
        if (failed && !places.length) setNearbyFailed(true);
        else setNearby(places);
      });
    };
    const idle = map.addListener("idle", load);
    load();
    return () => { stale = true; idle.remove(); };
  }, [context, nearbyFailed, alwaysShowPlaces]);

  // Park and T station names: always shown from zoom 15, on the top layer, in every mode. Other names and icons
  // give way to them. T stations get no marker, just the name with a small T.
  // (A park that's a stop on the open walk already has its name next to the stop.)
  const topNames = useMemo(() => {
    if (!ourTopNames) return [];
    const stopIds = new Set(walk.stops.map(stop => stop.placeId).filter(Boolean));
    return parkAndTNames(nearby, zoom).filter(place => !stopIds.has(place.placeId));
  }, [ourTopNames, nearby, walk, zoom]);
  const topLabels = useRef([]);
  const topShown = useRef(new Set()); // park names on screen after the last check: they keep their spot as you zoom
  useEffect(() => {
    if (!context) return;
    const labels = topNames.map(place => {
      const station = place.icon === "train";
      // next to a park's icon while exploring; centered on the spot otherwise (T stations, or a walk is open)
      const beside = !station && !focused;
      const label = textLabel(context, { point: place.point, text: place.name, zIndex: MAP_LABEL_Z_INDEX + (station ? 10 : 20), // parks on top of all
        className: station ? "top-label t-label" : "top-label park-label", transform: beside ? "translate(14px,-50%)" : "translate(-50%,-50%)" });
      label.placeId = place.placeId;
      label.station = station;
      label.weight = station ? 0 : parkWeight(place);
      return label;
    });
    topLabels.current = labels;
    return () => { for (const label of labels) label.setMap(null); topLabels.current = []; };
  }, [context, topNames, focused]);

  // Draw our place markers that this zoom has reached (lib/nearby-places.mjs: prominent places show farther out),
  // adding and removing only what changed. `nearby` is in prominence order.
  const placeMarkers = useRef(new Map());
  const visiblePlaces = useMemo(() => showPlaces
    ? nearby.filter(place => place.icon !== "train" && (alwaysShowPlaces || zoom >= minZoomFor(place)) // T stations: names only
      && !(place.icon === "park" && !isRealPark(place))) : [], [showPlaces, nearby, zoom, alwaysShowPlaces]);
  useEffect(() => {
    if (!context) return;
    const drawn = placeMarkers.current;
    const keep = new Set(visiblePlaces.map(place => place.placeId));
    for (const [id, marker] of drawn) if (!keep.has(id)) { marker.setMap(null); drawn.delete(id); }
    for (const place of visiblePlaces) {
      if (!drawn.has(place.placeId)) drawn.set(place.placeId, placeMarker(context, place,
        () => placeClick.current?.(place.placeId, { name: place.name, point: place.point })));
    }
  }, [context, visiblePlaces]);
  useEffect(() => () => { for (const marker of placeMarkers.current.values()) marker.setMap(null); }, []);

  // Google's rules for crowded spots, most prominent place first:
  //  - from zoom 16 a place is its icon and its name together: it shows only if both fit clear of everything already
  //    shown (places, park and T names); otherwise the whole place waits for a closer zoom
  //  - at zoom 15, icons only, with room between them
  //  - never more places than the screen has room for (MARKER_AREA px² each)
  // Park icons always show (their names do). Re-checked whenever the map settles.
  useEffect(() => {
    if (!context || (!visiblePlaces.length && !topNames.length)) return;
    const overlaps = (a, b, gap) => a.left < b.right + gap && a.right + gap > b.left && a.top < b.bottom + gap && a.bottom + gap > b.top;
    let frame = 0;
    const declutter = () => {
      if (!container.current) return; // the map closed before this frame ran
      const fixed = [];
      const mapBox = container.current.getBoundingClientRect();
      const area = mapBox.width * mapBox.height;
      // The middle of the screen is where you're looking: when places compete, the one nearer the center wins.
      const cx = mapBox.left + mapBox.width / 2, cy = mapBox.top + mapBox.height / 2;
      const fromCenter = box => Math.hypot((box.left + box.right) / 2 - cx, (box.top + box.bottom) / 2 - cy);

      // Park and T names are drawn on top of everything else. They make way only for the stop names above; T names make way only for each
      // other; park names make way for each other and are capped for the screen size, like Google's (about 4 on a
      // phone at zoom 15, 6 at 16, 9 at 17). Order: names already showing keep their spot (no flicker as you zoom),
      // then real parks before plazas and playgrounds, then nearest the center. Everything else keeps clear of them.
      const tier = zoom >= 17 ? 2 : zoom >= LABEL_ZOOM ? 1 : 0; // zoom 15 / 16 / 17+
      const parkRoom = Math.min(MAX_PARK_NAMES[tier], Math.max(3, Math.round(area / [60000, 40000, 25000][tier])));
      // The open walk's own stop names (and a route's "4 min" label) come first: park and T names, and place icons,
      // make way for them.
      const ours = [...container.current.querySelectorAll(".stop-label, .dir-route-duration")]
        .map(element => element.getBoundingClientRect()).filter(box => box.width);
      fixed.push(...ours);
      const measured = topLabels.current.map(label => {
        const text = label.div.firstElementChild;
        text?.classList.remove("top-hidden");
        return { label, text, box: text?.getBoundingClientRect() };
      }).filter(item => item.text && item.box.width);
      const onScreen = box => box.right > mapBox.left && box.left < mapBox.right && box.bottom > mapBox.top && box.top < mapBox.bottom;
      measured.sort((a, b) => (b.label.station - a.label.station)
        || (topShown.current.has(b.label.placeId) - topShown.current.has(a.label.placeId))
        || (a.label.weight - b.label.weight)
        || (fromCenter(a.box) - fromCenter(b.box)));
      const nowShown = new Set();
      const parkBoxes = [];
      const stationBoxes = [];
      let parks = 0;
      for (const { label, text, box } of measured) {
        const rivals = label.station ? stationBoxes : parkBoxes;
        const full = !label.station && onScreen(box) && parks >= parkRoom;
        if (full || rivals.some(other => overlaps(box, other, 4)) || ours.some(other => overlaps(box, other, 4))) { text.classList.add("top-hidden"); continue; }
        if (!label.station && onScreen(box)) parks += 1;
        rivals.push(box);
        fixed.push(box);
        nowShown.add(label.placeId);
      }
      topShown.current = nowShown;

      // Logger maps show icons farther out than zoom 15 too: fewer of them there, and parks count like any place.
      const farOut = zoom < PLACES_MIN_ZOOM;
      const room = farOut ? Math.min(MAX_PLACES_FAR_OUT, Math.max(4, Math.round(area / 30000)))
        : Math.min(MAX_PLACES[tier], Math.max(4, Math.round(area / [22000, 14000, 9000][tier])));
      const withNames = zoom >= LABEL_ZOOM;
      const taken = [...fixed];
      const union = (a, b) => ({ left: Math.min(a.left, b.left), right: Math.max(a.right, b.right), top: Math.min(a.top, b.top), bottom: Math.max(a.bottom, b.bottom) });
      let count = 0;
      // parks first (their icons go with their names), then places by prominence tier, nearest the center first
      const items = visiblePlaces.map(place => {
        const button = placeMarkers.current.get(place.placeId)?.div.firstElementChild;
        return { place, button, distance: button ? fromCenter(button.querySelector(".poi-dot").getBoundingClientRect()) : Infinity };
      }).filter(item => item.button);
      items.sort((a, b) => (farOut ? 0 : (b.place.icon === "park") - (a.place.icon === "park"))
        || (minZoomFor(a.place) - minZoomFor(b.place)) || (a.distance - b.distance));
      for (const { place, button } of items) {
        const name = button.querySelector(".poi-name");
        button.classList.remove("poi-hidden");
        name.classList.remove("poi-name-hidden");
        const dot = button.querySelector(".poi-dot").getBoundingClientRect();
        if (place.icon === "park" && !farOut) {
          // a park's icon goes with its name: shown together, or (when a bigger park's name is in the way) not at all
          if (ourTopNames && !nowShown.has(place.placeId)) { button.classList.add("poi-hidden"); continue; }
          taken.push(dot); // parks don't use up the room for other places
          continue;
        }
        const nameBox = withNames ? name.getBoundingClientRect() : null;
        const unit = nameBox?.width ? union(dot, nameBox) : dot;
        const gap = withNames ? 6 : 10;
        if (!onScreen(unit)) continue; // off screen: doesn't use up the room
        if (count >= room || taken.some(other => overlaps(unit, other, gap))) { button.classList.add("poi-hidden"); continue; }
        taken.push(unit);
        count += 1;
      }
    };
    frame = requestAnimationFrame(declutter);
    const idle = context.map.addListener("idle", () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(declutter); });
    return () => { cancelAnimationFrame(frame); idle.remove(); };
  }, [context, visiblePlaces, zoom, topNames, focused, ourTopNames]);

  // City and neighborhood names in the app's font (CSS shows each set at its zoom levels).
  useEffect(() => {
    if (!context) return;
    // in priority order: cities, then neighborhoods, then water and other features
    const labels = [
      ...CITIES.map(city => textLabel(context, { point: city.point, text: city.name, className: "city-label" })),
      ...NEIGHBORHOODS.map(hood => textLabel(context, { point: hood.point, text: hood.name, className: "hood-label" })),
      ...FEATURES.map(feature => textLabel(context, { point: feature.point, text: feature.name, className: `feature-label ${feature.kind}-label` })),
    ];
    // Names that would overlap one already shown wait for a closer zoom (zoom 13 has more of them than fit).
    const overlaps = (a, b) => a.left < b.right + 6 && a.right + 6 > b.left && a.top < b.bottom + 4 && a.bottom + 4 > b.top;
    let frame = 0;
    const declutter = () => {
      const shown = [];
      for (const label of labels) {
        const text = label.div?.firstElementChild;
        if (!text) continue;
        text.classList.remove("area-hidden");
        const box = text.getBoundingClientRect();
        if (!box.width) continue; // not shown at this zoom
        if (shown.some(other => overlaps(box, other))) text.classList.add("area-hidden");
        else shown.push(box);
      }
    };
    const idle = context.map.addListener("idle", () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(declutter); });
    return () => { cancelAnimationFrame(frame); idle.remove(); for (const label of labels) label.setMap(null); };
  }, [context]);

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
    // A walk with legs by T or bike has its walking pieces in `paths`; the ridden legs are drawn from their routes.
    const lines = walks.flatMap(item => (item.paths ?? [item.path]).flatMap(piece => {
      const path = piece.map(mapPoint);
      if (!path.length) return [];
      const active = item.id === activeWalkId;
      const draft = String(item.id).startsWith("draft:");
      const hit = new maps.Polyline({
        map, path, strokeColor: "#000000", strokeOpacity: .01, strokeWeight: 24,
        clickable: true, cursor: "pointer", zIndex: active ? 24 : 8,
      });
      const clickListener = hit.addListener("click", () => walkClick.current?.(item.id));
      return [{ drawn: drawRoute(maps, map, path, { active: active || draft, draft, popular: popularIds?.has(item.id), favorite: favoriteIds?.has(item.id) }), hit, clickListener }];
    }));
    const stopLabels = walk.stops.map(stop => textLabel(context, {
      point: stop.point, text: stop.name, className: "stop-label", transform: "translate(18px,-50%)",
    }));
    stops.current = walk.stops.map((stop, index) => {
      const marker = new maps.Marker({
        map, position: mapPoint(stop.point), title: `Stop ${index + 1}: ${stop.name}`,
        icon: stopMarkerIcon(maps, stop, index + 1, { favorite: favoriteIds?.has(walk.id) }), zIndex: 30,
      });
      marker.addListener("click", () => onSelect(index));
      return marker;
    });
    if (leavingWalk && browseView.current) {
      map.setCenter(browseView.current.center);
      map.setZoom(browseView.current.zoom);
      browseView.current = null;
    } else {
      fitWalks(context, walks);
    }
    previousActiveWalk.current = activeWalkId;
    return () => {
      for (const line of lines) {
        for (const polyline of line.drawn) polyline.setMap(null);
        line.hit.setMap(null);
        line.clickListener.remove();
      }
      for (const marker of stops.current) marker.setMap(null);
      for (const label of stopLabels) label.setMap(null);
      stops.current = [];
    };
  }, [context, walk, walks, onSelect, activeWalkId, popularIds, favoriteIds]);

  // In-app directions: dotted walking legs, solid bike and car legs, rides in their line's color, you and the destination.
  useEffect(() => {
    if (!context || !directions) return;
    const { map, maps } = context;
    const legs = directions.excursionLegs ?? [{
      path: directions.approachPath ?? [],
      destination: directions.destination,
      destinationName: directions.destinationName,
      duration: directions.duration,
    }];
    const overlays = directions.approachPath?.length ? [] : drawSegments(context, directions.segments);
    const markers = [];
    if (directions.origin) {
      markers.push(addHtmlMarker(context, { point: directions.origin, label: "Your location", className: "google-location", zIndex: 40 }));
    }
    for (const leg of legs) {
      markers.push(addHtmlMarker(context, {
        point: leg.destination, label: leg.destinationName,
        className: leg.completed ? "dir-dest-pin dir-dest-reached" : "dir-dest-pin", zIndex: 41,
      }));
      const { path } = leg;
      if (path.length < 2) continue;
      overlays.push(new maps.Polyline({
        map, path: path.map(mapPoint), strokeColor: ROUTE_THEME.line, strokeWeight: 4,
        strokeOpacity: leg.completed ? 0.75 : 0, clickable: false, zIndex: leg.completed ? 34 : 35,
        icons: leg.completed ? [] : [{
          icon: { path: maps.SymbolPath.CIRCLE, scale: 3, strokeOpacity: 0, fillColor: ROUTE_THEME.line, fillOpacity: 1 },
          offset: "0", repeat: "11px",
        }],
      }));
      if (leg.completed || !leg.duration) continue;
      const middle = (path.length - 1) / 2;
      const before = path[Math.floor(middle)];
      const after = path[Math.ceil(middle)];
      markers.push(textLabel(context, {
        point: [(before[0] + after[0]) / 2, (before[1] + after[1]) / 2],
        text: leg.duration,
        className: "dir-route-duration",
        transform: "translate(-50%, -145%)",
      }));
    }
    return () => {
      for (const line of overlays) line.setMap(null);
      for (const marker of markers) marker.setMap(null);
    };
  }, [context, directions]);

  // A place picked from the search bar: a pin where it is.
  useEffect(() => {
    if (!context || !highlight?.point) return;
    const pin = addHtmlMarker(context, { point: highlight.point, label: highlight.name, className: "dir-dest-pin", zIndex: 41 });
    return () => pin.setMap(null);
  }, [context, highlight]);

  // Legs of the open walk that you ride or bike.
  useEffect(() => {
    if (!context || !legSegments?.length) return;
    const overlays = drawSegments(context, legSegments);
    return () => { for (const line of overlays) line.setMap(null); };
  }, [context, legSegments]);

  // During a walk: frame the turn-by-turn step you're on.
  useEffect(() => {
    if (context && focusPath?.length) fitPoints(context, focusPath);
  }, [context, focusPath]);

  // Frame the whole trip, or just the step the user tapped.
  useEffect(() => {
    if (!context || !directions) return;
    if (directions.excursionLegs) {
      const points = directions.excursionLegs.flatMap(leg => [...leg.path, leg.destination]);
      fitPoints(context, points, 44);
      return;
    }
    const segment = directions.focus != null ? directions.segments?.[directions.focus] : null;
    const points = segment?.path.length ? segment.path
      : [...(directions.origin ? [directions.origin] : []), directions.destination,
        ...(directions.approachPath ?? []), ...(directions.segments ?? []).flatMap(item => item.path)];
    fitPoints(context, points);
  }, [context, directions]);

  // Selected stop is bigger; stops you've already done on a walk turn blue with a check.
  useEffect(() => {
    if (!context) return;
    stops.current.forEach((marker, index) => {
      marker.setIcon(stopMarkerIcon(context.maps, walk.stops[index], index + 1,
        { selected: selected === index, done: index < doneStops, favorite: favoriteIds?.has(walk.id) }));
      marker.setZIndex(selected === index ? 31 : 30);
    });
  }, [context, walk, selected, doneStops, favoriteIds]);

  useEffect(() => {
    if (!context || !location) return;
    const content = userLocationIcon ? document.createElement("span") : null;
    if (content) {
      content.className = "google-location-user";
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("viewBox", "0 0 24 24");
      svg.setAttribute("aria-hidden", "true");
      for (const [tag, attributes] of UserIcon) {
        const element = document.createElementNS(svg.namespaceURI, tag);
        for (const [key, value] of Object.entries(attributes)) {
          if (key !== "key") element.setAttribute(key.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`), value);
        }
        svg.append(element);
      }
      content.append(svg);
    }
    const dot = addHtmlMarker(context, { point: location, label: "Your location", className: "google-location", content, zIndex: 40 });
    if (following) context.map.panTo(mapPoint(location));
    return () => dot.setMap(null);
  }, [context, location, following, userLocationIcon]);

  // Which of our labels show at this zoom (see .zoom-* rules in app/styles.css).
  const level = areaLevel(zoom);
  const zoomClasses = [level.city && "zoom-city", level.hood && "zoom-hood", level.feature && "zoom-features", zoom >= 15 && "zoom-stops", zoom >= LABEL_ZOOM && "zoom-names"].filter(Boolean).join(" ");

  return <section className={`map google-map ${zoomClasses}`} aria-label="Interactive Boston map">
    <div className="google-map-canvas" ref={container}/>
    {onLocate && <button className="locate-toggle transit-toggle catalog-button" type="button" disabled={!context}
      aria-label={following ? "Stop showing my location" : "Show my location"} aria-pressed={following}
      title={following ? "Stop showing my location" : "Show my location"} onClick={onLocate}>
      <Icon name="locate" size={22}/>
    </button>}
    {showTransitToggle && <button className="transit-toggle catalog-button" type="button" disabled={!context}
      aria-label={transit ? "Hide T lines" : "Show T lines"} aria-pressed={transit}
      title={transit ? "Hide T lines" : "Show T lines"}
      onClick={() => setTransit(value => !value)}>
      <HugeiconsIcon icon={MetroIcon} aria-hidden="true" />
    </button>}
    {(mapError || !context || locationStatus) && <div className="map-notice" role="status">{mapError || locationStatus || "Loading Google Maps…"}</div>}
  </section>;
}
