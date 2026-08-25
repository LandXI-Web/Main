// Extract motion strips from each recorded bench video.
// Playwright's bundled ffmpeg is a stripped build (no fps/tile filters),
// so we seek discrete frames with -ss and tile them in a browser canvas.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright-core';

const OUT = path.resolve('shots', 'bench', 'alive');
const TMP = path.resolve('shots', 'bench', 'alive', '_frames');
const FF = path.join(process.env.LOCALAPPDATA, 'ms-playwright', 'ffmpeg-1011', 'ffmpeg-win64.exe');
fs.mkdirSync(TMP, { recursive: true });

const vids = fs.readdirSync(OUT).filter((f) => f.endsWith('.webm'));
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1360, height: 700 } });
let ok = 0, fail = 0;

for (const v of vids) {
  const slug = v.replace(/\.webm$/, '');
  const dst = path.join(OUT, `${slug}-strip.jpg`);
  if (fs.existsSync(dst) && process.env.FORCE !== '1') { ok++; continue; }
  try {
    const src = path.join(OUT, v);
    // probe duration
    let dur = 30;
    try {
      const info = execFileSync(FF, ['-i', src], { stdio: ['ignore', 'pipe', 'pipe'], timeout: 20000 }).toString();
      void info;
    } catch (e) {
      const m = /Duration: (\d+):(\d+):(\d+\.\d+)/.exec(String(e.stderr || ''));
      if (m) dur = +m[1] * 3600 + +m[2] * 60 + +m[3];
    }
    const N = 8;
    const frames = [];
    for (let i = 0; i < N; i++) {
      const t = (dur * (i + 0.5)) / N;
      const fp = path.join(TMP, `${slug}-f${i}.png`);
      try {
        execFileSync(FF, ['-y', '-ss', t.toFixed(2), '-i', src, '-frames:v', '1',
          '-vf', 'scale=w=440:h=-1', '-update', '1', fp], { stdio: 'ignore', timeout: 40000 });
        if (fs.existsSync(fp)) frames.push({ t: t.toFixed(1), b64: fs.readFileSync(fp).toString('base64') });
      } catch {}
    }
    if (!frames.length) throw new Error('no frames');
    const html = `<style>body{margin:0;background:#111;font:11px ui-monospace,monospace;color:#8f8}
    .g{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;padding:6px}
    figure{margin:0;position:relative}img{width:100%;display:block}
    figcaption{position:absolute;left:4px;top:4px;background:#000c;padding:1px 5px;border-radius:3px}
    h1{font:12px ui-monospace;color:#fff;margin:6px}</style>
    <h1>${slug} — ${dur.toFixed(0)}s clip, 8 frames</h1><div class="g">${frames
      .map((f) => `<figure><img src="data:image/png;base64,${f.b64}"><figcaption>${f.t}s</figcaption></figure>`)
      .join('')}</div>`;
    await page.setContent(html);
    await page.waitForTimeout(150);
    const el = await page.locator('body');
    await el.screenshot({ path: dst, type: 'jpeg', quality: 72 });
    frames.forEach((_, i) => { try { fs.unlinkSync(path.join(TMP, `${slug}-f${i}.png`)); } catch {} });
    ok++;
    console.log('OK  ', slug);
  } catch (e) { console.log('FAIL', slug, String(e).slice(0, 70)); fail++; }
}
await browser.close();
console.log(`strips: ${ok} ok, ${fail} fail / ${vids.length}`);
