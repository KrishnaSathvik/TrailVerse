import fs from 'node:fs';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'../../..');
export const fixture=JSON.parse(fs.readFileSync(path.join(root,'next-frontend/src/data/trailieDemoPlayback.json'),'utf8'));
const scenario=fixture.scenarios.find(s=>s.id==='glacier');
const final=scenario.turns.findLast(t=>t.plan);
export const trip={_id:'responsive-audit-trip',title:'Glacier relaxed trip',parkName:'Glacier National Park',parkCode:'glac',itineraryPlan:final.plan,canonicalPlan:final.plan,chatHistory:scenario.turns.flatMap((t,i)=>[{role:'user',content:t.question,timestamp:new Date(2026,5,1,i).toISOString()},{role:'assistant',content:t.prose,itineraryPlan:t.plan,canonicalPlan:t.plan,presentation:t.presentation,timestamp:new Date(2026,5,1,i,1).toISOString()}]),formData:{parkCode:'glac'},status:'active',createdAt:'2026-06-01T12:00:00Z',updatedAt:'2026-06-01T12:00:00Z'};
trip.plan=final.plan;trip.conversation=trip.chatHistory;
export const user={_id:'responsive-audit-user',name:'Sample traveler',createdAt:'2026-01-01T12:00:00Z',email:'sample@example.invalid',role:'user',isVerified:true,visitedParks:[],favoriteParks:[],savedParks:[],preferences:{}};

export async function installFixtures(context,{account=false,whereNext=false}={}) {
  if (account) {
    await context.addCookies([{name:'trailverse_auth_token',value:'responsive-audit-fixture',url:'http://127.0.0.1:3000'}]);
    await context.addInitScript(({user})=>{localStorage.setItem('token','responsive-audit-fixture');localStorage.setItem('user',JSON.stringify(user));},{user});
  }
  const blocked=[];
  await context.route('**/*',async route=>{
    const req=route.request(); const url=new URL(req.url()); const pathname=url.pathname;
    if (whereNext && pathname.includes('/api/where-next/')) return route.fulfill({json:{success:true,data:{pick:{parkCode:'glac',canonicalName:'Glacier National Park',travelWindow:'summer_2027'},stats:{volumeTier:'growing',destinationCount:38,weeklyRank:2,leaders:[{rank:1,parkCode:'yell',name:'Yellowstone National Park',displayName:'Yellowstone National Park',canonicalName:'Yellowstone National Park',count:20},{rank:2,parkCode:'glac',name:'Glacier National Park',displayName:'Glacier National Park',canonicalName:'Glacier National Park',count:18}]}}}});
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
  return blocked;
}

export async function completeDemo(page,index=0) {
  await page.waitForFunction(()=>Boolean(JSON.parse(localStorage.getItem('trailie_demo_scenario_cache') || '{}').v),{},{timeout:30000});
  await page.evaluate(({scenarios,index})=>{let cache=JSON.parse(localStorage.getItem('trailie_demo_scenario_cache'));localStorage.setItem('trailie_demo_scenario_cache',JSON.stringify({...cache,scenarios,lastActiveIndex:index}));},{scenarios:Object.fromEntries(fixture.scenarios.map(s=>[s.id,s.turns.map(t=>({...t,content:t.prose,canonicalPlan:t.plan}))])),index});
  await page.reload({waitUntil:'domcontentloaded'});
  await page.getByLabel('Trip created',{exact:true}).waitFor({timeout:30000});
}
