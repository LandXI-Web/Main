/* 지금 화면 촬영(설계 7차 lx-dash) — 로그인 폼(키트 lint 의 frontDoor)으로 LX 직원 계정에 들어가
   첫 화면 · XI맵 · 서비스 소개 · 배포(서비스 관리)를 찍는다. GPU 실행 0 · 세션 주입 0 · 코드 수정 0.
   사용: node docs/superpowers/final/process/design-r7/lx-dash/now.mjs   (이 PC 서버 http://localhost:4173 · 계정 LX_LOGIN, 기본 test@lx.or.kr) */
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import { openPages } from '../../../../../../landxi/v3/kit/lint/forbidden.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SHOTS = path.join(HERE, 'shots');
fs.mkdirSync(SHOTS, { recursive: true });
const BASE = process.env.LX_BASE || 'http://localhost:4173';
const LOGIN = process.env.LX_LOGIN || 'test@lx.or.kr';

const PC = [
  ['/landxi/v3/lx-console/', 'now-home-1440.png'],
  ['/landxi/v3/xi-clean/', 'now-ximap.png'],
  ['/landxi/v3/service-detail/?card=card-farm', 'now-service-detail.png'],
  ['/landxi/v3/lx-deploy/?tab=ops#ops', 'now-deploy-ops.png'],
  ['/landxi/v3/lx-project/', 'now-projects.png'],
];
const MOBILE = [['/landxi/v3/lx-console/', 'now-home-390.png']];

for (const [mobile, list] of [[false, PC], [true, MOBILE]]) {
  const { browser, page } = await openPages([], { login: LOGIN, mobile, base: BASE, site: 'app' });
  for (const [url, out] of list) {
    await page.goto(BASE + url, { waitUntil: 'networkidle' }).catch(() => null);
    await page.waitForTimeout(4500);
    await page.screenshot({ path: path.join(SHOTS, out) });
    console.log('찍음', out);
  }
  await browser.close();
}
