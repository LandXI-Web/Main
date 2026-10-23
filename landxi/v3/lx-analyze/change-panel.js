/* 국토 변화 분석서비스 — 이 카드로 분석(오른쪽 칸 · 10-23 원칙 329 · 원칙 327).
   직원이 이 카드 안에서 혼자 끝낸다: ① 대상지(이미 있는 대상지 고르기 · 구역선 파일 + 버퍼 · 필지(PNU) 목록 올리기)
   ② 앞 시점 · ③ 뒤 시점 — 시점마다 영상 하나(국토지리정보원 해 · 공유 데이터 · 내 영상 업로드)
   → 분석 시작: 두 시점을 각각 토지피복 AI 로 분석하고 바뀐 곳을 견준다(작업 대기열 · 분석 서비스 작업) → 결과는 지도 서비스.
   올리기는 업로드 상태 창 부품(kit/uploads.js uploadPicker · 관리자 공유 데이터 올리기와 같은 부품)을 그대로 쓴다 — 새 업로드 칸을 만들지 않는다.
   같은 대상지 · 같은 두 시점 영상의 끝난 결과가 있으면 다시 돌리지 않고 그 결과를 연다(서버 캐시). id 는 고르기 값으로만(화면 글자에 없음). */
import * as K from '../kit/index.js';
import { h, api, API, session } from '../kit/util.js';
import { modal } from '../kit/modal.js';

const CARD = 'card-change';

function ensureCss() {
  if (document.querySelector('link[data-la-chg]')) return;
  document.head.append(h('link', { rel: 'stylesheet', href: new URL('./change-panel.css', import.meta.url).href, dataset: { laChg: '1' } }));
}

