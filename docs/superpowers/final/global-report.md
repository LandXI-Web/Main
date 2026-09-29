# global — 해외 기관 화면 보고 (명세 §2.15 · 판정 1차 재지적 반영 2026-09-29)

## 판정 1차 재지적(9/29) → 조치 · 정문 로그인 실측

확인 스크립트 `shots/final/global/capture.mjs`(스틸·영상) · `shots/final/global/judge4.mjs`(계절 전환 직후 이유 한 줄 · 적재 실패). 모든 정상 실행에서 콘솔 오류 0, 금지어 0, 한국어 0.

| # | 지적 | 지금 코드 | 실측(9/29) |
|---|---|---|---|
| 1 | HUD 가 계절 녹화(첫 달↔마지막 달 \|ΔNDVI\|)를 셈 | 이미 바뀌어 있습니다. HUD = **`Crop condition drop · {district}`**: 경작지(WorldCover 2021 class 40) 중 이번 계절 평균 NDVI 가 **전년 같은 계절**보다 0.1 이상 낮은 화소 면적(km² `~`). 호버 한 줄 `Cropland where NDVI fell 0.1 or more vs {전년 계절} · {Mon}–{Mon YYYY} · as of …`. 청록 채움(`gl-change`)도 이 하락 화소만 칠합니다(`ndvi-tiles.js` `dropOf`). 계절 안 녹화는 세지 않습니다. | kgz-agri Ysyk-Ata(경작지 489.4 km²): Spring **67.7** · Summer **136.6** · Autumn **117.8 km²** (1440·390 같은 값) |
| 2 | 보고서 ↔ 코드 | 이 문서를 지금 코드로 맞췄습니다. 소유 파일에 `ndvi-tiles.js` 포함. 착지는 아래 '착지' 줄이 실측입니다. 옛 계절 \|ΔNDVI\| 서술·수치는 문서에서 뺐습니다. | — |
| 3 | 적재 실패를 '배포 없음'으로 위장 · kgz-land 스틸 3장 md5 동일 | `/deploys`·`lx-countries.json`·카탈로그는 4회 재시도 후 끝내 실패하면 K9 `Could not load the map` + `Try again`. `No result yet`(글로브 위)은 배포가 정말 0일 때만.<br>**kgz-land 원인**: 서버 DB 에 `kgz-land` 해외 배포가 0건입니다(9/29 `kgz-land-manager` 토큰 `GET /deploys?scope=global` → `items: []`, lx-staff 로 보아도 해외 배포는 `dp-mm-meiktila-25`·`dp-kgz-agri-farm-26` 둘뿐). 계약 시드(`landxi/ops/data/fixtures/deploys.json`)에는 `dp-kgz-land-change-26`(Sokuluk · 결과 0 · 첫 분석 대기)이 있습니다.<br>**계약 어댑터(app.js)**: 서버가 정상 응답했는데 어떤 해외 기관의 배포가 0건이고 계약 시드에 그 기관 배포가 있으면, 그 범위를 기관 지역으로 씁니다. 결과는 지어내지 않습니다(HUD 는 서버의 끝난 `index` 작업이 있어야만 섭니다). 견적·제출에는 서버에 없는 `deploy_id` 를 싣지 않습니다(견적 실측: 있든 없든 `allowed:true`, eta 107 s, CPU 풀). 서버에 배포가 돌아오면 저절로 꺼집니다. `?dev=1` 에서만 `window.__glDeploys` 로 출처(`contract`)가 보입니다. | kgz-land 정문 로그인 → 글로브 → Kyrgyzstan → **Sokuluk** · HUD `Crop condition drop · Sokuluk` `No result yet`. 스틸 **5장 × 2폭**을 새로 찍었고 md5 가 모두 다릅니다: `global-{1440,390}-kgz-land-{1-globe,2-country,3-district-season,4-ndvi,5-sprawl}.png`.<br>적재 실패(`/deploys` 끊기): `global-{1440,390}-kgz-land-loadfail.png` = `Could not load the map` · `Try again` |
| 4 | 영상은 있는데 결과 없는 지역의 빈 상태 | `covered()` 참 + 결과 없음 → NDVI 탭 K9 `No result yet` + `Run this season`(행동 1, 아래 Run 숨김). HUD 도 `No result yet`. Sprawl 탭은 `No result yet` 만(행동 0 · 계절 실행은 건물 면적을 만들지 않음 — 2차 판정). `No imagery for this season yet`/`Request imagery` 는 `covered()` 거짓일 때만. | kgz-land Sokuluk 1440·390: NDVI `No result yet Run this season` · Sprawl `No result yet` · HUD `No result yet` |
| 5 | Run 비활성 이유 빈 줄 | 견적 대기(`!S.quote` · `pending` · 키 불일치) 동안 `Checking…` 한 줄. | `judge4.mjs`: 계절 바꾼 다음 프레임에 세 계절 모두 `Checking…` + 비활성(kgz-land 390·1440, kgz-agri 390·1440) → 견적 도착 뒤 활성·줄 사라짐 |
| 6 | 390 마스트 기관명 사라짐 | 마스트 좌에 짧은 이름(`.gl-home-s`, 전체 이름은 풍선) | 390 마스트: kgz-land `LAND-XI Land · KGZ Ask ? Sign out` · kgz-agri `LAND-XI Agri · KGZ …` |

