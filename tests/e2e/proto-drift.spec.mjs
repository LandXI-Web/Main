import { test, expect } from '@playwright/test';

// 표류 예측 지도 + 광주전남 해양쓰레기 두 배포본
//   landxi/proto/map-drift.html · drift-map.js · drift-core.js · drift.css
//   landxi/proto/portal-dp-gj-marine-25.html(2025 운영) · portal-dp-gj-marine-27.html(2027 고도화)
//   계약 landxi/assets/data/sim.js(표류체 패치 표준 · 모의 속도장) · views.js(요구 화면 선언)
//   법전 design/system.md — 라운드 0 · 그림자 0 · 그라디언트 0 · 바닥 14px · 채운 파란 버튼 0
//
// 이 스펙이 지키는 가장 중요한 것:
//   **모의 속도장에서 나온 상륙 구간 비율이 '예측'이나 '수거 계획 근거'로 보이지 않는가.**
//   숫자가 맞는지가 아니라 그 숫자의 출처가 화면에 적혀 있는지를 본다.

const DRIFT = 'proto/map-drift.html';
const P25 = 'proto/portal-dp-gj-marine-25.html';
const P27 = 'proto/portal-dp-gj-marine-27.html';
const NETWORK = /Failed to load resource|net::ERR|ERR_|status of 40|status of 50|WebGL|Unable to (?:parse|decode)|AbortError/i;

/** 6개 해상도 — 발주자 화면(1996×745)이 가장 낮다. 여기서 맞으면 900 에서도 맞는다. */
const VPS = [
  { width: 1280, height: 720 }, { width: 1366, height: 768 }, { width: 1600, height: 900 },
  { width: 1920, height: 1080 }, { width: 1996, height: 745 }, { width: 2560, height: 1440 },
];

function watch(page) {
  const errs = [];
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !NETWORK.test(m.text())) errs.push('console: ' + m.text()); });
  return errs;
}

async function boot(page, url) {
  await page.addInitScript(() => localStorage.setItem('lx_logged_in', '1'));
  await page.goto(url);
  await page.waitForFunction(() => document.documentElement.dataset.shell === 'ready');
  return page;
}
const driftReady = (page) => page.waitForFunction(
  () => document.querySelectorAll('.df-eta-r').length > 0 || document.querySelector('#df-eta .k'),
  null, { timeout: 20000 });

/* ══ 1. 지도가 실제로 뜬다 ═════════════════════════════════════════════ */
test.describe('표류 예측 지도 — 지도와 그림', () => {
  test('MapLibre 캔버스가 서고 우리 캔버스에 유선·입자가 그려진다', async ({ page }) => {
    const errs = watch(page);
    await boot(page, DRIFT);
    await expect(page.locator('#df-gl canvas.maplibregl-canvas')).toBeVisible();
    const gl = await page.locator('#df-gl canvas.maplibregl-canvas').boundingBox();
    expect(gl.width).toBeGreaterThan(300);
    expect(gl.height).toBeGreaterThan(200);

    // 겹쳐 그리는 2D 캔버스 — 실제로 칠해진 화소가 있어야 한다(빈 껍데기 금지).
    // 그리기는 지도 style 이 선 뒤에 시작하므로 시간을 정해 두고 기다린다.
    const count = () => {
      const c = document.getElementById('df-fx');
      if (!c || !c.width) return 0;
      const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      let n = 0;
      for (let i = 3; i < d.length; i += 4 * 13) if (d[i] > 8) n++;
      return n;
    };
    await page.waitForFunction(count, null, { timeout: 25000 });
    expect(await page.evaluate(count)).toBeGreaterThan(20);
    expect(errs).toEqual([]);
  });

  test('레이어 다섯이 켜지고 꺼진다', async ({ page }) => {
    await boot(page, DRIFT);
    const btns = page.locator('.df-lay button');
    await expect(btns).toHaveCount(5);
    const track = page.locator('.df-lay button[data-lay="track"]');
    await expect(track).toHaveAttribute('aria-pressed', 'false');
    await track.click();
    await expect(track).toHaveAttribute('aria-pressed', 'true');
  });
});

