/* 레일 정의 — 지구 → 한반도 → 남원 시가지.
   camera.js 의 키프레임 포맷을 그대로 확장했다({p,c/center,z/zoom,t/pitch,b/bearing,e/ease}에
   hold 와 turn 만 추가). dive.js 의 KEYS 를 그대로 붙여넣어도 돌아간다. */

export const NAMWON = [127.3524, 35.5311];

export const KEYS = [
  // p,     center,                z,     pitch, bearing, ease,           hold
  { p: 0.000, c: [127.50, 36.20], z: 1.55, t: 0,  b: 28,  e: 'power2.in',    hold: 0.045, label: '궤도' },
  { p: 0.180, c: [127.62, 36.42], z: 3.40, t: 6,  b: 12,  e: 'expo.in' },
  { p: 0.300, c: [127.82, 36.10], z: 5.40, t: 22, b: -4,  e: 'power2.out' },
  { p: 0.420, c: [127.74, 35.94], z: 6.90, t: 34, b: -10, e: 'none',         hold: 0.035, label: '국토' },
  { p: 0.560, c: [127.52, 35.62], z: 8.80, t: 48, b: -18, e: 'power3.inOut' },
  { p: 0.690, c: [127.410, 35.520], z: 11.6, t: 62, b: -30, e: 'expo.inOut', label: '분지' },
  { p: 0.800, c: [127.3620, 35.5390], z: 14.2, t: 54, b: -14, e: 'power4.out' },
  { p: 0.890, c: NAMWON,           z: 16.4, t: 32, b: -4,  e: 'power2.inOut', hold: 0.03, label: '착지' },
  { p: 1.000, c: NAMWON,           z: 17.0, t: 0,  b: 0,   e: 'none' },
];

export const CHAPTERS = [
  { at: 0.020, label: '궤도',   ko: '국토가 깨어난다' },
  { at: 0.300, label: '대기권', ko: '구름을 지난다' },
  { at: 0.560, label: '강하',   ko: '남원 분지로' },
  { at: 0.800, label: '착지',   ko: '1.5 cm 까지' },
];

/* 스크린샷/영상 기준점 6곳 — 보고서와 shots/ 가 같은 좌표를 쓴다. */
export const MARKS = [
  ['01-orbit',   0.020],
  ['02-atmos',   0.300],
  ['03-korea',   0.440],
  ['04-descent', 0.620],
  ['05-basin',   0.760],
  ['06-landing', 0.905],
];
