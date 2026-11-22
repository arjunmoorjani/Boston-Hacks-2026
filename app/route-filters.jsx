"use client";

// Filter bar for the walk list: search, category chips with counts, a grouped Filters panel,
// and removable chips for what's active. The page applies the same filters to the map.
// onChange takes an updater (f => next) so quick taps never overwrite each other.

import { useState } from "react";
import { Icon } from "./icons";
import { LINES } from "./route-list";
import { CATEGORIES, FILTER_GROUPS, activeChips, anyActive, emptyFilters, panelCount, toggleOption } from "../lib/route-filters.mjs";

const lineColor = id => LINES.find(line => line.id === id)?.color;

export function RouteFilters({ filters, onChange, counts }) {
  const [open, setOpen] = useState(false);
  const chips = activeChips(filters);
  const inPanel = panelCount(filters);

  return <div className="route-filter-bar">
    <div className="filter-search">
      <Icon name="search" size={17}/>
      <input type="search" value={filters.query} placeholder="Search walks, places, neighborhoods"
        aria-label="Search walks and places" onChange={event => onChange(f => ({ ...f, query: event.target.value }))}/>
      {filters.query && <button type="button" aria-label="Clear search" onClick={() => onChange(f => ({ ...f, query: "" }))}><Icon name="close" size={15}/></button>}
    </div>

    <div className="chip-row" role="group" aria-label="Category">
      <button type="button" className="chip" aria-pressed={!filters.categories.length} onClick={() => onChange(f => ({ ...f, categories: [] }))}>All</button>
      {CATEGORIES.map(category => <button key={category} type="button" className="chip" aria-pressed={filters.categories.includes(category)}
        disabled={!counts[category] && !filters.categories.includes(category)}
        onClick={() => onChange(f => toggleOption(f, "categories", category))}>
        {category}<span className="chip-count">{counts[category]}</span>
      </button>)}
    </div>

    <div className="filter-actions">
      <button type="button" className={`filter-toggle ${inPanel ? "active" : ""}`} aria-expanded={open} aria-controls="filter-panel" onClick={() => setOpen(value => !value)}>
        <Icon name="sliders" size={16}/>Filters{inPanel > 0 && <span className="filter-badge">{inPanel}</span>}
        <Icon name={open ? "chevronUp" : "chevronDown"} size={15}/>
      </button>
      {chips.map(chip => <button key={`${chip.group}:${chip.value}`} type="button" className="active-chip"
        aria-label={`Remove filter ${chip.label}`} onClick={() => onChange(f => toggleOption(f, chip.group, chip.value))}>
        {chip.group === "line" && <span className="line-dot" style={{ background: lineColor(chip.value) }}/>}{chip.label}<Icon name="close" size={13}/>
      </button>)}
      {anyActive(filters) && <button type="button" className="clear-filters" onClick={() => onChange(emptyFilters)}>Clear all</button>}
    </div>

    <div className="filter-panel" id="filter-panel" hidden={!open}>
      {FILTER_GROUPS.map(group => <fieldset key={group.id}>
        <legend>{group.label}</legend>
        <div>
          {group.options.map(option => <button key={option} type="button" className="chip chip-tag"
            aria-pressed={filters[group.id].includes(option)} onClick={() => onChange(f => toggleOption(f, group.id, option))}>
            {group.id === "line" && <span className="line-dot" style={{ background: lineColor(option) }}/>}
            {group.labels?.[option] ?? option}
          </button>)}
        </div>
      </fieldset>)}
      <button type="button" className="filter-done" onClick={() => setOpen(false)}>Done</button>
    </div>
  </div>;
}
