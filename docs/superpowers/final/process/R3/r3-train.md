# r3-train — LX 생산 원스톱: 데이터 올리기부터 지역 적용까지 (C5·C7)
> 시작 전에 반드시 읽는다: `E:/Land-XI 플랫폼/CLAUDE.md`, `01. 디자인/docs/CORE.md`(C5·C7), `USER-DIRECTIVES.md`, `PROCESS.md`(1절 원스톱 표 'LX 직원'), 이 폴더의 `plan.md`, `final/core/core-flow.md`, `docs/superpowers/specs/2026-09-20-*.md`, 메모리 `landxi-gpu-power.md`·`landxi-local-assets.md`.
> 보고 첫 줄은 "브리핑 확인: (규칙 3개)"로 쓴다. 보고서는 `R3/r3-train-report.md`, 증거는 `shots/process/R3/r3-train/` 에 둔다(에포크 진행 화면 녹화 포함).

## 목표 한 줄
LX 직원이 명령줄 없이 화면만으로 다음을 끝낸다. 학습은 작은 표본으로 실제 GPU 한 장에서 돈다.

데이터 올리기 → 라벨 확인 → 학습 실행 → 모델 등록·성능 확인 → 서비스 만들기 → 다른 지역에 적용

## 지금 상태(평가 요지 — 이 작업의 ① 평가에서 다시 잰다)
- 학습 어댑터 `adapter_train_yolo.py` 는 표본 폴더가 코드에 고정돼 있다(`DATASETS` = 남원 5종). 화면에서 올린 데이터로는 학습할 수 없다.
- 학습 결과는 `models` 에 status `candidate` 로 들어간다. 이것을 결과 확인 → 등록으로 바꾸는 화면 흐름이 끝까지 이어지는지는 확인되지 않았다.
- 서비스(카드) 만들기용 쓰기 경로가 없다(`/registry/cards` 는 GET 과 ledger_schema PUT 뿐).
- 적용은 `/deploys` 가 있다.
- 시작할 때 이 흐름을 로그인부터 직접 해 보고, 끊기는 지점을 `R3/r3-train-assess.md` 에 적는다(①).

## 소유 파일
- `landxi/v3/lx-ingest/*` · `lx-train/*` · `lx-review/*` · `lx-deploy/*` · `lx-console/*`
- `server/adapters/adapter_train_yolo.py`
- `server/workers/gpu_worker.py`(학습 처리·마무리 부분)
- `server/landxi_api/registry.py` · `deploys.py`
- 신규 `server/landxi_api/training.py`(학습 표본 올리기·라벨 미리보기·표본 목록)
- 신규 `server/migrations/0008_training.sql`
- `server/landxi_api/main.py`: 확장 라우터 목록에 `"training"`, `"global_data"` 를 추가하는 한 줄만(plan 3.6)
- 새 테스트 `server/tests/test_r3_train.py`

## 할 일
1. **데이터 올리기**(lx-ingest)
   - 라벨이 있는 학습 표본 묶음(zip: `images/`·`labels/` YOLO 형식, 또는 `dataset.yaml` 포함)을 화면에서 올린다.
   - 서버(`training.py`)가 풀어서 검사한다: 이미지·라벨 짝, 클래스 수, 장 수. 표본 id 를 매겨 DB 에 적는다.
   - 기관·지역·업무 이름을 붙인다.
   - 파일 경로는 화면에 내지 않는다.
2. **라벨 확인**
   - 올린 표본 중 몇 장을 라벨(상자·다각형)을 겹친 그림으로 보인다. 장 수·클래스별 개수도 보인다.
   - 틀린 표본은 빼기 버튼으로 뺀다.
