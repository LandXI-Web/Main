# 영농관리 행정서비스 — Opus 구현 지시서 (2026-10-22 · 바퀴 22 P3 · 설계: FARM-ADMIN-DESIGN.md)

> 브리핑 확인: ① 확인 대장 번호가 있는 것만 구현 — 아래 '바로'는 사용자가 이미 지시한 것(원칙 308 · 309 · now 21 '다시'), '확인 뒤'는 now 22 답을 기다린다 ② 쉬운 말 · 겹침 0 · 숫자 한 출처 · 지역 고정값 0 ③ 에이전트는 now 를 만들지 않고 증거(items.json · 그림)만 남긴다(§1-1-1).
> 모델: 0단 낱말 · 검사기 = Sonnet / 지도 화면 겹침 · 엑셀 · 서버 = Opus / 1 ~ 3단 = Opus(서버 · 여러 화면). 동시 2 ~ 3개. 캡처는 꼭 필요한 장면만. 판정은 로그인 폼으로만(세션 주입 0). GPU 0.
> 증거 자리: `docs/superpowers/final/process/impl-47/farm-admin/{items.json, shots/}` (shots 는 .gitignore · add -f 금지).

## 0단 — 바로 할 것(확인 불필요 · 이미 지시됨)

### 0-1. 낱말 바꾸기(원칙 308 · DESIGN §5 표) — Sonnet
| 파일 | 줄 | 바꾸기 |
|---|---|---|
| `landxi/v3/xi-clean/app.js` | 186 · 187(도구 이름) · 214(aria '가르기') · 2638(aria '가르기 시점') · 2538 ~ 2640 주석은 그대로 | '가르기' → **'영상 비교'** · 손잡이 aria '비교 선' · 고르기 aria '비교할 영상' |
| `landxi/v3/kit/cmdk.js` | 'map_compare' 동작 글(사용자에게 보이는 줄) | '가르기' → '영상 비교' |
| `landxi/v3/service-detail/app.js` | '가르기' 보이는 글 | 같음 |
| `landxi/v3/gov-report/svc-parcels.js` | 144 단추 | '시점 비교' → **'영상 비교'**(title '시계열 영상 비교 — 두 해 영상을 나란히') |
| `landxi/v3/gov-select/map-extras.js` | 105 ~ 140 위 띠 | 띠 머리 글 '시계열 영상 비교' · 바뀜 한 줄은 0-5 규칙으로 |
| `landxi/v3/gov-fusion/feed.js` · `svc-app.js` | 19 · 95 · 231 · 334 | '견주기' → **'대조'**('사료작물 대장 대조' · 엑셀 이름 `사료작물_대장대조_{기준일}.xlsx`) |
| `server/landxi_api/gov_history.py` 29 · `farm_admin.py` 520 | 종류 이름 · 파일 이름 | '견주기 엑셀' → '대장 대조 엑셀' |
| `landxi/v3/kit/pledge.js` · `gov-select/tabs.js` 163 · `ops-accounts/pledges.js` · `gov-accounts` 메뉴 | 보이는 글 | '이용 약속' → 창 이름 **'개인정보 이용 확인'**(칸: 사용 목적 · 활용 기간) · 기록 화면 이름 **'다운로드 이력'** · 안내 문장 "올린 대장이 든 파일은 받을 때마다 사용 목적 · 기간을 확인합니다" |
| `landxi/v3/lx-project/new.js` | 111 ~ 150 대상지 칸 | 펼치기 글 '영상 없이 지역만 정하기' → **'브이월드에서 영상 가져오기'**(브이월드 영상으로 대상지를 정함) + 둘째 줄 **'분석 범위만 정하기(시군구 · 읍면동)'**. 자리표 '시군구 이름을 검색' 그대로 |
| `landxi/v3/gov-select/tabs.js` 151 ~ | '지도 파일 · 지도 프로그램용' | **'공간정보 받기(SHP · GeoJSON)'** |
| `landxi/v3/gov-select/app.js` svcEl | '할 일 · 결과 확인 대기 n건' | 빼기(원칙 135) — 그 줄은 '메모 없는 필지 n'(서버 값 있을 때만) 또는 비움 |
| `landxi/v3/xi-clean/app.js` 2386 ~ renderLayers · `server/landxi_api/ximap.py` 층 이름 | 기관 세션 층 이름 | 기관 realm 이면 **서비스 이름 + 영상 연도**('경작·휴경 · 2025년') · LX 작업 이름(재추론 · 4클래스 · 국산리 2시점)은 `?dev=1` 서랍만. 서버가 `display_name` 을 realm 에 따라 준다(화면이 지어내지 않음) |
| `tools/check/words.mjs` | 금칙어 | **가르기 · 견주기 · 이용 약속 · 오늘 볼 필지 · 재추론 · 4클래스 · 2시점 · 지역만 정하기** 추가(본문 · title · aria-label) |
- 수용: `node tools/check/all.mjs --only gov,app` words 0 · 바깥 주소 기관 로그인으로 XI맵 도구 열 · 필지 카드 · 행정정보와 비교 · 통계 탭 그림 4장(1440).
- 코드 변수 · 주석 · 함수 이름(`compareOn` · `swipe` 등)은 그대로(§5 "사용자에게 보이는 글자만").

