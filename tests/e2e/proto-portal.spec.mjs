import { test, expect } from '@playwright/test';

// 지자체 포털 — landxi/proto/portal.html(서비스 카드 홈) + portal-<배포본>.html(작업공간 5탭)
//  사양  docs/superpowers/specs/2026-09-20-{two-tier,card-architecture,production}.md
//  데이터 assets/data/{cards,portal,studio,registry,brand}.js (정본) · results·services·imagery·change·crops (실측)
//  생성  tools/gen/portal-gen.mjs — 화면은 손으로 짜지 않는다(R9). 이 스펙은 **찍힌 결과**를 검사한다.
//  실행  PORT=4205 npx playwright test tests/e2e/proto-portal.spec.mjs --workers=1
//
// 이 스펙이 지키려는 네 가지
//   1) 이원화 경계 — 기관 레일에 LX 전용 메뉴(데이터 관리·프로젝트·카드 발행)가 없다
//   2) kind 선언이 장치를 켠다 — 화면은 카드 이름을 모르므로, 선언과 DOM 이 반드시 일치한다
//   3) 값을 지어내지 않는다 — 실측 없는 서비스에는 숫자가 아니라 **이유**가 서 있다
//   4) 한 화면에서 끝난다 — 페이지 스크롤도, 판 안쪽 스크롤도 없다(모니터 6종)
const HOME = 'proto/portal.html';
const NW = ['dp-nw-living-23', 'dp-nw-farm-25', 'dp-nw-change', 'dp-nw-road-26', 'dp-nw-crowd-27'];
const pageOf = (id) => `proto/portal-${id}.html`;

/* 지도·타일·폰트 등 바깥 자원 오류는 화면의 잘못이 아니다(proto-analysis.spec.mjs 와 같은 규칙). */
const NETWORK = /Failed to load resource|net::ERR|ERR_|status of 40|status of 50|tile|WebGL|GPU stall|maplibre|unpkg/i;

function watch(page) {
  const errs = [];
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !NETWORK.test(m.text())) errs.push('console: ' + m.text()); });
  return errs;
}
async function boot(page, url = HOME) {
  await page.addInitScript(() => localStorage.setItem('lx_logged_in', '1'));
  await page.goto(url);
  await page.waitForFunction(() => document.documentElement.dataset.shell === 'ready');
  await page.waitForTimeout(300);
}
/** 데이터 정본을 화면 안에서 그대로 읽는다 — 기대값을 스펙에 베껴 적지 않는다. */
const data = (page, fn, arg) => page.evaluate(fn, arg);

