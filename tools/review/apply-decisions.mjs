// 자산 결정 반영기 — 갤러리(landxi/proto/review/masters.html) '내 결정' → [결정 발행] 으로 복사한 글을 자산 대장에 적는다.
// 실행: node tools/review/apply-decisions.mjs <붙여넣은 글 파일> [--dry]
// 글 형식(masters.html 이 만든다):
//   [자산 결정] 2026-09-27 14:05
//   - B5-Projects 목록 + 우 프로젝트 조회: 검토 → 적용 (메모)
//   (1건 · 반영: …)            ← '- ' 로 시작하지 않는 줄은 무시
// 하는 일: assets.json 의 해당 자산에 user_decision {verdict, from, date, memo, at} 을 적고 verdict·reason 을 갱신한 뒤
//          node tools/review/masters.mjs 로 masters.html(과 assets.json) 을 다시 굽는다. 생성기는 user_decision 을 판정표보다 우선한다.
// 모르는 id · 형식이 틀린 줄이 하나라도 있으면 아무것도 쓰지 않고 오류로 끝난다.
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const dry = args.includes('--dry');
const file = args.find((a) => !a.startsWith('--'));
if (!file) { console.error('사용법: node tools/review/apply-decisions.mjs <붙여넣은 글 파일> [--dry]'); process.exit(2); }
const src = fs.readFileSync(path.resolve(file), 'utf8').replace(/^﻿/, '');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const LEDGER = path.join(ROOT, 'landxi/proto/review/assets.json');
const ledger = JSON.parse(fs.readFileSync(LEDGER, 'utf8'));
const byId = Object.fromEntries(ledger.assets.map((a) => [a.id, a]));

const V = '(적용|검토|폐기)';
const HEAD = /^\[자산 결정\]\s*(\d{4}-\d{2}-\d{2})(?:\s+(\d{1,2}:\d{2}))?/;
// - <id> <이름>: <기존> → <새> (메모)   — 이름에 ':' 가 있어도 마지막 '<판정> → <판정>' 앞 ':' 로 자른다
const LINE = new RegExp(`^[-*•]\\s+(\\S+)(?:\\s+(.*?))?\\s*:\\s*${V}\\s*(?:→|->|=>)\\s*${V}\\s*(?:\\((.*)\\))?\\s*$`);

let date = null, time = null;
const errors = [], warns = [], items = [];
src.split(/\r?\n/).forEach((raw, i) => {
  const line = raw.trim(); if (!line) return;
  const h = line.match(HEAD); if (h) { date = h[1]; time = h[2] || null; return; }
  if (!/^[-*•]\s/.test(line)) return;
  const m = line.match(LINE);
  if (!m) { errors.push(`${i + 1}행 형식 오류: ${line}`); return; }
  const [, id, name, from, to, memo] = m;
  const a = byId[id];
  if (!a) { errors.push(`${i + 1}행 모르는 id: ${id}${name ? ` (${name})` : ''}`); return; }
  if (a.verdict !== from) warns.push(`${id}: 글의 기존 판정 '${from}' ≠ 대장 현재 '${a.verdict}' — 새 판정 '${to}' 로 덮어씀`);
  if (items.some((x) => x.id === id)) warns.push(`${id}: 두 번 나옴 — 뒤의 줄을 씀`);
  items.push({ id, from, to, memo: (memo || '').trim() });
});
if (!date) errors.push("머리줄 '[자산 결정] YYYY-MM-DD HH:MM' 이 없음");
if (!items.length && !errors.length) errors.push("결정 줄('- <id> <이름>: <기존> → <새>')이 없음");
for (const w of warns) console.warn('! ' + w);
if (errors.length) { for (const e of errors) console.error('✗ ' + e); console.error(`반영 안 함 — 오류 ${errors.length}건`); process.exit(1); }

const final = new Map(items.map((x) => [x.id, x]));
for (const x of final.values()) {
  const a = byId[x.id];
  const tv = a.table_verdict || a.verdict;
  if (x.to === tv && !x.memo) { // 판정표 원래 판정으로 되돌림 → 사용자 결정 기록을 지운다
    delete a.user_decision; if (a.reason_before) a.reason = a.reason_before;
    delete a.table_verdict; delete a.reason_before; a.verdict = x.to;
    console.log(`  ${x.id} ${a.name}: ${x.from} → ${x.to} (판정표 원래 판정 — 사용자 결정 해제)`);
    continue;
  }
  a.user_decision = { verdict: x.to, from: x.from, date, memo: x.memo || undefined, at: time ? `${date} ${time}` : date };
  a.verdict = x.to;
  a.reason = `사용자 결정 ${date}` + (x.memo ? ` — ${x.memo}` : '');
  console.log(`  ${x.id} ${a.name}: ${x.from} → ${x.to}${x.memo ? ` (${x.memo})` : ''}`);
}
if (dry) { console.log(`--dry: ${final.size}건 확인만 함(쓰지 않음)`); process.exit(0); }
fs.writeFileSync(LEDGER, JSON.stringify(ledger, null, 1) + '\n');
console.log(`assets.json 에 ${final.size}건 적음 → masters.html 다시 굽기`);
execSync('node tools/review/masters.mjs', { cwd: ROOT, stdio: 'inherit' });
