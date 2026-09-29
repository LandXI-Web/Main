import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

// 지도 서비스(XI맵) · 통계 · 보고서 — landxi/proto/ximap.html · stats-standard.html · report-standard{,-issue}.html
//   모듈 map.js · map-data.js · map-gl.js · map-stats.js · map-report.js · map-pledge.js · map.css
//   원판 design-canvas/v2/renders/B5-Map{,-Info,-Compare}.png · B7-Map-*.png · B7-Stats-*.png · B7-Report-*.png
//   기록 design-canvas/v2/notes/B7-map-states.md(38상태 대조표) · 브리프 docs/superpowers/proto/2026-09-20-b7-impl-brief.md
//   법전 design/system.md — 라운드 0 · 그림자 0 · 그라디언트 0 · 바닥 14px · 채운 파란 버튼 0

const MAP = 'proto/ximap.html';
const STATS = 'proto/stats-standard.html';
const RLIST = 'proto/report-standard.html';
const RISSUE = 'proto/report-standard-issue.html';
const FARM = 'namwon-farmland-2025';
const GREEN = 'namwon-greenhouse-2025';
const NETWORK = /Failed to load resource|net::ERR|ERR_|status of 40|status of 50|WebGL|Unable to (?:parse|decode)|AbortError/i;

function watch(page) {
  const errs = [];
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !NETWORK.test(m.text())) errs.push('console: ' + m.text()); });
  return errs;
}
/* ── 역할 픽스처(Wave 0 공통 규약 00-COMMON — 스펙 안에 그대로 복사 · M-R2) ── */
const HOME = { admin: 'admin-home.html', staff: 'ai-project.html', sales: 'ximap.html' };
void HOME;
/** LX 세션으로 화면을 연다. 세션은 첫 로드에서만 심는다(sessionStorage 가드). */
async function bootAs(page, url, role = 'staff', extra = {}) {
  await page.addInitScript(([r, ex]) => {
    if (sessionStorage.getItem('lx_e2e_boot')) return;
    sessionStorage.setItem('lx_e2e_boot', '1');
    localStorage.setItem('lx_logged_in', '1');
    localStorage.setItem('lx_role', r);
    localStorage.removeItem('lx_tenant_session');
    for (const [k, v] of Object.entries(ex)) (v === null ? localStorage.removeItem(k) : localStorage.setItem(k, v));
  }, [role, extra]);
  await page.goto(url);
  await page.waitForFunction(() => document.documentElement.dataset.shell === 'ready');
}
/** 지도 화면의 기본 역할 = 직원(staff). 지도 속성(lx-map-props)은 넘기면 심고, 안 넘기면 지운다. */
async function boot(page, url = MAP, props = null) {
  await bootAs(page, url, 'staff', { 'lx-map-props': props ? JSON.stringify(props) : null });
  return page;
}
const mapReady = (page) => page.waitForFunction(() => document.querySelector('#map-a')?.dataset.map === 'ready', null, { timeout: 20000 });
const layersOn = (page) => page.waitForFunction(() => (window.__lxMap?.A?.getSource(window.__lxMap.state.on.split(',')[0])) != null, null, { timeout: 20000 });
const withFarm = (extra = '') => `${MAP}?on=${FARM}&fold=0${extra}`;

/* ══ 1. 셸 · 뼈대 ══════════════════════════════════════════════════════ */
test.describe('셸 · 뼈대', () => {
  test('로그인 전이면 관문이 login.html?next=ximap.html 로 보낸다', async ({ page }) => {
    await page.goto(MAP);
    await page.waitForURL(/login\.html/);
    expect(new globalThis.URL(page.url()).searchParams.get('next')).toBe('ximap.html');
  });

  /* F2-R: 구 XI맵(ximap.html)은 직접 URL 로만 열린다 — 이 네 페이지의 레일 '지도 서비스'는 새 XI맵(../xi/index.html)을 가리킨다.
     통계 · 보고서는 ?embed=1 이 아니면 예전 셸 그대로(embed 는 f2r-embed.spec). */
  test('네 페이지 모두 같은 셸 — 레일 9 · 지도 서비스 활성 · 푸터 정본', async ({ page }) => {
    test.skip(true, 'F3 통합(2026-09-29) — 구 proto 레일은 v3 집으로 옮겼다 · 대체: v3-integration.spec');
    for (const url of [MAP, STATS, RLIST, RISSUE]) {
      await boot(page, url);
      await expect(page.locator('#rail .rail-i[aria-current="page"]')).toHaveCount(1);
      await expect(page.locator('#rail .rail-i[aria-current="page"]')).toHaveAttribute('data-menu', 'map');
      await expect(page.locator('#rail a[data-menu="map"]')).toHaveAttribute('href', '../xi/index.html');
      await expect(page.locator('#page-title')).toContainText('지도 서비스');
      await expect(page.locator('#foot-addr')).toContainText('063-713-1213');
      expect(await page.locator('#mast-asof').innerText()).toBe('2026.06.08');   // 기준일은 셸 값
    }
  });

  test('보기 방식 탭 3 — 기본 · 겹쳐보기 · 나란히보기(진짜 링크)', async ({ page }) => {
    await boot(page, MAP);
    const tabs = page.locator('#page-head .ptabs a');
    await expect(tabs).toHaveText(['기본', '겹쳐보기', '나란히보기']);
    await expect(page.locator('#page-head .ptabs a[aria-current="page"]')).toHaveText('기본');
  });

  test('작업공간은 레일 오른쪽 끝 ~ 화면 오른쪽 끝을 꽉 채운다', async ({ page }) => {
    await boot(page, MAP);
    const box = await page.locator('#mw').boundingBox();
    expect(Math.round(box.x)).toBe(72);
    expect(Math.round(box.x + box.width)).toBe(1440);
  });
});

/* ══ 2. 진짜 지도 ══════════════════════════════════════════════════════ */
test.describe('진짜 지도', () => {
  test('MapLibre 가 실제로 서고 배경은 V-World(폴백 포함) 래스터다', async ({ page }) => {
    const errs = watch(page);
    await boot(page, MAP);
    await mapReady(page);
    const src = await page.evaluate(() => {
      const m = window.__lxMap.A, s = m.getStyle().sources;
      return { sat: s.vsat.tiles[0], type: s.vsat.type, layers: m.getStyle().layers.map((l) => l.id) };
    });
    expect(src.type).toBe('raster');
    expect(src.sat).toMatch(/vworld|eox/i);
    expect(src.layers).toEqual(expect.arrayContaining(['b-sat', 'b-base', 'b-night', 'emd-fill', 'sr-fill']));
    expect(errs).toEqual([]);
  });

  test('결과 레이어를 켜면 실 GeoJSON 2,098 도형이 올라간다(손 배치 0)', async ({ page }) => {
    await boot(page, withFarm());
    await layersOn(page);
    const n = await page.evaluate((id) => window.__lxMap.geo.get(id).features.length, FARM);
    expect(n).toBe(2098);
    const layers = await page.evaluate((id) => window.__lxMap.A.getStyle().layers.map((l) => l.id).filter((x) => x.startsWith(id)), FARM);
    expect(layers).toEqual(expect.arrayContaining([`${FARM}-fill`, `${FARM}-line`, `${FARM}-dash`, `${FARM}-pt`]));
  });

  test('탐지 도형은 청록 고정 — 원본에 탐지 색 속성이 없다(admin-map 과 같은 규칙)', async ({ page }) => {
    await boot(page, withFarm());
    await layersOn(page);
    const c = await page.evaluate((id) => window.__lxMap.A.getPaintProperty(`${id}-fill`, 'fill-color'), FARM);
    expect(String(c).toUpperCase()).toContain('0FA9A0');
  });

  test('창 안 집계 · 스케일 띠 · 좌표는 실계산이다', async ({ page }) => {
    await boot(page, withFarm());
    await layersOn(page);
    await expect(page.locator('#hud .mw-bar')).toContainText('창 안');
    await expect(page.locator('#hud .mw-bar')).toContainText('전체 2,098');
    await expect(page.locator('#scale')).toContainText(/\d+(\.\d+)? (m|km)/);
    await expect(page.locator('#scale')).toContainText(/E · /);
  });
});

