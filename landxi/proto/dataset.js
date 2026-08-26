// 데이터 관리 — 지도 위 원장.
// 규칙 두 가지만 지킨다.
//  1) 기능은 원본과 1:1 이다. 원본
//     https://mini531.github.io/namwon-smart-village/landxi7/dataset.html
//     의 4탭(`?tab=upload|manage|publishing|archive`)과 프래그먼트 4종이 전부이고,
//     표에 없는 기능은 만들지 않는다. 대조표: docs/superpowers/proto/2026-08-26-dataset-parity.md
//  2) 지도는 새 위젯이 아니라 원본 `#ds-map` 의 자리다. 판 위에 남는 것은 실측 범위 액자와
//     선택 락온뿐 — 좌표계가 없는 파일은 점선 무채 액자로 자백한다.
// 조판 마스터: design-canvas/v2/B2-DataMgmt-Upload.dc.html · B2-DataMgmt-List.dc.html (1440×900).
// 콘티 원칙(§7): 목록은 원본 목업 시드를 그대로 옮긴 `시연` 자료다 — 지어낸 운영 서사를 더하지 않는다.
import {
  nf, SEED_TAG, TABS, TAB_IDS, DEFAULT_TAB, FMT_FILTERS, KIND_FILTERS, matchFmt,
  DROP, ACCEPT_EXT, UP_ST, UP_ACTIONS, ACT_NAME, UPLOADS, UP_FOLD,
  DISK, QUOTA_PRESETS, ARCHIVE, ORGS, PERMS, SHARE_DEFAULT,
  DONE_UP, DONE_FOLD, PUB_TYPES, PUB_PREFILL, PUB_STEPS, PUBLISHING, PUB_ST,
  IMG, EXTENTS, PLATE_HEAD, ATTRIB, FOOT_LINKS, FOOT_ADDR,
} from './ds-data.js';
import { mountPlate, Brackets, uploadItems, lockItem, frame, padFor, padWide, showOrtho, KOREA_SW } from './ds-plate.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const REDUCED = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const cssPx = (n, d) => parseFloat(getComputedStyle(document.documentElement).getPropertyValue(n)) || d;

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
  const b = ev.target.closest('.rail-i[data-menu]');
  if (!b) return;
  const go = b.dataset.go;
  // 원본 페이지가 이 저장소에 없는 메뉴는 링크를 지어내지 않는다 — 화면이 그대로 말한다.
  if (go && go !== 'dataset.html') { location.href = go; return; }
  if (!go) say(`원본 ${b.title.replace('원본 ', '')} — 이 콘티에는 아직 없습니다`);
});

/* ══ 상태 ══════════════════════════════════════════════════════════════ */
const S = {
  tab: DEFAULT_TAB,
  filter: '전체',
  q: '',
  ups: UPLOADS.map((u) => ({ ...u })),
  upAll: false,
  arch: ARCHIVE.map((a) => ({ ...a, share: SHARE_DEFAULT.map((s) => ({ ...s })) })),
  archSel: null,
  done: DONE_UP.map((d) => ({ ...d })),
  doneAll: false,
  doneSel: null,
  pubs: PUBLISHING.map((p) => ({ ...p })),
  pubSel: null,
  quotaGb: 256,
};

const sayEl = $('#say');
let sayT = 0;
function say(t) { sayEl.textContent = t; clearTimeout(sayT); sayT = setTimeout(() => { sayEl.textContent = ''; }, 4200); }

/* ══ 탭 · `?tab=` 동기화 ═══════════════════════════════════════════════ */
$('#ds-tabs').innerHTML = TABS.map((t) => `
  <button type="button" class="tb" id="tab-${t.id}" role="tab" data-tab="${t.id}"
    aria-selected="false" aria-controls="panel-${t.id}" title="원본 ${t.frag}">${esc(t.name)}</button>`).join('');

const tabFromUrl = () => {
  const t = new URLSearchParams(location.search).get('tab');
  return TAB_IDS.includes(t) ? t : DEFAULT_TAB;
};

