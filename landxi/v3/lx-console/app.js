/* app.js — LX 직원 첫 화면(LX 직원 대시보드) · 명세 LANDXI-FINAL-SPEC §2.3 · 구현 2차 T1(확인 대장 R-D3 · D3).
   "내 일은 어디까지 왔고, 우리 서비스는 어디서 돌고, 다음에 무엇을 만들 수 있나?" — 내 프로젝트 · 돌고 있는 서비스 · 만들 수 있는 것 ·
   6단 레일 · ③ 서비스 만들기 · 전국 배포 점. '오늘 할 일'(전국 합계 네 칸)은 '내 프로젝트'로 바뀌었다(R-D3 §4 — 일 단위 = 프로젝트).
   부품 = 키트 K1 셸(레일 = K8 세로) · K2 관문 · K3 무대 · K4 지도 검색 · K5 서랍 · K6 큰 숫자 · K10 물어보기 · K13 토스트 · K14 개발자. */
import * as K from '../kit/index.js';
import { h, esc, api } from '../kit/util.js';
import { D, load, loadAssembly, pins, legend, STAGE_KO, cardName } from './data.js';
import { openMatrix, regionChanged, TASKS, judge } from './matrix.js';
import { projectsLink, stageHref, HOME as PROJECTS } from '../lx-project/context.js';
import { openNewProject } from '../lx-project/new.js';

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
let going = false;          // 칸 이동 중
const S = K.shell({
  who, home: 'lx-console', xiRegion: () => region?.sgg_cd || null,
  rail: { kind: 'steps', items: STEPS.map((s) => ({ ...s, href: s.href ? s.href + (s.query ? '?' + s.query : '') + (s.hash || '') : undefined })), current: -1, done: [], onPick: (i) => { if (STEPS[i].id === 'assemble') assemble(); } },
});
S.rail.setAttribute('aria-label', '작업 단계');
const railHref = () => S.rail.querySelectorAll('a.k-rail-i').forEach((a) => {
  const s = STEPS[+a.dataset.i];
  const qs = [region && 'region=' + encodeURIComponent(region.sgg_cd), s.query].filter(Boolean).join('&');
  a.href = s.href + (qs ? '?' + qs : '') + (s.hash || '');
});

/* 마스트 가운데: 한 줄 · 지도 검색(K4) · 물어보기 */
const line = h('p.lc-line', { text: 'AI 기반 국토정보 통합조사 플랫폼' });
const pickEl = h('div.lc-pick');
const askBtn = h('button.lc-ask', { type: 'button', 'aria-keyshortcuts': 'Control+K' },
  h('span', { 'aria-hidden': 'true', html: '<svg viewBox="0 0 20 20"><path d="M10 2.5l1.8 4.7 4.7 1.8-4.7 1.8L10 15.5l-1.8-4.7L3.5 9l4.7-1.8z"/></svg>' }),
  h('span.lc-ask-t', { text: '물어보기' }), h('kbd', { text: 'Ctrl K' }));
S.mast(h('span.lc-mast', {}, line, pickEl, askBtn));
projectsLink(S);            // 머리 줄 — 프로젝트 목록으로 가는 길(머리 메뉴 구성은 그대로 · 사용자 10-01)

/* ── 무대: 전국 V-World 위성 ─────────────────────────────── */
const stageEl = h('div.lc-stage');
S.main.append(stageEl);
const stage = K.createStage(stageEl);
const cmdk = K.mountCmdk({ stage, context: () => ({ region: region?.sgg_cd || null }) });
askBtn.addEventListener('click', () => cmdk.open());
K.devDrawer({ stage, who });

/* 윗줄 흰 카드 셋 — 내 프로젝트 · 돌고 있는 서비스 · 만들 수 있는 것(R-D3 §4 · D3 Q2 · Q3) */
const newBtn = h('button.t-btn.t-btn--text.lc-new', { type: 'button', text: '새 프로젝트', onclick: () => openNewProject() });
const mineEl = h('section.t-card.t-card--map.lc-mine', { 'aria-label': '내 프로젝트' },
  h('div.lc-today-h', {}, h('h2', { text: '내 프로젝트' }), newBtn),
  h('div.lc-prs', { 'data-budget-skip': '' }));
const waitCells = (labels) => h('div.lc-cells', { 'data-budget-skip': '' }, ...labels.map((l) => h('span.lc-cell.is-wait', {}, h('b.lc-n', { text: '' }), h('span', { text: l }))));
const runEl = h('section.t-card.t-card--map.lc-q.lc-run', { 'aria-label': '돌고 있는 서비스' }, h('div.lc-today-h', {}, h('h2', { text: '돌고 있는 서비스' })), waitCells(['서비스', '지역']));
const makeEl = h('section.t-card.t-card--map.lc-q.lc-make', { 'aria-label': '만들 수 있는 것' }, h('div.lc-today-h', {}, h('h2', { text: '만들 수 있는 것' })), waitCells(['만드는 중', '업무', '재학습']));
const todayEl = h('div.lc-top', {}, mineEl, runEl, makeEl);
/* 범례(사진 위 흰 글자) */
const legendEl = h('div.lc-legend', { 'aria-label': '범례' });
const tip = h('div.lc-tip', { role: 'tooltip', hidden: true });
stageEl.append(todayEl, legendEl, tip);
/* 부팅 진행 막대 1개(글자 0 · 스펙시먼 G) — 카드가 서기 전 빈 바탕만 보이는 몇 초를 채운다 */
const bootBar = h('div.t-progress.lc-boot', { role: 'progressbar', 'aria-label': '불러오는 중' }, h('i'));
stageEl.append(bootBar);

