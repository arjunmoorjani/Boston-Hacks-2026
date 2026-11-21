"use client";

// Plan detail inside the bottom sheet: header, getting there by T, the stops, "Keep going"
// suggestions from the last stop, and a sticky Fork / Do this plan bar.

import { useMemo } from "react";
import { Icon } from "./icons";
import { LINES, lineFamily, duration, costLabel } from "./route-list";
import { suggestRoutes } from "../lib/suggest.mjs";

const PRICE = {
  PRICE_LEVEL_FREE: "free", PRICE_LEVEL_INEXPENSIVE: "$", PRICE_LEVEL_MODERATE: "$$",
  PRICE_LEVEL_EXPENSIVE: "$$$", PRICE_LEVEL_VERY_EXPENSIVE: "$$$$",
};

// One short reason for a suggested route: "3 people went here next", else "Open now", else the first reason.
function reasonFor(route) {
  const reasons = route.stops[0]?.reasons ?? [];
  return reasons.find(reason => reason.includes("people")) ?? reasons.find(reason => reason === "Open now")
    ?? reasons.find(reason => !reason.endsWith("min walk")) ?? "Nearby";
}

export function PlanDetail({ walk, stats, suggestData, step, complete, selected, directions, transitDirections,
  onBack, onSelectStop, onAdvance, onEndWalk, onFork, rankSlot, routing }) {
  const lines = [...new Set((walk.tLines ?? []).map(lineFamily))].map(id => LINES.find(line => line.id === id)).filter(Boolean);
  const theme = walk.tags?.find(tag => !["Free", "Under $40"].includes(tag)) ?? walk.category; // cost is already in the meta line
  const label = [theme, walk.area].filter(Boolean).join(" · ");
  const meta = [`${walk.stops.length} stops`, duration(walk.durationMin), costLabel(walk.cost), `${stats.miles} mi walk`].filter(Boolean).join(" · ");

  // "Keep going": 2-stop extensions from the last stop, scored by lib/suggest (same logic as the main app):
  // where people go next, distance, popularity, what fits (bakery after a museum, bars at night), open when you'd arrive.
  const last = walk.stops.at(-1);
  const keepGoing = useMemo(() => {
    if (!suggestData?.places?.length || !last) return [];
    return suggestRoutes({
      lat: last.point[0], lng: last.point[1], afterPlaceId: last.placeId ?? null,
      exclude: walk.stops.map(stop => stop.placeId).filter(Boolean), maxWalkMin: 15,
    }, suggestData.places, suggestData.transitions, { length: 2, routes: 3 });
  }, [walk, last, suggestData]);

  const walking = step !== null;

  return <div className="plan-detail">
    <button type="button" className="back-link" onClick={onBack}><Icon name="arrowLeft" size={18}/>All walks</button>
    <div className="plan-label">{label}</div>
    <h2 id="walk-title">{walk.title}</h2>
    <p className="plan-meta">{meta}</p>

    {walking && <div className="walk-progress" role="status">
      <span>Stop {step + 1} of {walk.stops.length}</span>
      <strong>{walk.stops[step].name}</strong>
      <a href={directions} target="_blank" rel="noreferrer">Directions <Icon name="external" size={14}/></a>
    </div>}
    {complete && <p className="completed" role="status"><Icon name="check" size={17}/> Walk completed</p>}
    {rankSlot}
    {routing}

    {walk.tStation && <section className="t-card" aria-label="Getting there by T">
      <div className="t-card-head">
        <span className="t-card-lines">{lines.map(line => <span key={line.id} className="line-dot" style={{ background: line.color }}/>)}</span>
        <strong>{lines.length ? `${lines.map(line => line.id).join(" / ")} Line at ${walk.tStation}` : walk.tStation}</strong>
      </div>
      <p>Nearest T stop to the start. Live train times aren’t connected in this prototype.</p>
      <a href={transitDirections} target="_blank" rel="noreferrer" className="t-card-link">Transit directions to the start <Icon name="external" size={14}/></a>
    </section>}

    <ol className="plan-stops">
      {walk.stops.map((stop, index) => {
        const price = PRICE[stop.priceLevel];
        return <li key={stop.id ?? stop.name}>
          <button type="button" onClick={() => onSelectStop(index)} aria-pressed={selected === index}>
            <span className={`stop-badge ${walking && index < step ? "done" : ""}`}>{walking && index < step ? <Icon name="check" size={14}/> : index + 1}</span>
            <span>
              <strong>{stop.name}</strong>
              <small>{[stop.note, price].filter(Boolean).join(" · ")}</small>
            </span>
          </button>
        </li>;
      })}
    </ol>

    {keepGoing.length > 0 && <section className="keep-going" aria-labelledby="keep-going-title">
      <h3 id="keep-going-title">Keep going after {last.name}</h3>
      <p>Not done yet? Two more stops nearby, picked from where people go next and what’s open. Tap one to plan it.</p>
      <ul>
        {keepGoing.map(route => <li key={route.stops.map(stop => stop.placeId).join()}>
          <button type="button" onClick={() => onFork(route.stops)}>
            <span className="keep-going-path">{route.stops.map((stop, index) => <span key={stop.placeId}>
              {index > 0 && <Icon name="arrow" size={13}/>}{stop.name}
            </span>)}</span>
            <small>+{route.walkMin} min walk · {reasonFor(route)}</small>
          </button>
        </li>)}
      </ul>
    </section>}

    <div className="plan-bar">
      {walking
        ? <button type="button" className="plan-secondary" onClick={onEndWalk}>End</button>
        : <button type="button" className="plan-secondary" onClick={() => onFork([])}>Fork</button>}
      <button type="button" className="plan-primary" onClick={onAdvance}>
        {!walking ? complete ? "Do it again" : "Do this plan" : step === walk.stops.length - 1 ? "Finish plan" : "Next stop"}
      </button>
    </div>
  </div>;
}
