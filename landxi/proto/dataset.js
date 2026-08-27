// 데이터 관리 — 대시보드와 같은 골격(공지 · 기준일 · 제목 · KPI 카드 5) 아래의 단계 뷰.
// 규칙.
//  1) 기능은 원본과 1:1 — https://mini531.github.io/namwon-smart-village/landxi7/dataset.html
//     의 4탭(`?tab=upload|manage|publishing|archive`)·필터·검색·폼·액션·모달이 전부다.
//     대조표: docs/superpowers/proto/2026-08-26-dataset-parity.md
//  2) 조판은 design-canvas/v2/B5-DataMgmt.dc.html(NOTES.md §13.7). 발주(2026-08-27):
//     "대시보드와 동일하게 공지는 그대로 두고 아래로 내려서 · 디스크·업로드·완료·발행중은 카드로 상단에 · 그 아래 진행 상황 ·
//      업로드 완료를 선택하면 자동으로 오른쪽에 지도와 기본 정보 · 발행중은 진행 경과를 카드 위에 시각적으로 ·
//      미니 카드 아래 표시/숨김/공유/공간 편집/발행 같은 것은 없고 오른쪽 카드를 펼쳐서 정리 · 카드는 4배수로 키우게"
//     발주 2차(2026-08-27): "업로드는 카드를 선택하면 오른쪽 정보 창, 선택하지 않으면 일반 카드별 진행현황 전체 · 타일은 4 6 8 16, 아래 페이지 수 ·
//      업로드 완료는 카드 클릭하면 실제 위치 정보와 성과, 위치 정보가 없는 건 데이터 테이블 속성 ·
//      아카이브 우 패널의 레이어 표시 이력은 의미 없다 — 메모 등 유용한 컨텐츠"
//  3) KPI 카드 = 단계 선택. 타일에는 선반이 없다 — 상태는 그림 위에, 액션은 우 패널에. 쪽당 4·6·8·16 + 페이저.
//  4) 아카이브 `표시` = 그 자산이 우측 판의 레이어로 선다(ds-plate.js). 좌표가 없으면 `실측 범위 없음`.
//  5) 콘티 원칙(§5): 목록은 원본 목업 시드 = `시연`. 좌표·GSD 는 imagery.js 실측. 문장 0 — 라벨·수·상태어만.
import {
  nf, SEED_TAG, TABS, TAB_IDS, DEFAULT_TAB, FMT_FILTERS, KIND_FILTERS, matchFmt, extOf,
  DROP, ACCEPT_EXT, UP_ST, UP_ACTIONS, ACT_NAME, UPLOADS,
  DISK, QUOTA_PRESETS, ARCHIVE, ORGS, PERMS, SHARE_DEFAULT,
  DONE_UP, PUB_TYPES, PUB_PREFILL, PUB_STEPS, PUBLISHING, PUB_ST, PUB_PCT,
  PER_PAGE, PP_DEFAULT, PP_KEY, MEMO_KEY, MEMO_MAX, bytesOf, fmtBytes,
  RESULT_OF, RESULT_BY_ID, resultRow, SCHEMA, SCHEMA_OF, USAGE, PUBLISH_LOG,
  IMG, ATTRIB, FOOT_LINKS, FOOT_ADDR, THUMB, SILHOUETTE, XLSX_ROWS, ZIP_TREE, FAIL_ACTIONS,
} from './ds-data.js';
import { NOTICE, T1, ymd } from './db-data.js';
import { silhouette, xlsxTable, zipTree, noneBox, loadGeo, bboxOf, esc } from './ds-thumbs.js';
import { mountPlate, Brackets, addRaster, addVector, setHidden, removeLayer, hasLayer, frame, KOREA_SW } from './ds-plate.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const REDUCED = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const ACCENT = '#006DF7', WARN = '#D1352B';
const TW = 480, TH = 294;   // 실루엣 캔버스 — 타일은 열 폭에 맞춰 늘어난다

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
  if (lo) { try { localStorage.removeItem('lx_logged_in'); } catch { /* 저장소 차단 */ } location.href = 'scrub/index.html'; return; }
  const b = ev.target.closest('.rail-i[data-menu]'); if (!b) return;
  const go = b.dataset.go;
  if (go && go !== 'dataset.html') { location.href = go; return; }
  if (!go) say(`원본 ${b.title.replace('원본 ', '')} — 콘티 밖`);
});

/* ══ 마스트헤드 — 공지 + 기준일(대시보드와 같은 값) ═══════════════════════ */
$('#notice-t').textContent = NOTICE.title;
$('#notice-d').textContent = ymd(NOTICE.date);
$('#b-notice').href = `${NOTICE.more}?notice=${NOTICE.id}`;
$('#b2-d').textContent = ymd(T1);

/* ══ 상태 ══════════════════════════════════════════════════════════════ */
const S = {
  tab: DEFAULT_TAB, filter: '전체', q: '',
  ups: UPLOADS.map((u) => ({ ...u })),
  done: DONE_UP.map((d) => ({ ...d })),
  pubs: PUBLISHING.map((p) => ({ ...p })),
  arch: ARCHIVE.map((a) => ({ ...a, share: SHARE_DEFAULT.map((s) => ({ ...s })) })),
  sel: null,               // 현재 단계에서 선택된 타일 id
  mode: 'none',            // none | tile | pub — 우 패널이 보여 주는 것
  more: false,             // 세부 정보 / 상세 펼침
  layers: [],              // 판에 선 순서(아카이브 id) — 표시된 순서
  focus: null,             // 판이 마지막으로 간 자산
  quotaGb: 256,
  pp: PP_DEFAULT,          // 쪽당 타일 수 4 · 6 · 8 · 16
  page: 1,
};
const sayEl = $('#say');
let sayT = 0;
let map = null, bk = null, mounting = null;   // 판 — 한 번만 mount(아래 ensureMap)
function say(t) { sayEl.textContent = t; clearTimeout(sayT); sayT = setTimeout(() => { sayEl.textContent = ''; }, 4200); }
const revealed = new Set();
/** 이미지 리빌 — 타일이 처음 설 때 한 번만(clip-path inset(100% 0 0) → 0, 1s). */
function reveal(root) {
  $$('img[data-rv]', root).forEach((im) => {
    const k = im.dataset.rv;
    if (revealed.has(k) || REDUCED()) return;
    revealed.add(k);
    im.classList.add('in');
    requestAnimationFrame(() => requestAnimationFrame(() => im.classList.add('is-in')));
  });
}

