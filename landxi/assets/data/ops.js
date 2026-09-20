// LX 능동 운영 — 이 플랫폼이 사업이 되는 자리 (2026-09-20 발주자 정의)
//
//   "기관이 찾은 오탐 재학습도 있겠지만, **LX가 적극적으로 이 임무와 역할을 해야**
//    이 플랫폼은 **비즈니스 사업화**할 수 있다."
//
// 수동(기관이 신고하면 고친다)으로는 사업이 되지 않는다. 한 번 납품하고 끝나는 용역이 된다.
// LX 가 **먼저 찾아 고치고 올리는 루프**를 돌려야 구독·유지관리가 성립한다.
//
//   납품형(수동)   모델 배포 → 기관이 쓴다 → 문제를 신고하면 → 고친다
//   사업형(능동)   모델 배포 → **LX 가 성능을 지켜본다** → 떨어지면 먼저 재학습 →
//                  새 버전을 배포 → 기관은 좋아진 것을 받는다 → 다음 계약이 이어진다
//
// 이 파일은 그 능동 루프의 데이터다. LX 대시보드·프로젝트·카드 발행 관리가 읽는다.
import { CARDS, DEPLOYS, cardById, modelsOfCard } from './cards.js';

/** 능동 운영의 다섯 임무 — LX 가 하지 않으면 사업이 되지 않는 일들. */
export const DUTIES = [
  { id: 'watch', name: '성능 감시', who: 'LX',
    what: '배포된 모델의 정확도·신뢰도가 떨어지는지 주기적으로 본다',
    why: '기관은 떨어진 줄 모른다. 알아도 신고하지 않는다.', screen: 'dashboard.html' },
  { id: 'retrain', name: '선제 재학습', who: 'LX',
    what: '새 영상이 쌓이거나 정확도가 기준 아래로 가면 **먼저** 재학습한다',
    why: '신고를 기다리면 이미 늦다. 먼저 올려야 값을 받는다.', screen: 'ai-project.html' },
  { id: 'verify', name: '표본 검수', who: 'LX',
    what: '기관이 보지 않는 구역을 표본으로 뽑아 사람이 확인한다',
    why: '정확도는 선언이 아니라 증거로 말해야 한다.', screen: 'ai-project.html' },
  { id: 'rollout', name: '갱신 배포', who: 'LX',
    what: '새 버전을 배포본에 올리고 무엇이 좋아졌는지 알린다',
    why: '좋아진 것을 보여야 다음 계약이 이어진다.', screen: 'admin-publish.html' },
  { id: 'expand', name: '적용 확대', who: 'LX',
    what: '검증된 카드를 다음 기관·다음 업무로 넓힌다',
    why: '양산의 목적은 한 곳이 아니라 여러 곳이다.', screen: 'analysis-ai.html' },
];

/** 기관이 하는 일은 하나뿐 — 쓰다가 이상하면 알린다. 나머지는 LX 몫이다. */
export const AGENCY_DUTY = { id: 'report', name: '오류 신고', who: '기관',
  what: '쓰다가 틀린 것을 표시해 보낸다', why: '보조 신호다. 이것만으로는 품질이 유지되지 않는다.' };

/** 감시 기준 — 이 선 아래로 가면 재학습을 건다. */
export const THRESHOLDS = { conf: 0.60, iou: 0.70, drop: 0.05, staleDays: 365, sampleMin: 100 };

/**
 * 배포본별 운영 상태 — LX 대시보드가 "지금 무엇을 해야 하나"로 읽는 표.
 * 콘티 원칙: 지어낸 추세·담당자 없음. 실측(results.js·models.js)과 규칙만으로 판단한다.
 */
export const OPS = [
  { deployId: 'dp-nw-farm-25', conf: 0.79, iou: 0.82, lastTrain: '2026-05-18', newImagery: 2,
    reported: 3, sampled: 120, note: '2025-10 영상 2도엽이 들어왔다 — 재학습 대상' },
  { deployId: 'dp-nw-living-23', conf: 0.64, iou: 0.71, lastTrain: '2025-04-02', newImagery: 0,
    reported: 11, sampled: 40, note: '학습 후 1년 이상 · 신고 누적 — 우선 재학습' },
  { deployId: 'dp-nw-road-26', conf: 0.81, iou: 0.84, lastTrain: '2026-06-10', newImagery: 1,
    reported: 0, sampled: 200, note: '구축 중 — 기준 충족' },
  { deployId: 'dp-gj-marine-25', conf: 0.72, iou: 0.76, lastTrain: '2026-08-12', newImagery: 0,
    reported: 2, sampled: 80, note: '표본이 기준(100)에 못 미친다 — 검수 필요' },
  { deployId: 'dp-nw-change', conf: 0.58, iou: 0.69, lastTrain: '2026-04-15', newImagery: 0,
    reported: 5, sampled: 60, note: '비지도 결과 — 신뢰도가 기준 아래' },
];
export const opsOf = (deployId) => OPS.find((o) => o.deployId === deployId) || null;

