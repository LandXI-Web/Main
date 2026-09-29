브리핑 확인: (1) 용어표만 쓴다 — 판독·정문·반입 같은 지어낸 말 0, 새 말 만들지 않기 (2) 숫자 한 출처 — 대표 수치는 `GET /api/v1/summary` 에서만, 화면에 숫자를 적어 넣지 않는다 (3) 판정은 로그인 폼으로만(세션 주입 금지) · 소유 파일만 수정 · git 조작 금지

# fix-public-screens — 결과 보고 (2026-09-29)

게스트 메인 · 영업 · 서비스 상세 · 로그인 · 도움말. 로컬 서버(:4173 / :8700)를 띄운 상태에서 로그인 폼으로 들어가 확인했다. 세션 주입은 쓰지 않았다.

## 완료 조건 결과

| 조건 | 결과 | 근거 |
|---|---|---|
| forbidden(게스트 · `lx-sales`) main · sales · service-detail 9종 · login · help-my: '지어낸 용어' 0 · 콘솔 오류 0 | **통과** — 게스트 12개 주소, lx-sales 12개 주소 모두 `forbidden: 0` · `console_errors: []`(1440). 390도 같은 결과 | `shots/fix/fix-public-screens/forbidden-guest.json` · `forbidden-lx-sales.json` · `forbidden-guest-390.json` · `forbidden-lx-sales-390.json` |
| 광주전남 해양쓰레기 상태·수가 메인·영업·서비스 상세에서 summary 와 같음 · 출처 불명 고정값(1,857 · 2,098) 0 | **통과** — summary: `card-marine · 운영 · AI 탐지 1,857건`. 메인 카드 `여수시 · 운영 · 1,857건`, 영업 카드 `여수시 · 운영 · 1,857건`, 서비스 상세 히어로 칩 `운영` · 관련 카드 `운영 · 1,857건` · 서비스 지역 표 `운영`. 광주전남 담당자 세션도 `운영`. 이제 세 화면 모두 숫자는 summary 에서만 읽는다. 배포 기록의 `scale` 과 메인 공개 사본(`public-deploys.json`)의 숫자는 숫자 자리에 쓰지 않는다 | `scan-*.json`(`nums` 칸) · `after/guest-main-cards-*.png` · `after/sales-grid-*.png` · `after/gj-marine-hero-1440.png` · `after/gj-marine-end-1440.png` |
| 모든 카드 service-detail innerText 에 'null' · 'undefined' · 'NaN' 0 | **통과** — 9종 × 5세션(게스트 · lx-sales · lx-staff · 광주전남 담당자 · 남원 담당자), 끝까지 스크롤한 뒤 검사: 0건. 전에는 `card-change` 결과 지도에 `null` 이 떴다 | `scan-guest.json` · `scan-lx-sales.json` · `scan-lx-staff.json` · `scan-gj-manager.json` · `scan-namwon-manager.json` |
| 영업 카탈로그에 '첫 결과 전' 빈 카드 0(`?public=1` 필터) | **통과** — 카드 3장(영농 · 해양쓰레기 · 국토 변화)만 나온다. 빈 카드 0 | `after/sales-grid-1440.png` · `after/sales-grid-390.png` |
| 게스트 메인 네트워크 정지 ≤ 8s — 전/후 실측 | **통과** — 전 **29.1–31.7s**(요청 1,302 · 18.4MB) → 후 **3.9–5.5s**(요청 100 · 3.9MB). LCP 1.5–2.1s → 1.8–2.1s(변화 없음) | 아래 '실측' 칸 |
| 영업 빈 첫 화면은 Fable, 해외 로그인 다국어는 사용자 결정 | 아래 두 칸에 적었다 | — |

## 실측 — 게스트 메인 네트워크 정지(1440×900 · 로컬 서버 · 스크롤 없음 · 3초 동안 요청이 없을 때 마지막 요청 시각 · 3회)

| | 1회 | 2회 | 3회 | 요청 | 전송량 |
|---|---|---|---|---|---|
| 전 | 31.7s | 29.1s | 29.3s | 1,302(EOX 726 · V-World 514) | 18.4MB |
| 후 | 4.8s | 5.5s | 3.9s | 100(EOX 37–38) | 3.9MB |

