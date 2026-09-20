#!/usr/bin/env node
/* 전반 점검 — LX 직원이 실제로 쓸 때 걸리는 것을 기계로 훑는다.
 *
 *   발주자(2026-09-20): "LX 직원 관점에서 실제 동작해보고 불편한건 개편한다."
 *                        "이런 관점에서 전반에 다 점검한다. 기능 동작도 검수하고."
 *
 * 무엇을 잡나
 *   1 콘솔 오류 · 페이지 오류        — 조용히 죽은 코드
 *   2 화면 넘침                      — 페이지 스크롤 + 판 안쪽 스크롤(앱형은 안쪽이 넘친다)
 *   3 안 뜨는 영역                   — 자리는 잡았는데 비어 있는 판(지도·차트·표)
 *   4 죽은 버튼                      — 눌러도 화면이 안 바뀌고 이동도 토스트도 없는 것
 *   5 깨진 이미지                    — naturalWidth 0
 *   6 라벨 없는 조작 요소            — 스크린리더가 읽을 것이 없는 버튼
 *
 * 쓰는 법  node tools/proto/audit.mjs            전 화면
 *          node tools/proto/audit.mjs dashboard  한 화면만
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.geojson': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.mp4': 'video/mp4' };

const SCREENS = [
  ['dashboard', '대시보드'], ['dataset', '데이터 관리'], ['ai-project', '프로젝트 목록'],
  ['ai-project-create', '프로젝트 만들기'], ['ai-project-label', '라벨링'],
  ['analysis-ai', '분석 서비스'], ['ximap', '지도 서비스'], ['stats-standard', '통계'],
  ['report-standard', '보고서'], ['admin-publish', '카드 발행 관리'], ['ai-card', '카드 발행'],
  ['admin-users', '사용자 관리'], ['admin-notice', '공지 관리'], ['admin-inquiry', '문의 관리'],
  ['admin-faq', 'FAQ 관리'], ['admin-map', '지도 설정'],
  ['notice', '공지사항'], ['faq', '자주 묻는 질문'], ['contact', '문의하기'],
  ['usecase', '활용 사례'], ['manual', '매뉴얼'], ['mypage', '마이페이지'],
  ['produce', '생산 관리'], ['portal', '지자체 포털'], ['portal-dp-nw-farm-25', '포털 · 영농관리'],
  ['login', '로그인'],
];

const only = process.argv[2];
const list = only ? SCREENS.filter(([id]) => id === only) : SCREENS;

const srv = createServer(async (rq, rs) => {
  let p;
  try {
    p = resolve(ROOT, decodeURIComponent(rq.url.split('?')[0]).replace(/^\//, ''));
    const body = await readFile(p);
    rs.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream' });
    rs.end(body);
  } catch { if (!rs.headersSent) { rs.writeHead(404); rs.end('nf'); } }
});
const PORT = 4610 + Math.floor(Math.random() * 200);
await new Promise((r) => srv.listen(PORT, r));

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
await page.addInitScript(() => { try { localStorage.setItem('lx_logged_in', '1'); } catch { /* 무시 */ } });

