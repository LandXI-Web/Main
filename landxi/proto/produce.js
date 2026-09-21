/* 생산 관리 — LX 운영자 화면.
   데이터 파일에 세워 둔 네 기능(능동 운영 · 인프라 · 포털 생산 · 화면 요구)을
   한자리에서 본다. 이 화면은 숫자를 만들지 않는다 — 전부 규칙에서 나온 값을 옮길 뿐이다. */
import { mountShell, esc, nf, ymd, openModal } from './shell.js';
import { DUTIES, AGENCY_DUTY, THRESHOLDS, opsSummary, businessView } from '../assets/data/ops.js';
import { infraSummary, capacityPlan, costOfNewRegion, RATES, COVER_RATIO } from '../assets/data/infra.js';
import { SHELL_PARTS, LOCKED, PRODUCE, INTAKE, THEMES, themeOf, brandGuard, produceState } from '../assets/data/brand.js';
import { REQUESTS, loopStats, genQueue, studioScale, BLOCKS } from '../assets/data/studio.js';
import { TENANTS } from '../assets/data/portal.js';
import { CARDS, DEPLOYS, cardById } from '../assets/data/cards.js';
import { PROFILES } from '../assets/data/registry.js';
import { LAYERS, CONTRACTS, CROSS, WHERE, STATE, spineSummary } from '../assets/data/spine.js';
import { GIVES, TASKS, matchPoints, coverage, orgMatrix, finishPlan, matchSummary } from '../assets/data/matching.js';
import { SIMS, LX_ROLE, LX_LINE, STANDARD_LINE } from '../assets/data/sim.js';

const TAB = new URLSearchParams(location.search).get('tab') || 'spine';
const b = businessView(), inf = infraSummary(), cap = capacityPlan(), loop = loopStats();
const mt = matchSummary();

mountShell({
  active: 'produce', title: '생산 관리',
  /* 부제는 **표어가 아니라 설명**이어야 한다.
     발주자(2026-09-21): "생산 관리는 개발 키 같은 개념이네? 지금은 뭐라 하는지 도무지 이해가 안된다."
     전에 있던 '손으로 하면 용역이고 기능으로 하면 사업이다' 는 내 다짐이지 화면 설명이 아니었다.
     화면은 제가 무엇을 하는 자리인지부터 말해야 한다. */
  subtitle: 'LX가 AI 서비스를 만들어 기관에 내려 주는 공정을 한자리에서 봅니다 — 무엇을 만들고, 어느 업무에 붙이고, 얼마나 쓰고 있는지',
  notice: false, demo: true,
  tabStyle: 'line', tab: TAB,
  tabs: [
    /* 탭 이름도 사람 말로. '뼈대'는 내가 쓰던 말이고, 화면을 여는 사람에게는 '만드는 순서'다. */
    { key: 'spine', label: '만드는 순서' },
    /* 매칭 — 뼈대의 L2(표준) · L3(접점)이 가리킬 자리. 계산은 matching.js 가 이미 하고 있었고
       이 탭은 그 결과를 보여 줄 뿐이다(숫자를 새로 만들지 않는다). */
    { key: 'match', label: '매칭', href: 'produce.html?tab=match', count: mt.접점 },
    { key: 'ops', label: '능동 운영', href: 'produce.html?tab=ops', count: b.이번주기_재학습 + b.검수필요 },
    { key: 'infra', label: '인프라', href: 'produce.html?tab=infra', count: `${cap.rows[0].pct}%` },
    { key: 'brand', label: '포털 생산', href: 'produce.html?tab=brand', count: produceState().tenants },
    { key: 'studio', label: '화면 요구', href: 'produce.html?tab=studio', count: loop.반영중 + loop.대기 },
  ],
});

const main = document.getElementById('main');
const tile = (l, v, u, tone = '') => `<div class="tile${tone ? ` tile--${tone}` : ''}${v ? '' : ' tile--zero'}">
  <span class="tile-l">${esc(l)}</span><span class="tile-v"><b>${typeof v === 'number' ? nf.format(v) : esc(v)}</b><span>${esc(u)}</span></span></div>`;
const nameOfDeploy = (id) => cardById((DEPLOYS.find((d) => d.id === id) || {}).cardId)?.name || id;
const h = (t, sub, right = '') => `<h2 class="pd-h">${esc(t)}<span>${esc(sub)}</span><span class="sp"></span>${right}</h2>`;
/* 탭 머리 한 줄 — **이 자리에서 무엇을 하는가.**
   발주자(2026-09-21): "지금은 뭐라 하는지 도무지 이해가 안된다."
   숫자와 표는 있는데 그게 무엇을 재는 숫자인지 말하는 문장이 없었다. 탭마다 한 줄을 세운다. */
const lead = (t) => `<p class="pd-lead">${esc(t)}</p>`;
/* 화면은 **이름으로 부른다**. 데이터 파일에는 `produce.html?tab=match` 처럼 파일명으로 적힌
   자리가 있는데(sim.js LX_ROLE), 그대로 찍으면 개발용 URL 이 화면에 새어 나온다 —
   점검기도 그렇게 잡는다. 원본 데이터는 건드리지 않고 **부르는 이름만** 여기서 갈아 끼운다.
   표에 없는 값은 쿼리만 `·` 로 읽어 최소한 URL 처럼 보이지는 않게 한다. */
const SCREEN_NAME = {
  'dataset.html': '데이터 관리', 'ai-project.html': '프로젝트', 'admin-publish.html': '카드 발행 관리',
  'analysis-ai.html': '분석 서비스', 'ximap.html': '지도 서비스', 'portal.html': '지자체 포털',
  'map-drift.html': '표류 예측 지도', 'produce.html?tab=match': '생산 관리 · 매칭',
  'produce.html?tab=ops': '생산 관리 · 능동 운영', 'produce.html?tab=studio': '생산 관리 · 화면 요구',
};
const screenName = (d) => SCREEN_NAME[d] || String(d).replace(/\?[a-z]+=/i, ' · ');


