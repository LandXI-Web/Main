# core-flow — 관리-생산-서비스 한 흐름을 새 지역에서 (코어 ④)

**먼저:** `_common.md` 전체. 사용자 원칙: 관리-생산-서비스는 **같은 작업 id** 로 이어진다(CLAUDE.md §1).

## 왜
'다른 지역에 적용'(`POST /deploys`)은 배포본 draft + 결재 요청까지만 만든다. 적용한 지역에서 **AI 분석 → 실태조사 → 기관 결과**가 자동으로 이어지지 않고, 지금 배포본 11개는 모두 `sgg_cd` 가 비어 있다(지역 판정이 `region_profile`·남원 `aoi_from: namwon-emd.geojson` 등 미리 만든 값). 그래서 흐름은 미리 준비된 남원·여수 해양쓰레기에서만 이어진다.

## 소유 파일
- `server/landxi_api/deploys.py` · `server/landxi_api/approvals.py` · `server/landxi_api/summary.py` · `server/landxi_api/ops.py` · `server/landxi_api/quota.py` · `server/landxi_api/registry.py`
- `server/workers/metering.py` · `server/ops/**` · `server/config/region_profiles.yaml` · `server/config/quotas.yaml`
- `server/seed/**`(단 `backfill_imagery_sgg.py` 는 core-imagery)
- `landxi/v3/lx-console/**` · `landxi/v3/lx-deploy/**` · `landxi/v3/lx-train/**` · `landxi/v3/ops-core/**` · `landxi/v3/ops-infra/**`
- **신설** `server/tests/test_flow_nation.py` · 마이그레이션 `0007_*`(필요할 때만)

## 할 일
1. **적용 = 실행:** LX 직원이 서비스(카드)를 **시군구**에 적용(`POST /deploys {card_id, region: sgg_cd, tenant_id}`) → 결재(기존 approvals) 통과 시(또는 shadow 단계 진입 시 — 기존 상태기계에서 어느 단계에 돌릴지 기본값을 정하고 기록) **자동으로** ① `catalog.best_imagery(sgg)`(core-imagery) → 없으면 배포본에 `영상 등록 필요` 상태 + LX 직원 할 일 ② `POST /jobs {kind:infer, options:{scope:"sgg", sgg_cd}, deploy_id}`(core-xi) ③ 추론 완료 이벤트 → 카드에 필지 대조 모듈이 있으면 `POST /survey/build {sgg_cd, job_id}`(core-survey) ④ 배포본 `snapshot_current` = 그 결과 세트. 모든 단계가 **같은 deploy_id·job_id** 로 묶여 감사 기록(audit_log)에 남는다.
2. **배포본 지역 = sgg_cd:** 새 배포본은 반드시 `sgg_cd`·`aoi`(시군구 경계). 기존 11개는 `region_profile`/`aoi` 로 `sgg_cd` 를 채우는 1회 백필(지우지 않음). `region_profiles.yaml` 의 `aoi_from: namwon-emd.geojson` 같은 파일 의존 제거.
3. **summary 전국화:** `GET /summary?region=` 가 새 배포본·새 결과(여수 토지피복 등)를 추가 설정 없이 센다(`sets.yaml` aliases 에 손으로 넣지 않아도 배포본 스냅샷 = 작업 결과 세트). 같은 이름 = 같은 값 유지.
4. **기관이 결과를 본다:** 적용된 기관 계정의 첫 화면·서비스 화면(기존)에 그 시군구 결과가 나타난다(summary 기준). 화면 쪽 변경이 남의 소유면 `요청`.
5. **LX 관리자가 같은 작업을 본다:** LX 관리자 대시보드(ops-core·ops-infra)에서 그 배포본 → 그 작업의 GPU 사용(워커·시간)·사용량(기관 계량 `usage_events`)·배포 단계가 한 줄로 이어져 보인다(화면에 작업 id·GPU명 노출 0 — 기존 규칙). 사용량이 기관에 계량되는지 확인(CPU 작업기 재기동 뒤 재집계 누락 이슈 포함).
6. LX 직원 대시보드(lx-console·lx-deploy)의 지역 선택은 `GET /regions` 전국 목록에서, 영상 없는 시군구는 `영상 등록 필요` 표시. `registry.py` 의 남원 학습 계보 고정 문자열은 데이터에서 읽거나 모델 카드로.

## 계약
- 사용: `catalog.best_imagery`(core-imagery) · `POST /jobs {scope:"sgg"}`·`job.done{sgg_cd,set}`(core-xi) · `POST /survey/build`·`survey.done`(core-survey).
- 제공: `GET /summary?region=` 정의 유지(모든 화면·에이전트가 읽음) · 배포본 `sgg_cd` 필수.
- 다른 작업의 API 가 아직 없으면 호출부를 계약대로 만들고 모의 응답으로 시험, **판정은 실연결로**.

## 완료 조건
- **새 지역 여수(전남):** 로그인 폼(lx-staff) → lx-deploy 에서 토지피복/농지 서비스(카드)를 여수에 적용 → (lx-admin 로그인 폼) 결재 → 자동으로 AI 분석(대기열·GPU 한 장) → 실태조사 적재 → **광주전남 담당자(로그인 폼)** 첫 화면·서비스 화면에 여수 결과 수치(summary) → **lx-admin** LX 관리자 대시보드에서 같은 작업의 GPU·사용량·배포 단계. 한 흐름 녹화 또는 단계별 스크린샷(1440·390) + 같은 deploy_id/job_id 가 audit_log 에 이어진 증거(보고서에만).
- **남원(전북):** 기존 배포본이 백필 뒤에도 같은 수치(summary 회귀 0).
- 영상 없는 시군구에 적용하면 실행 없이 `영상 등록 필요` + LX 직원 할 일로 남는다(1곳).
- forbidden(lx-staff·lx-admin·gj-manager, 1440·390) 0 · 콘솔 오류 0 · `server/tests` 통과.
