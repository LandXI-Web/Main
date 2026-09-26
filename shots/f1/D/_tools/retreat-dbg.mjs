// 남원→글로브 후퇴 디버그 — 소스별 렌더 가능 타일 수 · 대기 타일 수를 100 ms 간격
import { chromium } from '@playwright/test';
const b = await chromium.launch({ channel: 'chrome', args: ['--use-angle=d3d11', '--ignore-gpu-blocklist'] });
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.addInitScript(() => { localStorage.setItem('lx_api_mode', 'off'); });
const p = await ctx.newPage(); const errs = [];
p.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.type() + ' ' + m.text().slice(0, 160)); });
await p.goto('http://localhost:4173/landxi/global/index.html?tenant=lx&locale=en&from=namwon');
await p.waitForFunction(() => window.__f1dWarm, null, { timeout: 60000 });
const out = await p.evaluate(async () => {
  const F = window.__f1d, map = F.stage.map, log = [];
  const snap = () => { const sc = map.style.sourceCaches; const o = { t: Math.round(performance.now() - t0), z: +map.getZoom().toFixed(2), d: F.tileDeficit().max };
    for (const id of ['xdworld-satellite', 'eox-s2cloudless-2025', 'gibs-a', 'gibs-bm']) { const c = sc[id]; if (!c) continue; const all = Object.values(c._tiles); o[id.slice(0, 4)] = `${c.getRenderableIds().length}/${all.length}/${all.filter((x) => x.state === 'loading').length}`; } log.push(o); };
  const t0 = performance.now(); const iv = setInterval(snap, 100);
  await F.go('globe', { force: true });
  await new Promise((r) => setTimeout(r, 800)); clearInterval(iv); return log;
});
console.log(out.map((o) => JSON.stringify(o)).join('\n')); console.log(errs);
await b.close();
