/* 숏츠 판 그림 — 자막(아래 띠 · 투명 1080×1920) · 마지막 컷(흰 바탕 · LAND-XI PLATFORM 글자 CI + LX 한국국토정보공사 로고 — 4판 end-A 를 세로로 다시 배치)
   node shorts-cards.mjs → <OUTS>/cards/cap-XX.png · cap-fit.json · end.png · <OUTS>/raw/e1-end.mp4
   자막: 두 줄(큰 줄 Paperlogy 60 · 작은 줄 Pretendard 40) · 왼쪽 선 64px · 띠(1620–1920) 안 가운데 · 한 줄이라도 넘치면 멈춘다(줄바꿈 금지 — 의미 단위로 미리 끊음). */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium, ROOT, sleep } from './lib.mjs';
import { OUTS, BAND, RecV } from './shorts-lib.mjs';
import { SHOTS } from './shorts-story.mjs';

const CARDS = path.join(OUTS, 'cards'); fs.mkdirSync(CARDS, { recursive: true }); fs.mkdirSync(path.join(OUTS, 'raw'), { recursive: true });
const F = (n) => pathToFileURL(path.join(ROOT, 'landxi/assets/fonts', n)).href;
const FONTS = `@font-face{font-family:P;src:url('${F('Pretendard-Regular.woff2')}');font-weight:400}
@font-face{font-family:P;src:url('${F('Pretendard-Medium.woff2')}');font-weight:600}
@font-face{font-family:PL;src:url('${F('Paperlogy-7Bold.woff2')}');font-weight:700}`;
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const L = 64;

const b = await chromium.launch({ channel: 'chrome', headless: true });
const ctx = await b.newContext({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
const p = await ctx.newPage();

const report = [];
for (const [i, s] of SHOTS.entries()) {
  if (!s.cap) continue;
  const [t, sub] = s.cap;
  const html = `<!doctype html><meta charset=utf-8><style>${FONTS}
  html,body{margin:0;background:transparent;width:1080px;height:1920px;overflow:hidden}
  .band{position:absolute;left:${L}px;right:${L}px;top:${BAND.y}px;height:${BAND.h}px;display:flex;flex-direction:column;justify-content:center}
  .t{font:700 60px/1.2 PL;color:#191F28;margin:0;letter-spacing:-1px;white-space:nowrap;align-self:flex-start}
  .s{font:400 40px/1.35 P;color:#4E5968;margin:14px 0 0;letter-spacing:-.5px;white-space:nowrap;align-self:flex-start}
  </style><div class=band><p class=t>${esc(t)}</p>${sub ? `<p class=s>${esc(sub)}</p>` : ''}</div>`;
  const hf = path.join(CARDS, '_cap.html'); fs.writeFileSync(hf, html);   // file:// 로 열어야 글꼴이 실림
  await p.goto(pathToFileURL(hf).href); await p.evaluate(() => document.fonts.ready); await sleep(120);
  const fam = await p.evaluate(() => [document.fonts.check('700 60px PL'), document.fonts.check('400 40px P')]);
  if (!fam[0] || !fam[1]) throw new Error('글꼴 안 실림 ' + JSON.stringify(fam));
  const m = await p.evaluate(() => { const r = (q) => document.querySelector(q)?.getBoundingClientRect()?.toJSON(); return { t: r('.t'), s: r('.s') }; });
  const right = Math.max(m.t.right, m.s ? m.s.right : 0), bottom = (m.s || m.t).bottom;
  if (right > 1080 - L) throw new Error(`자막이 넘침 ${s.id} ${Math.round(right)}`);
  if (m.t.top < BAND.y || bottom > BAND.y + BAND.h) throw new Error(`자막이 띠 밖 ${s.id}`);
  report.push({ id: s.id, top: Math.round(m.t.top), bottom: Math.round(bottom), right: Math.round(right) });
  await p.screenshot({ path: path.join(CARDS, `cap-${String(i + 1).padStart(2, '0')}.png`), omitBackground: true });
}
fs.writeFileSync(path.join(CARDS, 'cap-fit.json'), JSON.stringify(report, null, 1));
console.log('자막', JSON.stringify(report));

/* 마지막 컷 — 흰 바탕(10-18 "마지막 컷은 흰 바탕으로 해라.") · 4판 A안(LAND-XI PLATFORM 글자 CI + LX 로고)을 세로 화면 가운데에 */
const lock = pathToFileURL(path.join(ROOT, 'landxi/assets/brand/vector/lx-lockup.svg')).href;
const END = `<!doctype html><meta charset=utf-8><style>${FONTS}
html,body{margin:0;height:100%;background:#FFFFFF;overflow:hidden}
.w{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center}
.a{opacity:0;transform:translateY(28px);animation:up .8s cubic-bezier(.16,1,.3,1) forwards}
.n{font:700 86px/1 PL;color:#191F28;letter-spacing:-1px;margin:0;white-space:nowrap}
.l{width:72px;height:2px;background:#E5E8EB;margin:52px 0 48px;animation-delay:.25s}
img{height:64px;animation-delay:.4s}
@keyframes up{to{opacity:1;transform:none}}
.still .a{animation:none;opacity:1;transform:none}
</style><body><div class=w><p class="a n">LAND-XI PLATFORM</p><div class="a l"></div><img class=a src="${lock}" alt="LX 한국국토정보공사"></div>`;
const fs1 = path.join(CARDS, 'end-still.html'); fs.writeFileSync(fs1, END.replace('<body>', '<body class=still>'));
await p.goto(pathToFileURL(fs1).href); await p.evaluate(() => document.fonts.ready); await sleep(400);
const fit = await p.evaluate(() => { const n = document.querySelector('.n').getBoundingClientRect(); return { l: n.left, r: n.right }; });
if (fit.l < 60 || fit.r > 1020) throw new Error('끝 글자가 넘침 ' + JSON.stringify(fit));
await p.screenshot({ path: path.join(CARDS, 'end.png') });
const f = path.join(CARDS, 'end.html'); fs.writeFileSync(f, END);
await p.goto('about:blank'); await p.setContent(`<body style="margin:0;background:#FFFFFF"></body>`);
const r = new RecV(p, path.join(process.env.TEMP || OUTS, 'lx-shorts-frames', 'end'), 1080, 1920);
await r.start(); await sleep(300);
await p.goto(pathToFileURL(f).href); await p.evaluate(() => document.fonts.ready);
await sleep(4500);
console.log('끝', JSON.stringify(fit), JSON.stringify(await r.stop(path.join(OUTS, 'raw', 'e1-end.mp4'))));
await b.close();
