"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { MapIcon, UserIcon } from "@hugeicons/core-free-icons";
import { BostonMap } from "./boston-map";
import { GoogleBostonMap } from "./google-boston-map";
import { Icon } from "./icons";
import { RouteList } from "./route-list";
import { RouteFilters } from "./route-filters";
import { PlaceProfile } from "./place-profile";
import { DirectionsPanel } from "./directions-panel";
import { PlanDetail } from "./plan-detail";
import { PlanEditor } from "./plan-editor";
import { ProfilePage, RankPrompt } from "./profile";
import { walks as fallbackWalks, walkStats } from "./walks";
import { buildWalkingRoute, googleMapsConfigured } from "../lib/google-maps.mjs";
import { fetchDirections } from "../lib/directions.mjs";
import { getLocationOnce, watchUserLocation } from "../lib/location.mjs";
import { saveOuting } from "../lib/save-outing.mjs";
import { loadRoutes, routesForMap } from "../lib/routes.mjs";
import { anyActive, applyFilters, categoryCounts, emptyFilters, matchesQuery } from "../lib/route-filters.mjs";
import { buildSuggestData } from "../lib/suggest-data.mjs";
import { completionFor, emptyProfile, loadProfile, saveProfile } from "../lib/profile-store.mjs";

const MapView = googleMapsConfigured ? GoogleBostonMap : BostonMap;
const maxStops = 5;
const DIRECTIONS_KEY = "sidewalk.directions.v1";
const supabaseReady = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);

const emptyWalk = { id: "no-route", title: "", area: "", category: "", description: "", stops: [], path: [] };

function legDistance(meters) {
  if (!Number.isFinite(meters)) return "";
  return `${(meters / 1609.344).toFixed(1)} mi`;
}

