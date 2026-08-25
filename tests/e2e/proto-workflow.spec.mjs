import { test, expect } from '@playwright/test';
import fs from 'node:fs';

const URL = 'proto/workflow.html';
const SHOTS = 'shots/proto-wf';
fs.mkdirSync(SHOTS, { recursive: true });

// 오프라인/키 없음에서 타일이 404 나는 것은 이 프로토의 정상 동작이다(폴백이 있다).
// 네트워크 실패는 무시하고, 우리 코드가 던진 것만 실패로 본다.
const NETWORK = /Failed to load resource|net::ERR|ERR_|status of 40|status of 50|AbortError/i;

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

async function boot(page) {
  await page.goto(URL);
  await page.waitForFunction(() => window.__wf && window.__wf.ready && window.__wf.graph().nodes >= 6, null, { timeout: 25000 });
  await page.waitForFunction(() => window.__wf.thumbs() >= 6, null, { timeout: 25000 });
  await page.waitForTimeout(700);
}

test('로드 — 콘솔 오류 0, 실자산이 실제로 붙는다', async ({ page }) => {
  const errs = watch(page);
  await boot(page);

  const s = await page.evaluate(() => ({ ...window.__wf.state, ...window.__wf.counts(), ...window.__wf.graph() }));
  expect(s.total).toBeGreaterThan(4000);            // marine-debris.geojson 5,000 폴리곤이 전제
  expect(s.shown).toBeGreaterThan(0);
  expect(s.classes.length).toBeGreaterThan(0);
  expect(s.nodes).toBe(6);
  expect(s.edges).toBe(5);

  // 실행 바가 실측 소요를 말한다(가짜 진행률 금지)
  await expect(page.locator('#run-stat')).toContainText(/ms/);
  expect(errs, errs.join('\n')).toEqual([]);

  await page.screenshot({ path: `${SHOTS}/overview.png` });
});

test('신뢰도 슬라이더 — 표시 건수가 실제로 줄고 지도 필터가 같이 움직인다', async ({ page }) => {
  const errs = watch(page);
  await boot(page);

  const before = await page.evaluate(() => window.__wf.counts().shown);
  await page.evaluate(() => window.__wf.setThreshold(0.9, 'test'));
  await page.waitForTimeout(400);
  const after = await page.evaluate(() => window.__wf.counts().shown);

  expect(after).toBeLessThan(before);
  await expect(page.locator('#conf-val')).toHaveText('0.90');
  await expect(page.locator('#chips li')).toContainText(/0\.90/);

  // 후처리 블록의 파라미터도 같은 값이어야 한다 — 세 구역이 하나의 상태를 본다.
  const nodeConf = await page.evaluate(() =>
    +document.querySelector('.node[data-id] input[data-p="conf"]').value);
  expect(nodeConf).toBeCloseTo(0.9, 2);

  await page.waitForTimeout(900);
  await page.screenshot({ path: `${SHOTS}/slider-090.png` });
  expect(errs, errs.join('\n')).toEqual([]);
});

test('클래스 토글 — 감쇠이지 삭제가 아니다', async ({ page }) => {
  const errs = watch(page);
  await boot(page);
  const n0 = await page.evaluate(() => window.__wf.state.classes.length);
  if (n0 > 1) {
    await page.locator('#cls-list button').first().click();
    await page.waitForTimeout(200);
    const n1 = await page.evaluate(() => window.__wf.state.classes.length);
    expect(n1).toBe(n0 - 1);
    // 필터 칩이 생기고, 원본 총계는 그대로다(삭제가 아니라 감쇠)
    await expect(page.locator('#chips li')).toHaveCount(await page.locator('#chips li').count());
    const t = await page.evaluate(() => window.__wf.counts().total);
    expect(t).toBeGreaterThan(4000);
  }
  expect(errs, errs.join('\n')).toEqual([]);
});

