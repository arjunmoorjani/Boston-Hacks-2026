"use client";

import { useEffect, useState } from "react";
import { BostonMap } from "./boston-map";
import { GoogleBostonMap } from "./google-boston-map";
import { Icon } from "./icons";
import { walks as fallbackWalks, walkStats } from "./walks";
import { buildTripToStart, buildWalkingRoute, googleMapsConfigured } from "../lib/google-maps.mjs";
import { watchUserLocation } from "../lib/location.mjs";
import { saveOuting } from "../lib/save-outing.mjs";
import { filterRoutesByCategory, loadRoutes, routesForMap } from "../lib/routes.mjs";

const MapView = googleMapsConfigured ? GoogleBostonMap : BostonMap;
const maxStops = 5;
const emptyWalk = { id: "no-route", title: "", area: "", category: "", description: "", stops: [], path: [] };

function fullWalkDirections(walk) {
  const points = walk.stops.map(stop => stop.point.join(","));
  const params = new URLSearchParams({
    api: "1",
    origin: points[0],
    destination: points.at(-1),
    travelmode: "walking",
  });
  if (points.length > 2) params.set("waypoints", points.slice(1, -1).join("|"));
  return `https://www.google.com/maps/dir/?${params}`;
}

function legDistance(meters) {
  if (!Number.isFinite(meters)) return "";
  return `${(meters / 1609.344).toFixed(1)} mi`;
}

