import IconGlyph from '@/components/common/IconGlyph';
import { VOYAGEMICHIGAN_ABOUT_BODY, VOYAGEMICHIGAN_URL } from '@/data/pressMentions';
import { LANDING_SECTION, LANDING_SECTION_HEADER_MB } from '@/lib/landingLayout';

export default function LandingPressMentions() {
  return (
    <section
      className={LANDING_SECTION}
      aria-labelledby="featured-story-heading"
      style={{ backgroundColor: 'var(--bg-primary)' }}
    >
      <div className="public-shell">
        <div className={`flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between ${LANDING_SECTION_HEADER_MB}`}>
          <div>
            <div className="public-eyebrow">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: 'var(--accent-green)' }} />
              <span className="text-sm font-medium uppercase tracking-wider" style={{ color: 'var(--text-primary)' }}>
                Featured Story
              </span>
            </div>
            <h2
              id="featured-story-heading"
              className="text-2xl sm:text-3xl font-semibold tracking-tight"
              style={{ color: 'var(--text-primary)' }}
            >
              Featured in VoyageMichigan
            </h2>
            <p className="text-base sm:text-lg mt-2 max-w-lg" style={{ color: 'var(--text-secondary)' }}>
              {VOYAGEMICHIGAN_ABOUT_BODY}
            </p>
          </div>
          <a
            href={VOYAGEMICHIGAN_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 font-semibold text-sm hover:underline flex-shrink-0 whitespace-nowrap"
            style={{ color: 'var(--accent-green)' }}
          >
            Read the interview
            <IconGlyph name="ArrowRight" className="h-4 w-4" />
          </a>
        </div>
      </div>
    </section>
  );
}