/* ══ 2. 재생 · 시간 축 ═════════════════════════════════════════════════ */
test.describe('표류 예측 지도 — 재생과 시간 축', () => {
  test('슬라이더를 옮기면 예보 시각과 경과가 같이 바뀐다', async ({ page }) => {
    await boot(page, DRIFT);
    await driftReady(page);
    const now0 = await page.locator('#df-now').innerText();
    expect(await page.locator('#df-elapsed').innerText()).toContain('+0 h');
    const max = await page.locator('#df-range').getAttribute('max');
    expect(Number(max)).toBeGreaterThan(20);                 // 10일 · 3시간 = 80 구간
    await page.locator('#df-range').fill(String(Math.floor(Number(max) / 2)));
    await expect(page.locator('#df-now')).not.toHaveText(now0);
    expect(await page.locator('#df-elapsed').innerText()).not.toContain('+0 h');
  });

  test('재생 버튼이 정지로 바뀌고 시간이 흐른다', async ({ page }) => {
    await boot(page, DRIFT);
    await driftReady(page);
    const play = page.locator('#df-play');
    await expect(play).toHaveAttribute('aria-label', '재생');
    const before = await page.locator('#df-range').inputValue();
    await play.click();
    await expect(play).toHaveAttribute('aria-label', '정지');
    await page.waitForFunction((v) => document.getElementById('df-range').value !== v, before, { timeout: 8000 });
    await play.click();
    await expect(play).toHaveAttribute('aria-label', '재생');
  });

  test('재생 속도 1× · 3× · 8× 가 하나만 켜진다', async ({ page }) => {
    await boot(page, DRIFT);
    await page.locator('.df-speed button[data-sp="8"]').click();
    await expect(page.locator('.df-speed button[data-sp="8"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.df-speed button[data-sp="1"]')).toHaveAttribute('aria-pressed', 'false');
  });
});

/* ══ 3. 상륙 구간 표 ═══════════════════════════════════════════════════ */
test.describe('표류 예측 지도 — 상륙 구간', () => {
  test('구간마다 비율 · 첫 도달 · 절반 도달 · 입자 수가 있다', async ({ page }) => {
    await boot(page, DRIFT);
    await driftReady(page);
    const rows = page.locator('.df-eta-r');
    expect(await rows.count()).toBeGreaterThan(0);
    const first = rows.first();
    await expect(first.locator('.df-eta-n')).not.toBeEmpty();
    await expect(first.locator('.df-eta-v')).toContainText('%');
    const t = await first.locator('.df-eta-t').innerText();
    expect(t).toMatch(/첫 도달/);
    expect(t).toMatch(/절반/);
    expect(t).toMatch(/입자/);
  });

  test('닿지 않은 구간도 지우지 않고 적는다', async ({ page }) => {
    await boot(page, DRIFT);
    await driftReady(page);
    // COAST 6 구간 가운데 예보 안에 도달이 없는 구간이 있으면 그 사실이 화면에 있어야 한다
    const shown = await page.locator('.df-eta-r').count();
    if (shown < 6) await expect(page.locator('.df-none')).toContainText('도달 입자가 없는 구간');
  });

  test('구간을 누르면 지도가 그리로 간다', async ({ page }) => {
    await boot(page, DRIFT);
    await driftReady(page);
    const row = page.locator('.df-eta-r').first();
    await row.click();
    await expect(row).toHaveAttribute('aria-pressed', 'true');
  });
});

