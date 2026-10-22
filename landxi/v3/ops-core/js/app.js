/* ops-core — 관리자 집: 현황(요약 네 칸 + 할 일 표 + 기관 위치 작은 지도 · 10-22 now21 첫인상-관리자현황 ⓐ '지도를 빼고 요약 네 칸 + 표') + 결재함.
   관문(K2) → 셸(K1 · 메뉴 5) → 무대(K3 ops) · 카드(K5) · 큰 숫자(K6) · 표(K12) · 토스트(K13) · 개발자 서랍(K14).
   '지금 내가 승인·조치할 것이 있는가?' 한 질문에만 답한다. */
import { gate, shell, table, drawer, closeAll, toast, devDrawer, devlog, empty, t, mountCmdk } from '../../kit/index.js';
import { h, esc, ymd, api } from '../../kit/util.js';
import { sse } from '../../../shared/api-v1.js';
import { D, loadAll, loadFast, pending, openAlerts, power, decide, hasS9, canon } from './data.js';
import { mountMap } from './map.js';
import { openNoticeWriter, noticeCount } from './notice.js';   // 공지 쓰기(직원-4 ⓐ — LX 직원 대시보드 '공지' 칸에 보인다)
import { mountRequests } from './requests.js';                   // 요청 관리 · 분석 요청 탭(now 질문 16 ⓐ — 순번 · 급함 · 담당 · 보류)
import { modal } from '../../kit/modal.js';
import { mountApiApply } from './apiapply.js';                   // 요청 관리 · API 키 신청 탭(외부 연동 API 3차 — 원칙 184)

const who = await gate('ops-core');
const INFRA = '/landxi/v3/ops-infra/';
const RAIL = [
  { id: 'overview', label: '현황', icon: 'map' },
  { id: 'infra', label: '인프라', icon: 'gear', href: INFRA },
  { id: 'tenants', label: '기관', icon: 'org', href: INFRA + '?view=tenants' },
  { id: 'deploys', label: '배포', icon: 'deploy', href: INFRA + '?view=deploys' },
  { id: 'approvals', label: '요청 관리', icon: 'inbox' },   // 분석 요청(관리) · 승인 요청(승인 · 거절) 두 탭(now 질문 16 ⓐ · 원칙 122)
  { id: 'reviews', label: '검토 요청', icon: 'list', href: '/landxi/v3/lx-inbox/' },   // 기관에서 온 모든 요청 · 대화(알림-1 — 관리자도 함께 본다)
  { id: 'accounts', label: '계정 관리', icon: 'check', href: '/landxi/v3/ops-accounts/' },   // 가입 신청 · 재설정 · 계정(구현 2차 T5 · 정리 — 메뉴로 잇기)
  { id: 'shared', label: '공유 데이터', icon: 'data', href: INFRA + '?view=shared' },   // 영상 목록 · 올리기 · 정보 고치기 · 공개/비공개 · 지우기(10-13 관리자-공유데이터 · 원칙 238)
];
const S = shell({ who, home: 'ops-core', title: 'LX 관리자 대시보드', rail: { kind: 'menu', items: RAIL, current: 0, onPick: (i, it) => { if (!it.href) location.hash = it.id === 'approvals' ? '#/approvals' : '#/'; } } });
// 역할 칩 중복 방지(키트 요청 대기 중 로컬 폴백): 이름이 역할 문구와 같으면 역할 문구 한 번만 → 'LX 관리자'
{ const r = document.querySelector('.k-role'), b = r?.querySelector('b');
  if (b && r.textContent.slice(b.textContent.length).trim() === b.textContent.trim()) b.remove(); }
document.body.classList.remove('oc-boot');
/* Ctrl K — LX 관리자 운영 질문(GPU · 대기열 · 경보 · 기관 사용량 · 언어 모델) · 관리자 계정만(관문이 관리자만 들인다) */
const ck = who.key === 'lx/admin'
  ? mountCmdk({ context: () => ({ screen: 'ops', screen_name: document.body.dataset.view === 'approvals' ? 'LX 관리자 대시보드 · 요청 관리' : 'LX 관리자 대시보드 · 현황' }) }) : null;
if (ck) { const b = ck.button(); b.querySelector('span').textContent = '물어보기'; S.mast(b);
  const i = ck.el.querySelector('.k-ck-i'); if (i) i.placeholder = 'GPU 상태 · 대기열 요약 · 경보 있어?'; }

/* ── 판 두 장: 현황 · 결재 ─────────────────── */
const over = h('section.oc-over', { 'aria-label': '현황' });
const inbox = h('section.oc-inbox', { 'aria-label': '요청 관리' });
S.main.append(over, inbox);

