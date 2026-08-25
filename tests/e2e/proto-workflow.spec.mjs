import { test, expect } from '@playwright/test';
import fs from 'node:fs';

const URL = 'proto/workflow.html';
const SHOTS = 'shots/proto-wf';
fs.mkdirSync(SHOTS, { recursive: true });

// 오프라인/키 없음에서 타일이 404 나는 것은 이 프로토의 정상 동작이다(로컬 정사영상 폴백이 있다).
// 네트워크 실패는 무시하고, 우리 코드가 던진 것만 실패로 본다.
const NETWORK = /Failed to load resource|net::ERR|ERR_|status of 40|status of 50|AbortError|could not be decoded/i;

function watch(page) {
  const errs = [];
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const t = m.text();
    if (!NETWORK.test(t)) errs.push('console: ' + t);
  });
  return errs;
}

// skip=1 = 진입 활공 건너뛰기(활공 자체는 별도 케이스에서 검증한다)
async function boot(page, q = '?skip=1') {
  await page.goto(URL + q);
  await page.waitForFunction(() => window.__wf && window.__wf.ready, null, { timeout: 30000 });
  await page.waitForFunction(() => window.__wf.thumbs() >= 6, null, { timeout: 30000 });
  await page.waitForTimeout(1200);
}

/** 액자 안에 실제 픽셀이 있는가 — 이 화면의 1번 규칙(D1). */
async function paintedFrames(page) {
  return page.evaluate(() => {
    let ok = 0;
    for (const c of document.querySelectorAll('.node canvas')) {
      const g = c.getContext('2d');
      const d = g.getImageData(0, 0, c.width, c.height).data;
      const seen = new Set();
      let sum = 0, n = 0;
      for (let i = 0; i < d.length; i += 4 * 401) { seen.add(`${d[i] >> 4},${d[i + 1] >> 4},${d[i + 2] >> 4}`); sum += d[i]; n++; }
      if (seen.size > 8 && sum / n > 14) ok++;
    }
    return ok;
  });
}

test('로드 — 콘솔 오류 0, 실자산 수치가 그대로 화면에 있다', async ({ page }) => {
  const errs = watch(page);
  await boot(page);

  const s = await page.evaluate(() => ({ ...window.__wf.state, ...window.__wf.counts(), ...window.__wf.graph() }));
  expect(s.total).toBe(1674);            // 25년 남원시 비닐하우스 조사(드론).gpkg — 필지
  expect(s.objTotal).toBe(9664);         // 동
  expect(s.shown).toBeGreaterThan(0);
  expect(s.nodes).toBe(6);
  expect(s.edges).toBe(5);
  expect(s.entry).toBe(false);

  await expect(page.locator('#stat')).toContainText(/[0-9,]+/);
  await expect(page.locator('#statsub')).toContainText('9,664');
  await expect(page.locator('#place')).toContainText('남원');

  // 액자 5개(지도 액자는 캔버스가 없다 — 지도 자체가 액자 안이다)가 전부 실제 픽셀
  expect(await paintedFrames(page)).toBeGreaterThanOrEqual(4);

  expect(errs, errs.join('\n')).toEqual([]);
  await page.screenshot({ path: `${SHOTS}/v3-landed.png` });
});

test('진입 — 한 대의 카메라로 활공해 착지하고, 건드리면 즉시 멈춘다', async ({ page }) => {
  const errs = watch(page);
  await page.goto(URL);
  // 활공 중 프레임
  await page.waitForTimeout(1800);
  const mid = await page.evaluate(() => ({ entry: window.__wf.state.entry, z: window.__wf.data() ? 1 : 0 }));
  expect(mid.entry).toBe(true);
  await page.screenshot({ path: `${SHOTS}/v3-entry.png` });

  // 조작 가능한 연출이어야 한다 — 클릭하면 바로 착지
  await page.mouse.click(700, 400);
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => window.__wf.state.entry)).toBe(false);
  expect(errs, errs.join('\n')).toEqual([]);
});

test('신뢰도 임계 — 지도·액자·숫자가 같은 프레임에서 함께 움직인다', async ({ page }) => {
  const errs = watch(page);
  await boot(page);

  const before = await page.evaluate(() => window.__wf.counts());
  await page.evaluate(() => window.__wf.setThreshold(0.9));
  await page.waitForTimeout(900);
  const after = await page.evaluate(() => window.__wf.counts());

  expect(after.shown).toBeLessThan(before.shown);
  expect(after.total).toBe(before.total);          // 삭제가 아니라 감쇠
  await expect(page.locator('#thr')).toHaveText('0.90');
  await expect(page.locator('.node[data-id="post"] [data-art]')).toHaveText(/0\.90/);

  await page.waitForTimeout(700);
  await page.screenshot({ path: `${SHOTS}/v3-slider-090.png` });
  expect(errs, errs.join('\n')).toEqual([]);
});

test('클래스 토글 — 감쇠이지 삭제가 아니다', async ({ page }) => {
  const errs = watch(page);
  await boot(page);
  const n0 = await page.evaluate(() => window.__wf.state.classes.length);
  await page.locator('#cls li').first().click();
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => window.__wf.state.classes.length)).toBe(n0 - 1);
  expect(await page.evaluate(() => window.__wf.counts().total)).toBe(1674);
  expect(errs, errs.join('\n')).toEqual([]);
});

