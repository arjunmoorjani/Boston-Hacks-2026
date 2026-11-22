"use client";

import { useEffect, useRef, useState } from "react";
import { ROUTE_THEME } from "../lib/map-style.mjs";
import { clamp, fitRoute, MAX_ZOOM, MIN_ZOOM, project, tileLayout, unproject } from "./map-math";

const baseURL = "https://basemaps.cartocdn.com/rastertiles/voyager";
const osmURL = "https://tile.openstreetmap.org";
const cartoKey = process.env.NEXT_PUBLIC_CARTO_BASEMAP_KEY?.trim();
const bostonCenter = [42.355, -71.07];

function Tile({ tile, onLoad, onFail }) {
  const [fallback, setFallback] = useState(!cartoKey);

  return <img
    className="tile"
    src={fallback ? `${osmURL}/${tile.path}.png` : `${baseURL}/${tile.path}.png?key=${encodeURIComponent(cartoKey)}`}
    style={{ left: tile.left, top: tile.top, width: tile.size + 0.5, height: tile.size + 0.5 }}
    alt="" draggable={false} onLoad={onLoad}
    onError={event => {
      if (!fallback) setFallback(true);
      else {
        event.currentTarget.style.visibility = "hidden";
        onFail();
      }
    }}
  />;
}