/* 법전 자동 검사 — proto-shell.spec.mjs · proto-analysis.spec.mjs 와 같은 것을 그대로 쓴다. */
const lawCheck = () => {
  const out = [];
  const name = (e) => `${e.tagName.toLowerCase()}${e.id ? '#' + e.id : ''}${typeof e.className === 'string' && e.className ? '.' + e.className.trim().split(/\s+/).join('.') : ''}`;
  for (const e of document.body.querySelectorAll('*')) {
    if (e.closest('svg') && e.tagName.toLowerCase() !== 'svg') continue;
    if (e.closest('.maplibregl-map')) continue;                       // 지도 라이브러리 내부는 우리 마크업이 아니다
    for (const pseudo of [null, '::before', '::after']) {
      const s = getComputedStyle(e, pseudo);
      if (pseudo && (s.content === 'none' || s.content === 'normal')) continue;
      const who = name(e) + (pseudo || '');
      if (['borderTopLeftRadius', 'borderTopRightRadius', 'borderBottomLeftRadius', 'borderBottomRightRadius'].some((k) => parseFloat(s[k]) > 0)) out.push(`radius ${who}`);
      if (s.boxShadow !== 'none') out.push(`shadow ${who}`);
      if (/gradient/.test(s.backgroundImage)) out.push(`gradient ${who}`);
      if (s.backdropFilter && s.backdropFilter !== 'none') out.push(`backdrop ${who}`);
      if (s.textShadow !== 'none') out.push(`text-shadow ${who}`);
      if (/^(button|a)$/i.test(e.tagName) && !pseudo && s.backgroundColor === 'rgb(0, 109, 247)') out.push(`blue-fill ${who}`);
      if (!pseudo && (s.backgroundColor === 'rgb(209, 53, 43)' || (s.borderTopColor === 'rgb(209, 53, 43)' && parseFloat(s.borderTopWidth) > 0 && !e.matches('[aria-invalid="true"]')))) out.push(`warn-fill/border ${who}`);
    }
    const hasText = [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    const field = /^(input|select|textarea)$/i.test(e.tagName) && e.type !== 'checkbox' && e.type !== 'radio' && e.type !== 'file';
    if ((hasText || field) && parseFloat(getComputedStyle(e).fontSize) < 14) out.push(`font<14 ${name(e)} ${getComputedStyle(e).fontSize}`);
  }
  return out;
};

/** 한 화면인가 — 페이지가 넘치지도, 판 안쪽이 숨기지도 않는가(점검기 audit.mjs 와 같은 기준). */
const fitsCheck = () => {
  const over = document.documentElement.scrollHeight - innerHeight;
  const inner = [...document.querySelectorAll('#main *')].filter((e) => {
    const c = getComputedStyle(e);
    return /auto|scroll/.test(c.overflowY) && e.scrollHeight - e.clientHeight > 40 && e.clientHeight > 80;
  }).map((e) => e.className);
  return { over, inner };
};

/* ══ 관문 · 이원화 경계 ═══════════════════════════════════════════════════ */
test.describe('관문 · 이원화 경계', () => {
  /* 기관 화면은 **그 기관의 문**으로 보낸다 — LX 로그인이 아니다(2026-09-21).
     발주자: "지자체에서는 나만의 AI 시스템인 것처럼 보여야 한다." 남원시 화면을 보러 왔는데
     LX 로그인으로 튕기면 남의 집 문간이다. 관문(shell-gate.js)이 data-login 을 보고 고른다. */
  test('로그인 전이면 그 기관의 문으로 보낸다 — LX 로그인이 아니다', async ({ page }) => {
    await page.goto(HOME);
    await page.waitForURL(/portal-login-namwon\.html/);
    expect(new URL(page.url()).searchParams.get('next')).toBe('portal.html');
  });

  test('기관 레일에는 LX 전용 메뉴가 없다 — TENANTS.menus 가 허락한 것만', async ({ page }) => {
    const errs = watch(page);
    await boot(page);
    const allow = await data(page, async () => {
      const p = await import('../assets/data/portal.js');
      return [...p.tenantById('namwon').menus, 'my'];
    });
    const got = await page.$$eval('#rail .rail-i[data-menu]', (a) => a.map((x) => x.dataset.menu));
    expect(got.length).toBeGreaterThan(0);
    for (const m of got) expect(allow, `레일 ${m} 은 허락된 메뉴가 아니다`).toContain(m);
    // 판독은 LX 몫이다 — 이 셋이 기관 레일에 뜨면 경계가 무너진다
    for (const lx of ['dataset', 'project', 'publish', 'admin']) expect(got).not.toContain(lx);
    expect(errs).toEqual([]);
  });

  test('간판은 기관 CI 로 바뀐다 — 골격은 LX 것, 마크·상징색만 기관 것', async ({ page }) => {
    await boot(page);
    const th = await data(page, async () => (await import('../assets/data/brand.js')).themeOf('namwon'));
    await expect(page.locator('#rail-mark')).toHaveText(th.mark.split('/').join(''));
    await expect(page).toHaveTitle(new RegExp(th.short));
    const accent = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim());
    expect(accent.toUpperCase()).toBe(th.accent.toUpperCase());
  });
});

