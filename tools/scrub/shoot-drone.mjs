// tools/scrub/shoot-drone.mjs — 레그 04 위 드론 오버레이 스파이크를 7지점으로 찍고 몽타주를 만든다.
//   node tools/scrub/shoot-drone.mjs            # shots/scrub/drone-spike-{1..7}-*.png + drone-spike-montage.jpg
// 몽타주: 위 4+3 = 7 프레임(폭 700) · 아래 7장의 드론 주변 1:1 크롭(420×260) — 스티커인지 미니어처의 일부인지는 1:1 에서 본다.
import { chromium } from '@playwright/test';
import fs from 'node:fs'; import path from 'node:path'; import { execFileSync } from 'node:child_process';

const argv = process.argv.slice(2);
const val = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 ? argv[i + 1] : d; };
const PORT = process.env.PORT || 4173;
const URL = val('url', `http://localhost:${PORT}/landxi/proto/scrub/`);
const OUT = path.resolve(process.cwd(), val('out', 'shots/scrub'));
const PROP = val('prop', 'drone-04');
const N = +val('n', 7), W = 1440, H = 900;
const NAME = val('name', 'drone-spike');
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ channel: 'chrome',
  args: ['--force-color-profile=srgb', '--disable-lcd-text', '--hide-scrollbars', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', e => errors.push('PAGEERROR ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE ' + m.text()); });
await page.goto(URL, { waitUntil: 'load' });
await page.waitForFunction('window.__scrub && window.__scrub.ready === true', null, { timeout: 30000 });
await page.waitForTimeout(600);

const M = await page.evaluate(() => window.__scrub.manifest);
let run = 0; const cum = M.legs.map(l => { const a = run; run += l.weightVh; return [a, run]; }); const total = run;
const legId = await page.evaluate(id => window.__scrub.prop(id).leg, PROP);
const k = M.legs.findIndex(l => l.id === legId);
const w = M.legs[k].weightVh;
// 첫 훑기 — 레그 클립을 받아 두게 한다(지연 로딩 ±1.6vh).
for (const q of [0, cum[k][0] / total, (cum[k][0] + w / 2) / total]) { await page.evaluate(p => window.__scrub.seek(p), q); await page.waitForTimeout(900); }

async function settle() {
  await page.waitForFunction(() => {
    const I = window.ScrollCraft && window.ScrollCraft.instances[0];
    return !I || I.clips.every(c => !c.ready || Math.abs(c.cur - c.target) < 0.0015);
  }, null, { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(320);
}

const rows = [];
for (let i = 0; i < N; i++) {
  // 창 안 0.03 → 0.97 (양끝 페이드 포함)
  const f = 0.03 + (0.94 * i) / (N - 1);
  const p = +((cum[k][0] + w * f) / total).toFixed(5);
  await page.evaluate(q => window.__scrub.seek(q), p);
  await settle();
  const st = await page.evaluate(id => ({ ...window.__scrub.prop(id), film: window.__scrub.filmTime() }), PROP);
  const file = path.join(OUT, `${NAME}-${i + 1}.png`);
  await page.screenshot({ path: file });
  rows.push({ i: i + 1, p, ...st, file: path.basename(file) });
  console.log(`${i + 1} p=${p} film=${st.film.toFixed(2)}s on=${st.on} x=${st.px} y=${st.py} w=${st.w} op=${st.opacity}`);
}
fs.writeFileSync(path.join(OUT, NAME + '-strip.json'), JSON.stringify({ url: URL, errors, rows }, null, 2));
await browser.close();

// 몽타주 — PIL. 위 2행(4+3) 축소 프레임, 아래 1행 1:1 크롭.
const fwd = s => s.split(path.sep).join('/');
const py = `
from PIL import Image, ImageDraw
import json, os
d = json.load(open(${JSON.stringify(fwd(path.join(OUT, NAME + '-strip.json')))}, encoding='utf-8'))
rows = d['rows']; out = ${JSON.stringify(fwd(OUT))}
TW = 700; TH = round(TW * 900 / 1440); CW, CH = 420, 260; G = 12
cols = 4 if len(rows) > 5 else len(rows)
R = 2 if len(rows) > cols else 1
sheet = Image.new('RGB', (cols * TW + (cols + 1) * G, R * TH + CH + 4 * G + 40), (18, 18, 18))
dr = ImageDraw.Draw(sheet)
for r in rows:
    im = Image.open(os.path.join(out, r['file'])).convert('RGB')
    i = r['i'] - 1; cx, cy = i % cols, i // cols
    x = G + cx * (TW + G); y = G + cy * (TH + G)
    sheet.paste(im.resize((TW, TH), Image.LANCZOS), (x, y))
    dr.text((x + 8, y + 6), f"{r['i']}  film {r['film']:.2f}s  op {r.get('opacity', 0)}  w {r.get('w', 0)}px", fill=(255, 255, 255))
    if r.get('on'):
        px, py_ = int(r['px']), int(r['py'])
        crop = im.crop((px - CW // 2, py_ - CH // 2 + 20, px + CW // 2, py_ + CH // 2 + 20))
        w7 = (cols * TW + (cols + 1) * G - (len(rows) + 1) * G) // len(rows)
        cxp = G + i * (w7 + G); cyp = (2 if len(rows) > cols else 1) * (TH + G) + G + 20
        sheet.paste(crop.resize((w7, round(CH * w7 / CW)), Image.LANCZOS), (cxp, cyp))
dr.text((G, (2 if len(rows) > cols else 1) * (TH + G) + G), "1:1 crop around the sprite (does it sit in the miniature, or on top of it?)", fill=(200, 200, 200))
sheet.save(os.path.join(out, ${JSON.stringify(NAME)} + '-montage.jpg'), quality=88)
print('montage', sheet.size)
`;
execFileSync('python', ['-c', py], { stdio: 'inherit' });
console.log(errors.length ? `오류 ${errors.length}건:\n` + errors.join('\n') : '콘솔/페이지 오류 0');
