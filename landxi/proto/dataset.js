// 데이터 관리 — 썸네일 그리드. 텍스트 행 0, 썸네일이 목록이다.
// 규칙.
//  1) 기능은 원본과 1:1 — https://mini531.github.io/namwon-smart-village/landxi7/dataset.html
//     의 4탭(`?tab=upload|manage|publishing|archive`)·필터·검색·폼·액션·모달이 전부다.
//     대조표: docs/superpowers/proto/2026-08-26-dataset-parity.md
//  2) 조판은 design-canvas/v2/B5-DataMgmt.dc.html(NOTES.md §13). 유보 3 반영:
//     ① 활성 칩만 잉크 ② 드로어는 닫힌 채로 시작 ③ 실패 SHP 는 실좌표 캔버스.
//  3) 발주 추가 — 아카이브 `표시` = 그 자산이 우측 판의 레이어로 선다(ds-plate.js). 좌표가 없으면 `실측 범위 없음`.
//  4) 콘티 원칙(§5): 목록은 원본 목업 시드 = `시연`. 좌표·GSD 는 imagery.js 실측. 지어낸 운영 서사 없음.
import {
  nf, SEED_TAG, TABS, TAB_IDS, DEFAULT_TAB, FMT_FILTERS, KIND_FILTERS, matchFmt,
  DROP, ACCEPT_EXT, UP_ST, UP_ACTIONS, ACT_NAME, UPLOADS, UP_FOLD,
  DISK, QUOTA_PRESETS, ARCHIVE, ORGS, PERMS, SHARE_DEFAULT,
  DONE_UP, PUB_TYPES, PUB_PREFILL, PUB_STEPS, PUBLISHING, PUB_ST,
  IMG, ATTRIB, FOOT_LINKS, FOOT_ADDR, THUMB, SILHOUETTE, XLSX_ROWS, ZIP_TREE, FAIL_ACTIONS,
} from './ds-data.js';
import { silhouette, xlsxTable, zipTree, noneBox, bracket, loadGeo, esc } from './ds-thumbs.js';
import { mountPlate, Brackets, addRaster, addVector, setHidden, removeLayer, hasLayer, frame, KOREA_SW } from './ds-plate.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const REDUCED = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const INK = '#010102', AMBER = '#FFB633';
const TW = 240, TH = 147;

/* ══ A1–A11 좌측 레일 — 대시보드와 같은 컴포넌트, 활성만 `데이터 관리` ═══ */
const NAV = [
  { menu: 'dashboard', name: '대시보드', href: 'dashboard.html', icon: 'dash', go: 'dashboard.html' },
  { menu: 'media', name: '데이터 관리', href: 'dataset.html', icon: 'data', go: 'dataset.html' },
  { menu: 'project', name: '프로젝트', href: 'ai-project.html', icon: 'proj' },
  { menu: 'analysis', name: '분석 서비스', href: 'analysis-ai.html', icon: 'run' },
  { menu: 'map', name: '지도 서비스', href: 'ximap.html', icon: 'map' },
];
const NAV_FOOT = [
  { menu: 'support', name: '서비스 지원', href: 'notice.html', icon: 'help' },
  { menu: 'publish-admin', name: '카드 발행 관리', href: 'admin-publish.html', icon: 'stack' },
  { menu: 'admin', name: '서비스 관리', href: 'admin-notice.html', icon: 'gear' },
];
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
  <button type="button" class="rail-i" data-menu="${n.menu}" data-go="${n.go || ''}"
    title="원본 ${n.href}"${n.menu === 'media' ? ' aria-current="page"' : ''}>${railSvg(n.icon)}<span class="rl">${esc(n.name)}</span></button>`;
$('#rail-top').innerHTML = NAV.map(railItem).join('');
$('#rail-foot').innerHTML = NAV_FOOT.map(railItem).join('')
  + railItem({ menu: 'my', name: 'MY', href: 'mypage.html', icon: 'my' })
  + `<button type="button" class="rail-i" data-action="logout" title="원본 로그아웃">${railSvg('out')}<span class="rl">로그아웃</span></button>`;
$('#rail').addEventListener('click', (ev) => {
  const lo = ev.target.closest('[data-action="logout"]');
  if (lo) { try { localStorage.removeItem('lx_logged_in'); } catch { /* 저장소 차단 */ } location.href = '../home.html'; return; }
  const b = ev.target.closest('.rail-i[data-menu]'); if (!b) return;
  const go = b.dataset.go;
  if (go && go !== 'dataset.html') { location.href = go; return; }
  if (!go) say(`원본 ${b.title.replace('원본 ', '')} — 이 콘티에는 아직 없습니다`);
});

/* ══ 상태 ══════════════════════════════════════════════════════════════ */
const S = {
  tab: DEFAULT_TAB, filter: '전체', q: '',
  ups: UPLOADS.map((u) => ({ ...u })), upAll: false,
  done: DONE_UP.map((d) => ({ ...d })), doneSel: null,
  pubs: PUBLISHING.map((p) => ({ ...p })),
  arch: ARCHIVE.map((a) => ({ ...a, share: SHARE_DEFAULT.map((s) => ({ ...s })) })), archSel: null,
  side: 'none',            // none | pub | detail | map
  layers: [],              // 판에 선 순서(아카이브 id) — 표시된 순서
  focus: null,             // 판이 마지막으로 간 자산
  quotaGb: 256,
};
const sayEl = $('#say');
let sayT = 0;
function say(t) { sayEl.textContent = t; clearTimeout(sayT); sayT = setTimeout(() => { sayEl.textContent = ''; }, 4200); }
const revealed = new Set();
/** 이미지 리빌 — 타일이 처음 설 때 한 번만(clip-path inset(100% 0 0) → 0, 1s). 타이머 재렌더에는 다시 하지 않는다. */
function reveal(root) {
  $$('img[data-rv]', root).forEach((im) => {
    const k = im.dataset.rv;
    if (revealed.has(k) || REDUCED()) return;
    revealed.add(k);
    im.classList.add('in');
    requestAnimationFrame(() => requestAnimationFrame(() => im.classList.add('is-in')));
  });
}

/* ══ 탭 · `?tab=` 동기화 — 활성 칩만 잉크(마스터 유보 1) ══════════════════ */
const COUNT = { upload: () => S.ups.length, manage: () => S.done.length, publishing: () => S.pubs.length, archive: () => S.arch.length };
function renderTabs() {
  $('#ds-tabs').innerHTML = TABS.map((t) => `
    <button type="button" class="tb" id="tab-${t.id}" role="tab" data-tab="${t.id}"
      aria-selected="${t.id === S.tab}" aria-controls="panel-${t.id}" title="원본 ${t.frag}">${esc(t.name)}<span class="c n">${COUNT[t.id]()}</span></button>`).join('');
  const total = TAB_IDS.reduce((n, id) => n + COUNT[id](), 0);
  $('#ds-sub').textContent = `${total}건 · 업로드 ${COUNT.upload()} · 완료 ${COUNT.manage()} · 발행중 ${COUNT.publishing()} · 아카이브 ${COUNT.archive()} — 원본 4탭 · ${SEED_TAG}`;
}
const tabFromUrl = () => { const t = new URLSearchParams(location.search).get('tab'); return TAB_IDS.includes(t) ? t : DEFAULT_TAB; };
function setTab(id, push = true) {
  if (!TAB_IDS.includes(id)) id = DEFAULT_TAB;
  S.tab = id;
  // 원본 동작 — 탭 전환 시 필터·검색·하단 패널 상태가 초기화된다.
  S.filter = '전체'; S.q = ''; $('#q').value = '';
  S.doneSel = null; S.archSel = null;
  if (S.side !== 'map') setSide('none');
  document.body.dataset.tab = id;
  TABS.forEach((t) => { $(`#panel-${t.id}`).hidden = t.id !== id; });
  if (push) { const u = new URL(location.href); u.searchParams.set('tab', id); history.pushState({ tab: id }, '', u); }
  renderTabs(); renderFilters(); renderPanel();
  $('#grid').scrollTop = 0;
}
window.addEventListener('popstate', () => setTab(tabFromUrl(), false));
$('#ds-tabs').addEventListener('click', (ev) => { const b = ev.target.closest('.tb'); if (b) setTab(b.dataset.tab); });

