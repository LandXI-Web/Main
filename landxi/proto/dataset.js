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
  IMG, ATTRIB, THUMB, SILHOUETTE, XLSX_ROWS, ZIP_TREE, failActions, FAIL_FIX, CRS_NONE,
  CAPS, capsOf, panelOf, kindOf, ASSET_KINDS, assetCheck,
} from './ds-data.js';
import { silhouette, xlsxTable, zipTree, noneBox, loadGeo, bboxOf, fitFrames } from './ds-thumbs.js';
import { mountShell, say, openModal, confirmDialog, allowed, AS_OF, esc, ymd } from './shell.js';
import { downloadFile, downloadNote } from './download.js';
import { mountPlate, Brackets, addRaster, addVector, setHidden, removeLayer, hasLayer, frame, KOREA_SW } from './ds-plate.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const REDUCED = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const ACCENT = '#006DF7', WARN = '#D1352B';
const TW = 480, TH = 294;   // 실루엣 캔버스 — 타일은 열 폭에 맞춰 늘어난다

/* ══ 셸 — 레일 · 마스트헤드(공지 + 기준일) · 제목 행 · 푸터 · 토스트 · 모달 ══════════
   2026-09-24(E0-7 · 감사 R1 P0): 전에는 이 파일이 레일 열 칸을 직접 적었다. 역할을 몰라서
   관리자에게 대시보드·프로젝트가, 직원에게 카드 발행 관리·생산 관리가 섰고 누르면 튕겼다.
   이제 레일은 공용 셸이 roles.js 선언만 읽고 세운다. 로그아웃도 셸 logout() 하나다.
   기준일은 셸 AS_OF 하나(2026-06-08 · 전에 쓰던 db-data T1 과 같은 값). */
const shell = mountShell({
  active: 'media', title: '데이터 관리', subtitle: 'V-World 정사영상 · EPSG:4326',
  asOf: AS_OF, demo: true, fit: true, keepDocTitle: true,
});
if (!shell) throw new Error('관문 — 이동 중');   // 로그인 · 역할 관문이 다른 화면으로 보냈다
$('#page-head').append($('#disk'));                // 내 디스크 사용량 = 제목 행 오른쪽 얇은 한 줄

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
let map = null, bk = null, mounting = null;   // 판 — 한 번만 mount(아래 ensureMap)
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

/* ══ 디스크 한 줄 + 단계 카드 4 ═══════════════════════════════════════════
   발주 2026-09-20: "내 디스크 사용량 이 줄이 쓸데없이 크고 넓다."
   맞다 — 나머지 넷은 `어디로 들어갈지` 고르는 자리이고 디스크는 상태 경고다. 역할이 다르니 자리도 다르다.
   제목 줄 오른쪽 얇은 한 줄로 내리고, 경고 색은 법전대로 **숫자(글자)에만** 쓴다. */
const COUNT = { upload: () => S.ups.length, manage: () => S.done.length, publishing: () => S.pubs.length, archive: () => S.arch.length };
const gb = (v) => nf.format(Math.round(v));
const by = (rows, f) => rows.reduce((m, r) => { const k = f(r); m[k] = (m[k] || 0) + 1; return m; }, {});
const fmtOf = (r) => { const e = extOf(r.file).toUpperCase(); return e === 'TIFF' ? 'TIF' : e === 'XLS' ? 'XLSX' : e; };
$('#disk .dv').textContent = String(DISK.pct);
$('#disk .db i').style.width = `${DISK.pct}%`;
$('#disk-v').textContent = `${gb(DISK.used)} / ${gb(DISK.total)} GB · 잔여 ${gb(DISK.free)} GB`;
$('#quota-open').addEventListener('click', () => openQuota());
function kpiSub(id) {
  if (id === 'upload') { const c = by(S.ups, (u) => u.st); return `진행 중 ${c.run || 0} · 일시정지 ${c.pause || 0} · 중단 ${c.stop || 0} · 대기 ${c.wait || 0}`; }
  if (id === 'manage') { const c = by(S.done, fmtOf); return Object.entries(c).map(([k, n]) => `${k} ${n}`).join(' · '); }
  if (id === 'publishing') { const c = by(S.pubs, (p) => p.st); return `진행 ${c.run || 0} · <em>실패 ${c.fail || 0}</em>`; }
  const c = by(S.arch, (a) => (a.hidden ? 'h' : 'v')); return `표시 ${c.v || 0} · 숨김 ${c.h || 0}`;
}
function renderKpi() {
  $('#b-kpi').innerHTML = TABS.map((t) => `
    <button type="button" class="k${t.id === 'publishing' && S.pubs.some((p) => p.st === 'fail') ? ' actsub' : ''}" role="tab" id="kpi-${t.id}" data-tab="${t.id}"
      aria-selected="${t.id === S.tab}" aria-controls="panel-${t.id}">
      <span class="kl">${esc(t.name)}</span><span class="kv"><b class="big n">${COUNT[t.id]()}</b><span>건</span></span>
      <span class="ks n">${kpiSub(t.id)}</span></button>`).join('');
  $$('#b-kpi .actsub .ks em').forEach((e) => e.classList.add('warn'));
  if (S.tab) $('#tool-h').textContent = TABS.find((t) => t.id === S.tab).name;
}
$('#b-kpi').addEventListener('click', (ev) => {
  const b = ev.target.closest('.k[data-tab]'); if (b) setTab(b.dataset.tab);
});

/* ══ 개요 — 쿼리가 없으면 여기부터. 네 상태를 나란히 보고 어디로 들어갈지 고른다 ══
   발주 2026-09-20: "처음에는 업로드 진행 · 완료 · 발행중 · 아카이브 이런 게 한눈에 보여야 한다.
   이후 탭으로 넘어가면 자세히 보이던가."
   구역 하나 = 그 단계로 들어가는 문. 건수 · 상태 한 줄 · 최근 것 미리보기 3 · 그 단계의 지표 한 줄.
   미리보기는 타일과 **같은 장치**(assets.js 선언)를 쓴다 — 종류가 같으면 어디서나 같은 모양이다. */
const OV_NOTE = {
  upload: '올리는 중 · 멈춘 것 · 기다리는 것',
  manage: '올라온 것 · 지도 레이어로 낼 것',
  publishing: '레이어로 굽는 중 · 막힌 것',
  archive: '보관 중 · 기관에 공유하는 것',
};
const ovRows = (id) => ({ upload: S.ups, manage: S.done, publishing: S.pubs, archive: S.arch }[id]);
/** 최근 셋 — 목록 타일과 **같은 창구**(previewFor)를 지난다. */
function ovRecent(id) {
  /* 대표 **한 장**. 석 장을 세웠더니 그림이 너무 많고 이름이 `NW_ortho_2…` 로 잘려
     아무 말도 못 했다. 개요는 그 단계가 어떤 그림인지만 보이면 된다(2026-09-21). */
  const rows = ovRows(id).slice(0, 1);
  if (!rows.length) return `<span class="ovz n">0건</span>`;
  return `<span class="ovt">${rows.map((r) => {
    const b = previewFor(r, { rv: 'ov-' + r.id });
    const name = r.name || r.file;
    return `<span class="ovf"><span class="th ${b.cls}">${b.html}</span><span class="ovfc n" title="${esc(name)}">${esc(name)}</span></span>`;
  }).join('')}</span>`;
}
/* ── 파일 목록은 **개요에 두지 않는다** (2026-09-21) ──────────────────────
   발주자: "데이터 관리 메인은 쉽고 간단한 구조여야 하는데 지금은 글자가 너무 많고
            복잡하게 되어 있어서 안누르고 싶게 생겼다."

   개요가 `NW_ortho_정사영상_202604_section_C_v3.tif` 같은 기계 이름을 네 칸에 여섯 줄씩
   이고 있었다. 훑어보고 **어디로 들어갈지 고르는 화면**인데 읽어야 할 글이 깔려 있었다.
   발주 2026-09-20 의 뜻과도 어긋났다 — "처음에는 한눈에, 이후 탭으로 넘어가면 자세히".

   지우는 게 아니라 **제자리로 보낸다.** 파일 목록은 각 탭이 이미 전부 들고 있다
   (#up-tiles · #dn-list · #pb-list · #ar-list). 개요에는 그 단계가 어떤 그림인지만 남긴다.
   비는 자리는 빈칸으로 두지 않고 **미리보기를 키워** 채운다(.ovt 가 남은 높이를 가져간다). */

function ovMetric(id) {
  if (id === 'upload') {
    const run = S.ups.filter((u) => u.st === 'run');
    const pct = run.length ? Math.round(run.reduce((a, u) => a + u.pct, 0) / run.length) : 0;
    return `<span class="ovb" style="--pct:${pct}%"><i></i></span><span class="ovv n">진행 중 ${run.length}건 · 평균 <b>${pct}%</b></span>`;
  }
  if (id === 'manage') return `<span class="ovv n">총 용량 <b>${sumBytes(S.done)}</b> · 위치 있음 ${S.done.filter(imFor).length}건</span>`;
  if (id === 'publishing') { const c = by(S.pubs, (p) => p.st); return `<span class="ovv n">진행 ${c.run || 0}건 · <b class="warn">실패 ${c.fail || 0}건</b></span>`; }
  const c = by(S.arch, (a) => (a.hidden ? 'h' : 'v'));
  return `<span class="ovv n">표시 ${c.v || 0}건 · 숨김 ${c.h || 0}건 · 총 용량 <b>${sumBytes(S.arch)}</b></span>`;
}
function renderOverview() {
  $('#ov').innerHTML = TABS.map((t) => `
    <a class="ovc" href="?tab=${t.id}" data-go="${t.id}">
      <span class="ovh"><span class="d ovt2">${esc(t.name)}</span><span class="ovn n"><b class="big">${COUNT[t.id]()}</b>건</span></span>
      <span class="ovs n">${kpiSub(t.id)}</span>
      ${ovRecent(t.id)}
      <span class="ovm">${ovMetric(t.id)}</span>
      <span class="ovd n">${esc(OV_NOTE[t.id])}</span>
      <span class="ul">자세히 ›</span>
    </a>`).join('');
  $$('#ov .ovs em').forEach((e) => e.classList.add('warn'));
  fitFrames($('#ov')); reveal($('#ov')); refit($('#ov'));
}
$('#ov').addEventListener('click', (ev) => {
  const a = ev.target.closest('.ovc[data-go]'); if (!a) return;
  ev.preventDefault(); setTab(a.dataset.go);
});
$('#to-ov').addEventListener('click', () => setTab(null));

