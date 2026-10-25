import path from 'node:path'; import fs from 'node:fs'; import { pathToFileURL } from 'node:url';
const ROOT = 'E:/Land-XI 플랫폼/01. 디자인'; process.chdir(ROOT);
process.env.LX_PW ||= fs.readFileSync(ROOT + '/server/.env', 'utf8').match(/^DEV_PASSWORD=(.*?)\s*$/m)?.[1];
const { launch, login } = await import(pathToFileURL(path.join(ROOT, 'tools/check/common.mjs')).href);
const role = process.argv[2] || 'app'; const url = process.argv[3];
const b = await launch(); const s = await login(b, role); const page = s.page;
const target = url ? s.home + url : page.url();
const reqs = new Map(); let t0 = Date.now();
page.on('request', (r) => reqs.set(r, { url: r.url().replace(/^https?:\/\/[^/]+/, '').slice(0, 100), start: Date.now() - t0 }));
page.on('requestfinished', (r) => { const x = reqs.get(r); if (x) x.end = Date.now() - t0; });
t0 = Date.now(); await page.goto(target, { waitUntil: 'domcontentloaded' });
const seen = [];
for (let i = 0; i < 40; i++) { await page.waitForTimeout(250); const r = await page.evaluate(() => [...document.querySelectorAll('*')].filter((e) => !e.childElementCount && /불러오는 중/.test(e.textContent) && e.offsetParent !== null).map((e) => { let p = e, c = []; for (let k = 0; k < 4 && p; k++, p = p.parentElement) c.push((p.id ? '#' + p.id : '') + '.' + String(p.className).split(' ')[0]); return c.join('<'); })); seen.push([Date.now() - t0, r.join(' | ')]); }
console.log(seen.filter((x) => x[1]).map((x) => x.join(' ')).join('\n') || 'no loading');
const l = [...reqs.values()].filter((x) => x.end != null).map((x) => `${x.start}-${x.end} ${x.url}`); console.log(l.join('\n'));
await s.ctx.close(); await b.close();
