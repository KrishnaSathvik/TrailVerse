import { appleAppSiteAssociationResponse } from '@/lib/appleAppSiteAssociation';

/** Legacy path — some validators fetch /apple-app-site-association (no .well-known). */
export function GET() {
  const teamId = process.env.APPLE_TEAM_ID;

  if (!teamId) {
    return new Response(
      JSON.stringify({
        error: 'APPLE_TEAM_ID is not configured',
        hint: 'Set APPLE_TEAM_ID in Vercel environment variables (Apple Developer Team ID).',
      }),
      {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  }

  return appleAppSiteAssociationResponse(teamId);
}
