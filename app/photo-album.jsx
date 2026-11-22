"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "./icons";
import { loadPhotoAlbum, loadPhotoRoute } from "../lib/route-photos.mjs";
import { fetchPlaceProfile } from "../lib/place-profile.mjs";
import { sketchRoute } from "../lib/route-sketch.mjs";

const emptyAlbum = { photos: [], hasMore: false, loading: false, error: "" };

export function PhotoAlbum({ client, walks, onOpenRoute, onOpenPlace }) {
  const [album, setAlbum] = useState({ ...emptyAlbum, loading: Boolean(client) });
  const [selected, setSelected] = useState(null);
  const [fetchedPlaces, setFetchedPlaces] = useState(new Map());
  const request = useRef(0);
  const knownPlaces = useMemo(() => new Map(
    walks.flatMap(walk => walk.stops.filter(stop => stop.placeId).map(stop => [stop.placeId, stop])),
  ), [walks]);

  async function load(offset = 0) {
    if (!client) return;
    const current = ++request.current;
    setAlbum(old => ({ ...old, loading: true, error: "" }));
    try {
      const next = await loadPhotoAlbum(client, offset);
      if (current === request.current) setAlbum(old => ({
        ...next, photos: offset ? [...old.photos, ...next.photos] : next.photos, loading: false, error: "",
      }));
    } catch {
      if (current === request.current) setAlbum(old => ({
        ...old, loading: false, error: "Couldn’t load your photos. Try again.",
      }));
    }
  }

  useEffect(() => {
    if (client) void load();
    else setAlbum(emptyAlbum);
    return () => { request.current += 1; };
  }, [client]);

  useEffect(() => {
    let active = true;
    const missing = new Set(album.photos.map(photo => photo.placeId)
      .filter(id => id && !knownPlaces.has(id) && !fetchedPlaces.has(id)));
    for (const id of missing) {
      fetchPlaceProfile(id).then(place => {
        if (active) setFetchedPlaces(current => new Map(current).set(id, place));
      }).catch(() => {});
    }
    return () => { active = false; };
  }, [album.photos, knownPlaces]);

  const places = useMemo(() => new Map([...fetchedPlaces, ...knownPlaces]), [fetchedPlaces, knownPlaces]);

  return <>
    {album.photos.length > 0 && <ul className="album-grid" aria-label="Route photos">
      {album.photos.map(photo => {
        const label = placeLabel(photo, places);
        return <li key={photo.id}>
          <button type="button" className="album-tile" onClick={() => setSelected(photo)}
            aria-label={`Open photo from ${photo.route.title}, ${label}`}>
            {photo.url ? <img src={photo.url} alt="" loading="lazy"/> : <Icon name="locate" size={24}/>}
          </button>
          <div className="album-tile-caption"><strong>{photo.route.title}</strong><span>{label}</span></div>
        </li>;
      })}
    </ul>}
    {album.loading && <p className="activity-photo-status" role="status">Loading photos…</p>}
    {album.error && <p className="activity-photo-status error" role="alert">{album.error}</p>}
    {!album.loading && !album.error && !album.photos.length &&
      <p className="album-empty">Photos you add when logging routes will appear here.</p>}
    {!album.loading && (album.hasMore || album.error) &&
      <button type="button" className="plan-secondary album-load" onClick={() => load(album.photos.length)}>
        {album.error ? "Try again" : "Load more photos"}
      </button>}
    {selected && <PhotoViewer key={selected.id} photo={selected} client={client} places={places}
      onClose={() => setSelected(null)} onOpenRoute={onOpenRoute} onOpenPlace={onOpenPlace}/>}
  </>;
}

function placeLabel(photo, places) {
  return places.get(photo.placeId)?.name || (photo.stopPosition ? `Stop ${photo.stopPosition}` : "Place not tagged");
}