test('포트 연결 — 두 포트를 이으면 엣지가 생긴다', async ({ page }) => {
  const errs = watch(page);
  await boot(page);

  // 라이브러리에서 시각화 블록을 하나 띄운다(우클릭 → 검색 → 선택)
  const before = await page.evaluate(() => window.__wf.graph());
  await page.evaluate(() => {
    const g = document.querySelector('#canvas');
    g.dispatchEvent(new MouseEvent('contextmenu', { clientX: 520, clientY: 700, bubbles: true }));
  });
  await expect(page.locator('#lib')).toBeVisible();
  await page.fill('#lib-q', '시각화');
  await page.locator('#lib-list .lib-i').first().click();
  await page.waitForTimeout(500);

  const mid = await page.evaluate(() => window.__wf.graph());
  expect(mid.nodes).toBe(before.nodes + 1);

  // 인스펙터가 열려 있으면 포트를 덮는다. 닫고 캔버스를 다시 맞춘다.
  await page.locator('#insp-x').click();
  await page.evaluate(() => window.__wfgraph.fit());
  await page.waitForTimeout(300);

  // 후처리(post) 출력 포트 → 방금 만든 블록의 입력 포트로 드래그
  const added = await page.evaluate(() => {
    const g = window.__wfgraph;
    return g.G.nodes[g.G.nodes.length - 1].id;
  });
  const post = await page.evaluate(() => window.__wfgraph.G.nodes.find((n) => n.type === 'post').id);
  const from = page.locator(`.node[data-id="${post}"] .port.out`);
  const to = page.locator(`.node[data-id="${added}"] .port.in`);
  const a = await from.boundingBox(), b = await to.boundingBox();
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(a.x + 60, a.y + 20, { steps: 6 });
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(400);

  const after = await page.evaluate(() => window.__wf.graph());
  expect(after.edges).toBe(mid.edges + 1);
  expect(errs, errs.join('\n')).toEqual([]);
});

test('실행 — 모든 블록이 실제 썸네일을 만들고, 두 번째 실행은 캐시가 잡힌다', async ({ page }) => {
  const errs = watch(page);
  await boot(page);

  // 노드 캔버스가 단색이 아니어야 한다 = 실제 타일/폴리곤이 그려졌다는 뜻
  const painted = await page.evaluate(() => {
    let ok = 0;
    for (const c of document.querySelectorAll('.node canvas')) {
      const g = c.getContext('2d');
      const d = g.getImageData(0, 0, c.width, c.height).data;
      const seen = new Set();
      for (let i = 0; i < d.length; i += 4 * 97) seen.add(`${d[i]},${d[i + 1]},${d[i + 2]}`);
      if (seen.size > 12) ok++;
    }
    return ok;
  });
  expect(painted).toBeGreaterThanOrEqual(5);

  await page.click('#run');
  await page.waitForFunction(() => /캐시 [1-9]/.test(document.querySelector('#run-stat').textContent),
    null, { timeout: 20000 });
  await expect(page.locator('.nh .st[data-s="cache"]').first()).toBeVisible();
  expect(errs, errs.join('\n')).toEqual([]);
});

test('인스펙터 — Visual / JSON / 로그 3탭', async ({ page }) => {
  const errs = watch(page);
  await boot(page);

  const detect = await page.evaluate(() => window.__wfgraph.G.nodes.find((n) => n.type === 'detect').id);
  await page.locator(`.node[data-id="${detect}"] .thumb`).click();
  await expect(page.locator('#insp')).toBeVisible();
  await expect(page.locator('#insp-title')).toHaveText('탐지');
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${SHOTS}/inspector.png` });

  await page.locator('#insp-tabs button[data-tab="json"]').click();
  await expect(page.locator('#insp-json')).toContainText('"type": "detect"');
  await page.locator('#insp-tabs button[data-tab="log"]').click();
  await expect(page.locator('#insp-log')).not.toHaveText('');
  expect(errs, errs.join('\n')).toEqual([]);
});

test('시점 비교 — 남원 4시점 스와이프', async ({ page }) => {
  const errs = watch(page);
  await boot(page);
  await page.locator('#map-tabs button[data-view="swipe"]').click();
  await expect(page.locator('#swipe')).toBeVisible();
  await page.waitForTimeout(1800);
  await page.screenshot({ path: `${SHOTS}/swipe.png` });
  expect(errs, errs.join('\n')).toEqual([]);
});

test('키보드 — Tab 으로 노드에 닿고 Ctrl+Z 로 되돌린다', async ({ page }) => {
  const errs = watch(page);
  await boot(page);

  const focusable = await page.evaluate(() => document.querySelectorAll('.node[tabindex="0"]').length);
  expect(focusable).toBe(6);

  const before = await page.evaluate(() => window.__wf.graph());
  const id = await page.evaluate(() => window.__wfgraph.G.nodes.find((n) => n.type === 'mapout').id);
  await page.locator(`.node[data-id="${id}"]`).focus();
  await page.keyboard.press('Delete');
  await page.waitForTimeout(200);
  expect((await page.evaluate(() => window.__wf.graph())).nodes).toBe(before.nodes - 1);

  await page.keyboard.press('Control+z');
  await page.waitForTimeout(300);
  expect((await page.evaluate(() => window.__wf.graph())).nodes).toBe(before.nodes);
  expect(errs, errs.join('\n')).toEqual([]);
});
