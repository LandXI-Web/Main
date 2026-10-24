/* 분석 서비스 갤러리 한 화면 맞춤 확인 — 바깥 주소 · 로그인 폼(LX 직원). 화면 크기 넷 × 장수 넷: 페이지 스크롤 없음 · 잘림 없음 · 겹침 0 · 보이는 장수 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const C = await import(pathToFileURL(path.resolve(HERE, '../../../../../../tools/check/common.mjs')).href);
const OUT = path.join(HERE, 'shots', 'fit');
fs.mkdirSync(OUT, { recursive: true });
const SIZES = [[1920, 1080], [1440, 900], [1280, 800], [390, 844]];
const browser = await C.launch();
const s = await C.login(browser, 'app');
const { page, home } = s;
const rows = [];
try {
  for (const [w, hh] of SIZES) {
    await page.setViewportSize({ width: w, height: hh });
    await page.goto(home + '/landxi/v3/lx-analyze/', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-ready="1"] .la-ac', { timeout: 60000 }).catch(() => {});
    for (const n of [2, 4, 6, 8]) {
      await page.locator('.la-view-b', { hasText: String(n) }).click().catch(() => {});
      await page.waitForTimeout(700);
      const m = await page.evaluate(() => {
        const sc = document.querySelector('.la-scroll');
        const cards = [...document.querySelectorAll('.la-acg > .la-ac')];
        const rs = cards.map((c) => c.getBoundingClientRect());
        let over = 0;
        for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) {
          const a = rs[i], b = rs[j];
          if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1) over++;
        }
        const clip = [];
        for (const c of cards) {
          if (c.scrollHeight > c.clientHeight + 1) clip.push('card:' + c.dataset.card);
          for (const t of c.querySelectorAll('.k-sc-t, .la-ac-line, .la-ac-where .v, .la-ac-hero b, .la-ac-hero small, .la-ac-imk span, .k-sc-acts a, .la-ac-cat span')) {
            if (t.offsetParent && (t.scrollWidth > t.clientWidth + 1 || t.scrollHeight > t.clientHeight + 1)) clip.push(t.className + ':' + t.textContent.slice(0, 12));
          }
        }
        const vh = innerHeight;
        return { scroll: sc ? sc.scrollHeight - sc.clientHeight : null, cards: cards.length, inView: rs.filter((r) => r.top >= 0 && r.bottom <= vh + 1).length,
                 fit: document.querySelector('.la-acg')?.dataset.fit, cols: document.querySelector('.la-acg')?.style.gridTemplateColumns, overlap: over, clip: clip.slice(0, 5), minFont: Math.min(...[...document.querySelectorAll('.la-acg *')].filter((e) => e.offsetParent && e.childNodes.length && [...e.childNodes].some((x) => x.nodeType === 3 && x.textContent.trim())).map((e) => parseFloat(getComputedStyle(e).fontSize))) };
      });
      rows.push({ size: `${w}x${hh}`, n, ...m });
      console.log(`${w}x${hh} n=${n}`, JSON.stringify(m));
      await page.screenshot({ path: path.join(OUT, `${w}x${hh}-${n}.png`) });
    }
  }
} finally {
  fs.writeFileSync(path.join(HERE, 'gallery-fit.json'), JSON.stringify({ at: new Date().toISOString(), rows }, null, 1));
  await s.ctx.close(); await browser.close();
}
