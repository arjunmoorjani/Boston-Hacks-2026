"use client";

import { useEffect, useRef, useState } from "react";
import { loadGoogleMaps } from "../lib/google-maps.mjs";
import { fetchDirections } from "../lib/directions.mjs";
import { endPlaceSearchSession, googlePlaceSuggestions, MIN_GOOGLE_CHARS } from "../lib/place-search.mjs";
import { fetchPlaceProfile } from "../lib/place-profile.mjs";
import { GoogleBostonMap } from "./google-boston-map";
import { TRAVEL_MODES } from "./directions-panel";
import { Icon } from "./icons";
import { loggedExcursionDatabaseReady, saveLoggedExcursion } from "../lib/log-excursion.mjs";

const BUILDER_ROUTE_IDS = new Set(["log-builder"]);
const noop = () => {};
const todayValue = () => {
  const date = new Date();
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
};

function PlaceField({ fieldId, location, number, onChange }) {
  const [search, setSearch] = useState({ results: [], loading: false, error: "" });

  useEffect(() => {
    const query = location.label.trim();
    if (location.point || query.length < MIN_GOOGLE_CHARS) {
      setSearch({ results: [], loading: false, error: "" });
      return;
    }
    let stale = false;
    setSearch(old => ({ ...old, loading: true, error: "" }));
    const timer = setTimeout(() => {
      googlePlaceSuggestions(query)
        .then(results => { if (!stale) setSearch({ results, loading: false, error: "" }); })
        .catch(() => { if (!stale) setSearch({ results: [], loading: false, error: "Couldn’t search places." }); });
    }, 300);
    return () => { stale = true; clearTimeout(timer); };
  }, [location.label, location.point]);

  async function choosePlace(result) {
    setSearch({ results: [], loading: true, error: "" });
    try {
      const place = await fetchPlaceProfile(result.placeId);
      if (!place.point) throw new Error("This place has no map location.");
      endPlaceSearchSession();
      onChange({ label: place.name, address: place.address, point: place.point, placeId: place.placeId });
      setSearch({ results: [], loading: false, error: "" });
    } catch (error) {
      setSearch({ results: [], loading: false, error: error?.message || "Couldn’t load that place." });
    }
  }

  const listId = `${fieldId}-results`;
  return <div className="log-place-search">
    <input id={fieldId} type="text" value={location.label}
      onChange={event => onChange({ label: event.target.value, address: "", point: null, placeId: null })}
      placeholder="Search for a real place or address" autoComplete="off"
      aria-expanded={search.results.length > 0} aria-controls={listId}/>
    {search.loading && <span className="log-place-search-status" role="status">Searching places…</span>}
    {search.error && <span className="log-place-search-status error" role="status">{search.error}</span>}
    {search.results.length > 0 && <ul id={listId} className="log-place-results">
      {search.results.map(result => <li key={result.placeId}>
        <button type="button" onClick={() => choosePlace(result)}>
          <strong>{result.name}</strong>
          {result.detail && <span>{result.detail}</span>}
        </button>
      </li>)}
    </ul>}
    {location.point && <span className="log-place-selected">✓ Location {number} selected</span>}
  </div>;
}

