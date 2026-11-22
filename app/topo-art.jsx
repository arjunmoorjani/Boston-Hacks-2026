// Shared contour-line artwork for the profile banner and welcome background.

function makePaths(full) {
  const out = [];
  const rings = (cx, cy, count, seed) => {
    for (let r = 1; r <= count; r++) {
      const points = [];
      for (let a = 0; a <= 64; a++) {
        const t = (a / 64) * Math.PI * 2;
        const wobble = 1 + 0.18 * Math.sin(t * 3 + seed + r * 0.6) + 0.08 * Math.sin(t * 5 - seed * 2 + r);
        points.push([cx + Math.cos(t) * r * 34 * wobble * 1.6, cy + Math.sin(t) * r * 34 * wobble]);
      }
      out.push(points.map(([x, y], index) => `${index ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join("") + "Z");
    }
  };

  rings(230, 150, 9, 0.4);
  rings(980, 40, 8, 2.1);
  rings(640, full ? 390 : 260, 5, 4.2);
  if (full) {
    rings(80, 710, 7, 1.3);
    rings(1080, 760, 9, 3.4);
  }
  return out;
}

const bannerPaths = makePaths(false);
const backgroundPaths = makePaths(true);

export function TopoArt({ full = false }) {
  const paths = full ? backgroundPaths : bannerPaths;
  return <svg className="topo" viewBox={full ? "0 0 1200 900" : "0 0 1200 220"}
    preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    {paths.map((d, index) => <path key={index} d={d} fill="none"
      stroke={index % 4 === 0 ? "#FFC21A" : "#7FB0EA"}
      strokeOpacity={index % 4 === 0 ? 0.55 : 0.4} strokeWidth="1.4"
      strokeDasharray={index % 7 === 3 ? "5 6" : undefined}/>) }
  </svg>;
}
