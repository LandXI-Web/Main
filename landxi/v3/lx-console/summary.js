/* summary.js — 대표 수치 한 출처. LX 직원 화면 5종(lx-console · lx-ingest · lx-train · lx-review · lx-deploy)이 이 함수로만 읽는다.
   계약: docs/superpowers/final/fix/fix-server-summary.md §계약
     GET /summary?region={sgg_cd}&card={card_id} → { as_of, items: [{ card, card_name, sgg_cd, region_name, tenant, stage, imagery, metrics: {
       detected · field_check · review_pending · reports : { label, value, unit, basis, as_of, source } } }], totals? }
   · 같은 label = 같은 계산: 여러 항목의 합은 total() 한 곳에서만 낸다(서버가 totals 를 주면 그것이 정본).
   · 서버에 경로가 아직 없거나 실패하면 null — 화면은 숫자를 지어내지 않고 '—'(불러오지 못함)로 둔다. */
import { api, isEnvelope, hasRoute } from '../kit/util.js';
import { devlog } from '../kit/dev-drawer.js';

export const KEYS = ['detected', 'field_check', 'review_pending', 'reports'];
/* 계약의 이름(서버 label 이 오면 그것이 우선) */
const LABEL = { detected: 'AI 탐지', field_check: '현장 확인 필요', review_pending: '결과 확인 대기', reports: '기관 신고' };
/* 신뢰가 가장 약한 쪽으로 합친다(하나라도 추정이면 추정) */
const WEAK = ['demo', 'history', 'estimate', 'inferred', 'recorded', 'measured'];

const C = new Map();
/** GET /summary — 같은 조건은 한 번만(화면 안 캐시). 실패 = null */
export function summary({ region = null, card = null, force = false } = {}) {
  const q = new URLSearchParams();
  if (region) q.set('region', region);
  if (card) q.set('card', card);
  const k = q.toString();
  if (force) C.delete(k);
  if (!C.has(k)) {
    /* 경로가 없는 서버에 404 를 두드리지 않는다(콘솔 오류 0) */
    C.set(k, hasRoute('/summary')
      .then((ok) => (ok ? api('/summary' + (k ? '?' + k : '')) : (devlog('summary', '경로 없음'), null)))
      .then((j) => (j && Array.isArray(j.items) ? j : null))
      .catch((e) => { devlog('summary', `${e.status || ''} ${e.code || e.message || ''}`.trim()); C.delete(k); return null; }));
  }
  return C.get(k);
}

/** 항목 거르개 — 카드 · 지역(시군구 코드) · 기관 */
export const pick = ({ card, sgg, tenant } = {}) => (i) => (!card || i.card === card) && (!sgg || i.sgg_cd === sgg) && (!tenant || i.tenant === tenant);

/** 지표 이름(서버 label 우선) */
export const labelOf = (j, key) => (j?.items || []).map((i) => i.metrics?.[key]?.label).find(Boolean) || LABEL[key];

/** 지표 합 봉투 — j 가 없으면 undefined(도착 전·실패) · 값이 하나도 없으면 value null(0 을 지어내지 않는다) */
export function total(j, key, filter = null) {
  if (!j) return undefined;
  if (!filter && isEnvelope(j.totals?.[key])) return j.totals[key];
  const ms = j.items.filter(filter || (() => true)).map((i) => i.metrics?.[key]).filter((m) => m && typeof m === 'object');
  const vals = ms.filter((m) => m.value !== null && m.value !== undefined && Number.isFinite(+m.value));
  const first = vals[0] || ms[0] || {};
  const basis = (vals.length ? vals : ms).map((m) => m.basis).filter(Boolean).sort((a, b) => WEAK.indexOf(a) - WEAK.indexOf(b))[0] || 'recorded';
  const asOf = (vals.length ? vals : ms).map((m) => m.as_of).filter(Boolean).sort().pop() || j.as_of;
  return {
    value: vals.length ? vals.reduce((s, m) => s + +m.value, 0) : null,
    unit: String(first.unit || 'count'), basis, as_of: String(asOf || ''), source: String(first.source || ''), label: labelOf(j, key),
  };
}

/** 카드의 단계 — 여러 지역 항목 중 가장 앞선 것(운영 > 시범 > 첫 결과 전) · 없으면 null */
const RANK = ['운영', '시범', '첫 결과 전'];
export function stageOf(j, card) {
  const s = (j?.items || []).filter((i) => i.card === card).map((i) => i.stage).filter(Boolean);
  if (!s.length) return null;
  return s.sort((a, b) => (RANK.indexOf(a) + 9) % 9 - (RANK.indexOf(b) + 9) % 9)[0];
}
