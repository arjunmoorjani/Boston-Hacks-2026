"use client";

// "More walks" list inside the bottom sheet: T line and tag filters, one card per walk.

import { useMemo, useState } from "react";
import { Icon } from "./icons";

export const LINES = [
  { id: "Red", color: "#DA291C" },
  { id: "Orange", color: "#ED8B00", darkText: true },
  { id: "Green", color: "#00843D" },
  { id: "Blue", color: "#003DA5" },
  { id: "Silver", color: "#7C878E" },
];
const TAGS = ["Rainy day", "Free", "Under $40", "Evening", "With friends", "Date"];

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

export function RouteList({ walks, index, onChange, status, filters }) {
  const [line, setLine] = useState(null);
  const [tag, setTag] = useState(null);

  const shown = useMemo(() => walks
    .map((walk, i) => ({ walk, i }))
    .filter(({ walk }) => (!line || walk.tLines?.some(id => lineFamily(id) === line)) && (!tag || walk.tags?.includes(tag))),
  [walks, line, tag]);

  return <section className="route-list" aria-labelledby="more-walks">
    <h2 id="more-walks" className="list-title">Explore Boston <span>{shown.length} walks</span></h2>
    {status && <p className="routes-status" role="status">{status}</p>}
    {filters}
    <div className="chip-row" role="group" aria-label="Filter by T line">
      <button type="button" className="chip" aria-pressed={!line} onClick={() => setLine(null)}>All lines</button>
      {LINES.map(item => <button key={item.id} type="button" className="chip" aria-pressed={line === item.id}
        onClick={() => setLine(line === item.id ? null : item.id)}>
        <span className="line-dot" style={{ background: item.color }}/>{item.id}
      </button>)}
    </div>
    <div className="chip-row" role="group" aria-label="Filter by tag">
      {TAGS.map(item => <button key={item} type="button" className="chip chip-tag" aria-pressed={tag === item}
        onClick={() => setTag(tag === item ? null : item)}>{item}</button>)}
    </div>

    <ul className="route-cards">
      {shown.map(({ walk, i }) => {
        const tLine = lineInfo(walk.tLines?.[0]);
        return <li key={walk.id}>
          <button type="button" className="route-card" aria-pressed={i === index} onClick={() => onChange(i)}>
            <span className="route-card-title">{walk.title}</span>
            <span className="route-card-meta">{summary(walk)} · {walk.area}</span>
            {walk.tStation && <span className="t-chip" style={{ background: tLine?.color ?? "#575b53", color: tLine?.darkText ? "#212320" : "#fff" }}>
              <Icon name="train" size={14}/>{walk.tStation}
            </span>}
          </button>
        </li>;
      })}
    </ul>
    {!shown.length && <p className="route-empty">No walks match these filters.
      <button type="button" className="cancel" onClick={() => { setLine(null); setTag(null); }}>Clear filters</button></p>}
  </section>;
}