export function BostonMap({ walk, walks, selected, onSelect, activeWalkId, onOpenWalk, location, following, locationStatus }) {
  const element = useRef(null);
  const lastFit = useRef("");
  const browseView = useRef(null);
  const previousActiveWalk = useRef(activeWalkId);
  const pointers = useRef(new Map());
  const moved = useRef(false);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [view, setView] = useState({ center: walk.stops[0]?.point ?? bostonCenter, zoom: 15 });
  const [loadedTile, setLoadedTile] = useState(false);
  const [failedTile, setFailedTile] = useState(false);

  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize({ width, height });
    });
    observer.observe(element.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const fitKey = walks.map(item => item.id).join("|");
    const path = walks.flatMap(item => item.path);
    if (size.width && path.length && lastFit.current !== fitKey) {
      lastFit.current = fitKey;
      setView(fitRoute(path, size));
    }
  }, [size, walks]);

  useEffect(() => {
    if (following && location) setView(old => ({ ...old, center: location }));
  }, [location, following]);

  useEffect(() => {
    const wasActive = previousActiveWalk.current;
    if (!wasActive && activeWalkId) browseView.current = view;
    if (wasActive && !activeWalkId && browseView.current) {
      setView(browseView.current);
      browseView.current = null;
    }
    previousActiveWalk.current = activeWalkId;
  }, [activeWalkId]);

  function zoomAt(old, change, anchorX = 0, anchorY = 0, panX = 0, panY = 0) {
    const zoom = clamp(old.zoom + change, MIN_ZOOM, MAX_ZOOM);
    const [x, y] = project(old.center, old.zoom);
    const scale = 2 ** (zoom - old.zoom);
    const center = unproject([(x + anchorX) * scale - anchorX - panX, (y + anchorY) * scale - anchorY - panY], zoom);
    center[0] = clamp(center[0], -85, 85);
    center[1] = ((center[1] + 180) % 360 + 360) % 360 - 180;
    return { center, zoom };
  }

  useEffect(() => {
    const target = element.current;
    function onWheel(event) {
      if (event.target.closest("[data-map-ui]")) return;
      event.preventDefault();
      const box = target.getBoundingClientRect();
      const change = clamp(-event.deltaY * (event.deltaMode === 1 ? 0.035 : 0.003), -1, 1);
      setView(old => zoomAt(old, change, event.clientX - box.left - box.width / 2, event.clientY - box.top - box.height / 2));
    }
    target.addEventListener("wheel", onWheel, { passive: false });
    return () => target.removeEventListener("wheel", onWheel);
  }, []);

  function onPointerDown(event) {
    if (event.button !== 0 || event.target.closest("[data-map-ui]")) return;
    if (!pointers.current.size) moved.current = false;
    pointers.current.set(event.pointerId, [event.clientX, event.clientY]);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event) {
    const previous = pointers.current.get(event.pointerId);
    if (!previous) return;
    const next = [event.clientX, event.clientY];
    const other = [...pointers.current].find(([id]) => id !== event.pointerId)?.[1];
    pointers.current.set(event.pointerId, next);
    const dx = next[0] - previous[0], dy = next[1] - previous[1];
    if (Math.abs(dx) + Math.abs(dy) > 0) moved.current = true;
    if (!other) {
      setView(old => zoomAt(old, 0, 0, 0, dx, dy));
      return;
    }
    const before = Math.hypot(previous[0] - other[0], previous[1] - other[1]);
    const after = Math.hypot(next[0] - other[0], next[1] - other[1]);
    const box = event.currentTarget.getBoundingClientRect();
    const anchorX = (previous[0] + other[0]) / 2 - box.left - box.width / 2;
    const anchorY = (previous[1] + other[1]) / 2 - box.top - box.height / 2;
    if (before && after) setView(old => zoomAt(old, Math.log2(after / before), anchorX, anchorY, dx / 2, dy / 2));
  }

  function onKeyDown(event) {
    if (event.target !== element.current) return;
    const moves = { ArrowUp: [0, 65], ArrowDown: [0, -65], ArrowLeft: [65, 0], ArrowRight: [-65, 0] };
    const pan = moves[event.key];
    const zoom = event.key === "+" || event.key === "=" ? 1 : event.key === "-" ? -1 : 0;
    if (!pan && !zoom) return;
    event.preventDefault();
    setView(old => zoomAt(old, zoom, 0, 0, ...(pan ?? [0, 0])));
  }

  const { tiles, left, top } = size.width ? tileLayout(view, size) : { tiles: [], left: 0, top: 0 };
  const screen = point => {
    const [x, y] = project(point, view.zoom);
    return [x - left, y - top];
  };
  const routes = walks.map(item => item.path.map(screen).map(point => point.join(",")).join(" "));
  const gps = location && screen(location);

  return <section
    ref={element} className="map" tabIndex={0} aria-label="Interactive Boston map. Use arrow keys to pan and plus or minus to zoom."
    onKeyDown={onKeyDown} onPointerDown={onPointerDown} onPointerMove={onPointerMove}
    onPointerUp={event => pointers.current.delete(event.pointerId)}
    onPointerCancel={event => pointers.current.delete(event.pointerId)}
    onLostPointerCapture={event => pointers.current.delete(event.pointerId)}
    onDoubleClick={event => {
      if (moved.current || event.target.closest("[data-map-ui]")) return;
      const rect = element.current.getBoundingClientRect();
      setView(old => zoomAt(old, 1, event.clientX - rect.left - rect.width / 2, event.clientY - rect.top - rect.height / 2));
    }}
  >
    <div className="tiles" aria-hidden="true">
      {tiles.map(tile => <Tile key={tile.key} tile={tile} onLoad={() => setLoadedTile(true)} onFail={() => setFailedTile(true)} />)}
    </div>
    <svg className="route-layer" width="100%" height="100%" aria-hidden="true">
      {routes.map((route, index) => {
        const active = walks[index].id === activeWalkId;
        return <g key={walks[index].id}>
          <polyline points={route} fill="none" stroke={ROUTE_THEME.casing} strokeOpacity={active ? 1 : ROUTE_THEME.dimOpacity}
            strokeWidth={ROUTE_THEME.casingWeight} strokeLinejoin="round" strokeLinecap="round"/>
          <polyline points={route} fill="none" stroke={ROUTE_THEME.line}
            strokeOpacity={active ? 1 : ROUTE_THEME.dimOpacity} strokeWidth={ROUTE_THEME.lineWeight} strokeLinejoin="round" strokeLinecap="round"/>
          <polyline className="route-hit" data-map-ui points={route} fill="none" stroke="transparent" strokeWidth="24"
            onClick={() => onOpenWalk?.(walks[index].id)}/>
        </g>;
      })}
    </svg>
    {gps && <span className="gps" style={{ left: gps[0], top: gps[1] }} title="Your location" />}
    {walk.stops.map((stop, index) => {
      const [x, y] = screen(stop.point);
      if (x < 0 || x > size.width || y < 0 || y > size.height) return null;
      return <button data-map-ui className={`pin ${selected === index ? "selected" : ""}`} key={stop.name}
        style={{ left: x, top: y }} onClick={() => onSelect(index)}
        aria-label={`Stop ${index + 1}: ${stop.name}`} aria-pressed={selected === index}>{index + 1}</button>;
    })}
    {(!loadedTile && failedTile || locationStatus) && <div className="map-notice" role="status">{locationStatus || "Map tiles are unavailable. Check your internet connection."}</div>}
    <div className="map-key"><span/> Walking route</div>
    <div className="attribution" data-map-ui><a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap contributors</a>{cartoKey && <> · <a href="https://carto.com/attributions" target="_blank" rel="noreferrer">© CARTO</a></>}</div>
  </section>;
}