/* 현황(10-22 now21 첫인상-관리자현황 ⓐ): 관리자가 매일 처음 보는 일 — 승인 대기 · 돌고 있는 분석 · 장비 · 기관 사용 — 네 칸 + 할 일 표.
   기관 위치는 오른쪽 작은 칸(국내 · 해외 · '지도 크게 보기'). 숫자는 모두 서버 한 출처(결재 · 전국 진행 장부 · 장비 · 사용 현황) — 지어낸 값 0.
   값이 오기 전 칸은 옅은 — (기다림 표시는 화면 가운데 하나 · 원칙 161). */
const ARROW = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8h10M9.5 4.5 13 8l-3.5 3.5"/></svg>';
function cellEl(label, extra = {}) {
  const el = h(extra.href ? 'a.t-card.oc-cell' : 'section.t-card.oc-cell', { ...(extra.href ? { href: extra.href } : {}), 'aria-label': label });
  if (extra.cls) el.classList.add(extra.cls);
  el.append(h('b.oc-cell-k', { text: label }), h('div.oc-cell-v', {}, h('b.oc-txt', { text: '—' })), h('p.oc-cell-s'));
  el.dataset.wait = '1';
  return el;
}
function setCell(el, v, sub, { lv = '' } = {}) {
  delete el.dataset.wait;
  el.querySelector('.oc-cell-v').replaceChildren(...(Array.isArray(v) ? v : [v]));
  el.querySelector('.oc-cell-s').innerHTML = sub || '';
  el.dataset.lv = lv;
}
const numV = (n, unit) => [h('b.oc-num', { text: Number(n).toLocaleString('ko-KR') }), h('small', { text: unit })];
const cApr = cellEl('승인 대기');
const cRun = cellEl('돌고 있는 분석', { href: '/landxi/v3/xi-clean/' });
const cEq = cellEl('장비', { href: INFRA });
const useEl = cellEl('기관 사용', { href: INFRA + '#/deploys/usage', cls: 'oc-use' });   // 서비스 사용 현황(10-09 배포-5) — GET /release/usage 한 출처 · 전체는 배포 메뉴 '사용 현황' 탭
const sum = h('div.oc-sum', {}, cApr, cRun, cEq, useEl);
const todoEl = h('div.oc-todo', { role: 'table', 'aria-label': '할 일' });
const todoCard = h('section.t-card.oc-todo-c', {}, h('h2.oc-h', { text: '할 일' }), todoEl);
// 기관 위치 — 작은 지도(국내 · 해외) · 크게 보기
const stageEl = h('div.oc-map');
const seg = h('div.oc-seg', { role: 'tablist', 'aria-label': '지도 범위' },
  h('button', { type: 'button', role: 'tab', 'aria-selected': 'true', dataset: { s: 'kr' }, text: '국내' }),
  h('button', { type: 'button', role: 'tab', 'aria-selected': 'false', dataset: { s: 'abroad' }, text: '해외' }));
const legend = h('div.oc-legend', { 'aria-hidden': 'true', html: '<span data-stage="ga"><i></i>운영</span><span data-stage="pilot"><i></i>시범</span><span data-stage="verify"><i></i>검증</span><span data-stage="port"><i></i>기관에 공유</span>' });
const bigBtn = h('button.t-btn--text.oc-bigmap', { type: 'button', text: '지도 크게 보기' });
const locCard = h('section.t-card.oc-loc', { 'aria-label': '기관 위치' }, h('header.oc-loc-h', {}, h('h2.oc-h', { text: '기관 위치' }), seg), stageEl, h('footer.oc-loc-f', {}, legend, bigBtn));
const ov = h('div.oc-ov', {}, sum, h('div.oc-row', {}, todoCard, locCard));
over.append(ov);

const M = mountMap(stageEl, { inset: true });
seg.addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  seg.querySelectorAll('button').forEach((x) => x.setAttribute('aria-selected', String(x === b)));
  over.dataset.scope = b.dataset.s;
  M.setScope(b.dataset.s);
});
/* 지도 크게 보기 — 기관 위치 칸이 현황 판 전체로(다시 누르면 작게) */
bigBtn.addEventListener('click', () => {
  const on = !over.classList.contains('is-big');
  over.classList.toggle('is-big', on);
  bigBtn.textContent = on ? '작게 보기' : '지도 크게 보기';
  requestAnimationFrame(() => { M.map.resize(); M.setScope(M.scope); });
});

