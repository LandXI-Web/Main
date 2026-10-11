// 구현 12차 · 지도 서비스(원칙 149 · 163 · 질문 1 ⓑ) · 행선지 바꾸기 · 영상 고르기(질문 3 ⓐ · 원칙 153).
// 로그인 폼 입력만(세션 주입 0) · 비밀번호는 server/.env DEV_PASSWORD(출력 0) · 게이트웨이 :8700 이 떠 있어야 한다. 쓰기 0 · GPU 0(분석 시작은 누르지 않는다).
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { frontDoor } from '../../landxi/v3/kit/lint/forbidden.mjs';

const ENV = path.resolve('server/.env');
const PW = fs.existsSync(ENV) ? (/DEV_PASSWORD=(.+)/.exec(fs.readFileSync(ENV, 'utf8')) || [])[1]?.trim() : null;
const up = async (request) => { try { return (await request.get('http://127.0.0.1:8700/api/v1/health', { timeout: 3000 })).ok(); } catch { return false; } };

/* 화면 안 결과 도형 하나의 화면 좌표(window.__lm — 지도 서비스 점검 손잡이) */
const featurePoint = (cls) => {
  const m = window.__lm?.map; if (!m) return null;
  const c = m.getCanvas(), W = c.clientWidth, H = c.clientHeight;
  const ids = m.getStyle().layers.map((l) => l.id).filter((i) => i.startsWith('lm-r-') && i.endsWith('-fill') && m.getLayoutProperty(i, 'visibility') !== 'none');
  const fs = m.queryRenderedFeatures([[W * 0.2, H * 0.15], [W * 0.62, H * 0.85]], { layers: ids }).filter((f) => !cls || f.properties.cls === cls);
  if (!fs.length) return null;
  const g = fs[0].geometry, ring = g.type === 'MultiPolygon' ? g.coordinates[0][0] : g.coordinates[0];
  const cen = ring.reduce((a, p) => [a[0] + p[0] / ring.length, a[1] + p[1] / ring.length], [0, 0]);
  const p = m.project(cen); return { x: p.x, y: p.y };
};

