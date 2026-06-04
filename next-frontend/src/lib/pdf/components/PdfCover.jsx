import React from 'react';
import { Page, View, Text, Image, StyleSheet } from '@react-pdf/renderer';
import { PDF_COLORS, PDF_FONT, PDF_SITE } from '../pdfDesignTokens';
import { buildQrImageUrl } from '../pdfUtils';

const styles = StyleSheet.create({
  page: {
    position: 'relative',
    backgroundColor: PDF_COLORS.greenDark,
  },
  hero: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 420,
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 420,
    backgroundColor: PDF_COLORS.coverOverlay,
  },
  content: {
    flex: 1,
    paddingHorizontal: 48,
    paddingTop: 36,
    justifyContent: 'flex-end',
    paddingBottom: 28,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 'auto',
    paddingTop: 8,
  },
  brand: {
    fontSize: 10,
    fontFamily: PDF_FONT.familyBold,
    color: PDF_COLORS.white,
    letterSpacing: 2.2,
    textTransform: 'uppercase',
  },
  badge: {
    backgroundColor: PDF_COLORS.green,
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  badgeText: {
    fontSize: 8,
    fontFamily: PDF_FONT.familyBold,
    color: PDF_COLORS.white,
  },
  titleBlock: {
    marginTop: 240,
  },
  title: {
    fontSize: 28,
    fontFamily: PDF_FONT.familyBold,
    color: PDF_COLORS.white,
    lineHeight: 1.15,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 13,
    fontFamily: PDF_FONT.family,
    color: PDF_COLORS.greenMuted,
    marginBottom: 18,
  },
  metaGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  metaItem: {
    width: '47%',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  metaLabel: {
    fontSize: 7,
    fontFamily: PDF_FONT.familyBold,
    color: PDF_COLORS.greenMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 2,
  },
  metaValue: {
    fontSize: 9.5,
    fontFamily: PDF_FONT.family,
    color: PDF_COLORS.white,
    lineHeight: 1.35,
  },
  bottomBar: {
    backgroundColor: 'rgba(0,0,0,0.35)',
    paddingHorizontal: 48,
    paddingVertical: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  bottomText: {
    fontSize: 8.5,
    fontFamily: PDF_FONT.family,
    color: PDF_COLORS.greenMuted,
  },
  qr: {
    width: 52,
    height: 52,
  },
});

export default function PdfCover({
  title,
  subtitle,
  heroImage,
  metadata = [],
  badge = 'Planned with Trailie',
  generatedOn,
  qrUrl,
}) {
  const qrImage = qrUrl ? buildQrImageUrl(qrUrl, 104) : null;

  return (
    <Page size="A4" style={styles.page}>
      {heroImage ? <Image src={heroImage} style={styles.hero} /> : null}
      <View style={styles.overlay} />

      <View style={styles.content}>
        <View style={styles.topRow}>
          <Text style={styles.brand}>{PDF_SITE.name}</Text>
          {badge ? (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{badge}</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.titleBlock}>
          <Text style={styles.title}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}

          {metadata.length > 0 ? (
            <View style={styles.metaGrid}>
              {metadata.map((item) => (
                <View key={item.label} style={styles.metaItem}>
                  <Text style={styles.metaLabel}>{item.label}</Text>
                  <Text style={styles.metaValue}>{item.value}</Text>
                </View>
              ))}
            </View>
          ) : null}
        </View>
      </View>

      <View style={styles.bottomBar}>
        <View>
          <Text style={styles.bottomText}>
            Generated with TrailVerse AI · {PDF_SITE.domain}
          </Text>
          {generatedOn ? (
            <Text style={[styles.bottomText, { marginTop: 3 }]}>{generatedOn}</Text>
          ) : null}
        </View>
        {qrImage ? <Image src={qrImage} style={styles.qr} /> : null}
      </View>
    </Page>
  );
}
