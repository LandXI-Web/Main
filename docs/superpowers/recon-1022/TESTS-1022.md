# server/tests 전체 시험 — 10-22 결과

> 방법: 켜져 있는 서버(:8700)에 파일 하나씩 pytest(파일마다 제한 900초, junit xml 남김 · 서버 다시 띄우지 않음 · GPU 0). 전체 687개 시험 중 운영 DB 에 쓰는 것으로 보이는 파일은 돌리지 않았다.
> junit/로그: 스크래치 폴더 `C:/Users/User/AppData/Local/Temp/claude/E--Land-XI----/8755e9e1-c9d4-4ccc-ae31-8eb0e35a24df/scratchpad/junit/` (파일별 .xml · .log, 한 번에 돌린 ALL.xml).
> test_guards · test_impl22_national · test_public_record 는 다른 에이전트가 고치는 중이라 손대지 않았다(돌리지도 않음).

## 한눈에

| 구분 | 파일 | 시험 수 | 통과 | 실패 | 건너뜀 |
|---|---|---|---|---|---|
| 돌림(쓰기 없음) | 35 | 250 | 239 → 고친 뒤 **243** | 8 → 고친 뒤 **4** | 3 |
| 돌리지 않음 — 운영 DB 에 직접 쓰는 시험(임시 계정 · 표 INSERT/UPDATE/DELETE) | 40 | 316 | - | - | - |
| 돌리지 않음 — 쓰는 요청 · 작업 큐 · Redis · GPU 를 건드림 | 13 | 97 | - | - | - |
| 맡은 다른 에이전트 몫 | test_guards 14 · test_impl22_national 10 · test_public_record(파일 없음) | 24 | - | - | - |

건너뜀 3 = 시험 안의 조건 건너뜀(test_f2b_api 1 · test_sse_resume 2, 작업이 없을 때). 한 번에 35개 파일을 이어 돌리면 6 실패 · 9 오류(아래 ③ 때문)가 나온다 — 낱개 실패 4개 + 순서 영향 3곳.

## 실패별 분류

