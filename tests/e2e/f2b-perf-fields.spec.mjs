// F2-B v1.1-5·6·7 — 황등 378 shard 실행: SSE job.progress(이동평균 util · W · 창 짧음) → job.done 두 줄 = GET /jobs/{id} = XI맵 HUD(?job= 복원) 두 줄.
// LX_API=on 전용 · GPU0 한 장. HUD 는 F2-A(landxi/xi) 화면을 읽기만 한다.
import { test, expect } from '@playwright/test';

const API = process.env.LX_API === 'on' ? (process.env.LX_API_BASE || 'http://127.0.0.1:8700') : null;
const PW = process.env.DEV_PASSWORD || 'landxi-dev-2026';
test.skip(!API, 'LX_API=on 전용');

const AOI = { type: 'Polygon', coordinates: [[[126.9467, 35.9956], [126.9495, 35.9956], [126.9495, 35.9975], [126.9467, 35.9975], [126.9467, 35.9956]]] };
const BODY = { kind: 'infer', model_id: 'car_v2_obb', imagery_id: 'axis-iksan-hwangdeung', aoi: AOI, options: { chip: 1024, overlap: 0.125, conf: 0.25 }, demo: false, priority: 0 };

async function readAll(url) {
  const res = await fetch(url, { headers: { accept: 'text/event-stream' } });
  const rd = res.body.getReader(); const dec = new TextDecoder(); let buf = ''; const out = [];
  for (;;) {
    const { value, done } = await rd.read(); if (done) break;
    buf += dec.decode(value, { stream: true }); let k;
    while ((k = buf.indexOf('\n\n')) >= 0 || (k = buf.indexOf('\r\n\r\n')) >= 0) {
      const block = buf.slice(0, k); buf = buf.slice(k + (buf[k] === '\r' ? 4 : 2));
      const ev = {}; for (const ln of block.split(/\r?\n/)) { const m = ln.match(/^(event|id|data):\s?(.*)$/); if (m) ev[m[1]] = m[2]; }
      if (!ev.event) continue; ev.data = JSON.parse(ev.data || '{}'); out.push(ev);
      if (ev.event === 'snapshot.ready' || ev.event === 'job.failed') { rd.cancel().catch(() => {}); return out; }
    }
  }
  return out;
}

test('HUD 두 줄 = GET /jobs/{id} = job.done · util 이동평균 튐 0 · power_w', async ({ page, request }) => {
  test.setTimeout(300000);
  const login = await (await request.post(API + '/api/v1/auth/login', { data: { realm: 'lx', login: 'lx-staff', password: PW } })).json();
  const h = { authorization: 'Bearer ' + login.token };
  const id = (await (await request.post(API + '/api/v1/jobs', { headers: h, data: { ...BODY, label: 'e2e f2b-perf-fields' } })).json()).job.id;
  const evs = await readAll(`${API}/api/v1/events/jobs/${id}?access_token=${login.token}`);
  const prog = evs.filter((e) => e.event === 'job.progress').map((e) => e.data);
  const utils = prog.map((p) => p.gpu.find((g) => g.index === 0)?.util_pct).filter((u) => u != null);
  expect(utils.length).toBeGreaterThanOrEqual(12);
  let jumps = 0; for (let i = 1; i < utils.length; i++) if (Math.abs(utils[i] - utils[i - 1]) >= 100) jumps++;
  expect(jumps).toBe(0);
  expect(prog.some((p) => p.chips_per_s.value === null && p.chips_per_s.note === '창 짧음')).toBeTruthy();
  expect(prog.at(-1).shards_done).toBe(378);
  const done = evs.find((e) => e.event === 'job.done').data;
  const j = await (await request.get(API + '/api/v1/jobs/' + id, { headers: h })).json();
  expect(j.chips_per_gpu_s.value).toBe(done.chips_per_gpu_s.value);
  expect(j.chips_per_wall_s.value).toBe(done.chips_per_wall_s.value);
  console.log(JSON.stringify({ id, utils, power_w: prog.map((p) => p.gpu[0]?.power_w), done: { per_gpu: done.chips_per_gpu_s.value, per_wall: done.chips_per_wall_s.value, gpu_s: done.gpu_s.value, elapsed_s: done.elapsed_s } }));
  // XI맵 ?job= 복원 — HUD 최종 두 줄이 같은 값
  await page.addInitScript(([s, api]) => {
    localStorage.setItem('lx_api_base', api); localStorage.setItem('lx_api_session', JSON.stringify(s));
    localStorage.setItem('lx_logged_in', '1'); localStorage.setItem('lx_role', 'staff');
  }, [login, API.replace('127.0.0.1', 'localhost')]);
  await page.goto('/landxi/xi/?job=' + id);
  const l1 = page.locator('.xi-own1').first();
  await expect(l1).toBeVisible({ timeout: 90000 });
  const t1 = await l1.innerText();
  const t2 = await page.locator('.xi-own2').first().innerText();
  console.log(JSON.stringify({ hud1: t1, hud2: t2 }));
  expect(t1).toContain(`GPU 초당 ${done.chips_per_gpu_s.value.toFixed(1)}칩`);
  expect(t1).toContain(`벽시계 ${done.chips_per_wall_s.value.toFixed(1)}칩/s`);
  expect(t2).toContain(`${done.gpu_s.value.toFixed(2)} GPU·s`);
});