function setTab(id, push = true) {
  if (!TAB_IDS.includes(id)) id = DEFAULT_TAB;
  S.tab = id;
  // 원본 동작 — 탭 전환 시 필터칩과 하단 패널 상태가 초기화된다.
  S.filter = '전체'; S.q = '';
  S.archSel = null; S.doneSel = null; S.pubSel = null;
  $('#q').value = '';
  document.body.dataset.tab = id;
  $$('#ds-tabs .tb').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === id)));
  TABS.forEach((t) => { $(`#panel-${t.id}`).hidden = t.id !== id; });
  $('#ds-sub').textContent = id === 'upload'
    ? '업로드 · 발행 · 아카이브를 원본과 같은 4개 탭으로 다룹니다'
    : '아카이브 · 업로드 완료 · 레이어 발행중 — 원본 4개 탭과 1:1';
  if (push) {
    const u = new URL(location.href);
    u.searchParams.set('tab', id);
    history.pushState({ tab: id }, '', u);
  }
  renderFilters();
  renderPanel();
  syncPlate();
}
window.addEventListener('popstate', () => setTab(tabFromUrl(), false));
$('#ds-tabs').addEventListener('click', (ev) => {
  const b = ev.target.closest('.tb'); if (b) setTab(b.dataset.tab);
});

/* ══ 필터 · 검색 ═══════════════════════════════════════════════════════ */
function renderFilters() {
  const chips = S.tab === 'archive' ? KIND_FILTERS : FMT_FILTERS;
  $('#ds-filters').innerHTML = chips.map((c) => `
    <button type="button" class="chip" data-chip="${esc(c)}" aria-pressed="${c === S.filter}">${esc(c)}</button>`).join('');
}
$('#ds-filters').addEventListener('click', (ev) => {
  const b = ev.target.closest('.chip'); if (!b) return;
  S.filter = b.dataset.chip;
  renderFilters(); renderPanel();
});
$('#q').addEventListener('input', (ev) => { S.q = ev.target.value.trim(); renderPanel(); });

const hit = (row) => {
  const q = S.q.toLowerCase();
  if (!q) return true;
  return [row.file, row.name, row.by, row.kind].filter(Boolean).some((v) => String(v).toLowerCase().includes(q));
};
const passFmt = (row) => matchFmt(row.file, S.filter);
const passKind = (row) => S.filter === '전체' || row.kind === S.filter;

/* ══ 패널 렌더 ═════════════════════════════════════════════════════════ */
function renderPanel() {
  if (S.tab === 'upload') renderUpload();
  if (S.tab === 'archive') renderArchive();
  if (S.tab === 'manage') renderDone();
  if (S.tab === 'publishing') renderPublishing();
}

/* ── 업로드 탭 ─────────────────────────────────────────────────────── */
$('#dz-acc').innerHTML = DROP.accepts.map((a) => `<span>${esc(a.label)}</span>`).join('');
$('#file').accept = ACCEPT_EXT.join(',');

const actBtn = (id, k) => `<button type="button" class="act" data-up="${id}" data-act="${k}">${ACT_NAME[k]}</button>`;

function renderUpload() {
  const rows = S.ups.filter((u) => passFmt(u) && hit(u));
  const shown = S.upAll ? rows : rows.slice(0, UP_FOLD);
  $('#up-list').innerHTML = shown.map((u) => `
    <div class="uc" role="listitem" data-st="${u.st}" data-id="${u.id}">
      <div class="uc-h">
        <span class="uc-st">${UP_ST[u.st]}</span>
        <span class="fmt">${esc(u.fmt)}</span>
        <span class="uc-f n" title="${esc(u.file)}">${esc(u.file)}</span>
      </div>
      <div class="uc-p"><span class="uc-t"><i style="width:${u.pct}%"></i></span>
        <span class="uc-v n5">${u.pct}%</span></div>
      <div class="uc-a">${UP_ACTIONS[u.st].map((k) => actBtn(u.id, k)).join('')}</div>
    </div>`).join('');
  const tally = (k) => S.ups.filter((u) => u.st === k).length;
  $('#up-tally').textContent = `${S.ups.length}건 · 업로드중 ${tally('run')} · 대기 ${tally('wait')} · ${SEED_TAG}`;
  const rest = rows.length - shown.length;
  const more = $('#up-more');
  more.hidden = rows.length <= UP_FOLD;
  if (!more.hidden) {
    more.innerHTML = S.upAll
      ? `<button type="button" id="up-fold">접기</button>`
      : `대기중 ${rest}건 더 · <button type="button" id="up-fold">전체 보기</button>`;
  }
  $('#disk-pct').textContent = `${DISK.pct}%`;
  $('#disk-bar i').style.width = `${DISK.pct}%`;
  const gb = (v) => nf.format(v) + (Number.isInteger(v) ? '.0' : '');
  $('#disk-use').textContent = `${gb(DISK.used)} / ${gb(DISK.total)} GB`;
  $('#disk-free').textContent = `잔여 ${gb(DISK.free)} GB`;
}

