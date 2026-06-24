'use client';

import React, { useState } from 'react';
import { Facebook, Instagram, Pinterest } from '@components/icons';

const KRISHNA = {
  name: 'Krishna',
  title: 'TrailVerse & Trailie founder',
  photo: '/authors/krishna.png',
  bio: 'I build TrailVerse and Trailie to help travelers plan smarter national park and outdoor trips. I\'m also an astrophotographer and park nerd, with 17+ U.S. national parks visited and counting.',
};

const AUTHOR_SOCIALS = [
  {
    id: 'facebook',
    label: 'Facebook (@travelswithkrishna)',
    href: 'https://www.facebook.com/travelswithkrishna/',
    Icon: Facebook,
  },
  {
    id: 'instagram',
    label: 'Instagram (@travelswithkrishna)',
    href: 'https://www.instagram.com/travelswithkrishna/',
    Icon: Instagram,
  },
  {
    id: 'pinterest',
    label: 'Pinterest',
    href: 'https://pin.it/2N6K1Iz',
    Icon: Pinterest,
  },
];

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

function AuthorSocialLinks({ className = '', wrapperStyle }) {
  return (
    <div className={className} style={wrapperStyle}>
      <div className="flex items-center gap-2">
      {AUTHOR_SOCIALS.map(({ id, label, href, Icon }) => (
        <a
          key={id}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={label}
          title={label}
          className="inline-flex h-9 w-9 items-center justify-center rounded-full transition-colors"
          style={{
            backgroundColor: 'var(--surface-hover)',
            color: 'var(--text-secondary)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = 'var(--accent-green)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = 'var(--text-secondary)';
          }}
        >
          <Icon className="h-5 w-5" />
        </a>
      ))}
      </div>
    </div>
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
          <AuthorSocialLinks className="mt-2" />
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

      <AuthorSocialLinks
        className="mt-4 pt-3"
        wrapperStyle={{ borderTop: '1px solid var(--border)' }}
      />
    </div>
  );
};

export default AuthorBioCard;
