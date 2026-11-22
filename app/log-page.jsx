"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { loadGoogleMaps } from "../lib/google-maps.mjs";
import { fetchDirections, minutesLabel } from "../lib/directions.mjs";
import { getLocationOnce, watchUserLocation } from "../lib/location.mjs";
import { endPlaceSearchSession, googlePlaceSuggestions, MIN_GOOGLE_CHARS } from "../lib/place-search.mjs";
import { fetchPlaceProfile } from "../lib/place-profile.mjs";
import { GoogleBostonMap } from "./google-boston-map";
import { TRAVEL_MODES } from "./directions-panel";
import { Icon } from "./icons";
import { addActiveExcursionStop, loadActiveExcursionStopIds, loggedExcursionDatabaseReady, saveLoggedExcursion, startActiveExcursion, updateActiveExcursion } from "../lib/log-excursion.mjs";

const BUILDER_ROUTE_IDS = new Set(["log-builder"]);
const EMPTY_ROUTE = { status: "idle", path: [] };
const EMPTY_WALK = { id: "active-excursion", stops: [], path: [] };
const NO_WALKS = [];
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

function ExcursionStopPicker({ fieldId, label, stop, number, onChange }) {
  return <>
    <label htmlFor={fieldId}>{label}</label>
    <PlaceField fieldId={fieldId} location={stop} number={number} onChange={onChange}/>
    <p className="log-map-prompt">Or pick location {number} on the map</p>
    {stop.point && !stop.placeId &&
      <p className="log-map-status">Choose a searchable place or address to save this stop.</p>}
    <RouteBuilderMap locationNumber={number} locations={[stop]} route={EMPTY_ROUTE} onPick={onChange}/>
  </>;
}

function travelPrice(mode, fare) {
  if (mode === "WALKING" || mode === "BICYCLING") return 0;
  const dollars = /^(?:US)?\$\s*(\d+(?:\.\d{1,2})?)$/i.exec(fare?.trim() ?? "");
  return dollars ? Number(dollars[1]) : null;
}

function suggestedMode(quotes) {
  const knownPrices = quotes.filter(quote => quote.price !== null);
  const ranked = knownPrices.length ? knownPrices : quotes;
  // Trade up to five extra minutes for each dollar saved.
  return [...ranked].sort((a, b) =>
    (a.minutes + (a.price ?? 0) * 5) - (b.minutes + (b.price ?? 0) * 5))[0]?.mode;
}

function NewExcursionForm({ onBack, onBegin, initialDraft }) {
  const [name, setName] = useState(initialDraft?.name ?? "");
  const [firstStop, setFirstStop] = useState(initialDraft?.firstStop ?? { label: "", address: "", point: null, placeId: null });
  const [mode, setMode] = useState(initialDraft?.mode ?? "WALKING");
  const [comparison, setComparison] = useState(null);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState("");
  const startId = useRef(null);
  const destination = firstStop.point;
  const current = comparison?.destination === destination ? comparison : null;

  useEffect(() => {
    if (!destination) return;
    let active = true;
    async function compareModes() {
      try {
        const origin = await getLocationOnce();
        if (!active) return;
        const results = await Promise.allSettled(TRAVEL_MODES.map(async ([mode]) => {
          const route = await fetchDirections(origin, destination, mode);
          return { ...route, mode, price: travelPrice(mode, route.fare) };
        }));
        if (!active) return;
        const quotes = results.flatMap(result => result.status === "fulfilled" ? [result.value] : []);
        setComparison({ destination, origin, quotes, error: quotes.length ? "" : "Travel estimates are unavailable." });
      } catch (error) {
        if (active) setComparison({ destination, quotes: [], error: error.message });
      }
    }
    compareModes();
    return () => { active = false; };
  }, [destination]);

  const recommended = suggestedMode(current?.quotes ?? []);

  async function begin() {
    if (starting || !name.trim() || !firstStop.point) return;
    setStarting(true);
    setStartError("");
    const activityId = startId.current ??= crypto.randomUUID();
    const startedAt = new Date().toISOString();
    const origin = current?.origin;
    const trip = current?.quotes.find(quote => quote.mode === mode);
    const excursion = { activityId, startedAt, name: name.trim(), firstStop, mode, origin, trip };
    try {
      await startActiveExcursion(excursion);
      onBegin(excursion);
    } catch (error) {
      setStartError(error.message || "Couldn’t start the excursion.");
    } finally {
      setStarting(false);
    }
  }

  return <section className="log-form-page" aria-labelledby="new-excursion-title">
    <button type="button" className="log-form-back" disabled={starting} onClick={onBack} aria-label="Back to excursion options">← Back</button>
    <div className="log-form-content">
      <div className="log-form-section">
        <label id="new-excursion-title" htmlFor="new-excursion-name">Name your excursion</label>
        <input id="new-excursion-name" type="text" value={name} onChange={event => setName(event.target.value)}
          placeholder="Example: Saturday in the North End" autoComplete="off"/>
      </div>
      <div className="log-form-section log-location-section">
        <ExcursionStopPicker fieldId="new-excursion-first-stop" label="Where to first?"
          stop={firstStop} number={1} onChange={setFirstStop}/>
      </div>
      <div className="log-transport-choice">
        <span>How do you intend to get there?</span>
        <div className="travel-modes" role="group" aria-label="How do you intend to get there?">
          {TRAVEL_MODES.map(([value, label, icon]) => {
            const quote = current?.quotes.find(item => item.mode === value);
            return <button key={value} type="button" aria-pressed={mode === value}
              onClick={() => setMode(value)}>
              <Icon name={icon} size={15}/>{label}
              {value === recommended && <span className="excursion-recommended" aria-label="Recommended" title="Recommended"/>}
              {quote && <small>{minutesLabel(quote.minutes)} · {quote.price === 0 ? "Free" : quote.fare || "Price unknown"}</small>}
            </button>;
          })}
        </div>
        {destination && !current && <p className="log-map-status" role="status">Comparing travel times and prices…</p>}
        {current?.error && <p className="log-map-status error" role="status">{current.error}</p>}
      </div>
      {startError && <p className="log-save-error" role="alert">{startError}</p>}
      <button type="button" className="log-finish" disabled={starting || !name.trim() || !firstStop.point || !firstStop.placeId}
        onClick={begin}>{starting ? "Starting excursion…" : "Begin"}</button>
    </div>
  </section>;
}

