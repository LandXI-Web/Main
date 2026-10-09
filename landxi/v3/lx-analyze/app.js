/* lx-analyze — 분석하기(구현 3차 · 확인 대장 14차 길-1 ⓑ 카드 먼저 · 카드-1 ⓐ · 원칙 90 · 93).
   길 하나: 갤러리(카드 한 벌 ①) → 카드 상세 → 어디(시군구 · 여러 곳) → 분석 시작 → 결과는 XI맵.
     ./            갤러리 — 상태 · 분류 거르기 · 찾기 · 카드 4열(휴대폰 1열)
     ./?card=…     카드 상세 — 결과 장면 · 결과 예시(지역별) · 영상 ↔ 결과 · 쓰이는 곳 · 이 카드의 조건 + 오른쪽 '이 카드로 분석'
   지역은 화면이 대신 고르지 않는다(원칙 33) — 직원이 검색해 고른다. 분석은 게이트웨이 작업 대기열(POST /cards/{카드}/analyze = POST /jobs 와 같은 길).
   숫자는 서버(GET /cards/deck · /cards/{카드} — 대표 수치 요약 한 출처). 카드 · 작업 · 배포본 id 는 화면 글자에 없다. */
import * as K from '../kit/index.js';
import { h, api } from '../kit/util.js';
import { sig } from '../kit/sig.js';
import { loadDeck, svcGrid } from '../kit/service-card.js';
import { staffRail } from './menu.js';

const who = await K.gate('lx-console');
const Q = new URLSearchParams(location.search);
const CARD = Q.get('card');
const REGION = Q.get('region');      // 홈 '바로 분석하기'에서 직원이 고른 시군구(화면이 고른 것 아님 — 원칙 33) — 카드 상세의 '어디'에 미리 담는다
const withRegion = (u) => (REGION ? u + (u.includes('?') ? '&' : '?') + new URLSearchParams({ region: REGION }) : u);
const S = K.shell({ who, home: 'lx-analyze', title: 'LX 직원 대시보드', rail: await staffRail('analyze') });
K.devDrawer({ who });
document.body.classList.remove('la-boot');
const page = h('div.la-page');
S.main.append(h('div.la-scroll', {}, page));

const nf = (v) => Number(v).toLocaleString('ko-KR');
const ymd = (s) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || '')); return m ? `${m[1]}.${m[2]}.${m[3]}` : ''; };
const STATE_LV = { ga: '', pilot: 'wait', none: 'gap' };
const chip = (k, word) => h('span.t-chip', { dataset: STATE_LV[k] ? { lv: STATE_LV[k] } : {}, text: word });
const XI = (sgg) => '../xi-clean/' + (sgg ? '?' + new URLSearchParams({ region: sgg }) : '');

if (CARD) await detail(CARD); else await gallery();
document.body.dataset.ready = '1';

