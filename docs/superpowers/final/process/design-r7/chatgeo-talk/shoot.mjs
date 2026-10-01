// 설계 7차(chatgeo-talk) 시안 촬영 — mock/talk.html 네 장면을 shots/*.png 로(shots/ 는 gitignore). GPU · 서버 · 로그인 없음(파일만 연다).
// 사용: node docs/superpowers/final/process/design-r7/chatgeo-talk/shoot.mjs
import { chromium } from 'playwright';
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SHOTS = path.join(HERE, 'shots');
fs.mkdirSync(SHOTS, { recursive: true });
const PC = { width: 1440, height: 900 }, MO = { width: 390, height: 844 };
const LIST = [
  ['mock/talk.html?s=a', 'new-a-cannot.png', PC],
  ['mock/talk.html?s=b', 'new-b-nomap.png', PC],
  ['mock/talk.html?s=c', 'new-c-ambiguous.png', PC],
  ['mock/talk.html?s=d', 'new-d-confirm.png', PC],
  ['mock/talk.html?s=a', 'new-a-cannot-m.png', MO],
  ['mock/talk.html?s=b', 'new-b-nomap-m.png', MO],
];
const b = await chromium.launch();
for (const [src, out, vp] of LIST) {
  const [file, q] = src.split('?');
  const url = pathToFileURL(path.join(HERE, file)).href + (q ? '?' + q : '');
  const pg = await b.newPage({ viewport: vp, deviceScaleFactor: 1 });
  await pg.goto(url); await pg.waitForTimeout(900);
  await pg.screenshot({ path: path.join(SHOTS, out) }); await pg.close();
  console.log('찍음', out);
}
await b.close();
