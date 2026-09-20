// 인프라 — 분기화를 기능으로 만들면 HW 가 계산된다 (2026-09-20 발주자 정의)
//
//   "결국 LX에서는 이런 **지자체 분기화도 기능화** 해야만
//    나중에는 **인프라 HW도 잘 관리**할 수 있다."
//
// 분기(이식·배포)가 사람 손으로 도는 일이면 자원 소요를 아무도 모른다.
// 배포본 한 줄이 시스템의 정식 기록이 되는 순간, **그 줄에서 HW 가 계산된다** —
// 저장 용량 · 추론 시간(GPU) · 타일 트래픽 · 증설 시점까지.
//
//   배포본(DEPLOYS) × 지역 프로파일(면적·영상) × 카드 선언(kind)
//        → 저장 · GPU · 트래픽 → 증설 계획
//
// 이 파일은 LX 대시보드의 '인프라' 자리와 서비스 관리가 읽는다.
import { DEPLOYS, cardById, needsOf, modelsOfCard } from './cards.js';
import { PROFILES, profileOf } from './registry.js';

/* ══ 단가 — 실측에서 뽑은 계수 ═════════════════════════════════════════
 * 남원 전역 정사영상 실측: GSD 1.5 cm 1시점 ≈ 2.1 TB / 752 km² → ≈ 2.8 GB/km².
 * 타일(웹 서비스용 webp z12–19) ≈ 원본의 1.5 %. 결과 GeoJSON 은 건수에 비례.
 * GPU: YOLO 계열 타일 추론 실측 ≈ 0.9 GPU·시간 / km² (GSD 1.5 cm 기준).
 */
export const RATES = {
  rawPerKm2: { ortho: 2.8, video: 0.35, camera: 0.12, satellite: 0.02 },   // GB/km² (1회분)
  tileRatio: 0.015,                                                          // 원본 대비 타일 비율
  gpuHourPerKm2: { ortho: 0.9, video: 2.4, camera: 0.3, satellite: 0.05 },   // GPU·h/km² (1회 추론)
  resultMbPer1k: 1.8,                                                        // 결과 GeoJSON MB / 1,000건
  tileGbPerViewMonth: 0.6,                                                   // 사용자 1인 월 타일 트래픽
  retrainGpuHour: 36,                                                        // 재학습 1회(카드당)
  keepEpochs: 4,                                                             // 보관 시점 수(원본)
};

/** 카드 주기 → 연간 실행 횟수.
 *  ⚠ cards.js 의 `cycle` 은 아직 전부 null 이다(발주처 확인 전).
 *  null 이면 **연 1회로 가정**하고 resourcesOf().assumedCycle 로 그 사실을 알린다 —
 *  주기가 늘면 GPU 소요가 그 배수로 는다. 가정을 숨기면 용량 판단이 조용히 틀어진다. */
const runsPerYear = (cycle) => (!cycle ? 1 : /수시/.test(cycle) ? 12 : /분기/.test(cycle) ? 4 : /반기/.test(cycle) ? 2 : /2회/.test(cycle) ? 2 : 1);

/* 대상 범위 — **서비스마다 지역의 일부만 본다.** 지역 면적을 그대로 쓰면 자원이 부풀려진다.
 * 영농은 농경지, 도로는 노선 버퍼, 해양쓰레기는 해안 버퍼, 인파는 행사 구역,
 * 국토 변화만 전역이다. 배포본에 실측 면적(`areaKm2`)이 있으면 그것을 먼저 쓴다. */
export const COVER_RATIO = {
  'card-farm': 0.20, 'card-living': 0.35, 'card-road': 0.05, 'card-crowd': 0.01,
  'card-change': 1.00, 'card-marine': 0.015, 'card-forest': 0.60,
};
export const coverOf = (deploy, card, pf) =>
  deploy.areaKm2 || Math.max(1, Math.round((pf.area || 100) * (COVER_RATIO[card.id] ?? 0.3)));

/**
 * 배포본 한 줄에서 자원을 뽑는다. **이것이 '분기화의 기능화'의 실체다.**
 * 새 지자체에 카드를 심으면 이 함수가 곧바로 HW 소요를 내놓는다.
 */
export function resourcesOf(deployId) {
  const d = DEPLOYS.find((x) => x.id === deployId); if (!d) return null;
  const card = cardById(d.cardId) || {};
  const pf = profileOf(d.region) || { area: 100, region: d.region };
  const kind = needsOf(card);
  const area = coverOf(d, card, pf);                 // 지역 전체가 아니라 **이 서비스가 보는 범위**
  const runs = runsPerYear(card.cycle);

  // 입력 종류가 여럿이면 합산한다(도로안전 = 카메라 + 정사영상).
  const rawGb = (kind.input || ['ortho']).reduce((a, k) => a + (RATES.rawPerKm2[k] || 0) * area, 0);
  const gpuH = (kind.input || ['ortho']).reduce((a, k) => a + (RATES.gpuHourPerKm2[k] || 0) * area, 0);
  const items = modelsOfCard(card).filter((m) => m.real).reduce((a, m) => a + (m.count || 0), 0);

  return {
    deploy: d, card, profile: pf, area, regionArea: pf.area || null, runs,
    assumedCycle: !card.cycle,                       // 주기 미정 → 연 1회 가정으로 계산했다
    storage: {
      raw: Math.round(rawGb * RATES.keepEpochs),                       // LX 보관(시점 누적)
      tile: Math.round(rawGb * RATES.tileRatio * RATES.keepEpochs),    // 기관에 공유하는 영상 이미지
      result: +(items / 1000 * RATES.resultMbPer1k).toFixed(1),        // MB
      total: Math.round(rawGb * RATES.keepEpochs * (1 + RATES.tileRatio)),
    },
    compute: {
      perRun: Math.round(gpuH),
      perYear: Math.round(gpuH * runs),
      retrain: RATES.retrainGpuHour,
    },
    traffic: { tileGbMonth: +(RATES.tileGbPerViewMonth * (pf.units || 10)).toFixed(1) },
  };
}

