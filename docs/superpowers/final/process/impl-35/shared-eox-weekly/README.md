# 구현 35 · 공유 데이터 상세 · 남은 비상업 영상(EOX) 모두 교체 · ChatGEO 매주 자동 개선

브리핑 확인: (1) **확인된 것만(10-15 08:07 now 답)** — 공유데이터-탭 '다시'("클릭하면 뭐가 보여야 관리를 할텐데 아무것도 안보여" · 원칙 255) · EOx-남은곳 '바꿈' · ChatGEO-매주 '돌림'. 확인 페이지는 만들지 않음(items.json만). (2) **틀 고정 · 설명 문구 0 · 새 용어 0 · 작은 글자 금지(원칙 231 · 230 · 235 · 257)** — 상세 판은 목록 옆 같은 폭 · 같은 높이(탭 셋 모두 `frame_same: true`), 본문 15px · 보조 13px 이상. (3) **GPU · 서버 규칙** — 영상 판은 CPU만, ChatGEO 평가는 질문 하나씩 차례로 · 분석 작업이 학습 장비를 쓰면 기다림 · 추가 학습 없음. 게이트웨이 재시작 두 번(08:31 · 08:34, 전후 health ok). 워커 · 전국 작업기는 건드리지 않음.

그림: 바깥 주소 https://admin.land-xi.dev(LX 관리자) · https://app.land-xi.dev(LX 직원 · 로그인 전) · https://kgz-agri.land-xi.dev(해외 기관)를 **로그인 폼**으로 연 PC 1440입니다. 파일 이름 끝 네 자리가 찍은 시각(10-15)입니다. 측정 · 오류는 `shots/run.json`에 있습니다.

## 1. 공유 데이터 — 줄을 누르면 관리할 내용이 보이게(공유데이터-상세)

목록 오른쪽에 **상세 판**이 생겼습니다. 판 폭은 420px, 높이는 카드에 맞춰 고정이고 안쪽만 스크롤합니다. 탭을 처음 열면 그 페이지의 첫 줄을 골라 둡니다(빈 판 없음). 줄은 마우스로 누르거나 키보드(Enter)로 고릅니다.

| 탭 | 판 내용 | 관리 단추 |
|---|---|---|
| 영상 | 범위 지도(그 영상 범위 테두리) · 이름 · 지역 · 촬영 연도 · 해상도 · 범위(㎢) · 크기 · 공개 · **쓰인 곳**(분석 n건 · 프로젝트 n개 · 기관 공유 n곳) | 공개/비공개 · 정보 고치기 · 지우기 |
| 학습 데이터 | 그림 넷(라벨 테두리 겹침) · 프로젝트 · 출처 · 날짜 · 장수 · **클래스별 장수** · **쓰인 학습**(n건 · 학습 이름 · 날짜) | 공개/비공개 · (공유 데이터에서 올린 것만) 정보 고치기 · 지우기 |
| 행정 자료 · LX | 지도(올린 도형) · 종류 · 행 수 · 도형(점 · 선 · 면) · 형식 · 날짜 · 공개 · **속성 앞 5줄** | 공개/비공개 · 정보 고치기 · 지우기 |
| 행정 자료 · 기관 대장 | 지도(맞춘 필지 앞 1,500) · 기관 · 종류 · 행 수 · 도형 · 형식 · 날짜 · 속성 앞 5줄(그 기관 파일의 원래 열 이름 · 성명 · 연락처는 원래 저장하지 않음) | 읽기만(지금과 같음) |
| 행정 자료 · 브이월드 | 그 층 지도(이 탭 첫 자료 자리 가운데 · 지역 고정값 0) · 출처 · 범위 | 읽기만 |

- 바뀐 것 하나: 목록 줄 끝에 있던 '정보 고치기 · 지우기'를 상세 판 아래로 옮겼습니다(같은 단추가 두 곳에 있지 않게). 공개 단추는 목록에도 그대로 둡니다.
- 서버(새 길, LX 관리자만 · 직원 403): `GET /shared/imagery/{id}` · `GET /shared/train-data/{id}` · `GET /shared/train-tiles/{id}/preview` · `GET /shared/ledgers/{id}`. 파일 경로 · 작업 id · 좌표는 화면에 나오지 않습니다(범위는 ㎢와 지도로).
- 시험 행정 자료 한 건('시험 행정 자료 35')을 올려 LX 줄을 찍고 바로 지웠습니다(`run.json test_ledger_deleted: true`).

그림: `shared-img` · `shared-img-row2`(다른 줄을 누름) · `shared-train` · `shared-admin-lx` · `shared-admin-org` · `shared-admin-vw`

## 2. 남은 비상업 영상(EOX) 모두 교체(EOx-모두교체)