const days = (iso) => Math.round((Date.parse('2026-09-20') - Date.parse(iso)) / 864e5);

/**
 * 한 배포본이 지금 LX 에게 요구하는 일.
 * 규칙만으로 뽑는다 — 사람이 판단하기 전에 기계가 먼저 든다.
 */
export function actionsFor(deployId) {
  const o = opsOf(deployId); if (!o) return null;
  const d = DEPLOYS.find((x) => x.id === deployId) || {};
  const card = cardById(d.cardId) || {};
  const out = [];
  const stale = days(o.lastTrain);
  if (o.conf < THRESHOLDS.conf) out.push({ duty: 'retrain', level: 'high', why: `평균 신뢰도 ${o.conf.toFixed(2)} < 기준 ${THRESHOLDS.conf}` });
  if (o.iou < THRESHOLDS.iou) out.push({ duty: 'retrain', level: 'high', why: `IoU ${o.iou.toFixed(2)} < 기준 ${THRESHOLDS.iou}` });
  if (stale > THRESHOLDS.staleDays) out.push({ duty: 'retrain', level: 'mid', why: `마지막 학습 ${stale}일 전` });
  if (o.newImagery > 0) out.push({ duty: 'retrain', level: 'mid', why: `새 영상 ${o.newImagery}도엽 — 학습에 넣을 수 있다` });
  if (o.sampled < THRESHOLDS.sampleMin) out.push({ duty: 'verify', level: 'mid', why: `표본 ${o.sampled}건 < 기준 ${THRESHOLDS.sampleMin}건` });
  if (o.reported >= 5) out.push({ duty: 'verify', level: 'mid', why: `기관 신고 ${o.reported}건 누적` });
  if (!out.length) out.push({ duty: 'watch', level: 'ok', why: '기준 충족 — 다음 주기까지 감시' });
  return { deploy: d, card, ops: o, stale, actions: out,
    top: out.find((a) => a.level === 'high') || out.find((a) => a.level === 'mid') || out[0] };
}

/** LX 대시보드 머리 숫자 — "지금 우리가 해야 할 일". */
export function opsSummary() {
  const rows = OPS.map((o) => actionsFor(o.deployId)).filter(Boolean);
  const has = (id, lv) => rows.filter((r) => r.actions.some((a) => a.duty === id && (!lv || a.level === lv)));
  return {
    watched: rows.length,
    retrain: has('retrain').length, retrainUrgent: has('retrain', 'high').length,
    verify: has('verify').length,
    ok: rows.filter((r) => r.top.level === 'ok').length,
    reported: OPS.reduce((a, o) => a + o.reported, 0),
    rows: rows.sort((a, b) => ({ high: 0, mid: 1, ok: 2 }[a.top.level] - { high: 0, mid: 1, ok: 2 }[b.top.level])),
  };
}

/**
 * 사업화 지표 — "이 플랫폼이 사업이 되고 있는가".
 * 납품 건수가 아니라 **계속 도는 루프의 크기**를 본다.
 */
export function businessView() {
  const live = DEPLOYS.filter((d) => d.status === '운영');
  const building = DEPLOYS.filter((d) => d.status === '구축');
  const regions = new Set(DEPLOYS.map((d) => d.region));
  const s = opsSummary();
  return {
    운영중_서비스: live.length,
    구축중_서비스: building.length,
    적용_기관: regions.size,
    양산_카드: CARDS.filter((c) => c.status === '운영').length,
    감시중: s.watched,
    이번주기_재학습: s.retrain,
    긴급: s.retrainUrgent,
    검수필요: s.verify,
    기관신고: s.reported,
    // 능동 비율 — LX 가 먼저 건 일이 전체에서 얼마인가. 낮으면 납품형에 가깝다.
    능동비율: s.watched ? Math.round(((s.retrain + s.verify) / s.watched) * 100) : 0,
  };
}

/** 카드별 다음 버전에 무엇이 들어가나 — 갱신 배포의 근거. */
export function nextVersionPlan(cardId) {
  const card = cardById(cardId); if (!card) return null;
  const ds = DEPLOYS.filter((d) => d.cardId === cardId);
  const rows = ds.map((d) => actionsFor(d.id)).filter(Boolean);
  const retrain = rows.filter((r) => r.actions.some((a) => a.duty === 'retrain'));
  return {
    card, deploys: ds.length,
    reason: retrain.map((r) => `${r.deploy.region} · ${r.top.why}`),
    models: modelsOfCard(card).map((m) => m.name),
    level: retrain.some((r) => r.top.level === 'high') ? 'minor' : 'patch',
    note: retrain.length ? 'LX 가 먼저 재학습해 올린다 — 기관 신고를 기다리지 않는다' : '기준 충족 — 다음 주기 감시',
  };
}
