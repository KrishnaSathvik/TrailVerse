import "./globals.css";

import Script from "next/script";
import { cookies } from "next/headers";
import Providers from "../components/Providers";
import GoogleMapsLoader from "../components/maps/GoogleMapsLoader";
import VoiceButton from "../components/voice/VoiceButton";
import { indexablePageRobots } from "@/lib/seo";
import {
  normalizeThemePreference,
  resolveServerHtmlTheme,
  resolvedThemeFromServerClass,
} from "@/lib/themeCookie";
import { AUTH_TOKEN_COOKIE } from "@/services/authService";

/** Theme cookie must affect SSR html class — never serve a shared cached shell. */
export const dynamic = "force-dynamic";

const JSON_LD = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name: 'TrailVerse',
  url: 'https://www.nationalparksexplorerusa.com',
  description:
    "Explore 470+ U.S. parks, monuments, and historic sites with AI trip planning, live alerts, weather, maps, and community reviews.",
  potentialAction: {
    '@type': 'SearchAction',
    target: {
      '@type': 'EntryPoint',
      urlTemplate: 'https://www.nationalparksexplorerusa.com/explore?q={search_term_string}',
    },
    'query-input': 'required name=search_term_string',
  },
};

export async function generateViewport() {
  const cookieStore = await cookies();
  const themePreference = cookieStore.get("theme")?.value;

  const base = {
    width: "device-width",
    initialScale: 1,
    maximumScale: 1,
    userScalable: false,
  };

  if (themePreference === "dark") {
    return { ...base, themeColor: "#0A0E0F", colorScheme: "dark" };
  }
  if (themePreference === "light") {
    return { ...base, themeColor: "#FEFCF9", colorScheme: "light" };
  }

  return {
    ...base,
    themeColor: [
      { media: "(prefers-color-scheme: dark)", color: "#0A0E0F" },
      { media: "(prefers-color-scheme: light)", color: "#FEFCF9" },
    ],
  };
}

export const metadata = {
  title: "TrailVerse — Explore 470+ U.S. Parks, Monuments & Historic Sites",
  applicationName: "TrailVerse",
  description: "Explore 470+ U.S. parks, monuments, and historic sites with live weather, alerts, maps, park comparison, events, and AI trip planning with Trailie. Free to explore — no account needed.",
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
    description: "Explore 470+ U.S. parks, monuments, and historic sites with live weather, alerts, maps, park comparison, events, and AI trip planning with Trailie. Free to explore — no account needed.",
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
    description: "Explore 470+ U.S. parks, monuments, and historic sites with live weather, alerts, maps, park comparison, events, and AI trip planning with Trailie.",
    images: ["/og-image-trailverse.jpg"],
  },
};

export default async function RootLayout({ children }) {
  const gaId = process.env.NEXT_PUBLIC_GA_TRACKING_ID;
  const cookieStore = await cookies();
  const initialAuthHint = Boolean(cookieStore.get(AUTH_TOKEN_COOKIE)?.value);
  const themePreference = cookieStore.get("theme")?.value;
  const serverThemeClass = resolveServerHtmlTheme(themePreference);
  const initialTheme = normalizeThemePreference(themePreference);
  const initialResolvedTheme = resolvedThemeFromServerClass(serverThemeClass);
  const htmlClassName = ["h-full", "antialiased", serverThemeClass].filter(Boolean).join(" ");
  const htmlStyle =
    serverThemeClass === "dark"
      ? { backgroundColor: "#0A0E0F", colorScheme: "dark" }
      : serverThemeClass === "light"
        ? { backgroundColor: "#FEFCF9", colorScheme: "light" }
        : undefined;
  const bodyStyle =
    serverThemeClass === "dark"
      ? { backgroundColor: "#0A0E0F", color: "#FFFFFF" }
      : serverThemeClass === "light"
        ? { backgroundColor: "#FEFCF9", color: "#2D2B28" }
        : undefined;

  return (
    <html lang="en" className={htmlClassName} style={htmlStyle} suppressHydrationWarning>
      <body className="min-h-full flex flex-col font-sans" style={bodyStyle} suppressHydrationWarning>
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
        <Providers
          initialAuthHint={initialAuthHint}
          initialTheme={initialTheme}
          initialResolvedTheme={initialResolvedTheme}
        >
          {children}
          <VoiceButton />
        </Providers>
      </body>
    </html>
  );
}
