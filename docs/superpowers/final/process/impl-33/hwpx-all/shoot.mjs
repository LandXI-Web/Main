/* 구현 33 · 모든 문서 = 한글 문서(.hwpx) 증거 — 바깥 주소 · 로그인 폼(남원 기관 · LX 직원 · 세션 주입 0).
   node docs/superpowers/final/process/impl-33/hwpx-all/shoot.mjs   (01. 디자인 에서) → shots/*.png · got/*.hwpx · run.json
   곳별 내려받기 → 받은 파일 이름 · 크기 · 그 화면의 숫자 · 글을 run.json 에 — 형식 · 숫자 대조는 check.py.
   A 기관 'AI 분석 결과 보고서' 탭 · B 기관 실태조사 보고서 초안(서버) · C 기관 화면 보고서(세 문단 → 한글 문서)
   D XI ChatGEO '보고서 초안' · E XI맵 보고서 도구 · F XI맵 대시보드 '보고서로'(공용 서식으로 옮긴 뒤 다시) */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { frontDoor } from '../../../../../../landxi/v3/kit/lint/forbidden.mjs';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(DIR, 'shots');
const GOT = process.env.GOT || path.join(DIR, 'got');
fs.mkdirSync(OUT, { recursive: true }); fs.mkdirSync(GOT, { recursive: true });
const APP = process.env.APP || 'https://app.land-xi.dev';
const GOV = process.env.GOV || 'https://namwon.land-xi.dev';
const ONLY = (process.env.ONLY || 'ABCDEF').split('');
const kst = () => new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Seoul' });
const hm = () => kst().slice(11, 16).replace(':', '');
const RUNF = path.join(DIR, process.env.RUN || 'run.json');
const run = fs.existsSync(RUNF) && process.env.KEEP ? JSON.parse(fs.readFileSync(RUNF, 'utf8')) : { at: kst(), shots: {}, errors: [], local: [], bad: [], got: {} };
run.at2 = kst();
const save = () => fs.writeFileSync(RUNF, JSON.stringify(run, null, 2));
const shot = async (page, name) => { const f = `${name}-1440-${hm()}.png`; await page.screenshot({ path: path.join(OUT, f) }); run.shots[f] = kst(); return f; };
const guard = setTimeout(() => { save(); process.exit(2); }, 900000);
const watch = (p) => {
  p.on('console', (m) => { if (m.type() === 'error') run.errors.push(m.text().slice(0, 300)); });
  p.on('pageerror', (e) => run.errors.push(String(e).slice(0, 300)));
  p.on('request', (r) => { if (/\/\/(127\.0\.0\.1|localhost|\[::1\])|:8700|:4173/.test(r.url())) run.local.push(r.url()); });
  p.on('response', (r) => { if (r.status() >= 400) run.bad.push(`${kst().slice(11)} ${r.status()} ${r.url().replace(/[?#].*$/, '').slice(0, 160)}`); });
};
const grab = async (p, key, click, extra = {}) => {
  const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 240000 }), click()]);
  const fn = dl.suggestedFilename();
  const to = path.join(GOT, `${key}_${fn}`);
  await dl.saveAs(to);
  run.got[key] = { file: path.basename(to), name: fn, bytes: fs.statSync(to).size, at: kst(), ...extra };
  save();
  return run.got[key];
};
const browser = await chromium.launch({ channel: 'chrome' });
try {
  /* ── 남원 기관 ── */
  if (ONLY.some((x) => 'ABC'.includes(x))) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
    const p = await ctx.newPage(); watch(p);
    await frontDoor(p, GOV, 'lxadmin@lx.or.kr', { tenant: 'namwon' });
    await p.waitForURL((u) => !/gov-home|\/login\/?$/.test(u.pathname), { timeout: 30000 }).catch(() => {});
    const G = GOV + '/landxi/v3/';
    if (ONLY.includes('A')) {
      await p.goto(G + 'gov-select/?list=1', { waitUntil: 'domcontentloaded' });
      await p.waitForSelector('.gs-page', { timeout: 30000 }); await p.waitForTimeout(2500);
      const cards = await p.evaluate(() => [...new Set([...document.querySelectorAll('a[href*="service="]')].map((a) => new URL(a.href).searchParams.get('service')).filter(Boolean))]);
      const withRes = await p.evaluate(async () => {   // 결과가 있는 서비스(보고서 탭이 고르는 목록과 같은 곳)
        const t = JSON.parse(localStorage.getItem('lx_api_session') || 'null')?.token;
        const j = await fetch('/api/v1/spaces/me/report/services', { headers: t ? { authorization: 'Bearer ' + t } : {} }).then((r) => r.json()).catch(() => null);
        return (j?.items || []).map((x) => x.card);
      });
      const card = process.env.CARD || withRes.find((c) => cards.includes(c)) || withRes[0] || cards[0];
      await p.goto(G + `gov-report/?service=${encodeURIComponent(card)}&tab=report`, { waitUntil: 'domcontentloaded' });
      await p.waitForSelector('.gr-rdoc', { timeout: 120000 });
      await p.waitForSelector('.gr-map-img img', { timeout: 120000 }).catch(() => {});
      await p.waitForTimeout(1500);
      const scr = await p.evaluate(() => ({ title: document.querySelector('.gr-rdoc-t')?.innerText, total: document.querySelector('.gr-rdoc')?.dataset.v,
        button: [...document.querySelectorAll('#rp-form button')].map((b) => b.innerText),
        rows: [...document.querySelectorAll('.gr-rtb tbody tr')].map((tr) => [...tr.querySelectorAll('td,th')].map((c) => c.innerText.trim())) }));
      await shot(p, 'A-gov-ai-report');
      await grab(p, 'A', () => p.locator('#rp-form button', { hasText: '한글 문서 내려받기' }).click(), { where: '기관 · AI 분석 결과 보고서 탭', card, screen: scr });
    }
    if (ONLY.includes('B') || ONLY.includes('C')) {
      await p.goto(G + 'gov-report/?tab=report', { waitUntil: 'domcontentloaded' });
      await p.waitForFunction(() => document.querySelectorAll('#rp-emd option').length > 0, null, { timeout: 60000 });
      await p.waitForTimeout(1500);
      const emd = await p.evaluate(() => ({ cd: document.querySelector('#rp-emd').value, nm: document.querySelector('#rp-emd').selectedOptions[0]?.innerText, buttons: [...document.querySelectorAll('#rp-form button, #doc-act a')].map((b) => b.innerText) }));
      const js = await p.evaluate(async (cd) => {
        const t = JSON.parse(localStorage.getItem('lx_api_session') || 'null')?.token;
        const r = await fetch(`/api/v1/survey/reports/draft?emd_cd=${cd}&top=20`, { headers: t ? { authorization: 'Bearer ' + t } : {} });
        const j = await r.json(); return { title: j.title, cites: (j.citations || []).filter((c) => c.value).map((c) => [c.label, c.value.value]) };
      }, emd.cd);
      await shot(p, 'B-gov-survey-form');
      if (ONLY.includes('B')) await grab(p, 'B', () => p.locator('#rp-dl').click(), { where: '기관 · 실태조사 보고서 초안(서버)', emd, json: js });
      if (ONLY.includes('C')) {
        await p.locator('#rp-go').click();
        await p.waitForSelector('#doc-act:not([hidden])', { timeout: 240000 });
        await p.waitForTimeout(1200);
        const paras = await p.evaluate(() => [...document.querySelectorAll('.gr-sec:not([hidden]) .gr-p p')].map((x) => x.innerText.replace(/\s+/g, ' ').trim()));
        await shot(p, 'C-gov-draft-screen');
        await grab(p, 'C', () => p.locator('#doc-dl').click(), { where: '기관 · 보고서 세 문단(화면 → 한글 문서)', emd, paras });
      }
    }
    await ctx.close();
  }
  /* ── LX 직원 ── */
  if (ONLY.some((x) => 'DEF'.includes(x))) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
    const p = await ctx.newPage(); watch(p);
    await frontDoor(p, APP, 'test@lx.or.kr', 'app');
    await p.waitForURL((u) => !/\/login\/?$/.test(u.pathname), { timeout: 30000 });
    await p.goto(APP + '/landxi/v3/xi-clean/', { waitUntil: 'commit' });
    await p.waitForFunction(() => window.__xc?.boot?.shown && document.querySelector('.k-chat-root[data-dock]'), null, { timeout: 90000, polling: 200 });
    await p.waitForTimeout(2500);
    const say = async (q) => {
      const inp = p.locator('.k-chat-root[data-dock] .k-ck-i');
      await inp.click(); await inp.fill(''); await inp.pressSequentially(q, { delay: 25 }); await inp.press('Enter');
      await p.waitForTimeout(800);
      await p.waitForFunction(() => document.querySelector('.k-chat')?.dataset.state && document.querySelector('.k-chat').dataset.state !== 'busy', null, { timeout: 180000 }).catch(() => {});
    };
    if (ONLY.includes('D')) {
      await say('남원시 AI 분석 결과 보고서 초안 만들어 줘');
      await p.waitForSelector('.k-chat-root[data-dock] button.k-ck-file', { timeout: 180000 });
      await p.waitForTimeout(800);
      const ans = await p.evaluate(() => { const a = [...document.querySelectorAll('.k-chat-root[data-dock] .k-ck-a')].pop(); return a ? a.innerText : ''; });
      const label = await p.locator('.k-chat-root[data-dock] button.k-ck-file').last().getAttribute('data-label');
      await shot(p, 'D-chatgeo-report');
      await grab(p, 'D', () => p.locator('.k-chat-root[data-dock] button.k-ck-file').last().click(), { where: 'XI ChatGEO · 보고서 초안', answer: ans, label });
    }
    if (ONLY.includes('E')) {
      await p.evaluate(() => window.__xc.map.jumpTo({ center: [127.39, 35.42], zoom: 11 }));
      await p.waitForTimeout(5000);
      await p.locator('.xc-tools [data-tool="report"]').click();
      const btn = p.locator('button.t-btn', { hasText: '보고서 초안' });
      await btn.waitFor({ timeout: 30000 });
      const bt = await btn.innerText();
      await shot(p, 'E-ximap-report-pop');
      await grab(p, 'E', () => btn.click(), { where: 'XI맵 · 보고서 도구', button: bt });
    }
    if (ONLY.includes('F')) {
      await p.evaluate(() => { window.__xc.dash = null; });
      await say('남원시 현황 보여 줘');
      await p.waitForFunction(() => window.__xc.dash?.title && !document.querySelector('.xd').hidden, null, { timeout: 90000 });
      await p.waitForTimeout(2000);
      const d = await p.evaluate(() => ({ title: document.querySelector('.xd-h h2')?.innerText,
        kpis: [...document.querySelectorAll('.xd-kpi')].map((k) => `${k.querySelector('.xd-v b')?.innerText || ''}${k.querySelector('.xd-v small')?.innerText || ''}`) }));
      await shot(p, 'F-dash');
      await grab(p, 'F', () => p.locator('.xd-rep').click(), { where: 'XI맵 대시보드 · 보고서로', screen: d });
    }
    await ctx.close();
  }
} catch (e) { run.errors.push('스크립트: ' + String(e.message || e).slice(0, 300)); }
await browser.close();
run.done_at = kst(); save(); clearTimeout(guard);
console.log(JSON.stringify({ got: Object.fromEntries(Object.entries(run.got).map(([k, v]) => [k, [v.name, v.bytes]])), errors: run.errors, bad: run.bad, local: run.local.length }, null, 1));
