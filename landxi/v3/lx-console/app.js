/* app.js — LX 직원 집(생산 콘솔) · 명세 LANDXI-FINAL-SPEC §2.3.
   "오늘 뭘 해야 하고, 뭘 만들 수 있고, 어디에 깔렸는가?" — 오늘 띠 · 6단 레일 · ③ 조립 매트릭스 · 전국 배포 점.
   부품 = 키트 K1 셸(레일 = K8 세로) · K2 관문 · K3 무대 · K4 지도 검색 · K5 서랍 · K6 큰 숫자 · K10 물어보기 · K13 토스트 · K14 개발자. */
import * as K from '../kit/index.js';
import { h, esc, RM } from '../kit/util.js';
import { D, load, pins, legend, STAGE_KO, cardName } from './data.js';
import { openMatrix, regionChanged } from './matrix.js';

const V3 = '/landxi/v3/';
const who = await K.gate('lx-console');

/* ── 셸: 마스트 + 6단 레일(①②④⑤⑥ = 페이지 · ③ = 서랍) ───────────── */
const STEPS = [
  { id: 'ingest', label: '데이터 올리기', href: V3 + 'lx-ingest/' },
  { id: 'train', label: '학습', href: V3 + 'lx-train/' },
  { id: 'assemble', label: '서비스 만들기' },
  { id: 'review', label: '결과 확인', href: V3 + 'lx-review/' },
  { id: 'deploy', label: '배포', href: V3 + 'lx-deploy/' },
  { id: 'ops', label: '서비스 관리', href: V3 + 'lx-deploy/', query: 'tab=ops', hash: '#ops' },
];
document.body.classList.add('is-booting');
let region = null;          // 지도 검색으로 고른 지역(변수 · 없으면 전국)
let mx = null;              // ③ 서랍
const markers = new Map();  // 자리 키 → { 표식, 점 }
const SPLIT = 8;            // 이 줌부터 시도 묶음을 시군구로 분해
let level = null, sel = null;
let going = false;          // 오늘 칸 이동 중
const S = K.shell({
  who, home: 'lx-console',
  rail: { kind: 'steps', items: STEPS.map((s) => ({ ...s, href: s.href ? s.href + (s.query ? '?' + s.query : '') + (s.hash || '') : undefined })), current: -1, done: [], onPick: (i) => { if (STEPS[i].id === 'assemble') assemble(); } },
});
S.rail.setAttribute('aria-label', '생산 6단');
const railHref = () => S.rail.querySelectorAll('a.k-rail-i').forEach((a) => {
  const s = STEPS[+a.dataset.i];
  const qs = [region && 'region=' + encodeURIComponent(region.sgg_cd), s.query].filter(Boolean).join('&');
  a.href = s.href + (qs ? '?' + qs : '') + (s.hash || '');
});

/* 마스트 가운데: 한 줄 · 지도 검색(K4) · 물어보기 */
const line = h('p.lc-line', { text: '부처·지자체 실태조사를 AI로 대체하는 공공 GeoAI' });
const pickEl = h('div.lc-pick');
const askBtn = h('button.lc-ask', { type: 'button', 'aria-keyshortcuts': 'Control+K' },
  h('span', { 'aria-hidden': 'true', html: '<svg viewBox="0 0 20 20"><path d="M10 2.5l1.8 4.7 4.7 1.8-4.7 1.8L10 15.5l-1.8-4.7L3.5 9l4.7-1.8z"/></svg>' }),
  h('span.lc-ask-t', { text: '물어보기' }), h('kbd', { text: 'Ctrl K' }));
S.mast(h('span.lc-mast', {}, line, pickEl, askBtn));

/* ── 무대: 전국 V-World 위성 ─────────────────────────────── */
const stageEl = h('div.lc-stage');
S.main.append(stageEl);
const stage = K.createStage(stageEl);
const cmdk = K.mountCmdk({ stage, context: () => ({ region: region?.sgg_cd || null }) });
askBtn.addEventListener('click', () => cmdk.open());
K.devDrawer({ stage, who });

/* 오늘(흰 카드) */
const todayEl = h('section.t-card.t-card--map.lc-today', { 'aria-label': '오늘' },
  h('div.lc-today-h', {}, h('h2', { text: '오늘' }), h('button.t-btn.t-btn--text.lc-first', { type: 'button', text: '첫 항목 열기', hidden: true })),
  h('div.lc-cells', { 'data-budget-skip': '' }, ...['확인 대기', '재학습', '적용 요청', '기관 신고'].map((l) => h('span.lc-cell.is-wait', {}, h('b.lc-n', { text: '' }), h('span', { text: l })))));
/* 범례(사진 위 흰 글자) */
const legendEl = h('div.lc-legend', { 'aria-label': '범례' });
const tip = h('div.lc-tip', { role: 'tooltip', hidden: true });
stageEl.append(todayEl, legendEl, tip);
/* 부팅 진행 막대 1개(글자 0 · 스펙시먼 G) — 오늘 칸이 서기 전 빈 바탕만 보이는 몇 초를 채운다 */
const bootBar = h('div.t-progress.lc-boot', { role: 'progressbar', 'aria-label': '불러오는 중' }, h('i'));
stageEl.append(bootBar);

