/* XI맵 융합 대시보드(10-14 11:02 확인 · 원칙 241 · 245) — XI ChatGEO '대시보드' 도구(ximap_dash)가 준 사양(JSON)을 그린다.
   흐름: 말하거나 시군구 말풍선 '통계 보기' → ChatGEO 가 뜻 확인(지역 · 업무 · 비교 칩) → 융합 재료가 차례로 켜짐 → 화면이 대시보드로 전환
   (지도는 왼쪽 작은 판 · 큰 숫자 · 차트 · 표 · 해석 줄) → 막대 · 순위 줄 · 산점 · 격자 칸을 누르면 지도가 그 읍면동/시군구로, 지도를 누르면 차트가 따라감 → '지도로 돌아가기'.
   차트 종류 · 색 척도는 서버 규칙(agent/tools/ext/dash.py · README 가시화 규칙표)이 고른 것 그대로 — 화면은 그리기만(숫자 = 사양 값 그대로 · 지어낸 숫자 0).
   색: 값의 뜻마다 다른 한 색 램프(수 = 청록 · ㎢당 = 주황 · 비율 = 보라 · 의심 = 빨강 · 넓이/지가 = 파랑) · 평균 대비 = 발산(파랑 ↔ 회색 ↔ 빨강) · 퍼짐이 크면 5단 단계 색.
   지역 문자열 하드코딩 0. */
import { api } from '../kit/util.js';

const nf = (v, d = 0) => (v == null || Number.isNaN(Number(v)) ? '—' : Number(v).toLocaleString('ko-KR', { maximumFractionDigits: Math.max(0, Math.min(3, d | 0)), minimumFractionDigits: 0 }));
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const RM = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const sleep = (ms) => new Promise((r) => setTimeout(r, RM() ? 0 : ms));

/* ── 색 램프(밝은 톤 법전 안 · 데이터 위에서만) ── */
export const RAMP = {
  teal: ['#E3F5F3', '#B5E6E1', '#7FD3CA', '#3FBDB1', '#0FA9A0', '#0B857E', '#07615C'],
  orange: ['#FFF1E0', '#FFD9AD', '#FFBC70', '#FF9A3C', '#F07B1A', '#C85F0C', '#9A4706'],
  violet: ['#F1EDFC', '#D9CFF7', '#B9A7F0', '#977DE6', '#7657D6', '#5A3DB4', '#40298A'],
  red: ['#FDECEC', '#F9C9CB', '#F4A0A4', '#EE757C', '#E34954', '#BE2F3B', '#8F1F29'],
  blue: ['#E6F0FE', '#C3DAFC', '#93BDFF', '#5E9BFF', '#2F78F0', '#0F55C7', '#003B85'],
};
const DIV = ['#1F5FC8', '#6E9DEB', '#BBD1F5', '#ECEEF1', '#F6C6C1', '#EA8277', '#C93A2E'];   // 평균보다 적음(파랑) · 같음(회색) · 많음(빨강)
const CAT = ['#2A78D6', '#EB6834', '#1BAF7A', '#EDA100', '#E87BA4', '#4A3AA7', '#008300', '#E34948'];   // 범주 — 정해진 차례(돌려 쓰지 않음)
const hex = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
const mix = (a, b, t) => { const x = hex(a), y = hex(b); return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join(''); };
function lerpRamp(r, t) { t = Math.max(0, Math.min(1, t)); const p = t * (r.length - 1), i = Math.floor(p); return i >= r.length - 1 ? r[r.length - 1] : mix(r[i], r[i + 1], p - i); }
/** 값 → 색. sc = {kind: seq|step|div, hue, min, max, breaks} */
export function colorOf(sc, v) {
  if (v == null || Number.isNaN(v)) return '#E5E8EB';
  if (sc?.kind === 'div') { const m = sc.max || 1; return lerpRamp(DIV, 0.5 + Math.max(-1, Math.min(1, v / m)) / 2); }
  const r = RAMP[sc?.hue] || RAMP.teal;
  if (sc?.kind === 'step') { const b = sc.breaks || []; let k = b.findIndex((x) => v < x); if (k < 0) k = b.length; return r[[1, 2, 3, 4, 6][Math.min(k, 4)]]; }
  const lo = sc?.min ?? 0, hi = sc?.max ?? 1;
  return lerpRamp(r.slice(1), hi > lo ? (v - lo) / (hi - lo) : 1);
}
const inkOn = (bg) => { const [r, g, b] = hex(bg); return (0.299 * r + 0.587 * g + 0.114 * b) > 150 ? '#1C1F25' : '#FFFFFF'; };

