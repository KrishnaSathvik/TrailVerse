'use client';

import Link from 'next/link';
import Image from 'next/image';
import IconGlyph from '@/components/common/IconGlyph';
import { logCtaClick } from '@/utils/analytics';
import { parkToSlug } from '@/utils/parkSlug';
import { LANDING_RETURN_PATH, parkDetailHref } from '@/lib/returnNavigation';

export default function LandingFeaturedParks({ parks }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-6">
      {parks.map((park, index) => {
        const parkSlug = parkToSlug(park.fullName);
        const parkUrl = parkDetailHref(parkSlug, LANDING_RETURN_PATH);

        return (
          <article
            key={park.parkCode}
            className="group relative rounded-2xl overflow-hidden transition-all duration-300 hover:-translate-y-1"
            style={{ aspectRatio: '16/11', boxShadow: 'var(--shadow-lg)' }}
          >
            <Image
              src={park.image || park.images?.[0]?.url || '/og-image-trailverse.jpg'}
              alt={park.imageAlt || ''}
              fill
              sizes="(max-width: 640px) 100vw, (max-width: 1280px) 50vw, 33vw"
              className="object-cover transition-transform duration-500 group-hover:scale-105 pointer-events-none"
              priority={index < 2}
            />
            <Link
              href={parkUrl}
              className="absolute inset-0 z-[1]"
              aria-label={`View ${park.fullName}`}
              onClick={() => logCtaClick({
                ctaId: 'landing_featured_park',
                label: park.fullName,
                surface: 'landing_featured',
                destination: parkUrl,
                parkCode: park.parkCode,
              })}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent pointer-events-none z-[2]" />
            {park.badge && (
              <div className="absolute top-4 left-4 z-10 flex items-center gap-2 px-3 py-1.5 rounded-full backdrop-blur-md border border-white/15 bg-black/35 pointer-events-none">
                <IconGlyph name="Sparkles" className="h-4 w-4 text-white" />
                <span className="text-xs font-bold text-white tracking-wide uppercase">{park.badge}</span>
              </div>
            )}
            <div className="absolute bottom-0 left-0 right-0 z-10 p-5 sm:p-6 pointer-events-none">
              <div className="flex items-center gap-2 mb-2">
                <IconGlyph name="MapPin" className="h-3.5 w-3.5 text-white/70" />
                <span className="text-xs font-medium text-white/70 uppercase tracking-wider">{park.states}</span>
              </div>
              <h3 className="text-lg sm:text-xl font-semibold text-white leading-tight">{park.fullName}</h3>
            </div>
          </article>
        );
      })}
    </div>
  );
}
