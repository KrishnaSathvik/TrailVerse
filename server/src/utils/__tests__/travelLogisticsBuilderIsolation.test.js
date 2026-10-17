'use strict';

const fs = require('fs');
const path = require('path');

const builderPath = path.resolve(__dirname, '../travelLogisticsBuilder.js');
const catalogLoaderPath = path.resolve(__dirname, '../officialLodgingCatalog.js');

function loadBuilderWithModuleGraph() {
  jest.resetModules();
  const before = new Set(Object.keys(require.cache));
  const builder = require(builderPath);
  const loaded = Object.keys(require.cache).filter((modulePath) => !before.has(modulePath));
  return { builder, loaded };
}

describe('travelLogisticsBuilder isolation', () => {
  test('does not load routes or live Maps, Places, or NPS provider modules', () => {
    const source = fs.readFileSync(builderPath, 'utf8');
    const { loaded } = loadBuilderWithModuleGraph();
    const prohibited = [
      /[/\\]routes[/\\]/i,
      /placesLodgingService\.js$/i,
      /mapsEvidenceProvider\.js$/i,
      /npsService\.js$/i,
    ];

    expect(source).not.toMatch(/require\([^)]*(?:routes|placesLodgingService|mapsEvidenceProvider|npsService)/i);
    for (const modulePath of loaded) {
      for (const pattern of prohibited) {
        expect(modulePath).not.toMatch(pattern);
      }
    }
  });

  test('keeps park handling generic in the builder and catalog loader', () => {
    const builderSource = fs.readFileSync(builderPath, 'utf8');
    const catalogLoaderSource = fs.readFileSync(catalogLoaderPath, 'utf8');
    const yellowstoneConditional = /\bif\s*\([^)]*(?:['"]yell['"]|\byell\b)[^)]*\)/i;

    expect(builderSource).not.toMatch(yellowstoneConditional);
    expect(catalogLoaderSource).not.toMatch(yellowstoneConditional);
  });

  test('returns not_verified for a second park without catalog coverage', () => {
    const { builder } = loadBuilderWithModuleGraph();
    const result = builder.buildTravelLogistics({
      needs: { insideParkLodging: true },
      parkCode: 'acad',
      insideParkCatalog: [],
      catalogCoverage: false,
      adapterErrors: {},
    });

    expect(result.stays.insidePark).toEqual({
      status: 'not_verified',
      properties: [],
    });
  });

  test('maps an injected Places failure to provider_unavailable', () => {
    const { builder } = loadBuilderWithModuleGraph();
    const result = builder.buildTravelLogistics({
      needs: { gatewayLodging: true },
      gatewayAreaLabel: 'Bar Harbor, ME',
      gatewayPlaces: [{
        placeId: 'stale-place',
        name: 'Stale Hotel',
      }],
      adapterErrors: { gateway: new Error('offline Places failure') },
    });

    expect(result.stays.gateway).toEqual({
      status: 'provider_unavailable',
      areaLabel: 'Bar Harbor, ME',
      properties: [],
    });
  });
});
