// 차트 — 헤어라인 SVG 만. 라이브러리 없음, 격자 없음, 그림자 없음, 색 하나.
// 값은 그 자리에 있는 것이 아니라 스윕·카운트업으로 도착한다(§4 차트, §5-8).
import { VISITS, VISITS_TOTAL, STORAGE, PROJECTS, nf } from './db-data.js';
import { countUp, REDUCED } from './db-motion.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const TABS = ['visits', 'storage', 'projects'];
export const TAB_NAME = { visits: '7일 방문', storage: '스토리지', projects: '프로젝트 용량' };

/** 탭 하나를 그린다. 같은 탭을 다시 부르면 다시 도착시킨다. */
export function drawChart(host, tab) {
  host.dataset.tab = tab;
  host.innerHTML = ({ visits, storage, projects })[tab]();
  requestAnimationFrame(() => {
    host.classList.add('is-in');
    host.querySelectorAll('[data-count]').forEach((el) => countUp(el, Number(el.dataset.count), {
      dur: 900,
      fmt: (n) => (el.dataset.dec ? (n / 10).toFixed(1) : nf.format(n)),
    }));
  });
}

/* ── 7일 방문 — 선 하나. 축은 바닥 헤어라인 하나뿐. ─────────────────── */
function visits() {
  const W = 620, H = 200, PAD = 26;
  const max = Math.max(...VISITS.map((v) => v.count));
  const x = (i) => PAD + (i * (W - PAD * 2)) / (VISITS.length - 1);
  const y = (v) => H - 34 - (v / max) * (H - 76);
  const pts = VISITS.map((v, i) => [x(i), y(v.count)]);
  const dLine = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join('');
  const len = Math.round(pts.reduce((a, p, i) => (i ? a + Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) : 0), 0)) + 4;
  const peak = VISITS.reduce((a, v, i) => (v.count > VISITS[a].count ? i : a), 0);
  return `
  <p class="c-lead"><b class="num" data-count="${VISITS_TOTAL}">0</b> 회 · 7일 누적 <span class="caption">최고 ${esc(VISITS[peak].day)}요일 ${nf.format(VISITS[peak].count)}</span></p>
  <svg class="c-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="7일 방문 추이 — ${VISITS.map((v) => `${v.day} ${v.count}`).join(', ')}">
    <line class="c-axis" x1="${PAD}" y1="${H - 34}" x2="${W - PAD}" y2="${H - 34}"/>
    <path class="c-line" d="${dLine}" style="--len:${len}"/>
    ${pts.map((p, i) => `<circle class="c-dot${i === peak ? ' is-peak' : ''}" cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="${i === peak ? 4 : 2.5}" style="--i:${i}"/>`).join('')}
    ${pts.map((p, i) => `<text class="c-val num" x="${p[0].toFixed(1)}" y="${(p[1] - 12).toFixed(1)}" style="--i:${i}">${nf.format(VISITS[i].count)}</text>`).join('')}
    ${VISITS.map((v, i) => `<text class="c-tick num" x="${x(i).toFixed(1)}" y="${H - 14}">${esc(v.day)}</text>`).join('')}
  </svg>`;
}

/* ── 스토리지 — 누적 막대. 액센트 하나 + 회색 계단. ────────────────── */
function storage() {
  const parts = STORAGE.parts;
  const used = STORAGE.used, total = STORAGE.total;
  let acc = 0;
  const segs = parts.map((p, i) => {
    const left = (acc / total) * 100; acc += p.tb;
    return `<i class="c-seg${i === 0 ? ' is-accent' : ''}" style="--l:${left.toFixed(2)}%;--w:${((p.tb / total) * 100).toFixed(2)}%;--i:${i}" title="${esc(p.label)} ${p.tb} TB"></i>`;
  }).join('');
  const rows = parts.map((p, i) => `
    <li style="--i:${i}"><span class="c-key">${esc(p.label)}</span>
      <span class="c-bar"><i class="${i === 0 ? 'is-accent' : ''}" style="--w:${((p.tb / used) * 100).toFixed(2)}%"></i></span>
      <b class="num" data-count="${Math.round(p.tb * 10)}" data-dec="1">0</b><em>TB</em></li>`).join('');
  return `
  <p class="c-lead"><b class="num" data-count="${Math.round(used * 10)}" data-dec="1">0</b> TB 사용 <span class="caption">전체 ${total} TB · 잔여 ${(total - used).toFixed(1)} TB · ${Math.round((used / total) * 100)}%</span></p>
  <div class="c-stack" role="img" aria-label="스토리지 ${used} / ${total} TB">${segs}<i class="c-rest"></i></div>
  <ul class="c-list">${rows}</ul>`;
}

/* ── 프로젝트 용량 — 헤어라인 가로 막대 8. ─────────────────────────── */
function projects() {
  const max = Math.max(...PROJECTS.map((p) => p.gb));
  const sum = PROJECTS.reduce((a, p) => a + p.gb, 0);
  const rows = PROJECTS.slice().sort((a, b) => b.gb - a.gb).map((p, i) => `
    <li style="--i:${i}"><span class="c-key">${esc(p.name)}<i class="label">${esc(p.pid)}</i></span>
      <span class="c-bar"><i class="${i === 0 ? 'is-accent' : ''}" style="--w:${((p.gb / max) * 100).toFixed(2)}%"></i></span>
      <b class="num" data-count="${p.gb}">0</b><em>GB</em></li>`).join('');
  return `
  <p class="c-lead"><b class="num" data-count="${sum}">0</b> GB · 과제 ${PROJECTS.length}건 <span class="caption">최대 ${esc(PROJECTS.reduce((a, p) => (p.gb > a.gb ? p : a)).name)}</span></p>
  <ul class="c-list c-list--tall">${rows}</ul>`;
}

export { REDUCED };
