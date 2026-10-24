/* 검사기 다섯을 한 번에 — 금칙어(words.mjs) · 같은 이름 숫자(numbers.mjs) · 글자 크기(fonts.mjs) · 화면 요소 겹침(overlap.mjs · 10-22 원칙 309 — 역할 gov2 · guest 도 이 검사만).
   역할마다 로그인 폼으로 한 번만 들어가(세션 주입 없음) 그 세션으로 세 검사기를 차례로 돌린다 — 바깥 로그인 한도(10분 20번)를 넘지 않게
   (역할 넷 = 로그인 넷: 국내 기관 · 해외 기관 · LX 직원 · LX 관리자).
   사용: node tools/check/all.mjs [--only gov,abroad,app,admin] [--skip words,numbers,fonts] [--out 폴더]
         [--widths 1280,1440 …] [--chat] [--app …] [--admin …] [--gov …] [--tenant namwon] [--abroad kgz-agri]
   --out 을 주면 words-check.txt · numbers-check.txt · fonts-check.txt(+ .json)를 그 폴더에 남긴다.
   셋 중 하나라도 실패면 종료 코드 1. */
import fs from 'node:fs';
import path from 'node:path';
import { arg, roles, launch, login } from './common.mjs';
import * as words from './words.mjs';
import * as numbers from './numbers.mjs';
import * as fonts from './fonts.mjs';
import * as overlap from './overlap.mjs';
import * as clip from './clip.mjs';

const skip = new Set(arg('--skip', '').split(',').filter(Boolean));
const CHECKS = [['words', words], ['numbers', numbers], ['fonts', fonts], ['overlap', overlap], ['clip', clip]].filter(([k]) => !skip.has(k));
const BASE = new Set(['gov', 'abroad', 'app', 'admin']);       // 세 검사기(words · numbers · fonts)가 도는 역할 — gov2 · guest 는 겹침 검사만(overlap.ROLES)
const runs = (m, r) => (m.ROLES ? m.ROLES.includes(r) : BASE.has(r));
const OUT = arg('--out');
if (OUT) fs.mkdirSync(OUT, { recursive: true });
const t0 = Date.now();
const log = (s) => process.stdout.write(s + '\n');

const browser = await launch();
let logins = 0;
try {
  for (const r of roles()) {
    let s;
    try { s = await login(browser, r); logins++; } catch (e) { log(`✗ ${r} — ${e.message}`); continue; }
    try {
      for (const [k, m] of CHECKS) {
        if (!runs(m, r)) continue;
        const t = Date.now();
        await m.run(r, s);
        log(`· ${r} · ${k} ${((Date.now() - t) / 1000).toFixed(0)}초`);
      }
    } finally { await s.ctx.close(); }
  }
} finally { await browser.close(); }

let bad = 0;
for (const [k, m] of CHECKS) {
  const r = m.report(OUT ? path.join(OUT, `${k}-check.json`) : undefined);
  if (OUT) fs.writeFileSync(path.join(OUT, `${k}-check.txt`), r.text + '\n');
  log(`\n━━ ${k} ━━\n${r.text}`);
  if (r.bad) bad++;
}
log(`\n검사기 ${CHECKS.length}개 · 로그인 ${logins}번 · ${((Date.now() - t0) / 60000).toFixed(1)}분 — ${bad ? `실패 ${bad}개` : '모두 통과'}`);
process.exit(bad ? 1 : 0);