const emptyStop = { label: "", address: "", point: null, placeId: null };
const stopArrivalRadius = 50;

function metersBetween([lat, lng], [otherLat, otherLng]) {
  const longitudeScale = Math.cos((lat + otherLat) * Math.PI / 360);
  return 111_195 * Math.hypot(lat - otherLat, (lng - otherLng) * longitudeScale);
}

function excursionLeg(trip, origin, destination) {
  return {
    path: trip?.path?.length > 1 ? trip.path : origin ? [origin, destination] : [],
    meters: trip?.meters ?? 0,
    minutes: trip?.minutes ?? 0,
  };
}

function ActiveExcursion({ excursion, visible, onEnd }) {
  const { activityId, firstStop, mode } = excursion;
  const [stops, setStops] = useState([firstStop]);
  const [nextStop, setNextStop] = useState(emptyStop);
  const [addingStop, setAddingStop] = useState(false);
  const [name, setName] = useState(excursion.name);
  const [savedName, setSavedName] = useState(excursion.name);
  const [failedName, setFailedName] = useState(null);
  const [arrivedCount, setArrivedCount] = useState(0);
  const [plannedTrips, setPlannedTrips] = useState([excursion.trip ?? null]);
  const [saving, setSaving] = useState("");
  const [saveError, setSaveError] = useState("");
  const [location, setLocation] = useState(excursion.origin ?? null);
  const [locationStatus, setLocationStatus] = useState("");
  const [liveTrip, setLiveTrip] = useState(null);
  const [tripStatus, setTripStatus] = useState("");
  const [routeStart, setRouteStart] = useState(excursion.trip ? null : excursion.origin ?? null);
  const lastOrigin = useRef(excursion.origin ?? null);
  const initialOrigin = useRef(excursion.origin ?? null);
  const busy = useRef(false);
  const routeMap = useRef(null);
  const destination = stops[arrivedCount];
  const trip = liveTrip?.destination === destination ? liveTrip?.route : plannedTrips[arrivedCount];

  useEffect(() => {
    if (!visible) return;
    if (!navigator.geolocation) {
      setLocationStatus("Your location is unavailable in this browser.");
      return;
    }
    return watchUserLocation(navigator.geolocation, {
      onLocation: point => {
        setLocation(point);
        setLocationStatus("");
        initialOrigin.current ??= point;
        const last = lastOrigin.current;
        if (!last || Math.hypot(point[0] - last[0], (point[1] - last[1]) * 0.74) >= 0.001) {
          lastOrigin.current = point;
          setRouteStart(point);
        }
      },
      onError: setLocationStatus,
    });
  }, [visible]);

  useEffect(() => {
    if (!visible || !location || !destination || metersBetween(location, destination.point) > stopArrivalRadius) return;
    lastOrigin.current = location;
    setRouteStart(location);
    setTripStatus("");
    setArrivedCount(arrivedCount + 1);
  }, [arrivedCount, destination, location, visible]);

  useEffect(() => {
    // All stops reached: nothing to look up (and a lookup that was cancelled on arrival can't leave its message behind)
    if (!destination) { setTripStatus(""); return; }
    if (!routeStart || !visible) return;
    let active = true;
    setTripStatus("Finding your route…");
    fetchDirections(routeStart, destination.point, mode).then(route => {
      if (active) {
        setLiveTrip({ destination, route });
        setPlannedTrips(current => current[arrivedCount] ? current :
          current.map((planned, index) => index === arrivedCount ? route : planned));
        setTripStatus("");
      }
    }).catch(() => {
      if (active) {
        setLiveTrip({ destination, route: null });
        setTripStatus("Directions are unavailable. The dotted line points toward the stop.");
      }
    });
    return () => { active = false; };
  }, [arrivedCount, routeStart, destination, mode, visible]);

  const directions = useMemo(() => ({
    excursionLegs: stops.map((stop, index) => {
      const current = index === arrivedCount;
      const legTrip = current ? trip : plannedTrips[index];
      const origin = (current && routeStart) || stops[index - 1]?.point || initialOrigin.current;
      return {
        destination: stop.point,
        destinationName: stop.label,
        path: excursionLeg(legTrip, origin, stop.point).path,
        completed: index < arrivedCount,
        duration: legTrip ? minutesLabel(legTrip.minutes) : null,
      };
    }),
  }), [arrivedCount, plannedTrips, routeStart, stops, trip]);

  const save = useCallback(async (label, action) => {
    if (busy.current) return;
    busy.current = true;
    setSaving(label);
    setSaveError("");
    try {
      await action();
    } catch (error) {
      setSaveError(error.message || "Couldn’t update the excursion.");
    } finally {
      busy.current = false;
      setSaving("");
    }
  }, []);

  const trimmedName = name.trim();
  useEffect(() => {
    if (saving || !trimmedName || trimmedName === savedName || trimmedName === failedName) return;
    const timer = setTimeout(() => {
      save("Saving name…", async () => {
        try {
          await updateActiveExcursion(activityId, { name: trimmedName });
          setSavedName(trimmedName);
        } catch (error) {
          setFailedName(trimmedName);
          throw new Error(error.message || "Couldn’t save the excursion name. Edit it to try again.");
        }
      });
    }, 600);
    return () => clearTimeout(timer);
  }, [activityId, failedName, save, savedName, saving, trimmedName]);

  function addStop(event) {
    event.preventDefault();
    if (!nextStop.point) return;
    save("Adding stop…", async () => {
      if (!nextStop.placeId) throw new Error("Choose a searchable place or address to save this stop.");
      if (stops.some(stop => stop.placeId === nextStop.placeId)) {
        throw new Error("This place is already a stop on the excursion.");
      }
      const previousStop = stops.at(-1);
      const nextTrip = await fetchDirections(previousStop.point, nextStop.point, mode).catch(() => null);
      await addActiveExcursionStop(activityId, stops.length + 1, nextStop.placeId);
      setPlannedTrips(current => [...current, nextTrip]);
      setStops(current => [...current, nextStop]);
      setNextStop(emptyStop);
      setAddingStop(false);
      routeMap.current?.scrollIntoView({ block: "nearest" });
    });
  }

  function endExcursion() {
    if (!name.trim()) return;
    save("Ending excursion…", async () => {
      const legs = stops.map((stop, index) => excursionLeg(
        plannedTrips[index], stops[index - 1]?.point ?? initialOrigin.current, stop.point,
      ));
      const savedIds = await loadActiveExcursionStopIds(activityId);
      const locationsById = new Map(stops.map(stop => [stop.placeId, stop]));
      const locations = savedIds.map(id => locationsById.get(id));
      if (locations.length !== stops.length || locations.some(stop => !stop)) {
        throw new Error("The saved stops could not be matched to this excursion.");
      }
      await updateActiveExcursion(activityId, { name: name.trim(), status: "completed" });
      const path = [];
      for (const leg of legs) {
        for (const point of leg.path) {
          if (path.at(-1)?.[0] !== point[0] || path.at(-1)?.[1] !== point[1]) path.push(point);
        }
      }
      onEnd({
        activityId, name: name.trim(), date: todayValue(), comments: "",
        locations,
        legModes: locations.slice(1).map(() => mode),
        route: {
          path: path.length ? path : locations.map(stop => stop.point),
          meters: legs.reduce((sum, leg) => sum + leg.meters, 0),
          minutes: legs.reduce((sum, leg) => sum + leg.minutes, 0),
        },
      });
    });
  }

  return <section className="log-form-page" aria-label="Active excursion">
    <div className="log-form-content">
      <div className="log-form-section">
        <input className="active-excursion-name" type="text" aria-label="Excursion name" value={name}
          readOnly={saving === "Ending excursion…"}
          onChange={event => {
            setFailedName(null);
            setName(event.target.value);
          }} required/>
        <p>{destination ? `On the way to Stop ${arrivedCount + 1} · ${destination.label}` : "All stops reached"}</p>
        {destination && <p>{TRAVEL_MODES.find(([value]) => value === mode)?.[1]}{trip && ` · ${minutesLabel(trip.minutes)} expected`}</p>}
        <div className="log-start-map" ref={routeMap}>
          {visible && <GoogleBostonMap walk={EMPTY_WALK} walks={NO_WALKS} selected={null} onSelect={noop}
            directions={directions} location={location} userLocationIcon showTransitToggle={false}/>}
        </div>
        {(locationStatus || tripStatus) && <p className="log-map-status" role="status">{locationStatus || tripStatus}</p>}
      </div>

      <div className="log-form-section">
        <button type="button" className="log-form-back" aria-expanded={addingStop} aria-controls="active-stop-form"
          onClick={() => setAddingStop(current => !current)}> {addingStop ? "Hide new stop" : "+ Add a stop"}</button>
        <form id="active-stop-form" onSubmit={addStop} hidden={!addingStop}>
          {addingStop && <ExcursionStopPicker fieldId="active-next-stop" label={`Stop ${stops.length + 1}`}
            stop={nextStop} number={stops.length + 1} onChange={setNextStop}/>}
          <button type="submit" className="log-form-back"
            disabled={!nextStop.point || !nextStop.placeId || Boolean(saving)}>Add stop</button>
        </form>
      </div>

      {saveError && <p className="log-save-error" role="alert">{saveError}</p>}
      {saving && <p className="log-map-status" role="status">{saving}</p>}
      <button type="button" className="log-save-excursion" disabled={!name.trim() || Boolean(saving)}
        onClick={endExcursion}>End excursion</button>
    </div>
  </section>;
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

  // Remove a stop (only while more than 2 are left). The travel mode into it goes with it; for the first stop,
  // the mode into the second one does (the new first stop has no "how did you get here").
  function removeLocation(id) {
    const index = locations.findIndex(location => location.id === id);
    if (index < 0 || locations.length <= 2) return;
    setLocations(current => current.filter(location => location.id !== id));
    setLegModes(current => current.filter((_, modeIndex) => modeIndex !== Math.max(index - 1, 0)));
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
          <div className="log-location-heading">
            <label htmlFor={fieldId}>{number}. {index === 0 ? "where did you start?" : "where did you go next?"}</label>
            {locations.length > 2 && <button type="button" className="log-remove-location"
              onClick={() => removeLocation(location.id)} aria-label={`Remove location ${number}${location.label ? `, ${location.label}` : ""}`}>
              <Icon name="close" size={16}/>
            </button>}
          </div>
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

export function LogPage({ onLog, visible }) {
  const [page, setPage] = useState("menu");
  const [draft, setDraft] = useState(null);
  const [activeExcursion, setActiveExcursion] = useState(null);
  useEffect(() => {
    if (!visible) return;
    document.documentElement.classList.add("log-open");
    return () => document.documentElement.classList.remove("log-open");
  }, [visible]);

  if (page === "new") return <NewExcursionForm initialDraft={activeExcursion} onBack={() => setPage("menu")}
    onBegin={excursion => { setActiveExcursion(excursion); setPage("active"); }}/>;

  if (page === "active") return <ActiveExcursion excursion={activeExcursion} visible={visible}
    onEnd={excursion => { onLog?.(excursion); setActiveExcursion(null); setPage("saved"); }}/>;

  if (page === "previous") return <PreviousExcursionForm initialDraft={draft} onBack={() => setPage("menu")}
    onFinish={excursion => { setDraft(excursion); setPage("details"); }}/>;

  if (page === "details") return <ExcursionDetails excursion={draft} onBack={() => setPage("previous")}
    onSaved={excursion => { onLog?.(excursion); setDraft(null); setPage("saved"); }}/>;

  if (page === "saved") return <section className="log-page" aria-labelledby="logged-title">
    <div className="log-page-content log-saved">
      <h1 id="logged-title">Excursion logged</h1>
      <p>Your route is now in your Profile activity.</p>
      <button type="button" className="log-page-action log-page-action-primary" onClick={() => setPage("menu")}>Log another excursion</button>
    </div>
  </section>;

  return <section className="log-page" aria-labelledby="log-page-title">
    <div className="log-page-content">
      <h1 id="log-page-title">Log an excursion</h1>
      <div className="log-page-actions">
        <button type="button" className="log-page-action" onClick={() => setPage("previous")}>Log a previous excursion</button>
        <button type="button" className="log-page-action log-page-action-primary" onClick={() => setPage("new")}>Start a new excursion</button>
      </div>
    </div>
  </section>;
}
