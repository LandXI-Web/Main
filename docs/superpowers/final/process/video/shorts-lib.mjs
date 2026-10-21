/* 숏츠(세로 1080×1920 · 원칙 297 소개 영상 숏츠판 · 10-21 사용자 "숏츠 버젼으로 하나 만들어야 되서") 공용.
   화면은 휴대폰 배치(창 432×648 · 화면 배율 2.5)로 찍어 1080×1620 그대로 위에, 자막은 아래 띠(1620–1920)에만 — 화면을 자르거나 덮지 않는다.
   소리 없음(10-21 사용자 "나레이션은 필요 없고. 자막만 있으면 된다.") · 커서 없음 · 저장 요청은 lib 와 같이 가짜 성공으로 막음. */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

export const OUTS = process.env.LX_SHORTS_OUT || 'E:/Land-XI 플랫폼/02. 데이터/_video/shorts-2026-10-21';
export const VW = 432, VH = 648, DSF = 2.5;          // 찍는 창(휴대폰 배치)
export const SW = 1080, SH = 1620;                    // 화면 자리(위) = VW·VH × DSF
export const BAND = { y: 1620, h: 300 };              // 자막 띠(아래)
export const BG = '#FFFFFF';

/** 새 창(휴대폰 배치) — 쓰기 막기 · 스크롤 막대 숨김 · XI ChatGEO 시험 표시 */
export async function newMobile(browser, log) {
  const ctx = await browser.newContext({ viewport: { width: VW, height: VH }, deviceScaleFactor: DSF, locale: 'ko-KR' });
  await ctx.addInitScript("try { sessionStorage.setItem('lx.chat.test', '1') } catch (e) {}");
  await ctx.addInitScript(() => { const go = () => { const s = document.createElement('style'); s.textContent = '::-webkit-scrollbar{width:0;height:0}'; (document.head || document.documentElement).appendChild(s); }; if (document.documentElement) go(); else document.addEventListener('DOMContentLoaded', go); });
  await ctx.route('**/api/**', (r) => {
    const m = r.request().method(), u = r.request().url();
    if (m === 'GET' || m === 'HEAD' || m === 'OPTIONS' || /\/auth\/login|\/agent\//.test(u)) return r.continue();
    log?.push(`막음 ${m} ${u.replace(/\?.*/, '').replace(/^https?:\/\/[^/]+/, '')}`);
    return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
  });
  const p = await ctx.newPage();
  p.setDefaultTimeout(60000);
  return { ctx, p };
}

/** CDP 화면 녹화(세로) — jpeg 프레임 + 시각 → 30fps mp4(1080×1620) */
export class RecV {
  constructor(page, dir, w = SW, h = SH) { this.page = page; this.dir = dir; this.w = w; this.h = h; this.frames = []; this.marks = {}; }
  async start() {
    fs.rmSync(this.dir, { recursive: true, force: true }); fs.mkdirSync(this.dir, { recursive: true });
    this.cdp = await this.page.context().newCDPSession(this.page); this.n = 0; this.on = true; this.t0 = null;
    this.cdp.on('Page.screencastFrame', async (f) => {
      try { await this.cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }); } catch {}
      if (!this.on) return;
      const ts = f.metadata.timestamp; if (this.t0 === null) this.t0 = ts;
      const fn = `f${String(this.n++).padStart(6, '0')}.jpg`;
      fs.writeFileSync(path.join(this.dir, fn), Buffer.from(f.data, 'base64')); this.frames.push([fn, ts - this.t0]);
    });
    await this.cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: this.w, maxHeight: this.h, everyNthFrame: 1 });
  }
  mark(name) { const t = this.t0 === null ? 0 : Date.now() / 1000 - this.t0; this.marks[name] = +t.toFixed(2); return t; }
  async stop(out) {
    const tEnd = this.t0 === null ? 0 : Date.now() / 1000 - this.t0; this.on = false;
    try { await this.cdp.send('Page.stopScreencast'); } catch {}
    const F = this.frames; if (!F.length) throw new Error('no frames');
    let s = '';
    for (let i = 0; i < F.length; i++) { const d = (i + 1 < F.length ? F[i + 1][1] : Math.max(F[i][1] + 0.1, tEnd)) - F[i][1]; s += `file '${F[i][0]}'\nduration ${Math.max(d, 0.001).toFixed(4)}\n`; }
    s += `file '${F[F.length - 1][0]}'\n`;
    fs.writeFileSync(path.join(this.dir, 'list.txt'), s);
    fs.writeFileSync(out.replace(/\.mp4$/, '.marks.json'), JSON.stringify(this.marks, null, 1));
    execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', 'list.txt', '-vf', `scale=${this.w}:${this.h}:flags=lanczos,fps=30,format=yuv420p`, '-c:v', 'libx264', '-preset', 'slow', '-crf', '14', '-r', '30', path.resolve(out)], { cwd: this.dir });
    if (!process.env.KEEP_FRAMES) fs.rmSync(this.dir, { recursive: true, force: true });
    return { frames: F.length, dur: +tEnd.toFixed(2), fps: +(F.length / Math.max(tEnd, 0.1)).toFixed(1) };
  }
}

