/* lx-project — 프로젝트 목록 · 관리 · 한 장(구현 2차 T1 · 확인 대장 R-D3 · 갈림길 ⓐ · 4차 P1 · 5차 역할-3 ⓑ · 6차 흐름-1 · 10차 메뉴-1 ⓐ · J-1).
   왼쪽 메뉴 = LX 직원 메뉴('프로젝트' 불) · 한 장에서는 마스트 아래 한 줄에 그 프로젝트의 단계 6(context.js) — 생산 6단계는 메뉴가 아니라 프로젝트 안.
   ?project= 없음 = 목록·관리: 내가 만든 · 참여한 · 보관(끝난 것) · 전체 · 새 프로젝트(사용자 10-01 "기존 내가 만든 프로젝트는 어디에서 관리하는지?")
                 줄마다 6칸 진행 막대 · 다음 할 일 · 막힌 곳(앞 단계 남음 · 결재 대기 · 반려 — 없으면 —) · 무엇을 · 어디 · 마지막 활동(제안 2 S-14 ⓑ · 걸러 보기는 나중)
   ?project=  있음 = 한 장: 지금 단계 · 다음 할 일 하나(그 단계 화면으로) · 단계 6(완료 조건 자동 판정 — 서버) · 사람(프로젝트장 · 구성원) · 재학습 · 보관
   숫자·판정은 전부 서버(GET /projects · /projects/{id}). 부품 = 키트(셸 · 관문 · 표 · 스텝퍼 · 빈 화면 · 토스트)만 조합. */
import * as K from '../kit/index.js';
import { h, api } from '../kit/util.js';
import { PID, projectRail, attachProject, refreshRail, stageHref, projectHref, loadProject, stepSegHtml, stuckHtml, nb } from './context.js';
import { staffMenu } from '../kit/lx-menu.js';
import { openNewProject } from './new.js';

const who = await K.gate('lx-console');                  // 들어오는 사람 = LX 직원 대시보드와 같다(LX 직원 · 관리자)
const Q = new URLSearchParams(location.search);
const rail = projectRail(null) || staffMenu('projects');
const S = K.shell({ who, home: 'lx-project', rail });
K.devDrawer({ who });
const page = h('div.lxp-page');
S.main.append(page);

const two = (n) => String(n).padStart(2, '0');
/** 마지막 활동 — 오늘이면 시각, 올해면 월.일, 그 밖은 연.월.일 */
function when(s) {
  const d = new Date(s || '');
  if (Number.isNaN(+d)) return '—';
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return `오늘 ${two(d.getHours())}:${two(d.getMinutes())}`;
  return d.getFullYear() === now.getFullYear() ? `${two(d.getMonth() + 1)}.${two(d.getDate())}` : `${d.getFullYear()}.${two(d.getMonth() + 1)}.${two(d.getDate())}`;
}
const regionWord = (rs = []) => (rs.length ? rs[0].name + (rs.length > 1 ? ` 외 ${rs.length - 1}곳` : '') : '—');
const stageText = (p) => (p.stage ? `${p.stage.index + 1} ${p.stage.label}` : '—');

if (PID) await one(); else await list();

