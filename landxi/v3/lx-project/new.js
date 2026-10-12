/* new.js — 새 프로젝트 = 한 창(원칙 220 · 10-12 사용자 "프로젝트 명 쓰고. 설명(필수 아님)란 있고. 영상 업로드, 구성원 초대를 시작해서
   바로 학습데이터 구축 화면으로 전환할 수 있는거 아닌가. 너무 불필요한 스텝을 늘린거 같다." · 예전 한 장 시안 design-r10/lx-staff/mock/a-new.html).
   한 창에서 채우고 '만들기' 한 번 → 바로 그 프로젝트 '학습데이터 구축' 화면으로(프로젝트 한 장 · 데이터 올리기 화면을 거치지 않는다).
     이름(필수) · 설명(선택) · 무엇을(업무 하나 — 학습 · 결과 확인 규칙이 쓰는 값이라 남김 · 칩 한 줄) ·
     영상 — 파일 올리기(키트 조각 올리기 · 여러 파일 · 진행 막대 — 데이터 올리기와 같은 길) 또는 데이터하우스 영상에서 고르기 ·
     대상지 — 영상 자리에서 저절로(화면이 고르지 않는다) · 영상 없이 만들 때만 시군구 · 해외 지역을 고른다 ·
     구성원 — LX 계정 찾기 · 여러 명.
   '만들기' 때 아직 올라가는 파일이 있으면 이 브라우저 보관함에 맡기고 넘어간다 — 단계 화면 위 한 줄에서 이어 올리고, 등록되면 대상지가 정해진다(carry.js).
   다 올라간 뒤면 바로 등록해 그 영상 자리로 대상지를 정하고 만든다. 관리자 승인 없음 · 프로젝트장 = 만든 직원(서버 POST /projects). */
import { h, api, API, session } from '../kit/util.js';
import { regionPicker } from '../kit/region.js';
import { toast } from '../kit/toast.js';
import { uploadQueue } from '../kit/dropzone.js';
import { TASKS } from '../lx-console/matrix.js';
import { stageHref, ensureCss } from './context.js';

