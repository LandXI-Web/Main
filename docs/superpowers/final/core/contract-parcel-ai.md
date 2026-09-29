# 계약 — 필지 × AI 결합 (core-survey 제공 · core-fusion · core-flow 사용)

> 2026-09-29 core-survey 착수 첫 단계에 게시. 바뀌면 이 파일 맨 아래 `변경 기록`에 한 줄 추가한다.
> 마이그레이션 `server/migrations/0005_survey_nation.sql`(추가만 · 기존 열 이름·표는 그대로).

## 0. 한 줄
**어느 시군구든** `POST /api/v1/survey/build {sgg_cd, job_id?}` 한 번 → 그 시군구 연속지적 필지가 `survey_parcels` 에 들어가고,
AI 작업(`job_id`)의 탐지가 필지와 **한 번** 결합돼 `survey_parcel_ai` 에 저장되고, 규칙 R1–R6 이 그 결과로 평가돼
`survey_findings` 가 채워진다. 끝나면 `survey.done` 이벤트.

## 1. 코드 규칙
- **시군구 코드 = 현재 V-World 코드**(예 여수 `12130`, 남원 `52190`). 옛 코드(`46130`)로 요청해도 서버가 `regions.regions_base()` 의 `prev_cd` 로 현재 코드로 바꾼다.
- **PNU 도 현재 코드로 저장**한다. 로컬 연속지적(2022-02)은 옛 코드(46130…)라 적재 때 앞 5자리를 현재 코드로 바꾼다 → 기관 대장(`registry_snapshots.pnu`, V-World 코드)과 그대로 맞는다. 원본 PNU 는 `survey_parcels.pnu_src`.
- 관할 기관(`tenant_id`) = `config/regions.yaml tenants.*.sgg` 접두가 맞는 첫 기관(없으면 `lx`). 여수 → `gwangju-jeonnam`, 남원 → `namwon`.

## 2. 표

### 2.1 `survey_parcels` (기존 표 · 열 추가)
| 열 | 뜻 |
|---|---|
| `sgg_cd` text | 시군구(현재 코드). 기존 남원 행은 `substr(pnu,1,5)` 로 채움 |
| `src` text | 필지 원천: `canon`(남원 기존 적재) · `lsmd`(로컬 연속지적 전국 2022-02) · `vworld`(V-World `LP_PA_CBND_BUBUN`) |
| `src_as_of` text | 필지 기준 시점(필지 카드에 싣는다): `2022-02` · `2026-09-24` · V-World 수집일 |
| `pnu_src` text | 원천 PNU(코드 바뀐 시군구만 다름) |
| 기존 열 | `pnu`(PK) · `tenant_id` · `addr` · `emd` · `emd_cd`(8자리) · `ri` · `jibun` · `jimok`(한 글자) · `jimok_nm` · `area_m2`(EPSG:5186) · `geom`(MultiPolygon 4326) · `yongdo` · `nongup` · `jiga` |

새 시군구 행의 `a23_*`·`a25_*`·`chg*` 는 0/빈 값(쓰지 않는다 — AI 값은 `survey_parcel_ai`). `yongdo`·`nongup`·`jiga` 는 원천에 있으면, 없으면 빈 값(설명에 `미결합` 사유).
색인: `(sgg_cd)` · `(tenant_id, sgg_cd)` · 기존 `(emd_cd)` · `gist(geom)`.

