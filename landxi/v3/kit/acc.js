/* acc.js — 모델 'AI 모델 정확도' 한 규칙(숫자 한 출처 · 규칙 3 · fix9).
   분석하기 카드(서버 cards.py model_card)와 같은 값: 모델 기록(metrics)의 학습 끝 검증 값 · 분할 모델은 마스크 mAP50 먼저 → 정수 %.
   서버 순서를 바꾸면 여기도 같이 바꾼다(server/landxi_api/cards.py '분석하기 카드' 주석 옆). 화면에는 'AI 모델 정확도 n%' 로만 쓴다. */
export const ACC_KEYS = ['mask_mAP50', 'metrics/mAP50(M)', 'box_mAP50', 'metrics/mAP50(B)', 'mAP50'];
const num = (v) => { const n = typeof v === 'object' && v !== null ? Number(v.value) : Number(v); return Number.isFinite(n) ? n : null; };

/** 모델 기록 → { value(정수 %), unit '%', basis, as_of, source, key } | null */
export function accOf(metrics) {
  const mt = metrics || {};
  for (const k of ACC_KEYS) {
    const e = mt[k];
    const v = num(e);
    if (v === null) continue;
    const basis = e && typeof e === 'object' && ['recorded', 'measured'].includes(e.basis) ? e.basis : 'recorded';
    return { value: Math.round(v * 100), unit: '%', basis, as_of: (e && e.as_of) || null, source: '모델 기록 · 학습 끝 검증 값', key: k };
  }
  return null;
}

/** 학습 로그(results.csv) 열 — 그 기록과 같은 지표의 회차별 값(곡선용) */
export const accColumn = (key, task) => (/mask|\(M\)/.test(key || '') || (!key && task === 'seg') ? 'metrics/mAP50(M)' : 'metrics/mAP50(B)');

/** 업무의 'AI 모델 정확도' = 그 업무를 맡은 공개 서비스가 쓰는 모델의 값(10-10 확인 9 ⓐ · 숫자 한 출처).
    deck = 서비스 카드 덱(/cards/deck items · 서버가 고른 그 카드의 모델 · 같은 규칙의 값). 업무에 이어진 서비스 카드 먼저,
    없으면 업무 후보 모델을 쓰는 공개 서비스. 공개 서비스가 없으면 null — 그때 학습 모델 값은 '최근 학습 n%'처럼 다른 이름으로만 쓴다. */
export function serviceAcc(deck, { card = null, models = [] } = {}) {
  const live = (deck || []).filter((c) => c.official && c.model?.acc && Number.isFinite(Number(c.model.acc.value)));
  const hit = (card && live.find((c) => c.id === card)) || live.find((c) => c.model.id && models.includes(c.model.id));
  return hit ? { ...hit.model.acc, value: Math.round(Number(hit.model.acc.value)), model: hit.model.id || null, card: hit.id } : null;
}
