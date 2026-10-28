import { open, shot, text, APP } from './cap.mjs';
import fs from 'node:fs';
const { browser, page, net, errs } = await open();
await page.goto(APP + '/landxi/v3/lx-map/?project=prj_b79e0f389f', { waitUntil: 'commit' });
await page.waitForSelector('.lm-cmp-b', { timeout: 60000 });
await page.waitForTimeout(9000);
const cog = net.filter((u) => /\/tiles\/cog\//.test(u));
console.log('프로젝트 지도 켠 상태 타일 요청', cog.length, 'toggle', await page.locator('.lm-cmp-b').innerText(), 'errs', errs.length);
await shot(page, 'S4-1-project-map');
fs.writeFileSync('s41.json', JSON.stringify({ at: new Date().toISOString(), login: 'kec-land', toggle: await page.locator('.lm-cmp-b').innerText(), cogRequests: cog.length, sample: cog.slice(0, 3).map((u) => u.replace(/^https:\/\/[^/]+/, '')) }, null, 1));
// ChatGEO 질문(U5 미리 보기)
await page.getByText('XI ChatGEO').last().click().catch(() => {});
await page.waitForTimeout(2500);
console.log(await page.locator('textarea, input[type=text]').evaluateAll((a) => a.filter((x) => x.offsetParent).map((x) => x.tagName + ':' + (x.placeholder || x.getAttribute('aria-label')))));
await shot(page, 'explore-chat');
await browser.close();
