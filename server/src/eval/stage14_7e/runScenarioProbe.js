/**
 * Stage 14.7E — deterministic single-scenario probe.
 *
 * Drives one fresh scenario child end to end: boots the REAL application via its
 * `{ app, server }` seam, issues one authenticated request to the REAL mounted
 * /api/ai/chat-stream, prints the observed SSE event sequence and the isolation
 * counters, then runs ownership-scoped cleanup and shuts the child down.
 *
 * Makes ZERO live provider calls — the Anthropic SDK is replaced in the require
 * cache before the application graph loads.
 *
 * Usage: node src/eval/stage14_7e/runScenarioProbe.js [scenarioId]
 */
const { fork } = require('child_process');
const path = require('path');
const SCEN = require(path.join(__dirname, '../trailie/scenarios')).byId(process.argv[2] || 'basic-02-three-day');
const child = fork(path.join(__dirname, 'scenarioChild.js'), [], { stdio: ['ignore','pipe','pipe','ipc'] });
let err='';
child.stderr.on('data', d => err += d.toString());
const timer = setTimeout(()=>{ console.log('TIMEOUT'); console.log('stderr:', err.slice(-800)); child.kill('SIGKILL'); process.exit(1); }, 60000);
child.on('message', async (m) => {
  if (m.type === 'ready') {
    console.log('READY baseUrl=' + m.result.baseUrl);
    console.log('driverSeam=' + m.result.applicationDriverSeamReady + ' factoryPresent=' + m.result.applicationFactoryPresent);
    console.log('authExercised=' + m.result.authenticationMiddlewareExercised + ' userIdPresent=' + m.result.authenticatedEvaluationUserIdPresent);
    console.log('disposition=' + JSON.stringify(m.result.adapterDisposition));
    // probe the real mounted route with the real token
    const res = await fetch(m.result.baseUrl + '/api/ai/chat-stream', {
      method:'POST',
      headers:{'Content-Type':'application/json', Authorization:'Bearer '+m.result.token},
      body: JSON.stringify({ provider:'claude', messages:[{role:'user',content:SCEN.userPrompt}], metadata: SCEN.resolvedMetadata })
    });
    console.log('HTTP status=' + res.status + ' ct=' + res.headers.get('content-type'));
    const text = await res.text();
    console.log('bytes=' + text.length);
    console.log('events=' + JSON.stringify([...text.matchAll(/"type"\s*:\s*"([a-z_]+)"/g)].map(x=>x[1])));
    child.send({type:'cleanup', owned:{createdTripIds:[]}});
  } else if (m.type === 'cleaned') {
    console.log('CLEANED=' + JSON.stringify(m.report));
    child.send({type:'shutdown'});
  } else if (m.type === 'down') {
    clearTimeout(timer);
    console.log('DOWN=' + JSON.stringify(m.report));
    process.exit(0);
  } else if (m.type === 'error') {
    clearTimeout(timer);
    console.log('CHILD_ERROR=' + JSON.stringify(m));
    console.log('stderr:', err.slice(-1500));
    child.kill('SIGKILL'); process.exit(1);
  }
});
child.send({ type:'boot', config:{ scenarioId: SCEN.scenarioId, evaluationRunId:'eval-14-7e-smoke', structuredResponse: SCEN.structuredResponses[0]?.itinerary || SCEN.structuredResponses[0], proseText: SCEN.proseResponses[0].content }});