/* ══ KPI 카드 5 — 디스크(조치 = warn) + 단계 4(선택 = 틴트) · `?tab=` ═══════ */
const COUNT = { upload: () => S.ups.length, manage: () => S.done.length, publishing: () => S.pubs.length, archive: () => S.arch.length };
const gb = (v) => nf.format(Math.round(v));
const by = (rows, f) => rows.reduce((m, r) => { const k = f(r); m[k] = (m[k] || 0) + 1; return m; }, {});
const fmtOf = (r) => { const e = extOf(r.file).toUpperCase(); return e === 'TIFF' ? 'TIF' : e === 'XLS' ? 'XLSX' : e; };
function kpiSub(id) {
  if (id === 'upload') { const c = by(S.ups, (u) => u.st); return `진행 중 ${c.run || 0} · 일시정지 ${c.pause || 0} · 중단 ${c.stop || 0} · 대기 ${c.wait || 0}`; }
  if (id === 'manage') { const c = by(S.done, fmtOf); return Object.entries(c).map(([k, n]) => `${k} ${n}`).join(' · '); }
  if (id === 'publishing') { const c = by(S.pubs, (p) => p.st); return `진행 ${c.run || 0} · <em>실패 ${c.fail || 0}</em>`; }
  const c = by(S.arch, (a) => (a.hidden ? 'h' : 'v')); return `표시 ${c.v || 0} · 숨김 ${c.h || 0}`;
}
function renderKpi() {
  const disk = `<div class="k act" role="presentation" id="kpi-disk" title="원본 dataset-upload.html 내 디스크 사용량">
    <span class="kl">내 디스크 사용량</span><span class="kv"><b class="big n">${DISK.pct}</b><span>%</span></span>
    <span class="ks n">${gb(DISK.used)} / ${gb(DISK.total)} GB · 잔여 ${gb(DISK.free)} GB</span><button type="button" id="quota-open" class="ul warn">디스크 증량 신청 ›</button></div>`;
  $('#b-kpi').innerHTML = disk + TABS.map((t) => `
    <button type="button" class="k${t.id === 'publishing' && S.pubs.some((p) => p.st === 'fail') ? ' actsub' : ''}" role="tab" id="kpi-${t.id}" data-tab="${t.id}"
      aria-selected="${t.id === S.tab}" aria-controls="panel-${t.id}" title="원본 ${esc(t.frag)}">
      <span class="kl">${esc(t.name)}</span><span class="kv"><b class="big n">${COUNT[t.id]()}</b><span>건</span></span>
      <span class="ks n">${kpiSub(t.id)}</span></button>`).join('');
  $$('#b-kpi .actsub .ks em').forEach((e) => e.classList.add('warn'));
  $('#tool-h').textContent = TABS.find((t) => t.id === S.tab).name;
}
$('#b-kpi').addEventListener('click', (ev) => {
  if (ev.target.closest('#quota-open')) { openQuota(); return; }
  const b = ev.target.closest('.k[data-tab]'); if (b) setTab(b.dataset.tab);
});
const tabFromUrl = () => { const t = new URLSearchParams(location.search).get('tab'); return TAB_IDS.includes(t) ? t : DEFAULT_TAB; };
function setTab(id, push = true) {
  if (!TAB_IDS.includes(id)) id = DEFAULT_TAB;
  S.tab = id;
  // 원본 동작 — 탭 전환 시 필터·검색·선택이 초기화된다.
  S.filter = '전체'; S.q = ''; $('#q').value = '';
  S.sel = null; S.mode = 'none'; S.more = false; S.page = 1;
  document.body.dataset.tab = id;
  TABS.forEach((t) => { $(`#panel-${t.id}`).hidden = t.id !== id; });
  if (push) { const u = new URL(location.href); u.searchParams.set('tab', id); history.pushState({ tab: id }, '', u); }
  renderKpi(); renderFilters(); renderPanel(); renderSide();
  $('#grid').scrollTop = 0;
}
window.addEventListener('popstate', () => setTab(tabFromUrl(), false));

/* ══ 툴바 — 필터 · 검색 · 쪽당 타일 수 4단(localStorage) + 페이저 ═══════════ */
function renderFilters() {
  const chips = S.tab === 'archive' ? KIND_FILTERS : FMT_FILTERS;
  $('#fsel-k').textContent = S.tab === 'archive' ? '유형' : '형식';
  $('#ds-filters').innerHTML = chips.map((c) => `<option value="${esc(c)}"${c === S.filter ? ' selected' : ''}>${esc(c)}</option>`).join('');
}
$('#ds-filters').addEventListener('change', (ev) => { S.filter = ev.target.value; S.page = 1; renderPanel(); });
$('#q').addEventListener('input', (ev) => { S.q = ev.target.value.trim(); S.page = 1; renderPanel(); });
const hit = (row) => { const q = S.q.toLowerCase(); return !q || [row.file, row.name, row.by, row.kind].filter(Boolean).some((v) => String(v).toLowerCase().includes(q)); };
const passFmt = (row) => matchFmt(row.file, S.filter);
const passKind = (row) => S.filter === '전체' || row.kind === S.filter;
/** 쪽당 4 · 6 · 8 · 16 = 열 2 · 3 · 4 · 4(16 = 4×4). 바꾸면 1쪽으로. localStorage 에 남는다. */
function setPp(n, save = true) {
  n = Number(n); if (!PER_PAGE[n]) n = PP_DEFAULT;
  S.pp = n; S.page = 1; document.body.dataset.pp = String(n);
  $$('#pp button').forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.pp) === n)));
  if (save) { try { localStorage.setItem(PP_KEY, String(n)); } catch { /* 저장소 차단 */ } }
  if (map) requestAnimationFrame(() => map.resize());
}
$('#pp').addEventListener('click', (ev) => { const b = ev.target.closest('[data-pp]'); if (b) { setPp(b.dataset.pp); renderPanel(); } });
try { setPp(localStorage.getItem(PP_KEY) || PP_DEFAULT, false); } catch { setPp(PP_DEFAULT, false); }
/** 페이저 — 필터·검색을 거친 목록을 쪽당 수로 자른다. slot = 그 쪽에 항상 서는 고정 타일(업로드 드롭존 1). */
function pageOf(rows, slot = 0) {
  const per = Math.max(1, S.pp - slot);
  const pages = Math.max(1, Math.ceil(rows.length / per));
  if (S.page > pages) S.page = pages;
  if (S.page < 1) S.page = 1;
  const pg = $('#pager'); pg.dataset.pages = String(pages);
  $('#pg-n').textContent = `${S.page} / ${pages}`;
  $('#pg-prev').disabled = S.page <= 1; $('#pg-next').disabled = S.page >= pages;
  const start = (S.page - 1) * per;
  return rows.slice(start, start + per);
}
$('#pager').addEventListener('click', (ev) => {
  if (ev.target.closest('#pg-prev')) S.page -= 1; else if (ev.target.closest('#pg-next')) S.page += 1; else return;
  renderPanel(); $('#grid').scrollTop = 0;
});

function renderPanel() {
  if (S.tab === 'upload') renderUpload();
  if (S.tab === 'manage') renderDone();
  if (S.tab === 'publishing') renderPublishing();
  if (S.tab === 'archive') renderArchive();
  const n = { upload: () => S.ups, manage: () => S.done, publishing: () => S.pubs, archive: () => S.arch }[S.tab]().length;
  $('#tool-c').textContent = `${n}건`;
}

/* ══ 타일 조각 — 그림 + 이름 + 메타 1줄. 상태는 그림 위에. 선반 없음. ═══════ */
const word = (t) => `<span class="word n">${esc(t)}</span>`;
const stw = (html, warn) => `<span class="st n${warn ? ' warn' : ''}">${html}</span>`;
const corners = (color) => `<i class="bk bk--tl" style="--bk:${color}"></i><i class="bk bk--tr" style="--bk:${color}"></i><i class="bk bk--bl" style="--bk:${color}"></i><i class="bk bk--br" style="--bk:${color}"></i>`;
/** 캡션 — 이름은 줄고 메타는 남는다. 메타 앞부분(날짜·대기 순번)은 S·M 열에서 접혀 이름이 산다. */
const cap = (name, meta) => { const i = meta.indexOf(' · '); const a = i > 0 ? meta.slice(0, i) : '', b = i > 0 ? meta.slice(i + 3) : meta;
  return `<p class="cap n"><span class="nm" title="${esc(name)}">${esc(name)}</span><span class="mt">${a ? `<span class="dt">· ${esc(a)} </span>` : ''}· ${esc(b)}</span></p>`; };
