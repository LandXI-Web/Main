/* 서비스 필지 목록 = 오늘 볼 필지(10-21 원칙 300 · 영농-1 · 2 · 3 · 4) — gov-report ?service= 의 필지 목록 탭과 필지 카드에 붙는 부품.
   · bar      거르기 한 줄(읍면동 → 리 · 종류 · 대장과 다름만 · 메모 없음만 · 정렬) · 휴대폰(≤ 760)은 '거르기' 단추 → 가운데 창
   · band     고른 필지 띠 한 줄 — 'n필지 고름 · 메모 쓰기 · 엑셀로 내려받기 · 고르기 풀기'
   · noteBox  여러 필지 메모 창(메모 200자) — 고른 필지 모두에 같은 메모(POST /spaces/me/guides/{서비스}/parcels/notes)
   · extras   필지 카드 아래 — '시점 비교'(XI맵 가르기 · 그 필지 두 시점) · 메모 칸 하나(지금 메모 · 고쳐 저장) · '이력' 접힘(GET /spaces/me/parcels/{필지}/history)
   메모 = 필지마다 칸 하나 · 기관 화면에만(10-21 영농-D1 ⓐ) — 담당 · 상태 · 날짜 · 진행률 칸은 없다.
   숫자는 모두 서버 값(필지 목록 · 통계와 같은 행) · 지역 고정값 0. */
import { api, h } from '../kit/util.js';
import { toast, devlog } from '../kit/index.js';
import { modal } from '../kit/modal.js';

const nf = (v) => (v === null || v === undefined ? '—' : Number(v).toLocaleString('ko-KR'));
const val = (e) => (e && typeof e === 'object' ? e.value : e);
const dot = (s) => String(s || '').slice(0, 10).replace(/-/g, '.');
const MOBILE = () => matchMedia('(max-width: 760px)').matches;

/* ═════════ 거르기 한 줄 ═════════ */
export function filterBar({ host, state, onChange }) {
  const sel = (label, cls) => h(`select.t-input.sp-sel${cls ? '.' + cls : ''}`, { 'aria-label': label });
  const emd = sel('읍면동'), ri = sel('리', 'sp-ri'), cls = sel('종류'), sort = sel('정렬');
  sort.append(h('option', { value: 'area', text: '넓은 순' }), h('option', { value: 'jibun', text: '지번 순' }));
  const chip = (text, key) => {
    const b = h('button.sp-chip', { type: 'button', 'aria-pressed': 'false', text });
    b.addEventListener('click', () => { state[key] = !state[key]; paintChips(); onChange(); });
    return b;
  };
  const cDiff = chip('대장과 다름만', 'diff'), cNote = chip('메모 없음만', 'nonote');
  const row = h('div.sp-bar', { role: 'group', 'aria-label': '거르기' }, emd, ri, cls, cDiff, cNote, sort);
  const fBtn = h('button.t-btn.t-btn--2.sp-fbtn', { type: 'button', text: '거르기' });
  const wrap = h('div.sp-bar-w', {}, row, fBtn);
  host.before(wrap);
  let facets = null;
  function paintChips() {
    cDiff.setAttribute('aria-pressed', String(!!state.diff));
    cNote.setAttribute('aria-pressed', String(!!state.nonote));
    const n = ['emd', 'cls', 'diff', 'nonote'].filter((k) => state[k]).length;
    fBtn.textContent = n ? `거르기 ${n}` : '거르기';
  }
  function paintRi() {
    const e = (facets?.emds || []).find((x) => x.emd === state.emd);
    const ris = e?.ris || [];
    ri.replaceChildren(h('option', { value: '', text: '리 전체' }), ...ris.map((x) => h('option', { value: x.ri, text: x.ri })));
    ri.hidden = !state.emd || !ris.length;
    if (!ris.some((x) => x.ri === state.ri)) state.ri = '';
    ri.value = state.ri || '';
  }
  emd.addEventListener('change', () => { state.emd = emd.value; state.ri = ''; paintRi(); onChange(); });
  ri.addEventListener('change', () => { state.ri = ri.value; onChange(); });
  cls.addEventListener('change', () => { state.cls = cls.value; onChange(); });
  sort.addEventListener('change', () => { state.sort = sort.value; onChange(); });
  /* 휴대폰 — 같은 칸을 가운데 창으로 옮겨 쓰고, 닫으면 제자리로 */
  fBtn.addEventListener('click', () => {
    const done = h('button.t-btn.sp-done', { type: 'button', text: '보기' });
    const m = modal({ title: '거르기', body: h('div.sp-sheet', {}, row, done), onClose: () => wrap.prepend(row) });
    done.addEventListener('click', () => m.close());
  });
  return {
    set(f) {
      facets = f || {};
      emd.replaceChildren(h('option', { value: '', text: '읍면동 전체' }), ...(facets.emds || []).map((x) => h('option', { value: x.emd, text: `${x.emd} ${nf(val(x.n))}` })));
      emd.value = state.emd || '';
      cls.replaceChildren(h('option', { value: '', text: '종류 전체' }), ...(facets.classes || []).map((x) => h('option', { value: x.name, text: `${x.name} ${nf(val(x.n))}` })));
      cls.value = state.cls || '';
      sort.value = state.sort || 'area';
      cDiff.hidden = !facets.ledger;                               // 올린 대장이 없으면 '대장과 다름' 칸을 내지 않는다
      if (facets.ledger) cDiff.title = `${facets.ledger.name} 기준`;
      paintRi(); paintChips();
    },
    ledger: () => facets?.ledger || null,
  };
}

