#!/usr/bin/env node
/**
 * Logged-in chat smoke test — shows API flags + full assistant reply (what users see).
 * Credentials via env only (never commit):
 *   PLAN_AI_TEST_EMAIL=... PLAN_AI_TEST_PASSWORD=... node scripts/test-web-search-auth-chat.js
 */
'use strict';

const API_BASE = process.env.API_BASE || 'http://127.0.0.1:5001/api';
const EMAIL = process.env.PLAN_AI_TEST_EMAIL;
const PASSWORD = process.env.PLAN_AI_TEST_PASSWORD;
const MESSAGE =
  process.env.TEST_MESSAGE ||
  'is Angels Landing open right now in Zion National Park?';

async function main() {
  if (!EMAIL || !PASSWORD) {
    console.error('Set PLAN_AI_TEST_EMAIL and PLAN_AI_TEST_PASSWORD');
    process.exit(1);
  }

  const loginRes = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const loginBody = await loginRes.json();
  if (!loginRes.ok || !loginBody.token) {
    console.error('Login failed:', loginRes.status, loginBody);
    process.exit(1);
  }
  console.log('Login: OK\n');

  const chatRes = await fetch(`${API_BASE}/ai/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${loginBody.token}`,
    },
    body: JSON.stringify({
      provider: 'claude',
      messages: [{ role: 'user', content: MESSAGE }],
      metadata: { parkCode: 'zion', parkName: 'Zion National Park' },
    }),
  });
  const body = await chatRes.json();
  if (!chatRes.ok) {
    console.error('Chat failed:', chatRes.status, body);
    process.exit(1);
  }

  const data = body.data || body;

  console.log('--- User message ---');
  console.log(MESSAGE);
  console.log('\n--- API metadata (not shown raw in UI) ---');
  console.log({
    hasLiveData: data.hasLiveData,
    hasWebSearch: data.hasWebSearch,
    parkName: data.parkName,
    parkNames: data.parkNames,
    provider: data.provider,
    model: data.model,
  });
  console.log('\n--- Assistant reply (what users see in chat) ---\n');
  console.log(data.content || '(empty)');
  console.log('\n--- End ---');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
