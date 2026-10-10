/* ops-infra — 인프라 · 기관 · 배포(관제 메뉴 5 중 3). 셸은 ops-core 와 같은 메뉴 5.
   정문 로그인(관리자)만 들어온다(K2). GPU 표는 관제 스트림(S-9 · Origin 4173)이 열리면 그것으로, 아니면 2.5초 조회로 갱신. */
import { gate, shell, devDrawer, devlog, closeAll, empty, sse, mountCmdk } from './kit.js';
import { S, loadGpus, loadInfra, loadOrg } from './data.js';
import { mountInfra } from './infra.js';
import { mountTenants } from './tenants.js';
import { mountDeploys } from './deploys.js';
import { mountSpaces } from './spaces.js';   // 기관 → '기관 공간' 탭(구현 3차 · 13차 분기-3 ⓒ 1단 · 보기 · 지원만)
import { mountTenantPage } from './tenant-page.js';   // 기관 → '기관 한 곳' 새 화면(now 질문 17 ⓑ — 탭 넷)
import { mountRelease } from './release.js'; // 배포 → 세 탭(배포 신청 · 기관 공유 · 사용 현황 — 10-09 배포-3 ⓐ · 배포-5) + 개선 후보(16차 개선-1)
// 결재 대기 수 — ops-core 와 같은 규칙 하나(pending())를 그대로 센다(셸 = ops-core 와 동일)
import { loadPending as loadApprovals, pending } from '../../ops-core/js/data.js';     // 배지만 — 사용량 집계를 다시 부르지 않는다

const OPS = '/landxi/v3/ops-core/';
const VIEWS = ['infra', 'tenants', 'deploys'];
const RAIL = [
  { id: 'overview', label: '현황', icon: 'map', href: OPS + '#/overview' },
  { id: 'infra', label: '인프라', icon: 'gear', href: '#/infra' },
  { id: 'tenants', label: '기관', icon: 'org', href: '#/tenants' },
  { id: 'deploys', label: '배포', icon: 'deploy', href: '#/deploys' },
  { id: 'approvals', label: '요청 관리', icon: 'inbox', href: OPS + '#/approvals' },
  { id: 'reviews', label: '검토 요청', icon: 'list', href: '/landxi/v3/lx-inbox/' },   // LX 관리자 대시보드와 같은 메뉴(원칙 43)
  { id: 'accounts', label: '계정 관리', icon: 'check', href: '/landxi/v3/ops-accounts/' },   // 가입 신청 · 재설정 · 계정(구현 2차 T5 · 정리 — 메뉴로 잇기)
];

