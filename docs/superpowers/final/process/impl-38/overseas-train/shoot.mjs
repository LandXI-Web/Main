/* 구현 38 · 해외 결과를 우리 모델로(원칙 269) — 바깥 주소 로그인 폼(LX 직원 · 세션 주입 0) · PC 1440.
   node docs/superpowers/final/process/impl-38/overseas-train/shoot.mjs  (01. 디자인 에서) → shots/*.png · run.json */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { frontDoor } from '../../../../../../landxi/v3/kit/lint/forbidden.mjs';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(DIR, 'shots'); fs.mkdirSync(OUT, { recursive: true });
const APP = process.env.APP || 'https://app.land-xi.dev';
const kst = () => new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Seoul' });
const hm = () => kst().slice(11, 16).replace(':', '');
const run = { at: kst(), app: APP, shots: {}, errors: [], text: {} };
const save = () => fs.writeFileSync(path.join(DIR, 'run.json'), JSON.stringify(run, null, 2));
setTimeout(() => { run.timeout = true; save(); process.exit(2); }, 600000).unref();
const browser = await chromium.launch({ channel: 'chrome' });
const watch = (p, tag) => { p.on('pageerror', (e) => run.errors.push(`${tag} ${String(e).slice(0, 200)}`)); };
const shot = async (p, name) => { const f = `${name}-1440-${hm()}.png`; await p.screenshot({ path: path.join(OUT, f) }); run.shots[f] = kst(); };
try {
  const c = await browser.newContext({ viewport: { width: 1440, height: 900 } }); const p = await c.newPage(); watch(p, 'xi');
  await frontDoor(p, APP, 'test@lx.or.kr', 'app');
  await p.waitForURL((u) => !/\/login\/?(\?|$)/.test(u.pathname), { timeout: 30000 });
  await p.goto(APP + '/landxi/v3/xi-clean/?nation=kg', { waitUntil: 'commit' });
  await p.waitForFunction(() => window.__xc?.map && window.__xc.boot?.shown, null, { timeout: 60000, polling: 100 });
  await p.waitForTimeout(7000); await shot(p, 'ximap-kg');
  run.text.ximap = await p.evaluate(() => document.querySelector('.xn-hud')?.innerText || '');
  const clickAt = async (lng, lat) => { const pt = await p.evaluate(([x, y]) => { const q = window.__xc.map.project([x, y]); const r = window.__xc.map.getCanvas().getBoundingClientRect(); return [r.left + q.x, r.top + q.y]; }, [lng, lat]); await p.mouse.click(pt[0], pt[1]); };
  await clickAt(76.6, 40.85); await p.waitForTimeout(4000); await shot(p, 'ximap-public-district');
  run.text.public = await p.evaluate(() => document.querySelector('.xn-hud')?.innerText || '');
  await p.evaluate(() => window.__xc.map.jumpTo({ center: [74.6, 42.0], zoom: 6.6 })); await p.waitForTimeout(2500);
  await clickAt(74.35, 42.95); await p.waitForTimeout(5000); await shot(p, 'ximap-model-district');
  run.text.model = await p.evaluate(() => document.querySelector('.xn-hud')?.innerText || '');
  await p.evaluate(() => window.__xc.map.jumpTo({ center: [74.45, 42.85], zoom: 10.6 }));
  await p.waitForTimeout(7000); await shot(p, 'ximap-chuy-blocks');
  await c.close();
} catch (e) { run.fatal = String(e?.stack || e).slice(0, 600); console.error(e); }
finally { save(); await browser.close(); }
console.log(JSON.stringify({ shots: Object.keys(run.shots), errors: run.errors, fatal: run.fatal, text: run.text }));
