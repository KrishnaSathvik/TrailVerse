import React from 'react';
import { View, Text, StyleSheet } from '@react-pdf/renderer';
import { PDF_COLORS, PDF_FONT, PDF_SPACING } from '../pdfDesignTokens';

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    bottom: 24,
    right: PDF_SPACING.pageX,
  },
  text: {
    fontSize: 8,
    fontFamily: PDF_FONT.family,
    color: PDF_COLORS.textLight,
  },
});

/** Minimal page numbers only — safe to use with `fixed` on multi-page content. */
export default function PdfPageNumbers() {
  return (
    <View style={styles.root} fixed>
      <Text
        style={styles.text}
        render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`}
      />
    </View>
  );
}
