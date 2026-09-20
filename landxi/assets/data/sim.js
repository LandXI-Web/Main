// 시뮬레이션 — 판독 결과를 표준화해 모델의 입력으로 넘긴다 (2026-09-20 발주자 정의)
//
//   "27년 전남 해양쓰레기는 **위성영상 기반 중국 유입 괭생이모자반을 포착**하면,
//    이 정보를 기반으로 **해류모델링 기반 도착 예측 시뮬레이션** 기능 구현을 해야 한다."
//   "그럼 괭생이모자반 분석한 결과의 정보를 **표준화하여 매칭**하도록 하여"
//   "여기서 이 정보를 기반으로 해류 시뮬레이션 개발과 **시각적으로 표출**, **지도 서비스로 만든다.**"
//
// ── 이 파일이 세우는 고리 ──────────────────────────────────────────────
//
//   ① 판독(고정)        위성영상 → 괭생이모자반 패치 탐지
//        ↓ **표준화**   패치를 DRIFT_SCHEMA 한 벌로 적는다 — 모자반이든 부유쓰레기든 같은 틀
//   ② 매칭             그 표준 산출을 입력으로 받는 시뮬레이션을 시스템이 찾아 준다
//        ↓
//   ③ 시뮬레이션        해류장 + 바람 + 패치 초기조건 → 입자 이류 계산
//        ↓
//   ④ 지도 서비스       유선·궤적·도착 확률·상륙 예상 구간 + 도착 예상 시각
//
// **핵심은 ①과 ③ 사이의 표준이다.** 표준이 있으면 탐지 대상이 바뀌어도(모자반 → 유출유 →
// 부유쓰레기) 시뮬레이션을 다시 만들지 않는다. 카드가 늘어도 모델은 그대로다.
//
// 콘티 원칙: 해류 수치모델 산출은 아직 없다. 계산은 **진짜로 돌지만** 속도장은 모의값이며
// 화면에 그렇게 밝힌다. 실 산출이 들어오면 `FIELD.source` 만 바꾼다.

/* ══ 1. 표준 — 표류체 판독 산출 한 벌 ═══════════════════════════════
 * 이 틀에 맞으면 무엇이든 시뮬레이션에 넣을 수 있다. 그것이 표준화의 값어치다.
 */
export const DRIFT_SCHEMA = {
  id: { t: 'string', what: '패치 식별자' },
  kind: { t: 'enum', what: '표류체 종류 — sargassum · debris · oil · buoy' },
  at: { t: 'datetime', what: '관측 시각 (위성 통과 시각)' },
  lon: { t: 'number', what: '패치 중심 경도 (EPSG:4326)' },
  lat: { t: 'number', what: '패치 중심 위도' },
  areaKm2: { t: 'number', what: '패치 면적' },
  density: { t: 'enum', what: '피복 밀도 — low · mid · high' },
  conf: { t: 'number', what: '탐지 신뢰도 0–1' },
  source: { t: 'string', what: '영상 출처 · 센서' },
};

/** 이 표준을 만족하면 아래 시뮬레이션들이 바로 돈다. */
export const STANDARD_LINE = '표류체 패치 표준(DRIFT_SCHEMA) — 종류가 바뀌어도 틀은 같다';

/* ══ 2. 판독 카드가 내놓는 표준 산출 (27년 고도화) ═════════════════
 * 모의값이다. 위성 판독이 실제로 돌면 이 배열이 파이프라인 산출로 바뀐다.
 * 위치는 동중국해 북동부 — 중국 연안에서 제주 서방으로 향하는 통상 경로 위에 둔다.
 */
export const PATCHES = [
  { id: 'sg-01', kind: 'sargassum', at: '2027-03-18T02:40Z', lon: 123.95, lat: 32.85, areaKm2: 18.4, density: 'high', conf: 0.86, source: 'Sentinel-2 L2A · FAI 지수' },
  { id: 'sg-02', kind: 'sargassum', at: '2027-03-18T02:40Z', lon: 124.40, lat: 33.20, areaKm2: 11.2, density: 'mid', conf: 0.79, source: 'Sentinel-2 L2A · FAI 지수' },
  { id: 'sg-03', kind: 'sargassum', at: '2027-03-18T02:40Z', lon: 124.78, lat: 33.55, areaKm2: 6.7, density: 'mid', conf: 0.72, source: 'Sentinel-2 L2A · FAI 지수' },
  { id: 'sg-04', kind: 'sargassum', at: '2027-03-20T02:35Z', lon: 125.12, lat: 33.42, areaKm2: 24.9, density: 'high', conf: 0.88, source: 'Sentinel-2 L2A · FAI 지수' },
  { id: 'sg-05', kind: 'sargassum', at: '2027-03-20T02:35Z', lon: 125.48, lat: 33.86, areaKm2: 9.1, density: 'low', conf: 0.66, source: 'Sentinel-2 L2A · FAI 지수' },
  { id: 'sg-06', kind: 'sargassum', at: '2027-03-22T02:30Z', lon: 125.86, lat: 34.08, areaKm2: 15.3, density: 'mid', conf: 0.81, source: 'Sentinel-2 L2A · FAI 지수' },
];

