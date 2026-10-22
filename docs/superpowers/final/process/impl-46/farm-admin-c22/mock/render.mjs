/* 시안 HTML → PNG(로컬 파일 · 서버 0) — node render.mjs → ../shots/mock-*.png */
import path from 'node:path';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
const ROOT = 'E:/Land-XI 플랫폼/01. 디자인';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, '..', 'shots'); fs.mkdirSync(OUT, { recursive: true });
const HW = 'C:/Users/User/AppData/Local/ms-playwright';
if (fs.existsSync(path.join(HW, 'chromium-1234'))) process.env.PLAYWRIGHT_BROWSERS_PATH = HW;
const { chromium } = createRequire(path.join(ROOT, 'package.json'))('playwright');
const b = await chromium.launch({ channel: 'chrome', headless: true });
const jobs = [
  ['a-group-home.html', 'mock-a-group-home-1440', { width: 1440, height: 900 }],
  ['a-group-home.html', 'mock-a-group-home-390', { width: 390, height: 844 }, true],
  ['b-flat-list.html', 'mock-b-flat-list-1440', { width: 1440, height: 900 }],
  ['c-placement.html', 'mock-c-placement', { width: 1560, height: 1240 }, true],
];
for (const [f, name, vp, full] of jobs) {
  const p = await b.newPage({ viewport: vp, deviceScaleFactor: 1 });
  await p.goto(pathToFileURL(path.join(HERE, f)).href);
  await p.waitForTimeout(400);
  await p.screenshot({ path: path.join(OUT, name + '.png'), fullPage: !!full });
  console.log(name);
  await p.close();
}
await b.close();
