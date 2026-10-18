/* 소개 영상 2판 판 그림 — 사이트 글꼴(Pretendard · Paperlogy)로 브라우저가 그린다.
   node cards-v2.mjs   → <OUT2>/cards/frame.png(바탕 + 화면 자리 둥근 구멍 + 그림자) · cap-XX.png(아래 띠 자막 · 투명) · <OUT2>/raw/e1-end.mp4(마무리 LX CI)
   자막: 띠 안 두 줄(큰 줄 Paperlogy 38 · 작은 줄 Pretendard 27) · 화면 왼쪽 선과 같은 선 · 오른쪽엔 장 이름 한 줄(작게). 넘치면 멈춘다. */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium, Rec, ROOT, sleep } from './lib.mjs';
import { SHOTS, SCREEN, BAND, BG, CHAPTERS } from './story-v2.mjs';

const OUT2 = process.env.LX_VIDEO_OUT2 || 'E:/Land-XI 플랫폼/02. 데이터/_video/intro-2026-10-18-v2';
const CARDS = path.join(OUT2, 'cards'); fs.mkdirSync(CARDS, { recursive: true }); fs.mkdirSync(path.join(OUT2, 'raw'), { recursive: true });
const F = (n) => pathToFileURL(path.join(ROOT, 'landxi/assets/fonts', n)).href;
const FONTS = `@font-face{font-family:P;src:url('${F('Pretendard-Regular.woff2')}');font-weight:400}
@font-face{font-family:P;src:url('${F('Pretendard-Medium.woff2')}');font-weight:600}
@font-face{font-family:PL;src:url('${F('Paperlogy-7Bold.woff2')}');font-weight:700}
@font-face{font-family:PL;src:url('${F('Paperlogy-8ExtraBold.woff2')}');font-weight:800}`;
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

const b = await chromium.launch({ channel: 'chrome', headless: true });
const ctx = await b.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
const p = await ctx.newPage();

/* 1) 틀 — 바탕색 전체 + 화면 자리 그림자 + 둥근 구멍(투명) + 가는 테두리 */
await p.setContent(`<canvas id=c width=1920 height=1080></canvas><style>html,body{margin:0;background:transparent}</style>`);
await p.evaluate(({ S, BG }) => {
  const c = document.getElementById('c').getContext('2d'); const r = 14;
  const rr = () => { c.beginPath(); c.roundRect(S.x, S.y, S.w, S.h, r); };
  c.fillStyle = BG; c.fillRect(0, 0, 1920, 1080);
  c.save(); c.shadowColor = 'rgba(28,31,37,.16)'; c.shadowBlur = 36; c.shadowOffsetY = 8; c.fillStyle = '#fff'; rr(); c.fill(); c.restore();
  c.globalCompositeOperation = 'destination-out'; rr(); c.fill();
  c.globalCompositeOperation = 'source-over'; c.strokeStyle = 'rgba(28,31,37,.08)'; c.lineWidth = 1; c.beginPath(); c.roundRect(S.x - 0.5, S.y - 0.5, S.w + 1, S.h + 1, r + 0.5); c.stroke();
}, { S: SCREEN, BG });
await p.locator('#c').screenshot({ path: path.join(CARDS, 'frame.png'), omitBackground: true });

