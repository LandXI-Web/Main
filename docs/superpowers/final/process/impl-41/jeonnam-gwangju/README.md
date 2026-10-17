# 이름 바로잡기 — '전남광주특별시' (10-17 사용자 · 원칙 268)

사용자 원문: "실제 전남광주특별시다." — '광주전남특별시'로 잘못 적혀 있던 곳을 모두 실제 이름으로 바꿨습니다.
줄임 '광주전남' → '전남광주', 영문 'Gwangju-Jeonnam'(표시 이름) → 'Jeonnam-Gwangju'. 기관 id · 주소(`gwangju-jeonnam`) 등 내부 값은 그대로입니다.

## 바꾼 곳
| 곳 | 바꾼 양 |
|---|---|
| 화면 · 자료 파일(landxi/) | 약 100개 파일 (기관 이름 · 로그인 · 배포 · XI맵 · 포털 · 지난 확인 페이지) |
| 서버(server/) | 지역 표 · 지역 이름 매핑(regions.py) · 설정 · 시험 · 씨앗 파일 · 보고서 문구 |
| 시험(tests/) · 도구(tools/) | 기대값을 새 이름으로 |
| 문서(docs/ · design/) | 약 300개 문서 (원칙 268 · 확인 대장의 사용자 원문 두 곳은 기록이라 그대로) |
| 금칙어 | `tools/check/words.mjs` 에 '광주전남특별시' 추가 |
| 새 마이그레이션 | `server/migrations/0105_jeonnam_gwangju_name.sql` (몇 번 돌려도 같음 · 새 DB 용) |

## 데이터베이스 (한 트랜잭션 · `rename_db.py --apply` · 행 수는 `db-rows.json`)
| 표 · 칸 | 바뀐 행 |
|---|---|
| tenants.name (기관 이름) | 1 |
| tenant_users.name | 2 |
| deploys.name / region_name | 2 / 2 |
| jobs.label | 3 |
| feedback.note | 1 |
| tenant_brand.short / intro | 1 / 1 |
| approvals.payload · analysis_requests.meta | 1 · 1 |
| agent_runs.answer_md · agent_tool_calls.args · agent_confirms.args | 112 · 3 · 41 |
| survey_emd.top5 · survey_sgg.sido | 26 · 4 |
| survey_findings.addr · survey_parcels.addr | 35,933 · 748,041 |
| national_cells_river_old.sido · national_cells.sido (전국 작업기 장부 — 이름 칸만, 진행 칸은 그대로) | 623 · 1,246 |
| **합계** | **786,044행** |

바꾸지 않은 것(기록 보존): audit_log(before 59 · after 146행), agent_runs.prompt_text(사용자가 쓴 질문 70행).
바꾸기 전에 '전남광주'(통합 제외)가 이미 든 행은 0건이었으므로 `revert.sql` 로 정확히 되돌아갑니다(되돌린 뒤 regions.py 등 코드도 옛 이름으로 돌려야 맞음).

## 검증
- 게이트웨이 재시작(전후 health 200 · 워커 · 전국/해외 작업기는 건드리지 않음) → 관리자 기관 목록 '전남광주특별시', 전남광주 기관 첫 화면 '전남광주특별시 …' 확인.
- `node tools/check/all.mjs`: `check/` (기관 · 해외) · `check-app-admin/` (LX 직원 · 관리자).
- 서버 시험: ops · tests · agent 묶음 통과(기존에 있던 GPU 문구 4건 · 필지 수 변동 6건 실패는 이름과 무관).
