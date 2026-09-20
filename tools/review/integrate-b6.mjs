// B6 원판 통합 — design-canvas/v2/B6-*.dc.html 을 canvas.json · 갤러리 STATUS 에 올리고 notes/*.md 를 NOTES.md 에 잇는다. 멱등.
// usage: node tools/review/integrate-b6.mjs   (repo root) → 이어서 node tools/review/masters.mjs
import fs from 'node:fs';
const V = 'design-canvas/v2/';
const GROUPS = [ // [접두어, 갤러리 카테고리]
  ['B6-MapWork', '지도 작업공간(컨셉)'], ['B6-Support', '서비스 지원'], ['B6-Publish', '카드 발행 관리'],
  ['B6-Admin', '서비스 관리'], ['B6-My', 'MY · 인증'], ['B6-Auth', 'MY · 인증'],
];
const ids = fs.readdirSync(V).filter((f) => /^B6-.*\.dc\.html$/.test(f)).map((f) => f.replace('.dc.html', '')).filter((id) => fs.existsSync(`${V}renders/${id}.png`)).sort();
const groupOf = (id) => GROUPS.find(([p]) => id.startsWith(p));
const pngSize = (p) => { const b = fs.readFileSync(p); return [b.readUInt32BE(16), b.readUInt32BE(20)]; };

// 1) canvas.json — 그룹마다 한 행
const cp = V + 'canvas.json'; const c = JSON.parse(fs.readFileSync(cp, 'utf8'));
c.artboards = c.artboards.filter((a) => !/^B6-/.test(a.file));
let y = Math.max(...c.artboards.map((a) => a.y + a.h)) + 160;
const titleOf = (id) => { const s = fs.readFileSync(`${V}${id}.dc.html`, 'utf8'); const m = /<!--\s*title:\s*(.+?)\s*-->/.exec(s); return m ? m[1] : id.replace(/^B6-/, 'B6 · ').replace(/-/g, ' '); };
for (const [prefix] of GROUPS) {
  const g = ids.filter((id) => groupOf(id)?.[0] === prefix); if (!g.length) continue;
  let x = 0, rowH = 0;
  for (const id of g) { const [w, h] = pngSize(`${V}renders/${id}.png`); c.artboards.push({ file: id + '.dc.html', title: titleOf(id), x, y, w, h }); x += w + 120; rowH = Math.max(rowH, h); }
  y += rowH + 160;
}
fs.writeFileSync(cp, JSON.stringify(c, null, 2) + '\n');

// 2) masters.mjs STATUS + CATS
const mp = 'tools/review/masters.mjs'; let m = fs.readFileSync(mp, 'utf8').split('\r\n').join('\n');
const notes = fs.existsSync('tools/review/b6-notes.json') ? JSON.parse(fs.readFileSync('tools/review/b6-notes.json', 'utf8')) : {};
m = m.replace(/\n {2}'B6-[^\n]*/g, '');
const lines = ids.map((id) => `  '${id}': ['${groupOf(id)?.[1] || '기타'}', 'review', ${JSON.stringify(notes[id] || (/-Opt(\d)$/.test(id) ? `선택 ${RegExp.$1}` : '2026-09-20 자동 설계'))}],`).join('\n');
m = m.replace('const STATUS = {\n', 'const STATUS = {\n' + lines + '\n');
const cats = [...new Set(GROUPS.map((g) => g[1]))];
m = m.replace(/const CATS = \[([^\]]*)\];/, (all, inner) => { let arr = inner.split(',').map((s) => s.trim()).filter(Boolean); for (const k of cats) if (!arr.includes(`'${k}'`)) arr.splice(arr.length - 1, 0, `'${k}'`); return `const CATS = [${arr.join(', ')}];`; });
fs.writeFileSync(mp, m);

// 3) NOTES.md — notes/*.md 를 부록 B6 로
const np = V + 'NOTES.md'; let n = fs.readFileSync(np, 'utf8'); const mark = '\n\n---\n\n## 부록 B6 · 2026-09-20 자동 설계분';
if (n.includes(mark)) n = n.slice(0, n.indexOf(mark));
const nd = V + 'notes/'; const files = fs.existsSync(nd) ? fs.readdirSync(nd).filter((f) => f.endsWith('.md')).sort() : [];
n += mark + '\n\n발주 지시(2026-09-20): "UI/UX 관점에서 모든 걸 자동으로 검토하고 디자인 안도 자동으로 — 허접한 건 안 된다, 기존 톤앤매너와 그 이상." 공통 브리프 `docs/superpowers/proto/2026-09-20-b6-common-brief.md`, 전수 검토 `docs/superpowers/review/2026-09-20-auto-audit.md`. 아래는 그룹별 기록(원문 `design-canvas/v2/notes/*.md`).\n\n' + files.map((f) => fs.readFileSync(nd + f, 'utf8').trim()).join('\n\n---\n\n') + '\n';
fs.writeFileSync(np, n);
console.log('B6 artboards', ids.length, '· groups', cats.length, '· notes', files.length);
