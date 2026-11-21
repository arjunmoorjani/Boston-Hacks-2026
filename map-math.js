export const TILE = 256;
export const MIN_ZOOM = 3;
export const MAX_ZOOM = 19;

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function project([lat, lng], zoom) {
  const size = TILE * 2 ** zoom;
  const sine = Math.sin(clamp(lat, -85.05112878, 85.05112878) * Math.PI / 180);
  return [(lng + 180) / 360 * size, (0.5 - Math.log((1 + sine) / (1 - sine)) / (4 * Math.PI)) * size];
}

export function unproject([x, y], zoom) {
  const size = TILE * 2 ** zoom;
  return [Math.atan(Math.sinh(Math.PI * (1 - 2 * y / size))) * 180 / Math.PI, x / size * 360 - 180];
}

export function fitRoute(path, { width, height }) {
  const points = path.map(point => project(point, 0));
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  const xMin = Math.min(...xs), xMax = Math.max(...xs);
  const yMin = Math.min(...ys), yMax = Math.max(...ys);
  const zoom = clamp(Math.log2(Math.min(
    Math.max(100, width - 120) / (xMax - xMin),
    Math.max(100, height - 185) / (yMax - yMin),
  )), MIN_ZOOM, 17);
  return { center: unproject([(xMin + xMax) / 2, (yMin + yMax) / 2], 0), zoom };
}

export function tileLayout(view, { width, height }) {
  const tileZoom = Math.floor(view.zoom);
  const count = 2 ** tileZoom;
  const scale = 2 ** (view.zoom - tileZoom);
  const size = TILE * scale;
  const [cx, cy] = project(view.center, view.zoom);
  const left = cx - width / 2;
  const top = cy - height / 2;
  const tiles = [];
  for (let row = Math.max(0, Math.floor(top / size)); row <= Math.min(count - 1, Math.floor((top + height) / size)); row++) {
    for (let col = Math.floor(left / size); col <= Math.floor((left + width) / size); col++) {
      const x = ((col % count) + count) % count;
      tiles.push({ key: `${tileZoom}/${col}/${row}`, path: `${tileZoom}/${x}/${row}`, left: col * size - left, top: row * size - top, size });
    }
  }
  return { tiles, left, top };
}
