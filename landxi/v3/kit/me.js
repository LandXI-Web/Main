/* me.js — 내 정보(본인이 고친다 · 구현 5차 · 확인 17차 P-5 ⓐ · 원칙 105 · 121 · 시안 design-r8/project-page new-me).
   머리의 내 이름(셸 역할 칸)을 누르면 가운데 창(kit/modal.js): 아이디(메일 · 고정) · 이름 · 부서 · 연락처(선택) — 관리자 승인 없이 바로 바뀌고
   바뀐 기록은 서버 감사 기록에 남는다. 아래에 나에게 할당된 자원 = 저장 용량(할당 · 지금 쓴 양 — 서버 GET /me/profile 한 출처).
   할당 값이 정해져 있지 않으면 '할당 없음'과 쓴 양만 정직하게. LX 직원 · LX 관리자 · LX 영업 계정(기관 계정은 확인 범위 밖 — 셸이 버튼을 붙이지 않는다).
   openMe({ onSaved(profile) }) */
import { h, api } from './util.js';
import { modal } from './modal.js';
import { toast } from './toast.js';

const CSS = new URL('./me.css', import.meta.url).href;
const v = (e) => (e && typeof e === 'object' && 'value' in e ? e.value : e);
const two = (n) => String(n).padStart(2, '0');
const stamp = (s) => { const d = new Date(s || ''); return Number.isNaN(+d) ? '' : `${d.getFullYear()}.${two(d.getMonth() + 1)}.${two(d.getDate())} ${two(d.getHours())}:${two(d.getMinutes())}`; };
/** 크기 — 10진(서버 사용 현황과 같은 단위) */
export function size(b) {
  const n = Number(b) || 0;
  if (n >= 1e9) return `${(n / 1e9).toFixed(n >= 1e10 ? 0 : 1)} GB`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)} MB`;
  if (n > 0) return `${Math.max(0.1, n / 1e3).toFixed(1)} KB`;
  return '0 MB';
}

/** 저장 용량 칸 — 할당이 있으면 쓴 양 / 할당 + 막대, 없으면 '할당 없음 · 지금 쓴 양' */
export function storageBlock(st = {}) {
  const used = Number(v(st.used)) || 0, quota = v(st.quota_gb), n = Number(v(st.projects)) || 0;
  const box = h('div.k-me-st');
  box.append(h('p.k-me-l', { text: '저장 용량' }));
  if (quota !== null && quota !== undefined) {
    const pct = Math.min(100, Math.round((used / (quota * 1e9)) * 100));
    box.append(h('p.k-me-sv', {}, h('b.num', { text: size(used) }), ` / ${quota} GB 할당`),
      h('div.k-me-bar', { role: 'img', 'aria-label': `할당의 ${pct}% 사용` }, h('i', { style: `width:${pct}%` })));
  } else {
    box.append(h('p.k-me-sv', {}, '할당 없음 · 지금 쓴 양 ', h('b.num', { text: size(used) })));
  }
  box.append(h('p.k-me-sub', { text: n ? `내가 프로젝트장인 프로젝트 ${n}개의 학습데이터 · 올린 파일` : '내가 프로젝트장인 프로젝트가 없습니다' }));
  return box;
}

let cur = null;
export function openMe({ onSaved } = {}) {
  if (cur) return cur;
  if (!document.querySelector('link[data-k-me]')) document.head.append(h('link', { rel: 'stylesheet', href: CSS, 'data-k-me': '' }));
  const body = h('div.k-me', {}, h('p.k-me-wait', { text: '불러오는 중' }));
  const m = modal({ title: '내 정보', body, onClose: () => { cur = null; } });
  m.el.classList.add('k-me-md');
  cur = m;
  api('/me/profile').then((p) => draw(p)).catch(() => { body.replaceChildren(h('p.k-me-wait', { text: '내 정보를 불러오지 못했습니다' })); });

  function draw(p) {
    const field = (label, input, opt) => h('label.k-me-f', {}, h('span.k-me-l', {}, label, opt ? h('small', { text: '선택' }) : null), input);
    const name = h('input.t-input', { type: 'text', name: 'name', maxlength: '40', autocomplete: 'name', value: p.name || '' });
    const dept = h('input.t-input', { type: 'text', name: 'dept', maxlength: '60', autocomplete: 'organization-title', value: p.dept || '', placeholder: '예: 공간정보처 국토정보부' });
    const contact = h('input.t-input', { type: 'text', name: 'contact', maxlength: '30', autocomplete: 'tel', value: p.contact || '', placeholder: '내선 또는 휴대전화' });
    const save = h('button.t-btn', { type: 'button', text: '저장', disabled: true });
    const cancel = h('button.t-btn.t-btn--text.k-me-x', { type: 'button', text: '취소' });
    const err = h('p.k-me-err', { role: 'alert', hidden: true });
    const dirty = () => { save.disabled = !name.value.trim() || (name.value.trim() === (p.name || '') && dept.value.trim() === (p.dept || '') && contact.value.trim() === (p.contact || '')); };
    for (const x of [name, dept, contact]) x.addEventListener('input', () => { err.hidden = true; dirty(); });
    body.replaceChildren(
      h('div.k-me-f', {}, h('span.k-me-l', { text: '아이디' }), h('p.k-me-ro', { text: p.login, title: '아이디(메일)는 바꿀 수 없습니다' })),
      field('이름', name), field('부서', dept), field('연락처', contact, true),
      storageBlock(p.storage),
      h('p.k-me-say', {}, h('span', { text: '관리자 승인 없이 바로 바뀌고,' }), ' ', h('span', { text: '바꾼 기록이 남습니다' }), h('br'),
        `마지막 바꿈 ${p.changed_at ? stamp(p.changed_at) : '없음'}`),
      err, h('div.k-me-act', {}, save, cancel));
    cancel.addEventListener('click', () => m.close());
    save.addEventListener('click', async () => {
      save.disabled = true;
      try {
        const out = await api('/me/profile', { method: 'PATCH', body: { name: name.value.trim(), dept: dept.value.trim(), contact: contact.value.trim() } });
        m.close(true); cur = null;
        toast('내 정보를 바꿨습니다');
        onSaved?.(out);
      } catch (e) { err.textContent = e.message || '저장하지 못했습니다'; err.hidden = false; dirty(); }
    });
    setTimeout(() => name.focus({ preventScroll: true }), 0);
  }
  return m;
}
