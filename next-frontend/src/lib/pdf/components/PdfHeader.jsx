import React from 'react';
import { View, Text, StyleSheet } from '@react-pdf/renderer';
import { PDF_COLORS, PDF_FONT, PDF_SITE } from '../pdfDesignTokens';

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    top: 18,
    left: 48,
    right: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  brand: {
    fontSize: 8,
    fontFamily: PDF_FONT.familyBold,
    color: PDF_COLORS.green,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  rule: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 4,
    backgroundColor: PDF_COLORS.green,
  },
  subtitle: {
    fontSize: 8,
    fontFamily: PDF_FONT.family,
    color: PDF_COLORS.textLight,
  },
});

export default function PdfHeader({ subtitle }) {
  return (
    <>
      <View style={styles.rule} fixed />
      <View style={styles.root} fixed>
        <Text style={styles.brand}>{PDF_SITE.name}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
    </>
  );
}
