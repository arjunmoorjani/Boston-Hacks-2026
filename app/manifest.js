export const dynamic = "force-static";

export default function manifest() {
  return {
    name: "Routable Boston",
    short_name: "Routable",
    start_url: "/",
    display: "standalone",
    background_color: "#f8f7f2",
    theme_color: "#f8f7f2",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  };
}
