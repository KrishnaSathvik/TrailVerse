import IconGlyph from '@/components/common/IconGlyph';
import { VOYAGEMICHIGAN_ABOUT_BODY, VOYAGEMICHIGAN_URL } from '@/data/pressMentions';

export default function FeaturedStoryCard({ headingId = 'featured-story-heading' }) {
  return (
    <div
      className="rounded-3xl p-8 sm:p-10 backdrop-blur"
      style={{ backgroundColor: 'var(--surface)', borderWidth: '1px', borderColor: 'var(--border)' }}
    >
      <div
        className="inline-flex items-center gap-2 rounded-full px-4 py-2 mb-6"
        style={{
          backgroundColor: 'var(--surface-hover)',
          borderWidth: '1px',
          borderColor: 'var(--border)',
        }}
      >
        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: 'var(--accent-green)' }} />
        <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>
          Featured Story
        </span>
      </div>
      <h2
        id={headingId}
        className="text-2xl sm:text-3xl font-bold mb-4"
        style={{ color: 'var(--text-primary)' }}
      >
        Featured in VoyageMichigan
      </h2>
      <p className="text-base leading-relaxed mb-6" style={{ color: 'var(--text-secondary)' }}>
        {VOYAGEMICHIGAN_ABOUT_BODY}
      </p>
      <a
        href={VOYAGEMICHIGAN_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 text-sm font-semibold hover:underline"
        style={{ color: 'var(--accent-green)' }}
      >
        Read the interview
        <IconGlyph name="ArrowRight" className="h-4 w-4" />
      </a>
    </div>
  );
}
