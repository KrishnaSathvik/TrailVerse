// Unit checks with a minimal DOM double; not browser or ChatGPT acceptance.
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const script = fs.readFileSync(path.join(__dirname, '../widgets/park-browser-poc.html'), 'utf8').match(/<script>([\s\S]*?)<\/script>/)[1];
function setup() {
  class Element {
    constructor(tag) { this.tag = tag; this.children = []; this.events = {}; this.textContent = ''; }
    appendChild(child) { this.children.push(child); }
    replaceChildren() { this.children = []; }
    setAttribute(key, value) { this[key] = value; }
    addEventListener(name, fn) { this.events[name] = fn; }
  }
  const root = new Element('main'), sent = [], timers = new Map();
  let receive, timerId = 0;
  const parent = {postMessage: message => sent.push(message)};
  vm.runInNewContext(script, {
    window: {parent, addEventListener: (_, fn) => { receive = fn; }},
    document: {getElementById: () => root, createElement: tag => new Element(tag), documentElement: {scrollHeight: 600}},
    setTimeout: fn => { timers.set(++timerId, fn); return timerId; }, clearTimeout: id => timers.delete(id),
  });
  const send = (message, source = parent) => receive({source, data: {jsonrpc: '2.0', ...message}});
  const all = (element = root) => [element, ...element.children.flatMap(child => all(child))];
  return {sent, send, timers, all, text: () => all().map(e => e.textContent).join('\n'),
    buttons: () => all().filter(e => e.tag === 'button')};
}
const flush = async () => { await Promise.resolve(); await Promise.resolve(); };
const parks = {kind: 'park_list', parks: [
  {name: '<img onerror=bad()> Zion', parkCode: 'zion', states: 'UT', summary: 'Canyons'},
  {name: 'No identifier'},
]};
async function ready(s) { s.send({id: s.sent[0].id, result: {}}); await flush(); }
function output(s, data) { s.send({method: 'ui/notifications/tool-result', params: {structuredContent: data}}); }
test('list → exact-code call → detail → original list; text stays literal', async () => {
  const s = setup(); await ready(s); output(s, parks);
  assert.match(s.text(), /<img onerror=bad\(\)> Zion/);
  assert.equal(s.buttons()[1].disabled, true);
  assert.equal(s.all().some(e => e.tag === 'img'), false);
  s.buttons()[0].events.click();
  const call = s.sent.find(m => m.method === 'tools/call');
  assert.equal(JSON.stringify(call.params), JSON.stringify({name: 'get_park_details', arguments: {park_code: 'zion'}}));
  assert.equal(s.buttons()[0].disabled, true);
  s.send({id: call.id, result: {structuredContent: {kind: 'park_details', name: 'Zion', states: 'UT', description: 'Canyons', activities: ['Hiking'], alerts: [{title: 'Closure', description: 'Recorded alert'}], entranceFees: [{title: 'Vehicle', cost: '35.00'}]}}});
  await flush();
  assert.match(s.text(), /Recorded alert/); assert.match(s.text(), /\$35.00/);
  s.buttons()[0].events.click(); assert.match(s.text(), /No identifier/);
});
test('error and timeout leave list available for retry; wrong-source messages ignored', async () => {
  const s = setup(); await ready(s); output(s, parks);
  s.send({method: 'ui/notifications/tool-result', params: {structuredContent: {kind: 'park_list', parks: []}}}, {});
  assert.match(s.text(), /Zion/);
  s.buttons()[0].events.click();
  const call = s.sent.find(m => m.method === 'tools/call');
  s.send({id: call.id, result: {isError: true}}); await flush();
  assert.match(s.text(), /could not be loaded/); assert.equal(s.buttons()[0].disabled, false);
  s.buttons()[0].events.click(); [...s.timers.values()].forEach(fn => fn()); await flush();
  assert.match(s.text(), /did not respond/); assert.equal(s.buttons()[0].disabled, false);
});
test('new host output wins over stale response; empty and direct detail render', async () => {
  const s = setup(); await ready(s); output(s, parks); s.buttons()[0].events.click();
  const call = s.sent.find(m => m.method === 'tools/call');
  output(s, {kind: 'park_list', parks: []});
  s.send({id: call.id, result: {structuredContent: {kind: 'park_details', name: 'Stale'}}}); await flush();
  assert.match(s.text(), /No parks matched/); assert.doesNotMatch(s.text(), /Stale/);
  const direct = setup(); await ready(direct); output(direct, {kind: 'park_details', name: 'Zion'});
  assert.match(direct.text(), /Zion/); assert.equal(direct.buttons().length, 0);
});
