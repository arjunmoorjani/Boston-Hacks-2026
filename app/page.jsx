"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { MapIcon, UserIcon } from "@hugeicons/core-free-icons";
import { BostonMap } from "./boston-map";
import { GoogleBostonMap } from "./google-boston-map";
import { Icon } from "./icons";
import { RouteList } from "./route-list";
import { PlanDetail } from "./plan-detail";
import { PlanEditor } from "./plan-editor";
import { ProfilePage, RankPrompt } from "./profile";
import { walks as fallbackWalks, walkStats } from "./walks";
import { buildTripToStart, buildWalkingRoute, googleMapsConfigured } from "../lib/google-maps.mjs";
import { watchUserLocation } from "../lib/location.mjs";
import { saveOuting } from "../lib/save-outing.mjs";
import { filterRoutesByCategory, loadRoutes, routesForMap } from "../lib/routes.mjs";
import { buildSuggestData } from "../lib/suggest-data.mjs";
import { completionFor, emptyProfile, loadProfile, saveProfile } from "../lib/profile-store.mjs";

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
  const [following, setFollowing] = useState(true);
  const [location, setLocation] = useState(null);
  const [locationStatus, setLocationStatus] = useState("");
  const [step, setStep] = useState(null);
  const [complete, setComplete] = useState(false);
  const [profile, setProfile] = useState(emptyProfile); // name, finished plans, ranking, saved plans (this browser)
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [draftPlaces, setDraftPlaces] = useState([]);
  const [savingOuting, setSavingOuting] = useState(false);
  const [saveFeedback, setSaveFeedback] = useState(null);
  const [building, setBuilding] = useState(false);
  const [routeError, setRouteError] = useState("");
  const [view, setView] = useState("list"); // sheet shows: "list" of walks, one plan's "detail", or the plan "edit"or
  const [forkOf, setForkOf] = useState(null);    // { heading } for the editor
  const [draftTitle, setDraftTitle] = useState("");
  const [removed, setRemoved] = useState(null);   // last removed stop, for Undo
  const [editFrom, setEditFrom] = useState("list");
  const [routeResults, setRouteResults] = useState({});
  const [routeStatus, setRouteStatus] = useState("");
  const [toStartMode, setToStartMode] = useState("WALKING");
  const [pendingToStart, setPendingToStart] = useState(null);
  const [toStartRequest, setToStartRequest] = useState(null);
  const [toStartEstimate, setToStartEstimate] = useState(null);
  const [toStartStatus, setToStartStatus] = useState("");
  const [toStartLoading, setToStartLoading] = useState(false);
  const suggestData = useMemo(() => buildSuggestData(walks), [walks]);
  const categories = [...new Set(walks.map(walk => walk.category))].sort();
  const availableWalks = useMemo(() => [
    ...filterRoutesByCategory(walks, disabledCategories), ...profile.customWalks,
  ], [walks, disabledCategories, profile.customWalks]);
  const baseWalk = availableWalks.find(item => item.id === selectedWalkId) ?? null;
  const routeResult = baseWalk ? routeResults[baseWalk.id] : null;
  const walk = useMemo(() => routeResult ? { ...baseWalk, ...routeResult } : baseWalk, [baseWalk, routeResult]);
  const stats = walk ? walkStats(walk) : null;
  // While editing, the map shows the draft (straight lines between stops) so reordering is visible right away.
  const draftWalk = useMemo(() => {
    if (view !== "edit" || !draftPlaces.length) return null;
    const stops = draftPlaces.map(place => ({ id: place.osm_id, name: place.name, address: place.address, point: [Number(place.latitude), Number(place.longitude)] }));
    return { id: `draft:${stops.map(stop => stop.id).join("|")}`, area: "Draft plan", category: "Draft", symbol: "route", stops, path: stops.map(stop => stop.point) };
  }, [view, draftPlaces]);
  const mapWalk = draftWalk ?? (view === "detail" ? walk : null) ?? emptyWalk;
  const mapWalks = useMemo(() => draftWalk
    ? [draftWalk]
    : routesForMap(availableWalks, view === "detail" ? selectedWalkId : null, routeResults),
  [draftWalk, availableWalks, view, selectedWalkId, routeResults]);
  const closeProfile = useCallback(() => setShowProfile(false), []);
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
      setWalksStatus("");
    }).catch(error => {
      if (!controller.signal.aborted) setWalksStatus(`${error.message} Showing built-in walks.`);
    });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    setProfile(loadProfile()); // browser-only, so after the first render
    setProfileLoaded(true);
  }, []);
  useEffect(() => {
    if (profileLoaded) saveProfile(profile);
  }, [profile, profileLoaded]);
  const updateProfile = change => setProfile(old => ({ ...old, ...(typeof change === "function" ? change(old) : change) }));

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
      const message = "Location needs a secure connection (HTTPS) or localhost.";
      setLocationStatus(message);
      setPendingToStart(null);
      setToStartStatus(message);
      setToStartLoading(false);
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

  const sheet = useRef(null);
  // Phones scroll the page to move the sheet; on desktop the sheet scrolls by itself.
  const sheetTop = () => (sheet.current?.offsetTop ?? 0) - 64;
  function collapseSheet() {
    window.scrollTo({ top: 0, behavior: "smooth" });
    sheet.current?.scrollTo({ top: 0, behavior: "smooth" });
  }
  function toggleSheet() {
    if (window.scrollY > 20) collapseSheet();
    else window.scrollTo({ top: sheetTop(), behavior: "smooth" });
  }

  function resetWalkInteraction() {
    setSelected(null);
    setStep(null);
    setComplete(false);
    setPendingToStart(null);
    setToStartRequest(null);
    setToStartEstimate(null);
    setToStartStatus("");
    setToStartLoading(false);
  }

  function changeRoute(id) {
    setSelectedWalkId(id);
    resetWalkInteraction();
  }

  function openMapScreen() {
    setShowProfile(false);
    setView("list");
    changeRoute(null);
    collapseSheet();
  }

  function toggleCategory(category) {
    const turningOff = !disabledCategories.includes(category);
    setDisabledCategories(items => turningOff ? [...items, category] : items.filter(item => item !== category));
    if (turningOff && baseWalk?.category === category) {
      setSelectedWalkId(null);
      setRouteStatus("");
      setView("list");
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

  function openWalk(id) {
    if (![...walks, ...profile.customWalks].some(item => item.id === id)) return false;
    const category = walks.find(item => item.id === id)?.category;
    setDisabledCategories(items => items.filter(item => item !== category));
    changeRoute(id);
    setView("detail");
    setShowProfile(false);
    collapseSheet();
    return true;
  }

  function deleteCustomWalk(id) {
    updateProfile(old => ({ customWalks: old.customWalks.filter(item => item.id !== id), ranking: old.ranking.filter(item => item !== id) }));
    if (selectedWalkId === id) { changeRoute(null); setView("list"); }
  }

  function advance() {
    if (step === walk.stops.length - 1) {
      setStep(null);
      setSelected(null);
      setComplete(true);
      updateProfile(old => ({ completions: [completionFor(walk, stats), ...old.completions] }));
      return;
    }
    const next = step === null ? 0 : step + 1;
    setStep(next);
    setSelected(next);
    setComplete(false);
  }

  function startEditing(places, title, heading) {
    setDraftPlaces(places.slice(0, maxStops));
    setDraftTitle(title);
    setSaveFeedback(null);
    setForkOf({ heading });
    setRemoved(null);
    setRouteError("");
    setEditFrom(view === "edit" ? editFrom : view);
    setView("edit");
    setSelected(null);
    collapseSheet();
  }

  // Tapping "Add to walk" on a map place: add it to the plan being edited, or start a new plan with it.
  function addPlace(place) {
    if (building || savingOuting) return;
    if (view !== "edit") return startEditing([place], "My plan", "New plan");
    setDraftPlaces(items => items.length >= maxStops || items.some(item => item.osm_id === place.osm_id) ? items : [...items, place]);
    setRemoved(null);
    setRouteError("");
  }

  function moveStop(index, change) {
    setDraftPlaces(items => {
      const next = [...items];
      const target = index + change;
      if (target < 0 || target >= next.length) return items;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
    setSelected(null);
  }

  function removeStop(index) {
    setRemoved({ place: draftPlaces[index], index });
    setDraftPlaces(items => items.filter((_, i) => i !== index));
    setSelected(null);
  }

  function undoRemove() {
    if (!removed) return;
    setDraftPlaces(items => items.length >= maxStops ? items : [...items.slice(0, removed.index), removed.place, ...items.slice(removed.index)]);
    setRemoved(null);
  }

  function cancelEditing() {
    setDraftPlaces([]);
    setRemoved(null);
    setRouteError("");
    setView(editFrom === "edit" ? "detail" : editFrom);
    collapseSheet();
  }

  // Fork: copy this plan's stops into the editor.
  // Continue: start a follow-up plan from this plan's last stop plus the picked "Keep going" stops.
  function fork(extra = []) {
    const asPlace = stop => ({
      placeId: stop.placeId,
      osm_id: stop.placeId ? `google:${stop.placeId}` : stop.id ?? stop.name, // same id as tapping that place on the map
      name: stop.name, latitude: stop.point?.[0] ?? stop.lat, longitude: stop.point?.[1] ?? stop.lng,
      address: stop.address ?? "", tags: { description: stop.note ?? "" },
    });
    if (extra.length) {
      const last = walk.stops.at(-1);
      startEditing([last, ...extra].map(asPlace), `After ${walk.title}`, `Continue from ${last.name}`);
    } else {
      startEditing(walk.stops.map(asPlace), `${walk.title}, your version`, `Forking ${walk.title}`);
    }
  }

  async function handleSaveOuting() {
    if (savingOuting || building || !draftTitle.trim() || !draftPlaces.length
      || draftPlaces.some(stop => !stop.placeId)) return;

    setSavingOuting(true);
    setSaveFeedback(null);
    try {
      await saveOuting(draftTitle, draftPlaces.map(stop => stop.placeId));
      setSaveFeedback({ message: "Outing saved." });
    } catch (error) {
      setSaveFeedback({ error: true, message: error?.message || "Couldn’t save the outing." });
    } finally {
      setSavingOuting(false);
    }
  }

  async function createWalk() {
    if (building || savingOuting || draftPlaces.length < 2 || !draftTitle.trim()) return;
    const stops = draftPlaces.map(place => ({
      id: place.osm_id, placeId: place.placeId ?? null, name: place.name, point: [Number(place.latitude), Number(place.longitude)],
      address: place.address || [place.tags?.["addr:housenumber"], place.tags?.["addr:street"]].filter(Boolean).join(" "),
      note: place.tags?.description || "A stop on your custom walk.",
    }));
    setBuilding(true);
    setRouteError("");
    try {
      const route = await buildWalkingRoute(stops);
      const saved = {
        ...route, id: `custom:${Date.now()}`, title: draftTitle.trim(), area: "Your plan", category: "Custom walk",
        symbol: "route", description: "Visit your selected places in the order shown.", stops,
      };
      updateProfile(old => ({ customWalks: [...old.customWalks, saved] }));
      changeRoute(saved.id);
      setView("detail");
      setDraftPlaces([]);
      setRemoved(null);
      collapseSheet();
    } catch {
      setRouteError("Couldn’t get a walking route for these stops. Try again, or swap a stop that’s far away.");
    } finally {
      setBuilding(false);
    }
  }

  return <main className="app">
    <div className="map-panel">
      <MapView walk={mapWalk} walks={mapWalks} selected={selected} onSelect={setSelected} location={following ? location : null}
        draftPlaces={view === "edit" ? draftPlaces : []} onAddPlace={addPlace} canAddPlace={!building && !savingOuting && (view !== "edit" || draftPlaces.length < maxStops)}
        following={following} locationStatus={locationStatus} />
    </div>

    {/* Phones: transparent space over the map; scrolling the page pulls the sheet up over it. */}
    <div className="sheet-spacer" aria-hidden="true"/>

    <section className="bottom-sheet" ref={sheet} aria-label={view === "edit" ? "Edit plan" : undefined}
      aria-labelledby={view === "detail" ? "walk-title" : view === "list" ? "more-walks" : undefined}>
      <button type="button" className="sheet-handle" onClick={toggleSheet} aria-label="Expand or collapse the panel"><span/></button>
      {view === "edit"
        ? <PlanEditor heading={forkOf?.heading ?? "New plan"} title={draftTitle} onTitle={setDraftTitle}
            places={draftPlaces} maxStops={maxStops} onMove={moveStop} onRemove={removeStop}
            removed={removed} onUndo={undoRemove} onCancel={cancelEditing} onSave={createWalk}
            building={building} error={routeError}
            savingOuting={savingOuting} saveFeedback={saveFeedback} onSaveOuting={handleSaveOuting}/>
        : view === "detail" && walk
        ? <PlanDetail walk={walk} stats={stats} suggestData={suggestData} step={step} complete={complete} selected={selected}
            directions={directions} transitDirections={transitDirections}
            onBack={() => { changeRoute(null); setView("list"); collapseSheet(); }}
            onSelectStop={index => { setSelected(index); collapseSheet(); }}
            onAdvance={advance} onEndWalk={() => { setStep(null); setSelected(null); }} onFork={fork}
            routing={<>
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

                <a href={walkDirections} target="_blank" rel="noreferrer">Open full walk in Google Maps <Icon name="external" size={15}/></a>
            </>}
            rankSlot={complete && !profile.ranking.includes(walk.id) && <RankPrompt newId={walk.id} ranking={profile.ranking}
              titleOf={id => availableWalks.find(item => item.id === id)?.title ?? profile.completions.find(c => c.walkId === id)?.title ?? id}
              onDone={ranking => updateProfile({ ranking })}/>}/>
        : <RouteList walks={availableWalks} index={availableWalks.indexOf(baseWalk)} status={walksStatus}
            filters={<fieldset className="route-filters">
              <legend>Filter walks</legend>
              {categories.map(category => <label key={category}>
                <input type="checkbox" checked={!disabledCategories.includes(category)} onChange={() => toggleCategory(category)}/>
                {category}
              </label>)}
            </fieldset>}
            onChange={index => openWalk(availableWalks[index].id)}/>}
    </section>
    {showProfile && <ProfilePage profile={profile} walks={availableWalks} onClose={closeProfile}
      onRename={name => updateProfile({ name })} onRank={ranking => updateProfile({ ranking })}
      onOpenWalk={openWalk} onDeleteWalk={deleteCustomWalk} onSample={data => updateProfile(data)}
      onReset={() => updateProfile({ completions: [], ranking: [] })}/>}
    <nav className="bottom-nav" aria-label="Primary navigation">
      <button type="button" className="bottom-nav-button" aria-label="Map" aria-current={!showProfile ? "page" : undefined}
        onClick={openMapScreen}>
        <HugeiconsIcon icon={MapIcon} size={24}/>
      </button>
      <button type="button" className="bottom-nav-log" aria-label="Log, coming soon" title="Log coming soon" disabled/>
      <button type="button" className="bottom-nav-button" aria-label="Profile" aria-current={showProfile ? "page" : undefined}
        onClick={() => setShowProfile(true)}>
        <HugeiconsIcon icon={UserIcon} size={24}/>
      </button>
    </nav>
  </main>;
}