### 세계 낮은 줌 바탕 — NASA Blue Marble로 새로 구움
- 원천: NASA **Blue Marble Next Generation**(지형 · 해저 지형 포함, 2004년 7월, 500 m) 원본 8장. 주소는 `https://assets.science.nasa.gov/content/dam/science/esd/eo/images/bmng/bmng-topography-bathymetry/july/world.topo.bathy.200407.3x21600x21600.{A1…D2}.jpg`이고, 소개 페이지는 https://visibleearth.nasa.gov/images/73751 입니다.
- 라이선스: NASA 이용 지침(https://www.nasa.gov/nasa-brand-center/images-and-media/)에 따르면 "NASA content … generally are not subject to copyright in the United States"입니다. 미국 정부 저작물이라 상업 이용도 됩니다.
  - 조건 1: NASA 로고 · 휘장을 쓰지 않습니다.
  - 조건 2: NASA가 보증하는 것처럼 보이게 하지 않습니다.
  - 출처 표기 "NASA Blue Marble"을 지도 아래에 둡니다.
  - 주의: 지침에 'public domain'이라는 말이 그대로 있지는 않습니다. 홍보 · 영업 자료에 크게 쓸 때는 NASA 지침 확인을 권합니다.
- 판: `02. 데이터/tiles/world-bm/{z}/{x}/{y}.webp`(z0–8 · 87,381장 · 약 201 MB)와 `meta.json`(원천 · 톤 값)입니다. 원본과 중간 파일은 `02. 데이터/raw/bmng/`에 있습니다(약 2.3 GB · 상한 20 GB). CPU만 썼고 굽는 데 약 5분 걸렸습니다.
- 톤: 땅은 Sentinel-2 해외 판과 이어지게 밝게 했습니다(감마 0.78 · 채도 1.28). 바다는 이전 바탕처럼 짙은 남색으로 눌렀습니다(깊은 바다 18,32,58 · 얕은 대륙붕 46,98,124 · 해저 지형 결은 남김). 굽는 스크립트는 `bake_world.py`입니다.
- 바깥 주소 앞단(Cloudflare)이 지도 조각을 하루 보관합니다. 그래서 조각 주소 끝에 판 번호 `?v=2`를 붙였습니다(`kit/stage.js WORLD_V`). 판을 다시 구우면 이 번호를 올립니다.

### 바꾼 곳(화면이 EOX 주소를 부르던 곳 전부)
| 곳 | 전 | 후 |
|---|---|---|
| `v3/kit/stage.js`(XI맵 · 메인 · 해외 · 기관 지도 무대 공통) `k-eox` · `k-under` | EOX 2020 | `k-world` = 세계 바탕 판(z0–8) + 해외 Sentinel-2 판(그대로). 지도 아래 출처 한 줄: 해외 판이 보이면 Copernicus, 낮은 줌이면 "NASA Blue Marble". 판이 없는 정적 배포에서는 V-World를 세계 전체로 깝니다. |
| `v3/main/main.js` | EOX 2020 경로 미리 받기 | 세계 바탕 판 미리 받기(z≤8) |
| `v3/login/plate.js` · `scenes.json` | EOX 2025 · 출처 "© EOX" | 세계 바탕 + 해외 Sentinel-2 판. 출처는 "NASA · © V-World"와 "Copernicus Sentinel-2 · Esri"입니다. |
| `global/js/ladder-global.js` · `sprawl.js` · `disaster-swipe.js` · `globe-stage.js` · `boot.js`, `global/data/catalog-fixture-global.json` · `i18n-*.json` | EOX 2025 사다리 · 스와이프 밑바탕 | 세계 바탕 + 해외 Sentinel-2 판(`worldSources` · `baseAt`). 사다리 이름은 "Sentinel-2 · NASA Blue Marble"입니다. |
| `server/config/ladder.yaml` · `landxi_api/catalog.py` · `proxy.py` · `pipelines/global/g2_pc_cache.py` | 카탈로그 `eox-s2cloudless-2025/2017` · 타일 사다리 첫 단 EOX | 두 층을 뺐습니다. 타일 사다리 첫 단은 세계 바탕 판(`world`)이고 상류는 없습니다. |
| `xi/engine/sources.js` · `xi/sw.js` · `xi/data/build-fixtures.mjs` | 외부 호스트 목록에 EOX | 뺐습니다 |
| 층 이름 `k-eox` → `k-world`(같은 층을 쓰던 곳) | `v3/global/app.js` · `gov-fusion/app.js` · `kit/cmdk.js` · `lx-review/app.js` · `main/tools/wheel.mjs` | 이름만 바꿨습니다(해외 화면 '영상 층 끄기'는 해외 Sentinel-2 판도 함께 끔) |

- **소쿨룩 비교 스와이프**: 원래도 연도 비교 두 장은 Sentinel-2 L2A 여름 모자이크(2017 · 2025, Planetary Computer)였습니다. EOX는 두 번째 지도의 밑바탕으로만 쓰였고, 이 밑바탕을 그 자리 Sentinel-2 해외 판으로 바꿨습니다. 메이크틸라 재해 스와이프 밑바탕도 같게 바꿨습니다.
- **EOX 요청 수(전 → 후, 화면을 연 동안 브라우저가 부른 수)**:

  | 화면 | 전 | 후 |
  |---|---|---|
  | 로그인 | 40 | 0 |
  | 메인 | 67 | 0 |
  | 세계 지도(v3/global) | 208 | 0 |
  | 해외 첫 화면(kgz-agri 기관) | 165 | 0 |

  후에는 세계 바탕 판과 해외 판에서만 받습니다. 콘솔 오류는 0입니다(`run.json eox · errors`).
- 전 그림은 이번에 고친 화면 파일을 지난 커밋(HEAD) 내용으로 바꿔 끼운 같은 화면입니다(`shoot.mjs asBefore` · 서버 · 파일은 그대로).
- 그림: `login-before/after` · `main-before/after` · `world-before/after` · `overseas-before/after`

### EOX 주소가 아직 글자로 남은 곳(화면이 부르지 않음 — 제외 목록)
- 설명 주석 몇 줄: `global/js/globe-stage.js` · `sprawl.js`(옛 실측 기록) · `pipelines/global/g2_pc_cache.py`.
- 지난 시안 `landxi/proto/`와 `design-canvas/`: 운영 화면이 아닙니다.
- 개발 도구 `tools/film/render.html` · `tools/perf/probe.html`: 영상 · 성능 측정용입니다.
- 계약 시험 자료 `server/fixtures/contract/*`: 대역 서버 · 시험용입니다.
- 시험 `tests/e2e/f1d-license-guard` · `f2d-boot-timing` · `proto-dive`: EOX가 없어야 한다는 검사이거나 지난 시안 시험입니다.
- 문서 · 기록 `docs/`

## 3. XI ChatGEO 매주 자동 개선(ChatGEO-매주)
- 예약 작업은 **`LandXI-ChatGEO-Weekly`**입니다(Windows 예약 작업 · `server/agent/register-weekly.ps1` · 전국 작업기 예약과 같은 방식).
  - 매일 새벽 2시에 깨어나 `server/agent/improve_weekly.py`가 할 일을 정합니다.
  - 한 바퀴 상한은 3시간입니다.
  - 이미 돌고 있으면 새로 띄우지 않습니다.
  - 쉬는 시간(01–06시)이 아니면 그냥 끝납니다.
- 정하는 규칙(LOOP.md 1절 그대로):

  | 조건 | 하는 일 |
  |---|---|
  | **월요일** | 한 바퀴(개선 후보 전부 + 되던 질문 14) |
  | 지난 바퀴 뒤 새로 모인 후보가 **10건 이상** | 그날 새벽으로 한 바퀴를 앞당김 |
  | 같은 질문을 **3명 이상**이 물은 후보 | 그 후보만 **작은 판**(그 질문 + 되던 질문) |
  | 그 밖 | 아무것도 하지 않음(기록 한 줄) |

  - 다음 실행은 2026-10-16 02:00이고 첫 정기 바퀴는 **2026-10-19(월) 02:00**입니다.
- 고치는 것:
  - 서버 제안 가운데 바로 되는 것(다른 이름 · 질문 뜻 연결 · 답 문구)을 고칩니다. 관리자 화면 '이대로 반영'과 같은 길입니다.
  - 한 바퀴 때는 모아 두기도 합니다.
  - 새 도구와 길잡이 모델 추가 학습은 하지 않습니다(사람이 정함).
- 내보내기:
  - 통과 기준(답한 수 증가 · 나빠진 질문 0)을 넘으면 **'승인 대기'까지만** 올립니다. 승인은 LX 관리자가 합니다.
  - 못 넘으면 서버가 승인 요청을 막습니다(실제 사용자에게 적용 0).
  - 그 판은 시스템이 거둡니다. 묶였던 후보는 '새로 옴'으로 돌아가 다음 바퀴에 다시 봅니다.
  - 이를 위해 서버 `improve.py`에 '시스템이 만드는 중인 판을 거둠' 한 줄을 더했습니다.
- 전력:
  - 언어 모델에 질문을 하나씩 차례로 보냅니다(동시 0).
  - 분석 작업이 학습 장비를 30% 넘게 쓰면 기다립니다.
  - 학습 · 추가 학습은 없습니다.
- **시험 실행 1번(08:34 · `--test` · 판 메모 '시험')**
  - 작은 판 하나로 돌렸습니다. 후보는 '기관이 전역 분석 실행을 말함'이고 고친 것은 답 문구입니다.
  - 고치기 전 15문 가운데 답함 13 · 안내함 2였고, 고친 뒤에도 같았습니다. 그 질문은 이미 '안내함'이어서 답한 수가 늘지 않았습니다.
  - 그래서 서버가 승인 요청을 막았고, 시스템이 그 판을 거뒀습니다. 후보는 '새로 옴'으로 돌아갔습니다.
  - 0.8분 걸렸습니다.
  - 기록은 `weekly-test/`에 있습니다(plan · eval-before · eval-after · compare · run · state). 바퀴마다의 원본은 데이터 폴더 `improve/weekly/`에 쌓입니다.
  - 이 시험에서 승인 대기까지 간 판은 없습니다. 지금 '바로 고칠 수 있는' 후보가 이것 하나뿐이고, 이미 답하고 있는 후보입니다.

## 시험 · 검사
- 서버: `test_impl35_shared_detail`(새 시험 4개 — 영상 · 학습 데이터 · 행정 자료 상세, 직원 403 · 성명 열 0 · 원래 열 이름, 타일 사다리 첫 단 world)과 `test_impl31_shared_upload` · `test_impl29_shared_tabs` · `test_impl28_shared_data` · `test_f3_server::test_s11_global_tile_ladder`를 돌려 **15개 모두 통과**했습니다(`pytest.txt`).
- e2e: `impl22-core` · `impl18-ximap` · `impl22-national` **5개 통과**했습니다(`e2e.txt`).
- `tools/check/words.mjs`: 화면 금칙어 0 · 화면 오류 0으로 통과했습니다(`words-check.txt`).
- `tools/check/numbers.mjs`: 통과했습니다(`numbers-check.txt`).

## 남은 것
- 세계 바탕은 500 m라 z9 이상(해외 Sentinel-2 판 밖)에서는 흐립니다. 예전 EOX(10 m · 전 세계)만큼 세계 어디서나 선명한 무료 · 상업 가능 영상은 없습니다. 새 사업 나라가 생기면 그 나라 Sentinel-2 판을 같은 방식(`impl-31/overseas-s2/bake_s2.py`)으로 굽습니다.
- 브이월드 행정 자료는 지도만 보여 줍니다. 속성 줄은 브이월드에 그 자리를 물어야 해서 이번에는 넣지 않았습니다.
- 시험 실행으로 '승인 대기'까지 가는 장면은 아직 없습니다. 첫 정기 바퀴(10-19)나 앞당긴 바퀴에서 나옵니다.

## 이런 것도 필요하지 않을까요?
- **영상 상세에 '이 영상으로 한 분석' 목록 바로가기** — 지우기 전에 관리자가 어디에 쓰였는지 바로 열어 봐야 합니다. 지금은 건수만 있습니다.
- **매주 바퀴 결과 한 줄을 관리자 대시보드 알림에** — 승인할 판이 생긴 날을 관리자가 놓치지 않게 합니다(지금은 개선 후보 화면에 들어가야 보임).
- **기관 대장 상세의 '필지 맞춘 비율'** — 기관이 올린 대장이 지도에 얼마나 놓였는지 보면 기관에 다시 요청할지 정할 수 있습니다.

## 파일
- 공유 데이터:
  - 화면 `landxi/v3/ops-infra/js/shared.js` · `ops-infra/shared.css`
  - 서버 `server/landxi_api/catalog.py`(영상 상세) · `training.py`(학습 데이터 상세 · 고친 칸 그림) · `ledger.py`(행정 자료 상세)
  - 시험 `server/tests/test_impl35_shared_detail.py`
- EOX 교체: `landxi/v3/kit/stage.js` · `v3/main/main.js` · `v3/main/tools/wheel.mjs` · `v3/login/plate.js` · `v3/login/scenes.json` · `v3/global/app.js` · `v3/gov-fusion/app.js` · `v3/kit/cmdk.js` · `v3/lx-review/app.js` · `landxi/global/js/{ladder-global,sprawl,disaster-swipe,globe-stage,boot}.js` · `landxi/global/data/{catalog-fixture-global,i18n-en,i18n-ko}.json` · `landxi/xi/engine/sources.js` · `landxi/xi/sw.js` · `landxi/xi/data/build-fixtures.mjs` · `server/config/ladder.yaml` · `server/landxi_api/proxy.py` · `server/pipelines/global/g2_pc_cache.py` · `server/tests/test_f3_server.py` · `bake_world.py`
- ChatGEO 매주: `server/agent/improve_weekly.py` · `server/agent/register-weekly.ps1` · `server/landxi_api/improve.py`(시스템이 만드는 중인 판을 거둠)
- 증거: `items.json` · `shoot.mjs` · `shots/`(커밋 안 함) · `weekly-test/` · `pytest.txt` · `e2e.txt` · `words-check.*` · `numbers-check.*`