function drawOverview() {
  const list = pending();
  if (!D.ok) return;                               // 아직 응답 없음(또는 실패 뒤 재시도 대기) = 칸은 옅은 — 그대로
  // ① 승인 대기
  setCell(cApr, numV(list.length, '건'), '<a href="#/approvals">승인 요청함 열기 →</a>', { lv: list.length ? 'on' : 'zero' });
  // ② 돌고 있는 분석 — 전국 결과 진행 + 기관 분석 진행
  const flowing = canon().filter((d) => ['starting', 'analyzing', 'surveying'].includes(d.flow?.state));
  if (nat) setCell(cRun, h('b.oc-txt', {}, h('span.oc-nw', { text: nat.big[0] }), ' · ', h('span.oc-nw', { text: nat.big[1] })), [nat.tail, flowing.length ? `기관 분석 진행 ${flowing.length}` : ''].filter(Boolean).map((x) => `<span class="oc-nw">${esc(x)}</span>`).join(' · '));   // 뜻 덩어리(날짜 · 시각)는 줄 중간에서 끊지 않는다(규칙 9) · 실패한 칸 표시는 할 일 표 줄(경고 글자)에서
  // ③ 장비 — 학습 장비 · 경보(뒤에서 오는 값 — 오기 전에는 옅은 —)
  if (D.restAt) {
    const p = power(), al = openAlerts(), pr = p.pair || {};
    const t1 = pr.mode === 'two' ? '학습 장비 두 장 사용' : pr.configured === 'two' && pr.reason ? '학습 장비 한 장으로 돌아감' : '학습 장비 한 장 사용';
    setCell(cEq, h('b.oc-txt', { text: t1 }), `<span class="oc-nw">${esc(`고부하 ${p.hot}/${p.max}장`)}</span> · <span class="oc-nw">${al.length ? `경보 ${al.length}` : '경보 없음'}</span>`, { lv: p.ok && !al.length ? '' : 'warn' });
  }
  // ④ 기관 사용 — drawUse 가 채운다
  const rows = [];
  rows.push({ k: '승인 요청', t: list.length ? `${list.length}건 기다립니다` : '기다리는 요청이 없습니다', go: '승인 요청함 열기', href: '#/approvals' });
  if (natLine) rows.push(natLine);                  // 전국 결과 자산 진행 한 줄(원칙 218) — GET /national/progress 한 출처 · 누르면 XI맵
  if (flowing.length) rows.push({ k: '기관 분석', t: `AI 분석 진행 ${flowing.length}`, go: '배포 보기', href: INFRA + '?view=deploys' + (flowing.length === 1 ? '&deploy=' + encodeURIComponent(flowing[0].id) : '') });
  if (D.restAt) {                                  // 경보 · 장비는 뒤에서 오는 값 — 오기 전에는 줄을 만들지 않는다(값을 지어내지 않게)
    const al = openAlerts();
    rows.push({ k: '경보', t: al.length ? `경보 ${al.length}` : '없음', lv: al.length ? 'warn' : '', go: al.length ? '인프라 보기' : '', href: INFRA });
    /* 남은 디스크 50GB 아래(10-22 now21 제안-디스크알림) — 디스크마다 한 줄 · 경보 규칙 disk_*_free_lt_50gb 한 출처 */
    for (const a of al.filter((x) => /^disk_[a-z]_free_lt_50gb$/.test(x.rule))) {
      const dv = a.rule.split('_')[1].toUpperCase(), gb = Math.max(0, Math.floor(Number(a.value?.value ?? a.value) || 0));
      rows.push({ k: '저장 공간', t: `저장 공간 부족 · ${dv}: 남은 ${gb}GB`, lv: 'warn', go: '인프라 보기', href: INFRA });
    }
    /* 새 해 영상 공개(10-22 now21 제안-새해영상알림) — 경보 규칙 ngii_new_year 한 출처 · 값 = 열린 해 */
    for (const a of al.filter((x) => x.rule === 'ngii_new_year')) {
      const y = Math.floor(Number(a.value?.value ?? a.value) || 0);
      if (y) rows.push({ k: '새 해 영상', t: `국토지리정보원 ${y}년 항공 영상이 열렸습니다 · 전국 분석 차례를 정해 주세요`, lv: 'warn', go: '진행 보기', href: '/landxi/v3/xi-clean/' });
    }
    const p = power(), pr = p.pair || {};
    if (pr.configured === 'two' && pr.reason && pr.mode !== 'two') rows.push({ ...equipRow(p), k: '장비', go: '인프라 보기' });   // 두 장 사용 시험이 한 장으로 돌아간 때만(까닭 · 시각)
    const ms = D.gpus?.measure_stale;               // 장비 측정(GPU · 저장 폴러)이 멈췄거나 값이 오래됨 — 정상이면 줄 없음(바퀴 17 결정 · GET /ops/gpus 한 출처)
    if (ms?.at) { const d = new Date(ms.at); if (!Number.isNaN(+d)) rows.push({ k: '장비', t: `측정 멈춤 · ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')} 값`, lv: 'warn', go: '인프라 보기', href: INFRA }); }
  }
  if (sameLine) rows.push(sameLine);                 // 해마다 같은 판(10-22 now21 제안-같은판묶기) — 판이 섞인 해가 있을 때만
  if (loopLine) rows.push(loopLine);
  if (dbLine) rows.push(dbLine);                     // DB 상태 한 줄(now21 저장보안-제안-DB상태) — GET /ops/db-status 한 출처
  rows.push({ k: '공지', t: annN === null ? '—' : `${annN}건`, go: '쓰기', href: '#/notice' });   // 공지(직원-4 ⓐ) — 누르면 쓰기 창
  if (useLine) rows.push(useLine);
  todoEl.innerHTML = '<div class="oc-tr oc-th" role="row"><span role="columnheader">무엇</span><span role="columnheader">지금</span><span></span></div>'
    + rows.map((r) => `<a class="oc-tr" role="row" href="${esc(r.href)}" data-lv="${r.lv || ''}"><span class="oc-tk" role="cell">${esc(r.k)}</span><span class="oc-tt" role="cell">${esc(r.t)}</span><span class="oc-tg" role="cell">${r.go ? `${esc(r.go)} ${ARROW}` : ''}</span></a>`).join('');
  M.sync();
}

