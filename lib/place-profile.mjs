// Google Maps-style place profiles from Places API (New), fetched in the browser with the Maps key.
// Rating, hours, reviews, website and phone bill at a higher Places tier than name/location,
// so each place is fetched once per session and cached.

import { loadGoogleMaps } from "./google-maps.mjs";
import { bostonClock, isOpenAt } from "./suggest.mjs";

const RICH_FIELDS = [
  "id", "displayName", "formattedAddress", "location", "photos", "rating", "userRatingCount", "priceLevel",
  "regularOpeningHours", "utcOffsetMinutes", "websiteURI", "nationalPhoneNumber", "googleMapsURI",
  "editorialSummary", "primaryTypeDisplayName", "reviews",
];
const BASIC_FIELDS = ["id", "displayName", "formattedAddress", "location", "photos"];

const PRICE = { FREE: "Free", INEXPENSIVE: "$", MODERATE: "$$", EXPENSIVE: "$$$", VERY_EXPENSIVE: "$$$$" };
export const priceLabel = level => PRICE[String(level ?? "").replace(/^PRICE_LEVEL_/, "")] ?? null;

const cache = new Map();

/** Normalized profile for a Google place id. Cached; falls back to basic fields if the rich ones fail. */
export function fetchPlaceProfile(placeId) {
  if (!cache.has(placeId)) {
    const request = load(placeId).catch(error => { cache.delete(placeId); throw error; });
    cache.set(placeId, request);
  }
  return cache.get(placeId);
}

async function load(placeId) {
  const maps = await loadGoogleMaps();
  const { Place } = await maps.importLibrary("places");
  let place = new Place({ id: placeId });
  let rich = true;
  try {
    await place.fetchFields({ fields: RICH_FIELDS });
  } catch {
    rich = false; // e.g. the key isn't allowed the higher tier: still show name, address and photos
    place = new Place({ id: placeId });
    await place.fetchFields({ fields: BASIC_FIELDS });
  }

  // Place.isOpen() is beta-only in the Maps JS API, so work it out from the weekly hours in Boston time.
  const periods = place.regularOpeningHours?.periods;
  const openNow = rich && periods?.length ? isOpenAt({ periods }, bostonClock(new Date())) : null;

  return {
    placeId,
    name: place.displayName || "Place",
    address: place.formattedAddress || "",
    point: place.location ? [place.location.lat(), place.location.lng()] : null,
    type: place.primaryTypeDisplayName || null,
    rating: Number.isFinite(place.rating) ? place.rating : null,
    ratingCount: place.userRatingCount ?? null,
    price: priceLabel(place.priceLevel),
    openNow,
    hours: place.regularOpeningHours?.weekdayDescriptions ?? [],
    website: place.websiteURI || null,
    phone: place.nationalPhoneNumber || null,
    mapsUrl: place.googleMapsURI || `https://www.google.com/maps/place/?q=place_id:${placeId}`,
    summary: typeof place.editorialSummary === "string" ? place.editorialSummary : place.editorialSummary?.text ?? null,
    photos: (place.photos ?? []).slice(0, 6).map(photo => ({
      src: photo.getURI({ maxWidth: 800, maxHeight: 600 }),
      authors: (photo.authorAttributions ?? []).map(author => ({ name: author.displayName || "Google Maps contributor", uri: author.uri || "" })),
    })),
    reviews: (place.reviews ?? []).slice(0, 3).map(review => ({
      author: review.authorAttribution?.displayName || "Google user",
      authorUri: review.authorAttribution?.uri || "",
      authorPhoto: review.authorAttribution?.photoURI || "",
      rating: review.rating ?? null,
      when: review.relativePublishTimeDescription || "",
      text: typeof review.text === "string" ? review.text : review.text?.text ?? "",
    })),
    attributions: place.attributions ?? [],
  };
}

/** Today's line from Google's Monday-first weekday descriptions, using Boston's day of the week. */
export function todaysHours(hours, now = new Date()) {
  if (!hours?.length) return null;
  const day = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "long" }).format(now);
  const line = hours.find(text => text.startsWith(day));
  return line ? line.slice(day.length + 1).trim() : null;
}