### 0-2. 겹침 검사기(원칙 309) — Sonnet
- 새 파일 `landxi/v3/kit/lint/overlap.mjs`: `docs/superpowers/final/process/impl-46/farm-admin-c22/capture.mjs` 의 `MEASURE` 를 옮겨 온다(떠 있는 요소 = `[data-zone]` + `.k-main` 안 absolute/fixed · 40px 이상 · 조상-자손 제외 · 제외 목록 `.xc-stage .xc-fx .xc-load .xc-b .gs-scroll .gq-scroll .gf-stage .gr-side .k-rail .gd-hud .gd-open .xc-grip`).
- 상태 목록 `tools/check/overlap-states.json`(처음 한 벌 · DESIGN §3-3): url · 누를 선택자 열 · 기다릴 선택자 · 역할(gov/app/admin). 폭 1280 · 1440 · 390.
- `tools/check/all.mjs` 네 번째 검사 `overlap` — 겹친 폭 · 높이 > 4px 쌍 1개라도 있으면 종료 코드 1 · `overlap-check.json` + 그림.
- 수용: 지금 화면에서 돌리면 DESIGN §1-2 G1 ~ G8 이 그대로 잡혀야 한다(검사기 검증). 고친 뒤 0.

### 0-3. 지도 화면 겹침 고치기(G2 ~ G6 · 구조 바꾸지 않고) — Opus
- `xi-clean/app.js` 2206행 장애물 선택자에 `.gx-card:not([hidden])` · `.gx-cmp:not([hidden])` 추가(G2 · G4).
- `drawerOpen()`(2173행): 서랍이 열리면 `closePop()`(층 · 규칙 · 보고서 판 닫기 — G3 · G6). 반대로 `tool('layers')` 등 `showPop` 은 서랍이 열려 있으면 서랍을 닫는다(한 자리 하나). 층 판 CSS 자리는 `xc.css` 66행 그대로 왼쪽 위(지금 오른쪽에 뜨는 원인 — 1044px — 을 찾아 왼쪽으로. `xc-pop` 에 다른 규칙이 덮는 곳을 `?dev=1` 로 확인).
- 900px 아래 `layoutNow()` 가 '가운데 100%'로 고정하던 것: 390에서는 입력 한 줄만 두고 답 띠는 **아래 시트 머리**에 붙인다(`K.drawer` 모바일 시트 규칙 재사용) — 층 판 · 결과 카드가 답 띠에 덮이지 않게(G5). 결과 카드는 390에서 왼쪽 위 한 줄 칩(이미 `map-extras.css` 16행 `is-bare` 규칙이 있음 — 자리만 위로).
- 틈이 280 아래면 `.gx-card` 를 `is-bare`(한 줄)로 접는다 · 답 띠는 줄이지 않는다.
- 수용: 0-2 검사기 지도 상태 6개 0 · 1280 `08c` 그림에서 답 띠와 결과 카드가 떨어져 있음.