/* ── 한 화면에 끝낸다 (2026-09-20) ────────────────────────────────────────
   이 화면은 문서형이라 탭마다 구역을 세로로 쌓아 올렸고, 뼈대 탭은 1,804px 이 넘쳤다.
   내용을 지우지 않고 두 수를 쓴다 —
     1) `two()`  세로로 쌓인 두 구역을 **좌우로** 편다(대시보드 #b-bottom 선례).
                 두 구역 높이의 합이 아니라 **큰 쪽**만 쓰게 된다.
                 다만 모니터가 좁거나(1500 미만) 낮으면(760 미만) 좌우로 펴 봐야
                 칸마다 글이 서너 줄로 접혀 되레 길어진다 — 그때는 CSS 가 같은 마크업을
                 **구역 고르개**로 바꿔 한 번에 하나씩, 대신 가로를 다 쓰며 보여 준다.
     2) `panes()` 어느 모니터에서든 한 번에 하나. 뼈대(층 5 + 계약 4 + …)처럼
                 한 구역만으로도 화면을 꽉 채우는 경우에 쓴다.
   먼저 1을 쓰고, 모자랄 때만 2를 쓴다 — 접는 것보다 펴는 것이 낫다. */
let twoN = 0;
const two = (al, a, bl, b) => {
  const g = `t${++twoN}`;
  return `<nav class="pd-tabs pd-tabs--auto" role="tablist" aria-label="구역 고르기">
    <button type="button" role="tab" data-pdp="${g}a" aria-selected="true">${esc(al)}</button>
    <button type="button" role="tab" data-pdp="${g}b" aria-selected="false">${esc(bl)}</button></nav>
  <div class="pd-2"><section class="pd-c" data-pdv="${g}a">${a}</section><section class="pd-c" data-pdv="${g}b" data-off>${b}</section></div>`;
};
/* 좌우가 아니라 **위아래로 쌓인 채** 두는 묶음. 가로가 1500 이상이면 둘 다 펴고,
   좁아지면 고르개가 나타나 한 번에 하나만 보여 준다(층 다섯은 1280 에서 455px 이라 안 든다).
   `two()` 와 달리 넓을 때도 좌우로 가르지 않는다 — 층 한 줄이 이미 가로를 다 쓰기 때문이다. */
function splitW(al, a, bl, b) {
  const g = `w${++twoN}`;
  return `<nav class="pd-tabs pd-tabs--w" role="tablist" aria-label="구역 고르기">
    <button type="button" role="tab" data-pdp="${g}a" aria-selected="true">${esc(al)}</button>
    <button type="button" role="tab" data-pdp="${g}b" aria-selected="false">${esc(bl)}</button></nav>
  <div class="pd-stack"><div class="pd-c" data-pdv="${g}a">${a}</div><div class="pd-c" data-pdv="${g}b" data-off>${b}</div></div>`;
}
function panes(list) {
  return `<nav class="pd-tabs" role="tablist" aria-label="구역 고르기">${list.map(([k, l], i) =>
    `<button type="button" role="tab" data-pdp="${k}" aria-selected="${i === 0}">${esc(l)}</button>`).join('')}</nav>
  ${list.map(([k, , html], i) => `<div class="pd-p" role="tabpanel" data-pdv="${k}"${i ? ' data-off' : ''}>${html}</div>`).join('')}`;
}

/* 고르개는 겹쳐 쓸 수 있다(구역 안에 또 좌우 두 쪽). 그래서 **제 고르개가 맡는 구역만** 건드린다 —
   처음에 main 전체를 훑게 했더니 안쪽 고르개가 바깥 구역까지 같이 감췄다. */
main.addEventListener('click', (e) => {
  const b = e.target.closest('[data-pdp]'); if (!b) return;
  const nav = b.closest('nav'), box = nav.parentElement;
  nav.querySelectorAll('[data-pdp]').forEach((x) => x.setAttribute('aria-selected', String(x === b)));
  [...box.children].flatMap((el) => (el.matches('[data-pdv]') ? [el] : [...el.querySelectorAll(':scope > [data-pdv]')]))
    /* `hidden` 속성이 아니라 `data-off` 를 쓴다 — 크롬의 기본 규칙이
       `[hidden]{display:none!important}` 이라, 넓은 화면에서 둘 다 펴려는 CSS 를 이긴다.
       (이 함정에 한 번 빠져 1996 에서 층 다섯 중 셋만 보였다.) */
    .forEach((x) => { x.toggleAttribute('data-off', x.dataset.pdv !== b.dataset.pdp); });
});

/* 매칭 — 배포본 · 지역 고르개. 고른 것은 화면 안 상태라 판만 다시 그린다(URL 은 탭까지만 담는다).
   접점 구역과 마무리 구역이 같은 배포본을 보므로 둘을 함께 갈아 끼운다. */
main.addEventListener('click', (e) => {
  const dp = e.target.closest('[data-mdp],[data-mdf]');
  if (dp) {
    matchDp = dp.dataset.mdp || dp.dataset.mdf;
    main.querySelectorAll('[data-mdp],[data-mdf]').forEach((x) => x.setAttribute('aria-pressed', String((x.dataset.mdp || x.dataset.mdf) === matchDp)));
    const a = document.getElementById('mt-pts'); if (a) a.innerHTML = ptsBody();
    const c = document.getElementById('mt-plan'); if (c) c.innerHTML = planBody();
    return;
  }
  const pf = e.target.closest('[data-mpf]');
  if (pf) {
    matchPf = pf.dataset.mpf;
    main.querySelectorAll('[data-mpf]').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.mpf === matchPf)));
    const o = document.getElementById('mt-org'); if (o) o.innerHTML = orgBody();
  }
});


