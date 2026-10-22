/* 기관 공지 한 줄(10-22 now21 제안-기관공지쓰기 — "기관 관리자가 부서 직원에게 알리는 공지를 직접 씁니다(기관 안에서만 보임)").
   내 서비스 · 행정서비스 묶음 홈 맨 위(본문 흐름 안 — 떠 있는 요소가 아니라 겹침 0). 공지가 있으면 가장 최근(고정 먼저) 한 줄 + '모두 보기'.
   기관 관리자는 '공지 쓰기'(공지가 없어도). 서버 GET|POST /spaces/me/notices · 내리기는 지우지 않음. 지역 · 기관 고정값 0. */
import { h, api } from '../kit/util.js';
import { modal } from '../kit/modal.js';
import { toast } from '../kit/toast.js';

const day = (s) => String(s || '').slice(0, 10).replace(/-/g, '.');

export async function noticeLine(host) {
  let j;
  try { j = await api('/spaces/me/notices?limit=10'); } catch { return null; }
  const items = j.items || [];
  if (!items.length && !j.can_write) return null;
  const el = h('section.gn-line', { 'aria-label': '기관 공지' });
  const paint = (list) => {
    const top = list[0];
    el.replaceChildren(...[h('b.gn-k', { text: '공지' }),
      top ? h('button.gn-t', { type: 'button', onclick: () => openList(list, j.can_write, reload) }, h('span.gn-tt', { text: top.title }), h('span.gn-d.num', { text: day(top.at) }))
        : h('span.gn-none', { text: '부서 직원에게 알릴 공지를 쓸 수 있습니다' }),
      h('span.gn-sp'),
      list.length > 1 ? h('button.t-btn.t-btn--text.gn-a', { type: 'button', text: `모두 보기 ${list.length}`, onclick: () => openList(list, j.can_write, reload) }) : null,
      j.can_write ? h('button.t-btn.t-btn--text.gn-a', { type: 'button', text: '공지 쓰기', onclick: () => writer(reload) }) : null].filter(Boolean));   // 없는 칸(null)은 빼고 — 'null' 글자가 들어가지 않게
  };
  async function reload() {
    try { j = await api('/spaces/me/notices?limit=10'); paint(j.items || []); } catch { /* 그대로 */ }
  }
  paint(items);
  host.append(el);
  return el;
}

function openList(list, canWrite, reload) {
  const box = h('ol.gn-list', {}, ...list.map((n) => {
    const off = canWrite ? h('button.t-btn.t-btn--text.gn-off', { type: 'button', text: '내리기' }) : null;
    off?.addEventListener('click', async () => {
      off.disabled = true;
      try { await api(`/spaces/me/notices/${encodeURIComponent(n.id)}/remove`, { method: 'POST', body: {} }); toast('공지를 내렸습니다'); m.close(true); reload(); }
      catch (e) { off.disabled = false; toast(e.message || '내리지 못했습니다'); }
    });
    return h('li', {}, ...[h('div.gn-lh', {}, ...[h('b', { text: n.title }), n.pinned ? h('span.t-chip', { text: '고정' }) : null].filter(Boolean)),
      h('small', { text: [day(n.at), n.by].filter(Boolean).join(' · ') }), n.body ? h('p', { text: n.body }) : null, off].filter(Boolean));
  }));
  const m = modal({ title: '기관 공지', body: box, size: 'lg' });
}

function writer(reload) {
  const title = h('input.t-input', { type: 'text', maxlength: '80', autocomplete: 'off', placeholder: '제목 한 줄', 'aria-label': '제목' });
  const body = h('textarea.t-input', { maxlength: '2000', rows: '5', placeholder: '알릴 내용', 'aria-label': '본문' });
  const pin = h('input', { type: 'checkbox' });
  const go = h('button.t-btn', { type: 'submit', text: '올리기', disabled: true });
  const f = h('form.gn-form', {},
    h('label.gn-f', {}, h('span.t-label', { text: '제목' }), title),
    h('label.gn-f', {}, h('span.t-label', { text: '본문(선택)' }), body),
    h('label.gn-pin', {}, pin, h('span', { text: '맨 위에 고정' })),
    h('p.gn-say', { text: '우리 기관 사용자에게만 보입니다.' }), go);
  title.addEventListener('input', () => { go.disabled = !title.value.trim(); });
  const m = modal({ title: '공지 쓰기', body: f });
  setTimeout(() => title.focus(), 0);
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    go.disabled = true;
    try {
      await api('/spaces/me/notices', { method: 'POST', body: { title: title.value.trim(), body: body.value.trim(), pinned: pin.checked } });
      m.close(true); toast('공지를 올렸습니다'); reload();
    } catch (err) { go.disabled = false; toast(err.message || '올리지 못했습니다'); }
  });
}
