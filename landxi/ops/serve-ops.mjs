/* LX/OPS 관제 정적 서버 :8702 (F1-C · F1-CONTRACT §1 · §3 · §4.7–4.9 · §5.2–5.3)
 *
 *   node landxi/ops/serve-ops.mjs            → http://localhost:8702/landxi/ops/
 *
 * 1) 정적: 허용 접두(계약 §1)만 연다. 그 밖은 404. Range 206 · .pmtiles = octet-stream.
 *    /landxi/data/… 는 저장소 junction 이 있으면 그것을, 없으면 LX_DATA_ROOT 를 직접 연다(같은 파일).
 *    4173(serve.mjs)과 같은 저장소를 읽지만 origin 이 달라 localStorage 가 분리된다 → 관제 세션은 여기에만 있다.
 *
 * 2) 로컬 브리지 /landxi/ops/bridge/… — F1-B 게이트웨이(:8700)가 아직 없을 때의 **계약 준수 어댑터**.
 *    목(mock)이 아니다: GPU·스토리지는 server/ops 폴러(nvidia-smi · statfs · du)의 실측을 그대로 흘리고,
 *    배포·쿼터 쓰기는 계약 §4.7–4.8 상태기계를 이 프로세스 메모리에서 돌린다(재기동 = 픽스처 시드로 복귀).
 *    화면은 이 사실을 마스트에 적는다(`로컬 브리지 · 게이트웨이 없음`). 게이트웨이가 뜨면 boot.js 가 8700 으로 간다.
 *      /landxi/ops/bridge/health              브리지·폴러·게이트웨이 상태(브라우저가 8700 을 직접 두드리지 않게 — 콘솔 오류 0)
 *      /landxi/ops/bridge/api/v1/…            계약 경로 그대로(api-v1.js 가 base 로 쓴다)
 *      /landxi/ops/bridge/worker/…            로컬 워커 수신(127.0.0.1 만) — worker:{id}:vram · job 이벤트
 *
 * 폴러는 읽기 전용이다. 이 서버는 GPU 위 어떤 프로세스도 건드리지 않는다(Ollama 종료 금지).
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const PORT = Number(process.env.OPS_PORT || process.env.PORT_OPS) || 8702;
const DATA_ROOT = process.env.LX_DATA_ROOT || 'E:/Land-XI 플랫폼/02. 데이터';
const GATEWAY = process.env.LX_GATEWAY || 'http://localhost:8700';
const PY = process.env.LX_PYTHON || 'python';
const NO_POLLERS = process.env.OPS_NO_POLLERS === '1';
const ORIGINS = new Set([`http://localhost:${PORT}`, `http://127.0.0.1:${PORT}`]);
const APPROVALS_REQUIRED = Number(process.env.APPROVALS_REQUIRED || 1);
// 전력 규칙(2026-09-26 · 계약 부록): GPU 2장 동시 풀로드 → 전력 부족 셧다운. 동시 고부하 GPU ≤ 1 을 스케줄러 1급 제약으로 둔다.
const HEAVY_MAX = Math.max(1, Number(process.env.OPS_POWER_HEAVY_MAX || 1));
const HEAVY_UTIL = 50;   // 사용률 ≥ 50% = 고부하로 센다(측정 기준 · [목표])

const ALLOW = ['/landxi/ops/', '/landxi/assets/', '/landxi/shared/', '/landxi/xi/engine/', '/landxi/xi/fx/',
  '/landxi/proto/vendor/', '/landxi/proto/fonts-system.css', '/landxi/data/'];
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.ndjson': 'application/x-ndjson; charset=utf-8',
  '.geojson': 'application/geo+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.woff2': 'font/woff2', '.pmtiles': 'application/octet-stream', '.webm': 'video/webm', '.mp4': 'video/mp4' };
const BLANK = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');

const log = (...a) => console.log(`[serve-ops ${new Date().toTimeString().slice(0, 8)}]`, ...a);
const kst = (d = new Date()) => { const t = new Date(d.getTime() + 9 * 3600e3); return t.toISOString().replace('Z', '+09:00'); };
const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(HERE, 'data', 'fixtures', rel), 'utf8'));
const clone = (o) => JSON.parse(JSON.stringify(o));
const E = (value, unit, basis, source, note) => ({ value, unit, basis, as_of: kst(), source, ...(note ? { note } : {}) });

function devPassword() {
  if (process.env.DEV_PASSWORD) return process.env.DEV_PASSWORD;
  for (const f of ['server/.env', 'server/.env.example']) {
    try { const m = fs.readFileSync(path.join(ROOT, f), 'utf8').match(/^\s*DEV_PASSWORD\s*=\s*(.+?)\s*$/m); if (m) return m[1]; } catch { /* */ }
  }
  return null;
}

/* ══ 정적 ═══════════════════════════════════════════════════════════ */
function dataPath(p) {                       // /landxi/data/… → junction 우선, 없으면 LX_DATA_ROOT
  const rel = p.slice('/landxi/data/'.length);
  const j = path.join(ROOT, 'landxi', 'data');
  const base = fs.existsSync(j) ? j : DATA_ROOT;
  const f = path.resolve(base, rel);
  return f.startsWith(path.resolve(base)) ? f : null;
}
function serveStatic(req, res, p) {
  if (!ALLOW.some((a) => p === a || p.startsWith(a))) return send(res, 404, 'text/plain; charset=utf-8', '404 — 이 주소에는 화면이 없습니다');
  if (p.endsWith('/')) p += 'index.html';
  const f = p.startsWith('/landxi/data/') ? dataPath(p) : path.resolve(ROOT, '.' + p);
  if (!f || (!p.startsWith('/landxi/data/') && !f.startsWith(ROOT + path.sep))) return send(res, 404, 'text/plain', '404');
  let st = null; try { st = fs.statSync(f); } catch { /* */ }
  if (!st || st.isDirectory()) {
    if (p.startsWith('/landxi/assets/tiles/')) return send(res, 200, 'image/png', BLANK);
    return send(res, 404, 'text/plain', '404');
  }
  const type = TYPES[path.extname(f).toLowerCase()] || 'application/octet-stream';
  const head = { 'content-type': type, 'accept-ranges': 'bytes', 'x-content-type-options': 'nosniff',
    'cache-control': /\.(html|js|css|json|ndjson)$/.test(f) ? 'no-store' : 'public, max-age=600' };
  if (type.startsWith('text/html')) { head['x-frame-options'] = 'DENY'; head['referrer-policy'] = 'no-referrer'; }
  const size = st.size;
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
  if (range && size) {
    let start = range[1] === '' ? null : Number(range[1]); let end = range[2] === '' ? null : Number(range[2]);
    if (start === null) { start = Math.max(0, size - (end || 0)); end = size - 1; }
    if (end === null || end >= size) end = size - 1;
    if (!Number.isFinite(start) || start > end) { res.writeHead(416, { 'content-range': `bytes */${size}` }); return res.end(); }
    res.writeHead(206, { ...head, 'content-range': `bytes ${start}-${end}/${size}`, 'content-length': end - start + 1 });
    return fs.createReadStream(f, { start, end }).pipe(res);
  }
  res.writeHead(200, { ...head, 'content-length': size });
  if (req.method === 'HEAD') return res.end();
  fs.createReadStream(f).pipe(res);
}
function send(res, code, type, body, extra = {}) {
  res.writeHead(code, { 'content-type': type, 'cache-control': 'no-store', ...extra });
  res.end(body);
}
const json = (res, code, obj) => send(res, code, 'application/json; charset=utf-8', JSON.stringify(obj));
const rid = () => 'req_' + crypto.randomBytes(6).toString('hex');
const fail = (res, code, status, message, detail) => json(res, status, { error: { code, message, ...(detail ? { detail } : {}) }, request_id: rid() });
async function body(req) {
  const chunks = []; for await (const c of req) chunks.push(c);
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return null; }
}