export default function Home() {
  const [walks, setWalks] = useState(fallbackWalks);
  const [walksStatus, setWalksStatus] = useState("Loading premade walks…");
  const [selectedWalkId, setSelectedWalkId] = useState(null);
  const [disabledCategories, setDisabledCategories] = useState([]);
  const [selected, setSelected] = useState(null);
  const [following, setFollowing] = useState(false);
  const [location, setLocation] = useState(null);
  const [locationStatus, setLocationStatus] = useState("");
  const [step, setStep] = useState(null);
  const [expanded, setExpanded] = useState(false);
  const [complete, setComplete] = useState(false);
  const [customWalk, setCustomWalk] = useState(null);
  const [draftPlaces, setDraftPlaces] = useState([]);
  const [outingName, setOutingName] = useState("");
  const [savingOuting, setSavingOuting] = useState(false);
  const [saveFeedback, setSaveFeedback] = useState(null);
  const [building, setBuilding] = useState(false);
  const [routeError, setRouteError] = useState("");
  const [routeResults, setRouteResults] = useState({});
  const [routeStatus, setRouteStatus] = useState("");
  const [toStartMode, setToStartMode] = useState("WALKING");
  const [pendingToStart, setPendingToStart] = useState(null);
  const [toStartRequest, setToStartRequest] = useState(null);
  const [toStartEstimate, setToStartEstimate] = useState(null);
  const [toStartStatus, setToStartStatus] = useState("");
  const [toStartLoading, setToStartLoading] = useState(false);
  const categories = [...new Set(walks.map(walk => walk.category))].sort();
  const filteredWalks = filterRoutesByCategory(walks, disabledCategories);
  const availableWalks = customWalk ? [...filteredWalks, customWalk] : filteredWalks;
  const baseWalk = availableWalks.find(item => item.id === selectedWalkId) ?? null;
  const walk = baseWalk && routeResults[baseWalk.id] ? { ...baseWalk, ...routeResults[baseWalk.id] } : baseWalk;
  const mapWalks = routesForMap(availableWalks, selectedWalkId, routeResults);
  const stats = walk ? walkStats(walk) : null;
  const stop = walk && selected !== null ? walk.stops[selected] : null;
  const destination = walk ? walk.stops[step ?? selected ?? 0] : null;
  const directions = destination ? `https://www.google.com/maps/dir/?api=1&destination=${destination.point.join(",")}&travelmode=walking` : "";
  const transitDirections = walk ? `https://www.google.com/maps/dir/?api=1&destination=${walk.stops[0].point.join(",")}&travelmode=transit` : "";
  const walkDirections = walk ? fullWalkDirections(walk) : "";

  useEffect(() => {
    const controller = new AbortController();
    loadRoutes({ signal: controller.signal }).then(routes => {
      if (controller.signal.aborted) return;
      setWalks(routes);
      setRouteResults({});
      setDisabledCategories([]);
      setSelectedWalkId(null);
      setWalksStatus("");
    }).catch(error => {
      if (!controller.signal.aborted) setWalksStatus(`${error.message} Showing built-in walks.`);
    });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!baseWalk || !googleMapsConfigured || baseWalk.source !== "routes.json" || routeResults[baseWalk.id]) {
      setRouteStatus("");
      return;
    }

    let active = true;
    setRouteStatus("Calculating the walking route…");
    buildWalkingRoute(baseWalk.stops).then(route => {
      if (!active) return;
      setRouteResults(results => ({ ...results, [baseWalk.id]: route }));
      setRouteStatus("");
    }).catch(() => {
      if (active) setRouteStatus("Couldn’t calculate this walking route. Check that Routes API is enabled.");
    });
    return () => { active = false; };
  }, [baseWalk, routeResults]);

  useEffect(() => {
    if (!pendingToStart || !location) return;
    setToStartRequest({ ...pendingToStart, origin: [...location] });
    setPendingToStart(null);
  }, [pendingToStart, location]);

  useEffect(() => {
    if (!toStartRequest) return;
    let active = true;
    setToStartLoading(true);
    setToStartStatus(`Calculating ${toStartRequest.travelMode === "TRANSIT" ? "transit" : "walking"} time to the start…`);
    buildTripToStart(toStartRequest.origin, toStartRequest.destination, toStartRequest.travelMode).then(estimate => {
      if (!active) return;
      setToStartEstimate(estimate);
      setToStartStatus("");
      setToStartLoading(false);
    }).catch(() => {
      if (!active) return;
      setToStartEstimate(null);
      setToStartStatus("Couldn’t calculate travel to the start. Try the other mode.");
      setToStartLoading(false);
    });
    return () => { active = false; };
  }, [toStartRequest]);

  useEffect(() => {
    if (!following) return;
    if (!window.isSecureContext || !navigator.geolocation) {
      setLocationStatus("Location needs a secure connection (HTTPS) or localhost.");
      setFollowing(false);
      return;
    }
    setLocationStatus("Finding your location…");
    return watchUserLocation(navigator.geolocation, {
      onLocation: nextLocation => {
        setLocation(nextLocation);
        setLocationStatus("");
      },
      onError: message => {
        setLocationStatus(message);
        setPendingToStart(null);
        setToStartStatus(message);
        setToStartLoading(false);
        setFollowing(false);
      },
    });
  }, [following]);

  function resetWalkInteraction() {
    setSelected(null);
    setStep(null);
    setComplete(false);
    setExpanded(false);
    setFollowing(false);
    setLocation(null);
    setLocationStatus("");
    setPendingToStart(null);
    setToStartRequest(null);
    setToStartEstimate(null);
    setToStartStatus("");
    setToStartLoading(false);
  }

  function changeRoute(id) {
    setSelectedWalkId(current => current === id ? null : id);
    resetWalkInteraction();
  }

  function toggleCategory(category) {
    const turningOff = !disabledCategories.includes(category);
    setDisabledCategories(items => turningOff ? [...items, category] : items.filter(item => item !== category));
    if (turningOff && baseWalk?.category === category && baseWalk.id !== "custom") {
      setSelectedWalkId(null);
      setRouteStatus("");
      resetWalkInteraction();
    }
  }

  function requestTripToStart() {
    if (!walk) return;
    const request = {
      destination: [...walk.stops[0].point],
      travelMode: toStartMode,
      walkId: walk.id,
      requestId: Date.now(),
    };
    setToStartEstimate(null);
    setToStartLoading(true);
    if (!location) {
      setPendingToStart(request);
      setToStartStatus("Finding your location…");
      setFollowing(true);
      return;
    }
    setToStartRequest({ ...request, origin: [...location] });
  }

  function advance() {
    if (!walk) return;
    if (step === walk.stops.length - 1) {
      setStep(null);
      setSelected(null);
      setComplete(true);
      return;
    }
    const next = step === null ? 0 : step + 1;
    setStep(next);
    setSelected(next);
    setComplete(false);
  }

  function addPlace(place) {
    if (building || savingOuting) return;
    setDraftPlaces(items => items.length >= maxStops || items.some(item => item.osm_id === place.osm_id)
      ? items : [...items, place]);
    setRouteError("");
  }

  async function handleSaveOuting(event) {
    event.preventDefault();
    if (savingOuting || !outingName.trim() || !draftPlaces.length) return;

    setSavingOuting(true);
    setSaveFeedback(null);
    try {
      await saveOuting(outingName, draftPlaces.map(stop => stop.placeId));
      setSaveFeedback({ message: "Outing saved." });
    } catch (error) {
      setSaveFeedback({ error: true, message: error?.message || "Couldn’t save the outing." });
    } finally {
      setSavingOuting(false);
    }
  }

  async function createWalk() {
    if (building || draftPlaces.length < 2) return;
    const stops = draftPlaces.map(place => ({
      id: place.osm_id, name: place.name, point: [Number(place.latitude), Number(place.longitude)],
      address: place.address || [place.tags?.["addr:housenumber"], place.tags?.["addr:street"]].filter(Boolean).join(" "),
      note: place.tags?.description || "A stop on your custom walk.",
    }));
    setBuilding(true);
    setRouteError("");
    try {
      const route = await buildWalkingRoute(stops);
      setCustomWalk({
        ...route, id: "custom", title: "Custom walk", area: "Boston", category: "Walking",
        symbol: "route", description: "Visit your selected places in the order shown.", stops,
      });
      changeRoute("custom");
    } catch {
      setRouteError("Couldn’t calculate this walk. Check that Routes API is enabled, or try different stops.");
    } finally {
      setBuilding(false);
    }
  }

  return <main className="shell">
    <header className="header">
      <div className="brand"><span><Icon name="route" size={23}/></span>sidewalk<span className="brand-period">.</span></div>
      <div className="city"><span/> BOSTON, MA</div>
    </header>

    <section className="intro" aria-labelledby="explore">
      <h1 id="explore">Explore Boston</h1>
      <div>
        <fieldset className="route-filters">
          <legend>Filter walks</legend>
          {categories.map(category => <label key={category}>
            <input type="checkbox" checked={!disabledCategories.includes(category)} onChange={() => toggleCategory(category)}/>
            {category}
          </label>)}
        </fieldset>
        <div className="routes" aria-label="Choose a walk">
          {availableWalks.map(item => <button key={item.id} type="button" aria-pressed={selectedWalkId === item.id} onClick={() => changeRoute(item.id)}>
            <Icon name={item.symbol} size={17}/>{item.title}
          </button>)}
        </div>
        {availableWalks.length === 0 && <p className="routes-status" role="status">No walks match these categories.</p>}
        {walksStatus && <p className="routes-status" role="status">{walksStatus}</p>}
      </div>
    </section>

    <div className="experience">
      <div className="map-panel">
      <MapView walk={walk ?? emptyWalk} walks={mapWalks} selected={selected} onSelect={setSelected} location={following ? location : null}
        draftPlaces={draftPlaces} onAddPlace={addPlace} canAddPlace={!building && !savingOuting && draftPlaces.length < maxStops}
        following={following} locationStatus={locationStatus}
        locate={() => {
          if (following) {
            setLocationStatus("");
            setLocation(null);
          }
          setFollowing(!following);
        }} />
      {googleMapsConfigured && draftPlaces.length > 0 && <section className="sheet draft-walk" aria-labelledby="draft-walk-title">
        <h3 id="draft-walk-title">Build a walk</h3>
        <ol>{draftPlaces.map(place => <li key={place.osm_id}>
          <span>{place.name}</span>
          <button className="plain-button" aria-label={`Remove ${place.name}`} disabled={building || savingOuting}
            onClick={() => setDraftPlaces(items => items.filter(item => item.osm_id !== place.osm_id))}><Icon name="close" size={17}/></button>
        </li>)}</ol>
        {routeError && <p role="alert">{routeError}</p>}
        <button className="primary" type="button" disabled={draftPlaces.length < 2 || building} onClick={createWalk}>
          {building ? "Calculating…" : "Calculate walking route"}
        </button>
        <form className="save-outing" onSubmit={handleSaveOuting}>
          <label htmlFor="outing-name">Outing name</label>
          <input id="outing-name" value={outingName} onChange={event => setOutingName(event.target.value)}
            required disabled={savingOuting} />
          <button className="primary" type="submit"
            disabled={savingOuting || !outingName.trim() || !draftPlaces.length}>
            {savingOuting ? "Saving…" : "Save outing"}
          </button>
          <p role="status">{saveFeedback && !saveFeedback.error ? saveFeedback.message : ""}</p>
          <p role="alert">{saveFeedback?.error ? saveFeedback.message : ""}</p>
        </form>
      </section>}
      </div>

      {walk ? <section className="sheet" aria-labelledby="walk-title">
        <div className="walk-category">{walk.area} <span>·</span> {walk.category}</div>
        <h2 id="walk-title">{walk.title}</h2>
        <div className="stats">
          <span><Icon name="route" size={16}/>{stats.miles} mi</span>
          <span><Icon name="clock" size={16}/>Within walk · ~{stats.minutes} min</span>
          <span><span className="stats-pin"/>{walk.stops.length} stops</span>
        </div>
        <p className="description">{walk.description}</p>
        {routeStatus && <p className="route-status" role="status">{routeStatus}</p>}
        {walk.warnings?.length > 0 && <p className="route-warning">{walk.warnings.join(" ")}</p>}

        <section className="to-start" aria-labelledby="to-start-title">
          <div className="to-start-heading">
            <h3 id="to-start-title">Get to start</h3>
            <div className="travel-modes" role="group" aria-label="Travel mode to the start">
              {["WALKING", "TRANSIT"].map(mode => <button key={mode} type="button"
                aria-pressed={toStartMode === mode} onClick={() => {
                  setToStartMode(mode);
                  setToStartEstimate(null);
                  setToStartStatus("");
                }}>{mode === "WALKING" ? "Walk" : "Transit"}</button>)}
            </div>
          </div>
          <button className="catalog-button" type="button" disabled={toStartLoading || !googleMapsConfigured}
            onClick={requestTripToStart}>{toStartLoading ? "Calculating…" : "Get travel time"}</button>
          {toStartStatus && <p role="status">{toStartStatus}</p>}
          {toStartEstimate && <p className="to-start-result" role="status">
            <strong>{Math.max(1, Math.round(toStartEstimate.minutes))} min to start</strong>
            <span>{toStartEstimate.travelMode === "TRANSIT" ? "Transit" : "Walk"} · {legDistance(toStartEstimate.meters)}</span>
          </p>}
        </section>

        {step !== null && <div className="walk-progress" role="status">
          <span>Stop {step + 1} of {walk.stops.length}</span>
          <strong>{walk.stops[step].name}</strong>
          <a href={directions} target="_blank" rel="noreferrer">Directions <Icon name="external" size={14}/></a>
        </div>}
        {complete && <p className="completed" role="status"><Icon name="check" size={17}/> Walk completed</p>}

        {stop && selected !== step && <div className="stop-preview" role="status">
          <span className="mini-pin">{selected + 1}</span>
          <div><strong>{stop.name}</strong><p>{stop.note}</p></div>
          <button className="plain-button" aria-label="Close stop preview" onClick={() => setSelected(null)}><Icon name="close" size={17}/></button>
        </div>}

        <button className="itinerary-toggle" aria-expanded={expanded} aria-controls="itinerary" onClick={() => setExpanded(value => !value)}>
          <span>Itinerary</span><Icon name={expanded ? "minus" : "plus"} size={18}/>
        </button>
        <ol className="itinerary" id="itinerary" hidden={!expanded}>
          {walk.stops.map((item, index) => <li key={item.id ?? item.name}>
            <button onClick={() => setSelected(index)} aria-pressed={selected === index}>
              <span className="mini-pin">{index + 1}</span>
              <span><strong>{item.name}</strong><small>{item.address}</small></span>
            </button>
          </li>)}
        </ol>

        {walk.legs?.length > 0 && <section className="route-directions" aria-labelledby="route-directions-title">
          <h3 id="route-directions-title">Walking directions</h3>
          {walk.legs.map((leg, index) => <details key={`${walk.id}-leg-${index}`}>
            <summary>
              <span><strong>{walk.stops[index]?.name}</strong> to <strong>{walk.stops[index + 1]?.name}</strong></span>
              <small>{legDistance(leg.meters)} · {Math.max(1, Math.round(leg.minutes))} min</small>
            </summary>
            {leg.steps.length > 0
              ? <ol>{leg.steps.map((routeStep, stepIndex) => <li key={`${routeStep.instruction}-${stepIndex}`}>
                  <span>{routeStep.instruction}</span>
                  {routeStep.meters > 0 && <small>{legDistance(routeStep.meters)}</small>}
                </li>)}</ol>
              : <p>No step details returned.</p>}
          </details>)}
        </section>}

        <div className="actions">
          <button className="primary" onClick={advance}>
            {step === null ? complete ? "Walk again" : "Start walk" : step === walk.stops.length - 1 ? "Finish walk" : "Mark stop visited"}
            <Icon name={step === null ? "arrow" : "check"} size={20}/>
          </button>
          {step === null
            ? <a href={directions} target="_blank" rel="noreferrer">Directions to {selected === null ? "start" : "this stop"} <Icon name="external" size={15}/></a>
            : <button className="cancel" onClick={() => { setStep(null); setSelected(null); }}>End walk</button>}
          {step === null && <a href={walkDirections} target="_blank" rel="noreferrer">Open full walk in Google Maps <Icon name="external" size={15}/></a>}
          {step === null && <a href={transitDirections} target="_blank" rel="noreferrer">Take the T to the start <Icon name="external" size={15}/></a>}
        </div>
      </section> : <section className="sheet empty-walk" aria-labelledby="choose-walk-title">
        <h2 id="choose-walk-title">Choose a walk</h2>
        <p>Select a visible walk above, or turn a category back on. Place icons, location, and T lines remain available on the map.</p>
      </section>}
    </div>
  </main>;
}