/* ══ 4. 모의 표기 — 이 스펙의 핵심 ═════════════════════════════════════ */
test.describe('모의 표기 — 지어낸 값을 예측으로 내걸지 않는다', () => {
  test('지도 위 경고에 모의 · 예측 아님 · 손으로 맞춘 계수가 모두 적혀 있다', async ({ page }) => {
    await boot(page, DRIFT);
    const mock = page.locator('.df-mock--warn');
    await expect(mock).toBeVisible();
    const t = await mock.innerText();
    expect(t).toContain('모의 속도장');
    expect(t).toContain('예측 아님');
    expect(t).toMatch(/손으로 맞춘/);
  });

  test('오른쪽 판 머리에 모의 딱지가 붙어 있다', async ({ page }) => {
    await boot(page, DRIFT);
    await expect(page.locator('.df-hd .df-tag')).toHaveText('모의');
  });

  test('상륙 구간 비율 옆에 수거 계획 근거로 쓰지 말라는 말이 있다', async ({ page }) => {
    await boot(page, DRIFT);
    await driftReady(page);
    const pane = page.locator('.df-p[data-p="eta"]');
    await expect(pane).toContainText('수거 계획의 근거로 쓰지 않는다');
    await expect(pane.locator('.df-warn')).toContainText('예측이 아니다');
  });

  test('밖에서 받을 것에 해류 수치모델이 있고, 도는 것은 도착 예측뿐이라고 적혀 있다', async ({ page }) => {
    await boot(page, DRIFT);
    await page.locator('.df-tabs button[data-p="need"]').click();
    const pane = page.locator('.df-p[data-p="need"]');
    await expect(pane).toContainText('해류 수치모델 산출');
    await expect(pane.locator('.st2[data-s="run"]')).toHaveCount(1);        // 도는 것 하나
    expect(await pane.locator('.st2[data-s="wait"]').count()).toBeGreaterThan(0);
  });

  test('예측 검증은 값이 없으면 비워 둔다 — 지어내지 않는다', async ({ page }) => {
    await boot(page, DRIFT);
    await page.locator('.df-tabs button[data-p="verify"]').click();
    await expect(page.locator('.df-p[data-p="verify"]')).toContainText('검증할 후속 관측이 아직 없다');
    await expect(page.locator('.df-p[data-p="verify"] .df-foot')).toContainText('0건');
  });
});

/* ══ 5. 오른쪽 판 탭 · 한 화면 ═════════════════════════════════════════ */
test.describe('한 화면 — 스크롤로 내용을 숨기지 않는다', () => {
  test('탭 다섯이 돌고 판마다 내용이 다르다', async ({ page }) => {
    await boot(page, DRIFT);
    const tabs = page.locator('.df-tabs button');
    await expect(tabs).toHaveCount(5);
    for (const key of ['patch', 'role', 'need', 'verify', 'eta']) {
      await page.locator(`.df-tabs button[data-p="${key}"]`).click();
      await expect(page.locator(`.df-p[data-p="${key}"]`)).toBeVisible();
      expect(await page.locator('.df-p:visible').count()).toBe(1);
    }
  });

  for (const vp of VPS) {
    test(`${vp.width}×${vp.height} — 페이지 스크롤 0 · 판 안쪽 숨김 0`, async ({ page }) => {
      await page.setViewportSize(vp);
      await boot(page, DRIFT);
      await driftReady(page);
      for (const key of ['eta', 'patch', 'role', 'need', 'verify']) {
        await page.locator(`.df-tabs button[data-p="${key}"]`).click();
        const bad = await page.evaluate(() => {
          const out = [];
          if (document.documentElement.scrollHeight - innerHeight > 4) out.push('페이지 스크롤');
          const p = [...document.querySelectorAll('.df-p')].find((x) => !x.hidden);
          if (p && p.scrollHeight - p.clientHeight > 1) out.push('판 넘침 ' + (p.scrollHeight - p.clientHeight));
          for (const e of document.querySelectorAll('#main *')) {
            const c = getComputedStyle(e);
            if (/auto|scroll/.test(c.overflowY) && e.scrollHeight - e.clientHeight > 4 && e.clientHeight > 40)
              out.push('숨은 스크롤 ' + e.className);
          }
          return out;
        });
        expect(bad, `${vp.width}×${vp.height} · ${key}`).toEqual([]);
      }
    });
  }
});

