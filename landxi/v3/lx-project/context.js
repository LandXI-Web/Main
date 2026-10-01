/* context.js — 프로젝트 맥락 한 곳(구현 2차 T1 · 확인 대장 R-D3 · 흐름-1 · 10차 메뉴-1 ⓐ · 구현 확인 2차 J-1 다시 · 원칙 81 · 99).
   왼쪽 메뉴는 어디서나 LX 직원 메뉴(홈 · 프로젝트 · 분석하기 · 서비스 카드 · 데이터 · 요청함 — kit/lx-menu.js)이고,
   생산 6단계는 메뉴가 아니라 **프로젝트 안**에 있다. 단계 화면(데이터 올리기 · 학습 · 결과 확인 · 서비스 관리)은 새로 그리지 않고 `?project=` 로 맥락만 받는다:
     · 왼쪽 메뉴 = '프로젝트'에 불 · 마스트 아래 한 줄 = 프로젝트 이름 + 그 프로젝트의 단계 6(데이터 올리기 → 학습데이터 구축 → 학습 → 결과 확인 → 발행 요청 → 서비스 관리) + 다음 할 일
     · 단계 표시(완료 · 지금 · 대기) = 서버 판정(GET /projects/{id}) — 화면이 지어내지 않는다. 이 화면이 보이는 단계는 밑줄
     · 단계 → 화면 주소 = stageHref() 한 곳(대시보드 '내 프로젝트' · 프로젝트 화면 · 단계 막대가 모두 이것을 쓴다)
   · 6칸 진행 막대(stepSegHtml · stepSeg) · 막힌 곳 한 줄(stuckHtml) = 프로젝트 목록과 대시보드 '내 프로젝트'가 함께 쓰는 한 부품 — 서버가 목록에 주는 칸 상태(steps) · 막힌 곳(blocked)을 그대로 보인다
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

/** 6칸 진행 막대(HTML) — steps = 서버가 준 칸 상태 6(done · now · wait · skip). 끝난 칸 · 지금 칸 · 남은 칸 · 건너뛴 칸을 구분한다.
    대시보드 '내 프로젝트' 줄도 같은 부품을 쓴다(.lxp-seg · context.css). 칸마다 이름표(title) · 막대 전체 읽기 글(aria-label). */
const SEG_WORD = { done: '완료', now: '지금 단계', wait: '대기', skip: '해당 없음' };
export function stepSegHtml(steps = []) {
  ensureCss();
  const st = STAGES.map((_, i) => (SEG_WORD[steps?.[i]] ? steps[i] : 'wait'));
  const nowI = st.indexOf('now');
  const n = (k) => st.filter((x) => x === k).length;
  const say = [`${n('done')}칸 끝남`, nowI >= 0 ? `지금 ${nowI + 1} ${STAGES[nowI].label}` : '', n('wait') ? `${n('wait')}칸 남음` : '', n('skip') ? `${n('skip')}칸 해당 없음` : ''].filter(Boolean).join(' · ');
  return `<span class="lxp-seg" role="img" aria-label="${esc(say)}">${st.map((x, i) => `<i data-st="${x}" title="${esc(`${i + 1} ${STAGES[i].label} · ${SEG_WORD[x]}`)}"></i>`).join('')}</span>`;
}

/** 6칸 진행 막대(요소) — 위 stepSegHtml 과 같은 것. 대시보드 '내 프로젝트' 줄이 쓴다 */
export function stepSeg(steps = []) {
  const t = document.createElement('template');
  t.innerHTML = stepSegHtml(steps);
  return t.content.firstElementChild;
}

/** 줄이 꺾일 때 가운뎃점이 줄 맨 앞에 서지 않게 — ' · ' 의 앞 공백을 줄바꿈 없는 공백으로(점은 앞 낱말과 함께 윗줄 끝에) */
export const nb = (t) => String(t ?? '').replace(/ · /g, '\u00A0· ');

/** 막힌 곳 한 줄(HTML) — 서버가 준 막힌 곳(blocked: 반려 → 앞 단계 남음 → 결재 대기 순)의 첫 줄 + 더 있으면 '외 n건' · 없거나 보관이면 —.
    프로젝트 목록 '막힌 곳' 칸과 대시보드 '내 프로젝트' 줄이 같은 규칙으로 쓴다(.lxp-stuck · context.css) */
