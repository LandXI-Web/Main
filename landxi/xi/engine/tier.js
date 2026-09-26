/* tier.js — 이 브라우저가 어느 GPU 로 그리는가 + 프레임 시간 계측(T1/T2 판정 · perf 봉투).
   T1: 첫 60프레임 p95 ≤ 20ms 이고 소프트웨어 렌더러가 아님 → maxPitch 60 · 지형 허용.
   T2: 그 밖 → maxPitch 45 · 지형 장면 금지. 결과는 봉투로(basis measured · 이 탭에서 잰 값). */
import { env } from '../../shared/api-v1.js';

export function gpuInfo() {
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2') || c.getContext('webgl');
    if (!gl) return { vendor: null, renderer: null, webgl: 0 };
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const out = {
      vendor: ext ? gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR),
      renderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
      webgl: typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext ? 2 : 1,
    };
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return out;
  } catch { return { vendor: null, renderer: null, webgl: 0 }; }
}

const q = (arr, p) => { if (!arr.length) return null; const s = [...arr].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * (s.length - 1)))]; };

/** 프레임 시간 표본기 — rAF 간격(ms). 계측만 하고 그리지 않는다. */
export function createPerf() {
  const P = { all: [], window: [], mark: 0, running: false, first60: [] };
  let last = 0;
  const tick = (t) => {
    if (!P.running) return;
    if (last) {
      const dt = t - last;
      if (dt < 1000) {               // 탭 숨김 등 긴 공백은 뺀다
        P.window.push(dt); if (P.window.length > 600) P.window.shift();
        if (P.first60.length < 60) P.first60.push(dt);
        P.all.push(dt); if (P.all.length > 20000) P.all.shift();
      }
    }
    last = t; requestAnimationFrame(tick);
  };
  P.start = () => { if (P.running) return; P.running = true; last = 0; requestAnimationFrame(tick); };
  P.reset = () => { P.window.length = 0; };
  P.stats = (arr = P.window) => ({ n: arr.length, p50: q(arr, 0.5), p95: q(arr, 0.95), max: arr.length ? Math.max(...arr) : null });
  /** 구간 계측: const end = perf.span(); ...; end() → {n, p95} */
  P.span = () => { const from = P.all.length; return () => P.stats(P.all.slice(from)); };
  return P;
}

/** 첫 60프레임 뒤 T1/T2 판정 — Promise<{tier, p95, gpu, env}> */
export function judgeTier(perf) {
  const gpu = gpuInfo();
  return new Promise((res) => {
    const wait = () => {
      if (perf.first60.length < 60) return requestAnimationFrame(wait);
      const p95 = q(perf.first60, 0.95);
      const soft = /swiftshader|llvmpipe|software|basic render/i.test(gpu.renderer || '');
      const tier = !soft && p95 <= 20 ? 'T1' : 'T2';
      res({ tier, p95, gpu, maxPitch: tier === 'T1' ? 60 : 45,
        env: env(+p95.toFixed(1), 'ms', 'measured', 'rAF 첫 60프레임 p95 · 이 탭', gpu.renderer ? gpu.renderer.slice(0, 80) : 'renderer 미공개') });
    };
    wait();
  });
}
