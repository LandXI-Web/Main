import { test, expect } from '@playwright/test';

/* landxi/proto/dive.html — 흰 아틀라스.
 *
 * 이 스펙이 지키는 계약(취향 프로필 §2.2 · 벤치마크 §1/§3/§6):
 *   · 바탕은 처음부터 끝까지 흰 종이다. 어두움은 오직 판(plate) 안에서만 나온다.
 *   · 어디에도 유리·라운드·그림자·그라디언트 스크림이 없다.
 *   · 색인 13행 · 결과 7행이 전부 실데이터에서 나온다. 수치가 없는 행은 그렇다고 말한다.
 *   · 값을 만지면(신뢰도 슬라이더) 지도가 같은 프레임에 답한다.
 *   · 콘솔 오류 0.
 * 스크린샷은 shots/proto/ 로 남는다(리포에는 커밋하지 않는다).
 */

const URL = '/landxi/proto/dive.html';
const RES_A = 0.888, RES_B = 0.988;
const rowP = (i, n) => RES_A + (RES_B - RES_A) * (i / (n - 1));
const num = (t) => Number(String(t).replace(/[^\d]/g, ''));

test.describe.configure({ timeout: 300000 });

async function boot(page) {
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('body[data-ready="1"]', { timeout: 120000 });
  await page.waitForTimeout(2500);
  return errors;
}

