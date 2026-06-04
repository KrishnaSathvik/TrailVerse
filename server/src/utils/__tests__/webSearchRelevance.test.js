const {
  rankAndFilterWebResults,
  scoreWebResult,
} = require('../webSearchRelevance');

describe('webSearchRelevance', () => {
  test('demotes Death Valley hit on Glacier road query', () => {
    const results = [
      {
        title: 'Lower Wildrose Road Reopens - Death Valley',
        snippet: 'Death Valley National Park road work',
        url: 'https://www.nps.gov/deva/learn/news/lower-wildrose-road-reopens.htm',
        source: 'brave',
      },
      {
        title: 'Temporary road closure possible for GTSR',
        snippet: 'Going-to-the-Sun Road may close between Avalanche and Rising Sun',
        url: 'https://www.nps.gov/glac/learn/news/temporary-road-closure-possible-for-gtsr-due-to-weather.htm',
        source: 'brave',
      },
    ];
    const ranked = rankAndFilterWebResults(results, {
      userMessage: 'Glacier National Park Going-to-the-Sun road closure status today',
      parkCode: 'glac',
      parkName: 'Glacier National Park',
      category: 'road-conditions',
    });
    expect(ranked[0].url).toContain('nps.gov/glac');
  });

  test('prefers Narrows over unrelated AllTrails trail page', () => {
    const narrows = {
      title: 'The Narrows - Zion National Park',
      snippet: 'Flash flood information',
      url: 'https://www.nps.gov/zion/planyourvisit/thenarrows.htm',
      source: 'brave',
    };
    const overlook = {
      title: 'Zion Canyon Overlook Trail',
      snippet: 'Parking limited',
      url: 'https://www.alltrails.com/trail/us/utah/canyon-overlook-trail',
      source: 'brave',
    };
    const ranked = rankAndFilterWebResults([overlook, narrows], {
      userMessage: 'The Narrows trail conditions muddy or closed this week in Zion',
      parkCode: 'zion',
      parkName: 'Zion National Park',
      category: 'trail-conditions',
    });
    expect(ranked[0].url).toContain('thenarrows');
  });
});
