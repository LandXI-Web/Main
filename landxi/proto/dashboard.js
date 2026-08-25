// LX 관리자 대시보드 — A안 "지도 위 원장".
// 규칙 두 가지만 지킨다.
//  1) 기능은 원본과 1:1 이다. 원본 https://mini531.github.io/namwon-smart-village/landxi7/dashboard.html
//     의 레일 A1–A11 · 위젯 B1–B16 이 전부이고, 표에 없는 기능은 만들지 않는다.
//     (대조표: docs/superpowers/proto/2026-08-26-dashboard-parity.md)
//  2) 지도는 새 위젯이 아니라 그 위젯들을 조판하는 **바탕**이다. 판 위에 남는 것은
//     실제 분석 결과와 헤어라인 계기뿐 — 불투명 격자도, 레지스터 탭도 없다.
import {
  nf, ymd, DATA_ASOF, DONE, doneById, IMG, MODEL_LIST, BACKBONE, KPI,
  NAV, NAV_FOOT, NAV_MY, NOTICE, APPROVALS, ADMIN_TILES, PROJECTS, VISITS, VISITS_TOTAL,
  STORAGE, AOI_EPOCHS, CHANGE_PAIRS, gsdText, CRS, TOTAL_OBJECTS,
} from './db-data.js';
import { mountPlate, dotsOf, bboxOf, fc } from './db-plate.js';
import { mountStrip } from './db-strip.js';
import { rankedBar, sparkline, donut } from './db-charts.js';
import { CROPS } from '../assets/data/crops.js';

const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const REDUCED = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const stamp = () => new Date().toISOString().slice(0, 19).replace('T', ' ') + 'Z';
const cssPx = (n, d) => parseFloat(getComputedStyle(document.documentElement).getPropertyValue(n)) || d;

/* ══ A1–A11 좌측 레일 ═══════════════════════════════════════════════════
   원본 include/header.html 의 메뉴 구조 그대로. 원본 페이지가 이 저장소에 없으므로
   링크를 지어내지 않고, 같은 데이터가 있는 우리 자리(원장 블록 · 지도 카메라)로 보낸다. */
const RAIL_ICON = {
  dash: '<rect x="3" y="3" width="7" height="9"/><rect x="14" y="3" width="7" height="5"/><rect x="14" y="12" width="7" height="9"/><rect x="3" y="16" width="7" height="5"/>',
  data: '<rect x="10" y="10" width="4" height="4"/><path d="M10 10L6 6M14 10l4-4M10 14l-4 4M14 14l4 4"/><circle cx="6" cy="6" r="2"/><circle cx="18" cy="6" r="2"/><circle cx="6" cy="18" r="2"/><circle cx="18" cy="18" r="2"/>',
  proj: '<path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>',
  run: '<polygon points="5 3 19 12 5 21 5 3"/>',
  map: '<polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/><line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/>',
  help: '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
  stack: '<polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06A1.65 1.65 0 004.6 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06A1.65 1.65 0 009 4.6a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>',
  my: '<path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/>',
};
const railIcon = (k) => `<svg class="ri-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${RAIL_ICON[k] || ''}</svg>`;
const railItem = (n) => `
  <button type="button" class="rail-i" data-menu="${n.menu}" data-to="${n.to || ''}"
    title="원본 ${n.href}"${n.menu === 'dashboard' ? ' aria-current="page"' : ''}>${railIcon(n.icon)}<span class="rl">${esc(n.name)}</span></button>`;

$('#rail-top').innerHTML = NAV.map(railItem).join('');
$('#rail-foot').innerHTML = NAV_FOOT.map(railItem).join('')
  + `<div class="rail-i rail-my" data-menu="my">${railIcon('my')}<span class="rl">MY</span>
       <div class="rail-fly">${NAV_MY.map((m) => (m.action
    ? `<button type="button" data-action="${m.action}">${esc(m.name)}</button>`
    : `<a href="${esc(m.href)}">${esc(m.name)}</a>`)).join('')}</div>
     </div>`;

