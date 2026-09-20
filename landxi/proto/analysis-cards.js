/* 분석 서비스 › **LX 관점**의 발행 카드 진열대 — 분기 탭 · 카드 목록 · 카드 상세 · 이식 마법사.
   원판 B5-Analysis-List.png · B7-Analysis-List.png(준비 중 카드 = 무채 + 점선 + 비활성 CTA).

   두 '카드' 를 섞지 않는다(이원화 확정본 §4):
     **발행 카드**(cards.js CARDS)  = LX 관점 · 모델을 상품으로 내보내는 단위 — **이 화면**
     서비스 카드(portal.js)          = 지자체 관점 · 내 지역에 깔린 진입점 — portal.html
   포털에서 `?svc=<배포본 id>` 로 넘어오면 그 배포본 맥락(지역 · 연도)으로 걸러서 연다.

   경계선(§2): 카드 상세의 전용 모듈은 **LX(판독)** 것만 전면에 두고, 기관(행정 가공)의 것은
   "기관이 수행" 으로 따로 적는다 — LX 가 다 떠안지 않는다는 발주자 방침.

   **이 파일은 카드를 하드코딩하지 않는다**(R5): 목록은 registry.js 의 `findCards()` 가,
   거르개는 `AXES` 가, 화면 장치는 카드의 `kind` 선언(`needsOf`)이 정한다. */
import { esc, icon, openModal, say, $, $$, nf } from './shell.js';
import {
  SCOPES, scopeById, scopeSummary, cardById, CORE_MODULES, extModules, extByOwner, OWNER_LINE,
  modelsOfCard, deploysOfCard, cardTotals, STATUS_TONE, DEPLOYS,
} from '../assets/data/cards.js';
import {
  AXES, domainOf, findCards, PROFILES, transplantCheck, transplantAssets,
  imageryReady, SHARE_LABEL, updateState,
} from '../assets/data/registry.js';
import { cardCrop, cardResults, cardMinistries, runsOfCard, addedDeploysOf, addDeploy, addedDeploys } from './analysis-data.js';
import { devicesOf, kindLine, inputSets } from './analysis-kind.js';
import { commit } from './analysis.js';

const BUILD = { done: ['완성', 'st--acc'], wip: ['진행', 'st--teal'], todo: ['설계', 'st--dim'] };
const TONE = { ok: 'st--acc', accent: 'st--teal', mute: 'st--dim' };
const plain = (s) => String(s || '').replace(/\*\*/g, '');
const stWord = (s) => `<span class="st ${TONE[STATUS_TONE[s]] || ''}">${esc(s)}</span>`;

/* 배포 지역 = 정본(cards.js DEPLOYS) + 이식 마법사가 이번 세션에 더한 줄. 카드는 복사하지 않는다(R3). */
export const deploysAll = (cardId) => [...deploysOfCard(cardId), ...addedDeploysOf(cardId)];
const regionsAll = (cardId) => [...new Set(deploysAll(cardId).map((d) => d.region))];
/** 포털의 서비스 카드(= 배포본) 한 줄. `?svc=` 가 가리키는 것. */
export const deployById = (id) => [...DEPLOYS, ...addedDeploys()].find((d) => d.id === id) || null;

/* 거르개 축 — AXES 를 그대로 읽는다. `scope` 는 위의 분기 탭이 맡으므로 줄에서 뺀다. */
const rowAxes = () => AXES.filter((a) => a.id !== 'scope');
function axisOptions(ax) {
  const base = ax.options();
  if (ax.id !== 'region') return base;
  const extra = [...new Set(addedDeploys().map((d) => d.region))].filter((r) => !base.some((o) => o.v === r));
  return [...base, ...extra.map((v) => ({ v, n: v + ' · 이식 요청' }))];
}
/** 레지스트리 우선 — 축 필터는 findCards() 가 판정하고, 세션 배포본만 배포 지역에서 덧댄다. */
function find(S) {
  const { region, ...rest } = { q: S.q, scope: S.scope, domain: S.domain, status: S.status, region: S.region };
  let list = findCards(rest);
  if (region) list = list.filter((c) => regionsAll(c.id).includes(region));
  return list;
}
export const shelfCount = (S) => scopeSummary(S.scope).total;

