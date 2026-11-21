"use client";

import { useEffect, useRef, useState } from "react";
import { googleMapId, loadGoogleMaps, mapPoint } from "../lib/google-maps.mjs";
import { listPlaces, placesConfigured } from "../lib/places.mjs";
import { Icon } from "./icons";

const placesZoom = 16;
const amenityIcons = { restaurant: "🍴", fast_food: "🍴", cafe: "☕", ice_cream: "🍦" };
const categoryIcons = { food: "🍴", activities: "🎟️", sports: "⚽", shopping: "🛍️", culture: "🏛️" };

function fitWalk({ map, maps }, walk) {
  const bounds = new maps.LatLngBounds();
  for (const point of walk.path) bounds.extend(mapPoint(point));
  for (const stop of walk.stops) bounds.extend(mapPoint(stop.point));
  map.fitBounds(bounds, { top: 74, left: 42, right: 64, bottom: 64 });
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

function photoFor(place) {
  const source = place.tags?.photo_url || place.tags?.image;
  if (!source) return null;

  try {
    const url = new URL(source);
    if (url.protocol !== "https:") return null;
    if (url.hostname === "commons.wikimedia.org" && url.pathname.startsWith("/wiki/File:")) {
      const file = url.pathname.slice("/wiki/File:".length);
      return { src: `https://commons.wikimedia.org/wiki/Special:FilePath/${file}?width=640`, credit: url.href };
    }
    return { src: url.href };
  } catch {
    return null;
  }
}

function PlaceDetails({ place, onClose, onAddPlace, addLabel }) {
  const dialog = useRef(null);
  const [failed, setFailed] = useState(false);
  const photo = photoFor(place);
  useEffect(() => {
    dialog.current.showModal();
  }, []);

  return <dialog ref={dialog} className="place-dialog sheet" aria-labelledby="map-place-name" onClose={onClose}>
    <div className="place-dialog-heading">
      <h2 id="map-place-name">{place.name}</h2>
      <form method="dialog"><button className="plain-button" aria-label="Close place"><Icon name="close"/></button></form>
    </div>
    {photo && !failed
      ? <figure>
          <img src={photo.src} alt={place.name} onError={() => setFailed(true)} referrerPolicy="no-referrer"/>
          {photo.credit && <figcaption><a href={photo.credit} target="_blank" rel="noreferrer">Photo credits</a></figcaption>}
        </figure>
      : <p>No photo available.</p>}
    <button className="primary" type="button" disabled={addLabel !== "Add to walk"} onClick={() => {
      onAddPlace(place);
      dialog.current.close();
    }}>{addLabel}</button>
  </dialog>;
}

export function GoogleBostonMap({ walk, selected, onSelect, location, locate, following, locationStatus, onAddPlace, draftPlaces, canAddPlace }) {
  const container = useRef(null);
  const stops = useRef([]);
  const [context, setContext] = useState(null);
  const [transit, setTransit] = useState(false);
  const [bounds, setBounds] = useState(null);
  const [places, setPlaces] = useState([]);
  const [activePlace, setActivePlace] = useState(null);
  const [mapError, setMapError] = useState("");
  const [placesError, setPlacesError] = useState("");

  useEffect(() => {
    let disposed = false;
    let idleListener;
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
        clickableIcons: false, maxZoom: 20, minZoom: 3,
      });
      idleListener = map.addListener("idle", () => {
        setBounds(map.getZoom() >= placesZoom ? map.getBounds()?.toJSON() : null);
      });
      setContext({ map, maps, AdvancedMarkerElement });
    }).catch(() => {
      if (!disposed) setMapError("Couldn’t load Google Maps. Check your connection and API settings.");
    });

    return () => {
      disposed = true;
      idleListener?.remove();
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
    const path = walk.path.map(mapPoint);
    const outline = new maps.Polyline({ map, path, strokeColor: "#fff", strokeWeight: 10, clickable: false });
    const line = new maps.Polyline({ map, path, strokeColor: "#5839b5", strokeWeight: 6, clickable: false, zIndex: 1 });
    stops.current = walk.stops.map((stop, index) => addMarker(context, {
      point: stop.point, label: `Stop ${index + 1}: ${stop.name}`, onClick: () => onSelect(index),
      className: "google-pin", text: String(index + 1), zIndex: 30,
    }));
    fitWalk(context, walk);
    return () => {
      outline.setMap(null);
      line.setMap(null);
      for (const marker of stops.current) marker.map = null;
      stops.current = [];
    };
  }, [context, walk, onSelect]);

  useEffect(() => {
    stops.current.forEach((marker, index) => marker.firstElementChild.classList.toggle("selected", selected === index));
  }, [context, walk, selected]);

  useEffect(() => {
    if (!context || !location) return;
    const dot = addMarker(context, { point: location, label: "Your location", className: "google-location", text: "", zIndex: 40 });
    if (following) context.map.panTo(mapPoint(location));
    return () => { dot.map = null; };
  }, [context, location, following]);

  useEffect(() => {
    setPlacesError("");
    setPlaces([]);
    if (!placesConfigured || !bounds) return;
    const controller = new AbortController();
    listPlaces({ bounds, signal: controller.signal }).then(result => {
      if (!controller.signal.aborted) setPlaces(result.places);
    }).catch(error => {
      if (!controller.signal.aborted) {
        setPlaces([]);
        setPlacesError(error.message);
      }
    });
    return () => controller.abort();
  }, [bounds]);

  useEffect(() => {
    if (!context || !bounds) return;
    const markers = places.flatMap(place => {
      if (place.latitude == null || place.longitude == null) return [];
      const point = [Number(place.latitude), Number(place.longitude)];
      if (!point.every(Number.isFinite)) return [];
      return addMarker(context, {
        point, label: place.name, onClick: () => setActivePlace(place), className: "google-pin place-pin",
        text: amenityIcons[place.tags?.amenity] || categoryIcons[place.categories?.[0]] || "•",
        zIndex: 10, collisionBehavior: "OPTIONAL_AND_HIDES_LOWER_PRIORITY",
      });
    });
    return () => { for (const marker of markers) marker.map = null; };
  }, [context, bounds, places]);

  return <section className="map google-map" aria-label="Interactive Boston map">
    <div className="google-map-canvas" ref={container}/>
    <div className="map-label"><span className="map-label-dot"/> {walk.area}, Boston</div>
    <div className="map-controls">
      <div className="control-group">
        <button aria-label="Zoom in" disabled={!context} onClick={() => context.map.setZoom(context.map.getZoom() + 1)}><Icon name="plus"/></button>
        <button aria-label="Zoom out" disabled={!context} onClick={() => context.map.setZoom(context.map.getZoom() - 1)}><Icon name="minus"/></button>
      </div>
      <div className="control-group">
        <button aria-label="Fit route on map" disabled={!context} onClick={() => fitWalk(context, walk)}><Icon name="fit"/></button>
        <button aria-label="Show my location" aria-pressed={following} onClick={locate}><Icon name="locate"/></button>
      </div>
    </div>
    <button className="transit-toggle catalog-button" type="button" disabled={!context} aria-pressed={transit} onClick={() => setTransit(value => !value)}>T lines</button>
    {(mapError || !context || locationStatus || placesError) && <div className="map-notice" role="status">{mapError || locationStatus || placesError || "Loading Google Maps…"}</div>}
    {activePlace && <PlaceDetails key={activePlace.osm_id} place={activePlace} onClose={() => setActivePlace(null)}
      onAddPlace={onAddPlace} addLabel={draftPlaces.some(place => place.osm_id === activePlace.osm_id)
        ? "Already in your walk" : canAddPlace ? "Add to walk" : "Walk list unavailable"} />}
  </section>;
}