$('#up-more').addEventListener('click', (ev) => {
  if (ev.target.closest('#up-fold')) { S.upAll = !S.upAll; renderUpload(); }
});

$('#up-list').addEventListener('click', (ev) => {
  const b = ev.target.closest('.act[data-up]'); if (!b) return;
  const u = S.ups.find((x) => x.id === b.dataset.up); if (!u) return;
  const k = b.dataset.act;
  if (k === 'pause') { u.st = 'pause'; say(`일시정지 — ${u.file}`); }
  if (k === 'resume') { u.st = 'run'; say(`재개 — ${u.file}`); }
  if (k === 'retry') { u.st = 'run'; say(`이어 올리기 — ${u.file} (${u.pct}%부터)`); }
  if (k === 'cancel') { S.ups = S.ups.filter((x) => x.id !== u.id); say(`업로드 취소 — ${u.file}`); }
  if (k === 'detail') { openDetailModal(u); return; }
  renderUpload();
});

/* 드롭존 — 드래그 & 클릭. 검증은 원본과 같다(허용 형식 5 · 최대 1 TB). */
const drop = $('#drop');
drop.addEventListener('click', () => $('#file').click());
drop.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); $('#file').click(); } });
['dragenter', 'dragover'].forEach((t) => drop.addEventListener(t, (ev) => { ev.preventDefault(); drop.classList.add('on'); }));
['dragleave', 'drop'].forEach((t) => drop.addEventListener(t, (ev) => { ev.preventDefault(); drop.classList.remove('on'); }));
drop.addEventListener('drop', (ev) => { take([...(ev.dataTransfer?.files || [])]); });
$('#file').addEventListener('change', (ev) => take([...ev.target.files]));

let picked = [];
function take(files) {
  picked = files;
  const p = $('#up-picked');
  p.hidden = !files.length;
  p.textContent = files.length ? `선택 ${files.length}건 · ${files.map((f) => f.name).join(' · ')}` : '';
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
    S.ups.push({
      id: 'u' + (Date.now() + Math.random()).toString(36).slice(-6),
      st: 'wait', fmt: f.name.split('.').pop().toUpperCase(), file: f.name, pct: 0,
      size: `${(f.size / 1024 ** 3).toFixed(2)} GB`,
    });
  }
  say(`업로드 대기열에 ${picked.length}건 추가 · ${SEED_TAG}`);
  take([]); $('#file').value = '';
  renderUpload();
});

/* 유휴 운동 1개 — 업로드중 카드의 진행률. 실제로 도는 타이머이고 값은 `시연` 이다. */
let ambient = 0;
function tick() {
  const run = S.ups.filter((u) => u.st === 'run');
  if (run.length && S.tab === 'upload') {
    for (const u of run) u.pct = u.pct >= 99 ? 62 : Math.min(99, u.pct + 1);
    renderUpload();
  }
}
if (!REDUCED()) ambient = setInterval(tick, 1600);

