// 대시보드 하단 — 전국 커버리지. 왼쪽은 시군구 폴리곤을 카드 안에서 직접 투영한 소형 SVG
// 코로플레스(배경 지도의 한 조각을 잘라 보여 주는 것이 아니다), 오른쪽은 시군구 14 × 실태조사 7
// 매트릭스다. 한쪽에 손을 올리면 같은 code 를 가진 다른 쪽과 배경 지도의 coverage 레이어가
// 함께 켜진다. 색은 조사 데이터(SURVEYS[].color)와 tokens.css 에서만 온다.
import { DASH } from '../../data/dashboard.js';
import { SURVEYS } from '../../data/surveys.js';

const GEO_URL = 'assets/data/geo/sigungu-sample.geojson';
const N = SURVEYS.length;                                  // 7
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const byId = Object.fromEntries(SURVEYS.map(s => [s.id, s]));
const shortOf = (s) => s.name.replace(/\s*실태조사$/, '');  // '농지이용 실태조사' → '농지이용'
const href = (code) => `ximap.html?region=${encodeURIComponent(code)}`;
const labelOf = (r) => `${r.name} · ${N}개 조사 중 ${r.done.length}개 AI 대체${r.done.length ? ' — ' + r.done.map(d => shortOf(byId[d])).join(', ') : ''}`;

/**
 * 커버리지 카드를 그리고 배선한다.
 * @param {HTMLElement} el   `.coverage` 카드
 * @param {(fn:Function|null)=>void} highlight  배경 지도 coverage 레이어 강조 콜백
 * @returns {Promise<Object|null>} 지도에 얹을 GeoJSON(properties.id = code). 실패하면 null.
 */
export async function mountCoverage(el, { highlight = () => {} } = {}) {
  if (!el) return null;
  const geo = await fetchGeo();
  const rows = DASH.coverage.map(r => ({ ...r, done: r.done.filter(d => byId[d]) }));
  el.innerHTML = render(rows, geo);
  wire(el, rows, highlight);
  return geo;
}

/** properties.id 는 setHighlight 가 피처를 고르는 키다(원본에는 없다). */
async function fetchGeo() {
  try {
    const r = await fetch(GEO_URL);
    if (!r.ok) throw new Error(r.status);
    const g = await r.json();
    (g.features || []).forEach(f => { f.properties = { ...f.properties, id: f.properties.code }; });
    return g;
  } catch (e) { console.warn('[dash] coverage geo 실패:', e.message); return null; }
}

/* ── 카드 ────────────────────────────────────────────────────────── */
function render(rows, geo) {
  const total = rows.reduce((a, r) => a + r.done.length, 0);
  return `<div class="card__head">
      <h3 class="card__title">전국 커버리지 <span class="count">${rows.length}개 시군 · ${N}개 조사</span></h3>
      <div class="card__actions">
        <span class="coverage__legend"><i class="is-done"></i>AI 대체 완료<i class="is-field"></i>현장 조사 유지</span>
        <span class="mono xsmall faint">${total}/${rows.length * N} 대체</span>
      </div>
    </div>
    <div class="card__body coverage__body">
      ${mapSvg(rows, geo)}
      ${matrix(rows)}
      <div class="coverage__tip" role="tooltip" hidden></div>
    </div>`;
}

/* ── 좌: 소형 SVG 코로플레스 ─────────────────────────────────────── */
const PAD = 10, SPAN = 1000;

/** 등장방형 투영. 위도 중앙에서 경도를 cos 로 눌러 남북이 늘어나 보이지 않게 한다. */
function projector(features) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const walk = c => { if (typeof c[0] === 'number') { x0 = Math.min(x0, c[0]); x1 = Math.max(x1, c[0]); y0 = Math.min(y0, c[1]); y1 = Math.max(y1, c[1]); } else c.forEach(walk); };
  features.forEach(f => walk(f.geometry.coordinates));
  const kx = Math.cos((y0 + y1) / 2 * Math.PI / 180);
  const s = SPAN / Math.max(1e-9, (x1 - x0) * kx);
  const p = ([lon, lat]) => [PAD + (lon - x0) * kx * s, PAD + (y1 - lat) * s];
  return { p, w: SPAN + PAD * 2, h: (y1 - y0) * s + PAD * 2 };
}

const ringPath = (rings, p) => rings.map(r => 'M' + r.map(c => p(c).map(v => v.toFixed(1)).join(',')).join('L') + 'Z').join('');
const polysOf = (g) => g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
const centroid = (rings, p) => {
  const pts = rings[0].slice(0, -1).map(p);
  return [pts.reduce((a, q) => a + q[0], 0) / pts.length, pts.reduce((a, q) => a + q[1], 0) / pts.length];
};

/**
 * 앰비언트 펄스는 딱 하나 — "가장 최근 완료" 시군구. 목업에는 완료 일자가 없으므로
 * 대체 조사 수 → 커버리지율 순으로 가장 앞선 곳을 최근 완료로 본다.
 */
function recentOf(rows) {
  return [...rows].sort((a, b) => b.done.length - a.done.length || b.coverage - a.coverage)[0];
}

