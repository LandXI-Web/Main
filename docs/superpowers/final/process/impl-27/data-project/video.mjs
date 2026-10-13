// impl-27 새 프로젝트 한 창 10초 — 바깥 주소 · 로그인 폼(세션 주입 0) · 만들기는 누르지 않음(시험 프로젝트 0).
// 창을 연 뒤: 이름 → 공유 데이터에서 고르기 → 한 장 고르기 → 다음 쪽 → 구성원 찾기(메일 일부) · 고르기 → 파일 올리기 탭. 단계마다 창 크기를 잰다.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const ROOT = 'E:/Land-XI 플랫폼/01. 디자인';
const HW = 'C:/Users/User/AppData/Local/ms-playwright';
if (fs.existsSync(path.join(HW, 'chromium-1234'))) process.env.PLAYWRIGHT_BROWSERS_PATH = HW;
if (!process.env.DEV_PASSWORD) { const m = fs.readFileSync(path.join(ROOT, 'server/.env'), 'utf8').match(/^DEV_PASSWORD=(.*?)\s*$/m); if (m) process.env.DEV_PASSWORD = m[1]; }
process.env.LX_PW ||= process.env.DEV_PASSWORD;
const { chromium } = createRequire(path.join(ROOT, 'package.json'))('playwright');
const { frontDoor } = await import(pathToFileURL(path.join(ROOT, 'landxi/v3/kit/lint/forbidden.mjs')).href);
const APP = process.argv[2] || 'https://app.land-xi.dev';
const DIR = process.argv[3];
const VID = path.join(DIR, '_vid');
const run = { app: APP, started: new Date().toISOString(), sizes: [], errors: [] };

const browser = await chromium.launch({ channel: 'chrome' });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'ko-KR', recordVideo: { dir: VID, size: { width: 1440, height: 900 } } });
const p = await ctx.newPage();
p.on('console', (m) => { if (m.type() === 'error') run.errors.push(m.text().slice(0, 200)); });
p.on('pageerror', (e) => run.errors.push(String(e).slice(0, 300)));
const T0 = Date.now();
const sec = () => Math.round((Date.now() - T0) / 100) / 10;
try {
  await frontDoor(p, APP, 'test@lx.or.kr', 'app');
  await p.waitForURL((u) => !/\/login\/?(\?|$)/.test(u.pathname), { timeout: 30000 });
  await p.goto(APP + '/landxi/v3/lx-project/', { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => document.documentElement.dataset.projects === '1', null, { timeout: 40000 }).catch(() => null);
  await p.waitForTimeout(1500);
  run.from_s = sec();
  await p.getByRole('button', { name: '새 프로젝트' }).first().click();
  const box = p.locator('.lxp-new'); await box.waitFor();
  const size = async (what) => run.sizes.push([what, ...(await box.evaluate((el) => { const r = el.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height), Math.round(r.x), Math.round(r.y)]; }))]);
  await p.waitForTimeout(700); await size('열기');
  await box.locator('input[name=name]').pressSequentially('시험 한 창', { delay: 40 });
  await box.locator('.lxp-vt', { hasText: '공유 데이터에서 고르기' }).click();
  await box.locator('.lxp-pk-c').first().waitFor({ timeout: 30000 });
  await p.waitForTimeout(700); await size('공유 데이터에서 고르기');
  await box.locator('.lxp-pk-c').first().click(); await p.waitForTimeout(500); await size('한 장 고름');
  await box.locator('.lxp-pk-pg button', { hasText: '다음' }).click(); await p.waitForTimeout(700); await size('다음 쪽');
  await box.locator('.lxp-mem input').click();
  await box.locator('.lxp-mem input').pressSequentially('lxadmin', { delay: 60 });
  await box.locator('.lxp-mem-l button').first().waitFor({ timeout: 10000 });
  await p.waitForTimeout(500); await size('구성원 찾기(메일 일부)');
  await box.locator('.lxp-mem-l button').first().click(); await p.waitForTimeout(500); await size('구성원 고름');
  await box.locator('.lxp-vt', { hasText: '파일 올리기' }).click(); await p.waitForTimeout(900); await size('파일 올리기');
  run.to_s = sec();
  await box.locator('.lxp-vt', { hasText: '공유 데이터에서 고르기' }).click(); await p.waitForTimeout(800); await size('다시 공유 데이터');
  await p.waitForTimeout(Math.max(500, (run.from_s + 10.5 - sec()) * 1000));
} catch (e) { run.fail = String(e).slice(0, 400); }
const v = p.video();
await ctx.close();
await browser.close();
try {
  const raw = await v.path();
  const mp4 = path.join(DIR, 'new-project-10s.mp4');
  const A = run.from_s, Z = A + 10;
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', raw, '-vf', `trim=${A}:${Z},setpts=PTS-STARTPTS`, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '26', '-an', mp4]);
  run.video = { file: 'new-project-10s.mp4', seconds: Math.round((Z - A) * 10) / 10 };
} catch (e) { run.video_fail = String(e).slice(0, 200); }
fs.rmSync(VID, { recursive: true, force: true });
run.same_size = new Set(run.sizes.map((s) => s.slice(1).join(','))).size === 1;
fs.writeFileSync(path.join(DIR, 'run-video.json'), JSON.stringify(run, null, 2));
console.log(JSON.stringify(run, null, 1));
