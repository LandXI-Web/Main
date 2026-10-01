/* context.js — 프로젝트 맥락 한 곳(구현 2차 T1 · 확인 대장 R-D3 · 흐름-1).
   기존 화면(데이터 올리기 · 학습 · 결과 확인 · 서비스 관리)은 새로 그리지 않고 `?project=` 로 맥락만 받는다:
     · 레일 = 그 프로젝트의 단계 6(데이터 올리기 → 학습데이터 구축 → 학습 → 결과 확인 → 발행 요청 → 서비스 관리) + 맨 위 프로젝트 이름
     · 단계 표시(완료 · 지금 · 대기) = 서버 판정(GET /projects/{id}) — 화면이 지어내지 않는다
     · 단계 → 화면 주소 = stageHref() 한 곳(첫 화면 '내 프로젝트' · 프로젝트 화면 · 레일이 모두 이것을 쓴다)
   프로젝트 밖(맥락 없음)에서는 아무것도 바꾸지 않는다 — 레일은 그 화면 것 그대로. 머리 줄에는 '프로젝트' 목록으로 가는 길 하나만 더한다. */
import { h, esc, api } from '../kit/util.js';
import { TASKS } from '../lx-console/matrix.js';   // 업무 → 대조 규칙(서비스 만들기 ③과 같은 한 곳) — 결과 확인 화면을 그 업무 규칙으로 연다

export const PID = new URLSearchParams(location.search).get('project') || null;
export const STAGES = [
  { key: 'ingest', label: '데이터 올리기' }, { key: 'label', label: '학습데이터 구축' }, { key: 'train', label: '학습' },
  { key: 'review', label: '결과 확인' }, { key: 'publish', label: '발행 요청' }, { key: 'ops', label: '서비스 관리' },
];
const at = (p) => new URL(p, import.meta.url).pathname;   // 이 파일 기준 상대 주소(GitHub Pages /Main/ 아래에서도)
export const HOME = at('./');
const qs = (o) => { const u = new URLSearchParams(); for (const [k, v] of Object.entries(o)) if (v !== null && v !== undefined && v !== '') u.set(k, v); const s = u.toString(); return s ? '?' + s : ''; };

const ruleOf = (pr) => (typeof pr === 'object' && pr?.task_id ? TASKS.find((t) => t.id === pr.task_id)?.rules?.[0] : null) || null;

/** 프로젝트 화면 주소 */
export const projectHref = (id) => HOME + qs({ project: id });

/** 단계 → 그 단계 화면(프로젝트 맥락). pr = 프로젝트(서버 응답) 또는 id · target = 서버가 준 그 단계의 대상(지역 · 표본 · 모델 · 카드) */
export function stageHref(pr, key, target = {}) {
  const id = typeof pr === 'string' ? pr : pr?.id;
  const regions = (typeof pr === 'object' && pr?.regions) || [];
  const dom = regions.find((g) => !g.abroad)?.code || null;
  const t = target || {};
  switch (key) {
    case 'ingest': return at('../lx-ingest/') + qs({ project: id, region: t.region || dom });
    case 'label': return at('../lx-train/') + qs({ project: id, stage: 'label', flow: 1 });
    case 'train': return at('../lx-train/') + qs({ project: id, stage: 'train', flow: 1, sample: t.sample, model: t.model });
    case 'review': return at('../lx-review/') + qs({ project: id, region: t.region || dom, rule: ruleOf(pr) });
    case 'publish': return at('../lx-train/') + qs({ project: id, stage: 'publish', flow: 1, model: t.model, card: t.card });
    case 'ops': return at('../lx-deploy/') + qs({ project: id, card: t.card, tab: 'ops' }) + '#ops';
    default: return projectHref(id);
  }
}

/** 레일(동기) — 맥락이 있으면 단계 6(주소는 대상 없이 먼저 · 프로젝트를 읽으면 대상까지 채운다). 없으면 null(화면 레일 그대로) */
export function projectRail(key) {
  if (!PID) return null;
  const items = STAGES.map((s) => ({ id: s.key, label: s.label, href: stageHref(PID, s.key) }));
  return { kind: 'steps', items, current: Math.max(0, STAGES.findIndex((s) => s.key === key)), done: [] };
}