/* ══ 1. 서비스 카드 홈 ════════════════════════════════════════════════════ */
test.describe('서비스 카드 홈 — 배포본 한 줄 = 카드 한 장', () => {
  test('남원 배포본 5장이 그대로 선다(발행 카드가 아니라 배포본이다)', async ({ page }) => {
    const errs = watch(page);
    await boot(page);
    const want = await data(page, async () => {
      const p = await import('../assets/data/portal.js');
      return p.serviceCards('namwon').map((c) => ({ id: c.id, name: c.name, year: c.year, status: c.status }));
    });
    expect(want.map((w) => w.id).sort()).toEqual([...NW].sort());
    // 홈은 격자(.pt-grid)가 아니라 **덱(.pt-deck)** 이다 — 칸이 아니라 낱장이 선다(2026-09-21).
    await expect(page.locator('.pt-deck .pt-c')).toHaveCount(want.length);
    for (const w of want) {
      const card = page.locator(`.pt-c[href="portal-${w.id}.html"]`);
      await expect(card).toHaveCount(1);
      await expect(card).toContainText(w.name);
      await expect(card).toContainText(String(w.year));
      await expect(card).toContainText(w.status);
      await expect(card.locator('.pt-c-open')).toHaveCount(1);          // 눌러서 편다는 말이 카드 위에 있다
    }
    expect(errs).toEqual([]);
  });

  /* 낱장인가 — 카드가 세로로 길고, 테두리를 나눠 쓰지 않고 사이가 떠 있어야 한다.
     발주자: "타로카드 선택처럼 … 클릭하면 새로운 서비스 화면이 펼쳐지는거였어." */
  test('낱장으로 선다 — 세로로 길고, 사이가 떠 있고, 고르면 나머지가 물러난다', async ({ page }) => {
    await boot(page);
    const box = await page.locator('.pt-c').first().boundingBox();
    expect(box.width / box.height).toBeLessThan(0.9);                    // 칸이 아니라 세로 카드
    const a = await page.locator('.pt-deck > li').nth(0).boundingBox();
    const b = await page.locator('.pt-deck > li').nth(1).boundingBox();
    expect(b.x - (a.x + a.width)).toBeGreaterThan(4);                    // 붙어 있지 않다
    await page.locator('.pt-c').first().hover();
    // 물러나는 데 200ms 걸린다 — 곧바로 재면 아직 1이다(전환 중).
    await page.waitForTimeout(400);
    const dim = await page.locator('.pt-c').nth(1).evaluate((e) => +getComputedStyle(e).opacity);
    expect(dim).toBeLessThan(1);                                         // 고르는 중 = 나머지는 물러난다
  });

  test('카드를 고르면 그 서비스 화면이 펼쳐진다 — 펴는 판이 서고 작업공간에 닿는다', async ({ page }) => {
    await boot(page);
    await page.locator('.pt-c[href="portal-dp-nw-farm-25.html"]').click();
    await expect(page.locator('.pt-veil')).toHaveCount(1);               // 고른 자리에서 판이 자란다
    await expect(page.locator('.pt-deck')).toHaveAttribute('data-open', '');
    await page.waitForURL(/portal-dp-nw-farm-25\.html/);
    await expect(page.locator('.pt-work')).toHaveCount(1);
  });

  test('실측은 **제 단위 그대로** 선다 — 필지와 동을 더하지 않는다', async ({ page }) => {
    await boot(page);
    const farm = await data(page, async () => (await import('../assets/data/portal.js')).measuresOf('dp-nw-farm-25'));
    expect(farm.length).toBeGreaterThan(1);
    expect(new Set(farm.map((m) => m.unit)).size).toBeGreaterThan(1);   // 단위가 실제로 다르다
    const card = page.locator('.pt-c[href="portal-dp-nw-farm-25.html"]');
    for (const m of farm) await expect(card).toContainText(`${m.value.toLocaleString('ko-KR')}`);
    // 합계(2,098 + 9,664 = 11,762)는 아무 뜻이 없으므로 화면 어디에도 없어야 한다
    const sum = farm.reduce((a, m) => a + m.value, 0).toLocaleString('ko-KR');
    await expect(page.locator('#main')).not.toContainText(sum);
  });

  test('실측이 없는 서비스에는 숫자가 아니라 **이유**가 선다', async ({ page }) => {
    await boot(page);
    const gap = await data(page, async () => {
      const p = await import('../assets/data/portal.js');
      return p.serviceCards('namwon').find((c) => c.id === 'dp-nw-crowd-27').gap;
    });
    expect(gap).toBeTruthy();
    await expect(page.locator('.pt-c[href="portal-dp-nw-crowd-27.html"]')).toContainText(gap);
  });

  test('카드를 누르면 그 서비스의 작업공간이 펼쳐진다', async ({ page }) => {
    await boot(page);
    await page.locator('.pt-c[href="portal-dp-nw-farm-25.html"]').click();
    await page.waitForURL(/portal-dp-nw-farm-25\.html/);
    await page.waitForFunction(() => document.documentElement.dataset.shell === 'ready');
    await expect(page.locator('.pt-tabs button')).toHaveCount(5);
    await expect(page.locator('h1')).toHaveText('영농관리 행정서비스');
  });
});