/* ══ 6. 27년 배포본 → 표류 예측 지도로 이어진다 ════════════════════════ */
test.describe('배포본 작업공간과의 연결', () => {
  test('27년 지도 탭에서 표류 예측 지도로 넘어가고 되돌아올 길이 있다', async ({ page }) => {
    await boot(page, P27);
    await page.locator('.pt-tabs button[data-tab="map"]').click();
    const open = page.locator('.gj-run a', { hasText: '표류 예측 지도 열기' });
    await expect(open).toBeVisible();
    await open.click();
    await page.waitForURL(/map-drift\.html\?svc=dp-gj-marine-27/);
    await page.waitForFunction(() => document.documentElement.dataset.shell === 'ready');
    // 들어온 길이 빵부스러기에 남는다
    await expect(page.locator('#page-crumbs, .crumbs, nav[aria-label="위치"]').first())
      .toContainText('해양쓰레기 실태조사 서비스');
  });

  test('27년 진입 블록은 모의라고 먼저 말한다', async ({ page }) => {
    await boot(page, P27);
    await page.locator('.pt-tabs button[data-tab="map"]').click();
    const run = page.locator('.gj-run');
    await expect(run.locator('.gj-tag')).toHaveText('모의');
    await expect(run.locator('.mock')).toContainText('수거 계획의 근거로 쓰지 않는다');
  });

  test('27년은 앞 배포본 실적을 제 실적처럼 내걸지 않는다', async ({ page }) => {
    await boot(page, P27);
    const dash = await page.locator('.pt-pane[data-tab="dash"]').innerText();
    expect(dash).toContain('사업 시작 전');
    expect(dash).not.toMatch(/38,057/);                      // 모델 누적치를 이 배포본 숫자로 쓰지 않는다
    await expect(page.locator('.pt-pane[data-tab="dash"] .gj-dl')).toContainText('예정');
  });

  test('27년 요구 화면 넷은 무엇이 없어 못 서는지 적혀 있다', async ({ page }) => {
    await boot(page, P27);
    const rows = page.locator('.pt-pane[data-tab="dash"] .gj-tb tbody tr');
    expect(await rows.count()).toBeGreaterThanOrEqual(4);
    await expect(page.locator('.pt-pane[data-tab="dash"]')).toContainText('해류 수치모델 산출');
  });
});