const img = (src, id, cls = '', eager = false) => `<img src="${esc(src)}" alt="" data-rv="${id}" class="${cls}"${eager ? '' : ' loading="lazy"'}>`;
const figImg = (src, id) => img(src, 'fig-' + id, '', true);
const date = (at) => String(at).slice(0, 10);
const cm = (im) => `${(im.gsd * 100).toFixed(2)} cm`;
const bounds4 = (b) => b.map((v) => v.toFixed(4)).join(', ');
/** 파일 종류별 그림 — 그림이 없으면 흰 액자, 좌표도 없으면 점선 액자 + 이유. */
function body(fmt, id, opts = {}) {
  const t = THUMB[id];
  if (t) return { cls: 'th--dark', html: img(t, id) };
  if (fmt === 'XLSX') return { cls: 'th--box', html: xlsxTable(XLSX_ROWS) };
  if (fmt === 'ZIP') return { cls: 'th--box', html: zipTree(ZIP_TREE, opts.dim) };
  if (fmt === 'SHP' && SILHOUETTE[id]) return { cls: 'th--box', html: `<canvas width="${TW}" height="${TH}" data-sil="${id}"></canvas>`, sil: id };
  if (fmt === 'SHP') return { cls: 'th--dash th--none', html: noneBox('미리보기 없음', '좌표계 없음') };
  return { cls: 'th--dash th--none', html: noneBox('미리보기 없음', `${fmt} · 파일 확인 전`) };
}
/** 리빌 = 진행률. 그림 위의 그림, 경계 1px. 업로드·발행 공용. */
const revealPair = (t, id, pct) => `${img(t, id, 'rv-base')}<div class="rv-top" style="--rest:${100 - pct}%">${img(t, id + 'b')}</div><span class="rv-line" style="--pct:${pct}%"></span>`;
/** 캔버스 실루엣을 그린다 — 실좌표 GeoJSON. 그린 뒤 폴리곤 수를 우하단에 적는다. */
function drawSilhouettes(root) {
  $$('canvas[data-sil]', root).forEach(async (c) => {
    const spec = SILHOUETTE[c.dataset.sil];
    const big = c.width > 500;
    const n = await silhouette(c, spec, { width: 1.2, pad: 24, padTop: big ? 30 : 56, padBottom: big ? 30 : 44 });
    const tag = c.parentElement.querySelector('.tagb');
    if (tag) tag.textContent = `${spec.crs} · ${nf.format(n)} polygon`;
  });
}
const selAttr = (id) => (S.sel === id ? ' aria-current="true"' : '');
const selBk = (id) => (S.sel === id ? corners(ACCENT) : '');

/* ── 업로드 — 드롭존 타일 + 진행 4상태(그림 위 리빌 + %) ───────────────── */
$('#dz-acc').textContent = DROP.accepts.map((a) => a.ext.slice(1).toUpperCase()).join(' ');
$('#file').accept = ACCEPT_EXT.join(',');
function upTile(u) {
  const live = u.st === 'run';
  const t = THUMB[u.id];
  let inner, cls;
  if (t) { cls = 'th--dark'; inner = revealPair(t, u.id, u.pct); }
  else { const b = body(u.fmt, u.id, { dim: true }); cls = b.cls; inner = b.html; }
  const st = live ? `업로드중 <b class="pv">${u.pct}%</b>` : `${UP_ST[u.st]} <span class="pv">${u.pct}%</span>`;
  const meta = u.st === 'wait' ? `대기 ${S.ups.filter((x) => x.st === 'wait').indexOf(u) + 1} · ${u.size}` : `${u.size}`;
  return `<div class="tile" role="listitem" data-id="${u.id}" data-st="${u.st}"${live ? '' : ' data-dim'}${selAttr(u.id)}>
    <div class="th ${cls}"${live ? ' data-live' : ''} data-open="${u.id}">${inner}${selBk(u.id)}${word('업로드')}${stw(st)}</div>
    ${cap(u.file, meta)}</div>`;
}
function renderUpload() {
  // 발주(2026-08-27): "대기중 n건 더 · 전체 보기 는 필요 없다. 대기중 다 표출" — 접지 않는다. 그리드가 스크롤한다.
  const rows = pageOf(S.ups.filter((u) => passFmt(u) && hit(u)), 1);   // 드롭존이 매 쪽 첫 타일
  $('#up-tiles').innerHTML = rows.map(upTile).join('');
  reveal($('#up-tiles'));
}
function upAct(u, k) {
  if (k === 'pause') { u.st = 'pause'; say(`일시정지 — ${u.file} · ${u.pct}%`); }
  if (k === 'resume') { u.st = 'run'; say(`재개 — ${u.file} · ${u.pct}%`); }
  if (k === 'retry') { u.st = 'run'; say(`이어 올리기 — ${u.file} · ${u.pct}%`); }
  if (k === 'cancel') { S.ups = S.ups.filter((x) => x.id !== u.id); say(`업로드 취소 — ${u.file}`); S.sel = null; S.mode = 'none'; renderKpi(); }
  if (k === 'detail') { S.more = !S.more; }
  renderUpload(); renderSide();
}

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
  if (!picked.length) { e.hidden = true; return '파일 없음'; }
  const bad = picked.find((f) => !ACCEPT_EXT.some((x) => f.name.toLowerCase().endsWith(x)));
  if (bad) { e.hidden = false; e.textContent = `허용 형식 아님 — ${bad.name} · ${ACCEPT_EXT.map((x) => x.slice(1).toUpperCase()).join(' ')}`; return e.textContent; }
  const big = picked.find((f) => f.size > DROP.maxBytes);
  if (big) { e.hidden = false; e.textContent = `1 TB 초과 — ${big.name}`; return e.textContent; }
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
  say(`업로드 대기 +${picked.length}건 · ${SEED_TAG}`);
  take([]); $('#file').value = '';
  renderKpi(); renderUpload(); renderSide();   // 현황판에도 한 줄 선다
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
    if (S.sel === u.id) { const sp = $('#side [data-pv]'); if (sp) sp.textContent = `${u.pct}%`; const st = $('#side .rv-top'); if (st) st.style.setProperty('--rest', `${100 - u.pct}%`); const sl = $('#side .rv-line'); if (sl) sl.style.setProperty('--pct', `${u.pct}%`); }
    // 진행 현황판(선택 없음) — 막대 · % · 잔여가 같이 움직인다
    const pb = $(`#side .pb[data-id="${u.id}"]`);
    if (pb) { pb.querySelector('.bar').style.setProperty('--pct', `${u.pct}%`); pb.querySelector('[data-ppct]').textContent = `${u.pct}%`; pb.querySelector('[data-prem]').textContent = remain(u); }
  }
}
if (!REDUCED()) setInterval(tick, 1600);

/* ── 업로드 완료 — 조용한 타일. 선택 = 브래킷 + 우 패널(지도 + 기본 정보) ── */
function dnTile(d) {
  const b = body(d.fmt, d.id);
  return `<div class="tile" role="listitem" data-id="${d.id}"${selAttr(d.id)}>
    <div class="th ${b.cls}" data-open="${d.id}">${b.html}${selBk(d.id)}${word(`완료 · 아카이빙 ${d.arch}회`)}${b.sil ? `<span class="tagb n"></span>` : ''}</div>
    ${cap(d.file, `${date(d.at)} · ${d.size}`)}</div>`;
}
function renderDone() {
  const all = S.done.filter((d) => passFmt(d) && hit(d));
  const rows = pageOf(all);
  $('#dn-empty').hidden = all.length > 0;
  $('#dn-list').innerHTML = rows.map(dnTile).join('');
  reveal($('#dn-list')); drawSilhouettes($('#dn-list'));
}
/** 완료본 ↔ 도엽 — 파일명이 imagery.js 도엽과 같은 자산일 때만 실측 좌표를 적는다. */
const imFor = (row) => (row.id === 'd4' ? IMG.find((i) => i.id === 'namwon_2504') : row.id === 'd5' ? IMG.find((i) => i.id === 'namwon_2506') : null);

