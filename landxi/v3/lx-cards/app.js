/* lx-cards — 서비스 카드 관리(구현 3차 · 확인 대장 14차 카드-1 ⓐ ② 자리 · 원칙 51 · 93).
   LX 쪽에서 카드 정보(여덟 칸 · 대표 이미지 · 결과 예시)를 보고 고친다. 같은 카드 부품(kit/service-card.js)의 '관리' 모양.
     ./            우리가 만든 카드 전부(만드는 중 포함) — 상태 · 공개 결재 중 · 기관 신고 · 다음 할 일
     ./?card=…     카드 한 장 고치기 — 왼쪽 미리 보기(분석하기 갤러리와 같은 카드) · 오른쪽 고칠 칸 · 아래 서버 값(고칠 수 없음)
   고칠 수 있는 사람 = 그 카드의 담당 프로젝트장 · LX 관리자(서버가 정한다 — can_edit). 서비스 공개 상태는 결재 기록 그대로 보인다(새 승인 규칙 없음).
   숫자(상태 · 결과 예시 · 쓰이는 곳 · 기관 신고 · 걸리는 시간)는 서버 값이라 고치지 않는다 — 결과 예시는 '어느 지역 값을 보일지'와 '말'만 고른다. */
import * as K from '../kit/index.js';
import { h, api, API, session } from '../kit/util.js';
import { loadDeck, svcCard, svcGrid } from '../kit/service-card.js';
import { staffRail } from '../lx-analyze/menu.js';

const who = await K.gate('lx-console');
const Q = new URLSearchParams(location.search);
const CARD = Q.get('card');
const S = K.shell({ who, home: 'lx-cards', title: 'LX 직원 대시보드', rail: await staffRail('cards') });
K.devDrawer({ who });
document.body.classList.remove('la-boot');
const page = h('div.la-page.lc-page');
S.main.append(h('div.la-scroll', {}, page));

const nf = (v) => Number(v).toLocaleString('ko-KR');
const ymd = (s) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || '')); return m ? `${m[1]}.${m[2]}.${m[3]}` : ''; };
const src = (s) => (String(s || '').startsWith('/api/') ? API.base + s : s);

if (CARD) await edit(CARD); else await list();
document.body.dataset.ready = '1';

/* ═════════════ 목록 ═════════════ */
async function list() {
  document.title = '서비스 카드 · Land-XI';
  page.append(h('header.la-head', {}, h('h1.t-h3', { text: '서비스 카드' }),
    h('p.la-sub', { text: '우리가 만든 카드의 정보 · 대표 이미지 · 결과 예시를 보고 고칩니다' })));
  const tools = h('div.la-tools'), grid = h('div.la-grid'), box = h('div');
  page.append(tools, box, grid);
  K.empty(box, { kind: 'loading' });
  const deck = await loadDeck();
  box.remove();
  if (!deck) { const e = h('div'); page.append(e); K.empty(e, { kind: 'error', title: '카드를 불러오지 못했습니다', onRetry: () => location.reload() }); return; }
  const all = deck.items || [];
  const F = { st: 'all' };
  const n = (f) => all.filter(f).length;
  const CH = [['all', '전체', () => true], ['ga', '운영', (c) => c.state === 'ga'], ['pilot', '시범', (c) => c.state === 'pilot'], ['none', '첫 결과 전', (c) => c.state === 'none'],
    ['pending', '공개 결재 중', (c) => c.publish?.pending], ['reports', '기관 신고 있음', (c) => (c.reports?.value || 0) > 0]].filter(([k, , f]) => k === 'all' || n(f));
  const chips = h('div.la-chips', { role: 'group', 'aria-label': '거르기' });
  const draw = () => {
    chips.replaceChildren(...CH.map(([k, w, f]) => h('button.la-chip', { type: 'button', 'aria-pressed': String(F.st === k), onclick: () => { F.st = k; draw(); } }, w, h('small.num', { text: String(n(f)) }))));
    const f = CH.find(([k]) => k === F.st)[2];
    svcGrid(grid, all.filter(f), { kind: 'manage', more: (c) => `../lx-analyze/?card=${encodeURIComponent(c.id)}` });
  };
  tools.append(chips);
  draw();
  S.fresh(deck.computed_at || deck.as_of);
}

