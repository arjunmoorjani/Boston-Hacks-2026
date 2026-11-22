"use client";

// Plan detail inside the bottom sheet: header, getting there by T, the stops, "Keep going"
// suggestions from the last stop, and a sticky Modify / Do this plan bar.

import { Fragment, useEffect, useMemo, useState } from "react";
import { Icon } from "./icons";
import { HeartButton } from "./heart-button";
import { distanceLabel, minutesLabel } from "../lib/directions.mjs";
import { LEG_MODES, LONG_WALK_M, bikeNotQuicker, navSteps } from "../lib/legs.mjs";
import { LINES, lineFamily, duration, costLabel } from "./route-list";
import { suggestRoutes } from "../lib/suggest.mjs";
import { ActivityPhotos, RouteThumb } from "./profile";
import { fetchPlacePhoto } from "../lib/place-profile.mjs";

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
      {mode === "BICYCLING" && bikeNotQuicker(leg, entry) && <p className="plan-leg-hint">
        Walking is quicker here (about {minutesLabel(leg.estimateMin)}): bikes have to go around one-way streets and walk-only paths.</p>}
      {open && result && <ol className="dir-steps">{navSteps(result, leg.to.name).slice(0, -1).map((step, i) => <li key={i}>
        <span>{step.instruction}{step.note && <small>{step.note}</small>}</span>
        {step.meters > 0 && <em>{distanceLabel(step.meters)}</em>}
      </li>)}</ol>}
    </div>
  </li>;
}

const stopTarget = stop => ({ name: stop.name, point: stop.point, placeId: stop.placeId ?? null });

function DeleteActivity({ label, onDelete }) {
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  const subject = label === "Delete excursion" ? "excursion" : "activity";

  async function remove() {
    if (deleting) return;
    setDeleting(true);
    setError("");
    try {
      await onDelete();
    } catch {
      setError(`Couldn’t delete this ${subject}. Try again.`);
      setDeleting(false);
    }
  }

  return <div className="plan-delete-control">
    {confirming
      ? <div className="activity-delete-confirm" role="alertdialog" aria-labelledby="delete-confirm-title">
          <p id="delete-confirm-title">Delete this {subject}?<span>This can’t be undone.</span></p>
          <div>
            <button type="button" className="activity-delete-cancel" disabled={deleting}
              onClick={() => { setConfirming(false); setError(""); }}>Cancel</button>
            <button type="button" className="activity-delete-button" disabled={deleting} onClick={remove}>
              {deleting ? "Deleting…" : "Delete"}
            </button>
          </div>
        </div>
      : <button type="button" className="activity-delete-button" onClick={() => setConfirming(true)}>{label}</button>}
    {error && <p className="activity-delete-error" role="alert">{error}</p>}
  </div>;
}