/* DB 상태 — 백업 시각 · 되살리기 시험 · 느린 질의(있을 때만). 백업이 30시간 넘었거나 실패 · 시험 실패면 주의 */
let dbLine = null, loopLine = null;
let sameLine = null, same = null;   // 해마다 같은 판(아래 drawSame)
async function drawDb() {
  let j;
  try { j = await api('/ops/db-status'); } catch { return; }
  const at = new Date(j.backup?.at || '');
  const when = Number.isNaN(+at) ? '백업 기록 없음' : `백업 ${at.getMonth() + 1}.${at.getDate()} ${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`;
  const rt = j.restore_test?.ok === true ? '되살리기 시험 통과' : j.restore_test?.ok === false ? '되살리기 시험 실패' : '';
  const slow = Number(j.slow_queries?.value) || 0;
  const pair = Number(j.pair_check?.mismatch?.value) || 0;     // 파일과 DB 짝 맞추기(매주) — 안 맞는 것이 있을 때만
  dbLine = { k: 'DB', t: [when, rt, slow ? `느린 질의 ${slow}` : '', pair ? `파일 짝 안 맞음 ${pair}` : ''].filter(Boolean).join(' · '), lv: j.ok ? '' : 'warn', go: j.ok ? '' : '인프라 보기', href: INFRA };
  const lp = j.chatgeo_loop;                                   // ChatGEO 밤 개선 바퀴 마지막 실행 — 실패를 조용히 두지 않는다(10-22)
  if (lp?.at) {
    const d = new Date(lp.at), st = { ok: '돌았음', skip: '건너뜀', failed: '실패' }[lp.state] || '';
    loopLine = { k: 'ChatGEO 개선', t: `${d.getMonth() + 1}.${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')} ${st} · ${lp.why}${Number(lp.fails?.value) > 1 ? ` · 연속 ${Number(lp.fails.value)}번` : ''}`, lv: lp.state === 'failed' ? 'warn' : '', go: lp.state === 'failed' ? '인프라 보기' : '', href: INFRA };
  }
  drawOverview();
}
drawDb();
setInterval(drawDb, 300000);

