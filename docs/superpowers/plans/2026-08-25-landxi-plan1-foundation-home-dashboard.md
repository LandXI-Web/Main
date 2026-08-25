# Land-XI 개편 계획 1 — 기반·쉘·홈·로그인·대시보드

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 새 디자인 시스템(토큰·컴포넌트·쉘·MapShell)을 세우고, 그 위에 홈(글로브 진입·스캔 렌즈·통합조사 시뮬레이터)·로그인·LX 관리자 대시보드를 실제 동작하는 정적 사이트로 구현한다.

**Architecture:** 빌드 없는 정적 사이트(`landxi/`). CSS 커스텀 프로퍼티 토큰 → 컴포넌트 CSS → 페이지 CSS 순의 단방향 캐스케이드. JS는 ES 모듈: `shell.js`가 레일·컨텍스트 바·2차 컬럼·푸터·팔레트·NotifyUI를 모든 페이지에 주입하고, `map/shell.js`가 MapLibre(또는 폴백 캔버스)를 초기화해 `window.LX.map` API를 노출한다. 페이지 스크립트(`pages/*.js`)는 이 두 API만 사용한다.

**Tech Stack:** HTML/CSS/ES Modules, MapLibre GL JS 5.x (CDN), ECharts 5.5 (CDN), Google Fonts(Gothic A1 / IBM Plex Sans KR / IBM Plex Mono), Node 24 `node --test`(단위), Playwright 1.62 + 시스템 Chrome(브라우저 테스트), 헤드리스 Chrome 스크린샷.

**Spec:** `docs/superpowers/specs/2026-08-25-landxi-redesign-design.md`

## Global Constraints

- 산출물 루트는 `landxi/`. 모든 경로는 상대 경로(GitHub Pages·file:// 모두 동작).
- 빌드 도구 금지. 외부 라이브러리는 CDN `<script>`/`<link>`만.
- 서체: `'Gothic A1'`(700/800/900) 표시, `'IBM Plex Sans KR'`(400/500/600) 본문 기준 14px, `'IBM Plex Mono'`(500) 데이터.
- 색 토큰 값은 스펙 4장 그대로: `--mist #E9EEF1`, `--ink #111C2D`, `--lx #2457D6`, `--lx-deep #193FA3`, `--lx-tint #E8EEFB`, `--ai #0FA9A0`, 상태 발견 `#F2622A` / 조치중 `#E3A008` / 완료 `#1E9E6A` / 보류 `#6B7A8C` / 오류 `#D93025` / 정보 `#2457D6`.
- 반경 6/10/14, 테두리 1px, 8px 그리드, 기준 폰트 14px.
- 상태 어휘는 `assets/js/ui/status.js`의 매핑만 사용(하드코딩 금지).
- 모든 인터랙션은 스펙 6장의 "유지되는 기능" 하나에 대응해야 한다. 기능 추가·삭제 금지.
- `prefers-reduced-motion: reduce`에서 앰비언트 모션 정지, 카메라는 `jumpTo`.
- 기존 딥링크 파라미터 유지: `?tab= ?domain= ?status= ?pid= ?job= ?embed=1`.
- 이모지 아이콘 금지 — `assets/icons.svg` 스프라이트만.
- 커밋 메시지는 한국어 요약 + `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- 브라우저 테스트는 `npx playwright test`(시스템 Chrome 채널), 단위 테스트는 `node --test tests/unit`.

---

## 파일 구조

```
landxi/
  home.html  index.html(→home.html로 리다이렉트)  login.html  dashboard.html
  assets/css/tokens.css        # 색·서체·형태·모션 토큰, 눈금자 그라데이션
  assets/css/base.css          # 리셋, 타이포 스케일, 유틸(.mono .eyebrow .sr-only)
  assets/css/components.css    # btn pill tabs card glass kpi dialog drawer list-header table
  assets/css/shell.css         # rail ctx secondary footer palette
  assets/css/map.css           # 지도 캔버스형 레이아웃, 상태 눈금줄, 도구 스트립, 슬라이더
  assets/css/pages/home.css  login.css  dashboard.css
  assets/icons.svg             # <symbol id="i-*"> 스프라이트
  assets/js/ui/status.js       # 상태 어휘 → 토큰 매핑 (순수 함수)
  assets/js/ui/icon.js         # icon(name,size) → <svg><use>
  assets/js/ui/dialog.js       # openDialog(), NotifyUI
  assets/js/ui/drawer.js       # Drawer(side) open/close
  assets/js/ui/tabs.js         # initTabs(root)
  assets/js/ui/kpi.js          # countUp(el)
  assets/js/ui/palette.js      # CommandPalette
  assets/js/shell.js           # mountShell(opts) — 레일·컨텍스트 바·2차 컬럼·푸터·embed
  assets/js/map/style.js       # buildStyle(tokens) → MapLibre 스타일 객체
  assets/js/map/fallback.js    # 절차 생성 캔버스 지도 (타일 불가 시)
  assets/js/map/shell.js       # createMap(container, opts) → LX.map API
  assets/js/map/rulebar.js     # 상태 눈금줄 (좌표·축척·촬영일·모델)
  assets/js/pages/home.js  home-lens.js  home-survey.js  login.js  dashboard.js  dashboard-coverage.js
  assets/data/surveys.js       # 통합조사 시뮬레이터 카드 7장
  assets/data/dashboard.js     # 큐·KPI·백본·스토리지·프로젝트 용량 목업
  assets/data/geo/korea-outline.geojson  sigungu-sample.geojson  orgs.geojson  detections-sample.geojson  projects-extent.geojson
  assets/images/               # 기존 사이트 이미지 복사
tools/serve.mjs                # 정적 서버 (테스트용)
tools/fetch-assets.mjs         # 기존 GitHub Pages에서 이미지·데이터 내려받기
tools/shot.mjs                 # 헤드리스 스크린샷 (Playwright)
tests/unit/*.test.mjs
tests/e2e/*.spec.mjs
playwright.config.mjs  package.json
```

---

### Task 1: 프로젝트 스캐폴드와 테스트 하네스

**Files:**
- Create: `package.json`, `playwright.config.mjs`, `tools/serve.mjs`, `tools/shot.mjs`, `tests/e2e/smoke.spec.mjs`, `landxi/index.html`, `landxi/home.html`(임시), `.gitignore`

**Interfaces:**
- Produces: `npm test`(단위+e2e), `npm run serve`(http://localhost:4173/landxi/), `node tools/shot.mjs <page> <out.png>`.

- [ ] **Step 1: package.json과 설정 작성**

```json
{
  "name": "landxi-redesign",
  "private": true,
  "type": "module",
  "scripts": {
    "serve": "node tools/serve.mjs",
    "test:unit": "node --test tests/unit",
    "test:e2e": "playwright test",
    "test": "npm run test:unit && npm run test:e2e",
    "shot": "node tools/shot.mjs"
  },
  "devDependencies": { "@playwright/test": "1.62.1" }
}
```

`playwright.config.mjs`:
```js
import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 30000,
  use: { channel: 'chrome', headless: true, baseURL: 'http://localhost:4173/landxi/', viewport: { width: 1440, height: 900 } },
  webServer: { command: 'node tools/serve.mjs', url: 'http://localhost:4173/landxi/home.html', reuseExistingServer: true },
});
```

`tools/serve.mjs` (외부 의존 없음):
```js
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const root = path.resolve('.'); const port = 4173;
const types = { '.html':'text/html; charset=utf-8', '.css':'text/css', '.js':'text/javascript', '.mjs':'text/javascript', '.json':'application/json', '.geojson':'application/geo+json', '.svg':'image/svg+xml', '.png':'image/png', '.jpg':'image/jpeg', '.ico':'image/x-icon' };
http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  const f = path.join(root, p);
  if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('404'); }
  res.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
}).listen(port, () => console.log('serve http://localhost:' + port + '/landxi/'));
```

`tools/shot.mjs`:
```js
import { chromium } from '@playwright/test';
const [page = 'home.html', out = 'shot.png', w = '1440', h = '900'] = process.argv.slice(2);
const b = await chromium.launch({ channel: 'chrome' });
const p = await b.newPage({ viewport: { width: +w, height: +h } });
await p.goto('http://localhost:4173/landxi/' + page, { waitUntil: 'networkidle' });
await p.waitForTimeout(1500);
await p.screenshot({ path: out, fullPage: true });
await b.close(); console.log('saved', out);
```

`.gitignore`: `node_modules/`, `test-results/`, `playwright-report/`, `shots/`

- [ ] **Step 2: 임시 페이지와 스모크 테스트**

`landxi/index.html`: `<!doctype html><meta http-equiv="refresh" content="0; url=home.html">`
`landxi/home.html`(임시): `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>Land-XI</title></head><body><h1 data-test="title">Land-XI</h1></body></html>`

`tests/e2e/smoke.spec.mjs`:
```js
import { test, expect } from '@playwright/test';
test('home loads with no console errors', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('home.html');
  await expect(page.locator('[data-test="title"]')).toBeVisible();
  expect(errors).toEqual([]);
});
```

- [ ] **Step 3: 설치·실행해 통과 확인**

Run: `npm install && npm run test:e2e`
Expected: `1 passed`

- [ ] **Step 4: 커밋**

```bash
git add -A && git commit -m "chore: 프로젝트 스캐폴드와 Playwright/Node 테스트 하네스"
```

---

### Task 2: 디자인 토큰·베이스·상태 매핑

**Files:**
- Create: `landxi/assets/css/tokens.css`, `landxi/assets/css/base.css`, `landxi/assets/js/ui/status.js`
- Test: `tests/unit/status.test.mjs`, `tests/e2e/tokens.spec.mjs`

**Interfaces:**
- Produces: CSS 변수(아래 전체 목록), `statusOf(domain, raw) → { key, label, color, cssVar }`, `STATUS_KEYS = ['found','doing','done','hold','error','info']`.

- [ ] **Step 1: 단위 테스트 작성**

`tests/unit/status.test.mjs`:
```js
import test from 'node:test'; import assert from 'node:assert/strict';
import { statusOf, STATUS_KEYS } from '../../landxi/assets/js/ui/status.js';
test('analysis job statuses map to the 6 keys', () => {
  assert.equal(statusOf('job', 'PENDING').key, 'found');
  assert.equal(statusOf('job', 'RUNNING').key, 'doing');
  assert.equal(statusOf('job', 'SUCCEEDED').key, 'done');
  assert.equal(statusOf('job', 'FAILED').key, 'error');
});
test('card publishing statuses', () => {
  assert.equal(statusOf('card', '대기').key, 'found');
  assert.equal(statusOf('card', '검토중').key, 'doing');
  assert.equal(statusOf('card', '승인').key, 'done');
  assert.equal(statusOf('card', '반려').key, 'error');
  assert.equal(statusOf('card', '비공개').key, 'hold');
});
test('upload statuses', () => {
  assert.equal(statusOf('upload', '대기중').key, 'hold');
  assert.equal(statusOf('upload', '업로드중').key, 'doing');
  assert.equal(statusOf('upload', '완료').key, 'done');
  assert.equal(statusOf('upload', '중단됨').key, 'error');
});
test('every key has label, color and cssVar', () => {
  for (const k of STATUS_KEYS) { const s = statusOf('key', k); assert.ok(s.label && /^#/.test(s.color) && s.cssVar.startsWith('--s-')); }
});
test('unknown raw value falls back to hold', () => { assert.equal(statusOf('job', '???').key, 'hold'); });
```

- [ ] **Step 2: 실패 확인** — Run: `npm run test:unit` → Expected: FAIL (module not found)

- [ ] **Step 3: status.js 구현**

```js
export const STATUS_KEYS = ['found', 'doing', 'done', 'hold', 'error', 'info'];
const META = {
  found: { label: '발견',   color: '#F2622A', cssVar: '--s-found' },
  doing: { label: '진행중', color: '#E3A008', cssVar: '--s-doing' },
  done:  { label: '완료',   color: '#1E9E6A', cssVar: '--s-done'  },
  hold:  { label: '보류',   color: '#6B7A8C', cssVar: '--s-hold'  },
  error: { label: '오류',   color: '#D93025', cssVar: '--s-error' },
  info:  { label: '정보',   color: '#2457D6', cssVar: '--s-info'  },
};
const MAP = {
  job:    { PENDING: ['found', '대기'], RUNNING: ['doing', '처리중'], SUCCEEDED: ['done', '처리 완료'], FAILED: ['error', '처리 실패'] },
  card:   { '대기': ['found', '대기'], '검토중': ['doing', '검토중'], '승인': ['done', '승인'], '반려': ['error', '반려'], '비공개': ['hold', '비공개'], '공개': ['done', '공개'] },
  upload: { '대기중': ['hold', '대기중'], '일시정지': ['hold', '일시정지'], '업로드중': ['doing', '업로드중'], '완료': ['done', '완료'], '중단됨': ['error', '중단됨'] },
  user:   { '정상': ['done', '정상'], '승인 대기': ['found', '승인 대기'], '거부': ['error', '거부'], '휴면': ['hold', '휴면'] },
  inquiry:{ '미답변': ['found', '미답변'], '답변 완료': ['done', '답변 완료'] },
  key:    Object.fromEntries(STATUS_KEYS.map(k => [k, [k, META[k].label]])),
};
export function statusOf(domain, raw) {
  const hit = (MAP[domain] || {})[raw];
  const key = hit ? hit[0] : 'hold';
  return { key, label: hit ? hit[1] : String(raw ?? ''), ...META[key] };
}
```

- [ ] **Step 4: 통과 확인** — Run: `npm run test:unit` → Expected: 5 passed

- [ ] **Step 5: tokens.css 작성**

```css
:root{
  /* 색 */
  --mist:#E9EEF1; --surface:#FFFFFF; --glass:rgba(255,255,255,.82); --glass-border:rgba(255,255,255,.75);
  --ink:#111C2D; --ink-2:rgba(17,28,45,.68); --ink-3:rgba(17,28,45,.48);
  --line:rgba(17,28,45,.10); --line-strong:rgba(17,28,45,.18);
  --lx:#2457D6; --lx-deep:#193FA3; --lx-tint:#E8EEFB; --lx-rgb:36,87,214;
  --ai:#0FA9A0; --ai-soft:rgba(15,169,160,.16);
  --s-found:#F2622A; --s-doing:#E3A008; --s-done:#1E9E6A; --s-hold:#6B7A8C; --s-error:#D93025; --s-info:#2457D6;
  /* 서체 */
  --f-display:'Gothic A1',system-ui,sans-serif; --f-body:'IBM Plex Sans KR',system-ui,sans-serif; --f-mono:'IBM Plex Mono',ui-monospace,monospace;
  --fs-12:12px; --fs-13:13px; --fs-14:14px; --fs-16:16px; --fs-20:20px; --fs-24:24px; --fs-32:32px; --fs-44:44px;
  /* 형태 */
  --r-ctl:6px; --r-card:10px; --r-float:14px;
  --sh-card:0 1px 2px rgba(17,28,45,.06); --sh-float:0 10px 30px rgba(17,28,45,.10); --sh-modal:0 24px 60px rgba(17,28,45,.18);
  --sp-1:8px; --sp-2:16px; --sp-3:24px; --sp-4:32px;
  /* 쉘 */
  --rail-w:64px; --ctx-h:48px; --secondary-w:232px; --panel-w:392px; --rulebar-h:36px;
  /* 시그니처 눈금자 */
  --rule:repeating-linear-gradient(90deg,var(--line-strong) 0 1px,transparent 1px 10px),repeating-linear-gradient(90deg,var(--ink) 0 1px,transparent 1px 50px);
  --rule-size:10px 3px,50px 5px;
  /* 모션 */
  --ease:cubic-bezier(.2,.8,.2,1); --t-fast:.15s; --t-base:.3s; --t-cam:1.2s;
}
```

- [ ] **Step 6: base.css 작성**

```css
*,*::before,*::after{box-sizing:border-box}
html{font-size:var(--fs-14)}
body{margin:0;background:var(--mist);color:var(--ink);font-family:var(--f-body);line-height:1.55;font-variant-numeric:tabular-nums;-webkit-font-smoothing:antialiased}
a{color:inherit;text-decoration:none} button,input,select,textarea{font:inherit;color:inherit} button{cursor:pointer}
h1,h2,h3,h4{font-family:var(--f-display);letter-spacing:-.02em;line-height:1.15;margin:0;text-wrap:balance}
h1{font-size:var(--fs-32);font-weight:800} h2{font-size:var(--fs-24);font-weight:800} h3{font-size:var(--fs-16);font-weight:700} h4{font-size:var(--fs-14);font-weight:700}
.display-44{font-family:var(--f-display);font-size:var(--fs-44);font-weight:900;letter-spacing:-.03em;line-height:1.1}
.mono{font-family:var(--f-mono);font-weight:500}
.eyebrow{font-family:var(--f-mono);font-size:var(--fs-12);letter-spacing:.08em;color:var(--ink-3);text-transform:uppercase}
.muted{color:var(--ink-2)} .faint{color:var(--ink-3)} .small{font-size:var(--fs-13)} .xsmall{font-size:var(--fs-12)}
.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
:focus-visible{outline:2px solid var(--lx);outline-offset:2px}
[hidden]{display:none!important}
.rule{position:relative}
.rule::before{content:"";position:absolute;left:0;right:0;top:0;height:5px;background:var(--rule);background-size:var(--rule-size);background-repeat:repeat-x;background-position:0 100%,0 100%;transform-origin:left;animation:rule-draw .6s var(--ease) both}
@keyframes rule-draw{from{transform:scaleX(0)}to{transform:scaleX(1)}}
@media (prefers-reduced-motion:reduce){.rule::before{animation:none} *{scroll-behavior:auto!important}}
```

- [ ] **Step 7: e2e 토큰 테스트**

`tests/e2e/tokens.spec.mjs`:
```js
import { test, expect } from '@playwright/test';
test('tokens resolve and fonts load', async ({ page }) => {
  await page.goto('home.html');
  const v = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--lx').trim());
  expect(v).toBe('#2457D6');
  await page.waitForFunction(() => document.fonts.check('700 16px "Gothic A1"'));
});
```
`landxi/home.html`(임시)의 `<head>`에 Google Fonts 링크와 `tokens.css`, `base.css`를 추가한다:
```html
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Gothic+A1:wght@700;800;900&family=IBM+Plex+Sans+KR:wght@400;500;600&family=IBM+Plex+Mono:wght@500&display=swap">
<link rel="stylesheet" href="assets/css/tokens.css"><link rel="stylesheet" href="assets/css/base.css">
```

- [ ] **Step 8: 실행** — Run: `npm test` → Expected: unit 5 passed, e2e 2 passed

- [ ] **Step 9: 커밋** — `git add -A && git commit -m "feat: 디자인 토큰·베이스 스타일·상태 어휘 매핑"`

---

### Task 3: 아이콘 스프라이트와 기본 컴포넌트 (Button·Pill·Tabs·Card·Glass·KPI·ListHeader·Table)

**Files:**
- Create: `landxi/assets/icons.svg`, `landxi/assets/js/ui/icon.js`, `landxi/assets/js/ui/tabs.js`, `landxi/assets/js/ui/kpi.js`, `landxi/assets/css/components.css`, `landxi/dev/components.html`(컴포넌트 갤러리, 테스트 대상)
- Test: `tests/e2e/components.spec.mjs`

**Interfaces:**
- Produces: `icon(name, size=18) → string`(`<svg class="ic" width=… ><use href="assets/icons.svg#i-name"/></svg>`), `initTabs(root)`(`[role=tablist]` 안의 `[role=tab]` ↔ `[role=tabpanel]` 전환, `tabchange` 이벤트 `{id}`), `countUp(el, {duration=1200})`(`data-n` 목표값), 클래스 `.btn .btn--primary|secondary|ghost|danger .btn--sm|lg`, `.pill[data-status=key]`, `.tabs .tab[aria-selected]`, `.card .card__head .card__title .card__actions .card__body`, `.glass`, `.kpi .kpi__label .kpi__value .kpi__sub`, `.list-header`, `.chip[aria-pressed]`, `.table`, `.paginator`.

- [ ] **Step 1: 스프라이트 작성** — `assets/icons.svg`에 `<svg xmlns="http://www.w3.org/2000/svg"><symbol id="i-dashboard" viewBox="0 0 24 24">…</symbol>…</svg>` 형식으로 다음 24개: `dashboard project data card run map settings help user bell search close chevron-down chevron-right plus check x-mark download upload layers globe ruler pen refresh info`. 모두 stroke 1.75, `fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"`. (경로는 Feather 아이콘 세트의 해당 아이콘을 손으로 옮긴다; 예: `i-search` = `<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>`)

