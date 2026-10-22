# 바퀴 22 P8a — now 21 '넣음' 제안 구현 결과 (10-22)

근거: `docs/superpowers/recon-1022/NOW21-ANSWERS.md`(넣음) · `CYCLE22-PLAN.md` P8 · CHANGE-DEMO-ORDER P1-8(영상 비교 좌우 가르기 · 연도 표시).
확인은 모두 로그인 폼(LX 직원 test@ · 남원 · 광주전남 기관)으로. 그림은 이 폴더 `shots/`(로컬에만 — 공개 저장소에 올리지 않음).

| # | 제안 | 결과 | 그림 |
|---|---|---|---|
| 1 | 두 시점 겹쳐 비교 | 크게 보기 아래 '겹쳐 보기' — 같은 지역 다른 해 영상을 고르면 왼쪽에 덮이고 가운데 선을 끌어 견줌. XI맵 '영상 비교' 선 위에 두 쪽 연도 이름표('2020년 · 2025년'). 지도 서비스 왼쪽 아래 '영상 비교 켜기 · 두 해 고르기' 새로 | 01-big-overlay-swipe · 01-ximap-compare-years · 01-map-service-compare |
| 2 | XI맵 영상 목록 크게 | 왼쪽 위 '○○시 · n 서비스 제공중' → 목록에 '영상' 단추 → 그 시군구 영상 카드(새 프로젝트와 같은 모양 · 남원시 12장) → 누르면 크게 보기(앞 · 다음 · 겹쳐 보기) | 02-xi-imagery-list · 02-xi-imagery-big |
| 3 | 지도에서 답으로 | XI ChatGEO 답이 강조한 읍면동을 지도에서 누르면 그 자리에 한 줄('운봉읍 · 경작·휴경 분석서비스 결과 237필지' — 답과 같은 값) | 03-answer-highlight · 03-map-to-answer-pop |
| 4 | 조건 풀기 한 단추 | 머리줄에 '지도 강조 3곳' 칩 + '조건 풀기' — 읍면동 · 규칙 조건, 답의 지도 강조, 말로 건 거르기를 한 번에 걷고 그 시군구 처음 모습으로 | 04-chips-before · 04-after-clear |
| 5 | 다른 기관 지번 찾기 | 필지 목록 지번 찾기는 이미 모든 기관 서비스에 같은 칸(광주전남 해양쓰레기 서비스에서 확인). 예시 글의 남원 리 이름을 '○○리 123-4'로. 권한: 광주전남 계정으로 남원 서비스 필지 목록 · 남원 필지 카드 = '없음'(404) | 05-gj-parcel-find |
| 6 | 지도 재기 · 그림 저장 | XI맵 도구 줄 '재기'(거리 · 면적, 두 번 누르면 마침 · 재는 동안 다른 누르기 동작은 쉼) · '저장'(지도 + 아래 띠: 지역 · 범례 · 저장 날짜 · 출처 → PNG 내려받기) | 06-measure-length · 06-measure-area · 06-measure-390 · 06-saved-map |
| 7 | 지도 이름표 | 층 판 맨 아래 '이름표' 켜고 끄기 — 지도 위 추천 질문 말풍선 · 숫자 꼬리표 · 지역 말풍선 · 강조 숫자 줄을 숨김(이 브라우저에 기억) | 07-layers-labels-on · 07-labels-off |
| 8 | 휴대폰 층 판 | 휴대폰에서 층 · 보고서 판 제목 옆 '접기'(제목 한 줄만) · 대화 입력 줄과 20px 띄움(전엔 2px) | 08-phone-layers-open-390 · 08-phone-layers-folded-390 |
| 9 | 해외 주 합계 줄 | **하지 않음(보류)** — 주 합계 숫자는 공식 자료에 있지만 군 → 주 연결 표가 없어 새 해외 작업이 필요. 해외 재개 때 | — |
| 10 | 대상지 검색칸 ② | P3 에서 '브이월드에서 영상 가져오기'로 들어간 것 확인 · 글자 단추 화살표가 따로 한 줄로 떨어지던 것을 펼침 표시로 고침 | 10-newproj-target · 10-newproj-target-open |
| 11 | 고장 둘 | ① XI맵 `?pnu=` — 지역이 비어 전국으로 날아가 화면 가운데 시군구(성주군)가 왼쪽 위에 뜨던 것 → 필지의 시군구를 첫 지역으로(LX · 기관 모두 필지 자리 17.5단계 · '남원시 · 3 서비스 제공중'). ② 시험 `test_postprocess_regression_base_region` — 칸 수가 같은 다른 작업(10-07 항공 25cm 작업 · 결과 703건)을 뽑아 표본이 128건뿐이던 것(코드 회귀 아님) → 결과가 가장 많은 작업을 뽑게 시험을 고침 · 통과 | 11-pnu-open |
| 12 | 행정동 출처 | 답에 '(행정동 ○○)'가 붙으면 답 띠 · 대화 맨 아래 작은 한 줄 '행정동 이름: 통계청 SGIS 행정동 경계(공공누리 제1유형) · admdongkor 가공(CC BY 4.0)' — 모든 화면의 XI ChatGEO 공통 | 12-hjd-attribution |