- **착지(9/29 실측)**: kgz-agri → Ysyk-Ata(Autumn 2025, 117.8 km²) · kgz-land → **Sokuluk**(`No result yet`) · lx-staff → Ysyk-Ata(117.8 km²). lx-staff 는 KGZ 두 배포(Ysyk-Ata · Sokuluk) 중 배포 범위와 겹침이 큰 지역으로 착지하며, Sokuluk 는 `?country=KGZ&district=92254566B29732535637196` 로 엽니다.
- **첫 뷰(capture LINT)**: kgz-land 1440 194자·버튼 6 · 390 122자·버튼 6 · lx-staff 1440 150자·버튼 7. 금지어 0 · 한국어 0.
- **영상**: `global-1440-kgz-land.mp4`(18.5초, 1.55배속) — 정문 로그인 → 흰 글로브 → Kyrgyzstan → Sokuluk HUD `No result yet` → 계절 Summer 2025 → `Run this season` 활성. 기존 `global-{1440,390}.mp4`(kgz-agri, 3차) 유지.
- 실행 제출(`Run this season`)은 이번에 누르지 않았습니다(견적만 · CPU 큐 · GPU 0).
- 촬영 도구: 이 PC 의 `_env/ms-playwright` 에 맞는 빌드가 없어 `PLAYWRIGHT_BROWSERS_PATH=%LOCALAPPDATA%/ms-playwright` 로 돌렸습니다.

---

(아래는 이전 차수 기록 — 지금 코드와 다른 곳은 위 표가 우선합니다)

## 판정 3차 기록

## 판정 3차 지적 → 조치 (2026-09-27 · 정문 로그인 실측)

확인 스크립트: `shots/final/global/judge3.mjs` (judge2 + `dim` 단계 + 숨긴 원문 기록). 모든 실행에서 콘솔 오류 0, 한국어 0.

| # | 지적 | 조치 | 실측 |
|---|---|---|---|
| 1 | Ctrl K 답에 다른 기관·예시 지역(`Namwon`)이 나옴 | **서버 S-10(locale·문맥)은 아직 없습니다**(`server/agent`·`landxi_api/agent.py`에 `locale` 처리 0). 그래서 화면 측 계약 준수 어댑터로 막았습니다(`app.js`).<br>① 답이 흐르는 동안 원문은 화면에 붙이지 않고 점 셋만 둡니다.<br>② 끝났을 때 **이 지역 bbox 안을 가리키는 도구 결과**(`ui_actions`의 bbox·center·features·geojson → `onAction`)가 없으면, 또는 답에 국내 지명·`-gun/-si/-dong` 꼴·PNU 모양 숫자·한글이 있으면 원문을 버리고 `No data for this area yet`로 바꿉니다. 뒤에 흐린 글씨로 `· {지역} · {계절}`을 붙입니다.<br>③ 키트에 넘기는 `stage`를 감싸 **지역 밖으로 가는 `go`·`geo`는 무시**합니다(남원으로 날아가지 않게).<br>④ 문맥은 `locale:'en'`, `country`, `region`/`district`, `season`을 보냅니다. 서버가 아직 읽지 않으므로 질문 끝에 `(Area: {지역}, {계절}. Answer in English only, about this area only.)`를 덧붙여 보냅니다. 입력창에는 원문만 남습니다.<br>거절 문구(S-10 두 문장의 영문)와 `Can't answer right now`는 그대로 둡니다. | kgz-agri · Ysyk-Ata · `How did cropland change in Ysyk-Ata this season?`<br>**1440**: 서버 원문 = "…My current operational scope is limited to the **Namwon** area in South Korea."(화면에 안 보임) → 화면 답 `No data for this area yet · Ysyk-Ata · Autumn 2025`. Namwon 0, 한글 0, 지도 이동 0(칩 `› Kyrgyzstan › Ysyk-Ata` 유지).<br>**390**: 원문 = "…limited to the **Namwon** area… Please provide a request related to the Namwon region." → 같은 한 줄. Namwon 0, 한글 0.<br>스틸 `judge3-{1440,390}-kgz-agri-ask-answer.png` |
| 2 | 지역 밖 딤(0.45)이 법전 v2.2 §6 '위성 그대로'와 어긋남 | `toDistrict`의 `gl-mask` `fill-opacity`를 **0**으로 내렸습니다. 초점은 현재 지역 2.4px 흰 경계와 내 지역 흰 0.08 채움으로 그대로 둡니다. | Ysyk-Ata(kgz-agri)·Sokuluk(lx-staff) × 1440/390 스틸에서 지역 안팎 밝기 차가 없습니다. `judge3-{1440,390}-{kgz-agri,lx-staff-sokuluk}-dim.png`. 표준 스틸 `global-{1440,390}-*.png`, `global-{1440,390}-lx-staff-sokuluk-*.png`도 다시 찍었습니다. |