function PhotoViewer({ photo, client, places, onClose, onOpenRoute, onOpenPlace }) {
  const dialog = useRef(null);
  const [showRoute, setShowRoute] = useState(false);
  const label = placeLabel(photo, places);

  useEffect(() => { dialog.current?.showModal(); }, []);

  function openPlace(placeId, fallback) {
    dialog.current?.close();
    onOpenPlace(placeId, fallback);
  }

  return <dialog ref={dialog} className="album-dialog" aria-labelledby="album-dialog-title" onClose={onClose}
    onClick={event => { if (event.target === dialog.current) dialog.current.close(); }}>
    <header>
      <h2 id="album-dialog-title">{photo.route.title}</h2>
      <button type="button" className="place-close" onClick={() => dialog.current.close()} aria-label="Close photo">
        <Icon name="close" size={18}/>
      </button>
    </header>
    {showRoute ? <SavedPhotoRoute client={client} routeId={photo.route.id} places={places}
      onOpenPlace={openPlace} onBack={() => setShowRoute(false)}/>
      : <>
        {photo.url ? <img className="album-image" src={photo.url} alt={`Photo from ${photo.route.title}, ${label}`}/>
          : <p className="album-empty">This image is unavailable.</p>}
        <div className="album-photo-details">
          <p><strong>Place</strong> {label}</p>
          <div className="album-actions">
            <button type="button" className="plan-primary" onClick={() => {
              if (!onOpenRoute(photo.route)) setShowRoute(true);
              else dialog.current?.close();
            }}>View full route</button>
            {photo.placeId && <button type="button" className="plan-secondary" onClick={() =>
              openPlace(photo.placeId, places.get(photo.placeId) ?? { name: label })}>View place details</button>}
          </div>
        </div>
      </>}
  </dialog>;
}

function SavedPhotoRoute({ client, routeId, places, onOpenPlace, onBack }) {
  const [state, setState] = useState({ route: null, error: "" });

  useEffect(() => {
    let active = true;
    loadPhotoRoute(client, routeId).then(async route => {
      const stops = await Promise.all(route.stops.map(async stop => {
        const details = places.get(stop.placeId) ?? (stop.placeId
          ? await fetchPlaceProfile(stop.placeId).catch(() => null) : null);
        return { ...stop, name: `Stop ${stop.position}`, ...details };
      }));
      if (active) setState({ route: { ...route, stops }, error: "" });
    }).catch(() => { if (active) setState({ route: null, error: "Couldn’t open this saved route." }); });
    return () => { active = false; };
  }, [client, routeId, places]);

  const { route, error } = state;
  const mapped = route?.stops.filter(stop => stop.point) ?? [];
  const sketch = sketchRoute([], mapped, 160, 16);

  return <div className="album-photo-details album-saved-route">
    <button type="button" className="back-link" onClick={onBack}><Icon name="arrowLeft" size={16}/>Back to photo</button>
    {error ? <p role="alert">{error}</p> : !route ? <p role="status">Loading route…</p> : <>
      <p>{new Date(route.date).toLocaleDateString()}</p>
      {route.description && <p>{route.description}</p>}
      {sketch && <svg viewBox="0 0 160 160" className="album-route-sketch" role="img" aria-label="Route stop locations">
        <path d={sketch.d} fill="none" stroke="var(--route)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/>
        {sketch.stops.map(([x, y], index) => <circle key={mapped[index].position} cx={x} cy={y} r="5" fill="var(--stop)" stroke="white"/>)}
      </svg>}
      <h3>Route stops</h3>
      {route.stops.length ? <ol>
        {route.stops.map(stop => <li key={stop.position} value={stop.position}>
          {stop.placeId ? <button type="button" className="inline-link" onClick={() => onOpenPlace(stop.placeId, stop)}>
            {stop.name}
          </button> : stop.name}
        </li>)}
      </ol> : <p>No stops were saved for this route.</p>}
    </>}
  </div>;
}