export function stuckHtml(p, archived = false) {
  ensureCss();
  const b = archived ? [] : p?.blocked || [];
  if (!b.length) return '<span class="lxp-stuck is-none">—</span>';
  return `<span class="lxp-stuck" data-kind="${esc(b[0].kind)}" title="${esc(b.map((x) => x.text).join(' · '))}"><span>${esc(nb(b[0].text))}${b.length > 1 ? ` <small>외 ${b.length - 1}건</small>` : ''}</span></span>`;
}

/** ' · ' 로 이은 덧말을 뜻 단위(이름 · 시각 · 메모)마다 한 덩어리로 — 줄이 꺾여도 덩어리 안에서는 끊기지 않게(줄바꿈 규칙 9) */
export function units(text) {
  const f = document.createDocumentFragment();
  String(text ?? '').split(' · ').forEach((u, i) => { if (i) f.append(' · '); f.append(h('span.lxp-u', { text: u })); });
  return f;
}

/** 나에게 온 알림 한 줄씩(지금은 프로젝트장 넘겨받음 — 확인 17차 P-5 ⓐ) — 프로젝트 목록 맨 위와 대시보드 '내 프로젝트' 맨 위가 같은 부품.
    '열기' = 그 프로젝트 한 장으로(본 것으로 찍음) · '확인' = 본 것으로(다시 보이지 않음). 알림이 없으면 아무것도 그리지 않는다. */
export async function projectNotices(host) {
  ensureCss();
  let j;
  try { j = await api('/projects/notices'); } catch { return; }
  const seen = (id) => api(`/projects/notices/${encodeURIComponent(id)}/seen`, { method: 'POST' }).catch(() => null);
  const two = (n) => String(n).padStart(2, '0');
  const when = (s) => { const d = new Date(s || ''); return Number.isNaN(+d) ? '' : `${two(d.getMonth() + 1)}.${two(d.getDate())} ${two(d.getHours())}:${two(d.getMinutes())}`; };
  host.replaceChildren(...(j.items || []).map((n) => {
    const ok = h('button.lxp-ntc-ok', { type: 'button', text: '확인' });
    const row = h('div.lxp-ntc', { role: 'status' },
      h('span.lxp-ntc-t', {}, h('b', { text: n.text }),
        h('small', {}, units([n.by && `넘긴 사람 ${n.by}`, when(n.at), n.note && `메모 ${n.note}`].filter(Boolean).join(' · ')))),
      n.project?.id ? h('a.lxp-ntc-go', { href: projectHref(n.project.id), text: '열기',
        onclick: async (e) => { e.preventDefault(); await seen(n.id); location.href = projectHref(n.project.id); } }) : null, ok);
    ok.addEventListener('click', async () => { ok.disabled = true; await seen(n.id); row.remove(); });
    return row;
  }));
}

let cssOn = false;
export function ensureCss() {
  if (cssOn || document.querySelector('link[data-lxp]')) return;
  cssOn = true;
  document.head.append(h('link', { rel: 'stylesheet', href: new URL('./context.css', import.meta.url).href, dataset: { lxp: '1' } }));
}

/* ── 프로젝트 범위(단계 화면이 '그 프로젝트의 것'만 보이게 · J-1) ───────────────────────── */
/** 이 프로젝트의 모델 — 학습 단계(없으면 발행 요청 단계)가 가리키는 모델 id · 없으면 null */
export const projectModel = (pr) => pr?.stages?.find((s) => s.key === 'train')?.target?.model || pr?.stages?.find((s) => s.key === 'publish')?.target?.model || null;
/** 이 프로젝트의 대조 규칙 — 업무가 정해진 프로젝트는 그 업무 규칙(TASKS), 아니면 이 프로젝트 모델로 평가할 수 있는 규칙(서버 판정 · 서비스 만들기와 같은 한 곳).
    → 규칙 id 배열 · 알 수 없으면 null(거르지 않는다) */
export async function projectRules(pr) {
  if (!pr) return null;
  const t = pr.task_id ? TASKS.find((x) => x.id === pr.task_id) : null;
  if (t?.rules?.length) return t.rules.slice();
  const m = projectModel(pr);
  if (!m) return null;
  try {
    const j = await api('/registry/model-rules?model_id=' + encodeURIComponent(m));
    const ids = (j.items || []).filter((r) => r.fits).map((r) => r.id);
    return ids.length ? ids : null;
  } catch { return null; }
}

/** 단계 표시 말(짧게) — 지금 단계 번호 + 이름 */
export const stageWord = (pr) => (pr?.stage ? `${pr.stage.index + 1} ${pr.stage.label}` : '');
export { esc };