- [ ] **Step 2: icon.js / tabs.js / kpi.js**

```js
// icon.js
export function icon(name, size = 18) {
  return `<svg class="ic" width="${size}" height="${size}" aria-hidden="true"><use href="${base()}assets/icons.svg#i-${name}"></use></svg>`;
}
function base() { return document.documentElement.dataset.base || ''; }
```
```js
// tabs.js
export function initTabs(root) {
  const tabs = [...root.querySelectorAll('[role=tab]')];
  const select = (tab) => {
    tabs.forEach(t => { const on = t === tab; t.setAttribute('aria-selected', on); t.tabIndex = on ? 0 : -1;
      const p = document.getElementById(t.getAttribute('aria-controls')); if (p) p.hidden = !on; });
    root.dispatchEvent(new CustomEvent('tabchange', { detail: { id: tab.id, controls: tab.getAttribute('aria-controls') }, bubbles: true }));
  };
  tabs.forEach(t => { t.addEventListener('click', () => select(t));
    t.addEventListener('keydown', e => { const i = tabs.indexOf(t); if (e.key === 'ArrowRight') { tabs[(i + 1) % tabs.length].focus(); select(tabs[(i + 1) % tabs.length]); } if (e.key === 'ArrowLeft') { tabs[(i - 1 + tabs.length) % tabs.length].focus(); select(tabs[(i - 1 + tabs.length) % tabs.length]); } }); });
  const initial = tabs.find(t => t.getAttribute('aria-selected') === 'true') || tabs[0]; if (initial) select(initial);
  return { select: (id) => select(tabs.find(t => t.id === id)) };
}
```
```js
// kpi.js
export function countUp(el, { duration = 1200 } = {}) {
  const n = Number(el.dataset.n); const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const text = el.querySelector('.kpi__num') || el; const t0 = performance.now(); const d = reduce ? 0 : duration;
  const fmt = (v) => Math.round(v).toLocaleString('ko-KR');
  (function tick(now) { const p = d ? Math.min(1, (now - t0) / d) : 1; text.textContent = fmt(n * (1 - Math.pow(1 - p, 3))); if (p < 1) requestAnimationFrame(tick); })(t0);
}
export function countUpAll(root = document) { root.querySelectorAll('[data-n]').forEach(el => countUp(el)); }
```

- [ ] **Step 3: components.css** — 핵심 규칙(전부 작성):

```css
.ic{display:inline-block;vertical-align:-3px;flex:none}
/* Button */
.btn{display:inline-flex;align-items:center;gap:8px;height:38px;padding:0 16px;border-radius:var(--r-ctl);border:1px solid transparent;font-weight:600;font-size:var(--fs-14);background:var(--surface);color:var(--ink);transition:background var(--t-fast),border-color var(--t-fast),transform var(--t-fast)}
.btn--primary{background:var(--lx);color:#fff}.btn--primary:hover{background:var(--lx-deep)}
.btn--secondary{border-color:var(--line-strong)}.btn--secondary:hover{border-color:var(--lx);color:var(--lx)}
.btn--ghost{background:transparent;color:var(--ink-2)}.btn--ghost:hover{background:rgba(17,28,45,.06)}
.btn--danger{border-color:var(--s-error);color:var(--s-error)}.btn--danger:hover{background:var(--s-error);color:#fff}
.btn--sm{height:30px;padding:0 12px;font-size:var(--fs-13)} .btn--lg{height:44px;padding:0 20px} .btn--block{width:100%;justify-content:center}
.btn:disabled{opacity:.45;cursor:not-allowed}
/* Pill */
.pill{display:inline-flex;align-items:center;gap:6px;font-size:var(--fs-12);font-weight:600;padding:2px 10px 2px 8px;border-radius:999px;--c:var(--s-hold);background:color-mix(in srgb,var(--c) 12%,#fff);color:color-mix(in srgb,var(--c) 75%,#000)}
.pill::before{content:"";width:7px;height:7px;border-radius:50%;background:var(--c)}
.pill[data-status=found]{--c:var(--s-found)}.pill[data-status=doing]{--c:var(--s-doing)}.pill[data-status=done]{--c:var(--s-done)}.pill[data-status=hold]{--c:var(--s-hold)}.pill[data-status=error]{--c:var(--s-error)}.pill[data-status=info]{--c:var(--s-info)}
/* Tabs (세그먼트) */
.tabs{display:inline-flex;gap:2px;padding:3px;border-radius:9px;background:rgba(17,28,45,.06)}
.tab{height:32px;padding:0 14px;border:0;border-radius:7px;background:transparent;font-weight:600;font-size:var(--fs-13);color:var(--ink-2);display:inline-flex;align-items:center;gap:6px}
.tab[aria-selected=true]{background:var(--surface);color:var(--ink);box-shadow:var(--sh-card)}
.tabs--block{display:flex}.tabs--block .tab{flex:1;justify-content:center}
/* Card / Glass */
.card{background:var(--surface);border:1px solid var(--line);border-radius:var(--r-card);box-shadow:var(--sh-card)}
.glass{background:var(--glass);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);border:1px solid var(--glass-border);border-radius:var(--r-float);box-shadow:var(--sh-float)}
.card__head{display:flex;align-items:center;gap:10px;padding:14px 18px 0}
.card__title{font-family:var(--f-display);font-size:var(--fs-16);font-weight:700;display:flex;align-items:center;gap:8px}
.card__title .count{font:500 var(--fs-12) var(--f-mono);color:var(--ink-3)}
.card__actions{margin-left:auto;display:flex;gap:8px;align-items:center}
.card__body{padding:12px 18px 16px}
.link{color:var(--lx);font-weight:600;font-size:var(--fs-13)}
/* KPI */
.kpi{position:relative;padding:20px 14px 12px;cursor:default}
.kpi::before{content:"";position:absolute;left:12px;right:12px;top:8px;height:5px;background:var(--rule);background-size:var(--rule-size);background-repeat:repeat-x;background-position:0 100%,0 100%;opacity:.6}
.kpi__label{font-size:var(--fs-12);color:var(--ink-2)}
.kpi__value{font-family:var(--f-display);font-size:28px;font-weight:800;letter-spacing:-.025em;line-height:1.05;margin-top:2px}
.kpi__value .unit{font:500 var(--fs-12) var(--f-body);color:var(--ink-3);margin-left:3px}
.kpi__sub{font-size:var(--fs-12);color:var(--ink-3);margin-top:3px}
.kpi--hot .kpi__value{color:var(--s-found)}
.kpi[data-interactive]{cursor:pointer;transition:transform var(--t-fast),box-shadow var(--t-fast)}.kpi[data-interactive]:hover{transform:translateY(-2px);box-shadow:0 14px 34px rgba(17,28,45,.14)}
/* ListHeader / Chip */
.list-header{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.chip{height:28px;padding:0 12px;border-radius:999px;border:1px solid var(--line-strong);background:var(--surface);font-size:var(--fs-13);font-weight:600;color:var(--ink-2)}
.chip[aria-pressed=true]{background:var(--lx);border-color:var(--lx);color:#fff}
.list-header__spacer{flex:1}
.icon-btn{width:32px;height:32px;border-radius:8px;border:1px solid var(--line);background:var(--surface);display:inline-grid;place-items:center;color:var(--ink-2)}.icon-btn:hover{color:var(--lx)}
.search-panel{margin-top:10px;padding:12px;border:1px solid var(--line);border-radius:var(--r-card);background:var(--surface);display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px}
.field{display:flex;flex-direction:column;gap:4px;font-size:var(--fs-12);color:var(--ink-2)}
.input,.select{height:36px;padding:0 10px;border:1px solid var(--line-strong);border-radius:var(--r-ctl);background:var(--surface);font-size:var(--fs-14);color:var(--ink)}
.input:focus,.select:focus{border-color:var(--lx);outline:0;box-shadow:0 0 0 3px rgba(var(--lx-rgb),.15)}
/* Table */
.table{width:100%;border-collapse:collapse;font-size:var(--fs-13)}
.table th{text-align:left;font-weight:600;font-size:var(--fs-12);color:var(--ink-3);padding:8px 10px;border-bottom:1px solid var(--line-strong);letter-spacing:.02em}
.table td{padding:10px;border-bottom:1px solid var(--line)} .table tr:hover td{background:rgba(17,28,45,.03)}
.table .num{font-family:var(--f-mono);text-align:right}
.paginator{display:flex;align-items:center;gap:6px;margin-top:12px;font-size:var(--fs-13)}
.paginator .pg{height:30px;min-width:30px;padding:0 8px;border:1px solid var(--line);border-radius:6px;background:var(--surface)}
.paginator .pg[aria-current=page]{background:var(--lx);border-color:var(--lx);color:#fff}
.paginator .total{margin-left:auto;color:var(--ink-2)}
```

- [ ] **Step 4: 갤러리 페이지 `landxi/dev/components.html`** — 위 클래스마다 실물 예시 하나씩(버튼 4종×3크기, 필 6종, 탭 3개+패널, 카드, 글래스, KPI 4개 `data-n`, 리스트헤더+칩+검색 패널, 표+페이지네이터). 스크립트: `import {initTabs} from '../assets/js/ui/tabs.js'; import {countUpAll} from '../assets/js/ui/kpi.js'; document.querySelectorAll('.tabs').forEach(initTabs); countUpAll();` `<html data-base="../">`.

- [ ] **Step 5: e2e 테스트** `tests/e2e/components.spec.mjs`:
```js
import { test, expect } from '@playwright/test';
test('tabs switch panels and are keyboard navigable', async ({ page }) => {
  await page.goto('dev/components.html');
  const t2 = page.locator('[role=tab]').nth(1); await t2.click();
  await expect(t2).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#' + await t2.getAttribute('aria-controls'))).toBeVisible();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('[role=tab]').nth(2)).toHaveAttribute('aria-selected', 'true');
});
test('kpi counts up to data-n', async ({ page }) => {
  await page.goto('dev/components.html');
  await page.waitForTimeout(1500);
  await expect(page.locator('.kpi').first().locator('.kpi__num')).toHaveText('21');
});
test('pill colors follow status tokens', async ({ page }) => {
  await page.goto('dev/components.html');
  const c = await page.locator('.pill[data-status=done]').evaluate(e => getComputedStyle(e).getPropertyValue('--c').trim());
  expect(c).toBe('var(--s-done)');
});
test('icon sprite renders', async ({ page }) => {
  await page.goto('dev/components.html');
  const box = await page.locator('svg.ic').first().boundingBox(); expect(box.width).toBeGreaterThan(10);
});
```