/* ── 부팅: 데이터가 오면 띠·레일·점(지도 로드는 기다리지 않는다 · 바탕 --bg-0) ── */
await load();
S.fresh(D.asOf);
drawToday();
drawPins();
drawLegend();
stage.map.on('zoomend', () => drawPins());
stage.map.on('moveend', () => placeLabels());
document.body.classList.remove('is-booting');
bootBar.remove();
K.regionPicker(pickEl, { onPick: pick }).then((p) => {
  const k = new URLSearchParams(location.search).get('region');
  if (k) p.pick(k);
});
window.__lxConsole = { D, stage, get level() { return level; }, get kept() { return [...markers.values()].filter((r) => !r.m.getElement().hidden).length; } };   // e2e 관측(읽기 전용)

/* ── 오늘 네 칸 ────────────────────────────────────── */
function drawToday() {
  const T = D.today;
  const cells = todayEl.querySelector('.lc-cells');
  const first = todayEl.querySelector('.lc-first');
  if (!T || T.error) {
    cells.replaceWith(h('p.lc-today-msg', { text: '할 일을 불러오지 못했습니다' }));
    return;
  }
  const any = T.cells.some((c) => c.env?.value);
  if (!any && T.cells.every((c) => c.env)) {
    cells.replaceWith(h('p.lc-today-msg', { text: '오늘 할 일이 없습니다' }));
    return;
  }
  cells.innerHTML = '';
  T.cells.forEach((c, i) => {
    const v = c.env?.value;
    const b = h('button.lc-cell', { type: 'button', dataset: { k: c.k, metric: c.label, v: v ?? '' }, disabled: !v || undefined, style: { '--i': i } },
      h('b.lc-n', { html: c.env ? `${K.numHtml(c.env, { unit: '' })}` : '<span class="k-num">—</span>' }),
      h('span', { text: c.label }));
    b.addEventListener('click', (e) => { if (!e.target.closest('.k-sig')) openItem(c, b); });
    cells.append(b);
  });
  const f = T.cells.find((c) => c.env?.value);
  first.hidden = !f;
  if (f) first.onclick = () => openItem(f, cells.querySelector(`[data-k="${f.k}"]`));
}

/** 오늘 칸 → 카메라 그 지역(2400) → 해당 단 페이지(URL 로 상태를 잇는다) */
async function openItem(c, btn) {
  if (going) return; going = true;
  todayEl.querySelectorAll('.lc-cell').forEach((x) => x.classList.toggle('is-on', x === btn));
  if (c.region) {
    mark(c.region.sgg_cd || c.region.key);
    const flew = stage.go(c.region, { ms: 2400, maxZoom: c.maxZoom || 11.5 });
    await Promise.race([flew, new Promise((r) => setTimeout(r, RM() ? 0 : 2700))]);
    await new Promise((r) => setTimeout(r, RM() ? 0 : 350));
  }
  location.href = c.href;
}

/* ── 전국 배포 점 ──────────────────────────────────
   전국(줌 < 8) = 배포본 자리마다 점 하나(여러 시군구에 걸친 배포본은 시도 1점) · 이름은 호버·선택·검색 때만.
   확대(줌 ≥ 8) = 시군구로 분해 · 이름은 서로(그리고 다른 점과) 겹치지 않는 것만. 점은 지도 표식(예산 제외). */
function drawPins(force = false) {
  const lv = stage.map.getZoom() >= SPLIT ? 'sgg' : 'nat';
  if (lv === level && !force) { placeLabels(); return; }
  level = lv;
  for (const { m } of markers.values()) m.remove();
  markers.clear();
  for (const p of pins(lv)) {
    const el = h('div.lc-pin', { dataset: { stage: p.stage, draft: p.draft ? '1' : '0', budgetSkip: '' } },
      h('button.lc-dot', { type: 'button', 'aria-label': `${p.name} ${STAGE_KO[p.best.stage]}` }, h('i', { 'aria-hidden': 'true' })),
      h('b.lc-lab', { text: p.name, 'aria-hidden': 'true' }));
    const btn = el.firstChild;
    const rec = { p, lines: p.deploys.map((d) => `${p.name} · ${cardName(d.card)} · ${STAGE_KO[d.stage] || ''}`), more: [] };
    const all = () => [...rec.lines, ...rec.more];
    btn.addEventListener('mouseenter', () => showTip(btn, all()));
    btn.addEventListener('focus', () => showTip(btn, all()));
    btn.addEventListener('mouseleave', hideTip);
    btn.addEventListener('blur', hideTip);
    btn.addEventListener('click', () => {
      const rg = p.best.sgg_cd || p.sgg_cd;
      location.href = V3 + 'lx-deploy/?deploy=' + encodeURIComponent(p.best.id) + (rg ? '&region=' + encodeURIComponent(rg) : '');
    });
    const m = new window.maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat(p.center).addTo(stage.map);
    rec.m = m;
    markers.set(p.key, rec);
  }
  mark(sel);
  placeLabels();
}
/** 겹침 정리(확대 때) — 우선순위(선택 → 운영 → 시범 → 이식 요청) 순으로
    ① 점이 이미 놓인 점과 겹치면 그 점에 합친다(호버 목록에 더함 · 모든 점이 눌린다)
    ② 이름은 이미 놓인 이름·다른 점과 겹치지 않을 때만 */
