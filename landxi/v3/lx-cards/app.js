/* lx-cards — 서비스 카드 관리(구현 3차 · 확인 대장 14차 카드-1 ⓐ ② 자리 · 원칙 51 · 93).
   LX 쪽에서 카드 정보(여덟 칸 · 카드 그림 · 결과 예시)를 보고 고친다. 같은 카드 부품(kit/service-card.js)의 '관리' 모양.
     ./            우리가 만든 카드 전부(만드는 중 포함) — 상태 · 공개 결재 중 · 기관 신고 · 다음 할 일
     ./?card=…     카드 한 장 고치기 — 왼쪽 미리 보기(분석하기 갤러리와 같은 카드) · 오른쪽 고칠 칸 · 아래 서버 값(고칠 수 없음)
   고칠 수 있는 사람 = 그 카드의 담당 프로젝트장 · LX 관리자(서버가 정한다 — can_edit). 서비스 공개 상태는 결재 기록 그대로 보인다(새 승인 규칙 없음).
   숫자(상태 · 결과 예시 · 쓰이는 곳 · 기관 신고 · 걸리는 시간)는 서버 값이라 고치지 않는다 — 결과 예시는 '어느 지역 값을 보일지'와 '말'만 고른다. */
import * as K from '../kit/index.js';
import { h, api, API, session } from '../kit/util.js';
import { loadDeck, svcCard, svcGrid } from '../kit/service-card.js';
import { staffRail } from '../lx-analyze/menu.js';
import { swipePic } from '../kit/swipe.js';
import { RAIL, TABS } from '../ops-infra/js/rail.js';   // LX 관리자로 열면 관리자 틀 · 배포 메뉴(같은 메뉴 한 곳)

const who = await K.gate('lx-console');
const Q = new URLSearchParams(location.search);
const CARD = Q.get('card');
const ADMIN = who.key === 'lx/admin';   // 관리자 = 관리자 틀 · 배포 › 배포된 카드 탭 / 프로젝트장(직원) = 직원 틀(같은 화면 · 고칠 권한은 서버 can_edit)
const OI = '/landxi/v3/ops-infra/';
const S = ADMIN
  ? K.shell({ who, home: 'ops-infra', title: 'LX 관리자 대시보드', rail: { kind: 'menu', items: RAIL.map((r) => (r.href.startsWith('#') ? { ...r, href: OI + r.href } : r)), current: RAIL.findIndex((r) => r.id === 'deploys') } })
  : K.shell({ who, home: 'lx-cards', title: 'LX 직원 대시보드', rail: await staffRail('analyze') });   // 서비스 카드는 메뉴 칸이 없다 — 들어오는 길 '분석하기'(서비스카드-1 ⓐ)