/* ══ 필터(드롭다운) · 검색 ═════════════════════════════════════════════ */
function renderFilters() {
  const chips = S.tab === 'archive' ? KIND_FILTERS : FMT_FILTERS;
  $('#fsel-k').textContent = S.tab === 'archive' ? '유형' : '형식';
  $('#ds-filters').innerHTML = chips.map((c) => `<option value="${esc(c)}"${c === S.filter ? ' selected' : ''}>${esc(c)}</option>`).join('');
}
$('#ds-filters').addEventListener('change', (ev) => { S.filter = ev.target.value; renderPanel(); });
$('#q').addEventListener('input', (ev) => { S.q = ev.target.value.trim(); renderPanel(); });
const hit = (row) => { const q = S.q.toLowerCase(); return !q || [row.file, row.name, row.by, row.kind].filter(Boolean).some((v) => String(v).toLowerCase().includes(q)); };
const passFmt = (row) => matchFmt(row.file, S.filter);
const passKind = (row) => S.filter === '전체' || row.kind === S.filter;

function renderPanel() {
  if (S.tab === 'upload') renderUpload();
  if (S.tab === 'manage') renderDone();
  if (S.tab === 'publishing') renderPublishing();
  if (S.tab === 'archive') renderArchive();
}

/* ══ 타일 조각 ═════════════════════════════════════════════════════════ */
const word = (t) => `<span class="word n">${esc(t)}</span>`;
const shelf = (st, acts, ds) => `<div class="shelf"><span class="st n">${st}</span><span class="ax">${
  acts.map(([k, name]) => `<button type="button" class="act" data-act="${k}" ${ds}>${esc(name)}</button>`).join('')}</span></div>`;
const cap = (name, meta, sub) => `<p class="cap n"><span class="nm" title="${esc(name)}">${esc(name)}</span><span class="mt">· ${esc(meta)}</span></p>${
  sub ? `<p class="why n" title="${esc(sub)}">${esc(sub)}</p>` : ''}`;
const img = (src, id, cls = '') => `<img src="${esc(src)}" alt="" data-rv="${id}" class="${cls}" loading="lazy">`;
const demo = () => `<span class="tag"><em class="demo">${SEED_TAG}</em></span>`;
const date = (at) => String(at).slice(0, 10);
/** 파일 종류별 그림 — 그림이 없으면 흰 액자, 좌표도 없으면 점선 액자 + 이유. */
function body(fmt, id, opts = {}) {
  const t = THUMB[id];
  if (t) return { cls: 'th--dark', html: img(t, id) };
  if (fmt === 'XLSX') return { cls: 'th--box', html: xlsxTable(XLSX_ROWS) + demo() };
  if (fmt === 'ZIP') return { cls: 'th--box', html: zipTree(ZIP_TREE, opts.dim) };
  if (fmt === 'SHP' && SILHOUETTE[id]) return { cls: 'th--box', html: `<canvas width="${TW * 2}" height="${TH * 2}" data-sil="${id}"></canvas>`, sil: id };
  if (fmt === 'SHP') return { cls: 'th--dash th--none', html: noneBox('미리보기 없음', '좌표계 없음 · 판에 세우지 않는다') };
  return { cls: 'th--dash th--none', html: noneBox('미리보기 없음', `${fmt} · 파일 확인 전`) };
}
/** 캔버스 실루엣을 그린다 — 실좌표 GeoJSON. 그린 뒤 폴리곤 수를 우하단에 적는다. */
function drawSilhouettes(root) {
  $$('canvas[data-sil]', root).forEach(async (c) => {
    const spec = SILHOUETTE[c.dataset.sil];
    const big = c.width > 500;   // 드로어 액자는 여유가 크다
    const n = await silhouette(c, spec, { width: 1.2, pad: 24, padTop: big ? 30 : 60, padBottom: big ? 30 : 44 });
    const tag = c.parentElement.querySelector('.tagb');
    if (tag) tag.textContent = `${spec.crs} · ${nf.format(n)} polygon`;
  });
}

