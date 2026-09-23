import { chromium } from '@playwright/test';
const b = await chromium.launch({ channel: 'chrome' });
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
await p.addInitScript(() => { localStorage.setItem('lx_logged_in', '1'); localStorage.setItem('lx_role', 'staff'); });
await p.goto('http://localhost:4173/landxi/proto/ximap.html?on=namwon-farmland-2025&mode=overlay');
await p.waitForFunction(() => window.__lxMap?.B?.getStyle() != null, null, { timeout: 30000 });
await p.locator('#ch-base').click(); await p.waitForTimeout(3000); await p.mouse.move(5,5); await p.waitForTimeout(300);
console.log(await p.evaluate(() => [...document.querySelectorAll('body *')].filter((e)=>{const r=e.getBoundingClientRect();return r.left<=150&&r.right>=150&&r.top<=500&&r.bottom>=500;}).map((e) => e.tagName + '.' + e.className + ' bg=' + getComputedStyle(e).backgroundImage.slice(0,80) + ' ' + getComputedStyle(e,'::before').content + getComputedStyle(e,'::after').content)));await p.evaluate(()=>{const i=document.querySelector('.mv[data-ep=namwon_2506] img'); console.log(i.naturalWidth);  }); await p.screenshot({path:'shots/w0/E0-5/v8-probe.png', clip:{x:72,y:380,width:310,height:160}});
await b.close();