if (ADMIN) {
  document.head.append(h('link', { rel: 'stylesheet', href: '../ops-infra/improve.css' }));
  const r = document.querySelector('.k-role'), b = r?.querySelector('b');
  if (b && r.textContent.slice(b.textContent.length).trim() === b.textContent.trim()) b.remove();
}
K.devDrawer({ who });
document.body.classList.remove('la-boot');
const page = h('div.la-page.lc-page');
if (ADMIN) page.append(h('div.im-head.lc-tabs', {}, h('nav.im-tabs', { role: 'tablist', 'aria-label': '배포' }, ...TABS.map(([k, t, path]) => h('button', { type: 'button', role: 'tab', 'aria-selected': String(k === 'cards'),
  onclick: () => { if (k !== 'cards') location.href = OI + '#/deploys' + path; else if (CARD) location.href = './'; } }, h('span', { text: t }))))));
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
    h('p.la-sub', { text: '우리가 만든 카드의 정보 · 카드 그림 · 결과 예시를 보고 고칩니다' })));
  const tools = h('div.la-tools'), grid = h('div.la-grid'), box = h('div');
  page.append(tools, box, grid);
  K.empty(box, { kind: 'loading' });
  const deck = await loadDeck();
  box.remove();
  if (!deck) { const e = h('div'); page.append(e); K.empty(e, { kind: 'error', title: '카드를 불러오지 못했습니다', onRetry: () => location.reload() }); return; }
  const all = deck.items || [];
  const F = { st: 'all' };
  const n = (f) => all.filter(f).length;
  const CH = [['all', '전체', () => true], ['ga', '운영 중', (c) => c.state === 'ga'], ['pilot', '시범 적용', (c) => c.state === 'pilot'], ['none', '첫 결과 전', (c) => c.state === 'none'],
    ['pending', '공개 승인 요청 중', (c) => c.publish?.pending], ['reports', '기관 검토 요청 있음', (c) => (c.reports?.value || 0) > 0]].filter(([k, , f]) => k === 'all' || n(f));
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
  const lcLeft = h('div.lc-left', {}, h('p.t-label.lc-k', { text: '분석 서비스에 보이는 카드' }), prev, facts);
  page.append(crumb, h('div.lc-grid', {}, lcLeft, form));
  K.panes(lcLeft, { edge: 'right', key: 'left', cssVar: '--lc-left', min: 280, max: 560, otherMin: 480, below: 1100 });   // 칸 크기 조절(원칙 263)

  let cur = c;
  const paint = () => {
    /* 응답의 as_of 는 응답 시각 — 카드의 기준일은 결과 예시의 기준일(덱과 같은 값) */
    prev.replaceChildren(svcCard({ ...cur, as_of: cur.example?.as_of || null, scene: cur.scene ? { ...cur.scene, src: src(cur.scene.src) } : null }, { kind: 'analyze', more: () => `../lx-analyze/?card=${encodeURIComponent(cid)}` }));
    facts.replaceChildren(h('h2.la-h', {}, '서버 값', h('small', { text: '기록에서 계산 — 고치지 않습니다' })),
      h('dl.la-dl.lc-dl', {}, ...[
        ['상태', cur.state_label], ['서비스 공개', cur.publish?.label || '—'],
        ['쓰이는 곳', cur.uses?.text || '—'], ['판 · 담당', `${cur.version ? 'v' + cur.version : '판 없음'} · ${cur.owner || '담당 미지정'}`],
        ['걸리는 시간', cur.time?.text || '첫 분석 뒤 표시'], ['기관 검토 요청', cur.reports?.value ? `${nf(cur.reports.value)}건${cur.reports_sum ? ` · ${cur.reports_sum}` : ''}` : '없음'],
      ].map(([k, v]) => h('div', {}, h('dt', { text: k }), h('dd', { text: v })))),
      cur.edited?.at ? h('p.la-note', { text: `마지막으로 고친 때 ${ymd(cur.edited.at)}` }) : '');
  };
  paint();

  const ro = !c.can_edit;
  const field = (label, input, hint) => h('label.lc-f', {}, h('span.lc-l', { text: label }), input, hint ? h('span.lc-h', { text: hint }) : null);
  const inp = (name, value, ph, max) => h('input.t-input', { name, value: value || '', placeholder: ph || '', maxlength: String(max), autocomplete: 'off', disabled: ro || undefined });

  /* ① 카드 그림 — 원본 ↔ AI 결과 한 장(10-25 원칙 339) · 다른 후보(규칙으로 고른 틀 · 한 번 눌러 바꿈) · '새 후보 있음' · 두 장 올리기(작은 링크) */
  const coverSec = h('section.t-card.lc-sec.lc-cover', { 'aria-label': '카드 그림' });
  const putSwipe = async (sw, okText) => {
    cur = await api(`/cards/${encodeURIComponent(cid)}`, { method: 'PUT', body: { swipe: sw } });
    drawCover(); paint(); K.toast(okText);
  };
  const upScene = async (f, region) => {
    const fd = new FormData(); fd.append('file', f); fd.append('region', region); fd.append('caption', ''); fd.append('use', '0');
    const r = await fetch(API.prefix + `/cards/${encodeURIComponent(cid)}/scene`, { method: 'POST', body: fd, headers: { authorization: 'Bearer ' + (session.get()?.token || '') } });
    const j = await r.json().catch(() => null);
    if (!r.ok) throw new Error(j?.error?.message || '올리지 못했습니다');
    return (j.scenes || []).at(-1)?.src;
  };
  let twoOpen = false;
  const drawCover = () => {
    const sw = cur.swipe || {};
    const pair = cur.scene && sw.cover && sw.before ? { src: cur.scene.src, swipe: sw } : null;
    const main = h('div.lc-cv-main', {}, pair ? swipePic(pair) : cur.scene ? h('img', { src: src(cur.scene.src), alt: '' }) : h('span.lc-cv-none', { text: '그림 없음' }));
    const cands = (sw.cands || []).slice(0, 3);
    const row = cands.length ? h('div.lc-cv-cands', {}, h('p.t-label.lc-cv-k', { text: '다른 후보' }),
      h('div.lc-cv-row', {}, ...cands.map((c) => h('div.lc-cv-c', {},
        h('div.lc-cv-pic', {}, swipePic({ src: c.after, swipe: c })),
        (c.why || []).length ? h('p.lc-cv-why', { text: c.why.join(' · ') }) : null,
        ro ? null : h('button.t-btn.t-btn--2.lc-cv-use', { type: 'button', text: '이 그림으로', onclick: async (e) => {
          e.currentTarget.disabled = true;
          try { await putSwipe({ before: c.before, after: c.after, labels: c.labels, legend: c.legend }, '카드 그림을 바꿨습니다'); }
          catch (err) { K.toast(err.message || '바꾸지 못했습니다'); e.currentTarget.disabled = false; }
        } }))))) : null;
    const find = !ro && !cands.length ? h('button.t-btn.t-btn--2.lc-cv-find', { type: 'button', text: '후보 찾기', onclick: async (e) => {
      const b = e.currentTarget; b.disabled = true; b.textContent = '찾는 중';
      try { const j = await api(`/cards/${encodeURIComponent(cid)}/cover/cands`, { method: 'POST' }); cur = j; drawCover(); paint(); K.toast(j.cands_state === 'none' ? '후보가 없습니다' : '후보를 찾았습니다'); }
      catch (err) { K.toast(err.message || '찾지 못했습니다'); b.disabled = false; b.textContent = '후보 찾기'; }
    } }) : null;
    let two = null;
    if (!ro) {
      const link = h('button.lc-cv-two', { type: 'button', 'aria-expanded': String(twoOpen), text: '두 장 올리기', onclick: () => { twoOpen = !twoOpen; drawCover(); } });
      two = h('div.lc-cv-tw', {}, link);
      if (twoOpen) {
        const fa = h('input.t-input', { type: 'file', accept: 'image/png,image/jpeg,image/webp', 'aria-label': '원본' });
        const fb = h('input.t-input', { type: 'file', accept: 'image/png,image/jpeg,image/webp', 'aria-label': 'AI 결과' });
        const reg = h('select.t-input', { 'aria-label': '지역' }, h('option', { value: '', text: '다른 지역 결과' }),
          ...(cur.regions || c.regions || []).filter((r) => r.sgg).map((r) => h('option', { value: r.sgg, text: r.name })));
        const st = h('p.lc-h', { role: 'status' });
        const go = h('button.t-btn.t-btn--2', { type: 'button', text: '올리기', onclick: async () => {
          if (!fa.files[0] || !fb.files[0]) { st.textContent = '원본과 AI 결과를 모두 고르세요'; st.dataset.lv = 'warn'; return; }
          go.disabled = true; st.textContent = '올리는 중'; st.dataset.lv = '';
          try {
            const before = await upScene(fa.files[0], reg.value);
            const after = await upScene(fb.files[0], reg.value);
            twoOpen = false;
            await putSwipe({ before, after, labels: ['원본', 'AI 결과'] }, '카드 그림을 올렸습니다');
          } catch (err) { st.textContent = err.message; st.dataset.lv = 'warn'; go.disabled = false; }
        } });
        two.append(h('div.lc-cv-tw-row', {}, h('label.lc-cv-f', {}, h('span', { text: '원본' }), fa), h('label.lc-cv-f', {}, h('span', { text: 'AI 결과' }), fb), reg, go), st);
      }
    }
    coverSec.replaceChildren(h('h2.la-h.lc-cv-h', {}, '카드 그림', sw.newer ? h('span.lc-new', { text: '새 후보 있음' }) : null), main, row, h('div.lc-cv-foot', {}, find, two));
  };
  drawCover();

  /* ② 이름 · 무엇을 찾나 · 분류 */
  const I = c.info || {};
  const name = inp('name', c.name, '', 40);
  const line = inp('line', I.line, c.line || '한 줄로 — 무엇을 찾아 무엇을 남기나', 60);
  /* 분야 — 여러 개(질문 5 · 원칙 165). 목록 = LX 관리자 '배포 → 분야' 탭의 분야 표(순서 그대로) */
  const mine = new Set(c.groups || []);
  const grp = h('div.lc-grps', { role: 'group', 'aria-label': '분야' }, ...(c.all_groups || []).map((g) => h('label.lc-grp', {},
    h('input', { type: 'checkbox', value: g, checked: mine.has(g) || undefined, disabled: ro || undefined }), h('span', { text: g }))));
  const grpField = h('div.lc-f', {}, h('span.lc-l', { text: '분야' }), grp, h('span.lc-h', { text: '여러 개 고를 수 있습니다 — 분석 서비스 거르기 칩 · 기관 공유 묶음. 새 분야는 LX 관리자가 만듭니다' }));

  /* ③ 결과 예시 — 어느 지역 값을 보일지 · 말(AI 분석 결과 · 원칙 135: 다듬은 결과의 AI 탐지 수만 · 서버가 도형 조각 수는 비워 준다) */
  const withVal = (c.regions || []).filter((r) => r.detected && r.detected.value);
  const exSel = h('select.t-input', { name: 'result_sgg', disabled: ro || undefined }, h('option', { value: '', text: '자동 — 운영 지역 먼저' }),
    ...withVal.map((r) => h('option', { value: r.sgg, text: `${r.name} · AI 분석 결과 ${nf(r.detected.value)}${r.detected.unit === 'count' ? '건' : r.detected.unit || ''}`, selected: c.result_sgg === r.sgg || undefined })));
  const word = inp('result_word', c.result_word, 'AI 분석 결과', 20);

  /* ④ 조건 */
  const imagery = inp('imagery', I.imagery, c.imagery || '', 40);
  const tp = inp('timepoints', I.timepoints, c.timepoints || '', 40);
  const finds = inp('finds', I.finds, c.finds || '', 60);
  const compare = inp('compare', I.compare, c.compare || '', 60);

  const save = h('button.t-btn.lc-save', { type: 'submit', text: '저장', disabled: ro || undefined });
  const msg = h('p.lc-msg', { role: 'status' });
  form.append(
    coverSec,
    h('section.t-card.lc-sec', {}, h('h2.la-h', { text: '이름 · 무엇을 찾나' }), field('이름', name), field('무엇을 찾나', line, '카드에 두 줄까지 보입니다'), grpField),
    h('section.t-card.lc-sec', {}, h('h2.la-h', {}, '결과 예시', h('small', { text: '숫자는 서버 값 그대로' })), field('보일 지역', exSel), field('말', word, '셈 단위가 필지 · 동으로 확인된 결과에만 붙습니다 — 예: 비닐하우스 동')),
    h('section.t-card.lc-sec', {}, h('h2.la-h', { text: '이 카드의 조건' }), field('입력 영상', imagery), field('시점', tp), field('찾는 것', finds), field('대조', compare)),
    h('div.lc-act', {}, ro ? h('p.lc-h', { text: '이 카드의 담당 프로젝트장과 LX 관리자가 고칩니다' }) : null, msg, save));

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (ro) return;
    save.disabled = true; msg.textContent = '저장하는 중'; msg.dataset.lv = '';
    const body = {
      name: name.value.trim(), line: line.value, groups: [...grp.querySelectorAll('input:checked')].map((x) => x.value), result_sgg: exSel.value, result_word: word.value,
      imagery: imagery.value, timepoints: tp.value, finds: finds.value, compare: compare.value,
    };
    try {
      cur = await api(`/cards/${encodeURIComponent(cid)}`, { method: 'PUT', body });
      paint(); drawCover(); msg.textContent = '저장했습니다';
      K.toast('저장했습니다', { action: { label: '분석 서비스에서 보기', href: `../lx-analyze/?card=${encodeURIComponent(cid)}` } });
    } catch (err) { msg.textContent = err.message || '저장하지 못했습니다'; msg.dataset.lv = 'warn'; }
    save.disabled = false;
  });
  S.fresh(c.as_of);
}
