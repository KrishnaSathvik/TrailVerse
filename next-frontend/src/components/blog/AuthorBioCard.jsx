'use client';

import React, { useState } from 'react';

const KRISHNA = {
  name: "Krishna Sathvik",
  title: "Astrophotographer & National Parks Explorer",
  photo: "/authors/krishna.jpg",
  bio: "17+ national parks, 67M+ Google Maps views, and thousands of miles on the road — sharing what actually helps.",
  socials: [
    { name: "Portfolio", href: "https://www.astrobykrishna.com/" },
    { name: "Instagram", href: "https://instagram.com/astrobykrishna" },
    { name: "Google Maps", href: "https://www.google.com/maps/contrib/118219629305553937668" },
  ],
};

const AUTHOR_MATCHES = ["Krishna Sathvik", "Krishna", "TrailVerse Team", "Admin"];

const AuthorBioCard = ({ author }) => {
  if (!AUTHOR_MATCHES.includes(author)) {
    return null;
  }

  const data = KRISHNA;

  return (
    <div
      className="rounded-xl p-5 mt-12 mb-8"
      style={{
        backgroundColor: 'var(--surface)',
        border: '1px solid var(--border)',
      }}
    >
      <div className="flex items-center gap-4">
        <AuthorPhoto name={data.name} photo={data.photo} />
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-base" style={{ color: 'var(--text-primary)' }}>
            {data.name}
          </h3>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            {data.title}
          </p>
          <p
            className="text-xs mt-1 leading-relaxed"
            style={{ color: 'var(--text-tertiary)' }}
          >
            {data.bio}
          </p>
        </div>
      </div>

      <div className="flex gap-3 mt-4 pt-3" style={{ borderTop: '1px solid var(--border)' }}>
        {data.socials.map((social) => (
          <a
            key={social.name}
            href={social.href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-medium transition-colors"
            style={{ color: 'var(--text-secondary)' }}
            onMouseEnter={(e) => e.currentTarget.style.color = 'var(--accent-green)'}
            onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-secondary)'}
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
        className="w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold flex-shrink-0"
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
      className="w-12 h-12 rounded-full object-cover flex-shrink-0"
      style={{ outline: '2px solid var(--accent-green)' }}
      onError={() => setImgError(true)}
    />
  );
};

export default AuthorBioCard;
