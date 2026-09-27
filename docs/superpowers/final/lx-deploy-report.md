# lx-deploy 보고 — ⑤ 배포·이식 + ⑥ 운영·신고 (명세 §2.7) · 3차(판정 불합격 2차 해결)

## 3차 요약 (2026-09-27 14:56)
- 소유 `landxi/v3/lx-deploy/**` 만 수정: `retrain.js` · `data.js` · `app.js` · `lx-deploy.css`. 커밋 0. 검증은 전부 `/landxi/v3/login/` 폼 입력(lx-staff). 콘솔 오류 · 4xx/5xx 0 · 금지어 0.

| 판정 항목 | 조치 | 결과(실측 · 같은 세션) |
|---|---|---|
| 재학습 숫자 어긋남(R1 9건이 표 4건 · 큰 숫자 2 vs 행 1) | `retrain.js`: `ruleOfSet()` 이 `review:{규칙}` 과 `survey/{규칙}`(서버 survey.py 가 기관 판정을 저장하는 이름)을 같은 규칙으로 읽음(`review-stage:` 시험은 제외). 재학습은 **set_id 가 아니라 기관 × 업무(`workKey`)** 로 묶어 셈. `dueSets(feedback, {rules})` 한 결과가 큰 숫자 · 표 `재학습` 행 · 표 `오탐 신고` 를 모두 만듦 | 큰 숫자 `재학습 필요 2건` = 재학습 행 2(남원 생활환경 **9건** = survey/R1 5 + review:R1 4 · 남원 영농 6건) = 콘솔 `2 재학습`. `pair-1440-console.png` · `pair-1440-deploy-ops.png` |
| 콘솔 `기관 신고` | 이 화면 소유 밖 | 콘솔 `18 기관 신고` ≠ 표 오탐 신고 합 15. 차이 3 = `other` 행(시험 `review-stage:R1` 2 · 광주전남 결과 층 없는 신고 1). 서버 `/feedback?kind=report` 가 kind 를 거르지 않아 콘솔이 전체 열린 행을 셈 → 아래 요청 2 |
| 정밀도 열 `—`(죽은 열) | lx-review 순서 그대로 `probeS2 → loadRules → loadVerdicts` 순차(이 화면 쪽). 규칙이 걸린 업무인데 LX 표본 검수 기록이 없으면 `—` 대신 `표본 k/100`(호버 `표본 검수 k건`) · 값이 생기면 lx-review 와 같은 `numHtml(0.00 · 표본<100 ~)`. 규칙이 없는 업무만 `—` | 남원 생활환경·영농 `표본 0/100` = lx-review `?rule=R1` `0/100 · 정밀도 —`(`pair-1440-review.png`). **실제 정밀도 숫자는 아직 없음**: LX 표본 검수 판정 0건 · 서버 stats 에 `lx` 필드 없음(현장 판정 9건 precision 0.0 은 기관 단위라 lx-review 가 쓰지 않음). 판정을 지어내지 않음 |
| 시험 잔재 · 첫 뷰 | `dp-gwangju-jeonnam-farm-26` 삭제(관리자 `DELETE /deploys/{did}` 200 · 결재 행 없었음). '가장 급한 배포본' = **카드 버전 있는 이식 요청 먼저**(③ 조립이 막힌 초안은 다음) → 최근 요청 → 서버 순서 | 첫 뷰 = `광주전남특별시 · 해양쓰레기 실태조사`(dp-gj-marine-27 · v1.2 · 남은 일 5). 카드 버전 없는 dp-nw-crowd-27 은 그 뒤. 콘솔 '이식 요청' 첫 칸도 같은 배포본 |
| 운영 탭 로딩 카드 반투명 | `.dp-ops` 불투명도 전환 제거(위치만 12px 미끄러짐) · 카드 바탕 `--bg-1` 고정 · 로딩 카드 첫 프레임에 `is-in` | 1042×800 전환 직후 8프레임 누적 opacity 전부 1 · 바탕 흰색(`lx-deploy-1042-ops-first.png`) |
| 운영 탭 URL | 운영 탭 전환 시 `?deploy=` `?region=` 삭제 | `?tab=ops` 만 |