test.describe('구현 12차 · 지도 서비스 · 영상 고르기', () => {
  test.beforeEach(async ({ request }) => {
    test.skip(!PW, 'server/.env DEV_PASSWORD 없음');
    test.skip(!(await up(request)), '게이트웨이 :8700 꺼짐');
  });

  test('지도 서비스 — 메뉴 칸 · 묶음 둘 켜기 · 도형 누르면 오른쪽 속성 · XI맵 요소 0 · 추론 결과 보기가 여기로', async ({ page, baseURL }) => {
    test.setTimeout(120000);
    const errs = []; page.on('pageerror', (e) => errs.push(String(e))); page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
    await frontDoor(page, new URL(baseURL).origin, 'test@lx.or.kr', 'app');
    await page.waitForURL((u) => u.pathname.startsWith('/landxi/v3/lx-console/'), { timeout: 20000 });
    await page.locator('.k-rail a.k-rail-i[data-id="mapsvc"], .k-rail a.k-rail-i:has-text("지도 서비스")').first().click();
    await page.waitForURL((u) => u.pathname.startsWith('/landxi/v3/lx-map/'), { timeout: 20000 });
    await expect(page.locator('body[data-ready="1"]')).toHaveCount(1, { timeout: 60000 });
    await expect(page.locator('.k-rail .k-rail-i[aria-current="true"] > span:last-child')).toHaveText('지도 서비스');
    const groups = page.locator('.lm-grp');
    expect(await groups.count()).toBeGreaterThanOrEqual(2);
    // 묶음 둘 — 비닐하우스 분석서비스(남원 전역) + 같은 남원의 프로젝트 추론
    const card = page.locator('.lm-grp', { hasText: '비닐하우스 분석서비스' });
    const proj = page.locator('.lm-grp.is-proj', { hasText: '비닐하우스' });
    while (await page.locator('.lm-sw[aria-checked="true"]').count()) await page.locator('.lm-sw[aria-checked="true"]').first().click();   // 처음 켜진 층(가장 최근 결과)을 끈다
    for (const g of [card, proj]) {
      if ((await g.locator('.lm-gt').getAttribute('aria-expanded')) !== 'true') await g.locator('.lm-gt').click();
      const sw = g.locator('.lm-sw').first();
      if ((await sw.getAttribute('aria-checked')) !== 'true') await sw.click();
      await expect(sw).toHaveAttribute('aria-checked', 'true');
    }
    await expect(page.locator('.lm-sum small').first()).toContainText('묶음 2개');
    await page.waitForTimeout(4000);
    const pt = await page.evaluate(featurePoint, '비닐하우스');
    expect(pt).not.toBeNull();
    const bb = await page.locator('.lm-stage .maplibregl-canvas').boundingBox();
    await page.mouse.click(bb.x + pt.x, bb.y + pt.y);
    const props = page.locator('.lm-props');
    await expect(props).toBeVisible({ timeout: 10000 });
    await expect(props.locator('h2')).toHaveText('비닐하우스');
    for (const k of ['분류', '신뢰도', '영상 시점', '분석한 날', '묶음', '지번', '지목', '필지 면적']) await expect(props.locator('dt', { hasText: k }).first()).toBeVisible();
    await expect(props.locator('dd').filter({ hasText: /\d/ }).first()).toBeVisible();
    await expect(props).not.toContainText('불러오는 중', { timeout: 15000 });
    // XI맵 실시간 요소 0 · 내부 값 0
    await expect(page.locator('[class^="xc-"], .xi-lock, .cw-lock')).toHaveCount(0);
    const text = await page.locator('.lm-page').innerText();
    for (const bad of ['job_', 'results/lx', 'GPU', 'p95']) expect(text.includes(bad), bad).toBe(false);
    // 프로젝트 추론 탭 '결과 보기' → 지도 서비스
    const pid = (await proj.getAttribute('data-g')).split(':')[1];
    await page.goto(`v3/lx-release/?project=${encodeURIComponent(pid)}&stage=infer`);
    const link = page.locator('a.rl-link', { hasText: '결과 보기' }).first();
    await expect(link).toHaveAttribute('href', /\/landxi\/v3\/lx-map\/\?job=/, { timeout: 30000 });
    await link.click();
    await page.waitForURL((u) => u.pathname.startsWith('/landxi/v3/lx-map/'), { timeout: 20000 });
    await expect(page.locator('body[data-ready="1"]')).toHaveCount(1, { timeout: 60000 });
    await expect(page.locator('.lm-grp.is-proj .lm-sw[aria-checked="true"]').first()).toBeVisible();
    expect(errs).toEqual([]);
  });

  test('분석하기 상세 — 영상 고르기: 카드 두 열 · 범위 지도 · 맞음 표시 · 다른 영상을 고르면 오른쪽 칸이 따라온다 · 결과 안내는 지도 서비스', async ({ page, baseURL }) => {
    test.setTimeout(120000);
    const errs = []; page.on('pageerror', (e) => errs.push(String(e)));
    await frontDoor(page, new URL(baseURL).origin, 'test@lx.or.kr', 'app');
    await page.waitForURL((u) => u.pathname.startsWith('/landxi/v3/lx-console/'), { timeout: 20000 });
    await page.goto('v3/lx-analyze/?card=card-5e85a9&region=52190');
    const cards = page.locator('#imagery .la-im-c');
    await expect(cards.first()).toBeVisible({ timeout: 60000 });
    expect(await cards.count()).toBeGreaterThanOrEqual(2);
    await expect(page.locator('#imagery .la-im-rd:checked')).toHaveCount(1);                       // 영상은 하나만(라디오 · 원칙 185)
    expect(await page.locator('#imagery input[type=checkbox]').count()).toBe(0);
    await expect(page.locator('#imagery .la-im-map .maplibregl-canvas')).toHaveCount(1);
    for (const k of ['해상도', '촬영 시기', '범위']) await expect(cards.first().locator('dt', { hasText: k })).toBeVisible();
    await expect(cards.first().locator('.la-fit')).toHaveText(/이 서비스에 맞음|결과가 거칠 수 있음/);
    const other = page.locator('#imagery .la-im-c[data-on="0"][data-no="0"]').first();
    const nm = (await other.locator('.la-im-n').innerText()).trim();
    await other.click();
    await expect(page.locator('#imagery .la-im-c[data-on="1"] .la-im-n')).toHaveText(nm);
    await expect(page.locator('#imagery .la-im-rd:checked')).toHaveCount(1);
    await expect(page.locator('.la-picks')).toContainText(`영상 · ${nm}`, { timeout: 30000 });
    await expect(page.locator('.la-side')).toContainText('지도 서비스');
    await expect(page.locator('.la-side')).not.toContainText('XI맵');
    expect(errs).toEqual([]);
  });
});
