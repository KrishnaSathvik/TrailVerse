import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';
import { measurePage } from './measure.mjs';

const root=path.resolve(import.meta.dirname,'../../..');
const out=path.join(root,'artifacts/trailverse-responsive-audit');
const phase=process.argv[2] || 'before';
const filter=process.argv[3];
const inventory=JSON.parse(fs.readFileSync(path.join(out,'route-inventory.json'),'utf8'));
const widths=[375,390,430,768,1024,1280,1440,1920];
const fixture=JSON.parse(fs.readFileSync(path.join(root,'next-frontend/src/data/trailieDemoPlayback.json'),'utf8'));
const scenario=fixture.scenarios.find(s=>s.id==='glacier');
const final=scenario.turns.findLast(t=>t.plan);
const trip={_id:'responsive-audit-trip',title:'Glacier relaxed trip',parkName:'Glacier National Park',parkCode:'glac',itineraryPlan:final.plan,canonicalPlan:final.plan,chatHistory:scenario.turns.flatMap((t,i)=>[{role:'user',content:t.question,timestamp:new Date(2026,5,1,i).toISOString()},{role:'assistant',content:t.prose,itineraryPlan:t.plan,canonicalPlan:t.plan,presentation:t.presentation,timestamp:new Date(2026,5,1,i,1).toISOString()}]),formData:{parkCode:'glac'},status:'active',createdAt:'2026-06-01T12:00:00Z',updatedAt:'2026-06-01T12:00:00Z'};
trip.plan=final.plan;trip.conversation=trip.chatHistory;
const user={_id:'responsive-audit-user',name:'Sample traveler',createdAt:'2026-01-01T12:00:00Z',email:'sample@example.invalid',role:'user',isVerified:true,visitedParks:[],favoriteParks:[],savedParks:[],preferences:{}};
process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY='1';
const browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const resultPath=path.join(out,`${phase}-measurements.json`);
let results=fs.existsSync(resultPath) ? JSON.parse(fs.readFileSync(resultPath,'utf8')) : [];
if (process.argv[4]==='force') results=results.filter(r=>filter && !r.route.includes(filter));
let blogSample=null;
const targets=inventory.filter(r=>r.runtime && (!filter || r.route.includes(filter)));
for (const entry of targets) {
  if (results.some(r=>r.route===entry.route && r.measurements?.length===8)) continue;
  const account=/^\/(home|profile|chat-history)$/.test(entry.route)||/^\/plan-ai\/\[tripId\]/.test(entry.route);
  const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
  if (account) {
    await context.addCookies([{name:'trailverse_auth_token',value:'responsive-audit-fixture',url:'http://127.0.0.1:3000'}]);
    await context.addInitScript(({user})=>{localStorage.setItem('token','responsive-audit-fixture');localStorage.setItem('user',JSON.stringify(user));},{user});
  }
  const blocked=[];
  await context.route('**/*',async route=>{
    const req=route.request(); const url=new URL(req.url()); const pathname=url.pathname;
    if (/maps\.googleapis\.com|maps\.gstatic\.com|maps\.google\.com|google-analytics\.com|googletagmanager\.com/.test(url.hostname)) { blocked.push('external-map/analytics');return route.abort(); }
    if (account && ['/api/users/visited-parks','/api/users/saved-parks'].includes(pathname)) return route.fulfill({json:{success:true,data:[]}});
    if (account && pathname.startsWith('/api/favorites')) return route.fulfill({json:{success:true,data:[],count:0}});
    if (account && /\/api\/(reviews|testimonials|blogs|events)\/(user|favorites|saved)/.test(pathname)) return route.fulfill({json:{success:true,data:[],count:0}});
    if (pathname.includes('/api/ai/providers')) return route.fulfill({json:{providers:[{id:'claude',name:'Local fixture'}]}});
    if (pathname.includes('/api/comments') || pathname.endsWith('/comments')) return route.fulfill({json:{success:true,data:[],count:0}});
    if (account && pathname.includes('/api/email/preferences')) return route.fulfill({json:{success:true,data:{blogNotifications:true,newsletter:true}}});
    if (pathname.includes('/api/ai/') || pathname.includes('/parks/compare/summary')) {
      blocked.push(pathname);
      if (pathname.includes('session-status')) return route.fulfill({json:{success:true,canSendMore:false,messageCount:5,messages:trip.chatHistory,isConverted:false,data:{canSendMore:false,messageCount:5,messages:trip.chatHistory,isConverted:false}}});
      if (pathname.includes('conversations')) return route.fulfill({json:{success:true,data:[]}});
      return route.fulfill({status:403,json:{success:false,message:'Generation disabled during responsive audit'}});
    }
    if (pathname.includes('/api/') && !['GET','HEAD','OPTIONS'].includes(req.method())) {blocked.push(`${req.method()} ${pathname}`);return route.fulfill({json:{success:true,data:{},message:'Local audit: write suppressed'}});}
    if (account && /\/api\/(trips|users|auth)/.test(pathname)) {
      const data=pathname.includes('/trips/user/') || pathname.endsWith('/trips') ? [trip] : pathname.includes('/trips/') ? trip : user;
      return route.fulfill({json:{success:true,data,user}});
    }
    return route.continue();
  });
  const page=await context.newPage();
  page.setDefaultTimeout(20000);
  const errors=[];page.on('pageerror',error=>errors.push(error.message));page.on('console',message=>{if(message.type()==='error'&&!/Failed to load resource|ERR_FAILED/.test(message.text()))errors.push(message.text().slice(0,350));});
  let sample=entry.sample;
  try {
    if (entry.route==='/blog/[slug]') {
      sample='/blog/responsive-audit-park-guide';
    }
    let response=await page.goto(`http://127.0.0.1:3000${sample}`,{waitUntil:'domcontentloaded',timeout:45000});
    await page.waitForTimeout(1100);
    if (entry.route==='/trailie-demo') {
      await page.waitForFunction(()=>Boolean(JSON.parse(localStorage.getItem('trailie_demo_scenario_cache') || '{}').v),{},{timeout:30000});
      // The bundled JSON module's serialization order differs from raw JSON.
      // Reuse the renderer's cache version, then preload completed frozen turns.
      await page.evaluate(scenarios=>{const cached=JSON.parse(localStorage.getItem('trailie_demo_scenario_cache'));localStorage.setItem('trailie_demo_scenario_cache',JSON.stringify({...cached,scenarios,lastActiveIndex:0}));},Object.fromEntries(fixture.scenarios.map(s=>[s.id,s.turns.map(t=>({...t,content:t.prose,canonicalPlan:t.plan}))])));
      response=await page.reload({waitUntil:'domcontentloaded'});await page.getByLabel('Trip created',{exact:true}).waitFor({timeout:30000});
    }

    if (account && entry.route==='/plan-ai/[tripId]') await page.getByLabel('Assistant message',{exact:true}).first().waitFor({timeout:30000});
    if (entry.route==='/parks/[parkCode]/activity/[id]') {
      // The activity template's unavailable-state is retained if no stable id is available.
    }
    const measurements=[];
    for (const width of widths) {
      await page.setViewportSize({width,height:1000});await page.waitForTimeout(80);
      measurements.push(await page.evaluate(measurePage));
      const complex=/map|plan-ai|compare|parks|explore|discover|events|blog/.test(entry.route);
      if ([390,1440,1920].includes(width) || complex && [768,1024].includes(width)) {
        const slug=entry.route.replaceAll('/','__').replaceAll('[','').replaceAll(']','') || 'home';
        await page.screenshot({path:path.join(out,'screenshots',`${phase}-${slug}-${width}.png`),animations:'disabled'});
      }
    }
    results.push({route:entry.route,sample,category:entry.category,layout:entry.layout,status:response?.status(),renderedUrl:page.url(),state:account?'mock account/trip':entry.route.includes('[token]')?'invalid-token state':'public read-only',errors,blocked,measurements});
    console.log(`${phase} ${entry.route}: ${measurements.some(m=>m.pageOverflow)?'OVERFLOW':'contained'}; ${errors.length} runtime errors`);
  } catch(error) {results.push({route:entry.route,sample,error:error.message,errors,blocked,measurements:[]});console.log(`${phase} ${entry.route}: ${error.message.split('\n')[0]}`);}
  fs.writeFileSync(resultPath,JSON.stringify(results,null,2));await context.close();
}
await browser.close();
