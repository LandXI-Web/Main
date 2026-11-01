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
  'card-landslide': { bufferOn: true, buffer: 50, finds: '산림이 벗겨진 곳(벌채 · 임도 · 절개 · 개간 · 신축)', note: '두 시점 영상을 산림 변화 AI로 분석하고 산림이 벗겨진 곳(벌채 · 임도 · 절개 · 개간 · 신축)을 경사와 함께 찾습니다.' },
  // 이지목 현황(카드 ② · 10-28 v5) — 한 시점: 영상 하나를 토지피복 AI로 분석해 필지마다 지목과 실제 쓰임을 견준다
  'card-ijimok': { bufferOn: false, buffer: 0, one: true, note: '영상을 토지피복 AI로 분석하고 필지마다 지목과 실제 쓰임이 맞는지 판정합니다.' },
  // 점유의심 조사(카드 ③) — 같은 곳의 국토 변화(앞 → 뒤 시점) · 이지목 현황(뒤 시점) 결과를 필지로 겹친다(없으면 그 둘을 돌림)
  'card-occupy': { bufferOn: false, buffer: 0, note: '국토 변화(두 시점)와 이지목 현황(뒤 시점) 결과를 필지로 겹쳐 점유의심 목록을 만듭니다.' },
};
const DEF = { bufferOn: false, buffer: 50, finds: '바뀐 곳(신축 · 소실 · 경작 전환 · 포장 확대)' };
/* 찾는 묶음(카드 판 change_types)으로 고르는 칸 — 카드 id 가 정해져 있지 않은 카드(서비스 만들기로 생긴 카드) */
const BY_TYPES = {
  // 공공용지 무단점유(11-01 PM) — 영상 하나면 한 시점 · 앞 시점까지 고르면 신규 표시 · '전국'(고속도로 · 철도 · LH 택지 공공용지 전체)
  publand: { bufferOn: false, buffer: 0, one: true, optA: true, national: true,
    note: '영상 범위 안 공공용지(고속도로 · 철도 · LH 택지 · 도로)에서 무단적치 쓰레기 · 불법 형질변경을 AI로 찾고 연속지적도로 땅 주인을 대조합니다.' },
};

function ensureCss() {
  if (document.querySelector('link[data-la-chg]')) return;
  document.head.append(h('link', { rel: 'stylesheet', href: new URL('./change-panel.css', import.meta.url).href, dataset: { laChg: '1' } }));
}

/* 점유의심 조사(카드 ③ · 명세 v1 §4 · 10-28 사용자 회신) — ① 분석할 곳 ② 근거 결과(국토 변화 · 이지목 현황 — 그 곳의 끝난 결과) ③ 조건 → 목록 · 지도 · 판정.
   AI 를 새로 돌리지 않는다(규칙 기반 교차 · 수 초). 근거 결과가 없으면 ①② 카드로 먼저 분석하도록 바로가기. 목록 규칙 = 서버 config/occupy.yaml 한 곳 */
