import { chromium } from '@playwright/test';
const [page = 'home.html', out = 'shot.png', w = '1440', h = '900'] = process.argv.slice(2);
const b = await chromium.launch({ channel: 'chrome' });
const p = await b.newPage({ viewport: { width: +w, height: +h } });
// 로그인 뒤 화면도 찍을 수 있게 세션 플래그를 미리 심는다(LX_ANON=1 이면 비로그인 상태로 찍는다).
if (!process.env.LX_ANON) await p.addInitScript(() => localStorage.setItem('lx_logged_in', '1'));
await p.goto('http://localhost:' + (process.env.PORT || 4173) + '/landxi/' + page, { waitUntil: 'networkidle' });
await p.waitForTimeout(1500);
await p.screenshot({ path: out, fullPage: true });
await b.close(); console.log('saved', out);
