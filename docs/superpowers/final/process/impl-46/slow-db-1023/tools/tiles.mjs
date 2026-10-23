// LX 계정으로 XI맵(전국 결과 조각)을 세 번 연다 — 조각 그리기 부하
import { pathToFileURL } from 'node:url';
const C = await import(pathToFileURL('E:/Land-XI 플랫폼/01. 디자인/tools/check/common.mjs').href);
const b = await C.launch(); const { ctx, page, home } = await C.login(b, 'app');
let n = 0; page.on('requestfinished', (r) => { if (/tiles\/national/.test(r.url())) n++; });
for (let i = 0; i < 3; i++) { await page.goto(home + '/landxi/v3/xi-clean/?z=' + (6 + i), { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(15000); }
console.log('national tiles', n); await ctx.close(); await b.close();