/* 돌아갈 곳 — 다른 화면에서 `업로드는 여기서 한다` 며 보냈으면, 올리고 나서 **돌아갈 길**이 있어야 한다.
   분석 서비스가 `?next=` 를 들려 보낸다(2026-09-21). 같은 폴더의 화면일 때만 따른다 —
   바깥 주소로는 보내지 않는다. */
const backTo = (() => {
  const raw = new URLSearchParams(location.search).get('next') || '';
  return /^[\w.-]+\.html(\?[^#]*)?$/.test(raw) ? raw : '';
})();
if (backTo) {
  const NAME = { 'analysis-ai.html': '분석 서비스', 'ai-project.html': '프로젝트', 'ximap.html': '지도 서비스' };
  const label = NAME[backTo.split('?')[0]] || '이전 화면';
  const b = document.createElement('button');
  b.type = 'button'; b.id = 'to-back'; b.className = 'n';
  b.textContent = `‹ ${label}로 돌아가기`;
  b.addEventListener('click', () => { location.href = backTo; });
  $('#to-ov').after(b);
}

/** `?tab=` 이 없으면 개요다. 값이 틀리면 개요로 — 쿼리를 화면 글자로 적어 보여 주지는 않는다. */
const tabFromUrl = () => { const t = new URLSearchParams(location.search).get('tab'); return TAB_IDS.includes(t) ? t : null; };
function setTab(id, push = true) {
  if (!TAB_IDS.includes(id)) id = null;
  S.tab = id;
  // 원본 동작 — 탭 전환 시 필터·검색·선택이 초기화된다.
  S.filter = '전체'; S.q = ''; $('#q').value = '';
  S.sel = null; S.mode = 'none'; S.more = false; S.page = 1;
  document.body.dataset.tab = id || '';
  document.body.dataset.view = id ? 'stage' : 'overview';
  TABS.forEach((t) => { $(`#panel-${t.id}`).hidden = t.id !== id; });
  $('#ov').hidden = !!id;
  for (const sel of ['#b-kpi', '#kpi-hr', '#tool', '#stage']) $(sel).hidden = !id;
  if (push) {
    const u = new URL(location.href);
    if (id) u.searchParams.set('tab', id); else u.searchParams.delete('tab');
    history.pushState({ tab: id }, '', u);
  }
  renderKpi();
  if (!id) { renderOverview(); return; }
  renderFilters(); renderPanel(); renderSide();
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

/** 타일 높이는 격자가 정한 뒤에야 확정된다 — 다음 프레임에 표·트리를 한 번 더 맞춘다. */
function refit(root) { requestAnimationFrame(() => { fitFrames(root); drawSilhouettes(root); }); }
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
  return `<p class="cap n"><span class="nm" title="${esc(name)}">${esc(name)}</span><span class="mt">${a ? `<span class="dt">· ${esc(a)} </span>` : ''}<span class="sep">· </span>${esc(b)}</span></p>`; };
const img = (src, id, cls = '', eager = false) => `<img src="${esc(src)}" alt="" data-rv="${id}" class="${cls}"${eager ? '' : ' loading="lazy"'}>`;
const figImg = (src, id) => img(src, 'fig-' + id, '', true);
const date = (at) => String(at).slice(0, 10);
const cm = (im) => `${(im.gsd * 100).toFixed(2)} cm`;
const bounds4 = (b) => b.map((v) => v.toFixed(4)).join(', ');
/** 파일 종류별 그림 — 그림이 없으면 흰 액자, 좌표도 없으면 점선 액자 + 이유.
    `왜 못 그리는지` 는 밖(assets.js 선언)에서 받는다 — 같은 자산이면 타일·개요·우 판 어디서나 같은 말이 나온다. */
function body(fmt, id, opts = {}) {
  const t = THUMB[id];
  if (t) return { cls: 'th--dark', html: img(t, id) };
  if (fmt === 'XLSX') return { cls: 'th--box', html: xlsxTable(XLSX_ROWS) };
  if (fmt === 'ZIP') return { cls: 'th--box', html: zipTree(ZIP_TREE, opts.dim) };
  if (fmt === 'SHP' && SILHOUETTE[id]) return { cls: 'th--box', html: `<canvas width="${TW}" height="${TH}" data-sil="${id}"></canvas>`, sil: id };
  if (opts.why) { const [w1, w2] = String(opts.why).split(' — '); return { cls: 'th--dash th--none', html: noneBox(`미리보기 없음 · ${esc(opts.head || fmt)}`, w1, w2 || '') }; }
  if (fmt === 'SHP') return { cls: 'th--dash th--none', html: noneBox('미리보기 없음 · SHP', CRS_NONE.why, CRS_NONE.tile) };
  return { cls: 'th--dash th--none', html: noneBox('미리보기 없음', `${fmt} · 파일 확인 전`) };
}
/** 한 줄로 쓰는 미리보기 — 목록 타일도 개요도 이 한 곳을 지난다. 자리마다 다르게 그리지 않는다. */
function previewFor(row, opts = {}) {
  const t = THUMB[row.id] || row.thumb || (row.from && THUMB[row.from]);
  if (t) return { cls: 'th--dark', html: img(t, opts.rv || row.id) };
  const pan = panelOf(descOf(row));
  const blocked = (pan.blocked || []).find((b) => b.cap === 'map');
  return body(row.fmt || extOf(row.file).toUpperCase(), row.id, { ...opts, head: pan.head, why: blocked ? blocked.why : '' });
}
/** 리빌 = 진행률. 그림 위의 그림, 경계 1px. 업로드·발행 공용. */
const revealPair = (t, id, pct) => `${img(t, id, 'rv-base')}<span class="rv-top" style="--rest:${100 - pct}%">${img(t, id + 'b')}</span><span class="rv-line" style="--pct:${pct}%"></span>`;
/** 캔버스 실루엣을 그린다 — 실좌표 GeoJSON. 그린 뒤 폴리곤 수를 우하단에 적는다.
    여백은 **상자 크기에 비례**한다. 480×294 고정 캔버스 시절의 고정 px(위 56 · 아래 44)를 그대로 쓰면
    113px 짜리 타일에서 그릴 자리가 13px 밖에 남지 않아 도형이 점으로 뭉갰다(2026-09-20 고침). */
function drawSilhouettes(root) {
  $$('canvas[data-sil]', root).forEach(async (c) => {
    const spec = SILHOUETTE[c.dataset.sil];
    const r = c.getBoundingClientRect();
    const opts = { width: 1.2, pad: Math.min(14, r.width * 0.06),
      padTop: Math.min(26, r.height * 0.2), padBottom: Math.min(22, r.height * 0.18) };
    const n = await silhouette(c, spec, opts);
    const tag = c.parentElement.querySelector('.tagb');
    if (tag) tag.textContent = `${spec.crs} · ${nf.format(n)} polygon`;
  });
}
const selAttr = (id) => (S.sel === id ? ' aria-current="true"' : '');
const selBk = (id) => (S.sel === id ? corners(ACCENT) : '');
/** 타일의 그림 = 버튼(감사 S1 · F6: 전에는 div + click 이라 키보드로 0 / 6). Tab 으로 닿고 Enter · Space 로 연다.
    누른 상태(aria-pressed) = 우 패널이 이 건을 펼치고 있다. 이름은 aria-label 로 — 그림 위 글자는 상태어뿐이다. */
const thBtn = (id, cls, attrs, label, inner) => `<button type="button" class="th ${cls}"${attrs} data-open="${id}" aria-pressed="${S.sel === id}" aria-label="${esc(label)}">${inner}</button>`;

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
    ${thBtn(u.id, cls, live ? ' data-live' : '', `${u.file} · ${UP_ST[u.st]} ${u.pct}%`, `${inner}${selBk(u.id)}${word('업로드')}${stw(st)}`)}
    ${cap(u.file, meta)}</div>`;
}
function renderUpload() {
  // 발주(2026-08-27): "대기중 n건 더 · 전체 보기 는 필요 없다. 대기중 다 표출" — 접지 않는다. 그리드가 스크롤한다.
  const rows = pageOf(S.ups.filter((u) => passFmt(u) && hit(u)), 1);   // 드롭존이 매 쪽 첫 타일
  $('#up-tiles').innerHTML = rows.map(upTile).join('');
  fitFrames($('#up-tiles')); reveal($('#up-tiles')); refit($('#up-tiles'));
}
function upAct(u, k) {
  if (k === 'pause') { u.st = 'pause'; say(`일시정지 — ${u.file} · ${u.pct}%`); }
  if (k === 'resume') { u.st = 'run'; say(`재개 — ${u.file} · ${u.pct}%`); }
  if (k === 'retry') { u.st = 'run'; say(`이어 올리기 — ${u.file} · ${u.pct}%`); }
  if (k === 'cancel') {
    destroy({ title: '업로드 취소', what: u.file, meta: `${u.size} · ${UP_ST[u.st]} ${u.pct}%`, ok: '업로드 취소', done: '업로드를 취소했습니다', list: () => S.ups, set: (v) => { S.ups = v; }, row: u });
    return;
  }
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
    // 크기는 고른 파일의 실측 바이트다(감사 F13: 2 KB 가 `0.0 MB` 로, 잔여가 `0 B` 로 찍혔다).
    S.ups.push({ id: 'u' + (Date.now() + Math.random()).toString(36).slice(-6), st: 'wait', fmt: f.name.split('.').pop().toUpperCase(), file: f.name, pct: 0,
      fileBytes: f.size, size: fmtBytes(f.size) });
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
  // 좌표가 없어 지도에 못 얹는 건 타일에서도 같은 말을 한다 — 같은 종류가 자리마다 다르게 보이면 안 된다.
  const pan = panelOf(descOf(d));
  const gap = pan.body === 'map-gap' ? stw('좌표 없음', true) : '';
  return `<div class="tile" role="listitem" data-id="${d.id}"${selAttr(d.id)}>
    ${thBtn(d.id, b.cls, '', `${d.file} · 업로드 완료`, `${b.html}${selBk(d.id)}${word(`완료 · 아카이빙 ${d.arch}회`)}${gap}${b.sil ? `<span class="tagb n"></span>` : ''}`)}
    ${cap(d.file, `${date(d.at)} · ${d.size}`)}</div>`;
}
function renderDone() {
  const all = S.done.filter((d) => passFmt(d) && hit(d));
  const rows = pageOf(all);
  $('#dn-empty').hidden = all.length > 0;
  $('#dn-list').innerHTML = rows.map(dnTile).join('');
  fitFrames($('#dn-list')); reveal($('#dn-list')); refit($('#dn-list'));
}
/** 완료본 ↔ 도엽 — 파일명이 imagery.js 도엽과 같은 자산일 때만 실측 좌표를 적는다. */
const imFor = (row) => (row.id === 'd4' ? IMG.find((i) => i.id === 'namwon_2504') : row.id === 'd5' ? IMG.find((i) => i.id === 'namwon_2506') : null);

/* ══ 자산 선언을 읽는 창구 ══════════════════════════════════════════════
   발주 2026-09-20: "통일성 있게 체계적으로 해야지. 제대로 설계가 안 되어 있는 것 같다."
   이 화면이 파일 이름을 아는 곳은 **descOf 한 곳**뿐이다. 그 아래로는 assets.js 의 선언
   (kind · caps · panel)만 보고 움직인다 — 종류가 같으면 어디서나 같은 자리에 같은 모양이다.
   bounds 는 imagery.js 실측 도엽 또는 결과 GeoJSON 범위, crs 는 자산이 선언한 좌표계다. 지어내지 않는다. */
function descOf(row) {
  if (!row) return { name: '' };
  if (S.tab === 'archive') { const g = geomOf(row); return { name: row.file, bounds: g ? g.bounds : undefined, crs: row.crs }; }
  const im = imFor(row);
  return { name: row.file, bounds: im ? im.bounds : undefined };
}
/** 할 수 있는 일 → 이 화면의 버튼. assets.js CAPS 의 말을 그대로 쓴다.
    `tile`(타일 생성)은 발행 3단계(지도 데이터 변환)에 들어 있어 따로 내지 않는다 — 버튼 둘이 한 일을 하면 헷갈린다. */
const CAP_ACT = {
  map: { act: 'pub', name: '지도 레이어 발행 ›', cls: 'pri' },
  analyze: { act: 'analyze', name: '분석에 쓰기 ›' },
  label: { act: 'label', name: '라벨링 ›' },
  attrs: { act: 'detail', name: '속성 보기' },
  join: { act: 'join', name: '필지에 붙이기' },
  unpack: { act: 'unpack', name: '풀기' },
  download: { act: 'download', name: '내려받기' },
};
/** 버튼마다 **하는 일이 있거나, 못 하는 이유가 있다**(감사 F3 · 말만 하는 버튼 0).
    못 하는 것은 누를 수 없게 세우고(disabled) 아래 한 줄에 이유를 적는다 — 흐린 버튼만 두지 않는다. */
const whyLine = (t) => `<span class="why n" id="acts-why">${esc(t)}</span>`;
function capActs(row, ds) {
  let why = '';
  const btns = capsOf(descOf(row)).caps.filter((c) => CAP_ACT[c]).map((c) => {
    const a = CAP_ACT[c]; let name = a.name, attrs = ds;
    if (a.act === 'download' && !allowed('export')) return '';
    if (a.act === 'join') {
      if (!joinSrc(row)) { attrs += ' disabled aria-describedby="acts-why"'; why = '준비 중 · 이 결과에는 PNU 속성이 없습니다'; }
      else if (row.joined) name = '결합 해제';
    }
    if (a.act === 'unpack' && row.unpacked) name = '다시 묶기';
    return actBtn(a.act, name, attrs, `${a.cls || ''}${a.act === 'detail' && S.more ? ' on' : ''}${(a.act === 'join' && row.joined) || (a.act === 'unpack' && row.unpacked) ? ' on' : ''}`.trim());
  });
  return btns.join('') + (why ? whyLine(why) : '');
}
/** 액자 아래 한 줄 — 이 자산이 무슨 종류이고 **지금 왜 되고 안 되는지**. 빈 액자를 덩그러니 두지 않는다. */
const gapLine = (pan) => `<p class="gap n${pan.body === 'map-gap' ? ' warn' : ''}"><b>${esc(pan.head)}</b> · ${esc(pan.note)}</p>`;

/* 발행 폼 — 발행 유형 / 기준 일자 / 데이터명 / 출처 / 설명 + 공유 권한 표(기관명 / 권한명 3단). 우 패널의 `발행` 상태. */
/* 원본 정사영상은 LX 가 보관한다(two-tier · card-architecture R7) — LX 밖 기관에는 타일 열람(뷰어)까지.
   lock = 그 줄의 `편집` 을 누를 수 없게 세운다(흐린 채 이유를 단다). 자산 등급 표 전체는 E1-7. */
const ORTHO_LOCK = '원본 정사영상은 LX 보관 — 뷰어는 타일 열람';
const LX_ORG = ORGS[0];
const segRow = (org, cur, i, attr, lock = false) => `<div class="pr"><span class="o">${esc(org)}</span><span class="seg n" role="group" aria-label="${esc(org)} 권한명">${
  PERMS.map((p) => { const off = lock && p === '편집';
    return `<button type="button" ${attr}="${i}" data-perm="${esc(p)}" aria-pressed="${p === cur}"${off ? ` disabled title="${esc(ORTHO_LOCK)}" aria-describedby="${attr.slice(5)}-lock"` : ''}>${esc(p)}</button>`; }).join('')}</span></div>`;
/** 원본 정사영상인가 — 완료본은 형식(TIF · ECW), 아카이브는 유형(정사영상). */
const isOrtho = (row) => row.kind === '정사영상' || ['TIF', 'ECW'].includes(String(row.fmt || '').toUpperCase());
const pfLocked = () => { const d = S.done.find((x) => x.id === S.sel); return !!(d && isOrtho(d)); };
const pfRows = () => pfPerm.map((r, i) => segRow(r.org, r.perm, i, 'data-pf', pfLocked() && r.org !== LX_ORG)).join('');
let pfPerm = SHARE_DEFAULT.map((s) => ({ ...s }));
const pubFormHtml = (d, pre) => `
  <form id="pubform" novalidate>
    <label class="fr"><span class="k">발행 유형 <b>*</b></span><select id="pf-type">${PUB_TYPES.map((t) => `<option${t === (pre.type || '') ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select></label>
    <label class="fr"><span class="k">기준 일자 <b>*</b></span><input id="pf-basis" type="date" class="n" value="${esc(pre.basis || date(d.at).replace(/\./g, '-'))}"></label>
    <label class="fr"><span class="k">데이터명 <b>*</b></span><input id="pf-name" type="text" placeholder="데이터명" value="${esc(pre.name || '')}"></label>
    <label class="fr"><span class="k">출처</span><input id="pf-src" type="text" placeholder="출처" value="${esc(pre.src || '')}"></label>
    <label class="fr"><span class="k">설명</span><input id="pf-desc" type="text" placeholder="설명" value="${esc(pre.desc || '')}"></label>
    <div class="ph"><span class="lb">공유 권한</span><span class="lb">기관명 / 권한명</span></div>
    <div id="pf-perm">${pfRows()}</div>
    ${pfLocked() ? `<p id="pf-lock" class="lock n">${esc(ORTHO_LOCK)}</p>` : ''}
    <p id="pf-err" class="err" role="alert" hidden></p>
    <div class="acts">
      <button type="button" class="br" data-pf-close>취소</button>
      <button type="submit" class="fill d">발행</button>
      <span class="n hint">기준 일자 · 데이터명 필수</span>
    </div>
  </form>`;
function openPubForm(id) {
  const d = S.done.find((x) => x.id === id); if (!d) return;
  if (!capsOf(descOf(d)).caps.includes('map')) { say(`지도 레이어 발행 대상 아님 — ${d.file}`); return; }   // 문 닫힌 길로 들어가지 않는다
  S.sel = id; S.mode = 'pub';
  pfPerm = SHARE_DEFAULT.map((s) => ({ ...s }));
  renderDone(); renderSide();
  $('#pf-name').focus();
}
document.addEventListener('click', (ev) => {
  const b = ev.target.closest('[data-pf]'); if (b) { if (b.disabled) return; pfPerm[+b.dataset.pf].perm = b.dataset.perm; $('#pf-perm').innerHTML = pfRows(); $(`#pf-perm [data-pf="${b.dataset.pf}"][data-perm="${b.dataset.perm}"]`)?.focus(); return; }
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
    ${thBtn(p.id, cls, fail ? '' : ' data-live', `${p.file} · ${fail ? `발행 실패 ${p.step}/4` : `발행 ${p.step}/4`}`, `${inner}${ticks(p, !t)}${fail ? corners(WARN) : selBk(p.id)}${word('발행중')}${stw(st, fail)}`)}
    ${cap(p.file, `${date(p.at)} · ${p.size}`)}</div>`;
}
function renderPublishing() {
  const all = S.pubs.filter((p) => passFmt(p) && hit(p));
  const rows = pageOf(all);
  $('#pb-empty').hidden = all.length > 0;
  $('#pb-list').innerHTML = rows.map(pbTile).join('');
  fitFrames($('#pb-list')); reveal($('#pb-list')); refit($('#pb-list'));
}
let crsId = null;
function pbAct(p, k) {
  if (k === 'cancel') {
    destroy({ title: '발행 취소', what: p.file, meta: `${p.size} · ${p.st === 'fail' ? '실패' : '진행'} ${p.step}/4 ${PUB_STEPS[p.step - 1]}`, ok: '발행 취소', done: '발행을 취소했습니다', list: () => S.pubs, set: (v) => { S.pubs = v; }, row: p });
    return;
  }
  if (k === 'detail') S.more = !S.more;
  if (k === 'crs') { crsId = p.id; $('#mc-sub').textContent = `${p.file} · ${p.why}`; openForm('#m-crs', '좌표계 지정'); return; }
  if (k === 'unpack') { reupload(p); return; }
  if (k === 'join') { joinGuide(p); return; }
  renderPublishing(); renderSide();
}
$('#m-crs').addEventListener('submit', (ev) => {
  ev.preventDefault();
  const p = S.pubs.find((x) => x.id === crsId);
  if (p) { p.st = 'run'; p.step = 1; p.crs = $('#mc-epsg').value; say(`좌표계 ${p.crs} — ${p.file} · 1/4 파일 확인 · ${SEED_TAG}`); }
  closeForm(); renderKpi(); renderPublishing(); renderSide();
});

/* ── 아카이브 — 유형·표시/숨김은 그림 위 단어로. 5액션은 우 패널. 숨김 = 감쇠, 삭제 아님. ── */
/** 자산의 실측 기하 — imagery.js 도엽 타일이거나 results/* GeoJSON. 없으면 null(판이 자백한다). */
function geomOf(a) {
  const im = a.imagery && IMG.find((i) => i.id === a.imagery);
  if (im) { const nt = sheetNote(a, im); return { kind: 'raster', bounds: im.bounds, im, cap: `${im.label} · GSD ${cm(im)} · 측정${nt ? ` · ${nt}` : ''}` }; }
  if (a.geo) return { kind: 'vector', bounds: a.geo.bounds, file: a.geo.file, cap: `${a.name} · ${a.geo.unit} ${a.geo.count}셀 · EPSG:4326 · 측정` };
  return null;
}
function arTile(a) {
  const g = geomOf(a);
  const b = previewFor(a);
  const cls = b.cls;
  const inner = b.html + (b.sil ? `<span class="tagb n"></span>` : '');
  const meta = g && g.kind === 'raster' ? `${a.basis} · ${cm(g.im)}` : `${a.basis} · ${a.size}`;
  return `<div class="tile" role="listitem" data-id="${a.id}" data-hidden="${a.hidden ? 1 : 0}"${a.hidden ? ' data-dim' : ''}${selAttr(a.id)}>
    ${thBtn(a.id, cls, '', `${a.name} · 아카이브 ${a.kind} · ${a.hidden ? '숨김' : '표시'}`, `${inner}${selBk(a.id)}${word(`아카이브 · ${a.kind}`)}${stw(a.hidden ? '숨김 · 삭제 아님' : '표시')}`)}
    ${cap(a.name, meta)}</div>`;
}
function renderArchive() {
  const all = S.arch.filter((a) => passKind(a) && hit(a));
  const rows = pageOf(all);
  $('#ar-empty').hidden = all.length > 0;
  $('#ar-list').innerHTML = rows.map(arTile).join('');
  fitFrames($('#ar-list')); reveal($('#ar-list')); refit($('#ar-list'));
}
function archAct(a, k) {
  if (k === 'vis') { a.hidden = !a.hidden; renderKpi(); renderArchive(); showOnPlate(a, !a.hidden); return; }
  if (k === 'share') { openShare(a); return; }
  if (k === 'detail') { S.more = !S.more; renderSide(); return; }
  if (k === 'del') {
    const li = S.layers.indexOf(a.id);
    destroy({ title: '아카이브 삭제', what: a.name, meta: `${a.file} · ${a.size} · ${a.kind}`, ok: '삭제', done: '삭제했습니다', list: () => S.arch, set: (v) => { S.arch = v; }, row: a,
      after: () => { S.layers = S.layers.filter((x) => x !== a.id); if (map) removeLayer(map, a.id); if (S.focus === a.id) S.focus = null; },
      undo: () => { if (li >= 0 && !S.layers.includes(a.id)) S.layers.splice(Math.min(li, S.layers.length), 0, a.id); } });
  }
}
/* 공간 편집 — 감사 S16 · F3: 전에는 판을 그 범위로 옮기고 `공간 편집` 이라고 말만 했다.
   편집 도구가 없으므로 버튼을 세우되 누를 수 없게 두고 이유를 적는다(아래 GEO_WHY). */
const GEO_WHY = '준비 중 · 지도 편집은 분석 서비스 완료 탭에서';

/* ══ 타일 선택 — 그리드 클릭 하나로 4단계 공용 ═══════════════════════════ */
$('#grid').addEventListener('click', (ev) => {
  const th = ev.target.closest('[data-open]'); if (!th) return;
  const id = th.dataset.open;
  const kb = document.activeElement === th;               // 키보드(또는 포커스 뒤 클릭)로 연 것 — 다시 그린 뒤에도 그 타일에 포커스를 둔다
  if (S.sel === id) backToBoard(); else selectTile(id);   // 선택 타일을 다시 누르면 현황판으로
  if (kb) $(`#grid .th[data-open="${id}"]`)?.focus();
});

/* ══ 우 패널 — 선택 타일을 펼친다: 판(지도/그림) + 기본 정보 + 액션 ═══════ */
const rowOf = (id) => ({ upload: S.ups, manage: S.done, publishing: S.pubs, archive: S.arch }[S.tab].find((x) => x.id === id));
const dl = (rows, cls = '') => `<dl class="info${cls ? ' ' + cls : ''}">${rows.map(([k, v, c = '']) => `<dt class="${c.includes('wide') ? 'wide' : ''}">${esc(k)}</dt><dd class="${c}${/^\d/.test(String(v)) ? ' n' : ''}">${v}</dd>`).join('')}</dl>`;
/** 우 패널 두 단 — a = 이 건의 신원(기본 정보) · b = 이 건에 붙은 목록(성과 · 데이터 테이블 · 사용 현황 · 발행 이력 · 메모).
    패널이 좁으면 CSS 가 단을 합쳐 지금처럼 한 줄기로 흐른다. 내용을 덜어내는 게 아니라 자리를 바꿔 넣는 것이다. */
const cols2 = (a, b = '') => `<div class="sc-a">${a}</div><div class="sc-b${b ? '' : ' sc-b--flat'}">${b}</div>`;
const actBtn = (k, name, ds, cls = '') => `<button type="button" class="act${cls ? ' ' + cls : ''}" data-act="${k}" ${ds}>${esc(name)}</button>`;
/** 그림 액자 — 지도가 아닐 때. 목록 타일과 **같은 창구**(previewFor)를 지난다:
    아카이브 행은 `fmt` 가 없어 예전에는 `undefined · 파일 확인 전` 이 떴다(2026-09-20 고침). */
function figFor(row, opts = {}) {
  const t = THUMB[row.id] || row.thumb || (row.from && THUMB[row.from]);
  if (t && opts.pct != null) return `<div class="fig fig--ink"${opts.live ? ' data-live' : ''}>${revealPair(t, 'fig-' + row.id, opts.pct)}${opts.extra || ''}</div>`;
  if (t) return `<div class="fig fig--ink">${figImg(t, row.id)}${opts.extra || ''}</div>`;
  if (SILHOUETTE[row.id]) return `<div class="fig"><canvas width="832" height="468" data-sil="${row.id}"></canvas><span class="fm n dk">${esc(SILHOUETTE[row.id].crs)}</span>${opts.extra || ''}</div>`;
  const b = previewFor(row);
  return `<div class="fig${b.cls.includes('th--none') ? ' fig--none' : ''}">${b.html}${opts.extra || ''}</div>`;
}
function showFig(html) { $('#plate-wrap').hidden = true; const f = $('#fig-wrap'); f.hidden = false; f.innerHTML = html; fitFrames(f); reveal(f); refit(f); }
function showPlate() { $('#fig-wrap').hidden = true; $('#plate-wrap').hidden = false; }
function hideFrames() { $('#plate-wrap').hidden = true; const f = $('#fig-wrap'); f.hidden = true; f.innerHTML = ''; }

/* ── 현황판(선택 없음) — 4단계 공용 문법(발주 3차 "통일성"): 한 줄 = 한 건, 헤어라인, 줄 = 그 타일 선택. 아래 단계 요약 kv.
   업로드: 이름 · 상태어 · 막대 % · 크기 · 잔여 / 완료: 이름 · 형식 · 크기 · 업로드 일시 · 아카이빙 · 위치 /
   발행중: 이름 · 4눈금 · 상태어(실패 warn + 짧은 사유) · 진행률 · 크기 / 아카이브: 이름 · 유형 · 표시/숨김 · 발행 v · 크기. ── */
const BOARD_TITLE = { upload: '진행 현황', manage: '완료 현황', publishing: '발행 현황', archive: '보관 현황' };
const remain = (u) => fmtBytes(bytesOf(u.size) * (1 - u.pct / 100));
const sumBytes = (rows) => fmtBytes(rows.reduce((s, r) => s + bytesOf(r.size), 0));
const bh = (cells) => `<div class="pbh">${cells.map((c) => `<span class="lb${/^(크기|잔여|진행률|발행)$/.test(c) ? ' rt' : ''}">${esc(c)}</span>`).join('')}</div>`;
const bRow = (r, st, cells) => `<div class="pb" data-id="${r.id}"${st ? ` data-st="${st}"` : ''} role="button" tabindex="0"${selAttr(r.id)}>${cells}</div>`;
const bName = (name) => `<span class="nm" title="${esc(name)}">${esc(name)}</span>`;
function boardHtml() {
  if (S.tab === 'upload') {
    const c = by(S.ups, (u) => u.st);
    return bh([`파일 ${S.ups.length} · 진행 중 ${c.run || 0}`, '상태', '진행률', '크기', '잔여'])
      + S.ups.map((u) => bRow(u, u.st, `${bName(u.file)}<span class="stw">${esc(UP_ST[u.st])}</span>
        <span class="bar" style="--pct:${u.pct}%"><i></i><b class="n" data-ppct>${u.pct}%</b></span>
        <span class="rt n">${esc(u.size)}</span><span class="rt n" data-prem>${remain(u)}</span>`)).join('');
  }
  if (S.tab === 'manage') {
    return bh([`파일 ${S.done.length} · 위치 ${S.done.filter(imFor).length}`, '형식', '크기', '업로드', '아카이빙', '위치'])
      + S.done.map((d) => bRow(d, '', `${bName(d.file)}<span class="stw">${esc(d.fmt)}</span><span class="rt n">${esc(d.size)}</span>
        <span class="n dim2" title="${esc(d.at)}">${date(d.at)}</span><span class="n">${d.arch}회</span><span class="n loc${imFor(d) ? ' on' : ''}">${imFor(d) ? '○' : '—'}</span>`)).join('');
  }
  if (S.tab === 'publishing') {
    const c = by(S.pubs, (p) => p.st);
    return bh([`파일 ${S.pubs.length} · 진행 ${c.run || 0} · 실패 ${c.fail || 0}`, '단계', '상태', '진행률', '크기'])
      + S.pubs.map((p) => { const fail = p.st === 'fail'; return bRow(p, p.st, `${bName(p.file)}${ticks(p, true)}
        <span class="stw${fail ? ' warn' : ''}">${fail ? `실패 · ${esc(p.short || '')}` : `${p.step}/4 ${esc(PUB_STEPS[p.step - 1])}`}</span>
        <span class="rt n">${pubPct(p)}%</span><span class="rt n">${esc(p.size)}</span>`); }).join('');
  }
  const c = by(S.arch, (a) => (a.hidden ? 'h' : 'v'));
  return bh([`자산 ${S.arch.length} · 표시 ${c.v || 0} · 숨김 ${c.h || 0}`, '유형', '표시', '발행', '크기'])
    + S.arch.map((a) => { const log = PUBLISH_LOG[a.id] || []; return bRow(a, a.hidden ? 'hide' : 'show', `${bName(a.name)}<span class="stw">${esc(a.kind)}</span>
      <span class="stw vis">${a.hidden ? '숨김' : '표시'}</span><span class="rt n ver">${log.length ? esc(log[0][0]) : '—'}</span><span class="rt n">${esc(a.size)}</span>`); }).join('');
}
/** 현황판 아래 단계 요약 kv — 업로드: 디스크 · 허용 형식 · 한도 / 완료: 총 용량 · 형식별 / 발행중: 진행 · 실패 / 아카이브: 표시 · 숨김 · 총 용량. */
/** 요약 kv 는 표가 아니라 한 줄 띠(`.info--row`)다 — 세로 3줄을 가로로 흘려 그만큼을 목록에 돌려준다. */
function boardFoot() {
  const ROW = 'info--row';
  if (S.tab === 'upload') return dl([['디스크', `${gb(DISK.used)} / ${gb(DISK.total)} GB`], ['잔여', `${gb(DISK.free)} GB`], ['허용 형식', ACCEPT_EXT.map((x) => x.slice(1).toUpperCase()).join(' · ')], ['한도', '1 TB']], ROW);
  if (S.tab === 'manage') { const c = by(S.done, fmtOf); return dl([['총 용량', sumBytes(S.done)], ['위치 있음', `${S.done.filter(imFor).length}건`], ['형식별', Object.entries(c).map(([k, n]) => `${k} ${n}`).join(' · ') || '—']], ROW); }
  if (S.tab === 'publishing') { const c = by(S.pubs, (p) => p.st); return dl([['진행', `${c.run || 0}건`], ['실패', c.fail ? `<span class="warn">${c.fail}건</span>` : '0건'], ['총 용량', sumBytes(S.pubs)], ['단계', '4']], ROW); }
  const c = by(S.arch, (a) => (a.hidden ? 'h' : 'v')), k = by(S.arch, (a) => a.kind);
  return dl([['표시', `${c.v || 0}건`], ['숨김', `${c.h || 0}건`], ['총 용량', sumBytes(S.arch)], ['유형별', Object.entries(k).map(([n, v]) => `${n} ${v}`).join(' · ') || '—']], ROW);
}
/** 현재 단계의 목록(필터 · 검색 적용). 현황판 줄 → 타일 선택 시 그 타일이 있는 쪽으로 간다. */
function filtered() {
  if (S.tab === 'upload') return S.ups.filter((u) => passFmt(u) && hit(u));
  if (S.tab === 'manage') return S.done.filter((d) => passFmt(d) && hit(d));
  if (S.tab === 'publishing') return S.pubs.filter((p) => passFmt(p) && hit(p));
  return S.arch.filter((a) => passKind(a) && hit(a));
}
function selectTile(id) {
  S.sel = id; S.mode = 'tile'; S.more = false;
  const i = filtered().findIndex((r) => r.id === id);
  if (i >= 0) S.page = Math.floor(i / Math.max(1, S.pp - (S.tab === 'upload' ? 1 : 0))) + 1;
  renderPanel(); renderSide();
}
function backToBoard() { S.sel = null; S.mode = 'none'; S.more = false; renderPanel(); renderSide(); }
$('#side-back').addEventListener('click', backToBoard);
$('#side').addEventListener('click', (ev) => { const r = ev.target.closest('.pb[data-id]'); if (r) selectTile(r.dataset.id); });
$('#side').addEventListener('keydown', (ev) => { const r = ev.target.closest('.pb[data-id]'); if (r && (ev.key === 'Enter' || ev.key === ' ')) { ev.preventDefault(); selectTile(r.dataset.id); } });

/* ── 성과 — 이 자산에 닿은 실제 AI 결과(results.js). 판 위에 청록으로 서고, 범위 안 건수는 세어서 적는다. ── */
const resultsOf = (id) => (RESULT_OF[id] || []).map((rid) => resultRow(RESULT_BY_ID[rid])).filter(Boolean);
function resultsHtml(res, bounds) {
  if (!res.length) return '';
  // 한 덩어리(.blk) = 머리 + 제 줄들. 두 단으로 흐를 때 머리만 앞 단 바닥에 남지 않게 통으로 옮긴다.
  const head = `<section class="blk"><div class="ph"><span class="lb">성과 ${res.length} · AI 결과</span><span class="lb">결과 / 건수 / 분석일</span></div>`;
  return head + res.map((r) => `<div class="rs" data-res="${r.id}"><span class="sw"></span>
    <span class="nm">${esc(r.name)}${r.sub ? `<small class="n">· ${esc(r.sub)}</small>` : ''}${bounds ? `<small class="n" data-rin="${r.id}">· 범위 내 …</small>` : ''}</span>
    <span class="nv n"><b>${nf.format(r.n)}</b><span>${esc(r.unit)}</span></span><span class="at n">${esc(r.at)}</span></div>`).join('') + '</section>';
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
  const head = `<section class="blk"><div class="ph"><span class="lb">데이터 테이블 · ${sc.cols.length}열 · ${esc(sc.rows)}</span><span class="lb">속성명 / 유형 / 예시</span></div>`;
  return head + sc.cols.map(([n, t, e]) => `<div class="sc" data-col="${esc(n)}"><i>${esc(n)}</i><em>${esc(t)}</em><span class="exv">${esc(e)}</span></div>`).join('')
    + `<p class="attrib n">${sc.geo ? '예시 = 결과 첫 행 실값' : `예시 · ${SEED_TAG}`}</p></section>`;
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
  const head = `<section class="blk"><div class="ph"><span class="lb">사용 현황 · ${us.length}</span><span class="lb">프로젝트 · 데이터셋 · 서비스 / 근거 · ${SEED_TAG}</span></div>`;
  return head + (us.length ? us.map((u) => `<div class="us" title="${esc(u.src)}"><span class="kd">${esc(u.kind)}</span><span class="nm">${esc(u.name)}</span><span class="rf n">${esc(u.ref)}</span></div>`).join('') : `<p class="us-empty n">사용 0</p>`) + '</section>';
}
function publishHtml(a) {
  const log = PUBLISH_LOG[a.id] || [];
  return `<section class="blk"><div class="ph"><span class="lb">발행 이력 · ${log.length}</span><span class="lb">버전 / 일시 / 등록자 · ${SEED_TAG}</span></div>`
    + log.map(([v, at, who, wh]) => `<div class="pl"><span class="v n">${esc(v)}</span><span class="wh">${esc(wh)}</span><span class="by">${esc(who)}</span><span class="at n">${esc(at)}</span></div>`).join('') + '</section>';
}
const memoGet = (id) => { try { return JSON.parse(localStorage.getItem(MEMO_KEY(id)) || 'null') || { t: '', at: '' }; } catch { return { t: '', at: '' }; } };
const memoPut = (id, t) => { const at = new Date().toLocaleString('sv-SE').slice(0, 16).replace(/-/g, '.'); try { localStorage.setItem(MEMO_KEY(id), JSON.stringify({ t, at })); } catch { /* 저장소 차단 */ } return at; };
function memoHtml(a) {
  const m = memoGet(a.id);
  return `<section class="blk"><div class="ph"><span class="lb">메모 · 이 브라우저에만 저장</span><span class="lb n"><span data-memo-n>${m.t.length}</span> / ${MEMO_MAX}</span></div>
    <div class="memo"><textarea id="memo" data-memo="${a.id}" maxlength="${MEMO_MAX}" rows="2" placeholder="메모" aria-label="메모 · 이 브라우저에만 저장">${esc(m.t)}</textarea>
    <p class="mf n"><span data-memo-at>${m.at ? `저장 ${esc(m.at)}` : '저장 없음'}</span><span class="dim">localStorage · 서버 저장 아님</span></p></div></section>`;
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
  $('#side-h').textContent = row ? (row.name || row.file) : BOARD_TITLE[S.tab];
  $('#side-h').title = row ? (row.name || row.file) : `${name} · ${BOARD_TITLE[S.tab]}`;
  $('#side-m').textContent = row ? `선택 1 / ${total}` : `선택 0 / ${total}`;
  $('#side-back').hidden = !row;   // `‹ 현황` — 상세에서 현황판으로. 4단계 같다.
  info.innerHTML = ''; acts.innerHTML = '';
  if (!row) {
    // 선택 없음 = 단계 현황판(4단계 같은 문법) + 단계 요약 kv. 판·액자는 닫는다. 0건이면 빈 줄 하나.
    hideFrames();
    info.innerHTML = `<div class="board" data-k="${S.tab}">${boardHtml()}${total ? '' : `<p class="pb-empty n">0건</p>`}</div>` + boardFoot();
    applyMapMode('none');
    return;
  }
  if (S.tab === 'upload') {
    const u = row, live = u.st === 'run';
    showFig(figFor(u, { pct: u.pct, live, extra: `<span class="fc n">${esc(UP_ST[u.st])} <b data-pv>${u.pct}%</b></span>` }));
    const rows = [['파일명', esc(u.file), 'wide'], ['형식', u.fmt], ['크기', u.size], ['상태', `${live ? '<b>' : ''}${UP_ST[u.st]}${live ? '</b>' : ''}`], ['진행률', `${u.pct}%`]];
    if (S.more) rows.push(['대기 순번', u.st === 'wait' ? String(S.ups.filter((x) => x.st === 'wait').indexOf(u) + 1) : '—'], ['자료', `원본 목업 시드 · ${SEED_TAG}`]);
    info.innerHTML = cols2(dl(rows));
    acts.innerHTML = UP_ACTIONS[u.st].map((k) => actBtn(k, k === 'cancel' ? '취소' : ACT_NAME[k], `data-up="${u.id}"`, k === 'detail' && S.more ? 'on' : '')).join('');
    applyMapMode('none');
    return;
  }
  if (S.tab === 'manage') {
    // 판 자리는 **늘 같은 자리**다(발주 2026-09-20: "같은 종류는 같은 자리에 같은 모양으로").
    // 좌표가 있으면 그 자리에 지도가, 없으면 같은 자리에 그 종류의 미리보기 + 왜 못 얹는지가 선다.
    const d = row, im = imFor(d), res = resultsOf(d.id);
    const pan = panelOf(descOf(d));
    const sheet = sheetNote(d, im);   // 파일 시점 ≠ 실측 도엽 시점이면 그 사실을 적는다(감사 F9)
    if (pan.body === 'map') { showPlate(); applyMapMode('sel', { id: d.id, im, title: d.file, sub: `GSD ${cm(im)}`, res, note: sheet }); }
    else { showFig(figFor(d) + gapLine(pan)); applyMapMode('none'); }
    const blocked = (pan.blocked || []).find((b) => b.cap === 'map');
    const crs = im ? 'EPSG:5186 → 4326' : blocked ? `<span class="warn">${esc(CRS_NONE.why)}</span>` : '—';
    // 날짜·좌표계는 값이 길다 — 반 칸에 밀어 넣으면 두 줄이 되거나 잘린다. 제 줄을 준다.
    const base = [['이름', esc(d.file), 'wide'], ['형식', d.fmt], ['크기', d.size], ['업로드 일시', d.at, 'wide'], ['촬영일', im ? ymd(im.captured) : '—'], ...(sheet ? [['도엽', esc(sheet), 'wide']] : []),
      ['GSD', im ? cm(im) : '—'], ['좌표계', d.fmt === 'SHP' && blocked ? crs : im ? crs : '—', d.fmt === 'SHP' && blocked ? 'wide' : ''],
      ...(blocked ? [['조치', esc(blocked.why), 'wide']] : []),
      ['아카이빙', `${d.arch}회`], ['등록자', esc(d.by)], ['범위', im ? `<span class="n">${bounds4(im.bounds)}</span>` : '실측 범위 없음', 'wide'],
      ...(d.joined ? [['필지 결합', `${nf.format(d.joinN || 0)} 필지 · pnu · ${SEED_TAG}`, 'wide']] : [])];
    if (S.mode === 'pub') {
      info.innerHTML = cols2(`<div class="ph"><span class="lb">지도 레이어 발행</span><span class="lb">${esc(d.file)} · ${esc(d.size)}</span></div>` + pubFormHtml(d, PUB_PREFILL[d.id] || {}));
      return;
    }
    // 판/액자 옆에 신원(기본 정보), 그 아래 한 줄로 성과 또는 데이터 테이블 속성.
    info.innerHTML = cols2(dl(base), im ? resultsHtml(res, im.bounds) : d.unpacked ? unpackHtml(d) : schemaHtml(d));
    if (im) fillInBounds(res, im.bounds); else fillSchemaFromGeo(d);
    // 액션 = assets.js 가 말한 `할 수 있는 일`만. 엑셀에 지도 레이어 발행 버튼은 서지 않는다.
    acts.innerHTML = capActs(d, `data-dn="${d.id}"`);
    return;
  }
  if (S.tab === 'publishing') {
    const p = row, fail = p.st === 'fail';
    showFig(figFor(p, { pct: pubPct(p), live: !fail, extra: `${ticks(p, !(THUMB[p.id] || (p.from && THUMB[p.from])))}<span class="fc n${fail ? ' warn' : ''}">${fail ? `실패 ${p.step}/4 · ${esc(p.short || '')}` : `${p.step}/4 ${esc(PUB_STEPS[p.step - 1])} · ${pubPct(p)}%`}</span>` }));
    const rows = [['파일명', esc(p.file), 'wide'], ['형식', p.fmt], ['크기', p.size], ['업로드', p.at], ['상태', fail ? `<span class="warn">${PUB_ST[p.st]}</span>` : `<b>${PUB_ST[p.st]}</b>`], ['단계', `${p.step}/4 ${esc(PUB_STEPS[p.step - 1])}`, 'wide']];
    if (fail) rows.push(['실패 사유', esc(p.why), 'warn wide']);
    if (p.crs) rows.push(['좌표계', p.crs]);
    if (S.more) rows.push(['단계 4', PUB_STEPS.map((s, i) => `${i + 1} ${s}`).join(' · '), 'wide'], ['자료', `원본 목업 시드 · ${SEED_TAG}`, 'wide']);
    // 좌표계가 없어 멈춘 건은 할 일을 한 줄로 못 박는다 — 우측 `좌표계 지정` 버튼이 그 일을 한다.
    if (fail && /좌표계/.test(p.short || '')) rows.push(['조치', esc(CRS_NONE.act), 'wide']);
    info.innerHTML = cols2(dl(rows));
    // 실패마다 할 일이 다르다 — ZIP 안에 이미지가 없는 건 `좌표계 지정` 으로 풀리지 않는다(2026-09-20 바로잡음).
    const NAME = { crs: '좌표계 지정', unpack: '원본 다시 올리기', join: '필지 연결 안내', cancel: '발행 취소', detail: '세부 정보' };
    const list = (fail ? failActions(p) : ['cancel', 'detail']).map((k) => [k, NAME[k]]);
    acts.innerHTML = list.map(([k, n]) => actBtn(k, n, `data-pb="${p.id}"`, (k === 'crs' || k === 'unpack' || k === 'join') ? 'pri' : k === 'detail' && S.more ? 'on' : '')).join('');
    applyMapMode('none');
    return;
  }
  // 아카이브 — 판(레이어) + 기본 정보 + (상세: 밴드·속성) + 사용 현황 · 성과 · 발행 이력 · 메모 + 5액션.
  // 표시 상태의 자산은 선택되면 레이어로 선다(숨김은 `표시` 를 눌러야). 레이어 목록·범위·표시 행은 뺐다(발주 2차: 의미 없음).
  const a = row, g = geomOf(a), res = resultsOf(a.id);
  const apan = panelOf(descOf(a));
  if (!a.hidden && !S.layers.includes(a.id)) S.layers.push(a.id);
  if (apan.body === 'map') { showPlate(); applyMapMode('arch', a); }
  else { showFig(figFor(a) + gapLine(apan)); applyMapMode('none'); }
  // 사용 현황 → 성과 → 기본 정보 3행(이름 · 원본 파일 · 유형/형식 · 크기/기준일) → 발행 이력 → 메모. 나머지 행은 `상세` 에.
  const rows = [['이름', esc(a.name), 'wide'], ['원본 파일', esc(a.file), 'wide'], ['유형', a.kind], ['형식', extOf(a.file).toUpperCase()], ['크기', a.size], ['기준일', a.basis]];
  let meta = dl(rows);
  if (S.more) {
    // 좌표계는 자산이 선언한 값(ARCHIVE.crs)을 적는다. 기하 파일이 없어 판에 못 세우는 것과 좌표계가 없는 것은 다른 일이다.
    meta += dl([['등록 일시', a.at], ['등록자', esc(a.by)], ['GSD', g && g.kind === 'raster' ? cm(g.im) : '—'], ['좌표계', esc(a.crs || (SILHOUETTE[a.id] ? SILHOUETTE[a.id].crs : '—'))],
      ...Object.entries(a.detail).map(([k, v]) => [k, esc(v), 'wide'])]);
    meta += `<div class="ph"><span class="lb">밴드 · 속성</span><span class="lb">속성명 / 속성정보</span></div>` + a.bands.map(([k, v]) => `<div class="dt-b"><i>${esc(k)}</i><em>${esc(v)}</em></div>`).join('');
  }
  // 신원(기본 정보)은 판 옆에, 쓰임(사용 현황 · 성과 · 발행 이력 · 메모)은 그 아래 두 단으로.
  // 자료 출처 한 줄은 신원 쪽(왼단) 끝에 붙인다 — 목록 격자에 제 행을 따로 먹지 않게.
  info.innerHTML = cols2(meta + `<p class="attrib n">${esc(ATTRIB)}</p>`, usageHtml(a) + resultsHtml(res, g ? g.bounds : null) + publishHtml(a) + memoHtml(a));
  if (g) fillInBounds(res, g.bounds);
  // 표시/공유/삭제/상세는 보관물이면 늘 할 수 있는 일이고, `공간 편집` 은 **범위가 있을 때만** 뜻이 있다.
  // `공간 편집` 은 편집 도구가 아직 없다 — 세우되 누를 수 없게, 이유 한 줄과 함께(GEO_WHY).
  const arActs = [['vis', a.hidden ? '표시' : '숨김'], ['share', '공유'],
    ...(apan.body === 'map' ? [['geo', '공간 편집']] : []), ...(allowed('edit') ? [['del', '삭제']] : []), ['detail', '상세']];
  acts.innerHTML = arActs.map(([k, nm]) => actBtn(k, nm, `data-ar="${a.id}"${k === 'geo' ? ' disabled aria-describedby="acts-why"' : ''}`, k === 'detail' && S.more ? 'on' : '')).join('')
    + (apan.body === 'map' ? whyLine(GEO_WHY) : '');
}
$('#side').addEventListener('click', (ev) => {
  const b = ev.target.closest('.act[data-act]'); if (!b) return;
  if (b.dataset.up) { const u = S.ups.find((x) => x.id === b.dataset.up); if (u) upAct(u, b.dataset.act); return; }
  if (b.dataset.dn) { const d = S.done.find((x) => x.id === b.dataset.dn); if (d) dnAct(d, b.dataset.act); return; }
  if (b.dataset.pb) { const p = S.pubs.find((x) => x.id === b.dataset.pb); if (p) pbAct(p, b.dataset.act); return; }
  if (b.dataset.ar) { const a = S.arch.find((x) => x.id === b.dataset.ar); if (a) archAct(a, b.dataset.act); return; }
});

/** 완료본의 액션 — assets.js CAPS 가 이름을 정하고, 여기서는 그 일을 한다. */
function dnAct(d, k) {
  if (k === 'pub') { openPubForm(d.id); return; }
  if (k === 'detail') { S.more = !S.more; renderSide(); return; }
  if (k === 'analyze') { location.href = 'analysis-ai.html'; return; }
  if (k === 'label') { location.href = 'ai-project-label.html'; return; }
  if (k === 'download') { download(d); return; }
  if (k === 'join') { if (d.joined) { d.joined = false; renderSide(); say(`결합 해제 — ${d.file}`); } else joinTable(d); return; }
  if (k === 'unpack') { d.unpacked = !d.unpacked; renderSide(); say(d.unpacked ? `풀었습니다 — ${d.file} · 항목 ${zipItems(d).length} · 이 화면에서만` : `다시 묶었습니다 — ${d.file}`); return; }
}

/* ══ 파괴 동작 — 확인 → 실행 → 8초 되돌리기 (감사 F5 · S2) ═══════════════════════
   전에는 아카이브 삭제 · 업로드 취소 · 발행 취소가 누르는 즉시 사라졌고 되돌릴 길이 없었다.
   이제 셸 confirmDialog(danger — 기본 포커스는 `그대로 두기`) 로 한 번 묻고, 실행 뒤 토스트 옆 `되돌리기` 가 8초 선다.
   셸 say() 는 글자만 받으므로 되돌리기 버튼은 토스트 바로 오른쪽에 붙여 세운다(같은 잉크 1px · 그림자 0). */
const UNDO_MS = 8000;
let undo = null;   // { msg, fn, t }
function refresh() { renderKpi(); if (!S.tab) { renderOverview(); return; } renderPanel(); renderSide(); }
function destroy({ title, what, meta, ok, done, list, set, row, after, undo: back }) {
  confirmDialog({ title, body: `${what}\n${meta}\n\n실행 뒤 8초 안에 되돌릴 수 있습니다.`, okLabel: ok, cancelLabel: '그대로 두기', danger: true }).then((yes) => {
    if (!yes) return;
    const arr = list(), at = arr.indexOf(row); if (at < 0) return;
    set(arr.filter((x) => x !== row));
    after?.();
    if (S.sel === row.id) { S.sel = null; S.mode = 'none'; S.more = false; }
    refresh();
    offerUndo(`${done} — ${what}`, () => {
      const cur = list(); if (cur.includes(row)) return;
      const next = cur.slice(); next.splice(Math.min(at, next.length), 0, row); set(next);
      back?.();
      refresh();
      say(`되돌렸습니다 — ${what}`);
    });
  });
}
function undoBtn() {
  let b = $('#ds-undo');
  if (b) return b;
  b = document.createElement('button');
  b.type = 'button'; b.id = 'ds-undo'; b.hidden = true; b.textContent = '되돌리기';
  b.addEventListener('click', () => { const u = undo; dropUndo(); u?.fn(); });
  document.body.append(b);
  // 토스트 글자가 다른 말로 바뀌면 이 되돌리기는 더 이상 그 말의 짝이 아니다 — 내린다.
  new MutationObserver(() => { const t = $('#say')?.textContent || ''; if (undo && t && t !== undo.msg) dropUndo(); })
    .observe($('#say'), { childList: true, characterData: true, subtree: true });
  return b;
}
function offerUndo(msg, fn) {
  dropUndo();
  const b = undoBtn();
  undo = { msg, fn, t: setTimeout(dropUndo, UNDO_MS) };
  say(msg, UNDO_MS);
  // 자리는 토스트의 **레이아웃 상자**로 잰다(offset*) — 들어오는 운동(translateY)에 흔들리지 않게.
  const place = () => {
    const t = $('#say'); if (!undo || !t.offsetWidth) return;
    b.style.left = `${t.offsetLeft + t.offsetWidth - 1}px`; b.style.top = `${t.offsetTop}px`; b.style.height = `${t.offsetHeight}px`;
    b.hidden = false;
    // 확인 대화가 닫히며 포커스가 돌아갈 버튼(삭제 · 취소)은 방금 사라졌다 — 키보드 사용자는 여기서 바로 되돌릴 수 있다.
    if (!document.activeElement || document.activeElement === document.body) b.focus();
  };
  requestAnimationFrame(() => requestAnimationFrame(place));
}
function dropUndo() {
  if (undo) clearTimeout(undo.t);
  undo = null;
  const b = $('#ds-undo'); if (!b) return;
  const had = document.activeElement === b;
  b.hidden = true;
  if (had) $('#grid').focus();
}

/* ══ 실패 조치 · 표 결합 · 풀기 — 토스트만 하던 다섯 자리(감사 F3) ════════════════════ */
/** 원본 다시 올리기 — 업로드 탭으로 가서 **같은 파일의 업로드 건**을 골라 둔다. 없으면 드롭존에 포커스. */
function reupload(p) {
  setTab('upload');
  const u = S.ups.find((x) => x.file === p.file);
  if (u) { selectTile(u.id); $(`#grid .th[data-open="${u.id}"]`)?.focus(); say(`원본 다시 올리기 — ${u.file} · 업로드 ${UP_ST[u.st]}`); }
  else { $('#drop').focus(); say(`원본 다시 올리기 — ${p.file} · 드롭존에 다시 놓기`); }
}
/** 이 표를 필지에 붙일 수 있나 — 데이터 테이블 선언에 pnu 열이 있고, 그 값을 담은 결과 GeoJSON 이 저장소에 있을 때만. */
function joinSrc(row) { const sc = SCHEMA[SCHEMA_OF[row.id]]; return sc && sc.geo && sc.cols.some(([n]) => n === 'pnu') ? sc : null; }
/** 필지 연결 안내 — 발행 1단계에서 막힌 표 자료. 무엇이 있어야 지도 레이어가 되는지를 적고, 붙이는 자리로 보낸다. */
function joinGuide(p) {
  const d = S.done.find((x) => x.file === p.file);
  const sc = d && joinSrc(d);
  const body = `<p class="modal-msg">${esc(p.file)} 에는 좌표가 없습니다. 지도 레이어가 되려면 세 가지가 필요합니다.</p>
    <ol class="guide">
      <li><b>필지 번호 열</b> — pnu · 문자 19자리 · ${sc ? '<em>이 표에 있음</em>' : '<em class="warn">이 표에서 못 찾음</em>'}</li>
      <li><b>필지 경계</b> — 같은 시점의 연속지적도 또는 AI 결과 필지 폴리곤</li>
      <li><b>pnu 로 결합</b> — 결합된 표를 공간정보 레이어로 다시 발행</li>
    </ol>`;
  openModal({ title: '필지 연결 안내', content: body, width: 560, tag: SEED_TAG,
    actions: [{ label: '닫기', kind: 'bracket' },
      ...(d ? [{ label: '업로드 완료에서 붙이기 ›', kind: 'primary', autofocus: true, onClick: () => { setTimeout(() => { setTab('manage'); selectTile(d.id); $('#side-acts .act[data-act="join"]')?.focus(); }, 0); } }] : [])] });
}
/** 필지에 붙이기 — 표의 pnu 와 결과 GeoJSON 필지를 실제로 맞춰 본다. 결합 표(앞 8행)를 보이고, 붙이면 이 화면 상태에 남는다. */
async function joinTable(d) {
  const sc = joinSrc(d); if (!sc) return;
  const g = await loadGeo(sc.geo);
  const feats = (g && g.features) || [];
  const rows = feats.map((f) => f.properties || {}).filter((pr) => /^\d{19}$/.test(String(pr.pnu || '')));
  const cols = ['pnu', 'emd', 'cls', 'area'];
  const table = `<table class="jt n"><thead><tr>${cols.map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${
    rows.slice(0, 8).map((pr) => `<tr>${cols.map((c) => `<td>${esc(typeof pr[c] === 'number' ? nf.format(pr[c]) : pr[c] ?? '—')}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  const src = sc.geo.split('/').pop();
  const body = `<p class="jt-h n">${esc(d.file)} ↔ ${esc(src)} · pnu 일치 <b>${nf.format(rows.length)}</b> / ${nf.format(feats.length)} 필지</p>${table}
    <p class="jt-f n">앞 8행 · 필지 = 결과 GeoJSON 실측 · 표 원본 = 목업 시드(${SEED_TAG})</p>`;
  openModal({ title: '필지에 붙이기', content: body, width: 640, tag: SEED_TAG,
    actions: [{ label: '취소', kind: 'bracket' },
      { label: `${nf.format(rows.length)} 필지에 붙이기`, kind: 'primary', autofocus: true, onClick: () => {
        d.joined = true; d.joinN = rows.length; renderSide();
        say(`필지에 붙였습니다 — ${d.file} · ${nf.format(rows.length)} 필지 · ${SEED_TAG}`);
      } }] });
}
/** 묶음 파일의 항목 — 데이터 테이블 선언(SCHEMA zip)의 줄이 곧 안의 항목이다. */
const zipItems = (row) => (SCHEMA[SCHEMA_OF[row.id]]?.cols || []);
const unpackHtml = (row) => `<section class="blk"><div class="ph"><span class="lb">풀린 항목 · ${zipItems(row).length} · 이 화면에서만</span><span class="lb">항목 / 형식 / 내용</span></div>${
  zipItems(row).map(([n, t, e]) => `<div class="sc up-i"><i>${esc(n)}</i><em>${esc(t)}</em><span class="exv">${esc(e)}</span></div>`).join('')}</section>`;

/* ══ 내려받기 — 실제로 파일이 떨어진다(감사 F3 · download.js) ════════════════════════
   결과 GeoJSON 이 저장소에 있는 표·SHP 는 그 파일을 그대로, 정사영상은 **원본을 주지 않는다** —
   LX 가 보관하는 원본 대신 도엽 정보(영상 id · 촬영 · GSD · 범위 · 타일 경로)를 적은 메모를 준다.
   그 밖은 무엇인지 적힌 메모다. 없는 파일을 있는 척하지 않는다. */
const stem = (f) => String(f).replace(/\.[^.]+$/, '').replace(/[\/:*?"<>|]/g, '_');
async function download(d) {
  const im = imFor(d), sc = SCHEMA[SCHEMA_OF[d.id]];
  const head = ['Land-XI 데이터 관리 · 내려받기', `파일 ${d.file}`, `형식 ${d.fmt} · 크기 ${d.size} · 업로드 ${d.at}`];
  if (isOrtho(d)) {
    const lines = [...head, ''];
    if (im) {
      const nt = sheetNote(d, im);
      lines.push(`영상 id ${im.id}`, `촬영 ${ymd(im.captured)}${nt ? ` (${nt})` : ''}`, `GSD ${cm(im)}`, `범위 ${bounds4(im.bounds)} · EPSG:4326`, `타일 ${im.tiles}`);
    } else lines.push('실측 도엽 없음 — 좌표 확인 전이라 타일 카탈로그에 없다');
    lines.push('', '원본 정사영상은 LX 가 보관합니다 — 타일 열람만 제공');
    downloadNote(`${stem(d.file)}.txt`, lines);
    say(`내려받기 — ${stem(d.file)}.txt · 도엽 정보 · 원본은 LX 보관`);
    return;
  }
  if (sc && sc.geo) {
    const name = sc.geo.split('/').pop();
    if (await downloadFile(sc.geo, name)) { say(`내려받기 — ${name} · 결과 GeoJSON(속성 원천) · ${d.fmt} 원본은 목업 시드`); return; }
  }
  downloadNote(`${stem(d.file)}.txt`, [...head, '', `이 시연본에는 ${d.fmt} 원본 파일이 없습니다 — 원본 목업 시드(${SEED_TAG})`,
    ...(sc ? [`구성 ${sc.rows}`, ...sc.cols.map(([n, t]) => `  ${n} · ${t}`)] : [])]);
  say(`내려받기 — ${stem(d.file)}.txt · 파일 정보 · 원본 없음(${SEED_TAG})`);
}
/** 파일 이름의 시점과 실측 도엽의 시점이 다르면 그 사실을 한 줄로(감사 F9).
    완료 d4 `…202604…` 에 남원 2025.04 도엽을 대신 얹고 있었는데 아무 말이 없었다. */
function sheetNote(row, im) {
  if (!im) return '';
  const m = /20(\d\d)(0[1-9]|1[0-2])/.exec(row.file || '') || /20(\d\d)-(0[1-9]|1[0-2])/.exec(row.name || '');
  let fm = m ? `20${m[1]}-${m[2]}` : '';
  if (!fm) { const t = /^(\d{4})[.-](\d{2})/.exec(String(row.basis || row.at || '')); if (t) fm = `${t[1]}-${t[2]}`; }
  if (!fm || fm === im.captured) return '';
  return `파일 ${fm} · 실측 도엽 ${ymd(im.captured)} 대체 표시`;
}

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
    $('#plate-cap').textContent = `${arg.im.label} · GSD ${cm(arg.im)} · 측정${arg.res && arg.res.length ? ` · 성과 ${arg.res.length}` : ''}${arg.note ? ` · ${arg.note}` : ''}`;
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
/* ══ 모달 — 셸 openModal 이 감싼다(포커스 가둠 · Esc · 바깥 클릭 · 닫히면 부른 자리로) ══════
   감사 S4 · F6: 예전 자체 모달은 Tab 한 번에 밖으로 나갔다. 폼 몸통은 dataset.html #ds-forms 에 두고,
   열 때 셸 모달 안으로 옮겼다가 닫히면 보관함으로 되돌린다 — 폼의 이벤트는 그대로 산다. */
let dlg = null;   // 지금 열린 폼 모달 { ctx, form }
function openForm(sel, title, width = 480) {
  const form = $(sel); form.hidden = false;
  const ctx = openModal({ title, content: form, width, onClose: () => { form.hidden = true; $('#ds-forms').append(form); if (dlg && dlg.form === form) dlg = null; } });
  ctx.el.dataset.form = form.id;
  dlg = { ctx, form };
  return ctx;
}
const closeForm = () => { if (dlg) dlg.ctx.close(); };
document.addEventListener('click', (ev) => { if (ev.target.closest('.dsm [data-close]')) closeForm(); });
document.addEventListener('keydown', (ev) => {
  if (ev.key !== 'Escape' || ev.defaultPrevented || document.body.hasAttribute('data-modal')) return;   // 모달의 Esc 는 셸이 먼저 받는다
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
  $('#mq-err').hidden = true; openForm('#m-quota', '디스크 증량 신청');
}
$('#m-quota').addEventListener('submit', (ev) => {
  ev.preventDefault();
  const e = $('#mq-err');
  const g = S.quotaGb || Number($('#mq-gb').value);
  const why = $('#mq-why').value.trim();
  if (!g || g <= 0) { e.hidden = false; e.textContent = '신청 용량 필수'; return; }
  if (!why) { e.hidden = false; e.textContent = '신청 사유 필수'; return; }
  closeForm(); say(`디스크 증량 신청 접수 — ${nf.format(g)} GB · ${SEED_TAG}`);
});

/* 공유 설정 — 기관명 / 권한명 표.
   원본 정사영상은 LX 가 보관한다(two-tier · card-architecture R7). 기관에는 타일 열람까지만 —
   그래서 정사영상의 LX 밖 기관 `편집` 은 누를 수 없게 세우고 이유를 한 줄로 적는다.
   자산 등급 표 전체(ASSET_TIERS)는 E1-7 몫이다 — 여기서는 이 한 칸만 닫는다. */
let shareId = null, msPerm = [], msLock = false;
function openShare(a) {
  shareId = a.id;
  msLock = isOrtho(a);
  $('#ms-sub').textContent = `${a.name} · ${a.file}`;
  msPerm = ORGS.map((org) => {
    const perm = (a.share.find((s) => s.org === org) || { perm: '권한 없음' }).perm;
    return { org, perm: msLock && org !== LX_ORG && perm === '편집' ? '뷰어' : perm };
  });
  const note = $('#ms-lock'); note.hidden = !msLock; note.textContent = msLock ? ORTHO_LOCK : '';
  renderMs(); openForm('#m-share', '공유 설정');
}
const renderMs = () => { $('#ms-perm').innerHTML = msPerm.map((r, i) => segRow(r.org, r.perm, i, 'data-ms', msLock && r.org !== LX_ORG)).join(''); };
$('#ms-perm').addEventListener('click', (ev) => { const b = ev.target.closest('[data-ms]'); if (!b || b.disabled) return; msPerm[+b.dataset.ms].perm = b.dataset.perm; renderMs(); $(`#ms-perm [data-ms="${b.dataset.ms}"][data-perm="${b.dataset.perm}"]`)?.focus(); });
$('#m-share').addEventListener('submit', (ev) => {
  ev.preventDefault();
  const a = S.arch.find((x) => x.id === shareId);
  if (a) { a.share = msPerm.map((s) => ({ ...s })); say(`공유 설정 저장 — ${a.name} · ${a.share.map((s) => `${s.org} ${s.perm}`).join(' · ')}`); }
  closeForm();
});

/* ══ 기동 — 푸터는 셸이 세운다(패밀리 사이트가 실제로 펼쳐진다) ═══════════════ */

/* 창 크기가 바뀌면 액자 안의 것을 다시 맞춘다 — 실루엣은 상자 픽셀로 다시 그리고,
   표·트리는 새 높이에 맞춰 접는 줄 수를 다시 센다. 한 해상도에 맞춰 둔 값이 아니다. */
let rzT = 0;
addEventListener('resize', () => {
  clearTimeout(rzT);
  rzT = setTimeout(() => {
    for (const root of [$('#grid'), $('#side'), $('#ov')]) { fitFrames(root); drawSilhouettes(root); }
    if (map) map.resize();
  }, 160);
});

/* 자산 대장 점검 — assets.js 의 규칙을 어기는 줄을 화면 밖에서 셀 수 있게 열어 둔다.
   지금 걸리는 줄(좌표 없는 정사영상 2 · 좌표계 없는 SHP 2 · 기하 없는 SHP 1)은 전부
   화면이 `왜 없는지` 를 말하고 있는 것들이다 — 좌표를 지어내 대장을 비우지 않았다. */
window.__dsAssets = () => assetCheck([
  ...S.done.map((d) => { const im = imFor(d); return { name: d.file, bounds: im ? im.bounds : undefined }; }),
  ...S.arch.map((a) => { const g = geomOf(a); return { name: a.file, bounds: g ? g.bounds : undefined, crs: a.crs }; }),
]);

setTab(tabFromUrl(), false);
document.documentElement.dataset.plate = 'closed';
document.documentElement.dataset.ds = 'ready';