- 영상을 다시 찍었습니다. 둘 다 1.55배속이고, 정문 로그인 → 글로브 → 나라 → Ysyk-Ata HUD(딤 없음) → Ctrl K 질문 → 점 셋 → `No data for this area yet · Ysyk-Ata · Autumn 2025` 순서입니다.
  - `global-1440.mp4`: 19.6초
  - `global-390.mp4`: 19.3초
- 390 첫 녹화 1회는 게이트웨이 연결이 끊겨(`ERR_CONNECTION_RESET`, 2차에서 관측한 재시작과 같은 증상) 답이 오지 않았습니다. 곧바로 다시 찍었고, 위 값은 두 번째 실행입니다.
- GPU: 질문은 모두 `/agent/runs`(게이트웨이)로만, 한 번에 한 건씩 보냈습니다. 합계 4건입니다.

### 3차에 남은 것 · 요청

- **서버 S-10**: `context.locale='en'`이면 영어로 답하고, `country · district · season`을 문맥에 넣고, 범위 밖은 도구 호출 없이 영문 거절 한 줄만 내도록 요청합니다. 지금 서버 답은 영어이지만 "남원만 다룬다"는 내용이라 화면이 버리고 있습니다. 서버가 들어오면 `ckEnglish`의 질문 덧붙이기와 원문 보류를 걷어낼 수 있습니다. 가드(지역 밖 도구 결과·국내 지명 차단)는 안전망으로 남겨도 됩니다.
- **키트 요청**: K10 `mountCmdk`에 `onAnswer(text) → text|null`(답 교체 훅)과 `stage` 이동 거부 훅을 요청합니다. 지금은 MutationObserver와 stage 감싸기로 처리합니다.


## 판정 2차 지적 → 조치 (3차 표가 우선) (2026-09-27 · 정문 로그인 실측)

확인 스크립트: `shots/final/global/judge2.mjs` (ACC × W × STEPS). 모든 실행에서 콘솔 오류 0, 한국어(본문 + 속성) 0.

