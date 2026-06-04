import React from 'react';
import { View, Text, Image, StyleSheet, Link } from '@react-pdf/renderer';
import { PDF_COLORS, PDF_FONT, PDF_SPACING } from '../pdfDesignTokens';
import { buildQrImageUrl, normalizePdfLinkUrl } from '../pdfUtils';

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    bottom: 22,
    left: PDF_SPACING.pageX,
    right: PDF_SPACING.pageX,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  left: {
    flex: 1,
    paddingRight: 12,
  },
  label: {
    fontSize: 7.5,
    fontFamily: PDF_FONT.family,
    color: PDF_COLORS.textLight,
    marginBottom: 2,
  },
  link: {
    fontSize: 7.5,
    fontFamily: PDF_FONT.family,
    color: PDF_COLORS.green,
    textDecoration: 'none',
  },
  pageNum: {
    fontSize: 8,
    fontFamily: PDF_FONT.family,
    color: PDF_COLORS.textLight,
    textAlign: 'right',
  },
  qr: {
    width: 44,
    height: 44,
    marginLeft: 8,
  },
});

export default function PdfFooter({ label, url, showQr = false, documentTitle }) {
  const qrUrl = showQr && url ? buildQrImageUrl(url, 88) : null;

  return (
    <View style={styles.root} fixed>
      <View style={styles.left}>
        {documentTitle ? (
          <Text style={styles.label}>{documentTitle}</Text>
        ) : null}
        {url ? (
          <Link src={normalizePdfLinkUrl(url) || url}>
            <Text style={styles.link}>
              {label || url.replace(/^https?:\/\//, '')}
            </Text>
          </Link>
        ) : null}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end' }}>
        <Text
          style={styles.pageNum}
          render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`}
        />
        {qrUrl ? <Image src={qrUrl} style={styles.qr} /> : null}
      </View>
    </View>
  );
}