원인: 첫 화면 1초 뒤에 경로 타일 약 1,240장을 미리 받았다(필지로 확대하는 구간, 해외로 넘어가는 구간, 마감 구간). 첫 화면인 히어로 지구에는 필요 없는 타일이다.
수정: 미리 받기를 두 구간으로 나눴다. 첫 스크롤·휠·터치·키 입력이 있을 때 필지 구간을 받고, 서비스 카드 구간(#ch4)이 한 화면 거리 안에 들어오면 해외·마감 구간을 받는다(IntersectionObserver). 메인에는 영상(mp4)이 없어서 `preload=none` 을 적용할 곳은 없었다. 카드 크롭은 원래 `loading=lazy` 였다.
스크롤 회귀: 1440·390에서 ch0 → ch5 를 휠로 끝까지 내려 봤다. 필지 카드, 질문 장면, 서비스 카드, `운영 2곳` 모두 정상이고 콘솔 오류는 0이다(`after/main-ch0…ch5-{1440,390}.png`).

## 바꾼 파일

| 파일 | 내용 |
|---|---|
| `landxi/v3/service-detail/summary.js` **(신설)** | summary 한 출처 모듈. `loadSummary()`(경로가 없거나 실패하면 null), `itemFor(카드, 배포본, {strict})`, `stageKey(운영→ga · 시범→pilot · 첫 결과 전→none)`, `metric(item,key)`(value 가 null 이면 null, 0 을 지어내지 않음), `scaleOf`(= detected), `userWords`(화면에 보일 때만 판독→AI 분석 등 용어표 적용). 메인·영업·서비스 상세가 이 모듈 하나를 import 한다 |
| `landxi/v3/main/main.js` | ① 경로 타일 미리 받기를 두 구간 지연 로드로 바꿈(`deferPrefetch` · `prefetchTiles('A'/'B')`) ② ch4 카드의 상태 칩·숫자를 summary 에서 읽음(stage 가 `첫 결과 전` 인 카드는 진열하지 않음, 지역 이름도 summary 기준) ③ ch5 `운영 n곳` 을 summary stage 로 셈 ④ summary 가 없으면 숫자 없이 표시(사본 숫자를 대신 쓰지 않음) |
| `landxi/v3/main/data/agent-scene.json` · `data/sample-parcel.json` · `tools/build-data.py` | 출처 문구 `AI 판독` → `AI 분석` |
| `landxi/v3/sales/data.js` | 카드 목록을 `/registry/cards?public=1` 로 받음. 카드 상태·숫자는 summary. `첫 결과 전` 카드는 진열하지 않음. 성과 띠 `현장 확인 필요 필지` 는 summary `field_check` 를 쓰고, 값이 없으면 그 칸을 뺌. 사례·지역 이름은 summary 지역. 카드 이름에 용어표 적용 |
| `landxi/v3/sales/app.js` | 결과가 있는 카드 옆에 붙던 K9 빈 카드를 없앰(진열할 카드가 0장일 때만 K9 한 장). 크롭은 결과 세트로 찾고, 지역 이름은 summary 기준 |
| `landxi/v3/sales/cases.js` | 사례 제목·지도 캡션에서 연도가 없으면 `undefined` 가 붙던 경로를 막음 |
| `landxi/v3/service-detail/app.js` | ① **'null' 원인**: 결과 지도 블록의 `fig.append(host, ld, cap, num)` 에서 숫자가 없을 때 `num=null` 이 글자 'null' 로 들어갔다 → 빈 값을 거름 ② 히어로 칩 · 관련 카드 칩 · 서비스 지역 표의 상태를 summary stage 로 표시(자기 결과가 없는 계획·초안 배포본은 `첫 결과 전`) ③ 큰 숫자 `현장 확인 필요` 를 summary `field_check` 로(전에는 실태조사 조회를 직접 계산) ④ 관련 카드(K7) 숫자를 메인·영업 카드와 같은 summary 값으로 ⑤ 카드 이름·모듈 이름·설명에 용어표 적용(`재해 피해 판독 (해외)` → `재해 피해 AI 분석 (해외)`) ⑥ 지역 이름을 summary 기준으로 |
| `landxi/v3/login/login.css` | 계정 3택 라디오가 칸 전체를 덮게 함. 전에는 글자 칸이 클릭을 가로채서 `forbidden.mjs --login` 이 로그인 폼에서 30초 뒤 멈췄다(`<span>LX 직원</span> intercepts pointer events`). 겉모습은 그대로 |

login · help-my 의 보이는 글자에는 지어낸 용어가 없었다. 남은 것은 주석뿐이다(검사 대상 아님, 그대로 둠).

## 스크린샷

- 전(1440, 첫 뷰): `shots/fix/fix-public-screens/before/`: guest-* 12장, sales-* 11장
- 후: `shots/fix/fix-public-screens/after/`
  - 첫 뷰 1440·390: `guest-*`, `sales-*`, `sales-top-*`
  - 구간 1440·390: `sales-grid-*`, `sales-cases-*`, `sd-marine-related-*`, `sd-marine-end-*`, `sd-change-blocks-*`, `guest-main-cards-*`, `gj-marine-hero-1440`, `gj-marine-end-1440`, `guest-marine-hero-1440`, `main-ch0…ch5-{1440,390}`
- 검사 출력: `forbidden-*.json`(공식 검사기), `scan-*.json`(끝까지 스크롤 후 금지어 · null/undefined/NaN · 숫자 · 콘솔 오류)

## 남은 것

- 서비스 상세 해양쓰레기 히어로에는 큰 숫자가 없다. summary `field_check`(현장 확인 필요)가 광주전남 항목에서 null 이기 때문이다. 탐지 총수(AI 탐지)는 5차 결정대로 큰 숫자 자리에 싣지 않았다. 상태 칩 `운영` 은 summary 와 같다.
- 로그인 히어로 장면 2(여수 · `건 드론 탐지`)는 드론 결과 파일의 점 수로 세운 숫자다. 이름이 summary `AI 탐지` 와 달라서 '같은 이름 = 같은 값' 규칙에는 걸리지 않는다. 다만 summary 에 드론 지표 key 가 생기면 그쪽으로 옮기는 게 맞다.
- summary 를 읽지 못하면(경로 없음·오류) 세 화면은 숫자 없이 상태만 보인다. 이는 의도한 동작이다.
- `hasRoute` 가 openapi 를 `force-cache` 로 읽는다. 그래서 summary 가 생기기 전에 연 브라우저는 캐시가 풀릴 때까지 숫자 없이 보일 수 있다(키트 동작).

## Fable 에게 넘길 것

- **영업 첫 화면이 비어 보인다.** 1440에서 히어로 왼쪽은 문구 두 줄과 한 문장뿐이다. 첫 스크롤 동안 히어로 지도 카드 아래와 '서비스' 절 사이에 큰 흰 여백이 있다(`after/sales-top-_landxi_v3_sales_-1440.png`, `after/sales-_landxi_v3_sales_-1440.png`). 새 구성은 디자인 판단이라 손대지 않았다.
- 빈 카드를 없애서 카드가 3장이 되었다. 이 때문에 영업 그리드가 1줄 3열로 끝난다. 결과 카드가 1–2장인 기관·시점에는 그리드가 헐거워 보일 수 있다. 몇 장일 때 어떤 배치로 할지 판단이 필요하다.
- 서비스 상세 해양쓰레기처럼 `현장 확인 필요` 가 없는 카드는 히어로 흰 카드에 지역·기준일 한 줄만 남는다. 이 자리를 비워 둘지, 다른 허용 라벨을 둘지 정해야 한다.

## 사용자 결정 필요

- **해외 기관 로그인이 한국어뿐이다.** 명세 K15 는 global 화면만 영어를 두게 되어 있어, 로그인 폼(계정 3택 · 기관 선택 · 오류 문구)은 이번 범위 밖이라 고치지 않았다. 해외 기관 담당자가 처음 보는 로그인 화면에 영어를 둘지 결정이 필요하다.

## 요청 (소유 밖)

- **kit:** `service-detail/summary.js` 를 키트(`landxi/v3/kit/summary.js`)로 옮겨 모든 화면이 한 모듈을 쓰게 해 주세요. 옮기면 세 화면은 import 경로만 바꿉니다.
- **카드 원천 · 서버 등록부:** 카드 이름 `재해 피해 판독 (해외)` 에 '판독'이 있습니다(`landxi/assets/data/cards.js` · 서버 `registry/cards`). 이 화면들은 보일 때만 바꿔서 표시하고 있으니, 원천 이름을 용어표 말로 바꿔 주세요.
- **서버(summary · 배포 기록):** 광주전남 배포본의 지역 이름이 `광주전남특별시`(deploys)와 `전남광주통합특별시 여수시`(summary)로 서로 다릅니다. 화면은 summary 이름을 우선하지만, 원천 하나로 맞춰 주세요. `dp-gj-marine-27`(draft)처럼 자기 결과가 없는 배포본은 화면에서 `첫 결과 전` 으로 표시합니다. summary 에 배포본 id(`deploy_id`)가 들어오면 배포본과 항목을 추측 없이 이을 수 있습니다.
- **kit K7(service-card):** `stateOf` 는 카드 `status` 문자열(`운영`)로 판정하지만, `/registry/cards?public=1` 은 `status: ops|pilot` 을 줍니다. summary 가 없을 때의 대체 판정이 어긋날 수 있습니다.