/* ═════════════ 갤러리 ═════════════ */
async function gallery() {
  document.title = '분석하기 · Land-XI';
  page.append(h('header.la-head', {}, h('h1.t-h3', { text: '분석하기' }),
    h('p.la-sub', { text: '서비스 카드를 골라 지역을 정하면 AI가 분석합니다 — 결과는 XI맵에서 봅니다' })));
  const tools = h('div.la-tools');
  const grid = h('div.la-grid');
  const box = h('div');
  page.append(tools, box, grid);
  if (REGION) {                                            // 홈에서 들고 온 지역 — 카드를 고르면 그 지역이 '어디'에 담겨 있다
    const regs = await K.loadRegions().catch(() => []);
    const r = regs.find((x) => x.sgg_cd === REGION);
    if (r) page.insertBefore(h('p.la-region', {}, h('b', { text: r.name }), '에서 분석할 카드를 고르세요',
      h('a', { href: './', 'aria-label': '지역 빼기', text: '지역 빼기' })), tools);
  }
  K.empty(box, { kind: 'loading' });
  const deck = await loadDeck();
  box.remove();
  if (!deck) { const e = h('div'); page.append(e); K.empty(e, { kind: 'error', title: '카드를 불러오지 못했습니다', onRetry: () => location.reload() }); return; }
  const all = deck.items || [];
  const F = { st: Q.get('st') || 'all', grp: Q.get('grp') || '', q: '' };
  const count = (k) => all.filter((c) => c.state === k).length;
  const stChips = [['all', '전체', all.length], ['ga', '운영', count('ga')], ['pilot', '시범', count('pilot')], ['none', '첫 결과 전', count('none')]];
  const groups = (deck.groups || []).filter((g) => all.some((c) => c.group === g));
  const chipsEl = h('div.la-chips', { role: 'group', 'aria-label': '거르기' });
  const draw = () => {
    chipsEl.replaceChildren(
      ...stChips.map(([k, w, n]) => h('button.la-chip', { type: 'button', 'aria-pressed': String(F.st === k), onclick: () => { F.st = k; draw(); } }, w, h('small.num', { text: String(n) }))),
      groups.length ? h('span.la-sep', { 'aria-hidden': 'true' }) : null,
      ...groups.map((g) => h('button.la-chip', { type: 'button', 'aria-pressed': String(F.grp === g), onclick: () => { F.grp = F.grp === g ? '' : g; draw(); } }, g)));
    const q = F.q.replace(/\s+/g, '');
    const list = all.filter((c) => (F.st === 'all' || c.state === F.st) && (!F.grp || c.group === F.grp)
      && (!q || [c.name, c.line, c.finds].some((s) => String(s || '').replace(/\s+/g, '').includes(q))));
    if (!list.length) { grid.replaceChildren(); const e = h('div.la-none'); grid.append(e); K.empty(e, { kind: 'first', title: '맞는 카드가 없습니다', text: '거르기를 풀어 보세요', compact: true }); return; }
    grid.classList.remove('la-grid--none');
    svcGrid(grid, list, { kind: 'analyze', href: (c) => withRegion(`?card=${encodeURIComponent(c.id)}`) + '#analyze', more: (c) => withRegion(`?card=${encodeURIComponent(c.id)}`) });
  };
  const search = h('input.t-input.la-search', { type: 'search', placeholder: '카드 이름 · 찾는 것', 'aria-label': '카드 찾기', autocomplete: 'off' });
  search.addEventListener('input', () => { F.q = search.value.trim(); draw(); });
  tools.append(chipsEl, search);
  draw();
  S.fresh(deck.computed_at || deck.as_of);
}

/* ═════════════ 카드 상세 ═════════════ */
async function detail(cid) {
  const box = h('div');
  page.append(box);
  K.empty(box, { kind: 'loading' });
  let c;
  try { c = await api(`/cards/${encodeURIComponent(cid)}`); } catch (e) {
    box.replaceChildren();
    K.empty(box, e.status === 404 ? { kind: '404', title: '없는 카드입니다', action: { label: '분석하기', href: './' } } : { kind: 'error', title: '카드를 불러오지 못했습니다', onRetry: () => location.reload() });
    return;
  }
  box.remove();
  document.title = `${c.name} · 분석하기 · Land-XI`;
  page.classList.add('la-page--dt');

  const crumb = h('nav.la-crumb', { 'aria-label': '위치' }, h('a', { href: './', text: '분석하기' }), h('span', { 'aria-hidden': 'true', text: '›' }), h('b', { text: c.name }));
  const hero = h('figure.la-hero', { class: c.scene ? '' : 'is-blank' });
  if (c.scene) {
    hero.append(h('img', { src: c.scene.src, alt: '', decoding: 'async', fetchpriority: 'high' }));
    if (c.scene.caption) hero.append(h('figcaption.la-cap', { text: c.scene.caption }));
    if (c.scene.ex) hero.append(h('span.la-ex', { text: '다른 지역 결과 · 예시' }));
  } else hero.append(h('span.la-blank', { text: c.state === 'none' ? '첫 결과 전 — 결과가 생기면 장면이 보입니다' : '결과 장면 없음' }));

  const head = h('div.la-dt-head', {},
    h('div.la-tags', {}, chip(c.state, c.state_label), c.version ? h('span.la-tag.num', { text: `v${c.version}` }) : null,
      h('span.la-tag', { text: c.owner ? `담당 ${c.owner}` : '담당 미지정' })),
    h('h1.la-title', { text: c.name }),
    c.line ? h('p.la-line', { text: c.line }) : null);

  const body = h('div.la-dt-body', {}, resultCard(c), compareCard(c), usesCard(c), condCard(c));
  const side = h('aside.la-side', { id: 'analyze', 'aria-label': '이 카드로 분석' });
  page.append(h('div.la-dt', {}, h('div.la-dt-top', {}, crumb, hero, head), side, body));
  analyzePanel(side, c);
  if (location.hash === '#analyze' && matchMedia('(max-width: 1099px)').matches) side.scrollIntoView({ block: 'start' });
  S.fresh(c.as_of);
}