/* 학습 장비 줄 — GET /ops/gpus power_budget(.pair) 한 출처. 두 장 사용(시험) · 한 장으로 돌아감(까닭 · 시각) · 한 장 사용 */
const PAIR_WHY = { sum_w: '두 장 합 전력 높음', temp: '온도 높음', driver: '장비 응답 오류' };
function equipRow(p) {
  const pr = p.pair || {};
  const hm = (x) => { const d = new Date(x || ''); return Number.isNaN(+d) ? '' : ` ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
  if (pr.mode === 'two') return { t: `학습 장비 두 장 사용 · 고부하 ${p.hot}/${p.max}장`, lv: p.ok ? '' : 'warn', dot: p.hot ? 'lock' : '', href: INFRA };
  if (pr.configured === 'two' && pr.reason) return { t: `학습 장비 한 장으로 돌아감 · ${PAIR_WHY[pr.reason] || '안전 확인'}${hm(pr.since)}`, lv: 'warn', dot: 'lock', href: INFRA };
  return { t: `학습 장비 한 장 사용 · 고부하 ${p.hot}/${p.max}장`, lv: p.ok ? '' : 'warn', dot: p.hot ? 'lock' : '', href: INFRA };
}

async function drawUse() {
  let u;
  try { u = await api('/release/usage'); } catch { setCell(useEl, h('b.oc-txt', { text: '—' }), '사용 현황을 불러오지 못했습니다'); return; }
  const v = (e) => (e && typeof e === 'object' ? e.value : e);
  const sm = u.summary || {};
  const md = (x) => { const d = new Date(x || ''); return Number.isNaN(+d) ? '' : `${d.getMonth() + 1}.${d.getDate()}`; };
  const top = (u.items || []).filter((r) => r.last).sort((a, b) => String(b.last).localeCompare(String(a.last)))[0];
  setCell(useEl, v(sm.orgs) == null ? h('b.oc-txt', { text: '—' }) : numV(v(sm.orgs), '곳'), `<span class="oc-nw">${esc(`공유 ${v(sm.shared) ?? '—'}건`)}</span> · <span class="oc-nw">${esc(`이번 달 분석 ${v(sm.month) ?? '—'}회`)}</span>`);
  useLine = { k: '기관 사용 기록', t: top ? `마지막 사용 ${md(top.last)} · ${top.org.name} ${top.service.name}` : '아직 기관 사용 기록이 없습니다', go: '사용 현황', href: INFRA + '#/deploys/usage' };
  drawOverview();
}
let useLine = null;
drawUse();
setInterval(drawUse, 60000);

/* 전국 결과 자산 — '전국 농지 n% · 하천 n% · 마지막 칸 시각' 한 줄(학습 장비가 놀 때 도는 작업기 · 원칙 218 · 221) */
let natLine = null, nat = null;
async function drawNational() {
  let j;
  try { j = await api('/national/progress'); } catch { return; }
  const v = (e) => (e && typeof e === 'object' ? e.value : e) ?? 0;
  const pc = (a) => { const x = v(j.assets?.[a]?.pct); return x > 0 && x < 1 ? x.toFixed(1) : String(Math.floor(x)); };
  const last = [j.assets?.farm?.last_at, j.assets?.river?.last_at].filter(Boolean).sort().pop();
  const md = (x) => { const d = new Date(x); return Number.isNaN(+d) ? '' : `${d.getMonth() + 1}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
  const tail = !j.enabled ? '멈춤' : last ? `마지막 칸 ${md(last)}` : '학습 장비가 놀 때 분석';
  const part = (a, nm) => (j.assets?.[a]?.on === false ? `${nm} 멈춤` : `${nm} ${pc(a)}%`);
  const lv = v(j.assets?.farm?.failed) + v(j.assets?.river?.failed) ? 'warn' : '';
  natLine = { k: '전국 결과', t: `전국 ${part('farm', '농지')} · ${part('river', '하천')} · ${tail}`, lv, go: '진행 보기', href: '/landxi/v3/xi-clean/' };
  nat = { big: [`전국 ${part('farm', '농지')}`, part('river', '하천')], tail, lv };
  drawOverview();
}
drawNational();
setInterval(drawNational, 120000);

/* 해마다 같은 판으로 묶기(10-22 now21 제안-같은판묶기) — 모델 새 판 뒤 해마다 비교가 섞인 판이면 바뀐 것이 땅인지 모델인지 알 수 없다.
   GET /national/same-model 한 출처 · 판이 섞인 해가 있을 때만 한 줄 · 누르면 확인 창 → '비교 중인 해 전부 다시'(학습 장비가 놀 때만 돈다) */
async function drawSame() {
  try { same = await api('/national/same-model'); } catch { return; }
  const mixed = same.mixed || [];
  sameLine = mixed.length ? { k: '같은 판', t: same.queued?.length === mixed.length ? `${mixed.join(' · ')}년 결과를 지금 판으로 다시 분석하는 중` : `${mixed.join(' · ')}년 결과에 옛 판이 섞여 있습니다`,
    lv: same.queued?.length === mixed.length ? '' : 'warn', go: same.queued?.length === mixed.length ? '' : '전부 다시', href: '#/same-model' } : null;
  drawOverview();
}
drawSame();
setInterval(drawSame, 300000);
todoEl.addEventListener('click', (e) => {
  const a = e.target.closest('a[href="#/same-model"]'); if (!a) return;
  e.preventDefault();
  if (!same?.mixed?.length || same.queued?.length === same.mixed.length) return;
  const v = (x) => (x && typeof x === 'object' ? x.value : x);
  const list = h('ul.oc-same', {}, ...(same.years || []).map((y) => h('li', {}, h('b', { text: `${y.year}년` }), ` 끝난 읍면동 ${v(y.done).toLocaleString('ko-KR')} · 옛 판 ${v(y.old).toLocaleString('ko-KR')}`)));
  const go = h('button.t-btn', { type: 'button', text: '비교 중인 해 전부 다시' });
  const box = h('div.oc-ntc', {}, h('p', { text: `해마다 비교가 같은 판${same.model?.name ? `(${same.model.name})` : ''}으로 이뤄지도록, 옛 판으로 만든 읍면동을 지금 판으로 다시 분석합니다.` }), list,
    h('p.oc-ntc-say', { text: '학습 장비가 놀 때만 돌고, 새 결과가 나올 때까지 옛 결과가 그대로 보입니다.' }), h('div.oc-ntc-act', {}, go));
  const m = modal({ title: '해마다 같은 판으로', body: box });
  go.addEventListener('click', async () => {
    go.disabled = true;
    try { await api('/national/same-model', { method: 'POST', body: { confirm: true } }); toast('다시 분석할 차례에 넣었습니다'); m.close(); drawSame(); }
    catch (err) { go.disabled = false; toast(err.message || '넣지 못했습니다'); }
  });
});

/* 공지 — 할 일 목록의 '공지 · 쓰기' 줄(주소는 바꾸지 않고 창만) · 올린 수는 서버 GET /announcements 한 출처 */
let annN = null;
const annLoad = () => noticeCount().then((n) => { annN = n; drawOverview(); });
annLoad();
todoEl.addEventListener('click', (e) => {
  const a = e.target.closest('a[href="#/notice"]'); if (!a) return;
  e.preventDefault();
  openNoticeWriter({ onChange: annLoad });
});

/* ── 결재함 ────────────────────────────── */
/* 요청 관리(now 질문 16 ⓐ) — 머리 + 탭 둘: 분석 요청(순번 · 급함 · 담당 · 보류 · 승인 · 거절) · 승인 요청(배포 신청 · 모델 등록 · 운영 전환 · 기관에 공유 — 승인 · 거절) */
const inboxWrap = h('div.oc-inbox-w');
const tabA = h('button', { type: 'button', role: 'tab', dataset: { t: 'analyze' } }, '분석 요청 ', h('b.num'));
const tabB = h('button', { type: 'button', role: 'tab', dataset: { t: 'approve' } }, '승인 요청 ', h('b.num'));
const tabC = h('button', { type: 'button', role: 'tab', dataset: { t: 'apikeys' } }, 'API 키 신청 ', h('b.num'));
const tabs = h('div.oc-tabs', { role: 'tablist', 'aria-label': '요청 종류' }, tabA, tabB, tabC);
const head = h('header.oc-ih', {}, h('div', {}, h('h1', { text: '요청 관리' }), h('p', { text: '분석 요청은 순번 · 급함 · 담당을 조정해 관리하고, 승인 요청은 승인 · 거절합니다' })), tabs);
const paneA = h('div.oc-pa');
const paneB = h('div.oc-pb');
const paneC = h('div.oc-pc');
const tbl = h('div.oc-tbl');
const none = h('div.oc-none');
paneB.append(tbl, none);
inboxWrap.append(head, paneA, paneB, paneC);
inbox.append(inboxWrap);
const RQ = mountRequests(paneA, { host: S.main, onChanged: () => refresh(true).then(tabCounts) });
const AK = mountApiApply(paneC, { host: S.main, onChanged: () => tabCounts() });
tabs.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) location.hash = b.dataset.t === 'approve' ? '#/approvals/approve' : b.dataset.t === 'apikeys' ? '#/approvals/apikeys' : '#/approvals'; });
const approveList = () => pending().filter((x) => x.kind !== 'request');
function tabCounts() {
  tabA.querySelector('b').textContent = String(RQ.count());
  tabB.querySelector('b').textContent = String(approveList().length);
  tabC.querySelector('b').textContent = String(AK.count());
}
let T = null, openKey = null, sheet = null;