/** 전체 합계 — LX 인프라 현황. 배포본이 늘면 여기가 자동으로 는다. */
export function infraSummary(filter = () => true) {
  const rows = DEPLOYS.filter(filter).map((d) => resourcesOf(d.id)).filter(Boolean);
  const live = rows.filter((r) => r.deploy.status === '운영' || r.deploy.status === '구축');
  const plan = rows.filter((r) => r.deploy.status === '예정');
  const sum = (list, f) => Math.round(list.reduce((a, r) => a + f(r), 0));
  return {
    deploys: rows.length, regions: new Set(rows.map((r) => r.deploy.region)).size,
    storageTb: +(sum(live, (r) => r.storage.total) / 1024).toFixed(1),
    rawTb: +(sum(live, (r) => r.storage.raw) / 1024).toFixed(1),
    tileGb: sum(live, (r) => r.storage.tile),
    gpuYear: sum(live, (r) => r.compute.perYear),
    gpuRetrain: sum(live, (r) => r.compute.retrain),
    trafficGbMonth: +live.reduce((a, r) => a + r.traffic.tileGbMonth, 0).toFixed(1),
    assumedCycles: rows.filter((r) => r.assumedCycle).length,   // 몇 건이 '주기 미정 · 연 1회' 가정인가
    planned: { deploys: plan.length, storageTb: +(sum(plan, (r) => r.storage.total) / 1024).toFixed(1), gpuYear: sum(plan, (r) => r.compute.perYear) },
    rows,
  };
}

/* ══ 보유 자원 — 지금 가진 것 (시연 값, 실제 대수는 운영팀 확인) ═══════ */
export const CAPACITY = {
  storageTb: 120,                               // 정사영상 보관용 스토리지
  gpuCards: 4, gpuHourPerYear: 4 * 24 * 300,    // 가동률 감안 연 28,800 GPU·h
  netGbMonth: 2000,
};

/** 증설 판단 — 언제 무엇을 더 사야 하나. 규칙만으로 뽑는다. */
export function capacityPlan() {
  const now = infraSummary();
  const needTb = now.storageTb + now.planned.storageTb;
  const needGpu = now.gpuYear + now.gpuRetrain + now.planned.gpuYear;
  const pct = (v, cap) => Math.round((v / cap) * 100);
  const rows = [
    { id: 'storage', name: '스토리지', use: now.storageTb, cap: +CAPACITY.storageTb.toFixed(1), unit: 'TB',
      pct: pct(now.storageTb, CAPACITY.storageTb), after: +needTb.toFixed(1), afterPct: pct(needTb, CAPACITY.storageTb),
      note: '원본은 LX 보관 — 시점이 쌓일수록 는다' },
    { id: 'gpu', name: 'GPU 연산', use: now.gpuYear + now.gpuRetrain, cap: CAPACITY.gpuHourPerYear, unit: 'GPU·h/년',
      pct: pct(now.gpuYear + now.gpuRetrain, CAPACITY.gpuHourPerYear), after: needGpu, afterPct: pct(needGpu, CAPACITY.gpuHourPerYear),
      note: '추론 + 재학습. 서비스가 늘면 선형으로 는다' },
    { id: 'net', name: '타일 트래픽', use: now.trafficGbMonth, cap: CAPACITY.netGbMonth, unit: 'GB/월',
      pct: pct(now.trafficGbMonth, CAPACITY.netGbMonth), after: now.trafficGbMonth, afterPct: pct(now.trafficGbMonth, CAPACITY.netGbMonth),
      note: '기관에 공유하는 영상 이미지' },
  ];
  return { rows, alerts: rows.filter((r) => r.afterPct >= 80),
    line: rows.some((r) => r.afterPct >= 100) ? '예정 사업까지 넣으면 용량을 넘는다 — 증설 필요'
      : rows.some((r) => r.afterPct >= 80) ? '예정 사업 반영 시 80 % 초과 — 증설 검토'
      : '여유 있음' };
}

/** 새 지자체 한 곳을 더 받으면 얼마가 드는가 — 영업·계약의 근거. */
export function costOfNewRegion(cardId, profileId) {
  const pf = PROFILES.find((p) => p.id === profileId); const card = cardById(cardId);
  if (!pf || !card) return null;
  const fake = { id: 'tmp', cardId, region: pf.region, status: '예정', year: 2027 };
  DEPLOYS.push(fake); const r = resourcesOf('tmp'); DEPLOYS.pop();
  return r && { region: pf.region, card: card.name, regionArea: pf.area, cover: r.area,
    storageTb: +(r.storage.total / 1024).toFixed(2), gpuYear: r.compute.perYear,
    firstRun: r.compute.perRun, tileGb: r.storage.tile,
    note: '카드는 그대로, 지역 프로파일만 갈아 끼운 산출 — 분기화가 기능이어서 계산된다' };
}