/* ══ 2. 작업공간 5탭 ══════════════════════════════════════════════════════ */
test.describe('작업공간 — 현황 · 분석 결과 · 지도 · 통계 · 보고서', () => {
  for (const id of NW) {
    test(`${id} — 5탭이 서고 누르면 그 판만 켜진다`, async ({ page }) => {
      const errs = watch(page);
      await boot(page, pageOf(id));
      const tabs = await data(page, async (d) => {
        const p = await import('../assets/data/portal.js');
        return p.portalSpec(d).tabs.map((t) => ({ id: t.id, name: t.name }));
      }, id);
      expect(tabs).toHaveLength(5);
      const btns = page.locator('.pt-tabs button');
      await expect(btns).toHaveCount(5);
      for (const [i, t] of tabs.entries()) {
        await expect(btns.nth(i)).toHaveText(t.name);          // 기관 요구 label 연산도 여기서 검증된다
        await btns.nth(i).click();
        await page.waitForTimeout(250);
        await expect(page.locator(`.pt-pane[data-tab="${t.id}"]`)).toBeVisible();
        await expect(page.locator('.pt-pane:not([hidden])')).toHaveCount(1);
      }
      expect(errs).toEqual([]);
    });
  }

  test("기관 요구 label 이 반영된다 — 도로 안전의 '분석 결과'는 '점검 대상'", async ({ page }) => {
    await boot(page, pageOf('dp-nw-road-26'));
    const req = await data(page, async () => {
      const s = await import('../assets/data/studio.js');
      return s.requestsOf('dp-nw-road-26').find((r) => r.op === 'label' && r.state !== '접수');
    });
    expect(req).toBeTruthy();
    await expect(page.locator(`.pt-tabs button[data-tab="${req.at}"]`)).toHaveText(req.val);
  });

  test("기관 요구 add 가 반영된다 — 생활환경 현황에 추이 차트", async ({ page }) => {
    await boot(page, pageOf('dp-nw-living-23'));
    await expect(page.locator('.pt-pane[data-tab="dash"] .pt-b[data-block="chart"]')).toHaveCount(1);
    await expect(page.locator('.pt-b[data-block="chart"][data-req]')).toHaveCount(1);
  });
});

/* ══ 3. kind 선언이 장치를 켠다 ═══════════════════════════════════════════
 * 여기가 이 화면의 핵심이다. 화면은 카드 이름을 모른다 — 선언만 보고 장치를 켠다.
 * 그래서 선언과 DOM 이 어긋나면 그것은 곧 "카드 이름으로 분기한 코드"가 생겼다는 뜻이다. */