function RouteBuilderMap({ locationNumber, locations, route, onPick }) {
  const selected = locations.filter(location => location.point);
  const stops = selected.map((location, index) => ({
    id: location.placeId ? `google:${location.placeId}` : `log-stop:${index}`,
    placeId: location.placeId,
    name: location.label,
    address: location.address,
    point: location.point,
  }));
  const walk = { id: "log-builder", title: "Excursion route", path: route.path, stops };
  const walks = route.path.length ? [walk] : [];
  const focusPath = route.path.length ? route.path : selected.map(location => location.point);

  async function pickPlace(placeId, fallback = {}) {
    try {
      const place = await fetchPlaceProfile(placeId);
      if (!place.point) return;
      onPick({ label: place.name, address: place.address, point: place.point, placeId: place.placeId });
    } catch {
      if (fallback.point) onPick({ label: fallback.name || "Selected place", address: "", point: fallback.point, placeId });
    }
  }

  async function pickMapPoint(point) {
    onPick({ point, label: "Dropped pin", address: "", placeId: null });
    try {
      const maps = await loadGoogleMaps();
      const geocoder = new maps.Geocoder();
      geocoder.geocode({ location: { lat: point[0], lng: point[1] } }, results => {
        if (!results?.[0]) return;
        const result = results[0];
        onPick({
          point,
          label: result.formatted_address || "Dropped pin",
          address: result.formatted_address || "",
          placeId: result.place_id || null,
        });
      });
    } catch {}
  }

  const status = route.status === "building" ? "Building the excursion route…"
    : route.status === "error" ? route.error
    : route.path.length ? "Excursion route updated." : `Tap a place or anywhere on the map to choose location ${locationNumber}.`;

  return <>
    <div className="log-start-map">
      <GoogleBostonMap walk={walk} walks={walks} selected={null} onSelect={noop} activeWalkId={null}
        onOpenWalk={noop} focusPath={focusPath} popularIds={BUILDER_ROUTE_IDS}
        onPlaceClick={pickPlace} onMapClick={pickMapPoint} showTransitToggle={false} alwaysShowPlaces/>
    </div>
    <p className={`log-map-status${route.status === "error" ? " error" : ""}`} role="status">{status}</p>
  </>;
}

function PreviousExcursionForm({ onBack, onFinish, initialDraft }) {
  const [name, setName] = useState(initialDraft?.name ?? "");
  const [locations, setLocations] = useState(initialDraft?.locations ?? [
    { id: 1, label: "", address: "", point: null, placeId: null },
    { id: 2, label: "", address: "", point: null, placeId: null },
  ]);
  const [legModes, setLegModes] = useState(initialDraft?.legModes ?? ["WALKING"]);
  const [route, setRoute] = useState(initialDraft?.route ?? { status: "idle", path: [], meters: 0, minutes: 0, error: "" });
  const routeKey = locations.filter(location => location.point).map(location => location.point.join(",")).join("|")
    + `|${legModes.join("|")}`;

  useEffect(() => {
    const selected = locations.filter(location => location.point);
    if (selected.length < 2) {
      setRoute({ status: "idle", path: [], meters: 0, minutes: 0, error: "" });
      return;
    }
    let stale = false;
    setRoute(old => ({ ...old, status: "building", error: "" }));
    const timer = setTimeout(() => {
      Promise.all(selected.slice(1).map((destination, index) =>
        fetchDirections(selected[index].point, destination.point, legModes[index] ?? "WALKING")))
        .then(legs => {
          if (stale) return;
          const path = legs.flatMap((leg, index) => index ? leg.path.slice(1) : leg.path);
          setRoute({
            status: "ready",
            path,
            meters: legs.reduce((sum, leg) => sum + leg.meters, 0),
            minutes: legs.reduce((sum, leg) => sum + leg.minutes, 0),
            warnings: legs.flatMap(leg => leg.warnings ?? []),
            legs,
            error: "",
          });
        })
        .catch(() => { if (!stale) setRoute({ status: "error", path: [], meters: 0, minutes: 0, error: "Couldn’t build one of the routes between these places." }); });
    }, 250);
    return () => { stale = true; clearTimeout(timer); };
  }, [routeKey]);

  function updateLocation(id, patch) {
    setLocations(current => current.map(location => location.id === id ? { ...location, ...patch } : location));
  }
  function addLocation() {
    setLocations(current => [...current, {
      id: Math.max(...current.map(location => location.id)) + 1,
      label: "", address: "", point: null, placeId: null,
    }]);
    setLegModes(current => [...current, "WALKING"]);
  }

  function setLegMode(index, mode) {
    setLegModes(current => current.map((value, modeIndex) => modeIndex === index ? mode : value));
  }

  const hasMinimumLocations = locations[0].point && locations[1].point;
  const canAdd = Boolean(locations.at(-1).point);
  const canFinish = Boolean(name.trim() && locations.every(location => location.point) && route.status === "ready");

  return <section className="log-form-page" aria-labelledby="previous-excursion-title">
    <button type="button" className="log-form-back" onClick={onBack} aria-label="Back to excursion options">← Back</button>
    <div className="log-form-content">
      <div className="log-form-section">
        <label id="previous-excursion-title" htmlFor="excursion-name">name your excursion</label>
        <input id="excursion-name" type="text" value={name} onChange={event => setName(event.target.value)}
          placeholder="Example: Saturday in the North End" autoComplete="off"/>
      </div>

      {locations.map((location, index) => {
        if (index > 0 && !locations[index - 1].point) return null;
        const number = index + 1;
        const fieldId = `excursion-location-${location.id}`;
        return <div className="log-form-section log-location-section" key={location.id}>
          {index > 0 && <div className="log-transport-choice">
            <span>How did you get here?</span>
            <div className="travel-modes" role="group" aria-label={`Travel mode from location ${index} to ${number}`}>
              {TRAVEL_MODES.map(([mode, label, icon]) => <button key={mode} type="button"
                aria-pressed={(legModes[index - 1] ?? "WALKING") === mode} onClick={() => setLegMode(index - 1, mode)}>
                <Icon name={icon} size={15}/>{label}
              </button>)}
            </div>
          </div>}
          <label htmlFor={fieldId}>{number}. {index === 0 ? "where did you start?" : "where did you go next?"}</label>
          <PlaceField fieldId={fieldId} location={location} number={number}
            onChange={patch => updateLocation(location.id, patch)}/>
          <p className="log-map-prompt">Or pick location {number} on the map</p>
          <RouteBuilderMap locationNumber={number} locations={locations} route={route}
            onPick={patch => updateLocation(location.id, patch)}/>
        </div>;
      })}

      {hasMinimumLocations && <div className="log-form-actions">
        <button type="button" className="log-add-location" onClick={addLocation} disabled={!canAdd} aria-label="Add another location">+</button>
        <button type="button" className="log-finish" disabled={!canFinish}
          onClick={() => onFinish({ name: name.trim(), locations, legModes, route })}>Finish</button>
      </div>}
    </div>
  </section>;
}