function drawInbox() {
  const list = approveList();
  tabCounts();
  if (!D.ok) { none.hidden = false; tbl.hidden = true; if (none.dataset.kind !== 'loading') empty(none, { kind: 'loading' }); return; }
  if (none.dataset.kind === 'loading') none.innerHTML = '';
  const rows = list.map((x) => ({ ...x, kindKo: x.kind === 'card' ? '배포 신청' : x.kindKo, target: x.target, requester: x.requester, day: ymd(x.at) || '—' }));
  none.hidden = !!rows.length; tbl.hidden = !rows.length;
  if (!rows.length) { if (!none.firstChild) empty(none, { kind: 'first', title: '승인할 요청이 없습니다', char: 'satellite' }); }
  const cols = [
    { key: 'kindKo', label: '종류', fmt: (v) => `<span class="t-chip">${esc(v)}</span>` },
    { key: 'target', label: '대상', fmt: (v) => `<b class="oc-target">${esc(v)}</b>` },
    { key: 'requester', label: '요청자' },
    { key: 'day', label: '요청일', fmt: (v) => `<span class="num">${esc(v)}</span>` },
  ];
  if (!T) T = table(tbl, { cols, rows, sort: 'day', dir: 'desc', onRow: openSheet });
  else T.set(rows);
  tbl.querySelectorAll('tbody tr').forEach((tr, i) => tr.classList.toggle('is-on', tbl._vis?.[i]?.key === openKey));
  if (openKey && !list.find((x) => x.key === openKey)) sheet?.close(true);
}

