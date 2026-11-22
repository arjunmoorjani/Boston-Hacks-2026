"use client";

// "More walks" list inside the bottom sheet: T line and tag filters, one card per walk.

import { Icon } from "./icons";
import { useEffect, useRef, useState } from "react";
import { fetchPlacePhoto } from "../lib/place-profile.mjs";
import { sketchRoute } from "../lib/route-sketch.mjs";

export const LINES = [
  { id: "Red", color: "#DA291C" },
  { id: "Orange", color: "#ED8B00" }, // white text, like the other lines
  { id: "Green", color: "#00843D" },
  { id: "Blue", color: "#003DA5" },
  { id: "Silver", color: "#7C878E" },
];

// "Green-E" -> "Green"
export const lineFamily = id => id?.split("-")[0];
const lineInfo = id => LINES.find(line => line.id === lineFamily(id));

export function duration(min) {
  if (!Number.isFinite(min)) return null;
  if (min < 60) return `about ${min} min`;
  const hrs = Math.round((min / 60) * 2) / 2;
  return `about ${hrs} ${hrs === 1 ? "hr" : "hrs"}`;
}

export const costLabel = cost => (cost === "free" ? "Free" : cost) || null;

export function summary(walk) {
  return [`${walk.stops.length} stops`, duration(walk.durationMin), costLabel(walk.cost)]
    .filter(Boolean).join(" · ");
}

// Places whose name matches the search: our walks' stops first, then Google's. Tapping one opens its place card.
function PlaceResults({ places, loading, onPick }) {
  if (!places.length && !loading) return null;
  return <section className="place-results" aria-labelledby="place-results-title">
    <h3 id="place-results-title">Places{loading && <span className="spinner" aria-label="Searching places"/>}</h3>
    <ul>
      {places.map(place => <li key={place.placeId}>
        <button type="button" onClick={() => onPick(place)}>
          <span className="place-result-icon" aria-hidden="true"><Icon name={place.source === "walks" ? "route" : "search"} size={15}/></span>
          <span className="place-result-text">
            <strong>{place.name}</strong>
            <small>{place.source === "walks" ? `On ${place.onWalks} ${place.onWalks === 1 ? "walk" : "walks"}${place.detail ? ` · ${place.detail}` : ""}` : place.detail}</small>
          </span>
        </button>
      </li>)}
    </ul>
  </section>;
}

// "All walks | Favorites" switch above the list (the map shows the same set).
function ListTabs({ tab, onTab, favoriteCount }) {
  return <div className="list-tabs" role="tablist" aria-label="Which walks">
    <button type="button" role="tab" aria-selected={tab === "all"} onClick={() => onTab("all")}>All walks</button>
    <button type="button" role="tab" aria-selected={tab === "favorites"} onClick={() => onTab("favorites")}>
      Favorites{favoriteCount > 0 && <span className="list-tab-count">{favoriteCount}</span>}
    </button>
  </div>;
}

export function RouteList({ walks, selectedId, onOpen, status, filterBar, filtered, onClear, places = [], placesLoading = false, onPickPlace,
  tab = "all", onTab, favoriteIds = new Set() }) {
  return <section className="route-list" aria-labelledby="more-walks">
    <h2 id="more-walks" className="list-title">Explore Boston <span>{walks.length} {walks.length === 1 ? "walk" : "walks"}</span></h2>
    {onTab && <ListTabs tab={tab} onTab={onTab} favoriteCount={favoriteIds.size}/>}
    {status && <p className="routes-status" role="status">{status}</p>}
    {filterBar}
    <PlaceResults places={places} loading={placesLoading} onPick={onPickPlace}/>

    <ul className="route-cards">
      {walks.map(walk => {
        const tLine = lineInfo(walk.tLines?.[0]);
        return <li key={walk.id}>
          <button type="button" className="route-card" aria-pressed={walk.id === selectedId} onClick={() => onOpen(walk.id)}>
            <CardPhoto walk={walk} favorite={favoriteIds.has(walk.id)}/>
            <span className="route-card-body">
            <span className="route-card-title">{walk.title}
              {favoriteIds.has(walk.id) && <svg className="route-card-heart" width="15" height="15" viewBox="0 0 24 24" aria-label="Favorite">
                <path d="M12 20.5s-7.5-4.6-7.5-10.6A4.4 4.4 0 0 1 12 7.1a4.4 4.4 0 0 1 7.5 2.8c0 6-7.5 10.6-7.5 10.6z" fill="currentColor"/></svg>}
            </span>
            <span className="route-card-meta">{summary(walk)} · {walk.area}
              {walk.completedUsers > 0 && ` · ${walk.completedUsers} ${walk.completedUsers === 1 ? "person" : "people"} completed`}
            </span>
            {walk.tStation && <span className="t-chip" style={{ background: tLine?.color ?? "#575b53", color: tLine?.darkText ? "#212320" : "#fff" }}>
              <Icon name="train" size={14}/>{walk.tStation}
            </span>}
            </span>
          </button>
        </li>;
      })}
    </ul>
    {!walks.length && tab === "favorites" && !filtered && <p className="route-empty">No favorites yet. Open a walk and tap the heart to save it here.</p>}
    {!walks.length && !(tab === "favorites" && !filtered) && <p className="route-empty">{filtered ? "No walks match these filters." : "No walks yet."}
      {filtered && <button type="button" className="cancel" onClick={onClear}>Clear filters</button>}</p>}
  </section>;
}