const who = await gate('ops-infra');
const qs = new URLSearchParams(location.search);
const deepDeploy = qs.get('deploy');
const want = () => { const v = (location.hash.match(/^#\/(\w+)/) || [])[1] || qs.get('view'); return VIEWS.includes(v) ? v : deepDeploy ? 'deploys' : 'infra'; };

const Sh = shell({ who, home: 'ops-infra', title: 'LX 관리자 대시보드', rail: { kind: 'menu', items: RAIL, current: RAIL.findIndex((r) => r.id === want()) } });
// 역할 칩 중복 방지(ops-core 와 같은 처리): 이름이 역할 문구와 같으면 한 번만 → 'LX 관리자'
{ const r = document.querySelector('.k-role'), b = r?.querySelector('b');
  if (b && r.textContent.slice(b.textContent.length).trim() === b.textContent.trim()) b.remove(); }
/* Ctrl K — LX 관리자 운영 질문(GPU · 대기열 · 경보 · 기관 사용량 · 언어 모델). 답의 숫자는 운영 도구 봉투(= 이 화면과 같은 값) */
const VIEW_KO = { infra: '인프라', tenants: '기관', deploys: '배포' };
const ck = who.key !== 'lx/admin' ? null : mountCmdk({ context: () => ({ screen: 'ops', screen_name: `LX 관리자 대시보드 · ${VIEW_KO[document.body.dataset.view] || '인프라'}` }) });
if (ck) { const b = ck.button(); b.querySelector('span').textContent = '물어보기'; Sh.mast(b);
  const i = ck.el.querySelector('.k-ck-i'); if (i) i.placeholder = 'GPU 상태 · 대기열 요약 · 경보 있어?'; }
/* 레일 '결재' 배지 — ops-core 와 같은 대기 건수 */
let pendN = 0;
const putBadge = () => { const el = Sh.rail?.querySelector('[data-i="4"]'); if (el) el.dataset.n = pendN ? String(pendN) : ''; };
async function badge() {
  try { await loadApprovals(); } catch { return; }
  pendN = pending().length; putBadge();
}
badge(); setInterval(badge, 30000);
devDrawer({ who });
const main = Sh.main;
main.classList.add('oi');

const panes = Object.fromEntries(VIEWS.map((v) => [v, Object.assign(document.createElement('div'), { className: 'pane', id: 'pane-' + v, hidden: true })]));
main.append(...Object.values(panes));
const boot = document.createElement('div'); boot.className = 'oi-boot'; main.append(boot);
empty(boot, { kind: 'loading' });

/* 배포 메뉴 = 세 탭(release.js). 옛 배포본 표(다른 지역에 적용 · 단계)는 탭에서 뺐다 — 깊은 주소(?deploy=)의 배포본 시트만 그대로 연다 */
const oldDeploys = Object.assign(document.createElement('div'), { hidden: true });
const V = { infra: mountInfra(panes.infra), tenants: mountTenants(panes.tenants), deploys: mountDeploys(oldDeploys) };
mountSpaces(panes.tenants);
mountTenantPage(panes.tenants);
const REL = mountRelease(panes.deploys);

let cur = null;
function show() {
  const v = want();
  if (v === cur) return;
  closeAll();
  cur = v;
  for (const k of VIEWS) panes[k].hidden = k !== v;
  Sh.go(RAIL.findIndex((r) => r.id === v)); putBadge();
  document.body.dataset.view = v;
  document.title = { infra: 'Land-XI · LX 관리자 화면 · 인프라', tenants: 'Land-XI · LX 관리자 화면 · 기관', deploys: 'Land-XI · LX 관리자 화면 · 배포' }[v];
  paint(v);
  if (v === 'deploys') REL.paint();     // 배포 탭은 들어올 때 · 서버 알림 때만 다시 읽는다(30초 갱신으로 적던 사유가 지워지지 않게)
}
function paint(v = cur) {
  if (v === 'infra') { V.infra.paintGpus(); V.infra.paintRest(); }
  else if (v === 'tenants') V.tenants.paint();
  else if (v === 'deploys') V.deploys.paint();
}
addEventListener('hashchange', show);

await Promise.all([loadGpus(), loadInfra(), loadOrg()]);
boot.remove();
show();
Sh.fresh(new Date());
if (deepDeploy) V.deploys.open(deepDeploy);
const deepOrg = qs.get('tenant'); if (deepOrg && cur === 'tenants') V.tenants.open(deepOrg);

/* ── 갱신 — 숫자만 바뀐다 ─────────────────────── */
let live = false;
async function tickGpu() {
  if (live) return;
  if (await loadGpus()) { if (cur === 'infra') V.infra.paintGpus(); Sh.fresh(new Date()); }
}
setInterval(tickGpu, 2500);
setInterval(async () => { await loadInfra(); if (cur === 'infra') V.infra.paintRest(); }, 15000);
setInterval(async () => { await loadOrg(); if (cur !== 'infra') paint(); }, 30000);

/* 관제 스트림은 서버가 4173 을 허용한 뒤(S-9 = power_budget 이 응답에 있음)에만 연다 — 거절로 콘솔을 더럽히지 않게 */
if (S.gpus?.power_budget) {
  try {
    sse('/events/ops', {
      events: ['gpu.sample', 'deploy.changed', 'usage.delta'],
      on: async (ev, data) => {
        if (ev === 'gpu.sample' && data?.gpus?.length) { live = true; await loadGpus(); if (cur === 'infra') V.infra.paintGpus(); Sh.fresh(new Date()); }
        else if (ev === 'deploy.changed') { await loadOrg(); if (cur === 'deploys') { V.deploys.paint(); if (!panes.deploys.contains(document.activeElement) || document.activeElement === document.body) REL.paint(); } }
        else if (ev === 'usage.delta') { await loadOrg(); if (cur === 'tenants') V.tenants.paint(); }
      },
      onState: (s) => { devlog('실시간 스트림', s); if (s !== 'open') live = false; },
    });
  } catch { live = false; }
} else devlog('실시간 스트림', '서버 S-9 전 · 2.5초 조회');
