// 우 648 얇은 헤어라인 차트 3단 — B10 · B11 · B12 (12.4 규격).
// 규칙(§12.1 #5 · #6): 값은 **전부** 찍되 양끝·최대만 잉크, 나머지는 `#CCC` — 지우지 않고 흐린다.
// 좌표는 design-canvas/v2/B5-Dashboard.dc.html 의 인라인 style 값 그대로다.
// 액센트 `#006DF7` 은 이 파일의 B10 랭크 1위 바 한 곳뿐이다.
import { nf } from './db-data.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* ── ① B10 랭크드 바 — 10px×5, 피치 16(y 356·372·388·404·420) ───────── */
export const BAR_TOP = 356;
export const BAR_PITCH = 16;
export const BAR_TRACK = 432;

export function rankedBars(projects) {
  const top = [...projects].sort((a, b) => b.gb - a.gb).slice(0, 5);
  const max = Math.max(...top.map((t) => t.gb)) || 1;
  return top.map((t, i) => {
    const w = (t.gb / max) * BAR_TRACK;
    return `<div class="pr${i === 0 ? ' is-1' : ''}" style="top:${BAR_TOP + BAR_PITCH * i}px">`
      + `<span class="pn">${esc(t.name)}</span>`
      + `<span class="trk"><i style="width:${w.toFixed(1)}px"></i></span>`
      + `<span class="pv n">${t.gb}</span></div>`;
  }).join('');
}
export const barsTotal = (projects) => [...projects].sort((a, b) => b.gb - a.gb).slice(0, 5).reduce((a, t) => a + t.gb, 0);

/* ── ② B11 7일 폴리라인 높이 36 + 값·요일 12 ──────────────────────────
   축 y 548.5(x 752–1352) · 점 피치 100 · 값은 축 위 36px 안에 눕는다.       */
export const V = { x0: 752, dx: 100, base: 548, h: 36, axis: 548.5, ax0: 752, ax1: 1352 };

export function polyline(visits) {
  const max = Math.max(...visits.map((v) => v.count));
  const min = Math.min(...visits.map((v) => v.count));
  const span = Math.max(1, max - min);
  const x = (i) => V.x0 + V.dx * i;
  const y = (c) => V.base - ((c - min) / span) * V.h;
  const last = visits.length - 1;
  // 양끝(월·일)과 최대(금)만 잉크. 나머지는 흐린다 — 지우지 않는다.
  const ink = (i) => i === 0 || i === last || visits[i].count === max;
  const pts = visits.map((v, i) => `${x(i)},${y(v.count).toFixed(1)}`).join(' ');
  const mk = visits.map((v, i) => `<rect x="${(x(i) - 2.5).toFixed(1)}" y="${(y(v.count) - 2.5).toFixed(1)}"`
    + ` width="5" height="5" fill="${ink(i) ? '#010102' : '#FFF'}" stroke="#010102"/>`).join('');
  const svg = `<svg width="1440" height="900" viewBox="0 0 1440 900" role="img" aria-label="최근 7일 방문">`
    + `<line x1="${V.ax0}" y1="${V.axis}" x2="${V.ax1}" y2="${V.axis}" stroke="#DDDDDD"/>`
    + `<polyline points="${pts}" fill="none" stroke="#010102" stroke-width="1"/>${mk}</svg>`;
  const lab = visits.map((v, i) => {
    const left = i === 0 ? V.x0 : i === last ? x(last) - 60 : x(i) - 30;
    const al = i === 0 ? 'left' : i === last ? 'right' : 'center';
    const tone = ink(i) ? 'is-ink' : 'is-mute';
    const dtone = ink(i) ? 'is-grey' : 'is-mute';
    return `<span class="vl2 ${tone}" style="left:${left}px;top:${(y(v.count) - 19).toFixed(1)}px;text-align:${al}">${nf.format(v.count)}</span>`
      + `<span class="vd ${dtone}" style="left:${left}px;top:557px;text-align:${al}">${esc(v.day)}</span>`;
  }).join('');
  return svg + lab;
}

/* ── ③ B12 스택 바 16 + 범례 12 — 184 TB 실척(1 px ≒ 0.28 TB) ───────── */
export const STORE_W = 648;
export function stackBar(storage) {
  const px = (tb) => (tb * STORE_W) / storage.total;
  let left = 736;
  return storage.parts.map((p, i) => {
    const w = px(p.tb);
    const color = i === 0 ? '#010102' : i < 3 ? '#686868' : '#CCCCCC';
    const html = `<i style="left:${(left - 736).toFixed(2)}px;width:${w.toFixed(2)}px;background:${color}"></i>`;
    left += w;
    return html;
  }).join('');
}
export function stackLegend(storage) {
  const rest = +(storage.total - storage.parts.reduce((a, p) => a + p.tb, 0)).toFixed(1);
  return storage.parts.map((p, i) => `<span class="${i === 0 ? 'is-ink' : 'is-grey'}">${esc(p.label)} ${p.tb}</span>`).join('')
    + '<span class="sp"></span>'
    + `<span class="rest">잔여 ${rest} TB</span>`;
}
export const tbPerPx = (storage) => +(storage.total / STORE_W).toFixed(2);
