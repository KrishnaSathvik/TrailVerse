'use client';

import React from 'react';
import { Document, Page, Text, View, StyleSheet, Link } from '@react-pdf/renderer';

const GREEN = '#2D5016';
const LIGHT_GREEN = '#43A06A';
const BROWN = '#8B6914';
const DARK = '#1a1a1a';
const GRAY = '#6B7280';
const LIGHT_GRAY = '#F3F4F6';
const BORDER = '#E5E7EB';
const WHITE = '#FFFFFF';
const DARK_GREEN_BG = '#1a3a0a';

const styles = StyleSheet.create({
  // Cover page
  coverPage: {
    backgroundColor: DARK_GREEN_BG,
    padding: 0,
    flexDirection: 'column',
  },
  coverTop: {
    flex: 1,
    padding: 56,
    justifyContent: 'flex-end',
  },
  coverBrand: {
    fontSize: 11,
    color: '#a3c985',
    letterSpacing: 3,
    textTransform: 'uppercase',
    marginBottom: 24,
  },
  coverTitle: {
    fontSize: 32,
    color: WHITE,
    fontFamily: 'Helvetica-Bold',
    lineHeight: 1.2,
    marginBottom: 12,
  },
  coverSubtitle: {
    fontSize: 14,
    color: '#a3c985',
    marginBottom: 8,
    lineHeight: 1.4,
  },
  coverMeta: {
    fontSize: 11,
    color: '#7aad5c',
    marginBottom: 4,
  },
  coverBottom: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    padding: '20 56',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  coverFooterText: {
    fontSize: 10,
    color: '#7aad5c',
  },

  // Content pages
  page: {
    backgroundColor: '#FAFAF7',
    paddingTop: 50,
    paddingBottom: 60,
    paddingHorizontal: 48,
    fontFamily: 'Helvetica',
    fontSize: 10,
    color: DARK,
  },

  // Header stripe
  pageHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 5,
    backgroundColor: GREEN,
  },

  // Footer
  pageFooter: {
    position: 'absolute',
    bottom: 24,
    left: 48,
    right: 48,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  pageFooterText: {
    fontSize: 8,
    color: '#9CA3AF',
  },

  // Section headers
  sectionTitle: {
    fontSize: 18,
    fontFamily: 'Helvetica-Bold',
    color: GREEN,
    marginBottom: 16,
    paddingBottom: 6,
    borderBottomWidth: 2,
    borderBottomColor: GREEN,
  },
  subSectionTitle: {
    fontSize: 12,
    fontFamily: 'Helvetica-Bold',
    color: GREEN,
    marginTop: 16,
    marginBottom: 8,
  },

  // Day card
  dayCard: {
    marginBottom: 16,
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: BORDER,
  },
  dayHeader: {
    backgroundColor: GREEN,
    paddingHorizontal: 14,
    paddingVertical: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dayHeaderText: {
    fontSize: 11,
    fontFamily: 'Helvetica-Bold',
    color: WHITE,
  },
  dayHeaderDate: {
    fontSize: 9,
    color: '#a3c985',
  },
  dayBody: {
    backgroundColor: WHITE,
    padding: 12,
  },

  // Stop item
  stopRow: {
    flexDirection: 'row',
    marginBottom: 7,
    alignItems: 'flex-start',
  },
  stopDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: LIGHT_GREEN,
    marginTop: 3,
    marginRight: 8,
    flexShrink: 0,
  },
  stopContent: {
    flex: 1,
  },
  stopName: {
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
    color: DARK,
    lineHeight: 1.4,
  },
  stopNote: {
    fontSize: 8.5,
    color: GRAY,
    marginTop: 1,
    lineHeight: 1.4,
  },
  stopMeta: {
    fontSize: 8,
    color: '#9CA3AF',
    marginTop: 1,
  },

  // Info chips row
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 16,
  },
  chip: {
    backgroundColor: LIGHT_GRAY,
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: BORDER,
  },
  chipText: {
    fontSize: 9,
    color: GRAY,
  },

  // Highlights
  highlightRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 5,
  },
  highlightCheck: {
    fontSize: 9,
    color: LIGHT_GREEN,
    marginRight: 6,
    marginTop: 1,
  },
  highlightText: {
    fontSize: 10,
    color: DARK,
    flex: 1,
    lineHeight: 1.4,
  },

  // Packing / permit list
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 5,
  },
  bulletBox: {
    width: 11,
    height: 11,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 2,
    marginRight: 8,
    marginTop: 1,
    flexShrink: 0,
  },
  bulletText: {
    fontSize: 10,
    color: DARK,
    flex: 1,
    lineHeight: 1.4,
  },

  // Cost table
  costTable: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 6,
    overflow: 'hidden',
    marginTop: 8,
  },
  costRow: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  costRowLast: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: LIGHT_GRAY,
  },
  costLabel: {
    flex: 1,
    fontSize: 9.5,
    color: GRAY,
  },
  costValue: {
    fontSize: 9.5,
    fontFamily: 'Helvetica-Bold',
    color: DARK,
  },

  // CTA box
  ctaBox: {
    backgroundColor: '#f0fdf4',
    borderWidth: 1,
    borderColor: '#86efac',
    borderRadius: 8,
    padding: 16,
    marginTop: 24,
    alignItems: 'center',
  },
  ctaTitle: {
    fontSize: 12,
    fontFamily: 'Helvetica-Bold',
    color: GREEN,
    marginBottom: 4,
    textAlign: 'center',
  },
  ctaSubtitle: {
    fontSize: 9,
    color: GRAY,
    textAlign: 'center',
    marginBottom: 8,
  },
  ctaLink: {
    fontSize: 9,
    color: LIGHT_GREEN,
    textDecoration: 'underline',
  },

  // Two-column layout for last page
  twoCol: {
    flexDirection: 'row',
    gap: 16,
  },
  col: {
    flex: 1,
  },
});

