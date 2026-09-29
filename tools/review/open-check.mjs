// '실제 화면' 열기 점검기 — 자산 대장의 구현 화면(구 proto · v2 · v3)을 GitHub Pages(또는 로컬)에서 실제로 열어
// 왜 안 열리는지 항목별로 분류한다. 결과: shots/overview/open-check/<pages|local>.json (+ 화면별 캡처)
// 실행: node tools/review/open-check.mjs [베이스 URL]   기본 https://landxi-web.github.io/Main
// 분류(사용자 말): 열림 · 서버 필요(로그인·AI·데이터 API) · 로그인 필요 · 파일 경로 문제 · 외부 타일 차단
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = (process.argv[2] || 'https://landxi-web.github.io/Main').replace(/\/$/, '');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.join(ROOT, 'shots/overview/open-check');
fs.mkdirSync(OUT, { recursive: true });
const inv = JSON.parse(fs.readFileSync(path.join(ROOT, 'shots/overview/inventory.json'), 'utf8'));
const V3 = ['main', 'service-detail', 'login', 'lx-console', 'lx-ingest', 'lx-train', 'lx-review', 'lx-deploy', 'xi-clean', 'gov-fusion', 'gov-report', 'ops-core', 'ops-infra', 'sales', 'global', 'help-my', 'kit'];
const list = [];
for (const s of inv.screens) if (!/^v3-/.test(s.id)) list.push([s.id, String(s['경로']).replace(/^:8702\//, '')]);
for (const d of V3) list.push([`v3-${d}`, `landxi/v3/${d}/index.html`]);
const only = process.argv[3] ? new Set(process.argv[3].split(',')) : null;

const TILE = /vworld|tile|openstreetmap|arcgis|mapbox|maptiler|carto|stadia|esri|googleapis\.com\/.*tile/i;
const b = await chromium.launch({ channel: 'chrome' });
const res = {};
for (const [id, p] of list) {
  if (only && !only.has(id)) continue;
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errors = [], sameFail = [], server = [], tiles = [], other = [];
  const url = `${BASE}/${p}`;
  const origin = new URL(url).origin;
  const note = (u, why) => {
    if (/localhost|127\.0\.0\.1|:870\d/.test(u)) server.push(u);
    else if (u.startsWith(origin)) sameFail.push(`${why} ${u}`);
    else if (TILE.test(u)) tiles.push(`${why} ${u}`);
    else other.push(`${why} ${u}`);
  };
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 160)); });
  page.on('pageerror', (e) => errors.push('pageerror ' + String(e.message).slice(0, 160)));
  page.on('requestfailed', (r) => note(r.url(), 'failed'));
  page.on('response', (r) => { if (r.status() >= 400) note(r.url(), String(r.status())); });
  let status = null, finalUrl = null;
  try {
    const r = await page.goto(url, { waitUntil: 'load', timeout: 60000 });
    status = r ? r.status() : null;
    await page.waitForTimeout(6000);
    finalUrl = page.url();
  } catch (e) { errors.push('goto ' + String(e.message).slice(0, 120)); finalUrl = page.url(); }
  const text = await page.evaluate(() => (document.body?.innerText || '').replace(/\s+/g, ' ').trim()).catch(() => '');
  await page.screenshot({ path: path.join(OUT, `${id}.jpg`), type: 'jpeg', quality: 60 }).catch(() => {});
  const redirectedToLogin = finalUrl && finalUrl !== url && /login/i.test(new URL(finalUrl).pathname + new URL(finalUrl).search) && !/login/i.test(p);
  res[id] = { path: p, status, finalUrl, redirectedToLogin, textLen: text.length, text: text.slice(0, 160), errors: [...new Set(errors)].slice(0, 8),
    sameFail: [...new Set(sameFail)].slice(0, 10), server: [...new Set(server.map((u) => u.replace(/\?.*$/, '')))].slice(0, 8), tiles: [...new Set(tiles)].slice(0, 5), other: [...new Set(other)].slice(0, 5) };
  const x = res[id];
  console.log(`${id.padEnd(34)} ${status} txt${String(x.textLen).padStart(5)} 경로${x.sameFail.length} 서버${x.server.length} 타일${x.tiles.length} 기타${x.other.length}${redirectedToLogin ? ' →로그인' : ''}${finalUrl !== url ? ' ⇒ ' + finalUrl.replace(BASE, '') : ''}`);
  await ctx.close();
}
await b.close();
const file = path.join(OUT, /localhost/.test(BASE) ? 'local.json' : 'pages.json');
const prev = only && fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')).results : {};
fs.writeFileSync(file, JSON.stringify({ base: BASE, checked_at: new Date().toISOString(), results: { ...prev, ...res } }, null, 1));