/* ══ 1. 뼈대 ══════════════════════════════════════════════════════════════ */
export function renderShelf(host, S) {
  const sc = scopeById(S.scope), sum = scopeSummary(S.scope);
  host.innerHTML = `
<div class="an-shelf">
  <div class="scopes" role="tablist" aria-label="대상 사업 분기">
    ${SCOPES.map((s) => `<button type="button" role="tab" class="scope-t" data-scope="${s.id}" aria-selected="${s.id === S.scope}">${esc(s.name)}<span class="n">${scopeSummary(s.id).total}</span></button>`).join('')}
    <p class="scope-d">${esc(sc.desc)}</p>
  </div>
  <div class="band band--s band--auto" role="group" aria-label="${esc(sc.name)} 집계">
    ${[['카드', sum.total, '건', ''], ['운영', sum.live, '건', ''], ['검토', sum.review, '건', 'tile--ink'], ['준비 중', sum.ready, '건', sum.ready ? 'tile--ink' : 'tile--zero'], ['묶은 AI 모델', sum.models, '종', 'tile--ink'], ['배포본', sum.deploys, '곳', sum.deploys ? 'tile--ink' : 'tile--zero']]
      .map(([l, v, u, cls]) => `<div class="tile ${cls}"><span class="tile-l">${esc(l)}</span><span class="tile-v"><b>${v}</b><span>${u}</span></span></div>`).join('')}
    <p class="band-note">구조는 두 분기가 같다 — 단위 ${esc(sc.unitLabel)}(${esc(sc.unitExample)}) · ${esc(sc.crs)} · ${esc(sc.source)}</p>
  </div>
  <div class="split an-split" style="--l:772fr;--r:444fr">
    <section class="split-l" aria-label="서비스 카드 목록">
      <form class="filters" id="cfilters" role="search" aria-label="카드 찾기" novalidate>
        ${rowAxes().map((ax) => `<span class="sel sel--s"><select data-axis="${ax.id}" aria-label="${esc(ax.name)}"><option value="">${esc(ax.name)} 전체</option>${axisOptions(ax).map((o) => `<option value="${esc(o.v)}"${S[ax.id] === o.v ? ' selected' : ''}>${esc(o.n)}</option>`).join('')}</select></span>`).join('')}
        <label class="inp-ic">${icon('search')}<input class="inp inp--s" id="cq" placeholder="카드 이름 · 행정 업무 · 요약" aria-label="카드 검색" value="${esc(S.q)}"></label>
        <span class="filters-acts"><button type="reset" class="btn-br btn-br--s" style="width:76px">초기화</button><button type="submit" class="btn btn--s" style="width:80px">검색</button></span>
      </form>
      <p class="an-count" id="ccount"></p>
      <div class="cgrid" id="cgrid" role="listbox" aria-label="서비스 카드"></div>
      <div class="empty" id="cempty" hidden><p class="empty-t">조건에 맞는 서비스 카드가 없습니다.</p><p class="empty-w" id="cempty-w"></p></div>
    </section>
    <aside class="split-r panel an-panel" id="cdetail" aria-label="카드 상세" aria-live="polite"></aside>
  </div>
</div>`;

  $('.scopes', host).addEventListener('click', (e) => {
    const b = e.target.closest('[data-scope]'); if (!b) return;
    commit({ scope: b.dataset.scope, card: '', region: '' });
  });
  const form = $('#cfilters', host);
  form.addEventListener('change', (e) => { const s = e.target.closest('[data-axis]'); if (s) commit({ [s.dataset.axis]: s.value, card: '' }); });
  form.addEventListener('submit', (e) => { e.preventDefault(); const n = find({ ...S, q: $('#cq').value.trim() }).length; commit({ q: $('#cq').value.trim(), card: '' }); say(n ? `서비스 카드 ${n}건` : '조건에 맞는 서비스 카드가 없습니다.'); });
  form.addEventListener('reset', (e) => { e.preventDefault(); commit({ q: '', domain: '', status: '', region: '', card: '' }); });
  $('#cgrid', host).addEventListener('click', (e) => { const b = e.target.closest('[data-card]'); if (b) commit({ card: b.dataset.card }); });
  $('#cgrid', host).addEventListener('keydown', (e) => {
    const b = e.target.closest('[data-card]'); if (!b) return;
    const all = $$('[data-card]', host), i = all.indexOf(b);
    const go = (j) => { if (all[j]) { e.preventDefault(); all[j].focus(); } };
    if (e.key === 'ArrowRight') go(i + 1); if (e.key === 'ArrowLeft') go(i - 1);
    if (e.key === 'ArrowDown') go(i + 3); if (e.key === 'ArrowUp') go(i - 3);
  });

  drawGrid(S);
  drawDetail(S);
  if (S.pick === 'transplant' && cardById(S.card)) openTransplant(S);
}

