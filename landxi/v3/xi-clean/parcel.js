/* XI맵 지적 · 필지(10-15 원칙 266 · 123) — 지적 층이 켜진 채 빈 땅을 누르면 그 자리 필지 카드, 객체 고치기 칸 맨 위 '소속 필지' 한 줄.
   필지 = GET /parcels?lng&lat&geom=1 — 우리 데이터베이스(연속지적 적재)에 있으면 그것 · 없으면 V-World 연속지적(서버 키 · 중계 · 보관).
   같은 필지 안을 다시 누르면 화면이 들고 있는 필지 모양으로 답한다(서버 · V-World 호출 0).
   그 필지 안 AI 결과 = 지금 지도에 그려진 결과 객체 중 가운데가 필지 안인 것(끈 클래스는 빠짐 — 화면과 같은 기준) · 업무(클래스)별 수 · 면적.
   지목과 어긋나는 점 = 기존 실태조사 규칙(서버가 준 규칙 이름 · 지목 · 분류 · 문턱) 그대로. 새 판정 · 새 말 없음. */
import { api } from '../kit/util.js';

const nf = (n) => Number(n).toLocaleString('ko-KR');
const val = (e) => (e && typeof e === 'object' ? e.value : e);
const EMPTY = { type: 'FeatureCollection', features: [] };
/** 면적 글 — 기관 필지 카드(parcelInfo)와 같은 반올림(소수 한 자리) */
export const m2Text = (a) => (a != null ? `${nf(Math.round(a * 10) / 10)}㎡` : '—');

function inRing(pt, r) {
  let c = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, yi] = r[i], [xj, yj] = r[j];
    if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}
const polys = (g) => (!g ? [] : g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : []);
export function inGeom(pt, g) { return polys(g).some((p) => inRing(pt, p[0]) && !p.slice(1).some((h) => inRing(pt, h))); }
function bboxOf(g) {
  let w = 180, s = 90, e = -180, n = -90;
  for (const p of polys(g)) for (const [x, y] of p[0]) { w = Math.min(w, x); e = Math.max(e, x); s = Math.min(s, y); n = Math.max(n, y); }
  return [w, s, e, n];
}
/** 그려진 조각의 가운데(바깥 고리 넓이 가중) — 점이면 그 점 */
function centerOf(g) {
  if (!g) return null;
  if (g.type === 'Point') return g.coordinates;
  let best = null, ba = -1;
  for (const p of polys(g)) {
    const r = p[0]; let a = 0, cx = 0, cy = 0;
    for (let i = 0; i < r.length - 1; i++) { const f = r[i][0] * r[i + 1][1] - r[i + 1][0] * r[i][1]; a += f; cx += (r[i][0] + r[i + 1][0]) * f; cy += (r[i][1] + r[i + 1][1]) * f; }
    if (Math.abs(a) > ba && a) { ba = Math.abs(a); best = [cx / (3 * a), cy / (3 * a)]; }
  }
  return best;
}

