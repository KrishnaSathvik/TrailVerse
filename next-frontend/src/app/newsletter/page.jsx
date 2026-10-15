import { permanentRedirect } from 'next/navigation';

// Preserve confirmation, unsubscribe, and attribution parameters from existing links.
export default async function NewsletterPage({ searchParams }) {
  const params = await searchParams;
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params || {})) {
    for (const item of Array.isArray(value) ? value : [value]) {
      if (item != null) query.append(key, item);
    }
  }
  const suffix = query.toString();
  permanentRedirect(`/where-next${suffix ? `?${suffix}` : ''}#newsletter`);
}