/* ══ 원장 B1 → B15 (원본 순서 그대로) ═══════════════════════════════════ */
$('#b2').innerHTML = `<span class="num">${DATA_ASOF}</span> 기준일 현재`;

const AOI0 = AOI_EPOCHS[0] || null;
const kpiHTML = KPI.map((k, i) => `
  <button type="button" class="k" data-kpi="${i}" title="원본 ${esc(k.href)}">
    <span class="k__l">${esc(k.label)}</span>
    <span class="k__v num" data-cu="${k.value}"><span class="n">0</span><em>${esc(k.unit)}</em></span>
    <span class="k__s">${esc(k.sub)}</span>
  </button>`).join('');

$('#led-body').innerHTML = `
<section class="fg">
  <p class="fg__h" id="b-notice"><b>공지</b><a class="rt rt--a" href="../notice.html">전체 보기 ›</a></p>
  <div class="rows">
    <a class="row is-link" href="../notice.html?notice=${NOTICE.id}">
      <i class="dot dot--warn"></i>
      <span class="t">${esc(NOTICE.title)}</span>
      <span class="v num">${ymd(NOTICE.date)}</span>
    </a>
  </div>

  <p class="fg__h" id="b-kpi"><b>운영 지표</b><span class="rt">KPI 5</span></p>
  <div class="kpis">${kpiHTML}</div>

  <p class="fg__h" id="b-bb"><b>AI 기반 모델 (백본)</b></p>
  <div class="bb">
    <p class="bb__n"><b>${esc(BACKBONE.name)}</b> <span class="num">${esc(BACKBONE.ver)}</span></p>
    <dl class="bb__m">
      <dt>최종 적용</dt><dd class="num">${esc(BACKBONE.applied)}</dd>
      <dt>연결된 분석 과제</dt><dd class="num">${BACKBONE.tasks}<em>개</em></dd>
    </dl>
    <p class="label prov__h">프로비넌스</p>
    <dl class="bb__m prov">
      <dt>모델</dt><dd class="num">${MODEL_LIST.length}종 · .pt</dd>
      <dt>GSD</dt><dd class="num">${esc(AOI0 ? gsdText(AOI0) : '—')}</dd>
      <dt>촬영</dt><dd class="num">${esc(AOI0 ? AOI0.captured.replace('-', '.') : '—')}</dd>
      <dt>좌표계</dt><dd class="num">${CRS}</dd>
      <dt>생성시각</dt><dd class="num">${stamp()}</dd>
    </dl>
  </div>

  <p class="fg__h" id="b-proj"><b>AI 개발 프로젝트 현황</b><a class="rt rt--a" href="../ai-project.html">전체 보기 ›</a></p>
  <div class="tile" id="t-proj"></div>
  <p class="fg__h" id="b-visit"><b>사용자 이용 현황</b><span class="rt">최근 7일 방문</span></p>
  <div class="tile" id="t-visit"></div>
  <p class="fg__h" id="b-store"><b>전체 스토리지 사용량</b></p>
  <div class="tile" id="t-store"></div>

  <p class="fg__h" id="b-result"><b>분석 결과</b> · <span class="num">${DONE.length}</span>건 <i class="tag tag--meas">측정</i><span class="rt">객체 수</span></p>
  <div class="rows" id="res-rows" role="list"></div>

  <p class="fg__h" id="b-approve"><b>카드 발행 승인 대기</b> · <span class="num">${APPROVALS.length}</span>건<a class="rt rt--a" href="../admin-publish.html">카드 발행 관리 ›</a></p>
  <div class="rows" id="ap-rows" role="list"></div>

  <p class="fg__h" id="b-admin"><b>사용자 · 콘텐츠 관리</b></p>
  <div class="rows" id="ad-rows" role="list"></div>
</section>`;

$('#led-foot').innerHTML = `
  <p class="caption">LX 한국국토정보공사 · 고객센터 <span class="num">063-713-1213</span></p>
  <p class="caption">수치 출처 <span class="num">assets/data/{results,models,imagery,crops,dashboard}.js</span></p>
  <p class="caption">GDAL 이 정합했고 모델이 판정했으며 폴리곤은 사람이 눈으로 확인했다.</p>`;