| 시험 | 분류 | 원인 | 조치 |
|---|---|---|---|
| test_impl31_dash::test_emd_sums (21,619 ≠ 21,123) | ① 현장 확인 21,619 한 값 | 시험의 직접 센 식이 R1–R6 만 셌다. 지역 숫자는 대장 대조 L-* 까지 센다(xdash.COUNT_RULES = survey.db COUNT_RULE_IDS · 차이 496 = L1) | 고침 — 직접 센 식을 COUNT_RULES 로. 통과 |
| test_impl31_dash::test_jimok_rule_area_time (규칙별 칸에 L1:496 하나 더) | ① 같은 이유 | 위와 같음(규칙별 직접 센 식) | 고침. 통과 |
| test_impl20_ximap_speed::test_board_layers_have_version_and_immutable_tiles | ① 남원 농지 2025 등 결과는 권한 있는 쪽만(옆문 닫기 2차 5176b1c0) | XI맵 판의 결과 층이 전부 서명 세트가 되어 '서명 안 된 층' 선택이 빈 목록. 서명 세트는 보관 머리도 private | 고침 — 서명 주소(/tiles/sign)로 열고, 서명 세트는 `private, max-age=…, immutable` 로 기대. 통과 |
| test_impl20_ximap_speed::test_slim_low_zoom_keeps_id_cls_and_geometry | ① 같은 이유 | StopIteration(같은 빈 목록). 파일을 직접 읽으므로 서명과 무관 | 고침(서명 필터 제거). 통과 |
| test_summary::test_values_match_source_tables (광주전남 field_check 1,834 / 시험 1,822) | ② 결정 필요(고치지 않음) | 요약표의 기관 항목 합이 시군구마다 섞인다 — 12110 · 12730 · 12780 은 카드 판 숫자(R1–R6 만: 110 · 555 · 633), 12130 은 시군구 전체(L 포함: 536). 시험 기대값을 COUNT_RULE_IDS 로 바꾸면 1,869 로 또 어긋난다. 남원은 일치. 카드 판 숫자 vs 지역 숫자를 요약표가 어느 쪽으로 보일지 정해야 함(21,619 한 값 원칙과 광주전남 카드 판 불일치 가능성) | 목록만. 재현: `python -m pytest tests/test_summary.py::test_values_match_source_tables -q` |
| test_contract::test_route_shape[ops_gpus], [ops_storage] | ② 시험 계약서가 새 키를 못 따라감(고장 아님, 오늘 규칙 6개 밖) | 응답에 `measure_stale` 키가 늘었다(ops.py · 10-17 869c183b). 픽스처 선택 키에 없음 | 목록만. 재현: `python -m pytest tests/test_contract.py -q` · 고친다면 V12_OPTIONAL 에 "measure_stale" 추가 |
| test_impl41_recheck::test_heavy_area_single_flight_and_stale | ② 시험 목이 코드 시그니처를 못 따라감(고장 아님, 오늘 규칙 6개 밖) | quota._area_compute 가 `(ms, t, ttl)` 로 바뀌었는데(10-21 b8770d6f) 시험의 slow_compute 는 `(ms, t)` → TypeError | 목록만. 재현: `python -m pytest tests/test_impl41_recheck.py -q` · 고친다면 slow_compute(ms, t, ttl=None) |
| test_impl32_hwpx 9개 오류 (asyncpg 'another operation is in progress') | ③ 순서 영향 | 같은 프로세스에서 test_impl40_parcel 뒤에 돌면 공유 asyncpg 연결이 다른 이벤트 루프에 묶여 깨짐. 혼자 돌리면 6 통과 | 목록만. 재현: `python -m pytest tests/test_impl40_parcel.py tests/test_impl32_hwpx.py -q` (뒤집은 순서에서는 test_impl40_parcel::test_dash_off_from_context 가 실패) |
| test_impl40_parcel::test_dash_off_from_context | ③ 순서 영향 | 위와 같음(hwpx 뒤에 돌면 실패, 혼자는 통과) | 위 재현 참고 |
| test_ximap_boot::test_boot_tenant_same_values_and_home | ③ 순서 영향 | 여러 파일 뒤에 돌면 요약 응답의 `computed_at` 이 부팅 응답과 달라 비교가 깨짐(혼자는 통과) | 목록만. 재현: `python -m pytest tests/test_impl32_hwpx.py tests/test_impl40_parcel.py tests/test_ximap_boot.py -q` |

①로 드러난 것은 남원 농지 서명(옆문 닫기 2차)과 현장 확인 21,619 한 값 두 가지다. 겹친 읍면동 한 번만 세기(once_sql)는 시험이 이미 따르고 있다. 엑셀 안내 줄 · 기관 권한 계정 · FlatGeobuf/연-월 폴더 기대값을 보는 시험(test_impl45_farm · test_impl22_core 등)은 아래 '돌리지 않음'에 들어 있어 이번에 확인하지 못했다 — DB 쓰기를 허락받으면 다시 돌려야 한다.

## 돌리지 않은 시험(운영 DB 에 쓴다 · 이유)

