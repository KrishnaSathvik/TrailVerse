require('dotenv').config();
const log = console.log;
console.log = () => {};
console.warn = () => {};

const { fetchNPSFacts, fetchWeatherFacts } = require('./src/services/factsService');

async function run() {
  console.log = log;

  // Test Yosemite
  const yose = await fetchNPSFacts({ parkCode: 'yose' });
  console.log('═══ YOSEMITE NPS FACTS ═══');
  console.log(yose || 'NULL');
  console.log('\n');

  // Test Zion
  const zion = await fetchNPSFacts({ parkCode: 'zion' });
  console.log('═══ ZION NPS FACTS ═══');
  console.log(zion || 'NULL');
  console.log('\n');

  // Test weather
  const wx = await fetchWeatherFacts({ lat: 37.865, lon: -119.538 });
  console.log('═══ YOSEMITE WEATHER ═══');
  console.log(wx || 'NULL');

  // Verify: no timed-entry in Yosemite output
  console.log('\n═══ VERIFICATION ═══');
  if (yose) {
    console.log('Yosemite mentions "timed entry":', /timed.?entry/i.test(yose) ? 'YES (BAD)' : 'NO (GOOD)');
    console.log('Yosemite mentions "reservation required":', /reservation required/i.test(yose) ? 'YES (check context)' : 'NO');
  }
  if (zion) {
    console.log('Zion mentions "Angels Landing":', /angels landing/i.test(zion) ? 'YES' : 'NO');
  }
}

run().catch(e => { console.log = log; console.log('Error:', e.message); });
