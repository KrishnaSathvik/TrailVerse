import { createIntentLandingPageExports } from '@/components/intent/createIntentLandingPage';

const { generateMetadata, default: Page } = createIntentLandingPageExports('/parks-for-photography');

export { generateMetadata };
export default Page;
