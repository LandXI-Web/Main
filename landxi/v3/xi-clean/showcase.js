/* XI맵 왼쪽 위 결과 표시 — 창의적 콘셉트 셋(10-15 원칙 259 "너무 평범하기도 하고 인터렉티브하지 않다. 창의적인게 필요해")
   보여 줄 것 한 줄: 'Land-XI 가 지금 전국(해외 포함)에서 무엇을 얼마나 찾아냈고, 지금도 찾고 있다' — 숫자 나열이 아니라 체감(Hyper Performance).
     A 지도가 곧 계기판 — 결과가 실제 위치에서 왼쪽 가장자리의 업무 막대로 빛 줄기로 끌려 나온다 · 막대에 올리면 그 업무 결과만 지도에서 떠오름
     B 방금 찾은 것 흐름 — 전국 작업기가 방금 끝낸 읍면동에서 실제 결과 객체 모양이 떠올라 오른쪽 '방금 찾은 것' 무대로 날아와 쌓인다 · 누르면 그 자리로
     C 말을 거는 지도 — 결과가 많은 곳마다 말풍선 질문 후보가 떠오르고, 누르면 XI ChatGEO 가 지도 위 통계(원칙 258)로 답한다
   기본 = '지금 + C'(10-15 원칙 262 사용자: "시안은 지금 + C … A 와 같은 인터렉티브 모습은 괜찮다") — 지금 모양(왼쪽 위 결과 표시)은 그대로 두고 C 말풍선을 얹고,
     A 의 움직임만 가볍게: 왼쪽 위 숫자 · 업무 줄에 올리면 그 업무 결과가 지도에서 떠오르고(그 업무만 남음) 실제 자리에서 빛 줄기가 그 줄로 끌려 나온다. 장식 막대 없음.
   모든 숫자 · 위치 · 객체 = 서버 실제 값(서비스 결과 장부 /ximap/board · 전국 분석 진행 장부 /national/progress · /national/recent · 결과 묶음 지도 조각).
   없는 것만 '예시 동작'. 특정 업무 기본 없음(원칙 237) · 지도 영역 안(원칙 233) · 왼쪽 메뉴 · 채팅 창 그대로(원칙 253) · 지도 위 통계가 열리면 숨는다.
   글자는 토큰 단계만(14px 미만 0) · 밝은 톤 · 탭이 안 보이면 멈춤 · 움직임 줄이기면 움직이지 않음 · 지역 하드코딩 0. */
import { api } from '../kit/util.js';
import { API } from '../../shared/api-v1.js';
import { NCLS } from './national.js';
import { taskOf } from './board.js';

const nf = (n) => Number(n).toLocaleString('ko-KR');
const ev = (e) => (e && typeof e === 'object' ? e.value : e) ?? 0;
const RM = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const hm = (iso) => { if (!iso) return ''; const m = /T(\d\d):(\d\d)/.exec(iso); return m ? `${m[1]}:${m[2]}` : ''; };
const today = (iso) => !!iso && iso.slice(0, 10) === new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' });
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const NAT_Z = 8.2;                                                      // 이보다 멀면 전국, 가까우면 지금 시군구(지금 모양과 같은 경계)
const CELL_N = { 경작지: 'n1', 비닐하우스: 'n2', 건물: 'n3' };

