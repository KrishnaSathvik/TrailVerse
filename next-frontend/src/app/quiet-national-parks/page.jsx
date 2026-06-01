import { createIntentLandingPageExports } from '@/components/intent/createIntentLandingPage';

export const dynamic = 'force-dynamic';

const { generateMetadata, default: Page } = createIntentLandingPageExports('/quiet-national-parks');

export { generateMetadata };
export default Page;
