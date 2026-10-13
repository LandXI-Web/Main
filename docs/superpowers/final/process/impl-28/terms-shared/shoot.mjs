// impl-28 용어 되돌리기 · 고친 것 문구 · 관리자 공유 데이터 — 전/후 그림(로그인 폼 · 세션 주입 0). 사용:
//   node shoot.mjs --tag before --app http://localhost:4190 --gate --out <dir>        (바꾸기 전 커밋 화면 파일을 이 PC 관문으로)
//   node shoot.mjs --tag after  --app https://app.land-xi.dev --admin https://admin.land-xi.dev --out <dir> [--upload <tif>]
// 비밀번호는 server/.env DEV_PASSWORD(출력 0).
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const ROOT = 'E:/Land-XI 플랫폼/01. 디자인';
const HW = 'C:/Users/User/AppData/Local/ms-playwright';
if (fs.existsSync(path.join(HW, 'chromium-1234'))) process.env.PLAYWRIGHT_BROWSERS_PATH = HW;
if (!process.env.DEV_PASSWORD) { const m = fs.readFileSync(path.join(ROOT, 'server/.env'), 'utf8').match(/^DEV_PASSWORD=(.*?)\s*$/m); if (m) process.env.DEV_PASSWORD = m[1]; }
process.env.LX_PW ||= process.env.DEV_PASSWORD;
const { chromium } = createRequire(path.join(ROOT, 'package.json'))('playwright');
const { frontDoor } = await import(pathToFileURL(path.join(ROOT, 'landxi/v3/kit/lint/forbidden.mjs')).href);

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const TAG = arg('--tag', 'after'), APP = arg('--app'), ADMIN = arg('--admin', APP), OUT = arg('--out');
const ONLY = arg('--only', ''), UPLOAD = arg('--upload', '');
const GATE = process.argv.includes('--gate');
const want = (k) => !ONLY || ONLY.split(',').includes(k);
const gateInit = async (c, base) => { if (GATE) await c.addInitScript((b) => { try { localStorage.setItem('lx_api_base', b); } catch {} }, base); };
fs.mkdirSync(OUT, { recursive: true });
const hm = () => { const d = new Date(); return String(d.getHours()).padStart(2, '0') + String(d.getMinutes()).padStart(2, '0'); };
const run = { tag: TAG, app: APP, admin: ADMIN, started: new Date().toISOString(), shots: [], notes: {}, errors: [] };
const save = () => fs.writeFileSync(path.join(OUT, `run-${TAG}${ONLY ? '-' + ONLY.replace(/,/g, '-') : ''}.json`), JSON.stringify(run, null, 2));
const shot = async (page, name) => { const f = `${TAG}-${name}-1440-${hm()}.png`; await page.screenshot({ path: path.join(OUT, f) }); run.shots.push(f); console.log('shot', f); };
const watch = (page) => { page.on('pageerror', (e) => run.errors.push(`${page.url()} ${e}`)); page.on('console', (m) => { if (m.type() === 'error') run.errors.push(`${page.url()} ${m.text()}`); }); };
const txt = (s) => String(s || '').replace(/\s+/g, ' ').trim();

