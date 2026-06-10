'use client';

import Link from 'next/link';
import IconGlyph from '@/components/common/IconGlyph';
import { logCtaClick } from '@/utils/analytics';
import { BROWSE_HUB_NAV_LABEL, BROWSE_HUB_PATH } from '@/lib/browseHub';
import { LANDING_HERO_PRIMARY_CTA } from '@/lib/landingHeroCopy';

function TrackedLink({ href, ctaId, label, className, style, children }) {
  return (
    <Link
      href={href}
      className={className}
      style={style}
      onClick={() => logCtaClick({
        ctaId,
        label,
        surface: 'homepage_hero',
        destination: href,
      })}
    >
      {children}
    </Link>
  );
}

const heroPrimaryClass =
  'inline-flex w-full sm:w-auto items-center justify-center gap-2.5 rounded-full px-8 py-4 text-base font-semibold text-white shadow-xl shadow-black/35 transition hover:brightness-110 hover:shadow-2xl';

const heroSecondaryClass =
  'inline-flex items-center justify-center gap-2 rounded-full border border-white/20 bg-black/40 px-4 py-2.5 text-sm font-semibold text-white/90 shadow-md shadow-black/25 backdrop-blur-md transition hover:border-white/30 hover:bg-black/55';

const DESKTOP_SECONDARY_LINKS = [
  { href: '/compare', ctaId: 'hero_compare_parks', label: 'Compare parks', icon: 'ArrowsLeftRight' },
  { href: '/guides', ctaId: 'hero_planning_guides', label: 'Planning guides', icon: 'Bookmark' },
  { href: BROWSE_HUB_PATH, ctaId: 'hero_discover_desktop', label: BROWSE_HUB_NAV_LABEL, icon: 'Compass' },
];

const MOBILE_QUICK_LINKS = [
  { href: '/guides', ctaId: 'hero_planning_guides', label: 'Guides', icon: 'Bookmark' },
  { href: '/map', ctaId: 'hero_open_map', label: 'Map', icon: 'Map' },
  { href: BROWSE_HUB_PATH, ctaId: 'hero_discover', label: 'Activities', icon: 'Mountain' },
];

export default function LandingHeroCta() {
  return (
    <div className="animate-fade-in w-full max-w-md mx-auto md:max-w-2xl">
      {/* Mobile: primary + solid secondary row */}
      <div className="flex flex-col items-center gap-3 md:hidden">
        <TrackedLink
          href="/plan-ai"
          ctaId="hero_plan_trailie"
          label={LANDING_HERO_PRIMARY_CTA}
          className={heroPrimaryClass}
          style={{ backgroundColor: 'var(--accent-green)' }}
        >
          <IconGlyph name="Sparkles" className="h-4 w-4 shrink-0" style={{ color: '#fff' }} />
          {LANDING_HERO_PRIMARY_CTA}
        </TrackedLink>

        <div className="grid w-full grid-cols-3 gap-2">
          {MOBILE_QUICK_LINKS.map((item) => (
            <TrackedLink
              key={item.ctaId}
              href={item.href}
              ctaId={item.ctaId}
              label={item.label}
              className={`${heroSecondaryClass} flex-col gap-1.5 px-2 py-3 text-center rounded-xl`}
            >
              <IconGlyph name={item.icon} className="h-5 w-5 shrink-0" style={{ color: 'var(--accent-green)' }} />
              <span className="text-[11px] font-semibold leading-tight text-white/90">{item.label}</span>
            </TrackedLink>
          ))}
        </div>
      </div>

      {/* Desktop: one primary, secondary row below */}
      <div className="hidden md:flex md:flex-col md:items-center md:gap-4">
        <TrackedLink
          href="/plan-ai"
          ctaId="hero_plan_trailie"
          label={LANDING_HERO_PRIMARY_CTA}
          className={heroPrimaryClass}
          style={{ backgroundColor: 'var(--accent-green)' }}
        >
          <IconGlyph name="Sparkles" className="h-5 w-5 shrink-0" style={{ color: '#fff' }} />
          {LANDING_HERO_PRIMARY_CTA}
        </TrackedLink>

        <div className="flex flex-wrap items-center justify-center gap-2">
          {DESKTOP_SECONDARY_LINKS.map((item) => (
            <TrackedLink
              key={item.ctaId}
              href={item.href}
              ctaId={item.ctaId}
              label={item.label}
              className={heroSecondaryClass}
            >
              <IconGlyph name={item.icon} className="h-4 w-4 shrink-0" style={{ color: 'var(--accent-green)' }} />
              {item.label}
            </TrackedLink>
          ))}
        </div>
      </div>
    </div>
  );
}
