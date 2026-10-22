/* delete.js — 프로젝트 삭제(10-23 사용자 "프로젝트 삭제하는 기능도 필요하다").
   누가 = 프로젝트장 · LX 관리자(서버 can.delete — 그 밖의 사람에게는 단추가 없다).
   창 = 함께 정리되는 것(영상 · 학습 자료 · 모델 · 결과 — 서버 GET /projects/{id}/delete 의 수) · 남는 것 · 30일 뒤 지워짐 + 이름 똑같이 적기.
   막힘(배포 신청 중 · 기관에 공유됨) = 까닭과 먼저 할 일 한 줄씩 · 삭제 단추 없음. 숫자는 모두 서버 값(지어낸 값 0). */
import { h, api } from '../kit/util.js';
import { modal } from '../kit/modal.js';
import { toast } from '../kit/toast.js';

const v = (e) => (e && typeof e === 'object' && 'value' in e ? e.value : e) ?? 0;
const u = (t) => h('span.lxp-u', { text: t });          // 뜻 한 덩어리 — 덩어리 사이에서만 꺾인다(줄바꿈 규칙 9)
/** 한 문장을 뜻 덩어리로(…에서 · …뒤 · …하거나 다음에서 꺾음) — 덩어리 안에서는 꺾이지 않게(규칙 9) */
const phr = (t) => String(t ?? '').split(/(?<=(?:에서|뒤|하거나|빠지고)) /).flatMap((x, i) => (i ? [' ', u(x)] : [u(x)]));
const same = (a, b) => String(a ?? '').split(/\s+/).filter(Boolean).join(' ') === String(b ?? '').split(/\s+/).filter(Boolean).join(' ');

/** 설정 칸 맨 아래 '프로젝트 삭제' 단추 — can.delete 일 때만. onDone = 삭제한 뒤(기본: 프로젝트 목록으로) */
export function deleteButton(pr, { onDone } = {}) {
  if (!pr?.can?.delete) return null;
  const b = h('button.t-btn.t-btn--text.lxp-del', { type: 'button', text: '프로젝트 삭제' });
  b.addEventListener('click', () => openDelete(pr, { onDone }));
  return b;
}

export async function openDelete(pr, { onDone } = {}) {
  const box = h('div.lxp-sh.lxp-delw', {}, h('p.lxp-say', { text: '함께 정리되는 것을 세고 있습니다' }));
  const m = modal({ title: '프로젝트 삭제', body: box });
  m.el.classList.add('lxp-md');
  let d;
  try { d = await api(`/projects/${pr.id}/delete`); }
  catch (e) {
    box.replaceChildren(h('p.lxp-say', { text: e.message || '잠시 뒤 다시 해 주세요' }),
      h('div.lxp-act', {}, h('button.t-btn', { type: 'button', text: '확인', onclick: () => m.close() })));
    return m;
  }
  const c = d.counts || {};
  const name = h('p.lxp-rm-what', {}, h('b', { text: '프로젝트 ' }), d.name);
  const what = h('ul.lxp-del-n', { 'aria-label': '함께 정리되는 것' },
    ...[['영상', c.imagery], ['학습 자료', c.samples], ['모델', c.models], ['결과', c.results]].map(([k, n]) =>
      h('li', {}, h('span', { text: k }), h('b.num', { text: String(v(n)) }))));
  if ((d.blocked || []).length) {                      // 막힘 — 까닭 · 먼저 할 일(새 기능 없이 지금 있는 길로)
    box.replaceChildren(name,
      ...d.blocked.map((b) => h('p.lxp-say.lxp-del-b', {}, h('b', { text: b.text }), h('br'), ...phr(b.todo))),
      h('div.lxp-act', {}, h('button.t-btn', { type: 'button', text: '확인', onclick: () => m.close() })));
    return m;
  }
  const kept = [v(d.kept?.samples) ? `다른 프로젝트와 함께 쓰는 학습 자료 ${v(d.kept.samples)}개` : null,
    v(d.kept?.models) ? `서비스에 쓰인 모델 ${v(d.kept.models)}개` : null].filter(Boolean);
  const say = h('p.lxp-say', {}, u('목록에서 바로 빠지고'), ' ', u(`${v(d.keep_days) || 30}일 뒤 완전히 지워집니다.`), h('br'),
    u('공유 데이터의 영상은 그대로 남습니다.'),
    v(c.running) ? h('br') : null, v(c.running) ? u(`돌고 있는 작업 ${v(c.running)}건은 멈춥니다.`) : null,
    kept.length ? h('br') : null, kept.length ? u(`${kept.join(' · ')}는 남습니다.`) : null);
  const typed = h('input.t-input', { type: 'text', maxlength: '80', autocomplete: 'off', 'aria-label': '프로젝트 이름', placeholder: d.name });
  const go = h('button.t-btn.lxp-del-go', { type: 'button', text: '삭제', disabled: true });
  const cancel = h('button.t-btn.t-btn--text.lxp-cancel', { type: 'button', text: '취소' });
  typed.addEventListener('input', () => { go.disabled = !same(typed.value, d.name); });
  box.replaceChildren(name, what, say,
    h('div.lxp-f', {}, h('p.lxp-l', { text: '확인을 위해 프로젝트 이름을 똑같이 적어 주세요' }), typed),
    h('div.lxp-act', {}, go, cancel));
  cancel.addEventListener('click', () => m.close());
  typed.focus();
  go.addEventListener('click', async () => {
    if (!same(typed.value, d.name)) return;
    go.disabled = true;
    try {
      await api(`/projects/${pr.id}`, { method: 'DELETE', body: { name: typed.value } });
      m.close(true);
      toast('프로젝트를 삭제했습니다');
      if (onDone) onDone(); else location.href = location.pathname;   // 프로젝트 목록(?project= 없음)
    } catch (e) {
      go.disabled = false;
      const bl = e?.details?.blocked || e?.detail?.blocked;
      box.querySelector('.lxp-del-err')?.remove();
      box.insertBefore(h('p.lxp-say.lxp-del-b.lxp-del-err', {}, h('b', { text: e.message || '삭제하지 못했습니다' }),
        bl?.[0]?.todo ? h('br') : null, ...(bl?.[0]?.todo ? phr(bl[0].todo) : [])), box.querySelector('.lxp-act'));
    }
  });
  return m;
}
