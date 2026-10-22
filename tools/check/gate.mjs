/* 검사 문(10-22 바퀴 22 · 원칙 309 "이런 규칙을 왜 계속 위반하는 거지?") — now 를 굽기 전과 커밋 전에 검사기 넷(all.mjs: 겹침 · 낱말 · 숫자 · 글꼴)이 0 이어야 통과.
   검사기는 바깥 주소 화면을 로그인 폼으로 돌아 15~25분 걸린다. 그래서 커밋 · 굽기 때마다 다시 돌리지 않고, 통과한 그 순간의 화면 파일 지문을 남겨 두고 대조한다.

   node tools/check/gate.mjs [all.mjs 인자 …]   검사기 넷을 돌린다. 모두 0 이면 통과 기록(화면 파일마다 지문 — 돌기 전과 뒤에 같은 파일만)을 남긴다. 하나라도 실패면 기록을 지운다.
   node tools/check/gate.mjs --staged            커밋 전(.githooks/pre-commit) — 올리려는 화면 파일(landxi/ 의 js · mjs · css · html)이 통과 기록의 지문과 같아야 한다.
                                                 화면 파일이 없는 커밋(서버 · 문서 · 시험)은 그냥 통과.
   node tools/check/gate.mjs --verify            now 굽기 전(tools/review/build-confirm.py) — 지금 화면 파일 전부가 통과 기록의 지문과 같아야 한다.
   통과 기록: server/logs/check-gate.json(저장소에 올리지 않는 곳) · 12시간 지나면 다시 돌린다. */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const STAMP = path.join(ROOT, 'server/logs/check-gate.json');
const MAX_AGE_H = 12;
const SCREEN = (f) => /^landxi\/.+\.(js|mjs|css|html)$/.test(f) && !f.startsWith('landxi/proto/review/');   // now 페이지 자체(굽기 결과)는 빼고
const git = (args, input) => execFileSync('git', args, { cwd: ROOT, input, encoding: 'utf8', maxBuffer: 64 << 20 });
const say = (s) => process.stdout.write(s + '\n');

/** 지금 작업 폴더의 화면 파일 지문 { 경로: blob 해시 } */
function hashes() {
  const files = git(['ls-files', '-co', '--exclude-standard', 'landxi']).split('\n').filter(SCREEN).filter((f) => fs.existsSync(path.join(ROOT, f)));
  if (!files.length) return {};
  const hs = git(['hash-object', '--stdin-paths'], files.join('\n') + '\n').trim().split('\n');
  return Object.fromEntries(files.map((f, i) => [f, hs[i]]));
}
function readStamp() {
  try { return JSON.parse(fs.readFileSync(STAMP, 'utf8')); } catch { return null; }
}
function stampProblem(st) {
  if (!st?.ok) return '검사기 통과 기록이 없습니다';
  const h = (Date.now() - Date.parse(st.at)) / 3600e3;
  if (!(h < MAX_AGE_H)) return `검사기 통과 기록이 ${Math.floor(h)}시간 지났습니다(${MAX_AGE_H}시간까지)`;
  return null;
}
const HOW = '먼저 `node tools/check/gate.mjs` 로 검사기 넷(겹침 · 낱말 · 숫자 · 글꼴)을 돌려 0 을 확인하세요.';
function report(bad, what) {
  say(`✗ ${what} — 통과 기록과 다른 화면 파일 ${bad.length}개:`);
  for (const f of bad.slice(0, 12)) say('   ' + f);
  if (bad.length > 12) say(`   … 그 밖 ${bad.length - 12}개`);
  say('  ' + HOW);
}

const args = process.argv.slice(2);
if (args.includes('--staged')) {
  /* 커밋 전 — 올리려는 화면 파일의 '올릴 판'(index blob) 지문이 통과 기록과 같아야 한다 */
  const staged = git(['diff', '--cached', '--name-only', '--diff-filter=ACMR']).split('\n').filter(SCREEN);
  if (!staged.length) process.exit(0);
  const st = readStamp(), why = stampProblem(st);
  if (why) { say(`✗ 커밋 멈춤 — 화면 파일 ${staged.length}개를 올리는데 ${why}.\n  ${HOW}`); process.exit(1); }
  const idx = Object.fromEntries(git(['ls-files', '-s', '--', ...staged]).split('\n').filter(Boolean).map((l) => { const [meta, f] = l.split('\t'); return [f, meta.split(' ')[1]]; }));
  const bad = staged.filter((f) => st.files[f] !== idx[f]);
  if (bad.length) { report(bad, '커밋 멈춤'); process.exit(1); }
  say(`✓ 검사 문 — 올리는 화면 파일 ${staged.length}개 모두 통과한 판(${st.at.slice(0, 16).replace('T', ' ')})`);
  process.exit(0);
}
if (args.includes('--verify')) {
  /* now 굽기 전 — 지금 화면 파일 전부가 통과한 그 판이어야 한다(굽는 그림 = 검사한 화면) */
  const st = readStamp(), why = stampProblem(st);
  if (why) { say(`✗ now 굽기 멈춤 — ${why}.\n  ${HOW}`); process.exit(1); }
  const now = hashes();
  const bad = Object.keys(now).filter((f) => st.files[f] !== now[f]);
  if (bad.length) { report(bad, 'now 굽기 멈춤'); process.exit(1); }
  say(`✓ 검사 문 — 화면 파일 ${Object.keys(now).length}개가 통과한 판(${st.at.slice(0, 16).replace('T', ' ')})`);
  process.exit(0);
}

/* 검사기 넷 돌리기 — 일부만(--only · --skip)은 통과로 치지 않는다 */
if (args.some((a) => a === '--only' || a === '--skip')) { say('✗ 검사 문은 검사기 넷 · 역할 모두를 돌립니다(--only · --skip 없이).'); process.exit(2); }
const before = hashes();
try { fs.rmSync(STAMP, { force: true }); } catch { /* 없음 */ }
const r = spawnSync(process.execPath, [path.join(ROOT, 'tools/check/all.mjs'), ...args], { cwd: ROOT, stdio: 'inherit' });
if (r.status !== 0) { say('\n✗ 검사 문 — 검사기가 0 이 아닙니다. 통과 기록을 남기지 않았습니다(커밋 · now 굽기 멈춤).'); process.exit(1); }
const after = hashes();
const files = Object.fromEntries(Object.entries(after).filter(([f, h]) => before[f] === h));   // 도는 동안 바뀐 파일은 통과로 치지 않는다
const moved = Object.keys(after).length - Object.keys(files).length;
fs.mkdirSync(path.dirname(STAMP), { recursive: true });
fs.writeFileSync(STAMP, JSON.stringify({ ok: true, at: new Date().toISOString(), args, files }, null, 0));
say(`\n✓ 검사 문 — 모두 0 · 화면 파일 ${Object.keys(files).length}개 통과 기록${moved ? ` (도는 동안 바뀐 ${moved}개는 빼고 — 다시 돌려야 올릴 수 있음)` : ''}`);
