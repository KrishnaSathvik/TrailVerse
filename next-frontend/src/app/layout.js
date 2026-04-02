import "./globals.css";

import Script from "next/script";
import Providers from "../components/Providers";

export const metadata = {
  title: "TrailVerse — Explore America's 470+ Parks & Sites",
  applicationName: "TrailVerse",
  description: "Browse all 470+ parks and sites with real-time weather, interactive maps, community reviews, park comparison, events, and AI trip planning. Free to explore — no account needed.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    title: "TrailVerse",
    statusBarStyle: "default",
  },
  openGraph: {
    title: "TrailVerse — Explore America's 470+ Parks & Sites",
    description: "Browse all 470+ parks and sites with real-time weather, interactive maps, community reviews, park comparison, events, and AI trip planning. Free to explore — no account needed.",
    type: "website",
  }
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col font-sans bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100">
        <Script
          id="disable-prod-console-noise"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{
            __html: `
              if (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
                console.log = function () {};
                console.info = function () {};
                console.debug = function () {};
              }
            `
          }}
        />
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}
