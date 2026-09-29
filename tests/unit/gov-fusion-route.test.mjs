// c2-fusion — 첫 화면(gov-fusion) 경로 나누기: 대장 열 조건이 있는 질문만 대장 필터, 나머지는 서버 에이전트
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { routeOf, SUSPECT_COUNT, ledgerSggOf, regionOf, labelOf } from '../../landxi/v3/gov-fusion/ask.js';

const nw = { stateCol: '지목', addrCol: '소재지', ledgerCols: ['소재지', '지목', '면적'], places: ['운봉리', '운봉읍', '동천리'] };
const gj = { stateCol: '상태', addrCol: '주소', ledgerCols: ['주소', '상태'], places: ['안포리', '화양면'] };

test('K7 — 보고서·법령·차트·영상·의심 질문은 서버로(대장 필터 0)', () => {
  const qs = [
    '의심 필지 몇 건?', '건축법상 무허가 건축물 근거 조문은?', '운봉읍 실태조사 보고서 초안 만들어 줘', '화양면 보고서 초안',
    '여수시 의심 필지 읍면동별 차트', '농지법 제32조 조문 알려 줘', '이 필지 영상 설명해 줘', '운봉리 123 영상 보고 설명해 줘',
    '읍면동별 차트로 보여 줘', '농지 전용 허가 근거 법령은?', '동천리 공문 초안', '운봉읍으로 이동해', '영상 켜 줘', '확대해 줘',
  ];
  for (const q of qs) for (const ctx of [nw, gj]) assert.equal(routeOf(q, ctx).to, 'server', q);
});

test('대장 조건 질문은 대장 필터로(회귀 0)', () => {
  const qs = ['대장상 농지인데 AI가 건물로 본 필지 몇 건', '대장상 농지인데 AI가 건물', '경작 흔적 없는 필지', '주차장으로 쓰는 농지', '농업진흥구역 안 비닐하우스'];
  for (const q of qs) for (const ctx of [nw, gj]) assert.equal(routeOf(q, ctx).to, 'ledger', q);
  assert.equal(routeOf('운봉리 필지 몇 개', nw).to, 'ledger');
  assert.equal(routeOf('지목이 답인 필지', nw).to, 'ledger');
});

test('대장 조건이 없는 일반 질문은 서버', () => {
  for (const q of ['안녕', '어느 지역에 결과가 있어?', '현장 확인 필요 몇 건?', '이번 달 할 일 요약']) assert.equal(routeOf(q, nw).to, 'server', q);
});

test("'방법' 같은 낱말은 법령으로 잡지 않는다", () => {
  assert.equal(routeOf('경작 흔적 없는 필지 찾는 방법', nw).to, 'ledger');
});

test('의심 건수 질문 판정', () => {
  assert.ok(SUSPECT_COUNT.test('의심 필지 몇 건?'));
  assert.ok(SUSPECT_COUNT.test('의심 필지 수는?'));
  assert.ok(!SUSPECT_COUNT.test('여수시 의심 필지 읍면동별 차트'));
});

// 2차 — 대장을 올린 직후 명령 바 지역(시군구가 여럿인 기관)
const REGS = [{ sgg_cd: '12130', name: '여수시', in_scope: true }, { sgg_cd: '46730', name: '구례군', in_scope: true }, { sgg_cd: '52190', name: '남원시', in_scope: false }];
const EMD = new Map([['46730310', { name: '광의면' }], ['12130360', { name: '화양면' }], ['46730250', { name: '마산면' }]]);

test('올린 대장의 시군구 — 서버 기록 먼저, 없으면 이은 필지 다수', () => {
  assert.equal(ledgerSggOf({ sgg: [{ sgg_cd: '46730' }] }, []), '46730');
  assert.equal(ledgerSggOf(null, ['4673031021100010000', '4673031021100020000', '1213036021100010000']), '46730');
  assert.equal(ledgerSggOf({ sgg: [{ sgg_cd: '46730' }, { sgg_cd: '12130' }] }, ['4673031021100010000']), null);
  assert.equal(ledgerSggOf(null, []), null);
});

test('질문 속 지역 — 관할 시군구 · 읍면동 이름(하나일 때만)', () => {
  assert.equal(regionOf('광의면 실태조사 보고서 초안 만들어 줘', REGS, EMD), '46730');
  assert.equal(regionOf('구례군 의심 필지 읍면동별 차트', REGS, EMD), '46730');
  assert.equal(regionOf('화양면 의심 필지 몇 건?', REGS, EMD), '12130');
  assert.equal(regionOf('의심 필지 몇 건?', REGS, EMD), null);
  assert.equal(regionOf('여수시와 구례군 비교', REGS, EMD), null);
  assert.equal(regionOf('남원시 의심 필지', REGS, EMD), null);                 // 관할 밖은 서버 가드 몫
});

// 3차 — 확인자가 고른 강진군 병영면(리 이름 대장): 어긋난 필지 이어 묻기 · 읍면 이름만으로 이동 · 대장 필터 답의 이름
const gg = { stateCol: '공부지목', addrCol: '읍면', ledgerCols: ['읍면', '리', '지번', '공부지목'], places: ['삼인리', '상낙리', '병영면', '도암면'], ledgerPlaces: ['삼인리', '상낙리'] };

test("'어긋난 필지' 질문은 대장 필터가 아니라 서버 대조 도구로", () => {
  for (const q of ['어긋난 필지가 제일 많은 리는?', '올린 대장에서 어긋난 필지가 제일 많은 리는?', '삼인리에서 대장과 어긋난 필지 몇 필지?', '어긋난 필지 몇 필지야', '대장과 AI가 다른 필지 몇 개'])
    assert.equal(routeOf(q, gg).to, 'server', q);
});

test('대장에 없는 관할 읍면 이름만 있으면 서버(지도 이동) · 대장에 있는 리는 대장 필터', () => {
  assert.equal(routeOf('병영면으로 지도 이동해 줘', gg).to, 'server');
  assert.deepEqual(routeOf('병영면 보여 줘', gg), { to: 'server', why: 'map' });
  assert.deepEqual(routeOf('삼인리 보여 줘', gg), { to: 'ledger', why: 'place' });
  assert.equal(routeOf('대장상 농지인데 AI가 건물로 본 필지 몇 건', gg).to, 'ledger');      // 회귀 0
});

test('대장 필터 답에는 무엇을 센 숫자인지 이름이 붙는다', () => {
  assert.equal(labelOf([{ field: '읍면', op: 'contains', value: '삼인리' }], { ...gg, baseLabel: '올린 대장 필지' }, '삼인리').label, '삼인리 · 올린 대장 필지');
  assert.equal(labelOf([{ field: '읍면', op: 'contains', value: '삼인리' }], { ...gg, baseLabel: 'AI 결과가 있는 대장 필지' }, '삼인리').label, '삼인리 · AI 결과가 있는 대장 필지');
  assert.equal(labelOf([{ field: 'V-World 지목', op: '==', value: '답' }], gg, '').label, '올린 대장 필지 중 조건에 맞는 필지');
  assert.equal(labelOf([{ field: '공부지목', op: 'in', value: '전,답,과수원' }, { field: 'AI 건물(㎡)', op: '>=', value: 33 }], gg, '').label, '대장은 농지 · AI는 건물');
});
