// 융합 대시보드(대시보드 쪽) 칸 경고를 폭 셋에서 — 표 머리 덧말 줄바꿈(바퀴 14 재검수 (c)) · 바깥 주소 로그인 폼(LX 직원 한 번)
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch, login } from '../../../../../../tools/check/common.mjs';
import { measure, EXCEPT } from '../../../../../../tools/check/fonts.mjs';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const b = await launch();
const s = await login(b, 'app');
const p = s.page;
await p.evaluate(() => localStorage.setItem('xc_statv', 'dash'));      // 같은 시각 다른 작업의 '지도 위'(원칙 258) 대신 이번 바퀴 대시보드를 본다
await p.goto(s.home + '/landxi/v3/xi-clean/', { waitUntil: 'domcontentloaded' });
await p.waitForFunction(() => window.__xc?.board?.nat?.layers?.length > 0 && window.__xc.boot?.shown, null, { timeout: 60000 });
const inp = p.locator('.k-chat-root[data-dock] .k-ck-i');
await inp.click(); await inp.pressSequentially('남원시 현황 보여 줘', { delay: 25 }); await inp.press('Enter');
await p.waitForFunction(() => window.__xc.dash?.title && !document.querySelector('.xd')?.hidden, null, { timeout: 90000 });
await p.waitForTimeout(2500);
const out = [];
for (const [w, h] of [[1280, 720], [1366, 768], [1440, 900]]) {
  await p.setViewportSize({ width: w, height: h }); await p.waitForTimeout(1200);
  await p.evaluate(() => document.querySelector('.xd-heat')?.scrollIntoView({ block: 'center' }));
  await p.waitForTimeout(500);
  const m = await p.evaluate(measure, EXCEPT);
  const heads = await p.evaluate(() => [...document.querySelectorAll('.xd-heat .ch')].map((c) => c.innerText.replace(/\n/g, ' / ')));
  out.push({ w, small: m.nSmall, off: m.nOff, lay: m.lay, heads });
  await p.screenshot({ path: path.join(HERE, `dash-heat-${w}.png`) });
}
console.log(JSON.stringify(out, null, 1));
await b.close();
