/* 겹침 검사(10-22 원칙 309 · FARM-ADMIN-DESIGN §3-3 · IMPL 0-2) — all.mjs 의 네 번째 검사(words · numbers · fonts · overlap).
   바깥 주소를 로그인 폼으로 열어(세션 주입 없음) 역할마다 상태 목록(overlap-states.json)을 폭 1280 · 1440 · 390 에서 만들고,
   떠 있는 요소 상자를 재어(landxi/v3/kit/lint/overlap.mjs MEASURE) 4px 넘게 겹친 쌍 · 고정 단추가 덮은 글 · 단추를 센다. 하나라도 있으면 실패(종료 코드 1).
   역할: gov(국내 기관 · 기본 namwon) · gov2(두 번째 기관 · 기본 gwangju-jeonnam) · app(LX 직원) · guest(로그인 전).
   사용: node tools/check/overlap.mjs [--only gov,gov2,app,guest] [--widths 1280,1440,390] [--states 01-list,07-card] [--out 폴더] [--shots]
         --out 을 주면 overlap-check.json · overlap-check.txt(+ --shots 면 그림)를 그 폴더에. 그림은 로컬에만(공개 저장소에 올리지 않는다).
   비밀번호는 env LX_PW / DEV_PASSWORD 또는 server/.env 의 DEV_PASSWORD(화면 · 출력에 적지 않는다). */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { arg, has, isMain, launch, login, ROOT } from './common.mjs';

const { measureState } = await import(pathToFileURL(path.join(ROOT, 'landxi/v3/kit/lint/overlap.mjs')).href);
const STATES = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/check/overlap-states.json'), 'utf8'));
export const ROLES = ['gov', 'gov2', 'app', 'guest'];       // all.mjs — 이 검사만 도는 역할(gov2 · guest)
const WIDTHS = arg('--widths', STATES.widths.join(',')).split(',').map(Number).filter(Boolean);
const ONLY = new Set(arg('--states', '').split(',').filter(Boolean));
const OUT = arg('--out');
const SHOTS = has('--shots') && OUT;
const results = [];                                         // {role, tenant, width, state, label, ok, note, ms, overlaps[], shot}
const log = (s) => process.stdout.write(s + '\n');
const H = { 1280: 720, 1440: 900, 390: 844 };

/** 그 기관의 바꿀 값 — {card} · {group} · {map}(결과 지도 주소) · 화면이 서버에서 받은 값만(지역 · 서비스 고정값 0) */
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
  const list = (STATES[role === 'gov2' ? 'gov' : role] || []).filter((st) => !ONLY.size || ONLY.has(st.name));
  if (!list.length) return;
  const page = s.page;
  const vars = await varsFor(page, role, s.home);
  const tenant = page._who?.tenant || '';
  for (const w of WIDTHS) {
    await page.setViewportSize({ width: w, height: H[w] || 900 });
    for (const st of list) {
      const shot = SHOTS ? (n) => path.join(OUT, 'shots', `${role}-${w}-${n}.png`) : null;
      if (shot) fs.mkdirSync(path.join(OUT, 'shots'), { recursive: true });
      const r = await measureState(page, st, { base: s.home, vars, shot });
      const bad = (r.overlaps || []).length;
      results.push({ role, tenant, width: w, state: st.name, label: st.label, optional: !!st.optional, ...r, boxes: undefined, boxesN: (r.boxes || []).length });
      log(`  ${role}${tenant ? '(' + tenant + ')' : ''} ${w} ${st.name} ${r.ok ? '' : '상태 못 만듦 · '}${bad ? `겹침 ${bad}: ` + r.overlaps.slice(0, 3).map((o) => `${o.a} × ${o.b} ${o.w}×${o.h}`).join(' | ') : '겹침 0'} · ${(r.ms / 1000).toFixed(1)}초`);
    }
  }
}

export function report(file) {
  const bad = results.filter((r) => (r.overlaps || []).length);
  const broken = results.filter((r) => !r.ok && !r.optional);
  const skipped = results.filter((r) => !r.ok && r.optional);
  const lines = [`겹침 검사 — 상태 ${results.length}개(역할 × 폭 × 화면) · 겹친 상태 ${bad.length} · 만들지 못한 상태 ${broken.length}(필수) + ${skipped.length}(그 기관에 없는 기능)`];
  for (const r of bad) lines.push(`✗ ${r.role}${r.tenant ? '(' + r.tenant + ')' : ''} ${r.width} ${r.state} ${r.label} — ` + r.overlaps.map((o) => `${o.kind === 'cover' ? '덮음' : '겹침'} ${o.a} × ${o.b} ${o.w}×${o.h}(${o.ofSmall}%)`).join(' | '));
  for (const r of broken) lines.push(`! ${r.role} ${r.width} ${r.state} — 상태를 만들지 못함: ${r.note}`);
  if (!bad.length && !broken.length) lines.push('✓ 겹침 0');
  const text = lines.join('\n');
  if (file) fs.writeFileSync(file, JSON.stringify({ at: new Date().toISOString(), widths: WIDTHS, results }, null, 1));
  return { text, bad: bad.length + broken.length };
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
  const r = report(OUT ? path.join(OUT, 'overlap-check.json') : undefined);
  if (OUT) fs.writeFileSync(path.join(OUT, 'overlap-check.txt'), r.text + '\n');
  log('\n' + r.text);
  process.exit(r.bad ? 1 : 0);
}
