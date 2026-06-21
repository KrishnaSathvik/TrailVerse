'use client';

import React, { useState } from 'react';

const KRISHNA = {
  name: 'Krishna',
  title: 'Creator of TrailVerse',
  photo: '/authors/krishna.jpg',
  bio: 'Astrophotographer and national parks nerd. 17+ parks and counting.',
  socials: [
    { name: 'Portfolio', href: 'https://www.astrobykrishna.com/' },
    { name: 'Instagram', href: 'https://instagram.com/astrobykrishna' },
    { name: 'Pinterest', href: 'https://pin.it/2N6K1Iz' },
  ],
};

const AUTHOR_MATCHES = ['Krishna Sathvik', 'Krishna', 'TrailVerse Team', 'Admin'];

export function isKnownBlogAuthor(author) {
  return AUTHOR_MATCHES.includes(author);
}

function AuthorPhoto({ name, photo }) {
  const [imgError, setImgError] = useState(false);

  if (imgError || !photo) {
    const initials = name
      .split(' ')
      .map((w) => w[0])
      .join('')
      .slice(0, 2);

    return (
      <div
        className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0"
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
      className="w-10 h-10 rounded-full object-cover flex-shrink-0"
      style={{ outline: '2px solid color-mix(in srgb, var(--accent-green) 35%, transparent)' }}
      onError={() => setImgError(true)}
    />
  );
}

const AuthorBioCard = ({ author, embedded = false }) => {
  if (!isKnownBlogAuthor(author)) {
    return null;
  }

  const data = KRISHNA;

  if (embedded) {
    return (
      <div className="flex items-start gap-3">
        <AuthorPhoto name={data.name} photo={data.photo} />
        <div className="min-w-0">
          <p className="text-base leading-snug" style={{ color: 'var(--text-primary)' }}>
            <span className="font-semibold">{data.name}</span>
            <span style={{ color: 'var(--text-tertiary)' }}> · </span>
            <span style={{ color: 'var(--text-secondary)' }}>{data.title}</span>
          </p>
          <p className="text-sm mt-1 leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
            {data.bio}
          </p>
          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
            {data.socials.map((social) => (
              <a
                key={social.name}
                href={social.href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-medium transition hover:opacity-80"
                style={{ color: 'var(--accent-green)' }}
              >
                {social.name}
              </a>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="rounded-xl p-5 mt-12 mb-8"
      style={{
        backgroundColor: 'var(--surface)',
        border: '1px solid var(--border)',
      }}
    >
      <div className="flex items-start gap-4">
        <AuthorPhoto name={data.name} photo={data.photo} />
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-base" style={{ color: 'var(--text-primary)' }}>
            {data.name}
          </h3>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            {data.title}
          </p>
          <p className="text-xs mt-1 leading-relaxed" style={{ color: 'var(--text-tertiary)' }}>
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
            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--accent-green)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-secondary)'; }}
          >
            {social.name}
          </a>
        ))}
      </div>
    </div>
  );
};

export default AuthorBioCard;
