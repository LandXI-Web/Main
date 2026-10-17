// impl-36 해외첫화면-고침 — 해외 기관 첫 화면(landxi/v3/global) 기능 한 바퀴 '됨 / 안 됨' + 시간.
//   node check.mjs [--app https://app.land-xi.dev] [--login lxadmin@lx.or.kr#kgz-agri] [--out <dir>] [--no-run]
// 바깥 주소 로그인 폼(세션 주입 0) · 비밀번호는 server/.env DEV_PASSWORD(출력 0) · 로그인 1번.
import fs from 'node:fs'; import path from 'node:path'; import { createRequire } from 'node:module'; import { pathToFileURL } from 'node:url';
const ROOT = 'E:/Land-XI 플랫폼/01. 디자인';
const HW = 'C:/Users/User/AppData/Local/ms-playwright'; if (fs.existsSync(path.join(HW, 'chromium-1234'))) process.env.PLAYWRIGHT_BROWSERS_PATH = HW;
if (!process.env.DEV_PASSWORD) { const m = fs.readFileSync(path.join(ROOT, 'server/.env'), 'utf8').match(/^DEV_PASSWORD=(.*?)\s*$/m); if (m) process.env.DEV_PASSWORD = m[1]; }
process.env.LX_PW ||= process.env.DEV_PASSWORD;
const { chromium } = createRequire(path.join(ROOT, 'package.json'))('playwright');
const { frontDoor } = await import(pathToFileURL(path.join(ROOT, 'landxi/v3/kit/lint/forbidden.mjs')).href);
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const APP = arg('--app', 'https://app.land-xi.dev'), LOGIN = arg('--login', 'lxadmin@lx.or.kr#kgz-agri');
const OUT = arg('--out', path.join(ROOT, 'docs/superpowers/final/process/impl-36/overseas-fix/shots'));
const NO_RUN = process.argv.includes('--no-run');
fs.mkdirSync(OUT, { recursive: true });
const hm = () => { const d = new Date(); return String(d.getHours()).padStart(2, '0') + String(d.getMinutes()).padStart(2, '0'); };
const rows = [], errors = [];
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const c = await b.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
const p = await c.newPage();
p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 240)); });
p.on('pageerror', (e) => errors.push('pageerror ' + String(e).slice(0, 240)));
const shot = async (n) => { const f = `${n}-1440-${hm()}.png`; await p.screenshot({ path: path.join(OUT, f) }); return f; };
const st = () => p.evaluate(() => {
  const why = document.querySelector('.gl-why'); const big = document.querySelector('.gl-hud .k-big'); const ld = document.querySelector('.k-ld');
  const none = big?.querySelector('.k-big-none');
  return { level: document.querySelector('.gl')?.dataset.level, state: document.body.dataset.state, why: why && !why.hidden ? why.textContent : '', run: document.querySelector('.gl-run')?.disabled,
    big: big?.dataset.state || '', v: big?.dataset.v || '', label: big?.querySelector('.k-big-l')?.textContent || '', none: none && !none.hidden && big.classList.contains('is-none') ? none.textContent : '',
    loading: !!ld && !ld.hidden, prog: !document.querySelector('.gl-prog')?.hidden, body: (document.querySelector('.gl-body')?.innerText || '').replace(/\s+/g, ' ').slice(0, 160) };
});
const until = async (fn, ms = 30000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const s = await st().catch(() => null); if (s && fn(s)) return { s, ms: Date.now() - t0 }; await p.waitForTimeout(100); } return { s: await st().catch(() => ({})), ms: null }; };
const row = (what, ok, ms, note, img) => { rows.push({ what, ok: ok ? '됨' : '안 됨', ms, note, shot: img || null }); console.log(ok ? 'OK ' : 'NG ', what, ms ?? '', note || ''); };
const tab = (name) => p.locator('.gl-tab', { hasText: name }).click();

