// LX 관리자 대시보드 — A안 "지도 위 원장".
// 규칙 두 가지만 지킨다.
//  1) 기능은 원본과 1:1 이다. 원본 https://mini531.github.io/namwon-smart-village/landxi7/dashboard.html
//     의 레일 A1–A11 · 위젯 B1–B16 이 전부이고, 표에 없는 기능은 만들지 않는다.
//     대조표: docs/superpowers/proto/2026-08-26-dashboard-parity.md
//  2) 지도는 새 위젯이 아니라 그 위젯들을 조판하는 **바탕**이다. 판 위에 남는 것은
//     실제 분석 결과와 헤어라인 계기뿐 — 불투명 격자도, 레지스터 탭도 없다.
// 조판 마스터: design-canvas/v2/B2-Dashboard.dc.html (1440×900).
// 콘티 원칙(§7): 지어낸 운영 서사 금지 — 마스터에 남아 있던 담당자 이름은 싣지 않는다.
import {
  nf, ymd, DATA_ASOF, DONE, IMG, MODEL_LIST, BACKBONE, KPI,
  NAV, NAV_FOOT, NOTICE, APPROVALS, ADMIN_TILES, PROJECTS, VISITS,
  STORAGE, AOI_EPOCHS, CHANGE_PAIRS, gsdText, CRS, CLASS_COUNT,
  JOBS, JOB_ST, JOB_TALLY, JOB_UNMAPPED,
} from './db-data.js';
import { mountPlate, dotsOf, bboxOf, fc, boxPoly, emdIndex } from './db-plate.js';

const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const REDUCED = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const stamp = () => new Date().toISOString().slice(0, 19).replace('T', ' ') + 'Z';
const cssPx = (n, d) => parseFloat(getComputedStyle(document.documentElement).getPropertyValue(n)) || d;
const EASE4 = (k) => 1 - (1 - k) ** 4;

/* ══ A1–A11 좌측 레일 ═══════════════════════════════════════════════════
   원본 include/header.html 의 메뉴 구조 그대로. 원본 페이지가 이 저장소에 없으므로
   링크를 지어내지 않고, 같은 데이터가 있는 우리 자리(원장 블록)로 보낸다. */
const ICON = {
  dash: '<rect x="2.6" y="2.6" width="6.4" height="6.4"/><rect x="11" y="2.6" width="6.4" height="6.4"/><rect x="2.6" y="11" width="6.4" height="6.4"/><rect x="11" y="11" width="6.4" height="6.4"/>',
  data: '<ellipse cx="10" cy="4.9" rx="7" ry="2.5"/><path d="M3 4.9v10.2c0 1.4 3.14 2.5 7 2.5s7-1.1 7-2.5V4.9"/><path d="M3 10c0 1.4 3.14 2.5 7 2.5s7-1.1 7-2.5"/>',
  proj: '<path d="M2.4 16.4V4.2h5.1l1.7 2.2h8.4v10z"/>',
  run: '<path d="M6.2 3.4 16 10l-9.8 6.6z"/>',
  map: '<path d="M2.4 5.2 7.6 3l4.8 2.2L17.6 3v11.8l-5.2 2.2-4.8-2.2-5.2 2.2z"/><path d="M7.6 3v14M12.4 5.2v11.8"/>',
  help: '<circle cx="10" cy="10" r="7.3"/><path d="M7.9 7.8a2.15 2.15 0 1 1 3.1 1.9c-.7.4-1 .9-1 1.7"/><circle cx="10" cy="14.3" r=".75" fill="currentColor" stroke="none"/>',
  stack: '<path d="M10 2.5 17.5 6.8 10 11.1 2.5 6.8z"/><path d="M2.5 11.1 10 15.4l7.5-4.3"/>',
  gear: '<circle cx="10" cy="10" r="2.9"/><path d="M10 1.6v2.5M10 15.9v2.5M18.4 10h-2.5M4.1 10H1.6M15.94 4.06l-1.77 1.77M5.83 14.17l-1.77 1.77M15.94 15.94l-1.77-1.77M5.83 5.83 4.06 4.06"/>',
  my: '<circle cx="10" cy="6.9" r="3.1"/><path d="M3.7 17.3c0-3.4 2.9-5.3 6.3-5.3s6.3 1.9 6.3 5.3"/>',
  out: '<path d="M11.6 2.6H3.4v14.8h8.2"/><path d="M8.6 10h9M14.2 6.6 17.6 10l-3.4 3.4"/>',
};
const railSvg = (k) => `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true">${ICON[k] || ''}</svg>`;
const railItem = (n) => `
  <button type="button" class="rail-i" data-menu="${n.menu}" data-to="${n.to || ''}"
    title="원본 ${n.href}"${n.menu === 'dashboard' ? ' aria-current="page"' : ''}>${railSvg(n.icon)}<span class="rl">${esc(n.name)}</span></button>`;

$('#rail-top').innerHTML = NAV.map(railItem).join('');
$('#rail-foot').innerHTML = NAV_FOOT.map(railItem).join('')
  + railItem({ menu: 'my', name: 'MY', href: 'mypage.html', icon: 'my' })
  + `<button type="button" class="rail-i" data-action="logout" title="원본 로그아웃">${railSvg('out')}<span class="rl">로그아웃</span></button>`;

/* ══ 원장 B1 → B15 (원본 순서 그대로) ═══════════════════════════════════ */
const AOI0 = AOI_EPOCHS[AOI_EPOCHS.length - 1] || null;         // 가장 최근 취득
const GSD_LO = Math.min(...IMG.map((i) => i.gsd));
const GSD_HI = Math.max(...IMG.map((i) => i.gsd));

$('#b2').querySelector('.n').textContent = `${AOI0 ? AOI0.captured : DATA_ASOF} 정사영상 기준`;
$('#b2').querySelector('em').textContent = `기준일 ${ymd(DATA_ASOF)}`;

