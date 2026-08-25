// 스크롤 진행값 p(0–1) 하나가 카메라를 구동한다.
// 키프레임 사이는 구간마다 다른 이징으로 보간한다(같은 이징을 전 구간에 쓰면 연출이 아니라 목록이 된다).

export const KEYS = [
  // p,     center,                 zoom,  pitch, bearing, 다음 구간까지의 이징
  { p: 0.000, c: [127.50, 36.20], z: 1.55, t: 0,  b: 28,  e: 'power1.inOut' },
  { p: 0.110, c: [127.50, 36.20], z: 1.80, t: 0,  b: 16,  e: 'power2.in' },
  { p: 0.190, c: [127.60, 36.40], z: 3.30, t: 8,  b: 6,   e: 'expo.in' },   // 성층운 진입
  { p: 0.268, c: [127.70, 36.40], z: 5.10, t: 20, b: -2,  e: 'expo.out' },  // 화이트아웃 정점
  { p: 0.330, c: [127.75, 36.15], z: 6.20, t: 34, b: -6,  e: 'power2.out' },// 지형이 드러남
  { p: 0.400, c: [127.75, 36.05], z: 6.80, t: 30, b: -8,  e: 'none' },
  { p: 0.520, c: [127.72, 36.00], z: 6.80, t: 30, b: -8,  e: 'power2.inOut' },
  { p: 0.580, c: [127.30, 35.78], z: 8.50, t: 45, b: -15, e: 'power3.inOut' },
  { p: 0.650, c: [127.52, 35.31], z: 11.0, t: 68, b: -35, e: 'expo.inOut' }, // 지리산 서릉 · terrain ON
  { p: 0.712, c: [127.40, 35.47], z: 13.5, t: 62, b: -20, e: 'power3.out' }, // 남원 분지 활강
  { p: 0.762, c: [127.3524, 35.5311], z: 16.0, t: 46, b: -10, e: 'power4.out' },
  { p: 0.805, c: [127.3524, 35.5311], z: 18.2, t: 0,  b: 0,  e: 'power2.inOut' }, // 착지
  { p: 0.870, c: [127.3524, 35.5311], z: 17.4, t: 0,  b: 0,  e: 'none' },
  // 0.888 이후(결과 아틀라스)는 행마다의 flyTo 가 카메라를 가져간다 — 여기서는 착지 상태를 유지한다.
  { p: 1.000, c: [127.3524, 35.5311], z: 17.4, t: 0,  b: 0,  e: 'none' },
];

const cache = new Map();
const ease = (name) => {
  if (name === 'none') return (x) => x;
  if (!cache.has(name)) cache.set(name, window.gsap.parseEase(name) || ((x) => x));
  return cache.get(name);
};

export function cameraAt(p) {
  p = Math.max(0, Math.min(1, p));
  let i = 0;
  while (i < KEYS.length - 2 && p > KEYS[i + 1].p) i++;
  const a = KEYS[i], b = KEYS[i + 1];
  const span = b.p - a.p || 1;
  const raw = Math.max(0, Math.min(1, (p - a.p) / span));
  const k = ease(a.e)(raw);
  // 미세 드리프트 — 카메라가 완전히 죽어 있는 순간을 만들지 않는다.
  // 단, 착지 이후(챕터 4)에는 0 으로 수렴시킨다. 스와이프 오버레이가 bearing 0 을 요구한다.
  const settle = 1 - Math.max(0, Math.min(1, (p - 0.778) / 0.026));
  const drift = (Math.sin(p * 11.0) * 1.15 + Math.sin(p * 4.3 + 1.1) * 0.7) * settle;
  return {
    center: [a.c[0] + (b.c[0] - a.c[0]) * k, a.c[1] + (b.c[1] - a.c[1]) * k],
    zoom: a.z + (b.z - a.z) * k,
    pitch: a.t + (b.t - a.t) * k,
    bearing: a.b + (b.b - a.b) * k + drift,
  };
}

// 챕터 경계 — ←/→ 키와 하단 룰러가 쓴다.
// at 값은 판(plate) 슬롯 전환점과 같은 좌표를 쓴다: 룰러 눈금이 곧 판이 바뀌는 자리다.
export const CHAPTERS = [
  { id: 1, at: 0.02,  label: '궤도',        ko: '국토가 깨어난다' },
  { id: 2, at: 0.17,  label: '구름 돌파',    ko: '전국이 켜진다' },
  { id: 3, at: 0.565, label: '남원 강하',    ko: '1.5cm까지' },
  { id: 4, at: 0.888, label: '결과 아틀라스', ko: 'AI가 본 것' },
];
