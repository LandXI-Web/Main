/* impl-14 바퀴 3(10-11 12:07 now 답) 증거 — 바깥 주소(app · admin · namwon.land-xi.dev)에서 지금 새로 찍는다(원칙 162). 로그인은 로그인 폼으로만(세션 주입 0 · 세 번).
   node docs/superpowers/final/process/impl-14/a/shoot.mjs   (01. 디자인 에서) — 결과 shots/*.png + run.json(시각 · 측정 · 콘솔 오류 · 이 PC 주소 호출)
   '5분 전 알림' 한 장만 이 브라우저 시계를 앞으로 옮겨 찍는다(서버 세션 · 설정은 건드리지 않는다). */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { frontDoor } from '../../../../../../landxi/v3/kit/lint/forbidden.mjs';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(DIR, 'shots');
const APP = 'https://app.land-xi.dev', ADMIN = 'https://admin.land-xi.dev', NAMWON = 'https://namwon.land-xi.dev';
const run = { at: new Date().toISOString(), shots: {}, measure: {}, errors: [], local: [] };
const stamp = () => new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Seoul' }).slice(0, 16);
const browser = await chromium.launch({ channel: 'chrome', args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
const watch = (page, tag) => {
  page.on('console', (m) => { if (m.type() === 'error') run.errors.push(`${tag}: ${m.text()}`); });
  page.on('pageerror', (e) => run.errors.push(`${tag}: ${e}`));
  page.on('request', (r) => { if (/\/\/(127\.0\.0\.1|localhost|\[::1\])|:8700|:4173/.test(r.url())) run.local.push(r.url()); });
};
const shot = async (page, name) => { await page.screenshot({ path: path.join(OUT, name) }); run.shots[name] = stamp(); };
const V = { width: 1440, height: 900 };
const only = process.argv[2] || 'all';
const want = (k) => only === 'all' || only.split(',').includes(k);

/* 메인-1 · 메인-5 · 메인-3 */
if (want('main')) {
  const page = await browser.newPage({ viewport: V }); watch(page, 'main');
  await page.goto(APP + '/landxi/v3/main/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4000);
  await shot(page, 'main1-hero-1440.png');
  run.measure.lead = await page.evaluate(() => { const cs = getComputedStyle(document.querySelector('.m-hero .m-lead')); return { size: cs.fontSize, line: cs.lineHeight }; });
  /* 메인-5 — 트랙 B 의 ch6: ① 군별 경작지 색칠 ② 경작지 최다 군으로 다가간 실제 판정 칸 */
  const geo = await page.evaluate(() => { const t = document.getElementById('trackB'); const r = t.getBoundingClientRect(); return { top: r.top + scrollY, h: t.offsetHeight, H: innerHeight }; });
  const yAt = (x) => geo.top + (x / 10.5) * (geo.h - geo.H);
  const go = async (x, wait) => {
    await page.evaluate((yy) => scrollTo({ top: yy - 500, behavior: 'instant' }), yAt(x));
    await page.waitForTimeout(300);
    for (let i = 0; i < 5; i++) { await page.mouse.wheel(0, 100); await page.waitForTimeout(120); }
    await page.waitForTimeout(wait);
  };
  await go(3 + 0.5 * 5, 5000);
  await shot(page, 'main5-kyrgyz-districts-1440.png');
  run.measure.kgz1 = await page.evaluate(() => ({ h: document.getElementById('ch6-h').innerText, p: document.getElementById('ch6-p').innerText, big: document.querySelector('#ch6-big')?.innerText, tag: document.getElementById('ch6-tag').textContent }));
  await go(3 + 0.92 * 5, 7000);
  await shot(page, 'main5-kyrgyz-zoom-1440.png');
  run.measure.kgz2 = await page.evaluate(() => ({ tag: document.getElementById('ch6-tag').textContent, zoom: window.maplibregl ? document.querySelector('.k-stage')?.__stage?.map?.getZoom() : null }));
  /* 메인-3 — 문의 창: 연락처(전화) · 메일 주소 두 칸 · 둘 다 비면 안내 · 형식 확인 → 한 건 보내기(관리자가 '시험'으로 표시) */
  await page.evaluate(() => scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }));
  await page.waitForTimeout(3500);
  await page.locator('#fin [data-inquiry]').click();
  const md = page.locator('.k-md');
  await page.locator('.k-md-bg.is-open .iq-form').waitFor();
  await page.waitForTimeout(1000);
  await md.locator('input[name=name]').fill('시험 담당');
  await md.locator('input[name=org]').fill('Land-XI 시험 바퀴3');
  await md.locator('.iq-k', { hasText: '사용 방법' }).click();
  await md.locator('textarea[name=body]').fill('문의 창 두 칸 시험입니다. 관리자 목록에서 확인한 뒤 시험으로 표시합니다.');
  await md.locator('.iq-ck').check();
  await md.locator('.iq-go').click();
  await page.waitForTimeout(500);
  await shot(page, 'main3-need-one-1440.png');
  run.measure.need = await md.locator('.iq-msg').innerText();
  await md.locator('input[name=email]').fill('test@example');
  await md.locator('.iq-go').click();
  await page.waitForTimeout(400);
  run.measure.bad_mail = await md.locator('.iq-msg').innerText();
  await md.locator('input[name=phone]').fill('010-0000-0000');
  await md.locator('input[name=email]').fill('test@example.com');
  await page.waitForTimeout(300);
  await shot(page, 'main3-two-fields-1440.png');
  await md.locator('.iq-go').click();
  await md.locator('.iq-done').waitFor({ timeout: 15000 });
  await page.close();
}

/* Q8 ⓑ — 로그인 칸 '메일 주소' 안내 · 비밀번호 '보기' */
if (want('login')) {
  const page = await browser.newPage({ viewport: V }); watch(page, 'login');
  await page.goto(APP + '/landxi/v3/login/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  await page.fill('#pw', 'abc12345');
  await page.click('#pw-see');
  await page.waitForTimeout(300);
  await shot(page, 'q8-login-1440.png');
  run.measure.login = await page.evaluate(() => ({ ph: document.getElementById('id').placeholder, pwType: document.getElementById('pw').type, btn: document.getElementById('pw-see').textContent }));
  await page.close();
}

/* LX 직원 — 대시보드(남은 시간 · 공개 뒤 결과 확인 남음) · 5분 전 알림 · 분석하기(그림 없음 · AI 모델 정확도 · 영상 하나) · 배포 신청 대표 그림 */
if (want('staff')) {
  const ctx = await browser.newContext({ viewport: V });
  const page = await ctx.newPage(); watch(page, 'staff');
  await frontDoor(page, APP, 'test@lx.or.kr', 'app');
  await page.waitForURL((u) => !/\/login\/?$/.test(u.pathname), { timeout: 20000 });
  await page.goto(APP + '/landxi/v3/lx-console/', { waitUntil: 'domcontentloaded' });
  await page.locator('.ld-after').waitFor({ timeout: 30000 });
  await page.locator('.k-sess:not([hidden])').waitFor({ timeout: 15000 });
  await page.waitForTimeout(1500);
  await shot(page, 'q11-188-dashboard-1440.png');
  run.measure.console = await page.evaluate(() => ({ sess: document.querySelector('.k-sess').textContent, after: document.querySelector('.ld-after').innerText }));
  /* 분석하기 갤러리 — 대체 그림 없음 · 'AI 모델 정확도' · 기준 줄 없음 */
  await page.goto(APP + '/landxi/v3/lx-analyze/', { waitUntil: 'domcontentloaded' });
  await page.locator('.la-ac').first().waitFor({ timeout: 30000 });
  await page.waitForTimeout(2500);
  await shot(page, 'gpt25-gpt27-analyze-1440.png');
  run.measure.analyze = await page.evaluate(() => ({ cards: [...document.querySelectorAll('.la-ac')].map((a) => ({ name: a.querySelector('.k-sc-t')?.textContent, pic: a.querySelector('.k-sc-crop img') ? '그림' : a.querySelector('.k-sc-blank')?.textContent, acc: a.querySelector('.la-ac-hero > div small')?.textContent })),
    basis: document.querySelectorAll('.la-ac-basis').length, old: /검증 정확도/.test(document.body.innerText) }));
  /* 분석하기 자세히 — 영상 고르기 라디오(하나만) · 기준 줄은 여기에만 */
  await page.goto(APP + '/landxi/v3/lx-analyze/?card=card-5e85a9&region=52190', { waitUntil: 'domcontentloaded' });
  await page.locator('#imagery .la-im-c').first().waitFor({ timeout: 60000 });
  await page.waitForTimeout(2500);
  await page.locator('#imagery').scrollIntoViewIfNeeded();
  await page.waitForTimeout(800);
  await shot(page, 'qa2-imagery-radio-1440.png');
  run.measure.picker = await page.evaluate(() => ({ radios: document.querySelectorAll('#imagery input[type=radio]').length, checked: document.querySelectorAll('#imagery input[type=radio]:checked').length,
    checkbox: document.querySelectorAll('#imagery input[type=checkbox]').length, step: document.querySelector('.la-step small')?.textContent,
    learn: [...document.querySelectorAll('.la-dl div')].map((d) => d.innerText.replace(/\s+/g, ' ')).find((t) => /AI 모델 정확도/.test(t)) }));
  /* 배포 신청 — 대표 그림 칸(필수) · 없으면 신청 못 함(누르면 안내 · 서버로 보내지 않음) */
  await page.goto(APP + '/landxi/v3/lx-release/?project=prj_b2fa593a12&stage=publish', { waitUntil: 'domcontentloaded' });
  await page.locator('.rl-cover').waitFor({ timeout: 30000 });
  await page.waitForTimeout(1500);
  const goBtn = page.locator('.rl-foot button.t-btn');
  if (await goBtn.count()) { await goBtn.click(); await page.waitForTimeout(500); }
  await page.locator('.rl-cover').scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);
  await shot(page, 'gpt25-apply-cover-1440.png');
  run.measure.apply = await page.evaluate(() => ({ cover: document.querySelector('.rl-cover')?.innerText, msg: document.querySelector('.rl-msg')?.textContent }));
  /* 5분 전 알림 — 이 브라우저 시계만 끝나기 4분 전으로 옮긴다(서버는 그대로) */
  const exp = await page.evaluate(() => JSON.parse(localStorage.getItem('lx_api_session')).expires_at);
  const p2 = await ctx.newPage(); watch(p2, 'staff-clock');
  await p2.clock.install({ time: new Date(new Date(exp).getTime() - 4 * 60 * 1000 - 20000) });
  await p2.goto(APP + '/landxi/v3/lx-console/', { waitUntil: 'domcontentloaded' });
  await p2.locator('.k-sess:not([hidden])').waitFor({ timeout: 30000 });
  await p2.clock.runFor(16000);
  await p2.locator('.k-toast').waitFor({ timeout: 10000 });
  await p2.waitForTimeout(400);
  await shot(p2, 'q188-warn-1440.png');
  run.measure.warn = await p2.evaluate(() => ({ toast: document.querySelector('.k-toast')?.innerText, sess: document.querySelector('.k-sess').textContent }));
  await ctx.close();
}

/* LX 관리자 — 자동 로그아웃(LX 계정) · 문의 목록 두 칸 */
if (want('admin')) {
  const page = await browser.newPage({ viewport: V }); watch(page, 'admin');
  await frontDoor(page, ADMIN, 'lxadmin@lx.or.kr', 'admin');
  await page.waitForURL((u) => !/\/login\/?$/.test(u.pathname), { timeout: 20000 });
  await page.goto(ADMIN + '/landxi/v3/ops-accounts/#session', { waitUntil: 'domcontentloaded' });
  await page.locator('.acc-card[data-tab="session"] .acc-sess').waitFor({ timeout: 20000 });
  await page.waitForTimeout(800);
  await shot(page, 'q188-admin-lx-1440.png');
  run.measure.admin_session = await page.locator('.acc-card[data-tab="session"]').innerText();
  await page.goto(ADMIN + '/landxi/v3/ops-accounts/#inquiries', { waitUntil: 'domcontentloaded' });
  const row = page.locator('.acc-card[data-tab="inquiries"] tbody tr', { hasText: 'Land-XI 시험 바퀴3' }).first();
  await row.waitFor({ timeout: 20000 });
  await page.waitForTimeout(600);
  await shot(page, 'main3-admin-list-1440.png');
  run.measure.admin_head = await page.locator('.acc-card[data-tab="inquiries"] thead').innerText();
  await row.click();
  await page.locator('.k-drawer .acc-iq-body').waitFor();
  await page.locator('.k-drawer button', { hasText: '시험으로 표시' }).click();
  await page.waitForTimeout(1200);
  await page.close();
}

/* 남원 관리자 — 자동 로그아웃(자기 기관 것만) */
if (want('namwon')) {
  const page = await browser.newPage({ viewport: V }); watch(page, 'namwon');
  await frontDoor(page, NAMWON, 'lxadmin@lx.or.kr#namwon');
  await page.waitForTimeout(2000);
  await page.goto(NAMWON + '/landxi/v3/gov-accounts/#session', { waitUntil: 'domcontentloaded' });
  await page.locator('.acc-card[data-tab="session"] .acc-sess').waitFor({ timeout: 20000 });
  await page.waitForTimeout(1000);
  await shot(page, 'q188-namwon-1440.png');
  run.measure.namwon_session = await page.locator('.acc-card[data-tab="session"]').innerText();
  run.measure.namwon_sess = await page.locator('.k-sess').textContent().catch(() => null);
  await page.close();
}
await browser.close();
const prev = fs.existsSync(path.join(DIR, 'run.json')) ? JSON.parse(fs.readFileSync(path.join(DIR, 'run.json'), 'utf8')) : null;
const out = only === 'all' || !prev ? run : { ...prev, at: run.at, shots: { ...prev.shots, ...run.shots }, measure: { ...prev.measure, ...run.measure }, errors: [...prev.errors.filter((e) => !only.split(',').some((k) => e.startsWith(k))), ...run.errors], local: run.local };
fs.writeFileSync(path.join(DIR, 'run.json'), JSON.stringify(out, null, 1));
console.log(JSON.stringify({ errors: run.errors, local: run.local.length, measure: run.measure }, null, 1));
