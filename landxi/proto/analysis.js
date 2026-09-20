/* 분석 서비스 — 서비스 카드 진열대 + 분석 실행 · 실행중 · 완료.
   원판: design-canvas/v2/renders/B5-Analysis-{List,Run-Review,Run-Progress,Result}.png ·
        B7-Analysis-{List,Progress-Overlay,Result-Edit,Share}.png · 기록 notes/B7-project-states.md §분석
   사양: docs/superpowers/specs/2026-09-20-{platform-roles,card-architecture}.md · 브리프 proto/2026-09-20-b7-impl-brief.md
   데이터: 카드·모듈·이식 = assets/data/{cards,registry}.js **만** 읽는다(성장 규칙 R5 — 카드를 더해도 이 파일은 그대로다).
          수치 = results.js · services.js · imagery.js · models.js 실측. 없는 값은 지어내지 않고 `준비 중` + 사유 한 줄.
   상태는 URL 에(뒤로 가기 동작) · 변경은 sessionStorage(새로고침하면 시드 복귀). */
import { mountShell, esc, $, say } from './shell.js';
import { SCOPES, scopeById, scopeSummary, cardById } from '../assets/data/cards.js';
import { runsByState } from './analysis-data.js';
import { renderShelf, shelfCount, deployById } from './analysis-cards.js';
import { renderRun, renderRunning, renderDone } from './analysis-run.js';

/* ── URL 이 상태다. 기본값과 다른 키만 쿼리에 남긴다(선례 admin.js urlState). ── */
const DEFAULTS = { tab: 'cards', scope: 'local', card: '', domain: '', status: '', region: '', q: '', run: '', edit: '', pick: '', svc: '' };
const NUMS = new Set();
function readUrl() {
  const p = new URLSearchParams(location.search), s = { ...DEFAULTS };
  for (const k of Object.keys(DEFAULTS)) if (p.has(k)) s[k] = NUMS.has(k) ? +p.get(k) : p.get(k);
  if (p.has('result')) { s.tab = 'done'; s.run = p.get('result'); }   // 지도·대시보드에서 결과로 바로 들어오는 딥링크
  if (p.has('card') && !p.has('tab')) s.tab = 'cards';
  /* 포털(서비스 카드 = 배포본)에서 넘어오면 그 배포본 맥락으로 연다 — 지역 · 카드 · 분기가 고정된다. */
  if (s.svc) {
    const d = deployById(s.svc), c = d && cardById(d.cardId);
    if (c) { s.card = c.id; s.scope = c.scope; if (!p.has('region')) s.region = d.region; if (!p.has('tab')) s.tab = 'done'; }
    else s.svc = '';
  }
  if (!TABS.some((t) => t.key === s.tab)) s.tab = 'cards';
  if (!SCOPES.some((x) => x.id === s.scope)) s.scope = 'local';
  return s;
}
function writeUrl(s, push = true) {
  const p = new URLSearchParams();
  for (const k of Object.keys(DEFAULTS)) if (s[k] !== DEFAULTS[k] && s[k] !== '' && s[k] != null) p.set(k, s[k]);
  const url = location.pathname + (p.toString() ? '?' + p : '');
  if (url === location.pathname + location.search) return;
  history[push ? 'pushState' : 'replaceState'](null, '', url);
}

const TABS = [
  { key: 'cards', label: '서비스', href: 'analysis-ai.html' },
  { key: 'run', label: '분석 실행', href: 'analysis-ai.html?tab=run' },
  { key: 'running', label: '실행중', href: 'analysis-ai.html?tab=running' },
  { key: 'done', label: '완료', href: 'analysis-ai.html?tab=done' },
];

let S = readUrl();

const shell = mountShell({
  active: 'analysis', title: '분석 서비스', fit: true, asOf: '2026-08-27', demo: true,
  subtitle: '&nbsp;', headRight: `<nav class="ptabs an-tabs" data-style="line" id="atabs" aria-label="분석 서비스 메뉴"></nav>`,
});
if (!shell) throw new Error('gate');        // 관문이 로그인으로 보냈다
const main = shell.main;
main.insertAdjacentHTML('beforeend', '<p id="svc-bar" class="an-svc" hidden></p><div id="view" class="an-view"></div>');
const view = $('#view');

/* 서비스 카드(배포본) 맥락 띠 — 포털에서 넘어왔을 때만. 두 '카드' 를 혼동하지 않게 이름을 적는다. */
function drawSvc() {
  const bar = $('#svc-bar'), d = S.svc ? deployById(S.svc) : null;
  bar.hidden = !d;
  if (!d) return;
  const c = cardById(d.cardId);
  bar.innerHTML = `<span class="chip chip--on">서비스 카드</span><b>${esc(c?.name || d.cardId)}</b><span class="n">${d.year}</span><span>${esc(d.region)}</span><span class="mic">${esc(d.scale)}</span><span class="sp"></span><a class="link link--ink" href="portal.html?svc=${esc(d.id)}">기관 작업공간으로 ›</a><button type="button" class="btn-br btn-br--s" id="svc-clear">맥락 해제</button>`;
  $('#svc-clear').addEventListener('click', () => commit({ svc: '', region: '' }));
}

/* ── 화면 간 이동 · 상태 변경 — 모든 뷰가 이 두 개만 쓴다 ────────────────── */
export function commit(patch = {}, push = true) {
  Object.assign(S, patch);
  writeUrl(S, push);
  render();
}
export const state = () => S;

function drawTabs() {
  const counts = { cards: shelfCount(S), run: null, running: runsByState('running').length, done: runsByState('done').length };
  $('#atabs').innerHTML = TABS.map((t) => {
    const n = counts[t.key];
    return `<a href="${t.href}" data-tab="${t.key}"${t.key === S.tab ? ' aria-current="page"' : ''}>${esc(t.label)}${n != null ? `<b class="n">${n}</b>` : ''}</a>`;
  }).join('');
}
$('#atabs').addEventListener('click', (e) => {
  const a = e.target.closest('a[data-tab]'); if (!a) return;
  e.preventDefault();
  commit({ tab: a.dataset.tab, run: '', edit: '', pick: '' });
});

const SUB = {
  cards: () => { const sc = scopeById(S.scope), n = scopeSummary(S.scope); return `${esc(sc.name)} · 카드 <b class="n">${n.total}</b> · 운영 <b class="n">${n.live}</b> · 묶은 모델 <b class="n">${n.models}</b> · 배포본 <b class="n">${n.deploys}</b>`; },
  run: () => '분석 과제와 정사영상을 골라 실행한다 — 결과는 완료 탭과 지도 서비스로 간다',
  running: () => `대기 · 처리 중 · 처리 실패 <b class="n">${runsByState('running').length}</b>건`,
  done: () => `분석 완료 <b class="n">${runsByState('done').length}</b>건 · 결과 열람 · 수정 · 공유`,
};

function render() {
  drawTabs();
  drawSvc();
  $('#page-sub').innerHTML = SUB[S.tab]();
  view.dataset.tab = S.tab;
  ({ cards: renderShelf, run: renderRun, running: renderRunning, done: renderDone })[S.tab](view, S);
}

addEventListener('popstate', () => { S = readUrl(); render(); });
render();
writeUrl(S, false);
window.addEventListener('lx-analysis-say', (e) => say(e.detail));