3. **학습 실행**(lx-train)
   - 올린 표본 id 로 `POST /jobs {kind:'train', base_model, samples}` 를 보낸다.
   - 어댑터 `dataset_yaml()` 이 DB 에 적힌 올린 표본을 찾게 한다. 고정 폴더 사전은 기존 표본용으로만 남긴다.
   - 기본값: 200장 이하 · 3 에포크 · batch 4. 전력 임대와 대기열로만 돌고, 다른 GPU 가 고부하면 멈춘다(기존 `_gate`).
   - 화면에 에포크 진행과 검증 값이 차오른다.
4. **모델 등록·성능**(lx-review)
   - 학습이 끝나면 새 모델(candidate)과 성능(학습 끝 검증 mAP50 등, 측정값)을 기존 모델과 나란히 보인다.
   - '등록'을 누르면 status 가 registered 로 바뀌고, 관리자 결재가 필요하면 결재함으로 간다.
   - 모델 이름은 plan 4절 기본값을 따른다.
5. **서비스 만들기**
   - 등록된 모델 + 규칙(기존 규칙 중 선택) + 대장 형식(ledger_schema)으로 서비스 카드를 만든다(`POST /registry/cards` 신설 · registry.py).
   - 카드는 기존 카드 목록·서비스 상세에 보인다.
6. **다른 지역에 적용**(lx-deploy)
   - 만든 서비스를 **서로 다른 시도 두 시군구**에 적용한다(`/deploys` → 관리자 승인 → 단계 배포).
   - 적용한 시군구에서 그 모델로 AI 분석이 걸리는지(대기열 작업 1건 이상) 확인한다.
7. **한 흐름(C7)** — 같은 작업이 LX 직원 대시보드(lx-console), LX 관리자 화면(승인·GPU·대기열)에서 같은 이름·같은 값으로 보인다.
8. 명령줄 단계가 하나라도 남으면 보고서 '원스톱이 끊기는 곳'에 적는다. 끊긴 채로 완료라고 하지 않는다.

## GPU·안전
- 학습은 한 번에 한 건이다(`SHARD_CAP train 1`). vLLM 이 쓰는 GPU 와 동시에 고부하가 되면 학습이 멈춰야 한다(전력 규칙). 실행 동안 GPU 전력 csv 를 기록한다.
- 표본 zip 은 기존 로컬 실자산(예: 남원 비닐하우스 라벨 일부)에서 200장 이하로 만든다. 원본 폴더는 건드리지 않는다. 만든 zip 은 스크래치 폴더에 둔다. 올리기는 화면의 파일 선택으로 한다.
- Ollama·vLLM 종료 금지. `landxi_api/jobs.py`(견적)는 r3-xi 소유이므로 고치지 않는다. 학습 견적은 어댑터의 `dataset_yaml()` 로 판정되게 한다.

## 완료 기준 (측정 가능 · 화면만으로 · 서로 다른 시도 두 곳 이상)
- R4-1: 로그인(LX 직원) → 표본 zip 올리기 → 라벨 겹친 그림 6장 이상과 클래스별 개수가 보인다(값 = 올린 파일의 실제 개수).
- R4-2: 학습 실행 → 대기열 → 에포크 1/3…3/3 이 화면에 차오른다 → 끝. 새 모델 행 1개(DB 대조), 성능 값 = 학습 끝 검증값(DB·화면 같은 값). 두 장이 동시에 100 W 를 넘은 횟수 0(csv).
- R4-3: '등록' → 관리자 승인(로그인 폼으로 관리자 전환) → 모델이 등록 상태가 된다.
- R4-4: 서비스 만들기 → 카드가 서비스 목록에 보인다.
- R4-5: 서로 다른 시도 두 시군구(예: 전북 남원 + 경남 함양)에 적용 → 관리자 승인 → 두 곳 모두 그 모델로 AI 분석 작업 1건 이상이 대기열에 들어가 결과가 나온다.
- R4-6: 위 전 과정에 명령줄·파일 복사 단계 0. 화면 글에 파일 경로·작업 id·GPU 이름 0.
- `test_r3_train.py`(표본 검사·표본 id 해석·카드 만들기 권한) 녹색. 기존 `server/tests` 녹색.
