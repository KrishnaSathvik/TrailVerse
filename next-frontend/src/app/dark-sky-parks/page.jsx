import { createIntentLandingPageExports } from '@/components/intent/createIntentLandingPage';

const { generateMetadata, default: Page } = createIntentLandingPageExports('/dark-sky-parks');

export { generateMetadata };
export default Page;