/* ── 뼈대 ─────────────────────────────────────────────────────────── */
function spine() {
  const sp = spineSummary();
  const st = (id) => STATE.find((x) => x.layer === id) || {};
  /* 층 한 줄 — 원래는 이름 · 무엇 · 규칙 · 파일 · 진척을 **세로로 쌓아** 한 층이 200px 이었고
     계약까지 사이사이에 끼워 넣어 1,506px 이 됐다. 1,812px 이나 되는 가로를 안 쓰고 있었다.
     다섯 칸으로 눕히니 한 층이 70px 대가 되고 계약은 제 구역으로 나갔다. */
  const layerRow = (l) => {
    const s = st(l.id);
    /* 단계 번호는 **1·2·3**이다. `L1`·`L2` 는 내가 코드에서 쓰던 기호였고,
       화면에서는 읽는 사람이 순서를 세는 숫자여야 한다(2026-09-21). */
    return `<div class="sp-l" data-kind="${l.kind.startsWith('고정') ? 'fix' : 'var'}">
      <b class="sp-id">${esc(String(LAYERS.indexOf(l) + 1))}</b>
      <div class="sp-n"><h3>${esc(l.name)}</h3><span class="sp-k">${esc(l.kind)}</span><span class="sp-w">${esc(l.who)}</span></div>
      <div class="sp-t"><p class="sp-what">${esc(l.what)}</p>
        <p class="sp-rule">${l.rule.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')}</p></div>
      <p class="sp-f"><span class="sp-fl">여기서 한다</span>${l.screen.map((d) => `<code class="sc">${esc(screenName(d))}</code>`).join('')}${
  /* 화면이 아직 없는 층은 **없다고 적는다**(screenGap). 빈 칸으로 두면 있는 척이 된다.
     소스 파일 이름(l.data)은 **찍지 않는다** — `matching.js · GIVES` 는 만든 사람의 말이지
     쓰는 사람의 말이 아니다. 개발용 URL 을 화면에서 걷어낸 것과 같은 이유다(2026-09-21). */
  l.screenGap ? `<span class="sp-gap">${esc(l.screenGap)}</span>` : ''}</p>
      <p class="sp-st"><span class="ok">세움</span> ${esc(s.built || '')}${s.gap ? `<br><span class="gp">남음</span> ${esc(s.gap)}` : ''}</p>
    </div>`;
  };
  const contractRow = (c) => `<div class="sp-c">
    <b>${esc(c.id)}</b><span class="fromto n">${esc(c.from)} → ${esc(c.to)}</span>
    <span class="nm">${esc(c.name)}</span>
    <span class="wt">${esc(c.what)}</span>
    <span class="wy">${esc(c.why)}</span>
    <span class="br">깨지면 — ${esc(c.breaks)}</span></div>`;
  return `
  ${lead('AI 서비스 하나가 기관 화면이 되기까지 거치는 다섯 단계입니다. 새 요구가 들어오면 이 중 어느 단계의 일인지부터 고르고, 그 단계에만 손댑니다.')}
  <div class="band band--s">
    ${/* 셀 수 있다고 다 머리 숫자가 되는 것은 아니다. '계약 4개' · '고정:가변 3:3' 은
          읽는 사람이 무엇을 할지 바뀌지 않는 수였다. **지금 무엇이 서 있고 무엇이 남았는지**로 바꾼다. */''}
    ${tile('단계', sp.층, '개', 'ink')}
    ${tile('기관 요구로 바뀌지 않는 단계', sp.고정, '개')}
    ${tile('기관마다 달라지는 단계', sp.가변, '개', 'ink')}
    ${tile('아직 남은 일', STATE.filter((s) => s.gap).length, '건', 'ink')}
    <p class="band-note">앞 두 단계는 LX 가 못 박는다 — 기관 요구는 뒤 세 단계에서만 받는다</p>
  </div>
  ${panes([
    /* 좁은 모니터에서 다섯 층을 둘로 나눌 때의 가름선 — **순서 그대로** 반으로 자른다.
       (고정/가변으로 갈라 봤더니 넓은 화면에서 L1·L2·L5·L3·L4 순으로 서서 뒤섞여 보였다.
        고르개가 숨는 화면에서는 가름선이 보이지 않으므로 순서를 흐트러뜨리면 안 된다.) */
    ['l', `다섯 단계`, `${h('만드는 순서', sp.line)}${(() => {
      const cut = Math.ceil(LAYERS.length / 2), a = LAYERS.slice(0, cut), b2 = LAYERS.slice(cut);
      const nm = (g) => `${g[0].id}–${g[g.length - 1].id}`;
      return splitW(nm(a), `<div class="sp">${a.map(layerRow).join('')}</div>`,
        nm(b2), `<div class="sp">${b2.map(layerRow).join('')}</div>`);
    })()}`],
    ['c', `단계 사이에서 지키는 것 ${sp.계약}`, `${h('층 사이 계약', '뼈대가 실제로 버티는 자리 — 여기가 깨지면 전부 흔들린다')}
      <div class="sp-cs">${CONTRACTS.map(contractRow).join('')}</div>`],
    ['x', `모든 단계에 걸리는 일 ${sp.가로지르는것} · 어디에 넣나 ${WHERE.length}`, two(
      `가로지르는 것 ${sp.가로지르는것}`, `${h('가로지르는 것', '층이 아니라 모든 층에 걸린다')}
      <div class="sp-x">${CROSS.map((c) => `<div class="sp-x-c">
        <strong>${esc(c.name)}</strong><p>${esc(c.what)}</p>
        ${/* 여기도 소스 파일 이름(c.data)을 찍고 있었다 — 걷는다. 화면은 만든 사람의 말을 쓰지 않는다. */''}
        <p class="gets">→ ${esc(c.gets)}</p></div>`).join('')}</div>`,
      `판단표 ${WHERE.length}`, `${h('새 요구가 오면 어디에 넣나', '이 표에 없으면 아직 정하지 않은 것이다')}
      <table class="tb"><thead><tr><th>요구</th><th>들어갈 자리</th><th>어떻게</th></tr></thead><tbody>
      ${WHERE.map((w) => `<tr><td>${esc(w.ask)}</td><td><b class="n">${esc(w.at)}</b></td><td>${esc(w.how)}</td></tr>`).join('')}
      </tbody></table>`)],
  ])}`;
}