/* 발행 폼 — 발행 유형 / 기준 일자 / 데이터명 / 출처 / 설명 + 공유 권한 표(기관명 / 권한명 3단). 우 패널의 `발행` 상태. */
const segRow = (org, cur, i, attr) => `<div class="pr"><span class="o">${esc(org)}</span><span class="seg n" role="group" aria-label="${esc(org)} 권한명">${
  PERMS.map((p) => `<button type="button" ${attr}="${i}" data-perm="${esc(p)}" aria-pressed="${p === cur}">${esc(p)}</button>`).join('')}</span></div>`;
let pfPerm = SHARE_DEFAULT.map((s) => ({ ...s }));
const pubFormHtml = (d, pre) => `
  <form id="pubform" novalidate>
    <label class="fr"><span class="k">발행 유형 <b>*</b></span><select id="pf-type">${PUB_TYPES.map((t) => `<option${t === (pre.type || '') ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select></label>
    <label class="fr"><span class="k">기준 일자 <b>*</b></span><input id="pf-basis" type="date" class="n" value="${esc(pre.basis || date(d.at).replace(/\./g, '-'))}"></label>
    <label class="fr"><span class="k">데이터명 <b>*</b></span><input id="pf-name" type="text" placeholder="데이터명" value="${esc(pre.name || '')}"></label>
    <label class="fr"><span class="k">출처</span><input id="pf-src" type="text" placeholder="출처" value="${esc(pre.src || '')}"></label>
    <label class="fr"><span class="k">설명</span><input id="pf-desc" type="text" placeholder="설명" value="${esc(pre.desc || '')}"></label>
    <div class="ph"><span class="lb">공유 권한</span><span class="lb">기관명 / 권한명</span></div>
    <div id="pf-perm">${pfPerm.map((r, i) => segRow(r.org, r.perm, i, 'data-pf')).join('')}</div>
    <p class="add n">+ 기관 추가</p>
    <p id="pf-err" class="err" role="alert" hidden></p>
    <div class="acts">
      <button type="button" class="br" data-pf-close>취소</button>
      <button type="submit" class="fill d">발행</button>
      <span class="n hint">기준 일자 · 데이터명 필수</span>
    </div>
  </form>`;
function openPubForm(id) {
  const d = S.done.find((x) => x.id === id); if (!d) return;
  S.sel = id; S.mode = 'pub';
  pfPerm = SHARE_DEFAULT.map((s) => ({ ...s }));
  renderDone(); renderSide();
  $('#pf-name').focus();
}
document.addEventListener('click', (ev) => {
  const b = ev.target.closest('[data-pf]'); if (b) { pfPerm[+b.dataset.pf].perm = b.dataset.perm; $('#pf-perm').innerHTML = pfPerm.map((r, i) => segRow(r.org, r.perm, i, 'data-pf')).join(''); return; }
  if (ev.target.closest('[data-pf-close]')) { S.mode = 'tile'; renderSide(); }
});
document.addEventListener('submit', (ev) => {
  if (ev.target.id !== 'pubform') return;
  ev.preventDefault();
  const e = $('#pf-err');
  const name = $('#pf-name').value.trim();
  if (!$('#pf-basis').value) { e.hidden = false; e.textContent = '기준 일자 필수'; return; }
  if (!name) { e.hidden = false; e.textContent = '데이터명 필수'; return; }
  e.hidden = true;
  const d = S.done.find((x) => x.id === S.sel);
  if (d) {
    S.pubs.unshift({ id: 'p' + Date.now().toString(36).slice(-5), fmt: d.fmt, st: 'run', step: 1, file: d.file, size: d.size, at: d.at, by: d.by, thumb: THUMB[d.id] || null, from: d.id });
    S.done = S.done.filter((x) => x.id !== d.id);
  }
  say(`지도 레이어 발행 — ${name} · ${pfPerm.map((s) => `${s.org} ${s.perm}`).join(' · ')} · ${SEED_TAG}`);
  setTab('publishing');
});

/* ── 레이어 발행중 — 진행은 그림 위 4눈금 + 리빌 %, 실패는 warn 브래킷 + 짧은 사유. 지우지 않는다. ── */
const ticks = (p, ink) => `<span class="ticks${ink ? ' ticks--ink' : ''}">${[1, 2, 3, 4].map((i) => `<i class="${i <= p.step - (p.st === 'fail' ? 1 : 0) ? 'on' : (p.st === 'fail' && i === p.step ? 'fail' : '')}"></i>`).join('')}</span>`;
const pubPct = (p) => (p.st === 'fail' ? PUB_PCT[p.step - 1] : PUB_PCT[p.step - 1]);
function pbTile(p) {
  const t = THUMB[p.id] || (p.from && THUMB[p.from]);
  const fail = p.st === 'fail';
  let cls, inner;
  if (t) { cls = 'th--dark'; inner = revealPair(t, p.id, pubPct(p)); }
  else { const b = body(p.fmt, p.id, { dim: fail }); cls = b.cls; inner = b.html + (b.sil ? `<span class="tagb n"></span>` : ''); }
  const st = fail ? `실패 ${p.step}/4 · ${esc(p.short || '')}` : `${p.step}/4 <span class="dt">${esc(PUB_STEPS[p.step - 1])} </span><b class="pv">${pubPct(p)}%</b>`;
  return `<div class="tile" role="listitem" data-id="${p.id}" data-st="${p.st}"${fail ? ' data-dim' : ''}${selAttr(p.id)}>
    <div class="th ${cls}"${fail ? '' : ' data-live'} data-open="${p.id}">${inner}${ticks(p, !t)}${fail ? corners(WARN) : selBk(p.id)}${word('발행중')}${stw(st, fail)}</div>
    ${cap(p.file, `${date(p.at)} · ${p.size}`)}</div>`;
}
function renderPublishing() {
  const all = S.pubs.filter((p) => passFmt(p) && hit(p));
  const rows = pageOf(all);
  $('#pb-empty').hidden = all.length > 0;
  $('#pb-list').innerHTML = rows.map(pbTile).join('');
  reveal($('#pb-list')); drawSilhouettes($('#pb-list'));
}
let crsId = null;
function pbAct(p, k) {
  if (k === 'cancel') { S.pubs = S.pubs.filter((x) => x.id !== p.id); say(`발행 취소 — ${p.file}`); S.sel = null; S.mode = 'none'; renderKpi(); }
  if (k === 'detail') S.more = !S.more;
  if (k === 'crs') { crsId = p.id; $('#mc-sub').textContent = `${p.file} · ${p.why}`; openModal('#m-crs'); return; }
  renderPublishing(); renderSide();
}
$('#m-crs').addEventListener('submit', (ev) => {
  ev.preventDefault();
  const p = S.pubs.find((x) => x.id === crsId);
  if (p) { p.st = 'run'; p.step = 1; p.crs = $('#mc-epsg').value; say(`좌표계 ${p.crs} — ${p.file} · 1/4 파일 확인 · ${SEED_TAG}`); }
  closeModal(); renderKpi(); renderPublishing(); renderSide();
});

/* ── 아카이브 — 유형·표시/숨김은 그림 위 단어로. 5액션은 우 패널. 숨김 = 감쇠, 삭제 아님. ── */
/** 자산의 실측 기하 — imagery.js 도엽 타일이거나 results/* GeoJSON. 없으면 null(판이 자백한다). */
function geomOf(a) {
  const im = a.imagery && IMG.find((i) => i.id === a.imagery);
  if (im) return { kind: 'raster', bounds: im.bounds, im, cap: `${im.label} · GSD ${cm(im)} · 측정` };
  if (a.geo) return { kind: 'vector', bounds: a.geo.bounds, file: a.geo.file, cap: `${a.name} · ${a.geo.unit} ${a.geo.count}셀 · EPSG:4326 · 측정` };
  return null;
}
function arTile(a) {
  const g = geomOf(a);
  let inner, cls;
  if (a.thumb) { cls = 'th--dark'; inner = img(a.thumb, a.id); }
  else if (a.kind === '이미지셋') { cls = 'th--box'; inner = zipTree(ZIP_TREE); }
  else if (SILHOUETTE[a.id]) { cls = 'th--box'; inner = `<canvas width="${TW}" height="${TH}" data-sil="${a.id}"></canvas><span class="tagb n"></span>`; }
  else { cls = 'th--dash th--none'; inner = noneBox('미리보기 없음', g ? '' : '좌표계 없음'); }
  const meta = g && g.kind === 'raster' ? `${a.basis} · ${cm(g.im)}` : `${a.basis} · ${a.size}`;
  return `<div class="tile" role="listitem" data-id="${a.id}" data-hidden="${a.hidden ? 1 : 0}"${a.hidden ? ' data-dim' : ''}${selAttr(a.id)}>
    <div class="th ${cls}" data-open="${a.id}">${inner}${selBk(a.id)}${word(`아카이브 · ${a.kind}`)}${stw(a.hidden ? '숨김 · 삭제 아님' : '표시')}</div>
    ${cap(a.name, meta)}</div>`;
}
function renderArchive() {
  const all = S.arch.filter((a) => passKind(a) && hit(a));
  const rows = pageOf(all);
  $('#ar-empty').hidden = all.length > 0;
  $('#ar-list').innerHTML = rows.map(arTile).join('');
  reveal($('#ar-list')); drawSilhouettes($('#ar-list'));
}
function archAct(a, k) {
  if (k === 'vis') { a.hidden = !a.hidden; renderKpi(); renderArchive(); showOnPlate(a, !a.hidden); return; }
  if (k === 'share') { openShare(a); return; }
  if (k === 'geo') { editGeo(a); return; }
  if (k === 'detail') { S.more = !S.more; renderSide(); return; }
  if (k === 'del') {
    S.arch = S.arch.filter((x) => x.id !== a.id);
    S.layers = S.layers.filter((x) => x !== a.id);
    if (map) removeLayer(map, a.id);
    if (S.focus === a.id) S.focus = null;
    S.sel = null; S.mode = 'none';
    say(`삭제 — ${a.name}`); renderKpi(); renderArchive(); renderSide();
  }
}
/** 공간 편집 — 원본은 판 위에 편집용 벡터를 올리고 그 범위로 fit 한다. 여기서는 판이 그 범위로 간다. */
function editGeo(a) {
  const g = geomOf(a);
  if (!g) { say(`공간 편집 — ${a.name} · 실측 범위 없음`); return; }
  showOnPlate(a, true, true);
  say(`공간 편집 — ${a.name} · 범위로 이동`);
}

/* ══ 타일 선택 — 그리드 클릭 하나로 4단계 공용 ═══════════════════════════ */
$('#grid').addEventListener('click', (ev) => {
  const th = ev.target.closest('[data-open]'); if (!th) return;
  const id = th.dataset.open;
  S.sel = S.sel === id ? null : id;
  S.mode = S.sel ? 'tile' : 'none'; S.more = false;
  renderPanel(); renderSide();
});

/* ══ 우 패널 — 선택 타일을 펼친다: 판(지도/그림) + 기본 정보 + 액션 ═══════ */
const rowOf = (id) => ({ upload: S.ups, manage: S.done, publishing: S.pubs, archive: S.arch }[S.tab].find((x) => x.id === id));
const dl = (rows) => `<dl class="info">${rows.map(([k, v, cls = '']) => `<dt class="${cls.includes('wide') ? 'wide' : ''}">${esc(k)}</dt><dd class="${cls}${/^\d/.test(String(v)) ? ' n' : ''}">${v}</dd>`).join('')}</dl>`;
const actBtn = (k, name, ds, cls = '') => `<button type="button" class="act${cls ? ' ' + cls : ''}" data-act="${k}" ${ds}>${esc(name)}</button>`;
/** 그림 액자 — 지도가 아닐 때. */
function figFor(row, opts = {}) {
  const t = THUMB[row.id] || row.thumb || (row.from && THUMB[row.from]);
  if (t && opts.pct != null) return `<div class="fig fig--ink"${opts.live ? ' data-live' : ''}>${revealPair(t, 'fig-' + row.id, opts.pct)}${opts.extra || ''}</div>`;
  if (t) return `<div class="fig fig--ink">${figImg(t, row.id)}${opts.extra || ''}</div>`;
  if (SILHOUETTE[row.id]) return `<div class="fig"><canvas width="832" height="468" data-sil="${row.id}"></canvas><span class="fm n dk">${esc(SILHOUETTE[row.id].crs)}</span>${opts.extra || ''}</div>`;
  if (row.fmt === 'XLSX') return `<div class="fig">${xlsxTable(XLSX_ROWS)}${opts.extra || ''}</div>`;
  if (row.fmt === 'ZIP' || row.kind === '이미지셋') return `<div class="fig">${zipTree(ZIP_TREE)}${opts.extra || ''}</div>`;
  return `<div class="fig fig--none">${noneBox('미리보기 없음', row.fmt === 'SHP' ? '좌표계 없음' : `${row.fmt} · 파일 확인 전`)}${opts.extra || ''}</div>`;
}
function showFig(html) { $('#plate-wrap').hidden = true; const f = $('#fig-wrap'); f.hidden = false; f.innerHTML = html; drawSilhouettes(f); reveal(f); }
function showPlate() { $('#fig-wrap').hidden = true; $('#plate-wrap').hidden = false; }
function hideFrames() { $('#plate-wrap').hidden = true; const f = $('#fig-wrap'); f.hidden = true; f.innerHTML = ''; }

/* ── 진행 현황판(업로드 · 선택 없음) — 한 줄 = 한 건. 이름 · 상태어 · 막대 % · 크기 · 잔여. 발주 2차. ── */
const remain = (u) => fmtBytes(bytesOf(u.size) * (1 - u.pct / 100));
function boardHtml() {
  const c = by(S.ups, (u) => u.st);
  const head = `<div class="pbh"><span class="lb">파일 ${S.ups.length} · 진행 중 ${c.run || 0}</span><span class="lb">상태</span><span class="lb">진행률</span><span class="lb sz">크기</span><span class="lb rm">잔여</span></div>`;
  return head + S.ups.map((u) => `<div class="pb" data-id="${u.id}" data-st="${u.st}">
    <span class="nm" title="${esc(u.file)}">${esc(u.file)}</span><span class="stw">${esc(UP_ST[u.st])}</span>
    <span class="bar" style="--pct:${u.pct}%"><i></i><b class="n" data-ppct>${u.pct}%</b></span>
    <span class="sz n">${esc(u.size)}</span><span class="rm n" data-prem>${remain(u)}</span></div>`).join('');
}

/* ── 성과 — 이 자산에 닿은 실제 AI 결과(results.js). 판 위에 청록으로 서고, 범위 안 건수는 세어서 적는다. ── */
const resultsOf = (id) => (RESULT_OF[id] || []).map((rid) => resultRow(RESULT_BY_ID[rid])).filter(Boolean);
function resultsHtml(res, bounds) {
  if (!res.length) return '';
  const head = `<div class="ph"><span class="lb">성과 ${res.length} · AI 결과</span><span class="lb">결과 / 건수 / 분석일</span></div>`;
  return head + res.map((r) => `<div class="rs" data-res="${r.id}"><span class="sw"></span>
    <span class="nm">${esc(r.name)}${r.sub ? `<small class="n">· ${esc(r.sub)}</small>` : ''}${bounds ? `<small class="n" data-rin="${r.id}">· 범위 내 …</small>` : ''}</span>
    <span class="nv n"><b>${nf.format(r.n)}</b><span>${esc(r.unit)}</span></span><span class="at n">${esc(r.at)}</span></div>`).join('');
}
const hits = (b, bb) => b[2] >= bb[0] && b[0] <= bb[2] && b[3] >= bb[1] && b[1] <= bb[3];
/** 범위 안 건수 — 실제 GeoJSON 을 받아 자산 범위와 겹치는 피처를 센다. */
async function fillInBounds(res, bounds) {
  for (const r of res) {
    const g = await loadGeo(r.geojson);
    const el = $(`#side [data-rin="${r.id}"]`); if (!g || !el) continue;
    const n = g.features.filter((f) => hits(bboxOf([f]), bounds)).length;
    el.textContent = `· 범위 내 ${nf.format(n)}`;
  }
}

