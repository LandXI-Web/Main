// Land-XI 운영 리포트 — 관리자 대시보드.
// 콘솔이 아니라 리포트다. 좌측은 고정된 목차와 숫자 하나, 우측은 흐르는 판과 헤어라인 표.
// 카드·유리·그림자·라운드 없음. 색은 흰 종이 + 액센트 하나, 앰버는 사건 도착 380ms 만.
import {
  QUEUE, BREATH, HOT_DAYS, KPI, COVERAGE, COLS, CELLS, DONE_CELLS,
  LOG, CHAPTERS, META, EVENTS, T0, NOW, nf,
} from './db-data.js';
import { RESULTS } from '../assets/data/results.js';
import { IMAGERY } from '../assets/data/imagery.js';
import { mountAtlas } from './db-atlas.js';
import { drawChart, TABS, TAB_NAME } from './db-charts.js';
import { mountRuler } from './db-ruler.js';
import { develop, countUp, onceInView, REDUCED } from './db-motion.js';

if (localStorage.getItem('lx_logged_in') !== '1') throw new Error('guard');

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const Q = new URLSearchParams(location.search);

/* 아이콘은 기본 뮤티드 그레이. 호버에서 본문색, 활성에서 액센트(Palantir P12). */
const ICON = {
  card: '<path d="M1.5 3.5h13v9h-13zM1.5 6.5h13M4.5 9.5h4"/>',
  user: '<path d="M8 8.6a2.8 2.8 0 1 0 0-5.6 2.8 2.8 0 0 0 0 5.6zM2.6 13.4c.6-2.5 2.8-3.6 5.4-3.6s4.8 1.1 5.4 3.6"/>',
  inquiry: '<path d="M2 3h12v8H8.6L5.4 13.6V11H2z"/>',
};
const ico = (t) => `<svg class="ic" viewBox="0 0 16 16" aria-hidden="true">${ICON[t] || ''}</svg>`;

/* ── 좌측: 머리글·목차·신선도 ──────────────────────────────────────── */
$('#mast-date').textContent = META.now;

$('#chapters').innerHTML = CHAPTERS.map((c) => `
  <a class="ch-link" href="#${c.sec}" data-sec="${c.id}">
    <i class="num idx">${c.idx}</i><span class="nm">${esc(c.name)}</span><i class="num tally">${c.tally}</i>
  </a>`).join('');

$('#fresh-txt').innerHTML =
  `데이터 ${META.updated} 갱신 · 정사영상 <b class="num">${META.tiles}</b>세트 · 모델 <b class="num">${META.models}</b>종 · 관리자 ${esc(META.admin)}`;
$('#fresh-detail').innerHTML = [
  ['마지막 분석', `${LOG.find((l) => l.who === '시스템' && l.event)?.date || '—'} · 누적 탐지 ${nf.format(META.detections)}건`],
  ['경계 자료', 'sigungu.geojson 249 · sido.geojson 17'],
  ['기록 범위', `${T0} → ${NOW}`],
].map(([k, v]) => `<dt class="label">${esc(k)}</dt><dd class="num">${esc(v)}</dd>`).join('');
$('#fresh-more').addEventListener('click', (e) => {
  const d = $('#fresh-detail');
  d.hidden = !d.hidden;
  e.currentTarget.setAttribute('aria-expanded', String(!d.hidden));
});

/* ── 표지 도판 — 남원 4시점 정사영상. 리포 안의 실제 타일이다. ─────
   §4 영상 처리: 약한 무채화·대비. 호버하면 그 시점만 채도가 돌아온다(선택적 채도).
   축척은 캡션의 GSD 로 말한다 — 장식 숫자가 아니라 해설이다(§5-9). */
const COVER_Z = 17, COVER_X = [111902, 111903], COVER_Y = [51679, 51680];
const EPOCHS = IMAGERY.filter((i) => /^namwon_25/.test(i.id));
$('#cover-strip').innerHTML = EPOCHS.map((e, i) => `
  <figure class="ep" data-id="${e.id}" style="--i:${i}">
    <div class="ep__frame">${COVER_Y.flatMap((y) => COVER_X.map((x) =>
    `<img src="../${e.tiles.replace('{z}', COVER_Z).replace('{x}', x).replace('{y}', y)}" alt="" loading="lazy" decoding="async">`)).join('')}
      <span class="ep__brk" aria-hidden="true"></span></div>
    <figcaption class="num">${esc(e.captured)}<i>GSD ${(e.gsd * 100).toFixed(2)}cm</i></figcaption>
  </figure>`).join('');