/* ── 매칭 ─────────────────────────────────────────────────────────────
   발주자: "기본 Geo-AI 서비스는 고정. 그리고 이걸 **행정 서비스 연계하는 부분에서
            매칭 포인트를 알려주는** 거고. … 매칭하여 마무리 짓는 데 핵심."

   이 화면은 아무것도 계산하지 않는다 — matching.js 의 `matchPoints()` · `coverage()` ·
   `orgMatrix()` · `finishPlan()` 이 내놓는 것을 그대로 옮긴다. 값을 지어내지 않는다.
   말하려는 것 한 줄: **화면은 발주하지 않는다. 발주는 자료와 모델에만 낸다.** */
const LV = { full: ['바로 닿음', 'st--teal'], plus: ['기관 자료 필요', 'st--acc'], gap: ['아직 못 닿음', 'st--warn'] };
const VIZ_WHERE = { map: '지도', stats: '통계', result: '결과' };
const VIZ_NAME = { table: '표', bar: '막대', line: '선', map: '지도', timeline: '시간축' };
/* 화면 선언의 내부 표기(emd · class · count …)는 사람 말로 바꿔 적는다 — 이건 기획자가 보는 화면이다 */
const BY_NAME = { emd: '읍·면·동', class: '종류', time: '시각', zone: '행정구역' };
const MEASURE_NAME = { count: '건수', area: '면적', sum: '합계' };
/* 어느 배포본 · 어느 지역을 보고 있나 — 화면 안에서만 바뀌는 상태다(URL 은 탭까지만 담는다).
   기본값은 **운영 중인 첫 배포본**. 예정 배포본을 기본으로 두면 빈 표부터 보게 된다. */
let matchDp = (DEPLOYS.find((d) => d.status === '운영') || DEPLOYS[0]).id;
let matchPf = PROFILES[0].id;

/* 고르개는 구역 제목 줄의 **오른쪽 칸**에 얹는다. 제목 아래에 따로 한 줄을 내주면
   좁은 모니터에서 칩이 세 줄로 밀려 고르개만 88px 을 먹었다(1280 에서 확인).
   제목 줄에 얹으면 남는 가로를 쓰므로 1996 에서는 한 줄에 다 선다.
   <h2> 안에 들어가므로 <div> 가 아니라 <span> 이어야 한다(문단 요소는 못 넣는다). */
const dpChips = (attr, cur) => `<span class="pd-pick" role="group" aria-label="배포본 고르기">
  ${DEPLOYS.map((d) => `<button type="button" class="chip-b" ${attr}="${esc(d.id)}" aria-pressed="${d.id === cur}">
    ${esc(cardById(d.cardId)?.name || d.cardId)}<span class="n">${d.year}</span><span class="rg">${esc(d.region)}</span></button>`).join('')}</span>`;

function ptsBody() {
  const d = DEPLOYS.find((x) => x.id === matchDp) || DEPLOYS[0];
  const pts = matchPoints(d.id), cov = coverage(d.id);
  if (!pts.length) return `<p class="empty empty--s">이 배포본에서 계산된 접점이 없습니다 — 카드 선언(kind)이 아직 비어 있습니다.</p>`;
  return `<p class="pd-line"><b>${esc(cov.line)}</b> · 부서 ${cov.orgs.length}곳 —
    바로 닿음 <span class="st st--teal">${cov.full}</span> ·
    기관 자료 필요 <span class="st st--acc">${cov.plus}</span> ·
    아직 못 닿음 <span class="st st--warn">${cov.gap}</span></p>
  <table class="tb"><thead><tr><th>행정 업무</th><th>부서</th><th>쓰는 표준 산출</th><th>기관이 더할 자료</th><th>만드는 것</th><th>판정</th><th>근거</th></tr></thead><tbody>
  ${pts.map((m) => `<tr>
    <td>${esc(m.task)}${m.module
    /* 전용 모듈 이름이 업무 이름과 같은 경우가 흔하다(민원 연계 · 현장 점검 동선 …).
       그대로 찍으면 같은 말이 두 번 나오므로 그때는 `있음` 으로만 적는다. */
    ? ` <span class="st st--dim">${m.module === m.task ? '전용 모듈 있음' : `전용 모듈 ${esc(m.module)}`}</span>` : ''}</td>
    <td class="nw">${esc(m.org)}</td>
    <td>${esc(m.uses.join(' · ') || '—')}</td>
    <td>${m.needs.length ? esc(m.needs.join(' · ')) : '<span class="st st--dim">없음</span>'}</td>
    <td>${esc(m.makes)}</td>
    <td><span class="st ${LV[m.level][1]}">${LV[m.level][0]}</span></td>
    <td class="pd-why">${esc(m.why)}</td></tr>`).join('')}
  </tbody></table>`;
}

function planBody() {
  const d = DEPLOYS.find((x) => x.id === matchDp) || DEPLOYS[0];
  const p = finishPlan(d.id);
  return `<p class="pd-line"><b>${esc(p.line)}</b></p>
  ${p.views.length ? `<table class="tb"><thead><tr><th>찍을 화면</th><th>어디에</th><th>무엇을</th><th>어떻게</th><th>나온 자리</th></tr></thead><tbody>
  ${p.views.map((v) => `<tr><td>${esc(v.title)}</td><td>${esc(VIZ_WHERE[v.tab] || v.tab)}</td>
    <td>${esc(BY_NAME[v.by] || v.by)} 단위 · ${esc(MEASURE_NAME[v.measure] || v.measure)}</td><td>${esc(VIZ_NAME[v.viz] || v.viz)}</td>
    <td>${esc(v.from)}</td></tr>`).join('')}
  </tbody></table>` : '<p class="empty empty--s">아직 찍을 화면이 없습니다 — 닿는 접점이 없습니다.</p>'}
  <p class="pd-note"><b>밖에서 받을 것 ${p.procure.length}종</b> —
    ${p.procure.length ? esc(p.procure.join(' · ')) : '<span class="st st--dim">없음</span>'}.
    전부 <em>기관이 가진 자료</em>다. 화면은 발주하지 않는다.</p>
  ${p.blocked.length ? `<p class="pd-note pd-note--warn">막힌 업무 ${p.blocked.length}건 —
    ${p.blocked.map((x) => `${esc(x.task)}(${esc(x.why)})`).join(' · ')}</p>` : ''}`;
}

