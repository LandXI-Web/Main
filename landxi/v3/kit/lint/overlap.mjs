/* 화면 요소 겹침 검사(10-22 원칙 309 · FARM-ADMIN-DESIGN §3-3) — "겹치면 안 되는 기본 가이드 … 왜 계속 위반하는 거지?"
   브라우저 안에서 재는 식(MEASURE)과 상태 하나를 만들어 재는 함수(measureState). 검사기 tools/check/overlap.mjs 가 역할 · 폭 · 상태마다 부른다.

   재는 것(떠 있는 요소):
     ① 자리를 선언한 요소 [data-zone]
     ② 이름으로 아는 떠 있는 요소(서랍 · 대화창 · 대화 단추 · 답 띠 · 층 판 · 도구 열 · 결과 카드 · 영상 고르기 · 필지 카드 · 시트 …)
     ③ .k-main 안의 position:absolute|fixed 요소
     — 보이고(폭 · 높이 40px 이상 · 화면 안) · 제외 목록(지도 바탕 · 스크롤 본문 · 레일 · 손잡이 …)이 아닌 것만. 지도 엔진 안 요소는 재지 않는다.
   판정:
     · 떠 있는 요소 둘이 폭 · 높이 모두 4px 넘게 겹치면 '겹침'(조상-자손 쌍 · 같은 묶음 안 요소는 세지 않는다).
     · 화면에 고정된 작은 단추(대화 단추 · 꼬리표)가 그 아래 누르는 것(단추 · 링크 · 입력)이나 글 줄을 4px 넘게 덮으면 '덮음'
       (G8 — "단추가 본문 글 · 단추 위를 떠다닌다"). 지도 · 사진 위는 세지 않는다.
   결과: { vp, boxes[], overlaps[{a,b,w,h,ofSmall,kind}] } — kind = 'pair'(떠 있는 요소끼리) | 'cover'(단추가 글 · 누르는 것을 덮음). */

export const SEL = [
  '[data-zone]', '.k-drawer.is-open', '.k-chat-root:not([data-dock]) .k-chat:not([hidden])', '.k-chat-fab', '.k-chat-tag', '.xk-ans:not([hidden])',
  '.k-chat-root[data-dock] .k-chat-in', '.k-chat-root[data-dock]:not([data-fold]) .k-chat-dlog', '.k-chat-root[data-dock] .k-chat-sugg',
  '.xc-pop:not([hidden])', '.xc-tools', '.xo:not([hidden])', '.xo-mini:not([hidden])', '.xa-card:not([hidden])', '.xc-cmp:not([hidden])',
  '.gx-card', '.gx-cmp', '.gx-cmp-t', '.xn-hud:not([hidden])', '.xe-card:not([hidden])', '.sp-band:not([hidden])', '#det-x:not([hidden])',
  '.gf-sheet', '.k-notify-pop:not([hidden])', '.k-mast', '.t-modal', '.k-sheet:not([hidden])',
];
/* 제외(지도 바탕 · 스크롤 본문 · 레일 · 손잡이 — DESIGN §3-3 · IMPL 0-2). 이것 자체와 그 안은 '떠 있는 요소'로 재지 않는다(②에 이름이 있는 것은 예외) */
export const SKIP = ['.xc-stage', '.xc-fx', '.xc-load', '.xc-b', '.gs-scroll', '.gq-scroll', '.gf-stage', '.k-rail', '.gd-hud', '.gd-open', '.xc-grip',
  '.maplibregl-map', '.k-stage', '.k-ld', '.k-toast', '.k-dev', '[data-lint-skip]', '.k-chat-root'];   // .k-stage = 키트 지도 무대(바탕)   // 대화 묶음 자체(자리 잡기 틀) — 안의 입력 줄 · 답 띠 · 단추는 위 이름으로 잰다
/* 덮음을 재는 고정 단추 */
export const COVERERS = ['.k-chat-fab', '.k-chat-tag'];

