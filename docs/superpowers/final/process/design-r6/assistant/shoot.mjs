// 설계 6차(assistant) 시안 촬영 — mock/ 의 HTML 을 찍어 shots/*.png 로(shots/ 는 gitignore).
// 사용: node docs/superpowers/final/process/design-r6/assistant/shoot.mjs   (GPU · 서버 · 로그인 없음 — 파일만 연다)
// '지금 화면' 캡처(now-*.png)는 로그인 폼(kit/lint/forbidden.mjs frontDoor · lx-staff)으로 따로 찍는다 — README 참고.
import { chromium } from 'playwright';
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SHOTS = path.join(HERE, 'shots');
fs.mkdirSync(SHOTS, { recursive: true });
const PC = { width: 1440, height: 900 }, MO = { width: 390, height: 844 };
const LIST = [
  ['mock/mascots.html', 'mascots.png', { width: 1440, height: 760 }],
  ['mock/chat.html', 'new-1-closed.png', PC],
  ['mock/chat.html?open', 'new-2-open.png', PC],
  ['mock/chat.html?open&end', 'new-2-open-end.png', PC],
  ['mock/chat.html?think', 'new-3-think.png', PC],
  ['mock/chat.html?open&m=b', 'new-2-open-b.png', PC],
  ['mock/chat.html?open&m=c', 'new-2-open-c.png', PC],
  ['mock/chat.html', 'new-1-closed-m.png', MO],
  ['mock/chat.html?open', 'new-2-open-m.png', MO],
  ['mock/chat.html?think', 'new-3-think-m.png', MO],
];
const b = await chromium.launch();
for (const [src, out, vp] of LIST) {
  const [file, q] = src.split('?');
  const url = pathToFileURL(path.join(HERE, file)).href + (q ? '?' + q : '');
  const pg = await b.newPage({ viewport: vp, deviceScaleFactor: 1 });
  await pg.goto(url); await pg.waitForTimeout(800);
  await pg.screenshot({ path: path.join(SHOTS, out) }); await pg.close();
  console.log('찍음', out);
}
await b.close();
