/* notice.js — LX 관리자가 공지를 쓰는 자리(확인 대장 직원-4 ⓐ '공지는 서버에 더한 뒤 실제 글로' · 최소한).
   현황 카드 할 일 목록의 '공지 · 쓰기' 줄 → 가운데 창: 위 = 쓰기(제목 · 본문 선택 · 올리기) · 아래 = 올린 공지(최근 순 · 내리기).
   올린 글은 LX 직원 대시보드 '공지' 칸에 그대로 보인다(서버 GET /announcements 한 출처). 지어낸 공지는 넣지 않는다. */
import { h, api } from '../../kit/util.js';
import { modal } from '../../kit/modal.js';
import { toast } from '../../kit/toast.js';

const two = (n) => String(n).padStart(2, '0');
const day = (s) => { const d = new Date(s || ''); return Number.isNaN(+d) ? '' : `${d.getFullYear()}.${two(d.getMonth() + 1)}.${two(d.getDate())}`; };

export async function noticeCount() {
  try { return (await api('/announcements?limit=1')).total ?? null; } catch { return null; }
}

export function openNoticeWriter({ onChange } = {}) {
  const title = h('input.t-input', { type: 'text', name: 'title', maxlength: '80', autocomplete: 'off', placeholder: '제목 한 줄', 'aria-label': '제목' });
  const body = h('textarea.t-input.oc-ntc-ta', { name: 'body', maxlength: '2000', rows: '5', placeholder: '알릴 내용', 'aria-label': '본문' });
  const go = h('button.t-btn', { type: 'button', text: '올리기', disabled: true });
  const err = h('p.oc-ntc-err', { role: 'alert', hidden: true });
  const list = h('ul.oc-ntc-list');
  const wrap = h('div.oc-ntc', {},
    h('label.oc-ntc-f', {}, h('span', { text: '제목' }), title),
    h('label.oc-ntc-f', {}, h('span', {}, '본문', h('small', { text: '선택' })), body),
    h('p.oc-ntc-say', { text: '올리면 LX 직원 대시보드의 공지 칸에 바로 보입니다' }),
    err, h('div.oc-ntc-act', {}, go),
    h('p.oc-ntc-k', { text: '올린 공지' }), list);
  const m = modal({ title: '공지 쓰기', body: wrap, size: 'lg' });
  title.addEventListener('input', () => { err.hidden = true; go.disabled = !title.value.trim(); });

  async function draw() {
    let j;
    try { j = await api('/announcements?limit=20'); } catch { list.replaceChildren(h('li.oc-ntc-none', { text: '목록을 불러오지 못했습니다' })); return; }
    const items = j.items || [];
    if (!items.length) { list.replaceChildren(h('li.oc-ntc-none', { text: '올린 공지가 없습니다' })); return; }
    list.replaceChildren(...items.map((a) => {
      const off = h('button.oc-ntc-off', { type: 'button', text: '내리기' });
      off.addEventListener('click', async () => {
        off.disabled = true;
        try { await api(`/announcements/${encodeURIComponent(a.id)}/remove`, { method: 'POST', body: {} }); toast('공지를 내렸습니다'); draw(); onChange?.(); }
        catch (e) { off.disabled = false; toast(e.message || '내리지 못했습니다'); }
      });
      return h('li', {}, h('span.num', { text: day(a.at) }), h('b', { text: a.title }), off);
    }));
  }
  go.addEventListener('click', async () => {
    go.disabled = true;
    try {
      await api('/announcements', { method: 'POST', body: { title: title.value.trim(), body: body.value.trim() } });
      title.value = ''; body.value = '';
      toast('공지를 올렸습니다');
      draw(); onChange?.();
    } catch (e) { err.textContent = e.message || '올리지 못했습니다'; err.hidden = false; go.disabled = false; }
  });
  draw();
  setTimeout(() => title.focus({ preventScroll: true }), 0);
  return m;
}