| # | 지적 | 조치 | 실측 |
|---|---|---|---|
| 1 | `?` 도움이 국문(help-my iframe)이거나 빈 판 | `K.shell({ onHelp })`로 **영문 도움 서랍**을 띄웁니다. 제목 `Help`, 안내 3줄, 문의 1줄(`Contact landxi@lx.or.kr · +82 63-713-1218`, help-my의 자리표 ※ 그대로)로 구성했습니다. `Esc`로 닫힙니다(K5). | kgz-agri · kgz-land · lx-staff × 1440/390 **6조합 모두** 안내 3줄 + 문의 1줄, 한글 0, iframe 0. 스틸 `judge2-{1440,390}-{kgz-agri,kgz-land,lx-staff-sokuluk}-help.png` |
| 2 | HUD 라벨 `Crop condition drop`이 명세 `Changed area`와 다름 | **명세를 개정했습니다.** `LANDXI-FINAL-SPEC.md` §2.15의 레이아웃 그림, 문구 줄, 새 **문구 개정 표**(HUD 라벨 · 호버 한 줄 정의 · `No result yet` · `Checking…` · `Try again` · Download 숨김 · `?` 도움 문구)를 고쳤습니다. §4.7 허용 라벨의 `Changed area(global)`도 `Crop condition drop(global · 구 Changed area)`로 바꿨습니다. 명세 소유자가 거부하면 `STR.hud` 한 줄을 `Changed area · {district}`로 되돌리면 되고, 정의는 호버에만 남습니다. | 명세 = 화면 |
| 3 | 결과 없는 지역 Sprawl 탭의 `Run this season`이 죽은 행동 | Sprawl 탭에 결과가 없으면 K9 `No result yet`만 둡니다. **행동은 0개**입니다. 시트 아래 Run 버튼과 `Checking…` 줄도 이 탭에서는 숨깁니다. 계절 실행은 건물 면적을 만들지 않고, 건물 결과를 만드는 작업은 아직 없기 때문입니다. | lx-staff Sokuluk Sprawl 탭 버튼 `[]`, 본문 `No result yet` (1440·390). Season 탭은 `Run this season` 1개로 그대로입니다. |
| 4 | 결과 0 지역의 `Download`가 헤더만 있는 CSV(52B)를 내려줌 | 행을 만드는 함수 `rowsOf`를 분리했습니다. 값 행이 0이면 **Download를 숨깁니다**. 결과가 늦게 도착하면 `dlCheck`가 다시 판정합니다. 버튼이 모두 숨으면 버튼 줄 자체가 접힙니다. | Sokuluk: Download 보이지 않음. Ysyk-Ata: 보임, 내려받은 `ysyk-ata-changes.csv`는 882B · 12줄 |
| 5 | 위치 칩이 지역 단계에서 `🌐 › Kyrgyzstan`까지만 표시되고, 나라 단으로 올라가도 시트가 남음 | 지역 단계의 마지막 단에 지역 이름(`› Ysyk-Ata`, `aria-current=location`)을 넣었습니다. 접힌 시트에는 `visibility:hidden`을 transform/opacity 전환 뒤에 줍니다. 그래서 화면 밖·투명 상태에서도 접근성 트리와 측정에 남지 않습니다. | 지역: `› Kyrgyzstan › Ysyk-Ata`. 나라 단 클릭 뒤: level=country, 칩 `› Kyrgyzstan`, 시트는 1440 x=1456 / 390 y=862(화면 밖), opacity 0, visibility hidden. 스틸 `judge2-*-country.png` |
| 6 | K10 계획 문구·확인 버튼이 국문 | 키트 en 사전이 나오기 전까지 global이 `ckEnglish()`로 덮어씁니다. 하는 일은 셋입니다. ① 제출할 때 질문 끝에 `(Answer in English only.)`를 붙여 보냅니다. capture 수신자로 키트보다 먼저 돌고, 입력창에는 남기지 않습니다. ② 계획 줄·확인 카드·거절 문구(S-10 두 문장)를 영문 사전으로 바꿉니다. ③ 그래도 남는 국문 답은 `Can't answer right now` 한 줄로 바꿉니다. | **질문 1건**(kgz-agri · 390 · Ysyk-Ata): `How much cropland dropped this season?` → 영문 답, 한글 0. 입력창에는 원문만 남았습니다. 스틸 `judge2-390-kgz-agri-ask-answer.png` |
| 7 | 390에서 Ask 팔레트가 HUD·위치 칩 위에 겹침 | ≤640에서는 팔레트가 **마스트 바로 아래(top 56) 전폭 시트**가 됩니다. 아래쪽만 둥글고, 딤도 마스트 아래부터 덮습니다. ≤960에서는 팔레트가 열려 있는 동안 HUD·위치 칩·경계 안내를 `visibility:hidden`으로 비킵니다. | 390: 팔레트 [0, 56, 390×60], HUD·칩 hidden. 스틸 `judge2-390-kgz-agri-ask-open.png` |

### 2차 실측 (capture.mjs · 정문 로그인)

| 계정 · 폭 | 첫 뷰 글자 | 버튼 | 금지어 | 한국어 | 콘솔 오류 |
|---|---|---|---|---|---|
| kgz-agri 1440 / 390 | 197 / 135 | 7 / 7 | 0 | 0 | 0 |
| lx-staff Sokuluk 1440 / 390 | 141 / 124 | 6 / 6 | 0 | 0 | 0 |
| kgz-land 1440 / 390 (배포 0) | 109 / 37 | 4 / 4 | 0 | 0 | 0 |

- 1440 첫 뷰 글자 수가 188에서 197로 늘었습니다. 위치 칩에 지역 이름이 더해졌기 때문입니다. 한도 200 안입니다.
- 영상을 다시 찍었습니다. 둘 다 1.2배속이고, 정문 로그인 → 글로브 → 나라 → Ysyk-Ata HUD → Sprawl → `?` 영문 도움 → 위치 칩 나라 단 → 시트 접힘 순서입니다.
  - `global-1440.mp4`: 18.5초
  - `global-390.mp4`: 16.6초

### 2차에 남은 것 · 요청

- **Ctrl K 답의 품질(서버 · S-10)**
  - 답은 영문이지만 내용은 "이 지역 데이터에 접근할 수 없다"였습니다.
  - 원인은 두 가지입니다. 에이전트의 `context_line`이 `view/on/frame`만 읽고, global이 보내는 `country · region · season`을 버립니다. 또 해외 지역 도구(작황 하락 봉투)가 없습니다.
  - 서버 팀에 요청합니다: `context.locale='en'`이면 SYSTEM 규칙 8(한국어 답)을 영어로 바꾸고, global 문맥 필드를 전달해 주십시오.
  - 그러면 ①의 덧붙이기를 걷어낼 수 있습니다.
