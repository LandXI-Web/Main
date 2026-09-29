# core-xi — XI맵 전역 AI 추론: 어느 시군구든 고르면 전역이 차오른다 (코어 ①)

**먼저:** `_common.md` 전체. 이어받는 기록: `docs/superpowers/final/fix/fix-xi-live-report.md`(읍면동 실시간 분석 · 150㎢ 천장 · 800칸 사다리 · 실측).

## 왜
지금 XI맵 실시간 분석은 **남원 읍면동 한 개**까지만 제대로 돈다. 읍면동 경계는 `reference/namwon-emd` 한 층뿐, 후처리 `postprocess.py` 는 `namwon-emd.geojson` 경로와 남원 좌표 범위로 읍면동을 붙인다, 여수 결과 층은 XI맵 목록에 없다, 시군구 전역은 '기록 보기(재생)'만 있다. 사용자 코어: **"전국 어느 시군구든 고르면 AI 가 영상을 빠르게 전역 분석, 결과가 지도에 차오름."**

## 소유 파일
- `server/landxi_api/jobs.py` · `server/landxi_api/regions.py` · `server/landxi_api/events.py`
- `server/workers/scheduler.py` · `server/workers/gpu_worker.py` · `server/workers/tiling.py` · `server/workers/postprocess.py`
- `server/config/sets.yaml` · `server/config/pools.yaml`
- `landxi/v3/xi-clean/**`
- `server/tests/test_live_infer.py` · **신설** `server/tests/test_xi_nation.py` · 마이그레이션 `0008_*`(필요할 때만)

## 할 일
1. **전국 읍면동 경계(계약):** `GET /api/v1/regions/{sgg}/emd` → 그 시군구 읍면동 FeatureCollection(`emd_cd`·`name`). 원천 = V-World `LT_C_ADEMD_INFO`(프록시 키 · `attrFilter` 로 시군구 코드 · 페이지 1000) → `02. 데이터/cache/regions/emd-{sgg}.geojson` 디스크 캐시 90일. 옛/새 시군구 코드(예 46130↔12130) 모두 받는다. 서버 함수 `regions.emd_index(sgg)`(STRtree + 이름·코드)도 공개 — postprocess·core-survey 가 쓴다.
2. **후처리 지역 변수화:** `postprocess.py` 의 남원 경로·좌표 판정을 지우고, 작업의 `sgg_cd`(또는 범위 대표점으로 찾은 시군구)의 `emd_index` 로 `emd`/`emd_cd` 를 붙인다. 남원 결과(기존 작업 재실행 시)의 읍면동 값이 바뀌지 않는지 회귀 시험.
3. **시군구 전역 분석(새 동작):** XI맵에서 시군구를 고른 상태 → `전역 분석`(기존 `분석` 흐름의 범위 선택지 하나로, 새 화면 없음) → `POST /jobs/quote {kind:infer, options:{scope:"sgg", sgg_cd}}` → `POST /jobs`.
   - 서버: 영상은 `catalog.best_imagery(sgg, geom)`(core-imagery 계약) · 범위 = 시군구 ∩ 영상 footprint · 읍면동 단위로 칸을 묶고 **화면 중심에서 가까운 읍면동부터** 처리(첫 결과 ≤ 10초) · 칸 묶음마다 SSE 로 결과 → 화면이 계속 채운다 · 해상도 사다리는 fix-xi-live 방식 재사용(전역은 150㎢ 천장 대신 `scope:"sgg"` 전용 상한 — 시군구 전역 1건을 GPU 한 장으로 끝낼 수 있는 값을 실측으로 정해 보고서에).
   - 진행 중 다른 지역으로 가도 작업은 계속되고, 돌아오면 이어서 보인다(작업 id 는 화면에 노출 금지). 취소 가능.
   - 영상이 없는 시군구 / 일부만 덮는 시군구: 실행 없이 `영상 등록 필요`(K9) + `영상 등록` 행동(lx-ingest), 일부만이면 덮는 곳만 분석하고 나머지는 경계만.
   - 완료 결과는 `results/{tenant}/{job}` 로 저장, `detections` 에 `emd_cd`·`job_id` 채움 → core-survey 가 이 작업 id 로 실태조사를 만든다(계약). 완료 이벤트에 `sgg_cd` 를 싣는다.
4. **XI맵 지역 전환 전국화:** 읍면동 층을 `*-emd` 참조 층 대신 `GET /regions/{sgg}/emd` 로 그 시군구 것만 그린다. 결과 층 목록은 그 시군구에 결과가 있는 모든 세트(여수 해양쓰레기 포함 — `sets.yaml` 에 층이 있는데 목록에서 빠지는 원인 수정). 광주전남 기관 계정이 종로구로 시작하는 문제가 남아 있으면 끝낸다(관할 첫 시군구).
5. `jobs.py` 기존 규칙 유지(영업 세션 `demo:true` 강제, 전력 규칙, 게이트웨이 대기열). 워커는 GPU 한 장, 다른 GPU 고부하면 대기.
6. 소유 범위의 남원 하드코딩 제거(`adapter_yolo_seg` 등 남의 파일은 `요청`).

## 계약
- 제공: `GET /regions/{sgg}/emd` · `regions.emd_index(sgg)` · `POST /jobs {kind:infer, options:{scope:"sgg", sgg_cd}}`(core-flow 가 배포 적용 때 호출) · 완료 이벤트 `job.done{sgg_cd, set}` · `detections(job_id, emd_cd, cls, geom)`.
- 사용: `catalog.best_imagery` · `imagery_src.open_imagery`(core-imagery). 아직 없으면 남원 VRT 로 개발하되 **판정은 여수 등록 뒤에**.

## 완료 조건
- **로그인 폼(lx-staff)** → XI맵 → **여수** 선택 → `전역 분석` → 첫 결과 ≤ 10초, 읍면동 순서대로 결과가 차오르는 녹화(20–40초 구간, GPU 한 장 `nvidia-smi` 로그 동봉) + 전역 완료까지 실측 시간(보고서에만). **남원**에서도 같은 흐름 1회.
- 여수 결과의 읍면동 이름이 여수 읍면동(`GET /regions/{여수}/emd` 와 일치), 남원 기존 결과 읍면동 값 회귀 0.
- 같은 작업이 LX 관리자 화면 작업 목록·GPU 칸에 보인다(id 화면 노출 0).
- 광주전남 담당자(로그인 폼) XI맵 첫 지역 = 관할 시군구, 여수 결과 층(해양쓰레기 + 새 토지피복)이 목록·지도에 보인다.
- 로컬 영상 없는 시군구 1곳: `영상 등록 필요` + `영상 등록` 행동(또는 core-imagery 가 V-World 경로를 열었으면 작은 범위 분석 성공).
- forbidden(lx-staff·gj-manager, 1440·390) 0 · 콘솔 오류 0 · `server/tests` 통과(`test_live_infer` 포함).