- [ ] **Step 6: 실행** — `npm run test:e2e` → Expected: all passed
- [ ] **Step 7: 커밋** — `git add -A && git commit -m "feat: 아이콘 스프라이트와 기본 컴포넌트(버튼·필·탭·카드·KPI·리스트헤더·표)"`

---

### Task 4: Dialog·NotifyUI·Drawer

**Files:**
- Create: `landxi/assets/js/ui/dialog.js`, `landxi/assets/js/ui/drawer.js`; Modify: `components.css`, `dev/components.html`
- Test: `tests/e2e/dialog.spec.mjs`

**Interfaces:**
- Produces: `openDialog({title, body(html|Node), size='md'|'sm'|'lg'|'full', actions:[{label, kind, value, primary}], onClose}) → Promise<value|null>`; `NotifyUI.alert(msg,title)`, `NotifyUI.confirm(msg,title) → Promise<boolean>`, `NotifyUI.toast(msg,{type:'info'|'success'|'warn'|'error', ms=2600})`, `NotifyUI.success/warn/error/info(msg)`; `createDrawer({side:'right'|'bottom', width=392, height=280}) → {el, open(html), close(), toggle()}`.

- [ ] **Step 1: 테스트**
```js
import { test, expect } from '@playwright/test';
test('confirm resolves true/false and traps focus', async ({ page }) => {
  await page.goto('dev/components.html');
  const p = page.evaluate(() => window.NotifyUI.confirm('삭제할까요?', '확인'));
  await expect(page.locator('dialog[open] .dialog__title')).toHaveText('확인');
  await page.locator('dialog[open] [data-value=true]').click();
  expect(await p).toBe(true);
});
test('toast appears and disappears', async ({ page }) => {
  await page.goto('dev/components.html');
  await page.evaluate(() => window.NotifyUI.toast('저장됨', { type: 'success', ms: 500 }));
  await expect(page.locator('.toast')).toBeVisible();
  await expect(page.locator('.toast')).toHaveCount(0, { timeout: 2000 });
});
test('drawer opens right side with content', async ({ page }) => {
  await page.goto('dev/components.html');
  await page.evaluate(() => window.__drawer.open('<p data-test=d>상세</p>'));
  await expect(page.locator('.drawer[data-open=true] [data-test=d]')).toBeVisible();
});
```
- [ ] **Step 2: 실패 확인** — `npm run test:e2e -- dialog` → FAIL

- [ ] **Step 3: dialog.js**
```js
import { icon } from './icon.js';
export function openDialog({ title = '', body = '', size = 'md', actions = [], onClose } = {}) {
  return new Promise(resolve => {
    const d = document.createElement('dialog'); d.className = `dialog dialog--${size}`;
    d.innerHTML = `<form method="dialog" class="dialog__form"><header class="dialog__head"><h3 class="dialog__title"></h3><button type="button" class="icon-btn dialog__close" aria-label="닫기">${icon('close', 16)}</button></header><div class="dialog__body"></div><footer class="dialog__foot"></footer></form>`;
    d.querySelector('.dialog__title').textContent = title;
    const b = d.querySelector('.dialog__body'); typeof body === 'string' ? (b.innerHTML = body) : b.append(body);
    const f = d.querySelector('.dialog__foot');
    actions.forEach(a => { const btn = document.createElement('button'); btn.type = 'button'; btn.className = `btn btn--${a.kind || (a.primary ? 'primary' : 'secondary')}`; btn.textContent = a.label; btn.dataset.value = String(a.value); btn.addEventListener('click', () => finish(a.value)); f.append(btn); });
    if (!actions.length) f.hidden = true;
    const finish = (v) => { d.close(); d.remove(); onClose?.(v); resolve(v); };
    d.querySelector('.dialog__close').addEventListener('click', () => finish(null));
    d.addEventListener('cancel', e => { e.preventDefault(); finish(null); });
    d.addEventListener('click', e => { if (e.target === d) finish(null); });
    document.body.append(d); d.showModal(); (f.querySelector('.btn--primary') || d.querySelector('.dialog__close')).focus();
  });
}
function toast(message, { type = 'info', ms = 2600 } = {}) {
  let host = document.querySelector('.toast-host'); if (!host) { host = document.createElement('div'); host.className = 'toast-host'; document.body.append(host); }
  const t = document.createElement('div'); t.className = `toast toast--${type}`; t.setAttribute('role', 'status'); t.textContent = message; host.append(t);
  setTimeout(() => { t.classList.add('toast--out'); setTimeout(() => t.remove(), 250); }, ms);
}
export const NotifyUI = {
  alert: (m, title = '알림') => openDialog({ title, body: `<p>${m}</p>`, size: 'sm', actions: [{ label: '확인', value: true, primary: true }] }),
  confirm: (m, title = '확인') => openDialog({ title, body: `<p>${m}</p>`, size: 'sm', actions: [{ label: '취소', value: false }, { label: '확인', value: true, primary: true }] }).then(v => v === true),
  toast, info: m => toast(m, { type: 'info' }), success: m => toast(m, { type: 'success' }), warn: m => toast(m, { type: 'warn' }), error: m => toast(m, { type: 'error' }),
};
window.NotifyUI = NotifyUI; window.openDialog = openDialog;
```
- [ ] **Step 4: drawer.js**
```js
export function createDrawer({ side = 'right', width = 392, height = 280, host = document.body } = {}) {
  const el = document.createElement('aside'); el.className = `drawer drawer--${side}`; el.dataset.open = 'false';
  el.style.setProperty('--w', width + 'px'); el.style.setProperty('--h', height + 'px');
  el.innerHTML = `<div class="drawer__body"></div>`; host.append(el);
  const api = { el, open(html) { const b = el.querySelector('.drawer__body'); typeof html === 'string' ? (b.innerHTML = html) : (b.replaceChildren(html)); el.dataset.open = 'true'; return api; }, close() { el.dataset.open = 'false'; return api; }, toggle() { el.dataset.open = el.dataset.open === 'true' ? 'false' : 'true'; return api; } };
  return api;
}
```
- [ ] **Step 5: CSS 추가(components.css)**
```css
.dialog{border:0;padding:0;border-radius:var(--r-float);box-shadow:var(--sh-modal);background:var(--surface);width:min(92vw,var(--dw,560px));color:var(--ink)}
.dialog--sm{--dw:420px}.dialog--lg{--dw:820px}.dialog--full{--dw:96vw;height:92vh}
.dialog::backdrop{background:rgba(17,28,45,.35);backdrop-filter:blur(2px)}
.dialog__head{display:flex;align-items:center;gap:10px;padding:16px 18px 0}.dialog__head .icon-btn{margin-left:auto}
.dialog__body{padding:12px 18px}.dialog__foot{display:flex;justify-content:flex-end;gap:8px;padding:0 18px 16px}
.toast-host{position:fixed;right:20px;bottom:20px;display:flex;flex-direction:column;gap:8px;z-index:1000}
.toast{background:var(--ink);color:#fff;padding:10px 14px;border-radius:10px;font-size:var(--fs-13);box-shadow:var(--sh-float);animation:toast-in .25s var(--ease)}
.toast--success{border-left:3px solid var(--s-done)}.toast--warn{border-left:3px solid var(--s-doing)}.toast--error{border-left:3px solid var(--s-error)}.toast--out{opacity:0;transition:opacity .25s}
@keyframes toast-in{from{opacity:0;transform:translateY(6px)}}
.drawer{position:absolute;z-index:20;background:var(--glass);backdrop-filter:blur(14px);border:1px solid var(--glass-border);box-shadow:var(--sh-float);transition:transform var(--t-base) var(--ease)}
.drawer--right{top:12px;bottom:12px;right:12px;width:var(--w);border-radius:var(--r-float);transform:translateX(calc(100% + 24px))}
.drawer--bottom{left:12px;right:12px;bottom:12px;height:var(--h);border-radius:var(--r-float);transform:translateY(calc(100% + 24px))}
.drawer[data-open=true]{transform:none}.drawer__body{padding:16px;height:100%;overflow:auto}
```
- [ ] **Step 6: 갤러리에 버튼 추가**(alert/confirm/toast/drawer 호출, `window.__drawer = createDrawer(...)`) → `npm run test:e2e` PASS
- [ ] **Step 7: 커밋** — `git commit -am "feat: Dialog·NotifyUI·Drawer 컴포넌트"` (신규 파일 add 포함)

---

### Task 5: 쉘 (레일·컨텍스트 바·2차 컬럼·푸터·embed)

**Files:**
- Create: `landxi/assets/js/shell.js`, `landxi/assets/css/shell.css`, `landxi/dev/shell.html`
- Test: `tests/e2e/shell.spec.mjs`

**Interfaces:**
- Produces: `mountShell({ active:'dashboard'|'project'|'data'|'card'|'run'|'map'|'admin'|'support', crumb:['대시보드','관리자'], secondary?: [{group:'Project', items:[{label, href, active}]}], footer:true|false, mapPage:false })`. 마크업: `<body class="has-shell [is-map]">` 안에 `<nav class="rail">`, `<header class="ctx">`, `<aside class="secondary">`(옵션), `<main id="page">`(기존 본문을 이 안으로 이동), `<footer class="gov-footer">`. `?embed=1`이면 rail/ctx/footer 미생성 + `body.is-embed`. 로그인 상태 `localStorage.lx_logged_in==='1'` 아니면 `login.html?next=`로 이동(홈·로그인 제외). `window.LX = { shell:{ setCrumb(arr), notify(count) } }`.

- [ ] **Step 1: 테스트**
```js
import { test, expect } from '@playwright/test';
test.beforeEach(async ({ page }) => { await page.addInitScript(() => localStorage.setItem('lx_logged_in', '1')); });
test('rail has 9 items grouped BUILD/USE and marks active', async ({ page }) => {
  await page.goto('dev/shell.html');
  await expect(page.locator('.rail__item')).toHaveCount(9);
  await expect(page.locator('.rail__group')).toHaveText(['BUILD', 'USE']);
  await expect(page.locator('.rail__item[aria-current=page]')).toHaveAttribute('data-menu', 'dashboard');
});
test('ctx bar shows org, crumb, search, bell, user', async ({ page }) => {
  await page.goto('dev/shell.html');
  await expect(page.locator('.ctx__org')).toContainText('한국국토정보공사');
  await expect(page.locator('.ctx__crumb')).toContainText('관리자');
  await expect(page.locator('.ctx__search')).toBeVisible();
  await expect(page.locator('.ctx__bell .badge')).toHaveText('3');
});
test('embed=1 hides shell chrome', async ({ page }) => {
  await page.goto('dev/shell.html?embed=1');
  await expect(page.locator('.rail')).toHaveCount(0);
  await expect(page.locator('body')).toHaveClass(/is-embed/);
});
test('redirects to login when logged out', async ({ page }) => {
  await page.addInitScript(() => localStorage.removeItem('lx_logged_in'));
  await page.goto('dev/shell.html');
  await expect(page).toHaveURL(/login\.html\?next=/);
});
```
- [ ] **Step 2: 실패 확인** → FAIL

- [ ] **Step 3: shell.js**
```js
import { icon } from './ui/icon.js';
const MENU = [
  { key: 'dashboard', label: '대시보드', href: 'dashboard.html', icon: 'dashboard' },
  { group: 'BUILD' },
  { key: 'project', label: '프로젝트', href: 'ai-project.html', icon: 'project' },
  { key: 'data', label: '데이터', href: 'dataset.html', icon: 'data' },
  { key: 'card', label: '카드 발행', href: 'admin-publish.html', icon: 'card' },
  { group: 'USE' },
  { key: 'run', label: '분석 실행', href: 'analysis-ai.html', icon: 'run' },
  { key: 'map', label: 'XI 맵', href: 'ximap.html', icon: 'map' },
  { spacer: true },
  { key: 'admin', label: '서비스 관리', href: 'admin-notice.html', icon: 'settings' },
  { key: 'support', label: '서비스 지원', href: 'notice.html', icon: 'help' },
  { key: 'my', label: 'MY', href: 'mypage.html', icon: 'user', flyout: [{ label: '마이 페이지', href: 'mypage.html' }, { label: '로그아웃', action: 'logout' }] },
];
export const AuthState = {
  isLoggedIn: () => localStorage.getItem('lx_logged_in') === '1',
  login: () => localStorage.setItem('lx_logged_in', '1'),
  logout: () => { localStorage.removeItem('lx_logged_in'); location.href = 'home.html'; },
};
export function mountShell(opts = {}) {
  const q = new URLSearchParams(location.search); const embed = q.get('embed') === '1';
  const body = document.body; body.classList.add('has-shell'); if (opts.mapPage) body.classList.add('is-map');
  if (!opts.public && !AuthState.isLoggedIn()) { location.replace('login.html?next=' + encodeURIComponent(location.pathname.split('/').pop() + location.search)); return; }
  const main = document.createElement('main'); main.id = 'page'; main.className = 'page'; while (body.firstChild) main.append(body.firstChild); body.append(main);
  if (embed) { body.classList.add('is-embed'); return; }
  body.prepend(renderRail(opts.active), renderCtx(opts));
  if (opts.secondary) main.before(renderSecondary(opts.secondary));
  if (opts.footer !== false && !opts.mapPage) body.append(renderFooter());
  bindFlyout(); window.LX = Object.assign(window.LX || {}, { shell: { setCrumb, notify } });
}
function renderRail(active) {
  const nav = document.createElement('nav'); nav.className = 'rail'; nav.setAttribute('aria-label', '주 메뉴');
  nav.innerHTML = `<a class="rail__logo" href="dashboard.html"><span>LAND<br>XI</span><small>PLATFORM</small></a>` + MENU.map(m => m.group ? `<div class="rail__group">${m.group}</div>` : m.spacer ? `<div class="rail__spacer"></div>` :
    `<a class="rail__item" data-menu="${m.key}" href="${m.href}" ${m.key === active ? 'aria-current="page"' : ''} ${m.flyout ? 'data-flyout' : ''}><i class="rail__ic">${icon(m.icon, 18)}</i><span>${m.label}</span>${m.flyout ? `<div class="rail__flyout">${m.flyout.map(f => f.action ? `<button type="button" data-action="${f.action}">${f.label}</button>` : `<a href="${f.href}">${f.label}</a>`).join('')}</div>` : ''}</a>`).join('');
  return nav;
}
function renderCtx({ crumb = [] }) {
  const h = document.createElement('header'); h.className = 'ctx rule';
  h.innerHTML = `<div class="ctx__org"><span class="ctx__tag">LX</span>한국국토정보공사 <span class="faint">· 공간정보AI팀</span></div><div class="ctx__crumb">${crumbHtml(crumb)}</div><div class="ctx__spacer"></div><button type="button" class="ctx__search" data-palette>${icon('search', 16)}<span>프로젝트, 카드, 사용자, 공지, 주소 검색</span><kbd>/</kbd></button><button type="button" class="icon-btn ctx__bell" aria-label="알림">${icon('bell', 16)}<span class="badge">3</span></button><div class="ctx__me"><span class="avatar">관</span>관리자</div>`;
  return h;
}
const crumbHtml = (arr) => arr.map((c, i) => i === arr.length - 1 ? `<b>${c}</b>` : `<span>${c}</span><i>›</i>`).join('');
function setCrumb(arr) { document.querySelector('.ctx__crumb').innerHTML = crumbHtml(arr); }
function notify(n) { const b = document.querySelector('.ctx__bell .badge'); b.textContent = n; b.hidden = !n; }
function renderSecondary(groups) {
  const a = document.createElement('aside'); a.className = 'secondary';
  a.innerHTML = groups.map(g => `<div class="secondary__group"><div class="secondary__label">${g.group}</div>${g.items.map(i => `<a class="secondary__item" href="${i.href}" ${i.active ? 'aria-current="page"' : ''}>${i.label}</a>`).join('')}</div>`).join('');
  return a;
}
function renderFooter() {
  const f = document.createElement('footer'); f.className = 'gov-footer';
  f.innerHTML = `<div class="gov-footer__links"><a href="#" data-policy="privacy"><b>개인정보처리방침</b></a><a href="#" data-policy="terms">이용약관</a><a href="#" data-policy="email">이메일주소무단수집거부</a></div><div class="gov-footer__addr">(우)54870 전라북도 전주시 덕진구 기지로 120 (중동) LX · 고객센터 063-713-1213, 1216 · © LX. All rights reserved.</div><select class="select gov-footer__family" aria-label="패밀리 사이트"><option>Family Site</option><option value="https://www.lx.or.kr">LX 한국국토정보공사</option><option value="https://map.ngii.go.kr">국토정보플랫폼</option><option value="https://www.vworld.kr">브이월드</option><option value="https://www.nsdi.go.kr">국가공간정보포털</option><option value="https://www.gov.kr">정부24</option></select>`;
  f.querySelector('select').addEventListener('change', e => { if (e.target.value.startsWith('http')) window.open(e.target.value, '_blank'); });
  return f;
}
function bindFlyout() { document.querySelectorAll('[data-action=logout]').forEach(b => b.addEventListener('click', e => { e.preventDefault(); AuthState.logout(); })); }
```

