"use client";

// Profile ("You"): cover + identity, activity feed with route thumbnails, this month's walking,
// trophy case, your ranked list ("Which plan was better?") and your saved plans.
// Data lives in this browser (lib/profile-store.mjs).

import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "./icons";
import { LINES, lineFamily } from "./route-list";
import { walkStats } from "./walks";
import { sampleActivity } from "../lib/profile-store.mjs";
import { Inserter } from "../lib/ranking.mjs";

// ---------- small pieces ----------
export function Avatar({ name, size = 40 }) {
  const initials = (name || "You").trim().split(/\s+/).slice(0, 2).map(word => word[0]?.toUpperCase()).join("") || "Y";
  return <span className="avatar" style={{ width: size, height: size, fontSize: size * 0.4 }} aria-hidden="true">{initials}</span>;
}

/** Route drawn from the walk's own path: no map tiles, no API calls. */
function RouteThumb({ path }) {
  const W = 320, H = 170, PAD = 18;
  if (!path?.length) return <div className="route-thumb empty"/>;
  const k = Math.cos((path[0][0] * Math.PI) / 180); // squash longitude so shapes look right
  const xs = path.map(([, lng]) => lng * k), ys = path.map(([lat]) => lat);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const scale = Math.min((W - PAD * 2) / Math.max(x1 - x0, 1e-6), (H - PAD * 2) / Math.max(y1 - y0, 1e-6));
  const ox = (W - (x1 - x0) * scale) / 2, oy = (H - (y1 - y0) * scale) / 2;
  const pts = path.map(([lat, lng]) => [ox + (lng * k - x0) * scale, oy + (y1 - lat) * scale]);
  const d = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join("");
  return <svg className="route-thumb" viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
    <defs><pattern id="streets" width="26" height="26" patternUnits="userSpaceOnUse" patternTransform="rotate(18)">
      <path d="M0 13h26M13 0v26" stroke="#e4e1d6" strokeWidth="5"/>
    </pattern></defs>
    <rect width={W} height={H} fill="#f2f0eb"/>
    <rect width={W} height={H} fill="url(#streets)"/>
    <path d={d} fill="none" stroke="#fff" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round"/>
    <path d={d} fill="none" stroke="#5A45D6" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/>
    <circle cx={pts[0][0]} cy={pts[0][1]} r="6" fill="#00843D" stroke="#fff" strokeWidth="2.5"/>
    <circle cx={pts.at(-1)[0]} cy={pts.at(-1)[1]} r="6" fill="#212320" stroke="#fff" strokeWidth="2.5"/>
  </svg>;
}

/** Contour-line art for the cover (drawn once, deterministic). */
function TopoArt() {
  const paths = useMemo(() => {
    const out = [];
    const rings = (cx, cy, count, seed) => {
      for (let r = 1; r <= count; r++) {
        const pts = [];
        for (let a = 0; a <= 64; a++) {
          const t = (a / 64) * Math.PI * 2;
          const wobble = 1 + 0.18 * Math.sin(t * 3 + seed + r * 0.6) + 0.08 * Math.sin(t * 5 - seed * 2 + r);
          pts.push([cx + Math.cos(t) * r * 34 * wobble * 1.6, cy + Math.sin(t) * r * 34 * wobble]);
        }
        out.push(pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join("") + "Z");
      }
    };
    rings(230, 150, 9, 0.4);
    rings(980, 40, 8, 2.1);
    rings(640, 260, 5, 4.2);
    return out;
  }, []);
  return <svg className="topo" viewBox="0 0 1200 220" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    {paths.map((d, i) => <path key={i} d={d} fill="none" stroke={i % 4 === 0 ? "#FFC21A" : "#8b78f0"} strokeOpacity={i % 4 === 0 ? 0.55 : 0.4} strokeWidth="1.4" strokeDasharray={i % 7 === 3 ? "5 6" : undefined}/>)}
  </svg>;
}

