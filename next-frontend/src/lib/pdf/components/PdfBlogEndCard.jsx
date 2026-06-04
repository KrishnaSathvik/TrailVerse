import React from 'react';
import { View, Text, StyleSheet } from '@react-pdf/renderer';
import { PDF_COLORS, PDF_FONT, PDF_SITE } from '../pdfDesignTokens';
import PdfAlertStyleCard from './PdfAlertStyleCard';

const EXPLORE_URL = `${PDF_SITE.baseUrl}/explore`;

const styles = StyleSheet.create({
  section: {
    marginTop: 28,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 13,
    fontFamily: PDF_FONT.familyBold,
    color: PDF_COLORS.text,
    marginBottom: 10,
  },
});

/** End-of-document CTAs — Explore + Trailie (shared by blog and trip PDFs). */
export default function PdfBlogEndCard() {
  return (
    <View style={styles.section}>
      <View wrap={false} minPresenceAhead={100}>
        <Text style={styles.sectionTitle}>Keep exploring with TrailVerse</Text>

        <PdfAlertStyleCard
          accentColor={PDF_COLORS.green}
          badgeBg={PDF_COLORS.greenLight}
          badgeColor={PDF_COLORS.greenDark}
          badgeLabel="Explore"
          title="Explore all parks"
          body="Browse 470+ National Park Service sites with live weather, maps, compare tools, and park guides."
          buttonLabel="Browse parks"
          url={EXPLORE_URL}
        />
      </View>

      <View wrap={false} minPresenceAhead={100}>
        <PdfAlertStyleCard
          accentColor={PDF_COLORS.blue}
          badgeBg={PDF_COLORS.blueLight}
          badgeColor={PDF_COLORS.blue}
          badgeLabel="Trailie"
          title="Plan your trip with Trailie"
          body="Get a personalized itinerary, day-by-day routes, and park tips from TrailVerse AI — free to start, no account required."
          buttonLabel="Open Trailie"
          url={PDF_SITE.planAiUrl}
        />
      </View>
    </View>
  );
}
