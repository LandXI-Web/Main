// XI맵 왼쪽 위 목록(한 화면 2단) 증거 그림 — 바깥 주소 로그인 폼으로만(세션 주입 없음) · 계정마다 로그인 한 번 · 같은 창에서 폭만 바꾼다.
//   node shoot.mjs before   → shots/before-*.png (직원 1920 · 1366 · 기관 1440)
//   node shoot.mjs after    → shots/after-*.png + list-result.json
//   node shoot.mjs options  → ../ximap-chat-options/sian-{A,B,C}-1440.png (XI ChatGEO 자리 시안 — 실제 화면 위에 CSS · DOM 을 덧씌워 찍음 · 구현 아님)
// 비밀번호는 server/.env 에서 읽고 출력하지 않는다.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';

const ROOT = 'E:/Land-XI 플랫폼/01. 디자인';
const HW = 'C:/Users/User/AppData/Local/ms-playwright';
if (fs.existsSync(path.join(HW, 'chromium-1234'))) process.env.PLAYWRIGHT_BROWSERS_PATH = HW;
if (!process.env.DEV_PASSWORD) { const m = fs.readFileSync(path.join(ROOT, 'server/.env'), 'utf8').match(/^DEV_PASSWORD=(.*?)\s*$/m); if (m) process.env.DEV_PASSWORD = m[1]; }
process.env.LX_PW ||= process.env.DEV_PASSWORD;
const { chromium } = createRequire(path.join(ROOT, 'package.json'))('playwright');
const { frontDoor } = await import(pathToFileURL(path.join(ROOT, 'landxi/v3/kit/lint/forbidden.mjs')).href);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const MODE = process.argv[2] || 'after';
const SHOTS = path.join(HERE, 'shots'); fs.mkdirSync(SHOTS, { recursive: true });
const OPTS = path.join(HERE, '..', 'ximap-chat-options'); fs.mkdirSync(OPTS, { recursive: true });
const stamp = () => { const d = new Date(); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };

const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const RESULT = [];
const save = () => { if (MODE !== 'options') fs.writeFileSync(path.join(HERE, `list-result${MODE === 'before' ? '-before' : ''}.json`), JSON.stringify(RESULT, null, 1)); };   // 시안 굽기는 실측 파일을 덮지 않는다

// 떠 있는 요소 상자 · 겹침(이전 바퀴와 같은 셈)
const geoFn = () => {
  const vis = (el) => { if (!el) return null; const r = el.getBoundingClientRect(), cs = getComputedStyle(el); if (r.width < 1 || r.height < 1 || cs.visibility === 'hidden' || cs.display === 'none') return null; return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height), r: Math.round(r.right), b: Math.round(r.bottom) }; };
  const boxes = { drawer: vis(document.querySelector('.k-main > .k-drawer')), chat: vis(document.querySelector('.k-chat-root[data-dock] .k-chat-in')), chatA: vis(document.querySelector('.k-chat-root[data-dock] .k-chat-dlog')),
    topleft: vis(document.querySelector('.xb-hud')), tools: vis(document.querySelector('nav.xc-tools')), stats: vis(document.querySelector('section.xo')), analyze: vis(document.querySelector('.xa, .xc-analyze, [class*=analyze-pane]')) };
  const keys = Object.keys(boxes).filter((k) => boxes[k]); const overlaps = [];
  for (let i = 0; i < keys.length; i++) for (let j = i + 1; j < keys.length; j++) { const a = boxes[keys[i]], b = boxes[keys[j]]; const ix = Math.min(a.r, b.r) - Math.max(a.x, b.x), iy = Math.min(a.b, b.b) - Math.max(a.y, b.y); if (ix > 2 && iy > 2) overlaps.push(`${keys[i]}×${keys[j]} ${ix}×${iy}px`); }
  const list = window.X?.boardList || null;
  return { boxes, overlaps, list, chips: document.querySelectorAll('.xc-sdc').length, grid: document.querySelectorAll('.xc-sgc').length, open: document.querySelectorAll('.xc-sgc[aria-expanded="true"]').length, crumb: document.querySelector('.xc-bc')?.innerText.replace(/\s+/g, ' ') || '' };
};