/* 결과 예시 — 큰 숫자(카드의 결과 예시와 같은 값) + 지역별 표 */
function resultCard(c) {
  const sec = h('section.t-card.la-box', { 'aria-label': '결과 예시' }, h('h2.la-h', { text: '결과 예시' }));
  const ex = c.example;
  if (!ex) {                                   // AI 분석 결과(다듬은 결과 수)가 없으면 숫자 없이 — 분석 칸 도형 수는 쓰지 않는다(사용자 규칙 2)
    sec.append(h('p.la-none-t', { text: c.state === 'none' ? '첫 분석 결과가 나오면 여기에 보입니다' : c.example_note === 'AI 분석 결과 있음' ? 'AI 분석 결과는 지역별 지도에서 볼 수 있습니다' : '업무 결과를 아직 세지 않았습니다' }));
    return sec;
  }
  /* 큰 숫자 = AI 분석 결과(원칙 135) — 셈 단위는 서버가 준 그대로(필지 · 동 · 건) */
  const env = { value: ex.value, unit: ex.unit || '', basis: ex.basis, as_of: ex.as_of, source: ex.source };
  const unitW = ex.unit === 'count' ? '건' : ex.unit || '';
  sec.append(h('p.t-label.la-ex-l', { text: [ex.word || 'AI 분석 결과', ex.region, ex.as_of ? `${ymd(ex.as_of)} 기준` : ''].filter(Boolean).join(' · ') }),
    h('div.la-big', { dataset: { metric: ex.label || '', v: String(ex.value) } }, h('b', { text: nf(ex.value) }),
      h('span.u', { text: unitW }), h('span', { html: sig(env) })));
  const key = 'detected';
  const rows = (c.regions || []).filter((r) => r[key] && r[key].value !== null && r.sgg !== ex.sgg);
  if (rows.length) {
    const ul = h('ul.la-rl');
    rows.slice(0, 5).forEach((r) => ul.append(h('li', {}, chip(r.state, r.state_label), h('a', { href: XI(r.sgg), text: r.name }),
      h('span.n.num', { text: nf(r[key].value) }, h('small', { text: r[key].unit === 'count' ? '건' : r[key].unit })))));
    if (rows.length > 5) ul.append(h('li.la-rl-more', { text: `외 ${rows.length - 5}곳` }));
    sec.append(ul);
  }
  return sec;
}

/* 영상 ↔ 결과(같은 자리 · 손잡이) + 결과 장면 여러 장 */
function compareCard(c) {
  const sec = h('section.t-card.la-box', { 'aria-label': '영상과 결과' }, h('h2.la-h', {}, '영상 ↔ 결과', h('small', { text: '같은 자리' })));
  const sw = c.swipe;
  if (sw && sw.before && sw.after) {
    const after = h('img.after', { src: sw.after, alt: '', loading: 'lazy' });
    const bar = h('span.bar', { 'aria-hidden': 'true' }, h('i', { text: '‹ ›' }));
    const range = h('input.la-sw-r', { type: 'range', min: '0', max: '100', value: '50', 'aria-label': '영상과 AI 분석 결과 나눠 보기' });
    const box = h('div.la-sw', {}, h('img.before', { src: sw.before, alt: '', loading: 'lazy' }), after, bar,
      h('span.tag.l', { text: '영상' }), h('span.tag.r', { text: 'AI 분석' }), range);
    const set = (v) => { after.style.clipPath = `inset(0 0 0 ${v}%)`; bar.style.left = v + '%'; };
    range.addEventListener('input', () => set(range.value));
    set(50);
    sec.append(box);
    if (sw.caption) sec.append(h('p.la-cap2', { text: sw.caption }));
  }
  const scenes = (c.scenes || []).filter((s) => s.src && s.src !== c.scene?.src).slice(0, 4);
  if (scenes.length) {
    const big = sec.querySelector('.la-sw');
    const th = h('div.la-thumbs');
    scenes.forEach((s) => th.append(h('figure', {}, h('img', { src: s.src, alt: '', loading: 'lazy' }), s.caption ? h('figcaption', { text: s.caption.split(' · ').pop() }) : null)));
    sec.append(th);
    if (!big && !sw) sec.classList.add('la-box--thumbs');
  }
  if (!sw && !scenes.length) sec.append(h('p.la-none-t', { text: '나란히 볼 장면이 아직 없습니다' }));
  return sec;
}