/* ══ 3. 지도 속성 — 서비스 관리가 저장한 값을 실제 렌더에 반영 ══════════ */
test.describe('지도 속성(lx-map-props)', () => {
  test('배경지도 · 탐지 외곽선 두께 · 검색 결과 선/면이 저장값을 따른다', async ({ page }) => {
    await boot(page, withFarm(), { baseMap: 'night', polyWidth: 7, searchStrokeColor: '#FF8800', searchWidth: 5, searchFillColor: '#00FF00', searchFillOpacity: 44, lxColor: '#123456', lxWidth: 3 });
    await layersOn(page);
    const v = await page.evaluate((id) => {
      const m = window.__lxMap.A;
      const w = m.getPaintProperty(`${id}-line`, 'line-width');
      return {
        night: m.getLayoutProperty('b-night', 'visibility'),
        sat: m.getLayoutProperty('b-sat', 'visibility'),
        srLine: m.getPaintProperty('sr-line', 'line-color'),
        srWidth: m.getPaintProperty('sr-line', 'line-width'),
        srFill: m.getPaintProperty('sr-fill', 'fill-color'),
        srFillOp: m.getPaintProperty('sr-fill', 'fill-opacity'),
        emdLine: m.getPaintProperty('emd-line', 'line-color'),
        emdWidth: m.getPaintProperty('emd-line', 'line-width'),
        stops: JSON.stringify(w),
      };
    }, FARM);
    expect(v.night).toBe('visible');
    expect(v.sat).toBe('none');
    expect(String(v.srLine).toUpperCase()).toContain('FF8800');
    expect(v.srWidth).toBe(5);
    expect(String(v.srFill).toUpperCase()).toContain('00FF00');
    expect(v.srFillOp).toBeCloseTo(0.44, 2);
    expect(String(v.emdLine).toUpperCase()).toContain('123456');
    expect(v.emdWidth).toBe(3);
    expect(v.stops).toContain('9.1');                 // polyWidth 7 → 18줌에서 7 × 1.3
  });

  test('저장값이 없으면 기본값(위성)으로 선다', async ({ page }) => {
    await boot(page, MAP);
    await mapReady(page);
    expect(await page.evaluate(() => window.__lxMap.A.getLayoutProperty('b-sat', 'visibility'))).toBe('visible');
  });
});

/* ══ 4. 레이어 카드 · 레이어 트리 · 시점 ═══════════════════════════════ */
test.describe('왼쪽 패널', () => {
  test('AI 분석 결과 = 카드 순서로 편 결과 5 · 레이어 트리 12 리프', async ({ page }) => {
    await boot(page, MAP);
    await expect(page.locator('#t-result')).toContainText('5');
    await expect(page.locator('#t-layer')).toContainText('12');
    const groups = await page.locator('.mg-h').allInnerTexts();
    expect(groups[0]).toContain('농지이용·불법건축물');
    expect(groups[1]).toContain('비닐하우스 현황');
    expect(groups[2]).toContain('드론 변화탐지');
    expect(groups[3]).toContain('해양쓰레기 실태조사');
    /* 준비 중은 판에 **한 줄**, 목록은 창에서 본다(2026-09-21).
       발주자: "준비 중 · 결과 레이어 없음 11 … 이런건 또 뭐지?" / "실제 오픈한다는 조건으로 프로페셔널하게"
       전에는 늘 `0` 을 단 줄 열한 개가 판에 깔려 있었다 — 켤 수 없는 줄이라 미완성으로 보였고,
       펴 보니 판을 넘어 잘렸다. 검사도 새 설계를 본다: 한 줄 + 창 안에서 **이유**가 선다. */
    await expect(page.locator('.mw-soon')).toContainText('준비 중');
    await expect(page.locator('.mw-soon')).toContainText('지도에 올릴 결과가 아직 없는 서비스');
    await expect(page.locator('.mw-soon li')).toHaveCount(0);            // 판에 목록은 없다
    await page.locator('#soon-t').click();
    const why = await page.locator('.md tbody tr, [role="dialog"] tbody tr').allInnerTexts();
    expect(why.length).toBe(11);
    expect(why.join(' ')).toContain('자료 보유 · 판독 전');                 // 늘 0 이던 숫자 대신 이유가 선다
    expect(why.join(' ')).not.toMatch(/	0$/m);
    await page.keyboard.press('Escape');
  });

  test('체크하면 URL 에 남고 범례 · 투명도 · 하위 체크 3이 붙는다', async ({ page }) => {
    await boot(page, MAP);
    await mapReady(page);
    await page.locator(`input[data-layer="${FARM}"]:not([data-sub])`).check();
    await page.waitForURL(new RegExp(`on=${FARM}`));
    await expect(page.locator('.mw-legend')).toContainText('경작지');
    await expect(page.locator('.mw-legend')).toContainText('1,291');
    await expect(page.locator('.mc-op')).toContainText('100 %');
    await expect(page.locator('.mc-ck2 label')).toHaveText(['탐지 결과', '원본 영상', '분석 영역']);
  });

  test('범례를 누르면 그 클래스가 판에서 숨는다', async ({ page }) => {
    await boot(page, withFarm());
    await layersOn(page);
    await page.locator('[data-cls$="|경작지"]').click();
    await expect(page.locator('[data-cls$="|경작지"]')).toHaveAttribute('aria-pressed', 'false');
    const f = await page.evaluate((id) => JSON.stringify(window.__lxMap.A.getFilter(`${id}-pt`)), FARM);
    expect(f).toContain('경작지');
  });

  test('레이어 탭 = 2단 트리 · 발행 레이어 12 · 공유 아이콘', async ({ page }) => {
    await boot(page, `${MAP}?panel=layer`);
    await expect(page.locator('.mt-s > button').first()).toContainText('행정정보');
    await expect(page.locator('.mt-l')).toHaveCount(12);
    await expect(page.locator('.mt-l .sh')).toHaveCount(2);
    await expect(page.locator('.mt-note')).toContainText('시연');
    expect(await page.locator('.mt-note').evaluate((e) => getComputedStyle(e).wordBreak)).toBe('keep-all');   // `실자 / 료` 낱말 꺾임 0(재게이트)
    /* 12줄은 원본 시드 — 지도에 올릴 실자료가 없다. 체크해도 카운터만 바뀌던 줄(M-07)은
       `시연 · 지도 미연결` 로 적고 체크를 막는다(E0-5). */
    await expect(page.locator('.mt-l input[data-leaf]:disabled')).toHaveCount(12);
    await expect(page.locator('.mt-l .tag')).toHaveCount(12);
    await expect(page.locator('.mt-l .tag').first()).toHaveText('시연 · 지도 미연결');
    await expect(page.locator('.mt-l input:checked')).toHaveCount(0);
  });

  test('시점 스트립 = imagery.js 4시점 · 누르면 실 정사영상 타일이 켜진다', async ({ page }) => {
    await boot(page, withFarm());
    await layersOn(page);
    await expect(page.locator('#strip [data-epoch]')).toHaveCount(4);
    await expect(page.locator('#strip')).toContainText('GSD 1.08 / 1.69 / 1.54 / 1.68 cm');
    await page.locator('[data-epoch="namwon_2506"]').click();
    await expect(page.locator('[data-epoch="namwon_2506"]')).toHaveAttribute('aria-pressed', 'true');
    const t = await page.evaluate(() => window.__lxMap.A.getStyle().sources.epoch?.tiles?.[0]);
    expect(t).toContain('assets/tiles/namwon_2506');
  });

  test('패널 접기/펼치기 — 36px 세로 띠', async ({ page }) => {
    await boot(page, MAP);
    await page.locator('#l-close').click();
    await page.waitForFunction(() => Math.round(document.querySelector('#mw-l').getBoundingClientRect().width) === 36);
    await page.locator('#l-open').click();
    await page.waitForFunction(() => document.querySelector('#mw-l').getBoundingClientRect().width > 300);
  });
});

