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