/* ── 차트 부품(SVG · HTML) — 값 글자는 잉크, 색은 표시에만 ── */
let TIP = null;
function tip(e, html) { if (!TIP) return; if (!html) { TIP.hidden = true; return; } TIP.innerHTML = html; TIP.hidden = false; const W = innerWidth; TIP.style.left = Math.min(e.clientX + 14, W - TIP.offsetWidth - 12) + 'px'; TIP.style.top = Math.max(8, e.clientY - TIP.offsetHeight - 10) + 'px'; }
const hoverAttrs = (label, val) => `data-tip="${esc(`<b>${esc(label)}</b> ${val}`)}"`;

function spark(vals) {
  const v = (vals || []).filter((x) => x != null);
  if (v.length < 3) return '';
  const W = 120, H = 32, lo = Math.min(...v), hi = Math.max(...v), d = hi - lo || 1;
  const pts = v.map((x, i) => `${(i / (v.length - 1)) * W},${H - 3 - ((x - lo) / d) * (H - 6)}`).join(' ');
  return `<svg class="xd-spark" viewBox="0 0 ${W} ${H}" aria-hidden="true"><polyline points="${pts}" fill="none" stroke="#0FA9A0" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/><circle cx="${W}" cy="${H - 3 - ((v[v.length - 1] - lo) / d) * (H - 6)}" r="3" fill="#0FA9A0"/></svg>`;
}
function kpi(k, main) {
  return `<div class="xd-card xd-kpi${main ? ' is-main' : ''}"><p class="xd-l">${esc(k.label)}</p><p class="xd-v"><b class="num">${nf(k.value, k.d || 0)}</b><small>${esc(k.unit || '')}</small></p>${k.sub ? `<p class="xd-s">${esc(k.sub)}</p>` : ''}${spark(k.spark)}</div>`;
}
function head(p) { return `<h3>${esc(p.title)}${p.unit ? ` <small>${esc(p.unit)}</small>` : ''}</h3>`; }

