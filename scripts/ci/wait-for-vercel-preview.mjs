import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export async function findPreview(api, repository, sha) {
  const deployments = await api(`/repos/${repository}/deployments?sha=${sha}&per_page=100`);
  for (const deployment of deployments) {
    if (deployment.sha !== sha || deployment.creator?.login !== 'vercel[bot]' ||
        deployment.environment?.toLowerCase() !== 'preview' || deployment.production_environment) continue;
    const [status] = await api(`/repos/${repository}/deployments/${deployment.id}/statuses?per_page=1`);
    if (status?.state !== 'success') continue;
    try {
      const url = new URL(status.environment_url);
      if (url.protocol === 'https:' && url.hostname.endsWith('.vercel.app') &&
          !url.username && !url.password && !url.port && url.pathname === '/' && !url.search && !url.hash) {
        return url.origin;
      }
    } catch { /* A missing or invalid URL is not a usable preview. */ }
  }
  return null;
}

async function main() {
  const { GITHUB_REPOSITORY: repository, PREVIEW_SHA: sha, GH_TOKEN: token, GITHUB_OUTPUT: output } = process.env;
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository || '') || !/^[a-f0-9]{40}$/.test(sha || '') || !token || !output) {
    throw new Error('Missing or invalid preview lookup configuration');
  }
  const deadline = Date.now() + 600_000;
  const api = async path => {
    const response = await fetch(`https://api.github.com${path}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error(`GitHub deployment lookup failed: HTTP ${response.status}`);
    return response.json();
  };
  while (Date.now() < deadline) {
    const url = await findPreview(api, repository, sha);
    if (url) {
      appendFileSync(output, `url=${url}\n`);
      console.log(`Found successful exact-commit preview: ${url}`);
      return;
    }
    console.log('Waiting for the PR head Vercel preview…');
    await new Promise(resolve => setTimeout(resolve, 15_000));
  }
  throw new Error('No successful Vercel preview for this PR head within 600 seconds');
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