/* ══ 5. 도구 ═══════════════════════════════════════════════════════════ */
test.describe('도구 열', () => {
  test('원본 7도구 — 검색 · 배경지도 · 측정 · 그리기 · 내보내기 · 관심 구역 · LX', async ({ page }) => {
    await boot(page, MAP);
    await expect(page.locator('.mw-tools button')).toHaveCount(7);
    const labels = await page.locator('.mw-tools button').evaluateAll((b) => b.map((x) => x.getAttribute('aria-label')));
    expect(labels).toEqual(['검색', '배경지도 변경', '측정 및 분석', '그리기 도구', '내보내기', '관심 구역 설정', 'LX 레이어']);
  });

  test('배경지도 서브메뉴 5 — 고르면 판이 바뀌고 URL 에 남는다', async ({ page }) => {
    await boot(page, withFarm());
    await mapReady(page);
    await page.locator('[data-tool="basemap"]').click();
    await expect(page.locator('.mw-sub [data-base]')).toHaveCount(5);
    await expect(page.locator('.mw-sub')).toContainText('빈화면');
    await page.locator('[data-base="base"]').click();
    await page.waitForURL(/base=base/);
    expect(await page.evaluate(() => window.__lxMap.A.getLayoutProperty('b-base', 'visibility'))).toBe('visible');
  });

  test('측정 — 서브메뉴 3 + 안내 문구 원문 · 클릭 두 번이면 실거리가 나온다', async ({ page }) => {
    await boot(page, withFarm('&left=off'));
    await mapReady(page);
    await page.locator('[data-tool="measure"]').click();
    await expect(page.locator('.mw-sub [data-msr]')).toHaveCount(4);   // 취소 + 거리 · 면적 · 반경
    await page.locator('[data-msr="distance"]').click();
    await expect(page.locator('.mw-guide')).toContainText('지도를 클릭하여 거리를 측정하세요. 더블클릭으로 완료');
    const box = await page.locator('#map-a').boundingBox();
    await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.3);
    await page.mouse.move(box.x + box.width * 0.62, box.y + box.height * 0.5);
    await expect(page.locator('.mw-tip--acc')).toContainText(/거리 [\d.,]+ (m|km)/);
    await expect(page.locator('.mw-tip--ink')).toContainText('클릭하여 꼭지점 추가');
  });

  test('그리기 — 서브메뉴 5(점 · 선 · 원 · 면)', async ({ page }) => {
    await boot(page, withFarm('&left=off'));
    await mapReady(page);
    await page.locator('[data-tool="draw"]').click();
    await expect(page.locator('.mw-sub')).toContainText('그리기 도구');
    await expect(page.locator('.mw-sub [data-msr]')).toHaveCount(5);
  });

  test('관심 구역 — 도구 막대 원문 4버튼 · 저장이 면적을 말한다', async ({ page }) => {
    await boot(page, withFarm('&left=off'));
    await mapReady(page);
    await page.locator('[data-tool="aoi"]').click();
    await expect(page.locator('.mw-guide--tool')).toContainText('지도 위에 도형을 그려 관심 구역을 지정하세요');
    for (const id of ['#g-undo', '#g-clear', '#g-cancel', '#g-save']) await expect(page.locator(id)).toBeVisible();
    const box = await page.locator('#map-a').boundingBox();
    for (const [fx, fy] of [[0.42, 0.24], [0.66, 0.26], [0.64, 0.62], [0.40, 0.60]]) await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy);
    await page.locator('#g-save').click();
    await expect(page.locator('#say')).toContainText(/관심 구역 1개 · [\d.]+ ha/);
  });

  test('LX 레이어 팝오버 — 읍면동 경계 · 지명/도로 · 분석 영역', async ({ page }) => {
    await boot(page, withFarm());
    await mapReady(page);
    await page.locator('[data-tool="lx"]').click();
    await expect(page.locator('.mw-sub [data-lx]')).toHaveCount(3);
  });

  test('Esc 는 도구 · 서브메뉴 · 검색을 차례로 닫는다', async ({ page }) => {
    await boot(page, withFarm('&left=off'));
    await mapReady(page);
    await page.locator('[data-tool="draw"]').click();
    await page.keyboard.press('Escape');
    await expect(page.locator('.mw-sub')).toHaveCount(0);
  });
});

/* ══ 6. 검색 ═══════════════════════════════════════════════════════════ */
test.describe('검색', () => {
  test('탭 4 · 그룹 3(명칭 · 도로명 · 지번) · 총 건수 = 시연 꼬리표', async ({ page }) => {
    await boot(page, `${MAP}?on=${FARM}&q=남원`);
    await mapReady(page);
    await expect(page.locator('.srp')).toBeVisible();
    await expect(page.locator('.sr-t [data-srt]')).toHaveCount(4);
    await expect(page.locator('.sr-sum')).toContainText('488,364');
    await expect(page.locator('.sr-sum .tag')).toHaveText('시연');
    await expect(page.locator('.sr-g')).toHaveCount(3);
  });

  test('결과를 고르면 지도가 옮겨가고 표식 · 콜아웃이 붙는다', async ({ page }) => {
    await boot(page, `${MAP}?on=${FARM}&q=남원`);
    await mapReady(page);
    await page.locator('.sr-r').first().click();
    await expect(page.locator('.sr-mark')).toBeVisible();
    const n = await page.evaluate(() => window.__lxMap.A.getSource('sr')._data.features.length);
    expect(n).toBe(1);
  });

  test('검색 0 — 원본 문구', async ({ page }) => {
    await boot(page, `${MAP}?on=${FARM}&q=없는지명`);
    await mapReady(page);
    await expect(page.locator('.srp .empty-t')).toHaveText('검색 결과가 없습니다');
  });

  test('명칭 탭으로 좁히면 그 그룹만 남는다', async ({ page }) => {
    await boot(page, `${MAP}?on=${FARM}&q=남원`);
    await mapReady(page);
    await page.locator('[data-srt="road"]').click();
    await expect(page.locator('.sr-g')).toHaveCount(1);
    await expect(page.locator('.sr-g-h')).toContainText('도로명');
  });
});

/* ══ 7. 피처 클릭 → 탐지 정보 · 조치 상태 ═════════════════════════════ */
test.describe('탐지 정보', () => {
  test('표 행을 고르면 탐지 정보 판이 열리고 콜아웃이 붙는다', async ({ page }) => {
    await boot(page, withFarm('&left=off'));
    await layersOn(page);
    await page.locator('#tbody tr[data-row]').first().click();
    await expect(page.locator('#mw')).toHaveAttribute('data-side', 'info');
    await expect(page.locator('.mi h2')).toHaveText('경작지');
    await expect(page.locator('.mw-call')).toBeVisible();
    await expect(page.locator('.mw-bracket')).toBeVisible();
  });

  test('탐지 정보 판 = 키–값 8 · 조치 상태 3단계 · 개요 클래스별 면적', async ({ page }) => {
    await boot(page, withFarm('&left=off'));
    await layersOn(page);
    await page.locator('#tbody tr[data-row]').first().click();
    await expect(page.locator('.mi .kv > div')).toHaveCount(8);
    await expect(page.locator('.mi-steps button')).toHaveText(['발견', '조치중', '처리 완료']);
    await expect(page.locator('.mi-sum h3')).toContainText('합계 3,158,684 m²');
    await expect(page.locator('.mi .kv')).not.toContainText('.gpkg');       // 내부 키 노출 0(X5m)
  });

  test('조치 상태를 바꾸면 표와 판이 같이 바뀐다(세션 저장)', async ({ page }) => {
    await boot(page, withFarm('&left=off'));
    await layersOn(page);
    await page.locator('#tbody tr[data-row]').first().click();
    await page.locator('[data-act="doing"]').click();
    await expect(page.locator('.mi-steps [aria-current="step"]')).toHaveText('조치중');
    /* 정보 판이 열린 동안 표는 고른 행 한 줄(peek) — 그 줄이 먼저 바뀐다(E0-5 · M-01) */
    await expect(page.locator('.mb-peek')).toContainText('조치중');
    await page.locator('#mb-full').click();                       // 표 펼치기 → 정보 판을 닫고 표로
    await page.locator('[data-itab="base"]').click();
    await expect(page.locator('#tbody tr').first()).toContainText('조치중');
  });

  test('통계 · 보고서로 잇는 버튼이 실제로 이동한다', async ({ page }) => {
    await boot(page, withFarm('&left=off'));
    await layersOn(page);
    await page.locator('#tbody tr[data-row]').first().click();
    await page.locator('#go-report').click();
    await page.waitForURL(/report-standard-issue\.html\?result=/);
  });
});

/* ══ 8. 하단 표 ════════════════════════════════════════════════════════ */
test.describe('속성 표', () => {
  test('탭 3 + 정보 탭 2 · 열 10(PNU 파생)', async ({ page }) => {
    await boot(page, withFarm('&left=off'));
    await layersOn(page);
    await expect(page.locator('.mb-t [data-ttab]')).toHaveText(['공간 정보', '지역 구분', '분석 결과']);
    await expect(page.locator('.mb-t [data-itab]')).toHaveText(['기본 정보', '탐지 정보']);
    await expect(page.locator('#mb-b thead th')).toHaveText(['연번', '시도', '시군구', '읍·면·동', '리(코드)', '산', '본번', '부번', '탐지 클래스', '면적(㎡)']);
    await expect(page.locator('.mb-t .mic')).toContainText('PNU 에서 파생');
  });

  test('표 행 번호 = 판 위 번호', async ({ page }) => {
    await boot(page, withFarm('&left=off'));
    await layersOn(page);
    await expect(page.locator('#tbody tr')).toHaveCount(10);
    await expect(page.locator('.mw-num')).toHaveCount(10);
    await expect(page.locator('.mw-num').first()).toHaveText('1');
  });

  test('필터로 거르면 페이저 건수가 따라간다', async ({ page }) => {
    await boot(page, withFarm('&left=off'));
    await layersOn(page);
    await page.locator('#tblq select[name="emd"]').selectOption('운봉읍');
    await page.locator('#tblq button.btn').click();
    await expect(page.locator('#pager .pager-sum')).toContainText('237');
    await expect(page.locator('#tbody tr').first()).toContainText('운봉읍');
  });

  test('지역 구분 = 읍면동 32 · 합계 3,158,684 ㎡ · 판은 5분위 채움', async ({ page }) => {
    await boot(page, withFarm('&left=off&tab=region'));
    await layersOn(page);
    await expect(page.locator('.mb-t .mic')).toContainText('합계 3,158,684 ㎡');
    await expect(page.locator('#pager .pager-sum')).toContainText('32');
    await expect(page.locator('#tbody tr').first()).toContainText('운봉읍');
    await expect(page.locator('#tbody tr').first()).toContainText('408,496');
    await page.waitForFunction(() => window.__lxMap.A.getLayoutProperty('emd-fill', 'visibility') === 'visible');
    const steps = await page.evaluate(() => [...new Set(window.__lxMap.A.getSource('emd')._data.features.map((f) => f.properties.step))].sort());
    expect(steps).toEqual([0, 1, 2, 3, 4, 5]);
  });

  test('공간 정보 탭 = 좌표계 · 범위 · 도형 수(실측)', async ({ page }) => {
    await boot(page, withFarm('&left=off&tab=space'));
    await layersOn(page);
    await expect(page.locator('#mb-b')).toContainText('EPSG:5186');
    await expect(page.locator('#mb-b')).toContainText('315.9 ha');
  });

  test('기본은 접힘 — 원판 B5-Map 처럼 판이 아래까지 간다', async ({ page }) => {
    await boot(page, `${MAP}?on=${FARM}`);
    await layersOn(page);
    await expect(page.locator('.mb-collapsed')).toContainText('필지 행정정보');
    await expect(page.locator('#tbody')).toHaveCount(0);
    expect((await page.locator('#map-a').boundingBox()).height).toBeGreaterThan(600);
  });

  test('하단 표 접기 → 띠 한 줄', async ({ page }) => {
    await boot(page, withFarm('&left=off'));
    await layersOn(page);
    await page.locator('#mb-fold').click();
    await expect(page.locator('.mb-collapsed')).toContainText('필지 행정정보');
    await page.locator('#mb-open').click();
    await expect(page.locator('.mb-t')).toBeVisible();
  });
});

