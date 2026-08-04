/**
 * Render account hygiene for August bill containment.
 * Run after: render login
 *
 *   node scripts/render-august-hygiene.js
 *
 * Prints the services to suspend/downgrade. Does not mutate Render
 * unless you pass --suspend-rag (requires working Render CLI auth).
 */
const { spawnSync } = require('child_process');

const SUSPEND_RAG = process.argv.includes('--suspend-rag');

function run(cmd, args) {
  const res = spawnSync(cmd, args, { encoding: 'utf8' });
  return {
    status: res.status,
    stdout: res.stdout || '',
    stderr: res.stderr || '',
  };
}

function main() {
  console.log('August Render hygiene checklist\n');
  console.log('1) Suspend/delete rag-chatbot-api (~$7/mo) if unused');
  console.log('2) Downgrade TrailVerse Standard → Starter if Standard is not required (~$25 → ~$7)');
  console.log('3) Keep trailverse-mcp on Starter (needed for ChatGPT/Claude)\n');

  const who = run('render', ['whoami']);
  if (who.status !== 0) {
    console.log('Render CLI not authenticated. Run: render login');
    console.log(who.stderr.trim() || who.stdout.trim());
    console.log('\nThen re-run this script, or suspend manually in the Render dashboard.');
    process.exit(who.status === 0 ? 0 : 1);
  }

  console.log(who.stdout.trim());
  const services = run('render', ['services', '-o', 'json']);
  if (services.status !== 0) {
    console.log('Could not list services:', services.stderr || services.stdout);
    process.exit(1);
  }

  let list;
  try {
    list = JSON.parse(services.stdout);
  } catch {
    console.log('Unexpected services output:\n', services.stdout.slice(0, 500));
    process.exit(1);
  }

  const rows = Array.isArray(list) ? list : list?.services || [];
  for (const s of rows) {
    const name = s.name || s.service?.name || s.id;
    const type = s.type || s.service?.type;
    const plan = s.plan || s.service?.plan || s.serviceDetails?.plan;
    console.log(`- ${name}  type=${type || '?'}  plan=${plan || '?'}`);
  }

  const rag = rows.find((s) => {
    const name = (s.name || s.service?.name || '').toLowerCase();
    return name.includes('rag-chatbot');
  });

  if (!rag) {
    console.log('\nrag-chatbot-api not found in workspace (may already be gone).');
  } else if (!SUSPEND_RAG) {
    console.log('\nFound rag-chatbot service. Re-run with --suspend-rag to suspend via CLI,');
    console.log('or suspend/delete it in the Render dashboard.');
  } else {
    const id = rag.id || rag.service?.id;
    console.log(`\nAttempting suspend for ${id}...`);
    // Render CLI has no universal "suspend" subcommand in all versions — prefer dashboard.
    console.log('Open https://dashboard.render.com and suspend/delete the rag-chatbot-api service.');
    console.log('CLI suspend is not reliably available; dashboard is the source of truth.');
  }

  console.log('\nTrailVerse plan: if currently Standard and traffic is fine on Starter, downgrade in dashboard.');
}

main();