/* ── 아카이브 탭 ───────────────────────────────────────────────────── */
function renderArchive() {
  const rows = S.arch.filter((a) => passKind(a) && hit(a));
  $('#ar-empty').hidden = rows.length > 0;
  $('#ar-list').innerHTML = rows.map((a) => `
    <div class="ac" role="listitem" data-id="${a.id}" data-hidden="${a.hidden ? 1 : 0}"${S.archSel === a.id ? ' aria-current="true"' : ''}>
      <span class="ac-th${a.thumb ? '' : ' ac-th--none'}" data-open="${a.id}">${a.thumb
    ? `<img src="${esc(a.thumb)}" alt="" loading="lazy">`
    : '<span>미리보기 없음</span>'}</span>
      <span class="ac-b">
        <span class="ac-t"><span class="kind">${esc(a.kind)}</span><span class="ac-n">${esc(a.name)}</span></span>
        <span class="ac-m n">${esc(a.file)} · ${esc(a.size)} · 기준일 ${esc(a.basis)}</span>
        <span class="ac-by n">${esc(a.by)} · ${esc(a.at)}</span>
        <span class="ac-a">
          <button type="button" class="act" data-ar="${a.id}" data-act="vis">${a.hidden ? '표시' : '숨김'}</button>
          <button type="button" class="act" data-ar="${a.id}" data-act="share">공유 설정</button>
          <button type="button" class="act" data-ar="${a.id}" data-act="geo">공간 편집</button>
          <button type="button" class="act" data-ar="${a.id}" data-act="del">삭제</button>
        </span>
      </span>
    </div>`).join('');
}

$('#ar-list').addEventListener('click', (ev) => {
  const b = ev.target.closest('.act[data-ar]');
  if (b) {
    const a = S.arch.find((x) => x.id === b.dataset.ar); if (!a) return;
    const k = b.dataset.act;
    // 숨김은 감쇠일 뿐 삭제가 아니다 — 원본과 같다.
    if (k === 'vis') { a.hidden = !a.hidden; say(`${a.name} — ${a.hidden ? '숨김' : '표시'}`); renderArchive(); return; }
    if (k === 'share') { openShare(a); return; }
    if (k === 'geo') { selectArchive(a.id); say(`공간 편집 — ${a.name} · 판에서 범위를 잡습니다`); return; }
    if (k === 'del') { S.arch = S.arch.filter((x) => x.id !== a.id); if (S.archSel === a.id) closeDetail(); say(`삭제 — ${a.name}`); renderArchive(); return; }
  }
  const th = ev.target.closest('[data-open]');
  if (th) selectArchive(th.dataset.open);
});

