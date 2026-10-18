'use client';

import Link from 'next/link';
import IconGlyph from '@/components/common/IconGlyph';
import { logCtaClick } from '@/utils/analytics';
import { BROWSE_HUB_PATH } from '@/lib/browseHub';
import { LANDING_HERO_DEMO_CTA, LANDING_HERO_PRIMARY_CTA } from '@/lib/landingHeroCopy';

function TrackedLink({ href, ctaId, label, className, style, surface = 'homepage_hero', children }) {
  return (
    <Link
      href={href}
      className={className}
      style={style}
      onClick={() => logCtaClick({
        ctaId,
        label,
        surface,
        destination: href,
      })}
    >
      {children}
    </Link>
  );
}

const heroPrimaryClass =
  'public-action inline-flex min-h-12 w-full sm:w-auto items-center justify-center gap-2.5 px-7 py-3.5 text-base font-semibold text-white shadow-md transition hover:brightness-110 active:translate-y-px focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white';

const heroDemoClass =
  'public-action inline-flex min-h-12 w-full sm:w-auto items-center justify-center gap-2 border border-white/65 bg-black/15 px-7 py-3.5 text-base font-semibold text-white backdrop-blur-sm transition hover:bg-white/15 active:translate-y-px focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white';

const shortcutClass =
  'inline-flex min-h-14 min-w-0 items-center justify-center gap-1.5 rounded-xl border border-emerald-800/35 bg-[var(--surface)] px-2 py-2.5 text-left text-xs font-semibold leading-snug text-[var(--text-primary)] shadow-sm transition hover:border-emerald-700 hover:bg-[var(--bg-secondary)] active:translate-y-px focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 dark:border-emerald-200/30 sm:gap-2.5 sm:px-5 sm:text-sm';

const SECONDARY_LINKS = [
  { href: '/compare', ctaId: 'hero_compare_parks', label: 'Compare parks', icon: 'ArrowsLeftRight' },
  { href: '/guides', ctaId: 'hero_planning_guides', label: 'Planning guides', icon: 'Bookmark' },
  { href: BROWSE_HUB_PATH, ctaId: 'hero_discover', label: 'Activities', icon: 'Compass' },
];

function HeroPrimaryActions() {
  return (
    <div className="mx-auto flex w-full max-w-sm flex-col items-stretch justify-center gap-3 sm:max-w-none sm:flex-row sm:items-center">
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
        <IconGlyph name="Play" className="h-4 w-4 shrink-0 text-white" />
        {LANDING_HERO_DEMO_CTA}
      </TrackedLink>
    </div>
  );
}

export default function LandingHeroCta() {
  return (
    <div className="w-full">
      <HeroPrimaryActions />
    </div>
  );
}

export function LandingExploreShortcuts() {
  return (
    <nav aria-label="Explore national parks" className="mx-auto grid w-full grid-cols-3 gap-2 sm:max-w-2xl sm:gap-3">
      {SECONDARY_LINKS.map((item) => (
        <TrackedLink key={item.ctaId} href={item.href} ctaId={item.ctaId} label={item.label} surface="homepage_shortcuts" className={shortcutClass}>
          <IconGlyph name={item.icon} className="h-4 w-4 shrink-0 text-emerald-700 dark:text-emerald-400 sm:h-5 sm:w-5" />
          <span>{item.label}</span>
        </TrackedLink>
      ))}
    </nav>
  );
}