/* 쓰이는 곳 — 상태별로 지역을 묶어(운영 · 시범 · 첫 결과 전) + 기관 신고 */
function usesCard(c) {
  const sec = h('section.t-card.la-box.la-wide', { 'aria-label': '쓰이는 곳' }, h('h2.la-h', {}, '쓰이는 곳', h('small', { text: c.uses?.text || '' })));
  const groups = new Map();
  for (const r of c.regions || []) {
    const k = `${r.state}|${r.imagery || ''}`;
    if (!groups.has(k)) groups.set(k, { state: r.state, label: r.state_label, imagery: r.imagery, list: [] });
    groups.get(k).list.push(r);
  }
  if (!groups.size) { sec.append(h('p.la-none-t', { text: '아직 적용한 지역이 없습니다' })); return sec; }
  const ul = h('ul.la-use');
  for (const g of [...groups.values()].sort((a, b) => ({ ga: 0, pilot: 1, none: 2 }[a.state] - { ga: 0, pilot: 1, none: 2 }[b.state]))) {
    ul.append(h('li', {}, chip(g.state, g.label),
      h('span.rg', {}, ...g.list.flatMap((r, i) => [i ? ' · ' : '', g.state === 'none' ? r.name : h('a', { href: XI(r.sgg), text: r.name })])),
      h('span.im', { text: g.imagery || (g.state === 'none' ? '영상 등록 필요' : '') })));
  }
  const rp = c.reports?.value;
  if (rp) ul.append(h('li', {}, h('span.t-chip', { dataset: { lv: 'wait' }, text: '기관 신고' }), h('span.rg', { text: `${nf(rp)}건${c.reports_sum ? ` · ${c.reports_sum}` : ''}` }), h('a.im', { href: '../lx-inbox/', text: '요청함' })));
  sec.append(ul);
  return sec;
}

/* 이 카드의 조건 */
function condCard(c) {
  const t = c.time;
  const rows = [
    ['입력 영상', c.imagery || '—'], ['시점', c.timepoints || '—'],
    ['걸리는 시간', t ? t.text : '첫 분석 뒤 표시', t ? '최근 분석 기록' : ''],
    ['찾는 것', c.finds || '—'], ['대조', c.compare || '—'],
    ['버전 · 담당', `${c.version ? 'v' + c.version : '판 없음'} · ${c.owner || '담당 미지정'}`],
  ];
  return h('section.t-card.la-box.la-wide', { 'aria-label': '이 카드의 조건' }, h('h2.la-h', { text: '이 카드의 조건' }),
    h('dl.la-dl', {}, ...rows.map(([k, v, s]) => h('div', {}, h('dt', { text: k }), h('dd', {}, v, s ? h('small', { text: s }) : null)))));
}