/* ═════════════ 한 장 고치기 ═════════════ */
async function edit(cid) {
  const box = h('div'); page.append(box);
  K.empty(box, { kind: 'loading' });
  let c;
  try { c = await api(`/cards/${encodeURIComponent(cid)}`); } catch (e) {
    box.replaceChildren();
    K.empty(box, e.status === 404 ? { kind: '404', title: '없는 카드입니다', action: { label: '서비스 카드', href: './' } } : { kind: 'error', title: '카드를 불러오지 못했습니다', onRetry: () => location.reload() });
    return;
  }
  box.remove();
  document.title = `${c.name} · 서비스 카드 · Land-XI`;
  const crumb = h('nav.la-crumb', { 'aria-label': '위치' }, h('a', { href: './', text: '서비스 카드' }), h('span', { 'aria-hidden': 'true', text: '›' }), h('b', { text: c.name }));
  const prev = h('div.lc-prev');
  const form = h('form.lc-form', { novalidate: true });
  const facts = h('section.t-card.la-box.lc-facts', { 'aria-label': '서버 값' });
  page.append(crumb, h('div.lc-grid', {}, h('div.lc-left', {}, h('p.t-label.lc-k', { text: '분석하기에 보이는 카드' }), prev, facts), form));

  let cur = c;
  const paint = () => {
    prev.replaceChildren(svcCard({ ...cur, scene: cur.scene ? { ...cur.scene, src: src(cur.scene.src) } : null }, { kind: 'analyze', more: () => `../lx-analyze/?card=${encodeURIComponent(cid)}` }));
    facts.replaceChildren(h('h2.la-h', {}, '서버 값', h('small', { text: '기록에서 계산 — 고치지 않습니다' })),
      h('dl.la-dl.lc-dl', {}, ...[
        ['상태', cur.state_label], ['서비스 공개', cur.publish?.label || '—'],
        ['쓰이는 곳', cur.uses?.text || '—'], ['판 · 담당', `${cur.version ? 'v' + cur.version : '판 없음'} · ${cur.owner || '담당 미지정'}`],
        ['걸리는 시간', cur.time?.text || '첫 분석 뒤 표시'], ['기관 신고', cur.reports?.value ? `${nf(cur.reports.value)}건` : '없음'],
      ].map(([k, v]) => h('div', {}, h('dt', { text: k }), h('dd', { text: v })))),
      cur.edited?.at ? h('p.la-note', { text: `마지막으로 고친 때 ${ymd(cur.edited.at)}` }) : null);
  };
  paint();

  const ro = !c.can_edit;
  const field = (label, input, hint) => h('label.lc-f', {}, h('span.lc-l', { text: label }), input, hint ? h('span.lc-h', { text: hint }) : null);
  const inp = (name, value, ph, max) => h('input.t-input', { name, value: value || '', placeholder: ph || '', maxlength: String(max), autocomplete: 'off', disabled: ro || undefined });

  /* ① 대표 이미지 — 고를 수 있는 결과 장면(이미 공개된 결과 크롭 · LX 가 올린 장면) · 장면 없음 */
  const scenes = c.scenes || [];
  let pick = c.scene_pick?.src || '';
  const sceneBox = h('div.lc-scenes', { role: 'radiogroup', 'aria-label': '대표 이미지' });
  const drawScenes = () => {
    sceneBox.replaceChildren(
      ...scenes.map((s) => h('button.lc-sc', { type: 'button', role: 'radio', 'aria-checked': String(pick === s.src), disabled: ro || undefined, onclick: () => { pick = s.src; drawScenes(); } },
        h('img', { src: src(s.src), alt: '', loading: 'lazy' }), h('span', { text: s.caption || '' }))),
      h('button.lc-sc.lc-sc--none', { type: 'button', role: 'radio', 'aria-checked': String(!pick), disabled: ro || undefined, onclick: () => { pick = ''; drawScenes(); } }, h('span', { text: '장면 없음' })));
  };
  drawScenes();
  const up = h('div.lc-up');
  if (!ro) {
    const file = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp', hidden: true });
    const regSel = h('select.t-input', { 'aria-label': '어느 지역 결과인가요' }, h('option', { value: '', text: '다른 지역 결과(예시로 표시)' }),
      ...(c.regions || []).filter((r) => r.sgg).map((r) => h('option', { value: r.sgg, text: r.name })));
    const cap = h('input.t-input', { placeholder: '설명 한 줄(선택)', maxlength: '40', autocomplete: 'off' });
    const btn = h('button.t-btn.t-btn--2', { type: 'button', text: '결과 장면 올리기' });
    const st = h('p.lc-h');
    btn.addEventListener('click', () => file.click());
    file.addEventListener('change', async () => {
      const f = file.files[0]; if (!f) return;
      btn.disabled = true; st.textContent = '올리는 중'; st.dataset.lv = '';
      const fd = new FormData(); fd.append('file', f); fd.append('region', regSel.value); fd.append('caption', cap.value.trim()); fd.append('use', '1');
      try {
        const r = await fetch(API.prefix + `/cards/${encodeURIComponent(cid)}/scene`, { method: 'POST', body: fd, headers: { authorization: 'Bearer ' + (session.get()?.token || '') } });
        const j = await r.json().catch(() => null);
        if (!r.ok) throw new Error(j?.error?.message || '올리지 못했습니다');
        cur = j; scenes.splice(0, scenes.length, ...(j.scenes || [])); pick = j.scene_pick?.src || pick; drawScenes(); paint();
        st.textContent = '올렸습니다 — 대표 이미지로 골랐습니다'; cap.value = '';
        K.toast('결과 장면을 올렸습니다');
      } catch (e) { st.textContent = e.message; st.dataset.lv = 'warn'; }
      btn.disabled = false; file.value = '';
    });
    up.append(h('p.lc-h', { text: '결과가 보이는 장면만 올립니다. 밖으로 내보낼 수 없는 영상의 장면은 올리지 않습니다.' }),
      h('div.lc-up-row', {}, regSel, cap, btn), file, st);
  }

  /* ② 이름 · 무엇을 찾나 · 분류 */
  const I = c.info || {};
  const name = inp('name', c.name, '', 40);
  const line = inp('line', I.line, c.line || '한 줄로 — 무엇을 찾아 무엇을 남기나', 60);
  const grp = h('select.t-input', { name: 'group', disabled: ro || undefined }, h('option', { value: '', text: '분류 없음' }),
    ...(c.groups || []).map((g) => h('option', { value: g, text: g, selected: (I.grp || c.group) === g || undefined })));

  /* ③ 결과 예시 — 어느 지역 값을 보일지 · 말(AI 탐지 수일 때) */
  const withVal = (c.regions || []).filter((r) => (r.field_check && r.field_check.value) || (r.detected && r.detected.value));
  const exSel = h('select.t-input', { name: 'result_sgg', disabled: ro || undefined }, h('option', { value: '', text: '자동 — 운영 지역 · 현장 확인 필요가 있는 곳 먼저' }),
    ...withVal.map((r) => {
      const e = r.field_check && r.field_check.value ? r.field_check : r.detected;
      return h('option', { value: r.sgg, text: `${r.name} · ${e.label} ${nf(e.value)}`, selected: c.result_sgg === r.sgg || undefined });
    }));
  const word = inp('result_word', c.result_word, 'AI 탐지 건', 20);

  /* ④ 조건 */
  const imagery = inp('imagery', I.imagery, c.imagery || '', 40);
  const tp = inp('timepoints', I.timepoints, c.timepoints || '', 40);
  const finds = inp('finds', I.finds, c.finds || '', 60);
  const compare = inp('compare', I.compare, c.compare || '', 60);

  const save = h('button.t-btn.lc-save', { type: 'submit', text: '저장', disabled: ro || undefined });
  const msg = h('p.lc-msg', { role: 'status' });
  form.append(
    h('section.t-card.lc-sec', {}, h('h2.la-h', { text: '대표 이미지' }), sceneBox, up),
    h('section.t-card.lc-sec', {}, h('h2.la-h', { text: '이름 · 무엇을 찾나' }), field('이름', name), field('무엇을 찾나', line, '카드에 두 줄까지 보입니다'), field('분류', grp, '분석하기의 거르기 칩')),
    h('section.t-card.lc-sec', {}, h('h2.la-h', {}, '결과 예시', h('small', { text: '숫자는 서버 값 그대로' })), field('보일 지역', exSel), field('말', word, 'AI 탐지 수일 때만 — 예: 비닐하우스 동')),
    h('section.t-card.lc-sec', {}, h('h2.la-h', { text: '이 카드의 조건' }), field('입력 영상', imagery), field('시점', tp), field('찾는 것', finds), field('대조', compare)),
    h('div.lc-act', {}, ro ? h('p.lc-h', { text: '이 카드의 담당 프로젝트장과 LX 관리자가 고칩니다' }) : null, msg, save));

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (ro) return;
    save.disabled = true; msg.textContent = '저장하는 중'; msg.dataset.lv = '';
    const body = {
      name: name.value.trim(), line: line.value, group: grp.value, result_sgg: exSel.value, result_word: word.value,
      imagery: imagery.value, timepoints: tp.value, finds: finds.value, compare: compare.value, scene: pick ? { src: pick } : null,
    };
    try {
      cur = await api(`/cards/${encodeURIComponent(cid)}`, { method: 'PUT', body });
      paint(); msg.textContent = '저장했습니다 — 분석하기 · 기관 화면 카드에 바로 보입니다';
      K.toast('저장했습니다', { action: { label: '분석하기에서 보기', href: `../lx-analyze/?card=${encodeURIComponent(cid)}` } });
    } catch (err) { msg.textContent = err.message || '저장하지 못했습니다'; msg.dataset.lv = 'warn'; }
    save.disabled = false;
  });
  S.fresh(c.as_of);
}