$('#b-notice').innerHTML = `
  <span class="tag n">공지</span>
  <span class="t">${esc(NOTICE.title)}</span>
  <span class="dt n">${ymd(NOTICE.date)}</span>
  <span class="more">전체 보기 ›</span>`;
$('#b-notice').href = `../notice.html?notice=${NOTICE.id}`;

$('#b-kpi').innerHTML = KPI.map((k, i) => `
  <button type="button" class="k" data-kpi="${i}" title="원본 ${esc(k.href)}">
    <span class="kv"><span class="n5" data-cu="${k.value}">0</span><em>${esc(k.unit)}</em></span>
    <span class="kn">${esc(k.label)}</span>
    <span class="ks">${esc(k.sub)}</span>
  </button>`).join('');

$('#bb-tasks').textContent = `연결된 분석 과제 ${BACKBONE.tasks}개`;
$('#bb-name').textContent = BACKBONE.name;
$('#bb-ver').textContent = BACKBONE.ver;
$('#bb-applied').textContent = `최종 적용 ${BACKBONE.applied}`;
$('#b-jobs').innerHTML =
  `<span class="jt">${JOB_TALLY.map((t) => `${esc(t.name)} <b class="n5">${t.n}</b>`).join('<i class="sep">·</i>')}</span>`
  + `<span class="jw">AOI 미지정 <b class="n5">${JOB_UNMAPPED}</b></span>`;
$('#b-jobs').innerHTML =
  `<span class="jt">${JOB_TALLY.map((t) => `${esc(t.name)} <b class="n5">${t.n}</b>`).join('<i class="sep">·</i>')}</span>`
  + `<span class="jw">AOI 미지정 <b class="n5">${JOB_UNMAPPED}</b></span>`;
$('#bb-src').textContent =
  `GSD ${GSD_LO} m—${GSD_HI} m · ${IMG.length} 도엽 · ${CRS.replace(/\s/g, '')} · .pt ${MODEL_LIST.length}종 / 클래스 ${CLASS_COUNT}`;

/* B10 랭크드 바 — 원본 Top 5(용량 GB). 사용량 수치는 원본 주석대로 데모 시드 → [추정]. */
const top5 = [...PROJECTS].sort((a, b) => b.gb - a.gb).slice(0, 5);
const gbMax = Math.max(...top5.map((t) => t.gb));
$('#t-proj').innerHTML = top5.map((t) => `
  <button type="button" class="pr" data-proj="${esc(t.name.replace(/\s*탐지$|\s*분석$/, ''))}"><span class="pn">${esc(t.name)}</span>
    <span class="pt"><i data-w="${((t.gb / gbMax) * 100).toFixed(1)}" style="width:0%"></i></span>
    <span class="pv n5">${t.gb}<em>GB</em></span></button>`).join('');

