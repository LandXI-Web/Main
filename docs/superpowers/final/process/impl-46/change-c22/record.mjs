// 국토 변화 탐지 §7 1~8단계 녹화(지시서 §9 — 1920×1080 MP4 · 실제 화면 · 로그인은 녹화 전에 끝냄 · 로그인 · 설정 · 오류 화면 0) + 장면 그림 셋
// node docs/superpowers/final/process/impl-46/change-c22/record.mjs <base> <outDir> <photo.jpg>
//  · 녹화 전: 세 계정(LX 직원 · LX 관리자 · 한국도로공사) 로그인 → 저장 상태 · 한국도로공사 공유를 거둬 둔다(8단계에서 체크하는 장면이 보이게)
//  · 녹화: 데스크톱 1(1~6 판정) → 휴대폰(6 현장점검 · 가운데 놓음) → 데스크톱 2(7 보고서 · 8 공유 · 대시보드) → ffmpeg 로 이어 MP4
import { chromium, devices } from 'playwright';
import { frontDoor } from '../../../../../../landxi/v3/kit/lint/forbidden.mjs';
import path from 'node:path';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const [BASE = 'https://app.land-xi.dev', OUT = 'E:/도로공사/geoai_roadland/outputs/08_시연', PHOTO] = process.argv.slice(2);
const ADMIN = BASE.replace('://app.', '://admin.');
const LINE = 'E:/Land-XI 플랫폼/02. 데이터/change/inputs/담양IC_구역선.geojson';
const NAME = '고속국도 담양IC 변화 모니터링';
const TMP = path.join(OUT, '_rec');
fs.rmSync(TMP, { recursive: true, force: true }); fs.mkdirSync(TMP, { recursive: true });
const log = [];
const T0 = Date.now();
const mark = (k, extra = {}) => { const s = Math.round((Date.now() - T0) / 100) / 10; log.push({ k, s, ...extra }); console.log(s + 's', k, JSON.stringify(extra).slice(0, 200)); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await chromium.launch();

// ── 녹화 전: 한 브라우저 프로필로 로그인 · 영상 타일 미리 받기(같은 프로필의 보관 그림을 녹화가 쓴다) · 공유 거두기 — 이 준비 화면은 영상에 넣지 않는다 ──
const WARM = process.env.WARM || '';            // 미리 볼 지도 주소들(쉼표) — 같은 범위 · 같은 줌의 영상 타일을 브라우저에 받아 둔다
const prof = path.join(TMP, 'profile');
const ctxP = await chromium.launchPersistentContext(prof, { viewport: { width: 1920, height: 1080 }, acceptDownloads: true, recordVideo: { dir: TMP, size: { width: 1920, height: 1080 } } });
const drop = [];
const lp = await ctxP.newPage();
drop.push(lp.video());
await frontDoor(lp, BASE, 'test@lx.or.kr', 'app');
await frontDoor(lp, ADMIN, 'lxadmin@lx.or.kr', 'admin');
for (const u of WARM.split(',').filter(Boolean)) {
  await lp.goto(u, { waitUntil: 'domcontentloaded' });
  await lp.waitForFunction(() => (window.__lxChange?.fc?.features || []).length > 0, null, { timeout: 60000 }).catch(() => null);
  await wait(9000);
  const ids = await lp.evaluate(() => { const fs = (window.__lxChange?.fc?.features || []).filter((f) => f.properties.inside_row === '내'); return [fs.find((f) => f.properties.type === '신축'), fs.find((f) => f.properties.type === '포장 확대')].filter(Boolean).map((f) => f.id); });
  for (const id of ids) { await lp.evaluate((i) => document.dispatchEvent(new CustomEvent('kit:change-pick', { detail: { id: i } })), id); await wait(7000); }
  await lp.locator('.k-chat-fab').click().catch(() => null); await wait(6000);
}
await lp.goto(`${ADMIN}/landxi/v3/ops-infra/#/deploys/share`, { waitUntil: 'domcontentloaded' });
const box0 = lp.locator('input[type=checkbox][aria-label="국토 변화 분석서비스 · 도로공사 공유"]');
await box0.waitFor({ timeout: 60000 });
if (await box0.isChecked()) { await box0.uncheck(); await wait(1500); }
await frontDoor(lp, BASE, 'lxadmin@lx.or.kr', { tenant: 'kec' });
await wait(2500);
const state = path.join(TMP, 'state.json');
await ctxP.storageState({ path: state });
await lp.close();
if (process.env.PRE_CLEAN) { execFileSync('python', [process.env.PRE_CLEAN, ...process.env.PRE_CLEAN_ARGS.split(',')], { stdio: 'inherit' }); }
mark('녹화 전 로그인 · 타일 미리 받기 · 공유 거둠');

async function ask(page, q, { pause = 3500 } = {}) {
  if (await page.locator('#k-chat').isHidden()) { await page.locator('.k-chat-fab').click(); await wait(600); }
  await page.locator('.k-ck-i').click();
  await page.keyboard.type(q, { delay: 45 });
  await wait(400);
  const t0 = Date.now();
  await page.locator('.k-ck-i').press('Enter');
  await page.waitForFunction(() => document.querySelector('#k-chat')?.dataset.state === 'busy', null, { timeout: 10000 }).catch(() => null);
  await page.waitForFunction(() => document.querySelector('#k-chat')?.dataset.state !== 'busy', null, { timeout: 600000 });
  const ms = Date.now() - t0;
  await wait(pause);
  return ms;
}

// ── 데스크톱 1: 1~6(판정) ──
const p1 = await ctxP.newPage();
const keep = [p1.video()];
await p1.goto(`${BASE}/landxi/v3/lx-project/?new=1`, { waitUntil: 'domcontentloaded' });
await p1.locator('.lxp-new input[name=name]').waitFor({ timeout: 30000 });
await wait(1500);
await p1.locator('.lxp-new input[name=name]').click();
await p1.keyboard.type(NAME, { delay: 60 });
await wait(600);
await p1.locator('.lxp-reg-tg').click(); await wait(800);
await p1.locator('.lxp-rm .lxp-vt[data-k=line]').click(); await wait(800);
await p1.locator('.lxp-rng input[type=file]').first().setInputFiles(LINE);
await p1.locator('.lxp-buf').fill('50'); await wait(400);
await p1.locator('.lxp-yrs .lxp-chip').first().waitFor({ timeout: 60000 });
await wait(1200);
for (const b of await p1.locator('.lxp-yrs .lxp-chip').all()) { const y = parseInt(await b.textContent(), 10); if (((await b.getAttribute('aria-pressed')) === 'true') !== [2019, 2024].includes(y)) { await b.click(); await wait(500); } }
await wait(1500);
await p1.locator('.lxp-new .lxp-act .t-btn').first().click();
await p1.waitForURL(/lx-map\/\?project=/, { timeout: 60000 });
await p1.locator('.k-sw-grip').waitFor({ timeout: 60000 });
const project = new URL(p1.url()).searchParams.get('project');
await wait(6000);
mark('1 프로젝트 생성 → 두 해 영상');
// 가르기 선을 한 번 끌어 보인다
const g = await p1.locator('.k-sw-grip').boundingBox();
if (g) { await p1.mouse.move(g.x + g.width / 2, g.y + g.height / 2); await p1.mouse.down(); for (const dx of [-260, 0, 220, 0]) { await p1.mouse.move(g.x + g.width / 2 + dx, g.y + g.height / 2, { steps: 25 }); await wait(500); } await p1.mouse.up(); }
await wait(1500);
let ms = await ask(p1, '2019년과 2024년 항공영상 비교해서 구역선 안에 새로 생긴 것 찾아줘', { pause: 6000 });
await p1.waitForFunction(() => (window.__lxChange?.fc?.features || []).length > 0, null, { timeout: 60000 });
const job = await p1.evaluate(() => window.__lxChange.job);
await p1.screenshot({ path: path.join(OUT, '장면1_비교_변화폴리곤.png') });
mark('2 비교', { ms });
const pick = await p1.evaluate(() => { const f = window.__lxChange.fc.features.find((x) => x.properties.inside_row === '내' && x.properties.type === '신축'); return f.id; });
await p1.evaluate((id) => document.dispatchEvent(new CustomEvent('kit:change-pick', { detail: { id } })), pick);
await p1.locator('.chg-panel .chg-ab img').first().waitFor({ timeout: 30000 });
await wait(4000);
ms = await ask(p1, '이거 뭐야?', { pause: 6000 });
await p1.screenshot({ path: path.join(OUT, '장면2_두해썸네일_설명.png') });
mark('3 폴리곤 · 이거 뭐야', { ms });
ms = await ask(p1, '지목이 도로인데 건물 생긴 필지만 소유구분이랑 같이 표로', { pause: 6000 });
mark('4 표', { ms });
ms = await ask(p1, '철도용지도 같은 방식으로', { pause: 1000 });
await p1.waitForURL((u) => { const q = new URL(u).searchParams.get('project'); return !!q && q !== project; }, { timeout: 30000 });
await p1.waitForFunction(() => (window.__lxChange?.fc?.features || []).length > 0, null, { timeout: 60000 });
await wait(9000);
mark('5 철도', { ms });
// 6-1 담양으로 돌아와 두 건 '현장확인'
await p1.goto(`${BASE}/landxi/v3/lx-map/?project=${project}&change=${job}`, { waitUntil: 'domcontentloaded' });
await p1.waitForFunction(() => (window.__lxChange?.fc?.features || []).length > 0, null, { timeout: 60000 });
await wait(4000);
const ids = await p1.evaluate(() => { const fs = window.__lxChange.fc.features.filter((f) => f.properties.inside_row === '내'); return [fs.find((f) => f.properties.type === '신축'), fs.find((f) => f.properties.type === '포장 확대')].filter(Boolean).map((f) => f.id); });
for (const id of ids) {
  await p1.evaluate((i) => document.dispatchEvent(new CustomEvent('kit:change-pick', { detail: { id: i } })), id);
  await p1.locator('.chg-panel .chg-stb[data-st="현장확인"]').waitFor({ timeout: 20000 });
  await wait(2500);
  await p1.locator('.chg-panel .chg-stb[data-st="현장확인"]').click(); await wait(700);
  await p1.locator('.chg-panel .chg-save').click(); await wait(2500);
}
await p1.locator('.chg-panel .chg-x').click().catch(() => null);
await wait(3500);
mark('6 판정 2건', { ids });
await p1.close();

// ── 휴대폰: 6 현장점검 ──
const ctxM = await browser.newContext({ ...devices['iPhone 13'], viewport: { width: 390, height: 844 }, storageState: state, recordVideo: { dir: TMP, size: { width: 390, height: 844 } } });
const pm = await ctxM.newPage();
keep.push(pm.video());
await pm.goto(`${BASE}/landxi/v3/change-field/?job=${job}`, { waitUntil: 'domcontentloaded' });
await pm.locator('.cf-item').first().waitFor({ timeout: 60000 });
await wait(3500);
await pm.locator('.cf-item').first().click();
await pm.locator('.cf-ab img').first().waitFor({ timeout: 30000 });
await wait(4000);
await pm.mouse.wheel(0, 700); await wait(1500);
if (PHOTO) { await pm.locator('.cf-detail input[type=file]').setInputFiles(PHOTO); await pm.locator('.cf-photos img').first().waitFor({ timeout: 30000 }); await wait(1500); }
await pm.locator('.cf-stb', { hasText: '불법' }).scrollIntoViewIfNeeded(); await wait(800);
await pm.locator('.cf-stb', { hasText: '불법' }).click(); await wait(700);
await pm.locator('.cf-memo').click(); await pm.keyboard.type('현장 확인', { delay: 70 }); await wait(500);
await pm.locator('.cf-save').click(); await wait(3500);
await pm.locator('.cf-hist').scrollIntoViewIfNeeded(); await wait(3000);
mark('6 휴대폰 사진 · 불법');
await ctxM.close();

// ── 데스크톱 2: 7 보고서 · 8 공유 · 대시보드 ──
const p2 = await ctxP.newPage();
keep.push(p2.video());
await p2.goto(`${BASE}/landxi/v3/lx-map/?project=${project}&change=${job}`, { waitUntil: 'domcontentloaded' });
await p2.waitForFunction(() => (window.__lxChange?.fc?.features || []).length > 0, null, { timeout: 60000 });
await wait(4000);
ms = await ask(p2, '도로공사 보고용 보고서 만들어줘', { pause: 5000 });
mark('7 보고서 답', { ms });
const link = p2.locator('#k-chat a', { hasText: '보고서 미리보기' }).last();
await link.click();
await p2.locator('.cr-paper h1').waitFor({ timeout: 60000 });
await wait(3000);
for (let i = 0; i < 6; i++) { await p2.mouse.wheel(0, 450); await wait(1100); }
await p2.mouse.wheel(0, -5000); await wait(1200);
const [dl] = await Promise.all([p2.waitForEvent('download', { timeout: 120000 }), p2.locator('.cr-bar .t-btn', { hasText: 'PDF' }).click()]);
await dl.saveAs(path.join(OUT, '고속국도_담양IC_변화탐지보고.pdf'));
await wait(2500);
mark('7 미리보기 · PDF');
await p2.goto(`${ADMIN}/landxi/v3/ops-infra/#/deploys/share`, { waitUntil: 'domcontentloaded' });
const box = p2.locator('input[type=checkbox][aria-label="국토 변화 분석서비스 · 도로공사 공유"]');
await box.waitFor({ timeout: 60000 });
await box.scrollIntoViewIfNeeded(); await wait(2500);
await box.check(); await wait(3500);
mark('8 기관 공유');
await p2.goto('https://kec.land-xi.dev/landxi/v3/gov-select/', { waitUntil: 'domcontentloaded' });
await p2.locator('.cd-card').first().waitFor({ timeout: 60000 });
await wait(7000);
await p2.screenshot({ path: path.join(OUT, '장면3_한국도로공사_대시보드.png') });
mark('8 도로공사 대시보드');
await p2.close();
await ctxP.close();
await browser.close();

// ── 이어 붙이기(ffmpeg) — 휴대폰 화면은 1920×1080 가운데(밝은 회색 바탕) ──
const vids = [];
for (const v of keep) vids.push(await v.path());
const FF = process.env.FFMPEG || 'ffmpeg';
const parts = [];
for (const [i, v] of vids.entries()) {
  const o = path.join(TMP, `p${i}.mp4`);
  const mobile = i === 1;
  const vf = mobile ? 'scale=-2:1000,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=0xF2F4F6,fps=30,format=yuv420p' : 'scale=1920:1080,fps=30,format=yuv420p';
  execFileSync(FF, ['-y', '-loglevel', 'error', '-i', v, '-vf', vf, '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-an', o]);
  parts.push(o);
}
const list = path.join(TMP, 'list.txt');
fs.writeFileSync(list, parts.map((p) => `file '${p.replace(/\\/g, '/')}'`).join('\n'));
const mp4 = path.join(OUT, 'Land-XI_국토변화탐지_고속국도_담양IC.mp4');
execFileSync(FF, ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', '-movflags', '+faststart', mp4]);
const dur = execFileSync(process.env.FFPROBE || 'ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', mp4]).toString().trim();
mark('MP4', { mp4, seconds: Math.round(+dur) });
fs.writeFileSync(path.join(OUT, 'recording-log.json'), JSON.stringify({ log, project, job, mp4, seconds: Math.round(+dur) }, null, 1));
fs.rmSync(TMP, { recursive: true, force: true });