async function openSheet(item) {
  openKey = item.key;
  drawInbox();
  /* 지난 사용량 설정 변경 결재(옛 기록) — 지금 값(바뀌기 전)은 기관 사용량에서. 뒤에서 오는 전체 집계를 기다리지 않고 그 기관 한 곳만 읽는다 */
  const sid = item.raw?.subject?.id;
  if (item.kind === 'quota' && sid && !D.usage.some((u) => u.tenant_id === sid)) {
    const u = await api(`/t/${encodeURIComponent(sid)}/usage`).catch(() => null);
    if (u) D.usage = [...D.usage.filter((x) => x.tenant_id !== sid), u];
    item = pending().find((x) => x.key === item.key) || item;
    if (openKey !== item.key) return;
  }
  const body = h('div.oc-sheet');
  const arrow = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8h10M9.5 4.5 13 8l-3.5 3.5"/></svg>';
  // 누가 · 왜(요청) — 서버 결재 행에 있는 값만(요청 사유가 없으면 줄을 만들지 않는다)
  const req = h('dl.oc-ch.oc-req');
  const put = (dl, k, html) => dl.append(h('dt', { text: k }), h('dd', { html }));
  if (item.requester && item.requester !== '—') put(req, '요청한 사람', esc(item.requester));
  if (item.why) put(req, '요청 사유', esc(item.why));
  if (item.retrain) {                                 // 재학습 사유 — 프로젝트장이 '재학습 시작' 창에서 고른 한 줄(같은 말 · 확인 17차 P-3 ⓐ)
    const n = item.retrain.round?.value ?? item.retrain.round;
    put(req, '재학습 사유', esc(`${n}차 · ${item.retrain.reason || '적지 않음'}`));
  }
  const when = item.at ? new Date(item.at) : null;
  if (when && !Number.isNaN(when.getTime())) put(req, '요청일', `<span class="num">${esc(ymd(item.at))} ${String(when.getHours()).padStart(2, '0')}:${String(when.getMinutes()).padStart(2, '0')}</span>`);
  // 무엇을 — 바뀌는 것
  const ch = h('dl.oc-ch');
  for (const [k, a, b] of item.changes || []) put(ch, k, a ? `<s>${esc(a)}</s>${arrow}<b>${esc(b)}</b>` : `<b>${esc(b)}</b>`);
  if (req.childElementCount) body.append(req);
  if (ch.childElementCount) body.append(h('p.t-label', { text: '바뀌는 것' }), ch);
  if (item.kind === 'request' && sid) {               // 기관 영상 분석 의뢰 — 판단 근거(범위 · 면적 · 예상 시간 · 대기열 · 이 기관 사용)와 올린 영상 미리 보기
    const why = h('div.oc-rq', { 'aria-busy': 'true' });
    body.append(why);
    api(`/requests/${encodeURIComponent(sid)}`).then((x) => {
      why.removeAttribute('aria-busy');
      if (x.overlay?.url) why.append(h('img.oc-rq-img', { src: x.overlay.url, alt: '올린 영상 미리 보기' }));
      const dl = h('dl.oc-ch');
      for (const [k, v] of x.basis || []) put(dl, k, esc(v));
      why.append(h('p.t-label', { text: '판단 근거' }), dl);
      if (x.state === 'pending') why.append(h('p.oc-rq-n', { text: '승인하면 대기열 순서대로 분석하고, 결과는 그 서비스의 새 시점으로 기관에 갑니다.' }));
    }).catch((e) => { why.removeAttribute('aria-busy'); devlog('request', e.code || e.message); });
  }
  sheet = drawer({ title: `${item.kind === 'card' ? '배포 신청' : item.kindKo} · ${item.target}`, body, host: S.main, slot: 'approval', onClose: () => { openKey = null; drawInbox(); } });
  /* 배포 신청(서비스 공개)은 배포 메뉴에서 신청서(서버 값 + 메모)를 보고 승인 · 거절한다(10-09 배포-3 ⓐ) */
  if (item.kind === 'card') {
    body.append(h('p.oc-mine', { text: '배포 신청은 배포 메뉴에서 신청서를 보고 승인 · 거절합니다.' }), h('a.t-btn', { href: INFRA + '#/deploys', text: '배포 메뉴에서 신청서 보기' }));
    return;
  }
  if (item.mine && !item.canDecide) {                // 요청한 사람은 스스로 결재하지 않는다(서버도 막는다) — 다른 관리자가 결재
    body.append(h('p.oc-mine', { text: '내가 올린 승인 요청입니다. 다른 관리자가 승인합니다.' }));
    return;
  }
  /* 관리자 계정이 하나뿐이면(10-01 사용자 결정 — 관리자 계정 하나를 함께 씀) 내가 올린 요청도 내가 결재하고 처리 기록에 남긴다 */
  if (item.mine) body.append(h('p.oc-mine', { text: '관리자 계정이 하나라 이 계정이 승인합니다. 처리 기록에 ‘관리자 계정 승인(단일 계정)’으로 남습니다.' }));
  const reason = h('input.t-input.oc-reason', { type: 'text', placeholder: '사유(거절할 때는 꼭 적습니다)', 'aria-label': '사유', maxlength: '120' });
  const ok = h('button.t-btn', { type: 'button', text: '승인' });
  const no = h('button.t-btn.t-btn--2', { type: 'button', text: '거절' });
  const note = h('p.oc-need', { role: 'status' });
  body.append(reason, note, h('div.oc-acts', {}, no, ok));
  const need = (text) => { note.textContent = text; reason.focus(); reason.classList.remove('is-need'); void reason.offsetWidth; reason.classList.add('is-need'); };
  reason.addEventListener('input', () => { if (reason.value.trim()) { note.textContent = ''; reason.classList.remove('is-need'); } });
  const run = async (dec) => {
    if (dec === 'reject' && !reason.value.trim()) { need('거절 사유를 적어 주세요. 요청한 사람에게 이 사유가 보입니다.'); return; }
    note.textContent = '';
    ok.disabled = no.disabled = true;
    try {
      await decide(item, dec, reason.value.trim());
      toast(dec === 'approve' ? '승인했습니다' : '거절했습니다');
      sheet.close(true); openKey = null;
      await refresh();
    } catch (e) {
      devlog('decide', `${item.key} · ${e.code || e.message}`);
      if (e.code === 'reason_required') need('거절 사유를 적어 주세요. 요청한 사람에게 이 사유가 보입니다.');
      else toast(e.code === 'self_approval' || e.code === 'conflict' ? e.message : '지금은 처리할 수 없습니다');
      ok.disabled = no.disabled = false;
    }
  };
  ok.addEventListener('click', () => run('approve'));
  no.addEventListener('click', () => run('reject'));
}

