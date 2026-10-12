# 구조 지도 — 구현하는 사람용 (화면 · 사용자 문서에 표 이름 · 경로를 내지 않는다 · 규칙 2 · 6)

> 10-12 서버 DB 를 읽기만 해서 확인(관리자 연결 · 쓰기는 실측용 시험 영상 한 줄과 시험 작업 하나뿐). 설계 23차 `design-r23/core-loop/data-tables.md` 의 새 표 설계는 그대로 유효하고, 여기서는 '지금 실제로 어떻게 이어져 있나'만 적는다.

## 1. 다섯 칸이 실제로 이어지는 곳
| 그림 칸 | 표 · 파일 | 잇는 열 | 10-12 값 |
|---|---|---|---|
| 학습 데이터 | `train_samples`(dir · names · n_images) · 표준 데이터 `02. 데이터/aihub/owned/` | `models.sample_id` → train_samples.id | 5묶음 669장 · 클래스별 아카이브 표 없음 |
| AI 모델(판) | `models`(classes = 모델 머리 순서 · weights_uri · metrics · status) | `models.train_job` → jobs | 등록 18 · 후보 2 · 기록 1. 4분류 모델 `aerial25/best` 가중치 `E:\best.pt`(mask mAP50 0.886 · 체크포인트 기록), 학습 결과 `02. 데이터/models/trained/<job>/weights/best.pt`(756MB) |
| 분석서비스(판) | `cards` · `card_versions`(model_ids 목록 · modules.classes = 찾는 것 · modules.rules) | card_versions.model_ids → models.id | 건축물 · 주차장 · 비닐하우스 2.0 의 model_ids = ['aerial25/best'] · classes 각 1개. 경작·휴경 2.0 = aerial25/best(classes 없음) · 2.1 = 남원 경작/비경작(드론 2cm) |
| 프로젝트 ↔ 서비스 | `projects` · `project_links`(kind = sample · card · card_version) | ref | 프로젝트 4개 모두 1회차 · 경작·휴경 서비스는 프로젝트 없음 |
| XI맵 결과 | `service_results`(card_id · sgg_cd · year · service_version · imagery_id · set_id · replaced_at) → `jobs` → `detections`(cls 글자 · job_id) | set_id = job id | 지금 결과 16줄 · /ximap/board 가 장부 + 서비스 없는 시군구 전역 분석을 합침(ximap.py build_board) · 밀도 = 객체 중심 격자(build_density) |
| 그 자리 고치기 | `result_edits`(cls_before/after 글자 · model_id · card_version · geom_before/after · test) | det_id · set_id | 60줄 모두 test=true |

**클래스가 글자로 흩어진 네 곳**: models.classes · card_versions.modules.classes · detections.cls · train_samples.names (+ result_edits.cls_before/after). 23차 설계의 `classes` · `class_sets` 가 이것을 하나로 묶는다.

## 2. 이번 실측이 만든 것(정리 필요)
- 시험 작업 `job_01M4PZHTEC1KZNVH8Y0462J1JV`(test=true · aerial25/best · 부여군 남면 · 2025) — 결과 `02. 데이터/results/lx/job_01M4PZHTEC1KZNVH8Y0462J1JV{.geojson,.pmtiles,/shards}`. XI맵 board 는 test 작업을 세지 않는다.
- 시험 영상 줄 `exp-r24-ngii-44760380-2025` — 작업이 참조해 지우지 못해 path_internal 만 비움. 임시 tif(스크래치)는 GPU 작업자가 열어 둔 채라 작업자 재기동 뒤 지울 것.
- 실측 스크립트(스크래치 · 저장소 밖): 타일 → 메모리 모자이크 → 임시 tif → 시험 영상 등록 → `/jobs` 제출. 운영 구현에서는 작업자가 칩마다 타일을 직접 부르는 영상 원천(설계 14차 3장)이어야 하며 tif 를 만들지 않는다.

## 3. 전국 결과 자산 구현 때 손볼 곳(제안)
| 무엇 | 지금 | 바꿀 것 |
|---|---|---|
| 영상 원천 | `imagery` 행 = 파일 경로 | 'API 원천' 행(제공자 · 연도 층 · 해상도) + 작업자 칩 단위 타일 부르기(workers/imagery_src.py) |
| 중간 파일 | shards/*.geojson 남음(1㎢ 4.7MB) | 합친 뒤 지움 |
| 낮은 줌 면 조각 | 없음(밀도 격자뿐) | 결과 면을 줌 6~9용으로 미리 단순화한 전국 조각 한 벌(결과가 바뀐 시군구만 다시) |
| 진행 | 없음 | 결과 자산 × 읍면동 상태 장부(분석 예정 · 끝 · 연도) — 진행 막대 숫자의 한 출처 |
| 밤 순서 | 작업 우선순위만 | 시간 창 · 학습과 자리 나눔(결정 4 시안) |
