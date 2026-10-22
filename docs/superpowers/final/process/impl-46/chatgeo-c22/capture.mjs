/* 바퀴 22 XI ChatGEO 화면 증거 — 바깥 주소 · 로그인 폼(frontDoor) · LX 직원 · 남원 · 광주전남 XI맵
   ⓐ 의심 필지 이름표 · ⓑ 층 저절로 켜기 · ⓒ 범위 줄 · 대화 서랍 지도 강조 켜고 끄기 · 답 글 끌어서 고르기 · 화면 요소 겹침 0(1280 · 1440 · 390)
   node capture.mjs [staff,namwon,gj]   그림은 이 폴더 shots/ 에만(공개 저장소에 올리지 않음) */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
const ROOT = 'E:/Land-XI 플랫폼/01. 디자인';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const SH = path.join(HERE, 'shots'); fs.mkdirSync(SH, { recursive: true });
const { chromium } = createRequire(path.join(ROOT, 'package.json'))('playwright');
const { frontDoor } = await import(pathToFileURL(path.join(ROOT, 'landxi/v3/kit/lint/forbidden.mjs')).href);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const stamp = () => new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Seoul' }).slice(11, 16).replace(':', '');
const WHO = (process.argv[2] || 'staff,namwon,gj').split(',');
const VPS = [['pc1440', 1440, 900], ['pc1280', 1280, 800], ['m390', 390, 844]];
const P = {
  staff: { base: 'https://app.land-xi.dev', login: 'test@lx.or.kr', url: '/landxi/v3/xi-clean/?region=52190',
    asks: [['a', '남원 의심 필지 몇 건이야'], ['c', '남원시 경작지 현황 보여 줘']] },
  namwon: { base: 'https://namwon.land-xi.dev', login: 'lxadmin@lx.or.kr#namwon', site: 'gov', url: '/landxi/v3/xi-clean/?region=52190',
    asks: [['pre', '#ui 농경지 끄기'], ['b', '남원 경작지 면적이 얼마나 돼'], ['a', '우리 시 의심 필지 몇 건이야']] },
  gj: { base: 'https://gwangju-jeonnam.land-xi.dev', login: 'lxadmin@lx.or.kr#gwangju-jeonnam', site: 'gov', url: '/landxi/v3/xi-clean/',
    asks: [['c', '우리 시 해양쓰레기 몇 개야'], ['a', '우리 시 의심 필지 몇 건이야']] },
};
/** 화면 요소 겹침(원칙 309) — 지도 위에 떠 있는 판 · 서랍 · 대화창 · 답 띠 · 도구 열 · 알림 사이 겹친 넓이(px²). 부모-자식은 겹침이 아니다 */
const OVERLAP_SEL = ['.xk-ans:not([hidden])', '.k-chat-root[data-dock] .k-chat-in', '.k-drawer.is-open', '.xo:not([hidden]):not(.pn-collapsed)', '.xo-mini:not([hidden])',
  '.xc-tools', '.xb-hud:not([hidden])', '.xa-card:not([hidden])', '.xc-pop:not([hidden])', '.k-toast.is-on, .k-toast:not([hidden])', '.xe-card:not([hidden])', '.xv-sw:not([hidden])'];
