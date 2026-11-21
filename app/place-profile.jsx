"use client";

// Place profile card, like tapping a place in Google Maps: photos, rating, type and price,
// open now + hours, address, actions (Directions, Website, Call, Add to plan), summary and reviews.

import { useEffect, useRef, useState } from "react";
import { Icon } from "./icons";
import { fetchPlaceProfile, todaysHours } from "../lib/place-profile.mjs";

function Stars({ rating }) {
  return <span className="stars" aria-hidden="true">
    {[1, 2, 3, 4, 5].map(i => <span key={i} className={rating >= i - 0.25 ? "on" : rating >= i - 0.75 ? "half" : ""}>★</span>)}
  </span>;
}

function Review({ review }) {
  const [more, setMore] = useState(false);
  const long = review.text.length > 220;
  return <li className="review">
    <div className="review-head">
      {review.authorPhoto ? <img src={review.authorPhoto} alt="" referrerPolicy="no-referrer"/> : <span className="review-avatar">{review.author[0]}</span>}
      <div>
        {review.authorUri ? <a href={review.authorUri} target="_blank" rel="noreferrer">{review.author}</a> : <strong>{review.author}</strong>}
        <small>{review.rating && <Stars rating={review.rating}/>} {review.when}</small>
      </div>
    </div>
    {review.text && <p>{long && !more ? `${review.text.slice(0, 220).trimEnd()}…` : review.text}
      {long && <button type="button" onClick={() => setMore(value => !value)}>{more ? "Less" : "More"}</button>}</p>}
  </li>;
}

/**
 * placeId: Google place id. fallback: what we already know (name, address, point) so the card
 * isn't empty while loading. addLabel / onAdd: the "Add to plan" action, or none.
 */
export function PlaceProfile({ placeId, fallback, onClose, addLabel, onAdd, onDirections }) {
  const dialog = useRef(null);
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState("");
  const [showHours, setShowHours] = useState(false);

  useEffect(() => { dialog.current?.showModal(); }, []);
  useEffect(() => {
    let active = true;
    setProfile(null); setError(""); setShowHours(false);
    fetchPlaceProfile(placeId).then(result => { if (active) setProfile(result); })
      .catch(() => { if (active) setError("Couldn’t load details for this place. Check that Places API (New) is enabled for the key."); });
    return () => { active = false; };
  }, [placeId]);

  const p = profile ?? { name: fallback?.name ?? "Loading…", address: fallback?.address ?? "", point: fallback?.point ?? null, photos: [], hours: [], reviews: [] };
  const today = todaysHours(p.hours);
  const directions = p.point
    ? `https://www.google.com/maps/dir/?api=1&destination=${p.point.join(",")}&destination_place_id=${placeId}&travelmode=walking`
    : p.mapsUrl;
  const canAdd = addLabel === "Add to plan";

  return <dialog ref={dialog} className="place-profile" aria-labelledby="place-profile-name" onClose={onClose}
    onClick={event => { if (event.target === dialog.current) dialog.current.close(); }}>
    <div className="place-profile-inner">
      <form method="dialog" className="place-close-form"><button className="place-close" aria-label="Close place"><Icon name="close" size={18}/></button></form>
      {(p.photos.length > 0 || !profile) && <div className={`place-photos ${profile ? "" : "loading"}`}>
        {p.photos.map((photo, i) => <figure key={photo.src}>
          {/* no referrerPolicy: Google checks the referrer against the key's website restrictions */}
          <img src={photo.src} alt={i === 0 ? p.name : ""} loading={i ? "lazy" : "eager"}/>
          {photo.authors[0] && <figcaption>{photo.authors[0].uri
            ? <a href={photo.authors[0].uri} target="_blank" rel="noreferrer">{photo.authors[0].name}</a> : photo.authors[0].name}</figcaption>}
        </figure>)}
      </div>}

      <div className="place-body">
        <h2 id="place-profile-name">{p.name}</h2>
        {(p.rating || p.type || p.price) && <p className="place-line">
          {p.rating && <><strong>{p.rating.toFixed(1)}</strong> <Stars rating={p.rating}/> {p.ratingCount != null && <span>({p.ratingCount.toLocaleString()})</span>}</>}
          {[p.type, p.price].filter(Boolean).map(text => <span key={text}> · {text}</span>)}
        </p>}
        {(p.openNow != null || today) && <button type="button" className="place-hours-toggle" aria-expanded={showHours} onClick={() => setShowHours(value => !value)}
          disabled={!p.hours.length}>
          {p.openNow != null && <strong className={p.openNow ? "open" : "closed"}>{p.openNow ? "Open now" : "Closed"}</strong>}
          {today && <span>{p.openNow != null ? " · " : ""}Today {today}</span>}
          {p.hours.length > 0 && <Icon name={showHours ? "chevronUp" : "chevronDown"} size={15}/>}
        </button>}
        {showHours && <ul className="place-hours">{p.hours.map(line => <li key={line}>{line}</li>)}</ul>}

        <div className="place-actions">
          {onDirections && p.point
            ? <button type="button" className="place-directions" onClick={() => onDirections({ ...p })}><span><Icon name="route" size={18}/></span>Directions</button>
            : <a href={directions} target="_blank" rel="noreferrer"><span><Icon name="route" size={18}/></span>Directions</a>}
          {p.website && <a href={p.website} target="_blank" rel="noreferrer"><span><Icon name="external" size={18}/></span>Website</a>}
          {p.phone && <a href={`tel:${p.phone.replace(/[^\d+]/g, "")}`}><span><Icon name="phone" size={18}/></span>Call</a>}
          {onAdd && <button type="button" disabled={!canAdd} onClick={() => { onAdd(profile ?? fallback); dialog.current.close(); }}>
            <span><Icon name={canAdd ? "plus" : "check"} size={18}/></span>{canAdd ? "Add to plan" : addLabel}
          </button>}
        </div>

        {error && <p className="editor-error" role="alert">{error}</p>}
        {!profile && !error && <div className="place-loading" aria-hidden="true"><span/><span/><span/></div>}
        {p.summary && <p className="place-summary">{p.summary}</p>}
        {p.address && <p className="place-address"><Icon name="locate" size={16}/>{p.address}</p>}

        {p.reviews.length > 0 && <section className="place-reviews" aria-labelledby="place-reviews-title">
          <h3 id="place-reviews-title">Reviews</h3>
          <ul>{p.reviews.map((review, i) => <Review key={`${review.author}-${i}`} review={review}/>)}</ul>
        </section>}

        <p className="place-credit">
          {profile && <a href={p.mapsUrl} target="_blank" rel="noreferrer">Open in Google Maps <Icon name="external" size={13}/></a>}
          <span>Place info from Google</span>
        </p>
      </div>
    </div>
  </dialog>;
}