let open = null;
const UPLOADS = '/catalog/imagery/uploads';
const FALLBACK = { raster: ['tif', 'tiff', 'jpg', 'jpeg', 'jp2', 'j2k', 'ecw', 'img'], sidecar: ['tfw', 'tifw', 'jgw', 'jpgw', 'jpw', 'j2w', 'wld', 'eww', 'prj', 'aux.xml', 'ovr'] };
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
  const field = (label, sub, ...kids) => h('div.lxp-f', {}, h('p.lxp-l', {}, label, sub ? h('small', { text: sub }) : null), ...kids);

  /* ── 이름 · 설명 ── */
  const nameIn = h('input.t-input', { type: 'text', name: 'name', maxlength: '60', autocomplete: 'off', 'aria-label': '이름', placeholder: '예: 비닐하우스 실태조사 2026' });
  const descIn = h('textarea.t-input.lxp-desc', { name: 'description', maxlength: '300', rows: '2', 'aria-label': '설명', placeholder: '무엇을 왜 하는지 한두 줄' });

  /* ── 무엇을(업무 하나) ── */
  const chips = h('div.lxp-chips', { role: 'group', 'aria-label': '무엇을' });
  const own = h('input.t-input.lxp-own', { type: 'text', maxlength: '40', autocomplete: 'off', 'aria-label': '업무 · 탐지 대상 직접 입력', placeholder: '업무 · 탐지 대상', hidden: true });
  let task = null, taskId = null;
  for (const t of [...TASKS.map((x) => ({ id: x.id, name: x.name })), { id: '', name: '직접 입력' }]) {
    const b = h('button.t-chip.lxp-chip', { type: 'button', 'aria-pressed': 'false', text: t.name, dataset: { id: t.id } });
    b.addEventListener('click', () => {
      chips.querySelectorAll('.lxp-chip').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      own.hidden = t.id !== '';
      if (t.id) { task = t.name; taskId = t.id; } else { task = own.value.trim() || null; taskId = null; own.focus(); }
      ready();
    });
    chips.append(b);
  }
  own.addEventListener('input', () => { task = own.value.trim() || null; ready(); });

  /* ── 영상 — 파일 올리기 · 데이터하우스에서 고르기 ── */
  const tabUp = h('button.lxp-vt', { type: 'button', role: 'tab', 'aria-selected': 'true', text: '파일 올리기' });
  const tabPick = h('button.lxp-vt', { type: 'button', role: 'tab', 'aria-selected': 'false', text: '데이터하우스에서 고르기' });
  const upBox = h('div.lxp-up');
  const pickBox = h('div.lxp-pk', { hidden: true });
  const vtabs = h('div.lxp-vtabs', { role: 'tablist', 'aria-label': '영상' }, tabUp, tabPick);
  const showTab = (pick) => { tabUp.setAttribute('aria-selected', String(!pick)); tabPick.setAttribute('aria-selected', String(pick)); upBox.hidden = pick; pickBox.hidden = !pick; if (pick) loadPick(); };
  tabUp.addEventListener('click', () => showTab(false));
  tabPick.addEventListener('click', () => showTab(true));

  let q = null, draft = null;
  api(UPLOADS + '/formats').catch(() => FALLBACK).then((f) => {
    q = uploadQueue(upBox, {
      base: UPLOADS,
      fields: () => ({ draft_id: draft || undefined }),
      allow: [...(f.raster || FALLBACK.raster), ...(f.sidecar || FALLBACK.sidecar)],
      max: f.limit?.size || 20e9,
      title: '영상 파일을 끌어 놓거나 눌러 고르세요',
      kinds: ['여러 장도 한 번에 · 위치 파일(TFW 등)은 함께'],
      onStart: (s) => { if (s.draft_id) draft = s.draft_id; },
      onChange: () => { drawWhere(); ready(); },
    });
  });
  const upFiles = () => (q ? q.items().filter((i) => !['bad', 'cancel'].includes(i.state)) : []);

  /* 데이터하우스 영상 — 서버 GET /projects/imagery(이름 · 지역 · 연도 · 종류 · 썸네일) · 찾기 · 6장씩 · 여러 장 고르기 */
  const picked = new Map();
  let pickAll = null, pickPage = 1;
  const pickQ = h('input.t-input.lxp-pk-q', { type: 'search', placeholder: '영상 이름 · 지역 · 연도', 'aria-label': '영상 찾기', autocomplete: 'off' });
  const pickGrid = h('div.lxp-pk-g', { role: 'group', 'aria-label': '데이터하우스 영상' });
  const pickNav = h('div.lxp-pk-n');
  pickBox.append(pickQ, pickGrid, pickNav);
  pickQ.addEventListener('input', () => { pickPage = 1; drawPick(); });
  async function loadPick() {
    if (pickAll) return;
    pickGrid.replaceChildren(h('p.lxp-pk-w', { text: '불러오는 중' }));
    try { pickAll = (await api('/projects/imagery')).items || []; } catch { pickAll = null; pickGrid.replaceChildren(h('p.lxp-pk-w', {}, '영상 목록을 불러오지 못했습니다 ', h('button.lxp-link', { type: 'button', text: '다시 시도', onclick: () => loadPick() }))); return; }
    drawPick();
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
      return b;
    }) : [h('p.lxp-pk-w', { text: '맞는 영상이 없습니다' })]));
    pickNav.replaceChildren(h('span', { text: picked.size ? `${picked.size}장 고름` : `${rows.length}장` }),
      pages > 1 ? h('span.lxp-pk-pg', {},
        h('button.lxp-link', { type: 'button', text: '‹ 앞', disabled: pickPage <= 1 || undefined, onclick: () => { pickPage--; drawPick(); } }),
        h('small.num', { text: `${pickPage} / ${pages}` }),
        h('button.lxp-link', { type: 'button', text: '다음 ›', disabled: pickPage >= pages || undefined, onclick: () => { pickPage++; drawPick(); } })) : null);
  }

  /* ── 대상지 — 영상이 있으면 영상 자리에서 · 없을 때만 고른다 ── */
  const whereLine = h('p.lxp-where', { 'aria-live': 'polite' });
  const regions = [];
  const regBox = h('div.lxp-regbox');
  const regPicked = h('div.lxp-picked');
  const pickEl = h('div.lxp-pick');
  const farBtn = h('button.t-btn.t-btn--text.lxp-far-b', { type: 'button', text: '해외 지역' });
  const far = h('div.lxp-chips.lxp-far', { hidden: true, role: 'group', 'aria-label': '해외 지역' });
  regBox.append(regPicked, pickEl, h('div.lxp-far-row', {}, farBtn), far);
  const drawRegs = () => {
    regPicked.replaceChildren(...regions.map((r) => {
      const x = h('button.t-chip.lxp-reg', { type: 'button', 'aria-label': `${r.name} 빼기`, title: r.full || r.name }, h('span', { text: r.name }), h('i', { 'aria-hidden': 'true', text: '×' }));
      x.addEventListener('click', () => { regions.splice(regions.indexOf(r), 1); drawRegs(); ready(); far.querySelectorAll('.lxp-chip').forEach((c) => c.setAttribute('aria-pressed', String(regions.some((g) => g.code === c.dataset.id)))); });
      return x;
    }));
    regPicked.hidden = !regions.length;
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
    if (picked.size || ups) {
      regBox.hidden = true;
      whereLine.textContent = pk.length && !ups ? `대상지 ${pk.join(' · ')} · 고른 영상 자리에서 정했습니다`
        : pk.length ? `대상지 ${pk.join(' · ')} 외 · 올린 영상이 등록되면 더해집니다` : '대상지는 올린 영상이 등록되면 영상 자리에서 정해집니다';
    } else {
      regBox.hidden = false;
      whereLine.textContent = '영상 없이 만들면 대상지를 고릅니다';
    }
  }

  /* ── 구성원 — LX 계정 찾기 · 여러 명 ── */
  const mem = new Map();
  const memChips = h('div.lxp-picked');
  const memIn = h('input.t-input', { type: 'search', placeholder: 'LX 직원 이름 찾기', 'aria-label': '구성원 찾기', autocomplete: 'off' });
  const memList = h('ul.lxp-mem-l', { role: 'listbox', hidden: true });
  let people = null;
  const loadPeople = () => (people ??= api('/projects/people').then((j) => j.items || []).catch(() => { people = null; return []; }));
  const drawMem = () => {
    memChips.replaceChildren(...[...mem.values()].map((u) => {
      const x = h('button.t-chip.lxp-reg', { type: 'button', 'aria-label': `${u.name} 빼기` }, h('span', { text: u.name }), h('i', { 'aria-hidden': 'true', text: '×' }));
      x.addEventListener('click', () => { mem.delete(u.id); drawMem(); });
      return x;
    }));
    memChips.hidden = !mem.size;
  };
  async function drawMemList() {
    const all = await loadPeople();
    const s = memIn.value.replace(/\s+/g, '');
    const rows = all.filter((u) => !mem.has(u.id) && (!s || `${u.name}${u.role_label}`.replace(/\s+/g, '').includes(s))).slice(0, 6);
    memList.replaceChildren(...(rows.length ? rows.map((u) => h('li', { role: 'option' },
      h('button', { type: 'button', onclick: () => { mem.set(u.id, u); memIn.value = ''; drawMem(); drawMemList(); memIn.focus(); } },
        h('b', { text: u.name }), h('small', { text: u.role_label })))) : [h('li.lxp-mem-none', { text: '맞는 사람이 없습니다' })]));
    memList.hidden = false;
  }
  memIn.addEventListener('focus', drawMemList);
  memIn.addEventListener('input', drawMemList);
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
        field('이름', null, nameIn),
        field('설명', '선택', descIn),
        field('무엇을', '하나 고르기', chips, own),
        field('구성원', '여러 명 가능', memChips, h('div.lxp-mem', {}, memIn, memList))),
      h('div.lxp-new-c', {},
        field('영상', '여러 장 가능', vtabs, upBox, pickBox, whereLine, regBox))),
    err,
    h('div.lxp-act', {}, go, cancel, h('p.lxp-note', { text: '만들면 바로 학습데이터 구축으로 갑니다' })));
  document.body.append(dim, box);
  requestAnimationFrame(() => { dim.classList.add('is-in'); box.classList.add('is-in'); });
  drawWhere();

  function ready() {
    const where = picked.size || upFiles().length || regions.length;
    go.disabled = !(nameIn.value.trim() && task && where);
    err.hidden = true;
  }
  nameIn.addEventListener('input', ready);

  go.addEventListener('click', async () => {
    go.disabled = true; err.hidden = true;
    const files = upFiles();
    const busy = q?.busy() || files.some((i) => i.state !== 'done');
    const body = { name: nameIn.value.trim(), description: descIn.value.trim() || undefined, task, task_id: taskId,
      imagery: [...picked.keys()], members: [...mem.keys()],
      regions: picked.size || files.length ? [] : regions.map((r) => r.code) };
    try {
      if (files.length && !busy && draft) {               // 다 올라갔으면 지금 등록 → 그 영상 자리로 대상지
        go.textContent = '영상 등록하는 중';
        const reg = await api('/catalog/imagery', { method: 'POST', body: { draft_id: draft } });
        body.imagery.push(...(reg.items || []).map((x) => x.id));
      } else if (files.length) body.from_upload = true;  // 올리는 중 — 대상지는 등록되면(단계 화면에서 이어 올린 뒤)
      go.textContent = '만드는 중';
      const pr = await api('/projects', { method: 'POST', body });
      if (files.length && busy) {
        const { stash } = await import('./carry.js');
        await stash(pr.id, draft, files.map((i) => ({ file: i.file, done: i.state === 'done' })));
        q.clear();
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
    if (q?.busy()) q.clear();
    dim.remove(); box.remove(); open = null;
    back?.focus?.();
  }
  function esc(e) { if (e.key === 'Escape' && !e.target.closest?.('.k-region, .lxp-mem')) { e.preventDefault(); close(); } }
  addEventListener('keydown', esc, true);
  cancel.addEventListener('click', close);
  dim.addEventListener('click', close);
  setTimeout(() => { if (!box.contains(document.activeElement)) nameIn.focus(); }, 60);   // 이미 다른 칸을 눌렀으면 빼앗지 않는다
  open = { close, el: box };
  return open;
}