function ExcursionDetails({ excursion, onBack, onSaved }) {
  const [date, setDate] = useState(todayValue);
  const [priceCategory, setPriceCategory] = useState("FREE");
  const [peopleWith, setPeopleWith] = useState(0);
  const [comments, setComments] = useState("");
  const [images, setImages] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const previewUrls = useRef([]);

  useEffect(() => () => previewUrls.current.forEach(url => URL.revokeObjectURL(url)), []);

  function addImages(event) {
    const incoming = [...event.target.files];
    event.target.value = "";
    const valid = incoming.filter(file => file.type.startsWith("image/") && file.size <= 10 * 1024 * 1024);
    if (valid.length !== incoming.length) setError("Use image files no larger than 10 MB each.");
    const available = Math.max(0, 8 - images.length);
    const next = valid.slice(0, available).map(file => {
      const preview = URL.createObjectURL(file);
      previewUrls.current.push(preview);
      return { file, preview, id: crypto.randomUUID() };
    });
    setImages(current => [...current, ...next]);
  }

  function removeImage(id) {
    setImages(current => {
      const removed = current.find(image => image.id === id);
      if (removed) URL.revokeObjectURL(removed.preview);
      return current.filter(image => image.id !== id);
    });
  }

  async function save() {
    if (!date || saving) return;
    setSaving(true);
    setError("");
    try {
      const stored = await saveLoggedExcursion({
        name: excursion.name,
        locations: excursion.locations,
        date,
        priceCategory,
        peopleWith,
        comments,
        images: images.map(image => image.file),
      });
      onSaved({ ...excursion, date, priceCategory, peopleWith, comments: comments.trim(), ...stored });
    } catch (saveError) {
      setError(saveError?.message || "Couldn’t save this excursion.");
    } finally {
      setSaving(false);
    }
  }

  return <section className="log-form-page" aria-labelledby="excursion-details-title">
    <button type="button" className="log-form-back" onClick={onBack}>← Back to route</button>
    <div className="log-details-content">
      <header>
        <p>Almost done</p>
        <h1 id="excursion-details-title">Add excursion details</h1>
      </header>

      <label className="log-detail-field" htmlFor="excursion-date">
        <span>What day did you go?</span>
        <input id="excursion-date" type="date" value={date} max={todayValue()} onChange={event => setDate(event.target.value)} required/>
      </label>

      <fieldset className="log-price-field">
        <legend>How much did it cost?</legend>
        <div role="radiogroup" aria-label="Excursion price">
          {[["FREE", "Free"], ["$", "$"], ["$$", "$$"], ["$$$", "$$$"]].map(([value, label]) =>
            <button key={value} type="button" role="radio" aria-checked={priceCategory === value}
              className={priceCategory === value ? "selected" : ""} onClick={() => setPriceCategory(value)}>{label}</button>)}
        </div>
      </fieldset>

      <label className="log-detail-field" htmlFor="excursion-people-with">
        <span>How many people did you go with?</span>
        <input id="excursion-people-with" type="number" inputMode="numeric" min="0" max="99" step="1"
          value={peopleWith} onChange={event => setPeopleWith(Math.min(99, Math.max(0, Number.parseInt(event.target.value || "0", 10))))}/>
        <small>Enter 0 if you went by yourself.</small>
      </label>

      <label className="log-detail-field" htmlFor="excursion-comments">
        <span>Comments</span>
        <textarea id="excursion-comments" value={comments} onChange={event => setComments(event.target.value)}
          placeholder="What stood out? Add any memories or notes." rows={5}/>
      </label>

      <section className="log-photo-field" aria-labelledby="excursion-photos-title">
        <div>
          <h2 id="excursion-photos-title">Photos</h2>
          <p>Optional · up to 8 images, 10 MB each</p>
        </div>
        <label className="log-photo-picker">
          <input type="file" accept="image/*" multiple onChange={addImages}/>
          <span>+ Add images</span>
        </label>
        {images.length > 0 && <div className="log-photo-grid">
          {images.map(image => <figure key={image.id}>
            <img src={image.preview} alt="Excursion upload preview"/>
            <button type="button" onClick={() => removeImage(image.id)} aria-label="Remove image">×</button>
          </figure>)}
        </div>}
        {!loggedExcursionDatabaseReady && <p className="log-database-note">Connect Supabase to upload images. The excursion can still be saved locally without them.</p>}
      </section>

      {error && <p className="log-save-error" role="alert">{error}</p>}
      <button type="button" className="log-save-excursion" disabled={!date || saving} onClick={save}>
        {saving ? "Saving excursion…" : "Save excursion"}
      </button>
    </div>
  </section>;
}