test.describe('kind 선언 → 장치', () => {
  const DEVICE = {                       // needsOf() 의 깃발 → 그 깃발이 켜는 블록
    videoPlayer: 'player', timeAxis: 'timeline', grid: 'heatmap', lineRef: 'grade', parcelRef: 'parcel',
  };

  for (const id of NW) {
    test(`${id} — 선언한 장치만 서고, 선언하지 않은 장치는 서지 않는다`, async ({ page }) => {
      await boot(page, pageOf(id));
      const needs = await data(page, async (d) => {
        const c = await import('../assets/data/cards.js');
        const dep = c.DEPLOYS.find((x) => x.id === d);
        return c.needsOf(c.cardById(dep.cardId));
      }, id);
      for (const [flag, block] of Object.entries(DEVICE)) {
        const want = needs[flag] ? 1 : 0;
        await expect(page.locator(`.pt-b[data-block="${block}"]`), `${flag} → ${block}`).toHaveCount(want);
      }
    });
  }

  test('인파관리(입력=드론 영상 · 출력=점·밀도·시계열) — 플레이어 · 타임라인 · 히트맵', async ({ page }) => {
    await boot(page, pageOf('dp-nw-crowd-27'));
    for (const b of ['player', 'timeline', 'heatmap']) await expect(page.locator(`.pt-b[data-block="${b}"]`)).toHaveCount(1);
    await expect(page.locator('.pt-b[data-block="parcel"]')).toHaveCount(0);   // 면 출력이 아니다
    // 장치는 서되 값은 없다 — 2027년 사업이라 모델이 없기 때문이고, 화면이 그 사실을 적는다
    await page.locator('.pt-tabs button[data-tab="result"]').click();
    await page.waitForTimeout(300);
    await expect(page.locator('.pt-vid')).toContainText('모델 개발 전');
    await expect(page.locator('.pt-b[data-block="player"] button[data-act="play"]')).toHaveCount(1);
    await expect(page.locator('.pt-b[data-block="timeline"] input[type="range"]')).toHaveCount(1);
    await page.locator('.pt-tabs button[data-tab="map"]').click();
    await page.waitForTimeout(300);
    await expect(page.locator('.pt-b[data-block="heatmap"] .pt-legend span')).toHaveCount(4);
    await expect(page.locator('.pt-b[data-block="heatmap"] [data-grid]')).toHaveCount(3);
  });

  test('영농관리(출력=면) — 필지 표가 서고 지적 필지(PNU)가 온전히 적힌다', async ({ page }) => {
    await boot(page, pageOf('dp-nw-farm-25'));
    await expect(page.locator('.pt-b[data-block="parcel"]')).toHaveCount(1);
    for (const b of ['player', 'heatmap', 'grade', 'timeline']) await expect(page.locator(`.pt-b[data-block="${b}"]`)).toHaveCount(0);
    await page.locator('.pt-tabs button[data-tab="map"]').click();
    // 첫 줄은 '결과를 읽는 중…' 한 칸짜리다. 진짜 줄(칸 5개)이 설 때까지 기다린다.
    await page.waitForSelector('.pt-b[data-block="parcel"] tbody tr td:nth-child(5)');
    const pnus = await page.$$eval('.pt-b[data-block="parcel"] tbody tr td:first-child', (a) => a.map((x) => x.textContent.trim()));
    expect(pnus.length).toBeGreaterThan(2);
    for (const p of pnus) expect(p).toMatch(/^\d{19}$/);          // 잘리면 19자리가 아니다
    // 쪽 수는 실측 건수에서 온다
    const n = await data(page, async () => (await import('../assets/data/results.js')).resultById('namwon-farmland-2025').stats.count);
    await expect(page.locator('.pt-b[data-block="parcel"] .pt-pager [data-role="c"]')).toContainText(n.toLocaleString('ko-KR'));
  });

  test('도로 안전(출력=구간) — 구간 등급 범례가 서고, 구간화는 기관 몫이라고 적는다', async ({ page }) => {
    await boot(page, pageOf('dp-nw-road-26'));
    await page.locator('.pt-tabs button[data-tab="map"]').click();
    await page.waitForTimeout(300);
    await expect(page.locator('.pt-b[data-block="grade"] .pt-legend span')).toHaveCount(5);
    await expect(page.locator('.pt-b[data-block="grade"]')).toContainText('노선 구간화');
    await expect(page.locator('.pt-b[data-block="grade"]')).toContainText('기관');
  });

  test('국토 변화(출력=시계열) — 시점 축이 실측 시점 쌍을 끌고 지도까지 움직인다', async ({ page }) => {
    await boot(page, pageOf('dp-nw-change'));
    const pairs = await data(page, async () => (await import('../assets/data/change.js')).CHANGE.map((c) => ({ pair: c.pair, label: c.label, n: c.stats.n })));
    await page.locator('.pt-tabs button[data-tab="result"]').click();
    await page.waitForTimeout(300);
    const rng = page.locator('.pt-b[data-block="timeline"] input[type="range"]');
    await expect(rng).toHaveAttribute('max', String(pairs.length - 1));
    await rng.fill('0');
    await page.waitForTimeout(300);
    await expect(page.locator('.pt-b[data-block="timeline"] [data-role="now"]')).toContainText(pairs[0].label);
    await expect(page.locator(`.pt-b[data-block="table"] tr[data-pair="${pairs[0].pair}"]`)).toHaveAttribute('aria-selected', 'true');
    // 학습 모델의 탐지가 아니라는 표기는 change.js 가 요구하는 것이다
    await expect(page.locator('.pt-b[data-block="table"]')).toContainText('변화 지수');
    await expect(page.locator('.pt-b[data-block="table"]')).toContainText('비지도');
  });

  test('정사영상 시점은 정사영상을 먹는 카드에만 붙는다', async ({ page }) => {
    // 인파관리는 입력이 드론 영상뿐이라 남원 정사영상 시점을 제 것처럼 달면 안 된다
    await boot(page, pageOf('dp-nw-crowd-27'));
    await page.locator('.pt-tabs button[data-tab="map"]').click();
    await page.waitForTimeout(400);
    await expect(page.locator('.pt-b[data-block="map"] [data-epoch]')).toHaveCount(0);
    await boot(page, pageOf('dp-nw-farm-25'));
    await page.locator('.pt-tabs button[data-tab="map"]').click();
    await page.waitForTimeout(400);
    expect(await page.locator('.pt-b[data-block="map"] [data-epoch]').count()).toBeGreaterThan(0);
  });
});

