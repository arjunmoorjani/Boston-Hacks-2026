import "./styles.css";

export const metadata = {
  title: "Routable | Boston walks",
  description: "Explore Boston one walk at a time.",
  appleWebApp: { capable: true, title: "Routable", statusBarStyle: "default" },
  icons: { icon: "/icon.svg", apple: "/apple-touch-icon.png" },
};

export const viewport = { themeColor: "#f8f7f2", viewportFit: "cover" };

export default function Layout({ children }) {
  return <html lang="en"><body>{children}</body></html>;
}