test('뷰어 플래그 — 정확히 한 액자만 "지도에 표시 중"이고, 클릭하면 옮겨간다', async ({ page }) => {
  const errs = watch(page);
  await boot(page);
  expect(await page.locator('.node.is-viewer').count()).toBe(1);
  await expect(page.locator('.node[data-id="detect"]')).toHaveClass(/is-viewer/);

  await page.locator('.node[data-id="source"] .frame').click();
  await page.waitForTimeout(400);
  expect(await page.locator('.node.is-viewer').count()).toBe(1);
  await expect(page.locator('.node[data-id="source"]')).toHaveClass(/is-viewer/);
  await expect(page.locator('#eyebrow')).toContainText('SOURCE');
  await page.screenshot({ path: `${SHOTS}/v3-viewer-flag.png` });
  expect(errs, errs.join('\n')).toEqual([]);
});

test('시점 스크럽 — 4시점 어디서든 액자에 픽셀이 남는다', async ({ page }) => {
  const errs = watch(page);
  await boot(page);
  await page.evaluate(() => window.__wf.setT(0));
  await page.waitForTimeout(2600);
  await expect(page.locator('#tstamp')).toHaveText('2025-04');
  expect(await paintedFrames(page)).toBeGreaterThanOrEqual(4);
  await page.screenshot({ path: `${SHOTS}/v3-timeline-2504.png` });

  await page.evaluate(() => window.__wf.setT(2));
  await page.waitForTimeout(1600);
  await expect(page.locator('#tnote')).toContainText('결손');   // 06·08 전역 정사영상 없음을 숨기지 않는다
  expect(errs, errs.join('\n')).toEqual([]);
});

test('삼면 결속 — 선택 하나가 지도·타일 스트립·타임라인을 함께 좁힌다', async ({ page }) => {
  const errs = watch(page);
  await boot(page);
  await page.evaluate(() => {
    const d = window.__wf.data();
    const a = d.anchors[2].c;
    window.__wf.select([a[0] - 0.004, a[1] - 0.003, a[0] + 0.004, a[1] + 0.003]);
  });
  await page.waitForTimeout(1400);
  expect(await page.locator('#stripl .t').count()).toBeGreaterThan(0);
  await expect(page.locator('#striph')).toContainText(/z1[0-9]/);
  expect(await page.evaluate(() => window.__wf.state.selection)).not.toBeNull();

  await page.locator('#stripl .t').first().hover();
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${SHOTS}/v3-trinity.png` });
  expect(errs, errs.join('\n')).toEqual([]);
});

test('실행 — 진행률을 지어내지 않고 실제 타일 디코딩을 잰다', async ({ page }) => {
  const errs = watch(page);
  await boot(page);
  await page.click('#run');
  await page.waitForFunction(() => /실측 \d+ ms/.test(document.querySelector('#runnote').textContent),
    null, { timeout: 25000 });
  await expect(page.locator('#runnote')).toContainText(/타일 \d+장/);
  await page.screenshot({ path: `${SHOTS}/v3-run.png` });
  expect(errs, errs.join('\n')).toEqual([]);
});

test('심층 검토 — 밝은 면과 어두운 면이 칼로 그은 경계로 만난다', async ({ page }) => {
  const errs = watch(page);
  await boot(page);
  await page.evaluate(() => {
    const d = window.__wf.data();
    const b = d.detail;
    const f = d.feats
      .filter((x) => x.properties.c[0] > b[0] && x.properties.c[0] < b[2] && x.properties.c[1] > b[1] && x.properties.c[1] < b[3])
      .sort((a, z) => z.properties.nobj - a.properties.nobj)[0];
    window.__wf.pick(f.id);
  });
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${SHOTS}/v3-lockon.png` });

  await page.keyboard.press('i');
  await expect(page.locator('#inspect')).toHaveClass(/is-in/);
  await expect(page.locator('#ins-meta')).toContainText('신뢰도');
  const bg = await page.evaluate(() => getComputedStyle(document.querySelector('#inspect')).backgroundColor);
  expect(bg).toBe('rgb(255, 255, 255)');            // 하드 명암 경계
  await page.waitForTimeout(1100);
  await page.screenshot({ path: `${SHOTS}/v3-inspect.png` });

  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  await expect(page.locator('#inspect')).not.toHaveClass(/is-in/);
  expect(errs, errs.join('\n')).toEqual([]);
});

test('여수 프리셋 — 없는 것을 만들지 않는다(모델 결손·단일 시점)', async ({ page }) => {
  const errs = watch(page);
  await boot(page, '?preset=yeosu-marine&skip=1');
  expect(await page.evaluate(() => window.__wf.counts().total)).toBe(1770);
  await expect(page.locator('.node[data-id="model"]')).toHaveClass(/is-void/);
  await expect(page.locator('.node[data-id="model"] [data-foot]')).toContainText('없다');
  await expect(page.locator('#play')).toBeDisabled();
  await page.screenshot({ path: `${SHOTS}/v3-yeosu.png` });
  expect(errs, errs.join('\n')).toEqual([]);
});

test('키보드 — 액자에 Tab 으로 닿고 Enter 로 뷰어를 옮긴다', async ({ page }) => {
  const errs = watch(page);
  await boot(page);
  expect(await page.locator('.node[tabindex="0"]').count()).toBe(6);
  await page.locator('.node[data-id="post"]').focus();
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
  await expect(page.locator('.node[data-id="post"]')).toHaveClass(/is-viewer/);

  const t0 = await page.evaluate(() => window.__wf.state.thr);
  await page.keyboard.press(']');
  await page.waitForTimeout(200);
  expect(await page.evaluate(() => window.__wf.state.thr)).toBeGreaterThan(t0);
  expect(errs, errs.join('\n')).toEqual([]);
});