- [ ] **Step 4: shell.css**
```css
body.has-shell{min-height:100vh;display:grid;grid-template-columns:var(--rail-w) 1fr;grid-template-rows:var(--ctx-h) 1fr auto;grid-template-areas:"rail ctx" "rail page" "rail footer"}
body.has-shell.has-secondary{grid-template-columns:var(--rail-w) var(--secondary-w) 1fr;grid-template-areas:"rail ctx ctx" "rail secondary page" "rail footer footer"}
body.is-embed{display:block}
.rail{grid-area:rail;position:sticky;top:0;height:100vh;background:var(--surface);border-right:1px solid var(--line);display:flex;flex-direction:column;padding:10px 0;z-index:30}
.rail__logo{height:40px;display:grid;place-items:center;text-align:center;font-family:var(--f-display);font-weight:900;font-size:13px;line-height:1;color:var(--lx);margin-bottom:6px}.rail__logo small{font:500 7.5px var(--f-mono);letter-spacing:.14em;color:var(--ink-3);margin-top:3px}
.rail__item{position:relative;display:flex;flex-direction:column;align-items:center;gap:4px;padding:8px 0 7px;font-size:10.5px;color:var(--ink-2)}
.rail__ic{width:30px;height:30px;border-radius:8px;display:grid;place-items:center;border:1px solid transparent;transition:background var(--t-fast)}
.rail__item:hover .rail__ic{background:var(--mist)}
.rail__item[aria-current=page]{color:var(--lx);font-weight:600}.rail__item[aria-current=page] .rail__ic{background:var(--lx-tint);border-color:rgba(var(--lx-rgb),.25)}
.rail__item[aria-current=page]::before{content:"";position:absolute;left:0;top:9px;bottom:9px;width:3px;background:var(--lx);border-radius:0 3px 3px 0}
.rail__group{font:500 9px var(--f-mono);letter-spacing:.12em;color:var(--ink-3);text-align:center;margin:8px 0 1px}.rail__spacer{flex:1}
.rail__flyout{display:none;position:absolute;left:calc(100% + 6px);bottom:0;min-width:150px;background:var(--surface);border:1px solid var(--line);border-radius:10px;box-shadow:var(--sh-float);padding:6px;flex-direction:column}
.rail__flyout a,.rail__flyout button{display:block;width:100%;text-align:left;padding:8px 10px;border:0;background:none;border-radius:6px;font-size:var(--fs-13)}.rail__flyout a:hover,.rail__flyout button:hover{background:var(--mist)}
.rail__item[data-flyout]:hover .rail__flyout,.rail__item[data-flyout]:focus-within .rail__flyout{display:flex}
.ctx{grid-area:ctx;position:sticky;top:0;z-index:25;background:var(--glass);backdrop-filter:blur(12px);border-bottom:1px solid var(--line);display:flex;align-items:center;gap:18px;padding:0 20px}
.ctx.rule::before{top:auto;bottom:-1px;opacity:.5}
.ctx__org{display:flex;align-items:center;gap:8px;font-weight:600;font-size:var(--fs-13)}.ctx__tag{font:500 10px var(--f-mono);letter-spacing:.08em;padding:2px 7px;border-radius:4px;background:var(--lx-tint);color:var(--lx)}
.ctx__crumb{font-size:var(--fs-13);color:var(--ink-3);display:flex;gap:6px}.ctx__crumb b{color:var(--ink)}
.ctx__spacer{flex:1}
.ctx__search{display:flex;align-items:center;gap:8px;height:32px;width:280px;padding:0 12px;border:1px solid var(--line);border-radius:8px;background:var(--surface);color:var(--ink-3);font-size:var(--fs-13);text-align:left}.ctx__search kbd{margin-left:auto;font:500 10px var(--f-mono);border:1px solid var(--line-strong);border-radius:4px;padding:1px 5px}
.ctx__bell{position:relative}.ctx__bell .badge{position:absolute;top:-5px;right:-5px;min-width:16px;height:16px;border-radius:8px;background:var(--s-found);color:#fff;font:600 10px var(--f-mono);display:grid;place-items:center;padding:0 4px}
.ctx__me{display:flex;align-items:center;gap:8px;font-size:var(--fs-13)}.avatar{width:28px;height:28px;border-radius:50%;background:var(--lx);color:#fff;display:grid;place-items:center;font-size:11px;font-weight:600}
.secondary{grid-area:secondary;border-right:1px solid var(--line);background:rgba(255,255,255,.6);padding:16px 10px}
.secondary__label{font:500 10px var(--f-mono);letter-spacing:.12em;color:var(--ink-3);padding:8px 10px 4px}
.secondary__item{display:block;padding:8px 10px;border-radius:8px;font-size:var(--fs-13);color:var(--ink-2)}.secondary__item:hover{background:var(--mist)}.secondary__item[aria-current=page]{background:var(--lx-tint);color:var(--lx);font-weight:600}
.page{grid-area:page;min-width:0}
body.is-map .page{height:calc(100vh - var(--ctx-h));position:relative;overflow:hidden}
.gov-footer{grid-area:footer;display:flex;align-items:center;gap:20px;padding:10px 24px;font-size:var(--fs-12);color:var(--ink-2);border-top:1px solid var(--line);background:rgba(255,255,255,.7)}
.gov-footer__links{display:flex;gap:14px}.gov-footer__links b{color:var(--ink)}.gov-footer__addr{flex:1}.gov-footer__family{height:30px;font-size:var(--fs-12)}
```
(`mountShell`에서 `opts.secondary`가 있으면 `body.classList.add('has-secondary')` 추가.)

- [ ] **Step 5: `dev/shell.html`** — 본문 `<h1>쉘 테스트</h1>` + `<script type="module">import {mountShell} from '../assets/js/shell.js'; mountShell({active:'dashboard', crumb:['대시보드','관리자']});</script>` (`data-base="../"`). 링크는 `../`가 아니라 실제 페이지 상대 경로이므로 dev 페이지에서는 404여도 무방.
- [ ] **Step 6: 실행** — `npm run test:e2e` PASS
- [ ] **Step 7: 커밋** — `git add -A && git commit -m "feat: 쉘(레일·컨텍스트 바·2차 컬럼·푸터·embed 모드)"`

---

### Task 6: 커맨드 팔레트

**Files:**
- Create: `landxi/assets/js/ui/palette.js`; Modify: `shell.js`(팔레트 마운트), `shell.css`
- Test: `tests/e2e/palette.spec.mjs`

**Interfaces:**
- Produces: `initPalette({ sources: () => [{type:'project'|'card'|'user'|'notice'|'place', label, sub, href?, lnglat?}], onPlace(item) })`. `/` 키 또는 `[data-palette]` 클릭으로 열림, 입력에 따라 `label/sub` 부분 일치(대소문자 무시) 상위 8개, ↑↓ Enter Esc. `place`는 `onPlace`, 나머지는 `location.href=href`.

- [ ] **Step 1: 테스트**
```js
import { test, expect } from '@playwright/test';
test.beforeEach(async ({ page }) => { await page.addInitScript(() => localStorage.setItem('lx_logged_in', '1')); });
test('slash opens palette, filters, enter navigates', async ({ page }) => {
  await page.goto('dev/shell.html');
  await page.keyboard.press('/');
  await expect(page.locator('.palette[open]')).toBeVisible();
  await page.keyboard.type('도로안전');
  await expect(page.locator('.palette__item').first()).toContainText('도로안전');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/ai-project-view\.html\?pid=/);
});
test('place result calls onPlace', async ({ page }) => {
  await page.goto('dev/shell.html');
  await page.keyboard.press('/'); await page.keyboard.type('남원');
  await page.locator('.palette__item[data-type=place]').first().click();
  await expect(page.locator('[data-test=place]')).toHaveText(/127\./);
});
```
- [ ] **Step 2: 실패 확인**
- [ ] **Step 3: palette.js**
```js
import { icon } from './icon.js';
export function initPalette({ sources, onPlace }) {
  const d = document.createElement('dialog'); d.className = 'palette';
  d.innerHTML = `<div class="palette__box">${icon('search', 18)}<input class="palette__input" placeholder="프로젝트, 카드, 사용자, 공지, 주소·지번 검색" aria-label="검색"><kbd>Esc</kbd></div><ul class="palette__list" role="listbox"></ul>`;
  document.body.append(d);
  const input = d.querySelector('input'), list = d.querySelector('ul'); let items = [], cur = 0;
  const TYPE = { project: '프로젝트', card: '카드', user: '사용자', notice: '공지', place: '장소' };
  function render() { const q = input.value.trim().toLowerCase(); items = sources().filter(i => !q || (i.label + ' ' + (i.sub || '')).toLowerCase().includes(q)).slice(0, 8); cur = 0;
    list.innerHTML = items.map((i, k) => `<li class="palette__item" role="option" data-type="${i.type}" aria-selected="${k === cur}"><span class="palette__type">${TYPE[i.type]}</span><b>${i.label}</b><small>${i.sub || ''}</small></li>`).join('') || `<li class="palette__empty">결과가 없습니다. 다른 이름이나 주소로 검색해 보세요.</li>`; }
  function go(i) { if (!i) return; d.close(); i.type === 'place' ? onPlace?.(i) : (location.href = i.href); }
  input.addEventListener('input', render);
  input.addEventListener('keydown', e => { if (e.key === 'ArrowDown') { cur = Math.min(cur + 1, items.length - 1); } else if (e.key === 'ArrowUp') { cur = Math.max(cur - 1, 0); } else if (e.key === 'Enter') { return go(items[cur]); } else return; e.preventDefault(); [...list.children].forEach((li, k) => li.setAttribute('aria-selected', k === cur)); });
  list.addEventListener('click', e => { const li = e.target.closest('.palette__item'); if (li) go(items[[...list.children].indexOf(li)]); });
  d.addEventListener('click', e => { if (e.target === d) d.close(); });
  const open = () => { if (d.open) return; input.value = ''; render(); d.showModal(); input.focus(); };
  document.addEventListener('keydown', e => { if (e.key === '/' && !/input|textarea/i.test(e.target.tagName)) { e.preventDefault(); open(); } });
  document.querySelectorAll('[data-palette]').forEach(b => b.addEventListener('click', open));
  return { open };
}
```
`shell.js`의 `mountShell` 끝에: `import { initPalette } from './ui/palette.js';` … `initPalette({ sources: () => (window.LX?.paletteSources?.() || []), onPlace: i => window.LX?.map?.flyTo?.(i.lnglat, 14) || window.LX?.onPlace?.(i) })`.
`dev/shell.html`에 `window.LX = { paletteSources: () => [{type:'project', label:'도로안전 정사영상', sub:'Segmentation · 김현우', href:'ai-project-view.html?pid=P-001'}, {type:'place', label:'남원시 도통동', sub:'전북특별자치도', lnglat:[127.39, 35.41]}], onPlace: i => document.querySelector('[data-test=place]').textContent = i.lnglat.join(',') }` 및 `<span data-test="place"></span>` 추가.
- [ ] **Step 4: CSS**
```css
.palette{border:0;padding:0;background:transparent;width:min(92vw,640px);margin-top:12vh}.palette::backdrop{background:rgba(17,28,45,.35);backdrop-filter:blur(2px)}
.palette__box{display:flex;align-items:center;gap:10px;padding:12px 14px;background:var(--surface);border-radius:12px 12px 0 0;border:1px solid var(--line)}.palette__input{flex:1;border:0;outline:0;font-size:var(--fs-16)}
.palette__list{list-style:none;margin:0;padding:6px;background:var(--surface);border:1px solid var(--line);border-top:0;border-radius:0 0 12px 12px;box-shadow:var(--sh-modal)}
.palette__item{display:grid;grid-template-columns:56px 1fr;gap:2px 10px;padding:8px 10px;border-radius:8px;cursor:pointer}.palette__item[aria-selected=true],.palette__item:hover{background:var(--lx-tint)}
.palette__type{grid-row:1/3;align-self:center;font:500 10px var(--f-mono);letter-spacing:.06em;color:var(--ink-3);border:1px solid var(--line);border-radius:4px;padding:2px 6px;text-align:center}.palette__item small{color:var(--ink-3);font-size:var(--fs-12)}.palette__empty{padding:14px;color:var(--ink-2);font-size:var(--fs-13)}
```
- [ ] **Step 5: 실행** PASS → **Step 6: 커밋** `git add -A && git commit -m "feat: 커맨드 팔레트(/ 통합 검색)"`

---

### Task 7: MapShell — MapLibre·스타일·폴백·상태 눈금줄·도구 스트립

**Files:**
- Create: `landxi/assets/js/map/style.js`, `fallback.js`, `rulebar.js`, `shell.js`, `landxi/assets/css/map.css`, `landxi/dev/map.html`
- Test: `tests/unit/style.test.mjs`, `tests/e2e/map.spec.mjs`