export const DENSITY = { high: { name: '짙음', w: 1.0 }, mid: { name: '보통', w: 0.6 }, low: { name: '옅음', w: 0.3 } };

/* ══ 3. 시뮬레이션 계약 — 무엇을 받아 무엇을 내놓나 ═══════════════ */
export const SIMS = [
  { id: 'arrive', name: '도착 예측', what: '패치가 언제 어느 해안에 닿는지',
    takes: ['표류체 패치 표준', '표층 해류장(u·v)', '해상풍'],
    gives: ['입자 궤적', '상륙 예상 구간', '도착 예상 시각(ETA)', '도착 확률 격자'],
    viz: ['flow', 'drift', 'predict'], horizonDays: 10,
    needs: ['해류 수치모델 산출(격자 u·v · 시간축)', '해상풍 예보장'],
    note: '수거 선박과 인력을 어디에 언제 붙일지가 여기서 나온다' },
  { id: 'backtrack', name: '역추적', what: '어디서 흘러왔는지',
    takes: ['표류체 패치 표준', '표층 해류장(u·v)'],
    gives: ['역방향 궤적', '유입원 추정 구역'],
    viz: ['drift'], horizonDays: 14,
    needs: ['해류 수치모델 산출(과거장)'],
    note: '중국 유입인지 국내 발생인지를 가른다 — 대응 주체가 달라진다' },
  { id: 'deposit', name: '침적 예측', what: '어디에 가라앉는지',
    takes: ['표류체 패치 표준', '표층 해류장', '해저지형(수심 격자)'],
    gives: ['침적 확률 격자', '우선 조사 구역'],
    viz: ['contour', 'predict'], horizonDays: 30,
    needs: ['해저지형도(수심 격자)', '침적 실측 표본(검증용)'],
    note: '골과 둔덕이 가라앉는 자리를 만든다' },
];

export const simById = (id) => SIMS.find((s) => s.id === id) || null;

/** 표준 산출을 가진 카드에 어떤 시뮬레이션이 붙는지 알려준다(매칭). */
export function simsForStandard(std = '표류체 패치 표준') {
  return SIMS.filter((s) => s.takes.includes(std))
    .map((s) => ({ ...s, ready: false, gap: s.needs, why: `${std} 하나로 입력이 맞는다 — 모델만 붙이면 된다` }));
}

/* ══ 4. 해류장 — 계산은 진짜, 속도장은 모의 ═══════════════════════
 * 실 산출이 들어오면 sample() 만 격자 보간으로 바꾼다. 화면과 계산은 그대로다.
 *
 * 성분 (동중국해 북동부 · 3월)
 *   대마난류   남서 → 북동, 제주 남쪽을 지나 대한해협으로 (주성분)
 *   중국연안류 양쯔강 하구에서 남동쪽으로 밀려 나오는 저염수
 *   조류       반일주기 왕복 성분
 */
export const FIELD = {
  source: '모의 속도장 — 실 해류 수치모델 산출이 들어오면 교체한다',
  unit: 'm/s', bounds: [122.5, 31.0, 129.5, 35.5],
  /* ⚠ 이 속도장의 계수는 **개발 중에 손으로 맞춘 값이다.**
   * 처음에는 입자가 제주에만 몰렸고, 전남 구간이 나오도록 지류 위치·방향·세기와
   * 패치 시작 위치를 바꿔 가며 조정했다. 즉 **여기서 나오는 상륙 구간 비율은 예측이 아니라
   * 계수를 맞춰 만든 그림이다.** 실제 괭생이모자반 유입 경향과 일치한다는 근거가 없다.
   *
   * 화면은 이 사실을 숨기지 않는다 — 비율을 예측값으로 내걸지 않고 '모의' 딱지를 붙인다.
   * 실 해류 산출이 들어오면 sample() 을 격자 보간으로 바꾸고 이 주석을 지운다.
   * 그때까지 이 숫자로 수거 계획을 세우지 않는다. */
  tuned: true,
  warn: '상륙 구간 비율은 모의 속도장에서 나온 값이다 — 예측으로 쓰지 않는다',
};

