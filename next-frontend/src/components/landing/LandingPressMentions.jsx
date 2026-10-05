import FeaturedStoryCard from '@/components/common/FeaturedStoryCard';
import { LANDING_SECTION_X } from '@/lib/landingLayout';

export default function LandingPressMentions() {
  return (
    <section
      className={`relative z-0 pt-10 sm:pt-12 pb-0 ${LANDING_SECTION_X}`}
      aria-labelledby="featured-story-heading"
      style={{ backgroundColor: 'var(--bg-primary)' }}
    >
      <div className="max-w-4xl mx-auto">
        <FeaturedStoryCard />
      </div>
    </section>
  );
}
