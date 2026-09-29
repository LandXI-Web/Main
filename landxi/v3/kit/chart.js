/* K12 chart.js — 차트(데이터 잉크). 막대 · 선. 축 라벨 14 · 격자 0 · 범례 없음(라벨 직접) ·
   색 = 잉크, AI 결과 계열만 --ai(ai:true). 값은 숫자 또는 봉투.
   bars(el, { items: [{ label, value }], ai, unit, max, lang })  · lang = 숫자 로캘(명령 바: 질문 언어) · line(el, { points: [{ label, value }], ai, unit }) */
import { esc, isEnvelope, RM } from './util.js';
import { nf } from './i18n.js';

const v = (x) => (isEnvelope(x) ? x.value : x) ?? 0;

/** 가로 막대(라벨 왼쪽 · 값 오른쪽 끝에 직접) — 반응형 HTML(SVG 없이 폭 따라감) */
export function bars(el, { items = [], ai = false, unit = '', max, limit = 12, lang } = {}) {
  el.classList.add('k-bars'); el.classList.toggle('k-ai', ai);
  const list = items.slice(0, limit);
  const m = max ?? Math.max(1, ...list.map((i) => v(i.value)));
  el.innerHTML = list.map((i) => `<div class="k-bar"><span class="k-bar-l">${esc(i.label)}</span><span class="k-bar-t"><i style="--w:${(v(i.value) / m) * 100}%"></i></span><span class="k-bar-v num">${esc(nf(v(i.value), undefined, lang))}${unit ? `<small>${esc(unit)}</small>` : ''}</span></div>`).join('');
  if (!RM()) requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('is-in'))); else el.classList.add('is-in');
  return { el };
}

/** 선 — 끝점 값만 직접 라벨 · x 라벨 처음/끝 */
export function line(el, { points = [], ai = false, unit = '', h: H = 160 } = {}) {
  el.classList.add('k-line'); el.classList.toggle('k-ai', ai);
  const W = 600, P = { l: 8, r: 64, t: 16, b: 28 };
  const ys = points.map((p) => v(p.value)), mx = Math.max(1, ...ys), mn = Math.min(0, ...ys);
  const X = (i) => P.l + (i / Math.max(1, points.length - 1)) * (W - P.l - P.r);
  const Y = (y) => P.t + (1 - (y - mn) / (mx - mn || 1)) * (H - P.t - P.b);
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(v(p.value)).toFixed(1)}`).join('');
  const last = points.length - 1;
  el.innerHTML = points.length ? `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="${esc(points.map((p) => `${p.label} ${nf(v(p.value))}`).join(', '))}">
    <path class="k-line-p" d="${d}" pathLength="1"/>
    <circle class="k-line-d" cx="${X(last)}" cy="${Y(v(points[last].value))}" r="4"/>
  </svg>
  <span class="k-line-v num" style="top:${(Y(v(points[last].value)) / H) * 100}%">${esc(nf(v(points[last].value)))}${unit ? `<small>${esc(unit)}</small>` : ''}</span>
  <div class="k-line-x t-label"><span>${esc(points[0].label)}</span><span>${esc(points[last].label)}</span></div>` : '';
  if (!RM()) requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('is-in'))); else el.classList.add('is-in');
  return { el };
}
