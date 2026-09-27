/* survey-panel.js — 모드 스위치(판독 ◉ 실태조사 ○ · 레이어 패널 위) + 레이어 패널 '조사' 탭: 업무 선택 판 10행 · 규칙 6행 · 등급 3.
   업무 판: 남원 배포본 dp-nw-farm-25 에 연결된 농지이용(farmland)만 켜짐 — 나머지는 '배포본 없음 · 점선'(지어낸 연결 0).
   규칙 행: 이름 · 조건 · 건수 봉투(inferred) · 임계 꼬리표 '추정 초기값' — 체크로 지도 해치·큐 필터. 게스트(public=1)에는 스위치 자체가 없다. */
import { numHtml } from '../fx/provenance.js';
import { E } from './api-survey.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
/** 부처별 실태조사 카탈로그(SURVEY-SPEC §1.1 · 브리프 10행) — 배포본이 있는 것만 켜진다 */
export const DUTIES = [
  { id: 'farmland', name: '농지이용 실태조사', who: '농식품부 · 시군 농정과', cycle: '매년', law: '농지법 §54', deploy: 'dp-nw-farm-25' },
  { id: 'farm_conv', name: '농지전용 실태조사', who: '농식품부 · 시군 농정과', cycle: '수시', law: '농지법 §34' },
  { id: 'dev_permit', name: '개발행위허가 사후관리', who: '국토부 · 시군 도시과', cycle: '수시', law: '국토계획법 §56' },
  { id: 'landuse', name: '지목 불부합(토지이용현황)', who: '국토부 · LX · 시군 지적과', cycle: '수시', law: '공간정보관리법' },
  { id: 'public_asset', name: '공유재산 실태조사', who: '행안부 · 시군 회계과', cycle: '매년', law: '공유재산법' },
  { id: 'river_occupy', name: '하천점용 실태조사', who: '환경부·행안부 · 시군 하천과', cycle: '수시', law: '하천법 §33' },
  { id: 'trash', name: '방치폐기물 실태조사', who: '환경부 · 시군 환경과', cycle: '분기', law: '폐기물관리법 §8' },
  { id: 'forest', name: '산림훼손 실태조사', who: '산림청 · 시군 산림과', cycle: '수시', law: '산지관리법' },
  { id: 'marine', name: '해양쓰레기 실태조사', who: '해수부 · 시군 해양수산과', cycle: '연 4회', law: '해양폐기물관리법' },
  { id: 'illegal_bldg', name: '무허가건축물 단속', who: '국토부 · 시군 건축과', cycle: '연 1회', law: '건축법 §79' },
];

/** 모드 스위치(판독 · 실태조사) */
export function modeSwitch(el, { mode, onChange }) {
  el.innerHTML = `<button type="button" data-m="read" aria-pressed="${mode === 'read'}"><i></i>판독</button><button type="button" data-m="survey" aria-pressed="${mode === 'survey'}"><i></i>실태조사 <small>남원 · 농지</small></button>`;
  el.hidden = false; document.documentElement.dataset.modesw = '1';
  el.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => { if (b.getAttribute('aria-pressed') !== 'true') onChange(b.dataset.m); }));
  return { set(m) { el.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.m === m))); } };
}

/** 패널 '조사' 탭 본문 — ctx = { rules, totals, deploy, filters:{rules:Set, prio:Set}, onRule, onPrio, onQueue, onRerun, canRun, via } */
export function renderSurveyTab(body, ctx) {
  const { rules, totals } = ctx;
  const src = ctx.via || 'findings-emd.json';
  const dp = ctx.deploy;
  body.innerHTML = `
    <section class="sv-sec"><h3>업무 선택 · 부처별 실태조사 <small>10</small></h3>
      <ul class="sv-duty" role="radiogroup" aria-label="실태조사 업무">${DUTIES.map((d) => d.deploy
        ? `<li data-duty="${d.id}" data-live="1" data-on="1" role="radio" aria-checked="true"><i class="sv-radio"></i><span>${esc(d.name)}</span><span class="mono">${esc(dp?.id || d.deploy)} · ${esc(dp?.version || '')}</span><small>${esc(d.who)} · ${esc(d.cycle)} · ${esc(d.law)} [법령 확인] · 규칙 ${rules.length}</small></li>`
        : `<li data-duty="${d.id}" data-live="0" data-on="0" role="radio" aria-checked="false" aria-disabled="true"><i class="sv-radio"></i><span>${esc(d.name)}</span><span class="cw-void xi-void">배포본 없음</span><small>${esc(d.who)} · ${esc(d.cycle)}</small></li>`).join('')}</ul></section>
    <section class="sv-sec"><h3>대장 대조 규칙 <small>R1–R6 · v1.0</small></h3>
      <ul class="sv-rules">${rules.map((r) => `<li data-rule="${r.id}" data-on="${ctx.filters.rules.has(r.id) ? 1 : 0}"><button type="button" class="xi-check" aria-pressed="${ctx.filters.rules.has(r.id)}" aria-label="${esc(r.id)} ${esc(r.name)}"></button>
        <b class="sv-rid">${esc(r.id)}</b><span>${esc(r.name)}</span>${numHtml(E(r.count, 'count', 'inferred', src, `${r.id} 의심 건 · 검수 전`), { unit: false })}
        <small>${esc(r.condition)} <b class="sv-th" title="임계는 [추정 초기값] — 현장 확인 결과로 재교정">추정 초기값</b></small></li>`).join('')}</ul>
      <div class="sv-prio" role="group" aria-label="등급">${['A', 'B', 'C'].map((p) => `<button type="button" class="sv-chip" data-prio="${p}" aria-pressed="${ctx.filters.prio.has(p)}">${p} ${numHtml(E(totals.by_priority[p], 'count', 'inferred', src, `등급 ${p} · 점수 상위 ${p === 'A' ? '5%' : p === 'B' ? '다음 20%' : '나머지'}`), { unit: false })}</button>`).join('')}</div>
      <p class="xi-hint">의심 ${numHtml(E(totals.findings, 'count', 'inferred', src), { unit: false })}건 / ${numHtml(E(totals.suspect_parcels, '필지', 'inferred', src), { unit: false })}필지 · 연속지적 ${numHtml(E(totals.parcels, '필지', 'recorded', 'V-World 연속지적 2026-09-24'), { unit: false })}필지 × AI 2023 · 위법 판정 아님 · <b data-basis="estimate">추정</b> 임계</p>
      <div class="sv-cta"><button type="button" class="xi-btn xi-btn--ink sv-q">의심 큐 열기 ›</button><button type="button" class="xi-btn xi-btn--br sv-re" ${ctx.canRun ? '' : 'disabled'}>대조 다시 실행 ›</button></div></section>`;
  body.querySelectorAll('.sv-rules .xi-check').forEach((b) => b.addEventListener('click', () => ctx.onRule(b.closest('li').dataset.rule)));
  body.querySelectorAll('.sv-prio [data-prio]').forEach((b) => b.addEventListener('click', () => ctx.onPrio(b.dataset.prio)));
  body.querySelector('.sv-q').addEventListener('click', () => ctx.onQueue());
  body.querySelector('.sv-re').addEventListener('click', () => ctx.onRerun());
}