**Interfaces:**
- Produces: `createMap(container, { mode:'canvas'|'backdrop', center=[127.8,36.2], zoom=6, pitch=0, globe=false, interactive=true, ortho=false, tools=true, rulebar=true, ambient:'none'|'spin' }) → Promise<LXMap>`. `LXMap`: `{ ready, engine:'maplibre'|'fallback', flyTo(lnglat, zoom, {pitch, bearing}), jumpTo, addGeoJSON(id, geojson, {kind:'detection'|'extent'|'org'|'coverage', paint}), setHighlight(id, filterFn|null), setOrthoOpacity(0..1), on(event, fn) ('move'|'click'|'hover'), getCenter(), getZoom(), project(lnglat) → [x,y], destroy() }`. 폴백은 `flyTo/addGeoJSON/setHighlight/project`를 캔버스 좌표계로 동일 시그니처 구현. `window.LX.map = 인스턴스`.
- `buildStyle(tokens) → style JSON`(OpenFreeMap `https://tiles.openfreemap.org/planet` 소스; 레이어: background(mist), landuse(--mist 어둡게), water(#CFE0EF), roads(#fff, 외곽선 잉크 12%), buildings(fill-extrusion #DDE3E8, zoom≥14), boundaries(잉크 25% 점선), labels(ink, `name:ko`→`name`)). 정사영상: `vworld-sat` 래스터 소스 `https://xdworld.vworld.kr/2d/Satellite/service/{z}/{x}/{y}.jpeg`(키 없는 공개 엔드포인트가 막히면 `https://tile.openstreetmap.org` 대신 사용하지 말고 레이어를 생략하고 슬라이더를 비활성화한다).
- `createRulebar(host, map) → { update({lnglat, zoom, captured, model}) }` — 좌표 소수 4자리, 축척 `1:${round(559082264 / 2^zoom * cos(lat))}`를 천 단위 반올림, 눈금 간격 px = 실제 100m/500m/1km에 대응.

- [ ] **Step 1: 스타일 단위 테스트**
```js
import test from 'node:test'; import assert from 'node:assert/strict';
import { buildStyle } from '../../landxi/assets/js/map/style.js';
const s = buildStyle({ mist: '#E9EEF1', ink: '#111C2D', water: '#CFE0EF' });
test('style has openfreemap source and required layers', () => {
  assert.equal(s.version, 8); assert.ok(s.sources.openfreemap.url.includes('openfreemap'));
  for (const id of ['background', 'water', 'road', 'building-3d', 'boundary', 'label-place']) assert.ok(s.layers.some(l => l.id === id), id);
});
test('labels prefer korean names', () => { const l = s.layers.find(l => l.id === 'label-place'); assert.deepEqual(l.layout['text-field'], ['coalesce', ['get', 'name:ko'], ['get', 'name']]); });
```
- [ ] **Step 2: 실패 확인** → **Step 3: style.js 구현**(위 레이어 전부; `glyphs:'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf'`, `source-layer` 이름은 OpenMapTiles 스키마: `landuse water transportation building boundary place`).
- [ ] **Step 4: fallback.js** — `design-review/03-lx-interactive.html`의 `makeWorld/renderer`를 모듈로 옮기고 `LXMap` 시그니처로 감싼다: 경위도 ↔ 월드 좌표는 `[127.0..128.4] × [35.0..36.4]`를 `[0..W] × [H..0]`에 선형 매핑. `addGeoJSON`은 Polygon/Point만 지원(탐지=teal 폴리곤, org=핀, extent=옅은 사각, coverage=채움 알파).
- [ ] **Step 5: shell.js(map)**
```js
import { buildStyle } from './style.js'; import { createFallback } from './fallback.js'; import { createRulebar } from './rulebar.js'; import { icon } from '../ui/icon.js';
const REDUCE = matchMedia('(prefers-reduced-motion: reduce)').matches;
export async function createMap(container, o = {}) {
  container.classList.add('lxmap', `lxmap--${o.mode || 'canvas'}`);
  const box = document.createElement('div'); box.className = 'lxmap__canvas'; container.append(box);
  let api;
  try { if (!window.maplibregl) throw new Error('no maplibre'); api = await maplibre(box, o); } catch (e) { console.warn('[LX.map] fallback:', e.message); api = createFallback(box, o); }
  if (o.tools !== false) container.append(renderTools(api, o));
  if (o.rulebar !== false) api.rulebar = createRulebar(container, api);
  window.LX = Object.assign(window.LX || {}, { map: api }); return api;
}
async function maplibre(box, o) {
  const map = new maplibregl.Map({ container: box, style: buildStyle(), center: o.center || [127.8, 36.2], zoom: o.zoom ?? 6, pitch: o.pitch || 0, interactive: o.interactive !== false, attributionControl: false });
  await new Promise((res, rej) => { map.once('load', res); map.once('error', e => rej(e.error || new Error('style'))); setTimeout(() => rej(new Error('timeout')), 8000); });
  if (o.globe) map.setProjection({ type: 'globe' });
  if (o.ortho) { map.addSource('vworld-sat', { type: 'raster', tiles: ['https://xdworld.vworld.kr/2d/Satellite/service/{z}/{x}/{y}.jpeg'], tileSize: 256, maxzoom: 19 }); map.addLayer({ id: 'ortho', type: 'raster', source: 'vworld-sat', paint: { 'raster-opacity': 0 } }, 'road'); }
  const layers = new Map(); const handlers = {};
  const api = {
    engine: 'maplibre', ready: true, raw: map,
    flyTo: (c, z, x = {}) => REDUCE ? map.jumpTo({ center: c, zoom: z, ...x }) : map.flyTo({ center: c, zoom: z, duration: 1200, essential: true, ...x }),
    jumpTo: (c, z, x = {}) => map.jumpTo({ center: c, zoom: z, ...x }),
    addGeoJSON(id, data, { kind = 'detection', paint = {} } = {}) { map.addSource(id, { type: 'geojson', data }); layers.set(id, kind);
      if (kind === 'detection' || kind === 'extent' || kind === 'coverage') { map.addLayer({ id: id + '-fill', type: 'fill', source: id, paint: { 'fill-color': kind === 'detection' ? '#0FA9A0' : kind === 'coverage' ? '#2457D6' : '#2457D6', 'fill-opacity': kind === 'detection' ? .18 : kind === 'coverage' ? ['*', .5, ['coalesce', ['get', 'coverage'], 0]] : .06, ...paint } }); map.addLayer({ id: id + '-line', type: 'line', source: id, paint: { 'line-color': kind === 'detection' ? '#0FA9A0' : '#2457D6', 'line-width': 1.5, 'line-opacity': kind === 'extent' ? .35 : 1 } }); }
      if (kind === 'org') map.addLayer({ id: id + '-pt', type: 'circle', source: id, paint: { 'circle-radius': 6, 'circle-color': '#2457D6', 'circle-stroke-color': '#fff', 'circle-stroke-width': 2 } });
      map.on('mousemove', id + (kind === 'org' ? '-pt' : '-fill'), e => handlers.hover?.({ id, feature: e.features[0], point: [e.point.x, e.point.y] })); map.on('mouseleave', id + (kind === 'org' ? '-pt' : '-fill'), () => handlers.hover?.(null)); map.on('click', id + (kind === 'org' ? '-pt' : '-fill'), e => handlers.click?.({ id, feature: e.features[0], lnglat: [e.lngLat.lng, e.lngLat.lat] })); },
    setHighlight(id, fn) { const kind = layers.get(id); const l = id + (kind === 'org' ? '-pt' : '-fill'); const prop = kind === 'org' ? 'circle-opacity' : 'fill-opacity'; if (!fn) return map.setPaintProperty(l, prop, kind === 'detection' ? .18 : kind === 'org' ? 1 : .06); const ids = map.querySourceFeatures(id).filter(f => fn(f.properties)).map(f => f.properties.id); map.setPaintProperty(l, prop, ['case', ['in', ['get', 'id'], ['literal', ids]], kind === 'detection' ? .45 : 1, .05]); },
    setOrthoOpacity: v => map.getLayer('ortho') && map.setPaintProperty('ortho', 'raster-opacity', v),
    on: (ev, fn) => { handlers[ev] = fn; if (ev === 'move') map.on('move', () => fn({ center: map.getCenter().toArray(), zoom: map.getZoom() })); },
    getCenter: () => map.getCenter().toArray(), getZoom: () => map.getZoom(), project: c => { const p = map.project(c); return [p.x, p.y]; }, destroy: () => map.remove(),
  };
  if (o.ambient === 'spin' && !REDUCE) { let stop = false; map.on('mousedown', () => stop = true); (function spin() { if (stop) return; map.easeTo({ center: [map.getCenter().lng + 0.08, map.getCenter().lat], duration: 100, easing: t => t }); requestAnimationFrame(() => setTimeout(spin, 90)); })(); }
  return api;
}
function renderTools(api, o) {
  const t = document.createElement('div'); t.className = 'lxmap__tools';
  const items = [['search', '검색', () => window.LX?.palette?.open?.() || document.querySelector('[data-palette]')?.click()], ['layers', '배경지도', () => toggleOrtho(api, t)], ['ruler', '측정', () => window.NotifyUI?.info('측정 도구는 XI 맵에서 제공됩니다')], ['pen', '그리기', () => window.NotifyUI?.info('그리기 도구는 XI 맵에서 제공됩니다')], ['download', '내보내기', () => window.NotifyUI?.info('현재 보기를 내보냅니다')], ['globe', 'LX 레이어', () => window.NotifyUI?.info('LX 레이어')]];
  t.innerHTML = items.map(([i, l]) => `<button type="button" class="lxmap__tool" aria-label="${l}" title="${l}">${icon(i, 16)}</button>`).join('') + `<div class="lxmap__zoom"><button type="button" aria-label="확대">+</button><button type="button" aria-label="축소">−</button></div>` + (o.ortho ? `<label class="lxmap__ortho" hidden><span>정사영상</span><input type="range" min="0" max="1" step="0.05" value="0"></label>` : '');
  [...t.querySelectorAll('.lxmap__tool')].forEach((b, k) => b.addEventListener('click', items[k][2]));
  t.querySelector('.lxmap__zoom button:first-child').addEventListener('click', () => api.flyTo(api.getCenter(), api.getZoom() + 1));
  t.querySelector('.lxmap__zoom button:last-child').addEventListener('click', () => api.flyTo(api.getCenter(), api.getZoom() - 1));
  t.querySelector('.lxmap__ortho input')?.addEventListener('input', e => api.setOrthoOpacity(+e.target.value));
  return t;
}
function toggleOrtho(api, t) { const l = t.querySelector('.lxmap__ortho'); if (!l) return; l.hidden = !l.hidden; }
```
- [ ] **Step 6: rulebar.js**
```js
export function createRulebar(host, api) {
  const el = document.createElement('div'); el.className = 'rulebar mono'; host.append(el);
  const state = { captured: '2026.04.12 · GSD 8cm', model: 'XI-VFM v2.1' };
  function scaleOf(zoom, lat) { return Math.round(559082264 / Math.pow(2, zoom) * Math.cos(lat * Math.PI / 180) / 1000) * 1000; }
  function update(p = {}) { Object.assign(state, p); const c = state.lnglat || api.getCenter(); const z = state.zoom ?? api.getZoom(); const s = scaleOf(z, c[1]); const mPerPx = 156543.03 * Math.cos(c[1] * Math.PI / 180) / Math.pow(2, z); const unit = [100, 500, 1000, 5000, 10000, 50000].find(u => u / mPerPx >= 60) || 100000; el.style.setProperty('--tick', (unit / mPerPx) + 'px');
    el.innerHTML = `<span><b>${c[1].toFixed(4)}</b>, <b>${c[0].toFixed(4)}</b></span><span>축척 <b>1:${s.toLocaleString()}</b></span><span class="rulebar__scale"><i></i>${unit >= 1000 ? unit / 1000 + ' km' : unit + ' m'}</span><span>정사영상 <b>${state.captured}</b></span><span class="rulebar__ai">● ${state.model}</span><span class="rulebar__spacer"></span><button type="button" class="rulebar__info" aria-label="사이트 정보" data-footer-info>ⓘ</button>`; }
  api.on('move', ({ center, zoom }) => update({ lnglat: center, zoom })); update(); return { update };
}
```
`data-footer-info` 클릭 → `openDialog({title:'Land-XI', body: 정부 표준 링크·주소·고객센터 HTML})`.
- [ ] **Step 7: map.css**
```css
.lxmap{position:absolute;inset:0;overflow:hidden;background:var(--mist)}.lxmap__canvas{position:absolute;inset:0}.lxmap__canvas canvas{outline:0}
.lxmap--backdrop{pointer-events:none;filter:saturate(.85)}.lxmap--backdrop::after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(233,238,241,.35),rgba(233,238,241,.6))}
.lxmap__tools{position:absolute;right:16px;bottom:calc(var(--rulebar-h) + 16px);display:flex;flex-direction:column;gap:6px;z-index:10}
.lxmap__tool,.lxmap__zoom button{width:36px;height:36px;border-radius:10px;background:var(--glass);backdrop-filter:blur(10px);border:1px solid var(--glass-border);box-shadow:var(--sh-card);display:grid;place-items:center;color:var(--ink-2)}.lxmap__tool:hover{color:var(--lx)}
.lxmap__zoom{display:flex;flex-direction:column;gap:2px;margin-top:6px}.lxmap__zoom button{font-size:16px}
.lxmap__ortho{position:absolute;right:44px;bottom:0;width:180px;display:flex;align-items:center;gap:8px;padding:8px 10px;background:var(--glass);border-radius:10px;font-size:var(--fs-12)}
.rulebar{position:absolute;left:0;right:0;bottom:0;height:var(--rulebar-h);z-index:10;display:flex;align-items:center;gap:22px;padding:0 16px;background:var(--glass);backdrop-filter:blur(12px);border-top:1px solid var(--line);font-size:var(--fs-12);color:var(--ink-2)}
.rulebar b{color:var(--ink);font-weight:500}.rulebar__ai{color:var(--ai)}.rulebar__spacer{flex:1}
.rulebar__scale{display:flex;align-items:center;gap:6px}.rulebar__scale i{width:var(--tick,80px);height:6px;border:1px solid var(--ink);border-top:0;background:var(--rule);background-size:var(--rule-size);background-repeat:repeat-x;background-position:0 100%,0 100%;transition:width var(--t-base)}
.rulebar__info{border:0;background:none;color:var(--ink-3)}
/* 지도 캔버스형 페이지의 플로팅 패널 자리 */
.map-panel{position:absolute;top:16px;left:16px;bottom:calc(var(--rulebar-h) + 16px);width:var(--panel-w);z-index:12;display:flex;flex-direction:column;overflow:hidden}
.map-panel--detail{left:calc(var(--panel-w) + 28px)}
```
- [ ] **Step 8: e2e**
```js
import { test, expect } from '@playwright/test';
test('map mounts (maplibre or fallback), rulebar updates on flyTo', async ({ page }) => {
  await page.goto('dev/map.html'); await page.waitForFunction(() => window.LX?.map?.ready);
  const engine = await page.evaluate(() => window.LX.map.engine); expect(['maplibre', 'fallback']).toContain(engine);
  await expect(page.locator('.rulebar')).toContainText('축척');
  await page.evaluate(() => window.LX.map.jumpTo([127.39, 35.41], 14));
  await expect(page.locator('.rulebar')).toContainText('35.4100');
  await expect(page.locator('.lxmap__tool')).toHaveCount(6);
});
test('addGeoJSON + setHighlight do not throw', async ({ page }) => {
  await page.goto('dev/map.html'); await page.waitForFunction(() => window.LX?.map?.ready);
  const ok = await page.evaluate(() => { const m = window.LX.map; m.addGeoJSON('t', { type: 'FeatureCollection', features: [{ type: 'Feature', properties: { id: 'a', s: 'found' }, geometry: { type: 'Polygon', coordinates: [[[127.38, 35.40], [127.40, 35.40], [127.40, 35.42], [127.38, 35.40]]] } }] }, { kind: 'detection' }); m.setHighlight('t', p => p.s === 'found'); m.setHighlight('t', null); return true; });
  expect(ok).toBe(true);
});
```
`dev/map.html`: MapLibre CDN `<link href="https://unpkg.com/maplibre-gl@5.6.0/dist/maplibre-gl.css" rel="stylesheet"><script src="https://unpkg.com/maplibre-gl@5.6.0/dist/maplibre-gl.js"></script>` + `<div id="m" style="position:relative;height:100vh"></div>` + `createMap(document.getElementById('m'), {ortho:true})`.
- [ ] **Step 9: 실행** `npm test` PASS(오프라인이면 fallback 경로로 통과해야 함) → **Step 10: 커밋** `git add -A && git commit -m "feat: MapShell(MapLibre 스타일·폴백 캔버스·상태 눈금줄·도구 스트립)"`

---

### Task 8: 데이터·이미지 이관과 GeoJSON

**Files:**
- Create: `tools/fetch-assets.mjs`, `landxi/assets/data/surveys.js`, `landxi/assets/data/dashboard.js`, `landxi/assets/data/geo/*.geojson`, `landxi/assets/data/support-data.js`(복사), `landxi/assets/data/ai-project-data.js`(복사)
- Test: `tests/unit/data.test.mjs`

**Interfaces:**
- Produces: `SURVEYS = [{id, ministry, name, method:'현장 인력', cycle, service, color, layerId}]` 7건(농식품부 농지이용 실태조사 / 국토부 개발제한구역 실태조사 / 환경부 방치쓰레기 / 환경부 불법소각장 / 해수부 해양쓰레기 / 농식품부·지자체 비닐하우스 / 국토부·지자체 도로안전(포트홀)); `SURVEY_COUNTERS = { field:{teams:7, months:12, coverage:'표본', formats:7}, ai:{teams:'1+검증', months:'3주', coverage:'전수', formats:1} }`; `DASH = { queue:[{type:'card'|'user'|'inquiry', title, sub, age, status, pin:{lnglat}}], kpis:[…5], backbone:{name:'XI-VFM', ver:'v2.1', applied:'2026.03.12', tasks:14}, storage:{total:184, used:44.5, parts:[…]}, projects:[{name, gb, pid}], visits:[…7], notice:{title, date}, coverage:[{code, name, done:[surveyId…]}] }`; GeoJSON: `korea-outline`(단순 폴리곤), `sigungu-sample`(전북 14개 시군 단순화 폴리곤, `code name coverage`), `orgs`(LX 전주·남원시청·전남도청·신안군·완도군 Point), `detections-sample`(7개 조사별 8~12개 폴리곤, 남원 일대, `id surveyId cls status`), `projects-extent`(8개 프로젝트 사각형 `pid`).

- [ ] **Step 1: 테스트**
```js
import test from 'node:test'; import assert from 'node:assert/strict'; import fs from 'node:fs';
import { SURVEYS } from '../../landxi/assets/data/surveys.js'; import { DASH } from '../../landxi/assets/data/dashboard.js';
test('7 surveys with required fields', () => { assert.equal(SURVEYS.length, 7); for (const s of SURVEYS) for (const k of ['id', 'ministry', 'name', 'method', 'cycle', 'service', 'color', 'layerId']) assert.ok(s[k], k); });
test('geojson files parse and reference surveys', () => {
  const det = JSON.parse(fs.readFileSync('landxi/assets/data/geo/detections-sample.geojson', 'utf8'));
  const ids = new Set(SURVEYS.map(s => s.id)); for (const f of det.features) { assert.ok(ids.has(f.properties.surveyId)); assert.ok(f.properties.id); }
  for (const n of ['korea-outline', 'sigungu-sample', 'orgs', 'projects-extent']) assert.equal(JSON.parse(fs.readFileSync(`landxi/assets/data/geo/${n}.geojson`, 'utf8')).type, 'FeatureCollection');
});
test('dashboard queue items have pins', () => { assert.ok(DASH.queue.length >= 5); for (const q of DASH.queue) assert.equal(q.pin.lnglat.length, 2); });
```
- [ ] **Step 2: fetch-assets.mjs** — `https://mini531.github.io/namwon-smart-village/landxi7/` 아래 `assets/images/` 목록(landing/lp-map.png, lp-multisource.png, lp-results.png, landxi-main/vs01_01original.png, vs01_02result.png, usecase/uc-farm-nongview.png, uc-road-safety.png, logo_landxi_dark.png, lx_symbol.png, favicon_landxi.png)과 `assets/data/support-data.js`, `assets/data/ai-project-data.js`를 `fetch`로 받아 동일 경로에 저장. 실패한 파일은 목록으로 출력.
- [ ] **Step 3: 데이터 파일 작성**(내용은 인터페이스 정의대로; 폴리곤 좌표는 남원 중심 `[127.39, 35.41]` 주변 ±0.05°, 시군구는 전북 14개 시군 중심 좌표 기준 정육각형 근사 — 실제 경계 데이터가 아니므로 파일 상단 `"note":"simplified placeholder"` 속성을 둔다).
- [ ] **Step 4: 실행** `node tools/fetch-assets.mjs && npm run test:unit` PASS → **Step 5: 커밋** `git add -A && git commit -m "feat: 목업 데이터·GeoJSON·기존 이미지 이관"`

---

### Task 8b: 실자산 파이프라인 — 정사영상 타일·실탐지 벡터·CI

**Files:**
- Create: `tools/prepare-assets.py`, `tools/prepare-assets.md`(실행법), `landxi/assets/tiles/**`, `landxi/assets/data/geo/marine-debris.geojson`, `marine-debris-grid.geojson`, `jeju-illegal.geojson`, `landxi/assets/data/models.js`, `landxi/assets/data/imagery.js`, `landxi/assets/brand/*`
- Modify: `landxi/assets/css/tokens.css`(`--lx` → CI 블루), `landxi/assets/js/map/shell.js`, `fallback.js`(`addRaster`), `tests/unit/data.test.mjs`(추가 케이스), `tests/e2e/map.spec.mjs`

**Interfaces:**
- Consumes: conda env `yolo` (`C:\Users\oem\anaconda3\envs\yolo\python.exe`, GDAL 3.12: `gdal_translate`, `gdal2tiles.py`, `ogr2ogr` in `envs\yolo\Scripts` / `envs\yolo\Library\bin`). Source rasters (never modified): `E:\namwon_final\nw_2506.tif`, `nw_2508.tif`, `nw_2510.tif`, `F:\namwon_final\nw_2504.tif` (EPSG:5186, 1.5cm, have .ovr), `F:\a68_out\ortho_kuksan2_a68_zenmuse.tif`, `F:\a71_out\ortho_kuksan2_a71_zenmuse.tif` (5cm, WGS84 bounds 126.974,35.82562,126.99214,35.83828), `D:\python\lx_2023\336081285_AE_2022_12.tif` + `segmented_image.tif` (EPSG:5179, bounds 126.81996,33.505,126.82504,33.51) + `detected_objects.shp`; vectors `D:\python\jeonnamdo\jeonam_debris_wgs84.geojson` (38,057 polygons, props confidence/class/area_m2), `result_wgs84.geojson` (26,049, props class_name/confidence/giin); models `D:\python\99. LX 부서별 협력사항\02. 지적사업혁신처\best(Car|House|Road|Vinylhouse).pt` + `data(*.yaml)`, `D:\python\lx_2023\model_yolo_illegal*.pt`, `model_segformer_land.pt`, `model_landuse_epoch000.pt`, `yolo11n.pt`, `yolo11x-obb.pt`.
- Produces: `IMAGERY = [{id:'namwon_2508', label:'남원 도통동 · 2025.08', kind:'ortho'|'landcover', gsd:0.015, captured:'2025-08', bounds:[W,S,E,N], minzoom:12, maxzoom:18, tiles:'assets/tiles/namwon_2508/{z}/{x}/{y}.webp'}, … namwon_2504/2506/2510, kuksan_a68, kuksan_a71, jeju_2022, jeju_landcover]` (`assets/data/imagery.js`, ES module); `MODELS = [{id, name, file, sizeMB, task:'detect'|'segment'|'obb', classes:[…], trainedAt}]`; GeoJSON files above; brand assets. `LXMap.addRaster(id, imagery, {opacity=1, before?}) → void` and `setRasterOpacity(id, v)` added to both engines (maplibre: raster source `{type:'raster', tiles:[url], tileSize:256, bounds, minzoom, maxzoom}`; fallback: loads tiles from the same URLs with `Image` at the nearest zoom and draws them in the camera transform).
- Rules: AOI/zoom so that `landxi/assets/tiles` ≤ 200MB total; webp quality 80; skip regeneration when output exists (`--force` to rebuild); script prints a size summary per dataset. Namwon AOI = WGS84 127.379–127.401 / 35.399–35.421 (도통동·시청 일대) — converted to EPSG:5186 for `-projwin`.

- [ ] **Step 1: 단위 테스트 추가** (`tests/unit/data.test.mjs`)
```js
import fs from 'node:fs';
import { IMAGERY } from '../../landxi/assets/data/imagery.js'; import { MODELS } from '../../landxi/assets/data/models.js';
test('imagery entries point at existing tile dirs with bounds', () => { assert.ok(IMAGERY.length >= 6); for (const i of IMAGERY) { assert.equal(i.bounds.length, 4); assert.ok(i.bounds[0] < i.bounds[2] && i.bounds[1] < i.bounds[3]); assert.ok(fs.existsSync(`landxi/assets/tiles/${i.id}/${i.minzoom}`), i.id); } });
test('namwon has 4 epochs sharing one AOI', () => { const nw = IMAGERY.filter(i => i.id.startsWith('namwon_')); assert.equal(nw.length, 4); for (const i of nw) assert.deepEqual(i.bounds, nw[0].bounds); });
test('marine debris geojson is simplified and sized', () => { const g = JSON.parse(fs.readFileSync('landxi/assets/data/geo/marine-debris.geojson', 'utf8')); assert.ok(g.features.length >= 3000 && g.features.length <= 6000); assert.ok(fs.statSync('landxi/assets/data/geo/marine-debris.geojson').size < 6e6); });
test('models list has real files metadata', () => { assert.ok(MODELS.length >= 6); for (const m of MODELS) assert.ok(m.sizeMB > 0 && m.classes.length); });
```
- [ ] **Step 2: 실패 확인** `npm run test:unit` → FAIL (modules missing)
- [ ] **Step 3: `tools/prepare-assets.py`** — 단계: (a) 남원: 각 epoch를 `gdal_translate -projwin <5186 창> -tr 0.3 0.3 -r average -of GTiff -co TILED=YES -co COMPRESS=DEFLATE` 로 z18급(0.3m)까지만 다운샘플해 작업 파일을 만들고(원본 1.5cm 직접 자르기 금지 — 수 GB), `gdal2tiles.py --xyz -z 12-18 -w none -r bilinear --processes 4` → PNG를 Pillow로 webp(q80) 변환 후 PNG 삭제; 4 epoch 모두 같은 `-projwin` 창 사용; (b) 국산리 a68/a71: 전체 범위 `-tr 0.2` → z13–19; (c) 제주 항공·세그멘테이션 2종: z13–19; (d) 벡터: `ogr2ogr -f GeoJSON -lco COORDINATE_PRECISION=5 -simplify 0.00002 -sql "SELECT confidence, class, area_m2 FROM jeonam_debris_wgs84 ORDER BY confidence DESC LIMIT 5000"` → `marine-debris.geojson`; Python으로 전체 38,057건을 500m 격자(0.0045°)로 집계해 `marine-debris-grid.geojson`(`count`, `mean_conf`); `result_wgs84`는 `giin`(기인) 집계를 격자 속성에 추가; `detected_objects.shp` → `jeju-illegal.geojson`(EPSG:4326); (e) 모델 메타: 파일 stat(mtime→`trainedAt`, size→`sizeMB`) + `data(*.yaml)`의 `names` → `models.js`(yaml 없는 모델은 파일명에서 task/classes 추정하고 `inferred:true`); (f) 브랜드: `https://land-xi.lx.or.kr/lnxi/public/lnxi/lbl/common/images/front/logo_big_v3.png`, `https://land-xi.lx.or.kr/lnxi/public/lnxi/lbl/common/images/front/logo.png` 다운로드 + 기존 프로토타입 `https://mini531.github.io/namwon-smart-village/landxi7/assets/images/logo_landxi_dark.png`, `lx_symbol.png` → `landxi/assets/brand/`; 워드마크에서 주색을 샘플링(가장 채도 높은 파란 픽셀의 중앙값)해 `tokens.css`의 `--lx`, `--lx-deep`(−25% 명도), `--lx-tint`(92% 흰색 혼합), `--lx-rgb` 갱신하고 값을 리포트에 기록. 각 단계는 산출물이 있으면 건너뛴다(`--force`).
- [ ] **Step 4: `LXMap.addRaster` / `setRasterOpacity`** 양 엔진 구현; `dev/map.html`에 `IMAGERY.find(i=>i.id==='namwon_2508')`를 올리고 카메라를 그 bounds로; e2e 1건 추가(`tests/e2e/map.spec.mjs`): `addRaster` 후 maplibre면 `raw.getLayer('r-namwon')` 존재, fallback이면 `document.querySelector('.lxmap__canvas canvas')` 위에 최소 1장의 타일 요청이 200으로 응답(`page.waitForResponse(/tiles\/namwon_2508\/.*\.webp/)`).
- [ ] **Step 5: 실행·검증** `"C:\Users\oem\anaconda3\envs\yolo\python.exe" tools/prepare-assets.py` → 크기 요약 ≤ 200MB 확인 → `npm test` PASS → `node tools/shot.mjs dev/map.html shots/map-real.png` 로 실영상이 보이는지 확인(리포트에 첨부 경로 기록).
- [ ] **Step 6: 커밋** `git add -A && git commit -m "feat: 실자산 파이프라인(남원 4시점·드론·제주 타일, 해양쓰레기 실탐지, 모델 메타, CI)"`

**후속 작업 반영:** Task 9(홈)·13(로그인)·14(대시보드)는 폴백/목업 대신 `IMAGERY`의 `namwon_2508`을 `addRaster`로 바탕에 쓴다(글로브 진입 후 남원 AOI로 착지). Task 11 시뮬레이터의 해양쓰레기 카드는 `marine-debris.geojson`을, 농지이용/불법건축물 카드는 `jeju-illegal.geojson`+`jeju_landcover`를 켠다. Task 8의 `detections-sample.geojson`은 실자산이 없는 조사(개발제한구역·방치쓰레기·불법소각장·도로안전·비닐하우스)만 남긴다. 쉘 로고는 `assets/brand/landxi-wordmark.png`(레일에서는 LX 심볼)로 교체한다.

---

### Task 9: 홈 v2 — 장면 골격·궤도(Orbit)·하강(Descent)·전국 서비스 HUD

**Files:**
- Create: `landxi/home.html`(교체), `landxi/assets/css/pages/home.css`, `landxi/assets/js/pages/home.js`(장면 컨트롤러), `landxi/assets/js/pages/home-orbit.js`, `landxi/assets/js/pages/home-hud.js`, `landxi/assets/data/services.js`
- Test: `tests/e2e/home.spec.mjs`

**Interfaces:**
- Consumes: `createMap` (`{mode:'canvas', globe:true, zoom:2.2, center:[127.8,36.2], interactive:false, tools:false, rulebar:false, ortho:false}`), `api.addGeoJSON/setHighlight/flyTo/project/on`, `api.raw`(maplibre) for style crossfade, `IMAGERY`+`api.addRaster`(있으면 `namwon_2508`을 미리 올려 Scene 3에서 사용; 없으면 생략), `countUpAll`, `openDialog`, `NotifyUI`, `icon`, brand `assets/brand/landxi-wordmark.png`(없으면 텍스트 폴백).
- Produces: `SERVICES = [{id, name, ministry, lnglat, count, unit, lastRun, real:true|false, story:'marine'|'jeju'|'namwon'|'kuksan'|'generic', color}]` 13종(`assets/data/services.js`; 실자산 4종 `marine`(126.2,35.1, 38057건), `farmland`/`illegal`(126.822,33.507), `pothole`(127.39,35.41), `change`(126.983,35.832) + 예시 9종: greenbelt, trash, incinerator, greenhouse, feedcrop, silage, river, solar, building — 라인업 13과 1:1). `window.LX.home = { scene, go(n), openStory(serviceId), closeStory() }`; 장면 컨테이너 `#scene-orbit #scene-descent #scene-story #scene-survey #scene-build #scene-contact`(`.scene[data-scene=n]`), 상단 진행 도트 `.scene-nav`(6개, 키보드 ↑↓/PageUp/PageDown, 도트 클릭). Scene 3·4·5·6의 본문은 후속 작업이 채우므로 **빈 섹션 + 제목 + `data-todo`**만 둔다(라인업 칩·지표·CTA·상단 내비는 이 작업에서 구현).
- 장면 전환 모델: 스크롤 스냅이 아닌 **상태 기계** — `go(n)`이 `body[data-scene]`을 바꾸고 각 장면이 `enter/leave` 훅으로 카메라·레이어·오버레이를 조정한다(휠/터치는 한 번에 한 장면씩, 700ms 디바운스). Scene 1은 4초 후 자동으로 Scene 2(감소 모션·사용자 조작 시 취소).

- [ ] **Step 1: e2e 테스트**
```js
import { test, expect } from '@playwright/test';
test('orbit scene shows wordmark, globe map and 3 orbit rings, then auto-advances', async ({ page }) => {
  await page.goto('home.html'); await page.waitForFunction(() => window.LX?.map?.ready && window.LX?.home);
  await expect(page.locator('#scene-orbit .wordmark')).toBeVisible();
  await expect(page.locator('#scene-orbit .orbit__ring')).toHaveCount(3);
  await expect(page.locator('#scene-orbit .orbit__craft')).toHaveCount(3);
  await page.waitForTimeout(4600); expect(await page.evaluate(() => window.LX.home.scene)).toBe(2);
});
test('descent shows 13 service points with HUD labels; chip hover highlights; click opens story', async ({ page }) => {
  await page.goto('home.html'); await page.waitForFunction(() => window.LX?.home); await page.evaluate(() => window.LX.home.go(2)); await page.waitForTimeout(1500);
  await expect(page.locator('.hud__point')).toHaveCount(13); await expect(page.locator('.hud__label')).toHaveCount(13);
  await page.locator('.lineup .chip[data-service=marine]').hover(); await expect(page.locator('.hud__point[data-service=marine]')).toHaveClass(/is-hot/);
  await page.locator('.hud__point[data-service=marine]').click(); await page.waitForTimeout(800);
  expect(await page.evaluate(() => window.LX.home.scene)).toBe(3); await expect(page.locator('#scene-story')).toHaveAttribute('data-service', 'marine');
});
test('scene nav dots and keyboard move between scenes; stats count up', async ({ page }) => {
  await page.goto('home.html'); await page.waitForFunction(() => window.LX?.home);
  await page.locator('.scene-nav button').nth(3).click(); expect(await page.evaluate(() => window.LX.home.scene)).toBe(4);
  await page.keyboard.press('PageUp'); await page.waitForTimeout(800); expect(await page.evaluate(() => window.LX.home.scene)).toBe(3);
  await page.evaluate(() => window.LX.home.go(2)); await page.waitForTimeout(1600); await expect(page.locator('.hud__stats [data-n="13"] .kpi__num')).toHaveText('13');
});
test('sunrise: descent scene is light, orbit is dark', async ({ page }) => {
  await page.goto('home.html'); await page.waitForFunction(() => window.LX?.home);
  const dark = await page.evaluate(() => getComputedStyle(document.body).getPropertyValue('--scene-bg').trim());
  await page.evaluate(() => window.LX.home.go(2)); await page.waitForTimeout(1200);
  const light = await page.evaluate(() => getComputedStyle(document.body).getPropertyValue('--scene-bg').trim()); expect(dark).not.toBe(light);
});
```
- [ ] **Step 2: home.html 골격** — `<body class="home" data-scene="1">`: 고정 `#homeMap`(전면), `.home-top`(워드마크 소형·내비 플랫폼 소개(#scene-build) 활용 사례(스토리 패널 링크) 문의하기(#scene-contact)·로그인 `.btn.btn--primary`), `.scene-nav`, 6개 `<section class="scene" id="scene-…">`, Scene 1 안: `.orbit`(SVG 링 3개 `.orbit__ring` + 마커 `.orbit__craft[data-kind=sat|air|uav]` + 라벨 위성/항공/드론) 좌측, 우측 `.wordmark`(img + 텍스트 폴백) · 모토 · 설명 · CTA 2(로그인하고 시작하기 → login.html / 플랫폼 둘러보기 → `go(2)`) · HUD 스트립 `ORBIT · SAT 3 · AIR 2 · UAV 5 · 13 SERVICES`; Scene 2 안: `.hud`(SVG 오버레이: 포인트 13 `.hud__point[data-service]`, 리더선 `.hud__leader`, 라벨 카드 `.hud__label`), 우상단 `.hud__stats`(KPI 4, `data-n`), 좌하단 `.lineup`(칩 13 `data-service`), 안내 문구 "포인트를 눌러 실제 분석을 보세요".
- [ ] **Step 3: home.js(장면 컨트롤러)** — `SCENES = [{n:1, enter(){ setDark(true); map.jumpTo([127.8,36.2],2.2); orbit.start(); }, leave(){ orbit.stop(); }}, {n:2, enter(){ sunrise(); map.flyTo([127.8,36.2],6.3,{pitch:0}); hud.show(); }, leave(){ hud.hide(); }}, {n:3 …story: hud.hide(); (Task 10 채움)}, {n:4 …survey}, {n:5 …build: map.flyTo([127.39,35.41],12,{pitch:45})}, {n:6 …contact}]`; `go(n)` = leave→enter, `body.dataset.scene=n`, 도트 갱신, 해당 섹션으로 `scrollIntoView({behavior: REDUCE?'auto':'smooth'})`; 휠·키·터치 바인딩; `setDark(on)`은 `body.classList.toggle('is-dark')`로 `--scene-bg` 등 토큰 세트 전환(`.home.is-dark{--scene-bg:#0E1726; --scene-ink:#E6ECF5 …}`), `sunrise()`는 `is-dark` 제거 + `#homeMap` 위 `.night-veil`(어두운 반투명 오버레이)을 1.2s 페이드아웃 — 지도 스타일 자체를 바꾸지 않아 MapLibre/폴백 모두 동작. Scene 1 자동 진행 4s 타이머(사용자 입력 시 취소).
- [ ] **Step 4: home-orbit.js** — `createOrbit(container) → {start, stop}`: SVG 타원 링 3개(반지름 비율 1.0/1.25/1.5, `transform: rotateX(62deg) rotateZ(각도)`로 원근), 각 링에 마커 1개(위성=원+패널 아이콘, 항공=비행기 아이콘, 드론=쿼드콥터 아이콘 — 스프라이트에 `i-satellite i-plane i-drone` 3개 심볼 추가), 각속도 sat 0.10rad/s · air 0.18 · uav 0.30, 지구 뒤편 통과 시 `opacity .25`; rAF 루프, 감소 모션이면 정지 상태 배치. 글로브는 `ambient:'spin'` 대신 orbit가 `map.raw?.easeTo`/폴백 pan으로 자전(Scene 1에서만).
- [ ] **Step 5: home-hud.js** — `createHud(map, services, {onSelect}) → {show, hide, highlight(id|null)}`: `map.on('move')`마다 `project(lnglat)`로 포인트·리더선·라벨 좌표 갱신(라벨은 포인트에서 우상향 28px 오프셋, 화면 밖이면 반대편), 라벨 카드 = 서비스명 + `count`(mono) + `lastRun`, 실자산 서비스는 `real` 배지 `실데이터`; 펄스는 `real` 포인트에만; `highlight(id)`로 `is-hot`; 클릭 → `onSelect(id)` → `LX.home.openStory(id)`(Task 10 전까지는 `go(3)` + `#scene-story[data-service]` 설정만).
- [ ] **Step 6: home.css** — 장면 100vh 스택, `.scene{min-height:100vh;position:relative;z-index:2}`; 다크 토큰 세트; 궤도 링(`stroke:rgba(230,236,245,.35)`, 점선 `4 6`), 마커 글로우; HUD(포인트 8px + 펄스, 리더선 1px 잉크 40%, 라벨 유리 카드 12/13px mono); `.scene-nav` 우측 고정 도트; `.home-top` 유리; 워드마크 대형(높이 64px 이미지 또는 Gothic A1 900 56px).
- [ ] **Step 7: 실행** `npm test` PASS → 스크린샷 Scene 1·2 확인 → **Step 8: 커밋** `git add -A && git commit -m "feat: 홈 v2 장면 골격·궤도·하강·전국 서비스 HUD"`

---

### Task 10: 홈 v2 — 스토리 슬라이드(해양쓰레기·제주·남원·국산리·일반)

**Files:**
- Create: `landxi/assets/js/pages/home-story.js`, `landxi/assets/js/pages/home-lens.js`(스캔 렌즈, 제주 스토리에서 사용), `landxi/assets/js/pages/home-scrub.js`(타임 스크럽/스와이프 비교); Modify: `home.html`(#scene-story 본문), `home.css`, `home.js`(`openStory/closeStory` 연결)
- Test: `tests/e2e/home-story.spec.mjs`

**Interfaces:**
- Consumes: `SERVICES`, GeoJSON `marine-debris.geojson`, `marine-debris-grid.geojson`(`count, mean_conf, giin_*`), `jeju-illegal.geojson`, `IMAGERY`(`namwon_2504…2510`, `kuksan_a68/a71`, `jeju_2022`, `jeju_landcover`) + `api.addRaster/setRasterOpacity`(없으면 해당 슬라이드는 "영상 준비 중" 상태로 표시하되 UI는 동작), ECharts(도넛·막대), `openDialog`(활용 사례 2건 모달), `createDrawer` 대신 자체 `.story` 패널.
- Produces: `openStory(id)` → 카메라 `flyTo(service.lnglat, zoomByStory, {pitch:45})` + `.story[data-service]` 슬라이드 인 + 덱 1페이지; `closeStory()` → Scene 2 복귀. 덱 API `{next(), prev(), goSlide(i)}`, 키보드 ←→, 진행 표시 `.story__dots`. 슬라이드 정의는 `STORIES = { marine:[…], jeju:[…], namwon:[…], kuksan:[…], generic:[…] }` 각 슬라이드 `{title, body(html), enter(map), leave(map)}`. 스토리 종류별 내용은 스펙 6.1 Scene 3 그대로(해양쓰레기 5슬라이드: 개요/격자 히트맵/기인 도넛+막대/변화 슬라이더/실행하기; 제주 4: 항공/토지피복 토글/불법건축물+스캔 렌즈/실행; 남원 4: 2025.08/타임 스크럽 4시점/탐지 예시/실행; 국산리 3: a68/a71 스와이프/실행; 일반 3). "실행하기"는 `login.html?next=analysis-ai.html`. 패널 상단 "활용 사례" → 기존 사례 2건 다이얼로그, "닫기" → `closeStory()`.
- 변화분석(해양쓰레기 ④): 격자 `count`를 시점 A(전체)·시점 B(`mean_conf`≥0.6만)로 나눠 슬라이더 0–100으로 보간해 색을 바꾼다(실측 시점이 하나이므로 "신뢰도 기준 시나리오"임을 캡션에 명시).
- 스캔 렌즈: 커서 반경 130px 안에서만 `jeju-illegal` 폴리곤 표시(SVG 오버레이 + clipPath), 가장 가까운 탐지의 클래스 태그.
- 타임 스크럽: `.scrub` 트랙(4 눈금 2025.04/06/08/10), 드래그 시 인접 두 래스터의 `setRasterOpacity`를 보간; 스와이프 비교: 두 래스터 중 위 레이어를 `clip`(maplibre는 `raster-opacity` 대신 `map.raw.setLayerZoomRange` 불가 → 오버레이 `<div class="swipe">`로 캔버스 위에 마스크 이미지를 두는 대신, 간단히 **좌우 분할 오버레이**: 화면을 두 개의 맵 컨테이너로 나누지 않고, 위 레이어 opacity 1, 아래 0으로 두고 `clip-path: inset(0 X% 0 0)`을 `#homeMap`의 복제 캔버스가 아닌 **두 번째 MapLibre 인스턴스**(`createMap(#swipeMap, {...same camera, tools:false, rulebar:false})`)에 적용, 카메라 동기화 `on('move')`). 폴백 엔진에서는 두 번째 인스턴스도 폴백.

- [ ] **Step 1: e2e** — marine 스토리 열기 → `.story[data-service=marine]` 보임, 덱 5장, `→` 키로 2장째 이동 시 `.story__dots [aria-current]` 인덱스 1, 격자 레이어 `getLayer('grid')` 존재; `닫기` → scene 2; jeju 스토리 3장째에서 마우스 이동 시 `.lens` 표시; namwon 스토리 2장째 `.scrub` 드래그 후 `data-t` 값 변화; kuksan 스와이프 `.swipe` 드래그 후 `--pos` 변화(래스터 없을 때도 UI는 동작해야 함).
- [ ] **Step 2–5: 구현**(home-story.js 덱/슬라이드/카메라, home-lens.js, home-scrub.js, CSS: `.story{position:fixed;right:0;top:64px;bottom:0;width:480px}` 유리, 슬라이드 전환 `translateX` 320ms, 감소 모션 즉시).
- [ ] **Step 6: 실행** `npm test` PASS → **Step 7: 커밋** `git add -A && git commit -m "feat: 홈 v2 스토리 슬라이드(해양쓰레기·제주·남원·국산리)"`

---

### Task 11: 홈 v2 — 통합조사 시뮬레이터 (Scene 4)

**Files:**
- Create: `landxi/assets/js/pages/home-survey.js`; Modify: `home.html`(#scene-survey 본문), `home.css`
- Test: `tests/e2e/home-survey.spec.mjs`

**Interfaces:**
- Consumes: `SURVEYS`, `SURVEY_COUNTERS`, `detections-sample.geojson`(greenbelt·trash·incinerator·pothole·greenhouse), `marine-debris.geojson`(marine 카드 → 전남으로 카메라 이동 대신 **남원 AOI 안에 예시 폴리곤을 쓰지 않고**, 카드 클릭 시 해당 서비스의 실데이터 위치로 `flyTo`), `jeju-illegal.geojson`(farmland 카드), `window.LX.map`, Scene 4 `enter()`(카메라 남원 AOI zoom 13.5).
- Produces: 마크업·동작은 v1 정의 그대로 — `.survey__stack` 카드 7(`.survey-card[data-id]`), `#surveyMix` 슬라이더(현장조사 ↔ Geo-AI 통합조사), `.survey-svg` 조사원 7팀 경로 이동→검증 지점, 드론 스윕 `data-progress`, 카드 병합 `.survey-card--merged`("통합조사 1회 · 7개 조사 부분 대체"), 카운터 4(`data-k=teams|months|coverage|formats`), 카드 클릭 → 해당 레이어만 `setHighlight` + `.lineup .chip[data-service]`(Scene 2의 칩) 대신 카드 옆 서비스 칩 `is-hit`. `window.LX.survey = { setMix(0..100) }`.

- [ ] **Step 1: e2e**(v1 테스트 그대로: 카드 7, 카운터 `7팀`→`1팀 + 검증`, `data-progress="1"`, merged 카드, greenbelt 카드 클릭 → 서비스 칩 `is-hit`)
- [ ] **Step 2–3: 구현** → **Step 4: 실행** PASS → **Step 5: 커밋** `git add -A && git commit -m "feat: 홈 v2 통합조사 시뮬레이터"`

---

### Task 12: 홈 v2 — 만드는 법(Scene 5)·문의(Scene 6)·기능 소개·사례·정책

**Files:**
- Modify: `home.html`(#scene-build, #scene-contact 본문), `home.css`, `home.js`(Scene 5/6 enter)
- Test: `tests/e2e/home-sections.spec.mjs`

**Interfaces:**
- 유지 기능: 4단계 파이프라인(데이터 입력→모델 선택(YOLO v11)→학습→평가; IntersectionObserver 진입 시 선이 흐름), 기능 소개 3(학습·분석 / 멀티소스 / 지도 시각화 — `assets/images/landing/lp-*.png`), **워크플로우 캔버스 미리보기**(노드 6개 데이터→클래스→라벨링→학습→평가→발행, 정적 SVG + 흐르는 점선), 문의 3카드(대표 전화 063-713-1213 / 기술 문의 063-713-1216 / 온라인 문의 → `openDialog` 폼 이름·소속·전화·문의 내용, 빈 값 `.has-error`, 제출 `NotifyUI.success('문의가 접수되었습니다')`; 실패 시 다이얼로그 재오픈 루프), 정책 링크 3(다이얼로그), 정부 표준 푸터(주소·고객센터·©·패밀리사이트 select). 활용 사례 2건 다이얼로그는 Task 10의 스토리 패널과 상단 내비 '활용 사례'에서 호출(공용 함수 `openCaseDialog(i)`를 `home-story.js`가 export — 없으면 이 작업에서 `home-cases.js`로 분리해 양쪽이 import).

- [ ] **Step 1: e2e** — Scene 5: `.pipe__node` 4, `.wf-preview .wf-node` 6; Scene 6: 문의 폼 검증 4 `.has-error` → 채운 뒤 토스트 `접수`; 정책 링크 클릭 → `dialog[open]`; 푸터 select 존재.
- [ ] **Step 2–3: 구현** → **Step 4: 실행** PASS → **Step 5: 커밋** `git add -A && git commit -m "feat: 홈 v2 만드는 법·문의·푸터"`

---

### Task 13: 로그인

**Files:**
- Create: `landxi/login.html`, `landxi/assets/css/pages/login.css`, `landxi/assets/js/pages/login.js`
- Test: `tests/e2e/login.spec.mjs`

**Interfaces:**
- Consumes: `createMap({mode:'backdrop', globe:true, zoom:2.4, interactive:false, tools:false, rulebar:false})`, `AuthState.login`, `NotifyUI`.
- Produces: 폼 `#loginForm`(이메일 `name=email`, 비밀번호 `name=pw`, 체크 `name=remember`, 버튼 `로그인`), 링크 아이디 찾기/비밀번호 찾기(다이얼로그 안내)/계정 신청하기(`signup.html` — 계획 4). 성공: 이메일·비밀번호 모두 비어있지 않으면 `AuthState.login()`, `remember`면 `localStorage.lx_saved_email`, `.login-card`에 `is-leaving` 0.4s 후 `?next=` 또는 `dashboard.html`. 실패: 필드 `.has-error` + `아이디(이메일)와 비밀번호를 입력해 주세요.`

- [ ] **Step 1: 테스트**
```js
import { test, expect } from '@playwright/test';
test('login validates and redirects to next', async ({ page }) => {
  await page.goto('login.html?next=dashboard.html');
  await page.click('#loginForm button[type=submit]'); await expect(page.locator('#loginForm .has-error')).toHaveCount(2);
  await page.fill('[name=email]', 'admin@lx.or.kr'); await page.fill('[name=pw]', 'x'); await page.check('[name=remember]');
  await page.click('#loginForm button[type=submit]');
  await expect(page).toHaveURL(/dashboard\.html/);
  expect(await page.evaluate(() => localStorage.getItem('lx_logged_in'))).toBe('1');
});
```
- [ ] **Step 2: 구현**(카드: 로고, `LX 전 직원이 Geo-AI 전문가입니다` eyebrow, 부제 `NO-CODE 기반의 AI 학습모델을 구축하는 Land-XI`, 폼, 링크 3). CSS: `.login{min-height:100vh;display:grid;place-items:center;position:relative}.login-card{width:420px;padding:32px}.is-leaving{transform:scale(.96);opacity:0;transition:.4s var(--ease)}`.
- [ ] **Step 3: 실행** PASS → **Step 4: 커밋** `git add -A && git commit -m "feat: 로그인 화면"`

---

### Task 14: 대시보드 — 쉘·처리 대기 큐·KPI·우측 컬럼·차트

**Files:**
- Create: `landxi/dashboard.html`, `landxi/assets/css/pages/dashboard.css`, `landxi/assets/js/pages/dashboard.js`
- Test: `tests/e2e/dashboard.spec.mjs`

**Interfaces:**
- Consumes: `mountShell({active:'dashboard', crumb:['대시보드','관리자']})`, `createMap(#dashMap, {mode:'backdrop', center:[127.6,35.9], zoom:8.4, pitch:40, interactive:false, tools:false, rulebar:false})`, `DASH`, `projects-extent.geojson`, `orgs.geojson`, `statusOf`, `countUpAll`, `createDrawer`, ECharts CDN.
- Produces: 레이아웃 `.dash{display:grid;grid-template-columns:400px 1fr 300px;gap:14px;padding:22px 26px}`: 헤더(`.dash__head` — h2 `LX 관리자 대시보드`, 부제 `오늘 처리할 승인·문의와 서비스 운영 현황`, 공지 스트립 `DASH.notice` → notice.html, 기준일 mono), 좌 `.queue`(`DASH.queue` 대기 일수 내림차순, 행 `.q[data-type][data-i]`: 3px 상태 바·타입 라벨·제목·부제·대기일(`age≥60`이면 `is-hot`)·호버 시 액션 버튼 `검토/승인·거부/답변` → 각각 `admin-publish.html?status=대기`, `admin-users.html`, `admin-inquiry.html`), 중앙 `.kpis` 2×2(전체 사용자 / 발행 분석 카드 / 카드 발행 승인 대기(hot) / 미답변 문의; 5번째 '가입 승인 대기'는 전체 사용자 타일 `.kpi__sub`에 `승인 대기 1` 텍스트로 유지 — 기능 유지) + 하단 `.charts`(탭: 프로젝트 용량(가로 막대) / 7일 방문(세로 막대) / 스토리지(도넛) — ECharts, `matchMedia` 감소 모션이면 `animation:false`), 우 `.side`(백본 카드, 스토리지 바+범례, 프로젝트 용량 목록 `.p[data-pid]`, 사용자·콘텐츠 관리 타일 4: 사용자/공지/문의/FAQ 관리 → admin-*.html).
- 인터랙션: 큐 행 `mouseenter` → `map.setHighlight('extents', p => p.pid === row.pid)` 또는 `orgs`; `click` → `map.flyTo(pin.lnglat, 11, {pitch:45})` + 우측 Drawer에 요약(제목·부제·상태 필·이동 버튼). KPI `mouseenter` → `map.setHighlight('extents', p => statusOf('card', p.status).key === kpi.dataset.status)`; `mouseleave` → 해제. 프로젝트 목록 호버 → 해당 `pid` 강조.

- [ ] **Step 1: 테스트**
```js
import { test, expect } from '@playwright/test';
test.beforeEach(async ({ page }) => { await page.addInitScript(() => localStorage.setItem('lx_logged_in', '1')); });
test('dashboard renders queue sorted by age, 4 kpis, side column', async ({ page }) => {
  await page.goto('dashboard.html'); await page.waitForFunction(() => window.LX?.map?.ready);
  const ages = await page.locator('.q .q__age').allInnerTexts(); const nums = ages.map(a => parseInt(a) || 0); expect([...nums].sort((a, b) => b - a)).toEqual(nums);
  await expect(page.locator('.kpis .kpi')).toHaveCount(4);
  await expect(page.locator('.side .backbone')).toContainText('XI-VFM');
  await expect(page.locator('.side .tile')).toHaveCount(4);
  await expect(page.locator('.rail__item[aria-current=page]')).toHaveAttribute('data-menu', 'dashboard');
});
test('queue click flies camera and opens drawer', async ({ page }) => {
  await page.goto('dashboard.html'); await page.waitForFunction(() => window.LX?.map?.ready);
  const z0 = await page.evaluate(() => window.LX.map.getZoom());
  await page.locator('.q').first().click(); await page.waitForTimeout(1500);
  expect(await page.evaluate(() => window.LX.map.getZoom())).toBeGreaterThan(z0);
  await expect(page.locator('.drawer[data-open=true]')).toBeVisible();
});
test('charts tab switches', async ({ page }) => {
  await page.goto('dashboard.html'); await page.locator('.charts [role=tab]').nth(2).click();
  await expect(page.locator('#chartStorage')).toBeVisible();
});
```
- [ ] **Step 2: dashboard.html·dashboard.js·dashboard.css 구현**(위 인터페이스대로; ECharts 색은 `getComputedStyle(document.documentElement).getPropertyValue('--lx')` 등 토큰에서 읽어 `color:[ink, lx, '#6E93EA', '#A9BFF2', '#CDD9F7']`).
- [ ] **Step 3: 실행** PASS → **Step 4: 커밋** `git add -A && git commit -m "feat: LX 관리자 대시보드(처리 대기 큐·KPI·우측 컬럼·차트)"`

---

### Task 15: 대시보드 — 전국 커버리지 지도·매트릭스

**Files:**
- Create: `landxi/assets/js/pages/dashboard-coverage.js`; Modify: `dashboard.html`(하단 `.coverage` 카드), `dashboard.css`
- Test: `tests/e2e/dashboard-coverage.spec.mjs`

**Interfaces:**
- Consumes: `DASH.coverage`, `SURVEYS`, `sigungu-sample.geojson`, `window.LX.map.addGeoJSON('coverage', …, {kind:'coverage'})`, `setHighlight`.
- Produces: `.coverage{grid-column:1/4}` 카드: 좌 `.coverage__map`(바탕 지도의 해당 영역을 가리키는 것이 아니라 카드 안 소형 SVG 코로플레스 — `sigungu-sample` 폴리곤을 `viewBox`로 투영, `fill-opacity = done.length/7`), 우 `.coverage__matrix`(행 = 시군구 14, 열 = 조사 7, 셀 `.cell[data-code][data-survey]` `is-done`이면 조사 색), 앰비언트: `.coverage__map .is-recent` 펄스 1개(가장 최근 완료 시군구). 호버 연동: 셀/폴리곤 `mouseenter` → 같은 `code` 강조 + 툴팁 `${name} · ${done.length}/7 조사 AI 대체 · ${done.map(name)}`; 클릭 → `ximap.html?region=${code}`.

- [ ] **Step 1: 테스트**
```js
import { test, expect } from '@playwright/test';
test.beforeEach(async ({ page }) => { await page.addInitScript(() => localStorage.setItem('lx_logged_in', '1')); });
test('coverage matrix 14x7 and hover links to map', async ({ page }) => {
  await page.goto('dashboard.html');
  await expect(page.locator('.coverage__matrix .cell')).toHaveCount(98);
  await page.locator('.coverage__matrix .row').first().hover();
  const code = await page.locator('.coverage__matrix .row').first().getAttribute('data-code');
  await expect(page.locator(`.coverage__map [data-code="${code}"]`)).toHaveClass(/is-hover/);
  await expect(page.locator('.coverage__tip')).toContainText('조사 AI 대체');
});
```
- [ ] **Step 2: 구현** → **Step 3: 실행** PASS → **Step 4: 커밋** `git add -A && git commit -m "feat: 대시보드 전국 커버리지(코로플레스·부처×시군구 매트릭스)"`

---

### Task 16: 품질 패스 — 스크린샷 대조·기능 체크리스트·접근성·감소 모션

**Files:**
- Create: `tools/compare.mjs`, `docs/superpowers/checklists/plan1-functions.md`, `shots/`(gitignore)
- Modify: 필요한 CSS/JS 수정
- Test: `tests/e2e/a11y.spec.mjs`

- [ ] **Step 1: 체크리스트 작성** — 스펙 6.1·6.2·6.3 "유지" 항목을 표로 옮기고(기능 / 새 위치 / 확인 방법), 실행하며 ✔ 표시. 미구현이 있으면 여기서 구현한다.
- [ ] **Step 2: 스크린샷 대조** — `tools/compare.mjs`: 기존 사이트 `https://mini531.github.io/namwon-smart-village/landxi7/{home,dashboard}.html`과 로컬 `home.html, dashboard.html`을 1440×900으로 찍어 `shots/old-*.png`, `shots/new-*.png`로 저장. 두 이미지를 열어 기능 누락을 눈으로 대조하고 체크리스트에 기록.
- [ ] **Step 3: 접근성·모션 테스트**
```js
import { test, expect } from '@playwright/test';
test('keyboard reaches rail, palette and dialog; reduced motion disables ambient', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('lx_logged_in', '1'));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('dashboard.html'); await page.waitForFunction(() => window.LX?.map?.ready);
  await page.keyboard.press('Tab'); await expect(page.locator('.rail__logo')).toBeFocused();
  await page.keyboard.press('/'); await expect(page.locator('.palette[open]')).toBeVisible(); await page.keyboard.press('Escape');
  const anim = await page.evaluate(() => getComputedStyle(document.querySelector('.ctx'), '::before').animationName); expect(anim).toBe('none');
});
test('no console errors on all three pages', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('lx_logged_in', '1'));
  for (const p of ['home.html', 'login.html', 'dashboard.html']) { const errs = []; page.on('pageerror', e => errs.push(e.message)); await page.goto(p); await page.waitForTimeout(1500); expect(errs, p).toEqual([]); }
});
```
- [ ] **Step 4: 실행** `npm test` 전체 PASS → **Step 5: 커밋** `git add -A && git commit -m "test: 계획 1 품질 패스(체크리스트·스크린샷 대조·접근성)"`

---

## 후속 계획 (별도 문서)
- 계획 2: 프로젝트 목록·워크플로우 캔버스·워크스페이스 하위 페이지, 마이페이지
- 계획 3: 데이터 관리, 분석 실행·결과 페이지
- 계획 4: XI 맵·타임 스크럽·map-* 페이지, 카드 발행 관리·배포 애니메이션, 서비스 지원·관리, 회원가입