export function createShowcase({ map, host, h, bd, ask, applyTask, taskRows, region, onmapOpen, hud }) {
  const X = (window.__xc ||= {});
  const root = h('section.xs', { hidden: true, 'aria-label': 'AI 분석 결과' });
  host.append(root);
  const SC = { mode: null, raf: 0, timers: new Set(), subs: [] };
  const BD = () => bd();
  const colorOf = (k) => BD()?.colorOf?.(k) || '#5C7CFA';
  const offset = () => { const a = map.getContainer().getBoundingClientRect(), b = host.getBoundingClientRect(); return { x: a.left - b.left, y: a.top - b.top }; };
  const proj = (lngLat) => { const p = map.project(lngLat), o = offset(); return { x: p.x + o.x, y: p.y + o.y }; };
  const live = () => !!SC.mode && !document.hidden && !root.hidden;
  const later = (f, ms) => { const t = setTimeout(() => { SC.timers.delete(t); if (live()) f(); }, ms); SC.timers.add(t); return t; };
  const on = (ev2, f) => { map.on(ev2, f); SC.subs.push(() => map.off(ev2, f)); };
  const national = () => !region() || map.getZoom() < NAT_Z;

  /* ── 실제 위치의 결과 — 서비스 결과 장부(시군구 가운데 · 업무 · 수) + 전국 분석 끝난 읍면동(칸 가운데 · 분류 · 수 · 지금 받은 조각에서) ── */
  function cellsDone() {
    const nat = BD()?.nat, out = [], seen = new Set();
    for (const a of nat?.assets || []) {
      if (!map.getSource(nat.src(a))) continue;
      for (const f of map.querySourceFeatures(nat.src(a), { sourceLayer: 'cells', filter: ['==', ['get', 'done'], 1] })) {
        const p = f.properties, key = a + p.cd; if (seen.has(key)) continue; seen.add(key);
        const c = centroid(f.geometry); if (!c) continue;
        for (const cls of NCLS[a] || []) { const n = Number(p[CELL_N[cls]]) || 0; if (n > 0) out.push({ lngLat: c, n, k: cls, name: `${p.sgg || ''} ${p.name || ''}`.trim(), sgg: p.sgg, cd: p.cd, asset: a }); }
      }
    }
    return out;
  }
  function points() {
    const out = [];
    for (const r of BD()?.data?.regions || []) { if (!r.center) continue; for (const it of r.items) { const n = ev(it.n); if (n > 0) out.push({ lngLat: r.center, n, k: taskOf(it.name), name: r.name, code: r.sgg_cd }); } }
    return out.concat(cellsDone());
  }
  function centroid(g) {
    const rings = g.type === 'Polygon' ? [g.coordinates[0]] : g.type === 'MultiPolygon' ? g.coordinates.map((p) => p[0]) : [];
    let sx = 0, sy = 0, n = 0;
    for (const r of rings) for (const [x, y] of r) { sx += x; sy += y; n++; }
    return n ? [sx / n, sy / n] : null;
  }
  const runningCell = () => {
    const nat = BD()?.nat, r = nat?.running?.(); if (!r) return null;
    const gs = nat.cellGeom(r.asset, r.cd); const c = gs?.length ? centroid(gs[0]) : null;
    return { ...r, lngLat: c };
  };

  /* ═══════════ A · 지도가 곧 계기판 ═══════════ */
  const A = { el: null, svg: null, rows: new Map(), hot: null, lock: null, key: '' };
  function mountA() {
    A.el = h('div.xs-a', { role: 'group', 'aria-label': 'AI 분석 결과' });
    A.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); A.svg.setAttribute('class', 'xs-a-svg'); A.svg.setAttribute('aria-hidden', 'true');
    A.rail = h('div.xs-a-rail');
    A.el.append(A.svg, A.rail);
    root.append(A.el);
    paintA(true);
    on('move', scheduleA); on('moveend', () => { A.key = ''; paintA(); });
    SC.subs.push(() => A.el.remove());
  }
  function scheduleA() { if (A.raf) return; A.raf = requestAnimationFrame(() => { A.raf = 0; drawStreaks(); }); }
  function paintA(first = false) {
    const { title, rows, wait } = taskRows();
    const run = national() ? runningCell() : null;
    const key = [title, JSON.stringify(rows.map((x) => [x.k, x.n])), run?.label, A.hot, A.lock].join('|');
    if (key !== A.key) {
      A.key = key;
      const max = Math.max(1, ...rows.map((x) => x.n));
      const pick = (k) => { A.lock = A.lock === k ? null : k; A.hot = A.lock; applyTask(A.lock); A.key = ''; paintA(); };
      const hover = (k) => { if (A.lock) return; A.hot = k; applyTask(k); A.key = ''; paintA(); };
      A.rail.replaceChildren(
        h('p.xs-a-k', { text: `${title} · AI 분석 결과` }),
        rows.length ? h('ol.xs-a-rows', {}, ...rows.map((x) => h('li', {}, h('button.xs-a-row', { type: 'button', dataset: { k: x.k }, 'aria-pressed': String(A.lock === x.k), class: A.hot && A.hot !== x.k ? 'is-dim' : '',
          onclick: () => pick(x.k), onmouseenter: () => hover(x.k), onmouseleave: () => hover(null), onfocus: () => hover(x.k), onblur: () => hover(null) },
        h('span.xs-a-n', {}, h('i', { style: { background: colorOf(x.k) } }), h('span', { text: x.k })),
        h('b.xs-a-v.num', { text: `${nf(x.n)}${x.unit}` }),
        h('span.xs-a-bar', {}, h('i', { style: { width: `${Math.max(3, (100 * x.n) / max)}%`, background: colorOf(x.k) } })))))) : h('p.xs-a-p', { text: wait ? '불러오는 중' : '분석 예정' }),
        run?.label ? h('p.xs-a-live', {}, h('i'), h('span', { text: `지금 분석 중 · ${run.label}` })) : null);
      if (first && !RM()) { A.rail.querySelectorAll('.xs-a-bar i').forEach((b) => { const w = b.style.width; b.style.width = '0%'; requestAnimationFrame(() => { b.style.width = w; }); }); }
      A.rows = new Map([...A.rail.querySelectorAll('.xs-a-row')].map((b) => [b.dataset.k, b]));
    }
    X.showcase = { ...(X.showcase || {}), mode: 'A', rows: rows.length, hot: A.hot, streaks: A.svg.childElementCount };
    drawStreaks();
  }
  /* 빛 줄기 — 결과가 있는 실제 자리(화면 안)에서 그 업무 막대 끝으로 끌려 나오는 선 · 업무마다 수가 큰 곳 위주 · 한 번에 60개까지 */
  function drawStreaks() {
    if (!A.svg || !A.rail) return;
    const rr = A.rail.getBoundingClientRect(), hr = host.getBoundingClientRect();
    const ends = new Map();
    for (const [k, b] of A.rows) { const r = b.getBoundingClientRect(); ends.set(k, { x: r.right - hr.left + 2, y: r.top - hr.top + r.height / 2 }); }
    const n = streaksInto(A.svg, ends, A.hot, { x: rr.right - hr.left, y: rr.bottom - hr.top }, true);
    if (X.showcase) X.showcase.streaks = n;
  }
  /** 줄기 그리기(A · 지금+C 공용) — ends: 업무 → 끝점(화면 좌표 · '*' = 모든 업무가 한 끝점으로) · hot: 한 업무만(null = 모두) · skip: 이 네모(왼쪽 위 판) 밑 자리는 긋지 않음 · withRun: 돌아가는 칸 고리 */
  function streaksInto(svg, ends, hot, skip, withRun) {
    const W = host.clientWidth, H = host.clientHeight;
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.setAttribute('width', W); svg.setAttribute('height', H);
    const rows = national() ? points() : points().filter((p) => p.code === region()?.code || (p.cd && region() && (p.sgg === region().name)));
    const want = hot ? rows.filter((p) => p.k === hot) : rows;
    const byK = new Map();
    for (const p of want) { if (!ends.has(p.k) && !ends.has('*')) continue; (byK.get(p.k) || byK.set(p.k, []).get(p.k)).push(p); }
    const picked = [];
    const per = hot ? 36 : Math.max(6, Math.floor(60 / Math.max(1, byK.size)));
    for (const [, arr] of byK) { arr.sort((a, b) => b.n - a.n); picked.push(...arr.slice(0, per)); }
    const run = withRun && national() ? runningCell() : null;
    const frag = document.createDocumentFragment();
    let i = 0;
    for (const p of picked) {
      const s = proj(p.lngLat); if (s.x < -20 || s.y < -20 || s.x > W + 20 || s.y > H + 20) continue;
      if (skip && s.x < skip.x + 8 && s.y < skip.y + 8) continue;           // 왼쪽 위 판 밑에 있는 자리는 긋지 않는다
      const e = ends.get(p.k) || ends.get('*'), c1x = s.x - (s.x - e.x) * 0.45, c2x = e.x + 90;
      const d = `M${s.x.toFixed(1)},${s.y.toFixed(1)} C${c1x.toFixed(1)},${s.y.toFixed(1)} ${c2x.toFixed(1)},${e.y.toFixed(1)} ${e.x.toFixed(1)},${e.y.toFixed(1)}`;
      const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      g.setAttribute('class', 'xs-a-st' + (hot === p.k ? ' is-hot' : ''));
      g.style.setProperty('--c', colorOf(p.k));
      g.style.setProperty('--dl', `${((i * 0.37) % 2.2).toFixed(2)}s`);
      g.innerHTML = `<path class="l" d="${d}"/><path class="g" d="${d}"/><path class="b" d="${d}"/><circle class="o" cx="${s.x.toFixed(1)}" cy="${s.y.toFixed(1)}" r="${Math.min(6, 2.2 + Math.log10(p.n + 1) * 0.8).toFixed(1)}"/>`;
      frag.append(g); i++;
    }
    if (run?.lngLat) { const s = proj(run.lngLat); if (s.x > 0 && s.y > 0 && s.x < W && s.y < H) { const g = document.createElementNS('http://www.w3.org/2000/svg', 'g'); g.setAttribute('class', 'xs-a-run'); g.innerHTML = `<circle class="r1" cx="${s.x.toFixed(1)}" cy="${s.y.toFixed(1)}" r="6"/><circle class="r2" cx="${s.x.toFixed(1)}" cy="${s.y.toFixed(1)}" r="6"/>`; frag.append(g); } }
    svg.replaceChildren(frag);
    return i;
  }

  /* ═══════════ 지금 + C(기본 · 원칙 262 → 10-17 원칙 271) — 왼쪽 위 한 줄(app.js .xb-hud) + C 말풍선. 지도 위 움직이는 선(빛 줄기)은 없앴다
     (10-17 사용자: "인터렉티브하게 움직이는 선은 없애고"). 왼쪽 위에 올려도 지도는 바뀌지 않는다. */
  function mountNow() {
    mountC();
    X.showcase = { ...(X.showcase || {}), mode: 'now', hot: null, streaks: 0 };
  }
  function drawN() { if (X.showcase) { X.showcase.hot = null; X.showcase.streaks = 0; } }

  /* ═══════════ B · 방금 찾은 것 흐름 ═══════════ */
  const B = { el: null, fx: null, feed: null, big: null, q: [], shown: [], seen: new Set(), count: 0, target: 0, todayCells: 0, example: false, pollT: 0, glyphs: new Map(), last: null };
  function mountB() {
    B.el = h('section.xs-b.t-card.t-card--map', { 'aria-live': 'polite', 'aria-label': '방금 찾은 것' });
    B.fx = h('div.xs-b-fx', { 'aria-hidden': 'true' });
    B.big = h('b.num', { text: '0' });
    B.head = h('header.xs-b-h', {}, h('p.xs-b-t', { text: '방금 찾은 것' }), h('p.xs-b-big', {}, h('span', { text: '오늘' }), B.big, h('small', { text: '개' })), h('p.xs-b-sub', { text: '불러오는 중' }));
    B.feed = h('ol.xs-b-feed');
    B.live = h('p.xs-b-live', { hidden: true }, h('i'), h('span'));
    B.el.append(B.head, B.feed, B.live);
    root.append(B.fx, B.el);
    SC.subs.push(() => { B.el.remove(); B.fx.remove(); clearTimeout(B.pollT); B.q = []; });
    loadB(true);
    on('move', () => { if (B.ripple) B.ripple.remove(); });
    document.addEventListener('visibilitychange', B.vis = () => { if (!document.hidden && SC.mode === 'B') { loadB(); stepB(); } });
    SC.subs.push(() => document.removeEventListener('visibilitychange', B.vis));
  }
  async function loadB(first = false) {
    const j = await api('/national/recent?n=12').catch(() => null);
    if (!j?.items) {
      if (first) { B.example = true; B.el.dataset.example = '1'; B.head.querySelector('.xs-b-sub').textContent = '예시 동작 · 서비스 결과 장부에서'; B.head.querySelector('.xs-b-big').hidden = true;
        // 진행 장부를 못 읽으면 서비스 결과 장부(시군구 · 업무 · 수)로 같은 움직임만 보인다(지어낸 숫자 0 · '예시 동작' 표시)
        B.q = (BD()?.data?.regions || []).filter((r) => r.center && r.items.length).slice(0, 8).map((r) => ({ cd: r.sgg_cd, name: r.name, sgg: r.sido, center: r.center, at: r.last_at, counts: Object.fromEntries(r.items.slice(0, 2).map((it) => [taskOf(it.name), { n: ev(it.n), unit: it.unit || '개' }])) })).reverse();
        stepB(); }
      return;
    }
    B.todayCells = ev(j.today?.cells); B.target = ev(j.today?.n);
    const fresh = j.items.filter((it) => !B.seen.has(it.asset + it.cd + it.at)).reverse();   // 오래된 것부터 차례로 날아온다(방금 끝난 순서 그대로)
    if (first) {
      // 오늘 합계는 아직 날아오지 않은 오늘 칸만큼 덜어 두고, 칸이 날아올 때마다 오른다 → 다 오면 서버 값과 같다(숫자 한 출처)
      const pending = fresh.filter((it) => today(it.at)).reduce((t, it) => t + Object.values(it.counts).reduce((a, c) => a + c.n, 0), 0);
      B.count = Math.max(0, B.target - pending);
      B.big.textContent = nf(B.count);
      B.head.querySelector('.xs-b-sub').textContent = B.todayCells ? `오늘 끝난 읍면동 ${nf(B.todayCells)}곳` : '오늘 끝난 읍면동 없음 · 최근 결과';
    }
    for (const it of fresh) { B.seen.add(it.asset + it.cd + it.at); B.q.push(it); }
    if (!B.stepping) stepB();
    clearTimeout(B.pollT); B.pollT = setTimeout(() => { if (live() && SC.mode === 'B') loadB(); }, 30000);
    paintLive();
  }
  function paintLive() {
    const r = national() ? runningCell() : null;
    B.live.hidden = !r?.label; if (r?.label) B.live.lastElementChild.textContent = `지금 분석 중 · ${r.label}`;
    if (B.runPulse) { B.runPulse.remove(); B.runPulse = null; }
    if (r?.lngLat && !RM()) { const s = proj(r.lngLat); B.runPulse = h('i.xs-b-run', { style: { left: `${s.x}px`, top: `${s.y}px` } }); B.fx.append(B.runPulse); }
  }
  async function stepB() {
    if (B.stepping || !B.q.length || !live() || SC.mode !== 'B') { if (!B.q.length) B.stepping = false; return; }
    B.stepping = true;
    const it = B.q.shift();
    await arrive(it).catch(() => {});
    B.stepping = false;
    if (B.q.length) later(stepB, B.q.length > 6 ? 900 : 2200);
    if (SC.mode === 'B') X.showcase = { ...(X.showcase || {}), mode: 'B', shown: B.shown.length, today: B.count, queue: B.q.length, example: B.example };
  }
  /* 한 읍면동이 도착한다 — 그 자리에서 물결 + 실제 객체 모양이 떠올라 무대로 날아오고, 카드가 쌓이며 오늘 수가 오른다 */
  async function arrive(it) {
    const shapes = it.set ? await glyphs(it).catch(() => []) : [];
    const n = Object.values(it.counts).reduce((a, c) => a + c.n, 0);
    const card = cardB(it, shapes);
    const s = it.center ? proj(it.center) : null;
    const inView = s && s.x > 0 && s.y > 0 && s.x < host.clientWidth && s.y < host.clientHeight;
    B.feed.prepend(card);
    while (B.feed.children.length > 6) B.feed.lastElementChild.remove();
    B.shown.unshift(it); B.shown.length = Math.min(B.shown.length, 6);
    if (inView && !RM()) {
      const rip = h('i.xs-b-rip', { style: { left: `${s.x}px`, top: `${s.y}px`, color: colorOf(Object.keys(it.counts)[0] || '건물') } });
      B.fx.append(rip); B.ripple = rip; later(() => rip.remove(), 1500);
      card.classList.add('is-wait');
      const slots = [...card.querySelectorAll('.xs-b-g svg')];
      const hr = host.getBoundingClientRect();
      await Promise.all((shapes.length ? slots : [null]).map((slot, i) => new Promise((done) => {
        const g = slot ? slot.cloneNode(true) : h('i.xs-b-dot', { style: { background: colorOf(Object.keys(it.counts)[0] || '건물') } });
        const fly = h('div.xs-b-fly', {}, g); B.fx.append(fly);
        const to = slot ? slot.getBoundingClientRect() : card.getBoundingClientRect();
        const tx = to.left - hr.left + (slot ? 0 : 20), ty = to.top - hr.top + (slot ? 0 : 20);
        const dx = (i - (slots.length - 1) / 2) * 14;
        const an = fly.animate([
          { transform: `translate(${s.x + dx - 18}px,${s.y - 18}px) scale(.2)`, opacity: 0 },
          { transform: `translate(${s.x + dx - 18}px,${s.y - 30}px) scale(1.15)`, opacity: 1, offset: 0.28 },
          { transform: `translate(${tx}px,${ty}px) scale(1)`, opacity: 1 }], { duration: 1100 + i * 90, delay: i * 70, easing: 'cubic-bezier(.3,.7,.2,1)', fill: 'forwards' });
        an.onfinish = () => { fly.remove(); done(); };
      })));
      card.classList.remove('is-wait');
    }
    card.classList.add('is-in');
    if (!B.example && today(it.at)) tick(n);
    B.last = it;
  }
  function tick(n) {
    const from = B.count, to = Math.min(B.target || from + n, from + n); B.count = to;
    if (RM()) { B.big.textContent = nf(to); return; }
    const t0 = performance.now(), D = 700;
    const f = () => { const t = clamp((performance.now() - t0) / D, 0, 1), e = 1 - Math.pow(1 - t, 3); B.big.textContent = nf(Math.round(from + (to - from) * e)); if (t < 1 && live()) requestAnimationFrame(f); else B.big.textContent = nf(to); };
    requestAnimationFrame(f);
  }
  function cardB(it, shapes) {
    const cls = Object.entries(it.counts);
    const main = cls[0]?.[0];
    const el = h('li.xs-b-it', {}, h('button', { type: 'button', 'aria-label': `${it.sgg || ''} ${it.name} 그 자리로`, onclick: () => flyB(it) },
      h('span.xs-b-g', { style: { color: colorOf(main || '건물') } }, ...(shapes.length ? shapes.map((d) => { const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); s.setAttribute('viewBox', '0 0 40 40'); s.innerHTML = `<path d="${d}"/>`; return s; }) : [h('i.xs-b-dot', { style: { background: colorOf(main || '건물') } })])),
      h('span.xs-b-tx', {}, h('b', {}, h('span', { text: `${it.sgg ? it.sgg + ' ' : ''}${it.name}` }), hm(it.at) ? h('time', { text: hm(it.at) }) : null),
        h('small', { text: cls.map(([k, c]) => `${k} ${nf(c.n)}${c.unit}`).join(' · ') }))));
    return el;
  }
  function flyB(it) {
    if (!it.center) return;
    const to = 12.5;
    BD()?.nat?.warm?.({ lng: it.center[0], lat: it.center[1] }, to);
    if (RM()) map.jumpTo({ center: it.center, zoom: to }); else map.flyTo({ center: it.center, zoom: to, speed: 1.1, curve: 1.42, essential: false });
  }
  /* 실제 객체 모양 — 그 읍면동 결과 묶음의 지도 조각(줌 13 · 가운데 한 조각)에서 큰 것 넷(40×40 안에 비율대로) */
  async function glyphs(it) {
    const key = it.set + '|' + it.v;
    if (B.glyphs.has(key)) return B.glyphs.get(key);
    const want = new Set(NCLS[it.asset] || Object.keys(it.counts));
    const out = [];
    // 칸 가운데 한 조각(줌 13) → 비어 있으면 결과 묶음 범위 가운데(줌 12) 한 번 더
    const tries = [[13, it.center], it.bounds ? [12, [(it.bounds[0] + it.bounds[2]) / 2, (it.bounds[1] + it.bounds[3]) / 2]] : null].filter(Boolean);
    for (const [z, [lng, lat]] of tries) {
      const n2 = 2 ** z, tx = Math.floor(((lng + 180) / 360) * n2), ty = Math.floor(((1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2) * n2);
      const r = await fetch(`${API.base}/tiles/mvt/${it.set}/${z}/${tx}/${ty}.pbf?v=${it.v}`, { credentials: 'same-origin' });
      if (!r.ok || r.status === 204) continue;
      const rings = mvtRings(new Uint8Array(await r.arrayBuffer()), 'results', (p) => !p.cls || want.has(p.cls));
      rings.sort((a, b) => b.area - a.area);
      for (const rg of rings.slice(0, 4)) out.push(glyphPath(rg.pts));
      if (out.length) break;
    }
    B.glyphs.set(key, out);
    return out;
  }
  function glyphPath(pts) {
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const [x, y] of pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    const s = 32 / Math.max(1, x1 - x0, y1 - y0), ox = (40 - (x1 - x0) * s) / 2, oy = (40 - (y1 - y0) * s) / 2;
    return pts.map(([x, y], i) => `${i ? 'L' : 'M'}${((x - x0) * s + ox).toFixed(1)},${((y - y0) * s + oy).toFixed(1)}`).join('') + 'Z';
  }

  /* ═══════════ C · 말을 거는 지도 ═══════════ */
  const C = { marks: [], key: '', t: 0, busy: null };
  function mountC() {
    C.el = h('div.xs-c', { 'aria-hidden': 'true' }); root.append(C.el);
    paintC();
    on('moveend', () => { clearTimeout(C.t); C.t = setTimeout(paintC, 260); });
    on('movestart', () => { C.el.classList.add('is-moving'); });
    on('moveend', () => { C.el.classList.remove('is-moving'); });
    SC.subs.push(() => { clearC(); C.el.remove(); });
  }
  function clearC() { for (const m of C.marks) m.remove(); C.marks = []; }
  /* 질문 후보 — 결과가 많은 곳마다 하나(서비스 결과 장부 · 전국 분석 칸 · 지금 분석 중) · 화면 안 · 서로 겹치지 않게 · 다섯까지 */
  function candidates() {
    const out = [];
    if (national()) {
      const regs = (BD()?.data?.regions || []).filter((r) => r.center && ev(r.n) > 0).sort((a, b) => ev(b.n) - ev(a.n));
      regs.slice(0, 6).forEach((r, i) => {
        const top = r.items[0] ? taskOf(r.items[0].name) : null;
        out.push({ lngLat: r.center, q: i % 2 === 0 ? `${r.name} 현황 보여 줘` : top ? `${r.name} ${top} 어디가 많아?` : `${r.name} 현황 보여 줘`, k: top, w: ev(r.n), id: 'r' + r.sgg_cd });
      });
      if (regs.length >= 2) out.push({ lngLat: [(regs[0].center[0] + regs[1].center[0]) / 2, (regs[0].center[1] + regs[1].center[1]) / 2], q: `${regs[0].name} ${regs[1].name} 비교해 줘`, k: null, w: ev(regs[0].n) * 0.9, id: 'cmp' });
      // 전국 분석 칸 — 시군구마다 합쳐 비닐하우스 · 건물이 많은 곳
      const bySgg = new Map();
      for (const c of cellsDone()) { if (!c.sgg) continue; const o = bySgg.get(c.sgg) || { sgg: c.sgg, n: 0, byK: {}, sx: 0, sy: 0, m: 0 }; o.n += c.n; o.byK[c.k] = (o.byK[c.k] || 0) + c.n; o.sx += c.lngLat[0]; o.sy += c.lngLat[1]; o.m++; bySgg.set(c.sgg, o); }
      [...bySgg.values()].sort((a, b) => b.n - a.n).slice(0, 5).forEach((o, i) => {
        const ks = Object.entries(o.byK).sort((a, b) => b[1] - a[1]), k = ks[i % ks.length]?.[0] || ks[0]?.[0];
        out.push({ lngLat: [o.sx / o.m, o.sy / o.m], q: k ? `${o.sgg} ${k} 어디가 많아?` : `${o.sgg} 현황 보여 줘`, k, w: o.n * 0.6, id: 'n' + o.sgg });
      });
      const run = runningCell();
      if (run?.lngLat) out.push({ lngLat: run.lngLat, q: '전국 분석 얼마나 진행됐어?', k: null, w: Infinity, id: 'run', live: true });
    } else {
      const r = region(), { rows } = taskRows();
      const b = r.bbox || [map.getBounds().getWest(), map.getBounds().getSouth(), map.getBounds().getEast(), map.getBounds().getNorth()];
      const at = (fx, fy) => [b[0] + (b[2] - b[0]) * fx, b[1] + (b[3] - b[1]) * fy];
      const qs = [[`${r.name} 현황 보여 줘`, null, 0.5, 0.62], ...rows.slice(0, 2).map((x, i) => [`${r.name} ${x.k} 어디가 많아?`, x.k, 0.28 + i * 0.44, 0.4]), [`${r.name} 농지 이용 실태 어때?`, null, 0.5, 0.2], [`${r.name} 지목별 공시지가 통계`, null, 0.74, 0.74]];
      qs.forEach(([q, k, fx, fy], i) => out.push({ lngLat: at(fx, fy), q, k, w: 10 - i, id: 'q' + i }));
    }
    return out;
  }
  /** 떠 있는 것(서랍 · 도구 판 · 통계 판 · 한 줄 · 분석 요청 칸 · 채팅 · 도구 열 · 왼쪽 위 한 줄) 자리 — 말풍선이 그 밑에 깔리지 않게(10-17 원칙 279 · 꼬리표와 같은 규칙) */
  function blockers() {
    const hr = host.getBoundingClientRect(), out = [];
    for (const el of host.querySelectorAll('.xo:not([hidden]):not(.pn-collapsed), .xo-mini:not([hidden]), .k-drawer.is-open, .xc-tools, .xc-top, .xb-hud:not([hidden]), .xa-card:not([hidden]), .xc-pop:not([hidden]), .k-chat-root[data-dock] .k-chat-in, .k-chat-root[data-dock]:not([data-fold]) .k-chat-dlog, .k-chat-root[data-dock] .k-chat-sugg')) {
      const r = el.getBoundingClientRect(); if (r.width < 2 || r.height < 2) continue;
      out.push({ x0: r.left - hr.left - 8, y0: r.top - hr.top - 8, x1: r.right - hr.left + 8, y1: r.bottom - hr.top + 8 });
    }
    return out;
  }
  const covered = (B, s) => B.some((b) => s.x > b.x0 - 150 && s.x < b.x1 + 150 && s.y > b.y0 && s.y < b.y1 + 62);   // 말풍선 상자(폭 ≤ 300 · 높이 ~58 · 점 위)
  function paintC() {
    if (!C.el) return;
    const W = host.clientWidth, H = host.clientHeight, B = blockers();
    const cs = candidates().map((c) => ({ ...c, s: proj(c.lngLat) })).filter((c) => c.s.x > 120 && c.s.x < W - 130 && c.s.y > 110 && c.s.y < H - 150 && !covered(B, c.s)).sort((a, b) => b.w - a.w);
    const keep = [];
    for (const c of cs) { if (keep.length >= 5) break; if (keep.some((k) => Math.abs(k.s.x - c.s.x) < 220 && Math.abs(k.s.y - c.s.y) < 56)) continue; keep.push(c); }
    const key = keep.map((c) => c.id + c.q).join('|');
    if (key === C.key) return;
    C.key = key; clearC();
    keep.forEach((c, i) => {
      const el = h('button.xs-c-bub', { type: 'button', class: c.live ? 'is-live' : '', onclick: () => askC(el, c.q) },
        c.k ? h('i', { style: { background: colorOf(c.k) } }) : c.live ? h('i.xs-c-live') : null, h('span', { text: c.q }));
      el.style.setProperty('--dl', `${(i * 0.13).toFixed(2)}s`); el.style.setProperty('--bob', `${(2.8 + (i % 3) * 0.5).toFixed(1)}s`);
      const m = new window.maplibregl.Marker({ element: el, anchor: 'bottom', offset: [0, -14] }).setLngLat(c.lngLat).addTo(map);
      C.marks.push(m);
    });
    X.showcase = { ...(X.showcase || {}), mode: SC.mode, bubbles: keep.map((c) => c.q) };
  }
  function askC(el, q) {
    if (C.busy) return;
    C.busy = el; el.classList.add('is-ask');
    for (const m of C.marks) if (m.getElement() !== el) m.getElement().classList.add('is-dim');
    ask(q);
    const back = () => { C.busy = null; for (const m of C.marks) m.getElement().classList.remove('is-ask', 'is-dim'); };
    const f = () => { if (onmapOpen()) { back(); document.removeEventListener('kit:agent-action-done', f); } };
    document.addEventListener('kit:agent-action-done', f);
    later(() => { back(); document.removeEventListener('kit:agent-action-done', f); }, 25000);
  }

  /* ── 바꾸기 ── */
  function set(mode) {
    if (SC.mode === mode) return;
    for (const f of SC.subs) f(); SC.subs = [];
    for (const t of SC.timers) clearTimeout(t); SC.timers.clear();
    if (A.lock || A.hot) { A.lock = A.hot = null; applyTask(null); }
    A.el = A.svg = A.rail = null; B.el = null; C.el = null; C.key = ''; A.key = '';
    SC.mode = mode || null;
    root.hidden = !SC.mode; root.dataset.mode = SC.mode || '';
    X.showcase = { mode: SC.mode };
    if (SC.mode === 'A') mountA(); else if (SC.mode === 'B') mountB(); else if (SC.mode === 'C') mountC(); else if (SC.mode === 'now') mountNow();
  }
  /** 숫자(장부)가 바뀌면 다시 그린다 — 보드 다시 읽기 · 지역 바뀜 */
  let refT = 0;
  function refresh() { if (!SC.mode || refT) return; refT = requestAnimationFrame(() => { refT = 0; if (SC.mode === 'A') { A.key = ''; paintA(); } else if (SC.mode === 'B') paintLive(); else if (SC.mode === 'C') { C.key = ''; paintC(); } else if (SC.mode === 'now') { C.key = ''; paintC(); drawN(); } }); }
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
  host.addEventListener('xc:layout', refresh);   // 지도 위 배치가 바뀌면(서랍 · 통계 판 · 채팅 답) 말풍선 자리 다시(app.js layoutNow)
  // on = 지금 모양을 걷는 시안(A · B · C 단독)인가 — '지금 + C'(기본)는 지금 모양 위에 얹으므로 false
  return { set, refresh, get on() { return !!SC.mode && SC.mode !== 'now'; }, get mode() { return SC.mode; } };
}

