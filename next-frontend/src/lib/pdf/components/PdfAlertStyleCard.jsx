import React from 'react';
import { View, Text, Link, StyleSheet } from '@react-pdf/renderer';
import { PDF_COLORS, PDF_FONT } from '../pdfDesignTokens';
import { normalizePdfLinkUrl } from '../pdfUtils';

const styles = StyleSheet.create({
  card: {
    backgroundColor: PDF_COLORS.surfaceHover,
    borderWidth: 1,
    borderColor: PDF_COLORS.border,
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  cardTitle: {
    flex: 1,
    fontSize: 11,
    fontFamily: PDF_FONT.familyBold,
    color: PDF_COLORS.text,
    lineHeight: 1.35,
    paddingRight: 10,
  },
  badge: {
    fontSize: 7,
    fontFamily: PDF_FONT.familyBold,
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 10,
    marginBottom: 8,
    alignSelf: 'flex-start',
  },
  body: {
    fontSize: 9,
    fontFamily: PDF_FONT.family,
    color: PDF_COLORS.textMuted,
    lineHeight: 1.5,
  },
  ctaButton: {
    backgroundColor: PDF_COLORS.green,
    color: PDF_COLORS.white,
    fontSize: 8,
    fontFamily: PDF_FONT.familyBold,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 6,
    textDecoration: 'none',
  },
});

/** Alerts-tab card pattern — solid surface, 1px border, colored left accent bar. */
export default function PdfAlertStyleCard({
  accentColor,
  badgeBg,
  badgeColor,
  badgeLabel,
  title,
  body,
  buttonLabel,
  url,
}) {
  const linkUrl = normalizePdfLinkUrl(url);
  if (!linkUrl) return null;

  return (
    <View
      wrap={false}
      style={[
        styles.card,
        {
          borderLeftWidth: 4,
          borderLeftColor: accentColor,
        },
      ]}
    >
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle}>{title}</Text>
        <Link src={linkUrl}>
          <Text style={styles.ctaButton}>{buttonLabel}</Text>
        </Link>
      </View>

      <Text style={[styles.badge, { backgroundColor: badgeBg, color: badgeColor }]}>
        {badgeLabel}
      </Text>

      <Text style={styles.body}>{body}</Text>
    </View>
  );
}