/* ── 부팅: 데이터가 오면 띠·레일·점(지도 로드는 기다리지 않는다 · 바탕 --bg-0) ── */
const mineP = api('/projects?scope=mine').catch(() => null);        // 내 프로젝트 — 지도 자료와 나란히 받는다
await load();
S.fresh(D.asOf);
drawMine(await mineP);
drawRun();
drawMake();
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
document.documentElement.dataset.consoleReady = '1';

/* ── 내 프로젝트 — 진행 중 프로젝트마다 이름 · 지금 단계 · 다음 할 일 하나(누르면 그 단계 화면) ── */
function drawMine(j) {
  const MINE_MAX = 3;
  const box = mineEl.querySelector('.lc-prs');
  box.innerHTML = '';
  if (!j) {
    const x = h('div'); box.append(x);
    K.empty(x, { kind: 'error', title: '프로젝트를 불러오지 못했습니다', compact: true, onRetry: async () => drawMine(await api('/projects?scope=mine').catch(() => null)) });
    return;
  }
  const items = j.items || [];
  newBtn.hidden = !items.length;                          // 비었을 때는 빈 화면의 '새 프로젝트' 하나만
  if (!items.length) {
    const x = h('div'); box.append(x);
    K.empty(x, { kind: 'first', title: '진행 중인 프로젝트가 없습니다', compact: true, action: { label: '새 프로젝트', onClick: () => openNewProject() } });
    return;
  }
  items.slice(0, MINE_MAX).forEach((p, i) => {
    const a = h('a.lc-pr', { href: stageHref(p, p.next?.stage, p.next?.target), style: { '--i': i }, dataset: { stage: p.stage?.key || '' } },
      h('b.lc-pr-n', { text: p.name }), h('span.lc-pr-s', { text: p.stage ? `${p.stage.index + 1} ${p.stage.label}` : '' }),
      h('span.lc-pr-x', { text: p.next?.text || '' }));
    box.append(a);
  });
  box.append(h('a.t-btn.t-btn--text.lc-all', { href: PROJECTS, text: items.length > MINE_MAX ? `전체 보기 ${items.length}` : '전체 보기' }));
}

/* ── 돌고 있는 서비스 — 배포 기록(운영 · 시범)에서 센 값 · 누르면 배포 화면 ── */
function counted(n, asOf, source) { return { value: n, unit: 'count', basis: 'recorded', as_of: asOf || new Date().toISOString(), source }; }
function cells(el, list) {
  const c = el.querySelector('.lc-cells');
  c.innerHTML = '';
  list.forEach((x, i) => {
    const v = x.env?.value;
    const b = h(x.href ? 'a.lc-cell' : 'button.lc-cell', { ...(x.href ? { href: x.href } : { type: 'button' }), dataset: { k: x.k, metric: x.label, v: v ?? '' }, style: { '--i': i } },
      h('b.lc-n', { html: x.env ? K.numHtml(x.env, { unit: x.tail || '' }) : '<span class="k-num">—</span>' }),
      h('span', { text: x.label }));
    if (x.onClick) b.addEventListener('click', (e) => { if (!e.target.closest('.k-sig')) x.onClick(); });
    c.append(b);
  });
}
function drawRun() {
  const live = D.deploys.filter((d) => ['ga', 'canary', 'shadow'].includes(d.stage));
  const svc = new Set(live.map((d) => d.card_id)).size;
  const reg = new Set(live.map((d) => d.sgg_cd || d.region_profile || d.tenant_id)).size;
  const ok = !D.failed.includes('deploys');
  cells(runEl, [
    { k: 'svc', label: '서비스', env: ok ? counted(svc, D.asOf, '배포 기록(운영 · 시범)') : null, href: V3 + 'lx-deploy/' },
    { k: 'reg', label: '지역', env: ok ? counted(reg, D.asOf, '배포 기록(운영 · 시범)') : null, tail: '곳', href: V3 + 'lx-deploy/' },
  ]);
}

/* ── 만들 수 있는 것 — 만드는 중(진행 중 프로젝트) · 만들 수 있는 업무(③ 서비스 만들기와 같은 판정) · 재학습(서비스 관리와 같은 규칙) ── */
async function drawMake() {
  const re = D.today?.cells?.find((c) => c.k === 'retrain')?.env || null;
  const base = (all, ready) => [
    { k: 'making', label: '만드는 중', env: all ? all.total : null, href: PROJECTS + '?scope=all' },
    { k: 'tasks', label: '업무', env: ready, tail: `/${TASKS.length}`, onClick: () => assemble() },
    { k: 'retrain', label: '재학습', env: re, href: V3 + 'lx-deploy/?tab=ops#ops' },
  ];
  const all = await api('/projects?scope=all').catch(() => null);
  cells(makeEl, base(all, null));
  await loadAssembly(null);
  const n = TASKS.filter((t) => judge(t, null).ready).length;
  cells(makeEl, base(all, D.assemblyOk ? counted(n, D.cardsAsOf || D.asOf, '서비스 카드 기록') : null));
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
  const taken = [mineEl, runEl, makeEl, legendEl, document.querySelector('.lc-drawer')].filter((e) => e?.isConnected).map((e) => { const b = e.getBoundingClientRect(); return [b.left - sr.left, b.top - sr.top, b.right - sr.left, b.bottom - sr.top]; });
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
    onMade: async () => { await load({ force: true }); drawPins(); drawLegend(); drawRun(); },
  });
}
if (location.hash === '#assemble') assemble();