/* ══ 브리지 상태(픽스처 시드) ═══════════════════════════════════════ */
const S = {
  started: kst(),
  deploys: readJson('deploys.json').items.filter((d) => d.id !== 'dp-kgz-land-change-26'),   // 이식 결과는 시드에 없다(계약 §6)
  cards: readJson('registry-cards.json'),
  models: readJson('registry-models.json').items,
  opsModels: readJson('ops-models.json').items,
  lineage: readJson('lineage.json'),
  tenants: readJson('tenants.json').items,
  usage: readJson('ops-tenants.json').items,
  nodes: readJson('ops-nodes.json').items,
  bench: readJson('bench.json'),
  rules: [...readJson('ops-alerts.json').rules.filter((r) => r.rule !== 'gpu_power_concurrency'), { rule: 'gpu_power_concurrency', threshold: HEAVY_MAX, unit: 'GPU', basis: '[목표]', note: '전력 규칙 2026-09-26 · 사용률 ≥ 50% GPU 수' }],
  approvals: [], audit: [], alerts: [], joinTokens: [],
  sessions: new Map(),
  jobs: new Map(), lanes: new Map([['a6000-0', []], ['a6000-1', []], ['cpu-0', []]]),
  waits: [],                      // 실측 대기 시간(s) — p95
  gpu: null, gpuHist: [], gpuAt: 0, storage: null, storageAt: 0,
  wvram: new Map(),               // worker:{id}:vram (로컬 워커 자기 보고)
  pendingUsage: new Map(),        // tenant → {amount, job_id}
  pollers: { gpu: { state: 'off', restarts: 0, last_error: null }, storage: { state: 'off', restarts: 0, last_error: null }, llm: { state: 'off', restarts: 0, last_error: null } },
  llm: null, llmAt: 0,
  gateway: { up: false, checked: 0 },
};
// 시드 approvals 를 표로 편다(결재 대기 실카운트는 decision=null 행)
for (const d of S.deploys) for (const a of d.approvals || []) S.approvals.push({ id: a.id + '_' + d.id, subject_type: 'deploy', subject_id: d.id, requested_by: 'seed', decided_by: a.by, decision: a.decision, reason: a.reason, at: a.at });

function audit(actor, action, subject, before, after, reason) {
  const row = { id: S.audit.length + 1, actor: actor?.user?.id || 'anon', realm: actor?.realm || null, action, subject, before, after, reason: reason || null, at: kst() };
  S.audit.push(row); return row;
}

/* ══ SSE /events/ops ══════════════════════════════════════════════ */
const clients = new Set(); const ring = []; let seq = 0;
function emit(event, data) {
  const id = `${Date.now()}-${++seq}`;
  const frame = `id: ${id}\nevent: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  ring.push({ id, event, frame }); if (ring.length > 400) ring.shift();
  for (const c of clients) c.write(frame);
}
setInterval(() => { for (const c of clients) c.write(': hb\n\n'); }, 10000).unref();

/* ══ 폴러(자식 프로세스 · 읽기 전용) ═══════════════════════════════ */
function startPoller(kind, args) {
  const st = S.pollers[kind];
  const p = spawn(PY, args, { cwd: ROOT, env: { ...process.env, PYTHONIOENCODING: 'utf-8' }, windowsHide: true });
  st.state = 'starting'; st.pid = p.pid;
  let buf = '';
  p.stdout.on('data', (b) => {
    buf += b.toString('utf8'); let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
      if (!line) continue;
      let j = null; try { j = JSON.parse(line); } catch { continue; }
      st.state = 'up'; st.last_at = kst();
      if (kind === 'gpu') onGpu(j); else if (kind === 'llm') { S.llm = j; S.llmAt = Date.now(); } else onStorage(j);
    }
  });
  p.stderr.on('data', (b) => { const s = b.toString('utf8').trim(); if (s) { st.last_error = s.split('\n').pop(); log(`[${kind}]`, s.split('\n').pop()); } });
  p.on('error', (e) => { st.state = 'down'; st.last_error = String(e.message); });
  p.on('exit', (code) => {
    st.state = 'down'; st.restarts++;
    if (!shuttingDown) { log(`${kind} 폴러 종료 code=${code} — 5s 뒤 재기동`); setTimeout(() => startPoller(kind, args), 5000).unref(); }
  });
  children.add(p); p.on('exit', () => children.delete(p));
}
const children = new Set(); let shuttingDown = false;
function stopAll() { shuttingDown = true; for (const c of children) { try { c.kill(); } catch { /* */ } } }
process.on('SIGINT', () => { stopAll(); process.exit(0); });
process.on('SIGTERM', () => { stopAll(); process.exit(0); });
process.on('exit', stopAll);

function onGpu(sample) {
  // 워커 자기 보고 job_id 를 브리지가 알면 채운다(폴러는 Redis 없을 때 브리지 /worker/vram 을 읽는다)
  S.gpu = sample; S.gpuAt = Date.now();
  S.gpuHist.push(sample); if (S.gpuHist.length > 30) S.gpuHist.shift();
  const n = S.nodes.find((x) => x.id === sample.node); if (n) { n.last_seen = sample.at; n.state = 'up'; n.hostname = os.hostname(); }
  emit('gpu.sample', sample);
  evalAlerts();
}
function onStorage(s) {
  S.storage = s; S.storageAt = Date.now();
  for (const u of S.usage) {
    const e = s.by_tenant?.[u.tenant_id]; if (!e) continue;
    u.dims.storage_gb.used = e;
  }
  evalAlerts();
}

/* ══ 경보(config/alerts.yaml 규칙 · 임계 [목표]) ═════════════════ */
const over = new Map();   // rule:key → since(ms)
function evalAlerts() {
  const now = Date.now(); const open = (rule, key, level, node, gpu, value) => {
    const k = rule + ':' + key; const since = over.get(k) ?? now; over.set(k, since);
    const need = /_5m$/.test(rule) ? 5 * 60e3 : 0;
    const cur = S.alerts.find((a) => a.rule === rule && a.key === key && !a.closed_at);
    if (now - since >= need && !cur) { const a = { id: 'al_' + crypto.randomBytes(4).toString('hex'), rule, key, level, node, gpu, value, opened_at: kst(), closed_at: null }; S.alerts.push(a); emit('alert', a); }
  };
  const close = (rule, key) => {
    over.delete(rule + ':' + key);
    const cur = S.alerts.find((a) => a.rule === rule && a.key === key && !a.closed_at);
    if (cur) { cur.closed_at = kst(); emit('alert', cur); }
  };
  for (const g of S.gpu?.gpus || []) {
    const t = g.temp_c?.value; const mu = g.mem_used_mib?.value; const mt = g.mem_total_mib?.value;
    if (t != null) (t > 85 ? open('gpu_temp_gt_85_5m', 'g' + g.index, 'fault', S.gpu.node, g.index, g.temp_c) : close('gpu_temp_gt_85_5m', 'g' + g.index));
    if (mu != null && mt) (mu / mt > 0.95 ? open('vram_gt_95_5m', 'g' + g.index, 'fault', S.gpu.node, g.index, g.mem_used_mib) : close('vram_gt_95_5m', 'g' + g.index));
  }
  const hot = (S.gpu?.gpus || []).filter((g) => utilOf(g) >= HEAVY_UTIL);
  if (S.gpu) (hot.length > HEAVY_MAX ? open('gpu_power_concurrency', 'node', 'caution', S.gpu.node, null, E(hot.length, 'GPU', 'measured', `nvidia-smi utilization.gpu ≥ ${HEAVY_UTIL}%`, '전력 규칙 동시 고부하 ≤ ' + HEAVY_MAX)) : close('gpu_power_concurrency', 'node'));
  const e = S.storage?.volumes?.find((v) => v.mount === 'E:')?.free_gb;
  if (e?.value != null) (e.value < 200 ? open('disk_e_free_lt_200gb', 'E', 'fault', null, null, e) : close('disk_e_free_lt_200gb', 'E'));
  S.lastCheck = kst();
}

/* ══ 작업 · 대기열(로컬 스케줄러 — 워커가 claim 해 간다) ═════════ */
const QUEUE_EVENTS_MS = 2000;
function jobPublic(j) { const { _claimed, ...rest } = j; return rest; }
function queueSample() {
  const pools = {};
  for (const pool of ['a6000', 'cpu']) {
    const js = [...S.jobs.values()].filter((j) => j.pool === pool);
    const live = [...S.wvram.entries()].filter(([w, v]) => w.startsWith(pool === 'a6000' ? 'a6000' : 'cpu') && Date.now() - v._t < 10000).length;
    const w = S.waits.filter((x) => x.pool === pool).map((x) => x.s).sort((a, b) => a - b);
    pools[pool] = { queued: js.filter((j) => j.state === 'queued').length, running: js.filter((j) => j.state === 'running').length,
      workers: pool === 'a6000' ? 2 : 1, workers_live: live,
      p95_wait_s: E(w.length ? w[Math.min(w.length - 1, Math.floor(w.length * 0.95))] : null, 's', 'measured', 'jobs(created_at→started_at)', w.length ? `n=${w.length}` : '완료 job 0건 — 분포 없음') };
  }
  const since = Date.now() - 30 * 60e3;
  const lanes = [...S.lanes.entries()].map(([worker, blocks]) => ({ worker, blocks: blocks.filter((b) => !b.to || Date.parse(b.to) > since) }));
  const g = GW.queue;   // 게이트웨이 대기열(중계) — 같은 워커 행에 합친다
  if (g) {
    for (const [pool, v] of Object.entries(g.pools || {})) { if (!pools[pool]) continue; pools[pool].queued += v.queued || 0; pools[pool].running += v.running || 0; pools[pool].gateway = { queued: v.queued || 0, running: v.running || 0 }; }
    for (const l of g.lanes || []) { let mine = lanes.find((x) => x.worker === l.worker); if (!mine) { mine = { worker: l.worker, blocks: [] }; lanes.push(mine); } for (const b of l.blocks || []) mine.blocks.push({ ...b, via: 'gateway' }); }
  }
  return { pools, lanes, power: powerState(), as_of: kst(), sources: g ? ['bridge', 'gateway'] : ['bridge'] };
}
function heavyGpusBooked() { return [...S.jobs.values()].filter((j) => j.pool === 'a6000' && (j.state === 'running' || (j.state === 'queued' && j._claimed))).reduce((n, j) => n + Math.max(1, (j.workers || []).length), 0); }
const utilOf = (g) => g.util_ma5?.value ?? g.util_pct?.value ?? 0;   // v1.1-28 이동평균 우선(WDDM 순간값 0↔100 금지)
function powerState() {
  const gs = S.gpu?.gpus || []; const hot = gs.filter((g) => utilOf(g) >= HEAVY_UTIL).map((g) => g.index);
  const pb = S.gpu?.power_budget;
  return { heavy_max: HEAVY_MAX, booked: heavyGpusBooked(), rule: '전력 규칙 2026-09-26 · 동시 고부하 GPU ≤ ' + HEAVY_MAX,
    leases_n: pb?.leases_n ?? null, leases: pb?.leases || [],
    heavy_now: E(gs.length ? hot.length : null, 'GPU', 'measured', `nvidia-smi 이동평균 ≥ ${HEAVY_UTIL}% [목표]`, hot.length ? 'GPU ' + hot.join(',') : '고부하 GPU 없음') };
}
let lastQueue = '';
function pushQueue(force = false) {
  const q = queueSample(); const sig = JSON.stringify([q.power.heavy_now.value, q.power.booked, q.pools.a6000.queued, q.pools.a6000.running, q.pools.cpu.queued, q.pools.cpu.running, q.lanes.map((l) => l.blocks.map((b) => b.job_id + b.state + (b.to || '')))]);
  if (force || sig !== lastQueue) { lastQueue = sig; emit('queue.sample', q); }
}
function jobState(j) {
  const c = j.aoi?.coordinates?.[0] || []; const cx = c.length ? c.reduce((a, p) => a + p[0], 0) / c.length : null; const cy = c.length ? c.reduce((a, p) => a + p[1], 0) / c.length : null;
  emit('job.state', { job_id: j.id, tenant_id: j.tenant_id, state: j.state, aoi_centroid: cx == null ? null : [+cx.toFixed(5), +cy.toFixed(5)], pool: j.pool, label: j.label || null, priority: j.priority, at: kst() });
}
function laneOpen(j, workers) { for (const w of workers) { const l = S.lanes.get(w); if (l) l.push({ job_id: j.id, from: kst(), to: null, state: 'running', tenant_id: j.tenant_id }); } }
function laneClose(j, state) { for (const l of S.lanes.values()) for (const b of l) if (b.job_id === j.id && !b.to) { b.to = kst(); b.state = state; } }
setInterval(() => {                      // 계량 → usage.delta (2s 창으로 묶는다)
  for (const [tenant, p] of S.pendingUsage) {
    if (p.amount <= 0) continue;
    const amt = +p.amount.toFixed(2); p.amount = 0;
    const u = S.usage.find((x) => x.tenant_id === tenant);
    if (u) { const e = u.dims.gpu_s_month.used; e.value = +((e.value || 0) + amt).toFixed(2); e.as_of = kst(); e.source = 'usage_events(로컬 워커 계량 · shard ms × GPU)'; e.note = 'P4 1,728 + 이 세션 계량'; forecast(u); }
    emit('usage.delta', { tenant_id: tenant, dim: 'gpu_s_month', amount: amt, job_id: p.job_id, at: kst() });
  }
  pushQueue();
}, QUEUE_EVENTS_MS).unref();

/* ══ 쿼터 예측(선형 · [추정]) ═══════════════════════════════════ */
function forecast(u) {
  const now = new Date(); const day = now.getDate(); const dim = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const used = u.dims.gpu_s_month.used.value || 0; const hard = u.dims.gpu_s_month.hard;
  const proj = used / day * dim;
  u.forecast = { gpu_s_month: { exceed_month: hard != null && proj > hard ? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}` : null,
    projected: E(Math.round(proj), 'gpu_s', 'estimate', 'quota.estimator 선형(월 누계 ÷ 경과일 × 월 일수)', `${day}/${dim}일 기준`),
    basis: 'estimate', source: 'quota.estimator 선형' } };
}
S.usage.forEach(forecast);

