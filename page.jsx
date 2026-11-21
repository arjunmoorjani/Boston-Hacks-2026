"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { BostonMap } from "./boston-map";
import { GoogleBostonMap } from "./google-boston-map";
import { Icon } from "./icons";
import { RouteList } from "./route-list";
import { PlanDetail } from "./plan-detail";
import { PlanEditor } from "./plan-editor";
import { ProfilePage, RankPrompt, Avatar } from "./profile";
import { walks as fallbackWalks, walkStats } from "./walks";
import { buildWalkingRoute, googleMapsConfigured } from "../lib/google-maps.mjs";
import { watchUserLocation } from "../lib/location.mjs";
import { loadRoutes } from "../lib/routes.mjs";
import { buildSuggestData } from "../lib/suggest-data.mjs";
import { completionFor, emptyProfile, loadProfile, saveProfile } from "../lib/profile-store.mjs";

const MapView = googleMapsConfigured ? GoogleBostonMap : BostonMap;
const maxStops = 5;

export default function Home() {
  const [walks, setWalks] = useState(fallbackWalks);
  const [walksStatus, setWalksStatus] = useState("Loading premade walks…");
  const [routeIndex, setRouteIndex] = useState(0);
  const [selected, setSelected] = useState(null);
  const [following, setFollowing] = useState(false);
  const [location, setLocation] = useState(null);
  const [locationStatus, setLocationStatus] = useState("");
  const [step, setStep] = useState(null);
  const [complete, setComplete] = useState(false);
  const [profile, setProfile] = useState(emptyProfile); // name, finished plans, ranking, saved plans (this browser)
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [draftPlaces, setDraftPlaces] = useState([]);
  const [building, setBuilding] = useState(false);
  const [routeError, setRouteError] = useState("");
  const [view, setView] = useState("list"); // sheet shows: "list" of walks, one plan's "detail", or the plan "edit"or
  const [forkOf, setForkOf] = useState(null);    // { heading } for the editor
  const [draftTitle, setDraftTitle] = useState("");
  const [removed, setRemoved] = useState(null);   // last removed stop, for Undo
  const [editFrom, setEditFrom] = useState("list");
  const suggestData = useMemo(() => buildSuggestData(walks), [walks]);
  const availableWalks = [...walks, ...profile.customWalks];
  const walk = availableWalks[routeIndex];
  const stats = walkStats(walk);
  // While editing, the map shows the draft (straight lines between stops) so reordering is visible right away.
  const draftWalk = useMemo(() => {
    if (view !== "edit" || !draftPlaces.length) return null;
    const stops = draftPlaces.map(place => ({ id: place.osm_id, name: place.name, address: place.address, point: [Number(place.latitude), Number(place.longitude)] }));
    return { id: `draft:${stops.map(stop => stop.id).join("|")}`, title: draftTitle, area: "Draft plan", category: "Draft", symbol: "route", stops, path: stops.map(stop => stop.point) };
  }, [view, draftPlaces, draftTitle]);
  const mapWalk = draftWalk ?? walk;
  const stop = selected === null ? null : walk.stops[selected];
  const destination = walk.stops[step ?? selected ?? 0];
  const directions = `https://www.google.com/maps/dir/?api=1&destination=${destination.point.join(",")}&travelmode=walking`;
  const transitDirections = `https://www.google.com/maps/dir/?api=1&destination=${walk.stops[0].point.join(",")}&travelmode=transit`;

  useEffect(() => {
    const controller = new AbortController();
    loadRoutes({ signal: controller.signal }).then(routes => {
      if (controller.signal.aborted) return;
      setWalks(routes);
      setRouteIndex(0);
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

  function changeRoute(index) {
    setRouteIndex(index);
    setSelected(null);
    setStep(null);
    setComplete(false);
    setFollowing(false);
    setLocationStatus("");
  }

  function openWalk(id) {
    const index = availableWalks.findIndex(item => item.id === id);
    if (index < 0) return false;
    changeRoute(index);
    setView("detail");
    setShowProfile(false);
    collapseSheet();
    return true;
  }

  function deleteCustomWalk(id) {
    const index = availableWalks.findIndex(item => item.id === id);
    updateProfile(old => ({ customWalks: old.customWalks.filter(item => item.id !== id), ranking: old.ranking.filter(item => item !== id) }));
    if (index >= 0 && index <= routeIndex) { changeRoute(0); setView("list"); }
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
    if (building) return;
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
      osm_id: stop.placeId ? `google:${stop.placeId}` : stop.id ?? stop.name, // same id as tapping that place on the map
      name: stop.name, latitude: stop.point?.[0] ?? stop.lat, longitude: stop.point?.[1] ?? stop.lng,
      address: stop.address ?? "", tags: { description: stop.note ?? "" },
    });
    const details = new Map(suggestData.places.map(place => [place.placeId, place]));
    if (extra.length) {
      const last = walk.stops.at(-1);
      startEditing([last, ...extra.map(stop => ({ ...details.get(stop.placeId), ...stop }))].map(asPlace), `After ${walk.title}`, `Continue from ${last.name}`);
    } else {
      startEditing(walk.stops.map(asPlace), `${walk.title}, your version`, `Forking ${walk.title}`);
    }
  }

  async function createWalk() {
    if (building || draftPlaces.length < 2 || !draftTitle.trim()) return;
    const stops = draftPlaces.map(place => ({
      id: place.osm_id, name: place.name, point: [Number(place.latitude), Number(place.longitude)],
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
      changeRoute(walks.length + profile.customWalks.length);
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
      <MapView walk={mapWalk} selected={selected} onSelect={setSelected} location={following ? location : null}
        draftPlaces={draftPlaces} onAddPlace={addPlace} canAddPlace={!building && draftPlaces.length < maxStops}
        following={following} locationStatus={locationStatus}
        locate={() => {
          if (following) {
            setLocationStatus("");
            setLocation(null);
          }
          setFollowing(!following);
        }} />
    </div>

    <header className="topbar">
      <div className="brand"><span><Icon name="route" size={20}/></span>sidewalk<span className="brand-period">.</span></div>
      <div className="topbar-right">
        <div className="city"><span/> BOSTON, MA</div>
        <button type="button" className="avatar-button" onClick={() => setShowProfile(true)} aria-label="Your profile">
          <Avatar name={profile.name} size={34}/>
        </button>
      </div>
    </header>

    {/* Phones: transparent space over the map; scrolling the page pulls the sheet up over it. */}
    <div className="sheet-spacer" aria-hidden="true"/>

    <section className="bottom-sheet" ref={sheet} aria-label={view === "edit" ? "Edit plan" : undefined}
      aria-labelledby={view === "detail" ? "walk-title" : view === "list" ? "more-walks" : undefined}>
      <button type="button" className="sheet-handle" onClick={toggleSheet} aria-label="Expand or collapse the panel"><span/></button>
      {view === "edit"
        ? <PlanEditor heading={forkOf?.heading ?? "New plan"} title={draftTitle} onTitle={setDraftTitle}
            places={draftPlaces} maxStops={maxStops} onMove={moveStop} onRemove={removeStop}
            removed={removed} onUndo={undoRemove} onCancel={cancelEditing} onSave={createWalk}
            building={building} error={routeError}/>
        : view === "detail"
        ? <PlanDetail walk={walk} stats={stats} suggestData={suggestData} step={step} complete={complete} selected={selected}
            directions={directions} transitDirections={transitDirections}
            onBack={() => { setView("list"); setStep(null); setSelected(null); collapseSheet(); }}
            onSelectStop={index => { setSelected(index); collapseSheet(); }}
            onAdvance={advance} onEndWalk={() => { setStep(null); setSelected(null); }} onFork={fork}
            rankSlot={complete && !profile.ranking.includes(walk.id) && <RankPrompt newId={walk.id} ranking={profile.ranking}
              titleOf={id => availableWalks.find(item => item.id === id)?.title ?? profile.completions.find(c => c.walkId === id)?.title ?? id}
              onDone={ranking => updateProfile({ ranking })}/>}/>
        : <RouteList walks={availableWalks} index={routeIndex} status={walksStatus}
            onChange={index => { changeRoute(index); setView("detail"); collapseSheet(); }}/>}
    </section>
    {showProfile && <ProfilePage profile={profile} walks={availableWalks} onClose={() => setShowProfile(false)}
      onRename={name => updateProfile({ name })} onRank={ranking => updateProfile({ ranking })}
      onOpenWalk={openWalk} onDeleteWalk={deleteCustomWalk} onSample={data => updateProfile(data)}
      onReset={() => updateProfile({ completions: [], ranking: [] })}/>}
  </main>;
}
