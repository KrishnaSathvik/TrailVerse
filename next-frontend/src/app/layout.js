import "./globals.css";

import Script from "next/script";
import Providers from "../components/Providers";
import GoogleMapsLoader from "../components/maps/GoogleMapsLoader";

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export const metadata = {
  title: "TrailVerse — Explore America's 470+ National Parks & Sites",
  applicationName: "TrailVerse",
  description: "Explore America's 470+ National Parks, Monuments & Historic Sites with real-time weather, interactive maps, community reviews, park comparison, events, and AI-powered trip planning. Free to explore — no account needed.",
  manifest: "/manifest.json",
  metadataBase: new URL("https://www.nationalparksexplorerusa.com"),
  appleWebApp: {
    capable: true,
    title: "TrailVerse",
    statusBarStyle: "default",
  },
  openGraph: {
    title: "TrailVerse — Explore America's 470+ National Parks & Sites",
    description: "Explore America's 470+ National Parks, Monuments & Historic Sites with real-time weather, interactive maps, community reviews, park comparison, events, and AI-powered trip planning. Free to explore — no account needed.",
    url: "https://www.nationalparksexplorerusa.com",
    siteName: "TrailVerse",
    type: "website",
    images: [
      {
        url: "/og-image-trailverse.jpg",
        width: 1200,
        height: 630,
        alt: "TrailVerse — Explore America's National Parks",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "TrailVerse — Explore America's 470+ National Parks & Sites",
    description: "Explore America's 470+ National Parks, Monuments & Historic Sites with real-time weather, interactive maps, community reviews, park comparison, events, and AI-powered trip planning.",
    images: ["/og-image-trailverse.jpg"],
  },
};

export default function RootLayout({ children }) {
  const gaId = process.env.NEXT_PUBLIC_GA_TRACKING_ID;

  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col font-sans bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100">
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
          id="json-ld"
          type="application/ld+json"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'WebSite',
              name: 'TrailVerse',
              url: 'https://www.nationalparksexplorerusa.com',
              description: "Explore America's 470+ National Parks with AI-powered trip planning, real-time weather, interactive maps, and community reviews.",
              potentialAction: {
                '@type': 'SearchAction',
                target: {
                  '@type': 'EntryPoint',
                  urlTemplate: 'https://www.nationalparksexplorerusa.com/explore?q={search_term_string}',
                },
                'query-input': 'required name=search_term_string',
              },
            })
          }}
        />
        <Script
          id="suppress-console"
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
        <GoogleMapsLoader />
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}
