import { createIntentLandingPageExports } from '@/components/intent/createIntentLandingPage';

/** Hourly ISR — ranked grids refresh without blocking every request on Render. */
export const revalidate = 3600;

const { generateMetadata, default: Page } = createIntentLandingPageExports('/dark-sky-parks');

export { generateMetadata };
export default Page;