// The walk's shape on a small square (a drawing, not a map: 40 cards would mean 40 Google maps).
function RouteSketch({ walk, favorite }) {
  const sketch = sketchRoute(walk.path, walk.stops ?? []);
  return <svg className={`route-sketch${favorite ? " is-favorite" : ""}`} viewBox="0 0 72 72" aria-hidden="true">
    {sketch && <>
      <path d={sketch.d} className="route-sketch-casing"/>
      <path d={sketch.d} className="route-sketch-line"/>
      {sketch.stops.map(([x, y], i) => <circle key={i} cx={x} cy={y} r="3.6" className="route-sketch-stop"/>)}
    </>}
  </svg>;
}

// Premade walks use a Google photo from one of their stops. Logged excursions use only a photo the user uploaded.
// Until it loads, or when there is no permitted photo, the card shows the route drawing instead.
function CardPhoto({ walk, favorite }) {
  const box = useRef(null);
  const [photo, setPhoto] = useState(null);
  const userExcursion = walk.category === "Logged excursion" || String(walk.id).startsWith("logged:");
  const placeIds = (walk.stops ?? []).map(stop => stop.placeId).filter(Boolean);
  const photoPaths = walk.photoPaths ?? [];
  const key = userExcursion ? `uploaded:${walk.activityId ?? ""}:${photoPaths.join(",")}` : placeIds.join(",");

  useEffect(() => {
    setPhoto(null);
    if ((!userExcursion && !placeIds.length) || (userExcursion && !photoPaths.length && !walk.activityId) || !box.current) return;
    let active = true;
    const observer = new IntersectionObserver(async entries => {
      if (!entries.some(entry => entry.isIntersecting)) return;
      observer.disconnect();
      if (userExcursion) {
        try {
          const { supabase } = await import("../lib/supabase.mjs");
          let paths = photoPaths;
          if (!paths.length && walk.activityId) {
            const { data, error } = await supabase.from("activity_photos").select("storage_path")
              .eq("activity_id", walk.activityId).limit(1);
            if (error) throw error;
            paths = (data ?? []).map(item => item.storage_path).filter(Boolean);
          }
          if (!paths.length) return;
          const { data, error } = await supabase.storage.from("activity-photos").createSignedUrl(paths[0], 60 * 60);
          if (error) throw error;
          if (active && data?.signedUrl) setPhoto({ src: data.signedUrl });
        } catch {}
        return;
      }
      for (const placeId of placeIds.slice(0, 3)) { // first stop with a photo (most have one)
        try {
          const found = await fetchPlacePhoto(placeId);
          if (found) { if (active) setPhoto(found); return; }
        } catch { return; }
      }
    }, { rootMargin: "200px" });
    observer.observe(box.current);
    return () => { active = false; observer.disconnect(); };
  }, [key, userExcursion]);

  return <span className="route-card-media" ref={box}>
    {photo ? <>
      {/* no referrerPolicy: Google checks the referrer against the key's website restrictions */}
      <img className="route-card-photo" src={photo.src} alt="" loading="lazy" onError={() => setPhoto(null)}/>
      {photo.author && <span className="route-card-credit">{photo.author.name}</span>}
    </> : <RouteSketch walk={walk} favorite={favorite}/>}
  </span>;
}