/* ═════════ 고른 필지 띠 ═════════ */
export function pickBand({ host, card, onNote, onClear }) {
  const n = h('b.sp-n');
  const bNote = h('button.t-btn.sp-b', { type: 'button', text: '메모 쓰기' });
  const bX = h('button.t-btn.t-btn--2.sp-b', { type: 'button', text: '엑셀로 내려받기' });
  const bOff = h('button.t-btn.t-btn--text.sp-off', { type: 'button', text: '고르기 풀기' });
  const band = h('div.sp-band', { role: 'region', 'aria-label': '고른 필지', hidden: true }, n, h('span.sp-acts', {}, bNote, bX, bOff));
  host.append(band);
  let pnus = [];
  bNote.addEventListener('click', () => onNote(pnus.slice()));
  bOff.addEventListener('click', () => onClear());
  bX.addEventListener('click', async () => {
    bX.disabled = true;
    try {
      const r = await api(`/spaces/me/guides/${encodeURIComponent(card)}/parcels.xlsx`, { method: 'POST', raw: true, body: { pnus } });
      if (!r.ok) throw Object.assign(new Error('http ' + r.status), { status: r.status });
      const cd = r.headers.get('content-disposition') || '';
      const m = /filename\*=UTF-8''([^;]+)/.exec(cd);
      const u = URL.createObjectURL(await r.blob());
      const a = h('a', { href: u, download: m ? decodeURIComponent(m[1]) : '고른필지.xlsx' });
      document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(u), 4000);
      toast('내려받았습니다');
    } catch (e) { devlog('pick xlsx', e.message); toast('내려받지 못했습니다'); }
    bX.disabled = false;
  });
  return {
    set(list) {
      pnus = list;
      band.hidden = !list.length;
      n.textContent = `${nf(list.length)}필지 고름`;
      document.body.dataset.pick = list.length ? '1' : '';
    },
  };
}

/* ═════════ 메모 창(한 필지 · 여러 필지 같은 창) ═════════ */
export function noteBox({ card, pnus, where, onSaved }) {
  const memo = h('textarea.t-input.sp-memo', { maxlength: '200', rows: '3', placeholder: '예: 소유자와 통화함 · 다음 주 다시 봄', 'aria-label': '메모' });
  const cnt = h('small.sp-cnt', { text: '0 / 200' });
  memo.addEventListener('input', () => { cnt.textContent = `${memo.value.length} / 200`; });
  const save = h('button.t-btn.sp-save', { type: 'submit', text: '저장' });
  const form = h('form.sp-form', {},
    h('p.sp-who', { text: pnus.length > 1 ? `고른 ${nf(pnus.length)}필지에 같은 메모를 남깁니다.` : (where || '이 필지') }),
    h('label.sp-f', {}, h('span.t-label', { text: '메모' }), memo, cnt),
    h('p.sp-help', { text: '필지마다 지금 메모가 이 글로 바뀌고, 이전 메모는 이력에 남습니다.' }), save);
  const m = modal({ title: pnus.length > 1 ? '메모 쓰기' : '메모', body: form });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!memo.value.trim()) { toast('메모를 적어 주세요'); return; }
    save.disabled = true;
    try {
      const r = await api(`/spaces/me/guides/${encodeURIComponent(card)}/parcels/notes`, { method: 'POST', body: { pnus, note: memo.value.trim() } });
      m.close(true);
      toast(`${nf(val(r.saved))}필지에 메모를 남겼습니다`);
      onSaved?.(r);
    } catch (err) { devlog('note', err.message); toast(err.message || '저장하지 못했습니다'); save.disabled = false; }
  });
  return m;
}

