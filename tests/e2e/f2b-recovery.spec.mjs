// F2-B v1.1-15 재부팅 복구 실증(실프로세스) — 황등 378 shard 제출 → 40% 지점에서 gpu_worker kill → 게이트웨이 재기동(start-landxi -Restart gateway)
// → job.recovered{mode:'resumed'} → 나머지 shard 완료 → counts 가 무중단 실행과 같다(±0) · /health.recovered_at_boot · GET /jobs recovered 칩. LX_API=on 전용 · GPU0 한 장.
import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const API = process.env.LX_API === 'on' ? (process.env.LX_API_BASE || 'http://127.0.0.1:8700') : null;
const PW = process.env.DEV_PASSWORD || 'landxi-dev-2026';
test.skip(!API, 'LX_API=on 전용(게이트웨이 :8700 · 워커 · 실프로세스 kill)');

const START = path.resolve('server/start-landxi.ps1');
const AOI = { type: 'Polygon', coordinates: [[[126.9467, 35.9956], [126.9495, 35.9956], [126.9495, 35.9975], [126.9467, 35.9975], [126.9467, 35.9956]]] };
const BODY = { kind: 'infer', model_id: 'car_v2_obb', imagery_id: 'axis-iksan-hwangdeung', aoi: AOI, options: { chip: 1024, overlap: 0.125, conf: 0.25 }, demo: false, priority: 0 };

const ps = (cmd) => execFileSync('powershell', ['-NoProfile', '-Command', cmd], { encoding: 'utf8', windowsHide: true }).trim();
const gpuWorkerPid = () => +ps("(Get-CimInstance Win32_Process -Filter \"Name='python.exe'\" | Where-Object { $_.CommandLine -match 'gpu_worker\\.py --gpu 0' } | Select-Object -First 1).ProcessId");

async function events(url, { from = null, until = [], onEvent = null, timeoutMs = 120000 } = {}) {
  const ctl = new AbortController(); const tm = setTimeout(() => ctl.abort(), timeoutMs);
  const out = []; let last = from;
  try {
    const res = await fetch(url, { headers: { accept: 'text/event-stream', ...(from ? { 'last-event-id': from } : {}) }, signal: ctl.signal });
    const rd = res.body.getReader(); const dec = new TextDecoder(); let buf = '';
    for (;;) {
      const { value, done } = await rd.read(); if (done) break;
      buf += dec.decode(value, { stream: true }); let k;
      while ((k = buf.indexOf('\n\n')) >= 0 || (k = buf.indexOf('\r\n\r\n')) >= 0) {
        const block = buf.slice(0, k); buf = buf.slice(k + (buf[k] === '\r' ? 4 : 2));
        const ev = {}; for (const ln of block.split(/\r?\n/)) { const m = ln.match(/^(event|id|data):\s?(.*)$/); if (m) ev[m[1]] = m[2]; }
        if (!ev.event) continue; ev.data = JSON.parse(ev.data || '{}'); last = ev.id || last; out.push(ev);
        if (onEvent && (await onEvent(ev)) === 'stop') { rd.cancel().catch(() => {}); return { out, last }; }
        if (until.includes(ev.event)) { rd.cancel().catch(() => {}); return { out, last }; }
      }
    }
  } catch (e) { if (e.name !== 'AbortError' && !/terminated|ECONNRESET|socket/i.test(String(e))) throw e; }
  finally { clearTimeout(tm); }
  return { out, last };
}

test('워커 kill → 게이트웨이 재기동 → job.recovered resumed → 완료 counts 동일', async ({ request }) => {
  test.setTimeout(420000);
  const tok = (await (await request.post(API + '/api/v1/auth/login', { data: { realm: 'lx', login: 'lx-staff', password: PW } })).json()).token;
  const h = { authorization: 'Bearer ' + tok };
  // 기준: 무중단 실행 counts(같은 AOI · 같은 모델 — 직전 완료 작업이 있으면 그 값, 없으면 새로 한 번)
  const prev = (await (await request.get(API + '/api/v1/jobs?state=done&limit=200', { headers: h })).json()).items
    .find((j) => j.model_id === 'car_v2_obb' && j.shards_total === 378 && !j.recovered && JSON.stringify(j.aoi.coordinates) === JSON.stringify(AOI.coordinates));
  const baseline = prev ? prev.counts : null;
  const id = (await (await request.post(API + '/api/v1/jobs', { headers: h, data: { ...BODY, label: 'e2e f2b-recovery' } })).json()).job.id;
  const url = `${API}/api/v1/events/jobs/${id}?access_token=${tok}`;
  let killedAt = null;
  const a = await events(url, { onEvent: async (ev) => {
    if (ev.event === 'job.progress' && ev.data.shards_done >= 0.4 * ev.data.shards_total && !killedAt) {
      const pid = gpuWorkerPid(); ps(`Stop-Process -Id ${pid} -Force`); killedAt = ev.data.shards_done;
      console.log(JSON.stringify({ kill: pid, at_progress: killedAt }));
      return 'stop';
    }
  } });
  expect(killedAt).not.toBeNull();
  await new Promise((r) => setTimeout(r, 1500));
  // 게이트웨이 재기동(lifespan → recovery.sweep) + 빠진 gpu 워커 기동 — 자식이 파이프를 물지 않게 stdio ignore
  execFileSync('powershell', ['-NoProfile', '-File', START, '-Restart', 'gateway'], { stdio: 'ignore', windowsHide: true, timeout: 180000 });
  const health = await (await request.get(API + '/api/v1/health')).json();
  console.log(JSON.stringify({ recovered_at_boot: health.recovered_at_boot }));
  const rec = health.recovered_at_boot.jobs.find((x) => x.job_id === id);
  expect(rec && rec.mode).toBe('resumed');
  expect(rec.shards_done).toBeGreaterThanOrEqual(killedAt);
  const b = await events(url, { from: a.last, until: ['snapshot.ready', 'job.failed'], timeoutMs: 240000 });
  const names = b.out.map((e) => e.event);
  const recEv = b.out.find((e) => e.event === 'job.recovered');
  expect(recEv.data.mode).toBe('resumed'); expect(recEv.data.reason).toMatch(/heartbeat 0/);
  // F2-B 1차 판정 불합격 4: 게이트웨이 lifespan sweep 뒤 scheduler.restore sweep 이 다시 돌아도 같은 resume_seq 로 두 번 알리지 않는다
  const recAll = b.out.filter((e) => e.event === 'job.recovered');
  console.log(JSON.stringify({ job_recovered_count: recAll.length, resume_seq: recAll.map((e) => e.data.resume_seq), at: recAll.map((e) => e.data.at) }));
  expect(recAll.length).toBe(1);
  expect(names).toContain('job.done');
  const done = b.out.find((e) => e.event === 'job.done').data;
  const j = await (await request.get(API + '/api/v1/jobs/' + id, { headers: h })).json();
  console.log(JSON.stringify({ id, recovered: j.recovered, counts: j.counts, baseline, done_shards: done.shards_done }));
  expect(j.state).toBe('done'); expect(j.shards_done).toBe(378); expect(j.shards_failed).toBe(0);
  expect(j.recovered.mode).toBe('resumed'); expect(j.recovered.chip).toMatch(/^복구 · 재개 \d+\/378$/);
  if (baseline) expect(j.counts).toEqual(baseline);
});
