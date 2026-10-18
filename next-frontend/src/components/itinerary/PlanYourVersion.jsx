'use client';

import { useId, useState } from 'react';
import Link from 'next/link';
import TrailieAvatar from '@/components/plan-ai/TrailieAvatar';

export const VERSION_CHOICES = Object.freeze([
  { key: 'season', label: 'When', options: [['Summer', 'summer'], ['Fall', 'fall'], ['Spring', 'spring'], ['Winter', 'winter']] },
  { key: 'party', label: 'Who’s going', options: [['Solo', 'solo'], ['Couple', 'couple'], ['Friends', 'friends'], ['Family', 'family']] },
  { key: 'style', label: 'Style', options: [['Scenic + relaxed', 'relaxed'], ['Balanced', 'balanced'], ['Big hiking days', 'hiking']] },
]);
const PARTY = { solo: ' for one person', couple: ' for two people', friends: ' for a group of friends', family: ' for a family with kids' };
const STYLE = { relaxed: ', with a scenic and relaxed pace', balanced: ', balancing hikes with downtime', hiking: ', built around big hiking days' };
const SAMPLE = ' The sample I’m looking at: ';

/**
 * The visitor's own version of a frozen sample. A version exists only after at
 * least one change; until then the only action is exploring the sample itself.
 * Nothing here writes to the sample or starts a live call.
 */
export function versionPrompt({ title, days, outline }, selection = {}) {
  if (!selection.season && !selection.party && !selection.style) return null;
  const ask = `Plan a ${selection.season ? `${selection.season} ` : ''}${days}-day ${title} trip${PARTY[selection.party] || ''}, similar to this sample${STYLE[selection.style] || ''}.`;
  return outline ? `${ask}${SAMPLE}${outline}.` : ask;
}

export function tripOutline(plan, headingFor) {
  return (plan?.days || []).map((day, i) => `Day ${day.dayNumber || i + 1}: ${headingFor(day, i)}`).join('; ');
}

export default function PlanYourVersion({ title, days, outline = '', onExplore = null, exploreLabel = 'Explore this sample', className = '' }) {
  const [selection, setSelection] = useState({});
  const groupId = useId();
  const prompt = versionPrompt({ title, days, outline }, selection);
  return (
    <section aria-label="Make this trip yours" data-version-state={prompt ? 'customized' : 'empty'}
      className={`w-full max-w-[52rem] rounded-2xl border border-[var(--border)] bg-[var(--bg-secondary)] p-5 sm:p-7 ${className}`}>
      <div className="flex items-start gap-4">
        <TrailieAvatar className="!h-11 !w-11 sm:!h-12 sm:!w-12 shrink-0" />
        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--accent-green)]">Trailie</p>
          <h3 className="text-xl font-semibold tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>Make this trip yours</h3>
        </div>
      </div>
      <p className="mt-5 text-base leading-relaxed text-[var(--text-secondary)]">Pick your season, who’s going, and your travel style to start planning with Trailie.</p>
      <div className="mt-5 space-y-4">
        {VERSION_CHOICES.map(choice => (
          <fieldset key={choice.key} className="grid min-w-0 gap-2 sm:grid-cols-[7.5rem_minmax(0,1fr)] sm:items-center">
            <legend className="sr-only">{choice.label}</legend>
            <span aria-hidden="true" className="text-sm font-medium text-[var(--text-secondary)]">{choice.label}</span>
            <div className="flex flex-wrap gap-2">
              {choice.options.map(([label, value]) => {
                const checked = selection[choice.key] === value;
                return <label key={value} className="relative inline-flex min-h-10 cursor-pointer items-center rounded-full border px-4 text-sm transition hover:border-[var(--accent-green)] focus-within:ring-2 focus-within:ring-[var(--accent-green)]"
                  style={{ borderColor: checked ? 'var(--accent-green)' : 'var(--border)', backgroundColor: checked ? 'color-mix(in srgb, var(--accent-green) 12%, transparent)' : 'transparent', fontWeight: checked ? 600 : 400 }}>
                  {/* Optional overrides: choosing the selected option again clears it. */}
                  <input type="checkbox" name={`${groupId}-${choice.key}`} checked={checked} className="sr-only"
                    onChange={() => setSelection(previous => {
                      const next = { ...previous };
                      if (checked) delete next[choice.key]; else next[choice.key] = value;
                      return next;
                    })} />
                  {checked && <span aria-hidden="true" className="mr-1.5 text-[var(--accent-green)]">✓</span>}{label}
                </label>;
              })}
            </div>
          </fieldset>
        ))}
      </div>
      <div aria-live="polite" className="mt-6">
        {prompt
          ? <figure className="border-l-2 border-[var(--accent-green)] pl-4">
            <figcaption className="text-xs font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">I’ll ask Trailie</figcaption>
            <blockquote className="mt-1 text-[15px] leading-6 text-[var(--text-primary)]">“{prompt.split(SAMPLE)[0]}”</blockquote>
          </figure>
          : <p className="text-sm text-[var(--text-tertiary)]">Choose at least one preference to start your version.</p>}
      </div>
      <div className="mt-6 flex flex-col gap-3">
        {prompt
          ? <Link href={`/plan-ai?entry=new-trip&ask=${encodeURIComponent(prompt)}`}
            className="inline-flex min-h-12 items-center justify-center rounded-full bg-[var(--accent-green)] px-6 text-[15px] font-semibold text-white hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-green)] focus-visible:ring-offset-2">
            Plan my version <span aria-hidden="true" className="ml-2">→</span>
          </Link>
          : <button type="button" disabled
            className="inline-flex min-h-12 cursor-not-allowed items-center justify-center rounded-full bg-[var(--accent-green)] px-6 text-[15px] font-semibold text-white opacity-40">
            Plan my version <span aria-hidden="true" className="ml-2">→</span>
          </button>}
        {onExplore && <button type="button" onClick={onExplore} className="inline-flex min-h-12 items-center justify-center rounded-full px-4 text-[15px] font-semibold text-[var(--accent-green)] hover:underline">
          {exploreLabel}
        </button>}
      </div>
    </section>
  );
}