## 화면 겹침 검사(원칙 309)
- `lint/overlap-check.txt` — LX 직원: XI맵 · 층 판 · 재기 판 · 영상 목록 · 영상 비교 · 층 판 접기 · 지도 서비스 · 지도 서비스 영상 비교 × 1280 · 1440 · 390 = 24상태. 첫 돌림에서 휴대폰 재기 판이 도구 줄과 겹침(1) → 입력 줄 위로 옮김 → `lint-390fix` 0.
- `lint-gov/` — 남원 · 광주전남 기관 108상태(결과 지도 · 층 판 · 질문 포함): 겹침 1 — 광주전남 1280 '분석서비스 · 통계' 화면에서 대화 단추가 왼쪽 메뉴 '계정'을 덮음. 이번 변경(XI맵 · 지도 서비스 · 크게 보기)과 무관한 화면(기관 화면은 다른 에이전트가 고치는 중) — 넘김.
- 새 상태 5개를 `tools/check/overlap-states.json` 에 더함(a7~a11).

## 변화 탐지 에이전트가 부르는 법(두 해 좌우 가르기)
- **XI맵**: 에이전트 동작 `map_compare` 에 `year_a` · `year_b`(또는 `left.year` · `right.year`)를 주면 국토지리정보원 그 해 항공 정사영상을 왼쪽 · 오른쪽에 놓고 선 위에 연도 이름표. 그 해 층이 없으면 `ok:false · reason '2019년 영상이 없습니다'`. 화면 안에서는 `window.__xc.compareYears(2020, 2024)` → `{ ok }` / `{ ok:false, missing:[해] }`. 예전 `left.id` · `right.id` 그대로 됨.
- **지도 서비스**: 같은 `map_compare`(year_a · year_b) — 화면이 받아 처리하고 `kit:agent-action-done {op:'map_compare', ok}`. 화면 안: `window.__lm.compareYears(a, b)`.
- **아무 지도 화면(부품)**: `import { compareYears, mountSwipe, yearSpec } from 'landxi/v3/kit/swipe.js'`
  - `await compareYears({ map, yearA, yearB })` → `{ ok, swipe, missing? }` · `swipe.pos(30)` · `swipe.set({ left, right })` · `swipe.close()`
  - `mountSwipe({ map, left: { label, spec }, right: { label, spec } })` — spec 는 지도 래스터 원천(없으면 그 쪽은 지금 지도)
  - 해 목록 = 서버 영상 표의 `nat-ngii-air-{해}`(지금 2020~2025) · 그림은 12단계 이상에서 그려짐.

## 이런 것도 필요하지 않을까요?(원칙 57)
- **지도 '지명' 켜기(브이월드 지명 · 도로 이름 판)** — 영상만 깔린 XI맵에서 읍면 · 마을 이름이 없어 현장 담당자가 위치를 말로 설명하기 어렵습니다. 브이월드 하이브리드 판을 이름표 옆 한 줄로(기본 꺼짐).
- **재기 결과를 저장 그림에 함께** — 현장 보고 담당자가 '이 구간 1.2km · 이 면적 3,400㎡'를 그림 한 장으로 붙입니다(지금은 재기 선은 그림에 들어가지만 숫자 줄은 없음).
- **영상 비교 선 위치를 주소에 남기기** — 직원이 '2020 ↔ 2025 이 자리'를 동료에게 주소 하나로 보냅니다(변화 탐지 시연 녹화도 같은 장면을 다시 엽니다).

## now 22 질문 후보
- 해외 주 합계 줄은 해외 재개 때 할까요, 지금 군 → 주 연결 표만 먼저 만들까요?
- 크게 보기 '겹쳐 보기'는 같은 지역 이름의 다른 해 영상만 냅니다. 이웃 시군구에 걸친 영상(범위가 겹치는 것)까지 낼까요?

## 개발자 부록
- 새 부품: `landxi/v3/kit/swipe.js · swipe.css`(두 시점 가르기) · `landxi/v3/kit/map-tools.js · map-tools.css`(재기 · 저장)
- 화면: `xi-clean/app.js`(pnu 첫 지역 · 연도 이름표 · compareYears · map_compare 해 · 영상 목록 · 조건 풀기 · 재기 · 저장 · 이름표 · 층 판 접기) · `xi-clean/chat-hl.js`(강조 누르면 한 줄 · 걷힘 알림) · `xi-clean/chat-answer.js · .css`(행정동 출처 줄) · `xi-clean/xc.css` · `lx-map/app.js · map.css`(영상 비교) · `kit/imagery-viewer.js · .css`(겹쳐 보기) · `kit/cmdk.js · .css`(행정동 출처) · `gov-report/svc-parcels.js`(예시 글) · `lx-project/context.css`(펼침 표시)
- 시험: `server/tests/test_xi_nation.py`(작업 뽑기 순서)
- 게이트웨이 · 작업기 다시 띄움 필요 없음(서버 코드 변경 없음).
