import { createIntentLandingPageExports } from '@/components/intent/createIntentLandingPage';

const { generateMetadata, default: Page } = createIntentLandingPageExports('/dog-friendly-parks');

export { generateMetadata };
export default Page;
