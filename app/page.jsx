"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { MapIcon, UserIcon } from "@hugeicons/core-free-icons";
import { AuthGate } from "./auth-gate";
import { BostonMap } from "./boston-map";
import { GoogleBostonMap } from "./google-boston-map";
import { Icon } from "./icons";
import { RouteList } from "./route-list";
import { RouteFilters } from "./route-filters";
import { PlaceProfile } from "./place-profile";
import { DirectionsPanel, TRAVEL_MODES } from "./directions-panel";
import { PlanDetail } from "./plan-detail";
import { PlanEditor } from "./plan-editor";
import { ProfilePage, RankPrompt } from "./profile";
import { LogPage } from "./log-page";
import { walks as fallbackWalks, walkStats } from "./walks";
import { buildWalkingRoute, googleMapsConfigured } from "../lib/google-maps.mjs";
import { followSteps, legFresh, legKey, legMinutes, legsOf, navSteps, splitPathAtStops, travelTotal } from "../lib/legs.mjs";
import { NavBanner } from "./nav-banner";
import { popularWalkIds } from "../lib/popular.mjs";
import { endPlaceSearchSession, googlePlaceSuggestions, localPlaceMatches, mergePlaceResults, MIN_GOOGLE_CHARS } from "../lib/place-search.mjs";
import { fetchPlaceProfile } from "../lib/place-profile.mjs";
import { fetchDirections } from "../lib/directions.mjs";
import { getLocationOnce, watchUserLocation } from "../lib/location.mjs";
import { saveOuting } from "../lib/save-outing.mjs";
import { loadRoutes, routesForMap } from "../lib/routes.mjs";
import { anyActive, applyFilters, categoryCounts, emptyFilters, matchesQuery } from "../lib/route-filters.mjs";
import { buildSuggestData } from "../lib/suggest-data.mjs";
import { completionFor, emptyProfile, guestDisplayName, loadProfile, saveProfile, toggleFavorite } from "../lib/profile-store.mjs";

const MapView = googleMapsConfigured ? GoogleBostonMap : BostonMap;
const maxStops = 5;
const LEG_MODES_KEY = "sidewalk.legModes.v1";
const supabaseReady = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);

const emptyWalk = { id: "no-route", title: "", area: "", category: "", description: "", stops: [], path: [] };

export default function Home() {
  return <AuthGate>{account => <Planner key={account.user?.id ?? "guest"} {...account}/>}</AuthGate>;
}