function match() {
  return `
  <div class="band band--s">
    ${tile('고정 산출', mt.고정_산출, '종')}
    ${tile('행정 업무', mt.행정_업무, '종', 'ink')}
    ${tile('접점', mt.접점, '건', 'ink')}
    ${tile('바로 닿음', mt.바로닿는것, '건', 'ink')}
    ${tile('기관 자료 필요', mt.기관자료_필요, '건', 'ink')}
    ${tile('아직 못 닿음', mt.아직_못닿음, '건', mt.아직_못닿음 ? 'warn' : '')}
    <p class="band-note">${esc(mt.line)}</p>
  </div>
  ${panes([
    ['g', `고정 산출 ${mt.고정_산출} · 행정 업무 ${mt.행정_업무}`, two(
      `고정 · 표준 산출 ${mt.고정_산출}`, `${h('고정 · Geo-AI 표준 산출', '기관 요구로 이 목록을 늘리지 않는다 — 늘어나는 것은 매칭과 화면이다')}
      <table class="tb"><thead><tr><th>산출</th><th>무엇을 주나</th></tr></thead><tbody>
      ${Object.entries(GIVES).map(([k, v]) => `<tr><td><b>${esc(v.name)}</b></td><td>${esc(v.what)}</td></tr>`).join('')}
      </tbody></table>
      <p class="pd-note">${esc(STANDARD_LINE)} — 표준을 LX 가 쥐고 있어야 공급자가 바뀌어도 고리가 끊기지 않는다.</p>`,
      `가변 · 행정 업무 ${mt.행정_업무}`, `${h('가변 · 기관 행정 업무', '기관마다 다른 것은 판독이 아니라 업무다')}
      <table class="tb"><thead><tr><th>업무</th><th>부서</th><th>필요한 산출</th><th>기관 자료</th><th>만드는 것</th></tr></thead><tbody>
      ${TASKS.map((t) => `<tr><td>${esc(t.name)}</td><td>${esc(t.org)}</td>
        <td>${esc(t.wants.map((w) => GIVES[w].name).join(' · '))}</td>
        <td>${t.plus.length ? esc(t.plus.join(' · ')) : '<span class="st st--dim">없음</span>'}</td>
        <td>${esc(t.makes)}</td></tr>`).join('')}
      </tbody></table>`)],

    ['p', `접점 ${mt.접점}`, `${h('매칭 포인트', '산출이 주는 것과 업무가 필요로 하는 것을 대조한 결과다 — 손으로 적은 목록이 아니다', dpChips('data-mdp', matchDp))}
      <div id="mt-pts">${ptsBody()}</div>`],

    ['f', '마무리 계획', `${h('매칭하여 마무리', '접점 하나 = 화면 선언 한 줄 → 생성기가 찍는다', dpChips('data-mdf', matchDp))}
      <div id="mt-plan">${planBody()}</div>`],

    ['o', `부서 표 ${mt.부서}`, `${h('기관 눈으로 — 우리 과에 쓸모가 있나', '배포본 × 부서. 칸의 수는 그 부서 업무 중 닿는 건수다',
    `<span class="pd-pick" role="group" aria-label="지역 고르기">${PROFILES.map((p) =>
      `<button type="button" class="chip-b" data-mpf="${esc(p.id)}" aria-pressed="${p.id === matchPf}">${esc(p.region)}</button>`).join('')}</span>`)}
      <div id="mt-org">${orgBody()}</div>`],

    ['s', `밖 모델 ${SIMS.length} · LX 역할 ${LX_ROLE.length}`, two(
      `Geo-AI 밖 모델 ${SIMS.length}`, `${h('Geo-AI 밖 모델', '판독으로는 안 되는 것 — 계약만 LX 가 쥔다')}
      <table class="tb"><thead><tr><th>모델</th><th>무엇을</th><th>받는 것</th><th>내놓는 것</th><th>아직 없는 것</th></tr></thead><tbody>
      ${SIMS.map((s) => `<tr><td class="nw"><b>${esc(s.name)}</b></td><td>${esc(s.what)}</td>
        <td>${esc(s.takes.join(' · '))}</td><td>${esc(s.gives.join(' · '))}</td>
        <td class="pd-why">${esc(s.needs.join(' · '))}</td></tr>`).join('')}
      </tbody></table>
      <p class="pd-note">받을 것은 <b>모델 산출</b>이지 화면이 아니다 — 표준(patch schema)을 LX 가 쥐고 있어 공급자가 바뀌어도 고리가 남는다.</p>`,
      `고리에서 LX 가 쥐는 자리 ${LX_ROLE.length}`, `${h('LX 가 쥐는 자리', LX_LINE)}
      <table class="tb"><thead><tr><th>단계</th><th>누가</th><th>무엇을</th><th>LX 가 소유하는 것</th><th>도는 화면</th></tr></thead><tbody>
      ${LX_ROLE.map((r) => `<tr><td class="nw"><span class="n">${r.step}</span> ${esc(r.name)}</td>
        <td><span class="st ${r.who === 'LX' ? 'st--acc' : 'st--dim'}">${esc(r.who)}</span></td>
        <td>${esc(r.what)}</td><td>${r.own.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')}</td>
        <td>${r.screen ? `<a class="link" href="${esc(r.screen)}">${esc(screenName(r.screen))} ›</a>` : '<span class="st st--dim">화면 없음 · 밖에서 받는 산출</span>'}</td></tr>`).join('')}
      </tbody></table>`)],
  ])}`;
}