/* ── 업로드 탭 ─────────────────────────────────────────────────────── */
$('#dz-acc').textContent = DROP.accepts.map((a) => a.ext.slice(1).toUpperCase()).join(' ');
$('#file').accept = ACCEPT_EXT.join(',');
const upActs = (u) => UP_ACTIONS[u.st].map((k) => [k, ACT_NAME[k]]);
function upTile(u) {
  const live = u.st === 'run';
  const dim = !live;
  const t = THUMB[u.id];
  let inner;
  if (t) {
    inner = `${img(t, u.id, 'rv-base')}<div class="rv-top" style="--rest:${100 - u.pct}%">${img(t, u.id + 'b')}</div><span class="rv-line" style="--pct:${u.pct}%"></span>`;
  } else {
    const b = body(u.fmt, u.id, { dim: true });
    inner = b.html;
  }
  const st = live ? `업로드중 <b class="pv">${u.pct}%</b>` : `${UP_ST[u.st]} <span class="pv">${u.pct}%</span>`;
  const meta = u.st === 'wait' ? `대기 ${S.ups.filter((x) => x.st === 'wait').indexOf(u) + 1} · ${u.size}` : `${u.size}`;
  return `<div class="tile" role="listitem" data-id="${u.id}" data-st="${u.st}"${dim ? ' data-dim' : ''}>
    <div class="th ${t ? 'th--dark' : 'th--box'}"${live ? ' data-live' : ''}>${inner}${word('업로드')}${shelf(st, upActs(u), `data-up="${u.id}"`)}</div>
    ${cap(u.file, meta)}</div>`;
}
function renderUpload() {
  const rows = S.ups.filter((u) => passFmt(u) && hit(u));
  const shown = S.upAll ? rows : rows.slice(0, UP_FOLD);
  $('#up-tiles').innerHTML = shown.map(upTile).join('');
  const rest = rows.length - shown.length;
  const more = $('#up-more');
  more.hidden = rows.length <= UP_FOLD;
  if (!more.hidden) more.innerHTML = S.upAll ? `<button type="button" id="up-fold">접기</button>` : `대기중 ${rest}건 더 · <button type="button" id="up-fold">전체 보기</button>`;
  reveal($('#up-tiles'));
}
const gb = (v) => nf.format(v) + (Number.isInteger(v) ? '.0' : '');
$('#disk-pct b').textContent = DISK.pct;
$('#disk-use').textContent = `${gb(DISK.used)} / ${gb(DISK.total)} GB · 잔여 ${gb(DISK.free)} GB`;

$('#up-more').addEventListener('click', (ev) => { if (ev.target.closest('#up-fold')) { S.upAll = !S.upAll; renderUpload(); } });
$('#up-tiles').addEventListener('click', (ev) => {
  const b = ev.target.closest('.act[data-up]'); if (!b) return;
  const u = S.ups.find((x) => x.id === b.dataset.up); if (!u) return;
  const k = b.dataset.act;
  if (k === 'pause') { u.st = 'pause'; say(`일시정지 — ${u.file} · ${u.pct}%`); }
  if (k === 'resume') { u.st = 'run'; say(`재개 — ${u.file} · ${u.pct}%부터`); }
  if (k === 'retry') { u.st = 'run'; say(`이어 올리기 — ${u.file} · ${u.pct}%부터`); }
  if (k === 'cancel') { S.ups = S.ups.filter((x) => x.id !== u.id); say(`업로드 취소 — ${u.file}`); renderTabs(); }
  if (k === 'detail') { openDetailModal(u); return; }
  renderUpload();
});

/* 드롭존 — 드래그 & 클릭. 검증 3 = 파일 없음 · 허용 형식 · 1 TB 한도(원본과 같다). */
const drop = $('#drop');
drop.addEventListener('click', () => $('#file').click());
drop.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); $('#file').click(); } });
['dragenter', 'dragover'].forEach((t) => drop.addEventListener(t, (ev) => { ev.preventDefault(); drop.classList.add('on'); }));
['dragleave', 'drop'].forEach((t) => drop.addEventListener(t, (ev) => { ev.preventDefault(); drop.classList.remove('on'); }));
drop.addEventListener('drop', (ev) => take([...(ev.dataTransfer?.files || [])]));
$('#file').addEventListener('change', (ev) => take([...ev.target.files]));
let picked = [];
function take(files) {
  picked = files;
  const p = $('#up-picked');
  p.hidden = !files.length;
  p.textContent = files.length ? `선택 ${files.length}건 · ${files.map((f) => f.name).join(' · ')}` : '';
  $('#up-go').hidden = !files.length;
  validate();
}
function validate() {
  const e = $('#up-err');
  if (!picked.length) { e.hidden = true; return '파일을 선택해 주세요.'; }
  const bad = picked.find((f) => !ACCEPT_EXT.some((x) => f.name.toLowerCase().endsWith(x)));
  if (bad) { e.hidden = false; e.textContent = `허용하지 않는 형식입니다 — ${bad.name} (${ACCEPT_EXT.join(' · ')})`; return e.textContent; }
  const big = picked.find((f) => f.size > DROP.maxBytes);
  if (big) { e.hidden = false; e.textContent = `파일 하나가 1 TB 를 넘습니다 — ${big.name}`; return e.textContent; }
  e.hidden = true; return null;
}
$('#up-form').addEventListener('submit', (ev) => {
  ev.preventDefault();
  const err = validate();
  if (err) { const e = $('#up-err'); e.hidden = false; e.textContent = err; return; }
  for (const f of picked) {
    S.ups.push({ id: 'u' + (Date.now() + Math.random()).toString(36).slice(-6), st: 'wait', fmt: f.name.split('.').pop().toUpperCase(), file: f.name, pct: 0,
      size: f.size >= 1024 ** 3 ? `${(f.size / 1024 ** 3).toFixed(1)} GB` : `${(f.size / 1024 ** 2).toFixed(1)} MB` });
  }
  say(`업로드 대기열에 ${picked.length}건 추가 · ${SEED_TAG}`);
  take([]); $('#file').value = '';
  renderTabs(); renderUpload();
});

