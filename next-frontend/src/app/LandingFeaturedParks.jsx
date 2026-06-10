'use client';

import Link from 'next/link';
import Image from 'next/image';
import IconGlyph from '@/components/common/IconGlyph';
import { logCtaClick } from '@/utils/analytics';
import { parkToSlug } from '@/utils/parkSlug';

export default function LandingFeaturedParks({ parks }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-6">
      {parks.map((park, index) => {
        const parkSlug = parkToSlug(park.fullName);
        const parkUrl = `/parks/${parkSlug}`;
        const planUrl = `/plan-ai?park=${encodeURIComponent(park.parkCode)}&name=${encodeURIComponent(park.fullName)}`;

        return (
          <article
            key={park.parkCode}
            className="group relative rounded-2xl overflow-hidden transition-all duration-300 hover:-translate-y-1"
            style={{ aspectRatio: '16/11', boxShadow: 'var(--shadow-lg)' }}
          >
            <Image
              src={park.images?.[0]?.url || '/og-image-trailverse.jpg'}
              alt=""
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
            <div className="absolute bottom-0 left-0 right-0 z-10 p-5 sm:p-6 pointer-events-none">
              <div className="flex items-center gap-2 mb-2">
                <IconGlyph name="MapPin" className="h-3.5 w-3.5 text-white/70" />
                <span className="text-xs font-medium text-white/70 uppercase tracking-wider">{park.states}</span>
              </div>
              <h3 className="text-lg sm:text-xl font-semibold text-white leading-tight">{park.fullName}</h3>
              <div className="mt-3 pointer-events-auto">
                <Link
                  href={planUrl}
                  className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold text-white transition hover:opacity-90"
                  style={{ backgroundColor: 'var(--accent-green)' }}
                  onClick={() => logCtaClick({
                    ctaId: 'landing_featured_plan_trailie',
                    label: 'Plan with Trailie',
                    surface: 'landing_featured',
                    destination: planUrl,
                    parkCode: park.parkCode,
                  })}
                >
                  <IconGlyph name="Sparkles" className="h-3.5 w-3.5" />
                  Plan with Trailie
                </Link>
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}
