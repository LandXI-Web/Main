/* retrain.js — 재학습 · 정밀도 규칙 한 곳(순수 함수 · DOM/네트워크 0). lx-deploy 가 쓰고, lx-console '오늘'의 재학습 칸도
   이 함수를 import 하면 두 화면이 같은 값을 낸다(통합 요청: lx-console/data.js today() 의 bySet 계산을 dueSets() 로).

   재학습 규칙(명세 §2.3 · §2.7 공통): 지난 30일 · 열린 오탐 신고(kind fp)를 기관 × 업무로 묶어 5건 이상인 묶음 = 재학습 1건.
     · 결과 층 → 업무(카드): 'results/…/{이름}' 은 이름의 뜻으로, 'review:{규칙}' · 'survey/{규칙}' 은 그 규칙이 보는 AI 클래스로.
       (같은 규칙의 LX 검수 오탐과 기관 판정 오탐은 한 묶음 — 결과 층 이름이 달라도 갈라지지 않는다)
     · 재학습 필요 {n}건 = 그런 묶음 수 = 운영 표 '재학습' 행 수. 표 '오탐 신고' = 그 묶음의 신고 수.
   정밀도 규칙: lx-review/data.js 의 ruleStat()(규칙별 표본 검수 정밀도)을 그대로 import 해 규칙 → 업무 매핑으로 배포본에 붙인다.
     표본 < 100 이면 추정(~) · 호버 = 표본 수. 검수 기록이 없는 배포본만 '—'. */

export const REPORT_MIN = 5;        // 한 결과 층 열린 오탐 신고 ≥ 5 = 재학습
export const WINDOW_DAYS = 30;      // 지난 30일
export const SAMPLE_GOAL = 100;     // 표본 ≥ 100 = 확인됨(✓), 아래면 추정(~)

/* ── 결과 층 · 규칙 → 업무(카드) ───────────────────────── */
const SET_CARD = [[/farm|greenhouse|landcover|cultiv|crop/i, 'card-farm'], [/change/i, 'card-change'], [/living|waste|burn|pile|bld|build/i, 'card-living'],
  [/marine|debris|shore/i, 'card-marine'], [/road|vehicle/i, 'card-road'], [/crowd/i, 'card-crowd'], [/forest|carbon/i, 'card-forest']];
/** 규칙이 보는 AI 클래스 → 업무: 농경(경작지·비닐하우스·주차장 전용)은 영농, 건물 단독은 생활환경 */
export function cardOfRule(rule) {
  const req = (rule?.requires || []).join(' ');
  if (/_(crop|gh|farm|park)(_|)/.test(req)) return 'card-farm';
  if (/_bld(_|)/.test(req)) return 'card-living';
  return null;
}
/** 규칙이 붙은 결과 층 → 규칙 id. 'review:{규칙}'(LX 표본 검수) · 'survey/{규칙}'(서버 survey.py 가 기관 판정을 저장하는 이름).
    'review-stage:{규칙}'(시험 규칙)은 실보드가 아니라 제외. */
export function ruleOfSet(set) {
  const m = /^(?:review:|survey\/)(\w+)$/.exec(String(set || ''));
  return m ? m[1] : null;
}
/** 결과 층(set_id) → 업무 */
export function cardOfSet(set, rules = []) {
  const r = ruleOfSet(set);
  if (r) return cardOfRule(rules.find((x) => x.id === r));
  return (SET_CARD.find(([re]) => re.test(String(set || ''))) || [])[1] || null;
}
/** 재학습을 묶는 단위 = 기관 × 업무. 업무를 모르면 규칙(같은 규칙의 review:·survey/ 는 한 묶음), 그것도 없으면 결과 층 */
export function workKey(f, rules = []) {
  const card = cardOfSet(f.set_id, rules), r = ruleOfSet(f.set_id);
  return `${f.tenant_id || ''}|${card || (r ? 'rule:' + r : 'set:' + f.set_id)}`;
}
const openFp = (f, since) => f.state === 'open' && f.kind === 'fp' && !!f.set_id && !/^review-stage:/.test(f.set_id) && !(f.at && Date.parse(f.at) < since);

/* ── 재학습 ────────────────────────────────────────── */
/** 재학습 대상 — 지난 30일 열린 오탐 신고를 기관 × 업무(규칙)로 묶어 5건 이상인 묶음. [{key, card, rule, sets, set, n, tenant, items}] (많은 순)
    rules = /survey/rules(규칙 → 업무). 콘솔 '오늘'도 이 함수로 세면 같은 값. */
