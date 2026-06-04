import { registerPdfFonts } from './pdfFonts';
import { downloadPdfDocument, slugifyPdfFilename } from './pdfUtils';
import { normalizeBlogPostForPdf } from './parseBlogHtml';

export async function exportBlogPdf(post) {
  await registerPdfFonts();

  const normalized = normalizeBlogPostForPdf(post);
  const [{ BlogPDFDocument }, React] = await Promise.all([
    import('./BlogPDFDocument'),
    import('react'),
  ]);

  const filename = slugifyPdfFilename(normalized.title, 'article');
  await downloadPdfDocument(
    React.createElement(BlogPDFDocument, { post: normalized }),
    filename,
  );
}

export default exportBlogPdf;