function occupyPanel(side, c) {
  side.classList.add('t-card', 'la-chg');
  side.append(h('h2.la-side-h', { text: '분석 서비스 카드로 분석' }));
  const step = (n, title, small) => h('div.la-step', {}, h('i', { text: String(n) }), h('b', { text: title }), small ? h('small', { text: small }) : null);
  const S = { rng: null, seq: 0, res: [] };
  const place = h('div.la-chg-place');
  rangeOption(place, { endpoint: '/change/ranges', buffer: 0, bufferOn: false, parcelsRow: false, required: true, pnu: true,
    onRange: (r) => { if (r) load(r.id); else { S.rng = null; S.res = []; fill(); } } });
  const selC = h('select.t-input', { 'aria-label': '국토 변화 결과' }), selI = h('select.t-input', { 'aria-label': '이지목 현황 결과' });
  const chkC = h('input', { type: 'checkbox', checked: true }), chkI = h('input', { type: 'checkbox', checked: true, disabled: true });
  const none = h('p.la-chg-s', { hidden: true });
  const cb = (label, on = true) => { const i = h('input', { type: 'checkbox', checked: on || undefined, value: label }); return { i, el: h('label.la-occ-c', {}, i, h('span', { text: label })) }; };
  const T = ['신축', '경작 전환', '포장 확대'].map((x) => cb(x)), J = ['점유의심', '지목미정리'].map((x) => cb(x));
  const own = h('select.t-input', { 'aria-label': '소유구분' }, ...['전체', '국유지', '시 도유지', '군유지', '개인', '법인', '고속국도 토지', '대장 미연결'].map((x) => h('option', { value: x === '전체' ? '' : x, text: x })));
  const min = h('input.t-input', { type: 'number', min: '0', step: '10', value: '0', 'aria-label': '최소 면적(㎡)' });
  const und = h('input', { type: 'checkbox' });
  const go = h('button.t-btn.la-go', { type: 'button', text: '분석 시작', disabled: true });
  side.append(step(1, '분석할 곳', '구간 업로드 · 필지 목록 · 행정구역'), place,
    step(2, '근거 결과', '그 곳의 끝난 결과'),
    h('label.la-occ-r', {}, chkC, h('span', { text: '국토 변화 결과' })), selC,
    h('label.la-occ-r', {}, chkI, h('span', { text: '이지목 현황 결과' })), selI, none,
    step(3, '조건'), h('div.la-occ-g', {}, h('small', { text: '변화 유형' }), ...T.map((x) => x.el)), h('div.la-occ-g', {}, h('small', { text: '이지목 판정' }), ...J.map((x) => x.el)),
    h('label.la-occ-f', {}, h('small', { text: '소유구분' }), own), h('label.la-occ-f', {}, h('small', { text: '최소 면적(㎡)' }), min),
    h('label.la-occ-r', {}, und, h('span', { text: '미확정 포함' })),
    go, h('p.la-note', { text: '조건에 맞는 필지를 모아 목록 · 지도 · 판정 상태를 만듭니다. 소유구분은 브이월드 토지소유정보에서 종류만 가져옵니다.' }));
  const opt = (x) => h('option', { value: x.job_id, text: `${x.word} · ${String(x.done_at || '').slice(0, 10).replace(/-/g, '.')}` });
  function fill() {
    const cs = S.res.filter((x) => x.card === 'card-change'), is = S.res.filter((x) => x.card === 'card-ijimok');
    selC.replaceChildren(...(cs.length ? cs.map(opt) : [h('option', { value: '', text: S.rng ? '이 곳의 국토 변화 결과 없음' : '분석할 곳을 먼저 정하세요' })]));
    selI.replaceChildren(...(is.length ? is.map(opt) : [h('option', { value: '', text: S.rng ? '이 곳의 이지목 현황 결과 없음' : '분석할 곳을 먼저 정하세요' })]));
    selC.disabled = !cs.length; selI.disabled = !is.length;
    none.hidden = !S.rng || (!!is.length);
    none.replaceChildren(...(S.rng && !is.length ? ['먼저 ', h('a', { href: './?card=card-ijimok#analyze', text: '이지목 현황' }), (cs.length ? '' : ' · '), cs.length ? null : h('a', { href: './?card=card-change#analyze', text: '국토 변화' }), ' 카드로 분석해 주세요'].filter(Boolean) : []));
    go.disabled = !S.rng || !is.length;
  }
  async function load(id) {
    const my = ++S.seq; S.rng = { id }; S.res = [];
    fill();
    const j = await api(`/change/ranges/${encodeURIComponent(id)}/results`).catch(() => ({ items_raw: [] }));
    if (my !== S.seq) return;
    S.res = j.items_raw || []; fill();
  }
  go.addEventListener('click', () => {
    const q = new URLSearchParams({ change: selI.value });
    if (chkC.checked && selC.value) q.set('occupy', selC.value); else q.set('occupy', '-');
    const t = T.filter((x) => x.i.checked).map((x) => x.i.value), jj = J.filter((x) => x.i.checked).map((x) => x.i.value);
    if (t.length < T.length) q.set('o_type', t.join(','));
    if (jj.length < J.length) q.set('o_cls', jj.join(','));
    if (own.value) q.set('o_owner', own.value);
    if (+min.value > 0) q.set('o_min', String(+min.value));
    if (und.checked) q.set('o_und', '1');
    location.href = '../lx-map/?' + q;
  });
  fill();
}

