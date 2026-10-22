/* 숫자 한 출처 대조 — 바깥 주소 · 로그인 폼(frontDoor)으로 LX 직원 · 남원 · 광주전남 각각 XI맵을 열고, 그 화면이 쓰는 같은 API 를 그 세션으로 읽어 견준다.
   node numbers.mjs → numbers-c22.json + 그림 3장 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { frontDoor } from '../../../../../../../landxi/v3/kit/lint/forbidden.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(HERE, '..');
const BASE = process.env.LX_BASE || 'https://app.land-xi.dev';
const WHO = [
  { tag: 'lx', login: 'test@lx.or.kr', site: 'app' },
  { tag: 'namwon', login: 'lxadmin@lx.or.kr#namwon' },
  { tag: 'gwangju-jeonnam', login: 'lxadmin@lx.or.kr#gwangju-jeonnam' },
];
const b = await chromium.launch();
const res = { at: new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }), base: BASE, who: {} };
for (const w of WHO) {
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, locale: 'ko-KR' });
  const page = await ctx.newPage();
  const errs = [];
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 200)); });
  const t0 = Date.now();
  await frontDoor(page, BASE, w.login, w.site);
  const origin = new URL(page.url()).origin;                      // 기관 = {기관}.land-xi.dev(세션이 그 주소에)
  await page.goto(`${origin}/landxi/v3/xi-clean/`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__xc?.map?.loaded?.(), null, { timeout: 60000 }).catch(() => null);
  await page.waitForTimeout(5000);
  const ms = Date.now() - t0;
  const data = await page.evaluate(async (lx) => {
    const { api } = await import('/landxi/shared/api-v1.js');
    const v = (e) => (e && typeof e === 'object' ? e.value : e);
    const out = { board: {}, national: null };
    try {
      const bd = await api('/ximap/board');
      for (const r of bd.regions || []) out.board[r.sgg_cd] = { name: r.name, n: v(r.n), items: (r.items || []).map((x) => ({ svc: x.svc, name: x.name, n: v(x.n), year: x.year })) };
    } catch (e) { out.board_err = String(e.message || e); }
    if (lx) {
      try {
        const nr = await api('/national/region?codes=52190');
        out.national = Object.fromEntries(Object.entries(nr.assets || {}).map(([a, A]) => [a, Object.fromEntries(Object.entries(A.counts || {}).map(([k, c]) => [k, { n: v(c.n), km2: v(c.km2), net: v(c.net) }]))]));
        const pg = await api('/national/progress');
        out.progress = Object.fromEntries(Object.entries(pg.assets || {}).map(([a, A]) => [a, Object.fromEntries(Object.entries(A.counts || {}).map(([k, c]) => [k, v(c.n ?? c)]))]));
      } catch (e) { out.national_err = String(e.message || e); }
    }
    return out;
  }, w.tag === 'lx').catch((e) => ({ err: String(e) }));
  await page.screenshot({ path: path.join(OUT, `numbers-${w.tag}.png`) });
  res.who[w.tag] = { ms, console_errors: errs.slice(0, 5), ...data };
  await ctx.close();
}
await b.close();
// 대조 — 기관 화면의 시군구 · 서비스 숫자가 LX 화면과 같은가
const lx = res.who.lx?.board || {};
const cmp = [];
for (const t of ['namwon', 'gwangju-jeonnam']) {
  for (const [sgg, r] of Object.entries(res.who[t]?.board || {})) {
    for (const it of r.items) {
      const l = (lx[sgg]?.items || []).find((x) => x.svc === it.svc);
      cmp.push({ who: t, sgg, region: r.name, svc: it.name, gov: it.n, lx: l ? l.n : null, same: l ? l.n === it.n : null });
    }
  }
}
res.compare = cmp;
res.mismatch = cmp.filter((x) => x.same === false).length;
fs.writeFileSync(path.join(OUT, 'numbers-c22.json'), JSON.stringify(res, null, 1));
console.log(JSON.stringify({ mismatch: res.mismatch, compared: cmp.length, national: res.who.lx?.national, errs: Object.fromEntries(Object.entries(res.who).map(([k, v]) => [k, [v.board_err, v.national_err, v.err, ...(v.console_errors || [])].filter(Boolean)])) }, null, 1));