/* ══ 9. 레이어 0 · 로딩 ════════════════════════════════════════════════ */
test.describe('빈 상태', () => {
  test('레이어 0 — 범례 없음 + 원본 문구 · 내보내기 CTA 없음 · 하단 표 없음', async ({ page }) => {
    await boot(page, MAP);
    await mapReady(page);
    await expect(page.locator('.mw-none .m')).toHaveText('선택된 작업이 없어요');
    await expect(page.locator('.mw-none .w')).toHaveText('왼쪽에서 분석 결과를 체크하세요');
    await expect(page.locator('#export')).toHaveCount(0);
    await expect(page.locator('#mb')).toBeHidden();
  });

  test('불러오는 중 — 결과가 오기 전엔 로딩 상자가 뜬다', async ({ page }) => {
    await page.addInitScript(() => { localStorage.setItem('lx_logged_in', '1'); localStorage.setItem('lx_role', 'staff'); localStorage.removeItem('lx_tenant_session'); });
    await page.route('**/geo/results/namwon-farmland-2025.geojson', async (r) => { await new Promise((z) => setTimeout(z, 2500)); await r.continue(); });
    await page.goto(withFarm());
    await page.waitForFunction(() => document.documentElement.dataset.shell === 'ready');
    await expect(page.locator('.mw-load')).toContainText('불러오는 중…');
    await layersOn(page);
    await expect(page.locator('.mw-load')).toHaveCount(0);
  });
});

/* ══ 10. 겹쳐보기 · 나란히보기 ═════════════════════════════════════════ */
test.describe('비교 보기', () => {
  test('겹쳐보기 — 지도 2 · 스와이프 손잡이 · 비교 결과 156건 5.4 ha', async ({ page }) => {
    const errs = watch(page);
    await boot(page, `${MAP}?on=${FARM}&mode=overlay`);
    await page.waitForFunction(() => window.__lxMap?.B?.getStyle() != null, null, { timeout: 20000 });
    await expect(page.locator('#swipe')).toBeVisible();
    await page.locator('[data-cmp-open]').click();                // 비교 결과 판은 자동으로 열리지 않는다(M-05) — 단추로 연다
    await expect(page.locator('.mw-side .dw-big')).toContainText('156');
    await expect(page.locator('.mw-side .dw-big')).toContainText('5.4');
    await expect(page.locator('.mw-side')).toContainText('학습 모델 탐지 아님');
    expect(errs).toEqual([]);
  });

  test('스와이프 손잡이는 키보드로도 움직인다', async ({ page }) => {
    await boot(page, `${MAP}?on=${FARM}&mode=overlay`);
    await page.waitForFunction(() => window.__lxMap?.B != null, null, { timeout: 20000 });
    const before = await page.evaluate(() => document.querySelector('#swipe').style.left);
    await page.locator('#swipe-h').focus();
    await page.keyboard.press('ArrowRight');
    expect(await page.evaluate(() => document.querySelector('#swipe').style.left)).not.toBe(before);
  });

  test('나란히보기 — 독립 지도 2 · 도구 열 2벌 · 하단 분할 띠 2', async ({ page }) => {
    await boot(page, `${MAP}?on=${FARM}&mode=parallel`);
    await page.waitForFunction(() => window.__lxMap?.B?.getStyle() != null, null, { timeout: 20000 });
    await expect(page.locator('.mw-tools')).toHaveCount(2);
    await expect(page.locator('.mw-band')).toHaveCount(2);
    await expect(page.locator('.mw-band').first()).toContainText('기준 · 2025.04');
    await expect(page.locator('.mw-band').nth(1)).toContainText('비교 대상 · 2025.10');
    const t = await page.evaluate(() => [window.__lxMap.A.getStyle().sources.epoch.tiles[0], window.__lxMap.B.getStyle().sources.epoch.tiles[0]]);
    expect(t[0]).toContain('namwon_2504');
    expect(t[1]).toContain('namwon_2510');
  });

  test('비교할 분석 선택 = 시점 4 + 결과 레이어 · 취소/적용', async ({ page }) => {
    await boot(page, `${MAP}?on=${FARM}&mode=parallel`);
    await expect(page.locator('.mv[data-ep]')).toHaveCount(4);
    await expect(page.locator('.mv-k').first()).toHaveText('기준');
    await expect(page.locator('#cmp-apply')).toHaveText('적용');
    /* 비교 모드에서는 좌 판이 띠로 접혀 들어온다(E0-5 · M-05) — 띠의 `설정 패널 펼치기` 로 편다 */
    await expect(page.locator('#mw')).toHaveAttribute('data-left', 'off');
    await page.locator('#l-open').click();
    await page.locator('#cmp-cancel').click();
    await page.waitForURL((u) => !u.searchParams.get('mode'));
  });
});

/* ══ 11. 보안 서약서 ═══════════════════════════════════════════════════ */
test.describe('보안 서약서 · 다운로드', () => {
  test('내보내기 = 서약서 · 원문 · 내보낼 대상 띠 · 검증 3', async ({ page }) => {
    await boot(page, `${MAP}?on=${FARM},${GREEN}&fold=0`);
    await layersOn(page);
    await page.locator('#export').click();
    const m = page.locator('.modal');
    await expect(m.locator('.modal-h h2')).toHaveText('보안 서약서');
    await expect(m.locator('.pl-targets li')).toHaveCount(2);
    await expect(m.locator('.pl-text')).toContainText('본인은 Land-XI 플랫폼의 공간정보 다운로드 환경을 사용함에 있어');
    await m.locator('.modal-f .btn').click();
    await expect(m.locator('#pl-ok-e')).toHaveText('보안 서약 내용에 동의해 주셔야 합니다.');
    await expect(m.locator('#pl-name-e')).toHaveText('요청명을 입력해 주세요.');
    await expect(m.locator('#pl-purpose-e')).toHaveText('사용 목적을 입력해 주세요.');
  });

  test('다 채우면 생성 중 → 파일이 실제로 내려가고 토스트는 사실만', async ({ page }) => {
    await boot(page, `${MAP}?on=${FARM}&fold=0`);
    await layersOn(page);
    await page.locator('#export').click();
    const m = page.locator('.modal');
    await m.locator('#pl-ok').check();
    await m.locator('#pl-name').fill('금지면 비닐하우스 현황 점검');
    await m.locator('#pl-purpose').fill('현장 점검 대상지 선정');
    const dl = page.waitForEvent('download');
    await m.locator('.modal-f .btn').click();
    await expect(m.locator('.modal-f .btn')).toHaveText('생성 중…');
    expect((await dl).suggestedFilename()).toMatch(/\.geojson$/);
    await expect(page.locator('#say')).toContainText('1개 파일이 내려갔습니다');
    await expect(page.locator('#say')).not.toContainText('시작되었습니다');
    await expect(page.locator('.modal')).toHaveCount(0);
  });

  test('활용 기간 기본값 = 기준일부터 1개월 · 신청자 = 역할명', async ({ page }) => {
    await boot(page, `${MAP}?on=${FARM}&fold=0`);
    await layersOn(page);
    await page.locator('#export').click();
    expect(await page.locator('#pl-from').inputValue()).toBe('2026-06-08');   // 기준일 AS_OF 하나(Q5-b)
    expect(await page.locator('#pl-to').inputValue()).toBe('2026-07-08');
    await expect(page.locator('.pl-who')).toHaveText('신청자 : LX 직원 님');        // 현재 계정 역할명
  });
});

