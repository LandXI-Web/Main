/* new.js — 새 프로젝트 = 한 창(원칙 220 · 10-12 사용자 "프로젝트 명 쓰고. 설명(필수 아님)란 있고. 영상 업로드, 구성원 초대를 시작해서
   바로 학습데이터 구축 화면으로 전환할 수 있는거 아닌가. 너무 불필요한 스텝을 늘린거 같다." · 예전 한 장 시안 design-r10/lx-staff/mock/a-new.html).
   한 창에서 채우고 '만들기' 한 번 → 바로 그 프로젝트 '학습데이터 구축' 화면으로(프로젝트 한 장 · 데이터 올리기 화면을 거치지 않는다).
     이름(필수) · 설명(선택) · ('무엇을'은 묻지 않는다 — 원칙 225 · 찾는 것은 학습데이터 구축에서 올린 클래스로 저절로 · 서버 view 'finds') ·
     영상 — 파일 올리기(키트 조각 올리기 · 여러 파일 · 진행 막대 — 데이터 올리기와 같은 길) 또는 공유 데이터에서 고르기 ·
     대상지 — 영상 자리에서 저절로(화면이 고르지 않는다) · 영상 없이 만들 때만 시군구 · 해외 지역을 고른다 ·
     구성원 — 가입 승인된 LX 계정을 이름 · 메일 일부로 찾기(서버 GET /projects/people?q= · 나 자신 · 잠긴 · 기관 계정 없음) · 여러 명.
   10-13 다시(원칙 230 · 231): 칸 이름만(설명 · 안내 문구 없음) · 창 크기 고정(처음부터 크게 · 안쪽만 스크롤 — 고르기를 열거나 목록이 길어져도 창 · 칸 자리 그대로).
   올린 파일은 '만들기' 때 따로 열리는 올리기 창(kit/uploads.js · 원칙 326)에 맡긴다 — 화면을 옮겨도 계속 올라가고, 다 올리면 등록해 그 영상 자리로 대상지가 정해진다. 관리자 승인 없음 · 프로젝트장 = 만든 직원(서버 POST /projects). */
import { h, api, API, session } from '../kit/util.js';
import { regionPicker } from '../kit/region.js';
import { toast } from '../kit/toast.js';
import { empty } from '../kit/empty.js';
import { panes } from '../kit/panes.js';
import { stageHref, ensureCss } from './context.js';

let open = null;
let rcssOn = false;
const ensureRangeCss = () => { if (rcssOn) return; rcssOn = true; document.head.append(h('link', { rel: 'stylesheet', href: new URL('./range.css', import.meta.url).href })); };
const PICK_PER = 6;
const thumbs = new Map();
function authPic(path) {
  if (!thumbs.has(path)) {
    thumbs.set(path, (async () => {
      const s = session.get();
      const r = await fetch(API.prefix + path, { headers: s ? { authorization: 'Bearer ' + s.token } : {} });
      if (!r.ok || r.status === 204) return null;
      const b = await r.blob();
      return b.size ? URL.createObjectURL(b) : null;
    })().catch(() => null));
  }
  return thumbs.get(path);
}