function orgBody() {
  const m = orgMatrix(matchPf);
  if (!m || !m.rows.length) return '<p class="empty empty--s">이 지역에 심은 배포본이 없습니다 — 아직 닿는 업무가 없습니다.</p>';
  return `<table class="tb"><thead><tr><th>배포본</th>${m.orgs.map((o) => `<th class="c">${esc(o)}</th>`).join('')}<th class="r">합</th></tr></thead><tbody>
  ${m.rows.map((r) => `<tr><td>${esc(r.card?.name || r.deploy.id)} <span class="st st--dim n">${r.deploy.year}</span></td>
    ${r.cells.map((c) => `<td class="c">${c ? `<b class="n">${c}</b>` : '<span class="st st--dim">·</span>'}</td>`).join('')}
    <td class="n">${r.cells.reduce((a, x) => a + x, 0)}</td></tr>`).join('')}
  </tbody></table>
  <p class="pd-note">${esc(m.region)} — 닿는 업무 <b>${m.total}</b>건. 부서 하나가 여러 배포본에 걸리면 그 과는 여러 서비스를 한 화면에서 본다.</p>`;
}

/* ── 능동 운영 ────────────────────────────────────────────────────── */
function ops() {
  const s = opsSummary();
  return `
  <div class="band band--s">
    ${tile('감시 중', s.watched, '건')}
    ${tile('재학습 필요', s.retrain, '건', s.retrainUrgent ? 'warn' : '')}
    ${tile('검수 필요', s.verify, '건', 'ink')}
    ${tile('능동 비율', b.능동비율 + '%', '', 'ink')}
    <p class="band-note">기관 신고 ${nf.format(b.기관신고)}건 — 보조 신호일 뿐이다</p>
  </div>
  ${two(
    '지금 해야 할 일', `${h('지금 해야 할 일', `기준 미달이면 기계가 먼저 든다 · 신뢰도 ${THRESHOLDS.conf} · IoU ${THRESHOLDS.iou} · 학습 후 ${THRESHOLDS.staleDays}일 · 표본 ${THRESHOLDS.sampleMin}건`)}
    <table class="tb"><thead><tr><th>배포본</th><th>지역</th><th class="r">신뢰도</th><th class="r">IoU</th><th>마지막 학습</th><th>할 일</th><th>근거</th></tr></thead><tbody>
    ${s.rows.map((r) => `<tr>
      <td>${esc(r.card.name || r.deploy.id)}</td><td>${esc(r.deploy.region)}</td>
      <td class="n">${r.ops.conf.toFixed(2)}</td><td class="n">${r.ops.iou.toFixed(2)}</td>
      <td class="n">${esc(ymd(r.ops.lastTrain))} <span class="st st--dim">${r.stale}일</span></td>
      <td class="pd-lv" data-l="${esc(r.top.level)}">${esc(DUTIES.find((d) => d.id === r.top.duty)?.name || r.top.duty)}</td>
      <td>${esc(r.top.why)}</td></tr>`).join('')}
    </tbody></table>`,
    '임무와 몫', `${h('다섯 임무는 전부 LX 몫', '기관 임무는 하나뿐이다')}
    <table class="tb"><thead><tr><th>임무</th><th>누가</th><th>무엇을</th><th>왜</th></tr></thead><tbody>
    ${DUTIES.map((d) => `<tr><td>${esc(d.name)}</td><td><span class="st st--acc">${esc(d.who)}</span></td><td>${d.what.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')}</td><td>${esc(d.why)}</td></tr>`).join('')}
    <tr><td>${esc(AGENCY_DUTY.name)}</td><td><span class="st st--dim">${esc(AGENCY_DUTY.who)}</span></td><td>${esc(AGENCY_DUTY.what)}</td><td>${esc(AGENCY_DUTY.why)}</td></tr>
    </tbody></table>
    <p class="pd-note">납품형은 기관이 신고해야 고친다. 사업형은 <b>LX 가 먼저 찾아 고쳐 올린다</b> — 좋아진 것을 보여야 다음 계약이 이어진다.</p>`)}`;
}

/* ── 인프라 ───────────────────────────────────────────────────────── */
function infra() {
  const bar = (r) => {
    const w = Math.min(100, r.pct), a = Math.min(100, r.afterPct);
    return `<div class="pd-cap-r${r.afterPct >= 80 ? ' pd-cap--warn' : ''}">
      <div class="pd-cap-n">${esc(r.name)}<em>${esc(r.note)}</em></div>
      <div class="pd-track"><div class="pd-fill" style="width:${w}%"></div>
        ${a > w ? `<div class="pd-after" style="left:${a}%" data-l="예정 ${r.afterPct}%"></div>` : ''}</div>
      <div class="pd-cap-v"><b>${nf.format(r.use)}</b> / ${nf.format(r.cap)} ${esc(r.unit)} · ${r.pct}%</div>
    </div>`;
  };
  return `
  <div class="band band--s">
    ${tile('배포본', inf.deploys, '개')}
    ${tile('적용 지역', inf.regions, '곳')}
    ${tile('저장', inf.storageTb, 'TB', 'ink')}
    ${tile('GPU', inf.gpuYear + inf.gpuRetrain, 'h/년', 'ink')}
    <p class="band-note">${esc(cap.line)}</p>
  </div>
  ${two(
    '용량', `${h('용량', '배포본이 늘면 저절로 는다 — 분기가 기능이기 때문이다')}
    <div class="pd-cap">${cap.rows.map(bar).join('')}</div>
    <p class="pd-note">검은 선은 <b>예정 사업까지 넣었을 때</b>의 자리다. 80 %를 넘으면 증설을 검토한다.</p>`,
    '배포본이 쓰는 자원', `${h('배포본이 쓰는 자원', '그 서비스가 실제로 보는 범위로 잰다',
    '<button type="button" class="btn-br btn-br--s" data-act="cost">새 지역 비용 산출</button>')}
    <table class="tb"><thead><tr><th>서비스</th><th>지역</th><th class="r">대상 범위</th><th class="r">원본</th><th class="r">타일</th><th class="r">추론/년</th><th>상태</th></tr></thead><tbody>
    ${inf.rows.map((r) => `<tr>
      <td>${esc(r.card.name || r.deploy.id)}</td><td>${esc(r.deploy.region)} <span class="st st--dim n">${esc(r.deploy.year)}</span></td>
      <td class="n">${nf.format(r.area)} km²${r.regionArea ? ` <span class="st st--dim">/${nf.format(r.regionArea)}</span>` : ''}</td>
      <td class="n">${nf.format(r.storage.raw)} GB</td><td class="n">${nf.format(r.storage.tile)} GB</td>
      <td class="n">${nf.format(r.compute.perYear)} h</td>
      <td><span class="st st--${r.deploy.status === '운영' ? 'teal' : r.deploy.status === '구축' ? 'acc' : 'dim'}">${esc(r.deploy.status)}</span></td></tr>`).join('')}
    </tbody></table>
    ${inf.assumedCycles ? `<p class="pd-note pd-note--warn">배포본 ${inf.assumedCycles}건이 <b>주기 미정 · 연 1회 가정</b>으로 계산되어 있다 —
    카드에 조사 주기가 정해지면 GPU 소요가 그 배수로 는다. 가정을 숨기지 않는다.</p>` : ''}
    <p class="pd-note">단가는 실측에서 뽑았다 — 정사영상 <b>${RATES.rawPerKm2.ortho} GB/km²</b>(남원 전역 1시점 2.1 TB ÷ 752 km²) ·
    타일은 원본의 <b>${(RATES.tileRatio * 100).toFixed(1)}%</b> · 추론 <b>${RATES.gpuHourPerKm2.ortho} GPU·h/km²</b>.
    원본은 <em>LX 보관</em>이고 기관에는 타일만 나간다.</p>`)}`;
}