/* ── 데이터 테이블 속성 — 위치가 없는 완료본. 속성명 / 유형 / 예시. SHP(결과 GeoJSON 이 있는 것)는 첫 행 실값으로 바꿔 적는다. ── */
function schemaHtml(row) {
  const k = SCHEMA_OF[row.id], sc = k && SCHEMA[k]; if (!sc) return '';
  const head = `<div class="ph"><span class="lb">데이터 테이블 · ${sc.cols.length}열 · ${esc(sc.rows)}</span><span class="lb">속성명 / 유형 / 예시</span></div>`;
  return head + sc.cols.map(([n, t, e]) => `<div class="sc" data-col="${esc(n)}"><i>${esc(n)}</i><em>${esc(t)}</em><span class="exv">${esc(e)}</span></div>`).join('')
    + `<p class="attrib n">${sc.geo ? '예시 = 결과 첫 행 실값' : `예시 · ${SEED_TAG}`}</p>`;
}
async function fillSchemaFromGeo(row) {
  const k = SCHEMA_OF[row.id], sc = k && SCHEMA[k]; if (!sc || !sc.geo) return;
  const g = await loadGeo(sc.geo); if (!g || !g.features.length) return;
  const pr = g.features[0].properties || {};
  for (const [n] of sc.cols) {
    const el = $(`#side .sc[data-col="${n}"] .exv`); if (!el || pr[n] == null) continue;
    el.textContent = typeof pr[n] === 'number' ? nf.format(pr[n]) : String(pr[n]);
  }
}

