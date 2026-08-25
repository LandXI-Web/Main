import { chromium } from '@playwright/test';
const [page = 'home.html', out = 'shot.png', w = '1440', h = '900'] = process.argv.slice(2);
const b = await chromium.launch({ channel: 'chrome' });
const p = await b.newPage({ viewport: { width: +w, height: +h } });
await p.goto('http://localhost:4173/landxi/' + page, { waitUntil: 'networkidle' });
await p.waitForTimeout(1500);
await p.screenshot({ path: out, fullPage: true });
await b.close(); console.log('saved', out);
