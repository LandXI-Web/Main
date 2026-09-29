# core-fusion — 행정데이터 융합 + AI 도우미를 어느 기관·시군구에서나 (코어 ③)

**먼저:** `_common.md` 전체 + core-survey 가 올리는 `contract-parcel-ai.md`(없으면 1–2단계부터 하고 기다린다). 사용자 원칙(09-27): vLLM 지도 제어·분석은 일반 API 가 아니라 **기관이 올린 행정 데이터 × AI 결과** 융합이다.

## 왜
대장 올리기·결합은 두 기관(남원·광주전남)에서 돌지만, 결합 뒤 규칙 평가(`ledger.evaluate_rules`)는 `survey_parcels`(남원만)의 `a23_*` 열을 읽어 **광주전남(여수 화양면 786필지)은 'AI 분석 전'으로 끝난다.** AI 도우미 도구도 남원에 묶여 있다: `agent/tools/survey.py` `OWNER_TENANT="namwon"`(다른 기관은 403), `survey_local.py` 는 남원 파일 경로, `registry.py`·`results.py` 기본 세트 `results/lx/namwon-landcover-2023`, `jobs.py` 모델 선호 목록, 설명문 '남원 39개 법정동', `map_on` 세트 `survey/namwon-parcel-survey` 고정.

## 소유 파일
- `server/landxi_api/ledger.py` · `server/landxi_api/agent.py`
- `server/agent/**`(runner · backends · tools/* · redteam.yaml · bench · audit · report · tests)
- `landxi/v3/gov-fusion/**`
- **신설** `server/tests/test_fusion_nation.py` · 마이그레이션 `0009_*`(필요할 때만)

## 할 일
1. **대장 × AI 결합 일반화:** 대장 매칭(PNU → 지번 → 좌표 → V-World)은 유지하되, 필지 색인(`ParcelIndex`)과 규칙 평가(L-*)가 **로그인 기관 관할 시군구의 `survey_parcels` + `survey_parcel_ai`**(contract-parcel-ai)를 읽게 한다. 관할에 필지가 아직 없으면 core-survey 의 `POST /survey/build` 를 요청해 적재 뒤 평가(화면은 기존 진행 문구 `필지에 이어 붙이는 중`). AI 결과가 없는 관할은 지금처럼 정직하게 `영상 등록 필요 · AI 분석 전`.
2. **AI 도우미 도구 전국화:** 도구의 데이터 소유 판정을 `OWNER_TENANT` 고정에서 **세션 기관의 관할(regions.tenant_scope)** 로. LX 세션은 `region`(시군구)을 인자로 받는다. 기본 세트·설명문·오류 문구의 남원 문자열 제거(설명문은 `{시군구}` 식으로 일반화). 로컬 파일 대체 경로(`survey_local.py`)는 PostGIS 가 없을 때만.
3. **말로 지도 제어·분석·즉시 시각화:** 한 문장(예 `대장상 농지인데 AI가 건물로 본 필지`, `화양면 비닐하우스 늘어난 필지 보여줘`) → vLLM(:8000) 도구 호출 → 결과가 **지도 채색 + 표 + 집계**로 바로. `ui_actions`(`map_on`·`fly`·`filter`) 형식은 유지하고 세트·필터에 `sgg_cd`/`import_id` 를 실어 어느 지역이든 그려지게. gov-fusion 에서 끝까지 확인, XI맵 쪽 소비 코드가 바뀌어야 하면 core-xi 에 `요청`.
4. 기관 경계 가드 유지(다른 기관 데이터 0 · 게스트 0) + redteam 문항에 '다른 기관 시군구 질의' 추가. 시험 기대값은 문항 파일에서 센다(고정 숫자 금지).
5. `ledger_schema` 를 기관 세션이 못 읽는 문제(gov-fusion-report: 405/403)는 소유 범위 안에서 해결하거나 `요청`.

## 계약
- 사용: `survey_parcels`·`survey_parcel_ai`·`POST /survey/build`(core-survey) · `regions.tenant_scope`·`emd_index`(core-xi) · `GET /summary`(core-flow).
- 제공: 도구 `ui_actions` 형식(기존) + `sgg_cd` 필드. 바꾸면 core-xi 에 알림.

## 완료 조건
- **광주전남 담당자(로그인 폼) · 여수:** gov-fusion 에서 대장 파일(기존 `화양면_농지목록` 또는 새 파일) 올리기 → 열 확인 → 결합 → **AI 결과와 어긋난 필지 수가 숫자로** 나온다(`AI 분석 전` 아님 — core-xi 여수 추론·core-survey 적재 뒤) → 한 문장 질문 → 지도 채색 + 표 + 집계. 녹화(20–40초, vLLM 실연결 · 리플레이 0).
- **남원 담당자(로그인 폼):** 같은 흐름 회귀(기존 431필지 등 값이 바뀌면 사유).
- LX 직원 세션에서 `여수 …` / `남원 …` 질문이 각 지역 데이터로 답한다. 광주전남 세션에서 남원 질문 → 권한 밖 한 줄(도구 403 가드).
- 도구·설명문·기본값에 지역 문자열 0(grep 결과 보고서에) · forbidden(gj-manager·namwon-manager, 1440·390) 0 · 콘솔 오류 0 · `server/agent/tests`·`server/tests` 통과.
