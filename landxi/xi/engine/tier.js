/* tier.js — 이 브라우저가 어느 GPU 로 그리는가 + 프레임 시간 계측(T1/T2 판정 · perf 봉투).
   창 셋(2차 판정): ① 부팅 창 = 첫 60프레임(글로브·위성 타일 적재 중 · '부팅 계측' 꼬리표로 기록만 · 판정에 쓰지 않음)
   ② 정상 창 = 첫 idle 뒤 60프레임 → 판정 1 ③④ 재판정 2회(각 60프레임 · 2.4 s 간격) — 세 창 중 둘 이상 p95 ≤ 20 ms 이고 소프트웨어 렌더러가 아니면 T1.
   T1 → maxPitch 60 · 지형 허용 / T2 → maxPitch 45. 표기는 최근 창(마지막 60프레임) p95 로 2.4 s 마다 갱신. 결과는 봉투(basis measured · 이 탭). */
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

/** 판정 — judgeTier(perf, { idle: Promise }) → Promise<{tier, p95, gpu, env, boot, windows}>(정상 창 판정 1 뒤 resolve) ·
    onUpdate(t) 는 재판정·최근 창 갱신 때마다 */
export function judgeTier(perf, { idle = Promise.resolve(), onUpdate } = {}) {
  const gpu = gpuInfo();
  const soft = /swiftshader|llvmpipe|software|basic render/i.test(gpu.renderer || '');
  const rnd = gpu.renderer ? gpu.renderer.slice(0, 80) : 'renderer 미공개';
  const frames = (n) => new Promise((res) => { const from = perf.all.length; const f = () => (perf.all.length - from >= n ? res(perf.all.slice(from, from + n)) : requestAnimationFrame(f)); f(); });
  const first60 = () => new Promise((res) => { const f = () => (perf.first60.length >= 60 ? res(perf.first60) : requestAnimationFrame(f)); f(); });
  const T = { gpu, soft, windows: [], boot: null, tier: null };
  const decide = () => {
    const ok = T.windows.filter((w) => w.p95 <= 20).length;
    return !soft && ok * 2 > T.windows.length ? 'T1' : 'T2';
  };
  const out = (why) => {
    const last = perf.window.slice(-60), p95 = q(last, 0.95) ?? T.windows.at(-1)?.p95;
    const t = { tier: T.tier, p95, gpu, soft, maxPitch: T.tier === 'T1' ? 60 : 45, boot: T.boot, windows: T.windows.map((w) => ({ ...w })), why,
      env: env(+(+p95).toFixed(1), 'ms', 'measured', `rAF 최근 60프레임 p95 · 이 탭 · 판정 ${T.windows.map((w) => w.p95.toFixed(1)).join('/')} ms(정상 창 ${T.windows.length})`, rnd),
      bootEnv: T.boot ? env(+T.boot.p95.toFixed(1), 'ms', 'measured', 'rAF 첫 60프레임 p95 · 부팅 계측(글로브·타일 적재 중 · 판정에 쓰지 않음)', rnd) : null };
    onUpdate?.(t);
    return t;
  };
  return (async () => {
    const b = await first60(); T.boot = { n: b.length, p95: q(b, 0.95) };
    await idle;
    const w1 = await frames(60); T.windows.push({ at: 'idle+60', p95: q(w1, 0.95) }); T.tier = decide();
    const first = out('정상 창 1');
    (async () => {
      for (const k of [2, 3]) { await new Promise((r) => setTimeout(r, 2400)); const w = await frames(60); T.windows.push({ at: `재판정 ${k - 1}`, p95: q(w, 0.95) }); T.tier = decide(); out(`재판정 ${k - 1}`); }
      // 이후 표기는 최근 창으로 2.4 s 마다(판정은 고정)
      setInterval(() => { if (perf.window.length >= 60) out('최근 창'); }, 2400);
    })();
    return first;
  })();
}