export function dueSets(feedback = [], { rules = [], now = Date.now(), min = REPORT_MIN, days = WINDOW_DAYS } = {}) {
  const since = now - days * 864e5;
  const by = new Map();
  for (const f of feedback) {
    if (!openFp(f, since)) continue;
    const k = workKey(f, rules);
    by.set(k, [...(by.get(k) || []), f]);
  }
  return [...by.entries()].map(([key, items]) => {
    const sets = [...new Set(items.map((f) => f.set_id))];
    return { key, card: cardOfSet(items[0].set_id, rules), rule: items.map((f) => ruleOfSet(f.set_id)).find(Boolean) || null,
      sets, set: sets[0], n: items.length, tenant: items[0].tenant_id || null, items };
  }).filter((x) => x.n >= min).sort((a, b) => b.n - a.n);
}
/** 배포본마다 걸린 열린 오탐 신고(같은 30일 · 같은 묶음: 같은 기관 · 같은 업무) — 표의 '오탐 신고' 칸 */
export function reportsFor(d, feedback = [], rules = [], { now = Date.now(), days = WINDOW_DAYS } = {}) {
  const since = now - days * 864e5;
  return feedback.filter((f) => openFp(f, since) && f.tenant_id === d.tenant_id && cardOfSet(f.set_id, rules) === d.card_id);
}
/** 재학습 묶음 → 배포본 id(같은 기관 · 같은 업무 · 운영 먼저). 한 묶음 = 한 배포본 */
export function retrainTargets(due, deploys = [], rules = []) {
  const rank = { ga: 0, canary: 1, shadow: 2, rolled_back: 3, draft: 9 };
  const out = new Map();
  for (const s of due) {
    const card = s.card ?? cardOfSet(s.set, rules);
    const d = deploys.filter((x) => x.stage !== 'draft' && x.card_id === card && (x.tenant_id === s.tenant || x.region_profile === s.tenant))
      .sort((a, b) => (rank[a.stage] ?? 5) - (rank[b.stage] ?? 5))[0];
    if (d) out.set(d.id, [...(out.get(d.id) || []), s]);
  }
  return out;
}

/* ── 정밀도(lx-review 와 같은 함수) ─────────────────────── */
/** 배포본 정밀도 봉투 — 이 배포본 업무에 걸린 규칙(이 기관에 의심 필지가 있는 것)의 lx-review ruleStat() 을 그대로 쓴다.
    statOf(ruleId) → { k 표본, precision 봉투|null } (lx-review/data.js ruleStat). 규칙 하나면 그 값 그대로, 여럿이면 표본 가중 평균.
    표본 < 100 이면 추정(~) · 호버 = 표본 수. 검수 기록이 없으면 null('—'). */
export function precisionFor(d, { rules = [], statOf, byRule = null } = {}) {
  if (!statOf) return null;
  const mine = rules.filter((r) => cardOfRule(r) === d.card_id && (!byRule || (byRule[r.id]?.value ?? byRule[r.id] ?? 0) > 0));
  const got = mine.map((r) => statOf(r.id)).filter((s) => s && s.precision && s.precision.value !== null && s.precision.value !== undefined);
  if (!got.length) {
    /* 규칙은 걸려 있는데 표본 검수 기록이 아직 없음 — 값 대신 표본 수(lx-review 의 '— · 0/100' 과 같은 뜻) */
    if (!mine.length) return null;
    const k0 = mine.reduce((a, r) => a + (statOf(r.id)?.k || 0), 0);
    return { value: null, unit: 'ratio', basis: 'estimate', k: k0, source: `표본 확인 ${k0}건`, note: `표본 ${k0}/${SAMPLE_GOAL}` };
  }
  const k = got.reduce((a, s) => a + (s.k || 0), 0);
  const value = got.length === 1 ? got[0].precision.value : Math.round((got.reduce((a, s) => a + s.precision.value * (s.k || 0), 0) / Math.max(1, k)) * 100) / 100;
  const base = got[0].precision;
  return { ...base, value, basis: k >= SAMPLE_GOAL ? base.basis : 'estimate', as_of: got.map((s) => s.precision.as_of).filter(Boolean).sort().pop() || base.as_of,
    source: `표본 확인 ${k}건`, note: `표본 ${k}/${SAMPLE_GOAL}`, k };
}
