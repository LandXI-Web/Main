/* 국토 변화 틀 — 이 카드로 분석(오른쪽 칸 · 10-23 원칙 329 · 원칙 327 · 10-25 사용자 "대상지가 왜 정해져 있지? 정해지면 안되는거 아닌가?").
   직원이 이 카드 안에서 혼자 끝낸다: ① 분석할 곳 — 구간 업로드(+ 버퍼 설정) 또는 행정구역(모든 카드와 같은 부품 kit/range-option · 이 틀은 꼭 있어야 함)
     · 구간 목록은 두지 않는다(10-25 사용자 "분석 서비스에 누적 시키는게 아니라 개인이 지도 서비스에 결과를 누적") — 이번 분석의 곳만 정한다.
       구간은 결과에 붙어 지도 서비스 '내 분석' 줄(구간: 이름 · 거리 · 테두리)에 쌓인다. 결과는 카드가 아니라 지도 서비스에서 본다(원칙 337).
   ② 앞 시점 · ③ 뒤 시점 — 시점마다 영상 하나(국토지리정보원 해 · 공유 데이터 · 내 영상 업로드)
   → 분석 시작: 두 시점을 각각 토지피복 AI 로 분석하고 바뀐 곳을 견준다(작업 대기열 · 분석 서비스 작업) → 결과는 지도 서비스.
   같은 틀의 카드(국토 변화 · 산사태 취약지구 — 카드 판 modules.change_types)는 이 칸 하나를 쓴다. 찾는 변화는 서버가 카드 판에서 정한다.
   올리기는 업로드 상태 창 부품(kit/uploads.js uploadPicker)을 그대로 쓴다 — 새 업로드 칸을 만들지 않는다.
   같은 구간 · 같은 두 시점 영상의 끝난 결과가 있으면 다시 돌리지 않고 그 결과를 연다(서버 캐시). id 는 고르기 값으로만(화면 글자에 없음). */
import * as K from '../kit/index.js';
import { h, api, API, session } from '../kit/util.js';
import { modal } from '../kit/modal.js';
import { rangeOption } from '../kit/range-option.js';

/* 틀 안 카드마다 다른 것 — 버퍼 처음 값 · 찾는 변화 한 줄(서버 카드 판과 같은 말) */
const FRAME = {
  'card-landslide': { bufferOn: true, buffer: 50, finds: '산림이 나지 · 도로 · 건물로 바뀐 곳' },
};
const DEF = { bufferOn: false, buffer: 50, finds: '바뀐 곳(신축 · 소실 · 경작 전환 · 포장 확대)' };

function ensureCss() {
  if (document.querySelector('link[data-la-chg]')) return;
  document.head.append(h('link', { rel: 'stylesheet', href: new URL('./change-panel.css', import.meta.url).href, dataset: { laChg: '1' } }));
}

