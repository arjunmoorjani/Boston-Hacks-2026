# Design QA: illustrated routes and points

- Source visual truth: `/Users/stevenzhang/Desktop/Screenshot 2026-11-21 at 5.48.03 PM.png` and `/Users/stevenzhang/Desktop/Screenshot 2026-11-21 at 5.47.28 PM.png`
- Implementation screenshot: `/Users/stevenzhang/Desktop/hackboston/art-map-preview.png`
- Viewport: 464 x 766 CSS px, device scale factor 1
- Source pixels: 2290 x 1014 and 2688 x 1094
- Implementation pixels: 464 x 766
- State: mobile map, Cannoli Showdown selected, sheet collapsed to reveal the map

## Full-view comparison evidence

The final target is intentionally scoped to routes and points. The Google basemap, street colors, labels, POI icons, water, parks, controls, and attribution retain their original appearance. The supplied reference language appears only in the app-owned overlays: thick black contours, the record-button purple for every walk, irregular yellow stop markers, and offset red, blue, or yellow shadows. When enabled, the T lines use their official colors inside the same heavy black treatment.

The implementation preserves real road geometry and map interaction. It does not apply a texture, filter, paper wash, or custom styling to the basemap.

## Focused region comparison evidence

No additional crop was needed. The implementation screenshot clearly shows the unchanged Google basemap alongside the customized clustered stop markers, current-location marker, and original T-lines control.

## Required fidelity surfaces

- Fonts and typography: unchanged from the merged application. Map labels remain Google’s original typography.
- Spacing and layout rhythm: unchanged. The map, bottom sheet, and floating navigation retain their existing proportions.
- Colors and visual tokens: every walking route uses the record control's `#5839b5` purple. Points retain the illustrated primary palette, while enabled T lines retain their recognizable MBTA colors. The basemap palette is unchanged.
- Image quality and asset fidelity: no decorative raster texture remains. The reference is translated through functional route and marker rendering only.
- Copy and content: unchanged.

## Interaction and runtime checks

- Selected a route from the walk list.
- Collapsed the sheet to inspect the selected route and markers.
- Confirmed the original Google basemap, original T-lines control, thick official MBTA line geometry, location marker, stop markers, and required attribution render together.
- Browser console: no errors or warnings.
- Automated tests: 27 passed.
- Production build: passed.

## Findings

No actionable P0, P1, or P2 differences remain for the revised scope.

## Comparison history

1. Initial pass: introduced illustrated routes and markers, but the base map still looked largely standard.
2. Second pass: added a generated graph-paper texture and muted the basemap. This matched the references more strongly but changed the map itself.
3. User revision: restore the original map and retain only line and point styling.
4. Final fix: removed the texture asset, map filter, paper wash, and custom T-lines control styling. The final screenshot confirms the Google map is back to its original appearance while the route and marker treatments remain.
5. Follow-up: unified every walk in the record-button purple and added thick, black-outlined T geometry sourced from MBTA GTFS data.

## Implementation checklist

- [x] Preserve the original Google basemap.
- [x] Preserve original Google labels, POIs, controls, and attribution.
- [x] Keep thick black route outlines and purple route fills.
- [x] Render enabled T lines with thick black outlines and official MBTA colors.
- [x] Scale both walk and T-line strokes down nonlinearly at city-wide zoom levels.
- [x] Keep illustrated stop, location, and destination points.
- [x] Remove the generated texture asset and all map-wide filters.
- [x] Verify tests, production build, browser state, and console.

final result: passed
