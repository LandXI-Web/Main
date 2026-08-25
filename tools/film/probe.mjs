// tools/film/probe.mjs — 특정 시각의 타임라인 상태를 콘솔로 확인한다(프레임을 굽지 않는다).
//   node tools/film/probe.mjs 17.4
import { chromium } from '@playwright/test';
const t = Number(process.argv[2] ?? 17.4);
const b = await chromium.launch({ channel: 'chrome' });
const p = await b.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
p.on('pageerror', e => console.error('PAGEERROR', e.message));
await p.goto(`http://localhost:${process.env.PORT || 4173}/tools/film/render.html`, { waitUntil: 'domcontentloaded' });
await p.waitForFunction('window.__filmReady === true', null, { timeout: 120000 });
const out = await p.evaluate(async tt => {
  window.__film.seek(tt);
  await new Promise(r => setTimeout(r, 2500));
  const m = window.__map;
  const corners = [[127.182606, 35.302858], [127.637309, 35.561786], [127.637309, 35.302858], [127.182606, 35.561786]];
  return {
    cam: { c: m.getCenter().toArray().map(v => +v.toFixed(4)), z: +m.getZoom().toFixed(2), p: +m.getPitch().toFixed(1), b: +m.getBearing().toFixed(1) },
    nwCornersPx: corners.map(c => { const q = m.project(c); return [Math.round(q.x), Math.round(q.y)]; }),
    nwBrOpacity: m.getPaintProperty('nw-br', 'line-opacity'),
    nwBrRendered: m.queryRenderedFeatures({ layers: ['nw-br'] }).length,
    ghRendered: m.queryRenderedFeatures({ layers: ['gh-core'] }).length,
    yeRendered: m.queryRenderedFeatures({ layers: ['ye-core'] }).length,
    settled: window.__film.settled(),
  };
}, t);
console.log(t, JSON.stringify(out, null, 1));
await b.close();
