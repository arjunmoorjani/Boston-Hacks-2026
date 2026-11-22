// A small drawing of a walk's route for list cards: no map tiles or Google calls, just its shape and stops.

/**
 * Project a walk's path and stops into a square `size` x `size` box (north up, longitude scaled for latitude),
 * keeping the shape's proportions and centering it with `pad` pixels around it.
 * Returns an SVG path `d` and the stop positions, or null when there's nothing to draw.
 */
export function sketchRoute(path, stops = [], size = 72, pad = 9) {
  const points = path?.length >= 2 ? path : stops.map(stop => stop.point);
  if (!points?.length || points.length < 2) return null;
  const midLat = points.reduce((sum, [lat]) => sum + lat, 0) / points.length;
  const kx = Math.cos(midLat * Math.PI / 180);
  const xy = ([lat, lng]) => [lng * kx, -lat];
  const all = [...points, ...stops.map(stop => stop.point)].map(xy);
  const xs = all.map(p => p[0]), ys = all.map(p => p[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const span = Math.max(maxX - minX, maxY - minY) || 1e-6;
  const scale = (size - pad * 2) / span;
  const offX = (size - (maxX - minX) * scale) / 2, offY = (size - (maxY - minY) * scale) / 2;
  const place = point => {
    const [x, y] = xy(point);
    return [+(offX + (x - minX) * scale).toFixed(1), +(offY + (y - minY) * scale).toFixed(1)];
  };
  const d = points.map((point, i) => `${i ? "L" : "M"}${place(point).join(" ")}`).join("");
  return { d, stops: stops.map(stop => place(stop.point)) };
}
