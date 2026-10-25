// API 응답 시간 재기(로그인 폼 한 번) 사용: node api-time.mjs <역할> <경로,경로...> [반복]
import path from 'node:path'; import fs from 'node:fs'; import { pathToFileURL } from 'node:url';
const ROOT = 'E:/Land-XI 플랫폼/01. 디자인'; process.chdir(ROOT);
process.env.LX_PW ||= fs.readFileSync(ROOT + '/server/.env', 'utf8').match(/^DEV_PASSWORD=(.*?)\s*$/m)?.[1];
const { launch, login } = await import(pathToFileURL(path.join(ROOT, 'tools/check/common.mjs')).href);
const role = process.argv[2]; const paths = process.argv[3].split(','); const n = Number(process.argv[4] || 5);
const b = await launch(); const s = await login(b, role);
const tok = await s.page.evaluate(() => { try { return JSON.parse(localStorage.getItem('lx_api_session')).token; } catch { return null; } });
const hd = tok ? { authorization: 'Bearer ' + tok } : {};
for (const p of paths) { const ts = []; let size = 0, st = 0;
  for (let i = 0; i < n; i++) { const t = Date.now(); const r = await s.page.request.get(s.home + '/api/v1' + p, { headers: hd }); const body = await r.body(); ts.push(Date.now() - t); size = body.length; st = r.status(); }
  console.log(role, p, 'status', st, 'bytes', size, 'ms', ts.join(' '), 'median', [...ts].sort((a, b) => a - b)[Math.floor(n / 2)]); }
await s.ctx.close(); await b.close();
