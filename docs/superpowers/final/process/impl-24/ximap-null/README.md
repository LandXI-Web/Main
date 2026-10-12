# impl-24 · XI맵 시군구 카드 'nullnull' 고침 (10-12)

브리핑 확인: 규칙 3개 — 3(숫자 한 출처) · 2(지어낸 숫자 금지) · 원칙 199(이미 본 화면 모양 그대로, 카드 글만).

## 원인
1. `paintBoardHud` 가 DOM `replaceChildren(...)` 에 `br ? ... : null` 두 개를 그대로 넘겨 'null' 글자 둘이 붙음(h() 는 null 을 거르지만 replaceChildren 은 글자로 바꿈).
2. 전국 결과(`/ximap/board`)는 옛 시군구 단위 장부라 전국 작업기(national_cells · 10-12 impl-22)가 끝낸 읍면동을 모름 → 전주시에 결과가 있어도 '결과 없음'.

## 고침
- app.js: 카드 자식에서 null 제거 · 결과 없는 곳 = '분석 예정' 한 줄 · 작업기가 끝낸 곳 = 숫자(받는 동안 '불러오는 중').
- server/landxi_api/national.py: `GET /national/region?codes=` 추가(같은 장부 national_cells 에서 센 값 · /national/progress 와 한 출처 · 구가 있는 시는 구 칸 합산). 게이트웨이 1회 재시작(전후 health ok · 워커 그대로).
- tools/check/words.mjs: 'null · undefined · NaN' 검사 추가 + XI맵(전국 · 남원 · 종로) 화면 추가(직원 대시보드 · 지도 서비스 · 관리자 대시보드는 이미 목록에 있어 같은 검사를 받음).

## 증거
- shots/jeonju-result-1440-1559.png (전주시: 경작지 6,953곳 · 6.60㎢ · 비닐하우스 258동 · 59곳 중 34곳 분석 끝)
- shots/none-jongno-1440-1559.png (종로구: 분석 예정)
- numbers-check.txt · words-check.txt · e2e.txt

## 따로 보인 것(이번 범위 밖)
전주시(코드 52110)는 `/regions/52110/emd` 가 404(서버 지역 표에는 구 단위 52111·52113 만 있음) — 화면은 조용히 넘어가지만 콘솔에 404 한 줄. 이 일은 별건.

## 별건 고침 — 구가 있는 시 읍면동 404 (10-12 16:08)
- server/landxi_api/regions.py: `GET /regions/{시코드}/emd` 가 시 코드(전주 52110 등)로 오면 서버 지역 표의 parent_cd 로 구 → 시 관계를 계산해 그 아래 구들의 읍면동을 합쳐 준다(`city_children` · 지역 하드코딩 0 · 기관 계정은 구마다 관할 확인). 게이트웨이 1회 재시작(health ok).
- 시험: 지역 표의 구 있는 시 12곳 전부(수원 · 성남 · 안양 · 부천 · 안산 · 고양 · 용인 · 청주 · 천안 · 포항 · 창원 · 전주) /emd 200 · 404 0 (읍면동 7~204곳).
- 전주 바깥 주소 캡처 shots/jeonju-gu-city-1440-*.png — 콘솔 오류 0 · 경작지 8,000곳 · 7.52㎢ · 비닐하우스 349동 · 59곳 중 37곳 분석 끝(작업기가 계속 돌아 앞 캡처보다 늘어난 값).
- words.mjs 에 전주(구가 있는 시) 다시 넣음 → 통과(화면 오류 0) · e2e 3건 통과.