/* ══ 4. 기관 행정 가공 — 2층의 정체성 ════════════════════════════════════ */
test.describe("기관 행정 가공 — owner:'local' 모듈이 여기서 돈다", () => {
  for (const id of NW) {
    test(`${id} — 기관 모듈이 자리를 갖는다(LX 모듈은 오지 않는다)`, async ({ page }) => {
      await boot(page, pageOf(id));
      const { local, lx } = await data(page, async (d) => {
        const c = await import('../assets/data/cards.js');
        const dep = c.DEPLOYS.find((x) => x.id === d);
        const key = c.cardById(dep.cardId).ext;
        return { local: c.extByOwner(key, 'local').map((m) => m.name), lx: c.extByOwner(key, 'lx').map((m) => m.name) };
      }, id);
      expect(local.length).toBeGreaterThan(0);                 // 남원 5종은 모두 기관 몫이 있다
      const box = page.locator('.pt-b[data-block="ext"]');
      await expect(box).toHaveCount(1);
      for (const nm of local) await expect(box).toContainText(nm);
      // 판독(LX) 모듈은 기관 작업공간에 뜨지 않는다 — 그것은 프로젝트 화면 몫이다
      for (const nm of lx) await expect(page.locator('#main')).not.toContainText(nm);
    });
  }

  test('경계를 화면이 말한다 — LX 는 판독까지, 그 뒤는 기관', async ({ page }) => {
    await boot(page, pageOf('dp-nw-farm-25'));
    await expect(page.locator('.pt-b[data-block="ext"]')).toContainText('표준화하지 않습니다');
    await expect(page.locator('.pt-b[data-block="basis"]')).toContainText('LX');
  });

  test('보고서에 판독 책임(LX)과 행정 가공(기관)이 나뉘어 적힌다', async ({ page }) => {
    await boot(page, pageOf('dp-nw-farm-25'));
    await page.locator('.pt-tabs button[data-tab="report"]').click();
    await page.waitForTimeout(300);
    const doc = page.locator('.pt-doc');
    await expect(doc).toContainText('LX 한국국토정보공사');
    await expect(doc).toContainText('필지 대장 대조');
    const th = await data(page, async () => (await import('../assets/data/brand.js')).themeOf('namwon'));
    await expect(doc).toContainText(th.sealNote);
  });
});

