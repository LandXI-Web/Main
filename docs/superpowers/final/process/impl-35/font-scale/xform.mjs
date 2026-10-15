// 글자 크기 → 표준 단계 토큰으로 바꾸기.  node xform.mjs [--write]
import fs from 'node:fs';
import path from 'node:path';

const V3 = 'E:/Land-XI 플랫폼/01. 디자인/landxi/v3';
const WRITE = process.argv.includes('--write');
const SKIP = [/^xi-clean\//, /^ops-infra\/shared/, /^kit\/stage\.js$/, /^kit\/lint\//];
const JS_OK = ['gov-accounts/dept-scope.js', 'kit/dropzone.js', 'ops-infra/js/law.js'];

const T = { tag: [14, 20], aux: [15, 22], body: [16, 26], t2: [20, 28], t1: [28, 36], num: [32, 40], xl: [40, 48], h2: [48, 60] };

let DASH = false;
function role(px, weight, fam, sel) {
  const r0 = role0(px, weight, fam, sel);
  if (DASH && r0 === 'tag' && px >= 12) return 'aux';
  if (DASH && r0 === 'aux') return 'body';
  return r0;
}
function role0(px, weight, fam, sel) {
  const last = sel.split(',').pop().trim();
  const numeric = weight >= 800 || /(^|[\s>])b(\s|$|:|\.)|(^|[\s>])b$|k-num|(^|[.\-_])n(\s|$|\b)|-n$|num|big|\.rc$|-v$|stat/.test(last);
  const title = /--font-display|Paperlogy/.test(fam) && weight >= 700 || /(^|[\s>])h[1-3](\s|$|[.:])/.test(last);
  if (px <= 12.5) return 'tag';
  if (px <= 14) return 'aux';
  if (px <= 16) return title && !/word|logo|brand|mark/.test(last) ? 't2' : 'body';
  if (px <= 21) return 't2';
  if (px <= 30) return numeric ? 'num' : 't1';
  if (px <= 33) return 'num';
  if (px <= 40) return 'xl';
  if (px <= 48) return 'h2';
  return null;   // 52 이상(소개형 · HUD · 모바일 전용) — 그대로
}

const stats = { files: {}, map: {}, left: [], pills: [] };
function lhScale(lh, oldPx, newPx) { const v = Math.round(lh * newPx / oldPx); return Math.max(v, Math.round(newPx * 1.25)); }

function xformBlock(sel, body, file) {
  if (!/font/.test(body)) return body;
  let ratio = null, changed = false, pill = null;
  body = body.replace(/var\((--(?:fs|lh)-[\w-]+),\s*[\d.]+px\)/g, (m, v) => { changed = true; return `var(${v})`; });
  // 1) shorthand font: [style] weight size[/lh] family
  body = body.replace(/(^|[;{\s])font:\s*((?:(?:italic|normal|bold|\d{3})\s+)*)(\d+(?:\.\d+)?)px(\s*\/\s*([\d.]+)(px)?)?(\s+[^;}]*)/g, (m, pre, head, px, lhPart, lh, lhUnit, tail) => {
    px = +px;
    const wm = head.match(/(\d{3})/); const weight = wm ? +wm[1] : 400;
    const r = role(px, weight, tail, sel);
    if (!r) { stats.left.push(`${file} ${sel.trim().slice(-40)} ${px}`); return m; }
    const [np] = T[r]; ratio = [px, np]; changed = true;
    stats.map[`${px}→${r}`] = (stats.map[`${px}→${r}`] || 0) + 1;
    let lhOut = '';
    if (lhPart) lhOut = lhUnit ? '/' + lhScale(+lh, px, np) + 'px' : '/' + lh;
    const hm = body.match(/(?:^|[;{\s])height:\s*(\d+)px/);
    if (hm && lhUnit && +hm[1] === +lh) pill = [+lh, lhScale(+lh, px, np)];
    if (hm && lhUnit && +hm[1] === +lh) stats.pills.push(`${file} ${sel.trim().slice(-50)} h${hm[1]} ${px}->${np} lh->${lhScale(+lh, px, np)}`);
    return `${pre}font:${head}var(--fs-${r})${lhOut}${tail}`;
  });
  if (pill) { const [o, n] = pill; body = body.replace(new RegExp('(^|[;{\\s])(height|width|min-width|min-height|max-height):\\s*' + o + 'px', 'g'), (m, pre, prop) => `${pre}${prop}:${n}px`).replace(new RegExp('border-radius:\\s*' + (o / 2) + 'px'), 'border-radius:' + (n / 2) + 'px'); }
  // 2) font-size: Npx
  body = body.replace(/(^|[;{\s])font-size:\s*(\d+(?:\.\d+)?)px/g, (m, pre, px) => {
    px = +px;
    const wm = body.match(/font-weight:\s*(\d{3})/); const fm = body.match(/font-family:\s*([^;]+)/);
    const r = role(px, wm ? +wm[1] : 400, fm ? fm[1] : '', sel);
    if (!r) { stats.left.push(`${file} ${sel.trim().slice(-40)} ${px}`); return m; }
    const [np] = T[r]; ratio = [px, np]; changed = true;
    stats.map[`${px}→${r}`] = (stats.map[`${px}→${r}`] || 0) + 1;
    return `${pre}font-size:var(--fs-${r})`;
  });
  // 3) separate line-height px in the same block
  if (ratio) body = body.replace(/(^|[;{\s])line-height:\s*(\d+(?:\.\d+)?)px/g, (m, pre, lh) => `${pre}line-height:${lhScale(+lh, ratio[0], ratio[1])}px`);
  // 4) old tokens → new names (XI맵 · 공유 데이터 파일 밖에서만)
  body = body.replace(/var\(--fs-label\)/g, () => { changed = true; return 'var(--fs-aux)'; }).replace(/var\(--lh-label\)/g, 'var(--lh-aux)')
    .replace(/var\(--fs-h4\)/g, () => { changed = true; return 'var(--fs-t1)'; }).replace(/var\(--lh-h4\)/g, 'var(--lh-t1)')
    .replace(/var\(--fs-sub\)/g, 'var(--fs-t2)').replace(/var\(--lh-sub\)/g, 'var(--lh-t2)');
  if (changed) stats.files[file] = (stats.files[file] || 0) + 1;
  return body;
}

function xform(src, file) {
  return src.replace(/([^{}]*)\{([^{}]*)\}/g, (m, sel, body) => sel + '{' + xformBlock(sel, body, file) + '}');
}

if (process.argv.includes('--dash')) {
  const [file, ranges, src] = process.argv.slice(process.argv.indexOf('--dash') + 1);
  const lines = fs.readFileSync(src, 'utf8').split(/(?<=\n)/);
  const rs = ranges.split(',').map((r) => r.split('-').map(Number));
  const segs = []; let cur = { dash: false, t: '' };
  lines.forEach((ln, i) => { const n = i + 1; const d = rs.some(([a, b]) => n >= a && n <= b); if (d !== cur.dash) { segs.push(cur); cur = { dash: d, t: '' }; } cur.t += ln; });
  segs.push(cur);
  const out = segs.map((g) => { DASH = g.dash; return xform(g.t, file); }).join('');
  fs.writeFileSync(path.join(V3, file), out);
  console.log('dash', file, JSON.stringify(stats.map));
  process.exit(0);
}
function walk(d, out = []) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p, out); else out.push(p); } return out; }
const files = walk(V3).map((p) => path.relative(V3, p).replace(/\\/g, '/')).filter((f) => (f.endsWith('.css') || JS_OK.includes(f)) && !SKIP.some((r) => r.test(f)));
const changedFiles = [];
for (const f of files) {
  const p = path.join(V3, f); const src = fs.readFileSync(p, 'utf8'); const out = xform(src, f);
  if (out !== src) { changedFiles.push(f); if (WRITE) fs.writeFileSync(p, out); }
}
console.log('files', changedFiles.length);
console.log(JSON.stringify(stats.files));
console.log(Object.entries(stats.map).sort((a, b) => parseFloat(a[0]) - parseFloat(b[0])).map(([k, v]) => k + ' ' + v).join(' | '));
console.log('pills', stats.pills.length); stats.pills.forEach((l) => console.log('  P', l));
console.log('left', stats.left.length); stats.left.forEach((l) => console.log('  ', l));
fs.writeFileSync(path.join(path.dirname(new URL(import.meta.url).pathname.slice(1)), 'changed-files.txt'), changedFiles.join('\n'));
