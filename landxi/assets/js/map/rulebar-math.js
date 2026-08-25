// 눈금줄 계산 — DOM 을 건드리지 않는 순수 함수라 Node 단위 테스트에서 바로 import 한다.

/** 축척 분모(천 단위 반올림). 559082264 = 적도 기준 zoom 0 축척 분모. */
export function scaleOf(zoom, lat) {
  return Math.round(559082264 / Math.pow(2, zoom) * Math.cos(lat * Math.PI / 180) / 1000) * 1000;
}

/** 화면 1px 이 나타내는 실제 거리(m). */
export function metersPerPixel(zoom, lat) {
  return 156543.03 * Math.cos(lat * Math.PI / 180) / Math.pow(2, zoom);
}

/** 눈금 막대에 쓸 실거리 단위 후보(m). */
export const UNITS = [100, 500, 1000, 5000, 10000, 50000];
/** 후보가 모두 60px 에 못 미칠 때(줌 6 이하 광역 보기) 쓰는 탈출값(m). */
export const UNIT_FALLBACK = 100000;

/**
 * 눈금 한 칸의 실거리와 화면 폭. 화면에서 60px 이상이 되는 첫 단위를 고르고,
 * 후보가 모두 미달하면 UNIT_FALLBACK(100km) 으로 떨어진다(이때만 60px 미만일 수 있다).
 */
export function tickUnit(zoom, lat) {
  const mPerPx = metersPerPixel(zoom, lat);
  const unit = UNITS.find(u => u / mPerPx >= 60) || UNIT_FALLBACK;
  return { unit, px: unit / mPerPx, mPerPx };
}

/** 눈금 라벨: 1km 이상은 km, 그 아래는 m. */
export function unitLabel(unit) { return unit >= 1000 ? `${unit / 1000} km` : `${unit} m`; }
