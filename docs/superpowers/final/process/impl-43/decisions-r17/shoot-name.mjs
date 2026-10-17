/* 바퀴 17 배포이름-적용 증거 — 바깥 주소 로그인 폼(관리자). 비밀번호는 server/.env. 서버 · 파일 변경 없음(화면 글자만 바꿔 시안).
   node shoot-name.mjs <출력폴더> [probe] */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
const ROOT = 'E:/Land-XI 플랫폼/01. 디자인';
const HW = 'C:/Users/User/AppData/Local/ms-playwright';
if (fs.existsSync(HW)) process.env.PLAYWRIGHT_BROWSERS_PATH = HW;
if (!process.env.DEV_PASSWORD) { const m = fs.readFileSync(path.join(ROOT, 'server/.env'), 'utf8').match(/^DEV_PASSWORD=(.*?)\s*$/m); if (m) process.env.DEV_PASSWORD = m[1].replace(/^"|"$/g, ''); }
process.env.LX_PW ||= process.env.DEV_PASSWORD;
const { chromium } = createRequire(path.join(ROOT, 'package.json'))('playwright');
const { frontDoor } = await import(pathToFileURL(path.join(ROOT, 'landxi/v3/kit/lint/forbidden.mjs')).href);
const OUT = process.argv[2]; fs.mkdirSync(OUT, { recursive: true });
const ADMIN = 'https://admin.land-xi.dev';
const hm = () => new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Seoul' }).slice(11, 16).replace(':', '');
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'ko-KR' });
const p = await ctx.newPage();
await frontDoor(p, ADMIN, 'lxadmin@lx.or.kr', 'admin');
await p.waitForURL((u) => !/\/login\/?$/.test(u.pathname), { timeout: 60000, waitUntil: 'commit' }).catch(async (e) => { console.log('로그인 막힘', p.url(), (await p.evaluate(() => document.body.innerText)).slice(0, 300)); process.exit(3); });
/* 어느 화면에도 '· 적용' 이름이 글자로 나오지 않는다(기록 12건 · 관리자 · 기관 · 직원 화면 19곳 확인). 그래서 가장 가까운 실제 화면(배포 > 기관 공유) 위에,
   실제 배포 기록 이름(DB deploys.name 읽기 전용 조회)을 '예시 배치'로 얹어 지금 · 시안 두 장을 찍는다. 서버 · 파일 변경 없음. */
const NAMES = ['전남광주특별시 목포시', '경기도 시흥시', '충청남도 천안시 서북구', '전북특별자치도 남원시', '강원특별자치도 원주시', '경상남도 함양군'];
await p.goto(ADMIN + '/landxi/v3/ops-infra/#/deploys/share', { waitUntil: 'commit' });
await p.waitForSelector('text=기관 공유 >> nth=0', { timeout: 30000 }).catch(() => {});
await p.waitForTimeout(5000);
for (const f of fs.readdirSync(OUT)) if (/^deploy-name-(now|draft)-\d{4}\.png$/.test(f)) fs.unlinkSync(path.join(OUT, f));
const t = hm();
async function paint(suffix, band) {
  await p.evaluate(([names, suffix, band]) => {
    document.getElementById('__ex')?.remove();
    const w = document.createElement('div'); w.id = '__ex';
    w.style.cssText = 'position:fixed;top:150px;right:28px;width:420px;z-index:2147483646;background:#fff;border:1px solid #d0d5dd;border-radius:14px;box-shadow:0 12px 32px rgba(16,24,40,.18);padding:20px 22px;font:15px/1.5 "Pretendard","Noto Sans KR",sans-serif;color:#101828';
    w.innerHTML = '<div style="font-weight:700;font-size:17px;margin-bottom:4px">서비스를 기관에 공유하면 남는 배포 기록</div><div style="color:#667085;font-size:13px;margin-bottom:12px">기록 이름의 끝 말</div>'
      + names.map((n) => '<div style="padding:9px 0;border-top:1px solid #eaecf0;font-weight:600">' + n + ' · <span style="color:#0a7a55">' + suffix + '</span></div>').join('');
    document.body.appendChild(w);
    document.getElementById('__bd')?.remove();
    const b = document.createElement('div'); b.id = '__bd'; b.textContent = band;
    b.style.cssText = 'position:fixed;top:12px;right:12px;z-index:2147483647;background:#fff;color:#d92d20;border:3px solid #d92d20;border-radius:10px;padding:8px 16px;font:700 16px/1.2 sans-serif;white-space:nowrap';
    document.body.appendChild(b);
  }, [NAMES, suffix, band]);
  await p.waitForTimeout(400);
}
await paint('적용', '예시 배치 · 지금 이름');
await p.screenshot({ path: path.join(OUT, `deploy-name-now-${t}.png`) });
await paint('기관에 공유', '시안 · 실제 화면 아님');
await p.screenshot({ path: path.join(OUT, `deploy-name-draft-${t}.png`) });
console.log('HHMM', t);
await browser.close();
