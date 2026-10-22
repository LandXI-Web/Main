/* 커밋 전 비밀값 검사(10-22 now21 저장보안-제안-비밀값검사 채택) — 공개 저장소에 비밀번호 · 열쇠가 다시 들어가지 않게.
   사용: node tools/check/secrets.mjs --staged            (커밋 고리 .githooks/pre-commit 가 부른다 — 올리려는 줄만 본다)
         node tools/check/secrets.mjs --range A..B         (보내기 고리 .githooks/pre-push · 그 사이 커밋들의 더한 줄)
   잡는 것: ① server/.env · .env.local 등 저장소 밖 설정 파일에 있는 실제 값(비밀번호 · 열쇠 · 접속 주소의 비밀번호)이 그대로 들어간 줄
            ② 모양으로 아는 열쇠(hf_ · sk- · AKIA · 개인 열쇠 머리줄 · 비밀번호가 든 postgresql:// · redis:// 주소)
            ③ 올리면 안 되는 파일(.env · .env.local · *.pem · id_rsa)
   값은 화면에 내지 않는다(파일 · 줄 · 무엇인지만). 걸리면 종료 코드 1 — 커밋이 멈춘다. */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
const args = process.argv.slice(2);
const mode = args.includes('--staged') ? 'staged' : args.includes('--range') ? 'range' : 'staged';
const range = mode === 'range' ? args[args.indexOf('--range') + 1] : null;

/* ① 실제 값 — 저장소에 올리지 않는 설정 파일에서 */
const ENV_FILES = ['server/.env', '.env.local', '.env', 'server/.env.local', 'tools/kie/.env', 'tools/kling/.env'];
const KEY = /(PASS(WORD)?|_PW|SECRET|TOKEN|KEY|SALT|DSN|_URL)$/i;
const secrets = [];
for (const rel of ENV_FILES) {
  let t; try { t = fs.readFileSync(path.join(ROOT, rel), 'utf8'); } catch { continue; }
  for (const line of t.split(/\r?\n/)) {
    const m = /^\s*([A-Za-z_][\w]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (!m || !KEY.test(m[1])) continue;
    let v = m[2].replace(/^["']|["']$/g, '');
    const u = /^[a-z]+:\/\/[^:/@]*:([^@]+)@/i.exec(v);           // 접속 주소 → 그 안의 비밀번호만
    if (u) v = u[1]; else if (/^[a-z]+:\/\//i.test(v)) continue;   // 비밀번호 없는 주소는 값이 아님
    if (v.length >= 8 && !/^<.*>$/.test(v)) secrets.push({ name: `${rel} ${m[1]}`, v });
  }
}
/* ② 모양 */
const SHAPES = [
  ['허깅페이스 열쇠', /\bhf_[A-Za-z0-9]{30,}\b/],
  ['API 열쇠(sk-)', /\bsk-[A-Za-z0-9_-]{24,}\b/],
  ['AWS 열쇠', /\bAKIA[0-9A-Z]{16}\b/],
  ['개인 열쇠', /-----BEGIN (RSA |EC |OPENSSH |DSA |)PRIVATE KEY-----/],
  ['비밀번호가 든 DB 주소', /postgres(ql)?:\/\/[^:\s/@]+:(?!<|\$\{)[^@\s'"]{6,}@/i],
  ['비밀번호가 든 대기열 주소', /redis:\/\/[^:\s/@]*:(?!<|\$\{)[^@\s'"]{6,}@/i],
];
const BAD_FILE = /(^|\/)(\.env(\.local)?|id_rsa|id_ed25519)$|\.pem$/;

const git = (a) => execFileSync('git', a, { encoding: 'utf8', maxBuffer: 1 << 30, cwd: ROOT });
const diff = mode === 'staged' ? git(['diff', '--cached', '-U0', '--no-color', '--no-ext-diff']) : git(['diff', '-U0', '--no-color', '--no-ext-diff', range]);
const names = mode === 'staged' ? git(['diff', '--cached', '--name-only', '--diff-filter=AM']) : git(['diff', '--name-only', '--diff-filter=AM', range]);

const hits = [];
for (const f of names.split(/\r?\n/).filter(Boolean)) if (BAD_FILE.test(f)) hits.push(`${f} — 올리면 안 되는 파일(설정 · 열쇠 파일)`);
let file = null, ln = 0;
for (const line of diff.split(/\r?\n/)) {
  if (line.startsWith('+++ ')) { file = line.slice(6); continue; }
  const h = /^@@ -\d+(?:,\d+)? \+(\d+)/.exec(line);
  if (h) { ln = Number(h[1]); continue; }
  if (!line.startsWith('+') || line.startsWith('+++')) { continue; }
  const text = line.slice(1);
  if (file && !/\.(png|jpe?g|webp|gif|pmtiles|woff2?|ttf|pbf|glb|mp4|webm|zip|gz)$/i.test(file)) {
    for (const s of secrets) if (text.includes(s.v)) hits.push(`${file}:${ln} — 실제 값(${s.name})`);
    for (const [nm, re] of SHAPES) if (re.test(text)) hits.push(`${file}:${ln} — ${nm}`);
  }
  ln++;
}
if (hits.length) {
  console.error(`비밀값 검사: 걸린 곳 ${hits.length}곳 — 값을 지우고 .env 에서 읽게 바꾼 뒤 다시 커밋하세요(값은 출력하지 않음)`);
  for (const x of [...new Set(hits)].slice(0, 50)) console.error('  ' + x);
  process.exit(1);
}
console.log(`비밀값 검사: 통과(${mode === 'staged' ? '올리려는 줄' : range} · 실제 값 ${secrets.length}개와 모양 ${SHAPES.length}가지로 봄)`);