/* ── 포털 생산 ────────────────────────────────────────────────────── */
function brand() {
  const st = produceState();
  const users = TENANTS.filter((t) => t.kind === 'user');
  return `
  <div class="band band--s">
    ${tile('기관 포털', st.tenants, '곳')}
    ${tile('골격 부위', SHELL_PARTS.length, '개', 'ink')}
    ${tile('자동 절차', st.autoSteps, `/${PRODUCE.length}`, 'ink')}
    ${tile('CI 가드', st.guards.filter((g) => g.ok).length, `/${st.guards.length} 통과`, 'ink')}
    <p class="band-note">${esc(st.line)}</p>
  </div>
  ${panes([
    ['ci', `기관 CI ${users.length} · 생산 절차 ${PRODUCE.length}`, two(
      `기관 CI ${users.length}`, `${h('기관이 내는 것은 CI 한 벌뿐', '나머지는 LX 가 찍어 내린다')}
  <div class="pd-ci">${users.map((t) => {
    const th = themeOf(t.id), g = brandGuard(t.id);
    return `<div class="pd-ci-c">
      <div class="pd-ci-m" style="color:${esc(th.accent)}">${th.mark.split('/').map((s) => `<span>${esc(s)}</span>`).join('')}</div>
      <strong class="pd-ci-n">${esc(th.name)}</strong>
      <dl class="pd-ci-l">
        <dt>상징색</dt><dd><i class="pd-sw" style="background:${esc(th.accent)}"></i>${esc(th.accent)}</dd>
        <dt>행정단위</dt><dd>${esc(th.unitLabel)}</dd>
        <dt>좌표계</dt><dd class="n">${esc(th.crs)}</dd>
        <dt>대비</dt><dd class="n">${g.contrast} <span class="st st--${g.ok ? 'teal' : 'warn'}">${g.ok ? '통과' : '미달'}</span></dd>
      </dl>
      <p class="pd-note"><a class="link" href="portal.html">포털 열기 ›</a></p>
    </div>`;
  }).join('')}</div>`,
      `생산 절차 ${PRODUCE.length}`, `${h('포털 한 벌을 세우는 절차', `자동 ${st.autoSteps} · 수동 ${st.manualSteps} — 이 비율이 생산화의 척도다`)}
      <div class="pd-steps">${PRODUCE.map((p) => `<div class="pd-step" data-by="${esc(p.by)}">
        <b>STEP ${p.step} · ${esc(p.by)}</b><strong>${esc(p.name)}</strong><p>${esc(p.what)}</p></div>`).join('')}</div>`)],
    ['lock', `골격 ${SHELL_PARTS.length} · 기관 제출물 ${INTAKE.length}`, two(
      `골격 ${SHELL_PARTS.length}`, `${h('골격은 LX 가 잠근다', '기관이 바꿀 수 있는 것과 없는 것')}
      <table class="tb"><thead><tr><th>부위</th><th>무엇</th><th>기관이 바꾸는 것</th></tr></thead><tbody>
      ${SHELL_PARTS.map((p) => `<tr><td>${esc(p.name)}</td><td>${esc(p.what)}</td>
        <td>${p.ci === '없음' ? '<span class="st st--dim">없음</span>' : esc(p.ci)}</td></tr>`).join('')}
      </tbody></table>
      <p class="pd-note">잠긴 값 — ${esc(LOCKED.display)} · ${esc(LOCKED.body)} · 바닥 ${LOCKED.floorPx}px ·
      라운드 ${LOCKED.radius} · 그림자 ${LOCKED.shadow} · 레일 ${LOCKED.rail} · 마진 ${LOCKED.margin} · ${esc(LOCKED.rule)}.
      <b>기관이 못 바꾼다</b> — 그래야 50곳이 한 벌로 유지되고 개선이 전부에 퍼진다.</p>`,
      `기관 제출물 ${INTAKE.length}`, `${h('기관이 내야 하는 것', '이게 다 모이면 포털이 선다')}
      <table class="tb"><thead><tr><th>항목</th><th>무엇</th><th>필수</th></tr></thead><tbody>
      ${INTAKE.map((i) => `<tr><td>${esc(i.name)}</td><td>${esc(i.what)}</td>
        <td>${i.min ? '<span class="st st--acc">필수</span>' : '<span class="st st--dim">선택</span>'}</td></tr>`).join('')}
      </tbody></table>`)],
  ])}`;
}