export function createParcels({ map, host, h, K, objLayers, clsName, colorOf, unitOf, onMore }) {
  const C = { at: null, d: null, seq: 0, cache: [] };       // cache = 최근 필지(모양 포함) 40개 — 같은 필지 안 다시 누르기 = 호출 0
  const card = h('section.xe-card.xp-card.t-card.t-card--map', { hidden: true, role: 'dialog', 'aria-label': '필지' });
  host.append(card);
  function layers() {
    if (map.getSource('xp-sel')) return;
    map.addSource('xp-sel', { type: 'geojson', data: EMPTY });
    map.addLayer({ id: 'xp-sel-f', type: 'fill', source: 'xp-sel', paint: { 'fill-color': '#FFFFFF', 'fill-opacity': 0.12 } }, 'slot-overlay');
    map.addLayer({ id: 'xp-sel-l', type: 'line', source: 'xp-sel', paint: { 'line-color': '#FFB800', 'line-width': 2.6 } }, 'slot-overlay');
  }
  function place() {
    if (card.hidden || !C.at) return;
    const p = map.project(C.at), W = host.clientWidth, H = host.clientHeight, w = card.offsetWidth || 360, hh = card.offsetHeight || 280;
    if (p.x < -80 || p.y < -80 || p.x > W + 80 || p.y > H + 80) { close(); return; }      // 누른 자리가 화면 밖으로 멀리 나가면 닫는다(다른 곳으로 날아간 뒤 남지 않게)
    let x = p.x + 18, y = p.y - 40;
    if (x + w > W - 92) x = p.x - w - 18;
    const foot = host.querySelector('.k-chat-root[data-dock]') ? 96 : 12;
    x = Math.max(12, Math.min(x, W - w - 12)); y = Math.max(76, Math.min(y, H - hh - foot));
    card.style.transform = `translate(${Math.round(x)}px,${Math.round(y)}px)`;
  }
  map.on('move', place);

  /** 그 점의 필지 — 들고 있는 필지 안이면 그것(호출 0) · 아니면 서버 */
  async function at(ll) {
    const pt = [ll.lng, ll.lat];
    const hit = C.cache.find((d) => d.geometry && inGeom(pt, d.geometry));
    if (hit) return hit;
    const d = await api(`/parcels?lng=${pt[0].toFixed(7)}&lat=${pt[1].toFixed(7)}&geom=1`);
    if (d?.geometry) { C.cache.unshift(d); C.cache.length = Math.min(C.cache.length, 40); }
    return d;
  }
  const label = (d) => [d.place, d.no].filter(Boolean).join(' ');
  /** 객체 고치기 칸 맨 위 한 줄 — '운림리 31-2 · 답 · 1,240㎡' (필지 카드와 같은 출처 · 같은 반올림) */
  async function line(ll) {
    try { const d = await at(ll); return d ? [label(d), d.jimok, m2Text(val(d.area_m2))].filter(Boolean).join(' · ') : null; } catch { return null; }
  }

  /** 필지 안 AI 결과 — 지금 그려진 결과 객체(끈 클래스 빠짐)의 가운데가 필지 안 · 같은 객체는 한 번 */
  function aiIn(g) {
    const lyr = objLayers(); if (!lyr.length || !g) return [];
    const b = bboxOf(g), a = map.project([b[0], b[3]]), c = map.project([b[2], b[1]]);
    const seen = new Set(), by = new Map();
    for (const f of map.queryRenderedFeatures([[Math.min(a.x, c.x) - 2, Math.min(a.y, c.y) - 2], [Math.max(a.x, c.x) + 2, Math.max(a.y, c.y) + 2]], { layers: lyr })) {
      const id = f.properties?.id ?? f.id; const key = f.source + '|' + (id ?? JSON.stringify(f.geometry?.coordinates?.[0]?.[0]));
      if (seen.has(key)) continue;
      const ctr = centerOf(f.geometry);
      if (!ctr || !inGeom(ctr, g)) continue;
      seen.add(key);
      const cls = String(f.properties?.cls || f.properties?.cls_en || '');
      if (!cls) continue;
      const x = by.get(cls) || { cls, n: 0, m2: 0 };
      x.n += 1; x.m2 += Number(f.properties?.area_m2) || 0;
      by.set(cls, x);
    }
    return [...by.values()].sort((p, q) => q.m2 - p.m2 || q.n - p.n);
  }
  /** 지목과 어긋나는 점 — 기존 실태조사 규칙(지목 · 분류 · 면적 문턱 · 비율) 그대로 */
  function miss(d, ai) {
    const jm = d.jimok_cd, area = val(d.area_m2);
    if (!jm || !ai.length) return [];
    const m2 = Object.fromEntries(ai.map((x) => [clsName(x.cls), x.m2]));
    return (d.rules || []).filter((r) => r.jimok.includes(jm)).filter((r) => {
      const s = r.cls.reduce((t, c) => t + (m2[c] || 0), 0);
      const t = r.params || {};
      return s >= t.min_m2 && (!t.ratio || (area && s / area >= t.ratio));
    }).map((r) => r.name);
  }

  function close() {
    card.hidden = true; C.at = null; C.d = null; C.seq++;
    if (map.getSource('xp-sel')) map.getSource('xp-sel').setData(EMPTY);
  }
  async function open(ll) {
    layers();
    const seq = ++C.seq;
    C.at = ll; card.hidden = false;
    card.replaceChildren(h('p.xe-wait', { 'aria-busy': 'true' }, h('span.k-dots', { 'aria-hidden': 'true' }, h('i'), h('i'), h('i')))); place();
    let d;
    try { d = await at(ll); } catch (e) {
      if (seq !== C.seq) return;
      if (e?.status === 404 || e?.code === 'not_found') { close(); return; }      // 도로 · 하천 경계 · 바다 — 카드 없이
      card.replaceChildren(h('p.xe-wait', { text: '필지를 불러오지 못했습니다' })); place(); return;
    }
    if (seq !== C.seq) return;
    C.d = d;
    map.getSource('xp-sel').setData(d.geometry ? { type: 'Feature', geometry: d.geometry, properties: {} } : EMPTY);
    render();
  }
  function render() {
    const d = C.d; if (!d) return;
    const jiga = val(d.price_krw_m2), ym = /^(\d{4})-?(\d{1,2})/.exec(String(d.price_krw_m2?.as_of || ''));
    const ai = aiIn(d.geometry), ms = miss(d, ai);
    const row = (k, v, sub) => h('div', {}, h('dt', { text: k }), h('dd', {}, h('span', { text: v || '—' }), sub ? h('small', { text: sub }) : null));
    const kids = [
      h('header.xe-h', {},
        h('div', {}, h('h3', { text: label(d) || '필지' }), d.emd && d.place !== d.emd ? h('p.xe-sub', { text: d.emd }) : null),
        h('button.xa-x', { type: 'button', 'aria-label': '닫기', html: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 5l10 10M15 5L5 15"/></svg>', onclick: close })),
      h('dl.xe-dl.xp-dl', {},
        row('지목', d.jimok),
        row('면적', m2Text(val(d.area_m2))),
        row('공시지가', jiga != null ? `${nf(jiga)}원/㎡` : '', jiga != null && ym ? `${ym[1]}년 ${+ym[2]}월` : '')),
      h('p.xp-l', { text: 'AI 분석' }),
      ai.length ? h('ul.xp-ai', {}, ...ai.map((x) => h('li', {}, h('i', { style: { background: colorOf(x.cls) } }), h('span', { text: clsName(x.cls) }),
        h('b.num', { text: `${nf(x.n)}${unitOf(clsName(x.cls))}` }), h('em.num', { text: x.m2 ? `${nf(Math.round(x.m2))}㎡` : '' }))))
        : h('p.xp-none', { text: '—' }),
    ];
    if (ms.length) kids.push(h('ul.xp-miss', {}, ...ms.map((n) => h('li', { text: n }))));
    if (onMore) kids.push(h('div.xe-act', {}, h('button.t-btn.t-btn--2', { type: 'button', text: '자세히', onclick: () => { const p = d.pnu; close(); onMore(String(p)); } })));
    card.replaceChildren(...kids);
    place();
    X().parcel = { pnu: d.pnu, jibun: d.jibun, jimok: d.jimok, jimok_cd: d.jimok_cd, area_m2: val(d.area_m2), jiga, jiga_as_of: d.price_krw_m2?.as_of || null,
      source: d.source, place: label(d), ai: ai.map((x) => ({ cls: clsName(x.cls), n: x.n, m2: Math.round(x.m2) })), miss: ms };
  }
  const X = () => (window.__xc ||= {});
  return { open, close, line, render, get on() { return !card.hidden; } };
}
