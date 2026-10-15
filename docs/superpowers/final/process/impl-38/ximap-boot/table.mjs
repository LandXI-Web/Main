// 요청 표 — measure-<phase>.json 의 처음(first) 세 번에서 /api/v1 · 결과 층 머리 요청을 경로마다 모아 가운데 값(시작 · 바깥 시간 · 서버 시간 · 크기)
//   node table.mjs before gov  → 마크다운 표
import fs from 'node:fs';
const [phase, group, pass = 'first'] = process.argv.slice(2);
const M = JSON.parse(fs.readFileSync(new URL(`measure-${phase}.json`, import.meta.url)));
const runs = M[group][pass];
const med = (a) => { const b = a.filter((x) => x != null).sort((x, y) => x - y); return b.length ? b[Math.floor(b.length / 2)] : null; };
const key = (u) => u.replace(/\/tiles\/sign\?set=cog%2F[^&]+/, '/tiles/sign?set=cog/…(영상마다)').replace(/\/tiles\/pmtiles\/results\/[^?]+\.pmtiles.*/, '/tiles/pmtiles/results/…(결과 층 머리 · 첫 32KB)');
const by = new Map();
runs.forEach((r, i) => {
  const seen = new Set();
  for (const q of r.reqs || []) {
    if (!/\/api\/v1\/|\/tiles\/sign|\/tiles\/pmtiles\/results/.test(q.u)) continue;
    if (/pmtiles\/results/.test(q.u) && !((q.size || 0) > 33000 && q.size < 33600)) continue;   // 머리(32KB)만 — 조각은 빼고
    const k = key(q.u);
    const e = by.get(k) || { n: [], at: [], ms: [], srv: [], size: [] };
    if (!seen.has(k)) { e.at.push(q.at); seen.add(k); e.n.push(0); }
    e.n[e.n.length - 1]++;
    e.ms.push(q.ms); e.srv.push(q.srv); e.size.push(q.size);
    by.set(k, e);
  }
});
const rows = [...by].map(([k, e]) => ({ k, n: med(e.n), at: med(e.at), ms: med(e.ms), srv: med(e.srv), size: med(e.size) })).sort((a, b) => a.at - b.at);
console.log(`| 요청 | 개수 | 시작(ms) | 바깥 시간(ms) | 서버 시간(ms) | 크기(받은 바이트) |\n|---|---|---|---|---|---|`);
for (const r of rows) console.log(`| \`${r.k}\` | ${r.n} | ${r.at} | ${r.ms} | ${r.srv ?? '—'} | ${r.size ?? '—'} |`);
console.log(`\n처음 ${runs.length}번 · 다 그려짐 ${runs.map((r) => r.done).join(' · ')}ms · /api/v1 요청 수(다 그려지기 전) ${runs.map((r) => r.nApiBeforeDone).join(' · ')}`);