$('#cover-fig').textContent =
  `FIG. 00 · 남원시 · 정사영상 ${EPOCHS.length}시점 ${EPOCHS[0].captured} → ${EPOCHS[EPOCHS.length - 1].captured} · z${COVER_Z} 실타일`;
$('#cover-note').textContent =
  `같은 프레임을 네 번 찍었다 — 4월의 마른 논이 10월에는 다른 색이다. 정사영상 ${META.tiles}세트 · 모델 ${META.models}종 · 누적 탐지 ${nf.format(META.detections)}건.`;

/* ── 01 처리 대기 큐 — 헤어라인 줄. 표가 아니라 줄이다. ───────────── */
/** 이 지점을 품는 실제 분석 결과. 클릭 전에 규모를 알려 준다(Palantir P3). */
function linked([lng, lat]) {
  return RESULTS
    .filter((r) => { const b = r.stats.bbox; return b && lng >= b[0] - 0.15 && lng <= b[2] + 0.15 && lat >= b[1] - 0.15 && lat <= b[3] + 0.15; })
    .map((r) => ({ title: r.title, n: r.stats.count, unit: r.unit }));
}

$('#queue').innerHTML = QUEUE.map((q) => {
  const link = linked(q.lnglat);
  return `
  <div class="q${q.hot ? ' is-hot' : ''}${q === BREATH ? ' is-breath' : ''}" role="listitem" data-i="${q.i}" data-date="${q.date}">
    <button type="button" class="q__row" aria-expanded="false" aria-controls="qd-${q.i}">
      ${ico(q.type)}
      <span class="q__type label">${esc(q.typeName)}</span>
      <span class="q__ttl">${esc(q.title)}</span>
      <span class="q__st label">${esc(q.status)}</span>
      <span class="q__age num">${q.age}<i>일</i></span>
    </button>
    <div class="q__d" id="qd-${q.i}" hidden>
      <div class="q__grid">
        <dl>
          <dt class="label">접수</dt><dd class="num">${q.date}</dd>
          <dt class="label">대기</dt><dd class="num">${q.age}일${q.hot ? ` · ${HOT_DAYS}일 초과` : ''}</dd>
          <dt class="label">좌표</dt><dd class="num">${q.lnglat[1].toFixed(4)}, ${q.lnglat[0].toFixed(4)}</dd>
        </dl>
        <p class="q__sub">${esc(q.sub)}</p>
      </div>
      <div class="q__linked">
        <p class="label">연결된 객체 ${link.length}종</p>
        ${link.length
      ? `<ul>${link.map((l) => `<li><span>${esc(l.title)}</span><b class="num">${nf.format(l.n)}</b><em>${esc(l.unit)}</em></li>`).join('')}</ul>`
      : '<p class="q__none">이 좌표를 품는 분석 결과가 아직 없다 — 현장 조사 구간</p>'}
      </div>
      <p class="q__act"><a class="bracket" href="#sec-cov">${esc(q.act)}</a><a class="bracket" href="?region=${encodeURIComponent(q.lnglat.join(','))}">지도에서 열기</a></p>
    </div>
  </div>`;
}).join('');

$('#q-total').textContent = QUEUE.length;
$('#q-fig').textContent =
  `FIG. 01 · 처리 대기 ${QUEUE.length}건 · ${HOT_DAYS}일 초과 ${QUEUE.filter((q) => q.hot).length}건 · 최장 ${QUEUE[0].age}일 · 기준 ${NOW}`;

$('#queue').addEventListener('click', (e) => {
  const btn = e.target.closest('.q__row');
  if (!btn) return;
  const row = btn.parentElement;
  const d = row.querySelector('.q__d');
  const open = d.hidden;
  // 한 번에 하나만 — 인라인 상세는 쌓이지 않는다.
  $$('#queue .q__d').forEach((x) => { x.hidden = true; x.previousElementSibling.setAttribute('aria-expanded', 'false'); x.parentElement.classList.remove('is-open'); });
  d.hidden = !open;
  btn.setAttribute('aria-expanded', String(open));
  row.classList.toggle('is-open', open);
});