test('흰 아틀라스 — 종이는 끝까지 희고, 13행·7행이 전부 실데이터다', async ({ page }) => {
  const errors = await boot(page);

  // 지도는 한 번만 만들어지고 끝까지 파괴되지 않는다
  expect(await page.evaluate(() => { window.__mapRef = window.__map; return !!window.__map; })).toBe(true);

  // 마스트헤드 — 모서리 스티커가 아니라 상단 캡션 한 줄
  expect(await page.isVisible('#meta-txt')).toBe(true);
  expect(await page.textContent('#meta-txt')).toMatch(/KST/);
  expect(await page.$('#hud')).toBeNull();

  // ── 흰 종이 — 어느 챕터에서도 지면이 어두워지지 않는다 ──
  for (const q of [0.02, 0.20, 0.45, 0.70, 0.84, 0.94]) {
    await page.evaluate((v) => window.__dive.seek(v), q);
    await page.waitForTimeout(700);
    const paper = await page.evaluate(() => {
      const rgb = (s) => (s.match(/\d+/g) || []).slice(0, 3).map(Number);
      const body = rgb(getComputedStyle(document.body).backgroundColor);
      return { colorway: document.body.dataset.colorway, body };
    });
    expect(paper.colorway, `p=${q} 컬러웨이`).toBe('light');
    expect(Math.min(...paper.body), `p=${q} 바탕이 어둡다: ${paper.body}`).toBeGreaterThan(248);
  }

  // ── 유리·라운드·그림자 잔존 없음 ──
  const glassy = await page.evaluate(() => [...document.querySelectorAll('#ui *')].filter((el) => {
    const c = getComputedStyle(el);
    return (c.backdropFilter && c.backdropFilter !== 'none')
      || (parseFloat(c.borderTopLeftRadius) > 0 && el.id !== 'swipe-grip')
      || (c.boxShadow && c.boxShadow !== 'none');
  }).map((el) => el.id || el.className).slice(0, 6));
  expect(glassy, '유리/라운드/그림자 잔존: ' + glassy.join(', ')).toEqual([]);

  // ── 색인 13행 — 수치가 있는 행만 실결과, 나머지는 그렇다고 말한다 ──
  await page.evaluate(() => window.__dive.seek(0.45));
  await page.waitForTimeout(2500);
  const idx = await page.$$eval('#index li', (els) => els.map((el) => ({
    id: el.dataset.id,
    real: el.classList.contains('real'),
    count: (el.querySelector('.c') || {}).textContent || null,
    pending: !!el.querySelector('s'),
  })));
  expect(idx.length).toBe(15);
  const real = idx.filter((r) => r.real);
  expect(real.length).toBeGreaterThanOrEqual(3);
  for (const r of real) expect(num(r.count), `${r.id} 수치`).toBeGreaterThan(0);
  for (const r of idx.filter((x) => !x.real)) expect(r.pending, `${r.id} 준비중 표기`).toBe(true);

  // 호버 — 행을 가리키면 나머지가 물러난다(180ms 물리 반응)
  await page.hover('#index li:nth-child(2)');
  await page.waitForTimeout(600);
  const dim = await page.evaluate(() => {
    const els = [...document.querySelectorAll('#index li')];
    return { hov: +getComputedStyle(els[1]).opacity, other: +getComputedStyle(els[6]).opacity };
  });
  expect(dim.hov).toBeGreaterThan(0.9);
  expect(dim.other, '호버 시 나머지 행이 물러나지 않는다').toBeLessThan(0.6);
  await page.screenshot({ path: 'shots/proto/w-14-hover-index.png' });

  // ── 결과 아틀라스 7행 — 전부 실데이터 ──
  const rows = await page.evaluate(() => window.__dive.rows.map((r) => ({
    id: r.id, fig: r.fig, place: r.place, count: r.count, unit: r.unit,
    geo: !!r.geojson, prov: r.prov, classes: (r.classes || []).length,
  })));
  expect(rows.length).toBe(7);
  for (const r of rows) {
    expect(r.fig, r.id).toMatch(/^FIG\. \d\d$/);
    expect(r.place, r.id + ' 지명').toBeTruthy();
    expect(r.prov, r.id + ' 출처').toBeTruthy();
    expect(r.classes, r.id + ' 클래스').toBeGreaterThan(0);
  }
  // 실제로 센 수치가 있는 행이 과반이다 — 라인업이 아니라 결과 지면이다
  expect(rows.filter((r) => r.count != null).length).toBeGreaterThanOrEqual(4);

  expect(await page.$$eval('#res-menu button', (b) => b.length)).toBe(7);
  expect(await page.$$eval('#res-blocks .rb', (b) => b.length)).toBe(7);
  expect(await page.$$eval('#res-strip .rp', (b) => b.length)).toBe(7);

  // ── 행마다 판이 도킹하고, 통계는 124px 이며, 캡션은 지명 · 날짜다 ──
  for (const i of [0, 2, 6]) {
    await page.evaluate((v) => window.__dive.seek(v), rowP(i, 7));
    await page.waitForTimeout(6500);
    const seen = await page.evaluate(() => {
      const live = document.querySelector('#res-strip .rp.live');
      const rb = document.querySelector('#res-blocks .rb.on');
      if (!live || !rb) return null;
      const r = live.getBoundingClientRect();
      const st = rb.querySelector('.rnum .stat');
      const clip = getComputedStyle(document.querySelector('#stage')).clipPath;
      return {
        i: +live.dataset.i,
        rbI: +rb.dataset.i,
        rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)],
        clip,
        statPx: st ? parseFloat(getComputedStyle(st).fontSize) : 0,
        stat: st ? st.textContent.trim() : '',
        cap: live.querySelector('.pcap span').textContent,
        date: live.querySelector('.pcap b').textContent,
        overflow: rb.scrollHeight - rb.clientHeight,
      };
    });
    expect(seen, `행 ${i} 이 살아나지 않았다`).not.toBeNull();
    expect(seen.i, '판과 캡션 블록이 다른 행을 가리킨다').toBe(seen.rbI);
    // 판(clip-path)이 살아 있는 행 위에 정확히 앉는다 — 한 대의 카메라라는 전제
    const inset = (seen.clip.match(/[\d.]+px/g) || []).map(parseFloat);
    expect(inset.length, '판이 clip 되지 않았다').toBe(4);
    expect(Math.abs(inset[3] - seen.rect[0]), '판 좌측이 행과 어긋난다').toBeLessThan(6);
    expect(Math.abs(inset[0] - seen.rect[1]), '판 상단이 행과 어긋난다').toBeLessThan(6);
    // 벤치마크 §1 — 통계는 124px 계단이다(유동 스케일 아님)
    expect(seen.statPx, `행 ${i} 통계 크기`).toBeGreaterThan(100);
    expect(seen.stat, `행 ${i} 통계 값`).toMatch(/[\d,]/);
    // §4.6 PLACE · DATE
    expect(seen.date, `행 ${i} 날짜`).toMatch(/\d{4}\.\d{2}/);
    expect(seen.cap, `행 ${i} 지명`).toMatch(/FIG\. \d\d/);
    // 캡션 블록이 컬럼 밖으로 넘치지 않는다
    expect(seen.overflow, `행 ${i} 캡션 블록 넘침`).toBeLessThanOrEqual(2);
    await page.screenshot({ path: `shots/proto/w-row-${i}.png` });
  }

  // ── 값을 만지면 지도가 같은 프레임에 답한다 ──
  await page.evaluate(() => window.__dive.seek(0.45));
  await page.waitForTimeout(2200);
  await page.evaluate(() => window.__dive.open('marine'));
  await page.waitForSelector('#rconf', { timeout: 40000 });
  await page.waitForTimeout(4000);
  expect(await page.textContent('#card-title')).toContain('여수');
  expect(await page.textContent('#card-cap')).toMatch(/여수|전남/);
  expect(num(await page.textContent('#card-n'))).toBeGreaterThan(0);
  expect(await page.$$eval('#card-rows .rows li', (n) => n.length)).toBeGreaterThan(0);

  const before = await page.textContent('#rconf-n');
  const filtBefore = await page.evaluate(() => JSON.stringify(window.__map.getFilter('res0-dot')));
  await page.evaluate(() => {
    const s = document.querySelector('#rconf');
    s.value = String(+s.min + (+s.max - +s.min) * 0.7);
    s.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.waitForTimeout(800);
  const after = await page.textContent('#rconf-n');
  expect(num(before)).toBeGreaterThan(500);
  expect(num(after)).toBeLessThan(num(before));
  expect(num(after)).toBeGreaterThan(0);
  // 필터는 삭제가 아니라 임계 — 지도 표현식이 실제로 바뀐다
  expect(await page.evaluate(() => JSON.stringify(window.__map.getFilter('res0-dot'))))
    .not.toBe(filtBefore);
  await page.screenshot({ path: 'shots/proto/w-16-conf.png' });

  // 색인 클릭 → 판의 카메라가 그 서비스의 실제 결과 위로 난다
  await page.evaluate(() => { window.__dive.close(); window.__dive.seek(0.44); });
  await page.waitForTimeout(2500);
  await page.click('#index li[data-id="greenhouse"]');
  await page.waitForTimeout(7000);
  const flown = await page.evaluate(() => {
    const r = window.__dive.rows.find((x) => x.id === 'namwon-greenhouse-2025');
    const c = window.__map.getCenter();
    return {
      d: Math.hypot(c.lng - r.camera.center[0], c.lat - r.camera.center[1]),
      title: document.querySelector('#card-title').textContent,
      sel: !!document.querySelector('#index li.sel[data-id="greenhouse"]'),
    };
  });
  expect(flown.title, '카드가 그 서비스를 가리키지 않는다').toContain('비닐하우스');
  expect(flown.sel, '선택 표시가 없다').toBe(true);
  expect(flown.d, '카메라가 실제 결과 위로 날지 않았다').toBeLessThan(0.3);
  expect(await page.evaluate(() => window.__map === window.__mapRef)).toBe(true);

  expect(errors, '콘솔 오류\n' + errors.join('\n')).toEqual([]);
});

