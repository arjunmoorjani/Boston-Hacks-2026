"use client";

import { useEffect, useRef, useState } from "react";
import { googleMapId, loadGoogleMaps, mapPoint } from "../lib/google-maps.mjs";
import { Icon } from "./icons";

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
  if (place.photo) return place.photo;
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
    {place.address && <p className="place-dialog-address">{place.address}</p>}
    {photo && !failed
      ? <figure>
          <img src={photo.src} alt={place.name} onError={() => setFailed(true)} referrerPolicy="no-referrer"/>
          {(photo.credit || photo.attributions?.length > 0) && <figcaption>
            {photo.credit
              ? <a href={photo.credit} target="_blank" rel="noreferrer">Photo credits</a>
              : <>Photo by {photo.attributions.map((author, index) => <span key={`${author.displayName}-${index}`}>
                  {index > 0 && ", "}
                  {author.uri
                    ? <a href={author.uri} target="_blank" rel="noreferrer">{author.displayName}</a>
                    : author.displayName}
                </span>)}</>}
          </figcaption>}
        </figure>
      : <p>No photo available.</p>}
    {place.attributions?.map((attribution, index) => <p className="place-attribution" key={`${attribution}-${index}`}>{attribution}</p>)}
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
  const [activePlace, setActivePlace] = useState(null);
  const [mapError, setMapError] = useState("");
  const [placeStatus, setPlaceStatus] = useState("");

  useEffect(() => {
    let disposed = false;
    let poiClickListener;
    let placeRequest = 0;
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
      poiClickListener = map.addListener("click", async event => {
        if (!("placeId" in event) || !event.placeId) return;
        event.stop();
        const request = ++placeRequest;
        setActivePlace(null);
        setPlaceStatus("Loading place…");

        try {
          const { Place } = await maps.importLibrary("places");
          const place = new Place({ id: event.placeId });
          await place.fetchFields({ fields: ["displayName", "formattedAddress", "location", "photos"] });
          if (disposed || request !== placeRequest) return;

          const photo = place.photos?.[0];
          const point = place.location ? [place.location.lat(), place.location.lng()] : null;
          setActivePlace({
            source: "google",
            osm_id: `google:${event.placeId}`,
            placeId: event.placeId,
            name: place.displayName || "Google Maps place",
            address: place.formattedAddress || "",
            latitude: point?.[0],
            longitude: point?.[1],
            attributions: place.attributions || [],
            photo: photo ? {
              src: photo.getURI({ maxWidth: 800, maxHeight: 600 }),
              attributions: photo.authorAttributions.map(author => ({
                displayName: author.displayName || "Google Maps contributor",
                uri: author.uri || "",
              })),
            } : null,
            tags: { description: "A place discovered on Google Maps." },
          });
          setPlaceStatus("");
        } catch {
          if (!disposed && request === placeRequest) {
            setPlaceStatus("Couldn’t load this place. Check that Places API (New) is enabled.");
          }
        }
      });
      setContext({ map, maps, AdvancedMarkerElement });
    }).catch(() => {
      if (!disposed) setMapError("Couldn’t load Google Maps. Check your connection and API settings.");
    });

    return () => {
      disposed = true;
      placeRequest += 1;
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
        <button aria-label={following ? "Stop location tracking" : "Show my location"}
          title={following ? "Stop location tracking" : "Show my location"}
          aria-pressed={following} onClick={locate}><Icon name="locate"/></button>
      </div>
    </div>
    <button className="transit-toggle catalog-button" type="button" disabled={!context}
      aria-label={transit ? "Hide T lines" : "Show T lines"} aria-pressed={transit}
      onClick={() => setTransit(value => !value)}>T lines</button>
    {(mapError || !context || locationStatus || placeStatus) && <div className="map-notice" role="status">{mapError || locationStatus || placeStatus || "Loading Google Maps…"}</div>}
    {activePlace && <PlaceDetails key={activePlace.osm_id} place={activePlace} onClose={() => setActivePlace(null)}
      onAddPlace={onAddPlace} addLabel={draftPlaces.some(place => place.osm_id === activePlace.osm_id)
        ? "Already in your walk" : canAddPlace ? "Add to walk" : "Walk list unavailable"} />}
  </section>;
}