/* ═════════════ 이 카드로 분석(오른쪽 고정) ═════════════ */
function analyzePanel(side, c) {
  side.classList.add('t-card');
  side.append(h('h2.la-side-h', { text: '이 카드로 분석' }));
  const manage = h('a.la-alt', { href: `../lx-cards/?card=${encodeURIComponent(c.id)}`, text: '서비스 카드에서 관리하기' });
  if (!c.can_analyze) {
    side.append(h('p.la-cant', { text: c.cant || '아직 이 카드로 분석할 수 없습니다' }),
      h('p.la-note', { text: '분석 모델이 등록되면 여기에서 바로 분석합니다.' }), manage);
    return;
  }
  const picks = new Map();            // sgg → { name, fit }
  const step = (n, title, small) => h('div.la-step', {}, h('i', { text: String(n) }), h('b', { text: title }), small ? h('small', { text: small }) : null);
  const where = h('div.la-where');
  const list = h('ul.la-picks');
  const eta = h('div.la-eta');
  const go = h('button.t-btn.la-go', { type: 'button', text: '분석 시작', disabled: true });
  const msg = h('p.la-note', {}, '작업 대기열에 들어가고,', h('br'), '결과는 XI맵에서 읍면동 순으로 차오릅니다.');
  const done = h('div.la-done', { hidden: true });
  side.append(step(1, '어디', '여러 곳 가능'), where, list, step(2, '결과까지'), eta, go, msg, done, manage);

  K.regionPicker(where, { onPick: (r) => add(r) }).then((rp) => {
    rp.input.placeholder = '시군구 이름으로 찾기'; rp.input.value = '';
    const r = REGION && rp.items.find((x) => x.sgg_cd === REGION);   // 홈에서 직원이 고른 지역
    if (r) add(r);
  });

  async function add(r) {
    const inp = where.querySelector('input'); if (inp) setTimeout(() => { inp.value = ''; }, 0);
    if (!r?.sgg_cd || picks.has(r.sgg_cd) || picks.size >= 5) return;
    picks.set(r.sgg_cd, { name: r.name, fit: null });
    draw();
    let f = null;
    try { f = await api(`/cards/${encodeURIComponent(c.id)}/fit?` + new URLSearchParams({ region: r.sgg_cd })); }
    catch (e) { f = { fits: false, note: e.message || '지금은 확인할 수 없습니다' }; }
    if (picks.has(r.sgg_cd)) { picks.get(r.sgg_cd).fit = f; draw(); }
  }
  function draw() {
    list.replaceChildren(...[...picks.entries()].map(([sgg, p]) => {
      const f = p.fit;
      const line = !f ? h('span.s.wait', { text: '영상과 카드 조건을 보는 중' })
        : f.fits ? h('span.s.ok', { text: `${f.imagery?.word ? f.imagery.word + ' · ' : ''}카드 조건에 맞음 ✓` })
          : f.fits === null ? h('span.s', {}, '등록된 영상이 없습니다 · ', h('a', { href: '../lx-ingest/', text: '데이터 올리기' }))
            : h('span.s.warn', { text: f.note || '이 카드로 분석할 수 없습니다' });
      return h('li', {}, h('div.r1', {}, h('b', { text: p.name }), h('button.la-x', { type: 'button', 'aria-label': `${p.name} 빼기`, text: '×', onclick: () => { picks.delete(sgg); draw(); } })),
        line, ...(f?.fits && f.scope_text ? String(f.scope_text).split(' — ').map((t) => h('span.s.sub', { text: t })) : []),
        f?.running ? h('span.s', {}, '이미 분석 중입니다 · ', h('a', { href: XI(sgg), text: 'XI맵에서 보기' })) : null);
    }));
    const ok = [...picks.entries()].filter(([, p]) => p.fit?.fits && !p.fit.running);
    if (!picks.size) eta.replaceChildren(h('span.la-dash', { text: '—' }), h('span', { text: '지역을 고르면 최근 분석 기록으로 보여 드립니다' }));
    else if (!ok.length) eta.replaceChildren(h('span.la-dash', { text: '—' }), h('span', { text: [...picks.values()].some((p) => !p.fit) ? '확인하는 중' : '분석할 수 있는 지역이 없습니다' }));
    else {
      const secs = ok.map(([, p]) => p.fit.eta?.seconds).filter((x) => x);
      const words = ok.map(([, p]) => `${p.name} ${p.fit.eta?.text || '첫 분석 뒤 표시'}`);
      eta.replaceChildren(ok.length === 1 && secs.length ? h('b', { text: ok[0][1].fit.eta.text }) : h('span.la-dash', { text: `${ok.length}곳` }),
        h('span', { text: ok.length === 1 ? (ok[0][1].fit.eta ? '최근 같은 영상 분석의 실제 속도로' : '첫 분석 뒤 표시') : words.join(' · ') }));
    }
    go.disabled = !ok.length;
    go.textContent = ok.length > 1 ? `${ok.length}곳 분석 시작` : '분석 시작';
  }
  go.addEventListener('click', async () => {
    const ok = [...picks.entries()].filter(([, p]) => p.fit?.fits && !p.fit.running);
    if (!ok.length) return;
    go.disabled = true; go.textContent = '시작하는 중';
    const res = [];
    for (const [sgg, p] of ok) {
      try { const r = await api(`/cards/${encodeURIComponent(c.id)}/analyze`, { method: 'POST', body: { region: sgg } }); res.push({ ok: true, name: p.name, sgg: r.region, running: r.running }); }
      catch (e) { res.push({ ok: false, name: p.name, why: e.message || '시작하지 못했습니다' }); }
    }
    picks.clear(); draw();
    done.hidden = false;
    done.replaceChildren(h('p.la-done-h', { text: res.some((r) => r.ok) ? '분석을 시작했습니다' : '시작하지 못했습니다' }),
      h('ul', {}, ...res.map((r) => h('li', {}, h('b', { text: r.name }), r.ok ? h('a.t-btn.t-btn--text', { href: XI(r.sgg), text: r.running ? '분석 중 · XI맵에서 보기' : 'XI맵에서 보기' }) : h('span.warn', { text: r.why })))));
    if (res.some((r) => r.ok)) K.toast('분석을 시작했습니다 · XI맵에서 결과가 차오릅니다', { action: { label: 'XI맵', href: XI(res.find((r) => r.ok).sgg) } });
  });
  draw();
}