function bar(p) {
  const rows = p.rows || [], mx = Math.max(1, ...rows.map((r) => r.v || 0));
  // 세로 막대 = 칸이 7–12개이고 이름이 짧을 때(이름이 다 보이게) · 시간처럼 많으면 이름을 걸러 세로로 · 그 밖은 가로 막대
  const short = rows.every((r) => String(r.label).length <= 4), timeLike = rows.every((r) => /^\d{1,2}[:\-]\d{2}$/.test(String(r.label)));
  const vert = p.orient !== 'h' && ((rows.length >= 7 && rows.length <= 12 && short) || (rows.length > 12 && timeLike));
  if (vert) {
    const every = rows.length > 12 ? Math.ceil(rows.length / 8) : 1;          // 막대가 많으면 이름은 몇 칸 걸러(글자가 겹치지 않게 · 올리면 값과 이름)
    return `${head(p)}<div class="xd-vb" style="--n:${rows.length}">${rows.map((r, i) => `<button type="button" class="xd-b" data-k="${esc(r.k)}" ${hoverAttrs(r.label, nf(r.v, p.d || 0) + (p.unit || ''))}><span class="t num">${nf(r.v)}</span><i style="height:${Math.max(1.5, (100 * (r.v || 0)) / mx)}%;background:${colorOf(p.scale, r.v)}"></i><span class="x">${i % every === 0 ? esc(r.label) : ''}</span></button>`).join('')}</div>`;
  }
  return `${head(p)}<div class="xd-hb">${rows.map((r) => `<button type="button" class="xd-hr" data-k="${esc(r.k)}" ${hoverAttrs(r.label, nf(r.v) + (p.unit || ''))}><span class="n">${esc(r.label)}</span><span class="bar"><i style="width:${(100 * (r.v || 0)) / mx}%;background:${colorOf(p.scale, r.v)}"></i></span><span class="v num">${nf(r.v, p.d || 0)}</span></button>`).join('')}</div>`;
}
function hist(p) {
  const b = p.bins || [], mx = Math.max(1, ...b.map((x) => x.v || 0));
  const r = RAMP.blue;                                             // 서수 램프(가장 옅은 칸도 바탕과 구분되게 250 단계부터)
  return `${head(p)}<div class="xd-hist">${b.map((x, i) => `<div class="xd-hc" ${hoverAttrs(x.label, nf(x.v) + (p.unit || ''))}><span class="t num">${nf(x.v)}</span><i style="height:${Math.max(1.5, (100 * (x.v || 0)) / mx)}%;background:${r[Math.min(6, 2 + i)]}"></i><span class="x">${esc(x.label)}</span></div>`).join('')}</div>`;
}
function donut(p) {
  const rows = (p.rows || []).filter((r) => r.v > 0), tot = rows.reduce((s, r) => s + r.v, 0) || 1;
  const R = 54, C = 2 * Math.PI * R; let off = 0;
  const segs = rows.map((r, i) => { const len = (r.v / tot) * C; const s = `<circle r="${R}" cx="70" cy="70" fill="none" stroke="${CAT[i % CAT.length]}" stroke-width="22" stroke-dasharray="${Math.max(0, len - 2)} ${C}" stroke-dashoffset="${-off}" ${hoverAttrs(r.label, `${nf(r.v, p.d || 0)}${p.unit || ''} · ${nf((r.v / tot) * 100, 1)}%`)}/>`; off += len; return s; }).join('');
  return `${head(p)}<div class="xd-donut"><svg viewBox="0 0 140 140" aria-hidden="true"><g transform="rotate(-90 70 70)">${segs}</g><text x="70" y="68" text-anchor="middle" class="xd-dt num">${nf(tot, p.d || 0)}</text><text x="70" y="86" text-anchor="middle" class="xd-du">${esc(p.unit || '')}</text></svg>
    <ul class="xd-leg">${rows.map((r, i) => `<li data-k="${esc(r.k)}"><i style="background:${CAT[i % CAT.length]}"></i><span>${esc(r.label)}</span><b class="num">${nf((r.v / tot) * 100, 1)}%</b></li>`).join('')}</ul></div>`;
}
function stack(p) {
  const rows = p.rows || [], ser = p.series || [];
  const mx = Math.max(1, ...rows.map((r) => r.vals.reduce((s, v) => s + (v || 0), 0)));
  const leg = `<ul class="xd-leg xd-leg--row">${ser.map((s, i) => `<li><i style="background:${CAT[i % CAT.length]}"></i><span>${esc(s)}</span></li>`).join('')}</ul>`;
  return `${head(p)}${leg}<div class="xd-st">${rows.map((r) => { const t = r.vals.reduce((s, v) => s + (v || 0), 0); return `<button type="button" class="xd-sr" data-k="${esc(r.k)}"><span class="n">${esc(r.label)}</span><span class="bar" style="width:${(100 * t) / mx}%">${r.vals.map((v, i) => (v ? `<i style="flex:${v};background:${CAT[i % CAT.length]}" ${hoverAttrs(`${r.label} · ${ser[i]}`, nf(v) + (p.unit || ''))}></i>` : '')).join('')}</span><span class="v num">${nf(t)}</span></button>`; }).join('')}</div>`;
}
function heat(p) {
  const cols = p.cols || [], rows = p.rows || [];
  const cmax = cols.map((_, j) => Math.max(1, ...rows.map((r) => r.vals[j] || 0)));
  const r = RAMP[p.scale?.hue] || RAMP.teal;
  return `${head(p)}<div class="xd-heat" style="--c:${cols.length}"><span></span>${cols.map((c) => `<span class="ch">${esc(c)}</span>`).join('')}
    ${rows.map((rw) => `<button type="button" class="rh" data-k="${esc(rw.k)}">${esc(rw.label)}</button>${rw.vals.map((v, j) => { const bg = v ? lerpRamp(r, 0.12 + 0.88 * Math.sqrt(v / cmax[j])) : '#F2F4F6'; return `<span class="cell num" style="background:${bg};color:${inkOn(bg)}" ${hoverAttrs(`${rw.label} · ${cols[j]}`, nf(v))}>${v ? nf(v) : ''}</span>`; }).join('')}`).join('')}</div>
    <p class="xd-note">업무마다 많은 칸이 짙습니다</p>`;
}
function line(p) {
  const pts = p.points || []; if (pts.length < 2) return head(p);
  const W = 560, H = 200, L = 52, B = 26, T = 12, R = 12;
  const vs = pts.map((x) => x.v), hi = Math.max(...vs), lo = 0, d = hi - lo || 1;
  const X = (i) => L + (i / (pts.length - 1)) * (W - L - R), Y = (v) => T + (1 - (v - lo) / d) * (H - T - B);
  const path = pts.map((x, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(x.v).toFixed(1)}`).join('');
  const area = `${path}L${X(pts.length - 1)},${H - B}L${L},${H - B}Z`;
  const ticks = [0, 0.5, 1].map((t) => lo + d * t);
  const lab = (x) => (p.grain === 'hour' ? x.t.slice(5, 16).replace('T', ' ') : p.grain === 'day' ? x.t.slice(5, 10) : x.t);
  const every = Math.max(1, Math.ceil(pts.length / 6));
  return `${head(p)}<svg class="xd-line" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
    ${ticks.map((v) => `<line x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}" class="g"/><text x="${L - 6}" y="${Y(v) + 4}" text-anchor="end" class="ax num">${nf(v)}</text>`).join('')}
    <path d="${area}" fill="#0FA9A0" fill-opacity=".12"/><path d="${path}" fill="none" stroke="#0FA9A0" stroke-width="2" stroke-linejoin="round"/>
    ${pts.map((x, i) => (i % every === 0 || i === pts.length - 1 ? `<text x="${X(i)}" y="${H - 8}" text-anchor="middle" class="ax">${esc(lab(x))}</text>` : '')).join('')}
    ${pts.map((x, i) => `<rect x="${X(i) - (W - L - R) / pts.length / 2}" y="${T}" width="${(W - L - R) / pts.length}" height="${H - T - B}" fill="transparent" ${hoverAttrs(lab(x), nf(x.v) + (p.unit || ''))}/><circle cx="${X(i)}" cy="${Y(x.v)}" r="${i === pts.length - 1 ? 4 : 0}" fill="#0FA9A0"/>`).join('')}
  </svg>`;
}
function scatter(p) {
  const pts = p.pts || []; if (!pts.length) return head(p);
  const W = 560, H = 230, L = 52, B = 30, T = 10, R = 14;
  const xs = pts.map((q) => q.x), ys = pts.map((q) => q.y), xh = Math.max(...xs) || 1, yh = Math.max(...ys) || 1;
  const X = (v) => L + (v / xh) * (W - L - R), Y = (v) => T + (1 - v / yh) * (H - T - B);
  // 기울기(넓이당 평균) 기준선 — 선 위는 넓이에 비해 많은 곳
  const k = ys.reduce((s, v) => s + v, 0) / (xs.reduce((s, v) => s + v, 0) || 1);
  const x2 = Math.min(xh, yh / (k || 1));
  return `<h3>${esc(p.title)} <small>${esc(p.x.label)}(${esc(p.x.unit)}) × ${esc(p.y.label)}(${esc(p.y.unit)})</small></h3><svg class="xd-sc" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
    <line x1="${L}" x2="${W - R}" y1="${H - B}" y2="${H - B}" class="g"/><line x1="${L}" x2="${L}" y1="${T}" y2="${H - B}" class="g"/>
    <line x1="${X(0)}" y1="${Y(0)}" x2="${X(x2)}" y2="${Y(k * x2)}" class="avg"/>
    <text x="${L - 6}" y="${T + 8}" text-anchor="end" class="ax num">${nf(yh)}</text><text x="${W - R}" y="${H - 10}" text-anchor="end" class="ax num">${nf(xh, 1)}</text>
    ${pts.map((q) => `<circle data-k="${esc(q.k)}" cx="${X(q.x)}" cy="${Y(q.y)}" r="6" fill="${q.y > k * q.x ? '#F07B1A' : '#0FA9A0'}" fill-opacity=".85" stroke="#fff" stroke-width="2" ${hoverAttrs(q.label, `${esc(p.x.label)} ${nf(q.x, 2)}${esc(p.x.unit)} · ${nf(q.y)}${esc(p.y.unit)}`)}/>`).join('')}
  </svg><p class="xd-note"><i class="dot o"></i>넓이에 비해 많은 곳 <i class="dot t"></i>적은 곳 · 선 = 평균</p>`;
}
function rank(p) {
  const rows = p.rows || [], mx = Math.max(1, ...rows.map((r) => r.v || 0)), ex = p.extra;
  return `${head(p)}<table class="xd-rank"><tbody>${rows.map((r, i) => `<tr data-k="${esc(r.k)}"><td class="i num">${i + 1}</td><td class="n">${esc(r.label)}</td><td class="b"><i style="width:${(100 * (r.v || 0)) / mx}%"></i></td><td class="v num">${nf(r.v)}</td>${ex ? `<td class="e num">${r[ex.key] != null ? `${esc(ex.label)} ${nf(r[ex.key], 1)}` : ''}</td>` : ''}</tr>`).join('')}</tbody></table>`;
}
function table(p) {
  const num = new Set(p.num || []);
  return `<div class="xd-tt">${head(p)}${p.dl ? '<button type="button" class="xd-dl">내려받기</button>' : ''}</div><table class="xd-tb"><thead><tr>${p.cols.map((c, i) => `<th${num.has(i) ? ' class="num"' : ''}>${esc(c)}</th>`).join('')}</tr></thead><tbody>${p.rows.map((r) => `<tr>${r.map((c, i) => `<td${num.has(i) ? ' class="num"' : ''}>${typeof c === 'number' ? nf(c, i === 3 ? 1 : 0) : esc(c ?? '—')}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
}
const DRAW = { bar, hist, donut, stack, heat, line, scatter, rank, table };
const BIG = new Set(['heat', 'stack', 'line', 'scatter', 'table']);
const span = (p) => (BIG.has(p.type) || (p.type === 'bar' && (p.rows || []).length > 8 && p.orient !== 'h') ? 8 : 4);

function legend(sc, unit) {
  if (!sc) return '';
  if (sc.kind === 'div') return `<div class="xd-scale"><span class="num">−${nf(sc.max, 0)}%</span><i style="background:linear-gradient(90deg,${DIV.join(',')})"></i><span class="num">+${nf(sc.max, 0)}%</span></div>`;
  const r = RAMP[sc.hue] || RAMP.teal;
  if (sc.kind === 'step') { const cs = [1, 2, 3, 4, 6].map((i) => r[i]); return `<div class="xd-scale is-step"><span class="num">${nf(sc.min, 1)}</span>${cs.map((c) => `<i style="background:${c}"></i>`).join('')}<span class="num">${nf(sc.max, 1)}</span><small>${esc(unit || '')}</small></div>`; }
  return `<div class="xd-scale"><span class="num">${nf(sc.min, 1)}</span><i style="background:linear-gradient(90deg,${r.slice(1).join(',')})"></i><span class="num">${nf(sc.max, 1)}</span><small>${esc(unit || '')}</small></div>`;
}

/* ═══ 대시보드 ═══ */
export function createDash({ map, stage, host, h, sggFC, onEnter, onLeave, onShown }) {
  const D = { on: false, spec: null, sel: null, fc: null };
  const panel = h('section.xd', { hidden: true, 'aria-label': '대시보드' });
  const back = h('button.xd-back', { type: 'button', text: '지도로 돌아가기', hidden: true });
  const cap = h('div.xd-cap', { hidden: true });
  const mean = h('div.xd-mean', { hidden: true, role: 'status' });
  TIP = h('div.xd-tip', { hidden: true, role: 'tooltip' });
  host.append(panel, back, cap, mean); document.body.append(TIP);
  back.onclick = () => leave();
  panel.addEventListener('mousemove', (e) => { const t = e.target.closest('[data-tip]'); tip(e, t ? t.dataset.tip : null); });
  panel.addEventListener('mouseleave', () => tip(null, null));

  function ensureLayers() {
    if (map.getSource('xd-f')) return;
    map.addSource('xd-f', { type: 'geojson', data: { type: 'FeatureCollection', features: [] }, promoteId: 'k' });
    map.addLayer({ id: 'xd-fill', type: 'fill', source: 'xd-f', paint: { 'fill-color': ['coalesce', ['get', 'col'], '#E5E8EB'], 'fill-opacity': ['case', ['boolean', ['feature-state', 'on'], false], 0.95, 0.78] } });
    map.addLayer({ id: 'xd-line', type: 'line', source: 'xd-f', paint: { 'line-color': '#FFFFFF', 'line-width': ['case', ['boolean', ['feature-state', 'on'], false], 3, 0.8] } });
    map.addLayer({ id: 'xd-sel', type: 'line', source: 'xd-f', filter: ['==', ['get', 'k'], '__'], paint: { 'line-color': '#1C1F25', 'line-width': 2.5 } });
    map.on('click', 'xd-fill', (e) => { if (!D.on) return; const k = e.features?.[0]?.properties?.k; if (k) pick(k, true); });
    map.on('mousemove', 'xd-fill', (e) => { if (!D.on) return; map.getCanvas().style.cursor = 'pointer'; const p = e.features?.[0]?.properties; const m = D.spec?.map; if (p && m) tip(e.originalEvent, `<b>${esc(p.name)}</b> ${p.v != null && p.v !== 'null' ? `${nf(Number(p.v), 1)}${esc(m.unit || '')}` : '—'}`); });
    map.on('mouseleave', 'xd-fill', () => { map.getCanvas().style.cursor = ''; tip(null, null); });
  }
  const bboxOf = (fs) => { let w = 180, s = 90, e = -180, n = -90; const walk = (c) => (typeof c[0] === 'number' ? (w = Math.min(w, c[0]), e = Math.max(e, c[0]), s = Math.min(s, c[1]), n = Math.max(n, c[1])) : c.forEach(walk)); fs.forEach((f) => f.geometry && walk(f.geometry.coordinates)); return w < e ? [w, s, e, n] : null; };

  async function paintMap(m) {
    ensureLayers();
    let feats = [];
    if (m?.level === 'emd' && m.sgg) {
      const fc = await api(`/regions/${m.sgg}/emd`).catch(() => null);
      feats = (fc?.features || []).map((f) => ({ type: 'Feature', geometry: f.geometry, properties: { k: f.properties.emd_cd, name: f.properties.name || f.properties.emd_nm || '' } }));
    } else if (m?.level === 'sgg') {
      const want = new Set(Object.keys(m.values || {}));
      for (const f of sggFC()?.features || []) {                     // 지도 경계 코드(옛 · 새 별칭 모두) ↔ 집계 코드
        const k = String(f.properties.codes || f.properties.code).split(',').find((c) => want.has(c));
        if (k) feats.push({ type: 'Feature', geometry: f.geometry, properties: { k, name: f.properties.name } });
      }
    }
    for (const f of feats) { const v = m?.values?.[f.properties.k]; f.properties.v = v ?? null; f.properties.col = v == null ? '#E5E8EB' : colorOf(m.scale, v); if (!f.properties.name) f.properties.name = m?.labels?.[f.properties.k] || ''; }
    D.fc = { type: 'FeatureCollection', features: feats };
    map.getSource('xd-f').setData(D.fc);
    D.bb = bboxOf(feats.filter((f) => f.properties.v != null)) || bboxOf(feats);
    cap.innerHTML = m ? `<b>${esc(m.title)}</b>${legend(m.scale, m.unit)}${D.spec?.live ? `<span class="xd-live"><i></i>지금 분석 중 · ${esc(D.spec.live)}</span>` : ''}` : (D.spec?.live ? `<span class="xd-live"><i></i>지금 분석 중 · ${esc(D.spec.live)}</span>` : '');
  }
  function pick(k, fromMap) {
    const same = D.sel === k && !fromMap;
    if (D.sel) try { map.setFeatureState({ source: 'xd-f', id: D.sel }, { on: false }); } catch { /* */ }
    D.sel = same ? null : k;
    if (D.sel) try { map.setFeatureState({ source: 'xd-f', id: D.sel }, { on: true }); } catch { /* */ }
    map.setFilter('xd-sel', ['==', ['get', 'k'], D.sel || '__']);
    panel.querySelectorAll('[data-k]').forEach((el) => el.classList.toggle('on', !!D.sel && el.dataset.k === D.sel));
    const f = D.sel && D.fc?.features.find((x) => x.properties.k === D.sel);
    const b = f ? bboxOf([f]) : D.bb;
    if (b) stage.go(b, { ms: RM() ? 0 : 1000, maxZoom: f ? 13 : 11, pitch: 0 });
    if (fromMap && D.sel) panel.querySelector(`[data-k="${CSS.escape(D.sel)}"]`)?.scrollIntoView({ block: 'nearest', behavior: RM() ? 'auto' : 'smooth' });
  }
  function csv(name, cols, rows) {
    const body = [cols.join(','), ...rows.map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(','))].join('\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + body], { type: 'text/csv' })); a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }
  function render(s) {
    const kp = (s.kpis || []).map((k, i) => kpi(k, i === 0)).join('');
    const means = (s.means || []).map(([k, v]) => `<span><em>${esc(k)}</em>${esc(v)}</span>`).join('');
    const cards = [];
    const ps = s.panels || [];
    ps.forEach((p, i) => {
      cards.push(`<div class="xd-card xd-p xd-p--${p.type}" style="grid-column:span ${span(p)}" data-i="${i}">${(DRAW[p.type] || (() => ''))(p)}</div>`);
      if (i === 0) cards.push(`<div class="xd-card xd-say" style="grid-column:span ${span(p) === 8 ? 4 : 8}"><p class="xd-sayh"><span class="xd-logo">XI</span>XI ChatGEO</p>${(s.say || []).map((l) => `<p>${esc(l)}</p>`).join('')}</div>`);
    });
    panel.innerHTML = `<header class="xd-h"><h2>${esc(s.title)}</h2><div class="xd-means">${means}</div><button type="button" class="xd-dl xd-rep" style="margin-left:auto">보고서로</button></header>
      ${s.note ? `<p class="xd-notice">${esc(s.note)}</p>` : ''}
      <div class="xd-kpis" style="--k:${Math.min(4, (s.kpis || []).length || 1)}">${kp}</div>
      <div class="xd-grid">${cards.join('')}</div>`;
    panel.querySelectorAll('.xd-p').forEach((el) => {
      const p = ps[Number(el.dataset.i)];
      if (p?.pick) el.querySelectorAll('[data-k]').forEach((b) => { b.classList.add('pk'); b.addEventListener('click', () => pick(b.dataset.k)); });
      if (p?.type === 'table' && p.dl) el.querySelector('.xd-dl')?.addEventListener('click', () => csv(p.dl, p.cols, p.rows));
    });
    panel.querySelector('.xd-rep')?.addEventListener('click', (e) => report(s, e.currentTarget));
    panel.scrollTop = 0;
  }
  /** '보고서로' — 지금 화면의 대시보드(같은 사양 · 같은 숫자)를 한글 문서(.hwpx)로 내려받기(10-14 원칙 247) */
  async function report(s, b) {
    if (b.disabled) return;
    const t0 = b.textContent; b.disabled = true; b.textContent = '만드는 중';
    try {
      const r = await api('/ximap/report.hwpx', { method: 'POST', body: { spec: s }, raw: true });
      if (!r.ok) throw new Error('http ' + r.status);
      const cd = r.headers.get('content-disposition') || '', m = /filename\*=UTF-8''([^;]+)/i.exec(cd);
      const name = m ? decodeURIComponent(m[1]) : `${String(s.title || '대시보드').replace(/[\/:*?"<>|\s·—]+/g, '_')}_보고서.hwpx`;
      const u = URL.createObjectURL(await r.blob());
      const a = document.createElement('a'); a.href = u; a.download = name; document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(u), 4000);
      b.textContent = '내려받았습니다';
    } catch { b.textContent = '내려받지 못했습니다'; }
    setTimeout(() => { b.textContent = t0; b.disabled = false; }, 1600);
  }
  /** 뜻 확인(지역 · 업무 · 비교) → 융합 재료 차례로 켜짐 — 아래 채팅 창 위 한 줄(시안 흐름 그대로) */
  async function confirmMeaning(s) {
    mean.innerHTML = `<div class="xd-mean-a">${(s.means || []).map(([k, v]) => `<span><em>${esc(k)}</em>${esc(v)}</span>`).join('')}</div><div class="xd-mean-b">${(s.fuse || []).map((f) => `<span>${esc(f)}</span>`).join('')}</div>`;
    mean.hidden = false; requestAnimationFrame(() => mean.classList.add('in'));
    await sleep(500);
    for (const el of mean.querySelectorAll('.xd-mean-b span')) { el.classList.add('ok'); await sleep(260); }
    await sleep(250);
    mean.classList.remove('in'); setTimeout(() => { mean.hidden = true; }, 300);
  }
  async function show(s) {
    if (!s) return false;
    await confirmMeaning(s);
    D.spec = s; D.sel = null;
    render(s);
    if (!D.on) { D.on = true; onEnter?.(); }
    host.dataset.dash = '1'; panel.hidden = false; back.hidden = false; cap.hidden = false;
    onShown?.();
    resizeFor(900);
    await paintMap(s.map);
    await sleep(500);
    if (D.bb) await stage.go(D.bb, { ms: RM() ? 0 : 1200, maxZoom: s.map?.level === 'sgg' ? 9 : 11.5, pitch: 0 });
    window.__xc && (window.__xc.dash = { kind: s.kind, title: s.title, rule: s.rule, panels: (s.panels || []).map((p) => p.type), map: s.map ? { level: s.map.level, scale: s.map.scale?.kind, hue: s.map.scale?.hue, meaning: s.map.meaning, n: Object.keys(s.map.values || {}).length } : null, main: s.main });
    return true;
  }
  function resizeFor(ms) { const t0 = performance.now(); (function f() { try { map.resize(); } catch { /* */ } if (performance.now() - t0 < ms) requestAnimationFrame(f); })(); }
  function leave() {
    if (!D.on) return;
    D.on = false; D.spec = null; D.sel = null;
    delete host.dataset.dash; panel.hidden = true; back.hidden = true; cap.hidden = true; tip(null, null);
    if (map.getSource('xd-f')) map.getSource('xd-f').setData({ type: 'FeatureCollection', features: [] });
    resizeFor(900);
    if (window.__xc) window.__xc.dash = null;
    onLeave?.();
  }
  return { show, leave, get on() { return D.on; }, pick };
}
