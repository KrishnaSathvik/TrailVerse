import { createIntentLandingPageExports } from '@/components/intent/createIntentLandingPage';

export const dynamic = 'force-dynamic';

const { generateMetadata, default: Page } = createIntentLandingPageExports('/parks-for-first-timers');

export { generateMetadata };
export default Page;
