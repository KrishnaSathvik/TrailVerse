import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const root = path.resolve(import.meta.dirname, '../../..');
const src = path.join(root, 'next-frontend/src');
const out = path.join(root, 'artifacts/trailverse-responsive-audit');
fs.mkdirSync(out, { recursive: true });
function files(dir) { return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? files(path.join(dir, e.name)) : [path.join(dir, e.name)]); }
const all = files(src);
const samples = {
  '/blog/[slug]': '/blog',
  '/blog/category/[category]': '/blog/category/park-guides',
  '/compare/[slug]': '/compare/zion-vs-bryce',
  '/discover/activity/[slug]': '/discover/activity/hiking',
  '/discover/type/[slug]': '/discover/type/national-park',
  '/discover/topic/[slug]': '/discover/topic/animals',
  '/guides/[slug]': '/guides/best-free-national-park-trip-planner',
  '/parks/[parkCode]': '/parks/yellowstone-national-park',
  '/parks/[parkCode]/activity/[id]': '/parks/yellowstone-national-park/activity/audit-unavailable',
  '/parks/state/[stateCode]': '/parks/state/utah',
  '/plan-ai/[tripId]': '/plan-ai/responsive-audit-trip?chat=true',
  '/plan-ai/[tripId]/plan': '/plan-ai/responsive-audit-trip/plan',
  '/plan-ai/[tripId]/itinerary': '/plan-ai/responsive-audit-trip/itinerary',
  '/plan-ai/[tripId]/map': '/plan-ai/responsive-audit-trip/map',
  '/plan-ai/guest/[anonymousId]': '/plan-ai/guest/responsive-audit-session',
  '/plan-ai/shared/[shareId]': '/plan-ai/shared/6ab0412f-5e5',
  '/reset-password/[token]': '/reset-password/responsive-audit-token',
  '/verify-email/[token]': '/verify-email/responsive-audit-token',
};
function group(route) {
  if (route.startsWith('/admin')) return 'Admin (guarded; source audit)';
  if (/review|simple-canary/.test(route)) return 'Internal review (development only)';
  if (route === '/' || route === '/explore' || route === '/map') return 'Primary navigation';
  if (route.startsWith('/plan-ai')) return route.includes('[') ? 'Trip/workspace' : 'Trailie / AI';
  if (route === '/trailie-demo') return 'Trailie / AI';
  if (route.startsWith('/parks') || route.startsWith('/discover') || /-parks$/.test(route)) return 'Explore / browse';
  if (route.startsWith('/blog') || route.startsWith('/guides') || route === '/magazine') return 'Editorial/content';
  if (route === '/events') return 'Events';
  if (route.startsWith('/compare') || route === '/where-next' || route === '/itineraries') return 'Comparison/activity tools';
  if (/^\/(home|profile|chat-history|login|signup|forgot-password|reset-password|verify-email|unsubscribe)/.test(route)) return 'Account/auth';
  if (/^\/(about|features|faq|privacy|terms|newsletter|testimonials|chatgpt|mcp)/.test(route)) return 'Footer/legal/company/resources';
  return 'Other public routes';
}
function dependencies(file, visited = new Set()) {
  if (visited.has(file) || visited.size > 120) return visited;
  visited.add(file);
  for (const match of fs.readFileSync(file, 'utf8').matchAll(/(?:from\s+|import\s*\()(['"])([^'"]+)\1/g)) {
    const spec = match[2];
    let base = spec.startsWith('@/') ? path.join(src, spec.slice(2)) : spec.startsWith('@components/') ? path.join(src, 'components', spec.slice(12)) : spec.startsWith('.') ? path.resolve(path.dirname(file), spec) : null;
    if (!base) continue;
    const target = [base, `${base}.jsx`, `${base}.js`, path.join(base, 'index.jsx')].find(p => fs.existsSync(p) && fs.statSync(p).isFile());
    if (target && /\.[jt]sx?$/.test(target) && !target.includes('/data/') && !target.includes('/services/') && !target.includes('/hooks/')) dependencies(target, visited);
  }
  return visited;
}
const inventory = all.filter(f => /\/page\.(jsx|js|tsx)$/.test(f)).sort().map(file => {
  const route = '/' + path.relative(path.join(src, 'app'), path.dirname(file)).split(path.sep).filter(Boolean).join('/');
  const related = [...dependencies(file)];
  const widths = [...new Set(related.flatMap(f => [...fs.readFileSync(f, 'utf8').matchAll(/max-w-(?:\[[^\]]+\]|[\w-]+)/g)].map(m => m[0])))];
  const category = group(route);
  const layout = /login|signup|forgot-password|reset-password|verify-email|unsubscribe/.test(route) ? 'form' : /privacy|terms/.test(route) || /\/(blog|guides)\/\[slug\]/.test(route) ? 'reading-with-breakouts' : route === '/map' || route.endsWith('/map') ? 'map' : 'full-with-reading-regions';
  return { route, sample: samples[route] || route, source: path.relative(root, file), category, layout, runtime: !category.startsWith('Admin'), relatedSources: related.map(f => path.relative(root, f)), widths, sourceClassification: widths.includes('max-w-[92rem]') || widths.includes('max-w-[100rem]') ? 'NEEDS_HEADER_FOOTER_ALIGNMENT' : route.startsWith('/plan-ai') ? 'NEEDS_RICH_BREAKOUT' : 'GOOD_DESKTOP' };
});
for (const route of ['/reports/national-parks-2025.html', '/reports/when-to-go.html','/magazine.html']) inventory.push({route, sample:route, source:`next-frontend/public${route}`, category:'Footer/legal/company/resources', layout:'data', runtime:true, relatedSources:[], widths:[], sourceClassification:'NEEDS_HEADER_FOOTER_ALIGNMENT'});
fs.writeFileSync(path.join(out, 'route-inventory.json'), JSON.stringify(inventory, null, 2));
const hashes = Object.fromEntries([...all, ...files(path.join(root,'next-frontend/public/reports'))].map(f => [path.relative(root,f),crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex')]));
fs.writeFileSync(path.join(out,'source-baseline-hashes.json'),JSON.stringify(hashes,null,2));
const sections = ['Executive summary','Root layout problems','Shared shell inconsistencies','Header','Footer','Home','Explore','Trailie','Trailie Demo','Blog','Events','Compare','Explore by Activity','Where Next','Traveler Stories','Park pages','Auth/account','Footer/legal/resources pages','Mobile findings','Desktop findings','Shared component findings','Priority list'];
const report = `# TrailVerse responsive audit\n\nPhase 1 baseline audit started on local master before this site-wide implementation. The earlier Home/Demo pass is part of the baseline.\n\n${sections.map(title=>`## ${title}\n\n${title==='Executive summary' ? `${inventory.length} route templates/static reports inventoried from source. Admin templates are listed but their protected implementation is outside the requested public/account scope. Email is a mailto action, and Install App opens a modal; neither has a page route.\n\nThe initial source audit identifies parallel 92rem, 100rem, 1280px and 1088px shell systems. A missing overflow is not a desktop pass. Browser measurements and screenshots will be appended before implementation.` : 'Baseline source and browser evidence pending.'}`).join('\n\n')}\n\n## Exact route inventory\n\n| Route | Group | Intended layout | Initial source classification | Browser grade |\n| --- | --- | --- | --- | --- |\n${inventory.map(r=>`| \`${r.route}\` | ${r.category} | ${r.layout} | ${r.sourceClassification} | PENDING |`).join('\n')}\n`;
fs.writeFileSync(path.join(out,'REPORT.md'),report);
console.log(`Inventoried ${inventory.length} routes/reports; baseline hashes and Phase 1 report written.`);
