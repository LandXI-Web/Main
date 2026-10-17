/* XI맵 통계 '지도 위' 표출(10-15 원칙 258 — "XI 맵은 지도 기반으로 표출되어야 한다 … 지도 위에서 동적/인터렉티브로") · 기본.
   같은 사양(XI ChatGEO ximap_dash 도구 · /ximap/agg 집계)을 화면 전환 없이 지도 자체가 답이 되게 그린다:
     ① 읍면동 · 시군구가 값에 따라 단계 색으로 차오름(작은 값 → 큰 값 순서로 채워짐)
     ② 값이 큰 곳 다섯에 숫자 꼬리표가 떠오름(1위는 짙게)
     ③ 순위 1~3 곳으로 카메라가 차례로 날아가며 그 곳이 빛나고 숫자가 뜸(지도를 잡으면 멈춤 · 탭이 안 보이면 멈춤)
     ④ 차트는 지도 오른쪽 가장자리의 작은 떠 있는 판(접고 펼침) — 판 막대에 올리면 지도 그 곳이 떠오르고, 지도에 올리면 판 막대가 강조
     ⑤ 두 지역 비교는 평균과 다른 곳이 빛남 · '보고서로'는 판 머리에서
   가시화 규칙 · 색 척도 뜻(원칙 245)은 서버 사양 그대로(수 = 청록 · ㎢당 = 주황 · 비율 = 보라 · 의심 = 빨강 · 넓이/지가 = 파랑 · 평균 대비 = 발산).
   숫자 = 사양 값 그대로(지어낸 숫자 0) · 글자 = 토큰 단계만(14px 미만 0) · 지역 하드코딩 0. 대시보드(dash.js)는 그대로 두고 단추로 되돌릴 수 있다.
   단계(10-15 원칙 262 "대시보드를 원치 않을 수 있고. 지도에 가시화되어서 보기만 하고 싶어할수도"): 1 = 지도에만(차오름 · 꼬리표 · 날아가기 + 한 줄) → 2 = '통계 보기'(오른쪽 판) → 3 = '크게 보기'(대시보드 · app.js). 단계마다 되돌아감.
   판 폭은 왼쪽 가장자리를 끌어 바꾸고 접고 펼친다(공용 부품 kit/panes.js · 원칙 263) — 접힘 = 1단계 한 줄. */
import { api } from '../kit/util.js';
import { panes } from '../kit/panes.js';
import { RAMP, colorOf, rampFor, scaleHtml, catColor } from './dash.js';

const nf = (v, d = 0) => (v == null || Number.isNaN(Number(v)) ? '—' : Number(v).toLocaleString('ko-KR', { maximumFractionDigits: Math.max(0, Math.min(3, d | 0)), minimumFractionDigits: 0 }));
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const RM = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const sleep = (ms) => new Promise((r) => setTimeout(r, RM() ? 0 : ms));
const ease = (t) => 1 - Math.pow(1 - Math.max(0, Math.min(1, t)), 3);
const catFor = (hue) => { const r = RAMP[hue] || RAMP.teal, acc = hue === 'orange' ? RAMP.teal[4] : RAMP.orange[4]; return [r[5], r[3], acc, '#6B7684', r[1], '#9AA4B0', '#C4CAD2', '#DDE1E6']; };
const hueOf = (s) => s.map?.scale?.hue || (s.panels || []).find((p) => p.scale?.hue)?.scale.hue || 'teal';
const tipAttr = (label, val) => `data-tip="${esc(`<b>${esc(label)}</b> ${val}`)}"`;