/* ══ 7. 25년 배포본 — 실결과가 실제로 선다 ═════════════════════════════ */
test.describe('2025 운영 배포본', () => {
  test('머리 숫자와 결과 목록이 결과 대장의 실값과 같다', async ({ page }) => {
    const errs = watch(page);
    await boot(page, P25);
    const dash = await page.locator('.pt-pane[data-tab="dash"]').innerText();
    expect(dash).toContain('3,938');                          // 1,860 + 2,078
    await page.locator('.pt-tabs button[data-tab="result"]').click();
    const tbl = page.locator('.pt-pane[data-tab="result"] .gj-tb');
    await expect(tbl).toContainText('여수시 해양쓰레기 조사(항공)');
    await expect(tbl).toContainText('1,860');
    await expect(tbl).toContainText('2,078');
    expect(errs).toEqual([]);
  });

  test('지도 탭에 실결과 격자 지도가 뜬다', async ({ page }) => {
    await boot(page, P25);
    await page.locator('.pt-tabs button[data-tab="map"]').click();
    await expect(page.locator('#gj-map canvas.maplibregl-canvas')).toBeVisible({ timeout: 20000 });
    const b = await page.locator('#gj-map canvas.maplibregl-canvas').boundingBox();
    expect(b.width).toBeGreaterThan(200);
  });

  test('해안선 구간화는 기관 몫이라고 화면이 말한다', async ({ page }) => {
    await boot(page, P25);
    await page.locator('.pt-tabs button[data-tab="map"]').click();
    await expect(page.locator('[data-slot="grade"]')).toContainText('기관 몫');
  });

  test('없는 것은 없다고 적는다 — 읍·면·동 집계', async ({ page }) => {
    await boot(page, P25);
    await page.locator('.pt-tabs button[data-tab="stats"]').click();
    await expect(page.locator('[data-slot="stats"]')).toContainText('읍·면·동 값이 들어 있지 않다');
  });

  for (const vp of VPS) {
    test(`${vp.width}×${vp.height} — 두 배포본 모두 탭마다 한 화면`, async ({ page }) => {
      await page.setViewportSize(vp);
      for (const url of [P25, P27]) {
        await boot(page, url);
        for (const tab of ['dash', 'result', 'map', 'stats', 'report']) {
          await page.locator(`.pt-tabs button[data-tab="${tab}"]`).click();
          await page.waitForTimeout(120);
          const over = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight);
          expect(over, `${url} ${vp.width}×${vp.height} ${tab}`).toBeLessThanOrEqual(4);
        }
      }
    });
  }
});

/* ══ 8. 법전 · 접근성 ══════════════════════════════════════════════════ */
test.describe('법전 · 접근성', () => {
  const HYGIENE = () => {
    const bad = [];
    for (const el of document.querySelectorAll('#main *, #rail *, #mast *')) {
      if (el.closest('.maplibregl-map')) continue;            // 지도 라이브러리 내부는 우리 법전 밖이다
      const s = getComputedStyle(el);
      if (s.display === 'none') continue;
      const r = s.borderRadius.replace(/[0px %]/g, '');
      if (r) bad.push('radius ' + el.className + ' ' + s.borderRadius);
      if (s.boxShadow !== 'none') bad.push('shadow ' + el.className);
      if (/gradient/.test(s.backgroundImage)) bad.push('gradient ' + el.className);
      if (s.backdropFilter && s.backdropFilter !== 'none') bad.push('backdrop ' + el.className);
      const fs = parseFloat(s.fontSize);
      if (el.textContent.trim() && el.children.length === 0 && fs < 14) bad.push('font ' + fs + ' ' + el.className);
      if (s.backgroundColor === 'rgb(0, 109, 247)' && el.tagName === 'BUTTON') bad.push('blue-fill ' + el.className);
    }
    return bad.slice(0, 12);
  };

  for (const [name, url] of [['표류 예측 지도', DRIFT], ['포털 25', P25], ['포털 27', P27]]) {
    test(`라운드 0 · 그림자 0 · 그라디언트 0 · 14px 바닥 · 채운 파란 버튼 0 — ${name}`, async ({ page }) => {
      await boot(page, url);
      await page.waitForTimeout(800);
      expect(await page.evaluate(HYGIENE)).toEqual([]);
    });
  }

  test('조작 요소에 읽을 이름이 있다 — 표류 예측 지도', async ({ page }) => {
    await boot(page, DRIFT);
    const unnamed = await page.evaluate(() => [...document.querySelectorAll('#main button, #main a[href]')]
      .filter((e) => e.getBoundingClientRect().width > 0 && !e.textContent.trim()
        && !e.getAttribute('aria-label') && !e.getAttribute('title')).length);
    expect(unnamed).toBe(0);
  });

  test('개발용 URL 을 화면에 적지 않는다', async ({ page }) => {
    for (const url of [DRIFT, P25, P27]) {
      await boot(page, url);
      const txt = await page.locator('#main').innerText();
      expect(txt, url).not.toMatch(/https?:\/\/|localhost|127\.0\.0\.1|\.html\b/);
    }
  });
});