try {
  const tl = Date.now();
  await frontDoor(p, APP, LOGIN);
  const login = Date.now() - tl;
  const t0 = Date.now();
  // 첫 표시 — 가운데 'Loading'(키트) 또는 글로브 중 먼저 보이는 것
  const e0 = await until((s) => s.loading || !!s.level, 30000);
  row('첫 표시(가운데 Loading 또는 글로브)', e0.ms !== null, e0.ms, e0.s.level ? '글로브' : 'Loading', e0.s.level ? null : await shot('00-loading'));
  const g = await until((s) => s.level, 30000);
  const a = await until((s) => s.state === 'ready', 30000);
  const aAt = Date.now() - t0;
  const r = await until((s) => s.run === false, 30000);
  const rAt = Date.now() - t0;
  const n = await until((s) => s.big === 'ok' || s.none, 30000);
  const nAt = Date.now() - t0;
  row('로그인 → 해외 첫 화면', /\/landxi\/v3\/global\//.test(p.url()), login, new URL(p.url()).pathname);
  row('글로브 그려짐', g.ms !== null, g.ms);
  row('나라 → 지역 자동 착지', a.ms !== null, aAt, a.s.label);
  row("'Checking…' 사라지고 'Run this season' 켜짐", r.ms !== null && !r.s.why, rAt, r.s.why || '');
  await p.waitForTimeout(1200);   // 숫자가 차오르는 움직임(0.75초)이 끝난 뒤 찍는다
  row('큰 숫자(작황 하락)', n.s.big === 'ok', nAt, `${n.s.v} km² · 착지 뒤 ${n.ms} ms`, await shot('01-landing'));

  // 글자 크기 — 보이는 글자 중 14px 미만(지도 출처 · 축척 같은 지도 부품 제외)
  const small = await p.evaluate(() => { const out = []; for (const el of document.querySelectorAll('body *')) { if (!el.getClientRects().length || el.closest('.maplibregl-control-container')) continue; if (![...el.childNodes].some((x) => x.nodeType === 3 && x.textContent.trim())) continue; const f = parseFloat(getComputedStyle(el).fontSize); if (f < 14) out.push(`${String(el.className || el.tagName).slice(0, 30)}:${f}px:${el.textContent.trim().slice(0, 24)}`); } return out; });
  row('글자 14px 미만 0(지역 화면)', small.length === 0, null, small.slice(0, 6).join(' | '));

  // 계절 바꾸기
  const opts = await p.locator('.gl-season option').evaluateAll((o) => o.map((x) => x.value));
  const other = opts.find((v) => /Summer/.test(v)) || opts[0];
  let t = Date.now(); await p.selectOption('.gl-season', other);
  let s = await until((x) => (x.big === 'ok' || x.none) && !x.why.startsWith('Checking'), 30000);
  row(`계절 바꾸기(${other})`, s.ms !== null, Date.now() - t, (s.s.big === 'ok' ? `${s.s.v} km²` : s.s.none) + (s.s.why ? ' · ' + s.s.why : '') + ` · Run ${s.s.run ? '꺼짐' : '켜짐'}`, await shot('02-season'));
  const cur = opts[opts.length - 1];
  t = Date.now(); await p.selectOption('.gl-season', cur);
  s = await until((x) => x.big === 'ok' && x.run === false, 30000);
  row(`계절 되돌리기(${cur})`, s.ms !== null, Date.now() - t, `${s.s.v} km²`);

  // NDVI
  t = Date.now(); await tab('NDVI');
  await p.waitForSelector('.gl-line svg, .gl-line .k-line, .gl-body .k-empty', { timeout: 20000 }).catch(() => null);
  const nd = await p.evaluate(() => ({ line: !!document.querySelector('.gl-line svg, .gl-line .k-line'), v: document.querySelector('.k-line-v')?.textContent || '' }));
  row('NDVI 탭(달별 선 · 지도 NDVI)', nd.line, Date.now() - t, nd.v, await shot('03-ndvi'));
  // Sprawl
  t = Date.now(); await tab('Sprawl'); await p.waitForTimeout(600);
  s = await st();
  row('Sprawl 탭(건물 면적 2017 · 2025)', /2017/.test(s.body) || /No result yet/.test(s.body), Date.now() - t, s.body.slice(0, 80) + ` · 큰 숫자 ${s.v || s.none}`, await shot('04-sprawl'));
  // Register
  t = Date.now(); await tab('Register'); await p.waitForTimeout(600);
  const csv = path.join(ROOT, 'shots/r3/r3-global/kgz-agri-sample-register.csv');
  let reg = { m: '', rows: 0, err: '표본 파일 없음' };
  if (fs.existsSync(csv)) {
    await p.locator('.gl-reg input[type=file]').setInputFiles(csv);
    await p.waitForFunction(() => !/Comparing/.test(document.querySelector('.gl-reg-up')?.textContent || ''), null, { timeout: 30000 }).catch(() => null);
    await p.waitForTimeout(400);
    reg = await p.evaluate(() => ({ m: document.querySelector('.gl-reg-m')?.textContent || '', rows: document.querySelectorAll('.gl-reg-t tbody tr').length, err: document.querySelector('.gl-reg-err')?.textContent || '' }));
  }
  s = await st();
  row('Register 탭(구역 대장 올리기 → 대조)', reg.rows > 0 && !reg.err, Date.now() - t, `${reg.m} · ${reg.rows}줄 · 큰 숫자 ${s.v}${reg.err ? ' · ' + reg.err : ''}`, await shot('05-register'));
  if (reg.rows > 0) {
    const before = await st();
    t = Date.now(); await p.locator('.gl-reg-t tbody tr').first().click(); await p.waitForTimeout(2500);
    const after = await st();
    row('대장 표 줄 누르기 → 그 구역으로', true, Date.now() - t, `${before.label} → ${after.label}`);
  }

  // Season 으로 돌아와 다운로드
  await tab('Season'); await p.waitForTimeout(500);
  const home = await p.evaluate(() => [...document.querySelectorAll('.gl-crumb')].map((x) => x.textContent).filter(Boolean).join(' › '));
  t = Date.now();
  const dlBtn = p.locator('.gl-dl');
  if (await dlBtn.isVisible()) {
    const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 15000 }), dlBtn.click()]);
    const fp = path.join(OUT, 'download.csv'); await dl.saveAs(fp);
    const lines = fs.readFileSync(fp, 'utf8').trim().split(/\r?\n/);
    row('Download(CSV)', lines.length > 1, Date.now() - t, `${dl.suggestedFilename()} · ${lines.length - 1}줄`);
  } else row('Download(CSV)', false, null, '단추 없음');

  // Run this season
  if (!NO_RUN) {
    await until((x) => x.run === false, 20000);
    t = Date.now();
    await p.locator('.gl-run:not([hidden]), .gl-run-k').first().click();
    const pr = await until((x) => x.prog, 10000);
    const dn = await until((x) => !x.prog && x.big === 'ok' && x.run === false, 240000);
    row('Run this season(실행 → 진행 → 결과)', pr.ms !== null && dn.ms !== null, Date.now() - t, `${home} · 진행 표시 ${pr.ms} ms · 끝 ${dn.s.v} km²`, await shot('06-run'));
  }

  // 도움말
  t = Date.now(); await p.locator('.k-help').click();
  const hp = await p.waitForSelector('.gl-help', { timeout: 8000 }).then(() => true).catch(() => false);
  row('도움말(?)', hp, Date.now() - t, '', await shot('07-help'));
  await p.keyboard.press('Escape'); await p.waitForTimeout(500);

  // XI ChatGEO
  t = Date.now();
  const askBtn = p.locator('.gl-ask:visible, button:has-text("XI ChatGEO"):visible, a:has-text("XI ChatGEO"):visible, [aria-label*="ChatGEO"]:visible').first();
  if (await askBtn.count()) {
    await askBtn.click(); await p.waitForSelector('.k-ck-i', { state: 'visible', timeout: 8000 }).catch(() => null);
    await p.locator('.k-ck-i:visible').first().fill('How much cropland dropped in Ysyk-Ata this season?');
    await p.locator('.k-ck-i:visible').first().press('Enter');
    await p.waitForFunction(() => { const box = [...document.querySelectorAll('.k-ck')].find((x) => x.getClientRects().length); const a = box?.querySelector('.k-ck-a'); return box && !box.dataset.busy && a && a.textContent.trim().length > 3 && !a.querySelector('.k-ck-dots'); }, null, { timeout: 90000 }).catch(() => null);
    const ans = await p.evaluate(() => { const box = [...document.querySelectorAll('.k-ck')].find((x) => x.getClientRects().length); return (box?.querySelector('.k-ck-a')?.textContent || '').trim().slice(0, 200); });
    row('XI ChatGEO(영어 질문 → 영어 답)', ans.length > 3 && !/[가-힣]/.test(ans), Date.now() - t, ans.slice(0, 120), await shot('09-chatgeo'));
    await p.keyboard.press('Escape'); await p.waitForTimeout(500);
  } else row('XI ChatGEO', false, null, '여는 단추 없음');

  // 나라로 올라가기 → 다른 구역 누르기(내 구역 밖 = 한 줄 안내)
  t = Date.now(); await p.locator('button.gl-crumb', { hasText: /Kyrgyz/ }).click();
  s = await until((x) => x.level === 'country', 8000);
  row('위치 띠 — 나라로', s.ms !== null, Date.now() - t, '', await shot('10-country'));
  await p.waitForTimeout(2500);
  await p.mouse.click(700, 450); await p.waitForTimeout(800);   // 내 구역 밖 한 곳(At-Bashy 자리)
  const guard = await p.evaluate(() => { const g = document.querySelector('.gl-guard'); return g && !g.hidden ? g.textContent : ''; });
  s = await st();
  row('내 구역 밖 누르기 → 안내 한 줄', !!guard || s.level === 'district', null, guard || `들어감 ${s.label}`, await shot('11-guard'));
  t = Date.now(); await p.locator('.gl-crumb--globe').click();
  s = await until((x) => x.level === 'globe', 8000);
  row('위치 띠 — 글로브로', s.ms !== null, Date.now() - t, '', await shot('12-globe'));

  // 나가기
  t = Date.now(); await p.locator('.k-exit').click();
  await p.waitForURL((u) => /login|gov-home|^\/$/.test(u.pathname), { timeout: 15000 }).catch(() => null);
  row('Sign out', /login|gov-home|^\/$/.test(new URL(p.url()).pathname), Date.now() - t, new URL(p.url()).pathname);
} catch (e) { row('중단', false, null, String(e).slice(0, 300)); await shot('zz-fail').catch(() => null); }
finally {
  const res = { app: APP, login: LOGIN.replace(/^[^@]+/, '…'), at: new Date().toISOString(), rows, console_errors: errors };
  fs.writeFileSync(path.join(OUT, 'check.json'), JSON.stringify(res, null, 2));
  console.log('console errors', errors.length, errors.slice(0, 5));
  await b.close();
}