/* B11 스파크라인 — 선 하나 + 사각 마커, 최고점만 채운다. */
(function visits() {
  const W = 324, H = 27;
  const max = Math.max(...VISITS.map((v) => v.count));
  const min = Math.min(...VISITS.map((v) => v.count));
  const x = (i) => (i / (VISITS.length - 1)) * (W - 1);
  const y = (v) => H - 9 - ((v - min) / Math.max(1, max - min)) * (H - 10);
  const pts = VISITS.map((v, i) => `${x(i).toFixed(0)} ${y(v.count).toFixed(0)}`).join(' L ');
  const mk = VISITS.map((v, i) => `<rect class="mk${v.count === max ? ' on' : ''}" x="${(x(i) - 1.3).toFixed(1)}" y="${(y(v.count) - 1.3).toFixed(1)}" width="2.6" height="2.6"/>`).join('');
  $('#t-visit').innerHTML = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="최근 7일 방문"><path class="ln" d="M ${pts}"/>${mk}</svg>`
    + `<div class="vax">${VISITS.map((v) => `<span class="${v.count === max ? 'on' : ''}">${esc(v.day)}</span>`).join('')}</div>`;
})();

/* B12 도넛 게이지 + 범례 — 잔여 공간까지 원본 그대로. */
(function storage() {
  const { used, total, parts } = STORAGE;
  const rest = +(total - parts.reduce((a, p) => a + p.tb, 0)).toFixed(1);
  const C = 2 * Math.PI * 19;
  $('#store-tot').textContent = `${used} / ${total} TB`;
  $('#t-store').innerHTML = `<div class="gauge">
      <span class="g">
        <svg viewBox="0 0 46 46" role="img" aria-label="스토리지 ${used} / ${total} TB">
          <circle class="trk" cx="23" cy="23" r="19"/>
          <circle class="arc" cx="23" cy="23" r="19" stroke-dasharray="0 ${C.toFixed(1)}" transform="rotate(-90 23 23)"/>
        </svg>
        <b class="gv n5">${Math.round((used / total) * 100)}%</b>
      </span>
      <ul class="lg">
        ${parts.map((p) => `<li data-part="${esc(p.label)}"><i></i><span>${esc(p.label)}</span><b>${p.tb}</b></li>`).join('')}
        <li class="rest"><i></i><span>잔여 공간</span><b>${rest}</b></li>
      </ul>
    </div>`;
  $('#t-store').dataset.arc = ((used / total) * C).toFixed(1);
  $('#t-store').dataset.c = C.toFixed(1);
})();

/* B13 — 원본 CARD_APPROVALS 2건. 담당자 이름은 콘티 원칙상 싣지 않는다. */
$('#ap-h').textContent = `카드 발행 승인 대기 · ${APPROVALS.length}건`;
$('#ap-rows').innerHTML = APPROVALS.length ? APPROVALS.map((a) => `
  <button type="button" class="ap" role="listitem" data-ap="${a.i}">
    <span class="m"><span class="t">${esc(a.title)}</span><span class="s">요청 ${esc(a.at)}</span></span>
    <span class="go">검토</span>
  </button>`).join('') : '<p class="empty">승인 대기 중인 카드가 없습니다.</p>';

/* B14 — 원본 support-grid 4타일 */
$('#ad-rows').innerHTML = ADMIN_TILES.map((t) => `
  <div class="ad" role="listitem" title="원본 ${esc(t.href)}">
    <span class="t">${esc(t.short || t.name)}</span>
    <span class="s">${esc(t.desc).replace(' · ', '<br>')}</span>
  </div>`).join('');

/* ══ 판 ═════════════════════════════════════════════════════════════════ */
const PLATE = await mountPlate($('#plate'));
const map = PLATE.map;
const padded = () => ({ left: cssPx('--rail', 72) + cssPx('--led', 372) + 32, top: 200, bottom: 200, right: 32 });
map.setPadding(padded());
addEventListener('resize', () => map.setPadding(padded()));

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
const KOREA = { center: [127.55, 35.15], zoom: 7.2 };

/* ── 부유 요소 ────────────────────────────────────────────────────────── */
const cardEl = $('#card');
const probeEl = $('#probe');
function showCard({ kind, title, rows, prov }) {
  cardEl.hidden = false;
  cardEl.innerHTML = `
    <div class="ch"><span class="lb">${esc(kind)}</span><button type="button" aria-label="닫기">×</button></div>
    <div class="cb"><h3>${esc(title)}</h3><dl>${rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${v}</dd>`).join('')}</dl></div>
    ${prov ? `<p class="cf">출처 ${esc(prov)}</p>` : ''}`;
  cardEl.querySelector('button').addEventListener('click', () => { cardEl.hidden = true; });
}
function showProbe(x, y, html) {
  probeEl.hidden = false;
  probeEl.innerHTML = html;
  const r = probeEl.getBoundingClientRect();
  probeEl.style.left = `${Math.min(innerWidth - r.width - 10, x + 14)}px`;
  probeEl.style.top = `${Math.min(innerHeight - r.height - 200, y + 14)}px`;
}
const hideProbe = () => { probeEl.hidden = true; };

/* ══ 지금 보는 것 ══════════════════════════════════════════════════════
   판에 상시 서 있는 것은 Ⅰ등급 4종뿐이다(관계 문서 §2.1).
   결과 폴리곤 · 벡터 카드 · 임계 범례 · 락온은 원장을 만졌을 때만 나타난다(§2.2 · E1). */
const AOI_RESULTS = DONE.filter((r) => /namwon/.test(r.id));
const STATE = { epoch: AOI_EPOCHS.length - 1, res: null, thr: 0, pass: 0, geo: null, chg: null, pin: -1, lockBox: null };
const GEO = {};
const NAMWON = { center: [127.42, 35.42], zoom: 11.4 };

async function geoOf(r) {
  if (!GEO[r.id]) GEO[r.id] = await fetch(r.geojson).then((x) => x.json());
  return GEO[r.id];
}
const confOf = (f) => {
  const p = f.properties || {};
  const v = p.conf ?? p.confidence ?? p.score;
  return typeof v === 'number' ? v : null;
};

/* ── B9 작업 AOI 10건 — 읍면동 실측 범위 위에 상태별 선 종류로 ─────────
   위치는 절대 움직이지 않는다. 상태는 색이 아니라 선 종류와 운동의 유무로 말한다. */
let EMD = new Map();
function jobFC() {
  const feats = [];
  for (const j of JOBS) {
    for (const name of j.emd) {
      const e = EMD.get(name);
      if (!e) continue;
      feats.push({
        type: 'Feature',
        properties: { id: j.id, st: j.st, emd: name, task: j.task, name: j.name, at: j.at, n: e.n, why: j.why || '' },
        geometry: boxPoly(e.bbox),
      });
    }
  }
  return fc(feats);
}
/** 실행 중 한 건의 스윕선 — 화면에서 유일한 운동(§5-10). 6초 주기. */
const RUNNING = JOBS.find((j) => j.st === 'run');
function sweepAt(t) {
  const e = RUNNING && EMD.get(RUNNING.emd[0]);
  if (!e) return null;
  const k = (t % 6000) / 6000;
  const y = e.bbox[1] + (e.bbox[3] - e.bbox[1]) * k;
  return fc([{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [[e.bbox[0], y], [e.bbox[2], y]] } }]);
}

/* ── 판 위 라벨 · B13 십자 핀 — DOM/SVG 오버레이(글리프를 외부에서 받지 않는다) ── */
const pins = $('#pins');
function paintOverlay() {
  const L = cssPx('--rail', 72) + cssPx('--led', 372);
  const parts = [];
  for (const j of JOBS) {
    for (const name of j.emd) {
      const e = EMD.get(name);
      if (!e) continue;
      const p = map.project([e.bbox[2], e.bbox[1]]);
      if (p.x < L + 30 || p.x > innerWidth - 10 || p.y < 190 || p.y > innerHeight - 195) continue;
      const lab = j.st === 'done' ? `${name} · 완료 · ${nf.format(e.n)}건`
        : j.st === 'run' ? `${name} · 분석중 ${j.step}/5`
          : j.st === 'fail' ? `${name} · 실패 · ${j.why}`
            : `${name} · 대기`;
      parts.push(`<text class="al al--${j.st}" x="${(p.x - 5).toFixed(1)}" y="${(p.y - 5).toFixed(1)}" text-anchor="end">${esc(lab)}</text>`);
    }
  }
  // B13 발행 대기 핀 — 십자 12px. 카드 ↔ 지역 연결은 우리가 주장한 것이므로 리더에 `연결 추정`.
  PLATE.approvals.forEach((q, i) => {
    const p = map.project(q.lnglat);
    if (p.x < L || p.x > innerWidth) return;
    const on = STATE.pin === i;
    parts.push(`<g class="pin${on ? ' is-on' : ''}">`
      + `<path class="cr" d="M${(p.x - 6).toFixed(1)} ${p.y.toFixed(1)}h12M${p.x.toFixed(1)} ${(p.y - 6).toFixed(1)}v12"/>`
      + (on ? `<path class="ld" d="M${(L + 2).toFixed(1)} ${p.y.toFixed(1)}H${(p.x - 8).toFixed(1)}"/>`
        + `<text class="l6" x="${(L + 8).toFixed(1)}" y="${(p.y - 6).toFixed(1)}">연결 추정</text>` : '')
      + `<text class="pl" x="${(p.x + 9).toFixed(1)}" y="${(p.y + 3.5).toFixed(1)}">${esc(q.emd || '')}</text></g>`);
  });
  pins.innerHTML = parts.join('');
}

/* ── Ⅱ등급 — 원장을 만졌을 때만 판이 응답한다 ─────────────────────── */
function clearResult() {
  STATE.res = null;
  STATE.geo = null;
  STATE.lockBox = null;
  PLATE.setRes(null, null);
  PLATE.show(['res-fill', 'res-line', 'res-dot'], false);
  $('#vcard').hidden = true;
  $('#thr').hidden = true;
  lock.hidden = true;
  paintFlag();
}
function applyThreshold() {
  const r = STATE.res;
  const geo = STATE.geo;
  if (!r || !geo) return;
  const pass = geo.features.filter((f) => {
    const c = confOf(f);
    return c == null ? true : c >= STATE.thr;
  });
  STATE.pass = pass.length;
  const poly = fc(pass);
  PLATE.setRes(poly, dotsOf(poly));
  const pn = $('#thr-pass');
  const mn = $('#thr-miss');
  if (pn) pn.textContent = nf.format(pass.length);
  if (mn) mn.textContent = nf.format(geo.features.length - pass.length);
  paintFlag();
}
function paintFlag() {
  const ep = AOI_EPOCHS[STATE.epoch];
  $('#flag-t').innerHTML = STATE.chg
    ? `지금 지도가 보는 것 — <b>${esc(STATE.chg.label)}</b> · ${esc(STATE.chg.method)} <em>추정</em>`
    : STATE.res
      ? `지금 지도가 보는 것 — <b>${esc(STATE.res.title)}</b> · <b>${nf.format(STATE.pass)}</b>${esc(STATE.res.unit)}`
      : `지금 지도가 보는 것 — <b>남원 ${esc(ep ? ep.captured : '')} 정사영상</b> · 작업 AOI <b>${JOBS.length}</b>건`;
}

/* 임계 범례 — 슬라이더가 아니라 실제 히스토그램 위의 끌 수 있는 마커. */
function mountThreshold(r) {
  const box = $('#thr');
  const h = r.confHist;
  if (!h || !h.length) { box.hidden = true; STATE.thr = 0; return; }
  box.hidden = false;
  const max = Math.max(...h) || 1;
  const w = 100 / h.length;
  const nul = Math.max(0, (r.count || 0) - h.reduce((a, x) => a + x, 0));
  box.innerHTML = `
    <div class="th"><span class="n">신뢰도 임계 · ${esc(r.region.replace(/^\S+\s/, ''))}(${esc(r.sensor)})</span>
      <span class="n5" id="thr-v">0.00</span></div>
    <div class="hist">
      ${h.map((v, i) => `<i class="b" style="left:${(i * w).toFixed(3)}%;width:${(w - 1.2).toFixed(3)}%;height:${((v / max) * 62).toFixed(1)}px"></i>`).join('')}
      <i id="thr-m" style="left:0%"></i>
      <input type="range" id="thr-r" min="0" max="1" step="0.01" value="0" aria-label="신뢰도 임계">
    </div>
    <div class="thr-rule"></div>
    <div class="thf">
      <span class="kb">통과 <b id="thr-pass">—</b></span>
      <span class="kb miss">미달 <b id="thr-miss">—</b></span>
      <span class="rt">${nul > 0 ? `null ${nf.format(nul)}` : '신뢰도 전량 기록'}</span>
    </div>`;
  const rg = $('#thr-r');
  const bars = [...box.querySelectorAll('.b')];
  const set = () => {
    STATE.thr = +rg.value;
    $('#thr-v').textContent = STATE.thr.toFixed(2);
    $('#thr-m').style.left = `${STATE.thr * 100}%`;
    bars.forEach((b, i) => b.classList.toggle('pass', (i + 0.5) / h.length >= STATE.thr));
    applyThreshold();
  };
  rg.addEventListener('input', set);
  set();
}

/* 벡터 추출 카드 — "이 정사영상에서 뽑아낸 게 이겁니다"를 한 액자 안에서. */
async function mountVectorCard(r) {
  const card = $('#vcard');
  const { CROPS } = await import('../assets/data/crops.js');
  const crop = (CROPS[r.id] || [])[0];
  if (!crop) { card.hidden = true; return; }
  card.hidden = false;
  const cls = Object.entries(r.classes || {}).slice(0, 2).map(([k, v]) => `${k} ${nf.format(v)}`).join(' · ');
  card.innerHTML = `
    <div class="vh"><span class="n">벡터 추출 · 같은 범위</span><span class="kb">EPSG:4326</span></div>
    <div class="fr"><img src="../${esc(crop.file)}" alt=""><i class="bk bk--tl"></i><i class="bk bk--br"></i></div>
    <div class="vf"><span class="n5">${nf.format(r.count)}<em>${esc(r.unit)}</em></span>
      <span class="kb">${esc(cls)}${r.areaHa ? ` · ${nf.format(Math.round(r.areaHa * 10) / 10)} ha` : ''}</span></div>`;
  card.classList.remove('is-in');
  requestAnimationFrame(() => card.classList.add('is-in'));
}

/* 락온 3비트 — 브래킷 180ms → 확정 80ms → 라벨 120ms. */
const lock = $('#lock');
function placeLock() {
  const b = STATE.lockBox;
  if (!b) { lock.hidden = true; return; }
  const a = map.project([b[0], b[3]]);
  const c = map.project([b[2], b[1]]);
  const x = Math.min(a.x, c.x) - 10;
  const y = Math.min(a.y, c.y) - 10;
  const w = Math.abs(c.x - a.x) + 20;
  const h = Math.abs(c.y - a.y) + 20;
  const L = cssPx('--rail', 72) + cssPx('--led', 372);
  if (w < 30 || h < 30 || w > (innerWidth - L) * 1.6 || h > innerHeight * 1.6
      || x + w < L || x > innerWidth || y + h < 0 || y > innerHeight) { lock.hidden = true; return; }
  lock.hidden = false;
  lock.style.left = `${x}px`;
  lock.style.top = `${y}px`;
  lock.style.width = `${w}px`;
  lock.style.height = `${h}px`;
}
function lockOn(box, label) {
  STATE.lockBox = box;
  lock.querySelector('.lkl-a').textContent = label || '';
  placeLock();
  if (lock.hidden) return;
  if (REDUCED()) { lock.classList.add('is-on', 'is-fix'); return; }
  lock.classList.remove('is-on', 'is-fix');
  requestAnimationFrame(() => {
    lock.classList.add('is-on');
    setTimeout(() => lock.classList.add('is-fix'), 180);
  });
}
map.on('move', () => { placeLock(); paintScale(); paintOverlay(); });

/** 스케일 바 — 88px 가 실제로 몇 m 인지 매 프레임 다시 센다. */
function paintScale() {
  const c = map.getCenter();
  const m = 88 * (156543.03392 * Math.cos((c.lat * Math.PI) / 180)) / 2 ** map.getZoom();
  $('#scale-m').textContent = m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m / 10) * 10} m`;
}

/** 결과 하나를 판 위에 세운다 — 원장을 만졌을 때만 호출된다(Ⅱ등급). */
async function selectResult(r, fly = true) {
  STATE.res = r;
  STATE.chg = null;
  PLATE.setChange(null);
  STATE.geo = await geoOf(r);
  PLATE.show(['res-fill', 'res-line', 'res-dot'], true);
  mountThreshold(r);
  await mountVectorCard(r);
  applyThreshold();
  const bb = bboxOf(STATE.geo) || r.bbox;
  if (fly) {
    map.fitBounds([[bb[0], bb[1]], [bb[2], bb[3]]], { padding: 80, duration: REDUCED() ? 0 : 1250 });
    whenSettled(() => lockOn(bb, `${r.region} · ${ymd(r.date)}`));
  } else lockOn(bb, `${r.region} · ${ymd(r.date)}`);
}

/** 시점만 바꾼다 — 밑그림과 변화 지수만 움직인다.
 *  작업 상태·KPI 는 시점 축이 없으므로 값이 바뀌는 척하지 않는다(§5.1). */
async function setEpoch(k, fly = true) {
  STATE.epoch = k;
  STATE.chg = null;
  PLATE.setChange(null);
  const ep = AOI_EPOCHS[k];
  $('#fresh-s').textContent = ep ? `남원 사매면 · 드론 GSD ${gsdText(ep)} · ${ep.zSpan}` : '';
  paintFlag();
  if (fly && ep) {
    const b = ep.bounds;
    map.easeTo({ center: [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2], zoom: 13.6, duration: REDUCED() ? 0 : 1250 });
  }
  paintScale();
}

/* ══ 취득 밀도 스캔 스트립 ══════════════════════════════════════════════
   축 = 남원 농경지 정사영상 4시점(실제 촬영월). 무채 틱 = 취득 밀도,
   앰버 틱 = 자동 정지점. 틱을 누르면 카메라와 필터가 그 시점으로 간다. */
const EPOS = (i) => (AOI_EPOCHS.length < 2 ? 50 : 6 + (i / (AOI_EPOCHS.length - 1)) * 86);
function mountScan() {
  if (!AOI_EPOCHS.length) return;
  $('#scan-n').textContent = `정사영상 ${AOI_EPOCHS.length} 시점 · 변화 ${CHANGE_PAIRS.length} 쌍`;
  const N = 148;
  let ticks = '';
  for (let i = 0; i < N; i++) {
    const p = (i / (N - 1)) * 100;
    // 취득 시점 가까이에서 밀도가 오른다 — 지어낸 곡선이 아니라 취득 자체가 밀도다.
    const near = AOI_EPOCHS.some((_, k) => Math.abs(p - EPOS(k)) < 4.2);
    const h = near ? 12 + ((i * 7) % 16) : 4 + ((i * 5) % 9);
    ticks += `<i class="tk${near ? ' on' : ''}" style="left:${p.toFixed(2)}%;height:${h}px"></i>`;
  }
  ticks += AOI_EPOCHS.map((e, i) => `<button type="button" class="ep${i === AOI_EPOCHS.length - 1 ? ' last' : ''}"
      style="left:${EPOS(i).toFixed(2)}%" data-ep="${i}"
      title="${esc(e.label)} · GSD ${esc(gsdText(e))}" aria-label="${esc(e.captured)} 정사영상"><i></i><b>${esc(e.captured)}</b></button>`).join('');
  $('#scan-bar').innerHTML = ticks;

  $('#scan-bar').addEventListener('click', (ev) => {
    const t = ev.target.closest('.ep');
    if (!t) return;
    STRIP.gotoEpoch(+t.dataset.ep);
  });
}

/* ══ 어두운 유리 시간 스크러버 — 창(window) 두 개의 핸들 ═══════════════
   축은 정사영상 취득 시점이고, 창은 "지금 보고 있는 구간"이다.
   재생하면 창이 오른쪽으로 흐르다 취득 시점(앰버 틱)에서 2.2초 선다. */
const STRIP = (function mountStrip() {
  const el = $('#strip');
  const track = $('#strip-track');
  const win = $('#strip-win');
  const marks = $('#strip-marks');
  const btnPlay = $('#strip-play');
  const btnPause = $('#strip-pause');
  const auto = $('#strip-auto');
  const HOLD = 2200;                       // 사건에서 서 있는 시간
  const DUR = 24000;                       // 축 전체를 지나는 시간
  const SPAN = 0.32;                       // 창의 폭(축 대비) — 취득 한 구간을 덮는다
  let a = 0;                               // 아래에서 최신 취득에 맞춰 놓는다
  let playing = !REDUCED();
  let hold = 0;
  let last = performance.now();
  const seen = new Set();

  $('#strip-t0').textContent = AOI_EPOCHS[0] ? AOI_EPOCHS[0].captured : '—';
  $('#strip-t1').textContent = AOI_EPOCHS.length ? AOI_EPOCHS[AOI_EPOCHS.length - 1].captured : '—';
  marks.innerHTML = AOI_EPOCHS.map((e, i) => `<i style="left:${EPOS(i).toFixed(2)}%"></i>`).join('');

  /** 창의 오른쪽 끝이 가리키는 취득 시점. */
  const epochAt = (b) => {
    let k = 0;
    AOI_EPOCHS.forEach((_, i) => { if (EPOS(i) / 100 <= b + 1e-6) k = i; });
    return k;
  };

  function paintWin() {
    const b = Math.min(1, a + SPAN);
    win.style.left = `${a * 100}%`;
    win.style.width = `${(b - a) * 100}%`;
    const k = epochAt(b);
    // 창의 왼쪽은 "창 안에 처음 들어오는 취득", 오른쪽은 "마지막으로 들어온 취득"이다.
    let k0 = AOI_EPOCHS.findIndex((_, i) => EPOS(i) / 100 >= a - 1e-6);
    if (k0 < 0 || k0 > k) k0 = k;
    const e0 = AOI_EPOCHS[k0];
    const e1 = AOI_EPOCHS[k];
    $('#strip-now').textContent = !e1 ? '' : (e0 && e0 !== e1 ? `창 ${e0.captured} → ${e1.captured}` : `창 ${e1.captured}`);
    track.setAttribute('aria-valuenow', Math.round(b * 100));
    track.setAttribute('aria-valuetext', e1 ? e1.captured : '');
    $('#scan-bar').querySelectorAll('.ep').forEach((x, i) => x.classList.toggle('is-on', i === k));
    return k;
  }

  /** 창이 덮는 변화 쌍(비지도) — 있으면 점선 고스트로 얹는다. */
  async function syncChange(k) {
    const e = AOI_EPOCHS[k];
    const pair = CHANGE_PAIRS.find((c) => c.to === (e && e.captured));
    if (!pair) { STATE.chg = null; return; }
    if (!pair.geo) pair.geo = await fetch(pair.polygons).then((x) => x.json());
    STATE.chg = pair;
  }

  /** 손으로 고른 시점만 카메라를 움직인다. 자동 재생은 밑그림만 바꾼다. */
  async function goto(k, fly = true) {
    await setEpoch(k, fly);
  }

  function tick(t) {
    const dt = t - last;
    last = t;
    if (playing) {
      if (hold > 0) { hold -= dt; }
      else {
        a += dt / DUR;
        if (a >= 1 - SPAN) { a = 0; seen.clear(); }
        const b = Math.min(1, a + SPAN);
        for (let i = 0; i < AOI_EPOCHS.length; i++) {
          const p = EPOS(i) / 100;
          if (!seen.has(i) && b >= p) {
            seen.add(i);
            a = Math.max(0, p - SPAN);
            hold = HOLD;
            setEpoch(i, false);
            break;
          }
        }
      }
      paintWin();
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  const setPlaying = (v) => {
    playing = v;
    document.body.dataset.play = v ? '1' : '0';
    btnPlay.setAttribute('aria-pressed', String(v));
    btnPause.setAttribute('aria-pressed', String(!v));
    auto.textContent = v ? '자동 정지 ON' : '자동 정지 OFF';
    auto.classList.toggle('off', !v);
  };
  btnPlay.addEventListener('click', () => setPlaying(true));
  btnPause.addEventListener('click', () => setPlaying(false));
  $('#strip-prev').addEventListener('click', () => { setPlaying(false); step(-1); });
  $('#strip-next').addEventListener('click', () => { setPlaying(false); step(1); });
  function step(d) {
    const k = Math.max(0, Math.min(AOI_EPOCHS.length - 1, STATE.epoch + d));
    a = Math.max(0, EPOS(k) / 100 - SPAN);
    seen.clear();
    AOI_EPOCHS.forEach((_, i) => { if (EPOS(i) / 100 <= a + SPAN) seen.add(i); });
    paintWin();
    goto(k);
  }

  /* 손으로 끌기 — 창 전체 또는 양끝 핸들 */
  let drag = null;
  track.addEventListener('pointerdown', (ev) => {
    setPlaying(false);
    track.setPointerCapture(ev.pointerId);
    const h = ev.target.closest('[data-h]');
    drag = h ? h.dataset.h : 'move';
    move(ev);
  });
  track.addEventListener('pointermove', (ev) => { if (drag) move(ev); });
  track.addEventListener('pointerup', () => {
    if (!drag) return;
    drag = null;
    const k = paintWin();
    seen.clear();
    AOI_EPOCHS.forEach((_, i) => { if (EPOS(i) / 100 <= a + SPAN) seen.add(i); });
    goto(k);
  });
  function move(ev) {
    const r = track.getBoundingClientRect();
    const p = Math.min(1, Math.max(0, (ev.clientX - r.left) / r.width));
    a = Math.min(1 - SPAN, Math.max(0, drag === 'b' ? p - SPAN : p - (drag === 'a' ? 0 : SPAN / 2)));
    paintWin();
  }
  track.addEventListener('keydown', (ev) => {
    if (ev.key === 'ArrowRight') { step(1); ev.preventDefault(); }
    if (ev.key === 'ArrowLeft') { step(-1); ev.preventDefault(); }
    if (ev.key === ' ') { setPlaying(!playing); ev.preventDefault(); }
  });

  // 첫 프레임은 가장 최근 취득에 선다. 다음 회차부터 축을 처음부터 다시 걷는다.
  const LAST = AOI_EPOCHS.length - 1;
  a = Math.max(0, EPOS(LAST) / 100 - SPAN);
  AOI_EPOCHS.forEach((_, i) => seen.add(i));
  setPlaying(playing);
  paintWin();
  return {
    get playing() { return playing; },
    get a() { return a; },
    stop: () => setPlaying(false),
    gotoEpoch: (k) => { setPlaying(false); a = Math.max(0, EPOS(k) / 100 - SPAN); paintWin(); goto(k); },
    syncChange,
  };
})();

/* ══ 값이 도착한다 — 카운트업 · 막대 스윕 · 도넛 스윕 ══════════════════ */
function arrive() {
  const els = [...document.querySelectorAll('[data-cu]')];
  const bars = [...document.querySelectorAll('.pr .pt i')];
  const arc = $('#t-store .arc');
  const setBars = (k) => bars.forEach((b) => { b.style.width = `${(+b.dataset.w * k).toFixed(1)}%`; });
  if (REDUCED()) {
    els.forEach((e) => { e.textContent = nf.format(+e.dataset.cu); });
    setBars(1);
    if (arc) arc.setAttribute('stroke-dasharray', `${$('#t-store').dataset.arc} ${$('#t-store').dataset.c}`);
    return;
  }
  const t0 = performance.now();
  (function step(t) {
    const k = Math.min(1, (t - t0) / 900);
    const e = EASE4(k);
    els.forEach((el) => { el.textContent = nf.format(Math.round(+el.dataset.cu * e)); });
    if (k < 1) requestAnimationFrame(step);
  })(t0);
  requestAnimationFrame(() => {
    setBars(1);
    if (arc) arc.setAttribute('stroke-dasharray', `${$('#t-store').dataset.arc} ${$('#t-store').dataset.c}`);
  });
}

/* ══ 결선 ═══════════════════════════════════════════════════════════════ */
function ledgerTo(id) {
  const t = document.getElementById(id);
  if (!t) return;
  $('#ledger').scrollTo({ top: Math.max(0, t.offsetTop - 90), behavior: REDUCED() ? 'auto' : 'smooth' });
}

$('#rail').addEventListener('click', (ev) => {
  const lo = ev.target.closest('[data-action="logout"]');
  if (lo) { try { localStorage.removeItem('lx_logged_in'); } catch (e) { /* 저장소 차단 */ } location.href = '../home.html'; return; }
  const b = ev.target.closest('.rail-i[data-menu]');
  if (!b) return;
  document.querySelectorAll('.rail-i').forEach((x) => x.removeAttribute('aria-current'));
  b.setAttribute('aria-current', 'page');
  if (b.dataset.menu === 'dashboard') { $('#ledger').scrollTo({ top: 0, behavior: REDUCED() ? 'auto' : 'smooth' }); return; }
  if (b.dataset.menu === 'my') { location.href = '../mypage.html'; return; }
  if (b.dataset.to) ledgerTo(b.dataset.to);
});

/* 원장 → 판. Ⅲ등급(B1·B3·B4·B7·B8·B11·B14·B15)에는 아무 핸들러도 붙이지 않는다 —
   판의 무반응이 "이 숫자는 위치가 없다"는 화면의 선언이다(§2.3). */
$('#ledger').addEventListener('click', (ev) => {
  // B6 KPI 카드 발행 승인 대기 → 원본 `?status=대기` 와 같은 동작(감쇠 + 칩)
  const k = ev.target.closest('[data-kpi]');
  if (k) { const it = KPI[+k.dataset.kpi]; if (it.to) ledgerTo(it.to); return; }

  // B9 연결된 분석 과제 → 작업 AOI 전체를 프레임에 넣는다
  if (ev.target.closest('#b-jobs')) {
    STRIP.stop();
    clearResult();
    goHome(1250);
    return;
  }

  // B13 행 → 대상 지역으로 카메라 + 속성 카드(원본 `?open=` 의 자리)
  const a = ev.target.closest('[data-ap]');
  if (a) {
    const it = APPROVALS[+a.dataset.ap];
    STRIP.stop();
    STATE.pin = it.i;
    paintOverlay();
    flyGated({ center: it.lnglat, zoom: 13.4 }, () => showCard({
      kind: '카드 발행 승인 대기 · 시연',
      title: it.title,
      rows: [['요청 시각', esc(it.at)], ['대상 지역', `${esc(it.emd)} <em class="est">연결 추정</em>`],
        ['연결된 객체', `정사영상 <span class="num">${AOI_EPOCHS.length}</span> · 결과 <span class="num">${AOI_RESULTS.length}</span> · 모델 <span class="num">${MODEL_LIST.length}</span>`],
        ['좌표계', CRS]],
      prov: `원본 admin-publish.html?open=${it.id} · assets/data/dashboard.js(시연)`,
    }));
    return;
  }

  // B10 랭크드 바 행 → 그 사업의 결과를 판에 세운다
  const pr = ev.target.closest('[data-proj]');
  if (pr) {
    STRIP.stop();
    const r = AOI_RESULTS.find((x) => x.title.includes(pr.dataset.proj)) || AOI_RESULTS[0];
    selectResult(r);
    return;
  }

  // B12 도넛 `정사영상` 세그먼트 → footprint 액자를 굵게
  const lg = ev.target.closest('[data-part="정사영상"]');
  if (lg) { STRIP.stop(); clearResult(); goHome(1250); }
});

/* B13 행 호버 = 락온 + 리더선. 손을 떼면 사라진다(§2 규칙 1). */
$('#ap-rows').addEventListener('mouseover', (ev) => {
  const a = ev.target.closest('[data-ap]');
  if (!a) return;
  STATE.pin = +a.dataset.ap;
  paintOverlay();
});
$('#ap-rows').addEventListener('mouseleave', () => { STATE.pin = -1; paintOverlay(); });

$('#allmap').addEventListener('click', () => {
  STRIP.stop();
  clearResult();
  STATE.pin = -1;
  paintOverlay();
  flyGated(KOREA);
});

/* ══ 지도 위 상호작용 ═══════════════════════════════════════════════════ */
map.on('mousemove', (ev) => {
  const feats = map.queryRenderedFeatures(ev.point, { layers: ['pin-dot', 'res-fill'].filter((l) => map.getLayer(l)) });
  map.getCanvas().style.cursor = feats.length ? 'pointer' : '';
  if (!feats.length) { hideProbe(); return; }
  const f = feats[0];
  const p = f.properties || {};
  const c = confOf(f);
  const html = f.layer.id === 'pin-dot'
    ? `<p class="pt">${esc(p.title)}</p><p class="ps">카드 발행 승인 대기 · 요청 ${esc(p.at)}</p>`
    : `<p class="pt">${esc(STATE.res.title)}</p><p class="ps">${esc(p.cls || p.class || '객체')}${c != null ? ` · 신뢰도 ${c.toFixed(3)}` : ''}</p>`;
  showProbe(ev.originalEvent.clientX, ev.originalEvent.clientY, html);
});
map.on('click', (ev) => {
  const feats = map.queryRenderedFeatures(ev.point, { layers: ['pin-dot'].filter((l) => map.getLayer(l)) });
  if (!feats.length) return;
  const p = feats[0].properties;
  showCard({
    kind: '카드 발행 승인 대기 · 시연',
    title: p.title,
    rows: [['요청 시각', esc(p.at)], ['내용', esc(p.sub)]],
    prov: `원본 admin-publish.html?open=${esc(p.id)} · assets/data/dashboard.js(시연)`,
  });
});

/* ══ 기동 ═══════════════════════════════════════════════════════════════ */
$('#fresh-t').textContent = `${AOI0 ? AOI0.captured : DATA_ASOF} 정사영상 기준 · 취득 ${AOI_EPOCHS.length}회 · 기준일 ${ymd(DATA_ASOF)}`;
function paintOwn() {
  // 실측 범위가 없는 AOI 는 그리지 않는다 — 그리지 못한 것을 화면이 센다.
  const miss = JOBS.reduce((a, j) => a + j.emd.filter((n) => !EMD.has(n)).length, 0);
  $('#own').innerHTML = `모의 실행 · 원본 시드 <span class="n">${JOBS.length}</span>건`
    + `<span class="sep">·</span>AOI 미지정 <span class="n">${JOB_UNMAPPED}</span>`
    + (miss ? `<span class="sep">·</span>실측 범위 없음 <span class="n">${miss}</span>` : '')
    + `<span class="sep">·</span>카드 <span class="n">8</span>건 ↔ 지역 매핑 미확정`;
}

mountScan();
arrive();

/* Ⅰ등급 — 조작 없이 판에 선다. 읍면동 범위는 실제 결과 폴리곤에서 되짚는다. */
EMD = emdIndex(await Promise.all(AOI_RESULTS.map(geoOf)));
const JOB_FC = jobFC();
PLATE.setJobs(JOB_FC);
paintOwn();
const HOME = (() => {
  const b = bboxOf(JOB_FC);
  return b ? [[b[0], b[1]], [b[2], b[3]]] : null;
})();
/** 쉴 때의 시야 — 작업 AOI 전부가 한 화면에 든다. */
function goHome(dur = 0) {
  if (HOME) map.fitBounds(HOME, { padding: 26, duration: REDUCED() ? 0 : dur, maxZoom: 12.4 });
  else map.easeTo({ ...NAMWON, duration: dur });
}
goHome(0);
setEpoch(AOI_EPOCHS.length - 1, false);
paintOverlay();
paintScale();
paintFlag();

/* 유휴에 움직이는 것은 실행 중 1건의 스윕선 하나뿐이다(§3.2).
   스크러버가 재생 중이면 스윕은 멈춘다 — 두 개가 동시에 움직이지 않는다. */
if (!REDUCED() && RUNNING) {
  (function loop(t) {
    if (!STRIP.playing) PLATE.setSweep(sweepAt(t));
    else PLATE.setSweep(null);
    requestAnimationFrame(loop);
  })(performance.now());
}

// e2e/검수용 핸들 — 화면 동작에는 관여하지 않는다.
window.__atlas = {
  map,
  plate: PLATE,
  get epoch() { return STATE.epoch; },
  get res() { return STATE.res && STATE.res.id; },
  get thr() { return STATE.thr; },
  get pass() { return STATE.pass; },
  get playing() { return STRIP.playing; },
  get win() { return STRIP.a; },
  get jobs() { return map.getSource('job')._data.features.length; },
  goto: (k) => STRIP.gotoEpoch(k),
  epochs: AOI_EPOCHS.map((e) => e.captured),
  unmapped: JOB_UNMAPPED,
};
document.documentElement.dataset.atlas = 'ready';