function ExcursionSummary({ walk, stats }) {
  const date = walk.completedAt ? new Date(walk.completedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : null;
  const price = walk.priceCategory === "FREE" ? "Free" : walk.priceCategory;
  const group = Number.isFinite(walk.peopleWith)
    ? walk.peopleWith === 0 ? "Solo" : `With ${walk.peopleWith} ${walk.peopleWith === 1 ? "person" : "people"}`
    : null;
  return <section className="activity excursion-detail-card" aria-label={`${walk.title} excursion details`}>
    <header>
      <div>
        <small>{[date, walk.area].filter(Boolean).join(" · ")}</small>
        <h2 id="walk-title">{walk.title}</h2>
      </div>
    </header>
    <div className="activity-stats">
      <div><span>Distance</span><strong>{stats.miles} mi</strong></div>
      <div><span>Stops</span><strong>{walk.stops.length}</strong></div>
      <div><span>Time</span><strong>{minutesLabel(stats.minutes)}</strong></div>
    </div>
    {(price || group) && <div className="activity-details">
      {price && <span>{price}</span>}
      {group && <span>{group}</span>}
    </div>}
    {walk.comments && <p className="activity-comments">{walk.comments}</p>}
    <ActivityPhotos paths={walk.photoPaths} activityId={walk.activityId} title={walk.title}/>
    <div className="activity-map"><RouteThumb path={walk.path}/></div>
  </section>;
}

export function PlanDetail({ walk, stats, suggestData, step, complete, selected, onDirections,
  onBack, onSelectStop, onAdvance, onEndWalk, onFork, rankSlot, routing, legs = [], travel, onLegMode, onLegSteps, navHidden, onShowNav,
  favorite = false, onFavorite, onDeleteActivity, deleteLabel = "Delete activity" }) {
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
  const loggedExcursion = walk.category === "Logged excursion";

  return <div className={`plan-detail ${favorite ? "is-favorite" : ""}`}>
    <button type="button" className="back-link" onClick={onBack}><Icon name="arrowLeft" size={18}/>All walks</button>
    {loggedExcursion
      ? <ExcursionSummary walk={walk} stats={stats}/>
      : <>
          <div className="plan-label">{label}</div>
          <div className="plan-title-row">
            <h2 id="walk-title">{walk.title}</h2>
            {onFavorite && <HeartButton on={favorite} onToggle={onFavorite} label={walk.title}/>}
          </div>
          <p className="plan-meta">{meta}</p>
          <StopPhotos stops={walk.stops} onOpen={onSelectStop}/>
        </>}

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

    {!walking && loggedExcursion && onDeleteActivity && <div className="excursion-footer-actions">
      <button type="button" className="plan-secondary" onClick={() => onFork([])}>Modify</button>
      <DeleteActivity label={deleteLabel} onDelete={onDeleteActivity}/>
    </div>}

    {(walking || !loggedExcursion || !onDeleteActivity) && <div className="plan-bar">
      {walking
        ? <button type="button" className="plan-secondary" onClick={onEndWalk}>End</button>
        : <button type="button" className="plan-secondary" onClick={() => onFork([])}>Modify</button>}
      {!walking && onDeleteActivity
        ? <DeleteActivity label={deleteLabel} onDelete={onDeleteActivity}/>
        : <button type="button" className="plan-primary" onClick={onAdvance}>
            {!walking ? complete ? "Do it again" : "Do this plan" : step === walk.stops.length - 1 ? "Finish plan" : "Next stop"}
          </button>}
    </div>}
  </div>;
}

// One photo per stop (from Google Places), side by side like a place's photos, each with its stop number and name.
// Tapping one opens that stop's place card (like tapping the stop in the list).
// Stops without a photo are left out; nothing shows until the first photo is in.
function StopPhotos({ stops, onOpen }) {
  const [photos, setPhotos] = useState({});
  const key = stops.map(stop => stop.placeId ?? "").join(",");
  useEffect(() => {
    setPhotos({});
    let active = true;
    stops.forEach((stop, index) => {
      if (!stop.placeId) return;
      fetchPlacePhoto(stop.placeId, 600)
        .then(photo => { if (active && photo) setPhotos(current => ({ ...current, [index]: photo })); })
        .catch(() => {});
    });
    return () => { active = false; };
  }, [key]);

  const shown = stops.map((stop, index) => ({ stop, index, photo: photos[index] })).filter(item => item.photo);
  if (!shown.length) return null;
  return <div className="stop-photos" aria-label="Photos of the stops">
    {shown.map(({ stop, index, photo }) => <figure key={index}>
      <button type="button" className="stop-photo-open" onClick={() => onOpen?.(index)} aria-label={`Open stop ${index + 1}, ${stop.name}`}>
        {/* no referrerPolicy: Google checks the referrer against the key's website restrictions */}
        <img src={photo.src} alt="" loading="lazy"/>
      </button>
      <figcaption>
        <span className="stop-photo-name"><span className="stop-photo-number">{index + 1}</span><span className="stop-photo-title">{stop.name}</span></span>
        {photo.author && <span className="stop-photo-credit">{photo.author.uri
          ? <a href={photo.author.uri} target="_blank" rel="noreferrer">{photo.author.name}</a> : photo.author.name}</span>}
      </figcaption>
    </figure>)}
  </div>;
}