/* 2) 자막 — 아래 띠(BAND) 안 · 왼쪽 선 = 화면 왼쪽 선 */
const report = [];
for (const [i, s] of SHOTS.entries()) {
  if (!s.cap) continue;
  const [t, sub] = s.cap;
  const html = `<!doctype html><meta charset=utf-8><style>${FONTS}
  html,body{margin:0;background:transparent;width:1920px;height:1080px;overflow:hidden}
  .band{position:absolute;left:${SCREEN.x}px;right:${1920 - SCREEN.x - SCREEN.w}px;top:${BAND.y}px;height:${BAND.h}px;display:flex;align-items:center;justify-content:space-between;gap:48px}
  .tx{min-width:0}
  .t{font:700 38px/1.22 PL;color:#191F28;margin:0;letter-spacing:-.6px;white-space:nowrap}
  .s{font:400 27px/1.38 P;color:#4E5968;margin:4px 0 0;letter-spacing:-.3px;white-space:nowrap}
  .ch{font:600 21px/1.2 P;color:#8B95A1;white-space:nowrap;letter-spacing:-.2px}
  .ch b{color:#3182F6;font-weight:600;margin-right:10px}
  </style><div class=band><div class=tx><p class=t>${esc(t)}</p>${sub ? `<p class=s>${esc(sub)}</p>` : ''}</div><div class=ch><b>${s.ch}</b>${esc(CHAPTERS[s.ch] || '')}</div></div>`;
  const hf = path.join(CARDS, '_cap.html'); fs.writeFileSync(hf, html);   // file:// 로 열어야 글꼴(file://)이 실림(setContent 는 about:blank 라 글꼴이 막힘)
  await p.goto(pathToFileURL(hf).href); await p.evaluate(() => document.fonts.ready); await sleep(120);
  const fam = await p.evaluate(() => [document.fonts.check('700 38px PL'), document.fonts.check('400 27px P'), [...document.fonts].filter((f) => f.status === 'loaded').length]);
  if (!fam[0] || !fam[1] || fam[2] < 2) throw new Error('글꼴 안 실림 ' + JSON.stringify(fam));
  const m = await p.evaluate(() => { const r = (q) => document.querySelector(q)?.getBoundingClientRect(); const t = r('.t'), s = r('.s'), ch = r('.ch'), band = r('.band'); return { t, s, ch, band, right: Math.max(t.right, s ? s.right : 0) }; });
  if (m.right > m.ch.left - 32) throw new Error(`자막이 장 이름과 겹침 ${s.id}`);
  const bottom = (m.s || m.t).bottom;
  if (m.t.top < BAND.y || bottom > BAND.y + BAND.h || bottom > 1080) throw new Error(`자막이 띠 밖 ${s.id}`);
  report.push({ id: s.id, top: Math.round(m.t.top), bottom: Math.round(bottom), right: Math.round(m.right), chLeft: Math.round(m.ch.left) });
  await p.screenshot({ path: path.join(CARDS, `cap-${String(i + 1).padStart(2, '0')}.png`), omitBackground: true });
}
fs.writeFileSync(path.join(CARDS, 'cap-fit.json'), JSON.stringify(report, null, 1));
console.log('자막', report.length);

/* 3) 마무리 — 밝은 바탕 · 모토 · LAND-XI PLATFORM · LX 한국국토정보공사 로고(lx-lockup.svg) */
const lock = pathToFileURL(path.join(ROOT, 'landxi/assets/brand/vector/lx-lockup.svg')).href;
const END = `<!doctype html><meta charset=utf-8><style>${FONTS}
html,body{margin:0;height:100%;background:${BG};overflow:hidden}
.w{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center}
.a{opacity:0;transform:translateY(40px);animation:up .75s cubic-bezier(.16,1,.3,1) forwards}
.m{font:800 76px/1.16 PL;color:#191F28;letter-spacing:-1.6px;margin:0;text-align:center}
.s{font:400 34px/1.4 P;color:#4E5968;margin:26px 0 0;animation-delay:.12s}
.n{font:700 28px/1 PL;color:#191F28;margin:70px 0 0;letter-spacing:1px;animation-delay:.6s}
img{height:64px;margin-top:30px;animation-delay:.72s}
@keyframes up{to{opacity:1;transform:none}}
</style><div class=w><p class="a m">Hyper Performance<br>Hyper Solution<br>Hyper GeoAI</p><p class="a s">통합 플랫폼 서비스</p><p class="a n">LAND-XI PLATFORM</p><img class=a src="${lock}" alt=""></div>`;
const f = path.join(CARDS, 'end.html'); fs.writeFileSync(f, END);
await p.goto('about:blank'); await p.setContent(`<body style="margin:0;background:${BG}"></body>`);
const r = new Rec(p, path.join(process.env.TEMP || OUT2, 'lx-video-frames-v2', 'end'));
await r.start(); await sleep(300);
await p.goto(pathToFileURL(f).href); await p.evaluate(() => document.fonts.ready);
await sleep(9000);
console.log('끝', await r.stop(path.join(OUT2, 'raw', 'e1-end.mp4')));
await b.close();