export function LogPage({ onLog }) {
  const [page, setPage] = useState("menu");
  const [draft, setDraft] = useState(null);
  useEffect(() => {
    document.documentElement.classList.add("log-open");
    return () => document.documentElement.classList.remove("log-open");
  }, []);

  if (page === "previous") return <PreviousExcursionForm initialDraft={draft} onBack={() => setPage("menu")}
    onFinish={excursion => { setDraft(excursion); setPage("details"); }}/>;

  if (page === "details") return <ExcursionDetails excursion={draft} onBack={() => setPage("previous")}
    onSaved={excursion => { onLog?.(excursion); setPage("saved"); }}/>;

  if (page === "saved") return <section className="log-page" aria-labelledby="logged-title">
    <div className="log-page-content log-saved">
      <h1 id="logged-title">Excursion logged</h1>
      <p>Your route is now in your Profile activity.</p>
      <button type="button" className="log-page-action log-page-action-primary" onClick={() => setPage("previous")}>Log another excursion</button>
    </div>
  </section>;

  return <section className="log-page" aria-labelledby="log-page-title">
    <div className="log-page-content">
      <h1 id="log-page-title">Log an excursion</h1>
      <div className="log-page-actions">
        <button type="button" className="log-page-action" onClick={() => setPage("previous")}>Log a previous excursion</button>
        <button type="button" className="log-page-action log-page-action-primary">Start a new excursion</button>
      </div>
    </div>
  </section>;
}