/* ══ 배포 상태기계(계약 §4.7 · §9) ═════════════════════════════ */
const NEXT = { draft: ['shadow'], shadow: ['canary'], canary: ['ga'], ga: [], rolled_back: ['shadow', 'canary', 'ga'] };
const approvesOf = (d) => S.approvals.filter((a) => a.subject_type === 'deploy' && a.subject_id === d.id && a.decision === 'approve' && Date.parse(a.at) >= Date.parse(d._stage_at || '1970-01-01'));
function versionOf(cv) { return cv ? 'v' + cv.split('@')[1] : null; }
function changed(d, action, by) { d.updated_at = kst(); emit('deploy.changed', { deploy_id: d.id, action, stage: d.stage, card_version_id: d.card_version_id, by: by?.user?.id || null, at: d.updated_at }); }
function deployPublic(d) { const { _stage_at, ...rest } = d; return { ...rest, approvals: S.approvals.filter((a) => a.subject_type === 'deploy' && a.subject_id === d.id).map((a) => ({ id: a.id, decision: a.decision, by: a.decided_by, at: a.at, reason: a.reason })) }; }

function region(id) {
  if (id === 'kgz-sokuluk') {
    const f = path.join(ROOT, 'landxi', 'global', 'data', 'kgz-adm2.geojson');
    try {
      const g = JSON.parse(fs.readFileSync(f, 'utf8'));
      const ft = g.features.find((x) => /sokuluk/i.test(x.properties?.shapeName || x.properties?.name || ''));
      if (ft) return { id, name: { ko: '키르기스스탄 소쿨룩', en: 'Sokuluk, Kyrgyzstan' }, aoi: ft.geometry, boundary: 'geoBoundaries ADM2', source: 'landxi/global/data/kgz-adm2.geojson (F1-D)' };
    } catch { /* F1-D 산출 전 */ }
    const [x0, y0, x1, y1] = [74.125, 42.43, 74.559, 43.241];
    return { id, name: { ko: '키르기스스탄 소쿨룩', en: 'Sokuluk, Kyrgyzstan' }, aoi: { type: 'Polygon', coordinates: [[[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]] },
      boundary: '경계 미확보', source: 'recon-0924/global-map.md Sokuluk 군 bbox — F1-D kgz-adm2.geojson 전' };
  }
  return null;
}

/* ══ 인증 ══════════════════════════════════════════════════════════ */
function who(req, url) {
  const h = req.headers.authorization || ''; const t = h.startsWith('Bearer ') ? h.slice(7) : url.searchParams.get('access_token');
  const s = t && S.sessions.get(t); return s && Date.parse(s.expires_at) > Date.now() ? s : null;
}
const CAPS = { admin: ['jobs.submit', 'results.edit', 'deploys.write', 'ops.read', 'ops.write', 'quota.write'], staff: ['jobs.submit', 'results.edit', 'results.read', 'catalog.lx', 'registry.read'], sales: ['jobs.submit', 'results.read', 'catalog.lx'] };

/* ══ 라우터 ════════════════════════════════════════════════════════ */
async function api(req, res, url, p) {
  const m = req.method; const s = who(req, url);
  const need = (role) => { if (!s) { fail(res, 'unauthorized', 401, '로그인 필요'); return false; } if (role && !(s.realm === 'lx' && s.role === role)) { fail(res, 'forbidden', 403, '관리자 전용'); return false; } return true; };
  let mm;

  if (p === '/health') return json(res, 200, { ok: true, version: '0.1.0-bridge', redis: false, pg: false, workers: { gpu: [...S.wvram.keys()].filter((k) => k.startsWith('a6000')).length, cpu: 0 }, at: kst(), bridge: true });
  if (p === '/auth/login' && m === 'POST') {
    const b = await body(req); const pw = devPassword();
    if (!b || !b.login) return fail(res, 'unauthorized', 401, '계정·비밀번호를 확인하세요');
    if (!pw || b.password !== pw) return fail(res, 'unauthorized', 401, '계정·비밀번호를 확인하세요');
    let realm, role, tenant = null, uid;
    if (b.realm === 'lx' && /^lx-(admin|staff|sales)$/.test(b.login)) { realm = 'lx'; role = b.login.slice(3); uid = 'u_lx_' + role; }
    else if (b.realm === 'tenant' && b.tenant_id && S.tenants.some((t) => t.id === b.tenant_id)) { realm = 'tenant'; role = 'manager'; tenant = b.tenant_id; uid = 'u_' + tenant + '_manager'; }
    else return fail(res, 'unauthorized', 401, '계정·비밀번호를 확인하세요');
    const token = (realm === 'lx' ? 'lxs_' : 'lxt_') + crypto.randomBytes(18).toString('base64url');
    const sess = { token, realm, role, tenant_id: tenant, user: { id: uid, name: realm === 'lx' ? { admin: 'LX 관리자', staff: 'LX 직원', sales: 'LX 영업' }[role] : tenant + ' 담당' }, expires_at: kst(new Date(Date.now() + 12 * 3600e3)) };
    S.sessions.set(token, sess); audit(sess, 'auth.login', uid, null, { realm, role });
    return json(res, 200, sess);
  }
  if (p === '/auth/logout' && m === 'POST') { if (s) S.sessions.delete(s.token); res.writeHead(204); return res.end(); }
  if (p === '/me') { if (!need()) return; return json(res, 200, { realm: s.realm, role: s.role, tenant_id: s.tenant_id, caps: s.realm === 'lx' ? CAPS[s.role] : ['results.read(own)', 'usage.read(own)'] }); }

  // SSE — Origin 검사(계약 §3: 8702 또는 Origin 없음) + admin
  if (p === '/events/ops') {
    const o = req.headers.origin;
    if (o && !ORIGINS.has(o)) return fail(res, 'forbidden', 403, 'LX 관리자 대시보드 주소에서만 열립니다');
    if (!s || s.realm !== 'lx' || s.role !== 'admin') return fail(res, 'forbidden', 403, '관리자 전용');
    res.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-store', 'x-accel-buffering': 'no', connection: 'keep-alive' });
    res.write(': lx-ops bridge\n\n');
    const last = url.searchParams.get('last_event_id') || req.headers['last-event-id'];
    const idx = last ? ring.findIndex((r) => r.id === last) : -1;
    if (idx >= 0) for (const r of ring.slice(idx + 1)) res.write(r.frame);
    else { for (const g of S.gpuHist) res.write(`id: bk-${g.at}\nevent: gpu.sample\ndata: ${JSON.stringify(g)}\n\n`); res.write(`event: queue.sample\ndata: ${JSON.stringify(queueSample())}\n\n`); }
    clients.add(res); req.on('close', () => clients.delete(res));
    return;
  }

  // 관제(ops) — lx admin
  if (p.startsWith('/ops/')) {
    if (!need('admin')) return;
    if (p === '/ops/nodes') return json(res, 200, { items: S.nodes.map((n) => ({ ...n, ...(n.state === 'pending' ? { join_tokens: S.joinTokens.filter((t) => t.node === n.id).map(({ token, ...r }) => ({ ...r, token_hint: token.slice(0, 6) + '…' })) } : {}), ...(n.id === 'node-tr3995wx' && S.gpuAt && Date.now() - S.gpuAt > 10000 ? { state: 'stale' } : {}) })), total: S.nodes.length, as_of: kst() });
    if (p === '/ops/gpus') return S.gpu ? json(res, 200, S.gpu) : fail(res, 'poller_unavailable', 503, 'gpu_poller 미기동 — 수신 없음');
    if (p === '/ops/queues') return json(res, 200, queueSample());
    if (p === '/ops/storage') return S.storage ? json(res, 200, S.storage) : fail(res, 'poller_unavailable', 503, 'storage_poller 첫 수집 전');
    if (p === '/ops/alerts') return json(res, 200, { items: S.alerts.slice(-50), last_check: S.lastCheck || null, rules: S.rules });
    if (p === '/ops/models') return json(res, 200, { items: S.opsModels, as_of: kst() });
    if (p === '/ops/tenants') return json(res, 200, { items: S.usage, as_of: kst() });
    if (p === '/ops/bench') return json(res, 200, S.bench);
    if (p === '/ops/nodes/join-token' && m === 'POST') {
      const b = (await body(req)) || {}; const node = b.node || S.nodes.find((n) => n.state === 'pending')?.id || 'node-a100-1';
      const t = { token: 'nj_' + crypto.randomBytes(24).toString('base64url'), node, issued_at: kst(), expires_at: kst(new Date(Date.now() + 24 * 3600e3)), compose_hint: 'docker compose -f node.yml up  (Phase 2)' };
      S.joinTokens.push(t); audit(s, 'ops.join_token', node, null, { expires_at: t.expires_at, token_hint: t.token.slice(0, 6) + '…' });
      return json(res, 200, t);
    }
    if ((mm = p.match(/^\/ops\/models\/(.+)\/(load|unload)$/)) && m === 'POST') {
      const id = decodeURIComponent(mm[1]); const b = (await body(req)) || {}; const om = S.opsModels.find((x) => x.model_id === id);
      if (!om) return fail(res, 'not_found', 404, '모델 없음');
      const before = clone(om); om.pinned = mm[2] === 'load'; om.pin_worker = mm[2] === 'load' ? (b.worker || 'a6000-0') : null;
      om.pin_note = S.wvram.size ? null : '워커 없음 — 워커 기동 시 상주';
      audit(s, 'ops.model.' + mm[2], id, before, clone(om));
      return json(res, 202, { accepted: true, model_id: id, action: mm[2], worker: om.pin_worker, note: om.pin_note });
    }
    if (p === '/ops/audit') return json(res, 200, { items: S.audit.filter((a) => !url.searchParams.get('subject') || a.subject === url.searchParams.get('subject')).slice(-100), total: S.audit.length });
    return fail(res, 'not_found', 404, '이 주소에는 화면이 없습니다');
  }

  // 결재(비계약 — 결과 문서 '계약 변경 요청' §4.10 제안)
  if (p === '/approvals') { if (!need('admin')) return; const st = url.searchParams.get('subject_type'); return json(res, 200, { items: S.approvals.filter((a) => !st || a.subject_type === st), pending: S.approvals.filter((a) => a.decision == null).length, as_of: kst() }); }
  if ((mm = p.match(/^\/regions\/([\w-]+)$/))) { if (!need()) return; const r = region(mm[1]); return r ? json(res, 200, r) : fail(res, 'not_found', 404, '지역 프로파일 없음'); }

  // 레지스트리
  if (p === '/registry/models') { if (!need()) return; return json(res, 200, { items: S.models }); }
  if (p === '/registry/cards') { if (!need()) return; return json(res, 200, S.cards); }
  if ((mm = p.match(/^\/registry\/lineage\/([\w-]+)$/))) {
    if (!need()) return; const d = S.deploys.find((x) => x.id === mm[1]); if (!d) return fail(res, 'not_found', 404, '배포본 없음');
    const key = `${d.id}@${d.card_version_id}`; let chain = S.lineage[key]?.chain;
    if (!chain) {
      const cv = S.cards.card_versions.find((v) => v.id === d.card_version_id);
      chain = [...(cv?.model_ids || []).map((mid) => ({ kind: 'model', id: mid })), ...(d.card_version_id ? [{ kind: 'card_version', id: d.card_version_id }] : []),
        ...(d.from_deploy_id ? [{ kind: 'deploy', id: d.from_deploy_id, label: '적용 원본' }] : []), { kind: 'deploy', id: d.id }, { kind: 'tenant', id: d.tenant_id },
        { kind: 'job', id: null, label: d.from_deploy_id ? '결과 0 · 첫 분석 대기' : '결과 없음' }];
    }
    return json(res, 200, { deploy_id: d.id, card_version_id: d.card_version_id, chain });
  }

  // 배포
  if (p === '/deploys' && m === 'GET') {
    if (!need()) return; const q = url.searchParams;
    let items = S.deploys.filter((d) => (!q.get('tenant_id') || d.tenant_id === q.get('tenant_id')) && (!q.get('card_id') || d.card_id === q.get('card_id')) && (!q.get('stage') || d.stage === q.get('stage')));
    if (s.realm === 'tenant') items = items.filter((d) => d.tenant_id === s.tenant_id);
    return json(res, 200, { items: items.map(deployPublic), total: items.length, as_of: kst() });
  }
  if (p === '/deploys' && m === 'POST') {
    if (!need('admin')) return; const b = await body(req);
    const from = b && S.deploys.find((d) => d.id === b.from_deploy_id);
    if (!from) return fail(res, 'not_found', 404, 'from_deploy_id 없음');
    if (!S.tenants.some((t) => t.id === b.tenant_id)) return fail(res, 'not_found', 404, 'tenant 없음');
    const year = new Date().getFullYear();
    let id = `dp-${b.tenant_id}-${from.card_id.replace(/^card-/, '')}-${String(year).slice(2)}`; let k = 2; while (S.deploys.some((d) => d.id === id)) id = id.replace(/(-\d+)?$/, '') + '-' + k++;
    const r = region(b.region_profile);
    const aoi = b.aoi || r?.aoi; if (!aoi) return fail(res, 'aoi_outside_footprint', 400, 'AOI 없음');
    const d = { ...clone(from), id, name: b.name || `${from.name} 다른 지역에 적용`, tenant_id: b.tenant_id, region_profile: b.region_profile, region_name: r?.name || { ko: b.region_profile, en: b.region_profile },
      aoi: aoi.type === 'Polygon' ? { type: 'MultiPolygon', coordinates: [aoi.coordinates] } : aoi, stage: 'draft', pinned: false, gpu_pool: b.gpu_pool || 'cpu', from_deploy_id: from.id,
      prev_card_version_id: null, model_override: null, snapshot_current: null, snapshot_prev: null, year, status_history: '다른 지역에 적용',
      scale: E(0, 'count', 'measured', `results/${b.tenant_id}/`, '결과 0 · 첫 분석 대기'), basis: 'measured', approvals: [], created_at: kst(), updated_at: kst(), _stage_at: kst(),
      aoi_source: r ? `${r.boundary} · ${r.source}` : 'body.aoi' };
    S.deploys.push(d); audit(s, 'deploy.port', id, { from: from.id }, { tenant_id: d.tenant_id, region_profile: d.region_profile, stage: 'draft' }, b.reason);
    changed(d, 'port', s); return json(res, 201, deployPublic(d));
  }
  if ((mm = p.match(/^\/deploys\/([\w-]+)(?:\/(rollout|rollback|approve|pin|modules|model|gpu))?$/))) {
    const d = S.deploys.find((x) => x.id === mm[1]);
    if (!mm[2]) { if (!need()) return; return d ? json(res, 200, deployPublic(d)) : fail(res, 'not_found', 404, '배포본 없음'); }
    if (m !== 'POST') return fail(res, 'not_found', 404, 'POST 만');
    if (!need('admin')) return; if (!d) return fail(res, 'not_found', 404, '배포본 없음');
    const b = (await body(req)) || {}; const before = { stage: d.stage, card_version_id: d.card_version_id, snapshot_current: d.snapshot_current };
    switch (mm[2]) {
      case 'rollout': {
        if (!(NEXT[d.stage] || []).includes(b.stage)) return fail(res, 'invalid_stage_transition', 409, `${d.stage} → ${b.stage} 불가(순방향 한 칸씩)`, { from: d.stage, to: b.stage, allowed: NEXT[d.stage] });
        if (b.stage === 'ga' && approvesOf(d).length < APPROVALS_REQUIRED) return fail(res, 'approval_required', 409, `ga 전 승인 ${APPROVALS_REQUIRED}건 필요`, { have: approvesOf(d).length, need: APPROVALS_REQUIRED });
        d.stage = b.stage; d._stage_at = kst(); break;
      }
      case 'rollback': {
        if (!['canary', 'ga'].includes(d.stage)) return fail(res, 'invalid_stage_transition', 409, `${d.stage} 에서는 롤백 불가(canary|ga 만)`);
        if (!d.prev_card_version_id) return fail(res, 'invalid_stage_transition', 409, '직전 버전 없음');
        [d.card_version_id, d.prev_card_version_id] = [d.prev_card_version_id, d.card_version_id];
        [d.snapshot_current, d.snapshot_prev] = [d.snapshot_prev, d.snapshot_current];
        d.version = versionOf(d.card_version_id); d.stage = 'rolled_back'; d._stage_at = kst();
        if (d.id === 'dp-nw-farm-25') d.scale = d.card_version_id === 'card-farm@2.0'
          ? E(76215, 'polygons', 'inferred', 'results/namwon-landcover-2023.pmtiles (cls=경작지)', 'P4 2023 25cm × aerial25/best · 결과 확인 전')
          : E(2098, '필지', 'measured', 'results/namwon-farmland-2025.geojson', '2025 드론 · A02');
        break;
      }
      case 'approve': {
        if (!['approve', 'reject'].includes(b.decision) || !b.reason) return fail(res, 'forbidden', 400, 'decision · reason 필요');
        const a = { id: 'ap_' + crypto.randomBytes(4).toString('hex'), subject_type: 'deploy', subject_id: d.id, requested_by: s.user.id, decided_by: s.user.id, decision: b.decision, reason: b.reason, at: kst() };
        S.approvals.push(a); audit(s, 'deploy.approve', d.id, null, { decision: b.decision }, b.reason); changed(d, 'approve', s);
        return json(res, 200, { approval: a, deploy: deployPublic(d) });
      }
      case 'pin': d.pinned = !!b.card_version_id; d.pinned_version = b.card_version_id || null; break;
      case 'modules': {
        const ext = b.ext || {}; const core = d.modules.core;
        const locked = Object.keys(ext).filter((k) => core.includes(k)); if (locked.length) return fail(res, 'module_locked', 400, '공통 모듈 7 은 잠겨 있다', { modules: locked });
        for (const [k, v] of Object.entries(ext)) { if (!(k in d.modules.ext)) return fail(res, 'not_found', 404, `전용 모듈 ${k} 없음`); d.modules.ext[k] = !!v; }
        break;
      }
      case 'model': { if (b.model_id && !S.models.some((x) => x.id === b.model_id)) return fail(res, 'not_found', 404, '모델 없음'); d.model_override = b.model_id || null; break; }
      case 'gpu': { if (!['a6000', 'cpu'].includes(b.pool)) return fail(res, 'not_found', 404, '풀 없음'); d.gpu_pool = b.pool; break; }
    }
    audit(s, 'deploy.' + mm[2], d.id, before, { stage: d.stage, card_version_id: d.card_version_id, snapshot_current: d.snapshot_current, ...(mm[2] === 'modules' ? { ext: d.modules.ext } : {}), ...(mm[2] === 'model' ? { model_override: d.model_override } : {}), ...(mm[2] === 'gpu' ? { gpu_pool: d.gpu_pool } : {}), ...(mm[2] === 'pin' ? { pinned: d.pinned } : {}) }, b.reason);
    changed(d, mm[2] === 'rollout' ? 'rollout' : mm[2] === 'rollback' ? 'rollback' : mm[2], s);
    return json(res, 200, deployPublic(d));
  }

  // 기관 · 쿼터
  if (p === '/tenants') { if (!need('admin')) return; return json(res, 200, { items: S.tenants, as_of: kst() }); }
  if ((mm = p.match(/^\/t\/([\w-]+)\/usage$/))) { if (!need()) return; if (s.realm === 'tenant' && s.tenant_id !== mm[1]) return fail(res, 'forbidden', 403, '자기 기관만'); const u = S.usage.find((x) => x.tenant_id === mm[1]); return u ? json(res, 200, u) : fail(res, 'not_found', 404, '기관 없음'); }
  if ((mm = p.match(/^\/tenants\/([\w-]+)\/quota$/)) && m === 'PUT') {
    if (!need('admin')) return; const u = S.usage.find((x) => x.tenant_id === mm[1]); if (!u) return fail(res, 'not_found', 404, '기관 없음');
    const b = await body(req); if (!b?.reason || !String(b.reason).trim()) return fail(res, 'reason_required', 400, '한도 변경 사유가 필요하다');
    const before = {}; const after = {};
    for (const [dim, v] of Object.entries(b.dims || {})) {
      const cur = u.dims[dim]; if (!cur) return fail(res, 'not_found', 404, `차원 ${dim} 없음`);
      before[dim] = { soft: cur.soft, hard: cur.hard, policy: cur.policy };
      if ('soft' in v) cur.soft = v.soft; if ('hard' in v) cur.hard = v.hard; if (v.policy) cur.policy = v.policy;
      cur.note = `관리자 변경 ${kst().slice(0, 16)} · ${String(b.reason).slice(0, 40)}`;
      after[dim] = { soft: cur.soft, hard: cur.hard, policy: cur.policy };
    }
    forecast(u);
    const a = { id: 'ap_' + crypto.randomBytes(4).toString('hex'), subject_type: 'quota', subject_id: u.tenant_id, requested_by: s.user.id, decided_by: s.user.id, decision: 'approve', reason: b.reason, at: kst(), detail: after };
    S.approvals.push(a); audit(s, 'quota.put', u.tenant_id, before, after, b.reason);
    const t = S.tenants.find((x) => x.id === u.tenant_id);
    return json(res, 200, { ...t, usage: u, approval: a });
  }

  // 작업(jobs) — 제출은 계약 §4.4, 제어는 cancel|requeue|priority
  if (p === '/jobs' && m === 'POST') {
    if (!need()) return; const b = await body(req); if (!b?.aoi) return fail(res, 'aoi_outside_footprint', 400, 'AOI 필요');
    const id = 'job_' + Date.now().toString(36).toUpperCase() + crypto.randomBytes(5).toString('hex').toUpperCase();
    const tenant = b.demo ? 'lx-demo' : (s.realm === 'tenant' ? s.tenant_id : 'lx');
    const j = { id, tenant_id: tenant, submitted_by: s.user.id, kind: b.kind || 'infer', state: 'queued', priority: b.priority ?? 0, demo: !!b.demo, pool: b.pool || 'a6000',
      model_id: b.model_id, imagery_id: b.imagery_id, deploy_id: b.deploy_id || null, card_id: b.card_id || null, aoi: b.aoi, options: b.options || {}, label: b.label || null,
      shards_total: b.shards_total || null, shards_done: 0, shards_failed: 0, counts: {}, gpu_s: E(0, 'gpu_s', 'measured', 'usage_events'),
      chips_per_s: E(null, 'chips_per_s', 'measured', 'gpu_worker 계량', '첫 shard 뒤 채워짐'), workers: [], result_set: `results/${tenant}/${id}`, snapshot_ready: false,
      created_at: kst(), started_at: null, finished_at: null, error: null };
    S.jobs.set(id, j); audit(s, 'job.submit', id, null, { model_id: j.model_id, pool: j.pool }); jobState(j); pushQueue(true);
    return json(res, 202, { job: jobPublic(j), events_url: `/api/v1/events/jobs/${id}` });
  }
  if (p === '/jobs' && m === 'GET') {
    if (!need()) return; const q = url.searchParams; const states = (q.get('state') || '').split(',').filter(Boolean);
    let all = [...S.jobs.values()].map(jobPublic);
    if (GW.token) { const r = await gwFetch('/jobs?limit=50'); if (r.status === 200) for (const j of r.j?.items || []) if (!S.jobs.has(j.id)) all.push({ ...j, via: 'gateway' }); }
    const items = all.filter((j) => (!states.length || states.includes(j.state)) && (!q.get('tenant_id') || j.tenant_id === q.get('tenant_id'))).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))).slice(0, Number(q.get('limit') || 50));
    return json(res, 200, { items, total: items.length, as_of: kst() });
  }
  if ((mm = p.match(/^\/jobs\/([\w-]+)(?:\/(cancel|requeue|priority))?$/))) {
    const j = S.jobs.get(mm[1]);
    if (!j && GW.token) {   // 게이트웨이 job → 대리 호출(읽기 · 제어)
      if (!need()) return;
      if (mm[2] && !(s.realm === 'lx' && s.role === 'admin')) return fail(res, 'forbidden', 403, '관리자 전용');
      const b = mm[2] ? ((await body(req)) || {}) : undefined;
      const r = await gwFetch('/jobs/' + mm[1] + (mm[2] ? '/' + mm[2] : ''), mm[2] ? { method: 'POST', body: b } : {});
      if (mm[2]) audit(s, 'job.' + mm[2] + '(gateway)', mm[1], null, { status: r.status }, b?.reason);
      return r.status ? json(res, r.status, r.j ? { ...r.j, via: 'gateway' } : {}) : fail(res, 'not_found', 404, 'job 없음');
    }
    if (!mm[2]) { if (!need()) return; return j ? json(res, 200, jobPublic(j)) : fail(res, 'not_found', 404, 'job 없음'); }
    if (!need()) return; if (!j) return fail(res, 'not_found', 404, 'job 없음');
    if (!(s.realm === 'lx' && (s.role === 'admin' || s.user.id === j.submitted_by))) return fail(res, 'forbidden', 403, '제출자 · admin');
    const b = (await body(req)) || {}; const before = { state: j.state, priority: j.priority };
    if (mm[2] === 'cancel') {
      if (!['queued', 'running'].includes(j.state)) return fail(res, 'invalid_stage_transition', 409, `${j.state} 는 취소 불가`);
      j.state = 'cancelled'; j.finished_at = kst(); laneClose(j, 'cancelled');
    } else if (mm[2] === 'requeue') {
      if (!['cancelled', 'failed', 'done'].includes(j.state)) return fail(res, 'invalid_stage_transition', 409, `${j.state} 는 재큐 불가`);
      j.state = 'queued'; j.shards_done = 0; j.started_at = null; j.finished_at = null; j.error = null; j.created_at = kst(); j._claimed = false;
    } else {
      const pr = Number(b.priority); if (!(pr >= 0 && pr <= 3)) return fail(res, 'invalid_stage_transition', 400, 'priority 0..3');
      j.priority = pr;
    }
    audit(s, 'job.' + mm[2], j.id, before, { state: j.state, priority: j.priority }, b.reason); jobState(j); pushQueue(true);
    return json(res, 200, jobPublic(j));
  }
  return fail(res, 'not_found', 404, '브리지에 없는 경로 — 게이트웨이(F1-B) 필요');
}

