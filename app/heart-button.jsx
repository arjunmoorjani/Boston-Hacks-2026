"use client";

// Favorite heart, like YouTube's or X's like button: outline when off, filled pink with a little pop and burst
// when you turn it on.

import { useState } from "react";

const HEART = "M12 20.5s-7.5-4.6-7.5-10.6A4.4 4.4 0 0 1 12 7.1a4.4 4.4 0 0 1 7.5 2.8c0 6-7.5 10.6-7.5 10.6z";

export function HeartButton({ on, onToggle, label = "walk", size = 22 }) {
  const [pop, setPop] = useState(false);
  return <button type="button" className={`heart-button ${on ? "on" : ""} ${pop ? "pop" : ""}`} aria-pressed={on}
    aria-label={on ? `Remove ${label} from favorites` : `Add ${label} to favorites`}
    onClick={() => { if (!on) setPop(true); onToggle(); }} onAnimationEnd={() => setPop(false)}>
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d={HEART} fill={on ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round"/>
    </svg>
  </button>;
}