/** 브라우저에서 돌리는 식(문자열) — page.evaluate(MEASURE) */
export const MEASURE = `(() => {
  const SEL = ${JSON.stringify(SEL)}, SKIP = ${JSON.stringify(SKIP)}, COV = ${JSON.stringify(COVERERS)};
  const SKIPS = SKIP.join(',');
  const seen = new Set(), items = [];
  const name = (el) => (el.id ? '#' + el.id : '') + (el.classList.length ? '.' + [...el.classList].slice(0, 3).join('.') : el.tagName.toLowerCase()) + (el.dataset.zone ? '[zone=' + el.dataset.zone + ']' : '');
  const vis = (el) => { for (let n = el; n && n !== document.documentElement; n = n.parentElement) { const cs = getComputedStyle(n); if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) return false; } return true; };
  const add = (el, why) => {
    if (!el || seen.has(el)) return; seen.add(el);
    const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
    if (r.width < 40 || r.height < 40 || !vis(el)) return;
    if (r.right <= 0 || r.bottom <= 0 || r.left >= innerWidth || r.top >= innerHeight) return;
    const x = Math.max(0, r.left), y = Math.max(0, r.top), w = Math.min(innerWidth, r.right) - x, h = Math.min(innerHeight, r.bottom) - y;
    items.push({ el, name: name(el), why, x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h), z: cs.zIndex, pos: cs.position });
  };
  for (const s of SEL) for (const el of document.querySelectorAll(s)) add(el, 'sel');
  const main = document.querySelector('.k-main') || document.body;
  for (const el of main.querySelectorAll('*')) {
    if (seen.has(el)) continue;
    const cs = getComputedStyle(el);
    if (cs.position !== 'absolute' && cs.position !== 'fixed') continue;
    if (el.matches(SKIPS) || el.closest(SKIPS)) continue;
    /* 이름 있는 떠 있는 요소 안의 부품(서랍 안 버튼 · 판 안 목록)은 그 요소와 한 묶음 — 따로 재지 않는다 */
    if (el.parentElement && el.parentElement.closest(SEL.join(','))) continue;
    /* 떠 있는 요소가 아닌 것(이름 없는 absolute/fixed 만 — 이름 있는 ②는 늘 잰다):
       · 바탕 — 화면의 절반 넘게 덮는 판(지도 무대 · 스크롤 본문 · 소개 화면 배경 · 덮개 틀)
       · 본문 — 스크롤하는 판 안에서 글과 함께 움직이는 것(맞춤 대시보드 칸 등 · 화면이 아니라 글에 붙어 있다)
       · 꾸밈 — 안에 글도 누르는 것도 없는 그림 · 그늘 · 선(겹쳐 그리는 것이 뜻) */
    { const r = el.getBoundingClientRect(); if (r.width * r.height >= 0.5 * innerWidth * innerHeight) continue; }
    { let sc = false; for (let n = el.parentElement; n && n !== main && n !== document.body; n = n.parentElement) { const c = getComputedStyle(n); if (/(auto|scroll)/.test(c.overflowY) && n.scrollHeight > n.clientHeight + 1) { sc = true; break; } } if (sc) continue; }
    if (!/\\S/.test(el.innerText || '') && !el.querySelector('a[href],button,input,select,textarea,[role=button]')) continue;
    add(el, 'pos');
  }
  /* 면이 있는가(바탕색 · 그림자 · 테두리 · 그림) — 면 없는 틀(투명한 묶음 상자)은 상자가 아니라 안의 글 · 누르는 것 · 그림이 가려질 때만 겹침 */
  const surface = (el) => { const c = getComputedStyle(el); const m = /rgba?\\(([^)]+)\\)/.exec(c.backgroundColor); const al = m ? (m[1].split(',')[3] === undefined ? 1 : parseFloat(m[1].split(',')[3])) : 0;
    return al > 0.05 || c.boxShadow !== 'none' || c.backgroundImage !== 'none' || parseFloat(c.borderTopWidth) > 0 || /^(IMG|CANVAS|SVG|VIDEO)$/i.test(el.tagName); };
  const contentRects = (el) => { const out = []; const rg = document.createRange(); const tw = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const seen = (n) => !n || !n.checkVisibility || n.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true });   // 보이지 않는 글(나타나기 전 · 숨김)은 가려질 것이 없다
    for (let t = tw.nextNode(); t; t = tw.nextNode()) if (/\\S/.test(t.nodeValue) && seen(t.parentElement)) { rg.selectNodeContents(t); out.push(...rg.getClientRects()); }
    for (const c of el.querySelectorAll('a[href],button,input,select,textarea,img,svg,canvas')) if (seen(c)) out.push(c.getBoundingClientRect());
    return out.filter((r) => r.width > 0 && r.height > 0); };
  const hides = (box, el) => contentRects(el).some((r) => Math.min(box.x + box.w, r.right) - Math.max(box.x, r.left) > 4 && Math.min(box.y + box.h, r.bottom) - Math.max(box.y, r.top) > 4);
  const pairs = [];
  for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
    const a = items[i], b = items[j];
    if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
    const ga = a.el.closest('.k-chat-root'), gb = b.el.closest('.k-chat-root');
    if (ga && ga === gb && !ga.dataset.dock) continue;             // 같은 대화 묶음(단추 · 꼬리표 · 창 — 창이 열리면 단추 자리를 덮는 한 부품)
    const ix = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x), iy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
    if (!(ix > 4 && iy > 4)) continue;
    { const sa = surface(a.el), sb = surface(b.el);   // 면 없는 틀은 아무것도 가리지 않는다 — 면 있는 쪽이 다른 쪽의 글 · 누르는 것을 가릴 때만 겹침
      if (!(sa && sb) && !(sa && hides(a, b.el)) && !(sb && hides(b, a.el))) continue; }
    pairs.push({ kind: 'pair', a: a.name, b: b.name, w: ix, h: iy, area: ix * iy, ofSmall: Math.round(100 * ix * iy / Math.min(a.w * a.h, b.w * b.h)) });
  }
  /* 덮음 — 고정 단추가 그 아래 누르는 것 · 글 줄을 덮는가(지도 · 사진 위는 빼기) */
  const CTRL = 'a[href],button,input,select,textarea,summary,[role=button],[role=tab],[role=link]';
  const mapish = (n) => !!(n && n.closest && n.closest('.maplibregl-map, canvas, img, .xc-stage'));
  for (const sel of COV) for (const c of document.querySelectorAll(sel)) {
    const it = items.find((x) => x.el === c); if (!it) continue;
    const hits = new Map();
    const pe = c.style.pointerEvents; c.style.pointerEvents = 'none';
    const root = c.closest('.k-chat-root') || c;
    for (let gx = 1; gx <= 5; gx++) for (let gy = 1; gy <= 5; gy++) {
      const px = it.x + it.w * gx / 6, py = it.y + it.h * gy / 6;
      for (const n of document.elementsFromPoint(px, py)) {
        if (root.contains(n) || n === document.body || n === document.documentElement) continue;
        /* 카드 위에 앉은 단추도 덮음(카드 그림 · 빈 자리 포함 — "대화창과 분석서비스 카드 등이 겹쳐서" 10-22). 떠 있는 판(이름 있는 ②)은 위 짝 검사가 맡는다 */
        const card = n.closest('.t-card, .k-sc, .dg-item');
        if (card && !root.contains(card) && !card.matches(SEL.join(','))) {
          const r = card.getBoundingClientRect();
          if (r.width * r.height < 0.5 * innerWidth * innerHeight) {
            const ix = Math.min(it.x + it.w, r.right) - Math.max(it.x, r.left), iy = Math.min(it.y + it.h, r.bottom) - Math.max(it.y, r.top);
            if (ix > 4 && iy > 4) hits.set(card, { w: Math.round(ix), h: Math.round(iy), t: (card.querySelector('h1,h2,h3,h4')?.textContent || '카드').trim().slice(0, 30) });
            break;
          }
        }
        if (mapish(n)) break;
        const ctl = n.closest(CTRL);
        const txt = !ctl && [...n.childNodes].some((t) => t.nodeType === 3 && /\\S/.test(t.nodeValue)) ? n : null;
        const tgt = ctl || txt;
        if (tgt && !root.contains(tgt)) {
          /* 누르는 것 = 그 상자 · 글 = 실제 글자 줄 상자(문단 상자 전체가 아니라 — 짧은 글 옆 빈 자리는 덮음이 아님) */
          let rs = [tgt.getBoundingClientRect()];
          if (!ctl) { rs = []; const rg = document.createRange(); for (const t of tgt.childNodes) if (t.nodeType === 3 && /\\S/.test(t.nodeValue)) { rg.selectNodeContents(t); rs.push(...rg.getClientRects()); } }
          for (const r of rs) {
            const ix = Math.min(it.x + it.w, r.right) - Math.max(it.x, r.left), iy = Math.min(it.y + it.h, r.bottom) - Math.max(it.y, r.top);
            const o = hits.get(tgt);
            if (ix > 4 && iy > 4 && (!o || ix * iy > o.w * o.h)) hits.set(tgt, { w: Math.round(ix), h: Math.round(iy), t: (tgt.getAttribute('aria-label') || tgt.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 30) });
          }
          break;
        }
        const cs = getComputedStyle(n);
        if (cs.backgroundColor !== 'rgba(0, 0, 0, 0)' && cs.backgroundColor !== 'transparent') break;   // 빈 면(카드 바탕) — 그 아래는 안 보인다
      }
    }
    c.style.pointerEvents = pe;
    for (const [el, v] of hits) pairs.push({ kind: 'cover', a: it.name, b: (el.tagName.toLowerCase() + (el.classList.length ? '.' + [...el.classList].slice(0, 2).join('.') : '')) + (v.t ? ' "' + v.t + '"' : ''), w: v.w, h: v.h, area: v.w * v.h, ofSmall: Math.round(100 * v.w * v.h / (it.w * it.h)) });
  }
  return { vp: [innerWidth, innerHeight], boxes: items.map(({ el, ...r }) => r), overlaps: pairs.sort((p, q) => q.area - p.area) };
})()`;