export function changePanel(side, c) {
  ensureCss();
  if (c.id === 'card-occupy') { occupyPanel(side, c); return; }
  const CARD = c.id;
  const F = FRAME[CARD] || BY_TYPES[c.change_types] || DEF;
  side.classList.add('t-card', 'la-chg');
  side.append(h('h2.la-side-h', { text: '분석 서비스 카드로 분석' }));
  const step = (n, title, small) => h('div.la-step', {}, h('i', { text: String(n) }), h('b', { text: title }), small ? h('small', { text: small }) : null);
  /* 11-01 PM "두 시점 카드도 시군구 · 구간 지정 없이 두 영상이 겹치는 범위로 자동 분석" — 기본 = 시점마다 영상 하나(공유 데이터 · 내 영상 · 국토지리정보원)
     → 고른 영상(둘이면 겹치는 곳 · 빈 곳 빼고)이 분석할 곳(서버 POST /change/ranges/from-imagery) → 분석 시작 한 번.
     분석할 곳을 직접 정하려는 사람만 '고급 기능'(구간 업로드 · 행정구역 · 원칙 335). 결과는 낸 사람의 개인 결과(지도 서비스 '내 분석'). */
  const S = { imgs: [], rng: null, auto: null, manual: null, seq: 0, why: '', busy: false };
  const tab = (k, label, on) => h('button.la-chip', { type: 'button', 'aria-pressed': String(!!on), dataset: { k }, text: label });
  const mode = h('div.rg-tabs', { role: 'tablist', 'aria-label': '분석 방식' },
    ...[h('button', { type: 'button', role: 'tab', 'aria-selected': 'true', dataset: { k: 'basic' }, text: '기본' }),
      F.national ? h('button', { type: 'button', role: 'tab', 'aria-selected': 'false', dataset: { k: 'nation' }, text: '전국' }) : null,
      h('button', { type: 'button', role: 'tab', 'aria-selected': 'false', dataset: { k: 'adv' }, text: '고급 기능' })].filter(Boolean));
  const isAdv = () => mode.querySelector('[aria-selected="true"]')?.dataset.k === 'adv';
  const isNation = () => mode.querySelector('[aria-selected="true"]')?.dataset.k === 'nation';
  /* 전국(공공용지 무단점유 · 11-01 PM '전국단위 분석') — 고속도로 · 철도 · LH 택지 공공용지 전체 · 2024년 국토지리정보원 항공영상(전국 25cm) */
  const natBox = h('div.la-nat', { hidden: true });
  const slotEls = [];
  const place = h('div.la-chg-place');
  const advBox = h('div.la-adv', { hidden: true }, place);
  rangeOption(place, { endpoint: '/change/ranges', buffer: F.buffer, bufferOn: F.bufferOn, parcelsRow: false, required: true, pnu: true,
    onRange: (r) => { S.manual = r ? r.id : null; refresh(); } });
  mode.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-k]'); if (!b) return;
    for (const x of mode.children) x.setAttribute('aria-selected', String(x === b));
    advBox.hidden = b.dataset.k !== 'adv';
    if (F.national) { natBox.hidden = b.dataset.k !== 'nation'; for (const el of slotEls) el.hidden = b.dataset.k === 'nation'; }
    if (isNation()) { nation(); return; }
    refresh();
  });
  async function nation() {
    S.seq++; S.busy = true; S.why = ''; S.rng = null; ready();
    natBox.replaceChildren(h('p.la-chg-s', { text: '전국 공공용지 범위를 여는 중' }));
    try {
      const r = await K.during(api('/change/ranges/national', { method: 'POST', body: { card_id: CARD } }));
      S.rng = r;
      const sec = r.estimate?.run_s?.value;
      natBox.replaceChildren(h('p.la-chg-s', { text: '고속도로(도로공사 장부) · 철도용지 · LH 택지 공공용지 전체' }),
        h('p.la-chg-s', { text: '2024년 국토지리정보원 항공영상(25cm)' + (sec ? ` · 지난 전국 분석 ${dur(sec)}` : '') }));
    } catch (e) { S.rng = null; S.why = e.message || '전국 범위를 열지 못했습니다'; natBox.replaceChildren(); }
    S.busy = false; ready();
  }

  /* 시점 하나 — 영상 출처 셋(공유 데이터 · 내 영상 · 국토지리정보원) */
  const slot = (key, title) => {
    const kinds = h('div.la-chg-tabs', { role: 'group', 'aria-label': `${title} 영상` },
      tab('shared', '공유 데이터', true), tab('own', '내 영상'), tab('ngii', '국토지리정보원'));
    const pick = h('select.t-input', { 'aria-label': `${title} 영상 고르기` });
    const yr = h('select.t-input.la-chg-yr', { 'aria-label': `${title} 촬영 해`, hidden: true });
    const sh = h('button.t-btn.t-btn--2.la-chg-sh', { type: 'button', text: '공유 데이터에서 고르기' });   // 공유 영상 목록은 창에서만(11-01 PM)
    const cur = h('p.la-chg-cur', { hidden: true });
    const up = h('button.t-btn.t-btn--text', { type: 'button', text: '내 영상 업로드', hidden: true });
    const hint = h('p.la-chg-s', { hidden: true });
    const del = h('button.la-own-del', { type: 'button', text: '고른 내 영상 지우기', hidden: true });   // 내 영상 지우기(10-31 PM) — 화면 안 확인 한 번
    const o = { key, title, kind: 'shared', kinds, pick, sh, cur, yr, up, del, hint, el: h('div.la-chg-slot', {}, kinds, pick, sh, cur, yr, up, del, hint), want: null };
    sh.addEventListener('click', () => openShared(o));
    del.addEventListener('click', () => { const it = S.imgs.find((x) => x.id === o.pick.value); if (it) import('./own-delete.js').then((m) => m.deleteOwn(it.id, it.name)); });
    kinds.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-k]'); if (!b) return;
      o.kind = b.dataset.k;
      for (const x of kinds.children) x.setAttribute('aria-pressed', String(x === b));
      fill(o); refresh();
    });
    pick.addEventListener('change', () => { yearBox(o); refresh(); });
    yr.addEventListener('change', ready);
    up.addEventListener('click', () => openUpload(o));
    return o;
  };
  const A = slot('a', F.optA ? '비교할 앞 시점' : '앞 시점'), B = slot('b', F.one ? '영상' : '뒤 시점');
  const SL = F.one ? [B] : [A, B];
  const SLR = () => (F.optA ? [B, A] : SL);          // 범위를 정할 때 보는 시점(앞 시점을 고르면 두 영상이 겹치는 곳)
  if (F.optA) {                                   // 앞 시점(고르면 그때 없던 곳 = 신규) — 처음엔 '고르지 않음'
    A.kinds.prepend(tab('none', '고르지 않음', true));
    for (const x of A.kinds.children) x.setAttribute('aria-pressed', String(x.dataset.k === 'none'));
    A.kind = 'none';
  }
  const where = h('div.la-eta');
  const go = h('button.t-btn.la-go', { type: 'button', text: '분석 시작', disabled: true });
  const note = h('p.la-note', {}, F.note || `두 시점 영상을 각각 토지피복 AI로 분석하고 ${F.finds}을 찾습니다.`, h('br'), '작업 대기열에 들어가고, 결과는 지도 서비스에 쌓입니다.');
  if (F.optA) {
    const s1 = step(1, '영상', '영상 하나'), s2 = step(2, '비교할 앞 시점', '고르면 그때 없던 곳을 신규로 표시'), s3 = step(3, '결과까지');
    slotEls.push(s1, B.el, s2, A.el);
    side.append(mode, natBox, s1, B.el, s2, A.el, s3, where, advBox, go, note);
  } else if (F.one) side.append(mode, step(1, '영상', '영상 하나'), B.el, step(2, '결과까지'), where, advBox, go, note);
  else side.append(mode, step(1, '앞 시점', '영상 하나'), A.el, step(2, '뒤 시점', '영상 하나'), B.el, step(3, '결과까지'), where, advBox, go, note);

  const thisYear = new Date().getFullYear();
  function yearBox(o) {
    const it = o.kind !== 'ngii' ? S.imgs.find((x) => x.id === o.pick.value) : null;
    const need = !!it && !it.year;
    o.yr.hidden = !need;
    if (need && !o.yr.options.length) o.yr.replaceChildren(h('option', { value: '', text: '촬영 해 고르기' }), ...Array.from({ length: thisYear - 1999 }, (_, i) => thisYear - i).map((y) => h('option', { value: String(y), text: `${y}년` })));
  }
  function fill(o) {
    if (o.kind === 'none') { o.up.hidden = true; o.del.hidden = true; o.hint.hidden = true; o.yr.hidden = true; o.pick.replaceChildren(h('option', { value: '', text: '한 시점으로 분석' })); o.pick.disabled = true; sharedUi(o); return; }
    o.up.hidden = o.kind !== 'own';
    o.del.hidden = true;
    o.hint.hidden = true;
    const keep = o.pick.value;
    let opts = [];
    if (o.kind === 'ngii') {
      const ys = (S.rng?.imagery_years || []).map((y) => y.year);
      if (!S.rng) opts = [h('option', { value: '', text: F.one ? '고급 기능에서 분석할 곳을 먼저 정하세요' : '다른 시점 영상을 먼저 고르세요' })];
      else {
        const def = o.key === 'a' ? ys[0] : ys[ys.length - 1];
        opts = ys.map((y) => h('option', { value: String(y), text: `${y}년 항공영상 · ${(S.rng.imagery_years.find((v) => v.year === y)?.gsd_m || 0.255) < 0.3 ? '25cm' : '51cm'}`, selected: String(y) === keep || (!keep && y === def) || undefined }));
        if (!opts.length) { o.hint.hidden = false; o.hint.textContent = '이 곳에는 국토지리정보원 항공영상이 없습니다'; }
      }
    } else {
      const list = S.imgs.filter((x) => (o.kind === 'own' ? x.own : !x.own));
      opts = [h('option', { value: '', text: list.length ? '영상 고르기' : '—' }),
        ...list.map((x) => h('option', { value: x.id, disabled: x.fit === 'no' || undefined, text: [x.name, x.year ? `${x.year}년` : '촬영 해 모름', x.gsd_word, x.range].filter(Boolean).join(' · '),
          selected: (o.want ? x.id === o.want : x.id === keep) || undefined }))];
      if (!list.length) { o.hint.hidden = false; o.hint.textContent = o.kind === 'own' ? '올린 내 영상이 없습니다 — 아래에서 올립니다' : '고를 수 있는 공유 데이터 영상이 없습니다'; }
      o.want = null;
    }
    o.pick.replaceChildren(...opts);
    o.pick.disabled = !opts.some((x) => x.value);
    o.del.hidden = !(o.kind === 'own' && o.pick.value);
    yearBox(o);
    sharedUi(o);
  }
  /* 공유 데이터 = 단추 + 고른 영상 하나(목록 상자는 숨김 · 값은 같은 상자가 들고 있어 나머지 코드는 그대로) */
  function sharedUi(o) {
    const on = o.kind === 'shared';
    o.pick.hidden = on;
    o.sh.hidden = !on;
    o.sh.disabled = !S.imgs.some((x) => !x.own);
    const it = on && o.pick.value ? S.imgs.find((x) => x.id === o.pick.value) : null;
    o.cur.hidden = !it;
    o.cur.textContent = it ? [it.name, it.year ? `${it.year}년` : '', it.gsd_word].filter(Boolean).join(' · ') : '';
    o.sh.textContent = it ? '다른 영상 고르기' : '공유 데이터에서 고르기';
  }
  function openShared(o) {
    const list = S.imgs.filter((x) => !x.own);
    const norm = (v) => String(v || '').replace(/\s+/g, '').toLowerCase();
    const find = h('input.t-input', { type: 'search', placeholder: '영상 이름 · 지역으로 찾기', 'aria-label': '영상 찾기', autocomplete: 'off' });
    const ul = h('ul.la-chg-pl');
    const md = modal({ title: `공유 데이터에서 고르기 · ${o.title}`, size: 'lg', body: h('div.la-chg-pk', {}, find, ul) });
    const draw = () => {
      const q = norm(find.value);
      const rows = list.filter((x) => !q || norm([x.name, x.place, x.range, x.when, x.gsd_word, x.year].join(' ')).includes(q));
      ul.replaceChildren(...(rows.length ? rows.map((x) => h('li', {}, h('button.la-chg-pi', { type: 'button', 'aria-pressed': String(o.pick.value === x.id), disabled: x.fit === 'no' || undefined, title: x.fit === 'no' ? (x.note || x.fit_text) : undefined,
        onclick: () => { o.pick.value = x.id; o.pick.dispatchEvent(new Event('change')); sharedUi(o); md.close(); } },
        h('b', { text: x.name }), h('span', { text: [x.year ? `${x.year}년` : '촬영 해 모름', x.gsd_word, x.range].filter(Boolean).join(' · ') }),
        x.fit_text ? h('small', { text: x.fit_text }) : null))) : [h('li.la-chg-pn', { text: q ? '찾는 영상이 없습니다' : '고를 수 있는 공유 데이터 영상이 없습니다' })]));
    };
    find.addEventListener('input', draw); draw(); find.focus();
  }
  function srcOf(o) {
    if (o.kind === 'none') return null;
    if (o.pick.disabled || !o.pick.value) return null;
    if (o.kind === 'ngii') return S.rng ? { kind: 'ngii', year: +o.pick.value } : null;
    const it = S.imgs.find((x) => x.id === o.pick.value); if (!it) return null;
    const y = it.year || +o.yr.value || 0;
    return y ? { kind: 'imagery', id: it.id, year: y } : null;
  }
  const picked = (o) => (o.kind !== 'ngii' && o.kind !== 'none' && o.pick.value ? o.pick.value : null);
  const dur = (s) => (s < 60 ? '1분 안' : s < 3600 ? `약 ${Math.round(s / 60)}분` : `약 ${Math.floor(s / 3600)}시간 ${Math.round((s % 3600) / 60)}분`);
  function drawWhere() {
    const r = S.rng;
    if (S.busy) { where.replaceChildren(h('span.la-dash', { text: '—' }), h('span', { text: '겹치는 곳을 찾는 중' })); return; }
    if (S.why) { where.replaceChildren(h('span.la-dash', { text: '—' }), h('span.warn', { text: S.why })); return; }
    if (!r) { where.replaceChildren(h('span.la-dash', { text: '—' }), h('span', { text: F.one ? '영상을 고르면 보여 드립니다' : '두 시점 영상을 고르면 보여 드립니다' })); return; }
    const e = r.estimate || {};
    const ng = SL.some((o) => o.kind === 'ngii');
    const sec = (e.run_s?.value || 0) + (ng ? (e.fetch_s?.value || 0) : 0);
    const a = r.area?.value;
    const what = isAdv() && S.manual ? '분석할 곳' : (F.one && !F.optA) || SLR().filter(picked).length < 2 ? '영상 범위' : '두 영상이 겹치는 곳';
    where.classList.toggle('is-big', !!(e.big || sec >= 1800));
    where.replaceChildren(sec ? h('b', { text: dur(sec) }) : h('span.la-dash', { text: '—' }),
      h('span', { text: [`${what} 약 ${a >= 1 ? a.toLocaleString('ko-KR', { maximumFractionDigits: 1 }) + '㎢' : (a * 100).toLocaleString('ko-KR', { maximumFractionDigits: 1 }) + 'ha'}`, sec ? '최근 분석 속도로 어림' : '첫 분석 뒤 표시'].join(' · ') }));
  }
  function ready() {
    if (isNation()) {
      go.disabled = !S.rng || S.busy;
      go.title = '';
      where.classList.remove('is-big');
      where.replaceChildren(h('span.la-dash', { text: '—' }), h('span', { text: S.busy ? '여는 중' : S.why || (S.rng ? '전국 공공용지 · 몇 시간 걸립니다(끝나면 알림)' : '') }));
      return;
    }
    const a = F.optA ? (srcOf(A) || srcOf(B)) : F.one ? srcOf(B) : srcOf(A), b = srcOf(B);
    const same = !F.one && a && b && a.kind === b.kind && (a.kind === 'ngii' ? a.year === b.year : a.id === b.id);
    go.disabled = !S.rng || !a || !b || same || S.busy;
    go.title = same ? '두 시점에 서로 다른 영상을 고르세요' : '';
    drawWhere();
  }
  /* 분석할 곳 — 고급 기능에서 정한 곳이 있으면 그 곳 · 아니면 고른 영상(둘이면 겹치는 곳) */
  async function refresh() {
    const my = ++S.seq;
    S.why = '';
    const ids = SLR().map(picked).filter(Boolean);
    const manual = isAdv() && S.manual;
    const waiting = !F.one && !F.optA && ids.length === 1 && SL.some((o) => o.kind !== 'ngii' && !o.pick.value);   // 두 시점 — 다른 시점도 고른 뒤에 겹치는 곳을 찾는다
    if (!manual && (!ids.length || waiting)) {
      S.rng = null; S.busy = false;
      if (SL.every((o) => o.kind === 'ngii')) S.why = '국토지리정보원 영상만으로는 범위가 없습니다 — 고급 기능에서 분석할 곳을 정해 주세요';
      for (const o of SLR()) if (o.kind === 'ngii') fill(o);
      ready(); return;
    }
    S.busy = true; ready();
    let r = null;
    try {
      r = manual ? await api(`/change/ranges/${encodeURIComponent(S.manual)}`).then(async (x) => ({ ...x, estimate: await api(`/change/ranges/${encodeURIComponent(S.manual)}/estimate`).catch(() => null) }))
        : await K.during(api('/change/ranges/from-imagery', { method: 'POST', body: { imagery: ids, card_id: CARD } }));
    } catch (e) { if (my === S.seq) S.why = e.message || '분석할 곳을 정하지 못했습니다'; }
    if (my !== S.seq) return;
    S.busy = false; S.rng = r;
    for (const o of SLR()) if (o.kind === 'ngii') fill(o);
    ready();
  }
  async function loadImgs() {
    S.imgs = (await api(`/cards/${encodeURIComponent(CARD)}/imagery`).catch(() => ({ items: [] }))).items || [];
  }
  /* 내 영상 업로드 — 업로드 상태 창 부품 그대로(다른 화면으로 옮겨도 이어 올림). 다 올리면 그 시점에 고른 채로 */
  function openUpload(o) {
    const box = h('div');
    const no = h('button.t-btn.t-btn--2', { type: 'button', text: '닫기' });
    const m = modal({ title: `${o.title} — 내 영상 업로드`, size: 'lg', body: h('div.la-own-m', {},
      h('p.la-note', { text: '올린 영상은 나만 보고 이 분석에 씁니다 — 공유 데이터에는 들어가지 않습니다.' }), box, h('div.la-own-act', {}, no)) });
    no.addEventListener('click', () => m.close());
    import('../kit/uploads.js').then((U) => U.uploadPicker(box, { one: true, purpose: { kind: 'own', card: CARD, cardName: c.name, slot: o.key }, onAdded: () => {
      m.close(true);                     // 진행은 업로드 상태 창(위쪽) — 다 올리면 이 시점에 고른 채로 보인다(lx:upload-done)
    } })).catch(() => { box.textContent = '업로드 칸을 열지 못했습니다'; });
  }
  addEventListener('lx:own-deleted', async () => {   // 내 영상을 지웠다 — 영상 목록을 다시
    await loadImgs(); for (const o of SLR()) fill(o); refresh();
  });
  addEventListener('lx:upload-done', async (e) => {
    const d = e.detail; if (d?.purpose?.kind !== 'own' || d.purpose.card !== CARD) return;
    const o = d.purpose.slot === 'b' || (F.one && !F.optA) ? B : A;
    const id = d.result?.id;
    await loadImgs();
    o.want = id; o.kind = 'own';
    for (const x of o.kinds.children) x.setAttribute('aria-pressed', String(x.dataset.k === 'own'));
    for (const x of SLR()) if (x !== o) { const k = x.pick.value; x.want = k || null; }
    for (const x of SLR()) fill(x);
    refresh();
    if (id) {
      o.hint.hidden = false;
      o.hint.replaceChildren(`올린 영상: ${d.result?.name || '내 영상'} · `, h('a', { href: '../lx-map/?' + new URLSearchParams({ own: id, ...(d.result?.bounds ? { bb: d.result.bounds.join(',') } : {}) }), target: '_blank', rel: 'noopener', text: '지도에서 보기' }));
    }
  });

  go.addEventListener('click', async () => {
    const nat = isNation();
    const b = nat ? { kind: 'ngii', year: 2024 } : srcOf(B), a = nat ? null : F.optA ? srcOf(A) : F.one ? b : srcOf(A);
    if (!S.rng || !b || (!a && !F.optA && !nat)) return;
    go.disabled = true; go.textContent = '대기열에 넣는 중';
    try {
      const r = await K.during(api('/change/runs', { method: 'POST', body: { range_id: S.rng.id, ...(a ? { src_a: a } : {}), src_b: b, via: 'analyze', card_id: CARD, ...(nat ? { later: true } : {}) } }));
      location.href = '../lx-map/?' + new URLSearchParams({ change: r.job_id, ...(r.occupy ? { occupy: r.occupy } : {}) });
    } catch (e) { go.textContent = '분석 시작'; ready(); K.toast(e.message || '분석을 시작하지 못했습니다'); }
  });

  for (const o of SLR()) { o.pick.replaceChildren(h('option', { text: '—' })); o.pick.disabled = true; o.pick.hidden = true; o.sh.disabled = true; }
  ready();
  loadImgs().then(() => { for (const o of SLR()) fill(o); ready(); });
}
