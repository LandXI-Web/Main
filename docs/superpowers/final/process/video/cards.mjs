/* 소개 영상 자막 판(투명 png) · 끝 장면(모토 + LX 한국국토정보공사) — 사이트 글꼴(Pretendard · Paperlogy)로 브라우저가 그린다.
   node cards.mjs   → <OUT>/cards/cap-<n>.png, <OUT>/raw/s8-end.mp4 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium, Rec, OUT, ROOT, sleep } from './lib.mjs';
import { CAPTIONS } from './story.mjs';

const CARDS = path.join(OUT, 'cards'); fs.mkdirSync(CARDS, { recursive: true });
const F = (n) => pathToFileURL(path.join(ROOT, 'landxi/assets/fonts', n)).href;
const FONTS = `@font-face{font-family:P;src:url('${F('Pretendard-Regular.woff2')}');font-weight:400}
@font-face{font-family:P;src:url('${F('Pretendard-Medium.woff2')}');font-weight:600}
@font-face{font-family:PL;src:url('${F('Paperlogy-7Bold.woff2')}');font-weight:700}
@font-face{font-family:PL;src:url('${F('Paperlogy-8ExtraBold.woff2')}');font-weight:800}`;
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

const b = await chromium.launch({ channel: 'chrome', headless: true });
const ctx = await b.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
const p = await ctx.newPage();

/* 자막 — 흰 카드(라운드 16 · 지도 위 그림자) · 큰 줄 Paperlogy 700 46 · 작은 줄 Pretendard 30 · 의미 단위 줄(각 줄을 그대로 한 줄로) */
const POS = { bl: 'left:64px;bottom:72px', br: 'right:64px;bottom:72px', tl: 'left:64px;top:120px', tr: 'right:64px;top:120px', bc: 'left:50%;bottom:72px;transform:translateX(-50%)', ml: 'left:64px;top:50%;transform:translateY(-50%)' };
for (const [i, c] of CAPTIONS.entries()) {
  const html = `<!doctype html><meta charset=utf-8><style>${FONTS}
  html,body{margin:0;background:transparent}
  .c{position:absolute;${c.css || POS[c.pos || 'bl']};background:rgba(255,255,255,.97);border-radius:16px;padding:26px 34px 28px;box-shadow:0 1px 0 rgba(28,31,37,.04),0 10px 30px rgba(28,31,37,.18);max-width:1100px;white-space:nowrap}
  .k{font:600 22px/1.2 P;color:#3182F6;margin:0 0 10px;letter-spacing:-.2px}
  .t{font:700 46px/1.25 PL;color:#191F28;margin:0;letter-spacing:-.8px}
  .s{font:400 29px/1.4 P;color:#4E5968;margin:10px 0 0;letter-spacing:-.3px}
  </style><div class=c>${c.kicker ? `<p class=k>${esc(c.kicker)}</p>` : ''}${c.lines.map((l, j) => `<p class=${j === 0 ? 't' : 's'}>${esc(l)}</p>`).join('')}</div>`;
  await p.setContent(html); await p.evaluate(() => document.fonts.ready); await sleep(150);
  const box = await p.locator('.c').boundingBox();
  if (box.x < 0 || box.y < 0 || box.x + box.width > 1920 || box.y + box.height > 1080) throw new Error('자막이 화면 밖 ' + i);
  await p.screenshot({ path: path.join(CARDS, `cap-${String(i).padStart(2, '0')}.png`), omitBackground: true });
}
console.log('자막', CAPTIONS.length);

/* 끝 장면 — 밝은 바탕 · 모토(Hyper 한 번) · 한 줄 · LX 한국국토정보공사 로고 */
const lock = pathToFileURL(path.join(ROOT, 'landxi/assets/brand/vector/lx-lockup.svg')).href;
const END = `<!doctype html><meta charset=utf-8><style>${FONTS}
html,body{margin:0;height:100%;background:#F2F4F6;overflow:hidden}
.w{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center}
.a{opacity:0;transform:translateY(40px);animation:up .75s cubic-bezier(.16,1,.3,1) forwards}
.m{font:800 92px/1.1 PL;color:#191F28;letter-spacing:-2px;margin:0}
.s{font:400 36px/1.4 P;color:#4E5968;margin:28px 0 0;animation-delay:.12s}
.n{font:700 30px/1 PL;color:#191F28;margin:76px 0 0;letter-spacing:1px;animation-delay:.6s}
img{height:58px;margin-top:30px;animation-delay:.72s}
@keyframes up{to{opacity:1;transform:none}}
</style><div class=w><p class="a m">Hyper Performance · Solution · GeoAI</p><p class="a s">통합 플랫폼 서비스</p><p class="a n">LAND-XI PLATFORM</p><img class=a src="${lock}" alt=""></div>`;
const f = path.join(CARDS, 'end.html'); fs.writeFileSync(f, END);
await p.goto('about:blank'); await p.setContent('<body style="margin:0;background:#F2F4F6"></body>');
const r = new Rec(p, path.join(process.env.TEMP || OUT, 'lx-video-frames', 'end'));
await r.start(); await sleep(300);
await p.goto(pathToFileURL(f).href); await p.evaluate(() => document.fonts.ready);
await sleep(5200);
console.log('끝', await r.stop(path.join(OUT, 'raw', 's8-end.mp4')));
await b.close();