### 실측 (K16 scan · lx-staff)
| | 배포·이식 | 운영·신고 | 심기 |
|---|---|---|---|
| 1440 글자 / 버튼 | 240 / 5 | 295 / 3 | — |
| 390 글자 / 버튼 | 216 / 5 | 232 / 3 | — |
| 금지어 · 콘솔 오류 | 0 · 0 | 0 · 0 | 0 · 0 |

### 영상 `lx-deploy-1440.mp4` (19.9s · 1440×900 · 직원 정문 로그인)
정문(lx-staff 입력) → 전국 → 광주전남 해양쓰레기 이식 요청 서랍 → 운영·신고(재학습 필요 2 · 생활환경 9건) → 새 지역에 심기(영농관리 → 순창군) → `결재를 요청했습니다` → 순창군 서랍 6단(⑤ 결재 대기). 서버 확인: `GET /approvals?state=pending` 에 `ap_ee9eb25f809f · deploy · dp-52770-farm-26 · u_lx_staff`(같은 deploy id). 확인 뒤 `DELETE /deploys/dp-52770-farm-26` → 결재 행도 함께 사라짐(시험 잔재 0). 로그인 뒤 구간은 1.3배속.

### 산출물 (`shots/final/lx-deploy/`)
`lx-deploy-1440-deploy|ops|plant|plant-ci|plant-filled|planted.png` · `lx-deploy-390-deploy|ops|plant.png` · `lx-deploy-1042-ops-first.png` · `pair-1440-console|deploy-ops|review.png` · `lx-deploy-1440.mp4` · 검증 `e2e.tmp.mjs`(smoke · mobile · pair · opq · plant).

### 통합 단계 요청(이 화면 밖)
1. **필수** 키트 `auth-gate.js ALLOW['gov-fusion']` 에 `lx/staff` `lx/admin`(읽기) + gov-fusion `?preview={did}` 읽기 모드 → 서랍 아래 `기관 포털 미리보기` 자동 노출(코드 준비됨) → 재판정.
2. lx-console `data.js today()`: 재학습 = `import { dueSets } from '../lx-deploy/retrain.js'` 후 `dueSets(fb30.items, { rules: D.rules }).length`(rules 를 넘겨야 업무로 묶임 · 안 넘기면 규칙 단위 — 지금 데이터에선 둘 다 2). 기관 신고 = 열린 행 중 `kind==='fp'` 이고 `review-stage:` 가 아닌 것(→ 15 = 표 합), 또는 서버 `/feedback?kind=` 필터 반영.
3. 서버 `GET /deploys?with=health` 를 기관 단위 → 업무(규칙·결과 층) 단위로, precision 은 LX 표본(stats.lx)으로. 반영되면 `retrain.js` 어댑터를 서버 값으로 교체(지금은 서버 health 에서 `마지막 학습`만 씀 · 어댑터 폴백 동작 중).
4. 정밀도 숫자가 보이려면 lx-review 에서 LX 표본 검수 판정이 쌓이거나 서버 stats 에 `lx{judged, precision}` 이 필요(lx-review 순차 로딩 · `judged` 읽기는 그 화면에 이미 반영된 것을 확인).
5. 마스트 `LX 직원 · LX 직원`(시드 이름 = 역할) — 키트/시드 몫.

---

# (2차 보고 — 기록)

## 2차 요약 (2026-09-27 14:36)
- 소유 `landxi/v3/lx-deploy/**` 만 수정: `app.js` · `data.js` · `lx-deploy.css` · **신설 `retrain.js`**(재학습·정밀도 규칙 한 곳, 순수 함수). 커밋 0.
- 서버 확인: S-7(`POST /deploys` 직원 허용 + approvals 행 + ci 저장 · `?with=health`) · S-2(`/survey/rules/{id}/stats`) **반영됨**. `POST /approvals` 는 한도(quota) 전용.
- 검증은 전부 `/landxi/v3/login/` 폼 입력(lx-staff)으로 시작. 콘솔 오류 · 4xx/5xx 0 · 금지어 0.