async function overlaps(p) {
  return p.evaluate((sels) => {
    const els = [];
    for (const s of sels) for (const el of document.querySelectorAll(s)) {
      const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
      if (r.width < 4 || r.height < 4 || cs.visibility === 'hidden' || cs.display === 'none' || +cs.opacity < 0.05) continue;
      if (r.bottom <= 0 || r.right <= 0 || r.top >= innerHeight || r.left >= innerWidth) continue;
      els.push({ s, el, r });
    }
    const out = [];
    for (let i = 0; i < els.length; i++) for (let j = i + 1; j < els.length; j++) {
      const a = els[i], b = els[j];
      if (a.el === b.el || a.el.contains(b.el) || b.el.contains(a.el)) continue;
      const w = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left), h = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
      if (w > 2 && h > 2) out.push({ a: a.s, b: b.s, px: Math.round(w * h) });
    }
    return out;
  }, OVERLAP_SEL);
}
async function ask(p, q) {
  const inp = p.locator('.k-chat-root[data-dock] input.k-ck-i').first();
  await inp.waitFor({ timeout: 30000 });
  await inp.click(); await inp.fill(q); await inp.press('Enter');
  const t0 = Date.now();
  await sleep(600);
  await p.waitForFunction(() => { const b = document.querySelector('.k-chat-root[data-dock] .k-ck, .k-ck'); return b && b.dataset.state && b.dataset.state !== 'busy'; }, null, { timeout: 90000 }).catch(() => {});
  await sleep(1800);
  return Date.now() - t0;
}
const band = (p) => p.evaluate(() => {
  const c = document.querySelector('.xk-ans'); if (!c || c.hidden) return null;
  return { scope: c.querySelector('.xk-ans-s:not([hidden])')?.textContent || null, text: c.querySelector('.xk-ans-t')?.textContent || '',
    btns: [...c.querySelectorAll('.xk-ans-a button, .xk-ans-a a')].map((b) => b.textContent.trim()) };
});
const OUT = { at: new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Seoul' }), runs: [] };
const br = await chromium.launch({ channel: 'chrome', headless: true });
for (const who of WHO) {
  const c = P[who];
  for (const [vk, w, h] of VPS) {
    const ctx = await br.newContext({ viewport: { width: w, height: h }, locale: 'ko-KR', ...(w < 500 ? { isMobile: true, hasTouch: true } : {}) });
    const p = await ctx.newPage();
    const rec = { who, vp: vk, errors: [], steps: [] };
    p.on('pageerror', (e) => rec.errors.push('pageerror ' + String(e).slice(0, 160)));
    p.on('console', (m) => { if (m.type() === 'error' && !/favicon|ERR_ABORTED/.test(m.text())) rec.errors.push(m.text().slice(0, 160)); });
    await frontDoor(p, c.base, c.login, c.site);
    await p.goto(c.base + c.url, { waitUntil: 'domcontentloaded' });
    await p.waitForFunction(() => window.__xc && window.__xc.boot && document.querySelector('.k-chat-root[data-dock] input.k-ck-i'), null, { timeout: 60000 }).catch(() => {});
    await sleep(5000);
    rec.steps.push({ id: 'open', overlap: await overlaps(p) });
    for (const [k, q] of c.asks) {
      if (q.startsWith('#ui')) {                          // 층 판에서 경작지(농경지) 결과 층을 끈다 — 물은 종류의 층이 꺼진 채로 묻기(시안 ⓑ-1)
        await p.locator('.xc-tool[data-tool="layers"]').first().click(); await sleep(900);
        const row = p.locator('.xc-row--sub', { hasText: '농경지' }).first();
        const on = await row.count() ? await row.getAttribute('aria-pressed') : null;
        if (on === 'true') { await row.click(); await sleep(700); }
        await p.locator('.xc-tool[data-tool="layers"]').first().click(); await sleep(700);
        rec.steps.push({ id: k, q, ui: { row: on } });
        continue;
      }
      const ms = await ask(p, q);
      const b = await band(p);
      const ov = await overlaps(p);
      const t = stamp();
      const shot = `${who}-${vk}-${k}-${t}.png`;
      if (k !== 'pre') await p.screenshot({ path: path.join(SH, shot) });
      rec.steps.push({ id: k, q, ms, band: b, overlap: ov, shot: k !== 'pre' ? shot : null, at: t });
    }
    // 답 글 끌어서 고르기(복사) — 답 띠 글 처음에서 끝까지 끌기
    const sel = await (async () => {
      const t = p.locator('.xk-ans .xk-ans-t').first();
      if (!(await t.count())) return null;
      const bb = await t.boundingBox(); if (!bb) return null;
      await p.mouse.move(bb.x + 2, bb.y + 6); await p.mouse.down(); await p.mouse.move(bb.x + bb.width - 4, bb.y + bb.height - 6, { steps: 8 }); await p.mouse.up();
      return p.evaluate(() => String(getSelection() || '').trim().slice(0, 80));
    })();
    rec.steps.push({ id: 'select', selected: sel });
    // 대화 서랍 — 지도 강조 켜고 끄기(서랍이 열려 있어도)
    const more = p.locator('.xk-ans .xk-more').first();
    if (await more.count()) {
      await more.click(); await sleep(900);
      const sw = p.locator('.k-drawer.is-open .xk-emph').first();
      const has = await sw.count();
      const st0 = has ? await sw.getAttribute('aria-checked') : null;
      const t = stamp();
      await p.screenshot({ path: path.join(SH, `${who}-${vk}-drawer-on-${t}.png`) });
      const ov = await overlaps(p);
      let st1 = null, tint = null;
      if (has) {
        await sw.click(); await sleep(900);
        st1 = await sw.getAttribute('aria-checked');
        tint = await p.evaluate(() => ({ tint: window.__xc?.tint || null, hl: window.__xc?.hlVisible ?? null }));
        await p.screenshot({ path: path.join(SH, `${who}-${vk}-drawer-off-${t}.png`) });
        await sw.click(); await sleep(500);
      }
      rec.steps.push({ id: 'drawer', switch: !!has, before: st0, after: st1, state: tint, overlap: ov, shot: `${who}-${vk}-drawer-on-${t}.png` });
      await p.keyboard.press('Escape'); await sleep(500);
    }
    OUT.runs.push(rec);
    console.log(JSON.stringify({ who, vk, steps: rec.steps.map((s) => ({ id: s.id, ms: s.ms, scope: s.band?.scope, text: (s.band?.text || '').slice(0, 90), btns: s.band?.btns, ov: (s.overlap || []).length, sel: s.selected, sw: s.switch, b: s.before, a: s.after })), errors: rec.errors.slice(0, 3) }));
    await ctx.close();
  }
}
await br.close();
fs.writeFileSync(path.join(HERE, 'capture.json'), JSON.stringify(OUT, null, 1));