function selectArchive(id) {
  const a = S.arch.find((x) => x.id === id); if (!a) return;
  S.archSel = id;
  renderArchive();
  $('#detail-rows').innerHTML = Object.entries(a.detail).map(([k, v]) => `
    <div class="dt-r"><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join('');
  $('#detail-bands').innerHTML = a.bands.map(([k, v]) => `
    <div class="dt-b"><i>${esc(k)}</i><em>${esc(v)}</em></div>`).join('');
  $('#detail').hidden = false;
  $('#detail').dataset.id = id;
  syncPlate();
}
function closeDetail() { S.archSel = null; $('#detail').hidden = true; renderArchive(); syncPlate(); }
$('#detail-x').addEventListener('click', closeDetail);
$('#detail').addEventListener('click', (ev) => {
  const b = ev.target.closest('[data-act]'); if (!b) return;
  const a = S.arch.find((x) => x.id === $('#detail').dataset.id); if (!a) return;
  if (b.dataset.act === 'share') openShare(a);
  if (b.dataset.act === 'geo') say(`공간 편집 — ${a.name} · 판에서 범위를 잡습니다`);
});

/* ── 업로드 완료 탭 ────────────────────────────────────────────────── */
function renderDone() {
  const rows = S.done.filter((d) => passFmt(d) && hit(d));
  const shown = S.doneAll ? rows : rows.slice(0, DONE_FOLD);
  $('#dn-empty').hidden = rows.length > 0;
  $('#dn-h').textContent = `업로드 완료 · ${rows.length}건 → 지도 레이어 발행`;
  $('#dn-more').hidden = rows.length <= DONE_FOLD;
  $('#dn-more').textContent = S.doneAll ? '접기 ‹' : '전체 보기 ›';
  $('#dn-list').innerHTML = shown.map((d) => `
    <div class="dn" role="listitem" data-id="${d.id}"${S.doneSel === d.id ? ' aria-current="true"' : ''}>
      <span class="fmt">${esc(d.fmt)}</span>
      <span class="dn-b"><span class="dn-f n" title="${esc(d.file)}">${esc(d.file)}</span>
        <span class="dn-m kb">${esc(d.size)} · ${esc(d.at)} · ${esc(d.by)} · 아카이빙 ${d.arch}회</span></span>
      <button type="button" class="dn-go" data-pub="${d.id}">지도 레이어 발행</button>
    </div>`).join('');
}
$('#dn-more').addEventListener('click', () => { S.doneAll = !S.doneAll; renderDone(); });
$('#dn-list').addEventListener('click', (ev) => {
  const b = ev.target.closest('[data-pub]'); if (!b) return;
  openPubForm(b.dataset.pub);
});

/* 발행 폼 — 발행 유형 / 기준 일자 / 데이터명 / 출처 / 설명 / 공유 권한 표 */
$('#pf-type').innerHTML = PUB_TYPES.map((t) => `<option>${esc(t)}</option>`).join('');
$('#pf-perm tbody').innerHTML = SHARE_DEFAULT.map((r, i) => `
  <tr><td>${esc(r.org)}</td><td><select data-perm="${i}" aria-label="${esc(r.org)} 권한명">${
  PERMS.map((p) => `<option${p === r.perm ? ' selected' : ''}>${esc(p)}</option>`).join('')}</select></td></tr>`).join('');

function openPubForm(id) {
  const d = S.done.find((x) => x.id === id); if (!d) return;
  S.doneSel = id;
  const pre = PUB_PREFILL[id] || {};
  $('#pf-type').value = pre.type || PUB_TYPES[0];
  $('#pf-basis').value = pre.basis || d.at.slice(0, 10).replace(/\./g, '-');
  $('#pf-name').value = pre.name || '';
  $('#pf-src').value = pre.src || '';
  $('#pf-desc').value = pre.desc || '';
  $('#pf-sel').textContent = `업로드 완료 탭 · 선택 1건 — ${d.file}`;
  $('#pf-err').hidden = true;
  $('#pubform').hidden = false;
  renderDone();
  syncPlate();
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
    S.pubs.unshift({ id: 'p' + Date.now().toString(36).slice(-5), fmt: d.fmt, st: 'run', step: 1,
      file: d.file, size: d.size, at: d.at, by: d.by });
    S.done = S.done.filter((x) => x.id !== d.id);
  }
  $('#pubform').hidden = true; S.doneSel = null;
  say(`지도 레이어 발행 시작 — ${name} · ${SEED_TAG}`);
  setTab('publishing');
});

/* ── 레이어 발행중 탭 ──────────────────────────────────────────────── */
const stepsHtml = (step) => `
  <div class="steps">${PUB_STEPS.map((s, i) => `
    <div class="sg${i < step ? ' on' : ''}">${i ? '<span class="ln"></span>' : ''}<span class="no">${i + 1}</span></div>`).join('')}</div>
  <div class="step-l">${PUB_STEPS.map((s, i) => `<span class="${i < step ? 'on' : ''}">${esc(s)}</span>`).join('')}</div>`;

function renderPublishing() {
  const rows = S.pubs.filter((p) => passFmt(p) && hit(p));
  $('#pb-empty').hidden = rows.length > 0;
  $('#pb-tally').textContent = `${S.pubs.length}건 · 진행 ${S.pubs.filter((p) => p.st === 'run').length} · 실패 ${S.pubs.filter((p) => p.st === 'fail').length}`;
  $('#pb-list').innerHTML = rows.map((p) => `
    <div class="pb" role="listitem" data-id="${p.id}" data-st="${p.st}">
      <div class="pb-h"><span class="fmt">${esc(p.fmt)}</span><span class="pb-st">${PUB_ST[p.st]}</span>
        <span class="pb-f n" title="${esc(p.file)}">${esc(p.file)}</span></div>
      ${stepsHtml(p.step)}
      <p class="pb-m kb">${esc(p.size)} · ${esc(p.at)} · ${esc(p.by)}</p>
      ${p.st === 'fail' ? `<div class="why"><span class="k">실패 사유</span><p class="t">${esc(p.why)}</p></div>` : ''}
      <div class="pb-a"><button type="button" class="act" data-pb="${p.id}" data-act="cancel">발행 취소</button>
        <button type="button" class="act" data-pb="${p.id}" data-act="see">지도에서 보기</button></div>
    </div>`).join('');
  renderPubCard();
}
$('#pb-list').addEventListener('click', (ev) => {
  const b = ev.target.closest('[data-pb]'); if (!b) return;
  const p = S.pubs.find((x) => x.id === b.dataset.pb); if (!p) return;
  if (b.dataset.act === 'cancel') { S.pubs = S.pubs.filter((x) => x.id !== p.id); if (S.pubSel === p.id) S.pubSel = null; say(`발행 취소 — ${p.file}`); renderPublishing(); return; }
  S.pubSel = p.id; renderPublishing(); syncPlate();
});

function renderPubCard() {
  const card = $('#pbcard');
  if (S.tab !== 'publishing' || !S.pubs.length) { card.hidden = true; return; }
  const sel = S.pubs.find((p) => p.id === S.pubSel);
  const show = sel ? [sel] : [S.pubs.find((p) => p.st === 'run'), S.pubs.find((p) => p.st === 'fail')].filter(Boolean);
  $('#pbcard-k').textContent = `레이어 발행중 · ${S.pubs.length}건`;
  $('#pbcard-s').textContent = `진행 ${S.pubs.filter((p) => p.st === 'run').length} · 실패 ${S.pubs.filter((p) => p.st === 'fail').length}`;
  $('#pbcard-body').innerHTML = show.map((p) => `
    <div class="pbc" data-st="${p.st}">
      <div class="pbc-h"><span class="f">${esc(p.fmt)}</span><span class="s">${PUB_ST[p.st]}</span>
        <span class="t">${esc(p.file)}</span></div>
      ${p.st === 'fail'
    ? `<div class="why"><span class="k">실패 사유</span><p class="t">${esc(p.why)}</p></div>`
    : `${stepsHtml(p.step)}<p class="pb-m kb">${esc(p.size)} · ${esc(p.at)} · ${esc(p.by)}</p>`}
    </div>`).join('');
  $('#pbcard-cancel').dataset.id = show[0] ? show[0].id : '';
  card.hidden = false;
}
$('#pbcard-cancel').addEventListener('click', (ev) => {
  const id = ev.currentTarget.dataset.id; if (!id) return;
  const p = S.pubs.find((x) => x.id === id); if (!p) return;
  S.pubs = S.pubs.filter((x) => x.id !== id); if (S.pubSel === id) S.pubSel = null;
  say(`발행 취소 — ${p.file}`);
  renderPublishing();
});

/* ══ 모달 3종 ══════════════════════════════════════════════════════════ */
let lastFocus = null;
function openModal(sel) {
  lastFocus = document.activeElement;
  $('#scrim').hidden = false;
  $(sel).hidden = false;
  const f = $(sel).querySelector('input,select,textarea,button');
  if (f) f.focus();
}
function closeModal() {
  $('#scrim').hidden = true;
  $$('.modal').forEach((m) => { m.hidden = true; });
  if (lastFocus && lastFocus.focus) lastFocus.focus();
}
$('#scrim').addEventListener('click', closeModal);
document.addEventListener('click', (ev) => { if (ev.target.closest('[data-close]')) closeModal(); });
document.addEventListener('keydown', (ev) => {
  if (ev.key !== 'Escape') return;
  if (!$('#scrim').hidden) { closeModal(); return; }
  if (!$('#detail').hidden) closeDetail();
});

/* 디스크 증량 신청 — 32/64/128/256/512/1024 프리셋 + 직접 입력 + 사유 */
$('#mq-presets').innerHTML = QUOTA_PRESETS.map((g) => `
  <button type="button" class="chip" data-gb="${g}" aria-pressed="${g === S.quotaGb}">${g}</button>`).join('')
  + `<button type="button" class="chip" data-gb="custom" aria-pressed="false">직접 입력</button>`;
$('#mq-presets').addEventListener('click', (ev) => {
  const b = ev.target.closest('[data-gb]'); if (!b) return;
  const v = b.dataset.gb;
  $$('#mq-presets .chip').forEach((c) => c.setAttribute('aria-pressed', String(c === b)));
  $('#mq-custom').hidden = v !== 'custom';
  S.quotaGb = v === 'custom' ? null : Number(v);
  if (v === 'custom') $('#mq-gb').focus();
});
$('#quota-open').addEventListener('click', () => {
  $('#mq-tag').textContent = `MODAL · 잔여 ${DISK.free.toFixed(1)} GB`;
  $('#mq-err').hidden = true;
  openModal('#m-quota');
});
$('#mq-form').addEventListener('submit', (ev) => {
  ev.preventDefault();
  const e = $('#mq-err');
  const gb = S.quotaGb || Number($('#mq-gb').value);
  const why = $('#mq-why').value.trim();
  if (!gb || gb <= 0) { e.hidden = false; e.textContent = '신청 용량을 선택하거나 입력해 주세요.'; return; }
  if (!why) { e.hidden = false; e.textContent = '신청 사유를 입력해 주세요.'; return; }
  closeModal();
  say(`디스크 증량 신청 접수 — ${nf.format(gb)} GB · ${SEED_TAG}`);
});

/* 공유 설정 — 기관명 / 권한명 표 */
let shareId = null;
function openShare(a) {
  shareId = a.id;
  $('#ms-sub').textContent = `${a.name} · ${a.file}`;
  $('#ms-perm tbody').innerHTML = ORGS.map((org, i) => {
    const cur = (a.share.find((s) => s.org === org) || { perm: '권한 없음' }).perm;
    return `<tr><td>${esc(org)}</td><td><select data-org="${i}" aria-label="${esc(org)} 권한명">${
      PERMS.map((p) => `<option${p === cur ? ' selected' : ''}>${esc(p)}</option>`).join('')}</select></td></tr>`;
  }).join('');
  openModal('#m-share');
}
$('#ms-form').addEventListener('submit', (ev) => {
  ev.preventDefault();
  const a = S.arch.find((x) => x.id === shareId);
  if (a) {
    a.share = ORGS.map((org, i) => ({ org, perm: $(`#ms-perm select[data-org="${i}"]`).value }));
    say(`공유 설정 저장 — ${a.name} · ${a.share.map((s) => `${s.org} ${s.perm}`).join(' · ')}`);
  }
  closeModal();
});