/* ══ 2. 진열대 ════════════════════════════════════════════════════════════
   2026-09-20 개편 — 카드가 **세로로 선 판**(그림 위 · 글 아래)이라 한 장이 330px 이었고
   7장이면 1,023px 이 되어 301px 짜리 자리에서 722px 이 잘려 나갔다.
   내용을 줄이지 않고 **그림을 왼쪽으로 돌려** 한 장을 70~120px 로 눕혔다(대시보드 선례와 같은 수).
   그림 폭은 vh 로 자란다 — 세로가 넉넉한 모니터에서는 그림이 커지고 칸 수가 줄어든다. */
function drawGrid(S) {
  const list = find(S), grid = $('#cgrid');
  if (S.card && !list.some((c) => c.id === S.card)) S.card = '';
  if (!S.card && list.length) S.card = list[0].id;
  grid.innerHTML = list.map((c) => {
    const crop = cardCrop(c), ready = c.status === '준비 중', ms = modelsOfCard(c);
    /* `배포 지역 영상`(= 결과가 아니라는 표시)은 원래 그림 위 자막이었다. 그림이 88px 로 작아지자
       자막이 잘려 나가서 — 잘린 글자를 두지 않는다는 원칙대로 — 아래 숫자 줄로 내렸다. */
    const fig = crop
      ? `<figure class="imgcard" style="--ar:16/10"><img src="${esc(crop.src)}" alt="${esc(crop.of)}" loading="lazy"></figure>`
      : `<div class="imgcard imgcard--none" style="--ar:16/10">${ready ? '준비 중 · 산출물 없음' : '결과 산출물 없음'}</div>`;
    return `<button type="button" class="ccard" data-card="${c.id}" role="option" aria-selected="${c.id === S.card}"${ready ? ' data-ready' : ''}>
  ${fig}
  <span class="ccard-b">
    <span class="ccard-t"><span class="ccard-n">${esc(c.name)}</span>${ready ? '<em class="chip">준비 중</em>' : `<span class="n ccard-v">${esc(c.version || '')}</span>`}</span>
    <span class="ccard-s">${esc(cardMinistries(c).join(' · ') || '소관 미정')}</span>
    <span class="ccard-m"><span>모델 <b class="n">${ms.length}</b></span><span>전용 모듈 <b class="n">${extModules(c.ext).length}</b></span><span>배포 <b class="n">${deploysAll(c.id).length}</b></span>${crop && crop.kind === 'region' ? '<span class="ccard-w">배포 지역 영상</span>' : ''}</span>
  </span>
</button>`;
  }).join('');
  $('#ccount').innerHTML = `총 <b class="n">${list.length}</b>건${list.length ? ` · 선택 <b>${esc(cardById(S.card)?.name || '')}</b>` : ''}`;
  $('#cempty').hidden = !!list.length;
  if (!list.length) $('#cempty-w').textContent = whyEmpty(S);
}
function whyEmpty(S) {
  const p = [`대상 사업 = ${scopeById(S.scope).name}`];
  for (const ax of rowAxes()) if (S[ax.id]) p.push(`${ax.name} = ${axisOptions(ax).find((o) => o.v === S[ax.id])?.n || S[ax.id]}`);
  if (S.q) p.push(`검색어 “${S.q}”`);
  return `${p.join(' · ')} — 초기화로 전체 카드 복귀`;
}

/* ══ 3. 카드 상세 ═════════════════════════════════════════════════════════
   2026-09-20 개편 — 한 판에 세로로 2,742px 을 쌓아 296px 자리에서 여섯 배가 넘쳤다.
   **지우지 않고 나눈다**: 머리(그림 + 이름 + 요약)만 늘 보이고, 나머지 여섯 구역은
   판 안쪽 탭으로 갈라 한 번에 하나만 편다. 구역 안에서는 다시 좌우로 눕힌다.

   되돌린 판단 둘 —
     · 처음엔 `<details>` 일곱 개로 접었다. 다 접어도 요약 줄만 210px 이라 자리가 안 났다.
       탭 줄 하나(34px)가 접이 머리 일곱 개보다 싸다.
     · 모듈을 LX·기관 좌우로 나란히 놓아 봤다. 판이 좁아지면(1280 에서 392px) 설명이
       세 줄로 접혀 오히려 늘었다. 그래서 LX/기관을 **탭 두 개로** 나누고 가로로 길게 편다.

   DOM 규약(e2e) — id 와 요소는 그대로 둔다: #cd-devs [data-device] · #cd-mods-lx ·
   #cd-mods-local · #to-project · .cd-sum · .cd-img · [data-deploy] · .cd-models.
   **#tp-open 은 접힌 안에 두지 않는다** — 탭 줄 오른쪽에 붙여 어느 구역에서나 누를 수 있다. */

