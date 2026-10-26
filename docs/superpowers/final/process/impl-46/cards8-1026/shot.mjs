// 카드 8종 — 바깥 주소 · 로그인 폼(LX 직원) · 분석 서비스 갤러리 + 예시 결과 지도 서비스 화면
// node shot.mjs <before|after>   (비밀번호는 env LX_PW 또는 server/.env)
import path from 'node:path'; import fs from 'node:fs'; import { pathToFileURL, fileURLToPath } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = 'E:/Land-XI 플랫폼/01. 디자인';
const { launch, login } = await import(pathToFileURL(path.join(ROOT, 'tools/check/common.mjs')).href);
const OUT = path.join(HERE, process.argv[2] || 'before'); fs.mkdirSync(OUT, { recursive: true });
const MAPS = JSON.parse(fs.readFileSync(path.join(HERE, process.argv[3] || 'maps.json'), 'utf8'));
const b = await launch(); const s = await login(b, 'app'); const pg = s.page;
const errs = []; pg.on('pageerror', (e) => errs.push(String(e)));
const log = {};
await pg.goto(s.home + '/landxi/v3/lx-analyze/', { waitUntil: 'domcontentloaded' });
await pg.evaluate(() => localStorage.setItem('lx-analyze.per', '8'));
await pg.reload({ waitUntil: 'domcontentloaded' });
log.gallery = [];
for (const pn of [1, 2]) {
  if (pn > 1) await pg.locator('button', { hasText: /^2$/ }).last().click().catch(() => {});
  await pg.waitForSelector('.la-ac', { timeout: 40000 }).catch(() => {});
  await pg.waitForTimeout(7000);                                   // 밀어 보기가 결과 쪽에 멈출 때까지
  log.gallery.push(...await pg.evaluate(() => [...document.querySelectorAll('.la-ac')].map((c) => c.innerText.replace(/\s+/g, ' ').trim().slice(0, 200))));
  await pg.screenshot({ path: path.join(OUT, `gallery-${pn}.png`), fullPage: true });
}
for (const [k, q] of Object.entries(MAPS)) {
  const t0 = Date.now();
  await pg.goto(s.home + '/landxi/v3/lx-map/?' + q, { waitUntil: 'domcontentloaded' });
  await pg.waitForTimeout(9000);
  await pg.screenshot({ path: path.join(OUT, `map-${k}.png`) });
  log[k] = { s: Math.round((Date.now() - t0) / 1000), text: (await pg.innerText('body').catch(() => '')).replace(/\s+/g, ' ').slice(0, 400) };
}
log.errs = errs;
fs.writeFileSync(path.join(OUT, 'log.json'), JSON.stringify(log, null, 1));
await s.ctx.close(); await b.close();
