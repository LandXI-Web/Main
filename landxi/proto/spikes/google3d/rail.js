// Land-XI SPIKE — 스크롤 카메라 레일 · 구름 · 탐지 결과 드레이프 (Cesium + Google Photorealistic 3D Tiles)
// 키는 소스에 두지 않는다. ?key= → localStorage.GOOGLE_MAPS_KEY → window.GOOGLE_MAPS_KEY 순으로 읽는다.
export const KEY = (() => {
  const q = new URL(location.href).searchParams.get('key');
  if (q) { try { localStorage.setItem('GOOGLE_MAPS_KEY', q); } catch {} return q; }
  try { const s = localStorage.getItem('GOOGLE_MAPS_KEY'); if (s) return s; } catch {}
  return window.GOOGLE_MAPS_KEY || '';
})();

// 국내 5개 지점 — 남원이 기본, 서울은 대조군(코엑스: 커버리지 논쟁의 현장)
export const PLACES = {
  namwon: { name: '남원',  lon: 127.3900, lat: 35.4100, label: '남원 · 비닐하우스/농지 탐지',
            // 근접 앵커 = 실제 탐지가 가장 빽빽한 금동 일대 하우스 단지
            zlon: 127.3065, zlat: 35.3165,
            data: ['namwon-greenhouse-2025', 'namwon-farmland-2025'] },
  yeosu:  { name: '여수',  lon: 127.6800, lat: 34.6000, label: '여수 · 해안 쓰레기 탐지',
            zlon: 127.6760, zlat: 34.5904,
            data: ['yeosu-marine-2026-drone-grid100'] },
  jeju:   { name: '제주',  lon: 126.5312, lat: 33.4996, label: '제주 · 대조군', data: [] },
  jeonju: { name: '전주',  lon: 127.1480, lat: 35.8242, label: '전주 · 도심 대조군', data: [] },
  seoul:  { name: '서울(코엑스)', lon: 127.0587, lat: 37.5126, label: '서울 · 최고 밀도 대조군', data: [] },
};

// 스크롤 0→1 카메라 레일. 지구 → 대륙 → 국토 → 마을 → 거리.
export const RAIL = [
  { t: 0.00, h: 14000000, pitch: -90, heading:   0, name: '지구' },
  { t: 0.18, h:  3200000, pitch: -72, heading:  25, name: '대륙' },
  { t: 0.38, h:   420000, pitch: -58, heading:  50, name: '국토' },
  { t: 0.58, h:    28000, pitch: -46, heading:  80, name: '지역' },
  { t: 0.76, h:     3000, pitch: -38, heading: 130, name: '마을' },
  { t: 0.90, h:      520, pitch: -24, heading: 190, name: '거리' },
  { t: 1.00, h:      320, pitch: -16, heading: 300, name: '거리 궤도' },
];

const lerp = (a, b, u) => a + (b - a) * u;
const easeInOut = (u) => u < 0.5 ? 4*u*u*u : 1 - Math.pow(-2*u + 2, 3) / 2;

// 고도는 로그 보간해야 지구→거리 구간이 균일하게 느껴진다(선형이면 마지막 5%에서 전부 일어난다).
export function railAt(p) {
  const t = Math.max(0, Math.min(1, p));
  let i = 0; while (i < RAIL.length - 2 && t > RAIL[i + 1].t) i++;
  const a = RAIL[i], b = RAIL[i + 1];
  const u = easeInOut((t - a.t) / (b.t - a.t || 1));
  return {
    h: Math.exp(lerp(Math.log(a.h), Math.log(b.h), u)),
    pitch: lerp(a.pitch, b.pitch, u),
    heading: lerp(a.heading, b.heading, u),
    stage: u < 0.5 ? a.name : b.name,
    // 넓은 앵커(군 중심) → 근접 앵커(탐지 밀집지)로 스르르 옮겨탄다
    aim: Math.max(0, Math.min(1, (t - 0.50) / 0.26)),
  };
}

// 구름 스프라이트 한 장 — 가장자리가 완전히 사라지는 부드러운 퍼프
export function cloudSprite() {
  const S = 256;
  const c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d');
  // 뭉게구름 덩어리 몇 개 — 캔버스 가운데 60% 안에만 둔다(가장자리 잘림 방지)
  for (let k = 0; k < 7; k++) {
    const x = S * (0.3 + Math.random() * 0.4);
    const y = S * (0.38 + Math.random() * 0.26);
    const r = S * (0.10 + Math.random() * 0.14);
    const rg = g.createRadialGradient(x, y, 0, x, y, r);
    rg.addColorStop(0.0, 'rgba(255,255,255,0.85)');
    rg.addColorStop(0.45, 'rgba(255,255,255,0.34)');
    rg.addColorStop(1.0, 'rgba(255,255,255,0)');
    g.fillStyle = rg; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
  }
  // 원형 마스크 — 사각 경계가 절대 보이지 않게 알파를 0 으로 떨군다
  g.globalCompositeOperation = 'destination-in';
  const m = g.createRadialGradient(S / 2, S / 2, S * 0.16, S / 2, S / 2, S * 0.5);
  m.addColorStop(0, 'rgba(0,0,0,1)');
  m.addColorStop(0.78, 'rgba(0,0,0,0.75)');
  m.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = m; g.fillRect(0, 0, S, S);
  return c.toDataURL('image/png');
}