/* 유휴 운동 1개 — 업로드중 타일의 리빌. 실제로 도는 타이머이고 값은 `시연` 이다. 일시정지 = 멈춤, 재개 = 그 자리부터. */
function tick() {
  if (S.tab !== 'upload') return;
  for (const u of S.ups.filter((x) => x.st === 'run')) {
    u.pct = u.pct >= 99 ? 62 : Math.min(99, u.pct + 1);
    const th = $(`.tile[data-id="${u.id}"] .th`); if (!th) continue;
    const top = th.querySelector('.rv-top'), ln = th.querySelector('.rv-line'), pv = th.querySelector('.pv');
    if (top) top.style.setProperty('--rest', `${100 - u.pct}%`);
    if (ln) ln.style.setProperty('--pct', `${u.pct}%`);
    if (pv) pv.textContent = `${u.pct}%`;
  }
}
if (!REDUCED()) setInterval(tick, 1600);

/* ── 업로드 완료 탭 — 조용한 타일. 선택 = 브래킷 + 선반 `지도 레이어 발행 ›` → 드로어 ── */
function dnTile(d) {
  const b = body(d.fmt, d.id);
  const sel = S.doneSel === d.id;
  return `<div class="tile" role="listitem" data-id="${d.id}"${sel ? ' aria-current="true"' : ''}>
    <div class="th ${b.cls}" data-open="${d.id}">${b.html}${sel ? bracket(TW, TH, INK) : ''}${word(`완료 · 아카이빙 ${d.arch}회`)}${
      b.sil ? `<span class="tagb n"></span>` : ''}${sel ? shelf('선택', [['pub', '지도 레이어 발행 ›']], `data-dn="${d.id}"`) : ''}</div>
    ${cap(d.file, `${date(d.at)} · ${d.size}`)}</div>`;
}
function renderDone() {
  const rows = S.done.filter((d) => passFmt(d) && hit(d));
  $('#dn-empty').hidden = rows.length > 0;
  $('#dn-list').innerHTML = rows.map(dnTile).join('');
  reveal($('#dn-list')); drawSilhouettes($('#dn-list'));
}
$('#dn-list').addEventListener('click', (ev) => {
  const b = ev.target.closest('.act[data-dn]');
  if (b) { openPubForm(b.dataset.dn); return; }
  const th = ev.target.closest('[data-open]');
  if (th) { S.doneSel = S.doneSel === th.dataset.open ? null : th.dataset.open; renderDone(); }
});

/* 발행 드로어 — 발행 유형 / 기준 일자 / 데이터명 / 출처 / 설명 + 공유 권한 표(기관명 / 권한명 3단) */
$('#pf-type').innerHTML = PUB_TYPES.map((t) => `<option>${esc(t)}</option>`).join('');
const segRow = (org, cur, i, attr) => `<div class="pr"><span class="o">${esc(org)}</span><span class="seg n" role="group" aria-label="${esc(org)} 권한명">${
  PERMS.map((p) => `<button type="button" ${attr}="${i}" data-perm="${esc(p)}" aria-pressed="${p === cur}">${esc(p)}</button>`).join('')}</span></div>`;
let pfPerm = SHARE_DEFAULT.map((s) => ({ ...s }));
const renderPfPerm = () => { $('#pf-perm').innerHTML = pfPerm.map((r, i) => segRow(r.org, r.perm, i, 'data-pf')).join(''); };
$('#pf-perm').addEventListener('click', (ev) => { const b = ev.target.closest('[data-pf]'); if (!b) return; pfPerm[+b.dataset.pf].perm = b.dataset.perm; renderPfPerm(); });
function figFor(row, im) {
  const t = THUMB[row.id] || row.thumb;
  if (im && t) {
    const cm = (im.gsd * 100).toFixed(2);
    return `<div class="fig fig--ink">${img(t, 'fig-' + row.id)}${bracket(416, 200, '#fff')}<span class="fc n">${im.bounds.map((v) => v.toFixed(4)).join(',').replace(/,([^,]*),/, ',$1 ~ ')} · EPSG:5186 → 4326 · GSD ${cm} cm</span><span class="fm n">측정</span></div>`;
  }
  if (t) return `<div class="fig">${img(t, 'fig-' + row.id)}</div>`;
  if (SILHOUETTE[row.id]) return `<div class="fig"><canvas width="832" height="400" data-sil="${row.id}"></canvas><span class="fm n dk">${esc(SILHOUETTE[row.id].crs)}</span></div>`;
  if (row.fmt === 'XLSX') return `<div class="fig">${xlsxTable(XLSX_ROWS)}</div>`;
  if (row.fmt === 'ZIP' || row.kind === '이미지셋') return `<div class="fig">${zipTree(ZIP_TREE)}</div>`;
  return `<div class="fig fig--none">${noneBox('미리보기 없음', '좌표계 없음 · 판에 세우지 않는다')}</div>`;
}
/** 완료본 ↔ 도엽 — 파일명이 imagery.js 도엽과 같은 자산일 때만 실측 좌표를 적는다. */
const imFor = (row) => (row.id === 'd4' ? IMG.find((i) => i.id === 'namwon_2504') : row.id === 'd5' ? IMG.find((i) => i.id === 'namwon_2506') : null);
function openPubForm(id) {
  const d = S.done.find((x) => x.id === id); if (!d) return;
  S.doneSel = id;
  const pre = PUB_PREFILL[id] || {};
  $('#pf-type').value = pre.type || (d.fmt === 'SHP' || d.fmt === 'XLSX' ? PUB_TYPES[1] : d.fmt === 'ZIP' ? PUB_TYPES[2] : PUB_TYPES[0]);
  $('#pf-basis').value = pre.basis || date(d.at).replace(/\./g, '-');
  $('#pf-name').value = pre.name || ''; $('#pf-src').value = pre.src || ''; $('#pf-desc').value = pre.desc || '';
  $('#pf-sel').innerHTML = `${esc(d.file)} · ${esc(d.size)} · ${esc(date(d.at))} · 아카이빙 ${d.arch}회 <em class="demo">${SEED_TAG}</em>`;
  $('#pf-fig').innerHTML = figFor(d, imFor(d));
  drawSilhouettes($('#pf-fig'));
  pfPerm = SHARE_DEFAULT.map((s) => ({ ...s })); renderPfPerm();
  $('#pf-err').hidden = true;
  setSide('pub');
  renderDone();
  $('#pf-name').focus();
}
$('#pubform').addEventListener('submit', (ev) => {
  ev.preventDefault();
  const e = $('#pf-err');
  const name = $('#pf-name').value.trim();
  if (!$('#pf-basis').value) { e.hidden = false; e.textContent = '기준 일자를 선택해 주세요.'; return; }
  if (!name) { e.hidden = false; e.textContent = '데이터명을 입력해 주세요.'; return; }
  e.hidden = true;
  const d = S.done.find((x) => x.id === S.doneSel);
  if (d) {
    S.pubs.unshift({ id: 'p' + Date.now().toString(36).slice(-5), fmt: d.fmt, st: 'run', step: 1, file: d.file, size: d.size, at: d.at, by: d.by, thumb: THUMB[d.id] || null, from: d.id });
    S.done = S.done.filter((x) => x.id !== d.id);
  }
  S.doneSel = null; setSide('none');
  say(`지도 레이어 발행 시작 — ${name} · ${pfPerm.map((s) => `${s.org} ${s.perm}`).join(' · ')} · ${SEED_TAG}`);
  setTab('publishing');
});
document.addEventListener('click', (ev) => { if (ev.target.closest('[data-close-drawer]')) { S.doneSel = null; setSide('none'); if (S.tab === 'manage') renderDone(); } });

