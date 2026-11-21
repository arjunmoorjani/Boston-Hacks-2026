"use client";

import { useEffect, useState } from "react";
import { listPlaces, placeCategories, placesConfigured } from "../lib/places.mjs";
import { Icon } from "./icons";

const categoryLabels = Object.fromEntries(placeCategories);

export function PlacesCatalog() {
  const [open, setOpen] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [cursors, setCursors] = useState([null]);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const after = cursors.at(-1);

  useEffect(() => {
    if (!open || !placesConfigured) return;
    const controller = new AbortController();

    setResult(null);
    setError("");
    listPlaces({ search, category, after, signal: controller.signal })
      .then(page => {
        if (!controller.signal.aborted) setResult(page);
      })
      .catch(error => {
        if (!controller.signal.aborted) setError(error.message);
      });

    return () => controller.abort();
  }, [open, search, category, after, attempt]);

  return <details className="sheet places-catalog" onToggle={event => setOpen(event.currentTarget.open)}>
    <summary>Browse Boston places</summary>
    {!placesConfigured ? <p>Connect Supabase to browse the places catalog.</p> : <>
      <form className="places-filters" onSubmit={event => {
        event.preventDefault();
        setSearch(nameInput.trim());
        setCursors([null]);
        setAttempt(value => value + 1);
      }}>
        <label>
          Place name
          <input type="search" value={nameInput} onChange={event => setNameInput(event.target.value)} />
        </label>
        <label>
          Category
          <select value={category} onChange={event => {
            setCategory(event.target.value);
            setCursors([null]);
          }}>
            <option value="">All categories</option>
            {placeCategories.map(([value, label]) => <option value={value} key={value}>{label}</option>)}
          </select>
        </label>
        <button className="catalog-button" type="submit">Search</button>
      </form>

      {error
        ? <div className="places-status" role="alert">{error} <button className="catalog-button" onClick={() => setAttempt(value => value + 1)}>Retry</button></div>
        : !result
          ? <p className="places-status" role="status">Loading places…</p>
          : result.places.length === 0
            ? <p className="places-status" role="status">No places found.</p>
            : <ul className="places-list" aria-label="Places">
                {result.places.map(place => <li key={place.osm_id}>
                  <div>
                    <strong>{place.name}</strong>
                    <small>{place.categories?.map(category => categoryLabels[category] ?? category).join(" · ")}</small>
                  </div>
                  <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${place.latitude},${place.longitude}`)}`}
                    target="_blank" rel="noreferrer" aria-label={`Open ${place.name} in Google Maps`}>
                    <Icon name="external" size={17}/>
                  </a>
                </li>)}
              </ul>}
      {result && (cursors.length > 1 || result.nextCursor !== null) && <nav className="places-pages" aria-label="Places pages">
        <button className="catalog-button" disabled={cursors.length < 2} onClick={() => setCursors(items => items.slice(0, -1))}>Previous</button>
        <span aria-live="polite">Page {cursors.length}</span>
        <button className="catalog-button" disabled={result.nextCursor === null} onClick={() => setCursors(items => [...items, result.nextCursor])}>Next</button>
      </nav>}
    </>}
  </details>;
}