### 2.2 `survey_parcel_ai` (신설) — 작업 × 필지 × 클래스 1행
| 열 | 뜻 |
|---|---|
| `job_id` text | AI 작업 id(또는 정적 세트 id, 예 남원 2023 세트) — `detections.job_id` 와 같은 값 |
| `pnu` text | 필지 |
| `tenant_id` · `sgg_cd` · `emd_cd` text | 관할 기관 · 시군구 · 읍면동(PNU 앞 8자리) |
| `cls` text | **규칙 피연산자 키** `bld`·`crop`·`park`·`gh`(… 대응표는 `server/survey/rules/_operands.yaml`). 대응표에 없는 클래스는 `detections.cls_en`(없으면 `cls`) 그대로 |
| `cls_ko` · `cls_en` text | 원래 클래스 이름(`detections.cls` · `cls_en`) |
| `hit_m2` float | 필지 안 교차면적 합(모든 탐지 · 교차 > 0.01㎡) — 옛 `a23_{c}_m2` |
| `in_m2` float | 탐지 면적의 **과반(≥ 0.5)이 필지 안** 이고 **신뢰도 ≥ 0.5** 인 탐지의 교차면적 합 — 규칙 근거 · 옛 `a23_{c}_in_m2` |
| `n` int | 위 조건 탐지 수 · 옛 `a23_{c}_n` |
| `conf` float | 위 조건 탐지의 면적 가중 평균 신뢰도(없으면 NULL) · 옛 `a23_{c}_conf` |
| `ids` text | 근거 탐지 id 상위 5(교차면적 순, 쉼표) |
| `n1` int · `hit1_m2` float · `conf1_sum` float | 교차 ≥ 1㎡ 인 (탐지, 필지) 쌍 수 · 면적 합 · 신뢰도 합 — `GET /results/{set}/parcels` 가 그대로 읽는다(평균 = `conf1_sum / n1`) |
| `at` timestamptz | 결합 시각 |

PK `(job_id, pnu, cls)` · 색인 `(sgg_cd, job_id)` · `(pnu)` · `(tenant_id, sgg_cd, cls)`. RLS = 다른 survey 표와 같음(`tenant_id` = 세션 기관 또는 realm lx).

**읽는 법(core-fusion L-* 규칙):** 필지의 AI 피연산자 = `survey_sgg.job_id`(그 시군구의 현재 AI 작업)로 거른 `survey_parcel_ai` 를 pnu 로 묶어 펼친다.
```sql
SELECT p.pnu, p.jimok, p.area_m2,
       coalesce(sum(a.in_m2)  FILTER (WHERE a.cls='bld'),0) AS bld_in_m2,
       coalesce(sum(a.hit_m2) FILTER (WHERE a.cls='crop'),0) AS crop_m2
FROM survey_parcels p JOIN survey_sgg s ON s.sgg_cd = p.sgg_cd
LEFT JOIN survey_parcel_ai a ON a.pnu = p.pnu AND a.job_id = s.job_id
WHERE p.sgg_cd = $1 GROUP BY 1,2,3;
```
서버 함수로도 제공: `survey.nation.ai_operands(conn, pnus, sgg_cd) -> {pnu: {"a23_bld_in_m2":…, "r23_farm":…, …}}`(옛 L-* yaml 의 `ai.a23_*` 피연산자 이름 그대로 채워 준다 — L-* 평가 코드 수정 최소).

### 2.3 `survey_sgg` (신설) — 적재된 시군구 1행
| 열 | 뜻 |
|---|---|
| `sgg_cd` PK · `tenant_id` · `name` · `sido` | 시군구 |
| `job_id` | 규칙이 읽는 AI 작업(결합 기준) |
| `state` | `building` · `done` · `failed` · `no_ai`(AI 결과 없음 — 필지만 적재) |
| `parcels` int · `parcels_src` jsonb | 필지 수 · `{lsmd: n, vworld: n, canon: n}` |
| `parcels_as_of` text | 필지 기준 시점 |
| `joined_parcels` int | AI 탐지가 하나라도 겹친 필지 수 |
| `findings` int · `by_rule` jsonb · `by_priority` jsonb | 의심 건수(규칙 R1–R6) |
| `priority_cut` jsonb | `{A, B}` 점수 절단(**그 시군구 전체** 점수 상위 5% · 다음 20%) |
| `imagery` text | 근거 영상 표기(작업의 영상 이름 · 시점) |
| `build_job_id` · `ms` jsonb · `at` · `finished_at` | 적재 작업 id · 단계별 실측 ms(보고서·`?dev=1` 전용) |

### 2.4 `survey_findings` · `survey_emd` (기존 · 열 추가)
- `survey_findings.sgg_cd` · `survey_findings.ai_job_id` — 새 시군구 행은 채움, 남원 기존 행은 `sgg_cd` 만 채움.
- `survey_emd.sgg_cd` — 읍면동 요약에 시군구.
- 새 시군구의 finding id 규칙은 그대로 `f_{rule}_{pnu}`, `rank` 는 **그 시군구 안** 점수 순위.

