import { createIntentLandingPageExports } from '@/components/intent/createIntentLandingPage';

const { generateMetadata, default: Page } = createIntentLandingPageExports('/quiet-national-parks');

export { generateMetadata };
export default Page;