/* ── 아카이브 — 사용 현황 · 발행 이력 · 메모(이 브라우저에만 저장). 레이어 목록 블록은 뺐다(발주 2차). ── */
function usageHtml(a) {
  const us = USAGE[a.id] || [];
  const head = `<div class="ph"><span class="lb">사용 현황 · ${us.length}</span><span class="lb">프로젝트 · 데이터셋 · 서비스 / 근거 · ${SEED_TAG}</span></div>`;
  return head + (us.length ? us.map((u) => `<div class="us" title="${esc(u.src)}"><span class="kd">${esc(u.kind)}</span><span class="nm">${esc(u.name)}</span><span class="rf n">${esc(u.ref)}</span></div>`).join('') : `<p class="us-empty n">사용 0</p>`);
}
function publishHtml(a) {
  const log = PUBLISH_LOG[a.id] || [];
  return `<div class="ph"><span class="lb">발행 이력 · ${log.length}</span><span class="lb">버전 / 일시 / 등록자 · ${SEED_TAG}</span></div>`
    + log.map(([v, at, who, wh]) => `<div class="pl"><span class="v n">${esc(v)}</span><span class="wh">${esc(wh)}</span><span class="by">${esc(who)}</span><span class="at n">${esc(at)}</span></div>`).join('');
}
const memoGet = (id) => { try { return JSON.parse(localStorage.getItem(MEMO_KEY(id)) || 'null') || { t: '', at: '' }; } catch { return { t: '', at: '' }; } };
const memoPut = (id, t) => { const at = new Date().toLocaleString('sv-SE').slice(0, 16).replace(/-/g, '.'); try { localStorage.setItem(MEMO_KEY(id), JSON.stringify({ t, at })); } catch { /* 저장소 차단 */ } return at; };
function memoHtml(a) {
  const m = memoGet(a.id);
  return `<div class="ph"><span class="lb">메모 · 이 브라우저에만 저장</span><span class="lb n"><span data-memo-n>${m.t.length}</span> / ${MEMO_MAX}</span></div>
    <div class="memo"><textarea id="memo" data-memo="${a.id}" maxlength="${MEMO_MAX}" rows="3" placeholder="메모" aria-label="메모 · 이 브라우저에만 저장">${esc(m.t)}</textarea>
    <p class="mf n"><span data-memo-at>${m.at ? `저장 ${esc(m.at)}` : '저장 없음'}</span><span class="dim">localStorage · 서버 저장 아님</span></p></div>`;
}
let memoT = 0;
$('#side').addEventListener('input', (ev) => {
  const ta = ev.target.closest('textarea[data-memo]'); if (!ta) return;
  const n = $('#side [data-memo-n]'); if (n) n.textContent = String(ta.value.length);
  clearTimeout(memoT);
  memoT = setTimeout(() => { const at = memoPut(ta.dataset.memo, ta.value); const el = $('#side [data-memo-at]'); if (el) { el.textContent = `저장 ${at}`; el.classList.add('saved'); } }, 300);
});
function renderSide() {
  const side = $('#side'), info = $('#side-info'), acts = $('#side-acts');
  const name = TABS.find((t) => t.id === S.tab).name;
  const total = COUNT[S.tab]();
  const row = S.sel && rowOf(S.sel);
  if (!row) { S.sel = null; S.mode = 'none'; }
  side.dataset.mode = S.mode;
  if (side.dataset.sel !== String(S.sel)) { side.dataset.sel = String(S.sel); $('#side-body').scrollTop = 0; }   // 선택이 바뀌면 맨 위부터
  $('#side-h').textContent = row ? (row.name || row.file) : name;
  $('#side-m').textContent = row ? `선택 1 / ${total}` : `선택 0 / ${total}`;
  info.innerHTML = ''; acts.innerHTML = '';
  if (!row) {
    // 빈 상태. 업로드 = 카드별 진행 현황판(발주 2차) · 그 외 = 단계의 건수.
    if (S.tab === 'upload') {
      hideFrames();
      $('#side-h').textContent = '진행 현황';
      info.innerHTML = boardHtml() + dl([['디스크', `${gb(DISK.used)} / ${gb(DISK.total)} GB`], ['잔여', `${gb(DISK.free)} GB`], ['허용 형식', ACCEPT_EXT.map((x) => x.slice(1).toUpperCase()).join(' · '), 'wide'], ['한도', '1 TB']]);
      applyMapMode('none');
      return;
    }
    showFig(`<div class="fig fig--none"><b class="big n">${total}</b><span class="t1">${esc(name)} · 선택 없음</span><span class="t2">타일 선택 → ${S.tab === 'archive' ? '판 · 사용 현황 · 발행 이력 · 메모' : '지도 · 기본 정보 · 액션'}</span></div>`);
    if (S.tab === 'archive') {
      const c = by(S.arch, (a) => a.kind), last = S.arch.map((a) => a.at).sort().pop() || '—';
      info.innerHTML = dl([['정사영상', `${c['정사영상'] || 0}건`], ['공간정보', `${c['공간정보'] || 0}건`], ['이미지셋', `${c['이미지셋'] || 0}건`], ['최근 등록', last]]);
    }
    applyMapMode('none');
    return;
  }
  if (S.tab === 'upload') {
    const u = row, live = u.st === 'run';
    showFig(figFor(u, { pct: u.pct, live, extra: `<span class="fc n">${esc(UP_ST[u.st])} <b data-pv>${u.pct}%</b></span>` }));
    const rows = [['파일명', esc(u.file), 'wide'], ['형식', u.fmt], ['크기', u.size], ['상태', `${live ? '<b>' : ''}${UP_ST[u.st]}${live ? '</b>' : ''}`], ['진행률', `${u.pct}%`]];
    if (S.more) rows.push(['대기 순번', u.st === 'wait' ? String(S.ups.filter((x) => x.st === 'wait').indexOf(u) + 1) : '—'], ['자료', `원본 목업 시드 · ${SEED_TAG}`]);
    info.innerHTML = dl(rows);
    acts.innerHTML = UP_ACTIONS[u.st].map((k) => actBtn(k, k === 'cancel' ? '취소' : ACT_NAME[k], `data-up="${u.id}"`, k === 'detail' && S.more ? 'on' : '')).join('');
    applyMapMode('none');
    return;
  }
  if (S.tab === 'manage') {
    // 도엽이 있으면 실제 위치(판 + 도엽 + 성과 청록) · 없으면 액자 + 데이터 테이블 속성(발주 2차)
    const d = row, im = imFor(d), res = resultsOf(d.id);
    if (im) { showPlate(); applyMapMode('sel', { id: d.id, im, title: d.file, sub: `GSD ${cm(im)}`, res }); }
    else { showFig(figFor(d)); applyMapMode('none'); }
    const base = [['이름', esc(d.file), 'wide'], ['형식', d.fmt], ['크기', d.size], ['업로드 일시', d.at], ['촬영일', im ? ymd(im.captured) : '—'],
      ['GSD', im ? cm(im) : '—'], ['좌표계', im ? 'EPSG:5186 → 4326' : SILHOUETTE[d.id] ? SILHOUETTE[d.id].crs : '—'],
      ['아카이빙', `${d.arch}회`], ['등록자', esc(d.by)], ['범위', im ? `<span class="n">${bounds4(im.bounds)}</span>` : '실측 범위 없음', 'wide']];
    if (S.mode === 'pub') {
      info.innerHTML = `<div class="ph"><span class="lb">지도 레이어 발행</span><span class="lb">${esc(d.file)} · ${esc(d.size)}</span></div>` + pubFormHtml(d, PUB_PREFILL[d.id] || {});
      return;
    }
    // 위치·성과가 먼저, 기본 정보는 그 아래(스크롤). 위치가 없으면 데이터 테이블 속성이 먼저.
    info.innerHTML = (im ? resultsHtml(res, im.bounds) : schemaHtml(d)) + dl(base);
    if (im) fillInBounds(res, im.bounds); else fillSchemaFromGeo(d);
    acts.innerHTML = actBtn('pub', '지도 레이어 발행 ›', `data-dn="${d.id}"`, 'pri');
    return;
  }
  if (S.tab === 'publishing') {
    const p = row, fail = p.st === 'fail';
    showFig(figFor(p, { pct: pubPct(p), live: !fail, extra: `${ticks(p, !(THUMB[p.id] || (p.from && THUMB[p.from])))}<span class="fc n${fail ? ' warn' : ''}">${fail ? `실패 ${p.step}/4 · ${esc(p.short || '')}` : `${p.step}/4 ${esc(PUB_STEPS[p.step - 1])} · ${pubPct(p)}%`}</span>` }));
    const rows = [['파일명', esc(p.file), 'wide'], ['형식', p.fmt], ['크기', p.size], ['업로드', p.at], ['상태', fail ? `<span class="warn">${PUB_ST[p.st]}</span>` : `<b>${PUB_ST[p.st]}</b>`], ['단계', `${p.step}/4 ${esc(PUB_STEPS[p.step - 1])}`, 'wide']];
    if (fail) rows.push(['실패 사유', esc(p.why), 'warn wide']);
    if (p.crs) rows.push(['좌표계', p.crs]);
    if (S.more) rows.push(['단계 4', PUB_STEPS.map((s, i) => `${i + 1} ${s}`).join(' · '), 'wide'], ['자료', `원본 목업 시드 · ${SEED_TAG}`, 'wide']);
    info.innerHTML = dl(rows);
    const list = fail ? FAIL_ACTIONS.map((k) => [k, { crs: '좌표계 지정', cancel: '발행 취소', detail: '세부 정보' }[k]]) : [['cancel', '발행 취소'], ['detail', '세부 정보']];
    acts.innerHTML = list.map(([k, n]) => actBtn(k, n, `data-pb="${p.id}"`, k === 'crs' ? 'pri' : k === 'detail' && S.more ? 'on' : '')).join('');
    applyMapMode('none');
    return;
  }
  // 아카이브 — 판(레이어) + 기본 정보 + (상세: 밴드·속성) + 사용 현황 · 성과 · 발행 이력 · 메모 + 5액션.
  // 표시 상태의 자산은 선택되면 레이어로 선다(숨김은 `표시` 를 눌러야). 레이어 목록·범위·표시 행은 뺐다(발주 2차: 의미 없음).
  const a = row, g = geomOf(a), res = resultsOf(a.id);
  if (!a.hidden && !S.layers.includes(a.id)) S.layers.push(a.id);
  showPlate(); applyMapMode('arch', a);
  // 사용 현황 → 성과 → 기본 정보 3행(이름 · 원본 파일 · 유형/형식 · 크기/기준일) → 발행 이력 → 메모. 나머지 행은 `상세` 에.
  const rows = [['이름', esc(a.name), 'wide'], ['원본 파일', esc(a.file), 'wide'], ['유형', a.kind], ['형식', extOf(a.file).toUpperCase()], ['크기', a.size], ['기준일', a.basis]];
  let html = dl(rows);
  if (S.more) {
    html += dl([['등록 일시', a.at], ['등록자', esc(a.by)], ['GSD', g && g.kind === 'raster' ? cm(g.im) : '—'], ['좌표계', g ? (g.kind === 'raster' ? 'EPSG:5186 → 4326' : 'EPSG:4326') : SILHOUETTE[a.id] ? SILHOUETTE[a.id].crs : '—'],
      ...Object.entries(a.detail).map(([k, v]) => [k, esc(v), 'wide'])]);
    html += `<div class="ph"><span class="lb">밴드 · 속성</span><span class="lb">속성명 / 속성정보</span></div>` + a.bands.map(([k, v]) => `<div class="dt-b"><i>${esc(k)}</i><em>${esc(v)}</em></div>`).join('');
  }
  // 쓰임(사용 현황 · 성과)이 먼저, 그 다음 기본 정보, 발행 이력, 메모.
  html = usageHtml(a) + resultsHtml(res, g ? g.bounds : null) + html + publishHtml(a) + memoHtml(a) + `<p class="attrib n">${esc(ATTRIB)}</p>`;
  info.innerHTML = html;
  if (g) fillInBounds(res, g.bounds);
  acts.innerHTML = [['vis', a.hidden ? '표시' : '숨김'], ['share', '공유'], ['geo', '공간 편집'], ['del', '삭제'], ['detail', '상세']]
    .map(([k, n]) => actBtn(k, n, `data-ar="${a.id}"`, k === 'detail' && S.more ? 'on' : '')).join('');
}
$('#side').addEventListener('click', (ev) => {
  const b = ev.target.closest('.act[data-act]'); if (!b) return;
  if (b.dataset.up) { const u = S.ups.find((x) => x.id === b.dataset.up); if (u) upAct(u, b.dataset.act); return; }
  if (b.dataset.dn) { openPubForm(b.dataset.dn); return; }
  if (b.dataset.pb) { const p = S.pubs.find((x) => x.id === b.dataset.pb); if (p) pbAct(p, b.dataset.act); return; }
  if (b.dataset.ar) { const a = S.arch.find((x) => x.id === b.dataset.ar); if (a) archAct(a, b.dataset.act); return; }
});

