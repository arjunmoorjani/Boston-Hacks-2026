"use client";

// Turn-by-turn banner over the map while you're doing a walk: the next turn, how far to it, what comes
// after, and arrows to step through by hand. With location on, it moves to the next step as you walk.

import { Icon } from "./icons";
import { distanceLabel, timeLabel } from "../lib/directions.mjs";
import { maneuverIcon } from "../lib/legs.mjs";

const VERB = { WALKING: "Walking", BICYCLING: "Biking", TRANSIT: "By T" };

export function NavBanner({ leg, mode, entry, steps, index, metersLeft, onIndex, onHide, onRetry }) {
  const status = entry?.status ?? "loading";
  const current = steps[index];
  const next = steps[index + 1];
  const howFar = metersLeft != null ? distanceLabel(metersLeft) : current?.meters ? `for ${distanceLabel(current.meters)}` : "";

  return <section className="nav-banner" aria-label={`Directions to ${leg.to.name}`}>
    <div className="nav-top">
      <span className="nav-arrow" aria-hidden="true">
        <Icon name={status === "ready" && current ? maneuverIcon(current) : mode === "TRANSIT" ? "train" : mode === "BICYCLING" ? "bike" : "walk"} size={32}/>
      </span>
      <div className="nav-text" aria-live="polite">
        {status === "ready" && current ? <>
          {howFar && current.kind !== "arrive" && <span className="nav-distance">{howFar}</span>}
          <strong>{current.instruction}</strong>
          {current.departAt && <small>Leaves {timeLabel(current.departAt)}</small>}
          {current.note && <small>{current.note}</small>}
        </> : status === "error" ? <>
          <strong>Couldn’t load directions</strong>
          <small>{entry.error}</small>
        </> : <>
          <span className="nav-distance">{VERB[mode] ?? "Walking"} to {leg.to.name}</span>
          <strong>Getting directions…</strong>
        </>}
      </div>
      <button type="button" className="nav-hide" aria-label="Hide directions" onClick={onHide}><Icon name="close" size={18}/></button>
    </div>

    {status === "ready" && steps.length > 0 && <div className="nav-bottom">
      <span className="nav-then">
        {next ? <>Then <Icon name={maneuverIcon(next)} size={15}/><span>{next.instruction}</span></> : <span>{VERB[mode] ?? "Walking"} to {leg.to.name}</span>}
      </span>
      <span className="nav-controls">
        <button type="button" aria-label="Previous step" disabled={index === 0} onClick={() => onIndex(index - 1)}><Icon name="arrowLeft" size={16}/></button>
        <span>{index + 1}/{steps.length}</span>
        <button type="button" aria-label="Next step" disabled={index >= steps.length - 1} onClick={() => onIndex(index + 1)}><Icon name="arrow" size={16}/></button>
      </span>
    </div>}
    {status === "error" && <div className="nav-bottom"><button type="button" className="nav-retry" onClick={onRetry}>Try again</button></div>}
  </section>;
}