/* ══ 로컬 워커 수신(127.0.0.1 만) ═════════════════════════════════ */
async function worker(req, res, url, p) {
  const ra = req.socket.remoteAddress || ''; if (!/^(::1|127\.0\.0\.1|::ffff:127\.0\.0\.1)$/.test(ra)) return fail(res, 'forbidden', 403, 'localhost 만');
  if (p === '/vram') {
    const out = {}; for (const [w, v] of S.wvram) if (Date.now() - v._t < 10000) out[w] = { budget_mib: v.budget_mib, used_mib: v.used_mib, model_id: v.model_id, job_id: v.job_id || null, pid: v.pid || null };
    return json(res, 200, out);
  }
  if (p === '/claim' && req.method === 'POST') {
    const b = (await body(req)) || {}; const pool = b.pool || 'a6000';
    if (pool === 'a6000' && heavyGpusBooked() >= HEAVY_MAX) return json(res, 200, { job: null, hold: 'power_budget', heavy_max: HEAVY_MAX });
    // 브리지 밖(게이트웨이 워커 · 벤치 · 다른 프로세스)이 이미 GPU 를 고부하로 쓰고 있으면 기다린다 — 전력 규칙은 이 PC 전체에 걸린다
    const extHot = (S.gpu?.gpus || []).filter((g) => utilOf(g) >= HEAVY_UTIL).length + (GW.queue?.pools?.a6000?.running || 0);
    if (pool === 'a6000' && extHot >= HEAVY_MAX && !b.ignore_external) return json(res, 200, { job: null, hold: 'power_budget_external', heavy_max: HEAVY_MAX, heavy_now: extHot });
    const j = [...S.jobs.values()].filter((x) => x.pool === pool && x.state === 'queued' && !x._claimed).sort((a, c) => a.priority - c.priority || a.created_at.localeCompare(c.created_at))[0];
    if (!j) return json(res, 200, { job: null });
    j._claimed = true; return json(res, 200, { job: jobPublic(j), max_gpus: pool === 'a6000' ? HEAVY_MAX : null });
  }
  if (p === '/reset' && req.method === 'POST') {   // 시연·e2e 재현용: 브리지 상태를 픽스처 시드로(텔레메트리·폴러는 그대로)
    S.deploys = readJson('deploys.json').items.filter((d) => d.id !== 'dp-kgz-land-change-26'); S.opsModels = readJson('ops-models.json').items;
    S.usage = readJson('ops-tenants.json').items; if (S.storage) onStorage(S.storage); S.usage.forEach(forecast);
    S.approvals = []; for (const d of S.deploys) for (const a of d.approvals || []) S.approvals.push({ id: a.id + '_' + d.id, subject_type: 'deploy', subject_id: d.id, requested_by: 'seed', decided_by: a.by, decision: a.decision, reason: a.reason, at: a.at });
    S.audit = []; S.joinTokens = []; S.jobs.clear(); for (const l of S.lanes.values()) l.length = 0; S.waits = []; S.pendingUsage.clear();
    log('브리지 상태 초기화(시드)'); pushQueue(true);
    return json(res, 200, { ok: true, at: kst() });
  }
  if (p === '/llm') return json(res, 200, S.llm && Date.now() - S.llmAt < 120000 ? S.llm : {});
  if (p === '/control') { const j = S.jobs.get(url.searchParams.get('job_id')); return json(res, 200, j ? { state: j.state, priority: j.priority, cancel: j.state === 'cancelled' } : { state: null, cancel: true }); }
  if (p === '/event' && req.method === 'POST') {
    const b = (await body(req)) || {}; const d = b.data || {}; const j = d.job_id ? S.jobs.get(d.job_id) : null;
    switch (b.event) {
      case 'vram': S.wvram.set(d.worker, { ...d, _t: Date.now() }); break;
      case 'vram.release': S.wvram.delete(d.worker); break;
      case 'job.started':
        if (j && j.state === 'queued') {
          let ws = d.workers || [];
          if (j.pool === 'a6000' && ws.length > HEAVY_MAX) { log(`전력 규칙: ${j.id} 워커 ${ws.join(',')} → ${ws.slice(0, HEAVY_MAX).join(',')} 로 자름(동시 고부하 ≤ ${HEAVY_MAX})`); ws = ws.slice(0, HEAVY_MAX); }
          j.state = 'running'; j.started_at = kst(); j.workers = ws; j.shards_total = d.shards_total ?? j.shards_total;
          S.waits.push({ pool: j.pool, s: (Date.parse(j.started_at) - Date.parse(j.created_at)) / 1000 });
          laneOpen(j, j.workers); jobState(j); pushQueue(true);
        }
        break;
      case 'shard.done':
        if (j && j.state === 'running') {
          j.shards_done++; const gs = (d.ms || 0) / 1000; j.gpu_s.value = +(j.gpu_s.value + gs).toFixed(2); j.gpu_s.as_of = kst();
          if (d.n) { j.counts.vehicle = (j.counts.vehicle || 0) + d.n; }
          if (d.chips_per_s != null) j.chips_per_s = E(d.chips_per_s, 'chips_per_s', 'measured', 'gpu_worker 계량', '창 10s');
          const pu = S.pendingUsage.get(j.tenant_id) || { amount: 0, job_id: j.id }; pu.amount += gs; pu.job_id = j.id; S.pendingUsage.set(j.tenant_id, pu);
        }
        break;
      case 'job.done': case 'job.failed': case 'job.cancelled':
        if (j && j.state !== 'cancelled') { j.state = b.event.split('.')[1] === 'done' ? 'done' : b.event.split('.')[1]; j.finished_at = kst(); j.error = d.error || null; laneClose(j, j.state); jobState(j); pushQueue(true); }
        else if (j) { laneClose(j, 'cancelled'); pushQueue(true); }
        break;
      default: return fail(res, 'not_found', 400, '모르는 워커 이벤트');
    }
    return json(res, 200, { ok: true, state: j?.state ?? null });
  }
  return fail(res, 'not_found', 404, '워커 경로 없음');
}