export function changePanel(side, c) {
  ensureCss();
  const CARD = c.id;
  const F = FRAME[CARD] || DEF;
  side.classList.add('t-card', 'la-chg');
  side.append(h('h2.la-side-h', { text: '이 카드로 분석' }));
  const step = (n, title, small) => h('div.la-step', {}, h('i', { text: String(n) }), h('b', { text: title }), small ? h('small', { text: small }) : null);
  const S = { rng: null, imgs: [], seq: 0 };

  /* ① 분석할 곳 — 구간 업로드(+ 버퍼) 또는 행정구역(모든 카드와 같은 부품 · 같은 장부) */
  const tab = (k, label, on) => h('button.la-chip', { type: 'button', 'aria-pressed': String(!!on), dataset: { k }, text: label });
  const rngLine = h('p.la-chg-s', { 'aria-live': 'polite', hidden: true });
  const place = h('div.la-chg-place');
  const ro = rangeOption(place, { endpoint: '/change/ranges', buffer: F.buffer, bufferOn: F.bufferOn, parcelsRow: false, required: true, pnu: true,
    onRange: (r) => { rngLine.hidden = true; if (r) loadRange(r.id, r); else clearRange(); } });

  /* ② · ③ 시점 — 영상 출처 셋 */
  const slot = (key, title) => {
    const kinds = h('div.la-chg-tabs', { role: 'group', 'aria-label': `${title} 영상` },
      tab('ngii', '국토지리정보원', true), tab('shared', '공유 데이터'), tab('own', '내 영상'));
    const pick = h('select.t-input', { 'aria-label': `${title} 영상 고르기` });
    const yr = h('select.t-input.la-chg-yr', { 'aria-label': `${title} 촬영 해`, hidden: true });
    const up = h('button.t-btn.t-btn--text', { type: 'button', text: '내 영상 업로드', hidden: true });
    const hint = h('p.la-chg-s', { hidden: true });
    const o = { key, title, kind: 'ngii', kinds, pick, yr, up, hint, el: h('div.la-chg-slot', {}, kinds, pick, yr, up, hint), want: null };
    kinds.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-k]'); if (!b) return;
      o.kind = b.dataset.k;
      for (const x of kinds.children) x.setAttribute('aria-pressed', String(x === b));
      fill(o);
    });
    pick.addEventListener('change', () => { yearBox(o); ready(); });
    yr.addEventListener('change', ready);
    up.addEventListener('click', () => openUpload(o));
    return o;
  };
  const A = slot('a', '앞 시점'), B = slot('b', '뒤 시점');
  const go = h('button.t-btn.la-go', { type: 'button', text: '분석 시작', disabled: true });
  const note = h('p.la-note', {}, `두 시점 영상을 각각 토지피복 AI로 분석하고 ${F.finds}을 찾습니다.`, h('br'), '작업 대기열에 들어가고, 결과는 지도 서비스에 쌓입니다.');
  side.append(step(1, '분석할 곳', '구간 업로드 · 행정구역'), place, rngLine,
    step(2, '앞 시점', '영상 하나'), A.el, step(3, '뒤 시점', '영상 하나'), B.el, go, note);

  const thisYear = new Date().getFullYear();
  function yearBox(o) {
    const it = o.kind !== 'ngii' ? S.imgs.find((x) => x.id === o.pick.value) : null;
    const need = !!it && !it.year;
    o.yr.hidden = !need;
    if (need && !o.yr.options.length) o.yr.replaceChildren(h('option', { value: '', text: '촬영 해 고르기' }), ...Array.from({ length: thisYear - 1999 }, (_, i) => thisYear - i).map((y) => h('option', { value: String(y), text: `${y}년` })));
  }
  function fill(o) {
    const r = S.rng;
    o.up.hidden = o.kind !== 'own';
    o.hint.hidden = true;
    if (!r) { o.pick.replaceChildren(h('option', { text: S.seqBusy ? '—' : '분석할 곳을 먼저 정하세요' })); o.pick.disabled = true; yearBox(o); ready(); return; }
    let opts = [];
    if (o.kind === 'ngii') {
      const ys = (r.imagery_years || []).map((y) => y.year);
      const def = o.key === 'a' ? ys[0] : ys[ys.length - 1];
      opts = ys.map((y) => h('option', { value: String(y), text: `${y}년 항공영상 · ${(r.imagery_years.find((v) => v.year === y)?.gsd_m || 0.255) < 0.3 ? '25cm' : '51cm'}`, selected: y === def || undefined }));
      if (!opts.length) { o.hint.hidden = false; o.hint.textContent = '이 곳에는 국토지리정보원 항공영상이 없습니다'; }
    } else {
      const list = S.imgs.filter((x) => (o.kind === 'own' ? x.own : !x.own));
      opts = list.map((x) => h('option', { value: x.id, text: [x.name, x.year ? `${x.year}년` : '촬영 해 모름', x.gsd_word, `분석할 곳의 ${x.cover?.value ?? 0}%`].filter(Boolean).join(' · '),
        selected: (o.want && x.id === o.want) || undefined }));
      if (!list.length) { o.hint.hidden = false; o.hint.textContent = o.kind === 'own' ? '이 곳을 덮는 내 영상이 없습니다 — 아래에서 올립니다' : '이 곳을 덮는 공유 데이터 영상이 없습니다'; }
    }
    o.pick.replaceChildren(...opts);
    o.pick.disabled = !opts.length;
    yearBox(o); ready();
  }
  function srcOf(o) {
    if (o.pick.disabled || !o.pick.value) return null;
    if (o.kind === 'ngii') return { kind: 'ngii', year: +o.pick.value };
    const it = S.imgs.find((x) => x.id === o.pick.value); if (!it) return null;
    const y = it.year || +o.yr.value || 0;
    return y ? { kind: 'imagery', id: it.id, year: y } : null;
  }
  function ready() {
    const a = srcOf(A), b = srcOf(B);
    const same = a && b && a.kind === b.kind && (a.kind === 'ngii' ? a.year === b.year : a.id === b.id);
    go.disabled = !S.rng || !a || !b || same;
    go.title = same ? '두 시점에 서로 다른 영상을 고르세요' : '';
  }

  function clearRange() { ++S.seq; S.rng = null; S.imgs = []; fill(A); fill(B); }
  async function loadRange(id, given = null) {
    const my = ++S.seq;
    S.rng = null; S.imgs = [];
    S.seqBusy = true;
    fill(A); fill(B);
    const [r, im] = await Promise.all([given?.imagery_years ? given : api(`/change/ranges/${encodeURIComponent(id)}`).catch(() => null),
      api(`/change/ranges/${encodeURIComponent(id)}/imagery`).catch(() => ({ items: [] }))]);
    if (my !== S.seq) return;
    S.seqBusy = false;
    if (!r) { rngLine.hidden = false; rngLine.textContent = '구간을 불러오지 못했습니다'; fill(A); fill(B); return; }
    S.rng = r; S.imgs = im.items || [];
    fill(A); fill(B);
  }
  /* 내 영상 업로드 — 업로드 상태 창 부품 그대로(다른 화면으로 옮겨도 이어 올림). 다 올리면 그 시점에 고른 채로 */
  function openUpload(o) {
    const box = h('div');
    const no = h('button.t-btn.t-btn--2', { type: 'button', text: '닫기' });
    const m = modal({ title: `${o.title} — 내 영상 업로드`, size: 'lg', body: h('div.la-own-m', {},
      h('p.la-note', { text: '올린 영상은 나만 보고 이 분석에 씁니다 — 공유 데이터에는 들어가지 않습니다. 분석할 곳을 덮는 영상이어야 합니다.' }), box, h('div.la-own-act', {}, no)) });
    no.addEventListener('click', () => m.close());
    import('../kit/uploads.js').then((U) => U.uploadPicker(box, { one: true, purpose: { kind: 'own', card: CARD, cardName: c.name, slot: o.key }, onAdded: () => {
      m.close(true);                     // 진행은 업로드 상태 창(위쪽) — 다 올리면 이 시점에 고른 채로 보인다(lx:upload-done)
    } })).catch(() => { box.textContent = '업로드 칸을 열지 못했습니다'; });
  }
  addEventListener('lx:upload-done', async (e) => {
    const d = e.detail; if (d?.purpose?.kind !== 'own' || d.purpose.card !== CARD) return;
    const o = d.purpose.slot === 'b' ? B : A;
    const id = d.result?.id;
    if (!S.rng) return;
    S.imgs = (await api(`/change/ranges/${encodeURIComponent(S.rng.id)}/imagery`).catch(() => ({ items: S.imgs }))).items || [];
    o.want = id; o.kind = 'own';
    for (const x of o.kinds.children) x.setAttribute('aria-pressed', String(x.dataset.k === 'own'));
    fill(o);
    if (id && !S.imgs.some((x) => x.id === id)) { o.hint.hidden = false; o.hint.textContent = '올린 영상이 분석할 곳과 겹치지 않습니다 — 그 곳을 덮는 영상을 올려 주세요'; }
  });

  go.addEventListener('click', async () => {
    const a = srcOf(A), b = srcOf(B); if (!S.rng || !a || !b) return;
    go.disabled = true; go.textContent = '대기열에 넣는 중';
    try {
      const r = await K.during(api('/change/runs', { method: 'POST', body: { range_id: S.rng.id, src_a: a, src_b: b, via: 'analyze', card_id: CARD } }));
      location.href = '../lx-map/?' + new URLSearchParams({ change: r.job_id });
    } catch (e) { go.textContent = '분석 시작'; ready(); K.toast(e.message || '분석을 시작하지 못했습니다'); }
  });

  clearRange();
}
