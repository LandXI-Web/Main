// 자산 대장·현황판 점검기 — 로컬(:4173) 또는 Pages 에서 대장을 열어 콘솔 오류 0 · 390px 가로 넘침 0 · 모든 그림·영상·열기 링크가 실제로 열리는지 본다.
// 실행: node tools/review/ledger-check.mjs [베이스 URL]   기본 http://localhost:4173/Main 이 아니라 http://localhost:4173
//       예) node tools/review/ledger-check.mjs https://landxi-web.github.io/Main
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = (process.argv[2] || 'http://localhost:4173').replace(/\/$/, '');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.join(ROOT, 'shots/overview/ledger-audit');
fs.mkdirSync(OUT, { recursive: true });
const PAGES = [['masters', '/landxi/proto/review/masters.html'], ['status', '/landxi/proto/review/status/index.html'], ['hub', '/landxi/proto/review/index.html'], ['history', '/landxi/proto/review/history.html']];
const b = await chromium.launch({ channel: 'chrome' });
const report = { base: BASE, checked_at: new Date().toISOString(), pages: {} };
let bad = 0;
for (const [name, p] of PAGES) {
  for (const [w, h] of [[1440, 900], [390, 844]]) {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    const errors = [], failed = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });
    page.on('pageerror', (e) => errors.push('pageerror ' + String(e.message).slice(0, 200)));
    page.on('requestfailed', (r) => failed.push(r.url()));
    page.on('response', (r) => { if (r.status() >= 400) failed.push(`${r.status()} ${r.url()}`); });
    await page.goto(BASE + p, { waitUntil: 'load', timeout: 120000 });
    await page.waitForTimeout(800);
    const r = { errors, failed: [], scrollWidth: 0, images: 0, imagesBroken: [], links: {} };
    if (name === 'masters' || name === 'hub') {
      // 모든 그림을 지금 불러온다(lazy 해제) — 깨진 그림 0 이어야 한다
      await page.evaluate(() => document.querySelectorAll('img[loading=lazy]').forEach((i) => { i.loading = 'eager'; }));
      await page.evaluate(async () => { await Promise.all(Array.from(document.images).map((i) => i.complete ? null : new Promise((res) => { i.onload = i.onerror = res; }))); });
      const imgs = await page.evaluate(() => Array.from(document.images).filter((i) => i.getAttribute('src')).map((i) => ({ src: i.currentSrc || i.src, ok: i.complete && i.naturalWidth > 0 })));
      r.images = imgs.length; r.imagesBroken = imgs.filter((i) => !i.ok).map((i) => i.src);
      if (w === 1440 && name === 'hub') {
        // 허브의 링크 · 영상 · 포스터가 실제로 열리는지(GitHub 저장소 링크는 제외)
        const hl = await page.evaluate(() => Array.from(document.querySelectorAll('a[href], video')).flatMap((e) => (e.tagName === 'VIDEO' ? [e.src, e.poster] : [e.href])).filter(Boolean));
        const uq = [...new Set(hl.map((u) => new URL(u, BASE + p).href))].filter((u) => !/^https:\/\/github\.com\//.test(u));
        const res = {};
        for (const u of uq) { try { res[u] = (await page.request.head(u, { timeout: 30000 })).status(); } catch (e) { res[u] = 'ERR ' + String(e.message).slice(0, 60); } }
        r.links = { total: uq.length, bad: Object.entries(res).filter(([, st]) => st !== 200 && st !== 206).map(([u, st]) => `${st} ${u}`) };
      }
      if (w === 1440 && name === 'masters') {
        // 카드가 든 매체(영상 포함)·열기 링크를 HTTP 로 확인한다
        const media = await page.evaluate(() => Array.from(document.querySelectorAll('.card')).flatMap((c) => JSON.parse(c.dataset.media || '[]').map((m) => m.s).concat(Array.from(c.querySelectorAll('.meta a')).map((a) => a.href))));
        const uniq = [...new Set(media.map((u) => new URL(u, BASE + p).href))].filter((u) => !/^https:\/\/github\.com\//.test(u));
        const results = {};
        for (const u of uniq) { try { const res = await page.request.head(u, { timeout: 30000 }); results[u] = res.status(); } catch (e) { results[u] = 'ERR ' + String(e.message).slice(0, 60); } }
        r.links = { total: uniq.length, bad: Object.entries(results).filter(([, s]) => s !== 200 && s !== 206).map(([u, s]) => `${s} ${u}`) };
        // 결정 발행 글 형식 — 항목 1 + 행 전체 1 을 눌러 apply-decisions 가 읽는 줄인지 본다(브라우저 저장만, 대장은 안 바뀜)
        await page.evaluate(() => { localStorage.removeItem('lx_assets_decisions_v1'); });
        await page.reload({ waitUntil: 'load' });
        await page.click('#v3-login .ctl button[data-set="적용"]');
        await page.click('#sc-인증-계정-신청 .rowctl button[data-row-set="폐기"]');
        await page.click('#dec-pub');
        const txt = await page.inputValue('#dec-out');
        const LINE = /^[-*•]\s+(\S+)(?:\s+(.*?))?\s*:\s*(적용|검토|폐기)\s*(?:→|->|=>)\s*(적용|검토|폐기)\s*(?:\((.*)\))?\s*$/;
        const lines = txt.split('\n').filter((l) => /^[-*•]\s/.test(l));
        r.decision = { lines: lines.length, malformed: lines.filter((l) => !LINE.test(l)), sample: lines.slice(0, 2) };
        await page.evaluate(() => { localStorage.removeItem('lx_assets_decisions_v1'); });
        await page.reload({ waitUntil: 'load' });
      }
    }
    r.scrollWidth = await page.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth));
    r.failed = [...new Set(failed)].slice(0, 30);
    await page.screenshot({ path: path.join(OUT, `${name}-${w}-after.png`), fullPage: w === 390 ? false : false });
    if (name === 'masters' && w === 1440) { const el = await page.$('#sc-인증-로그인'); if (el) await el.screenshot({ path: path.join(OUT, 'masters-login-row-after.png') }); }
    if (name === 'status' && w === 1440) { const el = await page.$('#st-sc-인증-로그인'); if (el) await el.screenshot({ path: path.join(OUT, 'status-login-row-after.png') }); }
    const ok = !errors.length && r.scrollWidth <= w && !r.imagesBroken.length && !(r.links.bad || []).length && !(r.decision?.malformed || []).length;
    if (!ok) bad++;
    report.pages[`${name}@${w}`] = { ok, ...r };
    console.log(`${ok ? '✓' : '✗'} ${name}@${w}: 콘솔 오류 ${errors.length} · 가로 ${r.scrollWidth}/${w} · 그림 ${r.images}(깨짐 ${r.imagesBroken.length}) · 링크 ${r.links.total ?? '-'}(실패 ${(r.links.bad || []).length}) · 실패 요청 ${r.failed.length}${r.decision ? ` · 결정 줄 ${r.decision.lines}(형식 오류 ${r.decision.malformed.length})` : ''}`);
    for (const e of errors.slice(0, 5)) console.log('   콘솔: ' + e);
    for (const f of r.failed.slice(0, 5)) console.log('   실패: ' + f);
    for (const f of (r.links.bad || []).slice(0, 8)) console.log('   링크: ' + f);
    for (const f of r.imagesBroken.slice(0, 5)) console.log('   그림: ' + f);
    await ctx.close();
  }
}
await b.close();
fs.writeFileSync(path.join(OUT, `check-${/localhost/.test(BASE) ? 'local' : 'pages'}.json`), JSON.stringify(report, null, 1));
process.exit(bad ? 1 : 0);
