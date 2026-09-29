# core-survey — 필지 실태조사를 어느 시군구에서나 (코어 ②)

**먼저:** `_common.md` 전체. 흐름: **AI 결과 × 연속지적 필지 × 대장 대조 → 의심 → 결과 확인 → 조치 → 보고서.**

## 왜
실태조사 엔진은 남원 한 곳의 미리 구운 파일(`02. 데이터/survey/namwon-*.gpkg/csv/json`)을 적재한 것이다: `survey_parcels` 는 namwon 332,084행뿐, 규칙 R1–R6 은 2023 남원 추론 전용 열(`a23_*`)을 읽는다, `survey/db.py` `TENANT="namwon"`, 보고서는 '남원 39 법정동'을 가정, 필지 결합(`GET /results/{set}/parcels`)은 남원 전체 필지 × 12.9만 탐지를 매번 새로 계산해 **첫 응답 22–32초**. 그래서 여수 등 새 지역은 AI 결과가 나와도 실태조사가 시작되지 않는다.

## 소유 파일
- `server/survey/**`(rules/*.yaml · db · explain · report · rules · pipelines · tests)
- `server/adapters/survey/**`(join · rules 어댑터 — 작업 kind `survey`·`join`)
- `server/landxi_api/survey.py` · `server/landxi_api/results.py` · `server/landxi_api/parcels.py`
- `server/pipelines/p8_parcels.py`(전국 필지 적재로 일반화) · 마이그레이션 `0005_*`
- `landxi/v3/gov-report/**` · `landxi/v3/lx-review/**`
- **신설** `docs/superpowers/final/core/contract-parcel-ai.md`(core-fusion 이 읽는 표 계약 — **첫 단계로 먼저 써서 올린다**)
- **신설** `server/tests/test_survey_nation.py`

## 할 일
1. **필지 적재(시군구 단위 · 요청 시):** `POST /api/v1/survey/build {sgg_cd, job_id?}` → CPU 작업(kind `survey`, 게이트웨이 대기열). 원천 우선순위: 로컬 연속지적 전국(`LSMD_CONT_LDREG_{시도}` SHP, 2022-02 · PNU 앞 5자리 = 시군구로 거름) → 없거나 빈 곳만 V-World `LP_PA_CBND_BUBUN`(페이지·쿼터 보호·디스크 캐시). `survey_parcels` 에 `tenant_id`(관할 기관 · 없으면 `lx`)·`sgg_cd`(열 추가) 로 넣는다. 지목·면적·주소는 원천에서, 용도지역·농업진흥은 있으면(V-World 레이어) 없으면 빈 값 + 설명의 `미결합` 사유. 필지 기준 시점을 필지 카드에 싣는다. 기존 남원 행은 건드리지 않는다.
2. **AI × 필지 결합(일반화):** 새 표(계약) `survey_parcel_ai(pnu, tenant_id, sgg_cd, job_id, cls, hit_m2, n, conf, ids)` — 작업 id 의 `detections` 와 그 시군구 필지를 한 번 결합해 저장. 남원 `a23_*` 열은 두되, 규칙은 이제 `ai.<cls>.hit_m2` 같은 일반 피연산자로 읽는다(남원은 기존 값과 같은 결과가 나오는지 회귀 — 의심 필지 수 차이 0 또는 차이 사유를 보고서에). 모델 클래스(건물·주차장·경작지·비닐하우스) → 규칙 피연산자 대응은 규칙 yaml 에 둔다.
3. **규칙 → 의심:** 같은 R1–R6(임계 기존 값)을 시군구 단위로 평가 → `survey_findings`(tenant·sgg·rule·priority·score). 읍면동 이름은 core-xi 의 `regions.emd_index(sgg)`.
4. **필지 결합 속도:** `GET /results/{set}/parcels` 는 2의 저장 결과를 읽는다 → **첫 응답 ≤ 3초**(남원·여수 모두). 저장이 없는 옛 세트만 기존 계산 + 결과 캐시.
5. **결과 확인 → 조치 → 보고서:** `lx-review`(결과 확인: 표본 판정·정밀도)와 기관 쪽 조치(`survey_actions`)·보고서(`survey/report.py` · `gov-report`)가 **지역 = 로그인 기관 관할 또는 `?region=`** 으로 돈다. 보고서 문장·표의 기관·시군구·읍면동 이름은 데이터에서(‘남원시’ 치환 같은 우회 삭제 — `gov-report/app.js` 의 `/남원/` 치환). 등급 A/B 기준 문장 '남원 전체 상위 5%' → `{시군구} 전체`.
6. 필지 조회 `GET /parcels?lng&lat` 전국화: 적재된 시군구는 `survey_parcels`, 아니면 V-World 한 점 조회(캐시).
7. 소유 범위 남원 하드코딩 제거(`survey/db.py`·`sse_fallback.py` 기본 tenant 등). 남원 원천 파일 적재 파이프라인(s5)은 남원 재현용으로 남긴다.

## 계약(core-fusion·core-flow 가 쓴다)
- `contract-parcel-ai.md` 에 표 열·의미·색인, `POST /survey/build` 요청/응답·이벤트(`survey.done{sgg_cd, tenant_id, counts}`), `GET /survey/stats?sgg=`·`/survey/findings?sgg=` 필터를 적는다. core-fusion 은 대장 규칙 L-* 평가에 `survey_parcels`+`survey_parcel_ai` 를, core-flow 는 배포 적용 뒤 `POST /survey/build` 를 부른다.
- 사용: core-xi `detections(job_id, emd_cd)` · `regions.emd_index` · 완료 이벤트.

## 완료 조건
- **여수(전남, 새 지역):** core-xi 의 여수 전역(또는 읍면동 몇 곳) 추론 작업 → `POST /survey/build` → 필지 적재·결합·의심 산출 실측(보고서) → **로그인 폼(gj-manager)** 으로 기관 화면에서 여수 의심 필지 목록·지도 → 한 필지 `결과 확인`(lx-staff, lx-review) → 기관이 `조치` 기록 → 보고서(docx) 내려받기, 문서 안 기관·시군구·읍면동 이름이 여수 것. 녹화 또는 단계별 스크린샷(1440·390).
- **남원(전북, 기준):** 같은 흐름이 그대로 돈다 + 규칙 일반화 전후 의심 수 회귀표.
- `GET /results/{set}/parcels` 첫 응답 ≤ 3초(두 지역 실측).
- `contract-parcel-ai.md` 가 착수 첫 단계에 올라가 있다(core-fusion 이 참조).
- forbidden(gj-manager·namwon-manager·lx-staff) 0 · 콘솔 오류 0 · `server/tests`·`server/survey/tests` 통과.