const report = [];
for (const [id, name] of list) {
  const errs = [];
  const onErr = (e) => errs.push(String(e.message || e).slice(0, 140));
  const onMsg = (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 140)); };
  page.on('pageerror', onErr); page.on('console', onMsg);

  const found = { id, name, errs, over: 0, inner: [], empty: [], dead: [], img: [], unnamed: 0 };
  try {
    await page.goto(`http://127.0.0.1:${PORT}/landxi/proto/${id}.html`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(1200);

    Object.assign(found, await page.evaluate(() => {
      const box = (e) => e.getBoundingClientRect();
      // 2 화면 넘침
      const over = document.documentElement.scrollHeight - innerHeight;
      const inner = [...document.querySelectorAll('#main *')].filter((e) => {
        const c = getComputedStyle(e);
        return /auto|scroll/.test(c.overflowY) && e.scrollHeight - e.clientHeight > 40 && e.clientHeight > 80;
      }).map((e) => ({ sel: sel(e), hid: e.scrollHeight - e.clientHeight, h: e.clientHeight }));
      // 3 자리는 있는데 비어 있는 판
      const empty = [...document.querySelectorAll('#main div, #main section, #main figure, #main canvas')]
        .filter((e) => { const b = box(e); return b.height > 90 && b.width > 140 && !e.children.length
          && !e.textContent.trim() && e.tagName !== 'CANVAS' && getComputedStyle(e).backgroundImage === 'none'; })
        .map((e) => ({ sel: sel(e), w: Math.round(box(e).width), h: Math.round(box(e).height) }));
      // 5 깨진 이미지
      const img = [...document.images].filter((i) => i.complete && i.naturalWidth === 0 && box(i).width > 4)
        .map((i) => i.getAttribute('src'));
      // 6 이름 없는 조작 요소
      const unnamed = [...document.querySelectorAll('#main button, #main a[href], #main [role="button"]')]
        .filter((e) => box(e).width > 0 && !e.textContent.trim() && !e.getAttribute('aria-label')
          && !e.getAttribute('title') && !e.querySelector('[aria-label],title,.sr,.rl')).length;
      function sel(e) { return e.tagName.toLowerCase() + (e.id ? '#' + e.id : '')
        + (typeof e.className === 'string' && e.className ? '.' + e.className.trim().split(/\s+/)[0] : ''); }
      return { over, inner, empty, img, unnamed };
    }));

    // 4 죽은 버튼 — 눌러도 DOM 도 URL 도 토스트도 안 바뀌는 것
    const btns = await page.locator('#main button:visible:not([disabled]):not([data-audit-skip])').all();
    for (const b of btns.slice(0, 26)) {
      const label = (await b.innerText().catch(() => '')).replace(/\s+/g, ' ').trim().slice(0, 22);
      if (!label) continue;
      if (/삭제|제거|로그아웃|발급|저장|초기화/.test(label)) continue;   // 파괴적·상태 변경은 누르지 않는다
      const before = await page.evaluate(() => [location.href, document.getElementById('main').innerHTML.length]);
      await b.click({ timeout: 2500 }).catch(() => {});
      await page.waitForTimeout(260);
      const after = await page.evaluate(() => [location.href, document.getElementById('main').innerHTML.length,
        !!document.querySelector('.toast, [role="status"]:not(:empty), .modal')]);
      if (before[0] === after[0] && before[1] === after[1] && !after[2]) found.dead.push(label);
      if (before[0] !== after[0]) { await page.goBack({ waitUntil: 'networkidle' }).catch(() => {}); await page.waitForTimeout(500); }
      await page.keyboard.press('Escape').catch(() => {});
    }
  } catch (e) { errs.push('AUDIT: ' + String(e.message).slice(0, 120)); }

  page.off('pageerror', onErr); page.off('console', onMsg);
  report.push(found);
}

/* ── 출력 ─────────────────────────────────────────────────────────── */
const line = '─'.repeat(72);
let bad = 0;
for (const r of report) {
  const issues = [];
  if (r.errs.length) issues.push(['콘솔 오류', [...new Set(r.errs)].join(' / ')]);
  if (r.over > 4) issues.push(['페이지 스크롤', `${r.over}px 더 내려야 본다`]);
  r.inner.forEach((i) => issues.push(['판 안쪽 스크롤', `${i.hid}px 숨음 (판 ${i.h}px)  ${i.sel}`]));
  r.empty.forEach((e) => issues.push(['빈 자리', `${e.w}×${e.h}  ${e.sel}`]));
  if (r.img.length) issues.push(['깨진 이미지', [...new Set(r.img)].join(' / ')]);
  if (r.dead.length) issues.push(['눌러도 반응 없음', [...new Set(r.dead)].join(' · ')]);
  if (r.unnamed) issues.push(['이름 없는 조작 요소', `${r.unnamed}개`]);
  if (!issues.length) continue;
  bad++;
  console.log(`\n${line}\n${r.name}  (${r.id}.html)`);
  issues.forEach(([k, v]) => console.log(`  · ${k.padEnd(14)} ${v}`));
}
console.log(`\n${line}\n점검 ${report.length}쪽 · 걸린 곳 ${bad}쪽`);

await browser.close();
srv.close();
