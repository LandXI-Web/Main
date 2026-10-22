/* 다운로드 이력(10-22 원칙 308 · now 21 '다시' · FARM-ADMIN-DESIGN §6-3 · IMPL 1-4) — '이용 약속 기록'을 쉬운 말로.
   한 표: 날짜 · 누가 · 무엇(파일 종류 · 서비스 · 범위) · 개인정보 · 사용 목적 · 활용 기간 · 횟수(같은 파일을 다시 받으면 +1 — 운영 사이트 '다운로드 횟수').
   거르기 셋: 기간 · 사람 · 종류(+ 개인정보 포함만) · 엑셀(.xlsx · 엑셀 한 벌 규칙 — 서버가 같은 줄로 만든다).
   서버 GET /spaces/me/download-history(.xlsx) — 기관 관리자 = 기관 전체 · 부서 사용자 = 자기 것만(서버가 정한다). 숫자는 기록 그대로 센 값.
   mountDownloads(box, { mgr, org }) */
import * as K from '../kit/index.js';
import { api } from '../../shared/api-v1.js';
import { h, esc } from '../kit/util.js';

const ymdOf = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const dot = (s) => String(s || '').slice(0, 10).replace(/-/g, '.');
const when = (s) => (s ? `${dot(s)} ${String(s).slice(11, 16)}` : '—');
const ev = (e) => (e && typeof e === 'object' && 'value' in e ? e.value : e);
const nf = (v) => Number(v || 0).toLocaleString('ko-KR');

export async function mountDownloads(box, { mgr = false, org = '' } = {}) {
  const now = new Date();
  const F = { from: ymdOf(new Date(now.getFullYear(), now.getMonth() - 2, 1)), to: ymdOf(now), who: '', kind: '', personal: '' };
  const from = h('input.t-input.gg-day', { type: 'date', value: F.from, 'aria-label': '기간 시작' });
  const to = h('input.t-input.gg-day', { type: 'date', value: F.to, 'aria-label': '기간 끝' });
  const whoSel = h('select.t-input', { 'aria-label': '누가' }, h('option', { value: '', text: '모든 사람' }));
  const kindSel = h('select.t-input', { 'aria-label': '종류' }, h('option', { value: '', text: '모든 종류' }));
  const perSel = h('select.t-input', { 'aria-label': '개인정보' }, h('option', { value: '', text: '개인정보 전체' }), h('option', { value: '1', text: '개인정보 포함만' }), h('option', { value: '0', text: '개인정보 없음만' }));
  const xl = h('button.t-btn.t-btn--2', { type: 'button', text: '엑셀' });
  const sum = h('p.gg-note', { role: 'status' });
  const tw = h('div.gg-tw');
  box.append(h('div.gg-bar', {},
    h('label.gg-f', {}, h('span.t-label', { text: '기간' }), h('span.gg-r', {}, from, h('i', { text: '~' }), to)),
    mgr ? h('label.gg-f', {}, h('span.t-label', { text: '누가' }), whoSel) : null,
    h('label.gg-f', {}, h('span.t-label', { text: '종류' }), kindSel),
    h('label.gg-f', {}, h('span.t-label', { text: '개인정보' }), perSel), xl),
  h('p.gg-note', {}, mgr ? '기관에서 받은 파일 기록입니다.' : '내가 받은 파일 기록입니다.', h('br'), '개인정보가 든 파일은 받을 때마다 사용 목적 · 기간을 확인합니다.'), sum, tw);
  const qs = () => new URLSearchParams(Object.fromEntries(Object.entries(F).filter(([, v]) => v)));
  const cols = [
    { key: 'at', label: '날짜', fmt: (v) => `<span class="num">${esc(when(v))}</span>` },
    { key: 'who', label: '누가', fmt: (v) => `<b>${esc(v)}</b>` },
    { key: 'what', label: '무엇', fmt: (v) => esc(v) },
    { key: 'personal', label: '개인정보', fmt: (v) => (v ? '<span class="t-chip">포함</span>' : '<span class="gg-dim">없음</span>') },
    { key: 'purpose', label: '사용 목적', fmt: (v) => esc(v || '—') },
    { key: 'until', label: '활용 기간', fmt: (v) => (v ? `<span class="num">${esc(dot(v))}까지</span>` : '—') },
    { key: 'n_v', label: '횟수', num: true, fmt: (v) => `<span class="num">${esc(nf(v))}회</span>` },
  ];
  let filled = false;
  async function load() {
    let j;
    try { j = await api('/spaces/me/download-history?' + qs()); }
    catch (e) { tw.replaceChildren(); const er = h('div'); tw.append(er); K.empty(er, { kind: 'error', title: '불러오지 못했습니다', onRetry: load }); return; }
    if (!filled) {
      filled = true;
      whoSel.append(...(j.facets?.who || []).map((o) => h('option', { value: o.id, text: o.name })));
      kindSel.append(...(j.facets?.kind || []).map((o) => h('option', { value: o.id, text: o.name })));
    }
    const rows = (j.items || []).map((r) => ({ ...r, what: [r.kind, r.service, r.scope].filter(Boolean).join(' · '), n_v: ev(r.n) || 0 }));
    sum.textContent = rows.length ? `파일 ${nf(ev(j.files))}건 · 받은 횟수 ${nf(ev(j.total))}회` : '';
    tw.replaceChildren();
    if (!rows.length) { const e = h('div'); tw.append(e); K.empty(e, { kind: 'first', title: '이 기간에 받은 파일이 없습니다' }); return; }
    K.table(tw, { cols, rows, sort: 'at', dir: 'desc', limit: 30 });
  }
  const set = () => { F.from = from.value; F.to = to.value; F.who = whoSel.value; F.kind = kindSel.value; F.personal = perSel.value; load(); };
  for (const el of [from, to, whoSel, kindSel, perSel]) el.addEventListener('change', set);
  xl.addEventListener('click', async () => {
    xl.disabled = true;
    try {
      const r = await api('/spaces/me/download-history.xlsx?' + qs(), { raw: true });
      if (!r.ok) throw new Error('http ' + r.status);
      const m = /filename\*=UTF-8''([^;]+)/.exec(r.headers.get('content-disposition') || '');
      const a = h('a', { href: URL.createObjectURL(await r.blob()), download: m ? decodeURIComponent(m[1]) : `${org.replace(/\s+/g, '')}_다운로드이력.xlsx` });
      document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
      K.toast('내려받았습니다');
    } catch { K.toast('내려받지 못했습니다'); }
    finally { xl.disabled = false; }
  });
  await load();
}