function formatDuration(minutes) {
  if (!minutes) return null;
  if (minutes < 60) return `${minutes}min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}min` : `${h}hr`;
}

function formatDate(dateStr) {
  if (!dateStr) return null;
  try {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric'
    });
  } catch { return dateStr; }
}

export function TripPDFDocument({ trip }) {
  const plan = trip.plan || {};
  const formData = trip.formData || {};
  const days = plan.days || [];
  const highlights = plan.highlights || [];
  const packingList = plan.packingList || [];
  const permits = plan.permits || [];
  const estimatedCost = plan.estimatedCost || null;

  const today = new Date().toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric'
  });

  return (
    <Document
      title={trip.title || 'Trip Plan'}
      author="TrailVerse"
      subject={`${trip.parkName || 'National Park'} Trip Plan`}
      creator="Trailie by TrailVerse"
    >
      {/* ── COVER PAGE ── */}
      <Page size="A4" style={styles.coverPage}>
        <View style={styles.coverTop}>
          <Text style={styles.coverBrand}>TrailVerse</Text>
          <Text style={styles.coverTitle}>
            {trip.title || `${trip.parkName || 'National Park'} Trip Plan`}
          </Text>
          {trip.parkName && (
            <Text style={styles.coverSubtitle}>{trip.parkName}</Text>
          )}
          {(formData.startDate || formData.endDate) && (
            <Text style={styles.coverMeta}>
              📅 {formatDate(formData.startDate)}
              {formData.endDate ? ` — ${formatDate(formData.endDate)}` : ''}
            </Text>
          )}
          {formData.groupSize && (
            <Text style={styles.coverMeta}>👥 {formData.groupSize}</Text>
          )}
          {formData.budget && (
            <Text style={styles.coverMeta}>💰 {formData.budget} budget</Text>
          )}
        </View>
        <View style={styles.coverBottom}>
          <Text style={styles.coverFooterText}>
            Generated with TrailVerse AI · nationalparksexplorerusa.com
          </Text>
          <Text style={styles.coverFooterText}>{today}</Text>
        </View>
      </Page>

      {/* ── ITINERARY PAGES ── */}
      {days.length > 0 && (
        <Page size="A4" style={styles.page} wrap>
          <View style={styles.pageHeader} fixed />

          <Text style={styles.sectionTitle}>Day-by-Day Itinerary</Text>

          {/* Trip details chips */}
          <View style={styles.chipRow}>
            {plan.totalDays && (
              <View style={styles.chip}>
                <Text style={styles.chipText}>{plan.totalDays} days</Text>
              </View>
            )}
            {formData.groupSize && (
              <View style={styles.chip}>
                <Text style={styles.chipText}>{formData.groupSize}</Text>
              </View>
            )}
            {formData.fitnessLevel && (
              <View style={styles.chip}>
                <Text style={styles.chipText}>{formData.fitnessLevel} fitness</Text>
              </View>
            )}
            {formData.accommodation && (
              <View style={styles.chip}>
                <Text style={styles.chipText}>{formData.accommodation}</Text>
              </View>
            )}
          </View>

          {days.map((day) => (
            <View key={day.id} style={styles.dayCard} wrap={false}>
              <View style={styles.dayHeader}>
                <Text style={styles.dayHeaderText}>{day.label}</Text>
                {day.date && (
                  <Text style={styles.dayHeaderDate}>{formatDate(day.date)}</Text>
                )}
              </View>
              <View style={styles.dayBody}>
                {(day.stops || []).map((stop) => (
                  <View key={stop.id} style={styles.stopRow}>
                    <View style={styles.stopDot} />
                    <View style={styles.stopContent}>
                      <Text style={styles.stopName}>{stop.name}</Text>
                      {stop.note && (
                        <Text style={styles.stopNote}>{stop.note}</Text>
                      )}
                      {(stop.startTime || stop.duration) && (
                        <Text style={styles.stopMeta}>
                          {stop.startTime ? `Start: ${stop.startTime}` : ''}
                          {stop.startTime && stop.duration ? '  ·  ' : ''}
                          {stop.duration ? `Duration: ${formatDuration(stop.duration)}` : ''}
                        </Text>
                      )}
                    </View>
                  </View>
                ))}
                {(!day.stops || day.stops.length === 0) && (
                  <Text style={{ fontSize: 9, color: '#9CA3AF' }}>No stops added yet</Text>
                )}
              </View>
            </View>
          ))}

          <View style={styles.pageFooter} fixed>
            <Text style={styles.pageFooterText}>
              {trip.title || 'Trip Plan'} · TrailVerse
            </Text>
            <Text style={styles.pageFooterText} render={({ pageNumber, totalPages }) =>
              `${pageNumber} / ${totalPages}`
            } />
          </View>
        </Page>
      )}

      {/* ── DETAILS PAGE (highlights, packing, permits, cost) ── */}
      {(highlights.length > 0 || packingList.length > 0 || permits.length > 0 || estimatedCost) && (
        <Page size="A4" style={styles.page}>
          <View style={styles.pageHeader} fixed />

          <Text style={styles.sectionTitle}>Trip Details</Text>

          <View style={styles.twoCol}>
            {/* Left column */}
            <View style={styles.col}>
              {highlights.length > 0 && (
                <View>
                  <Text style={styles.subSectionTitle}>Highlights</Text>
                  {highlights.map((h, i) => (
                    <View key={i} style={styles.highlightRow}>
                      <Text style={styles.highlightCheck}>✓</Text>
                      <Text style={styles.highlightText}>{typeof h === 'string' ? h : (h.name || h.label || String(h))}</Text>
                    </View>
                  ))}
                </View>
              )}

              {permits.length > 0 && (
                <View style={{ marginTop: 16 }}>
                  <Text style={styles.subSectionTitle}>Permits & Reservations</Text>
                  {permits.map((p, i) => {
                    const label = typeof p === 'string' ? p : (p.name || p.notes || 'Permit');
                    return (
                      <View key={i} style={styles.bulletRow}>
                        <View style={styles.bulletBox} />
                        <Text style={styles.bulletText}>{label}</Text>
                      </View>
                    );
                  })}
                </View>
              )}
            </View>

            {/* Right column */}
            <View style={styles.col}>
              {packingList.length > 0 && (
                <View>
                  <Text style={styles.subSectionTitle}>Packing List</Text>
                  {packingList.map((item, i) => (
                    <View key={i} style={styles.bulletRow}>
                      <View style={styles.bulletBox} />
                      <Text style={styles.bulletText}>{typeof item === 'string' ? item : (item.name || item.label || String(item))}</Text>
                    </View>
                  ))}
                </View>
              )}

              {estimatedCost && (
                <View style={{ marginTop: 16 }}>
                  <Text style={styles.subSectionTitle}>Estimated Cost</Text>
                  <View style={styles.costTable}>
                    {estimatedCost.entranceFee && (
                      <View style={styles.costRow}>
                        <Text style={styles.costLabel}>Entrance Fee</Text>
                        <Text style={styles.costValue}>{estimatedCost.entranceFee}</Text>
                      </View>
                    )}
                    {estimatedCost.camping && (
                      <View style={styles.costRow}>
                        <Text style={styles.costLabel}>Camping</Text>
                        <Text style={styles.costValue}>{estimatedCost.camping}</Text>
                      </View>
                    )}
                    {estimatedCost.total && (
                      <View style={styles.costRowLast}>
                        <Text style={{ ...styles.costLabel, fontFamily: 'Helvetica-Bold', color: DARK }}>
                          Total Estimate
                        </Text>
                        <Text style={{ ...styles.costValue, color: GREEN }}>
                          {estimatedCost.total}
                        </Text>
                      </View>
                    )}
                  </View>
                </View>
              )}
            </View>
          </View>

          {/* CTA */}
          <View style={styles.ctaBox}>
            <Text style={styles.ctaTitle}>Plan more trips with Trailie</Text>
            <Text style={styles.ctaSubtitle}>
              Free trip planner for 470+ US national parks — real-time weather, live alerts, and personalized itineraries.
            </Text>
            <Link src="https://www.nationalparksexplorerusa.com/plan-ai" style={styles.ctaLink}>
              nationalparksexplorerusa.com/plan-ai
            </Link>
          </View>

          <View style={styles.pageFooter} fixed>
            <Text style={styles.pageFooterText}>
              {trip.title || 'Trip Plan'} · TrailVerse
            </Text>
            <Text style={styles.pageFooterText} render={({ pageNumber, totalPages }) =>
              `${pageNumber} / ${totalPages}`
            } />
          </View>
        </Page>
      )}
    </Document>
  );
}