/* ── 레이어 발행중 탭 — 4단계 눈금. 실패 = 앰버 브래킷 + 눈금 1 + 사유 원문. 지우지 않는다. ── */
const ticks = (p, ink) => `<span class="ticks${ink ? ' ticks--ink' : ''}">${[1, 2, 3, 4].map((i) => `<i class="${i <= p.step - (p.st === 'fail' ? 1 : 0) ? 'on' : (p.st === 'fail' && i === p.step ? 'fail' : '')}"></i>`).join('')}</span>`;
function pbTile(p) {
  const t = THUMB[p.id] || (p.from && THUMB[p.from]);
  const b = t ? { cls: 'th--dark', html: img(t, p.id) } : body(p.fmt, p.id);
  const fail = p.st === 'fail';
  const stepTxt = `${p.step}/4 ${PUB_STEPS[p.step - 1]}`;
  const acts = fail ? FAIL_ACTIONS.map((k) => [k, { crs: '좌표계 지정', cancel: '발행 취소', detail: '세부 정보' }[k]]) : [['cancel', '발행 취소'], ['detail', '세부 정보']];
  return `<div class="tile" role="listitem" data-id="${p.id}" data-st="${p.st}">
    <div class="th ${b.cls}">${b.html}${ticks(p, !t)}${fail ? bracket(TW, TH, AMBER) : ''}${word(fail ? '발행중 · 실패' : '발행중')}${
      b.sil ? `<span class="tag2 n"></span>` : ''}${shelf(fail ? `실패 ${stepTxt}` : stepTxt, acts, `data-pb="${p.id}"`)}</div>
    ${cap(p.file, `${date(p.at)} · ${p.size}`, fail ? p.why : '')}</div>`;
}
function renderPublishing() {
  const rows = S.pubs.filter((p) => passFmt(p) && hit(p));
  $('#pb-empty').hidden = rows.length > 0;
  $('#pb-list').innerHTML = rows.map(pbTile).join('');
  reveal($('#pb-list'));
  $$('canvas[data-sil]', $('#pb-list')).forEach(async (c) => {
    const spec = SILHOUETTE[c.dataset.sil];
    const n = await silhouette(c, spec, { width: 1.2, pad: 24, padTop: 70, padBottom: 44 });
    const tag = c.parentElement.querySelector('.tag2'); if (tag) tag.textContent = `${spec.crs} · ${n} polygon`;
  });
}
$('#pb-list').addEventListener('click', (ev) => {
  const b = ev.target.closest('.act[data-pb]'); if (!b) return;
  const p = S.pubs.find((x) => x.id === b.dataset.pb); if (!p) return;
  const k = b.dataset.act;
  if (k === 'cancel') { S.pubs = S.pubs.filter((x) => x.id !== p.id); say(`발행 취소 — ${p.file}`); renderTabs(); renderPublishing(); }
  if (k === 'detail') openDetailModal(p, true);
  if (k === 'crs') { crsId = p.id; $('#mc-sub').textContent = `${p.file} · ${p.why}`; openModal('#m-crs'); }
});
let crsId = null;
$('#m-crs').addEventListener('submit', (ev) => {
  ev.preventDefault();
  const p = S.pubs.find((x) => x.id === crsId);
  if (p) { p.st = 'run'; p.step = 1; p.crs = $('#mc-epsg').value; say(`좌표계 ${p.crs} 지정 — ${p.file} · 1/4 파일 확인부터 다시 · ${SEED_TAG}`); }
  closeModal(); renderPublishing();
});