/** 경도·위도·시각(h) → [u, v] m/s. 순수 함수 — 화면과 계산이 같은 것을 쓴다. */
export function sample(lon, lat, hours = 0) {
  const d2r = Math.PI / 180;
  // 대마난류 축: 제주 남서에서 북동으로. 축에서 멀수록 약해진다.
  const ax = (lon - 124.0) * 0.62 + (lat - 31.5) * 0.78;      // 축 따라가는 좌표
  const off = -(lon - 124.0) * 0.78 + (lat - 31.5) * 0.62;    // 축에서 벗어난 거리(도)
  const jet = Math.exp(-(off * off) / 2.6);                    // 축 중심에서 최대
  let u = 0.42 * jet * Math.cos(28 * d2r) + 0.06;
  let v = 0.42 * jet * Math.sin(28 * d2r) + 0.02;
  // 중국 연안류 — 양쯔강 하구(122.3, 31.6) 부근에서 남동으로 뻗는다
  const dx = lon - 122.6, dy = lat - 31.8;
  const coastal = Math.exp(-(dx * dx + dy * dy) / 5.2) * 0.26;
  u += coastal * 0.86; v -= coastal * 0.32;
  // 황해난류 지류 — 제주 서쪽에서 북으로 갈라져 신안·진도 앞바다로 든다.
  // 괭생이모자반 피해가 서남해 도서에 몰리는 것이 이 갈래 때문이다.
  const bx = lon - 125.60, by = lat - 34.00;
  const branch = Math.exp(-(bx * bx / 1.8 + by * by / 2.4)) * 0.30;
  u += branch * Math.cos(85 * d2r); v += branch * Math.sin(85 * d2r);
  // 제주도(126.55, 33.38) 우회 — 섬을 피해 갈라진다
  const jx = lon - 126.55, jy = lat - 33.38, jr = Math.hypot(jx, jy) + 1e-3;
  if (jr < 0.55) { const s = (0.55 - jr) / 0.55 * 0.34; u += (-jy / jr) * s; v += (jx / jr) * s; }
  // 반일주기 조류
  const tide = Math.sin((hours / 12.42) * 2 * Math.PI) * 0.12;
  u += tide * 0.45; v += tide * 0.22;
  return [u, v];
}

/** 위도에 따른 m → 도 변환. */
export const mToDeg = (lat) => ({ x: 1 / (111320 * Math.cos(lat * Math.PI / 180)), y: 1 / 110540 });

/** 전남 해안 — 상륙 판정에 쓰는 관리 구간 (모의 좌표, 실제는 해안선 구간화 산출을 쓴다). */
export const COAST = [
  { id: 'c-shinan', name: '신안 흑산·비금', lon: 125.43, lat: 34.68, span: 0.18 },
  { id: 'c-jindo', name: '진도 조도·서망', lon: 126.13, lat: 34.32, span: 0.16 },
  { id: 'c-wando', name: '완도 청산·노화', lon: 126.75, lat: 34.18, span: 0.16 },
  { id: 'c-yeosu', name: '여수 거문·금오', lon: 127.30, lat: 34.06, span: 0.18 },
  { id: 'c-jeju-n', name: '제주 북부(한림·애월)', lon: 126.35, lat: 33.55, span: 0.15 },
  { id: 'c-jeju-e', name: '제주 동부(구좌·성산)', lon: 126.86, lat: 33.48, span: 0.15 },
];

/** 상륙 판정 반경 — 구간별 span. 넓게 잡으면 먼바다에서 '상륙'해 버린다. */
/** 상륙 예상 구간 판정 — 궤적 끝점이 어느 구간에 가장 가까운가. */
export function landfallOf(lon, lat) {
  let best = null, bd = 1e9;
  COAST.forEach((c) => { const d = Math.hypot(lon - c.lon, lat - c.lat); if (d < bd) { bd = d; best = c; } });
  return best && bd <= best.span ? { coast: best, dist: bd } : null;
}

