// 구현 3차 · 영상 표준(확인 대장 15차 영상-1~3 + 확인 없이 고칠 고장 ①) — 로그인 폼만(세션 주입 0).
// 기관 입구(남원) → 분석 의뢰 → ① 영상이 아닌 파일(이름만 .tif)은 고르는 순간 쉬운 말 한 줄 · 서버로 한 바이트도 보내지 않는다
//                             ② 실제 영상 조각은 정상으로 받아 '분석할 수 있습니다' — 받은 뒤 서버가 표준본(COG · JPEG 90)을 만든다(서버 pytest 가 기록을 본다).
// 끝에서 이 시험이 만든 묶음을 '다른 영상으로'(묶음 지우기)로 지운다.
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { frontDoor } from '../../landxi/v3/kit/lint/forbidden.mjs';

const BASE = process.env.LX_BASE || 'http://127.0.0.1:4173';
const TMP = path.resolve('test-results/impl3-imagery');
const up = async (request) => { try { return (await request.get('http://127.0.0.1:8700/api/v1/health', { timeout: 3000 })).ok(); } catch { return false; } };

function realChip(name) {
  fs.mkdirSync(TMP, { recursive: true });
  const out = path.join(TMP, name);
  const py = `
import sys, rasterio
from rasterio.windows import Window
from rasterio.warp import transform
xs, ys = transform("EPSG:4326", "EPSG:5186", [127.3705], [35.52301])
with rasterio.open(r"E:/Land-XI 플랫폼/02. 데이터/_work/namwon_ap25_2023.vrt") as s:
    r, c = s.index(xs[0], ys[0]); w = Window(c - 512, r - 512, 1024, 1024); a, t = s.read([1, 2, 3], window=w), s.window_transform(w)
with rasterio.open(sys.argv[1], "w", driver="GTiff", width=1024, height=1024, count=3, dtype="uint8", crs="EPSG:5186", transform=t) as d: d.write(a)
`;
  const r = spawnSync('python', ['-c', py, out], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error('시험 영상 만들기 실패: ' + r.stderr);
  return out;
}

test.describe('impl-3 영상 표준 — 분석 의뢰 올리기', () => {
  test.describe.configure({ mode: 'serial', timeout: 180000 });
  test.beforeAll(async ({ request }) => { test.skip(!(await up(request)), '게이트웨이 :8700 꺼짐'); });

  test('영상이 아닌 파일은 고르는 순간 알리고 보내지 않는다 · 실제 영상은 받는다', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    await frontDoor(page, BASE, 'lxadmin@lx.or.kr#namwon', 'gov');
    await page.goto(BASE + '/landxi/v3/gov-request/', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.gq-sheet #drop', { timeout: 30000 });
    const starts = [];
    page.on('request', (r) => { if (r.method() === 'POST' && /\/requests\/uploads$/.test(new URL(r.url()).pathname)) starts.push(r.url()); });

    fs.mkdirSync(TMP, { recursive: true });
    const fake = path.join(TMP, '항공영상_가짜.tif');
    fs.writeFileSync(fake, 'this is not an image file\n'.repeat(200));
    await page.locator('#drop input[type=file]').setInputFiles([fake]);
    const row = page.locator('.k-uq-r[data-st="bad"] .k-uq-s');
    await expect(row).toContainText('영상으로 읽을 수 없는 파일입니다', { timeout: 5000 });
    await expect(row).not.toContainText(/TIF|좌표|형식/);                       // 전문 용어 없이(원칙 100)
    expect(starts.length).toBe(0);                                             // 올리기 시작 0 — 다 올린 뒤에 거절하지 않는다
    await page.locator('.k-uq-r .x').first().click();

    const real = realChip('남원_덕과_2023.tif');
    await page.locator('#drop input[type=file]').setInputFiles([real]);
    await expect(page.locator('#picked')).toContainText('분석할 수 있습니다', { timeout: 90000 });
    expect(starts.length).toBe(1);
    await page.locator('#picked .gq-other').click();                            // 묶음 지우기(표준본까지)
    await page.waitForTimeout(1000);
    await ctx.close();
  });
});