## 3. API

### `POST /api/v1/survey/build`
요청 `{ "sgg_cd": "12130", "job_id": "job_…"(선택), "force": false }`
- `job_id` 생략 → 그 시군구에 탐지가 있는 가장 최근 완료 AI 작업(`detections.emd_cd` 앞 5자리 또는 필지와 겹치는 탐지). 없으면 **필지만 적재**하고 `survey_sgg.state='no_ai'`(화면: `AI 분석 전` + 전역 분석 행동).
- 권한: LX staff/admin(전국) · 기관 manager(관할 시군구만). 게스트·영업 403.
- 응답 202 `{ "job": {id, state:"queued", kind:"survey", …}, "sgg_cd": "12130", "tenant_id": "gwangju-jeonnam", "ai_job_id": "job_…"|null, "events_url": "/api/v1/events/jobs/{id}" }`
- 같은 시군구 적재가 진행 중이면 409 `survey_build_running {job_id}`.
- 작업은 게이트웨이 대기열의 CPU 작업(kind `survey`, 어댑터 `survey/rules` 의 build 단계 · GPU 0).

### 이벤트
- 작업 스트림 `events:{job_id}`: `survey.progress {sgg_cd, stage: parcels|join|rules|findings, done, total, note}` · 기존 `shard.done` · `job.done{counts}`.
- 끝: **`survey.done {sgg_cd, tenant_id, job_id(적재 작업), ai_job_id, counts:{parcels, joined_parcels, findings, by_rule{R1..R6}, by_priority{A,B,C}}, at}`** — `ops:events` 와 기관 스트림 `events:tenant:{tenant_id}` 에 같이.

### 읽기(필터 추가)
- `GET /survey/findings?sgg=12130` (여러 개 쉼표) — 기존 필터와 AND. 기관 세션은 RLS 로 자기 관할만.
- `GET /survey/stats?by=emd|rule|priority|state&sgg=12130` — 읍면동 목록·합계가 그 시군구만.
- `GET /survey/regions` — 적재된 시군구 목록(`survey_sgg` · 세션이 볼 수 있는 것만) `{items:[{sgg_cd, name, sido, tenant_id, state, parcels, findings, bbox, parcels_as_of, imagery}]}`.
- `GET /survey/build/{sgg_cd}` — 그 시군구 `survey_sgg` 한 행(진행 상태).
- `GET /results/{set}/parcels` — 저장된 `survey_parcel_ai` 를 읽는다(첫 응답 ≤ 3초). 저장이 없는 옛 세트·기본값이 아닌 `min_hit_m2` 는 기존 공간 결합(결과 캐시).
- `GET /survey/reports/draft?emd_cd=…&format=docx` — 문서 안 기관·시군구·읍면동 이름은 데이터에서.

## 4. 규칙 피연산자(`server/survey/rules/_operands.yaml`)
| 피연산자 | 뜻 | 남원 옛 열 |
|---|---|---|
| `ai.bld.in_m2` · `.n` · `.conf` · `.hit_m2` | 건물 | `a23_bld_*` |
| `ai.crop.*` · `ai.park.*` · `ai.gh.*` | 경작지 · 주차장 · 비닐하우스 | `a23_crop_*` · `a23_park_*` · `a23_gh_*` |
| `ai.ratio.bld` · `ai.ratio.farm` | `hit_m2 ÷ 필지면적`(≤ 1 · 소수 셋째 자리) | `r23_bld` · `r23_farm` |
| `ai2.gh.*` · `ai2.crop.hit_m2` · `ai2.uncrop.hit_m2` · `chg.built_new_m2` | 두 번째 시점(있을 때만 · 없으면 0) | `a25_*` · `chg_built_new_m2` |
클래스 → 피연산자: 건물·building → `bld`, 경작지·cropland → `crop`, 주차장·parking → `park`, 비닐하우스·greenhouse → `gh`.

## 변경 기록
- 2026-09-29 최초 게시(core-survey).
