// F1-C · 계약 — 픽스처 키 집합 = F1-B server/fixtures/contract(있을 때) · 봉투 형 · 폴러 단독(--stdout) · Redis 키(계약 §5.3) · 리플레이 형식
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import net from 'node:net';
import { execFileSync } from 'node:child_process';

const FX = 'landxi/ops/data/fixtures/';
const CT = 'server/fixtures/contract/';
const PAIRS = { 'ops-gpus': 'ops_gpus', 'ops-nodes': 'ops_nodes', 'ops-queues': 'ops_queues', 'ops-storage': 'ops_storage', 'ops-alerts': 'ops_alerts', 'ops-models': 'ops_models', 'ops-tenants': 'ops_tenants', bench: 'ops_bench', deploys: 'deploys_list', tenants: 'tenants', 'registry-models': 'registry_models', 'registry-cards': 'registry_cards' };
const OPAQUE = new Set(['aoi', 'region_name', 'name', 'by_tenant', 'ext', 'metrics', 'approvals', 'classes', 'counts']);
function keys(o, p = '', out = new Set()) {
  if (Array.isArray(o)) { for (const x of o) keys(x, p + '[].', out); return out; }
  if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) { out.add(p + k); if (k === 'dims') { for (const dv of Object.values(v)) keys(dv, p + 'dims.*.', out); } else if (!OPAQUE.has(k)) keys(v, p + k + (Array.isArray(v) ? '' : '.'), out); }
  return out;
}
const isEnv = (e) => e && typeof e === 'object' && 'value' in e && typeof e.unit === 'string' && ['measured', 'estimate', 'demo', 'history', 'inferred', 'recorded'].includes(e.basis) && typeof e.as_of === 'string' && typeof e.source === 'string';
const PY = process.env.LX_PYTHON || 'python';

test('픽스처 키 집합 ⊇ 계약 예시(F1-B contract 본문 · optional 제외)', async () => {
  test.skip(!fs.existsSync(CT), 'F1-B contract 픽스처 없음');
  const miss = {};
  for (const [a, b] of Object.entries(PAIRS)) {
    if (!fs.existsSync(CT + b + '.json')) continue;
    const mine = JSON.parse(fs.readFileSync(FX + a + '.json', 'utf8')); const th = JSON.parse(fs.readFileSync(CT + b + '.json', 'utf8'));
    const opt = new Set(th.optional || []); const km = keys(mine); const kt = keys(th.body ?? th);
    // 비어 있는 목록(대기열 블록 · 외부 프로세스 0 인 GPU)은 하위 키를 검사할 수 없다 → 그 목록이 비었으면 통과
    const real = [...kt].filter((k) => !km.has(k) && !opt.has(k.split('.').pop()) && !(k.includes('[].') && emptyAt(mine, k.slice(0, k.lastIndexOf('[].')))));
    if (real.length) miss[a] = real;
  }
  expect(miss).toEqual({});
});
function emptyAt(o, head) {   // head 경로의 목록이 전부 비었는가
  const parts = head.split('[].');
  let cur = [o];
  for (let i = 0; i < parts.length; i++) {
    const next = [];
    for (const c of cur) { const v = parts[i].split('.').filter(Boolean).reduce((x, k) => (x ? x[k] : undefined), c); if (Array.isArray(v)) next.push(...v); else if (v !== undefined) next.push(v); }
    cur = next; if (!cur.length) return true;
  }
  return false;
}

test('봉투 — GPU·스토리지·쿼터·배포 규모의 숫자는 전부 봉투(basis 여섯 중 하나)', async () => {
  const g = JSON.parse(fs.readFileSync(FX + 'ops-gpus.json', 'utf8'));
  for (const x of g.gpus) for (const k of ['util_pct', 'mem_used_mib', 'mem_total_mib', 'temp_c', 'power_w', 'external_used_mib']) expect(isEnv(x[k]), k).toBe(true);
  const s = JSON.parse(fs.readFileSync(FX + 'ops-storage.json', 'utf8'));
  for (const v of s.volumes) { expect(isEnv(v.free_gb)).toBe(true); expect(isEnv(v.total_gb)).toBe(true); }
  const t = JSON.parse(fs.readFileSync(FX + 'ops-tenants.json', 'utf8'));
  expect(t.items.map((u) => u.tenant_id)).toEqual(['lx', 'namwon', 'gwangju-jeonnam', 'kgz-agri', 'kgz-land', 'lx-demo']);
  for (const u of t.items) for (const d of Object.values(u.dims)) expect(isEnv(d.used)).toBe(true);
  const d = JSON.parse(fs.readFileSync(FX + 'deploys.json', 'utf8'));
  for (const x of d.items) expect(isEnv(x.scale), x.id).toBe(true);
  expect(d.items.find((x) => x.id === 'dp-nw-farm-25').scale.value).toBe(2098);
  expect(d.items.some((x) => x.id === 'dp-kgz-land-change-26')).toBe(true);   // off 픽스처에만
});