function dayLabel(iso) {
  const d = new Date(iso), now = new Date();
  const days = Math.floor((new Date(now.toDateString()) - new Date(d.toDateString())) / 86400000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return d.toLocaleDateString("en-US", { weekday: "long" });
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
const timeLabel = min => min >= 60 ? `${Math.floor(min / 60)} h ${min % 60} min` : `${min} min`;
const round1 = n => Math.round(n * 10) / 10;

// ---------- trophies ----------
const BADGES = [
  { id: "first", name: "First steps", desc: "Finish a plan", icon: "check", color: "#4B33C9", goal: 1, value: s => s.done },
  { id: "regular", name: "Regular", desc: "Finish 5 plans", icon: "route", color: "#212320", goal: 5, value: s => s.done },
  { id: "lines", name: "Line hopper", desc: "Plans on 3 T lines", icon: "train", color: "#DA291C", goal: 3, value: s => s.lines.size },
  { id: "explorer", name: "Explorer", desc: "5 neighborhoods", icon: "locate", color: "#00843D", goal: 5, value: s => s.areas.size },
  { id: "sweet", name: "Sweet tooth", desc: "3 food plans", icon: "cone", color: "#ED8B00", goal: 3, value: s => s.food },
  { id: "ten", name: "Ten-miler", desc: "Walk 10 miles", icon: "waves", color: "#003DA5", goal: 10, value: s => s.miles },
];

// ---------- "Which plan was better?" ----------
export function RankPrompt({ newId, ranking, titleOf, onDone }) {
  const others = useMemo(() => ranking.filter(id => id !== newId), [ranking, newId]);
  const inserter = useRef(null);
  const [asked, setAsked] = useState(0);
  if (!inserter.current || inserter.current.key !== `${newId}|${others.join()}`) {
    inserter.current = { key: `${newId}|${others.join()}`, ins: new Inserter(others, newId) };
  }
  const { ins } = inserter.current;
  const total = Math.ceil(Math.log2(others.length + 1));

  const reported = useRef("");
  useEffect(() => {
    // first plan on the list, or the last answer placed it: report once per prompt
    if (ins.done && reported.current !== inserter.current.key) {
      reported.current = inserter.current.key;
      onDone(ins.result());
    }
  }, [ins, asked, onDone]);

  if (ins.done) return null;
  const against = ins.next();
  const answer = better => { ins.answer(better); setAsked(n => n + 1); };
  return <section className="rank-prompt" aria-labelledby={`rank-${newId}`}>
    <div className="rank-prompt-head">
      <strong id={`rank-${newId}`}>Which plan was better?</strong>
      <span>{Math.min(asked + 1, total)} of ~{total}</span>
    </div>
    <div className="rank-choices">
      <button type="button" onClick={() => answer(true)}>{titleOf(newId)}<small>just finished</small></button>
      <span className="rank-or">or</span>
      <button type="button" onClick={() => answer(false)}>{titleOf(against)}<small>#{ranking.indexOf(against) + 1} on your list</small></button>
    </div>
    <button type="button" className="rank-tie" onClick={() => { ins.tie(); setAsked(n => n + 1); }}>Too close to call</button>
  </section>;
}

// ---------- page ----------
export function ProfilePage({ profile, walks, onClose, onRename, onRank, onOpenWalk, onDeleteWalk, onSample, onReset }) {
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState(profile.name);
  const close = useRef(null);
  const { completions, ranking, customWalks } = profile;

  useEffect(() => {
    close.current?.focus();
    const onKey = event => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    document.documentElement.classList.add("profile-open");
    return () => { document.removeEventListener("keydown", onKey); document.documentElement.classList.remove("profile-open"); };
  }, [onClose]);

  const stats = useMemo(() => {
    const lines = new Set(completions.flatMap(c => c.tLines.map(lineFamily)));
    const areas = new Set(completions.map(c => c.area).filter(area => area && area !== "Your plan"));
    return {
      done: completions.length,
      miles: round1(completions.reduce((sum, c) => sum + c.miles, 0)),
      stops: completions.reduce((sum, c) => sum + c.stops, 0),
      food: completions.filter(c => c.category === "Food").length,
      lines, areas,
    };
  }, [completions]);

  const months = useMemo(() => {
    const now = new Date();
    return Array.from({ length: 6 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1);
      const inMonth = completions.filter(c => { const t = new Date(c.completedAt); return t.getFullYear() === d.getFullYear() && t.getMonth() === d.getMonth(); });
      return { label: d.toLocaleDateString("en-US", { month: "short" }), miles: round1(inMonth.reduce((sum, c) => sum + c.miles, 0)), plans: inMonth.length, minutes: inMonth.reduce((sum, c) => sum + c.minutes, 0) };
    });
  }, [completions]);
  const thisMonth = months.at(-1);
  const maxMiles = Math.max(1, ...months.map(m => m.miles));

  const titleOf = id => walks.find(w => w.id === id)?.title ?? completions.find(c => c.walkId === id)?.title ?? "A plan";
  const timesDone = id => completions.filter(c => c.walkId === id).length;
  const unranked = [...new Set(completions.map(c => c.walkId))].filter(id => !ranking.includes(id));
  const lineChips = LINES.filter(line => stats.lines.has(line.id));

  function saveName() {
    const name = draftName.trim().slice(0, 30) || "You";
    onRename(name);
    setDraftName(name);
    setEditing(false);
  }

  return <div className="profile-page" role="dialog" aria-modal="true" aria-labelledby="profile-name">
    <div className="profile-cover">
      <TopoArt/>
      <button ref={close} type="button" className="profile-back" onClick={onClose}><Icon name="arrowLeft" size={18}/>Map</button>
    </div>

    <div className="profile-grid">
      <section className="profile-id">
        <div className="profile-avatar"><Avatar name={profile.name} size={104}/></div>
        {editing
          ? <form className="name-form" onSubmit={event => { event.preventDefault(); saveName(); }}>
              <input autoFocus value={draftName} onChange={event => setDraftName(event.target.value)} onBlur={saveName} maxLength={30} aria-label="Your name"/>
            </form>
          : <h1 id="profile-name">{profile.name}
              <button type="button" className="name-edit" onClick={() => { setDraftName(profile.name); setEditing(true); }} aria-label="Edit your name"><Icon name="pencil" size={15}/></button>
            </h1>}
        <p className="profile-where">Boston, MA</p>
        <div className="profile-counts">
          <div><span>Plans done</span><strong>{stats.done}</strong></div>
          <div><span>Miles walked</span><strong>{stats.miles}</strong></div>
          <div><span>Stops</span><strong>{stats.stops}</strong></div>
        </div>
        {lineChips.length > 0 && <div className="profile-lines">
          <span>Lines you’ve started from</span>
          <div>{lineChips.map(line => <span key={line.id} className="t-chip" style={{ background: line.color, color: line.darkText ? "#212320" : "#fff" }}><Icon name="train" size={13}/>{line.id}</span>)}</div>
        </div>}
      </section>

      <section className="profile-month card-block" aria-labelledby="month-title">
        <h2 id="month-title">This month</h2>
        <div className="month-stats">
          <div><span>Distance</span><strong>{thisMonth.miles} mi</strong></div>
          <div><span>Walking time</span><strong>{timeLabel(thisMonth.minutes)}</strong></div>
          <div><span>Plans</span><strong>{thisMonth.plans}</strong></div>
        </div>
        <div className="month-chart" role="img" aria-label={`Miles walked per month: ${months.map(m => `${m.label} ${m.miles}`).join(", ")}`}>
          {months.map((m, i) => <div key={m.label} className="month-bar">
            <span className={i === months.length - 1 ? "now" : ""} style={{ height: `${Math.max(4, (m.miles / maxMiles) * 100)}%` }} title={`${m.miles} mi`}/>
            <small>{m.label}</small>
          </div>)}
        </div>
      </section>

      <section className="profile-feed" aria-labelledby="feed-title">
        <h2 id="feed-title">Activity</h2>
        {completions.length === 0
          ? <div className="feed-empty">
              <Icon name="route" size={28}/>
              <strong>No plans finished yet</strong>
              <p>Pick a plan, tap “Do this plan” and walk it. It’ll show up here with its route.</p>
              <div>
                <button type="button" className="plan-primary" onClick={onClose}>Find a plan</button>
                <button type="button" className="plan-secondary" onClick={() => onSample(sampleActivity(walks, walkStats))}>Load sample activity</button>
              </div>
            </div>
          : <ol className="feed-list">
              {completions.map(c => <li key={c.id}>
                <article className="activity">
                  <header>
                    <Avatar name={profile.name} size={38}/>
                    <div>
                      <small>{dayLabel(c.completedAt)} · {c.area}</small>
                      <h3><button type="button" onClick={() => onOpenWalk(c.walkId)}>{c.title}</button></h3>
                    </div>
                    {ranking.includes(c.walkId) && <span className="rank-badge">#{ranking.indexOf(c.walkId) + 1}</span>}
                  </header>
                  <div className="activity-stats">
                    <div><span>Distance</span><strong>{c.miles} mi</strong></div>
                    <div><span>Stops</span><strong>{c.stops}</strong></div>
                    <div><span>Time</span><strong>{timeLabel(c.minutes)}</strong></div>
                  </div>
                  <button type="button" className="activity-map" onClick={() => onOpenWalk(c.walkId)} aria-label={`Open ${c.title} on the map`}>
                    <RouteThumb path={c.path}/>
                  </button>
                </article>
              </li>)}
            </ol>}
      </section>

      <section className="profile-ranking card-block" aria-labelledby="ranking-title">
        <h2 id="ranking-title">Your ranking</h2>
        {unranked.length > 0 && <RankPrompt key={unranked[0]} newId={unranked[0]} ranking={ranking} titleOf={titleOf} onDone={onRank}/>}
        {ranking.length
          ? <ol className="ranking-list">
              {ranking.map((id, i) => <li key={id}>
                <span className="ranking-pos">{i + 1}</span>
                <button type="button" onClick={() => onOpenWalk(id)}>{titleOf(id)}</button>
                <small>{timesDone(id) > 1 ? `${timesDone(id)}×` : ""}</small>
              </li>)}
            </ol>
          : unranked.length === 0 && <p className="muted">Finish a plan and you’ll rank it here, one quick question at a time.</p>}
      </section>

      <section className="profile-trophies card-block" aria-labelledby="trophy-title">
        <h2 id="trophy-title">Trophy case</h2>
        <ul className="trophies">
          {BADGES.map(badge => {
            const value = Math.min(badge.goal, badge.value(stats));
            const earned = value >= badge.goal;
            return <li key={badge.id} className={earned ? "earned" : "locked"}>
              <span className="trophy-icon" style={{ background: earned ? badge.color : undefined }}><Icon name={badge.icon} size={22}/></span>
              <strong>{badge.name}</strong>
              <small>{earned ? badge.desc : `${round1(value)} / ${badge.goal} · ${badge.desc}`}</small>
              {!earned && <span className="trophy-progress"><span style={{ width: `${(value / badge.goal) * 100}%` }}/></span>}
            </li>;
          })}
        </ul>
      </section>

      <section className="profile-plans card-block" aria-labelledby="plans-title">
        <h2 id="plans-title">Your plans</h2>
        {customWalks.length
          ? <ul className="my-plans">
              {customWalks.map(walk => <li key={walk.id}>
                <button type="button" onClick={() => onOpenWalk(walk.id)}>
                  <strong>{walk.title}</strong>
                  <small>{walk.stops.length} stops · {walkStats(walk).miles} mi</small>
                </button>
                <button type="button" className="my-plan-delete" aria-label={`Delete ${walk.title}`}
                  onClick={() => { if (window.confirm(`Delete “${walk.title}”?`)) onDeleteWalk(walk.id); }}><Icon name="close" size={16}/></button>
              </li>)}
            </ul>
          : <p className="muted">Fork a plan or tap places on the map to make your own. Saved plans show up here.</p>}
      </section>

      {completions.length > 0 && <p className="profile-footer">
        Saved in this browser only.{" "}
        <button type="button" onClick={() => { if (window.confirm("Clear your activity and ranking? Your saved plans stay.")) onReset(); }}>Clear activity</button>
      </p>}
    </div>
  </div>;
}