/* ══ 게이트웨이 중계(F1-B :8700 가 떠 있을 때) ═══════════════════════
 * 브리지는 게이트웨이 DB 를 쓰지 않는다(배포·쿼터 쓰기는 브리지 메모리 — 다른 에픽이 보는 정본 상태를 시연으로 오염시키지 않는다).
 * 대신 게이트웨이의 job.state · queue.sample · usage.delta · alert 를 읽기 전용으로 중계한다 → F1-B J1 이 돌면 관제 스윔레인·계량에 같은 시각에 뜬다.
 * 게이트웨이 job 의 취소·재큐·우선순위는 게이트웨이로 대리 호출(계약 §4.4). */
const GW = { token: null, at: 0, sse: null, queue: null, jobs: new Map(), caps: {}, capsAt: 0, lastEvent: null, events: 0 };
async function gwFetch(p, { method = 'GET', body: b } = {}) {
  try {
    const ac = new AbortController(); const t = setTimeout(() => ac.abort(), 2500);
    const r = await fetch(GATEWAY + '/api/v1' + p, { method, signal: ac.signal, headers: { accept: 'application/json', ...(GW.token ? { authorization: 'Bearer ' + GW.token } : {}), ...(b ? { 'content-type': 'application/json' } : {}) }, body: b ? JSON.stringify(b) : undefined });
    clearTimeout(t); const j = await r.json().catch(() => null); return { status: r.status, j };
  } catch { return { status: 0, j: null }; }
}
async function gwLogin() {
  if (GW.token && Date.now() - GW.at < 30 * 60e3) return GW.token;
  const pw = devPassword(); if (!pw) return null;
  const { status, j } = await gwFetch('/auth/login', { method: 'POST', body: { realm: 'lx', login: 'lx-admin', password: pw } });
  if (status === 200 && j?.token) { GW.token = j.token; GW.at = Date.now(); return j.token; }
  GW.token = null; return null;
}
const GW_NEEDS = ['/ops/nodes', '/ops/gpus', '/ops/queues', '/ops/storage', '/ops/alerts', '/ops/models', '/ops/tenants', '/ops/bench', '/deploys', '/tenants', '/registry/models', '/registry/cards', '/jobs?limit=1'];
// 선택 경로(v1.1 — 다른 에픽이 올리는 중): 있으면 화면이 쓰고, 없으면 부르지 않는다(브라우저 404 콘솔 0)
const GW_OPT = { survey: '/survey/findings?limit=1', survey_stats: '/survey/stats?by=state' };
async function gwCaps() {
  if (Date.now() - GW.capsAt < 30000) return GW.caps;
  GW.capsAt = Date.now(); if (!(await gwLogin())) { GW.caps = {}; GW.opt = {}; return GW.caps; }
  const out = {}; await Promise.all(GW_NEEDS.map(async (p) => { out[p] = (await gwFetch(p)).status; })); GW.caps = out;
  const opt = {}; await Promise.all(Object.entries(GW_OPT).map(async ([k, p]) => { opt[k] = (await gwFetch(p)).status; })); GW.opt = opt;
  return out;
}
function gwStream() {
  if (GW.sse || shuttingDown || !GW.token) return;
  const u = new URL(GATEWAY + '/api/v1/events/ops'); u.searchParams.set('access_token', GW.token);
  const req = http.get(u, { headers: { accept: 'text/event-stream' } }, (res) => {
    if (res.statusCode !== 200) { res.resume(); GW.sse = null; GW.sseStatus = res.statusCode; setTimeout(gwStream, 15000).unref(); return; }
    GW.sseStatus = 200; log('게이트웨이 /events/ops 중계 시작');
    let buf = ''; res.setEncoding('utf8');
    res.on('data', (c) => {
      buf += c.replace(/\r/g, ''); let i;
      while ((i = buf.indexOf('\n\n')) >= 0) {
        const block = buf.slice(0, i); buf = buf.slice(i + 2);
        let ev = null; let data = '';
        for (const line of block.split('\n')) { if (line.startsWith('event:')) ev = line.slice(6).trim(); else if (line.startsWith('data:')) data += line.slice(5).trim(); }
        if (!ev || !data) continue; let d = null; try { d = JSON.parse(data); } catch { continue; }
        GW.events++; GW.lastEvent = kst(); gwEvent(ev, d);
      }
    });
    res.on('end', () => { GW.sse = null; if (!shuttingDown) setTimeout(gwStream, 5000).unref(); });
    res.on('error', () => { GW.sse = null; });
  });
  req.on('error', () => { GW.sse = null; setTimeout(gwStream, 15000).unref(); });
  GW.sse = req;
}
function gwEvent(ev, d) {
  if (ev === 'job.state') { GW.jobs.set(d.job_id, { ...(GW.jobs.get(d.job_id) || {}), ...d }); emit('job.state', { ...d, via: 'gateway' }); }
  else if (ev === 'queue.sample') { GW.queue = d; pushQueue(true); }
  else if (ev === 'usage.delta') {
    const u = S.usage.find((x) => x.tenant_id === d.tenant_id);
    if (u && u.dims[d.dim]) { const e = u.dims[d.dim].used; e.value = +((e.value || 0) + (Number(d.amount) || 0)).toFixed(2); e.as_of = kst(); e.source = 'usage_events(게이트웨이 중계)'; forecast(u); }
    emit('usage.delta', { ...d, via: 'gateway' });
  } else if (ev === 'alert') emit('alert', { ...d, via: 'gateway' });
  else if (ev === 'deploy.changed' || ev === 'finding.state' || ev === 'job.recovered') emit(ev, { ...d, via: 'gateway' });   // v1.1-15 · 16 · 22 — 서비스 층의 쓰기가 관리 층에 실시간
}
setInterval(async () => { if (await gatewayUp()) { await gwLogin(); gwStream(); } }, 5000).unref();

