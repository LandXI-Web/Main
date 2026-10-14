// 짧은 동시 부하: 세 입구로 로그인 → 화면들이 부르는 GET 들을 N 동시로 DUR 초 동안. 상태별 수 · 느린 요청 기록.
import fs from 'node:fs';
const ROOT = 'E:/Land-XI 플랫폼/01. 디자인';
const PW = (fs.readFileSync(ROOT + '/server/.env', 'utf8').match(/^DEV_PASSWORD=(.*?)\s*$/m) || [])[1];
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const DUR = +arg('--dur', 30) * 1000, CONC = +arg('--conc', 12), OUT = arg('--out', '');
const H = { app: 'https://app.land-xi.dev', admin: 'https://admin.land-xi.dev', gov: 'https://namwon.land-xi.dev' };
async function login(base, login, tenant) {
  const r = await fetch(base + '/api/v1/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ login, password: PW, ...(tenant ? { tenant_id: tenant } : {}) }) });
  const j = await r.json(); if (!j.token) throw new Error('login ' + base + ' ' + r.status + ' ' + JSON.stringify(j).slice(0, 200)); return j.token;
}
const T = { app: await login(H.app, 'test@lx.or.kr'), admin: await login(H.admin, 'lxadmin@lx.or.kr'), gov: await login(H.gov, 'lxadmin@lx.or.kr', 'namwon') };
const P = {
  app: ['/me', '/auth/session', '/deploys', '/registry/cards', '/registry/models', '/cards/deck', '/regions', '/summary', '/reviews/notify', '/reviews', '/projects', '/projects/notices', '/jobs', '/catalog/layers', '/national/sets', '/national/progress', '/survey/findings', '/survey/stats', '/training/samples', '/ximap/edits', '/public/stats', '/announcements', '/requests'],
  admin: ['/me', '/ops/gpus', '/ops/tenants', '/tenants', '/approvals', '/ops/storage', '/ops/queues', '/ops/nodes', '/ops/models', '/ops/llm/models', '/accounts/requests', '/accounts/summary', '/requests/manage', '/retrain', '/deploys', '/summary'],
  gov: ['/me', '/brand/namwon', '/brand/namwon/main', '/spaces/me', '/spaces/me/report', '/spaces/me/report/services', '/spaces/me/ledger/compare', '/spaces/me/guides/card-farm', '/spaces/me/guides/card-farm/parcels', '/requests', '/requests/services', '/requests/shared-imagery', '/shoots', '/t/namwon/survey/ledger-schema', '/survey/rules', '/auth/tenants', '/deploys'],
};
const jobs = []; for (const k of Object.keys(P)) for (const p of P[k]) jobs.push([k, p]);
const stat = {}, slow = [], fails = []; let n = 0; const t0 = Date.now();
async function one() {
  const [k, p] = jobs[Math.floor(Math.random() * jobs.length)];
  const s = Date.now(); let st;
  try { const r = await fetch(H[k] + '/api/v1' + p, { headers: { authorization: 'Bearer ' + T[k] }, signal: AbortSignal.timeout(60000) }); st = r.status; await r.arrayBuffer(); }
  catch (e) { st = 'ERR:' + (e.cause?.code || e.name); }
  const ms = Date.now() - s; n++;
  stat[st] = (stat[st] || 0) + 1;
  if (ms > 3000) slow.push({ at: new Date(s).toISOString(), k, p, ms, st });
  if (!(st >= 200 && st < 400)) fails.push({ at: new Date(s).toISOString(), k, p, ms, st });
}
await Promise.all(Array.from({ length: CONC }, async () => { while (Date.now() - t0 < DUR) await one(); }));
const res = { dur_s: DUR / 1000, conc: CONC, requests: n, status: stat, slow_over_3s: slow.length, slowest: slow.sort((a, b) => b.ms - a.ms).slice(0, 15), fails: fails.slice(0, 30) };
console.log(JSON.stringify(res, null, 1));
if (OUT) fs.writeFileSync(OUT, JSON.stringify(res, null, 1));
