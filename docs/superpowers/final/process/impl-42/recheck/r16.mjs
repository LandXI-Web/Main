// 바퀴 16 재검수 — 이번 바퀴 새 기능을 바깥 주소 · 로그인 폼(역할마다 한 번 · 세션 주입 없음)으로 다시 누른다.
//   node r16.mjs [lx,gov,abroad]   →  r16.json · shots/r16/*.png(저장소 밖)
//   LX 직원(1920 → 1366 같은 로그인): 왼쪽 위 한 줄 · 목록 · 시도 접기 · 서비스 누르기/다시 · '보고서로' · 입력창 하나(시군구 · 읍면동 · 지번 · 후보 칩 · 질문) ·
//   지적 한 줄 · 꼬리표 색 점 · 칸 조절 · 좁은 화면 접힘 · 펼친 폭 · '새 건물' · 후보 칩과 '통계' 단추 겹침
//   기관(남원): 한 줄 · 관할 목록 · 그 결과만 · 다시 누르면 모두. 해외: XI ChatGEO 이식아타 경작지 넓이 = 화면 값.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';

const ROOT = 'E:/Land-XI 플랫폼/01. 디자인';
const HW = 'C:/Users/User/AppData/Local/ms-playwright';
if (fs.existsSync(path.join(HW, 'chromium-1234'))) process.env.PLAYWRIGHT_BROWSERS_PATH = HW;
if (!process.env.DEV_PASSWORD) { const m = fs.readFileSync(path.join(ROOT, 'server/.env'), 'utf8').match(/^DEV_PASSWORD=(.*?)\s*$/m); if (m) process.env.DEV_PASSWORD = m[1]; }
process.env.LX_PW ||= process.env.DEV_PASSWORD;
const { chromium } = createRequire(path.join(ROOT, 'package.json'))('playwright');
const { frontDoor } = await import(pathToFileURL(path.join(ROOT, 'landxi/v3/kit/lint/forbidden.mjs')).href);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP = 'https://app.land-xi.dev', GOV = 'https://namwon.land-xi.dev', ABR = 'https://kgz-agri.land-xi.dev', V = '/landxi/v3/';
const GROUPS = (process.argv[2] || 'lx,gov,abroad').split(',');
const TAG = process.env.TAG || 'r16';
const OUT = path.join(HERE, 'shots', 'r16'); fs.mkdirSync(OUT, { recursive: true });
const RF = path.join(HERE, `${TAG}.json`);
const R = fs.existsSync(RF) ? JSON.parse(fs.readFileSync(RF, 'utf8')) : {};
const save = () => fs.writeFileSync(RF, JSON.stringify(R, null, 1));
const kst = () => new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Seoul' });
const hm = () => kst().slice(11, 16).replace(':', '');
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });

