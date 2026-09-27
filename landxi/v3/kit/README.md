# Land-XI 공용 부품 키트 (`landxi/v3/kit`)

화면은 조합만 한다. 수정 요청은 보고서로(키트 팀 소유).

```html
<link rel="stylesheet" href="/landxi/v3/kit/kit.css">          <!-- 토큰 포함 CSS 한 벌 -->
<script src="/landxi/proto/vendor/maplibre/maplibre-gl.js"></script>   <!-- 무대를 쓸 때 -->
<script src="/landxi/xi/vendor/pmtiles/pmtiles.js"></script>           <!-- 외부 타일 실패를 콘솔 오류 없이 -->
<body class="t">
<script type="module">import * as K from '/landxi/v3/kit/index.js';</script>
```

| # | 부품 | import | 주요 옵션 |
|---|---|---|---|
| K1 | 앱 셸 | `shell({ who, home, rail:{kind:'steps'\|'menu', items, current, done, onPick}, onHelp, contained })` → `{main, go, steps, fresh, mast}` | 마스트 64 · 역할 칩 · 신선도 · 레일 72 · ≤960 하단 탭 |
| K2 | 관문 | `await gate(home?)` → `{me, tenant, key, name, org, landing}` · `whoami()` · `logout()` · `landingFor(who)` | 세션 없음 → 정문 `?next=` · 역할 밖 → 정문 `?denied=` |
| K3 | 지도 무대 | `createStage(el, { mode:'app'\|'ops', interactive, scale })` → `{map, ready, go(region\|bbox), home(), geo(id, fc, 'ai'\|'focus'\|'point'), clear, show, ladder(items, order), mode(), pad()}` | 전국 bounds 시작 · go = 2400 `--e-cam` |
| K4 | 지역 선택 | `await regionPicker(el, { onPick, public })` · `loadRegions()` | `/regions`(S-3) 없으면 배포 지역으로 대신 |
| K5 | 카드·서랍·시트 | `drawer({ title, body, host, slot, onClose })` → `{set, close}` · `card({ title, body, map })` | ≤3장 · 같은 slot 교체 · Esc |
| K6 | 큰 숫자·기호 | `bignum(el, env, { label, unit, hud })` → `{set}` · `numHtml(env)` · `sig(env)` · `humanize(source)` | 봉투만 · `?dev=1` 에서 봉투 아님 = throw |
| K7 | 서비스 카드 | `serviceGrid(el, joinCards(cards, deploys), { map: r => ({ crop, where, href }) })` · `serviceCard({...})` | 상태 운영/시범/첫 결과 전 |
| K8 | 스텝퍼 | `stepper(el, [{t, d}], { current, vertical, done, onPick })` → `{go, set}` | |
| K9 | 빈 상태 | `empty(el, { kind:'first'\|'ingest'\|'outside'\|'loading'\|'404', text, action, progress })` → `{set({progress})}` | 캐릭터 = 위성·드론·항공기 |
| K10 | Ctrl K 에이전트 | `mountCmdk({ stage, guest, context, onAction })` → `{open, close, button()}` | `/agent/runs` 경유만 · 이벤트 `kit:agent-action` |
| K11 | 업로드 | `dropzone(el, { upload:{path, fields} \| onFile, onDone, onError })` | xlsx csv shp zip gpkg geojson · 20MB |
| K12 | 표·차트 | `table(el, { cols, rows, sort, limit, onRow })` · `bars(el, { items, ai })` · `line(el, { points, ai })` | 봉투 값은 기호와 함께 |
| K13 | 토스트 | `toast('배정했습니다', { action:{label, href\|onClick} })` | 3.5s · 1개 |
| K14 | 개발자 서랍 | `devDrawer({ stage, who })` · `devlog(k, v)` | `?dev=1` + LX 만 · \` 키 |
| K15 | 다국어 | `t(key, vars)` · `nf(n)` · `df(date)` · `locale()` | global 만 en · 사전 `i18n/{ko,en}.json` |
| K16 | 검사기 | 브라우저 `scan(document)` · `collect(document)` / CLI `node landxi/v3/kit/lint/forbidden.mjs --login lx-staff <url>…` · `number-lint.mjs` | 정문 폼 로그인 · 금지어 · 첫 뷰 글자 · 버튼 · 같은 지표 다른 값 |

갤러리: `/landxi/v3/kit/`(정문 로그인 후). 스크린샷 `shots/final/kit/`.
