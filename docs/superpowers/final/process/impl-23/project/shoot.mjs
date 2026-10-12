/* impl-23 프로젝트 — '후' 증거(바깥 주소 · LX 직원 로그인 폼 한 번 · 세션 주입 0 · 학습 · 분석 실행 0).
   ① 프로젝트 진행 현황 = 분석 서비스 카드와 같은 틀(1440)  ② 새 프로젝트 한 창 — 이름 · 설명 · 무엇을 · 영상 올리기(작은 시험 영상 하나 · 위치 파일) · 구성원
   ③ 만들기 한 번 → 바로 '학습데이터 구축' · 올리던 영상은 단계 막대 밑 한 줄에서 이어 올리고 등록되면 대상지가 정해짐  ④ 10초 녹화.
   올리기가 '만들기' 전에 끝나지 않게 이 시험에서만 창이 열린 동안 조각 올리기를 2.5초씩 늦춘다(서버 · 화면 코드는 그대로).
   만든 시험 프로젝트('시험 …') · 올린 시험 영상(등록 행 · 표준본 · 묶음 파일)은 끝에 지운다.
   node docs/superpowers/final/process/impl-23/project/shoot.mjs <시험 영상.tif>   (01. 디자인 에서) → shots/*.png · new-project-10s.mp4 · run.json */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { frontDoor } from '../../../../../../landxi/v3/kit/lint/forbidden.mjs';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(DIR, 'shots');
const VID = path.join(DIR, '_vid');
fs.mkdirSync(OUT, { recursive: true });
const APP = process.env.APP || 'https://app.land-xi.dev';
const TIF = process.argv[2];
if (!TIF || !fs.existsSync(TIF)) { console.error('시험 영상(.tif + 같은 이름 .tfw)이 필요합니다'); process.exit(2); }
const NAME = '시험 새 프로젝트 한 창';
const kst = () => new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Seoul' });
const hm = () => kst().slice(11, 16).replace(':', '');
const run = { at: kst(), app: APP, clicks: [], screens: [], shots: {}, errors: [], video: {} };
const click = (what) => run.clicks.push(what);
const screen = (what, url) => run.screens.push({ what, path: new URL(url).pathname });
const shot = async (p, name, o = {}) => { const f = `${name}-1440-${hm()}.png`; await p.screenshot({ path: path.join(OUT, f), ...o }); run.shots[f] = kst(); return f; };
const py = (code) => execFileSync('python', ['-c', ['import sys; sys.path.insert(0, "server")', 'from landxi_api import config', 'import psycopg, json, shutil', code].join('\n')],
  { env: { ...process.env, PYTHONIOENCODING: 'utf-8' } }).toString();
/* 시험 프로젝트 · 그 프로젝트에 이은 시험 영상(등록 행 · 표준본 · 영상 등록 작업 · 묶음 파일) 지우기 — 다른 영상은 건드리지 않는다 */
const cleanup = () => py(`
from landxi_api import imagery_std as S
c = psycopg.connect(config.PG_ADMIN_DSN, autocommit=True)
pids = [r[0] for r in c.execute("SELECT id FROM projects WHERE name=%s", (${JSON.stringify(NAME)},)).fetchall()]
imgs = [r[0] for r in c.execute("SELECT ref FROM project_links WHERE kind='imagery' AND project_id = ANY(%s)", (pids,)).fetchall()]
imgs = [i for i in imgs if c.execute("SELECT 1 FROM imagery WHERE id=%s AND layer->>'upload_draft' IS NOT NULL AND registered_at > now() - interval '1 day'", (i,)).fetchone()]
drafts = [r[0] for r in c.execute("SELECT DISTINCT layer->>'upload_draft' FROM imagery WHERE id = ANY(%s)", (imgs,)).fetchall() if r[0]]
# 시험 영상 파일 이름으로 올린 묶음(만들기 전에 끊긴 것까지) · 그 묶음으로 등록된 영상
drafts = sorted(set(drafts) | {r[0] for r in c.execute("SELECT DISTINCT draft_id FROM request_uploads WHERE tenant_id='lx' AND filename LIKE %s", (${JSON.stringify(path.basename(TIF).replace(/\.tif$/i, '') + '%')},)).fetchall()})
imgs = sorted(set(imgs) | {r[0] for r in c.execute("SELECT id FROM imagery WHERE layer->>'upload_draft' = ANY(%s)", (drafts,)).fetchall()})
for iid in imgs:
    for (sp, op) in c.execute("SELECT std_path, orig_path FROM imagery_std WHERE source_kind='imagery' AND source_id=%s", (iid,)).fetchall():
        if sp and sp != op:
            S.absolute(sp).unlink(missing_ok=True)
    c.execute("DELETE FROM imagery_std WHERE source_kind='imagery' AND source_id=%s", (iid,))
    c.execute("DELETE FROM index_results WHERE job_id IN (SELECT id FROM jobs WHERE imagery_id=%s)", (iid,))
    c.execute("DELETE FROM jobs WHERE imagery_id=%s OR options->>'imagery_id'=%s", (iid, iid))
    c.execute("DELETE FROM imagery_shares WHERE imagery_id=%s", (iid,))
    c.execute("DELETE FROM imagery WHERE id=%s", (iid,))
for did in drafts:
    c.execute("DELETE FROM request_uploads WHERE draft_id=%s AND tenant_id='lx'", (did,))
    shutil.rmtree(config.DATA_ROOT / "cog" / "uploads" / "drafts" / did, ignore_errors=True)
c.execute("DELETE FROM projects WHERE id = ANY(%s)", (pids,))
c.close()
print(json.dumps({"projects": len(pids), "imagery": imgs, "drafts": drafts}))`);