/* 판 안쪽 탭. 카드를 바꿔도 보던 구역을 유지한다(목록을 훑을 때 매번 개요로 튀지 않게). */
let cdTab = 'info';
/* 모듈 설명 펼침. 기본은 이름만 — 공통 7 + 전용 n 의 설명까지 한 줄씩 깔면
   좁은 판에서 판 하나를 통째로 먹는다. 버튼 한 번이면 전부 나온다(지운 것이 아니다). */
let modsFull = false;

function drawDetail(S) {
  const panel = $('#cdetail'), c = cardById(S.card);
  if (!c) {
    panel.innerHTML = `<header class="panel-h"><h2>카드 상세</h2></header><div class="empty"><p class="empty-t">선택된 서비스 카드가 없습니다</p><p class="empty-w">왼쪽 진열대에서 카드를 고르면 업무 · 모델 · 모듈 · 배포 지역을 여기서 본다</p></div>`;
    return;
  }
  const ready = c.status === '준비 중', crop = cardCrop(c), ms = modelsOfCard(c);
  const dep = deploysAll(c.id), dom = domainOf(c.id), sc = scopeById(c.scope);
  const tot = cardTotals(c), res = cardResults(c), runs = runsOfCard(c.id);
  const years = [...new Set(dep.map((d) => d.year))].sort();
  /* 경계선 — LX(판독)과 기관(행정 가공)을 섞어 한 목록으로 내지 않는다. */
  const lxExt = extByOwner(c.ext, 'lx'), localExt = extByOwner(c.ext, 'local');
  const lxDone = lxExt.filter((m) => m.build === 'done').length;
  const devs = devicesOf(c);

  /* 구역 여섯 — 탭 하나에 하나씩. 라벨 옆 숫자는 안에 몇 개가 들었는지 미리 말해 준다
     (접힌 것이 '없는 것'으로 보이지 않게 — 발주자가 잘라낸 화면을 이미 한 번 잡아냈다). */
  const panes = {
    info: `<h4 class="sec-h">행정 업무</h4>
  <dl class="kv cd-kv" style="--kw:78px">
    <div><dt>행정 업무</dt><dd>${esc(c.duty)}</dd></div>
    <div><dt>소관</dt><dd>${esc(cardMinistries(c).join(' · ') || '—')}</dd></div>
    <div><dt>주기</dt><dd>${years.length ? `<span class="n">${years.join(' · ')}</span> <em class="tag">배포 연혁</em>` : '<span class="dim">—</span>'}</dd></div>
    <div><dt>분야</dt><dd>${esc(dom?.name || '미분류')}</dd></div>
    <div><dt>대상 사업</dt><dd>${esc(sc.name)} · ${esc(sc.crs)}</dd></div>
    <div><dt>버전</dt><dd>${c.version ? `<span class="n">${esc(c.version)}</span>` : '<span class="dim">발행 전</span>'}</dd></div>
  </dl>
  <p class="help">법정 조사 주기는 레지스트리에 없다 — 배포본 연혁으로 읽는다.</p>`,

    model: `<h4 class="sec-h">묶은 AI 모델 <span class="n">${ms.length}</span></h4>
  ${ms.length ? `<ul class="cd-models">${ms.map((m) => `<li><span class="cd-mn">${esc(m.name)}</span><span class="cd-mm">${esc(m.ministry)}</span>${m.count > 0 ? `<span class="n cd-mc">${nf.format(m.count)} ${esc(m.unit)}</span>` : '<span class="st st--dim cd-mc">준비 중</span>'}</li>`).join('')}</ul>
  ${tot ? `<p class="mic">실측 합계 <b class="n">${nf.format(tot.items)}</b>건 · 모델 ${tot.models}종 · 최근 실행 <span class="n">${esc(tot.lastRun)}</span></p>` : '<p class="mic">실측 산출물 없음 — 수치를 지어내지 않는다</p>'}`
    : '<p class="empty empty--s">묶인 모델이 없습니다 — 모델 개발 전</p>'}`,

    kind: `<h4 class="sec-h">종류 선언 <span class="n">장치 ${devs.length}</span><span class="sp"></span>
    <button type="button" class="btn-br btn-br--s cd-desc-t" aria-expanded="${modsFull}" style="width:96px">${modsFull ? '설명 접기' : '설명 보기'}</button></h4>
  <p class="cd-kind" id="cd-kindline">${esc(kindLine(c))}</p>
  <ul class="cd-devs" id="cd-devs"${modsFull ? ' data-full' : ''}>
    ${devs.map((d) => `<li data-device="${d.key}"><span class="cd-dv">${esc(d.name)}</span><span class="cd-dw">${esc(d.where)}</span><span class="cd-md">${esc(d.why)}</span></li>`).join('')
    || '<li class="cd-noext" data-device="none">기본형 — 결과 레이어만 켠다</li>'}
  </ul>
  <p class="mic">화면은 카드 이름을 모른다 — 이 선언(<span class="n">kind</span>)만 보고 장치를 켠다. 새 종류가 생기면 선언 한 줄이면 된다.</p>`,

    modlx: `<h4 class="sec-h">공통 <span class="n">${CORE_MODULES.length}</span> + LX 전용 <span class="n">${lxExt.length}</span><span class="sp"></span>
    <button type="button" class="btn-br btn-br--s cd-desc-t" aria-expanded="${modsFull}" style="width:96px">${modsFull ? '설명 접기' : '설명 보기'}</button></h4>
  <p class="cd-owner"><b>${esc(OWNER_LINE.lx.name)}</b> · ${esc(OWNER_LINE.lx.desc)}</p>
  <ul class="cd-mods" id="cd-mods-lx"${modsFull ? ' data-full' : ''}>
    ${CORE_MODULES.map((m) => `<li data-core data-owner="lx"><span class="cd-mk">공통</span><span class="cd-mn">${esc(m.name)}</span><span class="cd-md">${esc(m.desc)}</span><span class="st st--acc">완성</span></li>`).join('')}
    ${lxExt.map((m) => `<li data-owner="lx"><span class="cd-mk cd-mk--ext">전용</span><span class="cd-mn">${esc(m.name)}</span><span class="cd-md">${esc(m.desc)}</span><span class="st ${BUILD[m.build][1]}">${BUILD[m.build][0]}</span></li>`).join('')}
    ${lxExt.length ? '' : '<li class="cd-noext">LX 전용 모듈 없음 — 공통 모듈만으로 서는 카드</li>'}
  </ul>
  <p class="mic">LX 전용 모듈 <b class="n">${lxDone}</b> / ${lxExt.length} 완성 · 공통 모듈 ${CORE_MODULES.length}은 모든 카드가 상속한다</p>`,

    modlocal: `<h4 class="sec-h">기관 가공 모듈 <span class="n">${localExt.length}</span><span class="sp"></span>
    <button type="button" class="btn-br btn-br--s cd-desc-t" aria-expanded="${modsFull}" style="width:96px">${modsFull ? '설명 접기' : '설명 보기'}</button></h4>
  <p class="cd-owner cd-owner--local"><b>${esc(OWNER_LINE.local.name)}</b> · ${esc(OWNER_LINE.local.desc)}</p>
  <ul class="cd-mods cd-mods--local" id="cd-mods-local"${modsFull ? ' data-full' : ''}>
    ${localExt.map((m) => `<li data-owner="local"><span class="cd-mk cd-mk--loc">기관</span><span class="cd-mn">${esc(m.name)}</span><span class="cd-md">${esc(m.desc)}</span><span class="st st--dim">기관이 수행</span></li>`).join('')
    || '<li class="cd-noext">기관 가공 모듈 없음</li>'}
  </ul>
  <p class="mic">이 <b class="n">${localExt.length}</b>개는 LX 화면에서 돌지 않는다 — 기관 작업공간(<span class="n">${esc(OWNER_LINE.local.screen)}</span>)이 맡는다. LX 는 판독까지다.</p>`,

    /* 배포 표와 결과 목록은 처음에 한 구역에 좌우로 붙여 봤다. 판이 좁아지면(1366 에서 417px)
       좌우가 풀려 세로로 쌓이고 표 하나만 200px 이라 구역이 넘쳤다 — 그래서 구역을 둘로 갈랐다. */
    dep: `<h4 class="sec-h">배포 지역 <span class="n">${dep.length}</span></h4>
  ${dep.length ? `<div class="tbl-wrap"><table class="tbl tbl--s" aria-label="${esc(c.name)} 배포본"><colgroup><col style="width:52px"><col><col style="width:62px"></colgroup>
    <thead><tr><th scope="col">연도</th><th scope="col">지역 · 규모</th><th scope="col">상태</th></tr></thead>
    <tbody>${dep.map((d) => { const up = updateState(d); return `<tr${d.added ? ' class="is-new"' : ''} data-deploy="${esc(d.id)}"><td class="num"><span class="n">${d.year}</span></td><td>${esc(d.region)}<span class="cd-scale">${esc(d.scale)}${up && up.level !== 'same' ? ` · 갱신 필요(${esc(up.level)})` : ''}</span></td><td>${stWord(d.status)}</td></tr>`; }).join('')}</tbody></table></div>`
    : '<p class="empty empty--s">배포본 없음 — 아직 어느 지역에도 심지 않았다</p>'}`,

    res: `<h4 class="sec-h">실행 · 결과 <span class="n">${runs.length}</span></h4>
  ${res.length ? `<ul class="cd-res">${res.map((r) => `<li><a class="link link--ink" href="ximap.html?result=${esc(r.id)}" data-result="${esc(r.id)}">${esc(r.title)} ›</a><span class="n">${nf.format(r.stats.count)} ${esc(r.unit)}</span><span class="mic">${esc(r.stats.analyzedAt)}</span></li>`).join('')}</ul>`
    : '<p class="empty empty--s">결과 대장에 산출물이 없습니다 — 실행 전</p>'}`,
  };
  /* 라벨의 `<span class="cd-tw">` 는 **판이 좁아지면 접히는 꼬리말**이다(CSS 가 감춘다).
     좁은 판에서 일곱 개가 두 줄로 밀리면 탭 줄만 50px 을 먹는다 — 꼬리말을 접으면 한 줄이 된다.
     라벨은 코드에 박힌 글자라 esc() 를 통과시키지 않는다. */
  const TABS_CD = [
    ['info', '개요', ''],
    ['model', '모델', ms.length],
    ['kind', '종류', devs.length],
    ['modlx', 'LX<span class="cd-tw"> 모듈</span>', CORE_MODULES.length + lxExt.length],
    ['modlocal', '기관<span class="cd-tw"> 모듈</span>', localExt.length],
    ['dep', '배포', dep.length],
    ['res', '결과', res.length],
  ];
  if (!panes[cdTab]) cdTab = 'info';

  panel.innerHTML = `
<header class="panel-h"><h2>카드 상세</h2><span class="sp"></span>${c.projectId ? `<a class="link link--ink" href="ai-project.html?pid=${esc(c.projectId)}" id="to-project">이 카드를 만든 프로젝트 ›</a>` : '<span class="mic">연결된 프로젝트 없음 · 모델 개발 전</span>'}</header>
<div class="panel-b" id="cdetail-b">
  <div class="cd-top">
    ${crop ? `<figure class="imgcard cd-img" style="--ar:16/9"><img src="${esc(crop.src)}" alt="${esc(crop.of)}"></figure>`
    : `<div class="imgcard imgcard--none cd-img" style="--ar:16/9">결과 산출물 없음${c.gap ? ` · ${esc(c.gap)}` : ''}</div>`}
    <div class="cd-top-b">
      <p class="lb">선택 · ${esc(sc.name)}</p>
      <div class="cd-head"><h3 class="panel-t">${esc(c.name)}</h3>${stWord(c.status)}${c.version ? `<span class="n cd-v">${esc(c.version)}</span>` : ''}</div>
      <p class="prose cd-sum">${esc(c.summary)}</p>
      ${ready ? `<p class="cd-why"><span class="st st--dim">준비 중</span> ${esc(c.gap || '아직 결과 산출물이 없는 서비스 · 분석 실행 불가')}</p>` : ''}
      ${crop ? `<p class="mic cd-cap">${esc(crop.of)} · ${crop.kind === 'result' ? '결과 크롭 · 실측' : '배포 지역 영상 · 결과 아님'}</p>` : ''}
    </div>
  </div>
  <div class="cd-bar">
    <nav class="cd-tabs" role="tablist" aria-label="카드 상세 구역">
      ${TABS_CD.map(([k, label, n]) => `<button type="button" role="tab" data-cdt="${k}" aria-selected="${k === cdTab}">${label}${n === '' ? '' : `<span class="n">${n}</span>`}</button>`).join('')}
    </nav>
    <p class="acts cd-tp">${c.portable
    ? `<button type="button" class="btn-br btn-br--s" id="tp-open">다른 지역에 이식 ›</button>`
    : `<span class="mic">이식 불가 — ${esc(c.gap || '지역 의존 자료가 커 배포본을 복제할 수 없다')}</span>`}</p>
  </div>
  ${TABS_CD.map(([k]) => `<div class="cd-pane" role="tabpanel" data-cdp="${k}"${k === cdTab ? '' : ' hidden'}>${panes[k]}</div>`).join('')}
</div>
<footer class="panel-f">
  <span class="mic">${esc(dom?.name || '미분류')} · LX 모듈 ${CORE_MODULES.length + lxExt.length} · 기관 ${localExt.length}</span>
  <button type="button" class="btn-br" id="cd-results"${res.length ? '' : ' disabled'}>결과 보기</button>
  <button type="button" class="btn-br" id="cd-history">실행 이력</button>
  ${ready ? '<button type="button" class="btn-br" id="cd-run" disabled>준비 중</button>' : '<button type="button" class="btn" id="cd-run">분석 실행</button>'}
</footer>`;

  /* 탭 전환은 다시 그리지 않는다 — 판 전체를 갈아 끼우면 들어오는 애니메이션이 매번 돈다. */
  $('.cd-tabs', panel).addEventListener('click', (e) => {
    const b = e.target.closest('[data-cdt]'); if (!b) return;
    cdTab = b.dataset.cdt;
    $$('[data-cdt]', panel).forEach((x) => x.setAttribute('aria-selected', String(x.dataset.cdt === cdTab)));
    $$('[data-cdp]', panel).forEach((x) => { x.hidden = x.dataset.cdp !== cdTab; });
  });
  $$('.cd-desc-t', panel).forEach((b) => b.addEventListener('click', () => { modsFull = !modsFull; drawDetail(S); }));
  $('#cd-results')?.addEventListener('click', () => commit({ tab: 'done', run: res[0]?.id || '' }));
  $('#cd-history')?.addEventListener('click', () => commit({ tab: 'running' }));
  if (!ready) $('#cd-run')?.addEventListener('click', () => commit({ tab: 'run', card: c.id }));
  $('#tp-open')?.addEventListener('click', () => commit({ pick: 'transplant' }, true));
  $('#cdetail-b').classList.add('is-in');
}

