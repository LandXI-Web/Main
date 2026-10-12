/* impl-23 프로젝트 — '전' 진단(바깥 주소 · LX 직원 로그인 폼 한 번 · 세션 주입 0).
   지금 새 프로젝트 길을 실제로 눌러 누른 횟수 · 거친 화면을 센다. 만든 시험 프로젝트('시험 …')는 끝에 지운다(DB). 영상은 올리지 않음.
   node docs/superpowers/final/process/impl-23/project/before.mjs   (01. 디자인 에서) → shots/before-*.png · before.json */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { frontDoor } from '../../../../../../landxi/v3/kit/lint/forbidden.mjs';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(DIR, 'shots');
fs.mkdirSync(OUT, { recursive: true });
const APP = process.env.APP || 'https://app.land-xi.dev';
const NAME = '시험 새 프로젝트 전';
const kst = () => new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Seoul' });
const hm = () => kst().slice(11, 16).replace(':', '');
const run = { at: kst(), app: APP, clicks: [], screens: [], shots: {}, errors: [] };
const click = (what) => run.clicks.push(what);
const screen = (what, url) => run.screens.push({ what, path: new URL(url).pathname });
const shot = async (p, name) => { const f = `before-${name}-1440-${hm()}.png`; await p.screenshot({ path: path.join(OUT, f) }); run.shots[f] = kst(); };
const drop = () => execFileSync('python', ['-c', [
  'import sys; sys.path.insert(0, "server")', 'from landxi_api import config', 'import psycopg',
  `c = psycopg.connect(config.PG_ADMIN_DSN, autocommit=True); c.execute("DELETE FROM projects WHERE name=%s", (${JSON.stringify(NAME)},)); c.close()`,
].join('\n')], { env: { ...process.env, PYTHONIOENCODING: 'utf-8' } });

const browser = await chromium.launch({ channel: 'chrome' });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'ko-KR' });
const p = await ctx.newPage();
p.on('console', (m) => { if (m.type() === 'error') run.errors.push(m.text().slice(0, 200)); });
p.on('pageerror', (e) => run.errors.push(String(e).slice(0, 200)));
try {
  await frontDoor(p, APP, 'test@lx.or.kr', 'app');
  await p.waitForURL((u) => !/\/login\/?$/.test(u.pathname), { timeout: 30000 });
  screen('대시보드', p.url());
  await p.locator('.k-rail a.k-rail-i[data-id="projects"]').click(); click('왼쪽 메뉴 프로젝트');
  await p.waitForURL(/lx-project\//); await p.locator('.lxp-list').waitFor();
  await p.waitForTimeout(1500);
  screen('프로젝트 진행 현황(표)', p.url()); await shot(p, 'list');
  await p.getByRole('button', { name: '새 프로젝트' }).first().click(); click('새 프로젝트');
  const box = p.locator('.lxp-new'); await box.waitFor();
  screen('새 프로젝트 창(이름 · 무엇을 · 어디)', p.url());
  await box.locator('.lxp-chip').first().click(); click('무엇을 칩');
  await box.locator('.lxp-pick input[placeholder="시군구 이름을 검색"]').waitFor();
  await box.locator('.lxp-pick input').click(); click('어디 검색 칸');
  await box.locator('.lxp-pick input').fill('남원');
  await box.locator('.lxp-pick [role=option]').first().waitFor();
  await box.locator('.lxp-pick [role=option]').first().click(); click('시군구 고르기');
  await box.locator('input[name=name]').click(); click('이름 칸');
  await box.locator('input[name=name]').fill(NAME);
  await shot(p, 'new');
  await box.getByRole('button', { name: '만들기' }).click(); click('만들기');
  await p.waitForURL((u) => u.searchParams.get('project')?.startsWith('prj_'), { timeout: 20000 });
  await p.locator('.lxp-now').waitFor();
  screen('프로젝트 한 장', p.url()); await shot(p, 'project');
  run.peopleOnProject = await p.locator('.lxp-sel').count();      // 구성원 더하기는 여기(고르기 + 더하기 단추 = 2번 · 한 명마다)
  click('구성원 고르기(한 명)'); click('구성원 더하기');               // 셈만 — 실제로 더하지 않음
  const go = p.locator('.lxp-now .lxp-go').first();
  run.nextLabel = (await go.textContent())?.trim();
  await go.click(); click(`지금 할 일 '${run.nextLabel}'`);
  await p.waitForURL(/lx-ingest\//, { timeout: 20000 }); await p.waitForTimeout(2500);
  screen('데이터 올리기(지역 지도 · 서랍)', p.url()); await shot(p, 'ingest');
  run.ingestButtons = await p.locator('button:has-text("영상 등록"), a:has-text("영상 등록")').count();
  click('영상 등록 단추'); click('파일 고르기 · 끌어 놓기');           // 셈 — 시트 열기 · 파일 고르기(올리지 않음)
  click('단계 막대 2 학습데이터 구축');
  await p.locator('.k-sub .lxp-st').nth(1).click();
  await p.waitForURL(/lx-train\//, { timeout: 20000 }); await p.waitForTimeout(2500);
  screen('학습데이터 구축', p.url()); await shot(p, 'label');
} catch (e) { run.fail = String(e).slice(0, 300); }
finally {
  drop();
  run.n = { clicks: run.clicks.length, screens: run.screens.length };
  fs.writeFileSync(path.join(DIR, 'before.json'), JSON.stringify(run, null, 2));
  await browser.close();
  console.log(JSON.stringify(run.n), run.fail || '', run.errors.length);
}