/* ── 목록 · 관리 ─────────────────────────────────────────── */
async function list() {
  const TABS = [['led', '내가 만든'], ['joined', '참여한'], ['archived', '보관'], ['all', '전체']];
  const head = h('header.lxp-head.lxp-head--row', {}, h('h1.t-h3', { text: '프로젝트' }),
    h('button.t-btn.lxp-newb', { type: 'button', text: '새 프로젝트', onclick: () => openNewProject() }));
  const tabs = h('div.lxp-tabs', { role: 'tablist', 'aria-label': '프로젝트 묶음' });
  const body = h('section.t-card.lxp-list');
  page.append(head, tabs, body);
  const wait = h('div'); body.append(wait);
  K.empty(wait, { kind: 'loading' });
  let scope = TABS.some(([k]) => k === Q.get('scope')) ? Q.get('scope') : null;
  let counts = null;
  const drawTabs = () => {
    tabs.innerHTML = '';
    for (const [k, l] of TABS) {
      const n = counts?.[k]?.value;
      const b = h('button.lxp-tab', { type: 'button', role: 'tab', 'aria-selected': String(k === scope), dataset: { k } },
        h('span', { text: l }), n !== undefined ? h('b.num', { text: String(n) }) : null);
      b.addEventListener('click', () => { if (k !== scope) show(k); });
      tabs.append(b);
    }
  };
  async function show(k) {
    scope = k;
    const u = new URL(location.href); u.searchParams.set('scope', k); history.replaceState(null, '', u);
    drawTabs();
    body.innerHTML = ''; const w = h('div'); body.append(w); K.empty(w, { kind: 'loading' });
    let j;
    try { j = await api('/projects?scope=' + k); } catch (e) { body.innerHTML = ''; const x = h('div'); body.append(x); K.empty(x, { kind: 'error', title: '프로젝트를 불러오지 못했습니다', onRetry: () => show(k) }); return; }
    counts = j.counts || counts; drawTabs();
    S.fresh(j.as_of);
    body.innerHTML = '';
    if (!j.items.length) {
      const x = h('div'); body.append(x);
      const words = { led: '내가 만든 프로젝트가 없습니다', joined: '참여한 프로젝트가 없습니다', archived: '보관한 프로젝트가 없습니다', all: '진행 중인 프로젝트가 없습니다' };
      K.empty(x, { kind: 'first', title: words[k], action: k === 'archived' || k === 'joined' ? null : { label: '새 프로젝트', onClick: () => openNewProject() } });
      return;
    }
    const tb = h('div'); body.append(tb);
    const cols = [
      { key: 'name', label: '이름', fmt: (v) => `<b class="lxp-n">${esc(v)}</b>` },
      { key: 'steps', label: '진행', fmt: (v, r) => progressCell(r, k === 'archived') },
      { key: 'nextText', label: '다음 할 일' },
      { key: 'blocked', label: '막힌 곳', fmt: (v, r) => stuckHtml(r, k === 'archived') },
      { key: 'task', label: '무엇을 · 어디', fmt: (v, r) => `<span class="lxp-what">${esc(v || '—')}<small title="${esc((r.regions || []).map((g) => g.full || g.name).join(' · '))}">${esc(r.where)}</small></span>` },
      ...(k === 'led' ? [] : [{ key: 'leadName', label: '프로젝트장' }]),
      { key: 'lastText', label: '마지막 활동' },
    ];
    const rows = j.items.map((p) => ({ ...p, where: regionWord(p.regions), nextText: k === 'archived' ? '—' : nb(p.next?.text || '—'),
      leadName: p.lead?.name || '—', lastText: when(p.last_at || p.updated_at) }));
    K.table(tb, { cols, rows, limit: 20, onRow: (r) => { location.href = projectHref(r.id); }, caption: null });
  }
  /* 첫 묶음 — 주소(?scope=)가 없으면 내가 만든 것이 있으면 그것, 없고 참여한 것이 있으면 참여한 것 */
  if (!scope) {
    try { const j = await api('/projects?scope=led'); counts = j.counts; scope = (counts?.led?.value || 0) > 0 || !(counts?.joined?.value > 0) ? 'led' : 'joined'; } catch { scope = 'led'; }
  }
  await show(scope);
  if (Q.get('new') === '1') openNewProject();
}
/** 진행 칸 — 6칸 막대(서버 판정 steps) + 지금 단계(번호 · 이름). 보관한 프로젝트는 막대 없이 '보관' */
function progressCell(p, archived) {
  if (archived) return '<span class="lxp-pg-st is-arch">보관</span>';
  const n = (p.stage?.index ?? 0) + 1;
  return `<div class="lxp-pg">${stepSegHtml(p.steps)}<span class="lxp-pg-st"><i class="num">${n}</i>${esc(p.stage?.label || '')}</span></div>`;
}
function esc(s) { return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

/* ── 한 장 ──────────────────────────────────────────────── */
async function one() {
  const wait = h('div'); page.append(wait);
  K.empty(wait, { kind: 'loading' });
  const pr = await attachProject(S, rail, null);
  wait.remove();
  if (!pr) {
    const x = h('div'); page.append(x);
    K.empty(x, { kind: 'error', title: '프로젝트를 불러오지 못했습니다', onRetry: () => location.reload() });
    return;
  }
  draw(pr);
}

function draw(pr) {
  S.fresh(pr.as_of);
  page.innerHTML = '';
  const archived = pr.state === 'archived';
  const round = pr.round?.value || 1;
  /* 머리 — 이름 · 무엇을 · 어디 · 회차 */
  const meta = h('div.lxp-meta', {}, h('span.t-chip', { text: pr.task }),
    ...pr.regions.map((g) => h('span.t-chip', { dataset: { lv: 'wait' }, title: g.full || g.name, text: g.name })),
    round > 1 ? h('span.t-chip', { text: `${round}차` }) : null);
  page.append(h('header.lxp-head', {}, h('p.t-label', { text: archived ? '프로젝트 · 보관' : '프로젝트' }), h('h1.t-h3.lxp-title', { text: pr.name }), meta));

  const grid = h('div.lxp-grid'); page.append(grid);
  const left = h('div.lxp-col'), right = h('div.lxp-col');
  grid.append(left, right);

  /* 지금 할 일 — 다음 할 일 하나 + 그 단계 화면 */
  const nx = pr.next || {};
  const now = pr.stages?.find((s) => s.key === nx.stage) || null;
  const nowCard = h('section.t-card.lxp-now', { 'aria-label': '지금 할 일' },
    h('p.t-label', { text: archived ? '보관한 프로젝트' : `지금 단계 · ${stageText(pr)}` }),
    h('p.lxp-next', { text: archived ? '다시 열면 이어서 할 수 있습니다' : nx.text || '—' }));
  if (now?.reason) nowCard.append(h('p.lxp-why', { text: `사유: ${now.reason}` }));
  if (!archived) nowCard.append(h('a.t-btn.lxp-go', { href: stageHref(pr, nx.stage, nx.target), text: `${now?.label || '단계'} 열기` }));
  left.append(nowCard);

  /* 단계 6 — 마스트 아래 한 줄(context.js · 단계 화면들과 같은 막대 · 완료 조건은 서버 판정) */

  /* 사람 — 프로젝트장(바꾸기 = 관리자) · 구성원(더하기 · 빼기 = 프로젝트장) */
  const ppl = h('section.t-card.lxp-people', { 'aria-label': '사람' }, h('h2.lxp-h', { text: '사람' }));
  const leadRow = h('div.lxp-row', {}, h('span.t-label', { text: '프로젝트장' }), h('span.lxp-who', { text: whoText(pr.lead) }));
  ppl.append(leadRow);
  const memRow = h('div.lxp-row.lxp-row--top', {}, h('span.t-label', { text: '구성원' }));
  const memList = h('div.lxp-mems');
  for (const m of pr.members || []) {
    const chip = h('span.t-chip.lxp-mem', {}, h('span', { text: whoText(m) }));
    if (pr.can?.members && !archived) {
      const x = h('button.lxp-x', { type: 'button', 'aria-label': `${m.name} 빼기`, text: '×' });
      x.addEventListener('click', () => act(() => api(`/projects/${pr.id}/members/${encodeURIComponent(m.id)}`, { method: 'DELETE' }), '구성원을 뺐습니다'));
      chip.append(x);
    }
    memList.append(chip);
  }
  if (!(pr.members || []).length) memList.append(h('span.lxp-none', { text: '없음' }));
  memRow.append(memList);
  ppl.append(memRow);
  if (pr.can?.members && !archived) peoplePicker(ppl, pr, 'member');
  if (pr.can?.lead && !archived) peoplePicker(ppl, pr, 'lead');
  right.append(ppl);

  /* 재학습 — 공개된 서비스만 · 프로젝트장만(역할-3 ⓑ · 구현 확인 2차 J-2 — 서버도 같은 규칙으로 막는다) · 배포는 LX 관리자 승인 */
  if (pr.published && !archived) {
    const rt = h('section.t-card.lxp-retrain', { 'aria-label': '재학습' }, h('h2.lxp-h', { text: '재학습' }));
    if (pr.can?.retrain) {
      rt.append(h('p.lxp-p', {}, `같은 프로젝트에서 ${round + 1}차로 다시 학습하고,`, h('br'), '배포는 LX 관리자 승인 뒤 바뀝니다'));
      const b = h('button.t-btn.t-btn--2.lxp-rt', { type: 'button', text: `${round + 1}차 재학습 시작` });
      b.addEventListener('click', async () => {
        b.disabled = true;
        try {
          const p2 = await api(`/projects/${pr.id}/rounds`, { method: 'POST', body: {} });
          K.toast(`${round + 1}차 학습 단계로 돌아갔습니다`);
          const t = p2.stages?.find((s) => s.key === 'train');
          location.href = stageHref(p2, 'train', t?.target);
        } catch (e) { K.toast(e.message || '재학습을 시작하지 못했습니다'); b.disabled = false; }
      });
      rt.append(b);
    } else {
      rt.append(h('p.lxp-p', { text: '재학습은 프로젝트장이 시작합니다' }));
    }
    right.append(rt);
  }

  /* 보관 · 다시 열기 */
  if (pr.can?.archive) {
    const b = h('button.t-btn.t-btn--text.lxp-arch', { type: 'button', text: archived ? '다시 열기' : '끝난 프로젝트로 보관' });
    b.addEventListener('click', () => act(() => api(`/projects/${pr.id}/archive`, { method: 'POST', body: { archived: !archived } }), archived ? '다시 열었습니다' : '보관했습니다'));
    right.append(h('div.lxp-foot', {}, b));
  }
}

function whoText(u) { if (!u) return '—'; return u.name && u.name !== u.role_label ? `${u.name} · ${u.role_label}` : u.role_label || u.name; }

async function act(fn, done) {
  try { const out = await fn(); K.toast(done); draw(out); refreshRail(S, rail, out, null); }
  catch (e) { K.toast(e.message || '바꾸지 못했습니다'); }
}

/** 구성원 더하기 · 프로젝트장 바꾸기(관리자) — LX 직원 · 관리자 이름 목록에서 고른다 */
function peoplePicker(host, pr, kind) {
  const sel = h('select.t-input.lxp-sel', { 'aria-label': kind === 'lead' ? '새 프로젝트장' : '더할 구성원' });
  const b = h('button.t-btn.t-btn--2', { type: 'button', text: kind === 'lead' ? '프로젝트장 바꾸기' : '구성원 더하기', disabled: true });
  host.append(h('div.lxp-add', {}, sel, b));
  api('/projects/people').then((j) => {
    const have = new Set([pr.lead?.id, ...(pr.members || []).map((m) => m.id)]);
    const opts = (j.items || []).filter((x) => (kind === 'lead' ? x.id !== pr.lead?.id : !have.has(x.id)));
    sel.innerHTML = `<option value="">${kind === 'lead' ? '새 프로젝트장 고르기' : '구성원 고르기'}</option>` + opts.map((x) => `<option value="${esc(x.id)}">${esc(whoText(x))}</option>`).join('');
    sel.addEventListener('change', () => { b.disabled = !sel.value; });
  }).catch(() => { sel.disabled = true; });
  b.addEventListener('click', () => {
    if (!sel.value) return;
    if (kind === 'lead') act(() => api(`/projects/${pr.id}`, { method: 'PATCH', body: { lead_id: sel.value } }), '프로젝트장을 바꿨습니다');
    else act(() => api(`/projects/${pr.id}/members`, { method: 'POST', body: { user_id: sel.value } }), '구성원을 더했습니다');
  });
}

window.__lxProject = { get id() { return PID; }, load: () => loadProject() };   // e2e 관측(읽기 전용)