/* ═════════ 필지 카드 아래 — 시점 비교 · 메모 칸 하나 · 이력 ═════════ */
export async function parcelExtras(host, { card, pnu, onSaved }) {
  host.replaceChildren();
  const xi = '/landxi/v3/xi-clean/?' + new URLSearchParams({ region: pnu.slice(0, 5), service: card, pnu, compare: 'auto' });
  const bCmp = h('a.t-btn.t-btn--2.sp-cmp', { href: xi, text: '시점 비교' });
  const chg = h('p.sp-chg', { hidden: true });
  const memo = h('input.t-input.sp-mi', { type: 'text', maxlength: '200', placeholder: '이 필지 메모 — 예: 소유자와 통화함', 'aria-label': '이 필지 메모' });
  const save = h('button.t-btn.sp-ms', { type: 'button', text: '저장' });
  const mWho = h('small.sp-mw');
  const box = h('div.sp-memo-b', {}, h('div.sp-mh', {}, h('b', { text: '메모' }), mWho), h('div.sp-mr', {}, memo, save));
  const list = h('ol.sp-hist');
  const more = h('button.t-btn.t-btn--text.sp-hmore', { type: 'button', text: '더 보기', hidden: true });
  const det = h('details.sp-hd', {}, h('summary', {}, h('span', { text: '이력' }), h('small.sp-hn')), list, more);
  host.append(h('div.sp-x-act', {}, bCmp), chg, box, det);
  let cur = '';
  save.addEventListener('click', async () => {
    const v = memo.value.trim();
    if (!v) { toast('메모를 적어 주세요'); return; }
    if (v === cur) { toast('바뀐 것이 없습니다'); return; }
    save.disabled = true;
    try {
      await api(`/spaces/me/guides/${encodeURIComponent(card)}/parcels/notes`, { method: 'POST', body: { pnus: [pnu], note: v } });
      toast('저장했습니다 · 이력에 남습니다');
      load(lim); onSaved?.();
    } catch (e) { devlog('note', e.message); toast(e.message || '저장하지 못했습니다'); }
    save.disabled = false;
  });
  memo.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing) save.click(); });
  let lim = 10;
  async function load(n) {
    lim = n;
    let j;
    try { j = await api(`/spaces/me/parcels/${encodeURIComponent(pnu)}/history?` + new URLSearchParams({ card, limit: String(n) })); }
    catch (e) { devlog('history', e.message); list.replaceChildren(h('li.sp-h-e', { text: '이력을 불러오지 못했습니다' })); return; }
    if (!host.isConnected) return;
    chg.hidden = !j.change;
    if (j.change) chg.replaceChildren(h('span', { text: j.change.same ? '바뀜 없음' : '바뀜' }), h('b', { text: j.change.line }));
    cur = j.memo?.note || '';
    if (document.activeElement !== memo) memo.value = cur;
    mWho.textContent = j.memo ? [dot(j.memo.at), j.memo.who].filter(Boolean).join(' · ') : '';
    det.querySelector('.sp-hn').textContent = j.total ? `${nf(j.total)}줄` : '없음';
    list.replaceChildren(...(j.items || []).map((x) => h('li', { dataset: { k: x.kind } },
      h('span.sp-h-d.num', { text: x.kind === 'result' && !x.at ? (x.year ? `${x.year}년` : '') : dot(x.at) }),
      h('span.sp-h-t', {}, h('b', { text: x.title }), x.sub || x.who ? h('small', { text: [x.sub, x.who].filter(Boolean).join(' · ') }) : null))));
    if (!(j.items || []).length) list.replaceChildren(h('li.sp-h-e', { text: '이 필지에 남은 기록이 없습니다' }));
    more.hidden = !val(j.more);
    requestAnimationFrame(() => dispatchEvent(new Event('resize')));   // XI ChatGEO 단추가 새로 생긴 메모 칸 · 이력을 비켜 자리를 다시 잡게
  }
  more.addEventListener('click', () => load(lim + 20));
  det.addEventListener('toggle', () => requestAnimationFrame(() => dispatchEvent(new Event('resize'))));
  load(10);
}
