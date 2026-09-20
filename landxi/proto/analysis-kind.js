/* 튀는 구조를 흡수하는 장치 — 카드의 **종류 선언**(cards.js `kind` · `needsOf`)만 보고 UI 를 켠다.
   (2026-09-20 이원화 확정본 §5) 화면은 카드 이름을 모른다. `card.kind` 를 고치면 여기를 거쳐
   카드 상세 · 분석 실행 · 결과 화면의 장치가 따라 바뀐다 — 화면 코드는 그대로다.
   새 종류가 생기면 cards.js 에 한 줄 + 아래 표에 렌더러 한 줄. */
import { needsOf, INPUT_KINDS, OUTPUT_KINDS, VIZ_KINDS, kindName } from '../assets/data/cards.js';
import { ARCHIVE } from './analysis-data.js';

export { needsOf, INPUT_KINDS, OUTPUT_KINDS, VIZ_KINDS, kindName };

/** needsOf() 의 각 갈래가 켜는 장치. key = needs 의 불린 이름. */
export const DEVICES = [
  { key: 'videoPlayer', name: '영상 플레이어', where: '실행 · 결과', why: '입력에 드론 영상이 있다 — 프레임을 골라 본다' },
  { key: 'timeAxis', name: '타임라인 · 시간 재생', where: '결과', why: '출력에 시계열이 있다 — 시각을 끌면 그때 상태를 본다' },
  { key: 'grid', name: '히트맵 · 격자 집계', where: '결과 지도', why: '출력이 밀도다 — 격자 색 농도로 칠한다' },
  { key: 'lineRef', name: '구간 등급 범례', where: '결과 지도', why: '출력이 구간이다 — 선형(노선 · 해안선) 기준이 필요하다' },
  { key: 'parcelRef', name: '필지 행정정보 표', where: '결과', why: '출력이 면이다 — 지적 · 대장과 대조한다' },
];
/** 이 카드가 켜는 장치만 — 화면은 이 배열을 그대로 그린다. */
export const devicesOf = (card) => { const n = needsOf(card); return DEVICES.filter((d) => n[d.key]); };

/* ── 입력 종류 → 아카이브 ────────────────────────────────────────────────
   imagery.js 가 가진 것은 정사영상뿐이다. 드론 영상 · 차량 카메라 · 위성은 아직 원천이 없다 —
   지어내지 않고 "아직 없다 + 어디서 오는가" 한 줄로 말한다. */
const FROM_ARCHIVE = {
  ortho: () => true,            // imagery.js 가 곧 정사영상 아카이브다(11세트)
  satellite: () => false,
  video: () => false,
  camera: () => false,
};
const NO_SOURCE = {
  video: '드론 영상 아카이브가 아직 없다 — 데이터 관리 › 업로드로 비행 영상을 올리면 여기 선다',
  camera: '차량 카메라 주행 영상이 아직 없다 — 데이터 관리 › 업로드로 주행분을 올리면 여기 선다',
  satellite: '위성 장면을 아직 조달하지 않았다 — 대상 지역이 정해지면 조달한다',
};
/** 카드가 받는 입력별 아카이브 묶음. [{ id, name, note, items[], gap }] */
export function inputSets(card) {
  const n = needsOf(card);
  return n.input.map((id) => {
    const k = INPUT_KINDS.find((x) => x.id === id) || { id, name: id, note: '' };
    const items = ARCHIVE.filter((a) => (FROM_ARCHIVE[id] || (() => false))(a));
    return { id, name: k.name, unit: k.unit, note: k.note, items, gap: items.length ? null : NO_SOURCE[id] || '원천 없음' };
  });
}
/** 실행에 쓸 수 있는 영상 전부(선택 가능한 것만). */
export const runnableInputs = (card) => inputSets(card).flatMap((s) => s.items);

/** 선언을 한 줄로 — `정사영상 → 면(폴리곤) → 결과 레이어 · 차트` */
export function kindLine(card) {
  const k = card.kind || { input: ['ortho'], output: ['polygon'], viz: ['layer'] };
  return [k.input.map((i) => kindName(INPUT_KINDS, i)).join(' · '),
    k.output.map((o) => kindName(OUTPUT_KINDS, o)).join(' · '),
    k.viz.map((v) => kindName(VIZ_KINDS, v)).join(' · ')].join(' → ');
}