- 운영 DB 직접 쓰기(임시 계정 만들기 · 표 INSERT/UPDATE/DELETE, 관리자 DSN): test_ext_api · test_f3_server · test_flow_nation · test_impl11_admin · test_impl11_entry_contact · test_impl13_categories · test_impl14_round3 · test_impl16_adopt · test_impl18_adopt · test_impl18_gov · test_impl1_admin · test_impl22_core · test_impl23_project · test_impl25_project_nowhat · test_impl25_tiles · test_impl27_data_project · test_impl28_shared_data · test_impl29_shared_tabs · test_impl2_accounts · test_impl2_brand · test_impl2_cleanup · test_impl2_project · test_impl2_request · test_impl2_review · test_impl30_edit_memory · test_impl31_shared_upload · test_impl32_loop · test_impl3_imagery · test_impl3_spaces · test_impl45_farm · test_impl4_fixes · test_impl4_improve · test_impl5_account_extras · test_impl5_gov · test_impl5_gov2 · test_impl5_project · test_quota_usage · test_r3_fusion · test_r3_train · test_release(40개 · 316시험). 이 중 quotas · lx_settings(ops.contact) · survey_rules · card_groups 순서처럼 운영 값을 바꿨다가 되돌리는 시험이 있어 중간에 끊기면 값이 남는다.
- 쓰는 요청 · 큐 · Redis · GPU: test_impl13_inquiries(문의 등록) · test_impl14_b(내려받기 동의) · test_impl26_memos · test_impl28_national_v2(전국 분석 설정 변경) · test_impl35_shared_detail(대장 올리기) · test_impl41_two_gpu · test_live_infer · test_power_gate · test_recovery(Redis 키 삭제 · 작업 되살리기) · test_survey_nation(실태조사 만들기) · test_tenant_stream(배포 고정) · test_xi_nation(작업 제출) · test_impl18_ximap(97시험).
- 로그인 세션 기록은 모든 시험에서 생기는 것으로 보고 제외하지 않았다.

## 바꾼 시험 파일

- `server/tests/test_impl31_dash.py` — 직접 센 식을 COUNT_RULES 로 (2곳)
- `server/tests/test_impl20_ximap_speed.py` — 서명 세트 대응 (2시험)

---

# 2차 (10-22 오후) — 숫자 한 출처 · 시험 전용 DB · 시험 따라잡기

## 1. '현장 확인 필요' · '의심 필지' 한 값(now 21 ⓐ — 대장 대조 넣고 겹침 한 번)

**고장:** 대표 수치 요약(/summary)의 항목은 '기관 × 서비스 × 시군구'다. 서비스 판이 있는 시군구(목포 · 구례 · 강진)는 그 판 줄(R1–R6)만 셌고, 판이 없는 시군구(여수)는 시군구 실태조사 줄(대장 대조 L 포함)을 셌다. 대장 대조 줄은 어느 서비스 판에도 속하지 않아 빠졌다. 남원처럼 한 시군구에 실태조사 항목이 둘이면, 두 항목을 더한 값이 겹친 13건을 두 번 셌다(21,368 + 264 = 21,632).

**고침(지역 하드코딩 없음 · 모든 기관 · 모든 시군구 같은 식):** `server/landxi_api/summary.py` `_region_share` — 한 지역(기관 × 시군구)의 실태조사 항목을 더하면 지역 숫자(survey_counts 시군구 = R1–R6 + 대장 대조 · 같은 필지 · 같은 규칙 한 번)가 되게 나눈다. 서비스 판 항목은 제 판 값 그대로(서비스 몫)다. 나머지(시군구 실태조사 · 대장 대조 · 겹침 차이)는 그 지역 바탕 항목 하나에 붙는다(규칙을 고르지 않은 서비스 → 없으면 그 지역 첫 항목). 서비스 이력 통계(`gov_history.py`)의 규칙 범위도 R1–R6 → R1–R6 + 대장 대조로 맞췄다. XI ChatGEO 의 '서비스 몫' 답(`agent/tools/ext/ask.py`)은 같은 요약 함수(summary.build)를 읽는다. 지역 숫자 답은 원래부터 같은 함수(survey_counts)다.

