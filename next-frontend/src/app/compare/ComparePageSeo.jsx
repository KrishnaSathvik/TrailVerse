'use client';

import { Columns } from '@components/icons';

export default function ComparePageSeo() {
  return (
    <>
            {/* Hero Section */}
            <section className="relative overflow-hidden border-b py-5 sm:py-8" style={{ borderColor: 'var(--border)' }}>
              <div className="relative z-10 max-w-[92rem] mx-auto px-4 sm:px-6 lg:px-10 xl:px-12">
                <div>
                  <div className="inline-flex items-center gap-2 rounded-full px-4 py-2 mb-3 sm:mb-4 backdrop-blur"
                    style={{
                      backgroundColor: 'var(--surface)',
                      borderWidth: '1px',
                      borderColor: 'var(--border)'
                    }}
                  >
                    <Columns className="h-4 w-4" style={{ color: 'var(--text-secondary)' }} />
                    <span className="text-xs font-medium uppercase tracking-wider"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      Side-by-Side Comparison
                    </span>
                  </div>
      
                  <h1 className="text-3xl sm:text-5xl lg:text-7xl font-semibold tracking-tighter leading-none mb-3 sm:mb-4"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    Compare Parks &amp; Sites
                  </h1>
                  <p className="text-base sm:text-lg lg:text-xl max-w-3xl"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    Compare up to four parks side by side — fees, parking, weather, crowds,
                    and activities to help you choose your next adventure.
                  </p>
                </div>
              </div>
            </section>
      
            {/* Explainer — targets "compare entrance fees parking amenities" queries */}
            <section className="pb-4 sm:pb-10">
              <div className="max-w-[92rem] mx-auto px-4 sm:px-6 lg:px-10 xl:px-12">
                <p className="md:hidden text-sm leading-relaxed mb-4" style={{ color: 'var(--text-secondary)' }}>
                  Compare entrance fees, NPS parking lots, crowd levels, weather, and facilities across parks and sites.
                </p>
                <div className="hidden md:grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="rounded-2xl p-5" style={{ backgroundColor: 'var(--surface)', borderWidth: '1px', borderColor: 'var(--border)' }}>
                    <h2 className="text-sm font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>Entrance Fees &amp; Parking</h2>
                    <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                      See entrance fees, parking costs, and pass options for each park before you buy. Compare included amenities across up to four parks at once.
                    </p>
                  </div>
                  <div className="rounded-2xl p-5" style={{ backgroundColor: 'var(--surface)', borderWidth: '1px', borderColor: 'var(--border)' }}>
                    <h2 className="text-sm font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>Crowds &amp; Best Times</h2>
                    <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                      Compare visitor crowd levels by season, peak hours, and holiday weekends so you can pick the quietest window for your trip.
                    </p>
                  </div>
                  <div className="rounded-2xl p-5" style={{ backgroundColor: 'var(--surface)', borderWidth: '1px', borderColor: 'var(--border)' }}>
                    <h2 className="text-sm font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>Activities &amp; Facilities</h2>
                    <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                      Compare hiking trails, campgrounds, lodging, visitor centers, and accessibility features side by side for any park or site.
                    </p>
                  </div>
                </div>
              </div>
            </section>
    </>
  );
}