| 판정 항목 | 조치 | 결과(실측) |
|---|---|---|
| [숫자 정합] 재학습 | `retrain.js dueSets()` = 지난 30일 · 열린 오탐 신고를 결과 층(set_id)별로 세어 ≥ 5 인 층 수. `review:R1` 같은 검수 세트도 규칙 → 업무(R1 건물 → 생활환경, 농경 클래스 → 영농)로 매핑해 버리지 않음. 큰 숫자 = 층 수(콘솔 '오늘'과 같은 단위), 표 `재학습` = 그 층이 걸린 배포본. 서버 health 는 **기관 단위**(남원 배포본 전부 신고 10·정밀도 0.0)라 재학습·신고·정밀도에는 쓰지 않고 `마지막 학습`만 씀 | 같은 세션 나란히: 콘솔 `1 재학습` = 운영 탭 `재학습 필요 1건`(`pair-1440-console.png` · `pair-1440-deploy-ops.png`). 지금 신고: 영농 결과 층 6(≥5) · review:R1 4(<5). 단위 시험: R1 7건이면 둘 다 2 |
| [정밀도 열] | lx-review 의 `data.js`(ruleStat · loadRules · loadVerdicts · probeS2)를 **그대로 import**, lx-review app 과 같은 순서로 불러 규칙 → 업무 매핑(그 기관에 해당 규칙 의심이 있는 배포본만)으로 붙임. 표기 = lx-review 와 같은 `nf(v,2)`, 표본 < 100 → ~, 호버 `표본 검수 n건` | 지금 lx-review `?rule=R1` = 정밀도 `—` · 표본 `0/100` → 운영 표 남원 생활환경 `—` (**같은 값**, `pair-1440-review.png`). LX 표본 검수 기록이 생기면 두 화면이 같은 함수로 같이 바뀜 |
| [토스 톤] CI 칸 | 색 2칸 = 입력 상자 안 24px 원형 견본 + 값 글자(기본 비움 · 견본 클릭 = 색 고르기 · 직접 입력 가능). `.dp-ci select` 에 카드 select 와 같은 chevron | `lx-deploy-1440-plant-ci.png` 검정 블록 0 |
| [직원 심기 UX] | 안내는 제목 바로 아래 + 입력 전부 잠금(S-7 전일 때만). 지금 S-7 반영 → 직원에게 자동 해제 | 직원 세션 실제 심기 성공(아래) |
| [명세 버튼] `기관 포털 미리보기` | 코드 준비됨(`ALLOW['gov-fusion']` 에 `lx/staff`·`lx/admin` 이 들어오면 자동 노출). 지금 키트 ALLOW = `tenant/local` 만, gov-fusion 에 `?preview=` 읽기 모드 없음 → 죽은 링크라 숨김 | **통합 단계 필수**(아래 키트·타 화면 요청 1) |
| [테스트 잔재] | `dp-gwangju-jeonnam-living-26` **삭제**(관리자 `DELETE /deploys/{did}` · draft · 결과 0). 이번 영상에서 만든 `dp-52770-farm-26`(순창)도 결재함 확인 뒤 삭제. 첫 뷰 = 콘솔 '이식 요청' 칸과 같은 순서(최근 요청 먼저) | `dp-gwangju-jeonnam-farm-26`(1차 영상용)은 **사용자 확인 대기로 남김** — 지금 첫 뷰가 이것으로 열림. 확인 주시면 같은 방식으로 지움 |
| [소소] 축척 막대 | 운영 탭에서 축척·범례를 흰 카드 오른쪽으로(≤960 은 숨김) | 1440 축척 left 872 > 카드 right 856 |
| [소소] 서랍 반투명 | 이 화면에서 서랍은 투명도 없이 밀려 들어옴(도착 중에도 바탕 불투명) | 영상 3.5s 프레임 확인 |
| [소소] 마스트 `LX 직원 · LX 직원` | 기록만(시드 이름 = 역할, 키트/시드 몫) | — |

