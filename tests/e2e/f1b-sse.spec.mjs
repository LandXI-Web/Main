// F1-B SSE — 이벤트 순서 job.queued → job.started → shard.* → job.done → snapshot.ready · Last-Event-ID 재개 · 첫 shard.done ≤ 5s[목표 · 실측 기록]
import { test, expect } from '@playwright/test';

const API = process.env.LX_API === 'on' ? (process.env.LX_API_BASE || 'http://localhost:8700') : null;
const PW = process.env.DEV_PASSWORD || 'landxi-dev-2026';
test.skip(!API, 'LX_API=on 전용(게이트웨이 :8700 · 워커)');

const AOI = { type: 'Polygon', coordinates: [[[126.9480, 35.9960], [126.9492, 35.9960], [126.9492, 35.9969], [126.9480, 35.9969], [126.9480, 35.9960]]] };

/** SSE 를 fetch 스트림으로 읽는다 → [{event, id, data, t}] · stopAt 이벤트 또는 max 개에서 끊는다 */
async function readSse(url, { headers = {}, stopAt = 'snapshot.ready', max = 1e9, t0 = Date.now() } = {}) {
  const res = await fetch(url, { headers: { accept: 'text/event-stream', ...headers } });
  expect(res.status).toBe(200);
  expect(res.headers.get('x-accel-buffering')).toBe('no');
  const dec = new TextDecoder(); const out = []; let buf = '';
  const rd = res.body.getReader();
  const ctl = { abort: () => { rd.cancel().catch(() => {}); } };
  for (;;) {
    const { value: chunk, done } = await rd.read();
    if (done) break;
    buf += dec.decode(chunk, { stream: true });
    let k;
    while ((k = buf.indexOf('\n\n')) >= 0 || (k = buf.indexOf('\r\n\r\n')) >= 0) {
      const block = buf.slice(0, k); buf = buf.slice(k + (buf[k] === '\r' ? 4 : 2));
      const ev = {}; for (const ln of block.split(/\r?\n/)) { const m = ln.match(/^(event|id|data):\s?(.*)$/); if (m) ev[m[1]] = m[2]; }
      if (!ev.event) continue;
      ev.t = Date.now() - t0; out.push(ev);
      if (ev.event === stopAt || out.length >= max) { ctl.abort(); return out; }
    }
  }
  return out;
}

test('순서 · 재개(Last-Event-ID) · 첫 shard.done 실측', async ({ request }) => {
  test.setTimeout(180000);
  const tok = (await (await request.post(API + '/api/v1/auth/login', { data: { realm: 'lx', login: 'test@lx.or.kr', password: PW } })).json()).token;
  const h = { authorization: 'Bearer ' + tok };
  const t0 = Date.now();
  const sub = await request.post(API + '/api/v1/jobs', { headers: h, data: { kind: 'infer', model_id: 'car_v2_obb', imagery_id: 'axis-iksan-hwangdeung', aoi: AOI, options: { chip: 1024, overlap: 0.125, conf: 0.25 }, demo: false, priority: 0 } });
  const id = (await sub.json()).job.id;
  const url = `${API}/api/v1/events/jobs/${id}?access_token=${tok}`;
  // 1) 앞 5개만 받고 끊는다
  const head = await readSse(url, { max: 5, t0 });
  expect(head[0].event).toBe('job.queued');
  // 2) 마지막 id 로 이어 받는다 — 중복 · 누락 없이
  const rest = await readSse(url, { headers: { 'last-event-id': head[head.length - 1].id }, t0 });
  const all = [...head, ...rest];
  const ids = all.map((e) => e.id);
  expect(new Set(ids).size).toBe(ids.length);
  const names = all.map((e) => e.event);
  const pos = (n) => names.indexOf(n);
  expect(pos('job.queued')).toBe(0);
  expect(pos('job.started')).toBeGreaterThan(pos('job.queued'));
  expect(pos('shard.done')).toBeGreaterThan(pos('job.started'));
  expect(names.lastIndexOf('shard.done')).toBeLessThan(pos('job.done'));
  expect(pos('snapshot.ready')).toBeGreaterThan(pos('job.done'));
  const firstDone = all.find((e) => e.event === 'shard.done');
  console.log(JSON.stringify({ id, events: all.length, first_shard_done_ms: firstDone.t, end_ms: all[all.length - 1].t, basis: 'measured' }));
  expect(firstDone.t).toBeLessThan(15000);   // 목표 ≤ 5s — 실측은 결과 문서에 기록(여기선 여유 있게)
  const done = JSON.parse(all.find((e) => e.event === 'job.done').data);
  expect(done.counts_env.basis).toBe('inferred');   // AI 추론 · 검수 전(계약 §0)
  // v1.1-5·6·7·8: 창 짧음 규칙 · 마지막 progress 1회(n/n) · job.done 두 줄 = GET /jobs/{id}
  const prog = all.filter((e) => e.event === 'job.progress').map((e) => JSON.parse(e.data));
  for (const p of prog) if (p.shards_done < 8) { expect(p.chips_per_s.value).toBeNull(); expect(p.chips_per_s.note).toBe('창 짧음'); }
  expect(prog.filter((p) => p.shards_done === p.shards_total).length).toBe(1);
  expect(prog[prog.length - 1].shards_done).toBe(prog[prog.length - 1].shards_total);
  const g0 = prog[prog.length - 1].gpu.find((g) => g.index === 0);
  expect(g0.shared).toBe(true); expect(typeof g0.power_w).toBe('number');
  const j = await (await request.get(API + '/api/v1/jobs/' + id, { headers: h })).json();
  expect(j.chips_per_gpu_s.value).toBe(done.chips_per_gpu_s.value);
  expect(j.chips_per_wall_s.value).toBe(done.chips_per_wall_s.value);
  expect(j.elapsed_s.value).toBe(done.elapsed_s);
});

test('/events/ops — 관리자 · 폴러 스트림 tail(gpu.sample · queue.sample)', async ({ request }) => {
  test.setTimeout(60000);
  const tok = (await (await request.post(API + '/api/v1/auth/login', { data: { realm: 'lx', login: 'lxadmin@lx.or.kr', password: PW } })).json()).token;
  const evs = await readSse(`${API}/api/v1/events/ops?access_token=${tok}`, { max: 3, stopAt: '__never__' });
  const names = new Set(evs.map((e) => e.event));
  expect(names.has('gpu.sample') || names.has('queue.sample')).toBeTruthy();
});