export default function Home() {
  const [walks, setWalks] = useState(fallbackWalks);
  const [walksStatus, setWalksStatus] = useState("Loading premade walks…");
  const [selectedWalkId, setSelectedWalkId] = useState(null);
  const [filters, setFilters] = useState(emptyFilters); // one set of filters for the list and the map
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
  const [planNotice, setPlanNotice] = useState("");
  const [placeProfile, setPlaceProfile] = useState(null); // { placeId, fallback } for the place card   // shown on the plan right after saving it
  const savedOuting = useRef(null);
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
  // In-app directions: where to, how, and the result. Your location is used for the request only, never stored.
  const [dirTarget, setDirTarget] = useState(null);        // { name, point, placeId? }
  const [dirMode, setDirMode] = useState("WALKING");
  const [dirState, setDirState] = useState({ status: "idle" });
  const [dirOrigin, setDirOrigin] = useState(null);
  const [dirFocus, setDirFocus] = useState(null);
  const [dirFrom, setDirFrom] = useState("list");
  const suggestData = useMemo(() => buildSuggestData(walks), [walks]);
  const allWalks = useMemo(() => [...walks, ...profile.customWalks], [walks, profile.customWalks]);
  // Catalog walks get every filter; your own plans only the search (they have no category/tags).
  const availableWalks = useMemo(() => [
    ...applyFilters(walks, filters), ...profile.customWalks.filter(item => matchesQuery(item, filters.query)),
  ], [walks, filters, profile.customWalks]);
  const counts = useMemo(() => categoryCounts(walks, filters), [walks, filters]);
  const baseWalk = allWalks.find(item => item.id === selectedWalkId) ?? null; // a filter never closes the plan you're looking at
  const routeResult = baseWalk ? routeResults[baseWalk.id] : null;
  const walk = useMemo(() => routeResult ? { ...baseWalk, ...routeResult } : baseWalk, [baseWalk, routeResult]);
  const stats = walk ? walkStats(walk) : null;
  // While editing, the map shows the draft (straight lines between stops) so reordering is visible right away.
  const draftWalk = useMemo(() => {
    if (view !== "edit" || !draftPlaces.length) return null;
    const stops = draftPlaces.map(place => ({ id: place.osm_id, name: place.name, address: place.address, point: [Number(place.latitude), Number(place.longitude)] }));
    return { id: `draft:${stops.map(stop => stop.id).join("|")}`, area: "Draft plan", category: "Draft", symbol: "route", stops, path: stops.map(stop => stop.point) };
  }, [view, draftPlaces]);
  const mapWalk = view === "directions" ? emptyWalk : draftWalk ?? (view === "detail" ? walk : null) ?? emptyWalk;
  const mapWalks = useMemo(() => view === "directions" ? []
    : draftWalk ? [draftWalk]
    : routesForMap(availableWalks, view === "detail" ? selectedWalkId : null, routeResults),
  [draftWalk, availableWalks, view, selectedWalkId, routeResults]);
  const closeProfile = useCallback(() => setShowProfile(false), []);
  const mapWalkRef = useRef(mapWalk);
  mapWalkRef.current = mapWalk;
  // Tapping a stop (pin or list row) highlights it and opens its place card when it's a Google place.
  const selectStop = useCallback(index => {
    setSelected(index);
    const stop = mapWalkRef.current?.stops[index];
    if (stop?.placeId && googleMapsConfigured) setPlaceProfile({ placeId: stop.placeId, fallback: { name: stop.name, address: stop.address, point: stop.point } });
  }, []);
  const openPlace = useCallback((placeId, fallback) => setPlaceProfile({ placeId, fallback }), []);
  const destination = walk ? walk.stops[step ?? selected ?? 0] : null;
  const directionsMap = useMemo(() => view === "directions" && dirTarget ? {
    destination: dirTarget.point, destinationName: dirTarget.name, origin: dirOrigin,
    segments: dirState.status === "ready" ? dirState.result.segments : [], focus: dirFocus,
  } : null, [view, dirTarget, dirOrigin, dirState, dirFocus]);

  useEffect(() => {
    const controller = new AbortController();
    loadRoutes({ signal: controller.signal }).then(routes => {
      if (controller.signal.aborted) return;
      setWalks(routes);
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

  // Turn-by-turn steps are fetched only when asked for (the map line already comes with each walk),
  // and kept for the browser session so reopening a walk or reloading doesn't call Google again.
  useEffect(() => {
    try { setRouteResults(JSON.parse(sessionStorage.getItem(DIRECTIONS_KEY) ?? "{}")); } catch {}
  }, []);

  async function requestDirections() {
    if (!baseWalk || routeResults[baseWalk.id] || routeStatus === "loading") return;
    const id = baseWalk.id;
    setRouteStatus("loading");
    try {
      const route = await buildWalkingRoute(baseWalk.stops);
      setRouteResults(results => {
        const next = { ...results, [id]: route };
        try { sessionStorage.setItem(DIRECTIONS_KEY, JSON.stringify(next)); } catch {}
        return next;
      });
      setRouteStatus("");
    } catch {
      setRouteStatus("Couldn’t get directions right now (Google may be over its daily limit). Try again later.");
    }
  }

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
    setPlanNotice("");
    setRouteStatus("");
    setSelected(null);
    setStep(null);
    setComplete(false);
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

  // ---------- in-app directions ----------
  // Open directions to a stop or place. Your location is looked up once for the request.
  function openDirections(target, mode = "WALKING") {
    if (!target?.point || !googleMapsConfigured) return;
    setPlaceProfile(null);
    setDirTarget(target);
    setDirMode(mode);
    setDirFocus(null);
    setDirFrom(view === "directions" ? dirFrom : view);
    setView("directions");
    collapseSheet();
    loadDirections(target, mode, null);
  }

  async function loadDirections(target, mode, knownOrigin) {
    setDirFocus(null);
    let origin = knownOrigin;
    try {
      if (!origin) {
        setDirState({ status: "locating" });
        origin = await getLocationOnce();
        setDirOrigin(origin);
      }
      setDirState({ status: "loading" });
      const result = await fetchDirections(origin, target.point, mode);
      setDirState({ status: "ready", result });
    } catch (error) {
      const quota = /quota|RESOURCE_EXHAUSTED/i.test(error?.message ?? "");
      setDirState({ status: "error", error: quota ? "Google’s directions limit is used up for today. Try again later, or use Google Maps below."
        : error?.message || "Couldn’t get directions. Try again." });
    }
  }

  function changeDirMode(mode) {
    if (mode === dirMode) return;
    setDirMode(mode);
    loadDirections(dirTarget, mode, dirOrigin);
  }

  function closeDirections() {
    setView(dirFrom === "directions" ? "list" : dirFrom);
    setDirTarget(null);
    setDirState({ status: "idle" });
    setDirOrigin(null); // don't keep the user's location around
    setDirFocus(null);
    collapseSheet();
  }

  function openWalk(id) {
    if (!allWalks.some(item => item.id === id)) return false;
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

  // What the place card's add button says: add it, it's already in the plan, or the plan is full.
  function addLabelFor(placeId) {
    if (building || savingOuting) return "Saving…";
    if (view !== "edit") return "Add to plan"; // starts a new plan with this place
    if (draftPlaces.some(place => place.placeId === placeId || place.osm_id === `google:${placeId}`)) return "In your plan";
    return draftPlaces.length >= maxStops ? "Plan is full" : "Add to plan";
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
      const details = new Map(suggestData.places.map(place => [place.placeId, place]));
      startEditing([last, ...extra.map(stop => ({ ...details.get(stop.placeId), ...stop }))].map(asPlace), `After ${walk.title}`, `Continue from ${last.name}`);
    } else {
      startEditing(walk.stops.map(asPlace), `${walk.title}, your version`, `Forking ${walk.title}`);
    }
  }

  // One "Save plan": saves the outing to Supabase (when it's set up), then builds the walking route,
  // keeps the plan on this device and opens it. Without Supabase it still saves locally.
  async function savePlan() {
    if (savingOuting || building || draftPlaces.length < 2 || !draftTitle.trim()) return;
    setSaveFeedback(null);
    let notice = "Saved on this device only (Supabase isn’t set up here).";
    const placeIds = draftPlaces.map(stop => stop.placeId);
    if (supabaseReady && placeIds.every(Boolean)) {
      const key = `${draftTitle.trim()}|${placeIds.join(",")}`;
      if (savedOuting.current !== key) { // don't save twice if only the route step failed and they retry
        setSavingOuting(true);
        try {
          await saveOuting(draftTitle, placeIds);
          savedOuting.current = key;
        } catch (error) {
          setSaveFeedback({ error: true, message: error?.message || "Couldn’t save the plan." });
          return;
        } finally {
          setSavingOuting(false);
        }
      }
      notice = "Plan saved.";
    }
    const result = await createWalk();
    if (result) setPlanNotice(notice + (typeof result === "string" ? result : ""));
  }

  async function createWalk() {
    if (building || draftPlaces.length < 2 || !draftTitle.trim()) return false;
    const stops = draftPlaces.map(place => ({
      id: place.osm_id, placeId: place.placeId ?? null, name: place.name, point: [Number(place.latitude), Number(place.longitude)],
      address: place.address || [place.tags?.["addr:housenumber"], place.tags?.["addr:street"]].filter(Boolean).join(" "),
      note: place.tags?.description || "A stop on your custom walk.",
    }));
    setBuilding(true);
    setRouteError("");
    try {
      // If Google can't build the walking route (offline, quota), still save: straight lines between stops.
      let route, routeNote = "";
      try {
        route = await buildWalkingRoute(stops);
      } catch {
        route = { path: stops.map(stop => stop.point), warnings: [] };
        routeNote = " Walking route unavailable right now, so the map shows straight lines.";
      }
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
      return routeNote || true;
    } catch {
      setRouteError("Couldn’t get a walking route for these stops. Try again, or swap a stop that’s far away.");
      return false;
    } finally {
      setBuilding(false);
    }
  }

  return <main className="app">
    <div className="map-panel">
      <MapView walk={mapWalk} walks={mapWalks} selected={selected} onSelect={selectStop} location={following ? location : null}
        onPlaceClick={openPlace} directions={directionsMap}
        following={following} locationStatus={locationStatus} />
    </div>

    {/* Phones: transparent space over the map; scrolling the page pulls the sheet up over it. */}
    <div className="sheet-spacer" aria-hidden="true"/>

    <section className="bottom-sheet" ref={sheet} aria-label={view === "edit" ? "Edit plan" : undefined}
      aria-labelledby={view === "detail" ? "walk-title" : view === "list" ? "more-walks" : view === "directions" ? "directions-title" : undefined}>
      <button type="button" className="sheet-handle" onClick={toggleSheet} aria-label="Expand or collapse the panel"><span/></button>
      {view === "directions" && dirTarget
        ? <DirectionsPanel target={dirTarget} mode={dirMode} onMode={changeDirMode} state={dirState}
            focus={dirFocus} onFocus={index => { setDirFocus(index); collapseSheet(); }}
            onBack={closeDirections} onRetry={() => loadDirections(dirTarget, dirMode, dirOrigin)}/>
        : view === "edit"
        ? <PlanEditor heading={forkOf?.heading ?? "New plan"} title={draftTitle} onTitle={setDraftTitle}
            places={draftPlaces} maxStops={maxStops} onMove={moveStop} onRemove={removeStop}
            removed={removed} onUndo={undoRemove} onCancel={cancelEditing} onSave={savePlan}
            building={building} error={routeError}
            savingOuting={savingOuting} saveFeedback={saveFeedback}/>
        : view === "detail" && walk
        ? <PlanDetail walk={walk} stats={stats} suggestData={suggestData} step={step} complete={complete} selected={selected}
            onDirections={openDirections}
            onBack={() => { changeRoute(null); setView("list"); collapseSheet(); }}
            onSelectStop={index => { selectStop(index); collapseSheet(); }}
            onAdvance={advance} onEndWalk={() => { setStep(null); setSelected(null); }} onFork={fork}
            routing={<>
                {planNotice && <p className="plan-notice" role="status"><Icon name="check" size={16}/>{planNotice}</p>}
                {!walk.legs?.length && googleMapsConfigured && <button type="button" className="catalog-button directions-button"
                  disabled={routeStatus === "loading"} onClick={requestDirections}>
                  {routeStatus === "loading" ? "Getting directions…" : "Show turn-by-turn directions"}
                </button>}
                {routeStatus && routeStatus !== "loading" && <p className="route-status" role="status">{routeStatus}</p>}
                {walk.warnings?.length > 0 && <p className="route-warning">{walk.warnings.join(" ")}</p>}

                <section className="to-start" aria-labelledby="to-start-title">
                  <div className="to-start-heading">
                    <h3 id="to-start-title">Get to start</h3>
                    <div className="travel-modes" role="group" aria-label="Travel mode to the start">
                      {["WALKING", "TRANSIT"].map(mode => <button key={mode} type="button"
                        aria-pressed={toStartMode === mode} onClick={() => setToStartMode(mode)}>{mode === "WALKING" ? "Walk" : "Transit"}</button>)}
                    </div>
                  </div>
                  <button className="catalog-button directions-start" type="button" disabled={!googleMapsConfigured}
                    onClick={() => openDirections({ name: walk.stops[0].name, point: walk.stops[0].point, placeId: walk.stops[0].placeId }, toStartMode)}>
                    <Icon name={toStartMode === "TRANSIT" ? "train" : "walk"} size={16}/>Directions to {walk.stops[0].name}
                  </button>
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

            </>}
            rankSlot={complete && !profile.ranking.includes(walk.id) && <RankPrompt newId={walk.id} ranking={profile.ranking}
              titleOf={id => allWalks.find(item => item.id === id)?.title ?? profile.completions.find(c => c.walkId === id)?.title ?? id}
              onDone={ranking => updateProfile({ ranking })}/>}/>
        : <RouteList walks={availableWalks} selectedId={selectedWalkId} status={walksStatus} onOpen={openWalk}
            filtered={anyActive(filters)} onClear={() => setFilters(emptyFilters)}
            filterBar={<RouteFilters filters={filters} onChange={setFilters} counts={counts}/>}/>}
    </section>
    {placeProfile && <PlaceProfile key={placeProfile.placeId} placeId={placeProfile.placeId} fallback={placeProfile.fallback}
      onClose={() => setPlaceProfile(null)} addLabel={addLabelFor(placeProfile.placeId)}
      onDirections={place => openDirections({ name: place.name, point: place.point, placeId: placeProfile.placeId })}
      onAdd={place => addPlace({
        osm_id: `google:${placeProfile.placeId}`, placeId: placeProfile.placeId, name: place.name,
        latitude: place.point?.[0], longitude: place.point?.[1], address: place.address ?? "",
        tags: { description: place.summary ?? "" },
      })}/>}
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
