/* 흰 비율 계측기(전 화면) — map-base 작업(p0926)의 증명 도구.
 * 지도 A 가 그린 프레임마다(render 사건 · 같은 프레임의 드로잉 버퍼 readPixels) 화면 전체에서
 *   · 흰(white)  = R,G,B 모두 > 235 — 영상이 없어 흰 바탕이 드러난 자리
 *   · 빈(void)   = 배경색(#0A1018 ± 6) 그대로 — 흰색만 피한 '검은 허공'도 같이 센다(정직 계측)
 * 판(HUD · 띠 · 세그먼트)이 가린 자리만 뺀다. 이전 계측기(원천 커버리지 안만)와 달리 원천 밖도 센다.
 * phases: 세는 단계(__spike.state().phase). 기록 = window.__whiteAll: [zoom, 표본 수, 흰 비율, 빈 비율, phase]
 * 사용: import { installFullMeter, summarize } from './_white-meter.mjs'
 */
export const installFullMeter = (page, phases = ['dive', 'lock']) => page.evaluate((phases) => {
  const m = window.__spike.map, canvas = m.getCanvas(), cr = canvas.getBoundingClientRect();
  const plates = [...document.querySelectorAll('.spk-plate')].filter((e) => e.offsetParent).map((e) => { const r = e.getBoundingClientRect(); return [r.left - cr.left - 2, r.top - cr.top - 2, r.right - cr.left + 2, r.bottom - cr.top + 2]; });
  const gl = m.painter.context.gl, W = gl.drawingBufferWidth, H = gl.drawingBufferHeight, k = W / cr.width, buf = new Uint8Array(W * H * 4);
  window.__whiteAll = [];
  m.on('render', () => {
    const ph = window.__spike.state().phase;
    if (!phases.includes(ph)) return;
    gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    let c = 0, w = 0, v = 0;
    for (let y = 4; y < cr.height - 1; y += 8) for (let x = 4; x < cr.width - 1; x += 8) {
      if (plates.some((p) => x >= p[0] && x <= p[2] && y >= p[1] && y <= p[3])) continue;
      c++;
      const i = ((H - 1 - Math.floor(y * k)) * W + Math.floor(x * k)) * 4, r = buf[i], g = buf[i + 1], b = buf[i + 2];
      if (r > 235 && g > 235 && b > 235) w++;
      else if (Math.abs(r - 10) <= 6 && Math.abs(g - 16) <= 6 && Math.abs(b - 24) <= 6) v++;
    }
    window.__whiteAll.push([+m.getZoom().toFixed(2), c, c ? +(w / c).toFixed(4) : 0, c ? +(v / c).toFixed(4) : 0, ph]);
  });
  return true;
}, phases);

/** 줌 구간별 최대 · 평균 흰 비율(+빈 비율) */
export function summarize(rows, bands = [[11, 12], [12, 13], [13, 14], [14, 15], [15, 16], [16, 17], [17, 18.5]]) {
  const out = bands.map(([a, b]) => {
    const r = rows.filter((x) => x[0] >= a && x[0] < b);
    if (!r.length) return { band: `z${a}–${b}`, n: 0 };
    const mx = (k) => Math.max(...r.map((x) => x[k])), av = (k) => r.reduce((s, x) => s + x[k], 0) / r.length;
    return { band: `z${a}–${b}`, n: r.length, whiteMax: +mx(2).toFixed(4), whiteAvg: +av(2).toFixed(4), voidMax: +mx(3).toFixed(4), gapMax: +Math.max(...r.map((x) => x[2] + x[3])).toFixed(4) };
  });
  const all = rows.length ? Math.max(...rows.map((x) => x[2] + x[3])) : 0;
  return { frames: rows.length, gapMaxAll: +all.toFixed(4), bands: out };
}
