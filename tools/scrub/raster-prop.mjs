// tools/scrub/raster-prop.mjs — props/*.svg 를 Chrome 으로 알파 PNG 로 찍고 PIL 로 webp 화한다.
//   node tools/scrub/raster-prop.mjs drone   → landxi/assets/proto/film/legs/props/drone.webp
import { chromium } from '@playwright/test';
import fs from 'node:fs'; import path from 'node:path'; import { execFileSync } from 'node:child_process';
const name = process.argv[2] || 'drone';
const dir = path.resolve('landxi/assets/proto/film/legs/props');
const svg = fs.readFileSync(path.join(dir, name + '.svg'), 'utf8');
const [, w, h] = /viewBox="0 0 (\d+) (\d+)"/.exec(svg).map(Number);
const b = await chromium.launch({ channel: 'chrome' });
const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
await p.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block}</style>${svg}`);
const png = path.join(dir, name + '.png');
await p.screenshot({ path: png, omitBackground: true });
await b.close();
execFileSync('python', ['-c', `
from PIL import Image; import os
im = Image.open(r"${png}").convert("RGBA")
im.save(r"${path.join(dir, name + '.webp')}", "WEBP", quality=92, method=6)
print(im.size, os.path.getsize(r"${path.join(dir, name + '.webp')}"), "bytes")`], { stdio: 'inherit' });
fs.unlinkSync(png);