/* ── 2판(10-21 사용자 "왜 영상이 모바일 버젼이지?" → PC 화면) ── */
export const DW = 1920, DH = 1080, DDSF = 1.5;          // PC 화면(긴 영상과 같은 1920×1080) · 배율 1.5 → 2880×1620 그림(확대해도 글이 또렷)
/** 로딩 표시 감시(10-21 사용자 "로딩중이 계속 뜨는데 이런게 뜨면 안된다") — 0.1초마다 화면에 보이는 로딩 글 · 도는 표시 · 덜 그린 지도 타일을 시각과 함께 적는다 */
export const LOADWATCH = `(() => { if (window.__ldOn) return; window.__ldOn = 1; window.__ld = [];
  const vis = (e) => { if (!e.getClientRects().length) return false; const s = getComputedStyle(e); return s.visibility !== 'hidden' && s.display !== 'none' && +s.opacity > 0.05; };
  let last = Date.now();
  setInterval(() => { try {
    const now = Date.now(); if (now - last > 300) window.__ld.push([last, 'gap:' + (now - last) + 'ms', now]); last = now;   // 화면 일이 막혀 감시가 못 본 사이 = 알 수 없음(쓰지 않음)
    const why = []; const tx = document.body?.innerText || '';
    if (/불러오는 중|찾는 중|로딩 중|기다려 주세요/.test(tx)) why.push('text:' + (tx.match(/.{0,12}(불러오는 중|찾는 중|로딩 중|기다려 주세요).{0,6}/) || [''])[0]);
    const busy = [...document.querySelectorAll('[aria-busy="true"], .is-busy, .is-loading, [class*="spinner"], [class*="skeleton"], [class*="skel-"]')].filter(vis);
    if (busy.length) why.push('busy:' + busy.slice(0, 3).map((e) => (e.className && e.className.baseVal === undefined ? e.className : e.tagName)).join('|').slice(0, 80));
    for (const k of ['__xc', '__lm', '__main']) { const m = window[k]?.map; if (m && m.areTilesLoaded && !m.areTilesLoaded()) why.push('tiles:' + k); }
    if (why.length) window.__ld.push([Date.now(), why.join(' · ')]);
  } catch (e) {} }, 100); })();`;
/** PC 창 — 1920×1080 · 배율 1.5 · 쓰기 막기 · 로딩 감시 */
export async function newDesk(browser, log) {
  const ctx = await browser.newContext({ viewport: { width: DW, height: DH }, deviceScaleFactor: DDSF, locale: 'ko-KR' });
  await ctx.addInitScript("try { sessionStorage.setItem('lx.chat.test', '1') } catch (e) {}");
  await ctx.addInitScript(() => { const go = () => { const s = document.createElement('style'); s.textContent = '::-webkit-scrollbar{width:0;height:0}'; (document.head || document.documentElement).appendChild(s); }; if (document.documentElement) go(); else document.addEventListener('DOMContentLoaded', go); });
  await ctx.addInitScript(LOADWATCH);
  await ctx.route('**/api/**', (r) => {
    const m = r.request().method(), u = r.request().url();
    if (m === 'GET' || m === 'HEAD' || m === 'OPTIONS' || /\/auth\/login|\/agent\//.test(u)) return r.continue();
    log?.push(`막음 ${m} ${u.replace(/\?.*/, '').replace(/^https?:\/\/[^/]+/, '')}`);
    return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
  });
  const p = await ctx.newPage();
  p.setDefaultTimeout(60000);
  return { ctx, p };
}