/* 세부 정보 — 업로드 카드 */
function openDetailModal(u) {
  $('#md-rows').innerHTML = [
    ['파일명', u.file], ['형식', u.fmt], ['업로드 상태', UP_ST[u.st]],
    ['진행률', `${u.pct}%`], ['크기', u.size], ['자료', `원본 목업 시드 · ${SEED_TAG}`],
  ].map(([k, v]) => `<div class="dt-r"><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join('');
  openModal('#m-detail');
}

/* ══ 판 ════════════════════════════════════════════════════════════════ */
$('#attrib').textContent = ATTRIB;
$('#foot-links').innerHTML = FOOT_LINKS.map((t) => `<span class="kb">${esc(t)}</span>`).join('')
  + `<span class="kb fam">Family Site<svg width="8" height="5" viewBox="0 0 9 6" fill="none" stroke="#686868" stroke-width="1" aria-hidden="true"><path d="M.6 1 4.5 4.8 8.4 1"/></svg></span>`;
$('#foot-addr').textContent = FOOT_ADDR;

let map = null, bk = null;
const OWN = {
  upload: '업로드가 끝나면 이 범위가 도엽 목록에 들어간다 — 좌표계가 없는 파일은 파선으로 남는다',
  archive: '아카이브 → 발행 → 지도. 원본 4탭의 동작을 한 화면에서 잇는다',
  manage: '업로드 완료본에 좌표계·기준일을 붙여야 지도 레이어가 된다',
  publishing: '발행 4단계 중 어디서 멈췄는지 판이 아니라 원장이 말한다 — 실패는 지우지 않는다',
};

function syncPlate() {
  $('#own').textContent = OWN[S.tab] || '';
  $('#detail').hidden = !(S.tab === 'archive' && S.archSel);
  $('#pubform').hidden = !(S.tab === 'manage' && S.doneSel);
  if (S.tab !== 'publishing') $('#pbcard').hidden = true; else renderPubCard();

  if (S.tab === 'upload') {
    $('#fresh-t').textContent = `보관 도엽 ${PLATE_HEAD.sheets} · 촬영 ${PLATE_HEAD.epochs} 시점 · 업로드 대상 범위 표시`;
    $('#fresh-s').textContent = PLATE_HEAD.crs;
  } else {
    const a = S.arch.find((x) => x.id === S.archSel);
    $('#fresh-t').textContent = a ? `선택 · ${a.name}` : `보관 도엽 ${PLATE_HEAD.sheets} · 촬영 ${PLATE_HEAD.epochs} 시점`;
    $('#fresh-s').textContent = a ? '지도가 지금 보는 범위' : PLATE_HEAD.crs;
  }
  if (!map || !bk) return;

  const pad = padFor({
    drawer: !$('#detail').hidden,
    side: !$('#pbcard').hidden,
    form: !$('#pubform').hidden,
  });
  const wide = padWide();
  if (S.tab === 'upload') {
    showOrtho(map, null);
    bk.set(uploadItems());
    frame(map, KOREA_SW, wide, { maxZoom: 9 });
    return;
  }
  const a = S.arch.find((x) => x.id === S.archSel);
  if (a) {
    const im = IMG.find((i) => i.id === a.imagery);
    // 좌표계가 없는 자산은 판에 세우지 않는다 — 없는 것을 그리지 않는 것이 정직성이다.
    if (im) {
      // 마스터처럼 판 전체가 그 정사영상이다 — 계기는 사진 위에 얹힌다, 사진을 밀어내지 않는다.
      showOrtho(map, im);
      bk.set([lockItem(a, im.bounds)]);
      frame(map, im.bounds, { left: 56, top: 84, right: 56, bottom: 100 }, { maxZoom: 17.2 });
      return;
    }
    showOrtho(map, null);
    bk.clear(); frame(map, KOREA_SW, wide, { maxZoom: 9 });
    say(`${a.name} — 좌표계가 없어 판에 세우지 않습니다`);
    return;
  }
  showOrtho(map, null);
  bk.set(uploadItems().filter((x) => x.kind === 'measured'));
  frame(map, KOREA_SW, S.tab === 'upload' ? wide : pad, { maxZoom: 9 });
}

$('#allmap').addEventListener('click', () => {
  S.archSel = null; S.doneSel = null; S.pubSel = null;
  if (S.tab === 'archive') renderArchive();
  if (S.tab === 'manage') renderDone();
  syncPlate();
  say('전체 지도로');
});

/* ══ 기동 ══════════════════════════════════════════════════════════════ */
setTab(tabFromUrl(), false);
document.documentElement.dataset.ds = 'ready';

mountPlate($('#plate')).then((m) => {
  map = m;
  bk = new Brackets(m, $('#ex-layer'));
  // 타일이 다 앉은 순간을 밖에서도 알 수 있게 한다(스크린샷·검증용).
  m.on('idle', () => { document.documentElement.dataset.plate = 'idle'; });
  m.on('movestart', () => { document.documentElement.dataset.plate = 'moving'; });
  syncPlate();
  document.documentElement.dataset.plate = 'ready';
}).catch(() => {
  // WebGL 이 없는 환경(CI 등)에서도 원장은 그대로 동작한다.
  document.documentElement.dataset.plate = 'off';
});
