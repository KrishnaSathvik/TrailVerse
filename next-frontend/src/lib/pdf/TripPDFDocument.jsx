import React from 'react';
import { Document, Page, View, Text, Image, StyleSheet } from '@react-pdf/renderer';
import PdfHeader from './components/PdfHeader';
import PdfPageNumbers from './components/PdfPageNumbers';
import PdfBlogEndCard from './components/PdfBlogEndCard';
import PdfBrandBar from './components/PdfBrandBar';
import PdfAccentText from './components/PdfAccentText';
import PdfAlertStyleCard from './components/PdfAlertStyleCard';
import { PDF_COLORS, PDF_FONT, PDF_SPACING, PDF_SITE } from './pdfDesignTokens';
import { formatPdfDate, formatPdfDuration, resolveTripShareUrl, toAbsoluteAssetUrl, isPlaceholderHeroUrl } from './pdfUtils';
import { getSharedDayHeading as getDayHeading } from '@/utils/sharedTripFormat';

const styles = StyleSheet.create({
  coverPage: {
    backgroundColor: PDF_COLORS.bg,
    paddingHorizontal: PDF_SPACING.pageX,
    paddingTop: 36,
    paddingBottom: 48,
  },
  categoryPill: {
    alignSelf: 'flex-start',
    backgroundColor: PDF_COLORS.green,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 5,
    marginBottom: 16,
  },
  categoryText: {
    fontSize: 9,
    fontFamily: PDF_FONT.familyBold,
    color: PDF_COLORS.white,
  },
  title: {
    fontSize: 26,
    fontFamily: PDF_FONT.familyBold,
    color: PDF_COLORS.text,
    lineHeight: 1.15,
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 12,
    fontFamily: PDF_FONT.family,
    color: PDF_COLORS.textMuted,
    lineHeight: 1.5,
    marginBottom: 16,
  },
  byline: {
    fontSize: 9.5,
    fontFamily: PDF_FONT.family,
    color: PDF_COLORS.textMuted,
    lineHeight: 1.45,
    marginBottom: 4,
  },
  bylineGenerated: {
    fontSize: 8.5,
    fontFamily: PDF_FONT.family,
    color: PDF_COLORS.textLight,
    marginBottom: 18,
  },
  coverMeta: {
    marginBottom: 18,
  },
  hero: {
    width: '100%',
    height: 220,
    borderRadius: 10,
    objectFit: 'cover',
    marginBottom: 8,
  },
  page: {
    backgroundColor: PDF_COLORS.bgPage,
    paddingTop: PDF_SPACING.pageTop,
    paddingBottom: PDF_SPACING.pageBottom,
    paddingHorizontal: PDF_SPACING.pageX,
    fontFamily: PDF_FONT.family,
    fontSize: 10,
    color: PDF_COLORS.text,
  },
  sectionTitle: {
    fontSize: 15,
    fontFamily: PDF_FONT.familyBold,
    marginTop: 14,
    marginBottom: 8,
    color: PDF_COLORS.text,
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: PDF_COLORS.border,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 12,
  },
  chip: {
    backgroundColor: PDF_COLORS.greenLight,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  chipText: {
    fontSize: 7.5,
    fontFamily: PDF_FONT.familyBold,
    color: PDF_COLORS.greenDark,
  },
  dayCard: {
    backgroundColor: PDF_COLORS.surfaceHover,
    borderWidth: 1,
    borderColor: PDF_COLORS.border,
    borderLeftWidth: 4,
    borderLeftColor: PDF_COLORS.green,
    borderRadius: 10,
    marginBottom: 12,
    overflow: 'hidden',
  },
  dayHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: PDF_COLORS.border,
  },
  dayHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    paddingRight: 8,
  },
  dayBadge: {
    backgroundColor: PDF_COLORS.greenLight,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginRight: 8,
  },
  dayBadgeText: {
    fontSize: 7,
    fontFamily: PDF_FONT.familyBold,
    color: PDF_COLORS.greenDark,
  },
  dayTitle: {
    fontSize: 11,
    fontFamily: PDF_FONT.familyBold,
    color: PDF_COLORS.text,
    flex: 1,
    lineHeight: 1.35,
  },
  dayDate: {
    fontSize: 8,
    fontFamily: PDF_FONT.family,
    color: PDF_COLORS.textMuted,
  },
  dayBody: {
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  stopRow: {
    flexDirection: 'row',
    marginBottom: 8,
    alignItems: 'flex-start',
  },
  timeCol: {
    width: 40,
    paddingRight: 6,
    flexShrink: 0,
  },
  timeText: {
    fontSize: 8.5,
    fontFamily: PDF_FONT.familyBold,
    color: PDF_COLORS.green,
  },
  stopContent: {
    flex: 1,
    paddingLeft: 8,
    borderLeftWidth: 2,
    borderLeftColor: PDF_COLORS.border,
  },
  stopName: {
    fontSize: 10,
    fontFamily: PDF_FONT.familyBold,
    color: PDF_COLORS.text,
    lineHeight: 1.35,
  },
  stopNote: {
    fontSize: 8.5,
    fontFamily: PDF_FONT.family,
    color: PDF_COLORS.textMuted,
    marginTop: 2,
    lineHeight: 1.4,
  },
  stopMeta: {
    fontSize: 7.5,
    fontFamily: PDF_FONT.family,
    color: PDF_COLORS.textLight,
    marginTop: 2,
  },
  listItem: {
    flexDirection: 'row',
    marginBottom: 4,
    paddingLeft: 2,
  },
  bullet: {
    width: 14,
    fontSize: 10,
    fontFamily: PDF_FONT.family,
    color: PDF_COLORS.green,
  },
  listText: {
    flex: 1,
    fontSize: 10,
    lineHeight: 1.5,
    color: PDF_COLORS.text,
    fontFamily: PDF_FONT.family,
  },
  costCard: {
    backgroundColor: PDF_COLORS.surfaceHover,
    borderWidth: 1,
    borderColor: PDF_COLORS.border,
    borderLeftWidth: 4,
    borderLeftColor: PDF_COLORS.greenDark,
    borderRadius: 10,
    overflow: 'hidden',
    marginBottom: 8,
  },
  costRow: {
    flexDirection: 'row',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: PDF_COLORS.border,
  },
  costRowLast: {
    flexDirection: 'row',
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: PDF_COLORS.greenLight,
  },
  costLabel: {
    flex: 1,
    fontSize: 9.5,
    fontFamily: PDF_FONT.family,
    color: PDF_COLORS.textMuted,
  },
  costValue: {
    fontSize: 9.5,
    fontFamily: PDF_FONT.familyBold,
    color: PDF_COLORS.text,
  },
  emptyText: {
    fontSize: 10,
    fontFamily: PDF_FONT.family,
    color: PDF_COLORS.textMuted,
    lineHeight: 1.5,
    marginBottom: 12,
  },
  shareSection: {
    marginTop: 20,
    marginBottom: 4,
  },
  shareSectionTitle: {
    fontSize: 13,
    fontFamily: PDF_FONT.familyBold,
    color: PDF_COLORS.text,
    marginBottom: 10,
  },
});

