// 지도 화면 '불러오는 중' 동안 무엇이 덜 받아졌는지 — node diag_map.mjs <login> <base> <path> [mapExpr]
import fs from 'node:fs'; import path from 'node:path'; import { createRequire } from 'node:module'; import { pathToFileURL } from 'node:url';
const ROOT = 'E:/Land-XI 플랫폼/01. 디자인';
process.env.PLAYWRIGHT_BROWSERS_PATH = 'C:/Users/User/AppData/Local/ms-playwright';
const m = fs.readFileSync(path.join(ROOT, 'server/.env'), 'utf8').match(/^DEV_PASSWORD=(.*?)\s*$/m); process.env.LX_PW = m[1]; process.env.DEV_PASSWORD = m[1];
const { chromium } = createRequire(path.join(ROOT, 'package.json'))('playwright');
const { frontDoor } = await import(pathToFileURL(path.join(ROOT, 'landxi/v3/kit/lint/forbidden.mjs')).href);
const [login, base, url, expr = 'window.__xc?.map'] = process.argv.slice(2);
const b = await chromium.launch({ channel: 'chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const c = await b.newContext({ viewport: { width: 1440, height: 900 } });
const p = await c.newPage();
const reqs = new Map();
p.on('request', (r) => reqs.set(r, Date.now()));
const fin = [];
p.on('requestfinished', (r) => { const t = reqs.get(r); if (t) fin.push({ u: r.url().slice(0, 120), ms: Date.now() - t, at: t }); });
await frontDoor(p, 'https://app.land-xi.dev', login);
await p.waitForTimeout(1500);
for (const pass of ['first', 'again']) {
  fin.length = 0;
  await p.goto('about:blank');
  const t0 = Date.now();
  await p.goto(base + url, { waitUntil: 'domcontentloaded' });
  const log = [];
  while (Date.now() - t0 < 15000) {
    const s = await p.evaluate((e) => {
      const ld = document.querySelector('.k-ld'); const on = !!(ld && !ld.hidden && ld.getClientRects().length);
      let map = null; try { map = (0, eval)(e); } catch { /* */ }
      let pend = [];
      try { if (map) pend = Object.keys(map.getStyle()?.sources || {}).filter((id) => !map.isSourceLoaded(id)); } catch { /* */ }
      return { on, what: ld?.dataset.what || '', moving: map ? map.isMoving() : null, pend };
    }, expr).catch(() => ({ nav: 1 }));
    log.push(`${String(Date.now() - t0).padStart(5)} ld=${s.on ? 1 : 0} mv=${s.moving ? 1 : 0} pend=${(s.pend || []).join(',')}`);
    await p.waitForTimeout(300);
  }
  console.log('==', pass); console.log(log.filter((l, i, a) => i === 0 || l.slice(6) !== a[i - 1].slice(6)).join('\n'));
  const slow = fin.filter((f) => f.ms > 700).sort((a, b) => b.ms - a.ms).slice(0, 12);
  console.log('slow reqs:'); for (const f of slow) console.log(`  ${f.ms}ms @${f.at - t0} ${f.u}`);
}
await b.close();