/* ══ 4. 이식 마법사 ═══════════════════════════════════════════════════════
   발주자 요구: "남원에 분기한 서비스를 다른 지자체에 이식".
   정본 규칙(R3 · R7): 카드는 복사하지 않고 **지역 프로파일 + 배포본 한 줄**을 더한다.
   원본 정사영상은 LX 가 보관하고 **영상 이미지(타일)만 권한으로 닿게** 한다. */
let tpModal = null;
function openTransplant(S) {
  const card = cardById(S.card); if (!card || tpModal) return;
  const mine = new Set(regionsAll(card.id));
  let pid = PROFILES.find((p) => !mine.has(p.region))?.id || PROFILES[0].id;

  tpModal = openModal({
    title: '이식 — 다른 지역에 이 카드를 심는다', tag: '시연', width: 940,
    content: '<div class="tp" id="tp"></div>',
    actions: [
      { label: '취소', kind: 'bracket' },
      { label: '이식 요청', kind: 'primary', onClick: () => { request(); return false; } },
    ],
    onClose: () => { tpModal = null; commit({ pick: '' }, false); },
  });
  const host = $('#tp', tpModal.el);

  function draw() {
    const chk = transplantCheck(card.id, pid), as = transplantAssets(card.id), img = imageryReady(card.id, pid);
    const pf = chk.profile, already = mine.has(pf.region);
    host.innerHTML = `
<p class="tp-line">${esc(as.line)}</p>
<div class="tp-pick" role="radiogroup" aria-label="대상 지역 프로파일">
  ${PROFILES.map((p) => `<button type="button" class="chip-b" role="radio" data-pf="${p.id}" aria-checked="${p.id === pid}">${esc(p.region)}${mine.has(p.region) ? ' · 배포됨' : ''}</button>`).join('')}
  <span class="mic">프로파일 ${PROFILES.length} · 새 지자체는 프로파일 한 벌 + 배포본 한 줄이면 된다</span>
</div>
<dl class="kv tp-pf" style="--kw:84px">
  <div><dt>지역</dt><dd>${esc(pf.region)} <span class="n">${esc(pf.code)}</span></dd></div>
  <div><dt>규모</dt><dd><span class="n">${pf.area}</span> km² · ${esc(pf.unitLabel)} <span class="n">${pf.units}</span> · ${esc(pf.crs)}</dd></div>
  <div><dt>보유 레이어</dt><dd>${esc(pf.layers.join(' · '))}</dd></div>
  <div><dt>보유 영상</dt><dd>${esc(pf.imagery.join(' · ') || '없음')}</dd></div>
</dl>

<h4 class="sec-h">점검표 <span class="n">${chk.rows.filter((r) => r.ok).length} / ${chk.rows.length}</span></h4>
<ul class="tp-check">${chk.rows.map((r) => `<li data-ok="${r.ok}">${icon(r.ok ? 'check' : 'x', 15)}<span class="tp-need">${esc(r.need)}</span><span class="st ${r.ok ? 'st--acc' : 'st--warn'}">${esc(r.by)}</span></li>`).join('')}</ul>

<div class="tp-cols">
  <section class="tp-col"><h4 class="sec-h">가져갈 것 <span class="n">${as.goes.length}</span></h4>
    <ul class="tp-list">${as.goes.map((t) => `<li><span class="tp-t">${esc(t.name)}</span><em class="chip chip--teal">${esc(SHARE_LABEL[t.share])}</em><span class="tp-d">${esc(plain(t.how))}</span></li>`).join('')}</ul></section>
  <section class="tp-col"><h4 class="sec-h">현지에서 준비할 것 <span class="n">${as.localNeed.length + as.layerNeed.length}</span></h4>
    <ul class="tp-list">${[...as.localNeed, ...as.layerNeed].map((n) => `<li><span class="tp-t">${esc(n)}</span><em class="chip">${/영상|정사|위성/.test(n) ? '촬영 · 조달' : '레이어 확보'}</em></li>`).join('') || '<li class="tp-none">추가 준비 없음</li>'}</ul>
    <p class="mic">${esc(img.note)}</p></section>
  <section class="tp-col"><h4 class="sec-h">LX 보관 <span class="n">${as.stays.length}</span></h4>
    <ul class="tp-list">${as.stays.map((t) => `<li><span class="tp-t">${esc(t.name)}</span><em class="chip">${esc(SHARE_LABEL[t.share])}</em><span class="tp-d">${esc(plain(t.how))}</span></li>`).join('')}
    ${as.grant.filter((t) => t.share === 'grant').map((t) => `<li><span class="tp-t">${esc(t.name)}</span><em class="chip chip--on">${esc(SHARE_LABEL[t.share])}</em><span class="tp-d">${esc(plain(t.how))}</span></li>`).join('')}</ul></section>
</div>

<h4 class="sec-h">막는 것 <span class="n">${chk.blockers.length}</span></h4>
${chk.blockers.length
    ? `<ul class="tp-block">${chk.blockers.map((b) => `<li><span class="st st--warn">미충족</span>${esc(b)}</li>`).join('')}</ul>
       <p class="mic">막는 것이 남아도 이식 요청은 보낼 수 있다 — 배포본은 <b>예정</b> 으로 선다.</p>`
    : '<p class="empty empty--s">막는 것 없음 — 바로 심을 수 있다</p>'}
${already ? '<p class="tp-dup"><span class="st st--warn">이미 배포됨</span> 이 지역에는 같은 카드의 배포본이 이미 있다 — 요청하면 한 줄이 더 선다.</p>' : ''}
${chk.scopeMatch ? '' : `<p class="tp-dup"><span class="st st--warn">분기 불일치</span> 카드는 ${esc(scopeById(card.scope).name)}, 프로파일은 ${esc(scopeById(pf.scope).name)}이다.</p>`}`;
  }
  host.addEventListener('click', (e) => {
    const b = e.target.closest('[data-pf]'); if (!b) return;
    pid = b.dataset.pf; draw(); $(`[data-pf="${pid}"]`, host)?.focus();
  });
  function request() {
    const pf = PROFILES.find((p) => p.id === pid), chk = transplantCheck(card.id, pid);
    const year = Math.max(2026, ...deploysAll(card.id).map((d) => d.year)) + 1;
    addDeploy({
      id: `dp-x-${card.id}-${pid}-${Date.now().toString(36)}`, cardId: card.id, year, region: pf.region,
      status: '예정', scale: '미정 · 이식 요청', added: true,
      note: `이식 요청 · 라벨 · 모델 사본 동행 · 정사영상 현지 확보 · 미충족 ${chk.blockers.length}`,
    });
    say(`${pf.region} 배포본을 더했습니다 — 예정 · 시연`);
    tpModal.close();
    commit({ pick: '' });
  }
  draw();
}