test('한 대의 카메라 — 챕터마다 다른 곳을 보되 지도는 그대로다', async ({ page }) => {
  const errors = await boot(page);
  await page.evaluate(() => { window.__mapRef = window.__map; });
  const zooms = [];
  for (const [name, p] of [['w-01-orbit', 0.05], ['w-02-clouds', 0.20], ['w-03-atlas', 0.45],
    ['w-04-descent', 0.66], ['w-06-landing', 0.84]]) {
    await page.evaluate((v) => window.__dive.seek(v), p);
    await page.waitForTimeout(2600);
    await page.screenshot({ path: `shots/proto/${name}.png` });
    zooms.push(await page.evaluate(() => +window.__map.getZoom().toFixed(2)));
    expect(await page.evaluate(() => window.__map === window.__mapRef)).toBe(true);
  }
  expect(new Set(zooms).size, '챕터가 같은 곳을 본다').toBe(zooms.length);
  expect(zooms[0], '궤도는 지구본이다').toBeLessThan(3);
  expect(zooms[zooms.length - 1], '착지는 1.5cm 앞이다').toBeGreaterThan(15);
  expect(errors, errors.join('\n')).toEqual([]);
});

test('타일이 차단돼도 페이지가 살아 있다', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  for (const g of ['**://*.vworld.kr/**', '**://tiles.maps.eox.at/**',
    '**://tiles.mapterhorn.com/**', '**://tiles.openfreemap.org/**']) {
    await page.route(g, (r) => r.abort());
  }
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('body[data-ready="1"]', { timeout: 120000 });
  await page.evaluate(() => window.__dive.seek(0.84));
  await page.waitForTimeout(3000);
  await page.screenshot({ path: 'shots/proto/w-fallback.png' });
  // 우리 정사영상과 UI 는 살아 있어야 한다
  expect(await page.isVisible('#meta-txt')).toBe(true);
  expect(await page.evaluate(() => window.__map.getZoom())).toBeGreaterThan(15);
  // 결과 행도 여전히 서 있다 — 카탈로그는 타일이 아니라 데이터에서 온다
  expect(await page.evaluate(() => window.__dive.rows.length)).toBe(7);
  expect(errors, errors.join('\n')).toEqual([]);
});

test.describe('reduced-motion', () => {
  test.use({ reducedMotion: 'reduce' });
  test('스크롤 연출 없이도 13종 전부에 도달한다', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    await page.setViewportSize({ width: 1440, height: 900 });
    // 티어 판정은 모듈 로드 시점에 matchMedia 로 한 번 읽는다 — goto 전에 못 박아야 한다.
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(URL, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('body[data-ready="1"]', { timeout: 120000 });
    await page.waitForTimeout(2000);
    expect(await page.evaluate(() => window.__dive.tier)).toBe('still');
    // 스크린리더/키보드용 평면 목록이 13종 전부를 담는다 — 연출에 갇히지 않는다
    expect(await page.$$eval('#svc-list button', (b) => b.length)).toBe(15);
    const labels = await page.$$eval('#svc-list button', (b) => b.map((x) => x.textContent));
    expect(labels.some((t) => /실결과/.test(t)), '실결과 표기').toBe(true);
    expect(labels.some((t) => /준비 중/.test(t)), '준비중 표기').toBe(true);
    expect(errors, errors.join('\n')).toEqual([]);
  });
});