### 추가로 고친 것
- **CI 키 오류**: 서버 CI 9키는 `unit_word` 인데 1차는 `unit` 으로 보내 S-7 서버에선 400 이 날 뻔함 → `unit_word` 로. 빈 값은 보내지 않음, 파일은 이름만(서버 ci 값 200자).
- 심기 본문: S-7 서버면 `{from_deploy_id|card_id, region, ci}` 만. 이전 계약 모양은 health 가 없을 때만 덧붙임.
- ⑤ `결재 요청` 버튼: `POST /approvals` 가 한도 전용이라 버튼을 만들지 않음. S-7 심기가 결재 행을 자동으로 만들어 서랍에 `결재 대기` 로 표시됨.
- 운영 표 `배포본` 칸에서 버전 글자 빼기(첫 뷰 글자 323 → 284).

### 실측 (K16 scan · lx-staff)
| | 배포·이식 | 운영·신고 | 심기 |
|---|---|---|---|
| 1440 글자 / 버튼 | 237 / 5 | 284 / 3 | — |
| 390 글자 / 버튼 | 208 / 5 | 237 / 3 | — |
| 금지어 · 콘솔 오류 | 0 · 0 | 0 · 0 | 0 · 0 |

### 장면(영상 `lx-deploy-1440.mp4` 19.8s · 1440×900 · **직원** 정문 로그인)
정문 → 전국 → 가장 급한 배포본 서랍(6단) → 운영·신고(재학습 필요 1건) → 새 지역에 심기(영농관리 → 순창군 · 상징색 견본 · 문의처) → `결재를 요청했습니다` → 순창군 점 + 6단이 차례로(⑤ `결재 대기`). 서버 확인: 관제 결재함 `GET /approvals?state=pending` 에 `ap_9c92a0de7e77 · deploy · dp-52770-farm-26 · requested_by u_lx_staff` — **같은 deploy id**. 확인 뒤 이 행은 지움(시험 잔재 0).

### 산출물 (`shots/final/lx-deploy/`)
`lx-deploy-1440-deploy|ops|plant|plant-ci|plant-filled|planted.png` · `lx-deploy-390-deploy|ops|plant.png` · `pair-1440-console|deploy-ops|review.png` · `lx-deploy-1440.mp4` · 검증 스크립트 `e2e.tmp.mjs`(smoke · mobile · pair · plant).

### 키트 · 타 화면 요청(통합 단계)
1. **필수** 키트 `auth-gate.js ALLOW['gov-fusion']` 에 `lx/staff` `lx/admin`(읽기) + gov-fusion `?preview={did}` 읽기 모드 → 반영되면 서랍 아래 `기관 포털 미리보기` 가 자동으로 나타남(재판정 필요).
2. lx-console `data.js today()` 재학습 칸 → `import { dueSets } from '../lx-deploy/retrain.js'` 로 교체(지금은 같은 규칙을 따로 계산 · 차이는 콘솔이 `kind` 를 거르지 않는 점 하나: lx-review 의 `검수:맞음` 행(kind other)이 쌓이면 콘솔만 늘어남).
3. lx-review 버그 2건(이 화면은 같은 함수라 같이 따라감): ① app.js 가 `loadRules()` 와 `loadVerdicts()` 를 동시에 불러 S-2 규칙 통계가 비어 늘 어댑터 경로가 됨 ② S-2 경로의 표본 수는 `s2.samples` 를 읽는데 서버 키는 `judged` → 표본 0 으로 보임.
4. 서버 health(S-7)를 기관 단위가 아니라 업무(결과 층 · 규칙) 단위로 — 그러면 이 화면 어댑터(`retrain.js`)를 서버 값으로 바꿀 수 있음.
5. 마스트 `LX 직원 · LX 직원`(시드 이름 = 역할).

