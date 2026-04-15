'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, MapPin, Clock, Calendar, ExternalLink, Tag, Dog, Accessibility, Mountain
} from '@components/icons';
import Header from '@/components/common/Header';
import Footer from '@/components/common/Footer';
import OptimizedImage from '@/components/common/OptimizedImage';
import Button from '@/components/common/Button';
import ShareButtons from '@/components/common/ShareButtons';
import { processHtmlContent } from '@/utils/htmlUtils';

const ActivityDetailClient = ({ activity, parkCode, activityId }) => {
  const router = useRouter();
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);

  const handleBack = () => {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back();
      return;
    }

    router.replace(`/parks/${parkCode}?tab=activities`);
  };

  const activityImages = activity.images || [];
  const hasImages = activityImages.length > 0;
  const shareUrl = typeof window !== 'undefined' ? window.location.href : `https://www.nationalparksexplorerusa.com/parks/${parkCode}/activity/${activityId}`;

  // processHtmlContent sanitizes NPS API HTML content
  const renderSanitizedHtml = (html) => ({
    __html: processHtmlContent(html)
  });

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <Header />

      {/* Hero Image */}
      <section className="relative h-[60vh] md:h-[70vh] overflow-hidden">
        <OptimizedImage
          src={hasImages ? activityImages[selectedImageIndex]?.url : '/background1.png'}
          alt={activity.title}
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/20 to-black/90" />

        {/* Navigation Overlay */}
        <div className="absolute top-0 left-0 right-0 z-10 pt-4 sm:pt-6">
          <div className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-6 xl:px-8">
            <Button
              onClick={handleBack}
              variant="secondary"
              size="md"
              icon={ArrowLeft}
              className="backdrop-blur hover:-translate-x-1"
              style={{
                backgroundColor: 'rgba(255, 255, 255, 0.9)',
                borderWidth: '1px',
                borderColor: 'rgba(255, 255, 255, 0.3)',
                color: '#1f2937',
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)'
              }}
            >
              Go Back
            </Button>
          </div>
        </div>

        {/* Activity Info Overlay */}
        <div className="absolute bottom-0 left-0 right-0 z-10 pb-4 sm:pb-6 lg:pb-8">
          <div className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-6 xl:px-8">
            <div className="mt-6 flex items-end justify-between gap-6">
              <div className="flex-1 min-w-0">
                {activity.parkCode && (
                  <div className="inline-flex items-center gap-2 px-2 sm:px-3 py-1 sm:py-1.5 rounded-full backdrop-blur mb-3"
                    style={{
                      backgroundColor: 'rgba(255, 255, 255, 0.15)',
                      borderWidth: '1px',
                      borderColor: 'rgba(255, 255, 255, 0.3)',
                      boxShadow: '0 2px 8px rgba(0, 0, 0, 0.2)'
                    }}
                  >
                    <MapPin className="h-3 w-3 text-white flex-shrink-0" />
                    <span className="text-xs font-semibold text-white uppercase tracking-wider">
                      {activity.parkCode}
                    </span>
                  </div>
                )}

                <div className="space-y-3 mb-3">
                  <div className="w-full">
                    <h1 className="text-lg sm:text-2xl md:text-3xl lg:text-4xl xl:text-5xl font-semibold text-white tracking-tight leading-tight drop-shadow-lg">
                      {activity.title}
                    </h1>
                  </div>

                  {activity.location && (
                    <p className="text-sm sm:text-base text-white/90 drop-shadow">
                      📍 {activity.location}
                    </p>
                  )}

                  <div className="flex items-center gap-2 sm:gap-3">
                    <ShareButtons
                      url={shareUrl}
                      title={activity.title}
                      description={activity.shortDescription || activity.description}
                      image={activity.images?.[0]?.url}
                      type="park"
                      showPrint={false}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Main Content */}
      <section className="py-8 sm:py-10 lg:py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Activity Details */}
          <div className="rounded-2xl p-6 mb-8"
            style={{ backgroundColor: 'var(--surface)', borderWidth: '1px', borderColor: 'var(--border)' }}
          >
            <h2 className="text-2xl font-bold mb-4" style={{ color: 'var(--text-primary)' }}>
              Activity Details
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {activity.duration && (
                <div className="flex items-center gap-3">
                  <Clock className="h-5 w-5" style={{ color: 'var(--text-secondary)' }} />
                  <div>
                    <p className="text-sm font-medium" style={{ color: 'var(--text-tertiary)' }}>Duration</p>
                    <p className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>{activity.duration}</p>
                  </div>
                </div>
              )}

              {activity.activities && activity.activities.length > 0 && (
                <div className="flex items-center gap-3">
                  <Mountain className="h-5 w-5" style={{ color: 'var(--text-secondary)' }} />
                  <div>
                    <p className="text-sm font-medium" style={{ color: 'var(--text-tertiary)' }}>Activity Type</p>
                    <p className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>{activity.activities.map(a => a.name).join(', ')}</p>
                  </div>
                </div>
              )}

              {(activity.arePetsPermitted || activity.arePetsPermittedWithRestrictions || activity.petsDescription) && (
                <div className="flex items-center gap-3">
                  <Dog className="h-5 w-5" style={{ color: 'var(--text-secondary)' }} />
                  <div>
                    <p className="text-sm font-medium" style={{ color: 'var(--text-tertiary)' }}>Pets</p>
                    <p className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
                      {activity.petsDescription ||
                       (activity.arePetsPermitted === "true" ? "Permitted" :
                        activity.arePetsPermittedWithRestrictions === "true" ? "Permitted with Restrictions" :
                        "Not Permitted")}
                    </p>
                  </div>
                </div>
              )}

              {activity.isReservationRequired && (
                <div className="flex items-center gap-3">
                  <Calendar className="h-5 w-5" style={{ color: 'var(--text-secondary)' }} />
                  <div>
                    <p className="text-sm font-medium" style={{ color: 'var(--text-tertiary)' }}>Reservation</p>
                    <p className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
                      {activity.isReservationRequired === "true" ? "Required" : "Not Required"}
                    </p>
                  </div>
                </div>
              )}

              {activity.doFeesApply && (
                <div className="flex items-center gap-3">
                  <Tag className="h-5 w-5" style={{ color: 'var(--text-secondary)' }} />
                  <div>
                    <p className="text-sm font-medium" style={{ color: 'var(--text-tertiary)' }}>Fees</p>
                    <p className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
                      {activity.doFeesApply === "true" ? "Fees Apply" : "No Fees"}
                    </p>
                  </div>
                </div>
              )}

              {activity.seasonDescription && (
                <div className="flex items-center gap-3">
                  <Calendar className="h-5 w-5" style={{ color: 'var(--text-secondary)' }} />
                  <div>
                    <p className="text-sm font-medium" style={{ color: 'var(--text-tertiary)' }}>Best Season</p>
                    <p className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>{activity.seasonDescription}</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* About This Activity */}
          {activity.shortDescription && (
            <div className="rounded-2xl p-6 mb-8"
              style={{ backgroundColor: 'var(--surface)', borderWidth: '1px', borderColor: 'var(--border)' }}
            >
              <h2 className="text-2xl font-bold mb-4" style={{ color: 'var(--text-primary)' }}>About This Activity</h2>
              <div className="text-base leading-relaxed" style={{ color: 'var(--text-secondary)' }}
                dangerouslySetInnerHTML={renderSanitizedHtml(activity.shortDescription)}
              />
            </div>
          )}

          {/* Detailed Description */}
          {activity.longDescription && (
            <div className="rounded-2xl p-6 mb-8"
              style={{ backgroundColor: 'var(--surface)', borderWidth: '1px', borderColor: 'var(--border)' }}
            >
              <h2 className="text-2xl font-bold mb-4" style={{ color: 'var(--text-primary)' }}>Detailed Description</h2>
              <div className="text-base leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                {(() => {
                  let cleanDescription = activity.longDescription
                    .replace(/<br\s*\/?>/gi, '\n')
                    .replace(/<[^>]*>/g, '')
                    .replace(/&nbsp;/g, ' ')
                    .replace(/\n\s*\n/g, '\n\n')
                    .trim();

                  const lines = cleanDescription.split('\n').filter(line => line.trim().length > 0);
                  let paragraphs = [];
                  let bulletPoints = [];

                  lines.forEach(line => {
                    const trimmedLine = line.trim();
                    if (trimmedLine.toLowerCase().includes('duration:') ||
                        trimmedLine.toLowerCase().includes('difficulty:') ||
                        trimmedLine.toLowerCase().includes('length:') ||
                        trimmedLine.toLowerCase().includes('distance:') ||
                        trimmedLine.toLowerCase().includes('trail type:') ||
                        trimmedLine.toLowerCase().includes('terrain:') ||
                        trimmedLine.toLowerCase().includes('trailhead location:') ||
                        trimmedLine.toLowerCase().includes('another trailhead')) {
                      bulletPoints.push(trimmedLine);
                    } else {
                      paragraphs.push(trimmedLine);
                    }
                  });

                  return (
                    <>
                      {paragraphs.map((paragraph, index) => (
                        <p key={`desc-${index}`} className="mb-4 last:mb-0">{paragraph}</p>
                      ))}
                      {bulletPoints.length > 0 && (
                        <ul className="list-disc list-inside ml-4 mt-4 space-y-2">
                          {bulletPoints.map((item, index) => (
                            <li key={`bullet-${index}`} className="leading-relaxed">{item}</li>
                          ))}
                        </ul>
                      )}
                    </>
                  );
                })()}
              </div>
            </div>
          )}

          {/* Accessibility Information */}
          {activity.accessibilityInformation && (
            <div className="rounded-2xl p-6 mb-8"
              style={{ backgroundColor: 'var(--surface)', borderWidth: '1px', borderColor: 'var(--border)' }}
            >
              <h2 className="text-2xl font-bold mb-4" style={{ color: 'var(--text-primary)' }}>Accessibility Information</h2>
              <div className="flex items-start gap-3">
                <Accessibility className="h-5 w-5 mt-1" style={{ color: 'var(--text-secondary)' }} />
                <div className="text-base leading-relaxed" style={{ color: 'var(--text-secondary)' }}
                  dangerouslySetInnerHTML={renderSanitizedHtml(activity.accessibilityInformation)}
                />
              </div>
            </div>
          )}

          {/* Location & Coordinates */}
          {(activity.latitude && activity.longitude) && (
            <div className="rounded-2xl p-6 mb-8"
              style={{ backgroundColor: 'var(--surface)', borderWidth: '1px', borderColor: 'var(--border)' }}
            >
              <h2 className="text-2xl font-bold mb-4" style={{ color: 'var(--text-primary)' }}>Location</h2>
              <div className="flex items-center gap-2 mb-4">
                <MapPin className="h-5 w-5" style={{ color: 'var(--text-secondary)' }} />
                <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                  {activity.latitude}°N, {activity.longitude}°W
                </p>
              </div>
              <a
                href={`https://www.google.com/maps?q=${activity.latitude},${activity.longitude}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg transition hover:bg-white/5"
                style={{ backgroundColor: 'var(--surface)', borderWidth: '1px', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
              >
                <ExternalLink className="h-4 w-4" />
                <span>Get Directions</span>
              </a>
            </div>
          )}

          {/* Tags */}
          {activity.tags && activity.tags.length > 0 && (
            <div className="rounded-2xl p-6 mb-8"
              style={{ backgroundColor: 'var(--surface)', borderWidth: '1px', borderColor: 'var(--border)' }}
            >
              <h2 className="text-2xl font-bold mb-4" style={{ color: 'var(--text-primary)' }}>Tags</h2>
              <div className="flex flex-wrap gap-2">
                {activity.tags.map((tag, index) => (
                  <span key={index} className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm"
                    style={{ backgroundColor: 'var(--surface-hover)', borderWidth: '1px', borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
                  >
                    <Tag className="h-3 w-3" />
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Official NPS Page Link */}
          {activity.url && (
            <div className="rounded-2xl p-6 mb-8"
              style={{ backgroundColor: 'var(--surface)', borderWidth: '1px', borderColor: 'var(--border)' }}
            >
              <h2 className="text-2xl font-bold mb-4" style={{ color: 'var(--text-primary)' }}>Official Information</h2>
              <div className="flex items-center gap-3">
                <ExternalLink className="h-5 w-5" style={{ color: 'var(--text-secondary)' }} />
                <a href={activity.url} target="_blank" rel="noopener noreferrer"
                  className="text-base font-medium hover:underline" style={{ color: 'var(--forest-600)' }}
                >
                  View on Official NPS Website
                </a>
              </div>
            </div>
          )}

          {/* Image Gallery */}
          {hasImages && (
            <div className="rounded-2xl p-6 mb-8"
              style={{ backgroundColor: 'var(--surface)', borderWidth: '1px', borderColor: 'var(--border)' }}
            >
              <h2 className="text-2xl font-bold mb-4" style={{ color: 'var(--text-primary)' }}>Gallery</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                {activityImages.map((image, index) => (
                  <div key={index} onClick={() => setSelectedImageIndex(index)}
                    className={`relative aspect-square rounded-xl overflow-hidden cursor-pointer transition hover:opacity-80 ${
                      selectedImageIndex === index ? 'ring-2 ring-forest-500' : ''
                    }`}
                  >
                    <OptimizedImage
                      src={image.url}
                      alt={image.altText || `${activity.title} - Image ${index + 1}`}
                      className="w-full h-full object-cover"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default ActivityDetailClient;
