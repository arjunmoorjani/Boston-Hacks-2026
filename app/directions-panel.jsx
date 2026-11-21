"use client";

// In-app directions in the bottom sheet: from your location to a stop or place, walking or by T.
// Summary (time, distance, arrival, fare), then a timeline of walk and ride segments. Tapping a
// segment zooms the map to it.

import { useState } from "react";
import { Icon } from "./icons";
import { distanceLabel, minutesLabel, timeLabel } from "../lib/directions.mjs";

function WalkSegment({ segment, last, target, focused, onFocus }) {
  const [open, setOpen] = useState(false);
  const to = segment.toStop ?? (last ? target : null);
  return <li className={`dir-seg walk ${focused ? "focused" : ""}`}>
    <span className="dir-rail" aria-hidden="true"><Icon name="walk" size={16}/></span>
    <div className="dir-seg-body">
      <button type="button" className="dir-seg-head" onClick={onFocus}>
        <strong>Walk {minutesLabel(segment.minutes)}</strong>
        <span>{distanceLabel(segment.meters)}{to ? ` to ${to}` : ""}</span>
      </button>
      {segment.steps.length > 0 && <button type="button" className="dir-steps-toggle" aria-expanded={open} onClick={() => setOpen(value => !value)}>
        {open ? "Hide steps" : `${segment.steps.length} ${segment.steps.length === 1 ? "step" : "steps"}`}<Icon name={open ? "chevronUp" : "chevronDown"} size={14}/>
      </button>}
      {open && <ol className="dir-steps">{segment.steps.map((step, i) => <li key={i}>
        <span>{step.instruction}{step.note && <small>{step.note}</small>}</span>
        {step.meters > 0 && <em>{distanceLabel(step.meters)}</em>}
      </li>)}</ol>}
    </div>
  </li>;
}

function TransitSegment({ segment, focused, onFocus }) {
  const { line } = segment;
  return <li className={`dir-seg transit ${focused ? "focused" : ""}`} style={{ "--line": line.color }}>
    <span className="dir-rail" aria-hidden="true"><Icon name="train" size={16}/></span>
    <div className="dir-seg-body">
      <button type="button" className="dir-seg-head" onClick={onFocus}>
        <span className="dir-line-chip" style={{ background: line.color, color: line.textColor }}>{line.short ?? line.name}</span>
        <strong>{line.name}{segment.headsign ? ` toward ${segment.headsign}` : ""}</strong>
      </button>
      <p className="dir-ride">
        {segment.departAt && <span>Leaves <b>{timeLabel(segment.departAt)}</b> from {segment.from}</span>}
        {!segment.departAt && segment.from && <span>From {segment.from}</span>}
        <span>{segment.stops != null ? `${segment.stops} ${segment.stops === 1 ? "stop" : "stops"} · ` : ""}{minutesLabel(segment.minutes)} · get off at <b>{segment.to}</b></span>
      </p>
    </div>
  </li>;
}

export function DirectionsPanel({ target, mode, onMode, state, focus, onFocus, onBack, onRetry }) {
  const { status, result, error } = state;
  const googleMaps = `https://www.google.com/maps/dir/?api=1&destination=${target.point.join(",")}${target.placeId ? `&destination_place_id=${target.placeId}` : ""}&travelmode=${mode === "TRANSIT" ? "transit" : "walking"}`;

  return <div className="directions-panel">
    <button type="button" className="back-link" onClick={onBack}><Icon name="arrowLeft" size={18}/>Back</button>
    <div className="plan-label">Directions</div>
    <h2 id="directions-title">To {target.name}</h2>
    <p className="dir-from"><span className="dir-dot" aria-hidden="true"/>From your location</p>

    <div className="travel-modes dir-modes" role="group" aria-label="Travel mode">
      {[["WALKING", "Walk", "walk"], ["TRANSIT", "Transit", "train"]].map(([value, label, icon]) => <button key={value} type="button"
        aria-pressed={mode === value} onClick={() => onMode(value)}><Icon name={icon} size={16}/>{label}</button>)}
    </div>

    {status === "locating" && <p className="dir-status" role="status"><span className="spinner" aria-hidden="true"/>Finding your location…</p>}
    {status === "loading" && <p className="dir-status" role="status"><span className="spinner" aria-hidden="true"/>Getting {mode === "TRANSIT" ? "transit" : "walking"} directions…</p>}
    {status === "error" && <div className="dir-error" role="alert">
      <p>{error}</p>
      <button type="button" className="catalog-button" onClick={onRetry}>Try again</button>
    </div>}

    {status === "ready" && result && <>
      <div className="dir-summary">
        <strong>{minutesLabel(result.minutes)}</strong>
        <span>{distanceLabel(result.meters)} · arrive {timeLabel(result.arriveAt)}{result.fare ? ` · ${result.fare}` : ""}</span>
        {focus != null && <button type="button" className="dir-show-all" onClick={() => onFocus(null)}>Show whole route</button>}
      </div>
      {result.warnings.length > 0 && <p className="route-warning">{result.warnings.join(" ")}</p>}
      <ol className="dir-timeline">
        {result.segments.map((segment, i) => segment.kind === "transit"
          ? <TransitSegment key={i} segment={segment} focused={focus === i} onFocus={() => onFocus(i)}/>
          : <WalkSegment key={i} segment={segment} last={i === result.segments.length - 1} target={target.name} focused={focus === i} onFocus={() => onFocus(i)}/>)}
        <li className="dir-seg end"><span className="dir-rail" aria-hidden="true"><Icon name="check" size={16}/></span>
          <div className="dir-seg-body"><strong>{target.name}</strong></div></li>
      </ol>
    </>}

    <p className="dir-voice"><a href={googleMaps} target="_blank" rel="noreferrer">Want voice navigation? Open in Google Maps <Icon name="external" size={13}/></a></p>
  </div>;
}
