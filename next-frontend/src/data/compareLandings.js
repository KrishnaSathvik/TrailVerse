/** Indexable park comparison landing pages → /compare/[slug] */
export const COMPARE_LANDINGS = [
  {
    slug: 'zion-vs-bryce',
    label: 'Zion vs Bryce',
    codes: ['zion', 'brca'],
    title: 'Zion vs Bryce Canyon — Compare Fees, Crowds & Activities | TrailVerse',
    description:
      'Compare Zion National Park and Bryce Canyon side by side — entrance fees, parking, crowd levels, weather, hiking, and scenic drives to pick the right Utah trip.',
    headline: 'Zion vs Bryce Canyon',
    intro:
      'Both are Utah icons, but they feel different: Zion is canyon hikes and shuttle seasons; Bryce is hoodoo amphitheaters and high-elevation viewpoints. Compare fees, crowds, and activities before you book.',
  },
  {
    slug: 'yellowstone-vs-grand-teton',
    label: 'Yellowstone vs Grand Teton',
    codes: ['yell', 'grte'],
    title: 'Yellowstone vs Grand Teton — Park Comparison | TrailVerse',
    description:
      'Compare Yellowstone and Grand Teton National Parks on fees, wildlife viewing, crowds, driving distances, lodging access, and best seasons for a Wyoming road trip.',
    headline: 'Yellowstone vs Grand Teton',
    intro:
      'Many travelers pair these parks on one trip. Yellowstone brings geysers and vast interior drives; Grand Teton delivers alpine lakes and shorter hikes near Jackson. See which fits your dates and pace.',
  },
  {
    slug: 'yosemite-vs-sequoia',
    label: 'Yosemite vs Sequoia',
    codes: ['yose', 'seki'],
    title: 'Yosemite vs Sequoia & Kings Canyon — Compare Parks | TrailVerse',
    description:
      'Compare Yosemite with Sequoia & Kings Canyon on entrance fees, reservations, crowd levels, giant sequoias vs granite valleys, and seasonal access.',
    headline: 'Yosemite vs Sequoia & Kings Canyon',
    intro:
      'Yosemite is granite icons and waterfall season; Sequoia & Kings Canyon trade crowds for giant trees and high-country passes. Compare timing, fees, and what each park does best.',
  },
  {
    slug: 'arches-vs-canyonlands',
    label: 'Arches vs Canyonlands',
    codes: ['arch', 'cany'],
    title: 'Arches vs Canyonlands — Utah Park Comparison | TrailVerse',
    description:
      'Compare Arches and Canyonlands National Parks on timed entry, fees, crowds, hiking, scenic drives, and Moab trip planning.',
    headline: 'Arches vs Canyonlands',
    intro:
      'Both sit near Moab but serve different moods: Arches is short hikes to fins and Delicate Arch; Canyonlands spreads across Island in the Sky and remote overlooks. Compare before you choose one or both.',
  },
  {
    slug: 'glacier-vs-rocky-mountain',
    label: 'Glacier vs Rocky Mountain',
    codes: ['glac', 'romo'],
    title: 'Glacier vs Rocky Mountain — Compare Crowds & Access | TrailVerse',
    description:
      'Compare Glacier and Rocky Mountain National Parks on timed entry, Going-to-the-Sun Road, Trail Ridge Road, fees, crowds, and best months to visit.',
    headline: 'Glacier vs Rocky Mountain',
    intro:
      'Both are alpine showpieces with seasonal road windows and reservation pressure. Glacier leans wild and remote; Rocky Mountain is easier to reach from Denver. Compare access, crowds, and fees.',
  },
];

export function getCompareLanding(slug) {
  return COMPARE_LANDINGS.find((landing) => landing.slug === slug) || null;
}