const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  if (want('train') || want('ximap')) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await gateInit(ctx, APP);
    const p = await ctx.newPage(); watch(p);
    await frontDoor(p, APP, 'test@lx.or.kr', 'app');
    await p.waitForURL((u) => !/\/login\/?(\?|$)/.test(u.pathname), { timeout: 30000 });
    await p.waitForTimeout(2000);

    if (want('train')) {
      const pj = await p.evaluate(async () => { const { api } = await import('/landxi/v3/kit/util.js'); return api('/projects?scope=all'); });
      const pid = (pj.items || []).find((x) => /비닐하우스/.test(x.name))?.id;
      await p.goto(`${APP}/landxi/v3/lx-train/?project=${pid}&stage=train`, { waitUntil: 'domcontentloaded' });
      await p.waitForFunction(() => document.documentElement.dataset.trainBoard === '1', null, { timeout: 40000 });
      await p.waitForTimeout(1200);
      run.notes.chips = await p.evaluate(() => [...document.querySelectorAll('.tb-add .tb-chip')].map((x) => x.textContent));
      run.notes.nodes = await p.evaluate(() => [...document.querySelectorAll('.tb-node')].map((n) => n.innerText.replace(/\s+/g, ' ').trim()));
      run.notes.lock = await p.evaluate(() => document.querySelector('.tb-lock')?.innerText.replace(/\s+/g, ' '));
      run.notes.keys = await p.evaluate(() => document.querySelector('.tb-keys')?.innerText.replace(/\s+/g, ' '));
      run.notes.hist_head = await p.evaluate(() => document.querySelector('.tb-hist h2')?.innerText.replace(/\s+/g, ' '));
      await shot(p, 'train-board');
      await p.locator('.tb-node[data-kind="data"]').first().click(); await p.waitForTimeout(400);
      run.notes.data_opts = await p.evaluate(() => [...document.querySelectorAll('.tb-side .tb-opt')].map((x) => x.innerText.replace(/\s+/g, ' ')));
      await shot(p, 'train-data-drawer');
      await p.keyboard.press('Escape');
      await p.locator('.tb-node[data-kind="eval"]').first().click(); await p.waitForTimeout(400);
      run.notes.eval_side = await p.evaluate(() => document.querySelector('.tb-side')?.innerText.replace(/\s+/g, ' '));
      await shot(p, 'train-eval-drawer');
      await p.evaluate(() => window.scrollTo(0, document.body.scrollHeight)); await p.waitForTimeout(500);
      await shot(p, 'train-history');
      save();
    }

    if (want('ximap')) {
      await p.goto(`${APP}/landxi/v3/xi-clean/`, { waitUntil: 'domcontentloaded' });
      await p.waitForFunction(() => window.__xc?.boot?.shown && window.__xc.board?.hot, null, { timeout: 60000 }).catch(() => null);
      const hot = await p.evaluate(() => window.__xc?.board?.hot || null);
      if (hot) await p.evaluate((c) => window.__xc.map.jumpTo({ center: c, zoom: 14.6 }), hot);
      const fill = () => p.evaluate(() => { const m = window.__xc.map; const ls = m.getStyle().layers.filter((l) => /^xb-r-.*-fill$/.test(l.id) && m.getLayoutProperty(l.id, 'visibility') !== 'none').map((l) => l.id);
        if (m.isMoving() || !ls.length) return null;
        const r = m.getCanvas().getBoundingClientRect();
        for (const f of m.queryRenderedFeatures({ layers: ls }).filter((x) => x.geometry.type.endsWith('Polygon'))) {
          const ring = f.geometry.type === 'Polygon' ? f.geometry.coordinates[0] : f.geometry.coordinates[0][0];
          const c = ring.reduce((a, q) => [a[0] + q[0] / ring.length, a[1] + q[1] / ring.length], [0, 0]);
          const q = m.project(c);
          if (q.x > 420 && q.x < r.width - 520 && q.y > 200 && q.y < r.height - 160 && m.queryRenderedFeatures([q.x, q.y], { layers: ls }).length) return [q.x + r.x, q.y + r.y];
        }
        return null; });
      let pt = null;
      for (let i = 0; i < 80 && hot && !pt; i++) { await p.waitForTimeout(500); pt = await fill(); }
      run.notes.ximap_point = !!pt;
      if (pt) {
        await p.mouse.click(pt[0], pt[1]);
        await p.waitForSelector('.xe-card:not([hidden]) .xe-foot span', { timeout: 20000 }).catch(() => null);
        await p.waitForTimeout(1200);
        run.notes.ximap_foot = await p.evaluate(() => document.querySelector('.xe-card .xe-foot')?.innerText.replace(/\s+/g, ' '));
        await shot(p, 'ximap-edit-foot');
      }
      save();
    }
    await ctx.close();
  }

  if (want('admin') || want('shared')) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await gateInit(ctx, ADMIN);
    const a = await ctx.newPage(); watch(a);
    await frontDoor(a, ADMIN, 'lxadmin@lx.or.kr', 'admin');
    await a.waitForURL((u) => !/\/login\/?(\?|$)/.test(u.pathname), { timeout: 30000 });
    await a.waitForTimeout(2000);
    if (want('admin')) {
      await a.goto(`${ADMIN}/landxi/v3/ops-infra/#/deploys/retrain`, { waitUntil: 'domcontentloaded' });
      await a.waitForSelector('.rt-col', { timeout: 40000 }).catch(() => null);
      await a.waitForTimeout(1500);
      run.notes.retrain = await a.evaluate(() => document.querySelector('.rt-col')?.innerText.replace(/\s+/g, ' ').slice(0, 1600));
      run.notes.menu = await a.evaluate(() => [...document.querySelectorAll('.k-rail a, .k-rail button')].map((x) => x.textContent.trim()).filter(Boolean));
      await shot(a, 'admin-retrain');
      await a.goto(`${ADMIN}/landxi/v3/ops-infra/#/deploys/templates`, { waitUntil: 'domcontentloaded' });
      await a.waitForTimeout(500);
      await a.waitForSelector('.rt-blks', { timeout: 40000 }).catch(() => null);
      await a.waitForTimeout(800);
      run.notes.templates = await a.evaluate(() => document.querySelector('.rt-col')?.innerText.replace(/\s+/g, ' '));
      await shot(a, 'admin-templates');
      save();
    }
    if (want('shared')) {
      await a.goto(`${ADMIN}/landxi/v3/ops-infra/#/shared`, { waitUntil: 'domcontentloaded' });
      await a.waitForSelector('.sd-tbl tbody tr', { timeout: 40000 });
      await a.waitForTimeout(1500);
      const staff = await a.evaluate(async () => { const { api } = await import('/landxi/v3/kit/util.js'); const s = await api('/projects/imagery'); const all = await api('/projects/imagery?all=1'); return { staff_total: s.total?.value, staff_items: s.items.length, all_items: all.items.length, hidden: all.items.filter((x) => x.visible === false).length }; });
      run.notes.shared_counts = staff;
      run.notes.shared_head = await a.evaluate(() => document.querySelector('.sd-h')?.innerText.replace(/\s+/g, ' '));
      await shot(a, 'admin-shared');
      if (UPLOAD) {
        const ids = async () => a.evaluate(async () => { const { api } = await import('/landxi/v3/kit/util.js'); return (await api('/projects/imagery?all=1')).items.map((x) => x.id); });
        const staffN = async () => a.evaluate(async () => { const { api } = await import('/landxi/v3/kit/util.js'); return (await api('/projects/imagery')).total?.value; });
        const before = new Set(await ids());
        await a.locator('.sd-tools .t-btn', { hasText: '영상 올리기' }).click();
        await a.waitForSelector('.k-md .k-uq input[type=file]', { state: 'attached', timeout: 15000 });
        await a.locator('.k-md .k-uq input[type=file]').setInputFiles(UPLOAD);
        await a.waitForFunction(() => { const b = [...document.querySelectorAll('.k-md .t-btn')].find((x) => x.textContent === '영상 등록'); return b && !b.disabled; }, null, { timeout: 120000 });
        await a.waitForTimeout(700); await shot(a, 'admin-shared-upload');
        const [resp] = await Promise.all([a.waitForResponse((r) => /\/catalog\/imagery$/.test(new URL(r.url()).pathname) && r.request().method() === 'POST', { timeout: 120000 }),
          a.locator('.k-md .t-btn', { hasText: '영상 등록' }).click()]);
        const reg = await resp.json().catch(() => ({}));
        await a.waitForSelector('.k-md', { state: 'detached', timeout: 60000 }).catch(() => null);
        await a.waitForTimeout(2500);
        const added = (await ids()).filter((x) => !before.has(x));
        const id = added[0];
        run.notes.upload = { status: resp.status(), added, jobs: (reg.items || []).map((x) => x.job?.id).filter(Boolean) };
        const row = a.locator(`.sd-tbl tr[data-id="${id}"]`);
        const nm = await a.evaluate(async (i) => { const { api } = await import('/landxi/v3/kit/util.js'); return (await api('/projects/imagery?all=1')).items.find((x) => x.id === i)?.name; }, id);
        run.notes.upload.name = nm;
        await a.locator('.sd-q').fill(nm || ''); await a.waitForTimeout(600);
        await shot(a, 'admin-shared-uploaded');
        /* 공개 → 비공개: 직원 목록 수가 하나 준다(같은 목록 · 한 출처) */
        const n0 = await staffN();
        await row.locator('.sd-vis').click(); await a.waitForTimeout(1500);
        const n1 = await staffN();
        run.notes.visible_toggle = { staff_before: n0, staff_after_hide: n1, label: await row.locator('.sd-vis').textContent() };
        await shot(a, 'admin-shared-hidden');
        /* 정보 고치기 — 촬영 연도 칸 · 이름 */
        await row.locator('.t-btn', { hasText: '정보 고치기' }).click();
        await a.waitForSelector('.k-md .sd-form', { timeout: 10000 });
        await a.locator('.k-md input[aria-label="이름"]').fill((nm || '') + ' 시험');
        await a.waitForTimeout(700); await shot(a, 'admin-shared-edit');
        await a.locator('.k-md .t-btn', { hasText: '저장' }).click();
        await a.waitForSelector('.k-md', { state: 'detached', timeout: 20000 }).catch(() => null);
        await a.waitForTimeout(1500);
        run.notes.edited_name = await a.evaluate(async (i) => { const { api } = await import('/landxi/v3/kit/util.js'); return (await api('/projects/imagery?all=1')).items.find((x) => x.id === i)?.name; }, id);
        /* 영상 등록 작업(표준본)이 끝난 뒤 지운다 */
        for (let i = 0; i < 90; i++) {
          const st = await a.evaluate(async (js) => { const { api } = await import('/landxi/v3/kit/util.js'); const out = []; for (const j of js) { try { out.push((await api('/jobs/' + j)).state); } catch { out.push('?'); } } return out; }, run.notes.upload.jobs);
          run.notes.tile_state = st;
          if (st.every((x) => ['done', 'failed', 'cancelled', '?'].includes(x))) break;
          await a.waitForTimeout(4000);
        }
        await a.locator('.sd-q').fill(''); await a.locator('.sd-q').fill((nm || '') + ' 시험'); await a.waitForTimeout(600);
        await row.locator('.t-btn', { hasText: '지우기' }).click();
        await a.waitForSelector('.k-md .sd-del', { timeout: 10000 });
        await a.waitForTimeout(700); await shot(a, 'admin-shared-delete-ask');
        await a.locator('.k-md .t-btn', { hasText: '지우기' }).click();
        await a.waitForSelector('.k-md', { state: 'detached', timeout: 20000 }).catch(() => null);
        await a.waitForTimeout(1500);
        run.notes.after_delete = { exists: (await ids()).includes(id), staff_total: await staffN() };
        await a.locator('.sd-q').fill(''); await a.waitForTimeout(600);
        await shot(a, 'admin-shared-deleted');
        save();
      }
    }
    await ctx.close();
  }
} catch (e) { run.errors.push('script ' + (e?.stack || e)); }
finally { await browser.close(); run.finished = new Date().toISOString(); save(); console.log('errors', run.errors.length); }