/* ══ 5. 값을 지어내지 않는다 ══════════════════════════════════════════════ */
test.describe('값을 지어내지 않는다', () => {
  test('인파관리 — 머리 숫자는 `—` 이고 옆에 이유가 붙는다', async ({ page }) => {
    await boot(page, pageOf('dp-nw-crowd-27'));
    const kpi = page.locator('.pt-b[data-block="kpi"]');
    await expect(kpi.locator('.tile').first()).toContainText('—');
    await expect(kpi).toContainText('모델 개발 전');
  });

  test('필지 대장 대조 칸은 비어 있고, 무엇이 있어야 켜지는지 적는다', async ({ page }) => {
    await boot(page, pageOf('dp-nw-farm-25'));
    await page.locator('.pt-tabs button[data-tab="map"]').click();
    await page.waitForSelector('.pt-b[data-block="parcel"] tbody tr td:nth-child(5)');
    const last = await page.$$eval('.pt-b[data-block="parcel"] tbody tr td:last-child', (a) => a.map((x) => x.textContent.trim()));
    expect(new Set(last)).toEqual(new Set(['—']));               // 대조 결과를 만들어 넣지 않았다
    await expect(page.locator('.pt-b[data-block="parcel"]')).toContainText('아직 연계되지 않아');
  });

  test('화면에 개발용 URL 표기가 노출되지 않는다', async ({ page }) => {
    for (const id of NW) {
      await boot(page, pageOf(id));
      const txt = await page.locator('#main').innerText();
      expect(txt).not.toMatch(/\?(svc|status|tab)=/);
      expect(txt).not.toMatch(/\.html\?/);
    }
  });
});

/* ══ 6. 한 화면 — 모니터마다 ═════════════════════════════════════════════ */
test.describe('한 화면에서 끝난다', () => {
  const VPS = [[1280, 720], [1366, 768], [1600, 900], [1920, 1080], [1996, 745], [2560, 1440]];
  for (const [w, h] of VPS) {
    test(`${w}×${h} — 홈과 남원 5종의 5탭 모두 넘치지 않는다`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: h });
      await boot(page);
      let r = await page.evaluate(fitsCheck);
      expect(r.over, `홈 ${w}x${h}`).toBeLessThanOrEqual(4);
      expect(r.inner, `홈 ${w}x${h} 판 안쪽`).toEqual([]);
      for (const id of NW) {
        await boot(page, pageOf(id));
        for (const t of ['dash', 'result', 'map', 'stats', 'report']) {
          await page.locator(`.pt-tabs button[data-tab="${t}"]`).click();
          await page.waitForTimeout(220);
          r = await page.evaluate(fitsCheck);
          expect(r.over, `${id}/${t} ${w}x${h}`).toBeLessThanOrEqual(4);
          expect(r.inner, `${id}/${t} ${w}x${h} 판 안쪽`).toEqual([]);
        }
      }
    });
  }

  test('모니터가 커지면 표가 더 많은 줄을 보여 준다(지우는 게 아니라 쪽으로 넘긴다)', async ({ page }) => {
    const rows = async (h) => {
      await page.setViewportSize({ width: 1600, height: h });
      await boot(page, pageOf('dp-nw-farm-25'));
      await page.locator('.pt-tabs button[data-tab="stats"]').click();
      await page.waitForSelector('.pt-b[data-block="stats"] tbody tr');
      return page.locator('.pt-b[data-block="stats"] tbody tr').count();
    };
    const few = await rows(720);
    const many = await rows(1440);
    expect(many).toBeGreaterThan(few);
  });
});

/* ══ 7. 법전 ══════════════════════════════════════════════════════════════ */
test.describe('법전 — 라운드 0 · 그림자 0 · 바닥 14px · 채운 파란 버튼 없음', () => {
  test('홈', async ({ page }) => {
    await boot(page);
    expect(await page.evaluate(lawCheck)).toEqual([]);
  });

  for (const id of NW) {
    test(`${id} — 5탭 전부`, async ({ page }) => {
      await boot(page, pageOf(id));
      for (const t of ['dash', 'result', 'map', 'stats', 'report']) {
        await page.locator(`.pt-tabs button[data-tab="${t}"]`).click();
        await page.waitForTimeout(250);
        expect(await page.evaluate(lawCheck), `${id}/${t}`).toEqual([]);
      }
    });
  }
});