/* ── 라우터(해시 2개) ─────────────────────── */
function route() {
  const v = /^#\/approvals/.test(location.hash) ? 'approvals' : 'overview';
  const tab = /^#\/approvals\/approve/.test(location.hash) ? 'approve' : /^#\/approvals\/apikeys/.test(location.hash) ? 'apikeys' : 'analyze';
  const was = document.body.dataset.tab;
  document.body.dataset.view = v;
  document.body.dataset.tab = tab;
  document.title = v === 'approvals' ? 'Land-XI · LX 관리자 대시보드 · 요청 관리' : 'Land-XI · LX 관리자 대시보드';
  S.go(v === 'approvals' ? 4 : 0); badge();
  if (v === 'approvals') {
    if (was && was !== tab) { closeAll(); openKey = null; RQ.close(); AK.close(); }
    tabA.setAttribute('aria-selected', String(tab === 'analyze')); tabB.setAttribute('aria-selected', String(tab === 'approve')); tabC.setAttribute('aria-selected', String(tab === 'apikeys'));
    paneA.hidden = tab !== 'analyze'; paneB.hidden = tab !== 'approve'; paneC.hidden = tab !== 'apikeys';
    drawInbox();
    if (tab === 'analyze') RQ.load().then(tabCounts);
    AK.load().then(tabCounts);
  }
  else { closeAll(); openKey = null; drawOverview(); M.map.resize(); }
}
addEventListener('hashchange', route);

function badge() {
  const n = pending().length, b = S.rail.querySelector('[data-i="4"]');
  if (b) b.dataset.n = n ? String(n) : '';
}

/* ── 데이터 · 실시간 ───────────────────────── */
async function refresh(fast = false) {
  // 결재 대기(큰 숫자 · 결재함)는 결재 표가 오자마자 — 기관 사용량 · GPU · 경보는 뒤에 와서 할 일 칸만 다시 그린다(impl-1 · FR-3)
  if (fast) await loadFast(); else await loadAll(() => { if (document.body.dataset.view !== 'approvals') drawOverview(); });
  S.fresh(D.at);
  badge();
  if (document.body.dataset.view === 'approvals') drawInbox(); else drawOverview();
  if (!fast && document.body.dataset.view === 'approvals' && document.body.dataset.tab !== 'approve') RQ.load().then(tabCounts);   // 분석 요청 목록은 30초 · 알림 때만
}
RQ.load().then(tabCounts);
await refresh();
route();
devDrawer({ stage: M.st, who });

if (await hasS9()) {
  // S-9: 한 로그인이 관제 스트림까지(Origin 4173 허용) — deploy.changed 가 오면 점과 결재 수를 다시 읽는다
  sse('/events/ops', { events: ['deploy.changed', 'approval.requested', 'approval.decided', 'alert', 'usage.delta'], on: (name) => { if (name !== 'usage.delta') refresh(!/^approval\./.test(name)); } });
  setInterval(() => refresh(), 30000);
} else {
  // S-9 전: 같은 모양으로 폴링(배포 · 전력 6s · 나머지 30s)
  setInterval(() => refresh(true), 6000);
  setInterval(() => refresh(), 30000);
}
