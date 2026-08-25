// SunCalc 로 지금 이 순간의 태양 직하점(subsolar point)을 찾는다.
// 터미네이터와 3D 조명이 전부 여기서 나온다 — 임의의 각도를 쓰지 않는다.
const alt = (d, la, lo) => window.SunCalc.getPosition(d, la, lo).altitude;

function argmax(f, lo, hi, steps, passes) {
  let best = lo, bv = -Infinity;
  for (let pass = 0; pass < passes; pass++) {
    const step = (hi - lo) / steps;
    best = lo; bv = -Infinity;
    for (let i = 0; i <= steps; i++) {
      const x = lo + step * i, v = f(x);
      if (v > bv) { bv = v; best = x; }
    }
    lo = best - step; hi = best + step;
  }
  return best;
}

export function subsolar(date = new Date()) {
  const lng = argmax((x) => alt(date, 0, x), -180, 180, 72, 3);
  const lat = argmax((x) => alt(date, x, lng), -25, 25, 50, 3);
  return { lat, lng };
}

export const KST = (d = new Date()) =>
  new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul', hour12: false,
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).format(d);

export const KSTDate = (d = new Date()) =>
  new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(d).replace(/\.\s?/g, '-').replace(/-$/, '');