/** 시뮬레이션 설정 — 화면과 계산이 같은 값을 쓴다. */
export const RUN = {
  stepHours: 3, horizonDays: 10, windage: 0.018,   // 모자반은 수면에 떠 바람 영향을 받는다
  particlesPerKm2: 6, maxParticles: 2600,
  note: '시간 간격 3시간 · 10일 예보 · 풍압류 1.8 % — 모자반은 수면 부유체라 바람을 탄다',
};

/* ══ 5. LX AI 시스템의 역할 — 복잡한 고리에서 정체성을 지키는 선 ═══
 * 발주자: "이 과정에서 **LX AI 시스템의 역할도 충분히 고려**해야 한다. 복잡한 구조이기 때문에."
 *
 * 해류 수치모델은 해양 물리의 영역이고 LX 가 만들 것이 아니다. 그렇다고 통째로 넘기면
 * LX 는 영상만 주는 납품자가 된다. 선은 여기다 — **LX 는 탐지 · 표준 · 오케스트레이션 ·
 * 검증 · 전달을 소유하고, 물리 모델만 밖에서 받는다.**
 *
 *   밖에서 받는 것 : 해류 수치모델 산출 · 해상풍 예보 · 해저지형(수심)
 *   LX 가 소유     : 위성 판독 모델 · 표준 · 실행 판단 · 산출 보관 · 예측 검증 · 행정 전달
 *
 * 표준(DRIFT_SCHEMA)을 LX 가 쥐고 있으면 모델 공급자가 바뀌어도 고리가 끊기지 않는다.
 * 그것이 이 복잡한 구조에서 LX 가 가운데에 남는 방법이다.
 */
export const LX_ROLE = [
  { id: 'detect', step: 1, name: '탐지', who: 'LX', what: '위성영상에서 패치를 찾아낸다',
    own: '판독 모델 · 재학습 · 정확도 책임', screen: 'ai-project.html' },
  { id: 'normalize', step: 2, name: '표준화', who: 'LX', what: '판독 산출을 표류체 패치 표준 한 벌로 적는다',
    own: '**표준의 소유권** — 모델 공급자가 바뀌어도 이 계약은 LX 것이다', screen: 'produce.html?tab=match' },
  { id: 'trigger', step: 3, name: '실행 판단', who: 'LX', what: '새 패치가 잡히면 시뮬레이션을 언제 돌릴지 정한다',
    own: '자동 트리거 규칙 · 입력 준비 · 실행 이력', screen: 'produce.html?tab=ops' },
  { id: 'model', step: 4, name: '물리 계산', who: '외부', what: '해류·바람 수치모델이 속도장을 낸다',
    own: 'LX 가 만들지 않는다 — 산출을 받아 쓴다', screen: null },
  { id: 'advect', step: 5, name: '이류 계산', who: 'LX', what: '패치를 입자로 흩어 속도장 위에서 옮긴다',
    own: '입자 추적 · 풍압류 계수 · 궤적 산출', screen: 'map-drift.html' },
  { id: 'verify', step: 6, name: '예측 검증', who: 'LX', what: '다음 위성영상에서 실제 위치와 대조해 오차를 잰다',
    own: '**이 루프가 없으면 예측은 주장일 뿐이다** — 계수를 여기서 고친다', screen: 'produce.html?tab=ops' },
  { id: 'deliver', step: 7, name: '행정 전달', who: 'LX', what: '도착 예측을 수거 계획 업무에 꽂아 기관 화면으로 보낸다',
    own: '매칭 포인트 · 화면 생성', screen: 'portal.html' },
];

export const LX_LINE = 'LX 는 탐지·표준·실행·검증·전달을 소유한다. 물리 모델만 밖에서 받는다 — 표준을 쥐고 있어 고리의 가운데에 남는다.';

/** 예측 검증 — 예보와 다음 관측을 대조한다. 값이 들어오기 전에는 비어 있다(지어내지 않는다). */
export const VERIFY = {
  metric: [
    { id: 'sep', name: '분리 거리', what: '예측 위치와 실제 위치의 거리(km) · 예보 시간별' },
    { id: 'skill', name: '스킬 스코어', what: '1 − (분리거리 ÷ 이동거리). 0.6 이상이면 쓸 만하다' },
    { id: 'hit', name: '상륙 구간 적중', what: '예측한 해안 구간에 실제로 닿았나' },
  ],
  rows: [],                                  // 실 관측이 들어오면 채워진다
  gap: '검증할 후속 관측이 아직 없다 — 27년 사업 개시 후 채워진다',
  fix: '스킬이 0.6 아래로 내려가면 풍압류 계수와 해류장 갱신 주기를 먼저 손본다',
};
