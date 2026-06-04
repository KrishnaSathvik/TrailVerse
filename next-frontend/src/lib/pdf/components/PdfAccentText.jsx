import React from 'react';
import { View, Text, StyleSheet } from '@react-pdf/renderer';
import { PDF_COLORS } from '../pdfDesignTokens';

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  bar: {
    width: 3,
    backgroundColor: PDF_COLORS.green,
    marginRight: 10,
  },
  text: {
    flex: 1,
  },
});

/** Green accent bar + text — avoids borderLeft on Text (react-pdf overlap glitches). */
export default function PdfAccentText({ children, style, barStyle }) {
  return (
    <View style={[styles.row, style]}>
      <View style={[styles.bar, barStyle]} />
      <View style={styles.text}>{children}</View>
    </View>
  );
}