async function shot(p, name, label) {
  const png = `${name}.png`; await p.screenshot({ path: path.join(SHOTS, png) }).catch(() => {});
  const g = await p.evaluate(geoFn).catch((e) => ({ err: String(e) }));
  RESULT.push({ png, label, at: stamp(), ...g }); save(); console.log(png, label, 'overlaps', g.overlaps?.length, 'chips', g.chips, 'grid', g.grid, 'crumb', g.crumb);
}
const ready = (p, t = 90000) => p.waitForFunction(() => { const c = document.querySelector('canvas'), t1 = document.querySelector('.xb-k, .xc-big'); return c && t1 && t1.innerText.trim().length > 0; }, null, { timeout: t, polling: 200 }).then(() => true, () => false);
const openList = async (p) => { await p.locator('.xb-hud .xb-k--line, .xb-hud button').first().click({ timeout: 8000 }); await p.waitForTimeout(1500); };
const pick = async (p, text) => {   // 새 모양(칩)이든 옛 모양(줄)이든 그 이름을 누른다
  const chip = p.locator('.xc-sdc, .xc-sgc, .xc-bl', { hasText: text }).first();
  if (await chip.count()) await chip.click({ timeout: 5000 }); else await p.locator('.xc-sdc, .xc-bl').first().click({ timeout: 5000 });
  await p.waitForTimeout(1500);
};

async function staff(tag) {
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } }); const p = await ctx.newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(String(e).slice(0, 160))); p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 160)); });
  await frontDoor(p, 'https://app.land-xi.dev', 'test@lx.or.kr'); await p.waitForTimeout(1500); console.log('login staff', p.url());
  for (const [w, hh] of (MODE === 'options' ? [] : [[1920, 1080], [1366, 768]])) {
    await p.setViewportSize({ width: w, height: hh });
    await p.goto('https://app.land-xi.dev/landxi/v3/xi-clean/', { waitUntil: 'domcontentloaded', timeout: 60000 }); await ready(p); await p.waitForTimeout(2500);
    await openList(p); await shot(p, `${tag}-${w}-list-1`, '왼쪽 위 한 줄 누름');
    await pick(p, '전북'); await shot(p, `${tag}-${w}-list-2`, '시도 고름');
    if (!(await p.locator('.xc-sgc[aria-expanded="true"]', { hasText: '남원' }).count())) await pick(p, '남원');   // 시군구가 하나뿐인 시도는 이미 펼쳐져 있다(다시 누르면 접힘)
    await shot(p, `${tag}-${w}-list-3`, '시군구 고름 — 서비스');
    if (tag === 'after') {
      const svc = p.locator('.xc-board-svc').first(); if (await svc.count()) { await svc.click({ timeout: 5000 }); await p.waitForTimeout(2500); await shot(p, `${tag}-${w}-list-4`, '서비스 누름 — 결과'); }
      const back = p.locator('.xc-bc-b').first(); if (await back.count()) { await back.click({ timeout: 5000 }); await p.waitForTimeout(1200); await shot(p, `${tag}-${w}-list-crumb`, '길잡이로 돌아감'); }
    }
  }
  RESULT.push({ errors: [...new Set(errs)] }); save();
  if (MODE === 'options') await options(p);
  await ctx.close();
}
async function agency(tag) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } }); const p = await ctx.newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(String(e).slice(0, 160)));
  await frontDoor(p, 'https://namwon.land-xi.dev', 'lxadmin@lx.or.kr#namwon'); await p.waitForTimeout(1500); console.log('login namwon', p.url());
  await p.goto('https://namwon.land-xi.dev/landxi/v3/xi-clean/', { waitUntil: 'domcontentloaded', timeout: 60000 }); await ready(p); await p.waitForTimeout(2500);
  await openList(p); await shot(p, `${tag}-gov-1440-list`, '기관 — 왼쪽 위 한 줄 누름');
  if (tag === 'after') { const svc = p.locator('.xc-board-svc').first(); if (await svc.count()) { await svc.click({ timeout: 5000 }); await p.waitForTimeout(2500); await shot(p, `${tag}-gov-1440-list-svc`, '기관 — 서비스 누름'); } }
  RESULT.push({ gov_errors: [...new Set(errs)] }); save();
  await ctx.close();
}