/* ── 02 지표 — 124px / 52px 숫자 넷. 카드 없음. ────────────────────── */
$('#kpis').innerHTML = KPI.map((k) => `
  <div class="k k--${k.size}" data-i="${k.i}"${k.tab ? ` data-tab="${k.tab}"` : ''}>
    <p class="k__v stat num" data-target="${k.value}">0</p>
    <p class="k__l">${esc(k.label)}<i class="unit">${esc(k.unit)}</i></p>
    <p class="k__s caption">${esc(k.sub)}</p>
  </div>`).join('');

onceInView($('#kpis'), () => {
  $$('#kpis .k__v').forEach((el, i) => setTimeout(() => countUp(el, Number(el.dataset.target), { dur: 900 }), i * 120));
});

/* 차트 — 탭은 딥링크다(?tab=). */
$('#chart-tabs').innerHTML = TABS.map((t) => `
  <button type="button" role="tab" data-tab="${t}" aria-selected="false" aria-controls="chart">${esc(TAB_NAME[t])}</button>`).join('');

let tab = TABS.includes(Q.get('tab')) ? Q.get('tab') : TABS[0];
function setTab(t, push = false) {
  tab = t;
  $$('#chart-tabs button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === t)));
  $('#chart').classList.remove('is-in');
  drawChart($('#chart'), t);
  $('#c-fig').textContent = `FIG. 02 · ${TAB_NAME[t]} · 출처 assets/data/dashboard.js · 기준 ${NOW}`;
  if (push) {
    const u = new URL(location.href);
    u.searchParams.set('tab', t);
    history.replaceState(null, '', u);
  }
}
$('#chart-tabs').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-tab]');
  if (b) setTab(b.dataset.tab, true);
});
$('#kpis').addEventListener('click', (e) => {
  const k = e.target.closest('.k[data-tab]');
  if (k) { setTab(k.dataset.tab, true); $('#charts').scrollIntoView({ behavior: REDUCED() ? 'auto' : 'smooth', block: 'center' }); }
});
setTab(tab);

/* ── 03 전국 커버리지 ─────────────────────────────────────────────── */
$('#cov-fig').textContent =
  `FIG. 03 · 전국 시군구 실경계 249 · 실증 ${COVERAGE.length} 시군 · 농도 = 커버리지 · 투영 등장방형(cos φ 보정)`;
$('#mat-fig').textContent =
  `FIG. 04 · 시군 ${COVERAGE.length} × 실태조사 ${COLS.length} = ${CELLS}칸 · AI 대체 ${DONE_CELLS}칸 (${Math.round((DONE_CELLS / CELLS) * 100)}%)`;

let atlas = null;
mountAtlas($('#sec-cov')).then((a) => {
  atlas = a;
  const region = Q.get('region');
  if (region && a.codes().includes(region)) a.highlight(region, 'matrix');
  requestAnimationFrame(() => { gotoSec(); document.documentElement.dataset.atlas = 'ready'; });
}).catch((e) => console.warn('[dash] 커버리지 판 실패:', e.message));

$('#matrix').addEventListener('click', (e) => {
  const a = e.target.closest('a[data-region]');
  if (!a) return;
  e.preventDefault();
  const u = new URL(location.href);
  u.searchParams.set('region', a.dataset.region);
  history.replaceState(null, '', u);
  atlas?.highlight(a.dataset.region, 'matrix');
});

/* ── 04 활동 기록 — 날짜가 붙은 헤어라인 연표. ────────────────────── */
$('#log').innerHTML = LOG.map((l, i) => `
  <li class="tl__i${l.event ? ' is-event' : ''}" data-date="${l.date}" data-i="${i}">
    <time class="num" datetime="${l.date}">${l.date}</time>
    <span class="tl__w">${esc(l.who)}</span>
    <p class="tl__t">${esc(l.text)}</p>
    <p class="tl__m caption">${esc(l.meta || '')}</p>
  </li>`).join('');
$('#log-fig').textContent = `FIG. 05 · 기록 ${LOG.length}줄 · 사건 ${EVENTS.length} · ${T0} → ${NOW}`;