/* ══ 12. 통계 ══════════════════════════════════════════════════════════ */
test.describe('통계', () => {
  /* 서랍 폭은 2026-09-20 에 고정 620 에서 화면 폭에 따르는 값으로 바뀌었다.
     620 한 칸에는 기준·거르개·큰 수·막대·표·쪽넘김이 다 들어가지 않아 574px 가 숨었다
     ("업무 화면은 한 화면에서 끝난다"). 이제 서랍은 760~920px 사이에서 두 칸으로 선다.
     — 지도가 최소 470px 을 갖도록 계산하므로 지도가 쓸모없어지지 않는다(map.css 참고). */
  test('우 서랍은 760~920 · 큰 수 3은 실 GeoJSON 집계다', async ({ page }) => {
    const errs = watch(page);
    await boot(page, `${STATS}?result=${FARM}&left=off`);
    await layersOn(page);
    const w = Math.round((await page.locator('#side').boundingBox()).width);
    expect(w).toBeGreaterThanOrEqual(760);
    expect(w).toBeLessThanOrEqual(920);
    await expect(page.locator('.dw h2')).toHaveText('농지 활용 통계');
    const big = await page.locator('.dw-big').innerText();
    expect(big).toContain('315.9');
    expect(big).toContain('3,158,684');
    expect(big).toContain('205.0');
    expect(big).toContain('경작지 · 65 %');
    expect(big).toContain('110.9');
    expect(big).toContain('비경작지 · 35 %');
    expect(errs).toEqual([]);
  });

  test('읍면동 막대 32 + 표 · 행에 올리면 그 읍면동이 지도에서 켜진다', async ({ page }) => {
    await boot(page, `${STATS}?result=${FARM}&left=off`);
    await layersOn(page);
    await expect(page.locator('.dw-bars button')).toHaveCount(32);
    await expect(page.locator('.dw-chart .hd')).toContainText('읍·면·동별 분석 면적(㎡) · 큰 순 · 32');
    await page.locator('#st-tb tr[data-emd]').first().hover();
    await page.waitForFunction(() => (window.__lxMap.A.getSource('emd')?._data?.features || []).some((f) => f.properties.sel));
    const sel = await page.evaluate(() => window.__lxMap.A.getSource('emd')._data.features.filter((f) => f.properties.sel).map((f) => f.properties.nm));
    expect(sel).toEqual(['운봉읍']);
  });

  test('클래스별 통계 탭 — 실측 면적 · 비율 · 실사 크롭 2', async ({ page }) => {
    await boot(page, `${STATS}?result=${FARM}&left=off`);
    await layersOn(page);
    await page.locator('[data-tab="class"]').click();
    await expect(page.locator('#st-tb tr[data-cls]').first()).toContainText('2,049,934');
    await expect(page.locator('#st-tb tr[data-cls]').first()).toContainText('64.9');
    await expect(page.locator('#st-tb tr[data-cls]').nth(1)).toContainText('1,108,750');
    await expect(page.locator('.dw-crops figure')).toHaveCount(2);
  });

  test('기준 3 + 분석 결과 찾기 모달(표 7열 · 시연)', async ({ page }) => {
    await boot(page, `${STATS}?result=${FARM}&left=off`);
    await layersOn(page);
    await expect(page.locator('.dw-basis li')).toHaveCount(3);
    await expect(page.locator('.dw-basis .tag')).toHaveCount(2);
    await page.locator('#st-more').click();
    const m = page.locator('.modal');
    await expect(m.locator('.modal-h h2')).toHaveText('분석 결과 찾기');
    await expect(m.locator('thead th')).toHaveText(['선택', '기준 일자', '영상 명', '분석 범위 유형', '분석 범위 명', '분석명', '분석 과제명']);
    await expect(m.locator('#fd-tb tr')).toHaveCount(4);
    await expect(m.locator('#fd-tb input[disabled]')).toHaveCount(3);        // 시연 기준은 고를 수 없다
    await expect(m.locator('select[aria-label="실행자"]')).toHaveCount(0);    // 거를 자료가 없는 거르개는 걷었다
    await m.locator('[data-q="1"]').click();                                  // 기간 칩은 실제로 거른다(기준일 06.08 에서 1개월)
    await expect(m.locator('#fd-tb tr')).toHaveCount(1);
    await m.locator('[data-q="3"]').click();                                  // 03-08 이후 — 03-05 시드가 빠진다
    await expect(m.locator('#fd-tb tr')).toHaveCount(3);
    await m.locator('[data-q="all"]').click();
    await expect(m.locator('#fd-tb tr')).toHaveCount(4);
    await m.locator('#fd-tb tr').nth(0).click();
    await m.locator('.modal-f .btn').click();
    await expect(page.locator('#say')).toContainText('기준을');
  });

  test('엑셀 다운로드도 같은 보안 서약서를 거친다', async ({ page }) => {
    await boot(page, `${STATS}?result=${FARM}&left=off`);
    await layersOn(page);
    await page.locator('#st-dl').click();
    await expect(page.locator('.modal .modal-h h2')).toHaveText('보안 서약서');
    await expect(page.locator('.modal .modal-f .btn')).toHaveText('엑셀 다운로드');
  });

  test('빈 상태 — AI 분석이 완료된 후 이용할 수 있어요 + 점선 고스트', async ({ page }) => {
    await boot(page, `${STATS}?on=none`);
    await mapReady(page);
    await expect(page.locator('.dw .empty-t')).toHaveText('AI 분석이 완료된 후 이용할 수 있어요');
    await expect(page.locator('.dw-ghost .gb span')).toHaveCount(32);
  });
});

/* ══ 13. 보고서 ════════════════════════════════════════════════════════ */
test.describe('보고서', () => {
  test('발급 요청 폼 — 제목 · 클래스 · 대상 지역 + 미리보기 실측', async ({ page }) => {
    const errs = watch(page);
    await boot(page, `${RISSUE}?result=${FARM}&left=off`);
    await layersOn(page);
    await expect(page.locator('.dw h2')).toHaveText('농지 활용 보고서 발급 요청');
    await expect(page.locator('#rp-title')).toHaveValue(/남원시 농지 활용 현황 보고서/);
    await expect(page.locator('.rp-emds [data-emd]:checked')).toHaveCount(5);
    const pre = await page.locator('.rp-pre .l').innerText();
    expect(pre).toContain('802');
    expect(pre).toContain('124.1');
    expect(errs).toEqual([]);
  });

  test('체크한 읍면동이 지도에 켜진다', async ({ page }) => {
    await boot(page, `${RISSUE}?result=${FARM}&left=off`);
    await layersOn(page);
    await page.waitForFunction(() => (window.__lxMap.A.getSource('emd')?._data?.features || []).filter((f) => f.properties.sel).length === 5);
    await page.locator('.rp-emds [data-emd="운봉읍"]').uncheck();
    await page.waitForFunction(() => window.__lxMap.A.getSource('emd')._data.features.filter((f) => f.properties.sel).length === 4);
    await expect(page.locator('.rp-pre .l')).not.toContainText('802');
  });

  test('인라인 검증 3 — 비우고 발급 요청', async ({ page }) => {
    await boot(page, `${RISSUE}?result=${FARM}&left=off`);
    await layersOn(page);
    await page.locator('#rp-title').fill('');
    await page.locator('#rp-cls-all').uncheck();
    await page.locator('#rp-emd-all').check();
    await expect(page.locator('.rp-emds [data-emd]:checked')).toHaveCount(32);
    await page.locator('#rp-emd-all').uncheck();
    await expect(page.locator('.rp-emds [data-emd]:checked')).toHaveCount(0);
    await page.locator('#rp-go').click();
    await expect(page.locator('.dw .err')).toHaveCount(3);
    await expect(page.locator('.dw .err').first()).toHaveText('보고서 제목을 입력해 주세요.');
    await expect(page.locator('#say')).toContainText('필수 항목 3개가 비어 있습니다');
  });

  test('발급하면 내역 탭으로 넘어가고 접수 건이 맨 위에 쌓인다', async ({ page }) => {
    await boot(page, `${RISSUE}?result=${FARM}&left=off`);
    await layersOn(page);
    await page.locator('#rp-title').fill('e2e 발급 시험 보고서');
    await page.locator('#rp-go').click();
    await expect(page.locator('#say')).toContainText('보고서 발급을 접수했습니다');
    await page.waitForURL(/rtab=list/);
    await expect(page.locator('.rp .l2').first()).toHaveText('e2e 발급 시험 보고서');
    await expect(page.locator('.rp .l1').first()).toContainText('접수');
  });

  test('발급 내역 — 상태 3종 · 행에 올리면 대상 지역이 켜진다', async ({ page }) => {
    await boot(page, `${RLIST}?result=${FARM}&left=off`);
    await layersOn(page);
    await expect(page.locator('.dw h2')).toHaveText('농지 활용 보고서 발급 내역');
    const states = await page.locator('.rp .l1 .st').allInnerTexts();
    expect(new Set(states)).toEqual(new Set(['처리 완료', '처리중', '처리 실패']));
    await page.locator('.rp').nth(1).hover();
    await page.waitForFunction(() => window.__lxMap.A.getSource('emd')._data.features.filter((f) => f.properties.sel).length === 2);
  });

  test('발급 내역 빈 상태 — 검색 결과가 없어요.', async ({ page }) => {
    await boot(page, `${RLIST}?result=${FARM}&left=off`);
    await layersOn(page);
    await page.locator('#rp-q input[name="q"]').fill('없는보고서');
    await page.locator('#rp-q button.btn-br').click();
    await expect(page.locator('.dw .empty-t')).toHaveText('검색 결과가 없어요.');
  });

  test('엑셀 다운로드 = 보안 서약서(처음 열림)', async ({ page }) => {
    await boot(page, `${RLIST}?result=${FARM}&left=off`);
    await layersOn(page);
    await page.locator('.rp .dl').first().click();
    await expect(page.locator('.modal .modal-h h2')).toHaveText('보안 서약서');
    await expect(page.locator('.modal #pl-name')).toHaveAttribute('placeholder', /예\)/);
  });
});