function mapSvg(rows, geo) {
  const feats = (geo && geo.features) || [];
  if (!feats.length) return '<figure class="coverage__map is-off"><figcaption>지도 데이터를 불러오지 못했습니다.</figcaption></figure>';
  const meta = Object.fromEntries(rows.map(r => [r.code, r]));
  const { p, w, h } = projector(feats);
  const recent = recentOf(rows);
  const cells = feats.map(f => {
    const code = f.properties.code, r = meta[code] || { name: f.properties.name, done: [], coverage: 0 };
    const rings = polysOf(f.geometry).flatMap(poly => poly);
    const d = ringPath(rings, p);
    const [cx, cy] = centroid(polysOf(f.geometry)[0], p);
    const hot = recent && recent.code === code;
    return `<a class="coverage__cell${hot ? ' is-recent' : ''}" href="${esc(href(code))}" data-code="${esc(code)}" data-done="${r.done.length}"
        aria-label="${esc(labelOf(r))}">
      <path class="coverage__poly" d="${d}" fill-opacity="${(r.done.length / N).toFixed(4)}"/>
      ${hot ? `<circle class="coverage__ping" cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="30"/>` : ''}
      <text class="coverage__name" x="${cx.toFixed(1)}" y="${(cy - 4).toFixed(1)}">${esc(r.name)}</text>
      <text class="coverage__ratio" x="${cx.toFixed(1)}" y="${(cy + 26).toFixed(1)}">${r.done.length}/${N}</text>
    </a>`;
  }).join('');
  return `<figure class="coverage__map">
      <svg viewBox="0 0 ${w.toFixed(0)} ${h.toFixed(0)}" role="img" aria-label="시군구별 실태조사 AI 대체 커버리지">
        <rect class="coverage__frame" x="1" y="1" width="${(w - 2).toFixed(0)}" height="${(h - 2).toFixed(0)}"/>
        ${cells}
      </svg>
      <figcaption>시군 단위 대체율 — 짙을수록 많은 조사를 AI 가 대신한다</figcaption>
    </figure>`;
}

/* ── 우: 시군구 × 조사 매트릭스 ──────────────────────────────────── */
function matrix(rows) {
  const head = `<div class="head">
      <span class="head__corner">시군 \\ 실태조사</span>
      ${SURVEYS.map(s => `<span class="head__label" style="--c:${esc(s.color)}" title="${esc(s.ministry)} · ${esc(s.name)}"><i></i><b>${esc(shortOf(s))}</b></span>`).join('')}
      <span class="head__n mono">대체</span>
    </div>`;
  const body = rows.map(r => {
    const set = new Set(r.done);
    // 셀은 순수 시각 표시다 — 자체 툴팁과 겹치지 않도록 native title 을 달지 않고,
    // 대체된 조사 이름은 행 하나의 aria-label 로 읽힌다.
    const cells = SURVEYS.map(s => `<span class="cell${set.has(s.id) ? ' is-done' : ''}" data-code="${esc(r.code)}" data-survey="${esc(s.id)}" style="--c:${esc(s.color)}" aria-hidden="true"></span>`).join('');
    return `<a class="row" href="${esc(href(r.code))}" data-code="${esc(r.code)}" aria-label="${esc(labelOf(r))}">
      <span class="row__name">${esc(r.name)}</span>${cells}<b class="row__n mono">${r.done.length}</b>
    </a>`;
  }).join('');
  return `<div class="coverage__matrix">${head}${body}</div>`;
}

/* ── 호버 연동 ───────────────────────────────────────────────────── */
function wire(el, rows, highlight) {
  const body = el.querySelector('.coverage__body');
  const tip = el.querySelector('.coverage__tip');
  const meta = Object.fromEntries(rows.map(r => [r.code, r]));
  let active = null;

  const paint = code => {
    el.querySelectorAll('[data-code].is-hover').forEach(n => n.classList.remove('is-hover'));
    if (!code) return;
    // .cell 은 열까지 좁힌 셀이라 행 전체를 켜면 안 된다 — 행·폴리곤만 켠다.
    el.querySelectorAll(`.row[data-code="${code}"],.coverage__cell[data-code="${code}"]`).forEach(n => n.classList.add('is-hover'));
  };
  const setActive = code => {
    if (code === active) return;
    active = code;
    paint(code);
    highlight(code ? p => p.code === code : null);
    const r = code && meta[code];
    if (!r) { tip.hidden = true; return; }
    tip.innerHTML = `<span class="coverage__tip-head"><b>${esc(r.name)}</b> · <span class="mono">${r.done.length}/${N}</span> 조사 AI 대체</span>
      <span class="coverage__tip-list">${r.done.length
        ? r.done.map(d => `<i style="--c:${esc(byId[d].color)}">${esc(shortOf(byId[d]))}</i>`).join('')
        : '<i class="is-none">대체 조사 없음</i>'}</span>`;
    tip.hidden = false;
  };

  body.addEventListener('mouseover', e => {
    const host = e.target.closest('.row[data-code],.coverage__cell[data-code],.cell[data-code]');
    setActive(host && body.contains(host) ? host.dataset.code : null);
  });
  body.addEventListener('mouseleave', () => setActive(null));
  body.addEventListener('mousemove', e => {
    if (tip.hidden) return;
    const b = body.getBoundingClientRect();
    const x = Math.min(Math.max(e.clientX - b.left + 14, 8), b.width - tip.offsetWidth - 8);
    tip.style.transform = `translate(${Math.round(x)}px,${Math.round(e.clientY - b.top - tip.offsetHeight - 12)}px)`;
  });
  // 키보드로 행·폴리곤을 훑을 때도 같은 연동이 걸린다.
  body.addEventListener('focusin', e => {
    const host = e.target.closest('.row[data-code],.coverage__cell[data-code]');
    if (host) setActive(host.dataset.code);
  });
  body.addEventListener('focusout', () => setActive(null));
}
