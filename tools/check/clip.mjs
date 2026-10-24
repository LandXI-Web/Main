/* 글자 잘림 검사(10-24 원칙 330) — all.mjs 의 다섯 번째 검사. 글자가 카드 · 상자 끝에서 잘리거나 밖으로 나가는지(kit/lint/clip.mjs CLIP)를
   겹침 검사와 같은 상태 목록(overlap-states.json) + 이 검사 전용 화면(clip-states.json: LX 관리자 · 해외 · 직원 나머지 화면)에서 폭 1440 · 1280 · 390 으로 잰다.
   잘림 하나라도 있으면 실패(종료 코드 1). 말줄임 title 없음 · 제목 낱말 하나 남음은 경고(실패 아님).
   사용: node tools/check/clip.mjs [--only gov,gov2,app,admin,abroad,guest] [--widths 1440,1280,390] [--states a3-analyze,…] [--out 폴더] */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { arg, isMain, launch, login, ROOT } from './common.mjs';

const { measureState } = await import(pathToFileURL(path.join(ROOT, 'landxi/v3/kit/lint/overlap.mjs')).href);
const { CLIP } = await import(pathToFileURL(path.join(ROOT, 'landxi/v3/kit/lint/clip.mjs')).href);
const BASE = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/check/overlap-states.json'), 'utf8'));
const EXTRA = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/check/clip-states.json'), 'utf8'));
export const ROLES = ['gov', 'gov2', 'app', 'admin', 'abroad', 'guest'];
const WIDTHS = arg('--widths', '1440,1280,390').split(',').map(Number).filter(Boolean);
const ONLY = new Set(arg('--states', '').split(',').filter(Boolean));
const OUT = arg('--out');
const H = { 1280: 720, 1440: 900, 390: 844 };
const results = [];
const log = (s) => process.stdout.write(s + '\n');

async function varsFor(page, role, home) {
  const v = {};
  if (role !== 'gov' && role !== 'gov2') return v;
  try {
    await page.goto(home + '/landxi/v3/gov-select/?list=1', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__govSelect?.ready, null, { timeout: 30000 });
    const svcs = await page.evaluate(() => window.__govSelect.services || []);
    const groups = await page.evaluate(() => window.__govSelect.groups || []);
    v.group = groups[0]?.id || '';
    v.card = (groups[0]?.cards || [])[0] || svcs[0] || '';
  } catch { /* 아래 상태가 실패로 적힌다 */ }
  if (v.card) {
    try {
      await page.goto(home + '/landxi/v3/gov-select/?service=' + encodeURIComponent(v.card), { waitUntil: 'domcontentloaded' });
      const a = page.locator('.gs-tabs a[href*="xi-clean"]').first();
      await a.waitFor({ timeout: 30000 });
      const href = await a.getAttribute('href');
      v.map = new URL(href, page.url()).pathname + new URL(href, page.url()).search;
    } catch { v.map = '/landxi/v3/xi-clean/?service=' + encodeURIComponent(v.card); }
  }
  return v;
}

export async function run(role, s) {
  const key = role === 'gov2' ? 'gov' : role;
  const list = [...(BASE[key] || []), ...(EXTRA[key] || [])].filter((st) => !ONLY.size || ONLY.has(st.name));
  if (!list.length) return;
  const page = s.page;
  const vars = await varsFor(page, role, s.home);
  const tenant = page._who?.tenant || '';
  for (const w of WIDTHS) {
    await page.setViewportSize({ width: w, height: H[w] || 900 });
    for (const st of list) {
      const r = await measureState(page, st, { base: s.home, vars, extra: CLIP });
      const x = r.extra || { hard: [], warn: [] };
      results.push({ role, tenant, width: w, state: st.name, label: st.label, optional: !!st.optional, ok: r.ok, note: r.note, hard: x.hard, warn: x.warn, n: x.n });
      log(`  ${role}${tenant ? '(' + tenant + ')' : ''} ${w} ${st.name} ${r.ok ? '' : '상태 못 만듦 · '}잘림 ${x.hard.length} · 경고 ${x.warn.length} · 글자 ${x.n ?? 0}`);
    }
  }
}

export function report(file) {
  const bad = results.filter((r) => r.hard.length);
  const warns = results.filter((r) => r.warn.length);
  const lines = [`글자 잘림 검사 — 상태 ${results.length}개(역할 × 폭 × 화면) · 잘린 상태 ${bad.length}(잘림 ${bad.reduce((a, r) => a + r.hard.length, 0)}곳) · 경고 ${warns.reduce((a, r) => a + r.warn.length, 0)}곳(실패 아님)`];
  const fmt = (r, x) => `${r.role}${r.tenant ? '(' + r.tenant + ')' : ''} ${r.width} ${r.state} ${x.kind} [${x.sel}] "${x.text}" — ${x.detail}`;
  for (const r of bad) for (const x of r.hard) lines.push('✗ ' + fmt(r, x));
  for (const r of warns) for (const x of r.warn) lines.push('△ ' + fmt(r, x));
  if (!bad.length) lines.push('✓ 글자 잘림 0');
  const text = lines.join('\n');
  if (file) fs.writeFileSync(file, JSON.stringify({ at: new Date().toISOString(), widths: WIDTHS, results }, null, 1));
  return { text, bad: bad.length };
}

if (isMain(import.meta.url)) {
  if (OUT) fs.mkdirSync(OUT, { recursive: true });
  const browser = await launch();
  try {
    for (const r of arg('--only', ROLES.join(',')).split(',').filter((x) => ROLES.includes(x))) {
      let s;
      try { s = await login(browser, r); } catch (e) { log(`✗ ${r} — ${e.message}`); continue; }
      try { await run(r, s); } finally { await s.ctx.close(); }
    }
  } finally { await browser.close(); }
  const r = report(OUT ? path.join(OUT, 'clip-check.json') : undefined);
  if (OUT) fs.writeFileSync(path.join(OUT, 'clip-check.txt'), r.text + '\n');
  log('\n' + r.text);
  process.exit(r.bad ? 1 : 0);
}