export function openNewProject({ onMade } = {}) {
  if (open) return open;
  ensureCss();
  const back = document.activeElement;
  const dim = h('div.t-dim.lxp-dim');
  const field = (label, ...kids) => h('div.lxp-f', {}, h('p.lxp-l', { text: label }), ...kids);

  /* ── 이름 · 설명 ── */
  const nameIn = h('input.t-input', { type: 'text', name: 'name', maxlength: '60', autocomplete: 'off', 'aria-label': '이름' });
  const descIn = h('textarea.t-input.lxp-desc', { name: 'description', maxlength: '300', rows: '2', 'aria-label': '설명' });

  /* ── 영상 — 파일 올리기 · 공유 데이터에서 고르기 ── */
  const tabUp = h('button.lxp-vt', { type: 'button', role: 'tab', 'aria-selected': 'true', text: '파일 올리기' });
  const tabPick = h('button.lxp-vt', { type: 'button', role: 'tab', 'aria-selected': 'false', text: '공유 데이터에서 고르기' });
  const upBox = h('div.lxp-up');
  const pickBox = h('div.lxp-pk', { hidden: true });
  const vtabs = h('div.lxp-vtabs', { role: 'tablist', 'aria-label': '영상' }, tabUp, tabPick);
  const showTab = (pick) => { tabUp.setAttribute('aria-selected', String(!pick)); tabPick.setAttribute('aria-selected', String(pick)); upBox.hidden = pick; pickBox.hidden = !pick; if (pick) loadPick(); };
  tabUp.addEventListener('click', () => showTab(false));
  tabPick.addEventListener('click', () => showTab(true));

  /* 파일 올리기 = 올리기 한 벌(kit/uploads.js · 원칙 326) — 여기서는 고르기만, '만들기'를 누르면 따로 열리는 올리기 창이 올리고
     다 올리면 그 프로젝트에 영상을 잇는다(대상지 = 영상 자리). 화면을 옮겨도 계속 올라간다(예전 carry.js 보관함 이어 올리기 대신). */
  let hp = null, U = null;
  import('../kit/uploads.js').then((m) => { U = m; return m.uploadPicker(upBox, { hold: true, onPicks: () => { drawWhere(); ready(); } }); }).then((x) => { hp = x; })
    .catch(() => { upBox.textContent = '올리기 칸을 열지 못했습니다'; });
  const upFiles = () => (hp ? hp.picks() : []);

  /* 공유 데이터 영상 — 서버 GET /projects/imagery(이름 · 지역 · 연도 · 종류 · 썸네일) · 찾기 · 6장씩 · 여러 장 고르기 */
  const picked = new Map();
  let pickAll = null, pickPage = 1;
  const pickQ = h('input.t-input.lxp-pk-q', { type: 'search', placeholder: '영상 이름 · 지역 · 연도', 'aria-label': '영상 찾기', autocomplete: 'off' });
  const pickGrid = h('div.lxp-pk-g', { role: 'group', 'aria-label': '공유 데이터' });
  const pickNav = h('div.lxp-pk-n');
  pickBox.append(pickQ, pickGrid, pickNav);
  pickQ.addEventListener('input', () => { pickPage = 1; drawPick(); });
  async function loadPick() {
    if (pickAll) return;
    { const w = h('div'); pickGrid.replaceChildren(w); empty(w, { kind: 'loading', compact: true }); }   // 첫인상-3: 칸 글 대신 가운데 하나
    try { pickAll = (await api('/projects/imagery')).items || []; } catch { pickAll = null; pickGrid.replaceChildren(h('p.lxp-pk-w', {}, '영상 목록을 불러오지 못했습니다 ', h('button.lxp-link', { type: 'button', text: '다시 시도', onclick: () => loadPick() }))); return; }
    drawPick();
    import('../kit/imagery-viewer.js').then((m) => m.warmImageryViewer(pickAll.slice(0, 2).map((x) => x.id))).catch(() => null);   // 크게 보기 미리 준비
  }
  function drawPick() {
    const s = pickQ.value.replace(/\s+/g, '');
    const rows = (pickAll || []).filter((x) => !s || [x.name, x.region, x.year, x.kind].some((v) => String(v ?? '').replace(/\s+/g, '').includes(s)));
    const pages = Math.max(1, Math.ceil(rows.length / PICK_PER));
    pickPage = Math.min(pickPage, pages);
    const from = (pickPage - 1) * PICK_PER;
    pickGrid.replaceChildren(...(rows.length ? rows.slice(from, from + PICK_PER).map((x) => {
      const im = h('span.lxp-pk-im');
      authPic(x.thumb).then((u) => { if (u) im.append(h('img', { src: u, alt: '', decoding: 'async' })); else im.classList.add('is-blank'); });
      const b = h('button.lxp-pk-c', { type: 'button', 'aria-pressed': String(picked.has(x.id)), title: x.name },
        im, h('b', { text: x.name }), h('small', { text: [x.region, x.year, x.kind].filter(Boolean).join(' · ') }));
      b.addEventListener('click', () => { if (picked.has(x.id)) picked.delete(x.id); else picked.set(x.id, x); b.setAttribute('aria-pressed', String(picked.has(x.id))); drawWhere(); ready(); });
      /* 크게 보기(원칙 295) — 카드 왼쪽 위 돋보기 · 그림을 두 번 누르기 · 지금 걸러진 목록 안에서 앞 · 다음 */
      const big = () => import('../kit/imagery-viewer.js').then((m) => m.openImageryViewer({ items: rows, index: rows.indexOf(x), picked: (it) => picked.has(it.id), onPick: (it) => { const r = pickAll.find((v) => v.id === it.id); if (r && !picked.has(r.id)) { picked.set(r.id, r); drawPick(); drawWhere(); ready(); } } })).catch(() => toast('크게 보기를 열지 못했습니다'));
      im.addEventListener('dblclick', (e) => { e.preventDefault(); big(); });
      return h('div.lxp-pk-cw', {}, b, h('button.lxp-pk-big', { type: 'button', 'aria-label': `${x.name} 크게 보기`, title: '크게 보기', onclick: big }, h('span', { 'aria-hidden': 'true', text: '⤢' })));
    }) : [h('p.lxp-pk-w', { text: '맞는 영상이 없습니다' })]));
    pickNav.replaceChildren(h('span', { text: picked.size ? `${picked.size}장 고름` : `${rows.length}장` }),
      pages > 1 ? h('span.lxp-pk-pg', {},
        h('button.lxp-link', { type: 'button', text: '‹ 앞', disabled: pickPage <= 1 || undefined, onclick: () => { pickPage--; drawPick(); } }),
        h('small.num', { text: `${pickPage} / ${pages}` }),
        h('button.lxp-link', { type: 'button', text: '다음 ›', disabled: pickPage >= pages || undefined, onclick: () => { pickPage++; drawPick(); } })) : '');
  }

  /* ── 대상지 — 영상이 있으면 영상 자리에서 · 없을 때만 고른다 ── */
  const whereLine = h('p.lxp-where', { 'aria-live': 'polite' });
  const regions = [];
  const regBox = h('div.lxp-regbox');
  const regPicked = h('div.lxp-picked');
  const pickEl = h('div.lxp-pick');
  const farBtn = h('button.t-btn.t-btn--text.lxp-far-b', { type: 'button', text: '해외 지역' });
  const far = h('div.lxp-chips.lxp-far', { hidden: true, role: 'group', 'aria-label': '해외 지역' });
  /* 10-22 원칙 308(REMAINING 4-4 ②) — 접어 두고 펼치기: '브이월드에서 영상 가져오기'(올리거나 고른 영상 없이 브이월드 영상으로 대상지를 정함) · 둘째 줄 '분석 범위만 정하기' */
  const regIn = h('div.lxp-reg-in', { hidden: true });
  const regTg = h('button.t-btn.t-btn--text.lxp-reg-tg', { type: 'button', 'aria-expanded': 'false' },
    h('b', { text: '브이월드에서 영상 가져오기' }), h('small', { text: '분석 범위만 정하기(시군구 · 읍면동)' }));
  regTg.addEventListener('click', () => { regIn.hidden = !regIn.hidden; regTg.setAttribute('aria-expanded', String(!regIn.hidden)); if (!regIn.hidden) regIn.querySelector('input')?.focus(); });
  /* 대상지 정하는 방식 셋(10-22 CHANGE-DEMO P0-3 · G3 · G7) — 행정구역 · 구역선 파일(+버퍼 m) · 필지(PNU) 목록. 구역선 · 필지는 서버가 범위(EPSG:5179)로 저장하고
     그 범위의 국토지리정보원 영상 연도를 알려 준다(연도 고르기 · 여럿). 범위 · 연도는 '만들기' 때 이 프로젝트에 묶인다(POST /change/ranges/{id}/project). */
  ensureRangeCss();
  const RG = { mode: 'region', rng: null, yrs: new Set(), seq: 0 };
  const rmTab = (k, label) => h('button.lxp-vt', { type: 'button', role: 'tab', 'aria-selected': String(k === 'region'), text: label, dataset: { k } });
  const rmTabs = h('div.lxp-vtabs.lxp-rm', { role: 'tablist', 'aria-label': '대상지 정하는 방식' }, rmTab('region', '행정구역'), rmTab('line', '구역선 파일'), rmTab('pnu', '필지(PNU) 목록'));
  const bufIn = h('input.t-input.lxp-buf', { type: 'number', min: '0', max: '1000', step: '10', value: '50', 'aria-label': '버퍼(m)' });
  const lineIn = h('input.lxp-file', { type: 'file', accept: '.geojson,.json,.zip,.gpkg', 'aria-label': '구역선 파일' });
  const pnuTa = h('textarea.t-input.lxp-pnu', { rows: '3', placeholder: 'PNU 19자리를 줄마다 붙여 넣기', 'aria-label': '필지(PNU) 목록' });
  const pnuGo = h('button.t-btn.t-btn--2.lxp-pnu-go', { type: 'button', text: '필지 찾기' });
  const rngLine = h('p.lxp-rng-s', { 'aria-live': 'polite', hidden: true });
  const yrBox = h('div.lxp-chips.lxp-yrs', { role: 'group', 'aria-label': '영상 연도', hidden: true });
  const lineBox = h('div.lxp-rng', { hidden: true }, h('label.lxp-file-l', {}, h('span', { text: '구역선 파일(geojson · shp 압축 · gpkg)' }), lineIn));
  const pnuBox = h('div.lxp-rng', { hidden: true }, pnuTa, h('div.lxp-pnu-r', {}, h('label.lxp-file-l', {}, h('span', { text: '또는 목록 파일(txt · csv)' }), h('input.lxp-file', { type: 'file', accept: '.txt,.csv', 'aria-label': '필지 목록 파일', onchange: async (e) => { const f = e.target.files?.[0]; if (f) { pnuTa.value = await f.text(); makeRange(); } } })), pnuGo));
  const bufRow = h('label.lxp-buf-r', { hidden: true }, h('span', { text: '버퍼' }), bufIn, h('span', { text: 'm' }));
  // (10-23 원칙 329) '진행 경로 — 정식 서비스 모델로 바로 분석' 고르기는 뺐다: 학습된 모델로 하는 분석은 분석 서비스 › 국토 변화 카드에서. 프로젝트는 새 모델을 만드는 곳.
  const drawYears = () => {
    const ys = RG.rng?.imagery_years || [];
    yrBox.hidden = !ys.length;
    yrBox.replaceChildren(h('span.lxp-yrs-l', { text: '국토지리정보원 영상 연도' }), ...ys.map((y) => {
      const b = h('button.t-chip.lxp-chip', { type: 'button', 'aria-pressed': String(RG.yrs.has(y.year)), text: `${y.year}년` });
      b.addEventListener('click', () => { if (RG.yrs.has(y.year)) RG.yrs.delete(y.year); else RG.yrs.add(y.year); b.setAttribute('aria-pressed', String(RG.yrs.has(y.year))); ready(); });
      return b;
    }));
  };
  async function makeRange() {
    const my = ++RG.seq;
    RG.rng = null; drawYears(); ready();
    const buf = Math.max(0, Math.min(1000, +bufIn.value || 0));
    rngLine.hidden = false; rngLine.textContent = '범위를 만드는 중';
    try {
      let r;
      if (RG.mode === 'line') {
        const f = lineIn.files?.[0]; if (!f) { rngLine.hidden = true; return; }
        const fd = new FormData(); fd.append('file', f); fd.append('buffer_m', String(buf)); fd.append('name', f.name.replace(/\.[^.]+$/, ''));
        const s = session.get();
        const res = await fetch(API.prefix + '/change/ranges', { method: 'POST', body: fd, headers: s ? { authorization: 'Bearer ' + s.token } : {} });
        r = await res.json(); if (!res.ok) throw new Error(r?.error?.message || '범위를 만들지 못했습니다');
      } else {
        if (!pnuTa.value.trim()) { rngLine.hidden = true; return; }
        r = await api('/change/ranges', { method: 'POST', body: { name: '필지 목록', buffer_m: buf, pnus: pnuTa.value } });
      }
      if (my !== RG.seq) return;
      RG.rng = r;
      const ys = (r.imagery_years || []).map((y) => y.year);
      RG.yrs = new Set(ys.length >= 2 ? [ys[0], ys[ys.length - 1]] : ys);
      rngLine.textContent = `${r.kind_label} · 버퍼 ${r.buffer} · 범위 ${Number(r.area?.value ?? 0).toLocaleString('ko-KR', { maximumFractionDigits: 2 })}㎢`;
      drawYears(); ready();
    } catch (e) { if (my === RG.seq) { rngLine.textContent = e.message || '범위를 만들지 못했습니다'; } }
  }
  lineIn.addEventListener('change', makeRange);
  pnuGo.addEventListener('click', makeRange);
  bufIn.addEventListener('change', () => { if (RG.mode !== 'region') makeRange(); });
  rmTabs.addEventListener('click', (e) => {
    const k = e.target.closest('.lxp-vt')?.dataset.k; if (!k || k === RG.mode) return;
    RG.mode = k; RG.rng = null; RG.seq++;
    rmTabs.querySelectorAll('.lxp-vt').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.k === k)));
    const reg = k === 'region';
    for (const el of [regPicked, pickEl, far]) el.hidden = !reg || (el === far && far.hidden) || (el === regPicked && !regions.length);
    regIn.querySelector('.lxp-far-row').hidden = !reg;
    lineBox.hidden = k !== 'line'; pnuBox.hidden = k !== 'pnu'; bufRow.hidden = reg; rngLine.hidden = true; drawYears(); ready();
  });
  regIn.append(rmTabs, regPicked, pickEl, h('div.lxp-far-row', {}, farBtn), far, lineBox, pnuBox, bufRow, rngLine, yrBox);
  regBox.append(regTg, regIn);
  const drawRegs = () => {
    regPicked.replaceChildren(...regions.map((r) => {
      const x = h('button.t-chip.lxp-reg', { type: 'button', 'aria-label': `${r.name} 빼기`, title: r.full || r.name }, h('span', { text: r.name }), h('i', { 'aria-hidden': 'true', text: '×' }));
      x.addEventListener('click', () => { regions.splice(regions.indexOf(r), 1); drawRegs(); ready(); far.querySelectorAll('.lxp-chip').forEach((c) => c.setAttribute('aria-pressed', String(regions.some((g) => g.code === c.dataset.id)))); });
      return x;
    }));
    regPicked.hidden = !regions.length;
    if (regions.length && regIn.hidden) { regIn.hidden = false; regTg.setAttribute('aria-expanded', 'true'); }
  };
  const addReg = (r) => { if (!r || regions.some((g) => g.code === r.code)) return; regions.push(r); drawRegs(); ready(); };
  regionPicker(pickEl, { onPick: (r) => { addReg({ code: r.sgg_cd, name: r.name, full: r.full }); const i = pickEl.querySelector('input'); if (i) i.value = ''; } })
    .then((p) => { p.input.setAttribute('placeholder', '시군구 이름을 검색'); });
  farBtn.addEventListener('click', async () => {
    far.hidden = !far.hidden;
    if (far.hidden || far.childElementCount) return;
    const j = await api('/projects/places').catch(() => null);
    for (const g of j?.items || []) {
      const b = h('button.t-chip.lxp-chip', { type: 'button', 'aria-pressed': 'false', text: g.name, dataset: { id: g.code } });
      b.addEventListener('click', () => {
        const on = regions.find((x) => x.code === g.code);
        if (on) { regions.splice(regions.indexOf(on), 1); drawRegs(); ready(); } else addReg({ code: g.code, name: g.name, full: g.full, abroad: true });
        b.setAttribute('aria-pressed', String(!on));
      });
      far.append(b);
    }
  });
  drawRegs();
  function drawWhere() {
    const pk = [...new Set([...picked.values()].map((x) => x.region).filter(Boolean))];
    const ups = upFiles().length;
    regBox.hidden = !!(picked.size || ups);
    whereLine.textContent = pk.length ? `대상지 ${pk.join(' · ')}` : picked.size || ups ? '' : '대상지';
    whereLine.hidden = !whereLine.textContent;
  }

  /* ── 구성원 — 가입 승인된 LX 계정(이름 · 메일 일부) · 여러 명 · 나 자신 없음 ── */
  const mem = new Map();
  const memChips = h('div.lxp-picked');
  const memIn = h('input.t-input', { type: 'search', placeholder: '이름 · 메일', 'aria-label': '구성원 찾기', autocomplete: 'off' });
  const memList = h('ul.lxp-mem-l', { role: 'listbox', hidden: true });
  const drawMem = () => {
    memChips.replaceChildren(...[...mem.values()].map((u) => {
      const x = h('button.t-chip.lxp-reg', { type: 'button', 'aria-label': `${u.name} 빼기` }, h('span', { text: u.name }), h('i', { 'aria-hidden': 'true', text: '×' }));
      x.addEventListener('click', () => { mem.delete(u.id); drawMem(); });
      return x;
    }));
    memChips.hidden = !mem.size;
  };
  let memSeq = 0, memT = 0;
  async function drawMemList() {
    const my = ++memSeq;
    const j = await api('/projects/people?' + new URLSearchParams({ q: memIn.value.trim() })).catch(() => null);
    if (my !== memSeq) return;
    const rows = (j?.items || []).filter((u) => !mem.has(u.id)).slice(0, 6);
    memList.replaceChildren(...(rows.length ? rows.map((u) => h('li', { role: 'option' },
      h('button', { type: 'button', onclick: () => { mem.set(u.id, u); memIn.value = ''; drawMem(); drawMemList(); memIn.focus(); } },
        h('b', { text: u.name }), h('small', { text: u.role_label })))) : [h('li.lxp-mem-none', { text: j ? '찾는 계정이 없습니다' : '불러오지 못했습니다' })]));
    memList.hidden = false;
  }
  memIn.addEventListener('focus', drawMemList);
  memIn.addEventListener('input', () => { clearTimeout(memT); memT = setTimeout(drawMemList, 200); });
  memIn.addEventListener('blur', () => setTimeout(() => { if (!memList.contains(document.activeElement)) memList.hidden = true; }, 150));
  drawMem();

  /* ── 창 ── */
  const err = h('p.lxp-err', { role: 'alert', hidden: true });
  const go = h('button.t-btn', { type: 'button', text: '만들기', disabled: true });
  const cancel = h('button.t-btn.t-btn--text.lxp-cancel', { type: 'button', text: '취소' });
  const box = h('div.t-modal.lxp-new.lxp-new--one', { role: 'dialog', 'aria-modal': 'true', 'aria-label': '새 프로젝트' },
    h('h2.t-h4', { text: '새 프로젝트' }),
    h('div.lxp-new-g', {},
      h('div.lxp-new-c', {},
        field('이름', nameIn),
        field('설명', descIn),
        field('구성원', memChips, h('div.lxp-mem', {}, memIn, memList))),
      h('div.lxp-new-c', {},
        field('영상', vtabs, upBox, pickBox, whereLine, regBox))),
    err,
    h('div.lxp-act', {}, go, cancel));
  document.body.append(dim, box);
  { const c0 = box.querySelector('.lxp-new-c'); panes(c0, { edge: 'right', key: 'new', cssVar: '--lxp-new-l', min: 300, max: 640, otherMin: 380, below: 1100, collapse: false }); }   // 창 안 두 칸 크기 조절(원칙 263 · 창 크기는 그대로)
  requestAnimationFrame(() => { dim.classList.add('is-in'); box.classList.add('is-in'); });
  drawWhere();

  function ready() {
    const where = picked.size || upFiles().length || (RG.mode === 'region' ? regions.length : (RG.rng && RG.yrs.size));
    go.disabled = !(nameIn.value.trim() && where);
    err.hidden = true;
  }
  nameIn.addEventListener('input', ready);

  go.addEventListener('click', async () => {
    go.disabled = true; err.hidden = true;
    const files = upFiles();
    if (files.length && U && !U.hostAlive()) U.openHost();     // 팝업은 누름 안에서만 열린다 — 만들기 전에 올리기 창부터
    const body = { name: nameIn.value.trim(), description: descIn.value.trim() || undefined,
      imagery: [...picked.keys()], members: [...mem.keys()],
      regions: picked.size || files.length ? [] : RG.mode !== 'region' && RG.rng ? RG.rng.sgg : regions.map((r) => r.code) };
    const rng = !picked.size && !files.length && RG.mode !== 'region' ? RG.rng : null;
    try {
      if (files.length) body.from_upload = true;          // 대상지는 영상이 다 올라가 등록되면(올리기 창이 프로젝트에 잇는다)
      go.textContent = '만드는 중';
      const pr = await api('/projects', { method: 'POST', body });
      if (files.length) {
        go.textContent = '올리기 창에 맡기는 중';
        const ok = await U.startUploads(files, { kind: 'project', pid: pr.id, name: body.name, href: new URL(stageHref(pr, 'label'), location.href).pathname + new URL(stageHref(pr, 'label'), location.href).search });
        if (!ok) toast('영상은 맡기지 못했습니다 — 프로젝트의 데이터 올리기에서 다시 올려 주세요');
        hp?.clear();
      }
      if (rng) {                                          // 구역선 · 필지 범위 — 이 프로젝트에 묶고 두 해 영상이 보이는 지도 서비스로
        await api(`/change/ranges/${encodeURIComponent(rng.id)}/project`, { method: 'POST', body: { project_id: pr.id, years: [...RG.yrs].sort(), name: body.name } });
        toast('프로젝트를 만들었습니다');
        close();
        location.href = new URL('../lx-map/?' + new URLSearchParams({ project: pr.id }), import.meta.url).href.replace(/\/lx-project\/\.\.\//, '/');
        return;
      }
      toast('프로젝트를 만들었습니다');
      close();
      if (onMade) onMade(pr); else location.href = stageHref(pr, 'label');
    } catch (e) {
      go.textContent = '만들기';
      err.textContent = e.message && !/^[a-z_]+$/.test(e.message) ? e.message : '만들지 못했습니다 · 다시 눌러 주세요';
      err.hidden = false; go.disabled = false;
    }
  });
  function close() {
    removeEventListener('keydown', esc, true);
    dim.remove(); box.remove(); open = null;
    back?.focus?.();
  }
  function esc(e) { if (e.key === 'Escape' && !document.querySelector('.k-iv') && !e.target.closest?.('.k-region, .lxp-mem')) { e.preventDefault(); close(); } }
  addEventListener('keydown', esc, true);
  cancel.addEventListener('click', close);
  dim.addEventListener('click', close);
  setTimeout(() => { if (!box.contains(document.activeElement)) nameIn.focus(); }, 60);   // 이미 다른 칸을 눌렀으면 빼앗지 않는다
  open = { close, el: box };
  return open;
}
