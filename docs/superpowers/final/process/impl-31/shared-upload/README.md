# 구현 31 · 공유 데이터 — 학습 데이터 · 행정 자료 올리기 · 관리

브리핑 확인: (1) **확인된 것만(10-14 11:02 now 답 · 공유데이터-탭 '다시' · 원칙 246)** — "학습데이터 행정자료는 어떻게 업로드하고 관리하지?". 확인 페이지는 만들지 않음(items.json 만). (2) **새 말 · 새 개념 0(원칙 199 · 235)** — 단추는 '영상 올리기'와 같은 말 틀('학습 데이터 올리기' · '행정 자료 올리기'), 학습 데이터 올리기는 프로젝트 학습데이터 구축과 같은 길, 행정 자료는 기관 대장 올리기와 같은 표 · 같은 형식 판별, 설명 문구 0(원칙 230). (3) **틀 고정(원칙 231)** — 탭을 바꿔도 카드 · 머리 · 탭 · 몸통 · 페이지 · 올리기 단추 자리 · 크기가 같음(`shots/run.json` frame_same true).

그림: 바깥 주소 https://admin.land-xi.dev(LX 관리자) · https://app.land-xi.dev(LX 직원)를 로그인 폼으로 연 PC 1440. 찍은 시각은 파일 이름 끝(HHMM · 10-14). 측정 · 오류는 `shots/run.json` — 콘솔 오류 0.

## 탭별 올리기 · 관리
| 탭 | 올리기 | 관리 |
|---|---|---|
| 영상 | 영상 올리기(그대로) | 그대로 |
| 학습 데이터 | **학습 데이터 올리기** — 이름 + 묶음(zip · 그림 200장 이하: images/ 그림 · labels/ YOLO txt · dataset.yaml 또는 classes.txt). 프로젝트 학습데이터 구축과 같은 나눠 올리기(`kit/sample-upload.js` 로 한 곳에 모음). 프로젝트 없이 올라가 = 공유 학습 데이터 · 처음은 비공개 | 공유 학습 데이터(프로젝트 '—'): 공개/비공개 · 정보 고치기(이름 · 클래스 — 클래스 목록 `GET /classes` 에서 고름 · 목록에 없는 이름 400 · 고치면 학습 목록 · 개수 · 클래스 잇기를 다시 만듦) · 지우기(확인 한 번 · 학습에 쓴 묶음은 409 '학습에 쓴 학습 데이터라 지울 수 없습니다'). 프로젝트 학습 데이터: 보기 · 공개/비공개만(고치기 · 지우기 403) |
| 행정 자료 | **행정 자료 올리기** — 이름 · 종류(기존 대장 종류 다섯) · 파일(SHP zip · GPKG · GeoJSON · CSV · XLSX, 20MB). 기관 대장 올리기와 같은 판별(`read_table` · `read_gdf`) · 성명 · 연락처 열은 버림. CSV 는 경도 · 위도 열이면 그 점, 주소 열만 있으면 브이월드 주소 찾기(300행까지) | 'LX' 칸: 공개/비공개(공개 = 직원 지도 서비스 '행정 자료' 줄에 층으로) · 정보 고치기(이름 · 종류) · 지우기(확인 한 번). '기관 대장' · '브이월드'는 읽기만(기관 줄 고치기 · 지우기 403) |

- 직원 쪽: 학습 = 학습 화면 학습 데이터 블록 '공유 데이터에서 고르기'(지금 길 그대로) · 비공개인 공유 학습 데이터는 학습데이터 구축의 '이전에 올린 학습 데이터' 목록에서도 빠짐. 행정 자료 = 지도 서비스 왼쪽 아래 '바탕' 줄 밑 '행정 자료' 줄(공개된 것이 있을 때만) — 누르면 층이 켜지고 그 범위로 감 · 범례에 이름.
- 서버: `POST /shared/ledgers` · `PATCH|DELETE /shared/ledgers/{id}` · `GET /shared/layers` · `GET /shared/layers/{id}`(직원은 공개된 것만) · `PATCH /training/samples/{id} {name, names, shared}` · `DELETE /training/samples/{id}`. 행정 자료 줄 = `ledger_imports`(tenant_id 'lx') · 도형 = 데이터 폴더 `shared/ledger/{id}.geojson`.
- 마이그레이션 `0090_shared_ledger.sql`(ledger_imports.name · staff_shared · 되돌리기 `down/0090_…`).