function Planner({ user, client, guestName, onSignOut, onExitGuest }) {
  const userId = user?.id;
  const [walks, setWalks] = useState(fallbackWalks);
  const [walksStatus, setWalksStatus] = useState("Loading premade walks…");
  const [selectedWalkId, setSelectedWalkId] = useState(null);
  const [filters, setFilters] = useState(emptyFilters); // one set of filters for the list and the map
  const [selected, setSelected] = useState(null);
  const [following, setFollowing] = useState(true);
  const [location, setLocation] = useState(null);
  const [locationStatus, setLocationStatus] = useState("");
  const [step, setStep] = useState(null);
  const [complete, setComplete] = useState(false);
  const [profile, setProfile] = useState(emptyProfile); // name, finished plans, ranking, saved plans (this browser)
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [accountName, setAccountName] = useState(null);
  const [nameLoading, setNameLoading] = useState(Boolean(userId));
  const [nameError, setNameError] = useState("");
  const signupName = user?.user_metadata?.display_name;
  const displayName = userId ? accountName || (typeof signupName === "string" && signupName.trim()) || "You" : guestDisplayName(profile.name);
  const [showProfile, setShowProfile] = useState(false);
  const [showLog, setShowLog] = useState(false);
  const [draftPlaces, setDraftPlaces] = useState([]);
  const [savingOuting, setSavingOuting] = useState(false);
  const [saveFeedback, setSaveFeedback] = useState(null);
  const [planNotice, setPlanNotice] = useState("");
  const [placeProfile, setPlaceProfile] = useState(null); // { placeId, fallback } for the place card   // shown on the plan right after saving it
  const savedOuting = useRef(null);
  const [building, setBuilding] = useState(false);
  const [routeError, setRouteError] = useState("");
  const [view, setView] = useState("list"); // sheet shows: "list" of walks, one plan's "detail", or the plan "edit"or
  const [forkOf, setForkOf] = useState(null);    // { heading } for the editor
  const [draftTitle, setDraftTitle] = useState("");
  const [removed, setRemoved] = useState(null);   // last removed stop, for Undo
  const [editFrom, setEditFrom] = useState("list");
  const [toStartMode, setToStartMode] = useState("WALKING");
  // In-app directions: where to, how, and the result. Your location is used for the request only, never stored.
  const [dirTarget, setDirTarget] = useState(null);        // { name, point, placeId? }
  const [dirMode, setDirMode] = useState("WALKING");
  const [dirState, setDirState] = useState({ status: "idle" });
  const [dirOrigin, setDirOrigin] = useState(null);
  const [dirFocus, setDirFocus] = useState(null);
  const [dirFrom, setDirFrom] = useState("list");
  // Getting between stops: how you travel each leg (kept for this browser session) and the routes fetched for them.
  // Walking legs need no Google call until you ask for their steps or follow them on the walk.
  const [legModes, setLegModes] = useState({});   // { walkId: { legIndex: "TRANSIT" } }, walking when unset
  const [legRoutes, setLegRoutes] = useState({}); // legKey -> { status, result, error, at }
  const legRoutesRef = useRef(legRoutes);
  legRoutesRef.current = legRoutes;
  const [navIndex, setNavIndex] = useState(0);    // the turn-by-turn step you're on during a walk
  const [navHidden, setNavHidden] = useState(false);
  const suggestData = useMemo(() => buildSuggestData(walks), [walks]);
  const allWalks = useMemo(() => [...walks, ...profile.customWalks], [walks, profile.customWalks]);
  // Catalog walks get every filter; your own plans only the search (they have no category/tags).
  // Favorites: walks you've hearted (this browser). The Favorites tab narrows the list and the map to them.
  const [listTab, setListTab] = useState("all");
  const favoriteIds = useMemo(() => new Set(profile.favorites ?? []), [profile.favorites]);
  const availableWalks = useMemo(() => {
    const all = [...applyFilters(walks, filters), ...profile.customWalks.filter(item => matchesQuery(item, filters.query))];
    return listTab === "favorites" ? all.filter(item => favoriteIds.has(item.id)) : all;
  }, [walks, filters, profile.customWalks, listTab, favoriteIds]);
  // category chip counts follow the tab: on Favorites they count favorites
  const counts = useMemo(() => categoryCounts(listTab === "favorites" ? walks.filter(item => favoriteIds.has(item.id)) : walks, filters),
    [walks, filters, listTab, favoriteIds]);
  const popularIds = useMemo(() => popularWalkIds(walks, profile.completions), [walks, profile.completions]); // these glow on the map
  const baseWalk = allWalks.find(item => item.id === selectedWalkId) ?? null; // a filter never closes the plan you're looking at
  const walk = baseWalk;
  const stats = walk ? walkStats(walk) : null;
  // While editing, the map shows the draft (straight lines between stops) so reordering is visible right away.
  const draftWalk = useMemo(() => {
    if (view !== "edit" || !draftPlaces.length) return null;
    const stops = draftPlaces.map(place => ({ id: place.osm_id, name: place.name, address: place.address, point: [Number(place.latitude), Number(place.longitude)] }));
    return { id: `draft:${stops.map(stop => stop.id).join("|")}`, area: "Draft plan", category: "Draft", symbol: "route", stops, path: stops.map(stop => stop.point) };
  }, [view, draftPlaces]);

  // ---------- legs between stops ----------
  const legs = useMemo(() => legsOf(walk), [walk]);
  const walkLegModes = walk ? legModes[walk.id] : null;
  const modeOf = useCallback(index => walkLegModes?.[index] ?? "WALKING", [walkLegModes]);
  const entryOf = useCallback((leg, mode) => legRoutes[legKey(leg.from, leg.to, mode)] ?? null, [legRoutes]);
  const legRows = useMemo(() => legs.map(leg => {
    const mode = modeOf(leg.index), entry = entryOf(leg, mode);
    return { ...leg, mode, entry, minutes: legMinutes(leg, mode, entry) };
  }), [legs, modeOf, entryOf]);
  const travel = useMemo(() => travelTotal(legs, modeOf, entryOf), [legs, modeOf, entryOf]);
  // On the map, legs you ride or bike are drawn from their route; walking legs keep the walk's own line.
  const riddenLegs = legRows.filter(leg => leg.mode !== "WALKING" && leg.entry?.status === "ready");
  const legSegments = useMemo(() => riddenLegs.flatMap(leg => leg.entry.result.segments), [legRows]); // eslint-disable-line react-hooks/exhaustive-deps
  const walkForMap = useMemo(() => {
    if (!walk || !riddenLegs.length) return walk;
    const ridden = new Set(riddenLegs.map(leg => leg.index));
    return { ...walk, paths: splitPathAtStops(walk.path, walk.stops).filter((_, index) => !ridden.has(index)) };
  }, [walk, legRows]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------- turn-by-turn while doing a walk: from the stop you left to the one you're heading to ----------
  const navLeg = view === "detail" && step != null && step > 0 ? legs[step - 1] ?? null : null;
  const navMode = navLeg ? modeOf(navLeg.index) : null;
  const navEntry = navLeg ? entryOf(navLeg, navMode) : null;
  const navKey = navLeg ? legKey(navLeg.from, navLeg.to, navMode) : null;
  const navList = useMemo(() => navEntry?.status === "ready" ? navSteps(navEntry.result, navLeg.to.name) : [], [navEntry, navLeg]);
  const navFollow = useMemo(() => followSteps(navList, navIndex, following ? location : null), [navList, navIndex, following, location]);
  const navStep = navList[navFollow.index];
  const navFocus = useMemo(() => navLeg && !navHidden && navEntry?.status === "ready"
    ? (navStep?.path?.length ? navStep.path : [navLeg.to.point]) : null, [navLeg, navHidden, navEntry, navStep]);

  const mapWalk = view === "directions" ? emptyWalk : draftWalk ?? (view === "detail" ? walkForMap : null) ?? emptyWalk;
  const mapWalks = useMemo(() => view === "directions" ? []
    : draftWalk ? [draftWalk]
    : routesForMap(availableWalks, view === "detail" ? selectedWalkId : null).map(item => item.id === walkForMap?.id ? walkForMap : item),
  [draftWalk, availableWalks, view, selectedWalkId, walkForMap]);
  const closeProfile = useCallback(() => setShowProfile(false), []);
  const mapWalkRef = useRef(mapWalk);
  mapWalkRef.current = mapWalk;
  // Tapping a stop (pin or list row) highlights it and opens its place card when it's a Google place.
  const selectStop = useCallback(index => {
    setSelected(index);
    const stop = mapWalkRef.current?.stops[index];
    if (stop?.placeId && googleMapsConfigured) setPlaceProfile({ placeId: stop.placeId, fallback: { name: stop.name, address: stop.address, point: stop.point } });
  }, []);
  const openPlace = useCallback((placeId, fallback) => setPlaceProfile({ placeId, fallback }), []);

  // ---------- finding places by name from the search bar ----------
  // Stops on our walks match instantly; Google's suggestions come in after a short pause in typing.
  const [placeSearch, setPlaceSearch] = useState({ query: "", google: [], loading: false });
  const [searchedPlace, setSearchedPlace] = useState(null); // { placeId, name, point }: pinned on the map
  const localPlaces = useMemo(() => localPlaceMatches(suggestData.places, filters.query), [suggestData, filters.query]);
  const placeResults = useMemo(() => filters.query.trim()
    ? mergePlaceResults(localPlaces, placeSearch.query === filters.query ? placeSearch.google : []) : [],
  [filters.query, localPlaces, placeSearch]);
  useEffect(() => {
    const query = filters.query;
    setSearchedPlace(null);
    if (!googleMapsConfigured || view !== "list" || query.trim().length < MIN_GOOGLE_CHARS) {
      setPlaceSearch({ query, google: [], loading: false });
      return;
    }
    let stale = false;
    setPlaceSearch(old => ({ ...old, loading: true }));
    const timer = setTimeout(() => {
      googlePlaceSuggestions(query)
        .then(google => { if (!stale) setPlaceSearch({ query, google, loading: false }); })
        .catch(() => { if (!stale) setPlaceSearch({ query, google: [], loading: false }); }); // our own stops still show
    }, 300);
    return () => { stale = true; clearTimeout(timer); };
  }, [filters.query, view]);

  function pickPlace(place) {
    endPlaceSearchSession();
    openPlace(place.placeId, { name: place.name, address: place.detail, point: place.point });
    setSearchedPlace({ placeId: place.placeId, name: place.name, point: place.point });
    collapseSheet();
    // Google's suggestions come without a location: the place card fetches it anyway (cached), so reuse that.
    if (!place.point) fetchPlaceProfile(place.placeId).then(profile => {
      if (profile.point) setSearchedPlace(old => old?.placeId === place.placeId ? { ...old, point: profile.point } : old);
    }).catch(() => {});
  }
  const placeFocus = useMemo(() => searchedPlace?.point ? [searchedPlace.point] : null, [searchedPlace]);
  // The place whose card is open while exploring (picked from search or tapped on the map): pinned on the map,
  // and Google's other icons are hidden until the card closes.
  const selectedPlace = useMemo(() => {
    if (view !== "list" || !placeProfile) return null;
    if (searchedPlace?.placeId === placeProfile.placeId) return searchedPlace.point ? searchedPlace : null;
    const point = placeProfile.fallback?.point;
    return point ? { placeId: placeProfile.placeId, name: placeProfile.fallback?.name ?? "", point } : null;
  }, [view, placeProfile, searchedPlace]);
  function closePlace() {
    setPlaceProfile(null);
    setSearchedPlace(null);
  }
  const destination = walk ? walk.stops[step ?? selected ?? 0] : null;
  const directionsMap = useMemo(() => view === "directions" && dirTarget ? {
    destination: dirTarget.point, destinationName: dirTarget.name, origin: dirOrigin,
    segments: dirState.status === "ready" ? dirState.result.segments : [], focus: dirFocus,
  } : null, [view, dirTarget, dirOrigin, dirState, dirFocus]);

  useEffect(() => {
    const controller = new AbortController();
    loadRoutes({ signal: controller.signal }).then(routes => {
      if (controller.signal.aborted) return;
      setWalks(routes);
      setWalksStatus("");
    }).catch(error => {
      if (!controller.signal.aborted) setWalksStatus(`${error.message} Showing built-in walks.`);
    });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const stored = loadProfile();
    setProfile(guestName === null ? stored : { ...stored, name: guestName }); // browser-only, so after the first render
    setProfileLoaded(true);
  }, [guestName]);
  useEffect(() => {
    if (profileLoaded) saveProfile(profile);
  }, [profile, profileLoaded]);
  const updateProfile = change => setProfile(old => ({ ...old, ...(typeof change === "function" ? change(old) : change) }));

  useEffect(() => {
    if (!userId) return;
    const controller = new AbortController();
    async function loadName() {
      try {
        const { data, error } = await client.from("profiles").select("display_name")
          .eq("id", userId).abortSignal(controller.signal).single();
        if (error) throw error;
        if (!controller.signal.aborted) setAccountName(data.display_name);
      } catch {
        if (!controller.signal.aborted) setNameError("Couldn’t load your account profile.");
      } finally {
        if (!controller.signal.aborted) setNameLoading(false);
      }
    }
    loadName();
    return () => controller.abort();
  }, [client, userId]);

  async function renameProfile(name) {
    if (!userId) {
      updateProfile({ name });
      return;
    }
    const { data, error } = await client.from("profiles").update({ display_name: name })
      .eq("id", userId).select("display_name").single();
    if (error) throw error;
    setAccountName(data.display_name);
    setNameError("");
  }

  // A leg's route is fetched once when it's needed (a mode other than walking, its steps, or following it),
  // then reused; transit routes are fetched again after a couple of minutes because departure times change.
  const ensureLeg = useCallback(async (from, to, mode) => {
    const key = legKey(from, to, mode);
    if (!googleMapsConfigured || legFresh(legRoutesRef.current[key], mode)) return;
    legRoutesRef.current = { ...legRoutesRef.current, [key]: { status: "loading" } }; // no double request in the same tick
    setLegRoutes(old => ({ ...old, [key]: { status: "loading" } }));
    try {
      const result = await fetchDirections(from.point, to.point, mode);
      setLegRoutes(old => ({ ...old, [key]: { status: "ready", result, at: Date.now() } }));
    } catch (error) {
      const quota = /quota|RESOURCE_EXHAUSTED/i.test(error?.message ?? "");
      setLegRoutes(old => ({ ...old, [key]: { status: "error", error: quota ? "Google’s directions limit is used up for today." : error?.message || "Couldn’t get this route." } }));
    }
  }, []);

  useEffect(() => {
    try { setLegModes(JSON.parse(sessionStorage.getItem(LEG_MODES_KEY) ?? "{}")); } catch {}
  }, []);

  function setLegMode(index, mode) {
    const leg = legs[index];
    if (!walk || !leg) return;
    setLegModes(old => {
      const forWalk = { ...old[walk.id], [index]: mode };
      if (mode === "WALKING") delete forWalk[index];
      const next = { ...old, [walk.id]: forWalk };
      try { sessionStorage.setItem(LEG_MODES_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
    if (mode !== "WALKING") ensureLeg(leg.from, leg.to, mode);
  }

  // Opening a walk where you picked the T or a bike for a leg: get those routes (walking legs stay free).
  useEffect(() => {
    if (view !== "detail") return;
    for (const leg of legs) if (modeOf(leg.index) !== "WALKING") ensureLeg(leg.from, leg.to, modeOf(leg.index));
  }, [view, legs, modeOf, ensureLeg]);

  // Each new leg of the walk starts at its first step, with its route fetched.
  useEffect(() => {
    setNavIndex(0);
    setNavHidden(false);
    if (navLeg) ensureLeg(navLeg.from, navLeg.to, navMode);
  }, [navKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Walking past the end of a step moves on to the next one.
  useEffect(() => {
    if (navFollow.index !== navIndex) setNavIndex(navFollow.index);
  }, [navFollow.index]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!following) return;
    if (!window.isSecureContext || !navigator.geolocation) {
      setLocationStatus("Location needs a secure connection (HTTPS) or localhost.");
      setFollowing(false);
      return;
    }
    setLocationStatus("Finding your location…");
    return watchUserLocation(navigator.geolocation, {
      onLocation: nextLocation => {
        setLocation(nextLocation);
        setLocationStatus("");
      },
      onError: message => {
        setLocationStatus(message);
        setFollowing(false);
      },
    });
  }, [following]);

  const sheet = useRef(null);
  // Phones scroll the page to move the sheet; on desktop the sheet scrolls by itself.
  const sheetTop = () => (sheet.current?.offsetTop ?? 0) - 64;
  function collapseSheet() {
    window.scrollTo({ top: 0, behavior: "smooth" });
    sheet.current?.scrollTo({ top: 0, behavior: "smooth" });
  }
  function toggleSheet() {
    if (window.scrollY > 20) collapseSheet();
    else window.scrollTo({ top: sheetTop(), behavior: "smooth" });
  }

  function resetWalkInteraction() {
    setPlanNotice("");
    setSelected(null);
    setStep(null);
    setComplete(false);
  }

  function changeRoute(id) {
    setSelectedWalkId(id);
    resetWalkInteraction();
  }

  function openMapScreen() {
    setShowProfile(false);
    setShowLog(false);
    setView("list");
    changeRoute(null);
    collapseSheet();
  }

  function logPreviousExcursion({ name, locations, legModes = [], route, date, priceCategory = "FREE", peopleWith = 0, comments, photoPaths = [], activityId = null }) {
    const walkId = `logged:${crypto.randomUUID()}`;
    const stops = locations.map((location, index) => ({
      id: location.placeId ? `google:${location.placeId}` : `${walkId}:${index}`,
      placeId: location.placeId,
      name: location.label,
      address: location.address,
      point: location.point,
      note: index === 0 ? "Excursion starting point." : "A stop on this excursion.",
    }));
    const walk = {
      ...route,
      id: walkId,
      title: name,
      area: "Your excursion",
      category: "Logged excursion",
      symbol: "route",
      description: comments || "A previous excursion you logged.",
      legModes,
      stops,
    };
    const completion = {
      id: crypto.randomUUID(),
      walkId,
      title: name,
      area: "Your excursion",
      category: "Logged excursion",
      tLines: [],
      path: route.path,
      stops: stops.length,
      miles: Number((route.meters / 1609.344).toFixed(1)),
      minutes: Math.max(1, Math.round(route.minutes)),
      completedAt: new Date(`${date}T12:00:00`).toISOString(),
      priceCategory,
      peopleWith,
      comments,
      photoPaths,
      activityId,
    };
    updateProfile(old => ({
      customWalks: [...old.customWalks, walk],
      completions: [completion, ...old.completions],
    }));
  }

  // ---------- in-app directions ----------
  // Open directions to a stop or place. Your location is looked up once for the request.
  function openDirections(target, mode = "WALKING") {
    if (!target?.point || !googleMapsConfigured) return;
    setPlaceProfile(null);
    setDirTarget(target);
    setDirMode(mode);
    setDirFocus(null);
    setDirFrom(view === "directions" ? dirFrom : view);
    setView("directions");
    collapseSheet();
    loadDirections(target, mode, null);
  }

  async function loadDirections(target, mode, knownOrigin) {
    setDirFocus(null);
    let origin = knownOrigin;
    try {
      if (!origin) {
        setDirState({ status: "locating" });
        origin = await getLocationOnce();
        setDirOrigin(origin);
      }
      setDirState({ status: "loading" });
      const result = await fetchDirections(origin, target.point, mode);
      setDirState({ status: "ready", result });
    } catch (error) {
      const quota = /quota|RESOURCE_EXHAUSTED/i.test(error?.message ?? "");
      setDirState({ status: "error", error: quota ? "Google’s directions limit is used up for today. Try again later, or use Google Maps below."
        : error?.message || "Couldn’t get directions. Try again." });
    }
  }

  function changeDirMode(mode) {
    if (mode === dirMode) return;
    setDirMode(mode);
    loadDirections(dirTarget, mode, dirOrigin);
  }

  function closeDirections() {
    setView(dirFrom === "directions" ? "list" : dirFrom);
    setDirTarget(null);
    setDirState({ status: "idle" });
    setDirOrigin(null); // don't keep the user's location around
    setDirFocus(null);
    collapseSheet();
  }

  function openWalk(id) {
    if (!allWalks.some(item => item.id === id)) return false;
    changeRoute(id);
    setView("detail");
    setShowProfile(false);
    collapseSheet();
    return true;
  }

  function deleteCustomWalk(id) {
    updateProfile(old => ({ customWalks: old.customWalks.filter(item => item.id !== id), ranking: old.ranking.filter(item => item !== id) }));
    if (selectedWalkId === id) { changeRoute(null); setView("list"); }
  }

  function advance() {
    if (step === walk.stops.length - 1) {
      setStep(null);
      setSelected(null);
      setComplete(true);
      updateProfile(old => ({ completions: [completionFor(walk, stats), ...old.completions] }));
      return;
    }
    const next = step === null ? 0 : step + 1;
    setStep(next);
    setSelected(next);
    setComplete(false);
  }

  function startEditing(places, title, heading) {
    setDraftPlaces(places.slice(0, maxStops));
    setDraftTitle(title);
    setSaveFeedback(null);
    setForkOf({ heading });
    setRemoved(null);
    setRouteError("");
    setEditFrom(view === "edit" ? editFrom : view);
    setView("edit");
    setSelected(null);
    collapseSheet();
  }

  // Tapping "Add to walk" on a map place: add it to the plan being edited, or start a new plan with it.
  function addPlace(place) {
    if (building || savingOuting) return;
    if (view !== "edit") return startEditing([place], "My plan", "New plan");
    setDraftPlaces(items => items.length >= maxStops || items.some(item => item.osm_id === place.osm_id) ? items : [...items, place]);
    setRemoved(null);
    setRouteError("");
  }

  // What the place card's add button says: add it, it's already in the plan, or the plan is full.
  function addLabelFor(placeId) {
    if (building || savingOuting) return "Saving…";
    if (view !== "edit") return "Add to plan"; // starts a new plan with this place
    if (draftPlaces.some(place => place.placeId === placeId || place.osm_id === `google:${placeId}`)) return "In your plan";
    return draftPlaces.length >= maxStops ? "Plan is full" : "Add to plan";
  }

  function moveStop(index, change) {
    setDraftPlaces(items => {
      const next = [...items];
      const target = index + change;
      if (target < 0 || target >= next.length) return items;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
    setSelected(null);
  }

  function removeStop(index) {
    setRemoved({ place: draftPlaces[index], index });
    setDraftPlaces(items => items.filter((_, i) => i !== index));
    setSelected(null);
  }

  function undoRemove() {
    if (!removed) return;
    setDraftPlaces(items => items.length >= maxStops ? items : [...items.slice(0, removed.index), removed.place, ...items.slice(removed.index)]);
    setRemoved(null);
  }

  function cancelEditing() {
    setDraftPlaces([]);
    setRemoved(null);
    setRouteError("");
    setView(editFrom === "edit" ? "detail" : editFrom);
    collapseSheet();
  }

  // Modify: copy this plan's stops into the editor.
  // Continue: start a follow-up plan from this plan's last stop plus the picked "Keep going" stops.
  function fork(extra = []) {
    const asPlace = stop => ({
      placeId: stop.placeId,
      osm_id: stop.placeId ? `google:${stop.placeId}` : stop.id ?? stop.name, // same id as tapping that place on the map
      name: stop.name, latitude: stop.point?.[0] ?? stop.lat, longitude: stop.point?.[1] ?? stop.lng,
      address: stop.address ?? "", tags: { description: stop.note ?? "" },
    });
    if (extra.length) {
      const last = walk.stops.at(-1);
      const details = new Map(suggestData.places.map(place => [place.placeId, place]));
      startEditing([last, ...extra.map(stop => ({ ...details.get(stop.placeId), ...stop }))].map(asPlace), `After ${walk.title}`, `Continue from ${last.name}`);
    } else {
      startEditing(walk.stops.map(asPlace), `${walk.title}, your version`, `Modifying ${walk.title}`);
    }
  }

  // One "Save plan": saves the outing to Supabase (when it's set up), then builds the walking route,
  // keeps the plan on this device and opens it. Without Supabase it still saves locally.
  async function savePlan() {
    if (savingOuting || building || draftPlaces.length < 2 || !draftTitle.trim()) return;
    setSaveFeedback(null);
    let notice = "Saved on this device only (Supabase isn’t set up here).";
    const placeIds = draftPlaces.map(stop => stop.placeId);
    if (supabaseReady && placeIds.every(Boolean)) {
      const key = `${draftTitle.trim()}|${placeIds.join(",")}`;
      if (savedOuting.current !== key) { // don't save twice if only the route step failed and they retry
        setSavingOuting(true);
        try {
          await saveOuting(draftTitle, placeIds);
          savedOuting.current = key;
        } catch (error) {
          setSaveFeedback({ error: true, message: error?.message || "Couldn’t save the plan." });
          return;
        } finally {
          setSavingOuting(false);
        }
      }
      notice = "Plan saved.";
    }
    const result = await createWalk();
    if (result) setPlanNotice(notice + (typeof result === "string" ? result : ""));
  }

  async function createWalk() {
    if (building || draftPlaces.length < 2 || !draftTitle.trim()) return false;
    const stops = draftPlaces.map(place => ({
      id: place.osm_id, placeId: place.placeId ?? null, name: place.name, point: [Number(place.latitude), Number(place.longitude)],
      address: place.address || [place.tags?.["addr:housenumber"], place.tags?.["addr:street"]].filter(Boolean).join(" "),
      note: place.tags?.description || "A stop on your custom walk.",
    }));
    setBuilding(true);
    setRouteError("");
    try {
      // If Google can't build the walking route (offline, quota), still save: straight lines between stops.
      let route, routeNote = "";
      try {
        route = await buildWalkingRoute(stops);
      } catch {
        route = { path: stops.map(stop => stop.point), warnings: [] };
        routeNote = " Walking route unavailable right now, so the map shows straight lines.";
      }
      const saved = {
        ...route, id: `custom:${Date.now()}`, title: draftTitle.trim(), area: "Your plan", category: "Custom walk",
        symbol: "route", description: "Visit your selected places in the order shown.", stops,
      };
      updateProfile(old => ({ customWalks: [...old.customWalks, saved] }));
      changeRoute(saved.id);
      setView("detail");
      setDraftPlaces([]);
      setRemoved(null);
      collapseSheet();
      return routeNote || true;
    } catch {
      setRouteError("Couldn’t get a walking route for these stops. Try again, or swap a stop that’s far away.");
      return false;
    } finally {
      setBuilding(false);
    }
  }

  return <main className="app">
    <div className="map-panel">
      <MapView walk={mapWalk} walks={mapWalks} selected={selected} onSelect={selectStop} location={following ? location : null}
        activeWalkId={view === "detail" ? selectedWalkId : null} onOpenWalk={openWalk}
        legSegments={view === "detail" ? legSegments : null} focusPath={navFocus ?? (view === "list" ? placeFocus : null)}
        highlight={selectedPlace}
        doneStops={view === "detail" && step != null ? step : 0} popularIds={popularIds} favoriteIds={favoriteIds}
        onPlaceClick={openPlace} directions={directionsMap}
        following={following} locationStatus={locationStatus} />
      {navLeg && !navHidden && <NavBanner leg={navLeg} mode={navMode} entry={navEntry} steps={navList} index={navFollow.index}
        metersLeft={navFollow.metersLeft} onIndex={setNavIndex} onHide={() => setNavHidden(true)}
        onRetry={() => ensureLeg(navLeg.from, navLeg.to, navMode)}/>}
    </div>

    {/* Phones: transparent space over the map; scrolling the page pulls the sheet up over it. */}
    <div className="sheet-spacer" aria-hidden="true"/>

    <section className="bottom-sheet" ref={sheet} aria-label={view === "edit" ? "Edit plan" : undefined}
      aria-labelledby={view === "detail" ? "walk-title" : view === "list" ? "more-walks" : view === "directions" ? "directions-title" : undefined}>
      <button type="button" className="sheet-handle" onClick={toggleSheet} aria-label="Expand or collapse the panel"><span/></button>
      {view === "directions" && dirTarget
        ? <DirectionsPanel target={dirTarget} mode={dirMode} onMode={changeDirMode} state={dirState}
            focus={dirFocus} onFocus={index => { setDirFocus(index); collapseSheet(); }}
            onBack={closeDirections} onRetry={() => loadDirections(dirTarget, dirMode, dirOrigin)}/>
        : view === "edit"
        ? <PlanEditor heading={forkOf?.heading ?? "New plan"} title={draftTitle} onTitle={setDraftTitle}
            places={draftPlaces} maxStops={maxStops} onMove={moveStop} onRemove={removeStop}
            removed={removed} onUndo={undoRemove} onCancel={cancelEditing} onSave={savePlan}
            building={building} error={routeError}
            savingOuting={savingOuting} saveFeedback={saveFeedback}/>
        : view === "detail" && walk
        ? <PlanDetail walk={walk} stats={stats} suggestData={suggestData} step={step} complete={complete} selected={selected}
            favorite={favoriteIds.has(walk.id)} onFavorite={() => updateProfile(old => ({ favorites: toggleFavorite(old.favorites, walk.id) }))}
            onDirections={openDirections}
            onBack={() => { changeRoute(null); setView("list"); collapseSheet(); }}
            onSelectStop={index => { selectStop(index); collapseSheet(); }}
            onAdvance={advance} onEndWalk={() => { setStep(null); setSelected(null); }} onFork={fork}
            legs={legRows} travel={travel} onLegMode={setLegMode}
            onLegSteps={index => legs[index] && ensureLeg(legs[index].from, legs[index].to, modeOf(index))}
            navHidden={navHidden && Boolean(navLeg)} onShowNav={() => { setNavHidden(false); collapseSheet(); }}
            routing={<>
                {planNotice && <p className="plan-notice" role="status"><Icon name="check" size={16}/>{planNotice}</p>}
                {walk.warnings?.length > 0 && <p className="route-warning">{walk.warnings.join(" ")}</p>}

                {step == null && <section className="to-start" aria-labelledby="to-start-title">
                  <div className="to-start-heading">
                    <h3 id="to-start-title">Get to start</h3>
                    <div className="travel-modes" role="group" aria-label="Travel mode to the start">
                      {TRAVEL_MODES.map(([mode, label]) => <button key={mode} type="button"
                        aria-pressed={toStartMode === mode} onClick={() => setToStartMode(mode)}>{label}</button>)}
                    </div>
                  </div>
                  <button className="catalog-button directions-start" type="button" disabled={!googleMapsConfigured}
                    onClick={() => openDirections({ name: walk.stops[0].name, point: walk.stops[0].point, placeId: walk.stops[0].placeId }, toStartMode)}>
                    <Icon name={TRAVEL_MODES.find(([mode]) => mode === toStartMode)?.[2] ?? "walk"} size={16}/>Directions to {walk.stops[0].name}
                  </button>
                </section>}


            </>}
            rankSlot={complete && !profile.ranking.includes(walk.id) && <RankPrompt newId={walk.id} ranking={profile.ranking}
              titleOf={id => allWalks.find(item => item.id === id)?.title ?? profile.completions.find(c => c.walkId === id)?.title ?? id}
              onDone={ranking => updateProfile({ ranking })}/>}/>
        : <RouteList walks={availableWalks} selectedId={selectedWalkId} status={walksStatus} onOpen={openWalk}
            places={placeResults} placesLoading={placeSearch.loading} onPickPlace={pickPlace}
            tab={listTab} onTab={setListTab} favoriteIds={favoriteIds}
            filtered={anyActive(filters)} onClear={() => setFilters(emptyFilters)}
            filterBar={<RouteFilters filters={filters} onChange={setFilters} counts={counts}/>}/>}
    </section>
    {placeProfile && <PlaceProfile key={placeProfile.placeId} placeId={placeProfile.placeId} fallback={placeProfile.fallback}
      onClose={closePlace} addLabel={addLabelFor(placeProfile.placeId)}
      onDirections={place => openDirections({ name: place.name, point: place.point, placeId: placeProfile.placeId })}
      onAdd={place => addPlace({
        osm_id: `google:${placeProfile.placeId}`, placeId: placeProfile.placeId, name: place.name,
        latitude: place.point?.[0], longitude: place.point?.[1], address: place.address ?? "",
        tags: { description: place.summary ?? "" },
      })}/>}
    {showProfile && <ProfilePage profile={{ ...profile, name: displayName }} walks={availableWalks} onClose={closeProfile}
      onRename={renameProfile} nameLoading={nameLoading} nameError={nameError}
      onSignOut={onSignOut} onExitGuest={onExitGuest} savingOuting={savingOuting}
      onRank={ranking => updateProfile({ ranking })}
      onOpenWalk={openWalk} onDeleteWalk={deleteCustomWalk} onSample={data => updateProfile(data)}
      onReset={() => updateProfile({ completions: [], ranking: [] })}/>}
    <div hidden={!showLog}><LogPage visible={showLog} onLog={logPreviousExcursion}/></div>
    <nav className="bottom-nav" aria-label="Primary navigation">
      <button type="button" className="bottom-nav-button" aria-label="Map" aria-current={!showProfile && !showLog ? "page" : undefined}
        onClick={openMapScreen}>
        <HugeiconsIcon icon={MapIcon} size={24}/>
      </button>
      <button type="button" className="bottom-nav-log" aria-label="Log" aria-current={showLog ? "page" : undefined}
        onClick={() => { setShowProfile(false); setShowLog(true); }}/>
      <button type="button" className="bottom-nav-button" aria-label="Profile" aria-current={showProfile ? "page" : undefined}
        onClick={() => { setShowLog(false); setShowProfile(true); }}>
        <HugeiconsIcon icon={UserIcon} size={24}/>
      </button>
    </nav>
  </main>;
}
