// F1-D · 계약 형 검사(F1-CONTRACT §2 · §4.1 · §4.7 · §5.1 · §13) — 픽스처 키 집합 · 봉투 · 리플레이 이벤트 · 사전 수집 6파일 source/fetched_at/license
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const API = process.env.LX_API === 'on' ? (process.env.LX_API_BASE || 'http://localhost:8700') : null;
async function bootApi(page, url, { realm = 'lx', role = 'staff', tenant = null } = {}) {   // F1-CONTRACT §12 복사(_roles.mjs import 금지)
  let session = null;
  if (API) {
    const r = await fetch(API + '/api/v1/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(realm === 'lx' ? { realm, login: `lx-${role}`, password: process.env.DEV_PASSWORD } : { realm, tenant_id: tenant, login: `${tenant}-manager`, password: process.env.DEV_PASSWORD }) });
    session = await r.json();
  }
  await page.addInitScript(([s, api, realm, role, tenant]) => {
    if (sessionStorage.getItem('lx_e2e_boot')) return; sessionStorage.setItem('lx_e2e_boot', '1');
    if (api) localStorage.setItem('lx_api_base', api); else localStorage.setItem('lx_api_mode', 'off');
    if (s) localStorage.setItem('lx_api_session', JSON.stringify(s));
    if (realm === 'lx') { localStorage.setItem('lx_logged_in', '1'); localStorage.setItem('lx_role', role); localStorage.removeItem('lx_tenant_session'); }
    else { localStorage.removeItem('lx_logged_in'); localStorage.removeItem('lx_role'); localStorage.setItem('lx_tenant_session', JSON.stringify({ tenant, at: '2026-09-24T09:00:00+09:00' })); }
  }, [session, API, realm, role, tenant]);
  await page.goto(url);
  await page.waitForFunction(() => document.documentElement.dataset.lx === 'ready', null, { timeout: 30000 });
}
function watch(page) {
  const errs = [];
  page.on('console', (m) => { if (m.type() === 'error' && !/CORS policy|net::ERR_FAILED|ERR_CONNECTION_RESET|ERR_HTTP2_SERVER_REFUSED_STREAM|ERR_NO_BUFFER_SPACE/.test(m.text())) errs.push(m.text()); });   // F2-D: 외부 타일 원천(EOX · PC · GIBS) CORS 간헐 거절은 별도 분류(F1-D 요청 4)
  page.on('pageerror', (e) => errs.push('pageerror ' + e.message));
  return errs;
}

const ROOT = path.resolve('.');
const G = path.join(ROOT, 'landxi/global/data');
const J = (f) => JSON.parse(fs.readFileSync(path.join(G, f), 'utf8'));
const LAYER_KEYS = ['id', 'name', 'kind', 'role', 'source', 'set', 'path', 'url', 'tiles', 'scheme', 'layer', 'promote_id', 'minzoom', 'maxzoom', 'bounds', 'gsd_m', 'epoch', 'crs', 'tier', 'license', 'attribution', 'export_policy', 'security_review', 'rights_holder', 'ladder', 'count', 'signed'];
const DEPLOY_KEYS = ['id', 'name', 'tenant_id', 'card_id', 'card_version_id', 'version', 'prev_card_version_id', 'region_profile', 'region_name', 'aoi', 'stage', 'pinned', 'gpu_pool', 'from_deploy_id', 'modules', 'model_override', 'snapshot_current', 'snapshot_prev', 'year', 'status_history', 'scale', 'basis', 'approvals', 'created_at', 'updated_at'];
const JOB_EVENTS = ['job.queued', 'job.started', 'shard.started', 'shard.done', 'shard.failed', 'job.progress', 'job.done', 'snapshot.ready', 'job.failed', 'job.cancelled', 'index.month'];
const BASIS = ['measured', 'estimate', 'demo', 'history', 'inferred', 'recorded'];
function envs(o, out = [], at = '$') {
  if (Array.isArray(o)) o.forEach((x, i) => envs(x, out, at + '[' + i + ']'));
  else if (o && typeof o === 'object') { if ('basis' in o && 'unit' in o) out.push([at, o]); for (const k of Object.keys(o)) envs(o[k], out, at + '.' + k); }
  return out;
}

test.describe('F1-D contract', () => {
  test('사전 수집 6파일 존재 · source · fetched_at · license', () => {
    const six = ['kgz-adm1.geojson', 'kgz-adm2.geojson', 'lx-countries.json', 'ysykata-landcover.json', 'pc-mosaics.json', 'kgz-sprawl-2017-2025.json', 'mm-meiktila-damage.geojson'];
    for (const f of six) {
      const j = J(f); const m = j.lx || j;
      expect(m.source, f).toBeTruthy(); expect(m.fetched_at, f).toMatch(/^20\d\d-/); expect(m.license, f).toBeTruthy();
    }
    expect(J('lx-countries.json').countries.length).toBe(36);
    expect(J('lx-countries.json').points[0].lnglat).toEqual([142.7, 50.3]);
    expect(Object.keys(J('pc-mosaics.json').months)).toEqual(['2025-03', '2025-04', '2025-05', '2025-06', '2025-07', '2025-08', '2025-09', '2025-10']);
    const crop = J('ysykata-landcover.json').classes.find((c) => c.code === 40);
    expect(crop.pct.value).toBe(33.0); expect(crop.pct.note).toContain('ratio only valid');
    const d = J('mm-meiktila-damage.geojson');
    expect(d.features.length).toBe(38);
    expect([d.lx.counts.Destroyed.value, d.lx.counts.Damaged.value, d.lx.counts['Possibly damaged'].value]).toEqual([4, 23, 11]);
    expect(J('kgz-adm2.geojson').features.find((f) => f.properties.code === '92254566B31675215078110').properties.name_cyr).toBe('Ысык-Ата');
    expect(fs.existsSync(path.join('E:/Land-XI 플랫폼/02. 데이터/global/kgz-adm2.geojson'))).toBe(true);
  });

  test('모든 봉투 = value · unit · basis(6) · as_of · source (§2)', () => {
    for (const f of fs.readdirSync(G).filter((x) => /\.(json|geojson)$/.test(x))) {
      for (const [at, e] of envs(J(f))) {
        expect(e, f + at).toHaveProperty('value'); expect(typeof e.unit, f + at).toBe('string');
        expect(BASIS, f + at).toContain(e.basis); expect(typeof e.as_of, f + at).toBe('string'); expect(typeof e.source, f + at).toBe('string');
      }
    }
  });

  test('catalog-fixture-global = LayerItem 키 집합(§4.1) · deploys-fixture = Deploy 키 집합(§4.7) · 시드 ID', () => {
    const c = J('catalog-fixture-global.json');
    for (const it of c.items) for (const k of LAYER_KEYS) expect(it, it.id + ' ' + k).toHaveProperty(k);
    expect(c.ladder.global[0]).toBe('gibs-viirs-truecolor');
    const maxar = c.items.find((i) => i.id === 'maxar-mm-meiktila');
    expect(maxar.license).toBe('CC BY-NC 4.0'); expect(maxar.export_policy).toBe('never');
    const d = J('deploys-fixture.json');
    for (const it of d.items) for (const k of DEPLOY_KEYS) expect(it, it.id + ' ' + k).toHaveProperty(k);
    expect(d.items.map((x) => x.id).sort()).toEqual(['dp-kgz-agri-farm-26', 'dp-kgz-land-change-26', 'dp-mm-meiktila-25']);
    expect(d.items.find((x) => x.id === 'dp-kgz-agri-farm-26').stage).toBe('canary');
    expect(d.items.find((x) => x.id === 'dp-mm-meiktila-25').stage).toBe('shadow');
    // F1-B 계약 픽스처가 도착했으면 키 집합 비교(§13)
    const cf = path.join(ROOT, 'server/fixtures/contract');
    if (fs.existsSync(cf)) for (const f of ['catalog_layers.json', 'deploy.json', 'deploys_list.json'].filter((x) => fs.existsSync(path.join(cf, x)))) {
      const ref = JSON.parse(fs.readFileSync(path.join(cf, f), 'utf8')); const b = ref.body || ref; const r = b.items ? b.items[0] : b;
      for (const mine of (/layer/.test(f) ? c.items : d.items)) for (const k of Object.keys(r)) expect(mine, f + ' ' + mine.id + ' ' + k).toHaveProperty(k);
    }
  });

  test('리플레이 gj1-ysykata.ndjson — §5.1 이벤트 이름만 · t 단조 · 8 shard m{YYYY-MM} · index.month 봉투', () => {
    const lines = fs.readFileSync(path.join(G, 'replay/gj1-ysykata.ndjson'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
    let t = -1;
    for (const l of lines) { expect(JOB_EVENTS).toContain(l.event); expect(l.t).toBeGreaterThanOrEqual(t); t = l.t; }
    const im = lines.filter((l) => l.event === 'index.month');
    expect(im.map((l) => l.data.shard_id)).toEqual(['m2025-03', 'm2025-04', 'm2025-05', 'm2025-06', 'm2025-07', 'm2025-08', 'm2025-09', 'm2025-10']);
    for (const l of im) { expect(BASIS).toContain(l.data.ndvi_mean.basis); expect(l.data.ndvi_mean.unit).toBe('ndvi'); expect(l.data.n_scenes).toBeGreaterThan(0); }
    expect(lines[0].event).toBe('job.queued'); expect(lines[lines.length - 1].event).toBe('job.done');
  });

  test('어댑터 ADAPTER 상수(§7) — 워커 스캔 형', () => {
    const src = fs.readFileSync(path.join(ROOT, 'server/adapters/global/adapter_ndvi_pc.py'), 'utf8');
    const m = /ADAPTER = (\{[^}]+\})/.exec(src);
    expect(m).toBeTruthy();
    for (const k of ['"id": "index/ndvi_pc"', '"kinds": ["index"]', '"device": "cpu"', '"input": "params"', '"output": "metrics"']) expect(m[1]).toContain(k);
  });
});