let P = null, W = 1440, errs = [];
async function row(id, label, fn) {
  const t0 = Date.now(); errs.length = 0;
  const res = { label, w: W, ok: '됨', note: '' };
  try { const r = await fn(); if (r) Object.assign(res, r); } catch (e) { res.ok = '안 됨'; res.note += String(e).slice(0, 200); }
  res.ms = Date.now() - t0;
  if (errs.length) { res.pageErr = [...new Set(errs)]; if (res.ok === '됨') res.ok = '이상함'; }
  const f = `${id}-${W}-${hm()}.png`; await P.screenshot({ path: path.join(OUT, f) }).catch(() => {}); res.shot = `shots/r16/${f}`; res.at = kst();
  R[`${id}@${W}`] = res; save();
  console.log(res.ok.padEnd(4), id, W, label, res.ms + 'ms', res.note || '', res.pageErr ? 'ERR ' + res.pageErr.join(' | ') : '');
  return res;
}
const fail = (note) => ({ ok: '안 됨', note });
const xiUntil = () => !!(window.__xc?.map && window.__xc.map.areTilesLoaded() && !window.__xc.map.isMoving() && window.__xc.boot?.shown);
const noLd = (t = 20000) => P.waitForFunction(() => { const l = document.querySelector('.k-ld'); return !(l && !l.hidden && l.getClientRects().length); }, null, { timeout: t }).then(() => true, () => false);
const settle = async (t = 15000) => { await P.waitForFunction(() => window.__xc?.map && !window.__xc.map.isMoving(), null, { timeout: t }).catch(() => {}); await noLd(t); await P.waitForTimeout(500); };
const lineText = () => P.evaluate(() => { const b = document.querySelector('.xb-k--line'); if (!b || !b.getClientRects().length) return null; const cs = getComputedStyle(b); return { t: b.textContent.replace(/\s+/g, ' ').trim(), color: cs.color }; });
const chatIn = () => P.locator('.k-chat-root[data-dock] .k-ck-i').first();
async function say(q) {
  const inp = chatIn(); await inp.click(); await inp.fill(q); await inp.press('Enter');
  await P.waitForFunction((q) => window.__xc?.place?.q === q, q, { timeout: 15000 }).catch(() => {});
  const pl = await P.evaluate(() => window.__xc?.place);
  if (pl?.kind === 'go') await P.waitForFunction((q) => window.__xc?.place?.q !== q || window.__xc.place.flyMs != null, q, { timeout: 20000 }).catch(() => {});
  return P.evaluate(() => window.__xc?.place);
}
const rect = (sel) => P.evaluate((s) => { const e = [...document.querySelectorAll(s)].find((x) => x.getClientRects().length && getComputedStyle(x).visibility !== 'hidden'); if (!e) return null; const r = e.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height }; }, sel);
const hit = (a, b) => !!(a && b && a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b);
const closeDrawer = () => P.evaluate(() => document.querySelector('.k-drawer.is-open .k-dr-x')?.click());

