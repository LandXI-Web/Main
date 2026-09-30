// r3-fusion — 열 자동 인식: 일련번호 · 연번 같은 번호 열을 '지번'으로 잡지 않는다(값 모양 검사)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { guessColumns, isSerial } from '../../landxi/v3/gov-fusion/ledger.js';

const rows = Array.from({ length: 40 }, (_, i) => ({ 일련번호: String(i + 1), 법정동: '목포시 달동', 지번: `${100 + i * 3}-${i % 4}`, 지목: '답', '면적(㎡)': String(300 + i) }));

test('일련번호 · 연번 · 순번 · 번호 열은 사용 안 함', () => {
  const g = Object.fromEntries(guessColumns(Object.keys(rows[0]), rows).map((c) => [c.col, c.role]));
  assert.equal(g['일련번호'], 'skip');
  assert.equal(g['법정동'], 'jibun');
  assert.equal(g['지번'], 'jibun');
  assert.equal(g['지목'], 'state');
  for (const h of ['연번', '순번', '번호', 'No']) assert.equal(isSerial(h, ['1', '2', '3']), true, h);
});

test('이름이 없어도 1씩 커지는 정수 열은 번호 열 · 지번 모양 열은 아님', () => {
  const seq = Array.from({ length: 30 }, (_, i) => String(i + 7));
  assert.equal(isSerial('열1', seq), true);
  assert.equal(isSerial('열2', ['123', '45', '1001', '7', '88', '12']), false);   // 흩어진 본번(지번일 수 있음)
  assert.equal(isSerial('지번', seq), false);                                       // 이름이 지번이면 번호 열로 보지 않는다
  assert.equal(isSerial('열3', ['12-3', '15', '16-1', '20', '21']), false);
});

// 실증 2차 — 물어본 대장 지목('논인데 AI가 건물')을 빼고 세지 않는다(논 = 답 · 밭 = 전)
import { jimokOf, rulePlan, labelOf, run } from '../../landxi/v3/gov-fusion/ask.js';

test('논 · 밭 · 답 · 전 · 과수원 → 대장 지목 조건', () => {
  assert.deepEqual(jimokOf('도암면 대장에서 논인데 AI가 건물로 본 필지 몇 건'), ['답']);
  assert.deepEqual(jimokOf('밭인데 AI가 주차장'), ['전']);
  assert.deepEqual(jimokOf('전·답 중 건물'), ['답', '전']);
  for (const q of ['대장상 농지인데 AI가 건물로 본 필지 몇 건', '대장 전체에서 건물', '논산시 건물', '답변해 줘', '논의 결과']) assert.deepEqual(jimokOf(q), [], q);
  const ctx = { stateCol: '지목', addrCol: '소재지', ledgerCols: ['소재지', '지목'], places: ['도암면', '석문리'] };
  const R = rulePlan('도암면 대장에서 논인데 AI가 건물로 본 필지 몇 건', ctx);
  assert.deepEqual(R.where.find((w) => w.field === '지목'), { field: '지목', op: 'in', value: '답' });
  assert.equal(labelOf(R.where, ctx, R.focus).label, '도암면 · 대장은 답(논) · AI는 건물');
  const rows = [{ 지목: '답', 'AI 건물(㎡)': 50, 소재지: '도암면 항촌리' }, { 지목: '전', 'AI 건물(㎡)': 50, 소재지: '도암면 석문리' }, { 지목: '논', 'AI 건물(㎡)': 90, 소재지: '도암면 석문리' }];
  assert.deepEqual(run(R.where, rows), [0, 2]);                                   // '전' 필지는 빠진다 · 대장이 '논'으로 적어도 답
  const all = rulePlan('대장상 농지인데 AI가 건물로 본 필지 몇 건', ctx);
  assert.equal(run(all.where, rows).length, 3);                                   // 농지 전체는 그대로(회귀 0)
  assert.equal(rulePlan('논인데 건물', { ...ctx, stateCol: null }).unmet, '답(논)');   // 지목 열이 없으면 뺐다고 밝힌다
});
