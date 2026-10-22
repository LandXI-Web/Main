# 국토 변화 → 분석 서비스 안으로 (원칙 329 · 10-23) — 계획

근거: 원칙 329 "이미 학습된 토지피복 모델(ap25 …)을 그대로 썼다 … 분석 서비스 안에 있어야 정상" ·
사용자 보충 "분석 서비스에 카드 구현해서 업로드 분석하기 그 결과를 비교 분석하는 개념" · 원칙 320 · 323 · 327.

## 1. 모델 장부 · 승인 — **막힘(보고만 · 만들지 않음)**
- 지금 장부: `change-ap25` 줄은 시스템 스크립트(`server/change/setup.py`)가 바로 '등록됨'으로 넣었고 승인 기록이 없다. 국토 변화 판 2.0 도 `system:change-order-1022` 가 승인자로 적혀 있다.
- 정상 길: 모델은 **프로젝트 학습이 끝날 때만** 장부에 '결과 확인 전'으로 생긴다 → 모델 등록 요청 → 관리자 승인 → 배포 신청(**"이 프로젝트에서 학습한 모델"만**) → 관리자 승인.
- 밖에서 학습한 모델을 장부에 넣는 화면 · API 는 없다(다른 기학습 모델 aerial25 · car_v2_obb 도 시스템 스캔으로 '등록됨'). → 선택지 둘을 보고(아래 RESULT.md).

## 2. 국토 변화 = 분석 서비스 카드 안에서 (바꾸는 곳)
| 자리 | 바꿈 |
|---|---|
| `landxi/v3/lx-analyze/app.js` `changePanel` | ① 대상지: 기존 고르기 · 구역선 파일(+버퍼 m) · 필지(PNU) 목록 올리기(이 카드 안에서 · `POST /change/ranges`) ② 두 시점 A · B 마다 영상 하나: 국토지리정보원 해 · 공유 데이터 · 내 영상 올리기(다른 에이전트의 `kit/uploads.js` `uploadPicker` 그대로 · 새 올리기 칸 안 만듦) ③ 분석 시작 → 지도 서비스(`../lx-map/?change=작업`). 다른 에이전트가 고치는 줄은 건드리지 않음. |
| `server/landxi_api/change.py` | `GET /change/ranges/{id}/imagery` (그 범위를 덮는 공유 영상 + 내 영상 · 해상도 · 해 · 덮는 비율) · `POST /change/runs` 가 시점마다 `{kind:'ngii', year}` · `{kind:'imagery', id}` 를 받음 · 캐시 열쇠에 영상 출처 · **프로젝트 4단계 표시(project_infer) 빼기** — 작업은 분석 서비스 작업(card-change · 같은 작업 장부 · 지도 서비스 '분석 서비스' 묶음) · 목록 기본값에 카드에서 만든 대상지 포함 |
| `server/change/run.py` · `imagery.py` · `adapters/adapter_change_unet.py` | 시점마다 영상 출처: 국토지리정보원 타일(지금 그대로) 또는 등록 영상 파일(같은 격자로 다시 뽑아 읽음) → ap25 두 번 → 비교(지금 그대로) |
| DB `0127`(0125 · 0126 은 이미 있음) | `change_runs.src_key`(캐시 열쇠) · `change_runs.sources`(시점별 출처 이름) · `change_ranges.origin`('project' · 'card'). 백업 먼저 · 시험 DB(:8710) 먼저 |
| `server/agent/tools/ext/change.py` | 같은 `POST /change/runs` 길(지금도 같음) · 답 글의 '프로젝트 추론 단계' · 프로젝트 4단계 링크 빼고 지도 서비스 · 분석 서비스로 |

## 3. 프로젝트 쪽 길 빼기
- `landxi/v3/lx-project/new.js` 진행 경로 고르기('정식 서비스 모델로 바로 분석') 뺌 · `PUT /change/projects/{pid}/path` · `set_path` 뺌.
- `server/landxi_api/projects.py` '건너뜀(정식 모델 사용)' · '학습 불필요' 칸 뺌 · `lx-project/context.js` 이유 한 줄 · `lx-release/app.js` 정식 모델 안내 뺌.
- 지운 줄 0: 이미 있는 대상지 · 결과 · 프로젝트는 그대로 읽힘. 변화 때문에만 생긴 프로젝트는 보고서에 목록으로(지울지는 사용자).

## 검증
바깥 주소 · 로그인 폼 · test@lx.or.kr · 새 범위: 분석 서비스 → 국토 변화 카드 → 대상지 올리기 → 두 시점 → 분석 → 지도 서비스 → 판정 → 보고서 · XI ChatGEO 같은 길. 겹침 검사 0 · 금지어 0 · gate 통과 뒤 커밋.