**바깥 주소 대조(https://app.land-xi.dev · 로그인 폼 frontDoor · 12:48–12:56 · 게이트웨이 12:42 기동본 = 이 고침 포함):**

| 지역 | 지역 숫자(목록 · 시군구 실태조사) | 요약 항목 합(전) | 요약 항목 합(지금) | XI ChatGEO 답(기관 계정) |
|---|---|---|---|---|
| 남원 의심 필지 | 21,619 | 21,632(21,368 + 264) | **21,619**(경작·휴경 21,355 + 다른 서비스 264) | "의심 필지는 21,619건" · "경작·휴경 의심 필지는 21,355건 — 전체 21,619건 가운데 이 서비스 몫" |
| 남원 현장 확인 필요 | 1,098 | 1,098 | **1,098**(1,082 + 16) | (원칙 135 — 답은 AI 분석 결과 2,098필지) |
| 목포 의심 필지 | 932 | 819(R만) | **932** | "932건" · 서비스 몫 "932건 — 전체 932건 가운데" |
| 여수 의심 필지 | 10,748 | 10,748 | **10,748** | "10,748건" |
| 구례 의심 필지 | 11,503 | 11,081(R만) | **11,503** | "11,503건" |
| 강진 의심 필지 | 12,750 | 12,625(R만) | **12,750** | "12,750건" |
| 광주전남 관할 전체 의심 필지 | 35,933 | 35,273 | **35,933** | "관할 전체 … 35,933건" |
| 광주전남 현장 확인 필요(시군구 합) | **1,869**(116 + 536 + 574 + 643) | 1,834(110 + 536 + 555 + 633) | **1,869** | — |

- 기관 화면(남원 · 광주전남: 첫 화면 · XI맵 · 융합 지도 · 보고서)은 원칙 135 에 따라 이 두 숫자를 큰 글씨로 보이지 않는다. 그래서 화면이 읽는 API 값(/summary · /survey/regions)을 같은 접속에서 받아 위 표에 적었다. 옛 값(21,632 · 1,834 · 819 · 11,081 · 12,625)은 어느 화면 · 답에도 없다.
- 그림 · 답 기록(로컬 스크래치 `fc/`): namwon-*.png · gwangju-jeonnam-*.png · chat-*.png · chat-*.json.
- 남은 것(②): 서비스 이력 통계는 '서비스 판' 줄로 센다. 그래서 판이 있는 시군구(목포 · 구례 · 강진)의 대장 대조 줄은 이력 통계에 들지 않는다(요약 항목 932 ↔ 이력 통계 819 꼴). 대장 대조 줄을 그 지역 서비스 이력에도 넣을지 결정이 필요하다. 기관 XI맵의 필지 점 목록 조회(xi-clean hudQuery)도 R1–R6 만 부른다(숫자를 보이지 않는 목록이고 첫인상 담당 파일이라 손대지 않음).
- `gov_history.py` 고침은 운영 게이트웨이를 다시 띄워야 반영된다(시험 게이트웨이에서는 반영 · test_impl5_gov2 통과). summary · ask 고침은 12:42 · 13:32 기동본에 이미 들어 있다.

**메인 첫 장면 '하천구역 주변 건물' 3,747,178동(오케스트레이터 확인 요청):**
- 무엇을 센 것인가: 전국 분석 장부(national_cells)의 하천 · 계곡 칸 숫자다. 그 읍면동에서 **하천 띠(하천구역 + 양쪽 100m)를 덮는 영상 칸 전체를 분석해 찾은 건물 가운데 중심이 그 읍면동 안인 것**을 센다(`national/runner.py` `_finish_cell` 이 읍면동 경계 geom_s 로 세고, 분석 범위 target 으로 자르지 않는다). 분석 칸이 띠보다 넓어 띠 밖 건물이 함께 들어간다.
- 잰 값(무작위 40칸 · 결과 파일): 셈에 든 건물 49,771동 가운데 하천 띠 안은 24,423동(**49%**)이다. 하천 띠 넓이는 15,724㎢(국토의 약 16%). → '하천구역과 둘레 100m 안 건물'이라는 이름 · 설명과 실제 뜻이 다르다.
- 고침(이름을 실제 뜻으로 · 쉬운 말 · 원칙 308): `landxi/v3/main/data/national-result.json`
  - 이름: '하천구역 주변 건물' → **'하천 · 계곡 분석 지역 건물'**(XI맵 자산 이름 '하천 · 계곡'과 같음)
  - 설명: '하천구역과 둘레 100m 안 건물' → '하천구역 둘레를 분석한 지역에서 찾은 건물'
  - 쓰임: '하천 무단 점용 실태조사 대상' → '하천 무단 점용을 살필 곳 찾기'
  - 숫자(3,742,702 · 같은 업무 서비스가 덮은 읍면동을 뺀 수)는 XI맵과 같은 장부 그대로. 바깥 주소 PC · 모바일(390px)에서 줄바꿈을 확인했다(의미 단위로 끊김).
- 하천 띠 안만 세는 숫자로 바꾸려면 3,853칸을 결과 파일에서 다시 세고 XI맵 · 기관 화면 셈도 함께 바꿔야 한다. 전국 분석이 도는 중이라 이번에는 하지 않았다(아래 제안 1).
- 비닐하우스 1,698,668동(541㎢ · 동당 약 318㎡): 무작위 40칸에서 셈에 든 23,714동 가운데 23,140동(**97.6%**)이 농지 분석 범위 안이다. 이름('농지 위 비닐하우스 · 온실')과 뜻이 맞다.

## 2. 시험 전용 DB(landxi_test)

| 단계 | 한 일 |
|---|---|
| 디스크 | DB 10GB · 컨테이너 데이터 디스크 남은 909GB · E: 1.3TB → 문제없음 |
| 되살리기 | `server/ops/db_backup.py` 가 만든 최신 백업 `landxi-20261022-0915.dump`(2,543MB) → 같은 컨테이너의 새 데이터베이스 **landxi_test**(6분 39초 · 표 144) |
| 따라잡기 | 백업 뒤 들어온 이력 9개(0115–0123)를 `migrate.py` 로 시험 DB 에만 적용. 시험 DB 표시 표 `lx_test_marker` 추가. 백업 뒤 운영에서 옮긴 영상 경로(116줄) · 시군구 요약 의심 수(3줄)를 운영 값으로 맞춤(운영은 읽기만) |
| 접속값 | `server/.env` 에만 `PG_TEST_DB=landxi_test` · `LX_TEST_API_PORT=8710` · `REDIS_TEST_DB=5`(비밀번호는 기존 접속값 그대로 — 새 비밀값 0) |
| 기본 사용 | `server/tests/conftest.py` → `tests/testdb.py` 가 config 를 읽기 전에 DB 이름 · 게이트웨이 포트 · Redis 번호 · XI ChatGEO 도구 주소 · 대표 잠금 파일을 시험 값으로 바꾼다. `.env` 파일을 바로 읽는 `national.common.env_file` 도 시험 값으로 덮는다 |
| 안전장치 | 운영 DB 이름 · 운영 포트(:8700) · 표시 표 없는 DB 를 가리키면 `[시험 멈춤]` 경고와 함께 pytest 를 멈춘다(`PG_TEST_DB=landxi` · `LX_TEST_API_PORT=8700` 둘 다 멈춤 확인) |
| 시험 게이트웨이 | `python server/tests/testdb_gateway.py` — :8710 · landxi_test · Redis 5번. 작업기 없음 → GPU 0. 재학습 스케줄러 끔 · 대표 잠금 파일 따로. 운영 게이트웨이 · 작업기는 건드리지 않음 |

운영 DB 데이터 · 역할 비밀번호는 바꾸지 않았다(원칙 307). 알아 둘 것:
1. `migrate.py` 가 시험 DB 에 돌 때 클러스터 공용 역할 landxi_tenant 의 비밀번호를 `.env` 의 같은 값으로 다시 넣었다(값 변화 없음).
2. 첫 바퀴에서 `.env` 를 바로 읽는 시험 3파일(test_impl22_national · test_impl28_national_v2 · test_impl38_overseas)이 운영 DB 를 **읽었다**. test_impl28 의 칸 실패 기록은 거래 안에서 되돌렸다 → 운영 변화 0. 지금은 막혔다.
3. 숫자 고침 확인으로 돌린 `server/survey/tests/test_numbers.py`(server/tests 밖 · 운영 :8700 대상)의 읍면동 빈칸 채우기 시험이 운영 DB 에 빈칸 채우기를 한 번 돌렸다. 게이트웨이가 주기적으로 하는 같은 정리다. 그 시험 1건은 실패했다(전국 분석이 새 결과를 넣는 중이라 빈칸 144 > 0).

## 3. 전체 시험 결과(시험 DB · 시험 게이트웨이 :8710)

| 바퀴 | 시험 | 통과 | 실패 | 건너뜀 |
|---|---|---|---|---|
| 첫 바퀴(파일마다 · 고치기 전) | 679 + test_xi_nation(시간 초과) | 629 | 36 | 14 |
| 고친 뒤 한 번에(한 프로세스 · 작업을 기다리는 5파일 제외) | 655 | **639** | **4** | 12 |
| 작업을 기다리는 5파일(파일마다) | test_impl3_imagery 12 · test_impl4_fixes 7 · test_orphan 2 · test_perf_fields 6 · test_xi_nation 7 | 18 | 9 + 시간 초과 1파일 | 2 |

한 프로세스로 끝까지 돌려도 순서 영향(③) 실패는 0이다. 1차의 test_impl40_parcel ↔ test_impl32_hwpx · test_ximap_boot 재현 명령도 모두 통과한다.

### 실패 분류(2차)

| 시험 | 분류 | 원인 | 조치 |
|---|---|---|---|
| test_contract [ops_gpus] · [ops_storage] | ① | 응답 새 키 measure_stale | 계약 선택 키에 넣음. 통과 |
| test_impl41_recheck | ① | _area_compute(ms, t, ttl) | 목을 (ms, t, ttl=None)으로. 통과 |
| test_impl32_hwpx · test_impl40_parcel(순서) | ③ | 파일마다 다른 이벤트 루프인데 asyncpg 묶음을 물려받음 | conftest 파일 단위 고정물이 묶음을 닫고(terminate) 비움. 통과 |
| test_ximap_boot(순서) | ③ | computed_at(미리 센 때)이 다시 세면 바뀜 | 시각 칸으로 봄. 통과 |
| test_summary::test_values_match_source_tables | ① (1차 ②) | 위 1절 | 기대값을 지역 숫자 정본(R + L · 한 번)으로 · 지역 합 시험 추가. 통과 |
| survey/tests/test_numbers(카드 항목) | ① | 위 1절 | 항목 합 = 지역 숫자로. 통과 |
| test_survey_nation::test_new_region_built | ① | 시군구 요약 의심 수 = ⓐ 규칙(대장 대조 포함) | 기대값을 ⓐ 규칙으로. 통과 |
| test_scope_rejected::test_wide_tenant_total_equals_sum | 시험 DB 시점 | 백업 시각에 시군구 요약 3곳이 다시 세기 전 값 | 운영 값으로 맞춤. 통과 |
| test_impl5_gov2::test_stats_numbers_match_summary_and_emd_sum | ① | 서비스 이력 통계가 R1–R6 만 셈(요약은 대장 대조 포함) | gov_history 규칙 범위를 ⓐ로. 통과 |
| test_ext_api::test_formats_three | ① | 필지 엑셀 첫머리 안내 줄 · 끝 합계 줄(원칙 308) | 머리줄 다음 ~ 합계 앞만 봄. 통과 |
| test_impl22_core::test_new_class_flow | ① | 실제로 나누는 중인 세부 '묘지'(운영 값) | '연동 비닐하우스'가 들어 있는지로. 통과 |
| test_impl25_project_nowhat · test_impl35_shared_detail | ① | 10-19 손 라벨 표본(그림 0)이 가장 최근 표본 | 그림 있는 표본을 고름. 통과 |
| test_impl5_project::test_profile_self_edit_and_storage | ① | test@ 에 따로 정한 할당 100GB(운영 값) | 따로 정한 할당이면 그 값 · quota_own True. 통과 |
| test_impl5_project::test_retrain_basis_and_reason_reach_admin | ① | AI 분석 · 결과 확인은 해 보면 좋은 단계(10-09 원칙 203 · projects.OPTIONAL) — '앞 단계 남음' 칩 없음 | 기대값을 없음으로. 통과 |
| test_imagery_nation 7 · test_impl12_mapsvc | 시험 DB 시점 | 백업 뒤 운영에서 영상 파일 경로를 옮김 | 경로를 운영 값으로 맞춤. 통과 |
| test_impl22_national · test_impl28_national_v2 | ③ | `.env` 를 바로 읽어 운영 DB 와 시험 게이트웨이를 견줌 | conftest 가 env_file 을 시험 값으로. 통과 |
| test_quota_usage 3 | ③ | 시험 게이트웨이 첫 기동 직후 기관 면적 첫 계산이 60초를 넘음 | 다시 돌리면 통과(16/16). 운영은 작업 끝에 미리 센다(P1 6절) |
| test_f2b_api::test_cpu_job_progress… · test_f3_server::test_s5_register_imagery · test_impl3_imagery::test_lx_register_ecw… · test_impl4_fixes::test_lx_register_from_files · test_orphan 2 · test_perf_fields 4 · test_xi_nation(시간 초과) · test_f3_server::test_s12_uptime | ② | 시험 환경에 작업기가 없다(작업이 queued 에 머묾 · 작업기 가동 시간 줄 없음). 운영 작업기를 쓰면 GPU · 운영 결과 폴더를 건드리므로 붙이지 않았다 | 목록만. 시험 전용 CPU 작업기를 둘지 결정 필요(작업기의 30일 정리가 운영 결과 폴더를 지울 수 있어 정리를 끈 채로만) |
| test_impl18_gov::test_public_record | 다른 에이전트 몫 | 19 ≠ 20 | 결과만 적음 |
| test_guards · test_impl22_national | 다른 에이전트 몫 | — | 시험 DB 에서 통과 |

### 바꾼 파일(2차)
- 서버: `server/landxi_api/summary.py`(지역 나눔) · `server/landxi_api/gov_history.py`(규칙 범위) · `server/agent/tools/ext/ask.py`(서비스 몫 = 요약) · `server/landxi_api/procs.py`(대표 잠금 파일 경로를 env 로) · `server/landxi_api/main.py`(시험 게이트웨이는 재학습 스케줄러를 켜지 않음)
- 시험: `server/tests/conftest.py` · `testdb.py`(새) · `testdb_gateway.py`(새) · test_summary · test_contract · test_impl41_recheck · test_ximap_boot · test_ext_api · test_impl22_core · test_impl25_project_nowhat · test_impl35_shared_detail · test_impl5_project · test_survey_nation · `server/survey/tests/test_numbers.py`
- 화면 자료: `landxi/v3/main/data/national-result.json`(하천 건물 이름 · 설명)

## 이런 것도 필요하지 않을까요?
1. **하천 건물을 '하천 띠 안'만으로 세기** — 누가: 하천 관리 부서 · 지자체 하천 담당. 왜: '하천 무단 점용'을 살피려면 하천구역과 둘레 100m 안 건물이 핵심인데, 지금 숫자는 그 두 배쯤이다(띠 밖 건물 51% 포함). 칸 마무리 셈을 분석 범위로 자르고 3,853칸을 결과 파일에서 다시 세면 메인 · XI맵 · 기관 화면이 함께 바뀐다(학습 장비 0 · CPU 몇 시간).
2. **시험 전용 CPU 작업기(정리 끔)** — 누가: 개발 · 재검수. 왜: 작업이 끝나기를 기다리는 시험 9건(영상 등록 · 진행 · 고아 작업)이 지금은 확인되지 않는다.
3. **시험 DB 를 매주 백업으로 새로 되살리기** — 누가: 재검수 담당. 왜: 백업 뒤 운영에서 옮긴 파일 경로 · 다시 센 요약 때문에 생기는 '시험 DB 시점' 실패를 줄인다(되살리기 시험이 이미 매주 돌아 같은 덤프를 쓸 수 있다).
