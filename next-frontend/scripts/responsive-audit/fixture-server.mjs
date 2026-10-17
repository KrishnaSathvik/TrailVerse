import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

// Read-only audit adapter. Never imports server runtime or contacts AI providers.
const root=path.resolve(import.meta.dirname,'../../..');
const data=JSON.parse(fs.readFileSync(path.join(root,'next-frontend/src/data/trailieDemoPlayback.json'),'utf8'));
const turn=data.scenarios.find(s=>s.id==='glacier').turns.findLast(t=>t.plan);
const blog={_id:'responsive-audit-blog',slug:'responsive-audit-park-guide',title:'A relaxed national park trip: planning your days',excerpt:'A local editorial fixture for checking reading width, imagery, comparisons and related stories.',author:'Sample travel editor',category:'park-guides',status:'published',featured:true,featuredImage:'/background23.png',readTime:7,views:420,publishedAt:'2026-06-01T12:00:00Z',createdAt:'2026-06-01T12:00:00Z',tags:['planning'],content:'<h2>Make room for the park</h2><p>Start with the places that matter most to you. A good trip leaves time for short walks, viewpoints and a slower afternoon. This fixture represents ordinary editorial prose and preserves the production article renderer.</p><p>Choose a base near the days you care about most. Keep driving and walking time visible while comparing options.</p><figure><img src="/background23.png" alt="Forest scenery" /></figure><h2>Compare your options</h2><table><thead><tr><th>What matters</th><th>Scenic and relaxed</th><th>Long hiking days</th></tr></thead><tbody><tr><td>Daily pace</td><td>Short walks, overlooks and a relaxed afternoon</td><td>A longer trail with time for breaks and changing weather</td></tr><tr><td>Trip planning</td><td>Keep a flexible day and a nearby base</td><td>Allow more trail time and a recovery afternoon</td></tr></tbody></table><h2>Before you go</h2><p>Check current conditions and the official park information when your dates are settled.</p>'};
const categories=['park-guides','trip-planning','seasonal','astrophotography'].map(slug=>({_id:slug,slug,name:slug.replaceAll('-',' '),count:3}));
const samples=Array.from({length:6},(_,i)=>({...blog,_id:`responsive-audit-blog-${i}`,title:i?`Planning story ${i+1}: exploring at your own pace`:blog.title,slug:blog.slug,featured:i<2}));
const shared={_id:'responsive-audit-trip',parkName:'Glacier National Park',parkCode:'glac',itineraryPlan:turn.plan,canonicalPlan:turn.plan,conversation:[{role:'user',content:turn.question},{role:'assistant',content:turn.prose,itineraryPlan:turn.plan,presentation:turn.presentation}],sharedBy:{name:'Sample traveler'},createdAt:'2026-06-01T12:00:00Z'};
shared.plan=turn.plan;
http.createServer(async(req,res)=>{
  const url=new URL(req.url,'http://127.0.0.1:5002');
  const reply=(body,status=200)=>{res.writeHead(status,{'Content-Type':'application/json','Access-Control-Allow-Origin':'*'});res.end(JSON.stringify(body));};
  if (!['GET','HEAD','OPTIONS'].includes(req.method)) return reply({success:false,message:'Audit fixture is read-only'},403);
  if (url.pathname.startsWith('/api/activities/')) return reply({success:true,data:{id:'responsive-audit-activity',title:'A scenic afternoon walk',parkCode:'yell',shortDescription:'A local populated activity sample for responsive layout checks.',description:'<p>Enjoy a short walk with viewpoints and time to rest along the way.</p>',images:[{url:'/background23.png',altText:'Forest scenery'}],duration:'1–2 hours',season:['Summer','Fall'],tags:['Walking','Scenery'],locationDescription:'Near the park visitor area',isReservationRequired:false}});
  if (url.pathname==='/api/blogs/categories') return reply({success:true,data:categories});
  if (url.pathname==='/api/blogs/slug-redirects') return reply({success:true,data:[]});
  if (url.pathname==='/api/blogs') return reply({success:true,count:samples.length,total:samples.length,page:1,pages:1,data:samples});
  if (url.pathname.startsWith('/api/blogs/')) return reply({success:true,data:blog});
  if (url.pathname.startsWith('/api/trips/shared/')) return reply({success:true,data:shared});
  if (url.pathname.startsWith('/api/ai/')) return reply({success:false,message:'AI disabled during audit'},403);
  try {
    const response=await fetch(`http://127.0.0.1:5001${url.pathname}${url.search}`,{signal:AbortSignal.timeout(6000)});
    res.writeHead(response.status,{'Content-Type':response.headers.get('content-type')||'application/json','Access-Control-Allow-Origin':'*'});res.end(Buffer.from(await response.arrayBuffer()));
  } catch {reply({success:true,data:[],count:0,meta:{},pages:1,total:0});}
}).listen(5002,'127.0.0.1',()=>console.log('Read-only responsive audit fixture adapter: http://127.0.0.1:5002'));
