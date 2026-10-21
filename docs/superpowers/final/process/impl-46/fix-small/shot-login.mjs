import fs from 'node:fs'; import path from 'node:path'; import { createRequire } from 'node:module'; import { fileURLToPath } from 'node:url';
const ROOT='E:/Land-XI 플랫폼/01. 디자인', HERE=path.dirname(fileURLToPath(import.meta.url)), tag=process.argv[2]||'before';
const HW='C:/Users/User/AppData/Local/ms-playwright'; if (fs.existsSync(HW)) process.env.PLAYWRIGHT_BROWSERS_PATH=HW;
const { chromium } = createRequire(path.join(ROOT,'package.json'))('playwright');
const b = await chromium.launch({ channel:'chrome', headless:true });
for (const [w,h] of [[360,640],[390,844],[1440,900],[1920,1080]]) {
  const p = await (await b.newContext({ viewport:{width:w,height:h}, locale:'ko-KR' })).newPage();
  await p.goto('https://app.land-xi.dev/landxi/v3/login/', { waitUntil:'domcontentloaded', timeout:60000 }); await p.waitForTimeout(3000);
  await p.locator('.fam > summary').scrollIntoViewIfNeeded(); await p.locator('.fam > summary').click(); await p.waitForTimeout(500);
  const r = await p.evaluate(()=>{ const u=document.querySelector('.fam ul').getBoundingClientRect(); const g=[...document.querySelectorAll('button')].filter(x=>x.offsetParent&&x.classList.contains('go')||/로그인|다음/.test(x.textContent)&&x.offsetParent).map(x=>x.getBoundingClientRect()); return {ul:[u.top,u.bottom,u.left,u.right], btns:g.map(x=>[x.top,x.bottom,x.left,x.right]), docH:document.documentElement.scrollHeight}; });
  const ov = r.btns.some(x=> r.ul[0]<x[1] && r.ul[1]>x[0] && r.ul[2]<x[3] && r.ul[3]>x[2]);
  console.log(w,h,JSON.stringify(r),'overlap=',ov);
  await p.screenshot({ path: path.join(HERE,`${tag}-${w}x${h}.png`) });
}
await b.close();