- **키트 요청(유지)**: K10 en 사전(`SAY` · 확인 카드). 들어오면 `ckEnglish`의 ②를 지웁니다. 나머지 키트 요청은 아래 1차 목록 그대로입니다.
- **명세 개정 확인 요청**: §2.15와 §4.7을 이 화면 팀이 고쳤습니다(판정 지시). 명세 소유자의 확인이 필요합니다.

---

(아래는 1차 보고 — 지금 코드와 다른 곳은 2차 표가 우선합니다)


- 경로: `/landxi/v3/global/`. 커밋은 하지 않았습니다.
- 소유 파일(모두 `landxi/v3/global/`):
  - `index.html`
  - `app.js`
  - `global.css`
  - `ndvi-tiles.js`: 월별 NDVI 타일 모으기, 경작지 마스크, 작황 하락 계산
  - `data/kgz-sprawl-ysykata-2017-2025.json`
  - `data/pc-mosaics-2024.json`: 이번에 새로 만들었습니다. 전년 같은 달 S2 모자이크 searchid 8개입니다.
- 촬영 스크립트: `shots/final/global/capture.mjs`
- 동작 확인은 정문 `/landxi/v3/login/` 폼에 직접 입력해 로그인하는 방식으로만 했습니다. 세션은 주입하지 않았습니다.
  - 확인한 계정: `kgz-agri-manager`, `kgz-land-manager`, `lx-staff`
  - `lx-staff`는 LX 콘솔로 착지합니다. 그래서 로그인한 뒤 `/landxi/v3/global/`을 직접 열었습니다.

## 판정 1차 지적 → 조치

| # | 지적 | 조치 | 실측 |
|---|---|---|---|
| 1 | HUD 'Changed area'가 계절 녹화(첫 달↔마지막 달 \|ΔNDVI\|)를 셈 | **정의를 바꿨습니다.** 새 정의는 **작황 하락**입니다. 경작지(ESA WorldCover 2021 class 40) 가운데 이번 계절 평균 NDVI가 **전년 같은 계절 평균보다 0.1 이상 낮은** 화소의 면적입니다. 라벨은 `Crop condition drop · {district}`, 단위는 km², 신뢰 기호는 `~`입니다. 호버 한 줄도 같은 정의를 말합니다(예: `Cropland where NDVI fell 0.1 or more vs Summer 2024 · Jun–Aug 2025 · as of …`). 지도의 청록 채움도 이 하락 화소만 칠합니다. Sprawl 칸은 청록에서 호박색 `#FFB331`로 바꿨습니다. | Ysyk-Ata 경작지 **489.4 km²** 중: Spring **67.7**, Summer **136.6**, Autumn **117.8 km²**. 두 해 모두 값이 있는 경작지 화소 비율은 세 계절 모두 1.000입니다. |
| 2 | 보고서와 코드 불일치 | 이 문서를 지금 코드 기준으로 다시 썼습니다. 옛 계절 \|ΔNDVI\| 서술과 그 수치는 모두 지웠습니다. | — |
| 3 | 적재 실패를 '배포 없음'으로 위장 | `/deploys`, `lx-countries.json`, 카탈로그 셋 다 **4번까지 재시도**합니다(0.8, 1.6, 3.2초 간격). 하나라도 끝내 실패하면 K9 `Could not load the map` + `Try again`을 냅니다. `No result yet`은 배포가 정말 0건일 때만 냅니다. **원인도 찾았습니다(아래 A).** | `/deploys`를 끊고 재현했을 때 `global-{1440,390}-loadfail-1-globe.png`처럼 오류 카드가 뜹니다. |
| 4 | 영상은 있는데 결과가 없는 지역의 빈 상태 문구 | `covered()`가 참이고 결과가 없으면 NDVI·Sprawl 탭에 K9 `No result yet` + `Run this season`(행동 1)을 냅니다. 이때 시트 아래 Run 버튼은 숨겨 행동이 하나만 남게 했습니다. HUD도 `No result yet`을 씁니다. `No imagery for this season yet` / `Request imagery`는 `covered()`가 거짓일 때만 나옵니다. | lx-staff로 Sokuluk에 가면 HUD, NDVI 탭, Sprawl 탭이 모두 `No result yet`입니다(`*-lx-staff-sokuluk-*`). |
| 5 | Run 비활성 이유가 빈 줄 | 견적을 기다리는 동안(`!S.quote`, `pending`, 키 불일치)은 `Checking…` 한 줄을 늘 보여 줍니다. | 계절을 바꾼 직후 `Checking… \| run disabled` → 견적 도착 → 활성. 세 계절 모두 이렇게 되는 것을 확인했습니다. |
| 6 | 390에서 마스트 기관명이 사라짐 | 키트가 ≤960에서 `.home`을 숨깁니다. 그래서 화면이 마스트 좌에 짧은 이름을 따로 둡니다. 규칙: 나라 형용사와 일반어(Ministry / State / Agency / of / on …)를 빼고 첫 낱말만 남깁니다. 8자를 넘으면 앞 4자만 쓰고, 뒤에 `· ISO3`를 붙입니다. 전체 이름은 풍선으로 보입니다. Ask, ?, Sign out은 줄어들지 않게 했습니다. | 390 마스트: `LAND-XI Agri · KGZ Ask ? Sign out` · `Land · KGZ` · `LX · KGZ` |

