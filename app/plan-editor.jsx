"use client";

// Plan editor inside the bottom sheet: name the plan, reorder stops with up/down, remove (with undo),
// add stops by tapping places on the map, then save. The map above shows the draft as you edit.

import { Icon } from "./icons";
import { walkMinutes } from "../lib/suggest.mjs";

const point = place => [Number(place.latitude), Number(place.longitude)];
const legMinutes = (a, b) => walkMinutes(...point(a), ...point(b));

export function PlanEditor({ heading, title, onTitle, places, maxStops, onMove, onRemove, removed, onUndo,
  onCancel, onSave, building, error, savingOuting, saveFeedback, onSaveOuting }) {
  const legs = places.slice(1).map((place, index) => legMinutes(places[index], place));
  const totalWalk = legs.reduce((sum, min) => sum + min, 0);
  const full = places.length >= maxStops;
  const busy = building || savingOuting;
  const canCalculate = places.length >= 2 && title.trim() && !busy;
  const missingPlaceId = places.some(place => !place.placeId);
  const canSaveOuting = places.length > 0 && title.trim() && !missingPlaceId && !busy;

  return <div className="plan-editor">
    <div className="plan-label">{heading}</div>

    <label className="editor-title">
      <span>Plan name</span>
      <input disabled={busy} value={title} onChange={event => onTitle(event.target.value)} maxLength={60} placeholder="Name your plan"/>
    </label>
    <p className="plan-meta">{places.length} {places.length === 1 ? "stop" : "stops"}{places.length > 1 && ` · about ${totalWalk} min walking`}</p>

    {removed && <div className="editor-undo" role="status">
      <span>Removed {removed.place.name}</span>
      <button type="button" disabled={busy} onClick={onUndo}>Undo</button>
    </div>}

    <ol className="editor-stops">
      {places.map((place, index) => <li key={place.osm_id}>
        {index > 0 && <div className="editor-leg"><Icon name="route" size={13}/>{legs[index - 1]} min walk</div>}
        <div className="editor-stop">
          <span className="stop-badge">{index + 1}</span>
          <span className="editor-stop-text">
            <strong>{place.name}</strong>
            {place.address && <small>{place.address}</small>}
          </span>
          <span className="editor-controls">
            <button type="button" aria-label={`Move ${place.name} up`} disabled={index === 0 || busy} onClick={() => onMove(index, -1)}><Icon name="chevronUp" size={18}/></button>
            <button type="button" aria-label={`Move ${place.name} down`} disabled={index === places.length - 1 || busy} onClick={() => onMove(index, 1)}><Icon name="chevronDown" size={18}/></button>
            <button type="button" aria-label={`Remove ${place.name}`} disabled={busy} onClick={() => onRemove(index)}><Icon name="close" size={17}/></button>
          </span>
        </div>
      </li>)}
    </ol>

    <div className={`editor-add ${full ? "full" : ""}`}>
      <span className="editor-add-icon"><Icon name={full ? "check" : "plus"} size={18}/></span>
      <span>
        <strong>{full ? "Your plan is full" : "Add a stop"}</strong>
        <small>{full ? `Plans have up to ${maxStops} stops. Remove one to add another.` : "Tap any café, shop or sight on the map, then choose “Add to walk”."}</small>
      </span>
      <span className="editor-count">{places.length}/{maxStops}</span>
    </div>

    {error && <p className="editor-error" role="alert">{error}</p>}

    {missingPlaceId && <p className="plan-meta">Replace stops without a Google Place ID to save this outing.</p>}
    {saveFeedback && <p className={saveFeedback.error ? "editor-error" : "plan-meta"}
      role={saveFeedback.error ? "alert" : "status"}>{saveFeedback.message}</p>}
    <div className="plan-bar">
      <button type="button" className="plan-secondary" onClick={onCancel} disabled={busy}>Cancel</button>
      <button type="button" className="plan-primary" onClick={onSave} disabled={!canCalculate}>
        {building ? "Calculating…" : "Calculate route"}
      </button>
      <button type="button" className="plan-primary" onClick={onSaveOuting} disabled={!canSaveOuting}>
        {savingOuting ? "Saving…" : "Save outing"}
      </button>
    </div>
  </div>;
}