/** 상태 하나 — 열고 · 누르고 · 기다린 뒤 잰다. st = { name, url, steps: [{click|fill|press|wait|sleep|eval}], wait }
    ctx = { page, base(기관 · 앱 주소), vars({card} 따위 바꿀 값), shot(파일 이름 → 경로 | null) } */
export async function measureState(page, st, { base, vars = {}, shot = null, settle = 1200 } = {}) {
  const sub = (s) => String(s ?? '').replace(/\{(!?)(\w+)\}/g, (m, raw, k) => (k in vars ? (raw ? String(vars[k]) : encodeURIComponent(vars[k])) : m));   // {!k} = 그대로(주소)
  const out = { state: st.name, url: sub(st.url), ok: true, note: '' };
  const t0 = Date.now();
  try {
    if (st.url) await page.goto(new URL(sub(st.url), base).href, { waitUntil: 'domcontentloaded', timeout: 45000 });
    if (st.wait) await page.locator(st.wait).first().waitFor({ timeout: st.timeout || 30000 });
    /* 앞 상태에서 열어 둔 대화 창(사람마다 기억)은 닫고 시작한다 — 상태마다 같은 출발점 */
    await page.evaluate(() => { const x = document.querySelector('.k-chat-root:not([data-dock])[data-open] .k-chat-x, .k-chat-root:not([data-dock]) .k-chat:not([hidden]) .k-chat-x'); x?.click(); }).catch(() => {});
    for (const s of st.steps || []) {
      if (s.click) { const l = page.locator(sub(s.click)).first(); await l.waitFor({ timeout: s.timeout || 20000 }); await l.click(); }
      if (s.fill) { const l = page.locator(sub(s.fill)).first(); await l.waitFor({ timeout: s.timeout || 20000 }); await l.fill(sub(s.text)); }
      if (s.press) await page.keyboard.press(s.press);
      if (s.wait) await page.locator(sub(s.wait)).first().waitFor({ timeout: s.timeout || 30000 });
      if (s.eval) await page.evaluate(s.eval);
      if (s.sleep) await page.waitForTimeout(s.sleep);
      if (s.optional === undefined) await page.waitForTimeout(300);
    }
    await page.waitForTimeout(st.settle ?? settle);
  } catch (e) { out.ok = false; out.note = String(e.message || e).split('\n')[0].slice(0, 200); }
  out.ms = Date.now() - t0;
  try { const m = await page.evaluate(MEASURE); out.boxes = m.boxes; out.overlaps = m.overlaps; out.vp = m.vp; }
  catch (e) { out.ok = false; out.note += ' · 재기 실패 ' + String(e.message || e).slice(0, 120); out.overlaps = []; }
  try { out.hscroll = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth); } catch { /* */ }
  if (shot) { try { const f = shot(st.name); await page.screenshot({ path: f }); out.shot = f.split(/[\\/]/).pop(); } catch { /* */ } }
  return out;
}
