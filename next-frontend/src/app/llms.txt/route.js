import { buildLlmsTxt } from '@/lib/buildLlmsTxt';

/** @returns {import('next/server').NextResponse} */
export function GET() {
  const body = buildLlmsTxt();

  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
    },
  });
}
