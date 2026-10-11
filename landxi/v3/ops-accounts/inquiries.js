/* 계정 → '문의' 탭(LX 관리자만 · 10-11 메인 지시 3) — 메인 · 도움말 · 로그인 창의 문의하기 창으로 들어온 문의.
   목록(받은 때 · 이름 · 소속 · 종류 · 연락처 · 상태) → 행을 누르면 오른쪽 서랍에 내용 전체 + 읽음 · 답함 · 시험 표시.
   서버: GET /inquiries · POST /inquiries/{id}/mark {read?, answered?, test?} (server/landxi_api/inquiries.py).
   mountInquiries(card, { mine: () => bool, onChange }) */
import { drawer } from '../kit/panel.js';
import { table } from '../kit/table.js';
import { empty } from '../kit/empty.js';
import { toast } from '../kit/toast.js';
import { h, esc, ymd, api } from '../kit/util.js';

const hm = (s) => { const d = s ? new Date(s) : null; return d && !Number.isNaN(d.getTime()) ? `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` : ''; };
const when = (s) => (s ? `${ymd(s)} ${hm(s)}` : '—');
const stOf = (r) => (r.test ? ['시험', 'gap'] : r.answered ? ['답함', ''] : r.read ? ['읽음', 'wait'] : ['새 문의', 'warn']);

export async function mountInquiries(card, { mine = () => true, onChange } = {}) {
  let j;
  try { j = await api('/inquiries'); } catch {
    if (!mine()) return;
    card.innerHTML = ''; const er = h('div'); card.append(er); empty(er, { kind: 'error', onRetry: () => mountInquiries(card, { mine, onChange }) }); return;
  }
  if (!mine()) return;
  card.innerHTML = '';
  card.dataset.tab = 'inquiries';
  const rows = (j.items || []).map((r) => ({ ...r, st: stOf(r)[0] }));
  if (!rows.length) { const e = h('div'); card.append(e); empty(e, { kind: 'first', title: '받은 문의가 없습니다' }); return; }
  const tw = h('div.acc-tbl'); card.append(tw);
  let openId = null;
  const mark = () => tw.querySelectorAll('tbody tr').forEach((tr, i) => tr.classList.toggle('is-on', tw._vis?.[i]?.id === openId));
  const cols = [
    { key: 'at', label: '받은 때', fmt: (v) => `<span class="num">${esc(when(v))}</span>` },
    { key: 'name', label: '이름', fmt: (v) => `<b class="acc-b">${esc(v)}</b>` },
    { key: 'org', label: '소속', fmt: (v) => esc(v || '—') },
    { key: 'kind_ko', label: '종류' },
    { key: 'contact', label: '연락처', fmt: (v) => `<span class="acc-m">${esc(v)}</span>` },
    { key: 'st', label: '상태', fmt: (v, r) => { const [t, lv] = stOf(r); return `<span class="t-chip"${lv ? ` data-lv="${lv}"` : ''}>${esc(t)}</span>`; } },
  ];
  const reload = async () => { onChange?.(); await mountInquiries(card, { mine, onChange }); };
  const open = async (r) => {
    openId = r.id; mark();
    if (!r.read && !r.test) {                         // 열면 읽음(누가 언제 — 서버가 남긴다)
      try { Object.assign(r, await api(`/inquiries/${encodeURIComponent(r.id)}/mark`, { method: 'POST', body: { read: true } })); r.st = stOf(r)[0]; T.set(rows); mark(); onChange?.(); } catch { /* 읽음 표시만 빠진다 */ }
    }
    const dl = h('dl.acc-dl', {}, ...[['받은 때', when(r.at)], ['소속', r.org || '—'], ['연락처', r.contact], ['종류', r.kind_ko],
      ['읽음', r.read ? `${when(r.read_at)}${r.read_name ? ` · ${r.read_name}` : ''}` : '—'],
      ['답함', r.answered ? `${when(r.answered_at)}${r.answered_name ? ` · ${r.answered_name}` : ''}` : '—'], ['접속 주소', r.ip || '—']]
      .flatMap(([k, v]) => [h('dt', { text: k }), h('dd', { text: v })]));
    const text = h('p.acc-iq-body', { text: r.body });
    const btn = (label, body, msg, two) => h(`button.t-btn${two ? '.t-btn--2' : ''}`, { type: 'button', text: label, onclick: async (e) => {
      e.currentTarget.disabled = true;
      try { await api(`/inquiries/${encodeURIComponent(r.id)}/mark`, { method: 'POST', body }); toast(msg); sheet.close(); await reload(); }
      catch (err) { toast(err.message || '지금은 바꿀 수 없습니다'); e.currentTarget.disabled = false; }
    } });
    const acts = h('div.acc-acts', {},
      r.answered ? btn('답함 풀기', { answered: false }, '답함 표시를 풀었습니다', true) : btn('답함으로 표시', { answered: true }, '답함으로 표시했습니다'),
      r.test ? btn('시험 표시 풀기', { test: false }, '시험 표시를 풀었습니다', true) : btn('시험으로 표시', { test: true }, '시험 문의로 표시했습니다', true));
    const body = h('div.acc-sheet.acc-dp', {}, text, dl, h('p.acc-help', { text: '답은 적힌 연락처로 직접 드립니다. 답한 뒤 답함으로 표시해 주세요.' }), acts);
    const sheet = drawer({ title: `${r.name} · ${r.kind_ko}`, body, slot: 'account', onClose: () => { openId = null; mark(); } });
  };
  const T = table(tw, { cols, rows, sort: 'at', dir: 'desc', onRow: open });
  mark();
}