/* ── 작은 판 차트(판 폭 328 기준 · 값 글자는 잉크 · 색은 표시에만) ── */
const MAXR = 6;                                                     // 판에서 먼저 보이는 줄 수 · 나머지는 '더 보기'
function rowsBar(rows, p, opt = {}) {
  const mx = Math.max(1, ...rows.map((r) => r.v || 0));
  return `<div class="xo-rows${opt.rank ? ' is-rank' : ''}">${rows.map((r, i) => `<button type="button" class="xo-r${i >= MAXR ? ' more' : ''}" data-k="${esc(r.k)}" ${tipAttr(r.label, nf(r.v, p.d || 0) + (p.unit || ''))}>
      ${opt.rank ? `<i class="i num">${i + 1}</i>` : ''}<span class="n">${esc(r.label)}</span><b class="v num">${nf(r.v, p.d || 0)}</b>${opt.extra && r[opt.extra.key] != null ? `<small class="e num">${esc(opt.extra.label)} ${nf(r[opt.extra.key], 1)}</small>` : ''}
      <span class="bar"><i style="width:${(100 * (r.v || 0)) / mx}%"></i></span></button>`).join('')}</div>${rows.length > MAXR ? `<button type="button" class="xo-more">${rows.length - MAXR}곳 더 보기</button>` : ''}`;
}
function bar(p) { return rowsBar(p.rows || [], p); }
function rank(p) { return rowsBar(p.rows || [], p, { rank: true, extra: p.extra }); }
function hist(p) {
  const b = p.bins || [], mx = Math.max(1, ...b.map((x) => x.v || 0)), r = RAMP.blue;
  return `<div class="xo-hist">${b.map((x, i) => `<div class="xo-hc" ${tipAttr(x.label, nf(x.v) + (p.unit || ''))}><span class="t num">${nf(x.v)}</span><i style="height:${Math.max(2, (100 * (x.v || 0)) / mx)}%;background:${r[Math.min(6, 2 + i)]}"></i><span class="x">${esc(x.label)}</span></div>`).join('')}</div>`;
}
function donut(p, CAT) {
  const rows = (p.rows || []).filter((r) => r.v > 0), tot = rows.reduce((s, r) => s + r.v, 0) || 1;
  const R = 40, C = 2 * Math.PI * R; let off = 0;
  const segs = rows.map((r, i) => { const len = (r.v / tot) * C; const s = `<circle r="${R}" cx="50" cy="50" fill="none" stroke="${catColor(r.label, CAT[i % CAT.length])}" stroke-width="11" stroke-dasharray="${Math.max(0, len - 2)} ${C}" stroke-dashoffset="${-off}" ${tipAttr(r.label, `${nf(r.v, p.d || 0)}${p.unit || ''} · ${nf((r.v / tot) * 100, 1)}%`)}/>`; off += len; return s; }).join('');
  return `<div class="xo-donut"><svg viewBox="0 0 100 100" aria-hidden="true"><g transform="rotate(-90 50 50)">${segs}</g></svg>
    <ul class="xo-leg">${rows.slice(0, 6).map((r, i) => `<li data-k="${esc(r.k)}"><i style="background:${catColor(r.label, CAT[i % CAT.length])}"></i><span>${esc(r.label)}</span><b class="num">${nf((r.v / tot) * 100, 1)}%</b></li>`).join('')}</ul></div>`;
}
function stack(p, CAT) {
  const rows = (p.rows || []).slice(0, 8), ser = p.series || [], mx = Math.max(1, ...rows.map((r) => r.vals.reduce((s, v) => s + (v || 0), 0)));
  return `<ul class="xo-leg xo-leg--row">${ser.map((s, i) => `<li><i style="background:${catColor(s, CAT[i % CAT.length])}"></i><span>${esc(s)}</span></li>`).join('')}</ul>
    <div class="xo-rows">${rows.map((r) => { const t = r.vals.reduce((s, v) => s + (v || 0), 0); return `<button type="button" class="xo-r" data-k="${esc(r.k)}"><span class="n">${esc(r.label)}</span><b class="v num">${nf(t)}</b><span class="bar is-st" style="width:${(100 * t) / mx}%">${r.vals.map((v, i) => (v ? `<i style="flex:${v};background:${catColor(ser[i], CAT[i % CAT.length])}" ${tipAttr(`${r.label} · ${ser[i]}`, nf(v) + (p.unit || ''))}></i>` : '')).join('')}</span></button>`; }).join('')}</div>`;
}
function heat(p) {
  const cols = (p.cols || []).slice(0, 6), rows = (p.rows || []).slice(0, 8), r = RAMP[p.scale?.hue] || RAMP.teal;
  const cmax = cols.map((_, j) => Math.max(1, ...rows.map((x) => x.vals[j] || 0)));
  const mixc = (t) => { t = Math.max(0, Math.min(1, t)); const q = t * (r.length - 1), i = Math.min(r.length - 2, Math.floor(q)); return i < 0 ? r[0] : r[i + (q - i > 0.5 ? 1 : 0)]; };
  return `<div class="xo-heat" style="--c:${cols.length}"><span></span>${cols.map((c) => `<span class="ch">${esc(String(c).replace(/\(.*\)$/, ''))}</span>`).join('')}
    ${rows.map((rw) => `<button type="button" class="rh" data-k="${esc(rw.k)}">${esc(rw.label)}</button>${rw.vals.slice(0, cols.length).map((v, j) => `<span class="cell" style="background:${v ? mixc(0.1 + 0.85 * Math.sqrt(v / cmax[j])) : '#F2F4F6'}" ${tipAttr(`${rw.label} · ${cols[j]}`, nf(v))}></span>`).join('')}`).join('')}</div><p class="xo-note">업무마다 많은 칸이 짙습니다 · 올리면 숫자</p>`;
}
function line(p) {
  const pts = p.points || []; if (pts.length < 2) return '';
  const W = 328, H = 120, L = 48, B = 22, T = 10, R = 10, c = (RAMP[p.scale?.hue] || RAMP.teal)[4];
  const vs = pts.map((x) => x.v), hi = Math.max(...vs) || 1;
  const X = (i) => L + (i / (pts.length - 1)) * (W - L - R), Y = (v) => T + (1 - v / hi) * (H - T - B);
  const path = pts.map((x, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(x.v).toFixed(1)}`).join('');
  const lab = (x) => (p.grain === 'hour' ? x.t.slice(11, 16) : p.grain === 'day' ? x.t.slice(5, 10) : x.t);
  return `<svg class="xo-line" viewBox="0 0 ${W} ${H}"><line x1="${L}" x2="${W - R}" y1="${H - B}" y2="${H - B}" class="g"/><text x="${L - 6}" y="${T + 6}" text-anchor="end" class="ax num">${nf(hi)}</text>
    <path d="${path}L${X(pts.length - 1)},${H - B}L${L},${H - B}Z" fill="${c}" fill-opacity=".08"/><path d="${path}" fill="none" stroke="${c}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
    <circle cx="${X(pts.length - 1)}" cy="${Y(vs[vs.length - 1])}" r="4" fill="${c}" stroke="#fff" stroke-width="2"/>
    <text x="${L}" y="${H - 6}" class="ax">${esc(lab(pts[0]))}</text><text x="${W - R}" y="${H - 6}" text-anchor="end" class="ax">${esc(lab(pts[pts.length - 1]))}</text>
    ${pts.map((x, i) => `<rect x="${X(i) - (W - L - R) / pts.length / 2}" y="${T}" width="${(W - L - R) / pts.length}" height="${H - T - B}" fill="transparent" ${tipAttr(lab(x), nf(x.v) + (p.unit || ''))}/>`).join('')}</svg>`;
}
function scatter(p) {
  const pts = p.pts || []; if (!pts.length) return '';
  const W = 328, H = 150, L = 44, B = 22, T = 10, R = 10, xh = Math.max(...pts.map((q) => q.x)) || 1, yh = Math.max(...pts.map((q) => q.y)) || 1;
  const X = (v) => L + (v / xh) * (W - L - R), Y = (v) => T + (1 - v / yh) * (H - T - B);
  const k = pts.reduce((s, q) => s + q.y, 0) / (pts.reduce((s, q) => s + q.x, 0) || 1), x2 = Math.min(xh, yh / (k || 1));
  return `<svg class="xo-sc" viewBox="0 0 ${W} ${H}"><line x1="${L}" x2="${W - R}" y1="${H - B}" y2="${H - B}" class="g"/><line x1="${L}" x2="${L}" y1="${T}" y2="${H - B}" class="g"/><line x1="${X(0)}" y1="${Y(0)}" x2="${X(x2)}" y2="${Y(k * x2)}" class="avg"/>
    <text x="${L - 5}" y="${T + 6}" text-anchor="end" class="ax num">${nf(yh)}</text><text x="${W - R}" y="${H - 6}" text-anchor="end" class="ax num">${nf(xh, 1)}${esc(p.x?.unit || '')}</text>
    ${pts.map((q) => `<circle class="pk" data-k="${esc(q.k)}" cx="${X(q.x)}" cy="${Y(q.y)}" r="5.5" fill="${q.y > k * q.x ? RAMP.orange[4] : RAMP.teal[4]}" stroke="#fff" stroke-width="1.5" ${tipAttr(q.label, `${esc(p.x?.label || '')} ${nf(q.x, 2)}${esc(p.x?.unit || '')} · ${nf(q.y)}${esc(p.y?.unit || '')}`)}/>`).join('')}</svg>
    <p class="xo-note"><i class="dot o"></i>넓이에 비해 많은 곳 <i class="dot t"></i>적은 곳 · 선 = 평균</p>`;
}
function table(p) {
  const num = new Set(p.num || []);
  return `<div class="xo-tw"><table class="xo-tb"><thead><tr>${p.cols.map((c, i) => `<th${num.has(i) ? ' class="num"' : ''}>${esc(c)}</th>`).join('')}</tr></thead><tbody>${(p.rows || []).slice(0, 10).map((r) => `<tr>${r.map((c, i) => `<td${num.has(i) ? ' class="num"' : ''}>${typeof c === 'number' ? nf(c, i === 3 ? 1 : 0) : esc(c ?? '—')}</td>`).join('')}</tr>`).join('')}</tbody></table></div>${p.dl ? '<button type="button" class="xo-dl">내려받기</button>' : ''}`;
}
const DRAW = { bar, rank, hist, donut, stack, heat, line, scatter, table };

const legend = (sc, unit) => scaleHtml(sc, unit, 'xo');
/** 지도 위 통계 면 진하기 — 차오름 t × 줌(원래 식) × 사람이 고른 진하기 k */
function fillOp(k = 1) {
  const T = ['coalesce', ['feature-state', 't'], 0], ON = ['boolean', ['feature-state', 'on'], false], r = (x) => +(x * k).toFixed(3);
  return ['interpolate', ['linear'], ['zoom'], 8, ['*', T, ['case', ON, r(0.95), r(0.84)]], 12.5, ['*', T, ['case', ON, r(0.7), r(0.46)]]];
}
/** 색 점(지도 색 띠의 색 다섯 · 바꾸면 바로) */
const dotCss = (sc) => { const r = rampFor(sc?.hue), cs = [r[2], r[4], r[6]]; return `background:conic-gradient(${cs.map((c, i) => `${c} ${i * 120}deg ${(i + 1) * 120}deg`).join(', ')})`; };
/** 가장 큰 고리의 무게중심(꼬리표 자리) */
function centroid(g) {
  if (!g) return null;
  const rings = g.type === 'Polygon' ? [g.coordinates[0]] : g.type === 'MultiPolygon' ? g.coordinates.map((p) => p[0]) : [];
  let best = null, bestA = -1;
  for (const r of rings) {
    let a = 0, cx = 0, cy = 0;
    for (let i = 0, n = r.length - 1; i < n; i++) { const f = r[i][0] * r[i + 1][1] - r[i + 1][0] * r[i][1]; a += f; cx += (r[i][0] + r[i + 1][0]) * f; cy += (r[i][1] + r[i + 1][1]) * f; }
    if (Math.abs(a) > bestA) { bestA = Math.abs(a); best = a ? [cx / (3 * a), cy / (3 * a)] : r[0]; }
  }
  return best;
}
const bboxOf = (fs) => { let w = 180, s = 90, e = -180, n = -90; const walk = (c) => (typeof c[0] === 'number' ? (w = Math.min(w, c[0]), e = Math.max(e, c[0]), s = Math.min(s, c[1]), n = Math.max(n, c[1])) : c.forEach(walk)); fs.forEach((f) => f.geometry && walk(f.geometry.coordinates)); return w < e ? [w, s, e, n] : null; };

/* ═══ 지도 위 표출 ═══ */
export function createOnMap({ map, stage, host, h, sggFC, onEnter, onLeave, onShown, onStep, onColor = null, opacity = () => 1, clsColor = null }) {
  const O = { on: false, step: 1, sync: false, spec: null, fc: null, sel: null, hover: null, bb: null, feats: [], tags: new Map(), hoverTag: null, cand: [], run: 0, tour: null, CAT: [] };
  const panel = h('section.xo', { hidden: true, 'aria-label': '지도 위 통계' });
  const mini = h('div.xo-mini', { hidden: true, role: 'status', 'aria-label': '지도 위 결과' });   // 1단계 한 줄(제목 · 큰 숫자 · '통계 보기' · 닫기)
  const mean = h('div.xo-mean', { hidden: true, role: 'status' });
  const tipEl = h('div.xo-tip', { hidden: true, role: 'tooltip' });
  host.append(panel, mini, mean); document.body.append(tipEl);
  const padR = () => (O.step === 2 ? (panel.offsetWidth || 360) + 96 : 0);   // 2단계: 판 + 오른쪽 도구 열 만큼 지도 카메라를 왼쪽으로 · 1단계: 지도 전체
  /* 판 폭 끌기 · 접기(공용 부품 panes · 사람 · 화면별 기억) — 접으면 1단계(한 줄) · 펼치면 2단계. 프로그램이 바꿀 때(sync)는 되돌이 없음 */
  let pn = null;
  function ensurePane() {
    if (pn) return pn;
    pn = panes(panel, { edge: 'left', key: 'ximap.stats', min: 320, max: 720, otherMin: 560, cssVar: '--xo-w', varHost: host, host, container: host, map, label: '통계 판 크기',
      onChange: (_size, c) => {
        if (O.sync || !O.on) return;
        if (c && O.step === 2) setStep(1); else if (!c && O.step === 1) setStep(2);
        else if (O.step === 2) { clearTimeout(padT); padT = setTimeout(() => { if (O.on && O.step === 2) stage.pad({ right: padR() }); }, 160); }   // 끌어 넓히면 지도 가운데도 그만큼 왼쪽으로(10-17 칸조절 2)
      } });
    return pn;
  }
  let padT = 0;
  function paintMini(s) {
    const main = (s.kpis || [])[0] || s.main || {};
    mini.replaceChildren(h('b.t', { text: s.title || '' }), h('span.v.num', {}, document.createTextNode(nf(main.value, main.d || 0)), h('small', { text: main.unit || '' })),
      h('button.xo-mini-b', { type: 'button', text: '통계 보기', onclick: () => setStep(2) }), h('button.xo-x', { type: 'button', 'aria-label': '닫기', text: '×', onclick: () => leave() }));
  }
  /** 1 ↔ 2 단계 — 1 = 판 접힘 + 한 줄 · 2 = 판 펼침. 3(대시보드)은 app.js 가 맡는다(onStep) */
  function setStep(n, { silent = false } = {}) {
    if (n === 3) { onStep?.(3); return; }
    O.step = n === 2 ? 2 : 1;
    O.sync = true;
    try { const p = ensurePane(); if (O.step === 2) p.expand(); else p.collapse(); } finally { O.sync = false; }
    mini.hidden = O.step !== 1;
    stage.pad(O.step === 2 ? { right: padR() } : {});
    if (window.__xc?.dash) window.__xc.dash.step = O.step;
    if (!silent) onStep?.(O.step);
  }

  function tip(e, html) { if (!html) { tipEl.hidden = true; return; } tipEl.innerHTML = html; tipEl.hidden = false; tipEl.style.left = Math.min(e.clientX + 14, innerWidth - tipEl.offsetWidth - 12) + 'px'; tipEl.style.top = Math.max(8, e.clientY - tipEl.offsetHeight - 10) + 'px'; }
  panel.addEventListener('mousemove', (e) => { const t = e.target.closest('[data-tip]'); tip(e, t ? t.dataset.tip : null); });
  panel.addEventListener('mouseleave', () => { tip(null, null); hover(null, 'panel'); });
  panel.addEventListener('mouseover', (e) => { const t = e.target.closest('[data-k]'); if (t && O.spec?.map) hover(t.dataset.k, 'panel'); });
  panel.addEventListener('click', (e) => {
    const more = e.target.closest('.xo-more'); if (more) { more.previousElementSibling.classList.add('all'); more.remove(); return; }
    const hd = e.target.closest('.xo-ph'); if (hd) { hd.parentElement.classList.toggle('open'); hd.setAttribute('aria-expanded', String(hd.parentElement.classList.contains('open'))); return; }
    const t = e.target.closest('[data-k]'); if (t && O.spec?.map && O.fc?.features.some((f) => f.properties.k === t.dataset.k)) { stopTour(); pick(t.dataset.k); }
  });

  function ensureLayers() {
    if (map.getSource('xo-f')) return;
    map.addSource('xo-f', { type: 'geojson', data: { type: 'FeatureCollection', features: [] }, promoteId: 'k' });
    const T = ['coalesce', ['feature-state', 't'], 0], ON = ['boolean', ['feature-state', 'on'], false];
    const k = opacity();                                                    // 사람이 고른 투명도(색 바꾸기 · 원칙 264 — 1 = 원래)
    map.addLayer({ id: 'xo-fill', type: 'fill', source: 'xo-f', paint: { 'fill-color': ['coalesce', ['get', 'col'], '#E5E8EB'],
      'fill-opacity': fillOp(k) } });   // zoom 은 맨 바깥(스타일 규칙) · 차오름 t × 가까이 갈수록 옅게(결과가 비침)
    map.addLayer({ id: 'xo-glow', type: 'line', source: 'xo-f', paint: { 'line-color': ['coalesce', ['get', 'col'], '#2E9A90'], 'line-width': 12, 'line-blur': 8, 'line-opacity': ['coalesce', ['feature-state', 'g'], 0] } });
    map.addLayer({ id: 'xo-line', type: 'line', source: 'xo-f', paint: { 'line-color': '#FFFFFF', 'line-width': ['case', ON, 3, 1], 'line-opacity': ['*', T, 0.95] } });
    map.on('click', 'xo-fill', (e) => { if (!O.on) return; const k = e.features?.[0]?.properties?.k; if (k) { stopTour(); pick(k, true); } });
    map.on('mousemove', 'xo-fill', (e) => { if (!O.on) return; map.getCanvas().style.cursor = 'pointer'; const k = e.features?.[0]?.properties?.k; if (k) hover(k, 'map'); });
    map.on('mouseleave', 'xo-fill', () => { map.getCanvas().style.cursor = ''; hover(null, 'map'); });
    for (const ev of ['mousedown', 'wheel', 'touchstart']) map.on(ev, () => stopTour());
  }
  /** 사람이 바꾼 지도 색 다시 칠하기 — 면 · 척도 띠 · 판 카드(막대 색 · 범주 점) · 색 점. 판을 새로 그리지 않는다(열린 색 칸이 붙어 있게) */
  function recolor() {
    if (map.getLayer('xo-fill')) map.setPaintProperty('xo-fill', 'fill-opacity', fillOp(opacity()));
    const s = O.spec; if (!O.on || !s) return;
    const m = s.map;
    if (m) {
      for (const f of O.feats) f.properties.col = f.properties.v == null ? '#E5E8EB' : colorOf(m.scale, f.properties.v);
      map.getSource('xo-f')?.setData(O.fc);
      const old = panel.querySelector('.xo-mp > div'); if (old) old.outerHTML = legend(m.scale, m.unit);
      panel.querySelector('.xo-cd')?.setAttribute('style', dotCss(m.scale));
    }
    // 지도 위 꼬리표의 색 점도 바로(클래스 색 · 지도 색)
    const paintDot = (t, k) => { const f = O.fc?.features.find((x) => x.properties.k === k); const i = t.getElement().querySelector('.xo-tag-c'); const c = f && tagDot(f); if (i && c) i.style.background = c; };
    for (const [k, t] of O.tags) paintDot(t, k);
    if (O.hoverTag && O.hover) paintDot(O.hoverTag, O.hover);
    const vars = (hue) => { const r = rampFor(hue); return `--xo-c0:${r[6]};--xo-c1:${r[5]};--xo-c3:${r[3]}`; };
    panel.querySelectorAll('.xo-p').forEach((el) => {
      const p = s.panels?.[Number(el.dataset.i)]; if (!p) return;
      el.style.cssText = el.style.cssText.replace(/--xo-c0:[^;]+;--xo-c1:[^;]+;--xo-c3:[^;]+/, vars(p.scale?.hue || hueOf(s)));
      const pb = el.querySelector('.xo-pb'); if (pb && (p.type === 'donut' || p.type === 'stack')) pb.innerHTML = (DRAW[p.type])(p, O.CAT);
    });
  }
  const fstate = (k, s) => { try { map.setFeatureState({ source: 'xo-f', id: k }, s); } catch { /* 층 없음 */ } };

  /* 꼬리표(HTML 마커) — 값 큰 곳 다섯(겹치지 않게 화면 거리 96px 이상 · 지도를 움직이면 다시 고름) + 올린 곳 하나.
     마커 요소(.xo-mk)는 지도가 자리를 잡고, 안쪽(.xo-tag)만 떠오름 · 강조 변형을 한다(지도 변형과 겹치지 않게) */
  /** 꼬리표 색 점(10-17 꼬리표-색점 '넣음') — 한 업무(클래스) 통계면 그 클래스 색(사람이 고른 색 · kit/colors.js 상태), 모든 업무면 그 곳의 지도 색. 색을 바꾸면 recolor 가 바로 다시 칠한다 */
  const tagCls = () => (O.spec?.kind === 'task' && O.spec.main?.label) || (O.spec?.means || []).find(([k, v]) => k === '업무' && v && v !== '모든 업무')?.[1] || null;
  const tagDot = (f) => { const k = tagCls(); return (k && clsColor?.(k)) || f.properties.col || null; };
  function mkTag(f, cls) {
    const m = O.spec.map, v = f.properties.v;
    const dot = tagDot(f);
    const inner = h('div.xo-tag' + (cls ? '.' + cls : ''), { html: `<span class="n">${dot ? `<i class="xo-tag-c" style="background:${esc(dot)}"></i>` : ''}${esc(f.properties.name)}</span><b class="num">${v == null ? '—' : `${nf(Number(v), m.scale?.kind === 'div' ? 1 : v % 1 ? 1 : 0)}<small>${esc(m.unit || '')}</small>`}</b>` });
    inner.addEventListener('click', () => { stopTour(); pick(f.properties.k, true); });
    const c = centroid(f.geometry); if (!c) return null;
    return new maplibregl.Marker({ element: h('div.xo-mk', {}, inner), anchor: 'bottom', offset: [0, -6] }).setLngLat(c).addTo(map);
  }
  const tagEl = (t) => t.getElement().firstElementChild;
  function clearTags() { for (const t of O.tags.values()) t.remove(); O.tags.clear(); if (O.hoverTag) { O.hoverTag.remove(); O.hoverTag = null; } O.cand = []; }
  /** 후보(상위 12) 중 화면에서 겹치지 않는 다섯 — 강제(keep)는 늘 넣는다 */
  function placeTags(keep) {
    if (!O.on || !O.cand.length) return;
    const pts = [], pick = [];
    const kf = keep && O.cand.find((f) => f.properties.k === keep), kc = kf && centroid(kf.geometry);
    if (kc) { pts.push(map.project(kc)); pick.push(kf); }                 // 지금 날아간 곳 · 고른 곳은 먼저(겹치는 다른 꼬리표가 가리지 않게)
    for (const f of O.cand) {
      if (f === kf) continue;
      const c = centroid(f.geometry); if (!c) continue;
      const q = map.project(c);
      if (pick.length >= 5) break;
      if (pts.some((o) => Math.hypot(o.x - q.x, o.y - q.y) < 96)) continue;
      pts.push(q); pick.push(f);
    }
    const want = new Set(pick.map((f) => f.properties.k));
    for (const [k, t] of O.tags) if (!want.has(k)) { t.remove(); O.tags.delete(k); }
    pick.forEach((f, i) => {
      if (O.tags.has(f.properties.k)) return;
      const t = mkTag(f, f === O.cand[0] ? 'is-1' : ''); if (!t) return;
      tagEl(t).style.animationDelay = `${RM() ? 0 : i * 110}ms`;
      if (f.properties.k === O.sel) tagEl(t).classList.add('is-on');
      O.tags.set(f.properties.k, t);
    });
    if (O.hoverTag && O.tags.has(O.hover)) { O.hoverTag.remove(); O.hoverTag = null; }
  }
  function showTags(cand) { clearTags(); O.cand = cand; placeTags(); }
  let moveT = 0;
  map.on('moveend', () => { if (!O.on) return; clearTimeout(moveT); moveT = setTimeout(() => placeTags(O.tour?.k || O.sel), 120); });
  function hover(k, from) {
    if (O.hover === k) return;
    if (O.hover && O.hover !== O.sel) fstate(O.hover, { on: false });
    O.hover = k;
    if (k) fstate(k, { on: true });
    panel.querySelectorAll('[data-k]').forEach((el) => el.classList.toggle('hv', !!k && el.dataset.k === k));
    for (const [tk, t] of O.tags) tagEl(t).classList.toggle('is-hv', tk === k);
    if (O.hoverTag) { O.hoverTag.remove(); O.hoverTag = null; }
    if (k && !O.tags.has(k)) { const f = O.fc?.features.find((x) => x.properties.k === k); if (f) O.hoverTag = mkTag(f, 'is-hover'); }
    if (from === 'map' && k) { const el = panel.querySelector(`.open [data-k="${CSS.escape(k)}"]`); el?.scrollIntoView({ block: 'nearest', behavior: 'auto' }); }
  }
  function pick(k, fromMap) {
    const same = O.sel === k && !fromMap;
    if (O.sel) fstate(O.sel, { on: false, g: 0 });
    O.sel = same ? null : k;
    if (O.sel) fstate(O.sel, { on: true, g: 0.7 });
    panel.querySelectorAll('[data-k]').forEach((el) => el.classList.toggle('on', !!O.sel && el.dataset.k === O.sel));
    for (const [tk, t] of O.tags) tagEl(t).classList.toggle('is-on', tk === O.sel);
    const f = O.sel && O.fc?.features.find((x) => x.properties.k === O.sel);
    const b = f ? bboxOf([f]) : O.bb;
    if (b) stage.go(b, { ms: RM() ? 0 : 1100, maxZoom: f ? (O.spec?.map?.level === 'sgg' ? 10.5 : 12.8) : (O.spec?.map?.level === 'sgg' ? 9 : 11.5), pitch: 0 });
    if (fromMap && O.sel) panel.querySelector(`.open [data-k="${CSS.escape(O.sel)}"]`)?.scrollIntoView({ block: 'nearest', behavior: RM() ? 'auto' : 'smooth' });
  }

  /* ① 차오름 — 작은 값부터 큰 값 순서로 t: 0 → 1 */
  function fillUp(feats, run) {
    return new Promise((res) => {
      const ord = [...feats].sort((a, b) => (a.properties.v ?? -1) - (b.properties.v ?? -1));
      const n = ord.length || 1, span = Math.min(1100, 300 + n * 6), dur = 520;
      if (RM()) { for (const f of ord) fstate(f.properties.k, { t: 1 }); res(); return; }
      const t0 = performance.now();
      (function step(now) {
        if (run !== O.run) { res(); return; }
        const el = now - t0; let done = true;
        ord.forEach((f, i) => { const s = (i / n) * span, t = ease((el - s) / dur); if (t < 1) done = false; fstate(f.properties.k, { t }); });
        if (done) res(); else requestAnimationFrame(step);
      })(t0);
    });
  }
  /* ③ 순위 돌아보기 — 1~3위로 날아가며 그 곳이 빛나고 숫자가 뜸 */
  function stopTour() { if (O.tour) { O.tour.stop = true; O.tour = null; panel.querySelector('.xo-tour')?.classList.remove('is-run'); } }
  async function tour(top) {
    stopTour();
    const T = { stop: false }; O.tour = T; panel.querySelector('.xo-tour')?.classList.add('is-run');
    const lvl = O.spec?.map?.level, z = lvl === 'sgg' ? 9.6 : 12.2;
    const vis = () => new Promise((r) => { if (document.visibilityState !== 'hidden') return r(); const f = () => { document.removeEventListener('visibilitychange', f); r(); }; document.addEventListener('visibilitychange', f); });
    const off = [-Math.round(padR() / 2), 0];
    for (const f of top) {
      if (T.stop) break;
      await vis(); if (T.stop) break;
      const c = centroid(f.geometry); if (!c) continue;
      T.k = f.properties.k; fstate(f.properties.k, { on: true, g: 0.8 }); placeTags(f.properties.k); tagEl(O.tags.get(f.properties.k))?.classList.add('is-on');
      panel.querySelectorAll('[data-k]').forEach((el) => el.classList.toggle('on', el.dataset.k === f.properties.k));
      if (RM()) map.jumpTo({ center: c, zoom: z }); else { map.flyTo({ center: c, zoom: z, offset: off, duration: 1500, essential: true }); await sleep(1500); }
      if (T.stop) { fstate(f.properties.k, { on: false, g: 0 }); break; }
      await sleep(900);
      fstate(f.properties.k, { on: false, g: 0 }); T.k = null; const te = O.tags.get(f.properties.k); if (te) tagEl(te).classList.remove('is-on');
      panel.querySelectorAll('[data-k].on').forEach((el) => el.classList.remove('on'));
    }
    if (!T.stop && O.bb) await stage.go(O.bb, { ms: RM() ? 0 : 1500, maxZoom: lvl === 'sgg' ? 9 : 11.5, pitch: 0 });
    if (O.tour === T) { O.tour = null; panel.querySelector('.xo-tour')?.classList.remove('is-run'); }
    if (window.__xc?.dash) window.__xc.dash.tour = T.stop ? 'stopped' : 'done';
  }

  async function paintMap(m) {
    ensureLayers();
    let feats = [];
    if (m?.level === 'emd' && m.sgg) {
      const fc = await api(`/regions/${m.sgg}/emd`).catch(() => null);
      feats = (fc?.features || []).map((f) => ({ type: 'Feature', geometry: f.geometry, properties: { k: f.properties.emd_cd, name: f.properties.name || f.properties.emd_nm || '' } }));
    } else if (m?.level === 'sgg') {
      const want = new Set(Object.keys(m.values || {}));
      for (const f of sggFC()?.features || []) {
        const k = String(f.properties.codes || f.properties.code).split(',').find((c) => want.has(c));
        if (k) feats.push({ type: 'Feature', geometry: f.geometry, properties: { k, name: f.properties.name } });
      }
    }
    for (const f of feats) { const v = m?.values?.[f.properties.k]; f.properties.v = v ?? null; f.properties.col = v == null ? '#E5E8EB' : colorOf(m.scale, v); if (!f.properties.name) f.properties.name = m?.labels?.[f.properties.k] || ''; fstate(f.properties.k, { t: 0, on: false, g: 0 }); }
    O.fc = { type: 'FeatureCollection', features: feats }; O.feats = feats;
    map.getSource('xo-f').setData(O.fc);
    O.bb = bboxOf(feats.filter((f) => f.properties.v != null)) || bboxOf(feats);
  }
  const topOf = (n) => O.feats.filter((f) => f.properties.v != null).sort((a, b) => (O.spec?.map?.scale?.kind === 'div' ? Math.abs(b.properties.v) - Math.abs(a.properties.v) : b.properties.v - a.properties.v)).slice(0, n);

  /* ④ 작은 판 — 머리(제목 · 큰 숫자 · 보조 숫자 · 색 척도 · XI ChatGEO 한두 줄 · 단추) + 차트 카드(접고 펼침) */
  function render(s) {
    O.CAT = catFor(hueOf(s));
    const [k0, ...kr] = s.kpis || [];
    const m = s.map, main = k0 || s.main || {};
    const head = `<div class="xo-card xo-head"><div class="xo-ht"><h2>${esc(s.title)}</h2><button type="button" class="xo-x" aria-label="닫기">×</button></div>
      <p class="xo-l">${esc(main.label || '')}</p><p class="xo-big"><b class="num">${nf(main.value, main.d || 0)}</b><small>${esc(main.unit || '')}</small></p>
      ${kr.length ? `<div class="xo-kp">${kr.slice(0, 3).map((k) => `<div><span>${esc(k.label)}</span><b class="num">${nf(k.value, k.d || 0)}<small>${esc(k.unit || '')}</small></b></div>`).join('')}</div>` : ''}
      ${m ? `<div class="xo-mp"><span class="t">${onColor ? `<button type="button" class="xo-cd" aria-haspopup="dialog" aria-expanded="false" aria-label="지도 색" title="색" style="${dotCss(m.scale)}"></button>` : ''}지도 색 · ${esc(m.title)}</span>${legend(m.scale, m.unit)}</div>` : ''}
      ${s.live ? `<p class="xo-live"><i></i>지금 분석 중 · ${esc(s.live)}</p>` : ''}
      ${s.note ? `<p class="xo-notice">${esc(s.note)}</p>` : ''}
      ${(s.say || []).length ? `<div class="xo-say"><span class="xo-logo">XI</span><div>${s.say.slice(0, 2).map((l) => `<p>${esc(l)}</p>`).join('')}</div></div>` : ''}
      <div class="xo-act">${m ? '<button type="button" class="xo-tour"><i></i><span class="a">순위 돌아보기</span><span class="b">멈추기</span></button>' : ''}<button type="button" class="xo-rep">보고서로</button><button type="button" class="xo-big2">크게 보기</button><button type="button" class="xo-only">지도만</button></div></div>`;
    const vars = (hue) => { const r = rampFor(hue); return `--xo-c0:${r[6]};--xo-c1:${r[5]};--xo-c3:${r[3]}`; };
    const cards = (s.panels || []).map((p, i) => `<div class="xo-card xo-p xo-p--${p.type}${i < 2 ? ' open' : ''}" data-i="${i}" style="animation-delay:${RM() ? 0 : 80 + i * 70}ms;${vars(p.scale?.hue || hueOf(s))}"><button type="button" class="xo-ph" aria-expanded="${i < 2}"><span>${esc(p.title)}</span>${p.unit ? `<small>${esc(p.unit)}</small>` : ''}<i></i></button><div class="xo-pb">${(DRAW[p.type] || (() => ''))(p, O.CAT)}</div></div>`);
    panel.innerHTML = head + cards.join('');
    panel.querySelector('.xo-x').onclick = () => leave();
    panel.querySelector('.xo-cd')?.addEventListener('click', (e) => onColor?.(e.currentTarget, m));
    panel.querySelector('.xo-tour')?.addEventListener('click', () => (O.tour ? stopTour() : tour(topOf(3))));
    panel.querySelector('.xo-rep')?.addEventListener('click', (e) => report(s, e.currentTarget));
    panel.querySelector('.xo-big2')?.addEventListener('click', () => setStep(3));
    panel.querySelector('.xo-only')?.addEventListener('click', () => setStep(1));
    panel.querySelectorAll('.xo-p').forEach((el) => { const p = s.panels[Number(el.dataset.i)]; if (p?.type === 'table' && p.dl) el.querySelector('.xo-dl')?.addEventListener('click', () => csv(p.dl, p.cols, p.rows)); });
    panel.scrollTop = 0;
  }
  function csv(name, cols, rows) {
    const body = [cols.join(','), ...rows.map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(','))].join('\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + body], { type: 'text/csv' })); a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }
  /** '보고서로' — 같은 사양 · 같은 숫자를 한글 문서(.hwpx)로(원칙 247 · 250) */
  async function report(s, b) {
    if (b.disabled) return;
    const t0 = b.textContent; b.disabled = true; b.textContent = '만드는 중';
    try {
      const r = await api('/ximap/report.hwpx', { method: 'POST', body: { spec: s }, raw: true });
      if (!r.ok) throw new Error('http ' + r.status);
      const cd = r.headers.get('content-disposition') || '', mm = /filename\*=UTF-8''([^;]+)/i.exec(cd);
      const name = mm ? decodeURIComponent(mm[1]) : `${String(s.title || '통계').replace(/[\/:*?"<>|\s·—]+/g, '_')}_보고서.hwpx`;
      const u = URL.createObjectURL(await r.blob());
      const a = document.createElement('a'); a.href = u; a.download = name; document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(u), 4000);
      b.textContent = '내려받았습니다';
    } catch { b.textContent = '내려받지 못했습니다'; }
    setTimeout(() => { b.textContent = t0; b.disabled = false; }, 1600);
  }
  /** 뜻 확인(지역 · 업무 · 비교 → 융합 재료 ✓) — 아래 채팅 창 위 한 줄 · 짧게 */
  async function confirmMeaning(s) {
    mean.innerHTML = `<div class="a">${(s.means || []).map(([k, v]) => `<span><em>${esc(k)}</em>${esc(v)}</span>`).join('')}</div><div class="b">${(s.fuse || []).map((f) => `<span>${esc(f)}</span>`).join('')}</div>`;
    mean.hidden = false; requestAnimationFrame(() => mean.classList.add('in'));
    await sleep(320);
    for (const el of mean.querySelectorAll('.b span')) { el.classList.add('ok'); await sleep(170); }
    await sleep(260);
    mean.classList.remove('in'); setTimeout(() => { mean.hidden = true; }, 300);
  }

  /** 보이기 — step 1(기본 · 지도에만 + 한 줄) 또는 2(판). fast = 대시보드에서 돌아올 때(뜻 확인 · 차오름 · 날아가기 없이 바로) */
  async function show(s, { step = 1, fast = false } = {}) {
    if (!s) return false;
    const run = ++O.run;
    stopTour(); clearTags(); O.sel = null; O.hover = null;
    if (!O.on) { O.on = true; onEnter?.(); }
    host.dataset.onmap = '1';
    if (map.getSource('xo-f')) map.getSource('xo-f').setData({ type: 'FeatureCollection', features: [] });
    const meaning = fast ? Promise.resolve() : confirmMeaning(s);
    O.spec = s; render(s); paintMini(s); panel.hidden = false;
    setStep(step, { silent: true });
    const painted = paintMap(s.map);
    await Promise.all([meaning, painted]);
    if (run !== O.run) return true;
    const lvl = s.map?.level;
    if (O.bb) stage.go(O.bb, { ms: RM() || fast ? 0 : 1400, maxZoom: lvl === 'sgg' ? 9 : 11.5, pitch: 0 });
    window.__xc && (window.__xc.dash = { mode: 'map', step: O.step, kind: s.kind, title: s.title, rule: s.rule, panels: (s.panels || []).map((p) => p.type), map: s.map ? { level: lvl, scale: s.map.scale?.kind, hue: s.map.scale?.hue, meaning: s.map.meaning, n: Object.keys(s.map.values || {}).length } : null, main: s.main, off: s.off || null, kpis: (s.kpis || []).map((k) => [k.label, k.value]), fill: 'running', tags: 0, tour: null });
    if (fast) { for (const f of O.feats) fstate(f.properties.k, { t: 1 }); showTags(topOf(O.feats.length)); if (window.__xc?.dash) { window.__xc.dash.fill = 'done'; window.__xc.dash.tags = O.tags.size; window.__xc.dash.tour = 'skip'; } return true; }
    await sleep(350);
    await fillUp(O.feats, run);
    if (run !== O.run) return true;
    showTags(topOf(O.feats.length));                                         // 값 큰 순서 · 화면에서 겹치지 않는 다섯
    if (window.__xc?.dash) { window.__xc.dash.fill = 'done'; window.__xc.dash.tags = O.tags.size; }
    onShown?.();                                                            // 답은 차오르는 동안 읽혔다 — 대화 칸을 접어 지도가 다 보이게
    await sleep(1700);                                                      // 차오른 지도 · 꼬리표를 보는 숨 고르기 — 그다음 날아간다
    if (run !== O.run) return true;
    const top3 = topOf(3);
    if (top3.length && !RM()) tour(top3); else if (window.__xc?.dash) window.__xc.dash.tour = 'skip';
    return true;
  }
  /** 걷기 — quiet = 3단계(대시보드)로 넘어갈 때(카메라 · 전국 결과 되돌림 없이 조용히) */
  function leave({ quiet = false } = {}) {
    if (!O.on) return;
    stopTour(); clearTags(); ++O.run;
    O.on = false; O.spec = null; O.sel = null; O.hover = null; O.feats = [];
    delete host.dataset.onmap; panel.hidden = true; mini.hidden = true; mean.hidden = true; tip(null, null);
    if (map.getSource('xo-f')) map.getSource('xo-f').setData({ type: 'FeatureCollection', features: [] });
    stage.pad({});
    if (window.__xc) window.__xc.dash = null;
    if (!quiet) onLeave?.();
  }
  return { show, leave, setStep, recolor, get step() { return O.on ? O.step : 0; }, get on() { return O.on; }, get spec() { return O.spec; }, pick, tour: () => tour(topOf(3)) };
}
