import "./globals.css";

import Script from "next/script";
import Providers from "../components/Providers";
import GoogleMapsLoader from "../components/maps/GoogleMapsLoader";
import VoiceButton from "../components/voice/VoiceButton";
import { indexablePageRobots } from "@/lib/seo";

const JSON_LD = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name: 'TrailVerse',
  url: 'https://www.nationalparksexplorerusa.com',
  description:
    "Explore 470+ U.S. parks, monuments, and historic sites with live weather, alerts, maps, park comparison, events, and Trailie outdoor trip planning. Free to explore — no account needed.",
  potentialAction: {
    '@type': 'SearchAction',
    target: {
      '@type': 'EntryPoint',
      urlTemplate: 'https://www.nationalparksexplorerusa.com/explore?q={search_term_string}',
    },
    'query-input': 'required name=search_term_string',
  },
};

/** System-aware chrome colors — root layout stays cacheable (no request cookies). */
export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0A0E0F" },
    { media: "(prefers-color-scheme: light)", color: "#FEFCF9" },
  ],
};

export const metadata = {
  title: "TrailVerse — Explore 470+ U.S. Parks, Monuments & Historic Sites",
  applicationName: "TrailVerse",
  description: "Explore 470+ U.S. parks, monuments, and historic sites with live weather, alerts, maps, park comparison, events, and Trailie outdoor trip planning. Free to explore — no account needed.",
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/android-chrome-192x192.png", sizes: "192x192", type: "image/png" },
      { url: "/android-chrome-512x512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
  metadataBase: new URL("https://www.nationalparksexplorerusa.com"),
  robots: indexablePageRobots,
  appleWebApp: {
    capable: true,
    title: "TrailVerse",
    statusBarStyle: "default",
  },
  openGraph: {
    title: "TrailVerse — Explore 470+ U.S. Parks, Monuments & Historic Sites",
    description: "Explore 470+ U.S. parks, monuments, and historic sites with live weather, alerts, maps, park comparison, events, and Trailie outdoor trip planning. Free to explore — no account needed.",
    url: "https://www.nationalparksexplorerusa.com",
    siteName: "TrailVerse",
    type: "website",
    images: [
      {
        url: "/og-image-trailverse.jpg",
        width: 1200,
        height: 630,
        alt: "TrailVerse — Explore U.S. parks and public lands",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "TrailVerse — Explore 470+ U.S. Parks, Monuments & Historic Sites",
    description: "Explore 470+ U.S. parks, monuments, and historic sites with live weather, alerts, maps, park comparison, events, and Trailie outdoor trip planning.",
    images: ["/og-image-trailverse.jpg"],
  },
};

export default function RootLayout({ children }) {
  const gaId = process.env.NEXT_PUBLIC_GA_TRACKING_ID;

  return (
    <html lang="en" className="h-full antialiased" suppressHydrationWarning>
      <body className="min-h-full flex flex-col font-sans" suppressHydrationWarning>
        {/* beforeInteractive theme bootstrap — keeps root layout cacheable */}
        <Script id="theme-init" src="/theme-init.js" strategy="beforeInteractive" />
        <Script
          id="json-ld"
          type="application/ld+json"
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }}
        />
        {gaId && (
          <>
            <Script
              src={`https://www.googletagmanager.com/gtag/js?id=${gaId}`}
              strategy="afterInteractive"
            />
            <Script
              id="google-analytics"
              strategy="afterInteractive"
              dangerouslySetInnerHTML={{
                __html: `
                  window.dataLayer = window.dataLayer || [];
                  function gtag(){dataLayer.push(arguments);}
                  gtag('js', new Date());
                  gtag('config', '${gaId}');
                `
              }}
            />
          </>
        )}
        <Script
          id="suppress-console"
          strategy="afterInteractive"
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
        <GoogleMapsLoader />
        <Providers>
          {children}
          <VoiceButton />
        </Providers>
      </body>
    </html>
  );
}
