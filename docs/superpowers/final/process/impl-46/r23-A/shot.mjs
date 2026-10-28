// 바퀴 23 묶음 A — 바깥 주소 · 로그인 폼(LX 직원 test@lx.or.kr) · 분석 서비스 갤러리 · 카드 · 지도 서비스 내 분석 목록 전/후
// node shot.mjs <before|after> [names]   (비밀번호는 env LX_PW)
import path from 'node:path'; import fs from 'node:fs'; import { pathToFileURL, fileURLToPath } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = 'E:/Land-XI 플랫폼/01. 디자인';
const { launch, login } = await import(pathToFileURL(path.join(ROOT, 'tools/check/common.mjs')).href);
const OUT = path.join(HERE, process.argv[2] || 'before'); fs.mkdirSync(OUT, { recursive: true });
const only = (process.argv[3] || 'gallery,cards,map').split(',');
const b = await launch(); const s = await login(b, 'app'); const pg = s.page;
const errs = []; pg.on('pageerror', (e) => errs.push(String(e)));
const log = { at: new Date().toISOString() };
const CARDS = ['card-d8fc01', 'card-4d8d6f', 'card-f31e5f', 'card-ba9d6d', 'card-landslide', 'card-change'];
if (only.includes('gallery')) {
  await pg.goto(s.home + '/landxi/v3/lx-analyze/', { waitUntil: 'domcontentloaded' });
  await pg.evaluate(() => localStorage.setItem('lx-analyze.per', '8'));
  await pg.reload({ waitUntil: 'domcontentloaded' });
  log.gallery = [];
  for (const pn of [1, 2, 3]) {
    if (pn > 1) { const bt = pg.locator('button', { hasText: new RegExp(`^${pn}$`) }).last(); if (!(await bt.count())) break; await bt.click().catch(() => {}); }
    await pg.waitForSelector('.la-ac', { timeout: 40000 }).catch(() => {});
    await pg.waitForTimeout(8000);
    log.gallery.push(...await pg.evaluate(() => [...document.querySelectorAll('.la-ac')].map((c) => c.innerText.replace(/\s+/g, ' ').trim().slice(0, 220))));
    await pg.screenshot({ path: path.join(OUT, `gallery-${pn}.png`), fullPage: true });
  }
}
if (only.includes('cards')) {
  log.cards = {};
  for (const c of CARDS) {
    const t0 = Date.now();
    await pg.goto(s.home + `/landxi/v3/lx-analyze/?card=${c}`, { waitUntil: 'domcontentloaded' });
    await pg.waitForTimeout(9000);
    await pg.screenshot({ path: path.join(OUT, `card-${c}.png`) });
    log.cards[c] = { s: Math.round((Date.now() - t0) / 1000), text: (await pg.innerText('body').catch(() => '')).replace(/\s+/g, ' ').slice(0, 600) };
  }
}
if (only.includes('map')) {
  const t0 = Date.now();
  await pg.goto(s.home + '/landxi/v3/lx-map/', { waitUntil: 'domcontentloaded' });
  await pg.waitForTimeout(12000);
  await pg.screenshot({ path: path.join(OUT, 'map-list.png') });
  log.map = { s: Math.round((Date.now() - t0) / 1000), text: (await pg.innerText('body').catch(() => '')).replace(/\s+/g, ' ').slice(0, 2500) };
}
log.errs = errs;
fs.writeFileSync(path.join(OUT, 'log.json'), JSON.stringify(log, null, 1));
await s.ctx.close(); await b.close();