function formatGroupSizeChip(size) {
  const value = Number(size);
  if (!value || Number.isNaN(value)) return String(size);
  return value === 1 ? '1 traveler' : `${value} travelers`;
}

function formatMetaLabel(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function joinMetaParts(parts) {
  return parts.filter(Boolean).join('\u00A0·\u00A0');
}

function buildCoverMetaLines(formData, plan, generatedOn) {
  const schedule = [];

  if (formData.startDate || formData.endDate) {
    const start = formatPdfDate(formData.startDate);
    const end = formData.endDate ? formatPdfDate(formData.endDate) : null;
    schedule.push(end ? `${start} — ${end}` : start);
  }
  if (plan.totalDays) schedule.push(`${plan.totalDays} days`);

  const details = [];
  if (formData.groupSize) details.push(formatGroupSizeChip(formData.groupSize));
  if (formData.budget) details.push(`${formatMetaLabel(formData.budget)} budget`);
  if (formData.fitnessLevel) details.push(`${formatMetaLabel(formData.fitnessLevel)} fitness`);
  if (formData.accommodation) details.push(formatMetaLabel(formData.accommodation));

  return {
    schedule: schedule.length ? joinMetaParts(schedule) : null,
    details: details.length ? joinMetaParts(details) : null,
    generatedOn: generatedOn ? `Generated ${generatedOn}` : null,
  };
}

function TripCoverMeta({ formData, plan, generatedOn }) {
  const lines = buildCoverMetaLines(formData, plan, generatedOn);

  if (!lines.schedule && !lines.details && !lines.generatedOn) return null;

  return (
    <View style={styles.coverMeta}>
      {lines.schedule ? <Text style={styles.byline}>{lines.schedule}</Text> : null}
      {lines.details ? <Text style={styles.byline}>{lines.details}</Text> : null}
      {lines.generatedOn ? <Text style={styles.bylineGenerated}>{lines.generatedOn}</Text> : null}
    </View>
  );
}

function ListSection({ title, items }) {
  if (!items?.length) return null;

  const [firstItem, ...restItems] = items;

  const renderItem = (item, index) => {
    const text = typeof item === 'string' ? item : (item.name || item.label || item.notes || String(item));
    return (
      <View key={`${title}-${index}`} style={styles.listItem}>
        <Text style={styles.bullet}>-</Text>
        <Text style={styles.listText}>{text}</Text>
      </View>
    );
  };

  return (
    <View>
      <View wrap={false} minPresenceAhead={48}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {renderItem(firstItem, 0)}
      </View>
      {restItems.map((item, index) => renderItem(item, index + 1))}
    </View>
  );
}

function StopRow({ stop }) {
  return (
    <View style={styles.stopRow} wrap={false}>
      <View style={styles.timeCol}>
        <Text style={styles.timeText}>{stop.startTime || '-'}</Text>
      </View>
      <View style={styles.stopContent}>
        <Text style={styles.stopName}>{stop.name}</Text>
        {stop.note ? <Text style={styles.stopNote}>{stop.note}</Text> : null}
        {stop.duration ? (
          <Text style={styles.stopMeta}>Duration: {formatPdfDuration(stop.duration)}</Text>
        ) : null}
      </View>
    </View>
  );
}

function DayCard({ day, dayIndex }) {
  const stops = day.stops || [];
  const [firstStop, ...restStops] = stops;
  const { badge, title } = getDayHeading(day, dayIndex);

  return (
    <View style={styles.dayCard}>
      <View wrap={false} minPresenceAhead={72}>
        <View style={styles.dayHeader}>
          <View style={styles.dayHeaderLeft}>
            <View style={styles.dayBadge}>
              <Text style={styles.dayBadgeText}>{badge}</Text>
            </View>
            {title ? <Text style={styles.dayTitle}>{title}</Text> : null}
          </View>
          {day.date ? <Text style={styles.dayDate}>{formatPdfDate(day.date)}</Text> : null}
        </View>

        <View style={styles.dayBody}>
          {firstStop ? (
            <StopRow stop={firstStop} />
          ) : (
            <Text style={{ fontSize: 9, color: PDF_COLORS.textLight }}>No stops added yet</Text>
          )}
        </View>
      </View>

      {restStops.length > 0 ? (
        <View style={[styles.dayBody, { paddingTop: 0 }]}>
          {restStops.map((stop, stopIndex) => (
            <StopRow key={stop.id || `${day.id}-stop-${stopIndex + 1}`} stop={stop} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

function CostSection({ estimatedCost }) {
  if (!estimatedCost) return null;

  return (
    <View wrap={false} minPresenceAhead={120}>
      <Text style={styles.sectionTitle}>Estimated Cost</Text>
      <View style={styles.costCard}>
        {estimatedCost.entranceFee ? (
          <View style={styles.costRow}>
            <Text style={styles.costLabel}>Entrance Fee</Text>
            <Text style={styles.costValue}>{estimatedCost.entranceFee}</Text>
          </View>
        ) : null}
        {estimatedCost.camping ? (
          <View style={styles.costRow}>
            <Text style={styles.costLabel}>Camping</Text>
            <Text style={styles.costValue}>{estimatedCost.camping}</Text>
          </View>
        ) : null}
        {estimatedCost.total ? (
          <View style={styles.costRowLast}>
            <Text style={{ ...styles.costLabel, fontFamily: PDF_FONT.familyBold, color: PDF_COLORS.text }}>
              Total Estimate
            </Text>
            <Text style={{ ...styles.costValue, color: PDF_COLORS.greenDark }}>
              {estimatedCost.total}
            </Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

export function TripPDFDocument({ trip }) {
  const plan = trip.plan || {};
  const formData = trip.formData || {};
  const days = plan.days || [];
  const highlights = plan.highlights || [];
  const packingList = plan.packingList || [];
  const permits = plan.permits || [];
  const estimatedCost = plan.estimatedCost || null;
  const tripTitle = trip.title || `${trip.parkName || 'National Park'} Trip Plan`;
  const shareUrl = resolveTripShareUrl(trip);
  const resolvedHero = toAbsoluteAssetUrl(trip.heroImage);
  const heroImage = resolvedHero && !isPlaceholderHeroUrl(resolvedHero) ? resolvedHero : null;

  const today = new Date().toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  const chips = [
    plan.totalDays ? `${plan.totalDays} days` : null,
    formData.groupSize ? formatGroupSizeChip(formData.groupSize) : null,
    formData.budget ? `${formatMetaLabel(formData.budget)} budget` : null,
    formData.fitnessLevel ? `${formatMetaLabel(formData.fitnessLevel)} fitness` : null,
    formData.accommodation ? formatMetaLabel(formData.accommodation) : null,
  ].filter(Boolean);

  const hasContent = days.length > 0
    || highlights.length > 0
    || packingList.length > 0
    || permits.length > 0
    || estimatedCost;

  return (
    <Document
      title={tripTitle}
      author={PDF_SITE.name}
      subject={`${trip.parkName || 'National Park'} Trip Plan`}
      creator="Trailie by TrailVerse"
    >
      <Page size="A4" style={styles.coverPage}>
        <PdfBrandBar />

        <View style={styles.categoryPill}>
          <Text style={styles.categoryText}>Trip Plan</Text>
        </View>

        <Text style={styles.title}>{tripTitle}</Text>

        {trip.parkName ? (
          <PdfAccentText style={{ marginBottom: 16 }}>
            <Text style={styles.subtitle}>
              {trip.parkName} · Planned with Trailie
            </Text>
          </PdfAccentText>
        ) : null}

        <TripCoverMeta formData={formData} plan={plan} generatedOn={today} />
        {heroImage ? <Image src={heroImage} style={styles.hero} /> : null}
      </Page>

      <Page size="A4" style={styles.page} wrap>
        <PdfHeader subtitle="Trip Plan" />

        {!hasContent ? (
          <Text style={styles.emptyText}>
            Your itinerary details will appear here once Trailie finishes building your plan.
          </Text>
        ) : null}

        {days.length > 0 ? (
          <View>
            <View wrap={false} minPresenceAhead={56}>
              <Text style={styles.sectionTitle}>Day-by-Day Itinerary</Text>

              {chips.length > 0 ? (
                <View style={styles.chipRow}>
                  {chips.map((chip) => (
                    <View key={chip} style={styles.chip}>
                      <Text style={styles.chipText}>{chip}</Text>
                    </View>
                  ))}
                </View>
              ) : null}
            </View>

            {days.map((day, index) => (
              <DayCard key={day.id || `day-${index}`} day={day} dayIndex={index} />
            ))}
          </View>
        ) : null}

        <ListSection title="Highlights" items={highlights} />
        <ListSection title="Packing List" items={packingList} />
        <ListSection title="Permits & Reservations" items={permits} />
        <CostSection estimatedCost={estimatedCost} />

        {shareUrl ? (
          <View style={styles.shareSection} wrap={false} minPresenceAhead={110}>
            <Text style={styles.shareSectionTitle}>Your trip online</Text>
            <PdfAlertStyleCard
              accentColor={PDF_COLORS.greenDark}
              badgeBg={PDF_COLORS.greenLight}
              badgeColor={PDF_COLORS.greenDark}
              badgeLabel="Shared plan"
              title="View this trip online"
              body="Anyone with this link can open your live itinerary on TrailVerse — no login required."
              buttonLabel="Open trip"
              url={shareUrl}
            />
          </View>
        ) : null}

        <PdfBlogEndCard />
        <PdfPageNumbers />
      </Page>
    </Document>
  );
}

export default TripPDFDocument;