### 0-4. 지도 없는 화면 대화 단추 겹침(G1 · G7 · G8) — 임시 고침(구조는 1-3 Q4 뒤)
- `kit/cmdk.css` 25행 단추: 오른쪽 칸이 있는 화면(`.gr` 440 · `.gf-sheet` · `.k-drawer.is-open`)에서는 `--k-chat-r` 을 그 칸 폭 + 24 로(`kit/cmdk.js` 가 `kit:drawer` · `panes:resize` 를 듣고 변수만 쓴다). 390은 단추를 시트 머리 오른쪽으로.
- 수용: 검사기 '필지 목록 + 필지 카드'(1440 · 1280 · 390) 0.

### 0-5. 한 필지 두 문장(DESIGN §1-4) — Opus · 서버
- `gov_history.py` history 의 '바뀜' 한 줄: 종류 이름 같음만이 아니라 **필지 대비 비율**로 — 이전 해 비율 < 5% 이고 올해 ≥ 30% 면 "2023 경작 흔적 없음 → 2025 경작지"(카드 · 위 띠 · 이력이 같은 문장 — 한 함수).
- 수용: 아영면 두락리 119-1 카드 · 띠 · 이력이 같은 말.

### 0-6. 엑셀 한 벌(now 21 '다시' · DESIGN §6-1) — Opus · 서버
- `farm_more.py` `_xlsx` 를 공용으로(이력 · 필지 · 통계 · 대장 대조 · 보고서 엑셀 모두 이 함수): 1 ~ 2행 제목(기관 · 서비스 · 범위) · 기준일 · 출처, 4행 머리(굵게 · 회백), freeze A5, 자동 필터, 숫자 서식(넓이 `#,##0.0` · 개수 `#,##0` · 비율 `0.0"%"` · 날짜 `yyyy-mm-dd`), 숫자 열 있는 시트는 마지막 '합계'(SUBTOTAL(109)), 열 이름 표(DESIGN §6-1) · '서비스 버전' 열 빼고 안내 시트로, 필지 엑셀에 '메모(최근)' · '메모 날짜' 열, 파일 이름 `{기관}_{서비스}_{내용}_{기준일}.xlsx`.
- `gov-select/tabs.js` 종류별 · 읍면동별 표마다 글 단추 '엑셀'(같은 파일 · 시트 둘).
- 수용: 세 파일을 받아 openpyxl 로 서식 · 필터 · 합계 확인(`xlsx-probe.mjs` 재사용) · 한글 엑셀에서 열어 그림 1장.

## 1단 — 확인 뒤(now 22 Q3 · Q4 · Q6 · Q7)