/* ── 아카이브 탭 — 유형·표시/숨김이 좌상단 단어로, 5액션이 선반으로. 숨김 = 감쇠, 삭제 아님. ── */
/** 자산의 실측 기하 — imagery.js 도엽 타일이거나 results/* GeoJSON. 없으면 null(판이 자백한다). */
function geomOf(a) {
  const im = a.imagery && IMG.find((i) => i.id === a.imagery);
  if (im) return { kind: 'raster', bounds: im.bounds, im, cap: `${im.label} · GSD ${(im.gsd * 100).toFixed(2)} cm · 측정` };
  if (a.geo) return { kind: 'vector', bounds: a.geo.bounds, file: a.geo.file, cap: `${a.name} · ${a.geo.unit} ${a.geo.count}셀 · EPSG:4326 · 측정` };
  return null;
}
function arTile(a) {
  const g = geomOf(a);
  let inner, cls;
  if (a.thumb) { cls = 'th--dark'; inner = img(a.thumb, a.id); }
  else if (a.kind === '이미지셋') { cls = 'th--box'; inner = zipTree(ZIP_TREE); }
  else if (SILHOUETTE[a.id]) { cls = 'th--box'; inner = `<canvas width="${TW * 2}" height="${TH * 2}" data-sil="${a.id}"></canvas><span class="tagb n"></span>`; }
  else { cls = 'th--dash th--none'; inner = noneBox('미리보기 없음', g ? '' : '좌표계 없음 · 판에 세우지 않는다'); }
  const meta = g && g.kind === 'raster' ? `${a.basis} · ${(g.im.gsd * 100).toFixed(2)} cm` : `${a.basis} · ${a.size}`;
  const acts = [['vis', a.hidden ? '표시' : '숨김'], ['share', '공유'], ['geo', '공간 편집'], ['del', '삭제'], ['detail', '상세']];
  return `<div class="tile" role="listitem" data-id="${a.id}" data-hidden="${a.hidden ? 1 : 0}"${a.hidden ? ' data-dim' : ''}${S.archSel === a.id ? ' aria-current="true"' : ''}>
    <div class="th ${cls}" data-open="${a.id}">${inner}${S.archSel === a.id ? bracket(TW, TH, INK) : ''}${word(`아카이브 · ${a.kind} · ${a.hidden ? '숨김' : '표시'}`)}${
      shelf(a.hidden ? '숨김 — 삭제 아님' : '표시', acts, `data-ar="${a.id}"`)}</div>
    ${cap(a.name, meta)}</div>`;
}
function renderArchive() {
  const rows = S.arch.filter((a) => passKind(a) && hit(a));
  $('#ar-empty').hidden = rows.length > 0;
  $('#ar-list').innerHTML = rows.map(arTile).join('');
  reveal($('#ar-list')); drawSilhouettes($('#ar-list'));
}
$('#ar-list').addEventListener('click', (ev) => {
  const b = ev.target.closest('.act[data-ar]');
  if (b) { archAct(b.dataset.ar, b.dataset.act); return; }
  const th = ev.target.closest('[data-open]');
  if (th) openDetail(th.dataset.open);
});
function archAct(id, k) {
  const a = S.arch.find((x) => x.id === id); if (!a) return;
  if (k === 'vis') { a.hidden = !a.hidden; renderArchive(); if (S.archSel === id) openDetail(id, true); showOnPlate(a, !a.hidden); return; }
  if (k === 'share') { openShare(a); return; }
  if (k === 'geo') { editGeo(a); return; }
  if (k === 'detail') { openDetail(id); return; }
  if (k === 'del') {
    S.arch = S.arch.filter((x) => x.id !== id);
    S.layers = S.layers.filter((x) => x !== id);
    if (map) removeLayer(map, id);
    if (S.archSel === id) { S.archSel = null; if (S.side === 'detail') setSide('none'); }
    say(`삭제 — ${a.name}`); renderTabs(); renderArchive(); if (S.side === 'map') renderLayers();
  }
}
/** 상세 드로어 — 데이터명 / 출처 / 설명 + 밴드·속성 표. */
function openDetail(id, keep) {
  const a = S.arch.find((x) => x.id === id); if (!a) return;
  S.archSel = id;
  $('#detail-h').textContent = a.name;
  $('#detail-sub').innerHTML = `${esc(a.kind)} · ${esc(a.file)} · ${esc(a.size)} · 기준일 ${esc(a.basis)} <em class="demo">${SEED_TAG}</em>`;
  const g = geomOf(a);
  $('#detail-fig').innerHTML = figFor(a, g && g.im);
  drawSilhouettes($('#detail-fig'));
  $('#detail-rows').innerHTML = Object.entries(a.detail).map(([k, v]) => `<div class="dt-r"><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join('')
    + `<div class="dt-r"><span>실측 범위</span><b>${g ? g.bounds.map((v) => v.toFixed(4)).join(', ') : '실측 범위 없음'}</b></div>`;
  $('#detail-bands').innerHTML = a.bands.map(([k, v]) => `<div class="dt-b"><i>${esc(k)}</i><em>${esc(v)}</em></div>`).join('');
  $('#detail [data-act="vis"]').textContent = a.hidden ? '표시' : '숨김';
  setSide('detail');
  if (!keep) renderArchive();
}
$('#detail-x').addEventListener('click', () => { S.archSel = null; setSide('none'); renderArchive(); });
$('#detail').addEventListener('click', (ev) => {
  const b = ev.target.closest('.act[data-act]'); if (!b || !S.archSel) return;
  archAct(S.archSel, b.dataset.act);
});
/** 공간 편집 — 원본은 판 위에 편집용 벡터를 올리고 그 범위로 fit 한다. 여기서는 판을 열고 그 범위로 간다. */
function editGeo(a) {
  const g = geomOf(a);
  if (!g) { say(`공간 편집 — ${a.name} · 실측 범위 없음, 판에 세우지 않습니다`); return; }
  showOnPlate(a, true, true);
  say(`공간 편집 — ${a.name} · 판에서 범위를 잡습니다`);
}

/* ══ 판 — 표시 → 레이어 ══════════════════════════════════════════════════
   표시된 타일 하나 = 레이어 하나. 표시하면 판이 열리고 그 범위로 간다(줌 투 익스텐트).
   숨김은 레이어 목록에 감쇠로 남고 판에서는 꺼진다. 실측 범위가 없는 자산은 판이 그렇다고 말한다. */
let map = null, bk = null, mounting = null;
async function ensureMap() {
  if (map) return map;
  if (!mounting) {
    mounting = mountPlate($('#plate')).then((m) => {
      map = m; bk = new Brackets(m, $('#ex-layer'));
      m.on('idle', () => { document.documentElement.dataset.plate = 'idle'; });
      m.on('movestart', () => { document.documentElement.dataset.plate = 'moving'; });
      document.documentElement.dataset.plate = 'ready';
      window.__dsMap = m;   // 검증용 — e2e 가 레이어 유무를 본다
      return m;
    }).catch(() => { document.documentElement.dataset.plate = 'off'; return null; });
  }
  return mounting;
}
async function putLayer(a) {
  const g = geomOf(a); if (!g || !map) return null;
  if (!hasLayer(map, a.id)) {
    if (g.kind === 'raster') addRaster(map, a.id, g.im, a.hidden);
    else { const data = await loadGeo(g.file); if (data) addVector(map, a.id, data, a.hidden); }
  } else setHidden(map, a.id, a.hidden);
  return g;
}
/** 표시(on) / 숨김(off) 을 판에 반영한다. on 이면 판을 열고 그 범위로 간다. */
async function showOnPlate(a, on, fit = true) {
  if (!S.layers.includes(a.id)) S.layers.push(a.id);
  S.focus = a.id;
  const g = geomOf(a);
  if (on) setSide('map');
  if (S.side !== 'map') return;
  const m = await ensureMap();
  if (!m) { renderLayers(); return; }
  await syncLayers();
  if (on && g && fit) frame(m, g.bounds, { maxZoom: g.kind === 'raster' ? 16.6 : 14.2 });
  if (on && !g) say(`${a.name} — 실측 범위 없음, 판에 세우지 않습니다`);
  if (!on) say(`${a.name} — 숨김(감쇠). 레이어 목록에 남습니다`);
  renderLayers();
}
/** 판의 레이어 = S.layers 순서. 아카이브에서 지워진 것은 내려온다. */
async function syncLayers() {
  if (!map) return;
  for (const id of S.layers) { const a = S.arch.find((x) => x.id === id); if (a) await putLayer(a); }
  bk.set(S.layers.map((id) => S.arch.find((x) => x.id === id)).filter(Boolean).map((a) => ({ a, g: geomOf(a) })).filter((x) => x.g)
    .map(({ a, g }) => ({ id: a.id, bounds: g.bounds, dim: a.hidden, title: a.name, sub: g.kind === 'raster' ? `GSD ${(g.im.gsd * 100).toFixed(2)} cm` : `${a.geo.count}셀` })));
}
function renderLayers() {
  const rows = S.layers.map((id) => S.arch.find((x) => x.id === id)).filter(Boolean);
  const live = rows.filter((a) => !a.hidden && geomOf(a));
  $('#map-sub').textContent = `레이어 ${rows.length} · 표시 ${rows.filter((a) => !a.hidden).length} · 숨김 ${rows.filter((a) => a.hidden).length} — V-World 정사영상 · EPSG:4326`;
  $('#layers').innerHTML = rows.length ? rows.map((a) => {
    const g = geomOf(a);
    return `<div class="ly" data-id="${a.id}" data-kind="${g ? g.kind : 'none'}" data-hidden="${a.hidden ? 1 : 0}">
      <span class="sw"></span><span class="nm">${esc(a.name)}</span>
      <span class="mt n">${g ? (g.kind === 'raster' ? `도엽 · GSD ${(g.im.gsd * 100).toFixed(2)} cm` : `GeoJSON · ${a.geo.count}셀`) : '실측 범위 없음'}</span>
      ${g ? `<button type="button" class="act n" data-ly="${a.id}" data-act="fit">범위로</button>` : ''}
      <button type="button" class="act n" data-ly="${a.id}" data-act="vis">${a.hidden ? '표시' : '숨김'}</button></div>`;
  }).join('') : `<p class="ly-empty">아카이브 타일의 <b>표시</b>를 누르면 그 자산이 여기 레이어로 섭니다.</p>`;
  const f = S.arch.find((x) => x.id === S.focus), g = f && geomOf(f);
  $('#plate-cap').textContent = g ? g.cap : (f ? `${f.name} · 실측 범위 없음` : '');
  const none = $('#plate-none');
  none.hidden = live.length > 0 || document.documentElement.dataset.plate === 'off' && false;
  if (!live.length) none.textContent = rows.length ? '표시된 자산 중 실측 범위가 있는 것이 없습니다 — 실측 범위 없음' : '표시된 레이어 없음';
  if (document.documentElement.dataset.plate === 'off') { none.hidden = false; none.textContent = 'WebGL 없음 — 판을 세우지 못했습니다'; }
}
$('#layers').addEventListener('click', (ev) => {
  const b = ev.target.closest('[data-ly]'); if (!b) return;
  const a = S.arch.find((x) => x.id === b.dataset.ly); if (!a) return;
  if (b.dataset.act === 'vis') { archAct(a.id, 'vis'); return; }
  const g = geomOf(a); if (g && map) { S.focus = a.id; frame(map, g.bounds, { maxZoom: g.kind === 'raster' ? 16.6 : 14.2 }); renderLayers(); }
});
/** 지도 보기 토글 — 표시된 아카이브 전부를 레이어로 세운다. 그리드가 1급, 판은 3열을 남기고 선다. */
async function openMap() {
  for (const a of S.arch) if (!a.hidden && !S.layers.includes(a.id)) S.layers.push(a.id);
  setSide('map');
  const m = await ensureMap();
  renderLayers();
  if (!m) return;
  m.resize();
  await syncLayers();
  const live = S.layers.map((id) => S.arch.find((x) => x.id === id)).filter((a) => a && !a.hidden).map(geomOf).filter(Boolean);
  if (live.length && !S.focus) {
    const b = live.reduce((o, g) => [Math.min(o[0], g.bounds[0]), Math.min(o[1], g.bounds[1]), Math.max(o[2], g.bounds[2]), Math.max(o[3], g.bounds[3])], [Infinity, Infinity, -Infinity, -Infinity]);
    frame(m, b, { maxZoom: 15 });
  } else if (!live.length) frame(m, KOREA_SW, { maxZoom: 8 });
  renderLayers();
}
$('#view-map').addEventListener('click', () => (S.side === 'map' ? setSide('none') : openMap()));
$('#view-grid').addEventListener('click', () => { setSide('none'); S.doneSel = null; S.archSel = null; renderPanel(); });

/* 우측 슬롯 — 드로어 셋이 한 자리를 나눠 쓴다. 닫힌 채로 시작(마스터 유보 2). */
function setSide(k) {
  S.side = k;
  document.body.dataset.side = k;
  $('#pubdrawer').hidden = k !== 'pub';
  $('#detail').hidden = k !== 'detail';
  $('#mapdrawer').hidden = k !== 'map';
  $('#view-map').setAttribute('aria-pressed', String(k === 'map'));
  $('#view-grid').setAttribute('aria-pressed', String(k === 'none'));
  if (k === 'map' && map) requestAnimationFrame(() => map.resize());
}

/* ══ 모달 ══════════════════════════════════════════════════════════════ */
let lastFocus = null;
function openModal(sel) {
  lastFocus = document.activeElement;
  $('#scrim').hidden = false; $(sel).hidden = false;
  const f = $(sel).querySelector('input:not([hidden]),select,textarea,button'); if (f) f.focus();
}
function closeModal() {
  $('#scrim').hidden = true; $$('.modal').forEach((m) => { m.hidden = true; });
  if (lastFocus && lastFocus.focus) lastFocus.focus();
}
$('#scrim').addEventListener('click', closeModal);
document.addEventListener('click', (ev) => { if (ev.target.closest('[data-close]')) closeModal(); });
document.addEventListener('keydown', (ev) => {
  if (ev.key !== 'Escape') return;
  if (!$('#scrim').hidden) { closeModal(); return; }
  if (S.side === 'detail') { S.archSel = null; setSide('none'); renderArchive(); }
  else if (S.side === 'pub') { S.doneSel = null; setSide('none'); renderDone(); }
});

/* 디스크 증량 신청 — 32/64/128/256/512/1024 프리셋 + 직접 입력 + 사유 */
$('#mq-presets').innerHTML = QUOTA_PRESETS.map((g) => `<button type="button" class="chip n" data-gb="${g}" aria-pressed="${g === S.quotaGb}">${g}</button>`).join('')
  + `<button type="button" class="chip" data-gb="custom" aria-pressed="false">직접 입력</button>`;
$('#mq-presets').addEventListener('click', (ev) => {
  const b = ev.target.closest('[data-gb]'); if (!b) return;
  const v = b.dataset.gb;
  $$('#mq-presets .chip').forEach((c) => c.setAttribute('aria-pressed', String(c === b)));
  $('#mq-gb').hidden = v !== 'custom';
  S.quotaGb = v === 'custom' ? null : Number(v);
  if (v === 'custom') $('#mq-gb').focus();
});
$('#quota-open').addEventListener('click', () => {
  $('#mq-tag').textContent = `내 디스크 사용량 · ${gb(DISK.used)} / ${gb(DISK.total)} GB · 잔여 ${gb(DISK.free)} GB · ${SEED_TAG}`;
  $('#mq-err').hidden = true; openModal('#m-quota');
});
$('#m-quota').addEventListener('submit', (ev) => {
  ev.preventDefault();
  const e = $('#mq-err');
  const g = S.quotaGb || Number($('#mq-gb').value);
  const why = $('#mq-why').value.trim();
  if (!g || g <= 0) { e.hidden = false; e.textContent = '신청 용량을 선택하거나 입력해 주세요.'; return; }
  if (!why) { e.hidden = false; e.textContent = '신청 사유를 입력해 주세요.'; return; }
  closeModal(); say(`디스크 증량 신청 접수 — ${nf.format(g)} GB · ${SEED_TAG}`);
});

/* 공유 설정 — 기관명 / 권한명 표 */
let shareId = null, msPerm = [];
function openShare(a) {
  shareId = a.id;
  $('#ms-sub').textContent = `${a.name} · ${a.file}`;
  msPerm = ORGS.map((org) => ({ org, perm: (a.share.find((s) => s.org === org) || { perm: '권한 없음' }).perm }));
  renderMs(); openModal('#m-share');
}
const renderMs = () => { $('#ms-perm').innerHTML = msPerm.map((r, i) => segRow(r.org, r.perm, i, 'data-ms')).join(''); };
$('#ms-perm').addEventListener('click', (ev) => { const b = ev.target.closest('[data-ms]'); if (!b) return; msPerm[+b.dataset.ms].perm = b.dataset.perm; renderMs(); });
$('#m-share').addEventListener('submit', (ev) => {
  ev.preventDefault();
  const a = S.arch.find((x) => x.id === shareId);
  if (a) { a.share = msPerm.map((s) => ({ ...s })); say(`공유 설정 저장 — ${a.name} · ${a.share.map((s) => `${s.org} ${s.perm}`).join(' · ')}`); }
  closeModal();
});

/* 세부 정보 — 업로드 · 발행중 */
function openDetailModal(r, pub) {
  $('#md-h').textContent = pub ? '레이어 발행 세부 정보' : '업로드 세부 정보';
  const rows = pub
    ? [['파일명', r.file], ['형식', r.fmt], ['상태', PUB_ST[r.st]], ['단계', `${r.step}/4 ${PUB_STEPS[r.step - 1]}`], ['크기', r.size], ['업로드', r.at], ...(r.why ? [['실패 사유', r.why]] : []), ...(r.crs ? [['좌표계', r.crs]] : [])]
    : [['파일명', r.file], ['형식', r.fmt], ['업로드 상태', UP_ST[r.st]], ['진행률', `${r.pct}%`], ['크기', r.size]];
  rows.push(['자료', `원본 목업 시드 · ${SEED_TAG}`]);
  $('#md-rows').innerHTML = rows.map(([k, v]) => `<div class="dt-r"><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join('');
  openModal('#m-detail');
}

/* ══ 푸터 · 기동 ═══════════════════════════════════════════════════════ */
$('#attrib').textContent = ATTRIB;
$('#foot-links').innerHTML = FOOT_LINKS.map((t) => `<span>${esc(t)}</span>`).join('');
$('#foot-addr').textContent = FOOT_ADDR;
$('#foot').insertAdjacentHTML('beforeend', `<span class="fam">Family Site<svg width="8" height="5" viewBox="0 0 9 6" fill="none" stroke="#686868" stroke-width="1.25" aria-hidden="true"><path d="M.5.5 4.5 5 8.5.5"/></svg></span>`);

setTab(tabFromUrl(), false);
document.documentElement.dataset.plate = 'closed';
document.documentElement.dataset.ds = 'ready';