/* ══ 14. 연결 · 분기 ═══════════════════════════════════════════════════ */
test.describe('화면 간 연결', () => {
  test('?result= 로 들어오면 그 결과 레이어를 켠 채로 연다', async ({ page }) => {
    await boot(page, `${MAP}?result=${GREEN}`);
    await layersOn(page);
    expect(await page.evaluate(() => window.__lxMap.state.on)).toBe(GREEN);
    await expect(page.locator(`input[data-layer="${GREEN}"]:not([data-sub])`)).toBeChecked();
  });

  test('?card= 로 들어오면 그 카드의 레이어가 전부 켜진다', async ({ page }) => {
    await boot(page, `${MAP}?card=card-farm`);
    await layersOn(page);
    const on = await page.evaluate(() => window.__lxMap.state.on.split(','));
    expect(on).toEqual([FARM, GREEN]);
  });

  test('글로벌 카드면 행정단위 · 좌표계 표기가 SCOPES 를 따른다(구조는 같다)', async ({ page }) => {
    await boot(page, `${MAP}?card=card-global-farm&on=${FARM}&left=off&tab=space&fold=0`);
    await layersOn(page);
    await expect(page.locator('#mb-b')).toContainText('행정단위');
    await expect(page.locator('#mb-b')).toContainText('주 · 군(district)');
    await expect(page.locator('#mb-b')).toContainText('EPSG:4326 (WGS84)');
  });

  test('뒤로 가기가 상태를 되돌린다', async ({ page }) => {
    await boot(page, MAP);
    await mapReady(page);
    await page.locator(`input[data-layer="${FARM}"]:not([data-sub])`).check();
    await page.waitForURL(new RegExp(`on=${FARM}`));
    await page.goBack();
    await expect(page.locator(`input[data-layer="${FARM}"]:not([data-sub])`)).not.toBeChecked();
  });
});

/* ══ 15. 법전 · 접근성 ═════════════════════════════════════════════════ */
test.describe('법전 · 접근성', () => {
  const HYGIENE = () => {
    const bad = [];
    for (const el of document.querySelectorAll('#main *, #rail *, #mast *, .modal *')) {
      const s = getComputedStyle(el);
      if (el.closest('.maplibregl-map') || el.closest('.mw-map')) continue;
      const r = s.borderRadius.replace(/[0px %]/g, '');
      if (r && r !== '') bad.push('radius ' + el.className + ' ' + s.borderRadius);
      if (s.boxShadow !== 'none') bad.push('shadow ' + el.className);
      if (/gradient/.test(s.backgroundImage)) bad.push('gradient ' + el.className);
      if (s.backdropFilter && s.backdropFilter !== 'none') bad.push('backdrop ' + el.className);
      const fs = parseFloat(s.fontSize);
      if (el.textContent.trim() && el.children.length === 0 && fs < 14 && s.display !== 'none') bad.push('font ' + fs + ' ' + el.className);
      if (s.backgroundColor === 'rgb(0, 109, 247)' && el.tagName === 'BUTTON') bad.push('blue-fill ' + el.className);
    }
    return bad.slice(0, 12);
  };

  test('라운드 0 · 그림자 0 · 그라디언트 0 · 14px 바닥 · 채운 파란 버튼 0 — 지도', async ({ page }) => {
    await boot(page, withFarm());
    await layersOn(page);
    expect(await page.evaluate(HYGIENE)).toEqual([]);
  });

  test('같은 검사 — 통계 서랍 · 보고서 서랍 · 서약서 모달', async ({ page }) => {
    await boot(page, `${STATS}?result=${FARM}&left=off`);
    await layersOn(page);
    expect(await page.evaluate(HYGIENE)).toEqual([]);
    await boot(page, `${RISSUE}?result=${FARM}&left=off`);
    await layersOn(page);
    expect(await page.evaluate(HYGIENE)).toEqual([]);
    await page.locator('[data-tool="export"]').click();
    expect(await page.evaluate(HYGIENE)).toEqual([]);
  });

  test('빨강은 조치 필요 · 필수 표시 글자에만(채움 · 테두리 0)', async ({ page }) => {
    await boot(page, `${RLIST}?result=${FARM}&left=off`);
    await layersOn(page);
    const bad = await page.evaluate(() => {
      const out = [];
      for (const el of document.querySelectorAll('#main *')) {
        const s = getComputedStyle(el);
        if (/209, 53, 43/.test(s.backgroundColor)) out.push('fill ' + el.className);
        if (/209, 53, 43/.test(s.borderTopColor) && parseFloat(s.borderTopWidth) > 0) out.push('border ' + el.className);
      }
      return out;
    });
    expect(bad).toEqual([]);
  });

  test('키보드로 표를 완주하고 판이 따라온다', async ({ page }) => {
    await boot(page, withFarm('&left=off'));
    await layersOn(page);
    await page.locator('#tbody tr[data-row]').first().focus();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expect(page.locator('#mw')).toHaveAttribute('data-side', 'info');
    await expect(page.locator('.mi h2')).toBeVisible();
  });

  test('모달은 포커스를 가두고 Esc 로 닫힌다', async ({ page }) => {
    await boot(page, `${MAP}?on=${FARM}&fold=0`);
    await layersOn(page);
    await page.locator('#export').click();
    await expect(page.locator('.modal')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('.modal')).toHaveCount(0);
    await expect(page.locator('#export')).toBeFocused();
  });

  test('지도 캔버스에 aria 이름이 있고 키보드로 잡힌다', async ({ page }) => {
    await boot(page, MAP);
    await mapReady(page);
    const c = page.locator('#map-a canvas').first();
    await expect(c).toHaveAttribute('aria-label', /화살표 키로 이동/);
  });

  test('1280 · 1920 에서 가로 스크롤 0 · 판이 살아 있다', async ({ page }) => {
    for (const w of [1280, 1920]) {
      await page.setViewportSize({ width: w, height: 900 });
      await boot(page, withFarm('&left=off'));
      await layersOn(page);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
      expect((await page.locator('#map-a').boundingBox()).width).toBeGreaterThan(400);
    }
  });
});

