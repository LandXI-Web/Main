/* 지금 화면 촬영 — 로그인 폼(키트 lint 의 frontDoor)으로 LX 직원 계정에 들어가 첫 화면 · 6단 레일 · XI맵 분석 도구를 찍는다.
   사용: node docs/superpowers/final/process/design-r6/lx-home/now.mjs   (이 PC 서버 http://localhost:4173 · 세션 주입 없음 · GPU 실행 없음) */
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import { openPages } from '../../../../../../landxi/v3/kit/lint/forbidden.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SHOTS = path.join(HERE, 'shots');
fs.mkdirSync(SHOTS, { recursive: true });
const BASE = process.env.LX_BASE || 'http://localhost:4173';
const LOGIN = process.env.LX_LOGIN || 'lx-staff';

for (const mobile of [false, true]) {
  const { browser, page } = await openPages([], { login: LOGIN, mobile, base: BASE, site: 'app' });
  await page.goto(BASE + '/landxi/v3/lx-console/', { waitUntil: 'networkidle' }).catch(() => null);
  await page.waitForTimeout(4000);
  await page.screenshot({ path: path.join(SHOTS, mobile ? 'now-home-390.png' : 'now-home-1440.png') });
  console.log('찍음', mobile ? 'now-home-390.png' : 'now-home-1440.png');
  if (!mobile) {
    await page.goto(BASE + '/landxi/v3/xi-clean/', { waitUntil: 'networkidle' }).catch(() => null);
    await page.waitForTimeout(4000);
    await page.screenshot({ path: path.join(SHOTS, 'now-ximap.png') });
    console.log('찍음 now-ximap.png');
  }
  await browser.close();
}