### 1-1. 행정서비스 묶음 홈 + 왼쪽 탭(Q3 ⓐ · DESIGN §2-1) — Opus
- DB `0116_service_groups.sql`: `service_groups(tenant_id, id, name, domain, policy_tiles jsonb, "order")` · `group_cards(group_id, card_id, "order")` · RLS 기관 칸막이(0019 식). 시드: 남원 'farm' 묶음에 card-farm(경작·휴경) + 비닐하우스 카드(공유되면) — **시드도 서버 데이터**(화면 고정값 0).
- 서버: `GET /spaces/me/groups`(묶음 · 카드 · 정책 칸 값) · `GET /spaces/me/groups/{id}/dashboard`(§2-2 칸 — 모두 기존 집계 재사용 · 값 없으면 `null` + 이유) · LX 관리자 '기관에 공유' 창에 묶음 고르기(`ops-*` 공유 흐름 · `deploys` 에 `group_id`).
- 화면: 새 `landxi/v3/gov-group/`(묶음 홈 · 왼쪽 탭 7 · 휴대폰 칩 한 줄) · `gov-select/?list=1` 는 묶음 카드 + 묶음 없는 카드 · 묶음 하나면 로그인 뒤 바로 묶음 홈 · 레일에 `{묶음 이름}` 항목 · 분석서비스 대시보드 탭에서 '통계·보고서' 빼고 빵부스러기 '← 영농관리'.
- 왼쪽 탭 내용: 통합 대시보드(1-2) · 분석서비스(카드 K7) · 필지 찾기(gov-report 필지 목록을 서비스 고르기 없이 — 지번 → 카드) · 보고서·통계(지금 tabs.js renderStats + svc-report 를 묶음으로 · 서비스 고르기 칸) · 행정정보(대장)(gov-fusion 그대로 · 이름만) · 다운로드 이력(1-4) · 분석 요청 · 촬영 요청(gov-request 에 `?group=`).
- 수용: 로그인 → 결과 지도까지 클릭 2(묶음 홈 → 카드 → 결과 지도 열기) · 첫 뷰 글 ≤ 400자 · 1440 · 1280 · 390 겹침 0 · 하천 묶음을 시드로 하나 더 만들어 같은 틀이 도는지(광주전남 기관으로) 확인.

### 1-2. 통합 대시보드 칸 4(Q7 ⓐ · DESIGN §2-2) — Opus
- 칸 부품은 `kit/farm-dash.js` · `kit/chart.js` 재사용 · 숫자는 모두 `/groups/{id}/dashboard` 한 출처 · 값 없는 칸은 안내 한 줄 + 행동 1(대장 올리기 · 요청하기). 칸 누르면 조건 걸린 필지 목록(1-5 업무 칩과 같은 조건 코드).
- '이번 달' 띠: 새 결과 · 올린 대장 · 메모 쓴 필지 · 보낸 요청.

### 1-3. XI ChatGEO 자리 = 서랍(Q4 ⓐ · DESIGN §3-1 규칙 4 · §3-2) — Opus · kit
- `kit/layout.js` 새 파일(`K.zone` · `K.zone.open` · `K.zone.layout` · `K.zone.assert`) — `xi-clean` `layoutNow()` 를 옮겨 공용으로. `kit/panel.js` drawer · `xc-pop` · `gx-card` · `chat-answer` 가 `data-zone` 등록.
- `kit/shell.js`: 대화 단추를 레일 end(기관 정보 위)로 · `kit/cmdk.js`: `data-dock` 없는 화면에서 창을 `K.drawer({ slot:'right' })` 로 · `gov-report` 오른쪽 칸(440)은 대화가 열리면 필지 카드를 머리 한 줄로 접고 그 아래 대화(같은 기둥 세로 나눔).
- 휴대폰: `K.sheet` 높이 3단 `data-h` · 입력 줄은 시트 머리 slot.
- 수용: 검사기 전 상태 0 · 0-4 임시 고침 제거.

### 1-4. 다운로드 이력 탭(now 21 '다시' · DESIGN §6-3) — Sonnet
- 서버 `GET /spaces/me/downloads`(space_log kind=download + download_pledges 조인 · 횟수 = 같은 파일 키 count) · 화면 표(날짜 · 누가 · 무엇 · 개인정보 · 목적 · 기간 · 횟수) · 거르기 3 · 엑셀(0-6 규칙). 이력 탭에서 '내려받기' 종류를 빼고 이 탭으로 링크.

### 1-5. 필지 목록 업무 칩(Q6 ⓐ · DESIGN §6-4) — Sonnet
- `svc-parcels.js` 거르기 줄 맨 앞 칩 3('직불 점검 대상' · '휴경 의심' · '메모 없음') — 서버 `parcels?preset=` 조건 코드 한 벌(대시보드 칸과 같은 코드 · `gov_report.py`). 큰 숫자 라벨 = 조건 이름. 칩 끄기 = 조건 풀기. '오늘 볼 필지' 글자 · 주석 정리. 영농-S1(하루 시작 자리)은 하지 않음.

