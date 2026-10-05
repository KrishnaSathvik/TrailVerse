import { getAllIntentLandingPaths } from '@/data/intentLandings';

export const IOS_BUNDLE_ID = 'com.nationalparksexplorerusa.trailverse';

/** Core Universal Link paths for TrailVerse iOS (v1 + v1.1). */
export function getUniversalLinkPaths() {
  const intentPaths = getAllIntentLandingPaths();

  return [
    '/parks/*',
    '/plan-ai',
    '/plan-ai/*',
    '/compare',
    '/compare*',
    '/explore',
    '/map',
    '/map*',
    '/discover',
    '/discover/*',
    '/guides',
    '/guides/*',
    ...intentPaths,
  ];
}

/**
 * Build Apple App Site Association document.
 * @param {string} teamId — Apple Developer Team ID (10 chars)
 */
export function buildAppleAppSiteAssociation(teamId) {
  const appID = `${teamId}.${IOS_BUNDLE_ID}`;

  return {
    applinks: {
      apps: [],
      details: [
        {
          appID,
          paths: getUniversalLinkPaths(),
        },
      ],
    },
  };
}

/**
 * @param {string} teamId
 * @returns {import('next/server').Response}
 */
export function appleAppSiteAssociationResponse(teamId) {
  const body = JSON.stringify(buildAppleAppSiteAssociation(teamId), null, 2);

  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
    },
  });
}