### A. '배포 없음'으로 보였던 원인 두 가지 (실측)

1. **게이트웨이 `/health` 응답이 0.5–6.4초 걸립니다.** curl 4회 측정값은 1.55, 0.82, 0.54, 6.35초였습니다.
   - 공용 `probe()`는 1.5초가 지나면 요청을 끊고 `API.mode='off'`로 굳힙니다. 그 뒤 `api()`는 모두 `off 모드` 예외를 냅니다.
   - 옛 코드는 이 예외를 `{items:[]}`로 삼켰고, 그래서 390 첫 실행이 글로브 + `No result yet`으로 보였습니다.
   - 조치: 이 화면만 첫 확인이 실패하면 `probeMs`를 8초로 늘려 다시 확인합니다. 재시도할 때마다 off이면 `probe(true)`를 다시 부릅니다.
2. **`kgz-land`의 해외 배포가 지금 DB에 0건입니다.**
   - `kgz-land-manager` 토큰으로 `GET /deploys?scope=global`과 `?include_test=1`을 불렀고, 둘 다 `items: []`였습니다.
   - `lx-staff`로 보면 해외 배포는 `dp-mm-meiktila-25`와 `dp-kgz-agri-farm-26` 두 건뿐입니다.
   - 픽스처 `landxi/ops/data/fixtures/deploys.json`에는 `dp-kgz-land-change-26`(kgz-sokuluk)이 있습니다. 하지만 서버 DB에는 없습니다. 테스트 배포 18건을 정리할 때 함께 빠진 것으로 보입니다.
   - (9/29 갱신) 이 상태는 이제 계약 어댑터로 메웁니다 — kgz-land 는 Sokuluk 로 착지합니다(맨 위 표 #3). 당시 기록: 스틸 `global-{1440,390}-kgz-land-1-globe.png`를 다시 찍었습니다. 두 장의 md5는 서로 다르고, 옛 스틸과도 다릅니다.
   - 결과가 없는 지역의 화면(판정 #4)은 `lx-staff`로 Sokuluk에서 찍었습니다(`?country=KGZ&district=92254566B29732535637196&season=Summer+2025`).

## 화면 구성 (명세 배치 그대로 · HUD 라벨만 판정 #1에 따라 바꿈)

```
[LAND-XI · {tenant}   Ask Ctrl K · ● 18:43 · Agency · {tenant} · ? · Sign out]     (390: LAND-XI Agri · KGZ · Ask · ? · Sign out)
┌ 흰 글로브 → 나라 → 지역 (한 지도) ───────────────────────────┐┌ 시트 392 ────────────┐
│ 위치 칩: (글로브) › Kyrgyzstan › Ysyk-Ata                        ││ Season · NDVI · Sprawl│
│ HUD: Crop condition drop · Ysyk-Ata   117.8 km² ~                ││ [Run this season] [Download]
└──────────────────────────────────────────────────────────────────┘└───────────────────────┘
```

- **착지**
  - kgz-agri: Ysyk-Ata, Autumn 2025, HUD 117.8 km²
  - kgz-land: Sokuluk · `No result yet`(9/29 계약 어댑터 · 맨 위 표 #3)
  - lx-staff: KGZ Ysyk-Ata(배포 범위와 겹침이 가장 큰 지역)
- **HUD**: 이 지역·이 계절에 끝난 `index` 작업이 있을 때만 수를 냅니다. 다음 경우에는 `No result yet`입니다.
  - 작업이 없을 때
  - 경작지 마스크가 없을 때
  - 두 해 모두 값이 있는 경작지 화소가 90% 미만일 때
  - 영상 자체가 없으면 `No imagery for this season yet`을 냅니다.
- **지도 층**: 탭마다 하나만 켭니다.
  - Season: 작황 하락 화소(청록, 지역 폴리곤 안만). 실행 중에는 막 도착한 달의 NDVI를 보여 줍니다.
  - NDVI: 최근 달 NDVI(RdYlGn, 지역 안만)
  - Sprawl: 2017→2025 건물 변화 칸(호박색)
- **Download**: CSV 한 개. `Crop condition drop`(계절), `Built area` 2017·2025, 달별 `NDVI mean`이 들어갑니다.
- **경계 밖**: `Outside your districts`를 2.6초 보여 줍니다. LX 계정은 막지 않습니다.
- **Ctrl K**: 2차에서 질문 1건을 보냈습니다. 영문 답이 왔고 한글은 0이었습니다(위 표 #6).

## 합격선 실측 (정문 로그인 · 콘솔 오류 = `console.error` + `pageerror` + HTTP ≥ 400)

| 항목 | 기준 | 실측 |
|---|---|---|
| 첫 뷰 글자 수 | ≤ 200 | 1440: kgz-agri **188**, lx Sokuluk 141, kgz-land 109 · 390: kgz-agri **126**, lx 124, kgz-land 37 |
| 버튼 | ≤ 8 | **7** (배포 0 화면은 4) |
| 금지어 (K16 `scan`) | 0 | **0** (모든 실행) |
| 한국어 잔존 (본문 + 속성) | 0 | **0** |
| 콘솔 오류 | 0 | **0**. 정상 실행 기준입니다. `ERR_ABORTED`는 정문 착지 리다이렉트로 생기는 탐색 취소입니다. loadfail 스틸만 일부러 `/deploys`를 끊어 오류를 냈습니다. |
| 견적이 착지를 막지 않음 | 예 | 예. 도착 뒤 400ms에 견적을 요청합니다. 그동안 `Checking…`을 보여 줍니다. |
| `Run` 비활성 시 이유 한 줄 | 예 | 견적 대기 `Checking…` · 실행 중 `Computing · about {n}s` · 거절 이유 한 줄 · 영상 없음 K9 |
| 착지 시간 | — | 정문 입력부터 HUD 수까지 약 **11–13초**입니다. 로그인 약 3초, 경작지·2개년 타일 계산 약 2–4초가 포함됩니다. |

## 데이터 출처 (숫자는 모두 봉투 · 신뢰 기호 K6)

| 화면의 수 | 출처 · 계산 | 기호 |
|---|---|---|
| HUD `Crop condition drop` | `ndvi-tiles.js`의 `dropOf` 함수로 계산합니다. 입력은 세 가지입니다. ① 이번 계절 달별 NDVI(카탈로그 `pc-ndvi-mosaic` searchid) ② 전년 같은 달(`data/pc-mosaics-2024.json`) ③ 경작지(카탈로그 `pc-worldcover-2021`, 원값 타일, class 40). 계산 방법: z11 타일을 지역 격자로 모으고, 화소마다 유효한 달만 평균을 냅니다. 그다음 (전년 평균 − 올해 평균) ≥ 0.1인 화소의 면적을 구면 면적으로 더합니다. 조건: 이 지역·이 계절에 끝난 `index` 작업이 있어야 합니다(`as_of` = 작업 `finished_at`). | `~` |
| Sprawl 2017 / 2025 | 500m 격자(`kgz-sprawl-*.json`)의 건물 비율 × 칸 면적입니다. 격자가 지역을 90% 이상 덮을 때만 값을 냅니다(Sokuluk은 미달이라 `No result yet`). | `~` |
| Season · NDVI 달별 값 | 이 지역의 최근 `index` 작업 결과(`GET /results/{job}/index`)를 씁니다. 없으면 `ysykata-ndvi-2025.json`을 씁니다(같은 지역일 때만). | `✓` |
| 실행 | `POST /jobs/quote` → `POST /jobs {kind:index, model_id:'index/ndvi_pc', options.mask:'worldcover-40'}` → SSE로 진행을 받습니다. CPU 큐만 쓰고 GPU는 쓰지 않습니다. | — |

- `data/pc-mosaics-2024.json`은 서버 파이프라인 `g2_pc_cache.py`와 **같은 본문**으로 PC `mosaic/register`를 호출해 만들었습니다. 본문 조건: sentinel-2-l2a, 같은 bbox, cloud ≤ 10, 구름 적은 순. 연도만 2024입니다.
- 2024-07은 Sokuluk 북부 타일 한 장이 거의 비어 있습니다(유효 70/65536 화소). 계절 평균은 유효한 달만 쓰므로 계산은 됩니다.

## 키트 요청 (kit 팀)

1. K6 `sig.humanize` / `why` 로캘화: 지금 국문 사전입니다. 해외 화면은 `enSig`로 덮어쓰고 있습니다.
2. `.t-sig[data-sig="ex"]::before` 문구 `예시`: 해외 화면은 `global.css`의 `html[lang=en]`에서 덮어씁니다.
3. K3 `createStage`: 캔버스 aria-label이 `지도`로 고정입니다. `projection:'globe'` 옵션도 있으면 좋겠습니다.
4. K10 `cmdk.js`: 계획 문구와 확인 버튼이 국문입니다. en 사전을 요청합니다.
5. K1 `shell`:
   - ≤960에서 `.home`을 숨기면 좁은 화면에서 기관이 사라집니다. 짧은 이름 슬롯(예: `who.short`)을 요청합니다. 지금은 화면이 `.gl-home-s`를 직접 붙입니다.
   - 반환 객체의 `mast` 이름 충돌도 그대로 남아 있습니다.
   - ≤420에서 `.k-mast-slot`이 줄어들어 Ask와 `?`가 겹칩니다. 화면에서 `flex:none`으로 막았습니다.
6. K9 `empty`: 호출한 요소 자체에 `.k-empty`를 붙입니다. 그래서 바깥 배치 클래스와 같은 요소가 되면 compact가 아닐 때 그림이 화면 전체를 덮습니다. 화면에서는 한 겹 감싸서 해결했습니다.
7. K12 `line`: 끝점 값의 자릿수 옵션(`digits`)을 요청합니다.

## 서버 · 다른 팀 요청

- **`/api/v1/health` 지연(0.5–6.4초)**: 공용 `probe()`의 1.5초 제한에 걸리면 화면 전체가 off 모드로 굳습니다. 다른 화면도 같은 위험이 있습니다. health를 가볍게 해 주시거나(DB·GPU 조회 제외), `probeMs`를 조정해 주시기 바랍니다. 촬영 중 게이트웨이가 몇 차례 재시작되는 것도 관측했습니다(`ERR_CONNECTION_REFUSED`).
- **`dp-kgz-land-change-26` 복원**: 픽스처에는 있지만 DB에는 없습니다. 지금은 화면의 계약 어댑터가 메우고 있고, 서버에 들어오면 어댑터는 저절로 꺼집니다.
- **S-11**(글로벌 타일 프록시 캐시 · 월별 사전 계산)은 아직 없습니다. PC 타일을 브라우저가 직접 받습니다. 이번 촬영에서 첫 방문 실패는 0이었습니다.
- **`/results/{set}/stats`**: `index` 작업에서는 비어 있습니다. 작황 하락 면적을 `index` 작업이 봉투로 내 주면(같은 정의) 화면 계산을 걷어낼 수 있습니다.

## 정직 항목

- 작황 하락은 **추정치 `~`**입니다. 이유는 네 가지입니다.
  - 월별 모자이크는 구름이 적은 장면부터 채운 것이고, 달마다 촬영일이 다릅니다.
  - 경작지는 2021년 지도입니다.
  - 임계 0.1은 화면이 정한 값입니다.
  - 수확 시기가 해마다 달라서 가을 값에는 시기 차이가 섞일 수 있습니다.
- HUD 수는 끝난 작업이 있어야만 섭니다. 하지만 계산 자체는 브라우저가 PC 타일로 합니다. 작업 결과 파일에서 읽은 값이 아닙니다.
- (2차에서 해소) Sprawl 탭에 결과가 없을 때는 이제 `No result yet`만 두고, 행동은 0개입니다.
- 이번 차수에서는 `Run this season` 실제 제출을 다시 하지 않았습니다. 기존에 끝난 작업(kgz-agri Ysyk-Ata 3계절)으로 HUD를 확인했습니다.
- 영상에 대한 참고:
  - `global-1440.mp4`(19.3초)는 1.2배속입니다. 정문 로그인 → 글로브 → 나라 → Ysyk-Ata HUD → NDVI → Sprawl → 계절 전환 순서이고, Summer 136.6 km²로 끝납니다.
  - `global-390.mp4`(18.6초)도 1.2배속입니다.

## 결과물 (`shots/final/global/`)

- kgz-agri:
  - `global-1440-{1-globe,2-country,3-district-season,4-ndvi,5-sprawl,6-guard,7-ask}.png`
  - `global-390-{1..5}.png`
- kgz-land(Sokuluk · 결과 없음 · 9/29): `global-{1440,390}-kgz-land-{1-globe,2-country,3-district-season,4-ndvi,5-sprawl}.png` · 적재 실패 `global-{1440,390}-kgz-land-loadfail.png` · 영상 `global-1440-kgz-land.mp4`
- 결과 없는 지역(lx-staff · Sokuluk · Summer 2025): `global-{1440,390}-lx-staff-sokuluk-{1-globe,2-country,3-district-season,4-ndvi,5-sprawl}.png`
- 적재 실패 재현: `global-{1440,390}-loadfail-1-globe.png`
- 영상: `global-1440.mp4`, `global-390.mp4`