/* ── 시간 자 + 감쇠 ───────────────────────────────────────────────── */
const dated = $$('[data-date]').map((el) => ({ el, d: el.dataset.date }));
const ruler = mountRuler($('#ruler'), {
  onTick: (date) => {
    for (const x of dated) x.el.classList.toggle('is-dim', x.d > date);
  },
  onEvent: (ev) => {
    $$('#log .tl__i').forEach((li) => li.classList.toggle('is-now', !!ev && li.dataset.date === ev.date && li.querySelector('.tl__t').textContent === ev.label));
  },
});

/* ── 좌측 124px 숫자를 장에 묶는다 ────────────────────────────────── */
const chapByEl = new Map(CHAPTERS.map((c) => [$('#' + c.sec), c]));
let cur = null;
function showChapter(c) {
  if (!c || c === cur) return;
  cur = c;
  $('#head-label').textContent = c.label;
  $('#head-sub').textContent = c.sub;
  const n = Number(String(c.stat).replace(/,/g, ''));
  const el = $('#head-stat');
  if (Number.isFinite(n)) { el.dataset.shown = ''; countUp(el, n, { dur: 750 }); }
  else develop(el, c.stat);
  $$('#chapters .ch-link').forEach((a) => a.classList.toggle('is-on', a.dataset.sec === c.id));
  document.documentElement.dataset.sec = c.id;
}

// 읽는 눈이 있는 높이(뷰포트 42%)를 지나는 장이 그 순간의 장이다.
// 교차 비율로 고르면 긴 장(커버리지 판)이 짧은 장을 삼킨다.
const secList = CHAPTERS.map((c) => ({ c, el: $('#' + c.sec) }));
let queued = false;
function pickChapter() {
  queued = false;
  const line = window.innerHeight * 0.42;
  let best = secList[0].c;
  for (const { c, el } of secList) {
    const r = el.getBoundingClientRect();
    if (r.top > line) break;
    best = c;
    if (r.bottom > line) break;
  }
  showChapter(best);
}
addEventListener('scroll', () => { if (!queued) { queued = true; requestAnimationFrame(pickChapter); } }, { passive: true });
addEventListener('resize', pickChapter, { passive: true });
pickChapter();

/* 헤드라인 리빌 — 관찰 대상은 부모다. clip-path 로 눌린 자기 자신은 교차 면적이 0이라 절대 켜지지 않는다. */
$$('.reveal').forEach((el) => onceInView(el.parentElement || el, () => el.classList.add('is-in'), '0px 0px -12% 0px'));

/* 딥링크 ?sec= */
const sec = Q.get('sec');
const secTarget = sec ? CHAPTERS.find((x) => x.id === sec) : null;
/** 판이 다 그려지면 문서가 길어진다 — 딥링크는 그 뒤에 한 번 더 자리를 잡아야 한다. */
function gotoSec() {
  if (!secTarget) return;
  // CSS scroll-behavior:smooth 가 'auto' 를 삼킨다 — 딥링크는 즉시 착지해야 한다.
  $('#' + secTarget.sec).scrollIntoView({ behavior: 'instant', block: 'start' });
  pickChapter();
}
requestAnimationFrame(gotoSec);
/* 딥링크 ?q= (큐 항목 인라인 펼침) */
const qRaw = Q.get('q');
if (qRaw !== null && /^\d+$/.test(qRaw)) $(`#queue .q[data-i="${qRaw}"] .q__row`)?.click();

/* ── 테스트·디버그 훅 ─────────────────────────────────────────────── */
window.__db = {
  ready: true,
  tab: () => tab,
  kpi: () => $$('#kpis .k__v').map((el) => Number(el.textContent.replace(/[^\d]/g, ''))),
  kpiTargets: () => KPI.map((k) => k.value),
  cells: () => $$('#matrix .cell').length,
  hot: () => $('#sec-cov')?.dataset.hot || '',
  litCodes: () => $$('#atlas path.a-lit').map((p) => p.dataset.code),
  sigungu: () => atlas?.count() ?? 0,
  chapter: () => cur?.id,
  headStat: () => $('#head-stat').textContent,
  queue: () => QUEUE.length,
  dimmed: () => $$('.is-dim').length,
  ruler,
  highlight: (code) => atlas?.highlight(code, 'matrix'),
  setTab,
};
document.documentElement.dataset.db = 'ready';
