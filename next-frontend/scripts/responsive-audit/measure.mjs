export function measurePage() {
  const box = element => {
    if (!element) return null;
    const r = element.getBoundingClientRect();
    const s = getComputedStyle(element);
    return { width: Math.round(r.width), left: Math.round(r.left), right: Math.round(r.right), height: Math.round(r.height), maxWidth:s.maxWidth, paddingLeft:s.paddingLeft, paddingRight:s.paddingRight };
  };
  const visible = element => { const r=element.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(element).visibility !== 'hidden'; };
  const heading = [...document.querySelectorAll('main h1,article h1,h1')].find(e=>visible(e)&&e.getBoundingClientRect().width>2);
  const main = document.querySelector('main') || document.querySelector('article') || document.body;
  const selectors = '[data-page-shell],.public-shell,.public-container,.info-width,.info-section,.info-stories';
  const shellAnchor = heading?.closest(selectors);
  let shell = (shellAnchor?.matches('.public-reading,.public-rich,.public-form') ? shellAnchor.closest('.public-shell') : shellAnchor) || (main.matches(selectors) ? main : null);
  shell ||= [...document.querySelectorAll(selectors)].find(e=>visible(e)&&!e.closest('header,footer'));
  if (!shell && heading) {
    let ancestor=heading.parentElement;
    while (ancestor && ancestor!==document.body) { const max=parseFloat(getComputedStyle(ancestor).maxWidth); if (Number.isFinite(max) && max>=450) shell=ancestor; ancestor=ancestor.parentElement; }
  }
  shell ||= [...main.querySelectorAll(selectors)].find(e=>!e.closest('header,footer'));
  shell ||= main;
  const region = box(shell);
  const header = document.querySelector('body header nav.public-shell, body header nav, body header .container');
  const footer = document.querySelector('footer > .public-shell,footer > div');
  const rich = [...document.querySelectorAll('[data-presentation-kind="rich_trip"],.trailie-table-breakout,[data-trip-workspace],.public-rich,.responsive-rich,[aria-label="Trip itinerary"]')].filter(visible).map(box);
  const tables = [...document.querySelectorAll('table')].filter(visible).map(table => {
    let scroll=table.parentElement;
    while (scroll && scroll!==document.body && !['auto','scroll'].includes(getComputedStyle(scroll).overflowX)) scroll=scroll.parentElement;
    return { ...box(table), font:getComputedStyle(table.querySelector('td') || table).fontSize, contained:table.scrollWidth<=innerWidth || Boolean(scroll && scroll!==document.body), localScroll:Boolean(scroll && scroll!==document.body), scrollWidth:scroll?.scrollWidth };
  });
  const grids=[...main.querySelectorAll('[class*="grid"]')].filter(e=>visible(e)&&getComputedStyle(e).display==='grid').slice(0,20).map(e=>({...box(e),columns:getComputedStyle(e).gridTemplateColumns.split(' ').length}));
  const controls=[...main.querySelectorAll('button,[role="button"],input:not([type="radio"]):not([type="checkbox"]),select,textarea')].filter(e=>visible(e)&&!e.closest('header,footer,nextjs-portal')).map(e=>({tag:e.tagName,text:(e.getAttribute('aria-label') || e.textContent || e.getAttribute('placeholder') || '').trim().slice(0,75),...box(e)}));
  const overflowing=[...main.querySelectorAll('*')].filter(e=>visible(e)&&e.getBoundingClientRect().right>innerWidth+2&&getComputedStyle(e).position!=='fixed'&&!e.closest('[class*="overflow-x-auto"], [role="region"], [class*="overflow-hidden"]')).slice(0,12).map(e=>({tag:e.tagName,class:e.className?.toString().slice(0,160),...box(e)}));
  const dialog=document.querySelector('nextjs-portal')?.shadowRoot?.querySelector('[data-nextjs-dialog]');
  return {viewport:innerWidth,documentWidth:document.documentElement.scrollWidth,pageOverflow:document.documentElement.scrollWidth>innerWidth+1,url:location.pathname,title:document.title,heading:heading?.textContent?.trim(),main:box(main),shell:region,unusedLeft:region?.left,unusedRight:region ? innerWidth-region.right:null,header:box(header),footer:box(footer),rich,tables,grids,selectors:[...document.querySelectorAll('.public-selector,[aria-label="Demo scenarios"] > div')].filter(visible).map(e=>({...box(e),scrollWidth:e.scrollWidth,clientWidth:e.clientWidth,overflow:getComputedStyle(e).overflowX,wrap:getComputedStyle(e).flexWrap})),controls,smallControls:controls.filter(e=>e.height<43&&e.width>0),overflowing,textLength:main.innerText.trim().length,frameworkOverlay:Boolean(dialog&&visible(dialog)),reading:[...main.querySelectorAll('.public-reading,.blog-prose > p:not(:has(img)),.prose > p')].filter(visible).slice(0,6).map(box)};
}
