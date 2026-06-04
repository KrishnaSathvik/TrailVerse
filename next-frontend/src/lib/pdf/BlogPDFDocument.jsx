import React from 'react';
import { Document, Page, View, Text, Image, Link, StyleSheet } from '@react-pdf/renderer';
import PdfHeader from './components/PdfHeader';
import PdfPageNumbers from './components/PdfPageNumbers';
import PdfBlogEndCard from './components/PdfBlogEndCard';
import PdfBrandBar from './components/PdfBrandBar';
import PdfAccentText from './components/PdfAccentText';
import { PDF_COLORS, PDF_FONT, PDF_SPACING, PDF_SITE } from './pdfDesignTokens';
import { formatPdfDate, toAbsoluteAssetUrl } from './pdfUtils';
import { normalizeBlogPostForPdf, parseBlogHtml } from './parseBlogHtml';

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
  excerpt: {
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
  paragraph: {
    fontSize: 10,
    lineHeight: 1.55,
    marginBottom: 10,
    color: PDF_COLORS.text,
    fontFamily: PDF_FONT.family,
  },
  h1: { fontSize: 18, fontFamily: PDF_FONT.familyBold, marginTop: 12, marginBottom: 8, color: PDF_COLORS.text },
  h2: {
    fontSize: 15,
    fontFamily: PDF_FONT.familyBold,
    marginTop: 14,
    marginBottom: 6,
    color: PDF_COLORS.text,
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: PDF_COLORS.border,
  },
  h3: { fontSize: 13, fontFamily: PDF_FONT.familyBold, marginTop: 12, marginBottom: 5, color: PDF_COLORS.text },
  h4: { fontSize: 11, fontFamily: PDF_FONT.familyBold, marginTop: 10, marginBottom: 4, color: PDF_COLORS.text },
  blockquoteWrap: {
    marginVertical: 10,
    backgroundColor: PDF_COLORS.surface,
    paddingVertical: 8,
    paddingRight: 8,
  },
  blockquoteText: {
    fontSize: 10,
    fontFamily: PDF_FONT.family,
    color: PDF_COLORS.textMuted,
    lineHeight: 1.5,
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
  image: {
    width: '100%',
    maxHeight: 260,
    borderRadius: 8,
    marginVertical: 10,
    objectFit: 'cover',
  },
  pre: {
    backgroundColor: PDF_COLORS.surface,
    borderWidth: 1,
    borderColor: PDF_COLORS.border,
    borderRadius: 6,
    padding: 8,
    marginVertical: 8,
    fontSize: 8.5,
    fontFamily: 'Courier',
  },
  hr: {
    borderBottomWidth: 1,
    borderBottomColor: PDF_COLORS.border,
    marginVertical: 12,
  },
  link: {
    color: PDF_COLORS.green,
    textDecoration: 'none',
    fontFamily: PDF_FONT.family,
  },
});

function headingStyle(level) {
  if (level === 1) return styles.h1;
  if (level === 2) return styles.h2;
  if (level === 3) return styles.h3;
  return styles.h4;
}

function RichText({ parts, style }) {
  if (!parts?.length) return null;

  const hasLinks = parts.some((part) => part.type === 'link');
  if (!hasLinks) {
    return <Text style={style}>{parts.map((part) => part.value).join('')}</Text>;
  }

  return (
    <Text style={style}>
      {parts.map((part, index) => {
        if (part.type === 'link') {
          return (
            <Link key={`link-${index}`} src={part.href}>
              <Text style={[style, styles.link]}>{part.text}</Text>
            </Link>
          );
        }
        return part.value;
      })}
    </Text>
  );
}

function BlogBlock({ block }) {
  switch (block.type) {
    case 'heading':
      return <RichText parts={block.parts} style={headingStyle(block.level)} />;
    case 'paragraph':
      return <RichText parts={block.parts} style={styles.paragraph} />;
    case 'blockquote':
      return (
        <PdfAccentText style={styles.blockquoteWrap}>
          <RichText parts={block.parts} style={styles.blockquoteText} />
        </PdfAccentText>
      );
    case 'ul':
    case 'ol':
      return (
        <View style={{ marginBottom: 8 }}>
          {block.items.map((itemParts, index) => (
            <View key={`${block.type}-${index}`} style={styles.listItem}>
              <Text style={styles.bullet}>{block.type === 'ol' ? `${index + 1}.` : '-'}</Text>
              <RichText parts={itemParts} style={styles.listText} />
            </View>
          ))}
        </View>
      );
    case 'image': {
      const src = toAbsoluteAssetUrl(block.src);
      if (!src) return null;
      return <Image src={src} style={styles.image} />;
    }
    case 'pre':
      return <Text style={styles.pre}>{block.text}</Text>;
    case 'hr':
      return <View style={styles.hr} />;
    default:
      return null;
  }
}

export function BlogPDFDocument({ post }) {
  const normalized = normalizeBlogPostForPdf(post);
  const blocks = parseBlogHtml(normalized.contentHtml);
  const heroImage = toAbsoluteAssetUrl(normalized.featuredImage);
  const canonicalUrl = normalized.canonicalUrl;
  const bylineParts = [
    `By ${normalized.author}`,
    normalized.publishedAt ? formatPdfDate(normalized.publishedAt) : null,
    normalized.readTime ? `${normalized.readTime} min read` : null,
  ].filter(Boolean);

  return (
    <Document
      title={normalized.title}
      author={normalized.author}
      subject={normalized.title}
      creator={PDF_SITE.name}
    >
      <Page size="A4" style={styles.coverPage}>
        <PdfBrandBar />

        <View style={styles.categoryPill}>
          <Text style={styles.categoryText}>{normalized.category}</Text>
        </View>
        <Text style={styles.title}>{normalized.title}</Text>

        {normalized.excerpt ? (
          <PdfAccentText style={{ marginBottom: 16 }}>
            <Text style={styles.excerpt}>{normalized.excerpt}</Text>
          </PdfAccentText>
        ) : null}

        <Text style={styles.byline}>{bylineParts.join('  ·  ')}</Text>
        {heroImage ? <Image src={heroImage} style={styles.hero} /> : null}
      </Page>

      <Page size="A4" style={styles.page} wrap>
        <PdfHeader subtitle="TrailVerse Blog" />
        {blocks.map((block, index) => (
          <BlogBlock key={`block-${index}`} block={block} />
        ))}

        <PdfBlogEndCard />
        <PdfPageNumbers />
      </Page>
    </Document>
  );
}

export default BlogPDFDocument;