## 2단 — 확인 뒤(now 22 Q1 · Q2 · Q5)

### 2-1. 필지 계보(Q5 ⓐ · DESIGN §4) — Opus · 서버
- `0117_parcel_lineage.sql`: `parcel_snapshots` · `parcel_lineage`(§4-2) · 연속지적 갱신 작업기에 '변동 잡기' 단계(도형 교차 ≥ 1㎡ · 작은 쪽 10%) · `lineage_of(pnu)` 재귀.
- `gov_history.py` history 에 토지이동 줄 + 종전 필지 메모 · 판정(꼬리표) · 말소 필지 띠 · `parcels?q=` 옛 지번 → 후속 필지 · 전이표(`report/multi` transitions)를 PNU 같음에서 **도형 교차 면적 가중**으로 + 각주 한 줄 · 대장 대조 종류 `renumbered`.
- 시험: `server/tests/test_lineage.py` — 작은 두 벌 스냅샷(분할 1 · 합병 1 · 지번변경 1)로 사건 · 이력 · 전이표. 남원 실데이터는 사건 0건이어야 정상(지어내지 않음).

### 2-2. 이지목 분석서비스 카드(Q1 ⓑ 추천 — 답 뒤) — Opus
- ⓑ면: 파생 카드(`registry/cards` 에 `derived_from: card-farm` · `filter: {jimok: [임, 대, 잡], cls: 경작지}`) · 결과 세트는 공유 · 카드 모양 K7 같음 · 부서 권한 단위. 분석 · 모델 0.
- ⓐ면: 필지 목록 업무 칩 '지목과 다른 이용' + 대시보드 칸.

### 2-3. 겹침 자동 정리(Q2 ⓐ 추천 — 답 뒤 · P5 와 한 묶음) — Opus
- OVERLAP-DESIGN 1단 ⓐⓑ 그대로 + 결과 확인 화면(`lx-review`) '정리한 것 n곳 · 붙인 것 n곳' 읽기 전용 한 줄 · '합칠까요?' 후보만 사람에게(2단 때).

## 3단 — 제안 채택 뒤(DESIGN §2-3 혁신 1 ~ 3)
- 혁신-1 필지 한 장: `gov-report` 필지 카드 '인쇄 · PDF'(print CSS 한 벌 · 서버 PDF 는 제안-보고서인쇄PDF 와 같은 길) — 두 시점 영상 그림은 `map-extras` parcelCompare 의 두 지도 캡처(서버 png).
- 혁신-2 대장 올리면 점검표: `gov-fusion` 올린 직후 점검 숫자 3 칸 + '필지 목록으로' 단추(1-5 칩 조건).
- 혁신-3 물으면 블록: `svc-report.js` 보고서에 'XI ChatGEO 로 블록 더하기' 입력 한 줄 → agent 통계 보고서 응답(원칙 299 모양)을 블록으로 · 틀 저장(제안-보고서틀이름).

## 증거 · 검사(모든 단 공통)
- `node tools/check/all.mjs`(words · numbers · fonts · **overlap**) 0 · 로그인 폼 캡처 1440 · 1280 · 390 · 콘솔 오류 0 · '불러오는 중' 6초 넘는 곳 0(시간 기록).
- 숫자 한 출처: 묶음 홈 칸 ↔ 필지 목록 큰 숫자 ↔ 통계 탭 ↔ 엑셀 합계 같은 값(numbers.mjs 에 짝 추가).
- 지역 고정값 0: 남원 · 광주전남 두 기관으로 같은 흐름 확인.
- 커밋: 단마다 문서 · 코드 경로를 밝혀 · push 전 시크릿 스캔 · plan1-foundation.