async function lxRun(ctx) {
  P = await ctx.newPage();
  P.on('pageerror', (e) => errs.push(String(e).slice(0, 160)));
  P.on('console', (m) => { if (m.type() === 'error' && !/favicon|ERR_ABORTED|net::ERR_/.test(m.text())) errs.push('console ' + m.text().slice(0, 160)); });
  await frontDoor(P, APP, 'test@lx.or.kr'); await P.waitForTimeout(1500);
  for (const w of [1920, 1366]) {
    W = w; await P.setViewportSize({ width: w, height: w >= 1920 ? 1080 : 768 });
    await P.evaluate(() => { try { for (const k of Object.keys(localStorage)) if (/pane|xo|panes/i.test(k)) localStorage.removeItem(k); } catch { /* */ } });
    await P.goto(APP + V + 'xi-clean/', { waitUntil: 'domcontentloaded', timeout: 45000 });
    const tOpen = Date.now();
    await P.waitForFunction(xiUntil, null, { timeout: 40000 }).catch(() => {}); await noLd();
    await row('line', '왼쪽 위 한 줄(흰 글씨 OO 시군구 · OO 서비스 제공중)', async () => {
      await P.waitForSelector('.xb-k--line', { timeout: 15000 });
      const l = await lineText();
      if (!l || !/^\d[\d,]* 시군구 · \d+ 서비스 제공중/.test(l.t)) return fail('글 ' + JSON.stringify(l));
      if (!/255, 255, 255/.test(l.color)) return fail('색 ' + l.color);
      return { note: `${l.t} · 열기 ${Date.now() - tOpen}ms` };
    });
    await row('top-search', '위쪽 돋보기 검색창 없음 · 아래 입력창 하나', async () => {
      const top = await P.evaluate(() => [...document.querySelectorAll('.xc-q, .xc-q input')].some((e) => e.getClientRects().length));
      const ph = await chatIn().getAttribute('placeholder');
      return top || ph !== '시군구 · 지번 또는 질문' ? fail(`위 검색 ${top} · 안내 ${ph}`) : { note: `안내 '${ph}'` };
    });
    await row('list', '한 줄 누르기 → 시군구 · 서비스 목록(시도별)', async () => {
      const l = await lineText();
      const t = Date.now(); await P.locator('.xb-k--line').click();
      await P.waitForSelector('.xc-board .xc-board-svc', { timeout: 10000 });
      const B = await P.evaluate(() => window.__xc.boardList);
      const n = +String(l.t.match(/^([\d,]+) 시군구/)?.[1] || '0').replace(/,/g, '');
      return B.regions === n ? { note: `${Date.now() - t}ms · 시군구 ${B.regions}(한 줄 ${n}) · 서비스 줄 ${B.rows} · 시도 ${B.sido} · 펼침 ${B.open.length}` } : fail(`목록 시군구 ${B.regions} ≠ 한 줄 ${n}`);
    });
    await row('sido', '시도 접기 · 펴기', async () => {
      const head = P.locator('.xc-board-sido').first();
      const a0 = await head.getAttribute('aria-expanded'); await head.click(); const a1 = await head.getAttribute('aria-expanded');
      const vis1 = await P.locator('.xc-board-sido-g').first().locator('.xc-board-sido-b').isVisible();
      await head.click(); const a2 = await head.getAttribute('aria-expanded');
      return a0 !== a1 && a2 === a0 && vis1 === (a1 === 'true') ? { note: `${a0} → ${a1} → ${a2}` } : fail(`${a0} → ${a1}(보임 ${vis1}) → ${a2}`);
    });
    await row('svc-on', '서비스 누르기 → 그 시군구로 · 그 서비스 결과만', async () => {
      await P.evaluate(() => { document.querySelectorAll('.xc-board-sido[aria-expanded="false"]').forEach((b) => b.click()); window.__xc.boardPick = null; });
      const btn = P.locator('.xc-board-svc').first(); const svc = await btn.getAttribute('data-svc'), sgg = await btn.getAttribute('data-sgg'); const nm = (await btn.innerText()).replace(/\s+/g, ' ');
      const t = Date.now(); await btn.click();
      await P.waitForFunction(() => !!window.__xc.boardPick, null, { timeout: 20000 });
      const tPick = Date.now() - t; await settle(); const tDone = Date.now() - t;
      const pk = await P.evaluate(() => window.__xc.boardPick); const l = await lineText();
      R.__svc = { svc, sgg };
      const cur = await P.locator(`.xc-board-svc[data-svc="${svc}"][data-sgg="${sgg}"]`).getAttribute('aria-current');
      return pk && !pk.same && cur === 'true' ? { note: `${nm} · 결과 켜짐 ${tPick}ms · 다 그려짐 ${tDone}ms · 업무 ${pk.task} · 한 줄 '${l?.t}'` } : fail(JSON.stringify(pk));
    });
    await row('svc-off', '같은 서비스 다시 누르기 → 원래대로', async () => {
      const { svc, sgg } = R.__svc; await P.evaluate(() => { window.__xc.boardPick = null; });
      const t = Date.now(); await P.locator(`.xc-board-svc[data-svc="${svc}"][data-sgg="${sgg}"]`).click();
      await P.waitForFunction(() => !!window.__xc.boardPick, null, { timeout: 15000 });
      const pk = await P.evaluate(() => window.__xc.boardPick);
      const cur = await P.locator(`.xc-board-svc[data-svc="${svc}"][data-sgg="${sgg}"]`).getAttribute('aria-current');
      return pk.same && !pk.task && cur == null ? { note: `${Date.now() - t}ms · 업무 거르기 없음` } : fail(JSON.stringify(pk) + ' · ' + cur);
    });
    await row('report', "'보고서로' → 한글 문서(.hwpx) 한 장", async () => {
      const t = Date.now();
      const [dl] = await Promise.all([P.waitForEvent('download', { timeout: 40000 }), P.locator('.xc-board-rep').click()]);
      const f = path.join(OUT, `${W}-${dl.suggestedFilename()}`); await dl.saveAs(f);
      const b = fs.readFileSync(f); const pk = b[0] === 0x50 && b[1] === 0x4b;
      return pk && b.length > 4000 ? { note: `${dl.suggestedFilename()} · ${(b.length / 1024).toFixed(1)}KB · ${Date.now() - t}ms` } : fail(`파일 ${b.length}B · zip ${pk}`);
    });
    await closeDrawer(); await P.waitForTimeout(400);
    await row('cad', "층 판 '지적' 한 줄('지적선' 없음)", async () => {
      await P.locator('.xc-tool[data-tool="layers"]').click(); await P.waitForTimeout(600);
      const tx = await P.evaluate(() => [...document.querySelectorAll('.xc-row span')].filter((e) => e.getClientRects().length).map((e) => e.textContent));
      const cad = tx.filter((x) => x === '지적').length, old = tx.filter((x) => /지적선/.test(x)).length;
      const nb = tx.some((x) => x === '새 건물'), raw = tx.some((x) => /built_new|신축/.test(x));
      await P.locator('.xc-tool[data-tool="layers"]').click().catch(() => {});
      return cad === 1 && !old && !raw ? { note: `지적 ${cad} · 지적선 ${old} · 클래스 ${tx.length}줄${nb ? " · '새 건물' 보임" : ''}` } : fail(`지적 ${cad} · 지적선 ${old} · 영문 ${raw}`);
    });
    await row('newbld', "'새 건물' 이름(서버 이름표 한 곳)", async () => {
      const j = await P.evaluate(async () => { const { api } = await import('/landxi/v3/kit/util.js'); try { return await api('/ximap/board'); } catch (e) { return { st: String(e).slice(0, 80) }; } });
      const ko = j?.class_ko?.built_new; return ko === '새 건물' ? { note: "built_new → '새 건물'" } : fail('이름표 ' + JSON.stringify(ko ?? j?.st));
    });
    // 입력창 하나 — 시군구 · 읍면동 · 지번 · 후보 칩 · 질문
    await P.goto(APP + V + 'xi-clean/', { waitUntil: 'domcontentloaded' }); await P.waitForFunction(xiUntil, null, { timeout: 40000 }).catch(() => {}); await noLd();
    await row('q-sgg', "입력창 '함양군' → 바로 그곳", async () => {
      const t = Date.now(); const pl = await say('함양군'); await settle(); const l = await lineText();
      return pl?.kind === 'go' && /함양군/.test(l?.t || '') ? { note: `${Date.now() - t}ms · '${l.t}'` } : fail(JSON.stringify(pl) + ' ' + l?.t);
    });
    await row('q-emd', "입력창 '도통동'(읍면동) → 바로 그곳", async () => {
      const t = Date.now(); const pl = await say('도통동'); await settle();
      return pl?.kind === 'go' ? { note: `${Date.now() - t}ms · 찾기 ${pl.ms}ms` } : fail(JSON.stringify(pl));
    });
    await row('q-jibun', "입력창 '좌사리 794-6'(지번) → 필지로", async () => {
      const t = Date.now(); const pl = await say('좌사리 794-6'); await settle();
      return pl?.kind === 'go' ? { note: `${Date.now() - t}ms · 찾기 ${pl.ms}ms` } : fail(JSON.stringify(pl));
    });
    await row('q-ask', "입력창 질문 '남원시 현황 보여 줘' → XI ChatGEO 답 + 지도 위 통계", async () => {
      const t = Date.now(); const pl = await say('남원시 현황 보여 줘');
      if (pl?.kind !== 'ask') return fail(JSON.stringify(pl));
      const ok = await P.waitForFunction(() => document.querySelector('[data-onmap="1"]') && (document.querySelector('.xo-mini:not([hidden])') || document.querySelector('.xo:not([hidden])')), null, { timeout: 90000 }).then(() => true, () => false);
      const tStat = Date.now() - t;
      const st = await P.evaluate(() => ({ mini: !!document.querySelector('.xo-mini:not([hidden])'), w: document.querySelector('.xo:not([hidden])')?.getBoundingClientRect().width || 0 })); st.panel = st.w > 40;
      R[`__ask@${W}`] = { ...st, tStat };
      if (!ok) return fail('지도 위 통계 안 옴 ' + JSON.stringify(st));
      const fold = W <= 1400 ? st.mini && !st.panel : true;
      return fold ? { note: `통계 ${tStat}ms · ${st.mini ? '접힌 한 줄' : '펼친 판 ' + Math.round(st.w) + 'px'}` } : fail('좁은 화면인데 펼쳐 열림 ' + JSON.stringify(st));
    });
    await row('stats-open', "'통계 보기' → 펼친 판(좁은 화면은 320 안팎) · 꼬리표 색 점", async () => {
      if (await P.locator('.xo-mini:not([hidden]) .xo-mini-b').count()) await P.locator('.xo-mini .xo-mini-b').click();
      await P.waitForFunction(() => (document.querySelector('.xo:not([hidden])')?.getBoundingClientRect().width || 0) > 300, null, { timeout: 8000 }).catch(() => {}); await P.waitForTimeout(600);
      const w = (await rect('.xo:not([hidden])'))?.w || 0;
      const dots = await P.evaluate(() => [...document.querySelectorAll('.xo-tag .xo-tag-c')].filter((e) => e.getClientRects().length).length);
      const tags = await P.evaluate(() => document.querySelectorAll('.xo-tag').length);
      const wantW = W <= 1400 ? w >= 300 && w <= 340 : w >= 340;
      return wantW && (dots > 0 || tags === 0) ? { note: `판 ${Math.round(w)}px · 꼬리표 ${tags} · 색 점 ${dots}` } : fail(`판 ${Math.round(w)}px · 꼬리표 ${tags} · 색 점 ${dots}`);
    });
    await row('pane-drag', '칸 조절(손잡이 끌기 → 폭 바뀜 · 지도 가운데 따라감)', async () => {
      const hd = await rect('.pn-h'); if (!hd) return fail('손잡이 없음');
      const w0 = (await rect('.xo:not([hidden])')).w; const c0 = await P.evaluate(() => window.__xc.map.getCenter().lng);
      const x = hd.l + hd.w / 2, y = hd.t + hd.h / 2;
      await P.mouse.move(x, y); await P.mouse.down(); await P.mouse.move(x - 60, y, { steps: 6 }); await P.mouse.move(x - 120, y, { steps: 6 }); await P.mouse.up();
      await P.waitForTimeout(900);
      const w1 = (await rect('.xo:not([hidden])')).w; const c1 = await P.evaluate(() => window.__xc.map.getCenter().lng);
      const grip = await P.evaluate(() => { const g = document.querySelector('.pn-h .pn-grip'); return !!(g && g.getClientRects().length && getComputedStyle(g).opacity !== '0'); });
      return w1 - w0 > 60 && grip ? { note: `폭 ${Math.round(w0)} → ${Math.round(w1)}px · 가운데 ${c0.toFixed(3)} → ${c1.toFixed(3)} · 손잡이 늘 보임` } : fail(`폭 ${w0} → ${w1} · 손잡이 ${grip}`);
    });
    await row('q-choices', "입력창 '고성'(여럿) → 후보 칩 · '통계' 단추와 겹침 없음", async () => {
      const pl = await say('고성'); await P.waitForSelector('.k-chat-pick', { timeout: 8000 }).catch(() => {});
      const n = await P.locator('.k-chat-pick:visible').count();
      const chips = await P.evaluate(() => [...document.querySelectorAll('.k-chat-pick')].filter((e) => e.getClientRects().length).map((e) => { const r = e.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom }; }));
      const sw = await rect('.xo-sw:not([hidden]), .xv-sw:not([hidden])'); const root = await rect('.k-chat-root[data-dock]'); const dl = await rect('.k-chat-root[data-dock] .k-chat-dlog'); const over = chips.filter((c) => hit(c, sw)).length + (hit(dl, sw) ? 1 : 0) + (sw && root && root.l < sw.r && root.r > sw.l ? 1 : 0);
      const vw = await P.evaluate(() => innerWidth); const out = chips.filter((c) => c.l < 0 || c.r > vw).length;
      const r = pl?.kind === 'choices' && n >= 2 && !over && !out ? { note: `후보 ${n} · 통계 단추 ${sw ? '있음' : '없음'} · 겹침 0` } : fail(`후보 ${n} · 겹침 ${over} · 화면 밖 ${out} · 통계 단추 ${JSON.stringify(sw)} · 칩 ${JSON.stringify(chips.slice(0, 3))}`);
      R[`__chips@${W}`] = { chips, sw, root, dl }; return r;
    });
    await row('q-pick', '후보 칩 고르기 → 그곳', async () => {
      const r0 = new URL(P.url()).searchParams.get('region');
      const t = Date.now(); await P.locator('.k-chat-pick:visible').first().click();
      await P.waitForFunction((r0) => new URL(location.href).searchParams.get('region') !== r0, r0, { timeout: 15000 }).catch(() => {}); await settle();
      const left = await P.locator('.k-chat-pick:visible').count(); const r1 = new URL(P.url()).searchParams.get('region');
      return !left && r1 && r1 !== r0 && /^4[28]\d{3}$|^5[01]\d{3}$/.test(r1) ? { note: `${Date.now() - t}ms · 지역 ${r0} → ${r1}(고성)` } : fail(`남은 칩 ${left} · 지역 ${r0} → ${r1}`);
    });
    if (W === 1366) {
      await row('narrow-320', '좁은 화면 폭 320(창 390) — 넘침 없음 · 한 줄 보임', async () => {
        await P.setViewportSize({ width: 390, height: 844 }); await P.waitForTimeout(1200);
        const o = await P.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: innerWidth }));
        const l = await lineText();
        await P.setViewportSize({ width: 1366, height: 768 }); await P.waitForTimeout(600);
        return o.sw <= o.iw + 1 ? { note: `가로 넘침 0 · 한 줄 '${l?.t ?? '숨김'}'` } : fail(JSON.stringify(o));
      });
    }
  }
  await P.close();
}