/* ── XI ChatGEO 자리 시안 A · B · C — 실제 화면 위에 덧씌운 그림(구현 아님) ── */
async function options(p) {
  await p.setViewportSize({ width: 1440, height: 900 });
  await p.goto('https://app.land-xi.dev/landxi/v3/xi-clean/', { waitUntil: 'domcontentloaded', timeout: 60000 }); await ready(p); await p.waitForTimeout(2500);
  const inp = p.locator('input[placeholder*="시군구 · 지번"]').first(); await inp.click({ timeout: 8000 }); await inp.fill('남원시 경작지 현황 보여 줘'); await inp.press('Enter');
  await p.waitForFunction(() => document.body.innerText.includes('경작지'), null, { timeout: 60000, polling: 300 }).catch(() => {});
  await p.waitForTimeout(3500);
  const badge = (id, title) => `<div class="sian-badge" style="position:absolute;z-index:99;left:24px;top:76px;display:flex;gap:8px;align-items:center;font:700 15px/1 Pretendard,sans-serif"><span style="background:#ff6b00;color:#fff;border-radius:999px;padding:7px 12px">시안 ${id}</span><span style="background:#fff;border-radius:999px;padding:7px 12px;box-shadow:0 2px 8px rgba(0,0,0,.12)">${title} · ${stamp()}</span></div>`;
  const CSS = {
    A: `.k-main > .k-chat-root[data-dock]{left:auto!important;right:0!important;top:0!important;bottom:0!important;width:380px!important;transform:none!important;background:#fff;border-left:1px solid #e5e8eb;display:flex;flex-direction:column;justify-content:flex-end;padding:0 16px 16px;box-sizing:border-box}
      .k-main > .k-chat-root[data-dock] .k-ck.k-chat{flex:1;display:flex;flex-direction:column;justify-content:flex-end;min-height:0}
      .k-main > .k-chat-root[data-dock] .k-chat-dlog{box-shadow:none;background:none;flex:1;min-height:0;display:flex;flex-direction:column;justify-content:flex-end}
      .k-main > .k-chat-root[data-dock] .k-chat-dlog .k-chat-b{max-height:none!important;padding:16px 8px}
      .k-main > .k-chat-root[data-dock] .k-chat-dlog .k-chat-b > .k-chat-msg{display:flex!important}
      .k-main > .k-chat-root[data-dock] .k-chat-in,.k-main > .k-chat-root[data-dock] .k-chat-sugg .k-chat-chip{box-shadow:none;border:1px solid #e5e8eb!important}
      .k-main > .k-chat-root[data-dock] .xc-prev,.k-main > .k-chat-root[data-dock] .k-chat-x{display:none!important}
      .maplibregl-map{width:calc(100% - 380px)!important}
      nav.xc-tools,.xc-pop,section.xo{transform:translateX(-380px)}
      .sian-split{position:absolute;z-index:98;top:0;bottom:0;right:377px;width:6px;cursor:col-resize;background:linear-gradient(#e5e8eb,#e5e8eb) center/2px 100% no-repeat}
      .sian-split::after{content:"";position:absolute;top:50%;left:-5px;width:16px;height:40px;margin-top:-20px;border-radius:8px;background:#fff;box-shadow:0 1px 4px rgba(0,0,0,.18);background-image:radial-gradient(#b0b8c1 1px,transparent 1.2px);background-size:4px 6px;background-position:center;background-repeat:repeat-y;background-clip:content-box;padding:8px 5px;box-sizing:border-box}
      .sian-colh{position:absolute;z-index:98;top:0;right:0;width:380px;height:56px;display:flex;align-items:center;justify-content:space-between;padding:0 16px;box-sizing:border-box;font:700 17px/1 Pretendard,sans-serif;color:#191f28;background:#fff}
      .sian-colh small{font:500 14px/1 Pretendard,sans-serif;color:#8b95a1}`,
    B: `.k-main > .k-chat-root[data-dock]{width:440px!important}
      .k-main > .k-chat-root[data-dock] .k-chat-dlog .k-chat-b{max-height:118px!important;padding:12px 84px 12px 14px;overflow:hidden}
      .k-main > .k-chat-root[data-dock] .k-chat-dlog .k-chat-b > .k-chat-msg{display:none!important}
      .k-main > .k-chat-root[data-dock] .k-chat-dlog .k-chat-b > .k-chat-msg:last-child{display:flex!important}
      .k-main > .k-chat-root[data-dock] .k-chat-dlog .k-chat-b > .k-chat-msg:last-child .k-chat-plan,.k-main > .k-chat-root[data-dock] .k-chat-dlog .k-chat-b > .k-chat-msg:last-child .k-ck-plan{display:none}
      .k-main > .k-chat-root[data-dock] .k-chat-sugg,.k-main > .k-chat-root[data-dock] .xc-prev,.k-main > .k-chat-root[data-dock] .k-chat-x{display:none!important}
      .k-main > .k-chat-root[data-dock] .k-chat-dlog::after{content:"";position:absolute;left:0;right:0;bottom:0;height:36px;background:linear-gradient(rgba(255,255,255,0),#fff)}
      .sian-more{position:absolute;z-index:3;right:10px;top:8px;height:30px;padding:0 10px;border:0;border-radius:8px;background:#f2f4f6;font:600 14px/30px Pretendard,sans-serif;color:#4e5968}`,
    C: `.k-main > .k-chat-root[data-dock]{left:0!important;right:0!important;bottom:0!important;width:100%!important;transform:none!important;height:46%;background:#fff;border-radius:20px 20px 0 0;box-shadow:0 -6px 24px rgba(0,0,0,.14);padding:36px 24px 14px;box-sizing:border-box;display:flex;flex-direction:column}
      .k-main > .k-chat-root[data-dock] .k-ck.k-chat{flex:1;display:flex;flex-direction:column;min-height:0;max-width:880px!important;margin:0 auto;width:100%}
      .k-main > .k-chat-root[data-dock] .k-chat-dlog{box-shadow:none;background:none;flex:1;min-height:0;display:flex;flex-direction:column;justify-content:flex-end}
      .k-main > .k-chat-root[data-dock] .k-chat-dlog .k-chat-b{max-height:none!important;padding:8px 8px}
      .k-main > .k-chat-root[data-dock] .k-chat-dlog .k-chat-b > .k-chat-msg{display:flex!important}
      .k-main > .k-chat-root[data-dock] .k-chat-in{box-shadow:none;border:1px solid #e5e8eb!important}
      .k-main > .k-chat-root[data-dock] .xc-prev,.k-main > .k-chat-root[data-dock] .k-chat-x,.k-main > .k-chat-root[data-dock] .k-chat-sugg{display:none!important}
      .sian-grip{position:absolute;z-index:3;left:50%;top:10px;width:44px;height:5px;margin-left:-22px;border-radius:3px;background:#d1d6db}
      .sian-steps{position:absolute;z-index:3;right:20px;top:8px;display:flex;gap:4px;font:600 13px/26px Pretendard,sans-serif}
      .sian-steps span{padding:0 10px;border-radius:999px;background:#f2f4f6;color:#8b95a1}.sian-steps span.on{background:#191f28;color:#fff}`,
  };
  const DOM = {
    A: `<div class="sian-split"></div><div class="sian-colh">XI ChatGEO <small>◀ 끌어서 폭 조절 ▶</small></div>`,
    B: `<button class="sian-more" type="button">펼치기</button>`,
    C: `<div class="sian-grip"></div><div class="sian-steps"><span>접기</span><span class="on">반</span><span>전체</span></div>`,
  };
  const TITLE = { A: '지도 | 채팅 칸 나누기(폭 조절)', B: '지도 안 작은 카드 — 최근 답만', C: '아래 시트 — 접기 · 반 · 전체' };
  for (const id of ['A', 'B', 'C']) {
    await p.evaluate(({ id, css, dom, badge }) => {
      document.querySelectorAll('.sian-css, .sian-badge, .sian-split, .sian-colh, .sian-more, .sian-grip, .sian-steps').forEach((e) => e.remove());
      const st = document.createElement('style'); st.className = 'sian-css'; st.textContent = css; document.head.append(st);
      const root = document.querySelector('.k-main > .k-chat-root[data-dock]'); const main = document.querySelector('.k-main');
      root.removeAttribute('data-fold'); if (id === 'A' || id === 'C') root.setAttribute('data-all', ''); else root.removeAttribute('data-all');
      const host = id === 'B' ? root.querySelector('.k-chat-dlog') : id === 'C' ? root : main;
      host.insertAdjacentHTML('beforeend', dom); main.insertAdjacentHTML('beforeend', badge);
      if (id === 'A') {   // 오른쪽 위 영상 · 나라 단추 줄 · 도구 열 · 통계 한 줄도 채팅 칸 폭만큼 왼쪽으로
        const W = main.getBoundingClientRect().right;
        for (const el of main.children) { if (el === root || el.classList.contains('maplibregl-map') || el.classList.contains('sian-split') || el.classList.contains('sian-colh')) continue; const rc = el.getBoundingClientRect(); if (rc.width && rc.width < 700 && rc.right > W - 380) el.style.transform = 'translateX(-380px)'; }
      }
      try { (window.X?.map || window.map)?.resize?.(); } catch { /* */ }
      const b = root.querySelector('.k-chat-b'); if (b) b.scrollTop = id === 'B' ? 0 : b.scrollHeight;
    }, { id, css: CSS[id], dom: DOM[id], badge: badge(id, TITLE[id]) });
    await p.waitForTimeout(900);
    await p.evaluate(() => document.querySelector('.k-main > .k-chat-root[data-dock]')?.removeAttribute('data-fold'));
    await p.screenshot({ path: path.join(OPTS, `sian-${id}-1440.png`) });
    console.log('option', id, 'shot');
  }
  await p.evaluate(() => document.querySelectorAll('.sian-css, .sian-badge, .sian-split, .sian-colh, .sian-more, .sian-grip, .sian-steps').forEach((e) => e.remove()));
}

try {
  if (MODE === 'before' || MODE === 'after') { await staff(MODE); await agency(MODE); }
  else if (MODE === 'options') await staff('opt');
} finally { await browser.close(); }