/* B10 · B11 · B12 — 형태가 서로 다른 스탯 타일 3종(균일 카드 그리드 금지). */
$('#t-proj').innerHTML = rankedBar(PROJECTS);
$('#t-visit').innerHTML = sparkline(VISITS, VISITS_TOTAL);
$('#t-store').innerHTML = donut(STORAGE);

/* 분석 결과 4건 — 지도 위 개체의 목록. 원본 `분석 서비스`(A5)가 가리키는 실측 산출물. */
$('#res-rows').innerHTML = DONE.map((r) => `
  <button type="button" class="row" role="listitem" data-res-row="${r.id}">
    <i class="dot dot--m"></i>
    <span class="t">${esc(r.title)}</span>
    <span class="v num">${nf.format(r.count)}<em>${esc(r.unit)}</em></span>
    <span class="s num">${esc(r.region)} · ${esc(r.sensor)} · ${ymd(r.date)}</span>
  </button>`).join('');

/* B13 — 원본 CARD_APPROVALS 2건 */
$('#ap-rows').innerHTML = APPROVALS.length ? APPROVALS.map((a) => `
  <button type="button" class="row" role="listitem" data-ap="${a.i}">
    <i class="dot"></i>
    <span class="t">${esc(a.title)}</span>
    <span class="v num">검토</span>
    <span class="s num">${esc(a.requester)} · ${esc(a.at)}</span>
  </button>`).join('') : '<p class="caption empty">승인 대기 중인 카드가 없습니다.</p>';

/* B14 — 원본 support-grid 4타일 */
$('#ad-rows').innerHTML = ADMIN_TILES.map((t) => `
  <div class="row is-static" role="listitem" title="원본 ${esc(t.href)}">
    <i class="dot dot--o"></i>
    <span class="t">${esc(t.name)}</span>
    <span class="s num">${esc(t.desc)}</span>
  </div>`).join('');

/* ══ 판 ═════════════════════════════════════════════════════════════════ */
const PLATE = await mountPlate($('#plate'));
const map = PLATE.map;

const padded = () => ({ left: cssPx('--rail', 54) + cssPx('--led', 372) + 24, top: 120, bottom: 150, right: 24 });
map.setPadding(padded());
addEventListener('resize', () => map.setPadding(padded()));

$('#fresh-t').innerHTML = `<i class="live"></i> V-WORLD 위성 정사영상 · 정사영상 <span class="num">${IMG.length}</span>종 · 데이터 기준 <span class="num">${DATA_ASOF}</span>`;

/** 카메라가 멈추고 목적지 타일이 다 올 때까지 기다렸다가 알린다. */
function whenSettled(done, timeout = 4000) {
  const t0 = performance.now();
  const poll = () => {
    if (map.areTilesLoaded() || performance.now() - t0 > timeout) { done(); return; }
    setTimeout(poll, 120);
  };
  map.once('moveend', poll);
}
function flyGated(opts, done) {
  map.flyTo({ duration: REDUCED() ? 0 : 1400, essential: true, ...opts });
  if (done) whenSettled(done);
}
const KOREA = { center: [127.55, 35.15], zoom: 7.2, pitch: 0, bearing: 0 };

