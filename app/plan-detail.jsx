"use client";

// Plan detail inside the bottom sheet: header, getting there by T, the stops, "Keep going"
// suggestions from the last stop, and a sticky Modify / Do this plan bar.

import { Fragment, useMemo, useState } from "react";
import { Icon } from "./icons";
import { distanceLabel, minutesLabel } from "../lib/directions.mjs";
import { LEG_MODES, LONG_WALK_M, navSteps } from "../lib/legs.mjs";
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

const MODE = { WALKING: ["Walk", "walk"], BICYCLING: ["Bike", "bike"], TRANSIT: ["T", "train"] };

// Between two stops: how long it takes, how you're going (walk, bike or T), and its steps on request.
function LegRow({ leg, current, onMode, onSteps }) {
  const [open, setOpen] = useState(false);
  const { mode, entry, minutes } = leg;
  const result = entry?.status === "ready" ? entry.result : null;
  const ride = result?.segments.find(segment => segment.kind === "transit");
  const long = mode === "WALKING" && leg.straightMeters > LONG_WALK_M;
  const summary = entry?.status === "loading" ? "Getting route…"
    : entry?.status === "error" ? entry.error
    : [minutes != null ? minutesLabel(minutes) : null, result ? distanceLabel(result.meters) : null].filter(Boolean).join(" · ");
  return <li className={`plan-leg ${current ? "current" : ""}`}>
    <span className="plan-leg-rail" aria-hidden="true"><Icon name={MODE[mode][1]} size={14}/></span>
    <div className="plan-leg-body">
      <div className="plan-leg-head">
        <span className="plan-leg-time">
          {ride && <span className="dir-line-chip" style={{ background: ride.line.color, color: ride.line.textColor }}>{ride.line.short ?? ride.line.name}</span>}
          {summary}
        </span>
        <button type="button" className="dir-steps-toggle" aria-expanded={open} onClick={() => { if (!open) onSteps(); setOpen(value => !value); }}>
          {open ? "Hide" : "Steps"}<Icon name={open ? "chevronUp" : "chevronDown"} size={14}/>
        </button>
        <span className="leg-modes" role="group" aria-label={`Getting from ${leg.from.name} to ${leg.to.name}`}>
          {LEG_MODES.map(value => <button key={value} type="button" aria-pressed={mode === value} title={MODE[value][0]}
            aria-label={MODE[value][0]} onClick={() => onMode(value)}><Icon name={MODE[value][1]} size={15}/></button>)}
        </span>
      </div>
      {long && <p className="plan-leg-hint">Long walk. The T or a bike may be quicker.</p>}
      {mode === "TRANSIT" && result && !ride && <p className="plan-leg-hint">No T ride helps here, so this is walking the whole way.</p>}
      {open && result && <ol className="dir-steps">{navSteps(result, leg.to.name).slice(0, -1).map((step, i) => <li key={i}>
        <span>{step.instruction}{step.note && <small>{step.note}</small>}</span>
        {step.meters > 0 && <em>{distanceLabel(step.meters)}</em>}
      </li>)}</ol>}
    </div>
  </li>;
}

const stopTarget = stop => ({ name: stop.name, point: stop.point, placeId: stop.placeId ?? null });

export function PlanDetail({ walk, stats, suggestData, step, complete, selected, onDirections,
  onBack, onSelectStop, onAdvance, onEndWalk, onFork, rankSlot, routing, legs = [], travel, onLegMode, onLegSteps, navHidden, onShowNav }) {
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
      {step === 0
        ? <button type="button" className="inline-link" onClick={() => onDirections(stopTarget(walk.stops[step]))}><Icon name="walk" size={14}/>Directions from where you are</button>
        : navHidden && <button type="button" className="inline-link" onClick={onShowNav}><Icon name="straight" size={14}/>Show turn-by-turn</button>}
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
      <button type="button" className="t-card-link inline-link" onClick={() => onDirections(stopTarget(walk.stops[0]), "TRANSIT")}><Icon name="train" size={14}/>Directions by T to the start</button>
    </section>}

    {legs.length > 0 && travel && <p className="plan-travel">
      <Icon name="route" size={15}/>{travel.known ? `About ${minutesLabel(travel.minutes)} getting between stops` : "Working out travel time…"}
      <span>Pick walk, bike or T for each leg.</span>
    </p>}
    <ol className="plan-stops">
      {walk.stops.map((stop, index) => {
        const price = PRICE[stop.priceLevel];
        const leg = index > 0 ? legs[index - 1] : null;
        return <Fragment key={stop.id ?? stop.name}>
        {leg && <LegRow leg={leg} current={walking && step === index} onMode={mode => onLegMode(leg.index, mode)} onSteps={() => onLegSteps(leg.index)}/>}
        <li className="plan-stop">
          <button type="button" onClick={() => onSelectStop(index)} aria-pressed={selected === index}>
            <span className={`stop-badge ${walking && index < step ? "done" : ""}`}>{walking && index < step ? <Icon name="check" size={14}/> : index + 1}</span>
            <span>
              <strong>{stop.name}</strong>
              <small>{[stop.note, price].filter(Boolean).join(" · ")}</small>
            </span>
          </button>
        </li>
        </Fragment>;
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
        : <button type="button" className="plan-secondary" onClick={() => onFork([])}>Modify</button>}
      <button type="button" className="plan-primary" onClick={onAdvance}>
        {!walking ? complete ? "Do it again" : "Do this plan" : step === walk.stops.length - 1 ? "Finish plan" : "Next stop"}
      </button>
    </div>
  </div>;
}