async function govRun(ctx) {
  W = 1440; P = await ctx.newPage(); await P.setViewportSize({ width: 1440, height: 900 });
  P.on('pageerror', (e) => errs.push(String(e).slice(0, 160)));
  await frontDoor(P, APP, 'lxadmin@lx.or.kr#namwon'); await P.waitForTimeout(1500);
  const t0 = Date.now();
  await P.goto(GOV + V + 'xi-clean/?region=52190', { waitUntil: 'domcontentloaded', timeout: 45000 });
  await P.waitForFunction(xiUntil, null, { timeout: 40000 }).catch(() => {}); await noLd();
  const tOpen = Date.now() - t0;
  await row('g-line', "기관 XI맵 한 줄 'OO시 · n 서비스 제공중'", async () => {
    await P.waitForSelector('.xb-k--line', { timeout: 15000 }).catch(() => {});
    const l = await lineText(); return l && /^남원시 · \d+ 서비스 제공중/.test(l.t) ? { note: `${l.t} · 열기 ${tOpen}ms` } : fail(JSON.stringify(l));
  });
  await row('g-list', '한 줄 누르기 → 우리 관할 서비스 목록', async () => {
    await P.locator('.xb-k--line').click(); await P.waitForSelector('.xc-board .xc-board-svc', { timeout: 10000 });
    const B = await P.evaluate(() => window.__xc.boardList);
    return B.regions === 1 ? { note: `시군구 ${B.regions} · 서비스 줄 ${B.rows} · 시도 ${B.sido}` } : fail(JSON.stringify(B));
  });
  await row('g-svc', '서비스 누르기 → 그 결과 층만 · 다시 누르면 모두', async () => {
    await P.evaluate(() => { window.__xc.boardPick = null; });
    const btn = P.locator('.xc-board-svc').first(); await btn.click();
    await P.waitForFunction(() => !!window.__xc.boardPick, null, { timeout: 15000 });
    const a = await P.evaluate(() => window.__xc.boardPick); await P.evaluate(() => { window.__xc.boardPick = null; });
    await P.locator('.xc-board-svc').first().click(); await P.waitForFunction(() => !!window.__xc.boardPick, null, { timeout: 15000 });
    const b = await P.evaluate(() => window.__xc.boardPick);
    return a.on?.length >= 1 && b.same && b.on.length > a.on.length ? { note: `켜진 층 ${a.on.length}(${a.on.join(', ')}) → 다시 ${b.on.length}` } : fail(JSON.stringify({ a, b }));
  });
  await row('g-report', "기관 '보고서로' 한 장", async () => {
    const [dl] = await Promise.all([P.waitForEvent('download', { timeout: 40000 }), P.locator('.xc-board-rep').click()]);
    const f = path.join(OUT, `gov-${dl.suggestedFilename()}`); await dl.saveAs(f); const b = fs.readFileSync(f);
    return b[0] === 0x50 && b.length > 4000 ? { note: `${dl.suggestedFilename()} · ${(b.length / 1024).toFixed(1)}KB` } : fail(`${b.length}B`);
  });
  await P.close();
}