/* ── 화면 요구 ────────────────────────────────────────────────────── */
function studio() {
  const sc = studioScale(), q = genQueue();
  return `
  <div class="band band--s">
    ${tile('유지 화면', sc.화면, '개')}
    ${tile('블록 종류', sc.블록종류, '종', 'ink')}
    ${tile('평균 반영', loop.평균소요일, '일', 'ink')}
    ${tile('손으로 짠 화면', sc.손으로짠화면, '개', 'ink')}
    <p class="band-note">${esc(sc.line)}</p>
  </div>
  ${(() => {
    /* 블록 사전은 열두 줄이라 한 표로 내면 387px 이다 — 반으로 갈라 좌우로 놓는다.
       내용은 그대로고 읽는 순서만 위→아래에서 왼쪽→오른쪽으로 바뀐다. */
    const bl = Object.entries(BLOCKS), half = Math.ceil(bl.length / 2);
    const blockTable = (rows) => `<table class="tb"><thead><tr><th>블록</th><th>무엇</th></tr></thead><tbody>
      ${rows.map(([k, v]) => `<tr><td><code class="n">${esc(k)}</code> ${esc(v.name)}</td><td>${esc(v.what)}</td></tr>`).join('')}
      </tbody></table>`;
    return two(
      `기관 요구 고리 ${REQUESTS.length}`, `${h('기관 요구 고리', '접수 → 명세 한 줄 수정 → 다시 찍기 → 배포',
    '<button type="button" class="btn-br btn-br--s" data-act="gen">생성 대기 보기</button>')}
      <table class="tb"><thead><tr><th>기관</th><th>서비스</th><th>요구</th><th>연산</th><th>접수</th><th class="r">소요</th><th>상태</th></tr></thead><tbody>
      ${REQUESTS.map((r) => {
    const d = r.done ? Math.round((Date.parse(r.done) - Date.parse(r.got)) / 864e5) : null;
    return `<tr><td>${esc(r.from)}</td><td>${esc(nameOfDeploy(r.deployId))}</td>
        <td>${esc(r.want)}</td><td><code class="n">${esc(r.op)}</code> ${esc(r.at)}</td>
        <td class="n">${esc(ymd(r.got))}</td><td class="n">${d === null ? '—' : d + '일'}</td>
        <td><span class="st st--${r.state === '배포' ? 'teal' : r.state === '반영' ? 'acc' : 'dim'}">${esc(r.state)}</span></td></tr>`;
  }).join('')}
      </tbody></table>
      <p class="pd-note">${esc(loop.line)}</p>`,
      `블록 사전 ${bl.length}`, `${h('블록 사전', '화면은 이 부품들로만 조립된다 — 새 서비스가 생겨도 화면 코드를 고치지 않는다')}
      <div class="pd-2 pd-2--tight">${blockTable(bl.slice(0, half))}${blockTable(bl.slice(half))}</div>
      <p class="pd-note">다시 찍기: <b>node tools/gen/portal-gen.mjs</b> (전부) · <b>--queue</b> (요구 반영분만 ${q.filter((x) => x.rebuild).length}장)</p>`);
  })()}`;
}

/* ── 손잡이 ───────────────────────────────────────────────────────── */
document.addEventListener('click', (e) => {
  if (e.target.closest('[data-act="cost"]')) {
    const rows = [];
    CARDS.filter((c) => c.status === '운영').forEach((c) => PROFILES.forEach((p) => {
      const r = costOfNewRegion(c.id, p.id); if (r) rows.push(r);
    }));
    openModal({
      title: '새 지역 한 곳을 더 받으면', width: 720, tag: '계약 근거',
      content: `<p class="pd-note">카드는 그대로 두고 <b>지역 프로파일만 갈아 끼운</b> 산출이다 — 분기가 기능이기 때문에 계산된다.</p>
      <table class="tb"><thead><tr><th>서비스</th><th>지역</th><th class="r">대상 범위</th><th class="r">저장</th><th class="r">첫 추론</th><th class="r">추론/년</th></tr></thead><tbody>
      ${rows.map((r) => `<tr><td>${esc(r.card)}</td><td>${esc(r.region)}</td>
        <td class="n">${nf.format(r.cover)} km²</td><td class="n">${r.storageTb} TB</td>
        <td class="n">${nf.format(r.firstRun)} h</td><td class="n">${nf.format(r.gpuYear)} h</td></tr>`).join('')}
      </tbody></table>`,
      actions: [{ label: '닫기' }],
    });
  }
  if (e.target.closest('[data-act="gen"]')) {
    const q = genQueue();
    openModal({
      title: '다시 찍을 화면', width: 560,
      content: `<table class="tb"><thead><tr><th>서비스</th><th>지역</th><th>사유</th></tr></thead><tbody>
      ${q.map((x) => `<tr><td>${esc(x.card || x.deployId)}</td><td>${esc(x.region)}</td>
        <td>${x.rebuild ? '<span class="st st--acc">요구 반영</span>' : '<span class="st st--dim">변경 없음</span>'}</td></tr>`).join('')}
      </tbody></table><p class="pd-note">명령: <b>node tools/gen/portal-gen.mjs --queue</b></p>`,
      actions: [{ label: '닫기' }],
    });
  }
});

/* ── 그린다 ───────────────────────────────────────────────────────────
   **이 줄은 파일 맨 끝에 있어야 한다.** 각 화면이 쓰는 `const`(LV · dpChips · matchDp …)는
   호이스팅되지 않으므로, 위에서 그리면 `Cannot access … before initialization` 으로
   판이 통째로 비어 버린다. 매칭 탭을 붙이다가 실제로 빈 화면을 한 번 만들었다.
   (함수 선언은 호이스팅되어 VIEWS 에 담는 것은 문제가 없다.) */
const VIEWS = { spine, match, ops, infra, brand, studio };
main.insertAdjacentHTML('beforeend', `<div class="pd-sec">${(VIEWS[TAB] || spine)()}</div>`);