---

# (1차 보고 — 기록)

- 소유: `landxi/v3/lx-deploy/**` (index.html · app.js · data.js · lx-deploy.css) — 이 밖 수정 0. 커밋 0.
- 부품: K1 셸(레일 = 6단 세로 스텝퍼, ⑤ 현재 · ⑥ = 탭 2) · K2 관문 · K3 무대 · K4 지역(심기 시트) · K5 서랍/시트 · K6 큰 숫자 · K8 세로 스텝퍼 · K9 빈 상태(항공기) · K12 표 · K13 토스트 · K14 개발자 서랍.
- 판정 경로: 모든 스크린샷·영상은 `/landxi/v3/login/` 폼 입력으로 시작(세션 주입 0). 게이트웨이 :8700 실서버.

## 산출물
| 무엇 | 파일 |
|---|---|
| 영상 19.8s · 1440×900 · 정문 로그인(LX 관리자) → 전국 → 운영·신고 → 새 지역에 심기(남원 영농관리 → 광주전남특별시) → 새 점 + 6단이 순서대로 열림 + 토스트 | `shots/final/lx-deploy/lx-deploy-1440.mp4` |
| 1440 스틸(직원) 배포·이식 / 운영·신고 / 심기 시트 | `lx-deploy-1440-deploy.png` · `-ops.png` · `-plant.png` |
| 1440 스틸(관리자) 심기 입력 / 심은 뒤 | `lx-deploy-1440-plant-filled.png` · `-planted.png` |
| 390 스틸(직원) | `lx-deploy-390-deploy.png` · `-ops.png` · `-plant.png` |
| 검증 스크립트(임시) | `shots/final/lx-deploy/e2e.tmp.mjs` |

## 합격선 실측 (K16 `scan()` · 1440×900 첫 뷰 · lx-staff)
| 항목 | 기준 | 배포·이식 | 운영·신고 | 390 배포 / 운영 |
|---|---|---|---|---|
| 첫 뷰 글자(공백 제외) | ≤ 300 | 247 | 295 | 206 / 263 |
| 버튼(탭·레일 제외) | ≤ 8 | 5 | 3 | 5 / 3 |
| 금지어 | 0 | 0 | 0 | 0 / 0 |
| 콘솔 오류 · 4xx/5xx | 0 | 0 | 0 | 0 / 0 |
| 큰 숫자 | 화면당 1 | — | `재학습 필요 1건 ~` | 같음 |
| 심기 장면 | 남원 카드 → 다른 시군구 | 관리자 로그인에서 성공: `POST /deploys` 201 → 지도에 `이식 요청` 점 떨어짐 → 토스트 `결재를 요청했습니다` → 서랍 6단 + 남은 일이 차례로 열림 | | |
| 관제 결재함에 같은 id | 같은 deploy id | draft 행이 `/deploys` 에 남음(ops-core 가 읽는 원천). `/approvals`(S-9)는 아직 없어 결재함 표시는 ops-core·서버 몫 — 미확인 | | |
| 운영 표 정밀도 = lx-review 값 | 같은 값 | 정밀도 원천(S-2 rule stats · lx-review 표본)이 아직 없어 전 행 `—`. 값을 지어내지 않음 | | |

