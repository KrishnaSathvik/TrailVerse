"use client";

import { useState, useEffect } from "react";
import { WifiOff, Mountain, Home, RefreshCw } from "@components/icons";

export default function OfflinePage() {
  const [isOnline, setIsOnline] = useState(false);

  useEffect(() => {
    setIsOnline(navigator.onLine);

    const goOnline = () => {
      setIsOnline(true);
      setTimeout(() => window.location.reload(), 1000);
    };
    const goOffline = () => setIsOnline(false);

    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  return (
    <div className="min-h-screen" style={{ backgroundColor: "var(--bg-primary)" }}>
      {/* Hero Section */}
      <section className="relative w-full min-h-[80vh] flex items-center justify-center">
        {/* Background Image */}
        <div
          className="absolute inset-0 w-full bg-cover bg-center bg-no-repeat"
          style={{
            backgroundImage: "url(/background4.png)",
            filter: "brightness(0.4)",
            width: "100vw",
            left: "50%",
            marginLeft: "-50vw",
          }}
        />

        {/* Gradient Overlay */}
        <div
          className="absolute inset-0 w-full bg-gradient-to-b from-black/20 via-black/40 to-black/60"
          style={{ width: "100vw", left: "50%", marginLeft: "-50vw" }}
        />

        {/* Content */}
        <div className="relative z-10 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          {/* Offline Badge */}
          <div className="inline-flex items-center gap-2 rounded-full px-4 py-2 ring-1 backdrop-blur mb-8 bg-white/10 border-white/20">
            <WifiOff className="h-4 w-4 text-white" />
            <span className="text-xs font-medium uppercase tracking-wider text-white">
              No Connection
            </span>
          </div>

          {/* Icon */}
          <div className="flex justify-center mb-6">
            <Mountain className="h-20 w-20 text-white/80" />
          </div>

          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-semibold tracking-tight mb-6 text-white">
            You&apos;re Offline
          </h1>

          <p className="mx-auto mt-2 max-w-2xl text-lg sm:text-xl leading-relaxed text-white/90 mb-12">
            It looks like you&apos;ve wandered off the trail.
            Check your internet connection and try again — the parks will be here when you&apos;re back.
          </p>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <button
              onClick={() => window.location.reload()}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-semibold text-white bg-white/20 border border-white/30 backdrop-blur hover:bg-white/30 transition-colors"
            >
              <RefreshCw className="h-5 w-5" />
              Try Again
            </button>

            <a
              href="/"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-semibold text-white bg-white/20 border border-white/30 backdrop-blur hover:bg-white/30 transition-colors"
            >
              <Home className="h-5 w-5" />
              Go Home
            </a>
          </div>

          {/* Status Indicator */}
          <div className="mt-12">
            {isOnline ? (
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-500/20 border border-emerald-400/40 text-emerald-200 text-sm">
                <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                Back online — reloading&hellip;
              </div>
            ) : (
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-red-500/20 border border-red-400/40 text-red-200 text-sm">
                <span className="h-2 w-2 rounded-full bg-red-400" />
                Currently offline
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Info Section */}
      <section className="py-16 px-4 sm:px-6 lg:px-8" style={{ backgroundColor: "var(--bg-primary)" }}>
        <div className="max-w-4xl mx-auto">
          <div
            className="rounded-3xl p-8 sm:p-12 backdrop-blur text-center"
            style={{
              backgroundColor: "var(--surface)",
              borderWidth: "1px",
              borderColor: "var(--border)",
              boxShadow: "var(--shadow)",
            }}
          >
            <h3
              className="text-2xl sm:text-3xl font-semibold tracking-tight mb-4"
              style={{ color: "var(--text-primary)" }}
            >
              What You Can Still Do
            </h3>
            <p
              className="text-base sm:text-lg mb-8 max-w-2xl mx-auto"
              style={{ color: "var(--text-secondary)" }}
            >
              Pages you&apos;ve already visited are cached and may still be available.
              Try navigating to a previously viewed park page.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-lg mx-auto">
              {[
                {
                  title: "Visited Pages",
                  description: "Browse parks you already viewed",
                },
                {
                  title: "Cached Data",
                  description: "Park info and images from recent visits",
                },
              ].map((item, index) => (
                <div
                  key={index}
                  className="p-6 rounded-2xl"
                  style={{
                    backgroundColor: "var(--surface-hover)",
                    borderWidth: "1px",
                    borderColor: "var(--border)",
                  }}
                >
                  <h4
                    className="text-lg font-semibold tracking-tight mb-2"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {item.title}
                  </h4>
                  <p className="text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                    {item.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
