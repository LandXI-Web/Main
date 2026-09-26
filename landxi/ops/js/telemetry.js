/* 텔레메트리 — on: sse('/events/ops') · off: replay(data/replay/ops-sample.ndjson).
 * 값이 바뀐 필드만 알린다(diff). 2s 창 · 샘플이 3s 넘게 없으면 stale(링 테두리 슬레이트 + '수신 없음 n s'). */
import { sse, replay, OPS_EVENTS } from '/landxi/shared/api-v1.js';
import { SRC } from './boot.js';

const GPU_KEYS = ['util_pct', 'mem_used_mib', 'mem_total_mib', 'temp_c', 'power_w', 'external_used_mib'];
export const STALE_MS = 3000;

export function connect({ onGpu, onQueue, onUsage, onDeploy, onAlert, onJob, onState } = {}) {
  let last = 0; let prev = null; let closed = false; let stream = null; const hist = new Map();   // idx → [{t, v}]
  const handle = (name, d) => {
    if (!d) return;
    if (name === 'gpu.sample') {
      last = Date.now();
      const changed = new Map();
      for (const g of d.gpus || []) {
        const p = prev?.gpus?.find((x) => x.index === g.index);
        const ch = new Set();
        for (const k of GPU_KEYS) if (!p || p[k]?.value !== g[k]?.value) ch.add(k);
        if (!p || (p.job_id !== g.job_id)) ch.add('job_id');
        if (!p || JSON.stringify(p.worker_vram) !== JSON.stringify(g.worker_vram)) ch.add('worker_vram');
        if (!p || JSON.stringify(p.external) !== JSON.stringify(g.external)) ch.add('external');
        changed.set(g.index, ch);
        const hs = hist.get(g.index) || []; hs.push({ t: Date.parse(d.at) || Date.now(), v: g.util_pct?.value ?? null }); while (hs.length > 30) hs.shift(); hist.set(g.index, hs);
      }
      prev = d; onGpu && onGpu(d, changed, hist);
    } else if (name === 'queue.sample') onQueue && onQueue(d);
    else if (name === 'usage.delta') onUsage && onUsage(d);
    else if (name === 'deploy.changed') onDeploy && onDeploy(d);
    else if (name === 'alert') onAlert && onAlert(d);
    else if (name === 'job.state') onJob && onJob(d);
  };
  const start = () => {
    if (closed) return;
    if (SRC.kind === 'off') {
      stream = replay('/landxi/ops/data/replay/ops-sample.ndjson', { on: handle, onState: (s) => { onState && onState(s); if (s === 'ended') setTimeout(start, 2000); } });
    } else {
      stream = sse('/events/ops', { on: handle, events: OPS_EVENTS, onState });
    }
  };
  start();
  const timer = setInterval(() => { const age = last ? Date.now() - last : Infinity; onState && onState(age > STALE_MS ? 'stale' : 'live', age); }, 1000);
  return { close() { closed = true; clearInterval(timer); stream && stream.close(); }, get last() { return last; }, hist, get prev() { return prev; } };
}