/* ── 지도 조각(MVT) 읽기 — 한 층의 면 고리만(화면에 그릴 모양 · 속성은 cls 만 본다) ── */
function mvtRings(u8, layerName, keep) {
  let p = 0;
  const varint = () => { let r = 0, s = 0, b; do { b = u8[p++]; r += (b & 0x7f) * 2 ** s; s += 7; } while (b & 0x80); return r; };
  const skip = (t) => { if (t === 0) varint(); else if (t === 1) p += 8; else if (t === 2) p += varint(); else if (t === 5) p += 4; };
  const sub = () => { const n = varint(), s = p; p += n; return [s, p]; };
  const str = ([s, e]) => new TextDecoder().decode(u8.subarray(s, e));
  const out = [];
  const end = u8.length;
  while (p < end) {
    const key = varint(), f = key >> 3, t = key & 7;
    if (f !== 3) { skip(t); continue; }
    const [ls, le] = sub(), save = p; p = ls;
    let name = '', extent = 4096; const keys = [], vals = [], feats = [];
    while (p < le) {
      const k2 = varint(), f2 = k2 >> 3, t2 = k2 & 7;
      if (f2 === 1) name = str(sub());
      else if (f2 === 3) keys.push(str(sub()));
      else if (f2 === 4) { const [vs, ve] = sub(); const q = p; p = vs; let v = null; while (p < ve) { const k3 = varint(), f3 = k3 >> 3, t3 = k3 & 7; if (f3 === 1) v = str(sub()); else if (t3 === 0) v = varint(); else skip(t3); } vals.push(v); p = q; }
      else if (f2 === 5) extent = varint();
      else if (f2 === 2) feats.push(sub());
      else skip(t2);
    }
    if (name === layerName) {
      for (const [fs, fe] of feats) {
        p = fs; let type = 0; const tags = {}; let geom = null;
        while (p < fe) {
          const k4 = varint(), f4 = k4 >> 3, t4 = k4 & 7;
          if (f4 === 3) type = varint();
          else if (f4 === 2) { const [a, b] = sub(); const q = p; p = a; const tv = []; while (p < b) tv.push(varint()); p = q; for (let i = 0; i + 1 < tv.length; i += 2) tags[keys[tv[i]]] = vals[tv[i + 1]]; }
          else if (f4 === 4) geom = sub();
          else skip(t4);
        }
        if (type !== 3 || !geom || !keep(tags)) continue;
        p = geom[0]; let x = 0, y = 0, ring = null;
        const zz = (v) => (v % 2 ? -(v + 1) / 2 : v / 2);
        while (p < geom[1]) {
          const c = varint(), id = c & 7, n = c >> 3;
          if (id === 1) { for (let i = 0; i < n; i++) { x += zz(varint()); y += zz(varint()); ring = [[x, y]]; } }
          else if (id === 2) { for (let i = 0; i < n; i++) { x += zz(varint()); y += zz(varint()); ring?.push([x, y]); } }
          else if (id === 7 && ring && ring.length > 2) { let a = 0; for (let i = 0; i < ring.length; i++) { const [x1, y1] = ring[i], [x2, y2] = ring[(i + 1) % ring.length]; a += x1 * y2 - x2 * y1; } if (a > 0) out.push({ pts: ring.map(([px, py]) => [(px / extent) * 40, (py / extent) * 40]), area: a }); ring = null; }
        }
      }
    }
    p = save;
  }
  return out;
}
