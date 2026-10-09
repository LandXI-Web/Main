/* acc.js — 모델 '검증 정확도' 한 규칙(숫자 한 출처 · 규칙 3 · fix9).
   분석하기 카드(서버 cards.py model_card)와 같은 값: 모델 기록(metrics)의 학습 끝 검증 값 · 분할 모델은 마스크 mAP50 먼저 → 정수 %.
   서버 순서를 바꾸면 여기도 같이 바꾼다(server/landxi_api/cards.py '분석하기 카드' 주석 옆). 화면에는 '검증 정확도 n%' 로만 쓴다. */
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
