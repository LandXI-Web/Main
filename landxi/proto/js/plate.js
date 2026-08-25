/* 판(plate) — 흰 종이 위에 뚫린 창 하나.
   지도는 여전히 뷰포트 전체를 그리고, 우리는 clip-path 로 **보이는 사각형만** 바꾼다.
   그래서 궤도 → 구름 돌파 → 전국 → 강하 → 결과가 전부 *한 대의 카메라*로 이어지면서도
   페이지는 처음부터 끝까지 흰 종이다(취향 프로필 §2.2 정정).

   컬러웨이 반전이 사라진 자리를 이 판의 **크기 변화**가 대신한다:
   FIG.01(760×620) → 거의 전폭(구름) → 아틀라스 판 → 풀블리드(강하) → 결과 행. */

const num = (v, d) => { const n = parseFloat(v); return Number.isFinite(n) ? n : d; };

// 이징 하나 — cubic-bezier(0.15, 1, 0.3, 1). CSS 와 같은 곡선을 스크럽에도 쓴다.
function bez(x1, y1, x2, y2) {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const fx = (t) => ((ax * t + bx) * t + cx) * t;
  const dx = (t) => (3 * ax * t + 2 * bx) * t + cx;
  return (x) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 6; i++) {
      const e = fx(t) - x;
      if (Math.abs(e) < 1e-4) break;
      const d = dx(t);
      if (Math.abs(d) < 1e-6) break;
      t -= e / d;
    }
    return ((ay * t + by) * t + cy) * t;
  };
}
export const EASE = bez(0.15, 1, 0.3, 1);

function vars() {
  const cs = getComputedStyle(document.documentElement);
  const g = num(cs.getPropertyValue('--g'), 64);
  const gap = num(cs.getPropertyValue('--gap'), 24);
  return {
    g, gap,
    bar: num(cs.getPropertyValue('--bar'), 72),
    foot: num(cs.getPropertyValue('--foot'), 72),
    // 12컬럼 격자(벤치마크 §2.4). 판의 좌우는 언제나 컬럼 경계에 선다.
    colw: (innerWidth - 2 * g - 11 * gap) / 12,
  };
}
// n 컬럼 + 그 뒤 거터 하나 = 판이 물러나는 거리
const cols = (n, v) => v.g + n * v.colw + n * v.gap;

/* 슬롯 = 뷰포트 가장자리로부터의 인셋 [left, top, right, bottom].
   B안 아틀라스 격자(좌 색인 · 판 · 우 FIG.02)가 그대로 12컬럼 좌표가 된다. */
export function slot(name, rowRect) {
  const v = vars();
  const { g, bar, foot } = v;
  const W = innerWidth, H = innerHeight;
  const narrow = W < 900;
  switch (name) {
    case 'orbit':   // 텍스트 5컬럼 · 판 7컬럼
      return narrow ? [g, bar + 280, g, foot + 40] : [cols(5, v), bar + 96, g, foot + 74];
    case 'atlas':   // 색인 3 · 판 6 · 카드 3
      return narrow ? [g, bar + 40, g, foot + 40] : [cols(3, v), bar + 96, cols(3, v), foot + 74];
    case 'full':
      return [0, bar + 36, 0, foot];
    case 'land':
      return [g, bar + 40, g, foot + (narrow ? 150 : 318)];
    case 'row': {
      const r = rowRect && rowRect();
      if (!r) return slot('land');
      return [r.left, r.top, W - r.right, H - r.bottom];
    }
    default:
      return [0, bar, 0, foot];
  }
}

// p → 슬롯 키프레임. 컬러웨이 반전이 있던 자리마다 판의 크기가 바뀐다.
const KEY = [
  [0.000, 'orbit'],
  [0.155, 'orbit'],
  [0.268, 'full'],    // 성층운 화이트아웃 정점 — 판이 가장 크다
  [0.330, 'atlas'],   // 구름이 걷히면 B안 아틀라스 격자로 앉는다
  [0.520, 'atlas'],
  [0.568, 'full'],    // 강하 — 풀블리드
  [0.782, 'full'],
  [0.818, 'land'],    // 착지 — 큰 판 + 필름스트립
  [0.868, 'land'],
  [0.900, 'row'],     // 결과 아틀라스 — 살아 있는 행에 도킹
  [1.000, 'row'],
];

const lerp = (a, b, t) => a + (b - a) * t;

export function makePlate(stage, frame, rowRect) {
  let cur = [0, 0, 0, 0], curFull = false;
  const fig = frame.querySelector('#plate-fig');
  const sub = frame.querySelector('#plate-sub');

  function rectAt(p) {
    let i = 0;
    while (i < KEY.length - 2 && p > KEY[i + 1][0]) i++;
    const [pa, na] = KEY[i], [pb, nb] = KEY[i + 1];
    const a = slot(na, rowRect), b = slot(nb, rowRect);
    const k = EASE(Math.max(0, Math.min(1, (p - pa) / ((pb - pa) || 1))));
    return [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k), lerp(a[3], b[3], k)];
  }

  function paint(r) {
    cur = r;
    stage.style.clipPath = `inset(${r[1].toFixed(1)}px ${r[2].toFixed(1)}px ${r[3].toFixed(1)}px ${r[0].toFixed(1)}px)`;
    frame.style.left = r[0].toFixed(1) + 'px';
    frame.style.top = r[1].toFixed(1) + 'px';
    frame.style.width = Math.max(0, innerWidth - r[0] - r[2]).toFixed(1) + 'px';
    frame.style.height = Math.max(0, innerHeight - r[1] - r[3]).toFixed(1) + 'px';
    const full = r[0] < 6 && r[2] < 6;
    if (full !== curFull) { curFull = full; frame.classList.toggle('full', full); }
  }

  return {
    /* smooth: 결과 아틀라스에서는 판이 행에서 행으로 옮겨 앉는다. 목표 사각형이 행마다 튀므로
       한 프레임에 순간이동시키지 않고 같은 이징 감각으로 따라붙게 한다(180ms 물리 반응). */
    update(p, smooth) {
      const t = rectAt(p);
      if (!smooth || !cur[2]) return paint(t);
      paint(cur.map((c, i) => (Math.abs(t[i] - c) < 0.4 ? t[i] : lerp(c, t[i], 0.24))));
    },
    to(name) { paint(slot(name, rowRect)); },
    setFig(n, text) {
      if (fig.firstChild.nodeValue !== n) fig.firstChild.nodeValue = n;
      if (sub.textContent !== text) sub.textContent = text;
    },
    /* 지도 패딩 = 판 인셋. 카메라 중심이 판 한가운데에 온다.
       MapLibre 는 edge-insets 에 NaN 이나 뷰포트를 넘는 값이 들어오면 예외를 던진다 —
       리사이즈·레이아웃 직전 프레임에 그런 값이 잠깐 생길 수 있으므로 여기서 잠근다. */
    padding() {
      const W = innerWidth, H = innerHeight;
      const fx = (n, max) => (Number.isFinite(n) ? Math.max(0, Math.min(max, Math.round(n))) : 0);
      return {
        left: fx(cur[0], W * 0.48), top: fx(cur[1], H * 0.48),
        right: fx(cur[2], W * 0.48), bottom: fx(cur[3], H * 0.48),
      };
    },
    inside(x, y) {
      return x >= cur[0] && x <= innerWidth - cur[2] && y >= cur[1] && y <= innerHeight - cur[3];
    },
    get rect() { return cur.slice(); },
  };
}