## 명세 대비 구현
- 탭 `배포·이식` `운영·신고`(role=tab, ←/→ 키) · 버튼 `새 지역에 심기` · 범례 `운영` `시범` `이식 요청`(사진 위 흰 글자).
- 지도: 전국 bounds 시작 → 지역 점(배포 기록의 지역별 묶음 · 여러 개면 개수) → 0.9초 뒤 가장 급한 배포본(카드 버전 있는 이식 요청 → 시범 → 운영)으로 카메라 2400 + 서랍. `?deploy=` `?region=` `?card=` `?tab=ops` 딥링크. 지역 문자열 하드코딩 0.
- 서랍 제목 `{지역} · {업무}` · 단계 칩 `이식 요청`/`시범`/`운영` · 같은 지역의 다른 배포본(한 번에 이동) · 6단 세로 스텝퍼(됨 · 할 일 · 대기, 단 이름 = 해당 페이지 링크 `lx-ingest?region=&deploy=` 등) · 단마다 다음 행동 1 · `남은 일 {n}` · `기관 포털 미리보기`.
- 다음 행동 규칙(죽은 버튼 0):
  - ① `영상 등록 요청` → lx-ingest(그 지역·배포본 채워서). 명세의 `POST /deploys/{did}/modules` 는 영상 등록과 무관한 API라 쓰지 않음(아래 제안).
  - ② `모델 연결` → `POST /deploys/{did}/model`. 지금 서버는 관리자 전용이라 직원 세션엔 버튼 대신 `모델 연결은 관리자 결재로 합니다`. 영상이 없으면 `영상이 들어오면 연결합니다`.
  - ④ `첫 분석 실행` → `POST /jobs {kind:infer, deploy_id}` 게이트웨이 작업 큐(표본 1칸) + SSE 진행 막대 + 결과 AI 층. 짝(영상×모델)이 없으면 한 줄.
  - ⑤ `결재 요청` → openapi 에 `POST /approvals` 가 있을 때만 버튼. 지금은 없어 `관제 결재함에서 결재합니다`.
- 심기 시트: `카드` `지역`(K4) `가져갈 것`(서비스 카드 버전 · 기능 n개 · 모델 · 대장 양식 · 판정 규칙) `현지에서 준비할 것`(고해상도 영상 ✓/필요 · 행정 대장 · 기관 표지) · CI 9키 `기관 명칭` `약칭` `마크` `상징색` `연한 바탕` `행정단위 말` `좌표계` `문의처` `직인` · `심기(결재 요청)`. 오류 토스트 `요청을 보내지 못했습니다`.
- 운영·신고: 흰 카드 한 장 = 큰 숫자 `재학습 필요 {n}건` + 표(`배포본` `정밀도` `오탐 신고` `마지막 학습` `다음 행동` = `재학습`/`표본 검수`/`갱신 배포`/`없음`). 행 클릭 → 배포·이식 탭 + 그 배포본 서랍. 운영 배포본 0 이면 K9 항공기 `첫 결과 전` · `이 카드가 깔린 기관이 아직 없습니다`(`?card=` 에 배포본이 없을 때도 같은 빈 상태).

## 서버 변경 전 계약 어댑터 (S-7 · S-9 미반영 확인: 2026-09-27 14:00 `deploys.py` 02:25판)
1. `GET /deploys?with=health` → 서버가 `health` 를 안 줌. 어댑터가 같은 규칙으로 접음: 오탐 신고 = 그 기관의 열린 `fp` 신고 중 결과 층 업무가 카드와 같은 것 · 마지막 학습 = 연결 모델 지표 기준일 · 다음 행동 = 신고 ≥ 5 또는 학습 365일 초과 → `재학습` / 카드 새 버전 → `갱신 배포` / 정밀도 없음 → `표본 검수` / 그 밖 `없음`(임계 = `assets/data/ops.js THRESHOLDS` import). 이때 큰 숫자 봉투 basis = `estimate`(~ 추정치). 서버가 `health{precision, fp_reports, last_train, next_action}` 을 주면 그대로 씀(basis recorded).
2. 심기 본문 = S-7 모양 `{from_deploy_id|card_id, region, ci{9키}}` + 이전 계약 모양 `{tenant_id, region_profile, aoi}` 를 한 요청에 함께 → 어느 서버든 한 번에. 이전 계약은 ci 를 저장하지 않고 approvals 행도 만들지 않음.
3. 이전 계약에선 이식 생성이 관리자 전용 → 직원 세션(`health` 서버 계산 없음 = S-7 전)이면 제출 버튼을 숨기고 `관리자 결재 권한으로 심을 수 있습니다` 한 줄. S-7 이 들어오면 자동으로 직원에게 열림.

