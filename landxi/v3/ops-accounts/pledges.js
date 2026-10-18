/* 계정 → '이용 약속 기록' 탭(10-18 제안-이용약속기록화면 넣음 · 원칙 293) — 보기만.
   개인정보가 든 파일(올린 대장의 필지별 내용)을 받으려고 적은 이용 약속: 누가 · 언제 · 사용 목적 · 활용 기간 · 받은 파일 종류 · 받은 횟수.
   기관 관리자 = 자기 기관(GET /spaces/me/pledges) · LX 관리자 = 모든 기관(GET /admin/pledges · 기관 칸 · 기관 고르기).
   기간(약속한 날 기준)으로 거르기 · 엑셀(.xlsx)로 내려받기. 고치기 · 지우기 없음.
   mountPledges(card, { mine: () => bool, lx: bool }) */
import { table } from '../kit/table.js';
import { empty } from '../kit/empty.js';
import { toast } from '../kit/toast.js';
import { h, esc, api } from '../kit/util.js';

const ymdOf = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const dot = (s) => String(s || '').slice(0, 10).replace(/-/g, '.');
const when = (s) => (s ? `${dot(s)} ${String(s).slice(11, 16)}` : '—');
const ev = (e) => (e && typeof e === 'object' && 'value' in e ? e.value : e);

export async function mountPledges(card, { mine = () => true, lx = false } = {}) {
  const base = lx ? '/admin/pledges' : '/spaces/me/pledges';
  const now = new Date();
  const F = { from: ymdOf(new Date(now.getFullYear(), now.getMonth() - 2, 1)), to: ymdOf(now), org: '' };
  card.innerHTML = '';
  card.dataset.tab = 'pledges';
  const from = h('input.t-input.acc-day', { type: 'date', value: F.from, 'aria-label': '기간 시작' });
  const to = h('input.t-input.acc-day', { type: 'date', value: F.to, 'aria-label': '기간 끝' });
  const org = lx ? h('select.t-input.acc-org', { 'aria-label': '기관' }, h('option', { value: '', text: '모든 기관' })) : null;
  const xl = h('button.t-btn.t-btn--2', { type: 'button', text: '엑셀로 내려받기' });
  const sum = h('p.acc-help.acc-pl-sum', { role: 'status' });
  const tw = h('div.acc-tbl');
  card.append(h('div.acc-pl-bar', {}, h('label.acc-pl-f', {}, h('span.t-label', { text: '약속한 날' }), h('span.acc-pl-r', {}, from, h('i', { text: '~' }), to)),
    org ? h('label.acc-pl-f', {}, h('span.t-label', { text: '기관' }), org) : null, xl),
  h('p.acc-help', {}, '개인정보가 든 파일(올린 대장의 필지별 내용)을 받기 전에 적은 약속입니다.', h('br'), '보기만 합니다 · 받은 횟수는 그 약속으로 받은 파일 수입니다.'), sum, tw);
  const qs = () => new URLSearchParams({ ...(F.from ? { from: F.from } : {}), ...(F.to ? { to: F.to } : {}), ...(F.org ? { tenant: F.org } : {}) });
  const cols = [
    ...(lx ? [{ key: 'org', label: '기관' }] : []),
    { key: 'who', label: '누가', fmt: (v) => `<b class="acc-b">${esc(v)}</b>` },
    { key: 'at', label: '약속한 때', fmt: (v) => `<span class="num">${esc(when(v))}</span>` },
    { key: 'purpose', label: '사용 목적', fmt: (v) => esc(v) },
    { key: 'until', label: '활용 기간', fmt: (v, r) => `<span class="num">${esc(dot(v))}까지</span> <span class="t-chip"${r.live ? '' : ' data-lv="gap"'}>${r.live ? '기간 안' : '기간 끝'}</span>` },
    { key: 'kinds_t', label: '받은 파일', fmt: (v) => esc(v || '—') },
    { key: 'n_v', label: '받은 횟수', num: true, fmt: (v) => `<span class="num">${esc(Number(v || 0).toLocaleString('ko-KR'))}회</span>` },
  ];
  let T = null, orgsDone = false;
  async function load() {
    let j;
    try { j = await api(base + '?' + qs()); }
    catch (e) {
      if (!mine()) return;
      tw.innerHTML = ''; const er = h('div'); tw.append(er);
      empty(er, { kind: 'error', text: e.message || '불러오지 못했습니다', onRetry: load }); return;
    }
    if (!mine()) return;
    const rows = (j.items || []).map((r) => ({ ...r, kinds_t: (r.kinds || []).join(' · '), n_v: ev(r.n) || 0 }));
    if (org && !orgsDone) { orgsDone = true; org.append(...(j.orgs || []).map((o) => h('option', { value: o.id, text: o.name }))); }
    const n = rows.reduce((a, r) => a + r.n_v, 0);
    sum.textContent = rows.length ? `약속 ${rows.length.toLocaleString('ko-KR')}건 · 받은 파일 ${n.toLocaleString('ko-KR')}회` : '';
    tw.innerHTML = '';
    if (!rows.length) { const e = h('div'); tw.append(e); empty(e, { kind: 'first', title: '이 기간에 적은 이용 약속이 없습니다' }); T = null; return; }
    T = table(tw, { cols, rows, sort: 'at', dir: 'desc', limit: 30 });
  }
  const set = () => { F.from = from.value; F.to = to.value; F.org = org ? org.value : ''; load(); };
  from.addEventListener('change', set); to.addEventListener('change', set); org?.addEventListener('change', set);
  xl.addEventListener('click', async () => {
    xl.disabled = true;
    try {
      const r = await api(base + '.xlsx?' + qs(), { raw: true });
      if (!r.ok) throw new Error('http ' + r.status);
      const m = /filename\*=UTF-8''([^;]+)/.exec(r.headers.get('content-disposition') || '');
      const a = h('a', { href: URL.createObjectURL(await r.blob()), download: m ? decodeURIComponent(m[1]) : '이용약속기록.xlsx' });
      document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
      toast('내려받았습니다');
    } catch { toast('내려받지 못했습니다'); }
    finally { xl.disabled = false; }
  });
  await load();
}