async function gatewayUp() {
  if (Date.now() - S.gateway.checked < 5000) return S.gateway.up;
  S.gateway.checked = Date.now();
  try { const ac = new AbortController(); const t = setTimeout(() => ac.abort(), 400); const r = await fetch(GATEWAY + '/api/v1/health', { signal: ac.signal }); clearTimeout(t); const j = r.ok ? await r.json() : null; S.gateway.up = !!(j && j.ok && !j.bridge); S.gateway.health = j; }
  catch { S.gateway.up = false; }
  return S.gateway.up;
}

/* ══ 게이트웨이 직결 모드의 감사·결재 읽기 — 게이트웨이에 /ops/audit · /approvals 가 없어(계약 밖) 정본 DB 를 읽기만 한다 ══
 * 관리자 확인: 요청의 Bearer(게이트웨이 토큰)로 게이트웨이 /me → realm lx · role admin 일 때만. */
const meCache = new Map();
async function gwRead(req, res, url, kind) {
  const o = req.headers.origin; if (o && !ORIGINS.has(o)) return fail(res, 'forbidden', 403, ':8702 전용');
  const tok = (req.headers.authorization || '').replace(/^Bearer /, '') || url.searchParams.get('access_token');
  if (!tok) return fail(res, 'unauthorized', 401, '로그인 필요');
  let me = meCache.get(tok);
  if (!me || Date.now() - me.t > 60000) {
    try { const ac = new AbortController(); const t = setTimeout(() => ac.abort(), 2500); const r = await fetch(GATEWAY + '/api/v1/me', { signal: ac.signal, headers: { authorization: 'Bearer ' + tok } }); clearTimeout(t); me = { t: Date.now(), ok: r.ok, j: r.ok ? await r.json() : null }; }
    catch { me = { t: Date.now(), ok: false, j: null }; }
    meCache.set(tok, me);
  }
  if (!me.ok || me.j?.realm !== 'lx' || me.j?.role !== 'admin') return fail(res, 'forbidden', 403, '관리자 전용');
  const args = ['server/ops/audit_read.py', kind, '--limit', String(Math.min(200, Number(url.searchParams.get('limit')) || 50))];
  const subj = url.searchParams.get('subject'); if (subj && /^[\w.@:-]{1,80}$/.test(subj)) args.push('--subject', subj);
  const out = await new Promise((resolve) => { let b = ''; const c = spawn(PY, args, { cwd: ROOT, env: { ...process.env, PYTHONIOENCODING: 'utf-8' }, windowsHide: true }); c.stdout.on('data', (d) => { b += d.toString('utf8'); }); c.on('close', () => resolve(b)); c.on('error', () => resolve('')); setTimeout(() => { try { c.kill(); } catch { /* */ } }, 10000).unref(); });
  let j = null; try { j = JSON.parse(out); } catch { j = { items: [], total: 0, error: 'audit_read 실패' }; }
  return json(res, j.error ? 503 : 200, { ...j, as_of: kst() });
}