let CUR = null;
/** 프로젝트 한 장(같은 화면 안에서는 한 번) */
export function loadProject(id = PID) {
  if (!id) return Promise.resolve(null);
  if (!CUR || CUR.id !== id) CUR = { id, p: api('/projects/' + encodeURIComponent(id)).catch(() => null) };
  return CUR.p;
}

/** 레일에 프로젝트 이름 + 단계 판정 · 주소 대상 채우기. S = 키트 셸, rail = projectRail() 결과(같은 객체), key = 이 화면이 보이는 단계.
    → 프로젝트(서버 응답) 또는 null(없는 프로젝트 · 권한 없음 — 레일은 기본 주소 그대로) */
export async function attachProject(S, rail, key) {
  if (!PID || !rail) return null;
  ensureCss();
  const pr = await loadProject();
  if (!pr) return null;
  const round = pr.round?.value > 1 ? `${pr.round.value}차` : '';
  const name = h('a.lxp-rail-name', { href: projectHref(pr.id), title: pr.name, 'aria-label': `프로젝트 ${pr.name}` },
    h('span.lxp-rail-k', { text: round ? `프로젝트 · ${round}` : '프로젝트' }), h('b', { text: pr.name }));
  const here = STAGES.findIndex((s) => s.key === key);
  const put = () => {
    if (!S.rail.contains(name)) S.rail.prepend(name);
    const now = S.rail.dataset.now === undefined ? -1 : +S.rail.dataset.now;
    S.rail.querySelectorAll('.k-rail-i').forEach((a, i) => { a.classList.toggle('lxp-here', i === here); if (i === here) a.setAttribute('aria-current', 'page'); else if (i !== now) a.removeAttribute('aria-current'); });
  };
  S.rail._lxpPut = put;
  refreshRail(S, rail, pr, key);
  put();
  new MutationObserver(put).observe(S.rail, { childList: true });
  S.rail.classList.add('lxp-has-name');
  return pr;
}

/** 단계 표시 · 주소 대상 다시 채우기(프로젝트가 바뀐 뒤 — 이름은 그대로) */
export function refreshRail(S, rail, pr, key) {
  if (!rail || !pr) return;
  const st = pr.stages || [];
  rail.items.forEach((it, i) => { it.href = stageHref(pr, STAGES[i].key, st[i]?.target); });
  /* 원 = 프로젝트 단계(완료 잉크 · 지금 액센트 · 대기 헤어라인 — 서버 판정) · 이 화면이 보이는 단계는 글자로 표시(lxp-here) */
  const now = pr.stage?.index ?? 0;
  S.rail.dataset.now = String(now);
  S.steps({ done: st.filter((s) => s.done && s.index !== now).map((s) => s.index), current: now });
  S.rail._lxpPut?.();
}

/** 머리 줄에 '프로젝트' 목록으로 가는 길 하나(머리 메뉴 구성은 그대로 · 사용자 10-01). slot 안 기존 내용은 두고 뒤에 붙인다 */
export function projectsLink(S) {
  ensureCss();
  const slot = S.app.querySelector('.k-mast-slot');
  if (!slot || slot.querySelector('.lxp-mast')) return;
  const here = location.pathname.startsWith(HOME) && !PID;
  const a = h('a.k-mast-b.lxp-mast', { href: HOME, text: '프로젝트', 'aria-current': here ? 'page' : null });
  const put = () => { if (!slot.contains(a)) slot.append(a); };
  put();
  new MutationObserver(put).observe(slot, { childList: true });   // 화면이 머리 줄 칸을 다시 채워도(S.mast) 뒤에 다시 붙는다
}

let cssOn = false;
export function ensureCss() {
  if (cssOn || document.querySelector('link[data-lxp]')) return;
  cssOn = true;
  document.head.append(h('link', { rel: 'stylesheet', href: new URL('./context.css', import.meta.url).href, dataset: { lxp: '1' } }));
}

/** 단계 표시 말(짧게) — 지금 단계 번호 + 이름 */
export const stageWord = (pr) => (pr?.stage ? `${pr.stage.index + 1} ${pr.stage.label}` : '');
export { esc };
