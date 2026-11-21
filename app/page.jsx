"use client";

import { useEffect, useState } from "react";
import { BostonMap } from "./boston-map";
import { GoogleBostonMap } from "./google-boston-map";
import { Icon } from "./icons";
import { walks as fallbackWalks, walkStats } from "./walks";
import { buildWalkingRoute, googleMapsConfigured } from "../lib/google-maps.mjs";
import { watchUserLocation } from "../lib/location.mjs";
import { loadRoutes } from "../lib/routes.mjs";

const MapView = googleMapsConfigured ? GoogleBostonMap : BostonMap;
const maxStops = 5;

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
  const [routeIndex, setRouteIndex] = useState(0);
  const [selected, setSelected] = useState(null);
  const [following, setFollowing] = useState(false);
  const [location, setLocation] = useState(null);
  const [locationStatus, setLocationStatus] = useState("");
  const [step, setStep] = useState(null);
  const [expanded, setExpanded] = useState(false);
  const [complete, setComplete] = useState(false);
  const [customWalk, setCustomWalk] = useState(null);
  const [draftPlaces, setDraftPlaces] = useState([]);
  const [building, setBuilding] = useState(false);
  const [routeError, setRouteError] = useState("");
  const [routeResults, setRouteResults] = useState({});
  const [routeStatus, setRouteStatus] = useState("");
  const availableWalks = customWalk ? [...walks, customWalk] : walks;
  const baseWalk = availableWalks[routeIndex] ?? availableWalks[0];
  const walk = routeResults[baseWalk.id] ? { ...baseWalk, ...routeResults[baseWalk.id] } : baseWalk;
  const stats = walkStats(walk);
  const stop = selected === null ? null : walk.stops[selected];
  const destination = walk.stops[step ?? selected ?? 0];
  const directions = `https://www.google.com/maps/dir/?api=1&destination=${destination.point.join(",")}&travelmode=walking`;
  const transitDirections = `https://www.google.com/maps/dir/?api=1&destination=${walk.stops[0].point.join(",")}&travelmode=transit`;
  const walkDirections = fullWalkDirections(walk);

  useEffect(() => {
    const controller = new AbortController();
    loadRoutes({ signal: controller.signal }).then(routes => {
      if (controller.signal.aborted) return;
      setWalks(routes);
      setRouteResults({});
      setRouteIndex(0);
      setWalksStatus("");
    }).catch(error => {
      if (!controller.signal.aborted) setWalksStatus(`${error.message} Showing built-in walks.`);
    });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!googleMapsConfigured || baseWalk.source !== "routes.json" || routeResults[baseWalk.id]) {
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
        setFollowing(false);
      },
    });
  }, [following]);

  function changeRoute(index) {
    setRouteIndex(index);
    setSelected(null);
    setStep(null);
    setComplete(false);
    setExpanded(false);
    setFollowing(false);
    setLocationStatus("");
  }

  function advance() {
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
    if (building) return;
    setDraftPlaces(items => items.length >= maxStops || items.some(item => item.osm_id === place.osm_id)
      ? items : [...items, place]);
    setRouteError("");
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
      changeRoute(walks.length);
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
        <div className="routes" aria-label="Choose a walk">
          {availableWalks.map((item, index) => <button key={item.id} type="button" aria-pressed={routeIndex === index} onClick={() => changeRoute(index)}>
            <Icon name={item.symbol} size={17}/>{item.title}
          </button>)}
        </div>
        {walksStatus && <p className="routes-status" role="status">{walksStatus}</p>}
      </div>
    </section>

    <div className="experience">
      <div className="map-panel">
      <MapView walk={walk} selected={selected} onSelect={setSelected} location={following ? location : null}
        draftPlaces={draftPlaces} onAddPlace={addPlace} canAddPlace={!building && draftPlaces.length < maxStops}
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
          <button className="plain-button" aria-label={`Remove ${place.name}`} disabled={building}
            onClick={() => setDraftPlaces(items => items.filter(item => item.osm_id !== place.osm_id))}><Icon name="close" size={17}/></button>
        </li>)}</ol>
        {routeError && <p role="alert">{routeError}</p>}
        <button className="primary" type="button" disabled={draftPlaces.length < 2 || building} onClick={createWalk}>
          {building ? "Calculating…" : "Calculate walking route"}
        </button>
      </section>}
      </div>

      <section className="sheet" aria-labelledby="walk-title">
        <div className="walk-category">{walk.area} <span>·</span> {walk.category}</div>
        <h2 id="walk-title">{walk.title}</h2>
        <div className="stats">
          <span><Icon name="route" size={16}/>{stats.miles} mi</span>
          <span><Icon name="clock" size={16}/>~{stats.minutes} min</span>
          <span><span className="stats-pin"/>{walk.stops.length} stops</span>
        </div>
        <p className="description">{walk.description}</p>
        {routeStatus && <p className="route-status" role="status">{routeStatus}</p>}
        {walk.warnings?.length > 0 && <p className="route-warning">{walk.warnings.join(" ")}</p>}

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
      </section>
    </div>
  </main>;
}