## 정직 항목
- 실제로 만든 서버 행 2건(되돌릴 API 없음): `dp-gwangju-jeonnam-living-26`(1차 촬영) · `dp-gwangju-jeonnam-farm-26`(최종 영상). 둘 다 draft(이식 요청) · 광주전남특별시. 관제에서 반려하거나 정리 필요.
- 직원 세션의 심기는 지금 서버에서 403(확인함) → 영상은 관리자 로그인으로 찍음. 셸 표기 `LX 관리자`.
- `첫 분석 실행`은 GPU 부하를 피하려 실행하지 않음(버튼·경로만 확인). 현재 데이터에서 광주전남 배포본은 영상이 없어 버튼 대신 안내 한 줄이 나옴.
- `/survey/findings?deploy_id=` 는 서버가 기관 단위로 거름(배포본 단위 아님). 이식 요청(draft)에 기관 전체 의심 수를 붙이지 않도록 draft 는 `첫 분석 전`으로 둠.
- 광주전남 배포본 AOI 가 거친 상자라 이웃(남원) 영상이 겹침 → 영상 중심이 다른 지역 정밀 경계 상자 안이면 제외.
- 작업 중 실수: 첫 스크린샷 경로 인코딩 버그로 `E:/Land-XI%20%ED%94%8C…/` 폴더가 생겨 통째로 지웠는데, 그 안에 다른 팀이 같은 버그로 잘못 쓴 `shots/audit-0923` · `shots/f2` · `shots/final` 사본이 있었음(정상 경로의 원본은 그대로 확인). 다른 팀 산출물이 그 잘못된 경로에만 있었다면 사라졌을 수 있음.
- K16 number-lint CLI 는 키트의 정문 로그인 도우미가 현 로그인 화면(라디오 라벨)을 못 눌러 실행 못 함 → 자체 스크립트로 `scan()` 만 측정. `재학습 필요 1` 은 콘솔 '오늘'의 재학습(신고 ≥ 5 결과 층 1)과 현재 같은 값(눈으로 대조).

## 키트 요청
1. `auth-gate.js ALLOW['gov-fusion']` 에 LX 세션 읽기(`?preview=`) 허용 — 지금은 LX 세션이 정문으로 튕겨 `기관 포털 미리보기`가 죽은 링크라 **버튼을 숨겨 둠**(ALLOW 가 `lx/staff` 를 포함하면 자동으로 나타남). gov-fusion 팀의 `?preview={did}` 읽기 모드도 필요.
2. `lint/forbidden.mjs frontDoor()` — 현 정문은 `label.seg__c > input[name=who]` 라디오라 `getByRole` 클릭이 가로막힘(라벨이 가로챔). `label:has(input[value=staff|admin|tenant])` 클릭 + `#id` `#pw` `#go` 로 바꾸면 됨.
3. K8 `stepper` 에 단별 슬롯(상태 글자 · 행동 1) 옵션 — 지금은 화면이 그린 뒤 DOM 을 덧붙임.

## 서버 요청(§3 S-7 · S-9 에 그대로)
- `POST /deploys` 직원 허용 + approvals 행(pending) 생성 + `ci` 저장 · `GET /deploys?with=health`(precision 은 lx-review 와 같은 원천) · `POST /approvals`(결재 요청) 또는 S-7 생성 시 자동 행.

## 제안(구현은 명세대로)
- ① `영상 등록 요청`의 API 를 `POST /deploys/{did}/modules` 대신 S-5 `POST /catalog/imagery`(lx-ingest) 또는 기관 대상 요청 행으로 — 지금은 lx-ingest 로 이어 줌.
