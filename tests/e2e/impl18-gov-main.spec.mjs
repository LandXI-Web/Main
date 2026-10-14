// 구현 18차 · 바퀴 5(확인 대장 10-11 18:52 — gov-보고서 · gov-비교 이대로 구현 · QA-Q2 ⓐ · QA-Q3 ⓐ) — 로그인 폼만(세션 주입 0).
// 기관 보고서 탭 = AI 분석 결과 보고서(서비스 · 읍면동만 고름 · 규칙 · 소견 · 조치 제안 0 · 합계 = 대시보드 큰 숫자)
// 행정정보와 비교 = 대장 × 서비스 결과(다른 필지 = 두 줄 합 · 상태 · 판정 · 확인 필요 0) · 이 화면은 /survey/* 를 부르지 않는다
// 메인 ch5 = 시군구 n곳에 분석 결과 제공(점 수 = n) · ch4 = 행정 업무에 맞춘 GeoAI 분석서비스(로그인 없음)
import { test, expect } from '@playwright/test';
import { frontDoor } from '../../landxi/v3/kit/lint/forbidden.mjs';

const BASE = process.env.LX_BASE || 'http://127.0.0.1:4173';
const up = async (request) => { try { return (await request.get('http://127.0.0.1:8700/api/v1/health', { timeout: 3000 })).ok(); } catch { return false; } };

test.describe('구현 18차 — 기관 보고서 · 행정정보와 비교 · 메인 실적', () => {
  test.describe.configure({ mode: 'serial', timeout: 150000 });
  test.beforeAll(async ({ request }) => { test.skip(!(await up(request)), '게이트웨이 :8700 꺼짐'); });

  test('기관 보고서 탭 — 서비스 · 읍면동 · 개요 · 지도 그림 · 읍면동 표 · 대장 칸 · 합계 = 대시보드', async ({ page }) => {
    const errs = [], survey = []; page.on('pageerror', (e) => errs.push(String(e)));
    page.on('request', (r) => { if (/\/api\/v1\/survey\//.test(r.url())) survey.push(r.url()); });
    await frontDoor(page, BASE, 'lxadmin@lx.or.kr#namwon');
    const origin = new URL(page.url()).origin;
    await page.goto(origin + '/landxi/v3/gov-select/?service=card-farm', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__govSelect?.ready && window.__govSelect.view === 'svc', null, { timeout: 30000 });
    const v = Number(await page.locator('.gd-scene').getAttribute('data-v'));
    await page.goto(origin + '/landxi/v3/gov-report/?service=card-farm&tab=report', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.gr-rdoc', { timeout: 60000 });
    await expect(page.locator('#rp-svc')).toBeVisible();
    await expect(page.locator('#rp-emd2')).toBeVisible();
    await expect(page.locator('#rp-rule')).toHaveCount(0);                                   // 규칙 고르기 없음
    expect(Number(await page.locator('.gr-rdoc').getAttribute('data-v'))).toBe(v);         // 합계 = 대시보드 큰 숫자
    await expect(page.locator('.gr-rdoc')).not.toContainText(/의심|현장\s*확인|소견|조치 제안|우선순위|규칙/);
    await expect(page.locator('.gr-rtb tr.sum')).toContainText(v.toLocaleString('ko-KR'));
    await page.waitForSelector('.gr-map-img img', { timeout: 60000 });
    await expect(page.locator('.gr-rdoc')).toContainText('우리 대장과 다른 필지');
    const emd = await page.locator('#rp-emd2 option').nth(1).getAttribute('value');
    await page.selectOption('#rp-emd2', emd);
    await expect(page.locator('.gr-rdoc-t')).toContainText(emd, { timeout: 60000 });
    const dl = page.waitForEvent('download');
    await page.locator('#rp-form button', { hasText: '한글 문서 내려받기' }).click();
    expect((await dl).suggestedFilename()).toMatch(/AI분석결과보고서.*\.hwpx$/);
    expect(survey).toEqual([]);
    expect(errs).toEqual([]);
  });

  test('행정정보와 비교 — 다른 필지 = 두 줄 합 · 표 · 내려받기 · 보고서에 넣기 · /survey/* 0', async ({ page }) => {
    const errs = [], survey = []; page.on('pageerror', (e) => errs.push(String(e)));
    page.on('request', (r) => { if (/\/api\/v1\/survey\//.test(r.url())) survey.push(r.url()); });
    await frontDoor(page, BASE, 'lxadmin@lx.or.kr#namwon');
    const origin = new URL(page.url()).origin;
    await page.goto(origin + '/landxi/v3/gov-fusion/?service=card-farm', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.gf-big1', { timeout: 60000 });
    const big = Number(await page.locator('.gf-big1').getAttribute('data-v'));
    const lines = await page.locator('.gf-rows li:not(.dim) b').allInnerTexts();
    expect(lines.length).toBe(2);
    expect(lines.reduce((a, t) => a + Number(t.replace(/,/g, '')), 0)).toBe(big);
    const sheet = page.locator('.gf-sheet');
    await expect(sheet).not.toContainText(/판정|확인 필요|우선|규칙|상태/);
    await expect(page.locator('.k-mast')).not.toContainText('할 일');
    const dl = page.waitForEvent('download');
    await sheet.locator('button', { hasText: '내려받기' }).click();
    expect((await dl).suggestedFilename()).toMatch(/\.xlsx$/);
    await sheet.locator('button', { hasText: '보고서에 넣기' }).click();
    await page.waitForURL((u) => u.pathname.startsWith('/landxi/v3/gov-report/') && u.searchParams.get('tab') === 'report', { timeout: 30000 });
    await page.waitForSelector('.gr-rdoc', { timeout: 60000 });
    await expect(page.locator('.gr-cmp')).toContainText(`${big}`);
    expect(survey).toEqual([]);
    expect(errs).toEqual([]);
  });

  test('메인 — ch5 시군구 n곳(점 n개) · 서비스 · 운영 기관 · ch4 행정 업무에 맞춘 GeoAI 분석서비스', async ({ page, request }) => {
    const errs = []; page.on('pageerror', (e) => errs.push(String(e)));
    const rec = await (await request.get('http://127.0.0.1:8700/api/v1/public/record')).json();
    await page.goto(BASE + '/landxi/v3/main/', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => /시군구 \d+곳에/.test(document.querySelector('#ch5-h')?.textContent || ''), null, { timeout: 60000 });
    await expect(page.locator('#ch5-h')).toHaveText(`시군구 ${rec.sgg.value}곳에분석 결과 제공`);
    await expect(page.locator('#ch5-p')).toContainText(`${rec.services.n.value}가지 서비스 결과를 냈습니다`);
    await expect(page.locator('#ch5-tag')).toContainText(`운영 기관 ${rec.orgs.n.value}곳`);
    await expect(page.locator('#labels .m-lbl')).toHaveCount(rec.places.length);
    await expect(page.locator('#ch4 .m-h')).toHaveText('행정 업무에 맞춘GeoAI 분석서비스');
    await expect(page.locator('#ch4-p')).toContainText('업무마다 다른 서비스를 만들어 제공합니다');
    for (const n of rec.work.names) await expect(page.locator('#ch4-names')).toContainText(n);
    await expect(page.locator('main')).not.toContainText(/한 벌로 묶어|어느 지역에나|지역만 바꾸면/);
    expect(errs).toEqual([]);
  });
});
