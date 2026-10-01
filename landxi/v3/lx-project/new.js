/* new.js — 새 프로젝트(구현 2차 T1 · 확인 대장 R-D3 · 갈림길 ⓐ · 시안 design-r4/mock/06-project-new.html).
   입력은 세 칸뿐: 이름 · 무엇을(업무 · 탐지 대상 하나) · 어디(대상 지역 여러 곳 — 직원이 고른다, 화면이 고르지 않는다).
   '만들기' = 바로 만들어진다(관리자 승인 없음) · 프로젝트장 = 만든 직원. 이름은 무엇을 · 어디를 고르면 저절로 채워지고(고치면 그대로 둔다),
   구성원은 만든 뒤 프로젝트 화면에서 더한다. 업무 목록은 서비스 만들기(③)와 같은 한 곳(lx-console/matrix.js TASKS). */
import { h, api } from '../kit/util.js';
import { regionPicker } from '../kit/region.js';
import { toast } from '../kit/toast.js';
import { TASKS } from '../lx-console/matrix.js';
import { projectHref, ensureCss } from './context.js';

let open = null;

export function openNewProject({ onMade } = {}) {
  if (open) return open;
  ensureCss();
  const year = new Date().getFullYear();
  const back = document.activeElement;
  const dim = h('div.t-dim.lxp-dim');
  const nameIn = h('input.t-input', { type: 'text', name: 'name', maxlength: '60', autocomplete: 'off', 'aria-label': '이름', placeholder: '이름' });
  const chips = h('div.lxp-chips', { role: 'group', 'aria-label': '무엇을' });
  const own = h('input.t-input.lxp-own', { type: 'text', maxlength: '40', autocomplete: 'off', 'aria-label': '업무 · 탐지 대상 직접 입력', placeholder: '업무 · 탐지 대상', hidden: true });
  const picked = h('div.lxp-picked', { 'aria-live': 'polite' });
  const pickEl = h('div.lxp-pick');
  const farBtn = h('button.t-btn.t-btn--text.lxp-far-b', { type: 'button', text: '해외 지역' });
  const far = h('div.lxp-chips.lxp-far', { hidden: true, role: 'group', 'aria-label': '해외 지역' });
  const err = h('p.lxp-err', { role: 'alert', hidden: true });
  const go = h('button.t-btn', { type: 'button', text: '만들기', disabled: true });
  const cancel = h('button.t-btn.t-btn--text.lxp-cancel', { type: 'button', text: '취소' });
  const box = h('div.t-modal.lxp-new', { role: 'dialog', 'aria-modal': 'true', 'aria-label': '새 프로젝트' },
    h('h2.t-h4', { text: '새 프로젝트' }),
    h('div.lxp-f', {}, h('p.lxp-l', { text: '이름' }), nameIn),
    h('div.lxp-f', {}, h('p.lxp-l', {}, '무엇을', h('small', { text: '하나 고르기' })), chips, own),
    h('div.lxp-f', {}, h('p.lxp-l', {}, '어디', h('small', { text: '여러 곳 가능' })), picked, pickEl, h('div.lxp-far-row', {}, farBtn), far),
    err,
    h('div.lxp-act', {}, go, cancel),
    h('p.lxp-note', { text: '구성원은 만든 뒤 더합니다' }));
  document.body.append(dim, box);
  requestAnimationFrame(() => { dim.classList.add('is-in'); box.classList.add('is-in'); });

  /* ── 무엇을 ── */
  let task = null, taskId = null, edited = false;
  const regions = [];
  const all = [...TASKS.map((t) => ({ id: t.id, name: t.name })), { id: '', name: '직접 입력' }];
  for (const t of all) {
    const b = h('button.t-chip.lxp-chip', { type: 'button', 'aria-pressed': 'false', text: t.name, dataset: { id: t.id } });
    b.addEventListener('click', () => {
      chips.querySelectorAll('.lxp-chip').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      own.hidden = t.id !== '';
      if (t.id) { task = t.name; taskId = t.id; } else { task = own.value.trim() || null; taskId = null; own.focus(); }
      suggest(); ready();
    });
    chips.append(b);
  }
  own.addEventListener('input', () => { task = own.value.trim() || null; suggest(); ready(); });

  /* ── 어디 — 국내 시군구(키트 지역 검색) · 해외 지역(서버 목록) ── */
  const drawPicked = () => {
    picked.innerHTML = '';
    for (const r of regions) {
      const x = h('button.t-chip.lxp-reg', { type: 'button', 'aria-label': `${r.name} 빼기`, title: r.full || r.name }, h('span', { text: r.name }), h('i', { 'aria-hidden': 'true', text: '×' }));
      x.addEventListener('click', () => { regions.splice(regions.indexOf(r), 1); drawPicked(); suggest(); ready(); far.querySelectorAll('.lxp-chip').forEach((c) => c.setAttribute('aria-pressed', String(regions.some((g) => g.code === c.dataset.id)))); });
      picked.append(x);
    }
    picked.hidden = !regions.length;
  };
  const add = (r) => { if (!r || regions.some((g) => g.code === r.code)) return; regions.push(r); drawPicked(); suggest(); ready(); };
  regionPicker(pickEl, { onPick: (r) => { add({ code: r.sgg_cd, name: r.name, full: r.full }); const i = pickEl.querySelector('input'); if (i) { i.value = ''; } } })
    .then((p) => { p.input.setAttribute('placeholder', '시군구 이름을 검색'); });
  farBtn.addEventListener('click', async () => {
    far.hidden = !far.hidden;
    if (far.hidden || far.childElementCount) return;
    const j = await api('/projects/places').catch(() => null);
    for (const g of j?.items || []) {
      const b = h('button.t-chip.lxp-chip', { type: 'button', 'aria-pressed': 'false', text: g.name, dataset: { id: g.code } });
      b.addEventListener('click', () => {
        const on = regions.find((x) => x.code === g.code);
        if (on) { regions.splice(regions.indexOf(on), 1); drawPicked(); suggest(); ready(); } else add({ code: g.code, name: g.name, full: g.full, abroad: true });
        b.setAttribute('aria-pressed', String(!on));
      });
      far.append(b);
    }
  });

  /* ── 이름 — 고치기 전까지는 '{첫 지역} {무엇을} {올해}' ── */
  nameIn.addEventListener('input', () => { edited = !!nameIn.value.trim(); ready(); });
  function suggest() {
    if (edited) return;
    const r0 = regions[0];
    nameIn.value = [r0?.name, task, (r0 || task) ? year : ''].filter(Boolean).join(' ');
  }
  function ready() { go.disabled = !(nameIn.value.trim() && task && regions.length); err.hidden = true; }

  /* ── 만들기 · 닫기 ── */
  go.addEventListener('click', async () => {
    go.disabled = true; err.hidden = true;
    try {
      const pr = await api('/projects', { method: 'POST', body: { name: nameIn.value.trim(), task, task_id: taskId, regions: regions.map((r) => r.code) } });
      toast('프로젝트를 만들었습니다');
      close();
      if (onMade) onMade(pr); else location.href = projectHref(pr.id);
    } catch (e) {
      err.textContent = e.message && !/^[a-z_]+$/.test(e.message) ? e.message : '만들지 못했습니다 — 다시 눌러 주세요';
      err.hidden = false; go.disabled = false;
    }
  });
  function close() {
    removeEventListener('keydown', esc, true);
    dim.remove(); box.remove(); open = null;
    back?.focus?.();
  }
  function esc(e) { if (e.key === 'Escape' && !e.target.closest?.('.k-region')) { e.preventDefault(); close(); } }
  addEventListener('keydown', esc, true);
  cancel.addEventListener('click', close);
  dim.addEventListener('click', close);
  setTimeout(() => nameIn.focus(), 60);
  open = { close, el: box };
  return open;
}
