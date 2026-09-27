/* 텔레메트리 — on: sse('/events/ops') · off: replay(data/replay/ops-sample.ndjson).
 * 값이 바뀐 필드만 알린다(diff). 2s 창 · 샘플이 3s 넘게 없으면 stale(링 테두리 슬레이트 + '수신 없음 n s'). */
import { sse, replay, OPS_EVENTS } from '/landxi/shared/api-v1.js';
import { SRC } from './boot.js';

const GPU_KEYS = ['util_pct', 'util_ma5', 'util_ma10', 'mem_used_mib', 'mem_total_mib', 'temp_c', 'power_w', 'external_used_mib', 'unattributed_mib'];
/* v1.1 이벤트(게이트웨이 ops 스트림 · 브리지 중계): 실태조사 상태(F2-S) · 재부팅 복구(F2-B) */
export const OPS_EVENTS_V11 = [...OPS_EVENTS, 'finding.state', 'job.recovered'];
/** 화면의 대표 이용률 = 10 s 추세(util_ma10 · F1-CONTRACT v1.1-28 계약 요청 1 결정 (a)) — 없으면 2.5 s 이동평균 → 순간값(구 폴러 · 리플레이).
 *  2.5 s(util_ma5)는 '반응' 보조 숫자 · 전력 예산 판정(고부하)에만 쓴다(reactOf). */
export const utilOf = (g) => (g?.util_ma10 && g.util_ma10.value != null ? g.util_ma10 : g?.util_ma5 && g.util_ma5.value != null ? g.util_ma5 : g?.util_pct);
export const reactOf = (g) => (g?.util_ma5 && g.util_ma5.value != null ? g.util_ma5 : g?.util_pct);
export const STALE_MS = 3000;

export function connect({ onGpu, onQueue, onUsage, onDeploy, onAlert, onJob, onState, onFinding, onRecovered } = {}) {
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
        if (!p || p.caution !== g.caution || p.fault !== g.fault) ch.add('state');
        if (!p || JSON.stringify(p.worker_vram) !== JSON.stringify(g.worker_vram)) ch.add('worker_vram');
        if (!p || JSON.stringify(p.external) !== JSON.stringify(g.external)) ch.add('external');
        changed.set(g.index, ch);
        const hs = hist.get(g.index) || []; hs.push({ t: Date.parse(d.at) || Date.now(), v: utilOf(g)?.value ?? null, w: g.power_w?.value ?? null }); while (hs.length > 30) hs.shift(); hist.set(g.index, hs);
      }
      prev = d; onGpu && onGpu(d, changed, hist);
    } else if (name === 'queue.sample') onQueue && onQueue(d);
    else if (name === 'usage.delta') onUsage && onUsage(d);
    else if (name === 'deploy.changed') onDeploy && onDeploy(d);
    else if (name === 'alert') onAlert && onAlert(d);
    else if (name === 'job.state') { onJob && onJob(d); if (d.reason === 'recovered') onRecovered && onRecovered(d); }
    else if (name === 'job.recovered') onRecovered && onRecovered(d);
    else if (name === 'finding.state') onFinding && onFinding(d);
  };
  const start = () => {
    if (closed) return;
    if (SRC.kind === 'off') {
      stream = replay('/landxi/ops/data/replay/ops-sample.ndjson', { on: handle, onState: (s) => { onState && onState(s); if (s === 'ended') setTimeout(start, 2000); } });
    } else {
      stream = sse('/events/ops', { on: handle, events: OPS_EVENTS_V11, onState });
    }
  };
  start();
  const timer = setInterval(() => { const age = last ? Date.now() - last : Infinity; onState && onState(age > STALE_MS ? 'stale' : 'live', age); }, 1000);
  return { close() { closed = true; clearInterval(timer); stream && stream.close(); }, get last() { return last; }, hist, get prev() { return prev; } };
}