/* ══ 서버 ═════════════════════════════════════════════════════════ */
const server = http.createServer(async (req, res) => {
  let url; try { url = new URL(req.url, `http://localhost:${PORT}`); } catch { return send(res, 400, 'text/plain', 'bad url'); }
  let p; try { p = decodeURIComponent(url.pathname); } catch { return send(res, 400, 'text/plain', 'bad path'); }
  try {
    if (p === '/' || p === '/landxi/ops') { res.writeHead(302, { location: '/landxi/ops/' }); return res.end(); }
    if (p === '/favicon.ico') { res.writeHead(204); return res.end(); }
    const B = '/landxi/ops/bridge';
    if (p === B + '/health') {
      const up = await gatewayUp(); const caps = up ? await gwCaps() : {};
      const bad = Object.entries(caps).filter(([, v]) => v !== 200).map(([k, v]) => `${k.replace('?limit=1', '')} ${v}`);
      return json(res, 200, { ok: true, bridge: true, at: kst(), started: S.started,
        gateway: { base: GATEWAY, up, full: up && Object.keys(caps).length > 0 && bad.length === 0, bad, relay: { sse: GW.sseStatus || null, events: GW.events, last_event: GW.lastEvent },
          recovered_at_boot: S.gateway.health?.recovered_at_boot ?? null, version: S.gateway.health?.version ?? null, workers: S.gateway.health?.workers ?? null, opt: up ? (GW.opt || {}) : {} },
        pollers: { gpu: { ...S.pollers.gpu, last_sample_age_s: S.gpuAt ? +((Date.now() - S.gpuAt) / 1000).toFixed(1) : null }, storage: { ...S.pollers.storage, last_sample_age_s: S.storageAt ? +((Date.now() - S.storageAt) / 1000).toFixed(1) : null }, llm: { ...S.pollers.llm, last_sample_age_s: S.llmAt ? +((Date.now() - S.llmAt) / 1000).toFixed(1) : null } },
        dev_password_configured: !!devPassword(), workers_live: [...S.wvram.keys()],
        // 로그인 전 종이 무대 '관제 요약 한 줄' — 공개 최소치(수치 봉투는 로그인 뒤 /ops/*)
        summary: { nodes_up: S.nodes.filter((n) => n.state === 'up' && S.gpuAt && Date.now() - S.gpuAt < 10000).length, nodes_pending: S.nodes.filter((n) => n.state === 'pending').length,
          gpus: S.gpu?.gpus?.length ?? null, queued: [...S.jobs.values()].filter((j) => j.state === 'queued').length, running: [...S.jobs.values()].filter((j) => j.state === 'running').length,
          alerts_open: S.alerts.filter((a) => !a.closed_at).length, last_check: S.lastCheck || null, source: 'nvidia-smi · gpu_poller 2s', basis: S.gpu ? 'measured' : null } });
    }
    if (p.startsWith(B + '/api/v1/')) {
      const o = req.headers.origin;
      if (o && ORIGINS.has(o)) res.setHeader('access-control-allow-origin', o);
      if (req.method === 'OPTIONS') { res.writeHead(204, { 'access-control-allow-methods': 'GET,POST,PUT', 'access-control-allow-headers': 'authorization,content-type' }); return res.end(); }
      return await api(req, res, url, p.slice((B + '/api/v1').length));
    }
    if (p.startsWith(B + '/worker/')) return await worker(req, res, url, p.slice((B + '/worker').length));
    if (p === B + '/gw/audit' || p === B + '/gw/approvals' || p === B + '/gw/llm') return await gwRead(req, res, url, p.split('/').pop());
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'text/plain', '405');
    return serveStatic(req, res, p);
  } catch (e) { log('오류', e); if (!res.headersSent) fail(res, 'internal', 500, String(e.message)); }
});
server.listen(PORT, () => {
  log(`LX/OPS http://localhost:${PORT}/landxi/ops/  (root ${ROOT} · data ${fs.existsSync(path.join(ROOT, 'landxi', 'data')) ? 'junction' : DATA_ROOT})`);
  if (!NO_POLLERS) {
    startPoller('gpu', ['server/ops/gpu_poller.py', '--stdout', '--interval', '2', '--lms', '100', '--worker-vram-url', `http://127.0.0.1:${PORT}/landxi/ops/bridge/worker/vram`, '--llm-url', `http://127.0.0.1:${PORT}/landxi/ops/bridge/worker/llm`]);
    startPoller('storage', ['server/ops/storage_poller.py', '--stdout', '--interval', '60']);
    startPoller('llm', ['server/ops/llm_poller.py', '--stdout', '--interval', String(Number(process.env.OPS_LLM_INTERVAL) || 3)]);
  } else log('OPS_NO_POLLERS=1 — 폴러 없이(리플레이 확인용)');
});
