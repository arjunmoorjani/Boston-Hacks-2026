export const walks = [
  {
    id: "newbury",
    title: "Newbury Dessert Crawl",
    area: "Back Bay",
    category: "Food & drink",
    symbol: "cone",
    description: "Rose-shaped gelato, a bakery cookie, and a slow finish by the Public Garden lagoon.",
    stops: [
      { name: "Amorino Gelato", address: "249 Newbury Street", note: "Start with a rose-shaped scoop of gelato.", point: [42.34959, -71.07995] },
      { name: "Levain Bakery", address: "180 Newbury Street", note: "Split a thick chocolate chip walnut cookie.", point: [42.35057, -71.07728] },
      { name: "Boston Public Garden", address: "Arlington Street entrance", note: "Find a bench by the lagoon for the last bites.", point: [42.35312, -71.06988] },
    ],
    path: [
      [42.34959, -71.07995], [42.34965, -71.07974], [42.34980, -71.07929],
      [42.35047, -71.07730], [42.35057, -71.07728], [42.35047, -71.07730],
      [42.35056, -71.07703], [42.35126, -71.07491], [42.35193, -71.07287],
      [42.35259, -71.07084], [42.35279, -71.07030], [42.35312, -71.06988],
    ],
  },
  {
    id: "harbor",
    title: "Boston Harborwalk",
    area: "Waterfront",
    category: "Sightseeing",
    symbol: "waves",
    description: "Catch the ferries at Long Wharf, then follow the water past the park to the North End.",
    stops: [
      { name: "Long Wharf", address: "Long Wharf, Boston", note: "Watch the ferries come and go.", point: [42.36001, -71.04912] },
      { name: "Christopher Columbus Park", address: "100 Atlantic Avenue", note: "Walk under the trellis by the harbor.", point: [42.36096, -71.05147] },
      { name: "Langone Park", address: "529 Commercial Street", note: "Finish with a view of the harbor from the North End.", point: [42.36700, -71.05576] },
    ],
    path: [
      [42.36001, -71.04912], [42.35982, -71.04983], [42.35993, -71.05093],
      [42.36034, -71.05138], [42.36096, -71.05147], [42.36151, -71.05127],
      [42.36200, -71.05083], [42.36252, -71.05119], [42.36325, -71.05170],
      [42.36426, -71.05224], [42.36517, -71.05291], [42.36603, -71.05374],
      [42.36653, -71.05474], [42.36700, -71.05576],
    ],
  },
];

export function distanceInMeters(a, b) {
  const rad = Math.PI / 180;
  const lat = (b[0] - a[0]) * rad;
  const lng = (b[1] - a[1]) * rad;
  const h = Math.sin(lat / 2) ** 2 + Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(lng / 2) ** 2;
  return 12742000 * Math.asin(Math.sqrt(Math.min(1, h)));
}

export function walkStats(walk) {
  const meters = walk.meters ?? walk.path.slice(1).reduce((sum, point, index) => sum + distanceInMeters(walk.path[index], point), 0);
  const minutes = Number.isFinite(walk.minutes) ? walk.minutes : meters / 75;
  return { miles: (meters / 1609.344).toFixed(1), minutes: Math.round(minutes) };
}
