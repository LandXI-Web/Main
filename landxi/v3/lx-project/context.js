/* context.js — 프로젝트 맥락 한 곳(구현 2차 T1 · 확인 대장 R-D3 · 흐름-1 · 10차 메뉴-1 ⓐ · 구현 확인 2차 J-1 다시 · 원칙 81 · 99).
   왼쪽 메뉴는 어디서나 LX 직원 메뉴(홈 · 프로젝트 · 분석하기 · 서비스 카드 · 데이터 · 요청함 — kit/lx-menu.js)이고,
   생산 6단계는 메뉴가 아니라 **프로젝트 안**에 있다. 단계 화면(데이터 올리기 · 학습 · 결과 확인 · 서비스 관리)은 새로 그리지 않고 `?project=` 로 맥락만 받는다:
     · 왼쪽 메뉴 = '프로젝트'에 불 · 마스트 아래 한 줄 = 프로젝트 이름 + 그 프로젝트의 단계 6(데이터 올리기 → 학습데이터 구축 → 학습 → 결과 확인 → 발행 요청 → 서비스 관리) + 다음 할 일
     · 단계 표시(완료 · 지금 · 대기) = 서버 판정(GET /projects/{id}) — 화면이 지어내지 않는다. 이 화면이 보이는 단계는 밑줄
     · 단계 → 화면 주소 = stageHref() 한 곳(대시보드 '내 프로젝트' · 프로젝트 화면 · 단계 막대가 모두 이것을 쓴다)
   프로젝트 밖(맥락 없음)에서는 그 화면의 메뉴 칸(staffMenu)만 쓴다. */
import { h, esc, api } from '../kit/util.js';
import { staffMenu } from '../kit/lx-menu.js';
import { TASKS } from '../lx-console/matrix.js';   // 업무 → 대조 규칙(한 곳) — 결과 확인 화면을 그 업무 규칙으로 연다

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

/** 왼쪽 메뉴(동기) — 맥락이 있으면 LX 직원 메뉴('프로젝트' 불) + 마스트 아래 한 줄 자리(sub). 없으면 null(화면이 자기 메뉴 칸을 쓴다) */
export function projectRail(key) {
  if (!PID) return null;
  return { ...staffMenu('projects'), sub: true, project: key ?? null };
}

let CUR = null;
/** 프로젝트 한 장(같은 화면 안에서는 한 번) */
export function loadProject(id = PID) {
  if (!id) return Promise.resolve(null);
  if (!CUR || CUR.id !== id) CUR = { id, p: api('/projects/' + encodeURIComponent(id)).catch(() => null) };
  return CUR.p;
}

/** 마스트 아래 한 줄 — 프로젝트 이름 · 단계 6 · 다음 할 일. S = 키트 셸(rail.sub 로 만든 S.sub), key = 이 화면이 보이는 단계(프로젝트 화면이면 null).
    자리는 셸이 미리 잡아 두고(지도 크기 변화 0), 내용은 프로젝트를 읽은 뒤 채운다.
    → 프로젝트(서버 응답) 또는 null(없는 프로젝트 · 권한 없음 — 단계 이름만 두고 이동 주소는 대상 없이) */
export async function attachProject(S, rail, key) {
  if (!PID || !S?.sub) return null;
  ensureCss();
  drawBar(S.sub, null, key);                       // 프로젝트를 읽기 전 — 단계 이름만(대기)
  const pr = await loadProject();
  drawBar(S.sub, pr, key);
  return pr;
}

/** 프로젝트가 바뀐 뒤(구성원 · 재학습 등) 한 줄 다시 그리기 */
export function refreshRail(S, rail, pr, key) {
  if (S?.sub && pr) drawBar(S.sub, pr, key ?? rail?.project ?? null);
}

const CHECK = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8.5l3 3 6-7"/></svg>';
function drawBar(el, pr, key) {
  const st = pr?.stages || [];
  const here = STAGES.findIndex((s) => s.key === key);
  const nowI = pr?.stage?.index ?? -1;
  const name = pr ? h('a.lxp-bar-name', { href: projectHref(pr.id), title: pr.name }, h('span.lxp-bar-k', { text: '프로젝트' }), h('b', { text: pr.name }))
    : h('span.lxp-bar-name', {}, h('span.lxp-bar-k', { text: '프로젝트' }), h('b', { text: ' ' }));
  const steps = h('ol.lxp-bar-steps', { 'aria-label': '프로젝트 단계' });
  STAGES.forEach((s, i) => {
    const x = st[i] || {};
    const state = !pr ? 'wait' : i === nowI ? 'now' : x.done ? 'done' : 'wait';
    const word = x.skip ? '해당 없음' : state === 'done' ? '완료' : state === 'now' ? '지금 단계' : '대기';
    const a = h('a.lxp-st', { href: pr ? stageHref(pr, s.key, x.target) : stageHref(PID, s.key), dataset: { st: state }, title: `${i + 1} ${s.label} · ${word}`,
      'aria-current': i === here ? 'step' : null, 'aria-label': `${i + 1}단계 ${s.label} · ${word}` },
      h('span.n', { html: state === 'done' ? CHECK : String(i + 1) }), h('span.t', { text: s.label }));
    if (i === here) a.classList.add('is-here');
    steps.append(h('li', {}, a));
  });
  const nx = pr?.next?.text && pr.state !== 'archived' ? h('p.lxp-bar-next', {}, h('span.lxp-bar-k', { text: '다음 할 일' }), h('b', { text: pr.next.text })) : null;
  el.replaceChildren(h('div.lxp-bar', { class: key === null ? 'is-page' : '' }, key === null ? null : name, steps, nx));
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
