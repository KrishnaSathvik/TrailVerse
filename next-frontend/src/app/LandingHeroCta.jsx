'use client';

import Link from 'next/link';
import IconGlyph from '@/components/common/IconGlyph';
import { logCtaClick } from '@/utils/analytics';
import { BROWSE_HUB_PATH } from '@/lib/browseHub';
import { LANDING_HERO_DEMO_CTA, LANDING_HERO_PRIMARY_CTA } from '@/lib/landingHeroCopy';

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
  'public-action inline-flex w-full sm:w-auto items-center justify-center gap-2.5 px-7 py-3.5 text-base font-semibold text-white shadow-md transition hover:brightness-110 active:translate-y-px';

const heroDemoClass =
  'public-action group inline-flex w-full sm:w-auto items-center justify-center gap-2.5 border border-white bg-white px-7 py-3.5 text-base font-semibold text-[#172d24] shadow-md transition hover:bg-emerald-50 active:translate-y-px';

const heroSecondaryClass =
  'public-action inline-flex min-w-0 items-center justify-center gap-2 border border-white/80 bg-white px-4 py-2.5 text-sm font-semibold text-[#172d24] shadow-sm transition hover:bg-emerald-50 active:translate-y-px';

const SECONDARY_LINKS = [
  { href: '/compare', ctaId: 'hero_compare_parks', label: 'Compare parks', icon: 'ArrowsLeftRight' },
  { href: '/guides', ctaId: 'hero_planning_guides', label: 'Planning guides', icon: 'Bookmark' },
  { href: BROWSE_HUB_PATH, ctaId: 'hero_discover', label: 'Activities', icon: 'Compass' },
];

function HeroPrimaryActions() {
  return (
    <div className="flex w-full flex-col items-center gap-3 sm:flex-row sm:justify-center">
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
      <TrackedLink
        href="/trailie-demo"
        ctaId="hero_view_trailie_demo"
        label={LANDING_HERO_DEMO_CTA}
        className={heroDemoClass}
      >
        <IconGlyph name="PlayCircle" className="h-5 w-5 shrink-0" style={{ color: 'var(--accent-green)' }} />
        {LANDING_HERO_DEMO_CTA}
        <IconGlyph
          name="ArrowRight"
          className="h-4 w-4 shrink-0 transition group-hover:translate-x-0.5"
        />
      </TrackedLink>
    </div>
  );
}

export default function LandingHeroCta() {
  return (
    <div className="animate-fade-in w-full max-w-2xl mx-auto">
      <div className="flex flex-col items-center gap-6">
        <HeroPrimaryActions />

        <nav aria-label="Explore national parks" className="flex w-full flex-wrap justify-center gap-2.5">
          {SECONDARY_LINKS.map((item) => (
            <TrackedLink key={item.ctaId} href={item.href} ctaId={item.ctaId} label={item.label} className={heroSecondaryClass}>
              <IconGlyph name={item.icon} className="h-4 w-4 shrink-0 text-emerald-700" />
              <span>{item.label}</span>
            </TrackedLink>
          ))}
        </nav>
      </div>
    </div>
  );
}
