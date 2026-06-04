import React from 'react';
import { View, Text, Image, StyleSheet } from '@react-pdf/renderer';
import { PDF_COLORS, PDF_FONT, PDF_SITE } from '../pdfDesignTokens';
import { toAbsoluteAssetUrl } from '../pdfUtils';

const styles = StyleSheet.create({
  stripe: {
    height: 4,
    backgroundColor: PDF_COLORS.green,
    marginBottom: 16,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  logo: {
    width: 32,
    height: 32,
    marginRight: 10,
    objectFit: 'contain',
  },
  brandName: {
    fontSize: 14,
    fontFamily: PDF_FONT.familyBold,
    color: PDF_COLORS.green,
    letterSpacing: 1.2,
  },
  tagline: {
    fontSize: 8,
    fontFamily: PDF_FONT.family,
    color: PDF_COLORS.textMuted,
    marginTop: 2,
  },
  domain: {
    fontSize: 7.5,
    fontFamily: PDF_FONT.family,
    color: PDF_COLORS.textLight,
    marginTop: 2,
  },
  divider: {
    height: 1,
    backgroundColor: PDF_COLORS.border,
    marginTop: 14,
    marginBottom: 18,
  },
});

export default function PdfBrandBar({ showDivider = true }) {
  const logoUrl = toAbsoluteAssetUrl('/logo.png');

  return (
    <View>
      <View style={styles.stripe} />
      <View style={styles.row}>
        {logoUrl ? <Image src={logoUrl} style={styles.logo} /> : null}
        <View>
          <Text style={styles.brandName}>{PDF_SITE.name}</Text>
          <Text style={styles.tagline}>{PDF_SITE.tagline}</Text>
          <Text style={styles.domain}>{PDF_SITE.domain}</Text>
        </View>
      </View>
      {showDivider ? <View style={styles.divider} /> : null}
    </View>
  );
}
