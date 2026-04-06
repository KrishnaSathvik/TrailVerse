'use client';

import React, { useState } from 'react';
import Link from 'next/link';

const KRISHNA = {
  name: "Krishna Sathvik",
  title: "Nikon Z6II Astrophotographer & National Parks Explorer",
  photo: "/authors/krishna.jpg",
  bio: "I plan deeply, document everything, and share what actually helps once you're on the road. TrailVerse is built on thousands of miles, 17 national parks, and years of Google Maps contributions.",
  stats: [
    { label: "Google Maps Level 8", value: "67M+ views", href: "https://www.google.com/maps/contrib/118219629305553937668" },
    { label: "National Parks", value: "17+ parks · 23 states", href: null },
    { label: "Park Reviews", value: "379+ detailed reviews", href: null },
  ],
  socials: [
    { name: "Astro Portfolio", href: "https://www.astrobykrishna.com/" },
    { name: "Instagram", href: "https://instagram.com/astrobykrishna" },
    { name: "TikTok", href: "https://www.tiktok.com/@travelswithkrishna" },
    { name: "Pinterest", href: "https://pin.it/2N6K1Iz" },
    { name: "Unsplash", href: "https://unsplash.com/@astrobykrishna" },
    { name: "Pexels", href: "https://www.pexels.com/@astrobykrishna/" },
    { name: "500px", href: "https://500px.com/p/astrobykrishna?view=photos" },
    { name: "Google Maps", href: "https://www.google.com/maps/contrib/118219629305553937668" },
  ],
};

const AUTHOR_MATCHES = ["Krishna Sathvik", "Krishna", "TrailVerse Team"];

const AuthorBioCard = ({ author }) => {
  const [hoveredSocial, setHoveredSocial] = useState(null);

  if (!AUTHOR_MATCHES.includes(author)) {
    return null;
  }

  const data = KRISHNA;

  return (
    <div
      className="rounded-2xl p-6 mt-12 mb-8"
      style={{
        backgroundColor: 'var(--surface)',
        border: '1px solid var(--border)',
      }}
    >
      <p
        className="text-xs font-semibold uppercase tracking-wider mb-4"
        style={{ color: 'var(--accent-green)' }}
      >
        Written by
      </p>

      <div className="flex items-start gap-4 mb-4">
        <AuthorPhoto name={data.name} photo={data.photo} />
        <div>
          <h3 className="font-bold text-lg" style={{ color: 'var(--text-primary)' }}>
            {data.name}
          </h3>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            {data.title}
          </p>
        </div>
      </div>

      <p
        className="text-sm leading-relaxed mb-5"
        style={{ color: 'var(--text-secondary)' }}
      >
        {data.bio}
      </p>

      <div className="flex flex-wrap gap-2 mb-5">
        {data.stats.map((stat) => {
          const isLink = Boolean(stat.href);
          const style = isLink
            ? {
                backgroundColor: 'rgba(67, 160, 106, 0.08)',
                border: '1px solid rgba(67, 160, 106, 0.2)',
              }
            : {
                backgroundColor: 'var(--surface-hover, var(--bg-primary))',
                border: '1px solid var(--border)',
              };

          const content = (
            <div className="px-3 py-2 rounded-xl text-center" style={style}>
              <div
                className="text-sm font-semibold"
                style={{ color: isLink ? 'var(--accent-green)' : 'var(--text-primary)' }}
              >
                {stat.value}
              </div>
              <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                {stat.label}
              </div>
            </div>
          );

          return isLink ? (
            <a
              key={stat.label}
              href={stat.href}
              target="_blank"
              rel="noopener noreferrer"
            >
              {content}
            </a>
          ) : (
            <div key={stat.label}>{content}</div>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-2">
        {data.socials.map((social) => (
          <a
            key={social.name}
            href={social.href}
            target="_blank"
            rel="noopener noreferrer"
            className="px-3 py-1.5 rounded-full text-xs font-medium transition-colors"
            style={{
              backgroundColor: 'var(--surface)',
              border: hoveredSocial === social.name
                ? '1px solid var(--accent-green)'
                : '1px solid var(--border)',
              color: hoveredSocial === social.name
                ? 'var(--accent-green)'
                : 'var(--text-secondary)',
            }}
            onMouseEnter={() => setHoveredSocial(social.name)}
            onMouseLeave={() => setHoveredSocial(null)}
          >
            {social.name}
          </a>
        ))}
      </div>
    </div>
  );
};

const AuthorPhoto = ({ name, photo }) => {
  const [imgError, setImgError] = useState(false);

  if (imgError || !photo) {
    const initials = name
      .split(' ')
      .map((w) => w[0])
      .join('')
      .slice(0, 2);

    return (
      <div
        className="w-14 h-14 rounded-full flex items-center justify-center text-lg font-bold flex-shrink-0"
        style={{ backgroundColor: 'var(--accent-green)', color: 'white' }}
      >
        {initials}
      </div>
    );
  }

  return (
    <img
      src={photo}
      alt={name}
      className="w-14 h-14 rounded-full object-cover flex-shrink-0"
      style={{ outline: '2px solid var(--accent-green)' }}
      onError={() => setImgError(true)}
    />
  );
};

export default AuthorBioCard;
