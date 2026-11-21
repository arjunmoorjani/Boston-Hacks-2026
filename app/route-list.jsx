"use client";

// "More walks" list inside the bottom sheet: T line and tag filters, one card per walk.

import { Icon } from "./icons";

export const LINES = [
  { id: "Red", color: "#DA291C" },
  { id: "Orange", color: "#ED8B00", darkText: true },
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

function summary(walk) {
  return [`${walk.stops.length} stops`, duration(walk.durationMin), costLabel(walk.cost)]
    .filter(Boolean).join(" · ");
}

export function RouteList({ walks, selectedId, onOpen, status, filterBar, filtered, onClear }) {
  return <section className="route-list" aria-labelledby="more-walks">
    <h2 id="more-walks" className="list-title">Explore Boston <span>{walks.length} {walks.length === 1 ? "walk" : "walks"}</span></h2>
    {status && <p className="routes-status" role="status">{status}</p>}
    {filterBar}

    <ul className="route-cards">
      {walks.map(walk => {
        const tLine = lineInfo(walk.tLines?.[0]);
        return <li key={walk.id}>
          <button type="button" className="route-card" aria-pressed={walk.id === selectedId} onClick={() => onOpen(walk.id)}>
            <span className="route-card-title">{walk.title}</span>
            <span className="route-card-meta">{summary(walk)} · {walk.area}</span>
            {walk.tStation && <span className="t-chip" style={{ background: tLine?.color ?? "#575b53", color: tLine?.darkText ? "#212320" : "#fff" }}>
              <Icon name="train" size={14}/>{walk.tStation}
            </span>}
          </button>
        </li>;
      })}
    </ul>
    {!walks.length && <p className="route-empty">{filtered ? "No walks match these filters." : "No walks yet."}
      {filtered && <button type="button" className="cancel" onClick={onClear}>Clear filters</button>}</p>}
  </section>;
}
