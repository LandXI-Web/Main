// /ops/bench 실응답을 표로 그려 스크린샷(값 가공 없음 · 봉투 basis/source 그대로)
import { chromium } from 'playwright';
import fs from 'node:fs';
const API = 'http://localhost:8700';
const tok = (await (await fetch(API + '/api/v1/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ realm: 'lx', login: 'lx-admin', password: 'landxi-dev-2026' }) })).json()).token;
const j = await (await fetch(API + '/api/v1/ops/bench', { headers: { authorization: 'Bearer ' + tok } })).json();
const before = new TextDecoder('euc-kr').decode(fs.readFileSync('E:/Land-XI 플랫폼/01. 디자인/shots/f1/B/ollama-tasklist-before-bench.txt'));
const after = new TextDecoder('euc-kr').decode(fs.readFileSync('E:/Land-XI 플랫폼/01. 디자인/shots/f1/B/ollama-tasklist-after-bench.txt'));
const v = (e) => (e && typeof e === 'object' ? e.value : e ?? '—'); const now = fs.readFileSync('E:/Land-XI 플랫폼/01. 디자인/shots/f1/B/ollama-tasklist-now.txt', 'utf8').replace(/^\uFEFF/, '');
const rows = j.items.map((r) => `<tr><td>${r.model_id}</td><td>${r.gpu}${r.gpu_index != null ? " #" + r.gpu_index : " (P4 기록)"}</td><td>${r.batch}</td><td>${r.imgsz}</td><td>${r.fp16 ? 'fp16' : 'fp32'}</td><td class=n><b>${v(r.chips_per_s)}</b></td><td class=n>${(v(r.vram_mib) ?? "—").toLocaleString()}</td><td class=n>${v(r.util_pct_mean)}</td><td class=n>${v(r.external_used_mib)?.toLocaleString()}</td><td class=n>${r.seconds ? r.seconds + "s · " + r.chips : "—"}</td><td>${r.chips_per_s.basis}</td><td class=s>${r.at.slice(0, 19)}</td></tr>`).join('');
const html = `<!doctype html><meta charset=utf-8><style>body{font:14px Pretendard,'Malgun Gothic',sans-serif;margin:32px;color:#111c2d;background:#fff}h1{font:700 22px Paperlogy,Pretendard,sans-serif;margin:0 0 6px}p{color:#5b6573;margin:0 0 18px}table{border-collapse:collapse;width:100%}th,td{border-bottom:1px solid #e3e7ec;padding:9px 10px;text-align:left}th{font-size:12px;color:#5b6573;font-weight:600}.n{text-align:right;font-variant-numeric:tabular-nums}.s{color:#7b8594;font-size:12px}pre{background:#f4f6f8;padding:10px;font-size:12px;margin:0}.g{display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;margin-top:22px}</style>
<h1>GET /api/v1/ops/bench — A6000 처리량 실측</h1><p>server/bench/throughput.py · 1024 칩(aerial25 는 가중치 imgsz 1280) · 칩 미리 적재(읽기 제외) · 모델×batch 각 40s · GPU0 한 장(전력 규칙) · 외부 점유(Ollama llama-server ×4 포함) 동시 조건</p>
<table><tr><th>model</th><th>GPU</th><th>batch</th><th>imgsz</th><th>정밀도</th><th class=n>chips/s</th><th class=n>peak VRAM MiB</th><th class=n>util % 평균</th><th class=n>external_used MiB</th><th class=n>측정</th><th>basis</th><th>at</th></tr>${rows}</table>
<div class=g><div><b>bench 전 tasklist</b><pre>${before.replace(/</g, '&lt;')}</pre></div><div><b>bench 후 tasklist</b><pre>${after.replace(/</g, '&lt;')}</pre><p>Ollama 가 keep-alive 로 러너를 내리고/다시 띄움(PID 교체) — 워커는 종료 신호를 보내지 않음</p></div><div><b>지금 tasklist(재부팅 20:55 후 · J2b 실행 중)</b><pre>${now.replace(/</g, '&lt;')}</pre></div></div>`;
fs.writeFileSync('E:/Land-XI 플랫폼/01. 디자인/shots/f1/B/_tools/bench.html', html);
const b = await chromium.launch({ channel: 'chrome' });
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
await p.goto('file:///E:/Land-XI 플랫폼/01. 디자인/shots/f1/B/_tools/bench.html');
await p.waitForTimeout(500);
await p.screenshot({ path: 'E:/Land-XI 플랫폼/01. 디자인/shots/f1/B/f1b-bench-ops.png', fullPage: true });
await b.close();
