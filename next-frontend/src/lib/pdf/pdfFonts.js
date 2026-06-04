let fontsRegistered = false;

/** Inter v20 TTF files from Google Fonts (woff paths 404 in react-pdf fetch). */
const INTER_FONT_SOURCES = {
  regular:
    'https://fonts.gstatic.com/s/inter/v20/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuLyfMZg.ttf',
  italic:
    'https://fonts.gstatic.com/s/inter/v20/UcCM3FwrK3iLTcvneQg7Ca725JhhKnNqk4j1ebLhAm8SrXTc2dthjQ.ttf',
  bold:
    'https://fonts.gstatic.com/s/inter/v20/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuFuYMZg.ttf',
};

export async function registerPdfFonts() {
  if (fontsRegistered) return;

  const { Font } = await import('@react-pdf/renderer');

  Font.register({
    family: 'Inter',
    fonts: [
      {
        src: INTER_FONT_SOURCES.regular,
        fontWeight: 400,
        fontStyle: 'normal',
      },
      {
        src: INTER_FONT_SOURCES.italic,
        fontWeight: 400,
        fontStyle: 'italic',
      },
      {
        src: INTER_FONT_SOURCES.bold,
        fontWeight: 700,
        fontStyle: 'normal',
      },
    ],
  });

  fontsRegistered = true;
}