export function changePanel(side, c) {
  ensureCss();
  side.classList.add('t-card', 'la-chg');
  side.append(h('h2.la-side-h', { text: '이 카드로 분석' }));
  const step = (n, title, small) => h('div.la-step', {}, h('i', { text: String(n) }), h('b', { text: title }), small ? h('small', { text: small }) : null);
  const S = { ranges: [], rng: null, imgs: [], seq: 0 };

  /* ① 대상지 */
  const sel = h('select.t-input', { 'aria-label': '대상지' });
  const rngLine = h('p.la-chg-s', { 'aria-live': 'polite' });
  const newBtn = h('button.t-btn.t-btn--text.la-chg-new', { type: 'button', 'aria-expanded': 'false', text: '새 대상지 올리기' });
  const tab = (k, label, on) => h('button.la-chip', { type: 'button', 'aria-pressed': String(!!on), dataset: { k }, text: label });
  const tabs = h('div.la-chg-tabs', { role: 'group', 'aria-label': '대상지 올리는 방식' }, tab('line', '구역선 파일', true), tab('pnu', '필지(PNU) 목록'));
  const nameIn = h('input.t-input', { type: 'text', maxlength: '60', placeholder: '대상지 이름(예: 고속국도 ○○IC 구간)', 'aria-label': '대상지 이름' });
  const fileIn = h('input.la-chg-file', { type: 'file', accept: '.geojson,.json,.zip,.gpkg', 'aria-label': '구역선 파일' });
  const pnuTa = h('textarea.t-input.la-chg-pnu', { rows: '3', placeholder: 'PNU 19자리를 줄마다 붙여 넣기', 'aria-label': '필지(PNU) 목록' });
  const pnuFile = h('input.la-chg-file', { type: 'file', accept: '.txt,.csv', 'aria-label': '필지 목록 파일' });
  const bufIn = h('input.t-input.la-chg-buf', { type: 'number', min: '0', max: '1000', step: '10', value: '50', 'aria-label': '버퍼(m)' });
  const mk = h('button.t-btn.t-btn--2', { type: 'button', text: '대상지 만들기' });
  const mkLine = h('p.la-chg-s', { 'aria-live': 'polite', hidden: true });
  const lineBox = h('label.la-chg-fl', {}, h('span', { text: '구역선 파일 — geojson · shp 압축(zip) · gpkg' }), fileIn);
  const pnuBox = h('div.la-chg-pb', { hidden: true }, pnuTa, h('label.la-chg-fl', {}, h('span', { text: '또는 목록 파일(txt · csv)' }), pnuFile));
  const form = h('div.la-chg-form', { hidden: true }, tabs, nameIn, lineBox, pnuBox,
    h('label.la-chg-br', {}, h('span', { text: '버퍼' }), bufIn, h('span', { text: 'm' })), mk, mkLine);
  let mode = 'line';
  tabs.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-k]'); if (!b) return;
    mode = b.dataset.k;
    for (const x of tabs.children) x.setAttribute('aria-pressed', String(x === b));
    lineBox.hidden = mode !== 'line'; pnuBox.hidden = mode !== 'pnu';
  });
  pnuFile.addEventListener('change', async () => { const f = pnuFile.files?.[0]; if (f) pnuTa.value = await f.text(); });
  newBtn.addEventListener('click', () => { form.hidden = !form.hidden; newBtn.setAttribute('aria-expanded', String(!form.hidden)); });

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
  const note = h('p.la-note', {}, '두 시점 영상을 각각 토지피복 AI로 분석하고 바뀐 곳(신축 · 소실 · 경작 전환 · 포장 확대)을 견줍니다.', h('br'), '작업 대기열에 들어가고, 결과는 지도 서비스에 쌓입니다.');
  side.append(step(1, '대상지', '구역선 · 필지 범위'), sel, rngLine, newBtn, form,
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
    if (!r) { o.pick.replaceChildren(h('option', { text: '대상지를 먼저 고르세요' })); o.pick.disabled = true; yearBox(o); ready(); return; }
    let opts = [];
    if (o.kind === 'ngii') {
      const ys = (r.imagery_years || []).map((y) => y.year);
      const def = o.key === 'a' ? ys[0] : ys[ys.length - 1];
      opts = ys.map((y) => h('option', { value: String(y), text: `${y}년 항공영상 · ${(r.imagery_years.find((v) => v.year === y)?.gsd_m || 0.255) < 0.3 ? '25cm' : '51cm'}`, selected: y === def || undefined }));
      if (!opts.length) { o.hint.hidden = false; o.hint.textContent = '이 대상지에는 국토지리정보원 항공영상이 없습니다'; }
    } else {
      const list = S.imgs.filter((x) => (o.kind === 'own' ? x.own : !x.own));
      opts = list.map((x) => h('option', { value: x.id, text: [x.name, x.year ? `${x.year}년` : '촬영 해 모름', x.gsd_word, `대상지의 ${x.cover?.value ?? 0}%`].filter(Boolean).join(' · '),
        selected: (o.want && x.id === o.want) || undefined }));
      if (!list.length) { o.hint.hidden = false; o.hint.textContent = o.kind === 'own' ? '이 대상지를 덮는 내 영상이 없습니다 — 아래에서 올립니다' : '이 대상지를 덮는 공유 데이터 영상이 없습니다'; }
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

  async function loadRange(id) {
    const my = ++S.seq;
    S.rng = null; S.imgs = [];
    rngLine.textContent = '대상지를 불러오는 중'; fill(A); fill(B);
    const [r, im] = await Promise.all([api(`/change/ranges/${encodeURIComponent(id)}`).catch(() => null),
      api(`/change/ranges/${encodeURIComponent(id)}/imagery`).catch(() => ({ items: [] }))]);
    if (my !== S.seq) return;
    if (!r) { rngLine.textContent = '대상지를 불러오지 못했습니다'; return; }
    S.rng = r; S.imgs = im.items || [];
    rngLine.textContent = `${r.kind_label} · 버퍼 ${r.buffer} · 범위 ${Number(r.area?.value ?? 0).toLocaleString('ko-KR', { maximumFractionDigits: 2 })}㎢`;
    fill(A); fill(B);
  }
  async function loadList(pickId) {
    let j;
    try { j = await api('/change/ranges'); } catch { sel.replaceChildren(h('option', { text: '대상지를 불러오지 못했습니다' })); sel.disabled = true; return; }
    S.ranges = j.items || [];
    if (!S.ranges.length) {
      sel.replaceChildren(h('option', { text: '아직 대상지가 없습니다 — 아래에서 올립니다' })); sel.disabled = true;
      rngLine.textContent = ''; form.hidden = false; newBtn.setAttribute('aria-expanded', 'true'); fill(A); fill(B); return;
    }
    sel.disabled = false;
    const cur = pickId || sel.value || S.ranges[0].id;
    sel.replaceChildren(...S.ranges.map((x) => h('option', { value: x.id, text: `${x.name} · ${x.kind_label}`, selected: x.id === cur || undefined })));
    await loadRange(sel.value);
  }
  sel.addEventListener('change', () => loadRange(sel.value));

  mk.addEventListener('click', async () => {
    const buf = Math.max(0, Math.min(1000, +bufIn.value || 0));
    const name = nameIn.value.trim();
    mk.disabled = true; mkLine.hidden = false; mkLine.textContent = '대상지를 만드는 중';
    try {
      let r;
      if (mode === 'line') {
        const f = fileIn.files?.[0];
        if (!f) throw new Error('구역선 파일을 고르세요');
        const fd = new FormData();
        fd.append('file', f); fd.append('buffer_m', String(buf)); fd.append('name', name || f.name.replace(/\.[^.]+$/, '')); fd.append('origin', 'card');
        const s = session.get();
        const res = await fetch(API.prefix + '/change/ranges', { method: 'POST', body: fd, headers: s ? { authorization: 'Bearer ' + s.token } : {} });
        r = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(r?.error?.message || '대상지를 만들지 못했습니다');
      } else {
        if (!pnuTa.value.trim()) throw new Error('필지(PNU) 목록을 붙여 넣으세요');
        r = await api('/change/ranges', { method: 'POST', body: { name: name || '필지 목록', buffer_m: buf, pnus: pnuTa.value, origin: 'card' } });
      }
      mkLine.textContent = '대상지를 만들었습니다';
      form.hidden = true; newBtn.setAttribute('aria-expanded', 'false');
      fileIn.value = ''; pnuTa.value = ''; nameIn.value = '';
      await loadList(r.id);
    } catch (e) { mkLine.textContent = e.message || '대상지를 만들지 못했습니다'; }
    finally { mk.disabled = false; }
  });

  /* 내 영상 업로드 — 업로드 상태 창 부품 그대로(다른 화면으로 옮겨도 이어 올림). 다 올리면 그 시점에 고른 채로 */
  function openUpload(o) {
    const box = h('div');
    const no = h('button.t-btn.t-btn--2', { type: 'button', text: '닫기' });
    const m = modal({ title: `${o.title} — 내 영상 업로드`, size: 'lg', body: h('div.la-own-m', {},
      h('p.la-note', { text: '올린 영상은 나만 보고 이 분석에 씁니다 — 공유 데이터에는 들어가지 않습니다. 대상지를 덮는 영상이어야 합니다.' }), box, h('div.la-own-act', {}, no)) });
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
    if (id && !S.imgs.some((x) => x.id === id)) { o.hint.hidden = false; o.hint.textContent = '올린 영상이 이 대상지와 겹치지 않습니다 — 대상지를 덮는 영상을 올려 주세요'; }
  });

  go.addEventListener('click', async () => {
    const a = srcOf(A), b = srcOf(B); if (!S.rng || !a || !b) return;
    go.disabled = true; go.textContent = '대기열에 넣는 중';
    try {
      const r = await K.during(api('/change/runs', { method: 'POST', body: { range_id: S.rng.id, src_a: a, src_b: b, via: 'analyze' } }));
      location.href = '../lx-map/?' + new URLSearchParams({ change: r.job_id });
    } catch (e) { go.textContent = '분석 시작'; ready(); K.toast(e.message || '분석을 시작하지 못했습니다'); }
  });

  loadList();
}