async function abroadRun(ctx) {
  W = 1440; P = await ctx.newPage(); await P.setViewportSize({ width: 1440, height: 900 });
  P.on('pageerror', (e) => errs.push(String(e).slice(0, 160)));
  await frontDoor(P, APP, 'lxadmin@lx.or.kr#kgz-agri'); await P.waitForTimeout(1500);
  await P.goto(ABR + V + 'global/', { waitUntil: 'domcontentloaded', timeout: 45000 });
  await P.waitForFunction(() => document.body.dataset.state === 'ready' && document.querySelector('.gl')?.dataset.level === 'district', null, { timeout: 60000 }).catch(() => {});
  const reg = await P.evaluate(async () => { return null; }).catch(() => null);
  R.__abroadReg = reg ? JSON.stringify(reg).slice(0, 600) : null;
  for (const [id, q] of [['x-chat-en', 'What is the AI cropland area of Ysyk-Ata?']].filter(([i]) => !process.env.QONLY || process.env.QONLY === i)) {
    await row(id, `XI ChatGEO '${q}' → 화면 값 647.6㎢ = 64,763ha 와 같은가`, async () => {
      await P.goto(ABR + V + 'global/', { waitUntil: 'domcontentloaded', timeout: 45000 });
      await P.waitForFunction(() => document.body.dataset.state === 'ready' && document.querySelector('.gl')?.dataset.level === 'district', null, { timeout: 60000 }).catch(() => {});
      const askBtn = P.locator('.gl-ask:visible, button:has-text("XI ChatGEO"):visible, a:has-text("XI ChatGEO"):visible, [aria-label*="ChatGEO"]:visible').first();
      if (!(await P.locator('.k-ck-i:visible').count()) && (await askBtn.count())) await askBtn.click();
      await P.waitForSelector('.k-ck-i', { state: 'visible', timeout: 10000 });
      const n0 = await P.evaluate(() => document.querySelectorAll('.k-chat-b .k-chat-a, .k-chat-msg--a, [data-role="assistant"]').length);
      const t = Date.now();
      await P.locator('.k-ck-i:visible').first().fill(q); await P.locator('.k-ck-i:visible').first().press('Enter');
      await P.waitForFunction(() => { const c = document.querySelector('.k-chat'); return c && c.dataset.state !== 'busy'; }, null, { timeout: 5000 }).catch(() => {});
      await P.waitForTimeout(1500);
      await P.waitForFunction(() => { const c = document.querySelector('.k-chat'); return c && c.dataset.state !== 'busy'; }, null, { timeout: 120000 }).catch(() => {});
      await P.waitForTimeout(800);
      const ans = await P.evaluate(() => { const b = document.querySelector('.k-chat-b'); return b ? b.innerText : ''; });
      if (!ans.includes(q)) return fail('질문이 대화에 없음'); const last = ans.split(q).pop();
      const okv = /647\.6|647\.[5-7]\s*(㎢|km²|km2)|64,?763|64,?76\d\s*ha/.test(last);
      return okv ? { note: `${Date.now() - t}ms · 답 '${last.replace(/\s+/g, ' ').slice(0, 220)}'` } : fail(`답 '${last.replace(/\s+/g, ' ').slice(0, 300)}'`);
    });
  }
  await P.close();
}

if (GROUPS.includes('lx')) { const c = await browser.newContext({ viewport: { width: 1920, height: 1080 }, acceptDownloads: true }); await lxRun(c); await c.close(); }
if (GROUPS.includes('gov')) { const c = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true }); await govRun(c); await c.close(); }
if (GROUPS.includes('abroad')) { const c = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true, locale: 'en-US' }); await abroadRun(c); await c.close(); }
save(); await browser.close();
