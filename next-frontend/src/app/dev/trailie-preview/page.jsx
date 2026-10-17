import { notFound } from 'next/navigation';
import PreviewHarness from './PreviewHarness';
export const dynamic = 'force-dynamic';
export const metadata = { robots: { index: false, follow: false } };
export default function Page() {
  if (process.env.NODE_ENV !== 'development' || process.env.NEXT_PUBLIC_TRAILIE_DRAFT_PREVIEW !== 'true') notFound();
  return <PreviewHarness />;
}
