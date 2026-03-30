import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

import Providers from "../components/Providers";

export const metadata = {
  title: "TrailVerse — Explore America's 470+ National Parks, Monuments & Historic Sites",
  description: "Browse all 470+ National Parks with real-time weather, interactive maps, community reviews, park comparison, events, and AI trip planning. Free to explore — no account needed.",
  openGraph: {
    title: "TrailVerse — Explore America's 470+ National Parks, Monuments & Historic Sites",
    description: "Browse all 470+ National Parks with real-time weather, interactive maps, community reviews, park comparison, events, and AI trip planning. Free to explore — no account needed.",
    type: "website",
  }
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col font-sans bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100">
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}