## 시험 흐름(바깥 주소 · 11:41–11:42 · 두 번 돌림 — 같은 결과)
| 단계 | 학습 데이터('시험 학습 데이터 31' · 4장) | 행정 자료('시험 행정 자료 31' · GeoJSON 3행) |
|---|---|---|
| 올림 | 목록 맨 위 · 비공개 | LX 칸 · 공유재산 · 3행 · 비공개 |
| 공개 → 직원 | 학습 화면 '공유 데이터에서 고르기'에 보임 | 지도 서비스 '행정 자료'에 보임 · 켜면 도형 3개 그려짐 |
| 정보 고치기 | 클래스 건물 → 비닐하우스(목록에서 고름) | 이름 · 종류 창 |
| 비공개 → 직원 | 고르기 · 이어 쓰기 목록 모두에서 없음 | '행정 자료' 줄 없음 |
| 지우기 | 목록에서 빠짐 · 폴더도 지움 | 목록에서 빠짐 · 도형 파일도 지움 |
시험 자료(묶음 2 · 행정 자료 3 — 서버 시험 포함)는 모두 지웠습니다(DB · 파일 0 확인).

## 시험 · 검사
- 서버: `test_impl31_shared_upload`(새 — 학습 올리기 · 비공개면 직원 목록 0 · 공개 · 클래스 고치기(목록 밖 400) · 학습에 쓴 묶음 409 · 지우기 · 프로젝트 학습 데이터 403 · 행정 자료 GeoJSON · CSV 올리기 · 성명 · 연락처 버림 · 공개/비공개 층 · 기관 대장 403) 3 통과 · `test_impl29_shared_tabs`(행정 자료 줄 모양 바뀜에 맞춰 고침) · `test_impl28_shared_data` · `test_impl22_core` · `test_impl27_data_project` · `test_r3_train` · `test_impl21_train_board` · `test_release` · `test_r3_fusion` 통과.
- e2e: `impl22-core`(공유 데이터 — 탭마다 그 탭의 올리기 단추 · 같은 자리 · 크기 · 행정 자료 칸 LX · 기관 대장 · 브이월드) · `impl21-train-board` · `impl14b-mapsvc` · `impl12-mapsvc` · `impl2-project` 통과(impl14b · impl12 · impl2-project 는 첫 회 바깥 지도 조각 404 · 시간 초과로 한 번 실패 → 다시 돌려 통과).
- `tools/check/words.mjs` 통과(`words-check-2.txt` · 첫 회 `words-check.txt` 는 기관 필지 목록 화면 502 한 줄 — 지난 구현 27 ~ 29 와 같은 곳 · 이번 변경 밖) · `tools/check/numbers.mjs` 통과(`numbers-check.txt`).
- 게이트웨이 재시작 한 번(11:14 · 0090 적용 · 실패 0) 전후 health ok.

## 남은 것
- 학습 데이터 형식은 지금 프로젝트 학습데이터 구축이 받는 것 그대로 — YOLO(그림 · labels txt · dataset.yaml)만입니다. COCO json · SHP+영상 라벨은 지금 받는 길이 없어 넣지 않았습니다(새 형식은 따로 정해야 함).
- 프로젝트 없이 예전에 올린 묶음(곤포사일리지 100장)도 '공유 학습 데이터'로 보여 고치기 · 지우기가 붙습니다.
- 행정 자료 층은 지도 서비스(직원)에만 붙였습니다. 분석하기 화면에는 지금 브이월드 층을 고르는 자리가 없어 붙이지 않았습니다.
- 행정 자료 '행 수'는 파일 행 수, 지도에 놓인 행은 서버 응답 `located` 로만(화면에 따로 숫자 없음).

## 파일
- 서버: `server/landxi_api/training.py`(PATCH 이름 · 클래스 · 공개 · DELETE · 직원 목록 거름) · `ledger.py`(read_gdf 나눔 · 행정 자료 올리기 · 고치기 · 지우기 · 층) · `migrations/0090_shared_ledger.sql` · `down/0090_…`
- 화면: `landxi/v3/ops-infra/js/shared.js` · `ops-infra/shared.css` · `landxi/v3/kit/sample-upload.js`(새 — 묶음 올리기 한 곳) · `landxi/v3/lx-train/flow.js`(그것을 씀) · `landxi/v3/lx-map/app.js` · `lx-map/map.css`
- 시험 · 검사: `server/tests/test_impl31_shared_upload.py` · `server/tests/test_impl29_shared_tabs.py` · `tests/e2e/impl22-core.spec.mjs`
- 증거: `shots/*.png` · `shots/run.json` · `items.json` · `shoot.mjs` · `words-check*.txt` · `numbers-check.txt`