test('폴러 단독 실행(--stdout --once) — GpuSample · /ops/storage 형', async () => {
  const env = { ...process.env, PYTHONIOENCODING: 'utf-8' };
  const g = JSON.parse(execFileSync(PY, ['server/ops/gpu_poller.py', '--stdout', '--once', '--redis', ''], { env, encoding: 'utf8', timeout: 30000 }));
  expect(g.node).toBe('node-tr3995wx'); expect(g.gpus.length).toBeGreaterThanOrEqual(1);
  for (const x of g.gpus) { expect(isEnv(x.util_pct)).toBe(true); expect(x.mode).toBeTruthy(); expect(Array.isArray(x.external)).toBe(true); expect(x.worker).toMatch(/^a6000-\d$/); }
  const s = JSON.parse(execFileSync(PY, ['server/ops/storage_poller.py', '--stdout', '--once', '--redis', ''], { env, encoding: 'utf8', timeout: 60000 }));
  expect(s.volumes.map((v) => v.mount)).toEqual(['E:', 'D:', 'C:']); expect(s.by_tier.raw.value).toBeNull(); expect(isEnv(s.by_tier.tile)).toBe(true);
});

function resp(cmds) {
  return new Promise((res, rej) => {
    const sock = net.connect(6380, 'localhost'); let buf = ''; const out = [];
    sock.setTimeout(2000, () => { sock.destroy(); rej(new Error('timeout')); });
    sock.on('error', rej);
    sock.on('connect', () => { for (const c of cmds) sock.write(`*${c.length}\r\n` + c.map((a) => `$${Buffer.byteLength(String(a))}\r\n${a}\r\n`).join('')); });
    sock.on('data', (d) => { buf += d.toString('utf8'); if ((buf.match(/\r\n/g) || []).length >= cmds.length && out.length === 0) { setTimeout(() => { sock.end(); res(buf); }, 150); out.push(1); } });
  });
}
test('Redis 키 형식 = 계약 §5.3 (ops:gpu:{node}:{idx} hash · ops:gpu stream · node:{id} TTL ≤ 30 · ops:storage hash)', async () => {
  let r = null; try { r = await resp([['PING']]); } catch { r = null; }
  test.skip(!r || !r.includes('PONG'), 'Redis :6380 없음');
  const out = await resp([['TYPE', 'ops:gpu:node-tr3995wx:0'], ['TYPE', 'ops:gpu'], ['TTL', 'node:node-tr3995wx'], ['HEXISTS', 'ops:gpu:node-tr3995wx:0', 'util_pct'], ['HEXISTS', 'ops:gpu:node-tr3995wx:0', 'json'], ['TYPE', 'ops:storage'], ['XLEN', 'ops:gpu']]);
  const lines = out.split('\r\n');
  expect(lines[0]).toBe('+hash'); expect(lines[1]).toBe('+stream');
  const ttl = Number(lines[2].slice(1)); expect(ttl).toBeGreaterThan(0); expect(ttl).toBeLessThanOrEqual(30);
  expect(lines[3]).toBe(':1'); expect(lines[4]).toBe(':1'); expect(lines[5]).toBe('+hash');
  const xlen = Number(lines[6].slice(1)); expect(xlen).toBeGreaterThan(0); expect(xlen).toBeLessThanOrEqual(3700);
});

test('리플레이 ops-sample.ndjson — 2s × 30 · gpu.sample · util 0 고정 · basis demo(지어낸 부하 0)', async () => {
  const lines = fs.readFileSync('landxi/ops/data/replay/ops-sample.ndjson', 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  const g = lines.filter((l) => l.event === 'gpu.sample');
  expect(g.length).toBe(30); expect(g.at(-1).t).toBe(58000);
  for (const l of g) for (const x of l.data.gpus) { expect(x.util_pct.value).toBe(0); expect(x.util_pct.basis).toBe('demo'); }
});
