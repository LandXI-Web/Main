/* 10-24 분석 서비스 카드 — 바깥 주소 · 로그인 폼(LX 직원 test@lx.or.kr)으로 갤러리 · 자세히 · 지도 서비스를 찍고 칸을 잰다.
   node docs/superpowers/final/process/impl-46/cards-1024/capture.mjs  (비밀번호는 server/.env — common.mjs 가 읽는다) */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const C = await import(pathToFileURL(path.resolve(HERE, '../../../../../../tools/check/common.mjs')).href);
const OUT = path.join(HERE, 'shots');
fs.mkdirSync(OUT, { recursive: true });
const CARDS = JSON.parse(fs.readFileSync(path.join(HERE, 'cards.json'), 'utf8'));
const only = C.arg('--cards', '');
const want = only ? CARDS.filter((c) => only.split(',').includes(c.id)) : CARDS;

const browser = await C.launch();
const s = await C.login(browser, 'app');
const { page, home } = s;
const res = { at: new Date().toISOString(), base: home, cards: [] };
const t = (ms) => Math.round(ms);
try {
  let t0 = Date.now();
  await page.goto(home + '/landxi/v3/lx-analyze/', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-ready="1"]', { timeout: 60000 }).catch(() => {});
  // 한 페이지 8장으로
  await page.locator('.la-view-b', { hasText: '8' }).click().catch(() => {});
  await page.waitForTimeout(600);
  const galleryMs = Date.now() - t0;
  const inGallery = async (id) => {
    for (let i = 0; i < 4; i++) {
      if (await page.locator(`article[data-card="${id}"]`).count()) return true;
      const next = page.locator('button.la-pg.ar[aria-label="다음 페이지"]');
      if (!(await next.count()) || await next.isDisabled()) return false;
      await next.click(); await page.waitForTimeout(400);
    }
    return false;
  };
  await page.screenshot({ path: path.join(OUT, '00-gallery.png'), fullPage: false });
  for (const c of want) {
    await page.goto(home + '/landxi/v3/lx-analyze/', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-ready="1"]', { timeout: 60000 }).catch(() => {});
    await page.locator('.la-view-b', { hasText: '8' }).click().catch(() => {});
    const seen = await inGallery(c.id);
    if (seen) await page.locator(`article[data-card="${c.id}"]`).screenshot({ path: path.join(OUT, `${c.key}-a-gallery.png`) }).catch(() => {});
    t0 = Date.now();
    await page.goto(home + `/landxi/v3/lx-analyze/?card=${c.id}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-ready="1"]', { timeout: 60000 }).catch(() => {});
    await page.waitForSelector('.la-side .la-step, .la-side .la-cant, .la-side select', { timeout: 30000 }).catch(() => {});
    const detailMs = Date.now() - t0;
    await page.waitForTimeout(800);
    const info = await page.evaluate(() => {
      const txt = (el) => (el?.innerText || '').trim();
      const dl = [...document.querySelectorAll('section[aria-label="이 카드의 조건"] dl > div')].map((d) => [txt(d.querySelector('dt')), txt(d.querySelector('dd'))]);
      const secs = [...document.querySelectorAll('.la-dt-top, .la-side, .la-dt-body > section')].map((e) => { const r = e.getBoundingClientRect(); return { n: e.getAttribute('aria-label') || e.className, x: r.x, y: r.y + scrollY, w: r.width, h: r.height }; });
      let over = 0;
      for (let i = 0; i < secs.length; i++) for (let j = i + 1; j < secs.length; j++) {
        const a = secs[i], b = secs[j];
        const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x), oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
        if (ox > 2 && oy > 2 && !(a.n.includes('la-dt-top') && b.n === '이 카드로 분석')) over++;
      }
      return {
        title: txt(document.querySelector('.la-title')), chip: txt(document.querySelector('.la-tags .t-chip')), line: txt(document.querySelector('.la-line')),
        hero: !!document.querySelector('.la-hero img'), cond: dl, dash: dl.filter(([, v]) => v === '—' || v.startsWith('—')).map(([k]) => k),
        result: txt(document.querySelector('section[aria-label="결과 예시"]')).slice(0, 160), uses: txt(document.querySelector('section[aria-label="쓰이는 곳"]')).slice(0, 120),
        shared: !!document.querySelector('section[aria-label="분석할 영상"] h2')?.innerText.includes('공유 데이터에서 고르기'),
        upload: txt(document.querySelector('.la-own-b')), side: txt(document.querySelector('.la-side')).slice(0, 300), overlap: over,
      };
    });
    await page.screenshot({ path: path.join(OUT, `${c.key}-b-detail.png`), fullPage: true });
    let map = null;
    if (c.job) {
      t0 = Date.now();
      await page.goto(home + `/landxi/v3/lx-map/?job=${c.job}`, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('[data-ready="1"]', { timeout: 60000 }).catch(() => {});
      await page.waitForTimeout(5000);
      map = { ms: Date.now() - t0, text: (await page.locator('body').innerText()).includes(c.name) };
      await page.screenshot({ path: path.join(OUT, `${c.key}-c-map.png`) });
    }
    res.cards.push({ ...c, gallery: seen, detail_ms: t(detailMs), ...info, map });
    console.log(c.key, 'gallery', seen, 'chip', info.chip, 'dash', info.dash, 'overlap', info.overlap, 'map', map?.text, map?.ms);
  }
  res.gallery_ms = t(galleryMs);
} finally {
  fs.writeFileSync(path.join(HERE, 'items.json'), JSON.stringify(res, null, 1));
  await s.ctx.close(); await browser.close();
}