/* ══ 16. E0-5 — 붕괴 처방 · 내려받기 3곳 · 정직화 · ?result= 수신 ═══════ */
test.describe('E0-5 붕괴 처방 · 내려받기 · 정직화', () => {
  const ratio = (page) => page.evaluate(() => {
    const c = document.querySelector('#map-a canvas').getBoundingClientRect(), m = document.querySelector('#mw').getBoundingClientRect();
    return (c.width * c.height) / (m.width * m.height);
  });

  test('1440×900 결과 켜기 → 표 펼치기 → 행 클릭: 지도 ≥ 콘텐츠 60 % · 탭 글자 세로 쌓임 0(M-01)', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await boot(page, MAP);
    await mapReady(page);
    await page.locator(`input[data-layer="${FARM}"]:not([data-sub])`).check();
    await layersOn(page);
    await page.locator('#mb-open').click();
    const tabs = await page.locator('.mb-t [data-ttab]').evaluateAll((b) => b.map((x) => { const r = x.getBoundingClientRect(); return [r.width, r.height]; }));
    expect(tabs).toHaveLength(3);
    for (const [w, h] of tabs) expect(h).toBeLessThan(w);             // 펼친 표의 탭 — 가로로 선다
    await page.locator('#tbody tr[data-row]').first().click();
    await expect(page.locator('#mw')).toHaveAttribute('data-side', 'info');
    await expect(page.locator('#mw')).toHaveAttribute('data-left', 'off');   // 좌 판은 띠로(fitLeft)
    await page.waitForFunction(() => document.querySelector('#mw-l').getBoundingClientRect().width < 40);
    await page.waitForTimeout(400);                                      // 폭 전이(180ms) 뒤 캔버스 resize
    expect(await ratio(page)).toBeGreaterThanOrEqual(0.6);
    const peekTabs = await page.locator('#mb [data-ttab]').evaluateAll((b) => b.map((x) => { const r = x.getBoundingClientRect(); return [r.width, r.height]; }));
    expect(peekTabs).toHaveLength(3);
    for (const [w, h] of peekTabs) expect(h).toBeLessThan(w);
    // 다음 행 › — 정보 판이 따라간다 · 닫으면 좌 판은 자동으로 접힌 것만 되돌아온다
    await page.locator('[data-peek="1"]').click();
    await expect(page.locator('.mb-peek .n').first()).toHaveText('2 / 2,098');
    await expect(page.locator('.mi h2')).toBeVisible();
    // peek 줄 — 고른 행 문구(읍면동 · 지번 · 클래스 · 면적 · 조치)는 말줄임 없이 온전히 보이고, 넘김 · 탭 3 · 표 펼치기는 판 안(재게이트)
    const peek = () => page.evaluate(() => { const el = document.querySelector('.mb-peek'), pr = el.getBoundingClientRect(), s = el.querySelector('.pk-s'), r = el.querySelector('.row');
      return { clip: s.scrollWidth - s.clientWidth + (r.scrollWidth - r.clientWidth), ellipsis: getComputedStyle(r).textOverflow, font: getComputedStyle(r).fontSize,
        act: /· \S+$/.test(r.textContent.trim()),
        out: [...el.querySelectorAll('[data-peek],[data-ttab],#mb-full')].filter((x) => { const q = x.getBoundingClientRect(); return q.left < pr.left - 1 || q.right > pr.right + 1 || q.bottom > pr.bottom + 1; }).length }; });
    expect(await peek()).toEqual({ clip: 0, ellipsis: 'clip', font: '15px', act: true, out: 0 });
    // 1280×720 — 한 줄에 안 서면 버튼들이 둘째 줄로 내려선다(문구 토막 0 · 글자 크기 그대로 · 버튼 3종 판 안)
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.waitForTimeout(400);
    expect(await peek()).toEqual({ clip: 0, ellipsis: 'clip', font: '15px', act: true, out: 0 });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.locator('#side-x').click();
    await expect(page.locator('#mw')).toHaveAttribute('data-left', 'on');
  });

  /* 범례(#legend) × 시점 스트립(#strip) 교차 면적 — 좌 판 폭 전이(180ms)가 끝난 뒤에 잰다(재게이트 3) */
  const legendStrip = (page) => page.evaluate(() => {
    const l = document.querySelector('#legend'), s = document.querySelector('#strip');
    if (!l || !s) return 0;
    const a = l.getBoundingClientRect(), c = s.getBoundingClientRect();
    return Math.max(0, Math.min(a.right, c.right) - Math.max(a.left, c.left)) * Math.max(0, Math.min(a.bottom, c.bottom) - Math.max(a.top, c.top));
  });
  for (const [vw, vh] of [[1440, 900], [1280, 720]]) {
  test(`판 셋 동시 금지 양방향 — 정보 판 열린 채 \`설정 패널 펼치기\` · 펴 둔 좌 판 뒤 행 고르기 · 범례×스트립 0 · ${vw}×${vh}(재게이트 must_fix 1 · 3)`, async ({ page }) => {
    await page.setViewportSize({ width: vw, height: vh });
    await boot(page, `${MAP}?on=${FARM}&fold=0`);
    await layersOn(page);
    await page.locator('#tbody tr[data-row]').first().click();
    await expect(page.locator('#mw')).toHaveAttribute('data-side', 'info');
    await expect(page.locator('#mw')).toHaveAttribute('data-left', 'off');
    // ① 좌 판을 펴면 정보 판이 먼저 닫힌다 — 표는 peek 이던 그대로 접힌다
    await page.locator('#l-open').click();
    await expect(page.locator('#mw')).toHaveAttribute('data-left', 'on');
    await expect(page.locator('#mw')).not.toHaveAttribute('data-side', 'info');
    await expect(page.locator('.mw-side .mi')).toHaveCount(0);
    await page.waitForFunction(() => document.querySelector('#mw-l').getBoundingClientRect().width > 300);
    await page.waitForTimeout(400);
    expect(await ratio(page)).toBeGreaterThanOrEqual(0.45);
    expect(await legendStrip(page)).toBe(0);                            // 전이 뒤 재배치 — 범례가 시점 그림을 덮지 않는다
    // ② 사용자가 펴 둔(pinned) 좌 판이라도 정보 판이 서면 띠로 접힌다
    await page.locator('#mb-open').click();
    await page.locator('#tbody tr[data-row]').nth(2).click();
    await expect(page.locator('#mw')).toHaveAttribute('data-side', 'info');
    await expect(page.locator('#mw')).toHaveAttribute('data-left', 'off');
    await page.waitForFunction(() => document.querySelector('#mw-l').getBoundingClientRect().width < 40);
    await page.waitForTimeout(400);
    expect(await ratio(page)).toBeGreaterThanOrEqual(vw === 1440 ? 0.6 : 0.5);   // 1280 정보 판은 peek 두 줄(0.545 · E0-5-close §3)
    // ③ `닫기`(#side-x) — 자동으로 접힌 좌 판이 되살아난다 · 전이 뒤 범례×스트립 0
    await page.locator('#side-x').click();
    await expect(page.locator('#mw')).toHaveAttribute('data-left', 'on');
    await page.waitForFunction(() => document.querySelector('#mw-l').getBoundingClientRect().width > 300);
    await page.waitForTimeout(400);
    expect(await legendStrip(page)).toBe(0);
    // ④ 표를 접으면 범례 · 시점 스트립이 다시 선다(판이 낮아 내렸던 1280 포함) — 교차 0
    await page.locator('#mb-fold').click();
    await page.waitForTimeout(300);
    await expect(page.locator('#legend')).toBeVisible();
    await expect(page.locator('#strip')).toBeVisible();
    expect(await legendStrip(page)).toBe(0);
  });
  }

  test('겹쳐보기 진입: 비교 판 자동 열림 0 · A ≥ 45 % · 비교 도구 14 전부 동작 · 비교 띠 상수 0(M-05 · M-07 · M-09)', async ({ page }) => {
    const errs = watch(page);
    await boot(page, `${MAP}?on=${FARM}&mode=overlay`);
    await page.waitForFunction(() => window.__lxMap?.B?.getStyle() != null, null, { timeout: 20000 });
    await expect(page.locator('#mw')).not.toHaveAttribute('data-side', 'info');
    await expect(page.locator('.mw-side .mi')).toHaveCount(0);
    await page.waitForTimeout(400);
    expect(await ratio(page)).toBeGreaterThanOrEqual(0.45);
    // 도구 14 — 전부 data-tool · 누르면 그 판에서 동작한다
    await expect(page.locator('.mw-tools [data-tool]')).toHaveCount(14);
    await expect(page.locator('.mw-tools button:not([data-tool])')).toHaveCount(0);
    await page.locator('#ov-b [data-tool="basemap"]').click();
    await expect(page.locator('#ov-b .mw-sub [data-base]')).toHaveCount(5);
    await page.locator('#ov-b [data-base="base"]').click();
    expect(await page.evaluate(() => window.__lxMap.B.getLayoutProperty('b-base', 'visibility'))).toBe('visible');
    await page.locator('#ov-b [data-tool="lx"]').click();
    await page.locator('#ov-b [data-clx="hyb"]').click();
    expect(await page.evaluate(() => window.__lxMap.B.getLayoutProperty('b-hyb', 'visibility'))).toBe('visible');
    await page.locator('#ov-a [data-tool="measure"]').click();
    await expect(page.locator('#ov-a .mw-sub [data-msr]')).toHaveCount(4);
    // 비교 띠 · 표 — 손으로 적은 2,098 · 0.62 km² · 드론 0
    await expect(page.locator('.mw-band').first()).toContainText('판독 결과 —');   // 2025.04 정사영상에서 판독한 결과는 없다
    await expect(page.locator('.mw-band').nth(1)).toContainText('변화 156');
    await page.locator('[data-cmp-open]').click();
    await expect(page.locator('#mw')).toHaveAttribute('data-side', 'info');
    const side = await page.locator('.mw-side').innerText();
    expect(side).not.toContain('2,098');
    expect(side).not.toContain('드론');                                      // imagery.js kind 는 `정사영상` — 센서 기록이 없다
    const km = await page.evaluate(async () => (await import('./map-data.js')).EPOCHS[0].areaKm2.toFixed(2));
    expect(side).toContain(`${km} km²`);                                      // 범위는 imagery.js bounds 에서 잰 값(손 상수 아님)
    expect(side).toContain('판독 결과');
    // `변경 ›` — 좌 판을 펴기 전에 비교 결과 판을 닫는다 · 두 표지 띠 교차 0 · 배지가 판독 결과 글자를 덮지 않는다(재판정)
    await page.locator('#ch-base').click();
    await expect(page.locator('#mw')).toHaveAttribute('data-left', 'on');
    await expect(page.locator('#mw')).not.toHaveAttribute('data-side', 'info');
    await page.waitForTimeout(500);
    expect(await ratio(page)).toBeGreaterThanOrEqual(0.45);
    const lay = await page.evaluate(() => {
      const X = (a, c) => Math.max(0, Math.min(a.right, c.right) - Math.max(a.left, c.left)) * Math.max(0, Math.min(a.bottom, c.bottom) - Math.max(a.top, c.top));
      const r = (s) => document.querySelector(s).getBoundingClientRect();
      const badge = [...document.querySelectorAll('.mv[data-ep]')].reduce((t, row) => { const k = row.querySelector('.mv-k'); return t + (k ? [...row.querySelectorAll('.mv-m')].reduce((u, m) => u + X(k.getBoundingClientRect(), m.getBoundingClientRect()), 0) : 0); }, 0);
      const scales = [...document.querySelectorAll('.mw-scale')].map((e) => { const q = e.getBoundingClientRect(); return q.height < q.width && q.height <= 30; });
      return { head: X(r('#ov-a .mw-ov--tl'), r('#ov-b .mw-ov--tl')), badge, scales };
    });
    expect(lay.head).toBe(0);
    expect(lay.badge).toBe(0);
    expect(lay.scales.every(Boolean)).toBe(true);
    // 좌 판이 펴진 채 `변화 결과 보기 ›` — 좌 판은 띠로 접히고 비교 결과 판만 선다(판 셋 금지 · 재게이트 must_fix 1)
    await page.locator('[data-cmp-open]').click();
    await expect(page.locator('#mw')).toHaveAttribute('data-side', 'info');
    await expect(page.locator('#mw')).toHaveAttribute('data-left', 'off');
    await page.waitForFunction(() => document.querySelector('#mw-l').getBoundingClientRect().width < 40);
    await page.waitForTimeout(400);
    expect(await ratio(page)).toBeGreaterThanOrEqual(0.45);
    // 반대 방향 — 비교 결과 판이 열린 채 `설정 패널 펼치기` 는 판을 먼저 닫는다
    await page.locator('#l-open').click();
    await expect(page.locator('#mw')).toHaveAttribute('data-left', 'on');
    await expect(page.locator('.mw-side .mi')).toHaveCount(0);
    await page.waitForTimeout(500);
    expect(await ratio(page)).toBeGreaterThanOrEqual(0.45);
    expect(errs).toEqual([]);
  });

  test('1280×720 겹쳐보기 좌 판 펼침 — 좌 판 · 비교 띠 가로 스크롤바 0 · 칸 경계선 잔상 0(재게이트 must_fix 2)', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await boot(page, `${MAP}?on=${FARM}&mode=overlay`);
    await page.waitForFunction(() => window.__lxMap?.B?.getStyle() != null, null, { timeout: 20000 });
    await page.locator('#ch-base').click();
    await expect(page.locator('#mw')).toHaveAttribute('data-left', 'on');
    await page.waitForTimeout(500);
    const r = await page.evaluate(() => {
      const lb = document.querySelector('#l-b'), cs = getComputedStyle(lb);
      const bars = [...document.querySelectorAll('#mw *')].filter((e) => /auto|scroll/.test(getComputedStyle(e).overflowX) && e.offsetParent && e.scrollWidth > e.clientWidth + 1).length;
      return { bars, lbOver: lb.scrollWidth - lb.clientWidth, rule: cs.columnRuleStyle, cols: cs.columnCount };
    });
    expect(r).toEqual({ bars: 0, lbOver: 0, rule: 'none', cols: 'auto' });
  });

  test('내려받기 3곳 — 내보내기 GeoJSON · 통계 CSV(BOM) · 보고서 CSV(BOM) 각 1건(M-03)', async ({ page }, info) => {
    const fill = async () => {
      const m = page.locator('.modal');
      await m.locator('#pl-ok').check(); await m.locator('#pl-name').fill('e2e 내려받기'); await m.locator('#pl-purpose').fill('검사');
      const dl = page.waitForEvent('download');
      await m.locator('.modal-f .btn').click();
      return dl;
    };
    const got = [];
    const keep = async (d) => {
      const f = info.outputPath(d.suggestedFilename()); await d.saveAs(f);
      const buf = readFileSync(f);
      got.push({ name: d.suggestedFilename(), bytes: buf.length, bom: buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF, text: buf.toString('utf8') });
    };
    // ① 지도 내보내기
    await boot(page, `${MAP}?on=${FARM}&fold=0`);
    await layersOn(page);
    await page.locator('#export').click();
    await keep(await fill());
    await expect(page.locator('#say')).toContainText('1개 파일이 내려갔습니다');
    // ② 통계 엑셀
    await boot(page, `${STATS}?result=${FARM}&left=off`);
    await layersOn(page);
    await page.locator('#st-dl').click();
    await keep(await fill());
    // ③ 보고서 엑셀(발급 내역 · 처리 완료 행)
    await boot(page, `${RLIST}?result=${FARM}&left=off`);
    await layersOn(page);
    await page.locator('.rp .dl').first().click();
    await keep(await fill());
    const log = got.map((g) => ({ name: g.name, bytes: g.bytes, bom: g.bom }));
    await info.attach('downloads.json', { body: JSON.stringify(log, null, 1), contentType: 'application/json' });
    console.log('E0-5 downloads', JSON.stringify(log));
    expect(got).toHaveLength(3);
    expect(got[0].name).toMatch(/\.geojson$/);
    expect(JSON.parse(got[0].text.replace(/^﻿/, '')).features.length).toBe(2098);
    expect(got[1].name).toMatch(/\.csv$/); expect(got[1].bom).toBe(true);
    expect(got[1].text).toContain('\r\n'); expect(got[1].text).toContain('운봉읍'); expect(got[1].text).toContain('합계');
    expect(got[2].name).toMatch(/\.csv$/); expect(got[2].bom).toBe(true);
    expect(got[2].text.split('\r\n')[0]).toContain('경작지 건수');
  });

  test('ximap.html?result=<id> → 자동 체크 · ?on= 정규화 · 개관에서 그 결과로 날아간다(C-23 · D-5)', async ({ page }) => {
    await boot(page, `${MAP}?result=${FARM}`);
    await mapReady(page);
    const z0 = await page.evaluate(() => window.__lxMap.A.getZoom());
    await expect(page.locator(`input[data-layer="${FARM}"]:not([data-sub])`)).toBeChecked();
    await page.waitForFunction(() => document.querySelector('#map-a').dataset.arrived != null, null, { timeout: 15000 });
    const z1 = await page.evaluate(() => window.__lxMap.A.getZoom());
    expect(z1 - z0).toBeGreaterThan(0.5);                                 // 개관(도 단위)에서 그 결과 범위로 들어간다
    const u = new globalThis.URL(page.url());
    expect(u.searchParams.get('on')).toBe(FARM);
    expect(u.searchParams.has('result')).toBe(false);
  });

  test('통계 정직화 — 시연 기준 disabled 2 · `다시 계산` 0 · 발급 폼 오류 해제 · 요청자 = 역할명(M-04 · M-08)', async ({ page }) => {
    await boot(page, `${STATS}?result=${FARM}&left=off`);
    await layersOn(page);
    await expect(page.locator('.dw-basis input[disabled]')).toHaveCount(2);
    await expect(page.locator('.dw-basis li[aria-disabled="true"]').first()).toContainText('시연 · 집계 자료 없음');
    // `시연` 은 줄마다 한 번 — 태그로만(라벨 접미와 태그가 겹쳐 두 번 서던 것 · 재게이트 must_fix 4)
    expect(await page.locator('.dw-basis li[aria-disabled="true"]').evaluateAll((l) => l.map((x) => (x.innerText.match(/시연/g) || []).length))).toEqual([1, 1]);
    await expect(page.locator('.dw-basis li[aria-disabled="true"] .tag').first()).toHaveText('시연 · 집계 자료 없음');
    await page.locator('#st-run').click();
    await expect(page.locator('#say')).toContainText('기준 · ');
    expect(await page.evaluate(() => document.body.innerText.includes('다시 계산'))).toBe(false);
    // 보고서 발급 폼 — 비우고 발급 → 오류 3 → 채우면 오류가 걷힌다
    await boot(page, `${RISSUE}?result=${FARM}&left=off`);
    await layersOn(page);
    await page.locator('#rp-title').fill('');
    await page.locator('#rp-cls-all').uncheck();
    await page.locator('#rp-emd-all').check();
    await page.locator('#rp-emd-all').uncheck();
    await page.locator('#rp-go').click();
    await expect(page.locator('.dw .err')).toHaveCount(3);
    await page.locator('#rp-title').fill('e2e 오류 해제');
    await page.locator('#rp-cls-all').check();
    await page.locator('.rp-emds [data-emd="운봉읍"]').check();
    await expect(page.locator('.dw .err')).toHaveCount(0);
    await page.locator('#rp-go').click();
    await page.waitForURL(/rtab=list/);
    await expect(page.locator('.rp .l1').first()).toContainText('요청자 LX 직원');
    await expect(page.locator('.rp .l1').first()).toContainText('2026-06-08');
  });
});