function placeLabels() {
  const list = [...markers.values()];
  for (const r of list) { const el = r.m.getElement(); el.classList.remove('has-lab'); el.hidden = false; r.more = []; }
  if (level !== 'sgg') return;
  const W = stageEl.clientWidth, H = stageEl.clientHeight;
  const hitR = (a, b) => a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];
  const on = (r) => r.m.getElement().classList.contains('is-on');
  const kept = [];
  for (const r of list.slice().sort((a, b) => (on(b) - on(a)) || a.p.rank - b.p.rank)) {
    const q = stage.map.project(r.p.center);
    r.box = [q.x - 11, q.y - 11, q.x + 11, q.y + 11];
    const host = kept.find((k) => hitR(k.box, r.box));
    if (host) { host.more.push(...r.lines); r.m.getElement().hidden = true; continue; }
    kept.push(r);
  }
  const sr = stageEl.getBoundingClientRect();
  const taken = [todayEl, legendEl, document.querySelector('.lc-drawer')].filter((e) => e?.isConnected).map((e) => { const b = e.getBoundingClientRect(); return [b.left - sr.left, b.top - sr.top, b.right - sr.left, b.bottom - sr.top]; });
  for (const r of kept) {
    const lab = r.m.getElement().querySelector('.lc-lab');
    const d = r.box, w = lab.offsetWidth, hh = lab.offsetHeight, cy = (d[1] + d[3]) / 2;
    const box = [d[2] + 2, cy - hh / 2, d[2] + 2 + w, cy + hh / 2];
    if (box[2] > W || box[0] < 0 || box[1] < 0 || box[3] > H) continue;
    if (taken.some((t) => hitR(t, box)) || kept.some((o) => o !== r && hitR(o.box, box))) continue;
    taken.push(box);
    r.m.getElement().classList.add('has-lab');
  }
}
/** 선택 표시 — 시군구 키가 시도 묶음 안에 있으면 그 묶음 점 */
function mark(key) {
  sel = key || null;
  for (const [k, { m, p }] of markers) m.getElement().classList.toggle('is-on', !!sel && (k === sel || p.regs?.some((r) => r.sgg_cd === sel)));
  if (level === 'sgg') placeLabels();
}
function showTip(el, lines) {
  tip.innerHTML = lines.map((l) => `<span>${esc(l)}</span>`).join('');
  tip.hidden = false;
  const r = el.getBoundingClientRect(), s = stageEl.getBoundingClientRect(), t = tip.getBoundingClientRect();
  const x = Math.min(s.width - t.width - 12, Math.max(12, r.left - s.left));
  const y = r.top - s.top - t.height - 10 < 8 ? r.bottom - s.top + 10 : r.top - s.top - t.height - 10;
  tip.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
}
function hideTip() { tip.hidden = true; }

/* 범례 — 기호 뜻만(수는 오늘 칸 · 해외만 곳 수) · lx-deploy 범례와 같은 문구 */
function drawLegend() {
  const L = legend();
  const item = (k, label) => `<span data-stage="${k}"><i></i><span>${label}</span></span>`;
  legendEl.innerHTML = item('ga', '운영') + item('canary', '시범') + item('draft', '적용 요청')
    + (L.abroad ? `<span class="lc-far"><span>해외 <b>${L.abroad}</b>곳</span></span>` : '');
}

/* ── 지도 검색(K4) — 지역은 변수 ──────────────────────────── */
function pick(r) {
  region = r;
  railHref();
  mark(r.sgg_cd);
  stage.go(r, { ms: 2400, maxZoom: 11.5 });
  const u = new URL(location.href); u.searchParams.set('region', r.sgg_cd); history.replaceState(null, '', u);
  regionChanged(r);
}

/* ── ③ 조립 서랍 ────────────────────────────────────── */
async function assemble() {
  if (mx?.el.isConnected) return;
  S.go(2);
  document.body.classList.add('has-mx');
  stage.pad({ right: stageEl.clientWidth > 1100 ? 392 + 48 : 320 + 48 });
  mx = await openMatrix({
    host: stageEl, region,
    onClose: () => { S.go(-1); document.body.classList.remove('has-mx'); stage.pad({}); },
    onMade: async () => { await load({ force: true }); drawPins(); drawLegend(); drawToday(); },
  });
}
if (location.hash === '#assemble') assemble();