/* ══ 판 — 한 번만 mount. 완료 = 선택 도엽 1장, 아카이브 = 표시된 레이어들 ══════ */
let mapMode = 'none';
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
let mapReq = 0;
/** 판 모드 — none(닫힘) / sel(완료 도엽 1장) / arch(아카이브 레이어). 모드를 옮기면 다른 모드의 레이어는 끈다. */
async function applyMapMode(mode, arg) {
  mapMode = mode;
  if (mode === 'none') return;
  const req = ++mapReq;
  const m = await ensureMap();
  const none = $('#plate-none');
  if (!m) { none.hidden = false; none.textContent = 'WebGL 없음 — 판 없음'; return; }
  if (req !== mapReq || mapMode !== mode) return;
  m.resize();
  if (mode === 'sel') {
    for (const id of S.layers) setHidden(m, id, true);
    if (!hasLayer(m, 'sel') || m.__selId !== arg.id) { removeLayer(m, 'sel'); addRaster(m, 'sel', arg.im, false); m.__selId = arg.id; }
    bk.set([{ id: 'sel', bounds: arg.im.bounds, title: arg.title, sub: arg.sub }]);
    // 성과가 있으면 도엽을 가운데 두고 3배 범위 — 주변의 청록 결과 폴리곤이 같이 보인다
    const b = arg.im.bounds, hasRes = arg.res && arg.res.length;
    frame(m, hasRes ? grow(b, 1) : b, { maxZoom: 16.6 });
    $('#plate-cap').textContent = `${arg.im.label} · GSD ${cm(arg.im)} · 측정${arg.res && arg.res.length ? ` · 성과 ${arg.res.length}` : ''}`;
    none.hidden = true;
    syncResults(m, arg.res || [], req);
    return;
  }
  // arch
  removeLayer(m, 'sel'); m.__selId = null;
  await syncLayers();
  const a = arg, g = geomOf(a);
  syncResults(m, resultsOf(a.id), req);
  if (S.focus !== a.id && g) { S.focus = a.id; frame(m, g.bounds, { maxZoom: g.kind === 'raster' ? 16.6 : 14.2 }); }
  const live = S.layers.map((id) => S.arch.find((x) => x.id === id)).filter((x) => x && !x.hidden && geomOf(x));
  $('#plate-cap').textContent = g ? g.cap : `${a.name} · 실측 범위 없음`;
  none.hidden = !!g || live.length > 0;
  if (!none.hidden) none.textContent = `${a.name} · 실측 범위 없음`;
  if (!g && live.length && !S.focus) frame(m, KOREA_SW, { maxZoom: 8 });
}
/** 범위를 사방으로 k 배 키운다(1 = 3× 범위). */
const grow = (b, k) => { const w = (b[2] - b[0]) * k, h = (b[3] - b[1]) * k; return [b[0] - w, b[1] - h, b[2] + w, b[3] + h]; };
/** 성과 레이어 — 선택 자산에 닿은 결과 GeoJSON 을 청록으로 올린다(`res-<id>`). 다른 결과는 끈다. */
const resUp = new Set();
async function syncResults(m, res, req) {
  for (const id of resUp) if (!res.some((r) => r.id === id)) setHidden(m, 'res-' + id, true);
  for (const r of res) {
    if (!hasLayer(m, 'res-' + r.id)) {
      const data = await loadGeo(r.geojson);
      if (req !== mapReq) return;
      if (data) { addVector(m, 'res-' + r.id, data, false); resUp.add(r.id); }
    } else setHidden(m, 'res-' + r.id, false);
  }
}
async function putLayer(a) {
  const g = geomOf(a); if (!g || !map) return null;
  if (!hasLayer(map, a.id)) {
    if (g.kind === 'raster') addRaster(map, a.id, g.im, a.hidden);
    else { const data = await loadGeo(g.file); if (data) addVector(map, a.id, data, a.hidden); }
  } else setHidden(map, a.id, a.hidden);
  return g;
}
/** 판의 레이어 = S.layers 순서. 아카이브에서 지워진 것은 내려온다. */
async function syncLayers() {
  if (!map) return;
  for (const id of S.layers) { const a = S.arch.find((x) => x.id === id); if (a) await putLayer(a); }
  bk.set(S.layers.map((id) => S.arch.find((x) => x.id === id)).filter(Boolean).map((a) => ({ a, g: geomOf(a) })).filter((x) => x.g)
    .map(({ a, g }) => ({ id: a.id, bounds: g.bounds, dim: a.hidden, title: a.name, sub: g.kind === 'raster' ? `GSD ${cm(g.im)}` : `${a.geo.count}셀` })));
}
/** 표시(on) / 숨김(off) 을 판에 반영한다. on 이면 그 자산이 선택되고 판이 그 범위로 간다. */
async function showOnPlate(a, on, fit = true) {
  if (!S.layers.includes(a.id)) S.layers.push(a.id);
  const g = geomOf(a);
  S.sel = a.id; S.mode = 'tile';
  if (on && fit) S.focus = null;   // 다시 프레임
  renderArchive(); renderSide();
  if (on && g) say(`${a.name} — 레이어 · 범위로 이동`);
  if (on && !g) say(`${a.name} — 실측 범위 없음`);
  if (!on) say(`${a.name} — 숨김 · 삭제 아님`);
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
  if (S.mode === 'pub') { S.mode = 'tile'; renderSide(); return; }
  if (S.sel) { S.sel = null; S.mode = 'none'; S.more = false; renderPanel(); renderSide(); }
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
function openQuota() {
  $('#mq-tag').textContent = `내 디스크 사용량 · ${gb(DISK.used)} / ${gb(DISK.total)} GB · 잔여 ${gb(DISK.free)} GB · ${SEED_TAG}`;
  $('#mq-err').hidden = true; openModal('#m-quota');
}
$('#m-quota').addEventListener('submit', (ev) => {
  ev.preventDefault();
  const e = $('#mq-err');
  const g = S.quotaGb || Number($('#mq-gb').value);
  const why = $('#mq-why').value.trim();
  if (!g || g <= 0) { e.hidden = false; e.textContent = '신청 용량 필수'; return; }
  if (!why) { e.hidden = false; e.textContent = '신청 사유 필수'; return; }
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

/* ══ 푸터 · 기동 ═══════════════════════════════════════════════════════ */
$('#foot-links').innerHTML = FOOT_LINKS.map((t) => `<span>${esc(t)}</span>`).join('');
$('#foot-addr').textContent = FOOT_ADDR;
$('#foot').insertAdjacentHTML('beforeend', `<span class="fam">Family Site<svg width="8" height="5" viewBox="0 0 9 6" fill="none" stroke="#686868" stroke-width="1.25" aria-hidden="true"><path d="M.5.5 4.5 5 8.5.5"/></svg></span>`);

setTab(tabFromUrl(), false);
document.documentElement.dataset.plate = 'closed';
document.documentElement.dataset.ds = 'ready';
