// F2 통합 — 에이전트 답 렌더 회귀(F2-E must_fix): 스트리밍 중 맨숫자 0 · 자리표 뒤 단위 중복 0 · 값 없는 봉투는 실측 칩 금지
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderMd, chip } from '../../landxi/agent/answer.js';

const E = (value, unit = 'count', basis = 'inferred') => ({ value, unit, basis, as_of: '2026-09-27T09:00:00+09:00', source: 'test' });
const text = (h) => h.replace(/<span class="ag-card"[\s\S]*?<\/span><\/span>/g, '</span>').replace(/<[^>]+>/g, '');

test('live: 자리표·인용 밖 숫자(한글 단위 포함)는 검증 중 표지 — 맨숫자 0', () => {
  const h = renderMd('대략 3만 건이고 12.5% 입니다 {{env:e1}} [2]', { envs: { e1: E(387) }, live: true });
  assert.match(h, /ag-pend/);
  const t = text(h).replace(/387|2(?=$)/g, '');
  assert.doesNotMatch(t.replace('검증 중', ''), /\d/, t);
});
test('done: 자리표 뒤 같은 단위 토큰 흡수(387 건 … 건임 → 387건임)', () => {
  const h = renderMd('{{env:e1}} 건임 · {{env:e2}} 필지임', { envs: { e1: E(387), e2: E(21080, '필지') } });
  assert.doesNotMatch(text(h), /건\s*건|필지\s*필지/);
  assert.match(text(h), /387건/);
});
test('값이 숫자가 아닌 봉투 → 실측 꼬리표 칩 없음(무제한)', () => {
  const h = chip({ ...E(null, 'gpu_s', 'measured'), note: '무제한' }, { id: 'q' });
  assert.doesNotMatch(h, /실측/);
  assert.match(h, /무제한/);
});