/* ── 부유 요소 ────────────────────────────────────────────────────────── */
const cardEl = $('#card');
const probeEl = $('#probe');
function showCard({ kind, title, rows, img, prov }) {
  cardEl.hidden = false;
  cardEl.innerHTML = `
    <div class="ch"><span class="label">${esc(kind)}</span><button type="button" aria-label="닫기">×</button></div>
    ${img ? `<img src="${esc(img)}" alt="">` : ''}
    <div class="cb"><h3>${esc(title)}</h3><dl>${rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${v}</dd>`).join('')}</dl></div>
    ${prov ? `<p class="cf">출처 ${esc(prov)}</p>` : ''}`;
  cardEl.querySelector('button').addEventListener('click', () => { cardEl.hidden = true; });
}
function showProbe(x, y, html) {
  probeEl.hidden = false;
  probeEl.innerHTML = html;
  const r = probeEl.getBoundingClientRect();
  probeEl.style.left = `${Math.min(innerWidth - r.width - 10, x + 14)}px`;
  probeEl.style.top = `${Math.min(innerHeight - r.height - 150, y + 14)}px`;
}
const hideProbe = () => { probeEl.hidden = true; };

/* ══ 결과 4건 — 지도 위의 유일한 데이터 ═════════════════════════════════ */
const GEO = {};                         // id → geojson (한 번만 받는다)
const STATE = { sel: null, thr: 0, pass: 0 };

async function geoOf(id) {
  if (GEO[id]) return GEO[id];
  GEO[id] = await fetch(doneById(id).geojson).then((x) => x.json());
  return GEO[id];
}

const confOf = (f) => {
  const p = f.properties || {};
  const v = p.conf ?? p.confidence ?? p.score;
  return typeof v === 'number' ? v : null;
};

/** 신뢰도 임계 — 미달은 삭제가 아니라 감쇠다. 숫자는 즉시 다시 센다. */
function applyThreshold() {
  const r = STATE.sel && doneById(STATE.sel);
  if (!r || !GEO[r.id]) return;
  const t = STATE.thr;
  const pass = GEO[r.id].features.filter((f) => {
    const c = confOf(f);
    return c == null ? true : c >= t;
  });
  STATE.pass = pass.length;
  const poly = fc(pass);
  PLATE.setRes(poly, dotsOf(poly));
  const el = $('#thr-n');
  if (el) el.textContent = nf.format(pass.length);
  $('#flag').innerHTML = `<i class="fl"></i> 지금 지도가 보는 것 — <b>${esc(r.title)}</b> · ${esc(r.sensor)} · ${ymd(r.date)} · <span class="num">${nf.format(pass.length)}</span> / ${nf.format(r.count)}${esc(r.unit)}`;
}

/** 임계 드래그 범례 — 슬라이더가 아니라 실제 히스토그램 위의 마커. */
function mountThreshold(r) {
  const box = $('#thr');
  if (!r.confHist || !r.confHist.length) { box.hidden = true; STATE.thr = 0; return; }
  box.hidden = false;
  const h = r.confHist;
  const max = Math.max(...h) || 1;
  const W = 100, H = 26;
  const bw = W / h.length;
  const bars = h.map((v, i) => `<rect x="${(i * bw).toFixed(2)}" y="${(H - (v / max) * H).toFixed(2)}" width="${Math.max(0.6, bw - 0.35).toFixed(2)}" height="${((v / max) * H).toFixed(2)}"/>`).join('');
  box.innerHTML = `
    <p class="caption thr__h">신뢰도 임계 <span class="num" id="thr-v">0.00</span><span class="thr__sp"></span>통과 <span class="num" id="thr-n">—</span>${esc(r.unit)}</p>
    <div class="thr__p">
      <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">${bars}</svg>
      <i id="thr-m"></i>
      <input type="range" id="thr-r" min="0" max="1" step="0.01" value="0" aria-label="신뢰도 임계">
    </div>
    <p class="caption thr__f">분포 <span class="num">${(r.confMin ?? 0).toFixed(2)}</span>–<span class="num">${(r.confMax ?? 1).toFixed(2)}</span> · 평균 <span class="num">${(r.conf ?? 0).toFixed(3)}</span></p>`;
  const rg = $('#thr-r');
  const rects = [...box.querySelectorAll('rect')];
  const set = () => {
    STATE.thr = +rg.value;
    $('#thr-v').textContent = STATE.thr.toFixed(2);
    $('#thr-m').style.left = `${STATE.thr * 100}%`;
    rects.forEach((x, i) => x.classList.toggle('off', (i + 0.5) / h.length < STATE.thr));
    applyThreshold();
  };
  rg.addEventListener('input', set);
  set();
}

/** 벡터 추출 카드 — "이 정사영상에서 뽑아낸 게 이겁니다"를 한 액자 안에서. */
function mountVectorCard(r) {
  const card = $('#vcard');
  const crop = (CROPS[r.id] || [])[0];
  if (!crop) { card.hidden = true; return; }
  card.hidden = false;
  card.innerHTML = `
    <figcaption class="caption vc__c">${esc(r.region)} · ${esc(r.sensor)} · ${ymd(r.date)} · GSD <span class="num">${crop.gsd ? (crop.gsd * 100).toFixed(1) : '—'}</span> cm</figcaption>
    <div class="vc__pair">
      <span class="vc__f"><img src="../${esc(crop.clean || crop.file)}" alt=""><i class="bk bk--tl"></i><i class="bk bk--br"></i></span>
      <span class="vc__f"><img src="../${esc(crop.file)}" alt=""><i class="bk bk--tl"></i><i class="bk bk--br"></i></span>
    </div>
    <p class="caption vc__n"><span>정사영상</span><span>추출 벡터 · ${esc(crop.cls || r.title)}${crop.conf ? ` <span class="num">${crop.conf.toFixed(3)}</span>` : ''}</span></p>`;
}

/* 락온 3비트 — 브래킷 180ms → 확정 80ms → 라벨 120ms. 이미지 안쪽 6px. */
const lock = document.createElement('div');
lock.id = 'lock';
lock.hidden = true;
lock.innerHTML = '<i class="bk bk--tl"></i><i class="bk bk--tr"></i><i class="bk bk--bl"></i><i class="bk bk--br"></i><b class="lb caption"></b>';
document.body.appendChild(lock);

function placeLock() {
  const r = STATE.sel && doneById(STATE.sel);
  if (!r || !GEO[r.id]) { lock.hidden = true; return; }
  const bb = bboxOf(GEO[r.id]) || r.bbox;
  const a = map.project([bb[0], bb[3]]);
  const b = map.project([bb[2], bb[1]]);
  const x = Math.min(a.x, b.x) - 8;
  const y = Math.min(a.y, b.y) - 8;
  const w = Math.abs(b.x - a.x) + 16;
  const h = Math.abs(b.y - a.y) + 16;
  const L = cssPx('--rail', 54) + cssPx('--led', 372);
  if (w < 30 || h < 30 || x + w < L || x > innerWidth || y + h < 0 || y > innerHeight) { lock.hidden = true; return; }
  lock.hidden = false;
  lock.style.left = `${x}px`;
  lock.style.top = `${y}px`;
  lock.style.width = `${w}px`;
  lock.style.height = `${h}px`;
  lock.querySelector('.lb').textContent = `${r.region} · ${ymd(r.date)}`;
}
function lockOn() {
  placeLock();
  if (lock.hidden) return;
  if (REDUCED()) { lock.classList.add('is-on', 'is-fix'); return; }
  lock.classList.remove('is-on', 'is-fix');
  requestAnimationFrame(() => {
    lock.classList.add('is-on');
    setTimeout(() => lock.classList.add('is-fix'), 180);
  });
}
map.on('move', placeLock);

/** 결과 하나를 판 위에 세운다. */
async function selectResult(id, fly = true) {
  const r = doneById(id);
  if (!r) return;
  STATE.sel = id;
  document.querySelectorAll('[data-res-row]').forEach((b) => b.classList.toggle('is-sel', b.dataset.resRow === id));
  const geo = await geoOf(id);
  const bb = bboxOf(geo) || r.bbox;
  PLATE.setChange(null);
  mountThreshold(r);
  mountVectorCard(r);
  applyThreshold();
  if (fly) {
    map.fitBounds([[bb[0], bb[1]], [bb[2], bb[3]]], { padding: 70, duration: REDUCED() ? 0 : 1400 });
    whenSettled(lockOn);
  } else lockOn();
}

/* ══ 취득 밀도 스캔 스트립 ══════════════════════════════════════════════
   축 = 남원 농경지 정사영상 4시점(실제 촬영월). 무채 틱 = 취득, 앰버 틱 = 변화 급변.
   틱을 누르면 카메라가 그 범위로 간다 — 차트가 곧 컨트롤이다. */
function mountScan() {
  const eps = AOI_EPOCHS;
  if (!eps.length) return;
  $('#scan-h').innerHTML = `남원 농경지 정사영상 취득 <span class="num">${eps.length}</span>시점 · 변화 지수(비지도) <span class="num">${CHANGE_PAIRS.length}</span>쌍`;
  const n = eps.length;
  const pos = (i) => (n === 1 ? 50 : (i / (n - 1)) * 100);
  $('#scan-bar').innerHTML =
    eps.map((e, i) => `<button type="button" class="tk" style="left:${pos(i)}%" data-ep="${e.id}" title="${esc(e.label)} · GSD ${esc(gsdText(e))}"><i></i></button>`).join('')
    + CHANGE_PAIRS.map((c) => {
      const i = eps.findIndex((e) => e.captured === c.to);
      return i < 0 ? '' : `<button type="button" class="tk tk--chg" style="left:${pos(i)}%" data-chg="${c.pair}" title="${esc(c.label)} · ${esc(c.method)}"><i></i></button>`;
    }).join('');
  $('#scan-ax').innerHTML = eps.map((e, i) => `<span style="left:${pos(i)}%">${esc(e.captured.replace('-', '.'))}</span>`).join('');

  $('#scan-bar').addEventListener('click', async (ev) => {
    const t = ev.target.closest('.tk');
    if (!t) return;
    $('#scan-bar').querySelectorAll('.tk').forEach((x) => x.classList.toggle('is-on', x === t));
    if (t.dataset.ep) {
      const e = eps.find((x) => x.id === t.dataset.ep);
      PLATE.setChange(null);
      flyGated({ center: [(e.bounds[0] + e.bounds[2]) / 2, (e.bounds[1] + e.bounds[3]) / 2], zoom: 15.4 }, () => showCard({
        kind: '정사영상 · 측정',
        title: e.label,
        rows: [['GSD', esc(gsdText(e))], ['촬영', esc(e.captured.replace('-', '.'))], ['좌표계', CRS],
          ['타일', esc(e.zSpan)], ['생성시각', stamp()]],
        prov: 'imagery.js · assets/tiles',
      }));
    } else {
      const c = CHANGE_PAIRS.find((x) => x.pair === t.dataset.chg);
      const g = await fetch(c.polygons).then((x) => x.json());
      PLATE.setChange(g);
      flyGated({ center: [(c.bounds[0] + c.bounds[2]) / 2, (c.bounds[1] + c.bounds[3]) / 2], zoom: 15.2 });
      $('#flag').innerHTML = `<i class="fl fl--e"></i> 지금 지도가 보는 것 — <b>${esc(c.label)}</b> · ${esc(c.method)} <em>추정</em>`;
    }
  });
}

/* ══ 카운트업 — KPI 값이 "도착"한다 ════════════════════════════════════ */
function countUp() {
  const els = [...document.querySelectorAll('[data-cu]')];
  const set = (el, v) => { el.querySelector('.n').textContent = nf.format(v); };
  if (REDUCED()) { els.forEach((e) => set(e, +e.dataset.cu)); return; }
  const t0 = performance.now();
  const D = 900;
  (function step(t) {
    const k = Math.min(1, (t - t0) / D);
    const e4 = 1 - (1 - k) ** 4;
    els.forEach((el) => set(el, Math.round(+el.dataset.cu * e4)));
    if (k < 1) requestAnimationFrame(step);
  })(t0);
}

/* ══ 결선 ═══════════════════════════════════════════════════════════════ */
function ledgerTo(id) {
  const t = document.getElementById(id);
  if (!t) return;
  $('#ledger').scrollTo({ top: t.offsetTop - 4, behavior: REDUCED() ? 'auto' : 'smooth' });
  t.classList.remove('is-ping');
  requestAnimationFrame(() => t.classList.add('is-ping'));
}

$('#rail').addEventListener('click', (ev) => {
  const lo = ev.target.closest('[data-action="logout"]');
  if (lo) { try { localStorage.removeItem('lx_logged_in'); } catch (e) { /* 저장소 차단 */ } location.href = '../home.html'; return; }
  const b = ev.target.closest('.rail-i[data-menu]');
  if (!b || b.classList.contains('rail-my')) return;
  document.querySelectorAll('.rail-i').forEach((x) => x.removeAttribute('aria-current'));
  b.setAttribute('aria-current', 'page');
  if (b.dataset.menu === 'dashboard') {
    $('#ledger').scrollTo({ top: 0, behavior: REDUCED() ? 'auto' : 'smooth' });
    flyGated(KOREA);
    return;
  }
  if (b.dataset.to) ledgerTo(b.dataset.to);
});

$('#ledger').addEventListener('click', (ev) => {
  const k = ev.target.closest('[data-kpi]');
  if (k) { const it = KPI[+k.dataset.kpi]; if (it.to) ledgerTo(it.to); return; }
  const rr = ev.target.closest('[data-res-row]');
  if (rr) { selectResult(rr.dataset.resRow); return; }
  const a = ev.target.closest('[data-ap]');
  if (a) {
    const it = APPROVALS[+a.dataset.ap];
    flyGated({ center: it.lnglat, zoom: 12.6 }, () => showCard({
      kind: '카드 발행 승인 대기 · 시연',
      title: it.title,
      rows: [['요청자', esc(it.requester)], ['요청 시각', esc(it.at)], ['내용', esc(it.sub)],
        ['좌표', it.lnglat.map((x) => x.toFixed(3)).join(', ')]],
      prov: `원본 admin-publish.html?open=${it.id} · assets/data/dashboard.js(시연)`,
    }));
  }
});

$('#allmap').addEventListener('click', () => {
  PLATE.setChange(null);
  flyGated(KOREA);
  lock.hidden = true;
});

/* ══ 지도 위 상호작용 ═══════════════════════════════════════════════════ */
map.on('mousemove', (ev) => {
  const feats = map.queryRenderedFeatures(ev.point, { layers: ['pin-dot', 'res-fill'].filter((l) => map.getLayer(l)) });
  map.getCanvas().style.cursor = feats.length ? 'pointer' : '';
  if (!feats.length) { hideProbe(); return; }
  const f = feats[0];
  const p = f.properties || {};
  const r = STATE.sel && doneById(STATE.sel);
  const c = confOf(f);
  const html = f.layer.id === 'pin-dot'
    ? `<p class="pt">${esc(p.title)}</p><p class="ps">카드 발행 승인 대기 · ${esc(p.requester)} · ${esc(p.at)}</p>`
    : `<p class="pt">${esc(r ? r.title : '분석 결과')}</p><p class="ps">${esc(p.cls || p.class || '객체')}${c != null ? ` · 신뢰도 ${c.toFixed(3)}` : ''}</p>`;
  showProbe(ev.originalEvent.clientX, ev.originalEvent.clientY, html);
});
map.on('click', (ev) => {
  const feats = map.queryRenderedFeatures(ev.point, { layers: ['pin-dot'].filter((l) => map.getLayer(l)) });
  if (!feats.length) return;
  const p = feats[0].properties;
  showCard({
    kind: '카드 발행 승인 대기 · 시연',
    title: p.title,
    rows: [['요청자', esc(p.requester)], ['요청 시각', esc(p.at)], ['내용', esc(p.sub)]],
    prov: `원본 admin-publish.html?open=${esc(p.id)} · assets/data/dashboard.js(시연)`,
  });
});

/* ══ 어두운 유리 시간 스크러버 — 화면에 허용된 단 하나의 유리 ══════════ */
const STRIP = mountStrip($('#strip'), {
  onEvent: (e) => { if (e && doneById(e.id)) selectResult(e.id); },
});

/* ══ 기동 ═══════════════════════════════════════════════════════════════ */
mountScan();
countUp();
await selectResult(DONE[0].id, false);
flyGated({ center: [127.42, 35.42], zoom: 11.2 });

// e2e/검수용 핸들 — 화면 동작에는 관여하지 않는다.
window.__atlas = {
  map,
  plate: PLATE,
  get sel() { return STATE.sel; },
  get thr() { return STATE.thr; },
  get pass() { return STATE.pass; },
  get scrub() { return STRIP.date; },
  seek: (p) => STRIP.seek(p),
  select: (id) => selectResult(id),
  total: TOTAL_OBJECTS,
};
document.documentElement.dataset.atlas = 'ready';
