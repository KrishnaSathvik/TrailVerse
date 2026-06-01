import { createIntentLandingPageExports } from '@/components/intent/createIntentLandingPage';

const { generateMetadata, default: Page } = createIntentLandingPageExports('/parks-for-first-timers');

export { generateMetadata };
export default Page;