run.cleanup_before = cleanup().trim();
const browser = await chromium.launch({ channel: 'chrome' });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'ko-KR', recordVideo: { dir: VID, size: { width: 1440, height: 900 } } });
const p = await ctx.newPage();
const T0 = Date.now();
const sec = () => Math.round((Date.now() - T0) / 100) / 10;
p.on('console', (m) => { if (m.type() === 'error') run.errors.push(`${p.url().replace(/[?#].*$/, '').slice(-30)} · ${m.text().slice(0, 200)}`); });
p.on('pageerror', (e) => run.errors.push(String(e).slice(0, 300)));
try {
  await frontDoor(p, APP, 'test@lx.or.kr', 'app');
  await p.waitForURL((u) => !/\/login\/?$/.test(u.pathname), { timeout: 30000 });
  screen('대시보드', p.url());
  await p.locator('.k-rail a.k-rail-i[data-id="projects"]').click(); click('왼쪽 메뉴 프로젝트');
  await p.waitForFunction(() => document.documentElement.dataset.projects === '1', null, { timeout: 40000 });
  await p.waitForTimeout(2500);
  screen('프로젝트 진행 현황(카드)', p.url());
  await shot(p, 'a1-cards');
  run.cards = await p.locator('.lxp-pc').evaluateAll((els) => els.map((e) => ({
    name: e.querySelector('.k-sc-t')?.textContent, stage: e.querySelector('.la-ac-cat')?.textContent,
    hero: [...e.querySelectorAll('.la-ac-hero > div')].map((d) => d.textContent), where: e.querySelector('.la-ac-where .v')?.textContent,
    pic: !!e.querySelector('.la-ac-pic img'), go: e.querySelector('.k-sc-go')?.getAttribute('href') })));

  /* ② 새 프로젝트 한 창 — 창이 열린 동안 조각 올리기를 늦춘다(이 시험에서만) */
  const slow = async (route) => { await new Promise((r) => setTimeout(r, 2500)); try { await route.continue(); } catch { /* 넘어간 뒤 — 이미 끝난 요청 */ } };
  await ctx.route(/\/catalog\/imagery\/uploads\/ru_[0-9a-f]+\?offset=/, slow);
  run.video.from_s = sec();
  await p.getByRole('button', { name: '새 프로젝트' }).first().click(); click('새 프로젝트');
  const box = p.locator('.lxp-new'); await box.waitFor();
  screen('새 프로젝트 한 창', p.url());
  await p.waitForTimeout(600);
  await box.locator('input[name=name]').click(); click('이름 칸');
  await box.locator('input[name=name]').pressSequentially(NAME, { delay: 30 });
  await box.locator('textarea[name=description]').click(); run.optional = ['설명 칸(선택)'];
  await box.locator('textarea[name=description]').pressSequentially('한 창 만들기 시험 · 끝나면 지움', { delay: 20 });
  await box.locator('.lxp-chip', { hasText: '비닐하우스' }).click(); click('무엇을 칩');
  const tfw = TIF.replace(/\.tif$/i, '.tfw');
  await box.locator('.lxp-up input[type=file]').setInputFiles([TIF, tfw]); click('영상 파일 고르기(두 파일 한 번에)');
  await box.locator('.lxp-up .k-uq-r').first().waitFor();
  await box.locator('.lxp-mem input').click(); click('구성원 찾기 칸');
  await box.locator('.lxp-mem-l button').first().waitFor();
  run.member = (await box.locator('.lxp-mem-l button b').first().textContent())?.trim();
  await box.locator('.lxp-mem-l button').first().click(); click('구성원 고르기');
  await p.waitForTimeout(700);
  run.where_line = await box.locator('.lxp-where').textContent();
  await shot(p, 'a2-new-window');
  run.busy_at_make = await box.locator('.k-uq-r[data-st="up"], .k-uq-r[data-st="wait"], .k-uq-r[data-st="check"]').count();
  await box.getByRole('button', { name: '만들기' }).click(); click('만들기');
  await ctx.unroute(/\/catalog\/imagery\/uploads\/ru_[0-9a-f]+\?offset=/, slow);
  await p.waitForURL(/lx-train\/.*stage=label/, { timeout: 30000 });
  screen('학습데이터 구축', p.url());
  run.pid = new URL(p.url()).searchParams.get('project');
  await p.locator('.lxp-carry').waitFor({ timeout: 20000 });
  await p.waitForTimeout(800);
  run.carry_first = await p.locator('.lxp-carry-t').textContent();
  await shot(p, 'a3-label-carry');
  await p.waitForFunction(() => /등록했습니다|못했습니다|찾지 못했습니다/.test(document.querySelector('.lxp-carry-t')?.textContent || ''), null, { timeout: 120000 });
  run.carry_done = await p.locator('.lxp-carry-t').textContent();
  run.video.to_s = sec();
  await p.waitForTimeout(1200);
  await shot(p, 'a4-label-done');
  run.after = await p.evaluate(async (pid) => {
    const s = JSON.parse(localStorage.getItem('lx_api_session') || 'null');
    const j = await fetch('/api/v1/projects/' + pid, { headers: s ? { authorization: 'Bearer ' + s.token } : {} }).then((r) => r.json());
    return { name: j.name, description: j.description, task: j.task, regions: j.regions?.map((g) => g.name), members: j.members?.map((m) => m.name),
      stage: j.stage, ingest: j.stages?.[0]?.state, pic: !!j.pic };
  }, run.pid);
  /* 옛 주소(?new=1) → 새 창 */
  await p.goto(APP + '/landxi/v3/lx-project/?new=1');
  await p.locator('.lxp-new--one').waitFor({ timeout: 30000 });
  run.old_url_opens_window = true;
} catch (e) { run.fail = String(e).slice(0, 400); await p.screenshot({ path: path.join(OUT, `fail-${hm()}.png`) }).catch(() => {}); }
const v = p.video();
await ctx.close();
await browser.close();
try {
  const raw = await v.path();
  const mp4 = path.join(DIR, 'new-project-10s.mp4');
  const { from_s: A, to_s: Z } = run.video;
  if (A != null && Z != null) {
    const cut = Z - A > 10.5;
    // 10초 = 앞 6초(창 열기 · 채우기 · 만들기) + 뒤 4초(학습데이터 구축 · 이어 올리기 · 등록) — 넘치면 가운데(글자 치는 시간)를 뺀다
    const vf = cut ? `[0:v]trim=${A}:${A + 6},setpts=PTS-STARTPTS[a];[0:v]trim=${Z - 4}:${Z},setpts=PTS-STARTPTS[b];[a][b]concat=n=2:v=1[v]` : `[0:v]trim=${A}:${Z},setpts=PTS-STARTPTS[v]`;
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', raw, '-filter_complex', vf, '-map', '[v]', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '26', '-an', mp4]);
    run.video.file = 'new-project-10s.mp4';
    run.video.cut = cut ? `앞 6초 + 뒤 4초(가운데 ${Math.round((Z - A - 10) * 10) / 10}초 = 글자 치기 · 기다림 · 뺌)` : null;
  }
} catch (e) { run.video.fail = String(e).slice(0, 200); }
fs.rmSync(VID, { recursive: true, force: true });
run.cleanup_after = cleanup().trim();
run.n = { clicks: run.clicks.length, screens: run.screens.length };
fs.writeFileSync(path.join(DIR, 'run.json'), JSON.stringify(run, null, 2));
console.log(JSON.stringify({ n: run.n, fail: run.fail, errors: run.errors, carry: [run.carry_first, run.carry_done], after: run.after, video: run.video }, null, 1));
