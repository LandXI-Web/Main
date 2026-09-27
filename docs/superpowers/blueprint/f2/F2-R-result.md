# F2-R 결과: 레일 정본화 · 기존 셸 편입

- 작성 2026-09-27 · 구현 Opus 5.5 · 브리프 `f2/F2-R.md` · 계약 v1.1-29 · v1.1-6
- git 명령 0회(commit · reset · stash · checkout · restore 모두 쓰지 않음). 되돌림은 수동 편집으로만 했습니다.
- 소유 밖 파일 수정 0. `landxi/proto/ximap.html`, `map*.js`(map-stats · map-report 제외), `landxi/xi/**`, `landxi/ops/**`, `landxi/global/**`는 건드리지 않았습니다.
- 판정 영상(판정 1차 반영 재녹화): `shots/f2/R/f2r.mp4` **44.8 s** · 1440×900. 로딩 대기 두 구간만 4배속으로 줄였고 잘라낸 곳은 없습니다(구간은 `marks.json` `edit`). 실시간 원본은 `f2r-full.mp4`(56.6 s)이고 수치 판정은 이 원본과 `marks.json`으로 합니다. 프레임 스트립은 `strips/*-100ms.png` 9장, 스틸은 `stills/` 12장입니다. 같은 파일을 `shots/f2/F2-R/`에도 복사해 두었습니다.
- 콘솔 오류: 4xx/5xx 네트워크 줄을 **빼고** 0입니다. 빼지 않으면 XI맵을 열 때마다 `GET :8700/api/v1/agent/models 401`이 콘솔 오류로 1줄씩 남습니다. 이 요청은 XI맵 에이전트 층이 보내는 것으로 **소유는 F2-E/F2-A**입니다(아래 §9).

## 1. 바뀐 것

| 영역 | 내용 | 파일 |
|---|---|---|
| 레일 정본 | '지도 서비스'가 새 XI맵 `../xi/index.html`을 가리킵니다. 관리자 레일에 관제 항목 4개를 추가했습니다(운영 현황 · 인프라 관제 · 기관·할당 · 배포 제어 → `:8702/landxi/ops/login.html?next=…`). 외부 origin 항목은 base를 붙이지 않고 같은 탭에서 열립니다. `target`과 `rel`은 두지 않았고, 아이콘은 기존 세트만 씁니다. | `proto/shell.js` NAV · item() |
| 역할 | 관리자 menus가 **10개**입니다(판정 1차 반영: `home` = admin-home 복원 · §9). 영업 home은 `../xi/index.html`입니다. `mapLine` 문구, `XI_MAP`, `OPS_ORIGIN`(지금 호스트:8702), `opsUrl()`, `EXTERNAL_MENUS`, `SCREEN_DEEP`, `screenOpen()`을 추가했습니다. SCREEN_MENU에는 `'../xi/index.html': 'map'`을 넣었습니다. | `assets/data/roles.js` |
| 관문 | shell-gate.js 미러를 같게 맞췄습니다(MENUS · HOME · DEEP). `ai-card.html?card=`는 project 메뉴로도 열리는데, 카드 계보 열람 전용입니다. `?card` 없이 열면 여전히 관리자만 들어갑니다. | `proto/shell-gate.js` · `shell.js gate()` |
| 로그인 | `safeNext` 화이트리스트에 `../xi/(index.html)?…`와 `../global/(index.html)?…` 두 줄을 더했습니다. 경로는 고정이고 쿼리만 자유입니다. `../secret.html`, `../xi/../../x`, `../xi//evil`, `#`, `\`는 모두 거릅니다. 캡션에 '지도 서비스 = XI맵 실시간 분석' 줄(`#lgCapMap`)을 넣었습니다. 문패 `landxi/login.html`이 이제 `?next`/`?logout`을 그대로 넘깁니다. 전에는 meta refresh가 쿼리를 버렸습니다. | `proto/login.js` · `proto/login.html` · `landxi/login.html` |
| embed=1 | `html[data-embed=1]`(각 화면 `<head>`에서 설정)일 때 `mountShell`은 `mountEmbed`로 갈라집니다. 레일 · 마스트 · 공지 · 푸터 · 쪽 제목은 그리지 않고, 관문은 그대로 돕니다. 지도 판과 설정 판은 감추고 본문(서랍)을 100% 폭으로 띄웁니다. 안쪽 닫기와 취소 버튼은 그리지 않습니다. 그린 뒤 `postMessage({type:'lx:embed:ready', view, height, period})`를 보냅니다. `?period=YYYY` 칩을 받고, 그 해 결과가 아니면 이유를 문장으로 보여 줍니다. `lx:embed:period` 메시지도 받습니다. `?emd=`는 첫 거르개로 받습니다. | `stats-standard.html` · `report-standard(-issue).html` · `map-stats.js` · `map-report.js` · `shell.js` |
| 생산 딥링크 | `ai-card.html?card=&version=`으로 열면 카드 버전 · 배포 계보 판이 뜹니다. 버전 행(지금 운영 · 직전 운영 · 스냅숏) 중 해당 버전을 강조하고, 계보 7마디를 보여 주고, 왕복 칩(`관제 배포 제어 ↗`, `XI맵에서 보기 ↗`, `생산 공정 ↗`는 관리자만)을 둡니다. 구성 모델 카드도 강조합니다. 출처는 `xi/data/deploys-fixture.json`입니다. 직원은 열람만 할 수 있어 발행 · 편집 · 생산 칩이 없습니다. `produce.html?deploy=`로 열면 탭 기본값이 능동 운영이 되고, 그 배포본 행을 강조하고, 머리 띠(카드 ↗ · 관제 ↗ · XI맵 ↗)를 띄웁니다. 탭을 옮겨도 `?deploy`가 유지됩니다. 없는 카드 · 버전 · 배포본은 지어내지 않고 없다고 표시합니다. | `publish-cards.js` · `produce.js` |
| 기관 포털 | 영농관리(실태조사 카드 `card-farm → farmland`)의 '지도' 탭은 `../xi/index.html?mode=survey&svc=dp-nw-farm-25&survey=farmland&embed=1` iframe을 띄웁니다. 이 보기에서는 iframe이 **본문 전폭(1254 px @1440) · 높이 ≥ 720 px**로 서고, 필지 표는 지도 아래로 내려가며 판이 스크롤합니다(판정 1차: 720×560에서 XI맵 HUD가 겹침). 기존 결과 지도는 '결과 지도' 단추로 남겼습니다(삭제 0). 그 보기는 원래의 두 칸 한 화면 배치 그대로입니다. 필지 표에서 줄을 누르면 결과 지도로 넘어가 그 필지로 이동합니다. '분석 결과' 탭 머리에 `의심 큐 ↗`(`…&queue=1`)를 넣었습니다. 누르면 XI맵이 실태조사 모드로 서고 의심 큐 서랍이 열립니다. 기관 문 `?next=../xi/…`를 허용합니다. 기관 레일의 `Global ↗`은 scope global(`kgz-*`) 기관에서만 보입니다. | `portal-ui.js` · `portal-login.js` · `shell.js tenantRail` |

## 2. 레일 표(계정 × 항목 × href) — e2e `f2r-rail` 단언값

| 계정 | 수 | 항목 → href |
|---|---|---|
| LX 직원 | 7 | 대시보드 `dashboard.html` · 데이터 관리 `dataset.html` · 프로젝트 `ai-project.html` · 분석 서비스 `analysis-ai.html` · **지도 서비스 `../xi/index.html`** · 서비스 지원 `notice.html` · MY `mypage.html` |
| 영업 | 4 (첫 화면 = 새 XI맵 `영업 · 시연`) | 분석 서비스 `analysis-ai.html` · **지도 서비스 `../xi/index.html`** · 활용 사례 `usecase.html` · MY `mypage.html` |
| LX 관리자 | **10** (운영 현황 + 관제 4 + 5) | **운영 현황 `admin-home.html`**(이 origin · 결재 대기 2·1·6 + 관리 4축 · admin-home에서 `aria-current=page`) · **관제 현황 `http://localhost:8702/landxi/ops/login.html?next=index.html`**(title `LX/OPS 운영 현황`) · **인프라 관제 `…?next=infra.html`** · **기관·할당 `…?next=tenants.html`** · **배포 제어 `…?next=deploys.html`** · 데이터 관리 `dataset.html` · 카드 발행 관리 `admin-publish.html` · 생산 관리 `produce.html` · 서비스 관리 `admin-notice.html` · MY `mypage.html` |
| 기관(남원) | 1 + 로그아웃 | 내 서비스 `portal.html` |
| 기관(해외 · scope global) | 2 + 로그아웃 | 내 서비스 · `Global ↗ ../global/index.html?locale=en` — **현재 노출 0(테스트 주입만)**. `portal.js` TENANTS에 kgz 기관 줄이 없어서 제품에서 이 항목이 보이는 곳이 없습니다. F2-D에 kgz 기관 한 줄 추가를 정식 요청했습니다(§6). 영상 36 s 장면도 같은 주입이며, 화면에 '테스트 주입' 띠를 띄웠습니다. |

관리자 레일이 10인 이유: 설계서 §2.2 ③의 8개에 **생산 관리**와 **운영 현황(admin-home)**을 더했습니다. 원본 기능 삭제 0 원칙 때문입니다. 생산 공정, 재학습, 검수는 관제로 옮겨지지 않았고, 결재 대기(카드 발행 2 · 가입 1 · 문의 6)는 이 origin의 admin-home에만 있습니다. 1차에서는 'ops'를 관제로 돌리면서 admin-home으로 가는 링크가 어느 화면에도 남지 않았습니다(판정 1차 지적). 관제 쪽 이름은 '관제 현황'으로 갈랐습니다. 'LX/OPS 운영 현황'은 레일 폭 72px에서 두 줄로 넘쳐 아래 아이콘을 덮었기 때문입니다(1440 실측). 전체 이름은 title로 남겼습니다.

## 3. 딥링크 규약 표(v1.1-29 · 화면 × 인자)

| 화면 | 인자 | 동작 | 누가 보냄 |
|---|---|---|---|
| `proto/ai-card.html` | `?card=<card-id>&version=vX.Y` | 카드 열림 · 버전 행 강조 · 계보 7마디 · 왕복 칩. 검색해도 주소에 남습니다. | 관제 배포 행 '카드 ↗'(F2-C) · XI맵 계보 칩 '카드 ↗'(F2-A) · `produce.html` 머리 띠 |
| `proto/produce.html` | `?deploy=<dp-id>` (`&tab=`) | 능동 운영 탭 · 그 행 강조 · 머리 띠(카드 · 관제 · XI맵) | 카드 계보 칩 `생산 공정 ↗` |
| `proto/stats-standard.html` · `report-standard(-issue).html` | `?embed=1&period=YYYY&emd=<읍면동>` | 크롬 0 · `lx:embed:ready` · 기간 칩 · `lx:embed:period` 수신 | XI맵 서랍(F2-A) · 기관 포털 |
| `proto/login.html` · `landxi/login.html` | `?next=../xi/…` · `../global/…` | 화이트리스트를 통과하면 로그인 뒤 그 주소로 갑니다. | 누구나 |
| `proto/portal-login-*.html` | `?next=../xi/…` | 기관 로그인 뒤 XI맵 실태조사로 갑니다. | XI맵 · 포털 |
| `:8702/landxi/ops/login.html` | `?next=index\|infra\|tenants\|deploys.html(?deploy=)` | 관제 로그인 뒤 그 화면으로 갑니다. F2-C 구현을 실측했는데 `deploys.html?d=dp-nw-farm-25`에 도착합니다. | 관리자 레일 · 카드 계보 칩 · produce 띠 |
| `landxi/xi/index.html` | `?svc=` · `?mode=survey&svc=&survey=&embed=1` · `?mode=survey&svc=&survey=&queue=1` | F2-A 소관입니다. `svc` · `embed` · `mode=survey`(실태조사 복원) · `queue=1`(의심 큐 서랍 `#fdrawer` 열림)을 실측했습니다. `queue=1`은 XI맵 `survey-mode.js`의 restore/urlState 규약입니다. 1차의 `&drawer=findings`는 XI맵 일반 서랍 키여서 큐가 서지 않았습니다(판정 1차 '죽은 버튼'). | 레일 · 카드 칩 · 포털 지도 · 결과 탭 |

## 4. 세션 인계(실측)
- 같은 origin(:4173)에서는 XI맵 `session.shadow()`가 `lx_logged_in`/`lx_role`/`lx_tenant_session`을 그대로 읽습니다. 결과는 직원 → `staff`, 영업 → `sales`(마스트 `영업 · 시연`), 남원 기관 → `agency`(iframe 안에서도 같음) · `tenant_id namwon`입니다. `proto-session.spec` '세션 인계' 3건과 `f2r-*`로 단언했습니다.
- 관제(:8702)는 origin이 달라 세션이 건너가지 않습니다. 그래서 레일은 관제 로그인 문의 `?next=`로 보내고, 관제에서 한 번 더 로그인합니다. **4173에서 8702로 자동 인계하는 것은 2차 과제입니다(정직 표기).** 로그인 문구 `mapLine`(관리자)과 카드 칩 주석에도 적어 두었습니다.

## 5. 테스트(판정 1차 반영 후 · 2026-09-27)

| 묶음 | 결과 |
|---|---|
| 신설 f2r-rail · f2r-embed · f2r-deeplink-card · f2r-portal-survey | 판정 1차 단언 추가(관리자 홈 고립 0 · 임베드 전폭 + HUD 교차 0 · 큐 도착 `#fdrawer`). **전부 통과, skip 1**(denied 토스트 · F2-A 대기) |
| 개정 proto-shell · proto-login · proto-session · shell · proto-map · proto-publish · proto-portal | 관리자 레일 10 · '관제 현황' · 포털 한 화면 규칙에 XI 임베드 판 예외 1 + 결과 지도 보기 6해상도 재측정. **자기 spec 전체 311건: 309 통과 · 1 skip · 1 실패**. 실패 1건은 `proto-map:212` keep-all로 map.css p0926 영역이며 손대지 않았습니다. |
| 전체 순차 1회 `npx playwright test --workers=2`(926건 · 27.1분) | **872 통과 · 10 실패 · 44 건너뜀** — 아래 소유자 표 |

| 건수 | 스펙 | 소유 |
|---|---|---|
| 4 | `f1d-descent-tiles` · `f1d-i18n-fonts` · `f1d-motion-law` · `f1d-ysykata-ndvi` | `landxi/global/**` — **F2-D** (F2-R 수정 0) |
| 2 | `f2d-boot-timing` · `f2d-stills` | **F2-D** |
| 1 | `f2c-gpu-ma`(폴러 util_ma5 vs nvidia-smi ±3%p) | **F2-C**(녹화 · 다른 스펙과 같은 시간대 GPU 사용률 변동 · F2-R 수정 0) |
| 1 | `proto-map:212` keep-all | p0926(map.css) |
| 1 | `proto-dataset:118` | **F2-R 변경 때문에 난 실패** · 소유 밖(통합자). 기대값 → `['home','ops','infra','tenants','deploys','media','publish','produce','admin','my']` |
| 1 | `proto-dashboard:120` | **F2-R 변경 때문에 난 실패** · 소유 밖(통합자). `['map','ximap.html']` → `['map','/landxi/xi/index.html']` |

## 6. F2-A · F2-C · F2-D에 준 URL · 요청
- **F2-A(XI맵)**
  - 레일 진입 `../xi/index.html`(직원 · 영업). 영업 관문 bounce는 `../xi/index.html?denied=<file>`로 옵니다. **요청: `denied` 한 줄 토스트** — 문구는 '영업 계정은 대시보드를 볼 수 없어 XI맵으로 왔습니다'(파일 → 메뉴 이름). 지금은 안내가 0입니다. `f2r-rail` '영업 → 막힌 화면' 테스트에 단언을 넣어 두었습니다. XI맵 `xi.js`에 `denied` 처리가 들어오면 `test.fixme`가 자동으로 풀리고 단언이 켜집니다. 지금 상태는 skip 1입니다.
  - `?embed=1` 구현을 마쳤습니다. `drawer-stats.js`의 `EMBED_CSS` 주입을 지워도 크롬 0입니다(`f2r-embed` 주입 0 host로 검증). 주입 제거를 요청합니다. 2026-09-27 03:4x 기준으로 아직 남아 있습니다.
  - 계보 칩 '카드 ↗'는 `../proto/ai-card.html?card=<card_id>&version=<v>`입니다. XI맵에는 아직 없습니다.
  - 기관 포털 지도 탭은 `?mode=survey&svc=dp-nw-farm-25&survey=farmland&embed=1`이고, 결과 탭 큐는 **`…&queue=1`**입니다(XI맵 survey-mode 규약. `drawer=findings`에서 바꿨습니다).
  - 임베드 HUD: F2-R이 iframe을 1254×718 이상으로 키워 겹침을 없앴습니다(`f2r-portal-survey` HUD 교차 실측 0). 더 작은 임베드(≤ 800 px)에서는 여전히 겹칠 수 있습니다. 그런 곳에 쓸 경우를 위해 `embed=1` 압축 배치를 권합니다(필수는 아님).
  - 성능 관찰: 포털 iframe XI맵이 ready에서 실태조사 복원까지 8.7 s, 큐 링크 도착 뒤 ready에서 큐 첫 줄까지 9.0 s 걸렸습니다(`marks.json` 실시간). 판정본에서는 이 두 구간만 4배속입니다.
  - 큐 머리 '의심 큐 20,872'와 HUD '20,852 필지'는 단위(건 · 필지)가 다릅니다. 같은 화면에 나란히 서므로 단위 표기를 요청합니다.
  - XI맵 로드마다 `GET :8700/api/v1/agent/models 401`이 콘솔 오류로 남습니다(에이전트 층 · **F2-E/F2-A**).
- **F2-C(관제)**
  - 배포 행 '카드 ↗'는 `http://localhost:4173/landxi/proto/ai-card.html?card=<card_id>&version=<v>`이고, 생산은 `…/proto/produce.html?deploy=<id>`입니다.
  - 관제 로그인 `?next=` 화이트리스트(`index · infra · tenants · deploys.html?deploy=`)를 실측했습니다(동작함).
  - **요청(판정 1차): `landxi/ops/login.html`의 `<form>`에 `method=post` + `onsubmit="return false"` 폴백을 넣거나, 모듈이 준비될 때까지 `#go`를 disabled로 두기.** 지금은 모듈 바인딩 전(`data-lx=ready` 전)에 제출하면 GET으로 `login=…&password=…`가 주소창과 히스토리에 남습니다. F2-R 레일은 매번 이 문으로 보냅니다. F2-R 녹화는 `data-lx=ready`를 기다린 뒤 제출하고, 도착 URL에 비밀번호가 없음을 기록합니다(`marks.json` `pwInUrl:false`). 관제 파일이 F2-R 소유 밖이라 폼 자체는 고치지 못했습니다.
  - **확인 요청: 인프라 관제 GPU0 메모리.** 03:34 스틸에서 링은 GPU0 14,843 MiB · GPU1 44,225 MiB였습니다. 같은 무렵 `nvidia-smi --query-gpu=memory.used`는 두 장 모두 **44,206 MiB로 같은 값**을 냈습니다(WDDM 집계 값이 장별로 갈리지 않는 것으로 보입니다). 프로세스별 `used_memory`는 전부 `[N/A]`였습니다. '마지막 수신' 시각은 03:34:30 → 03:34:31로 흐르고 있어 poller는 살아 있습니다. 화면 값이 어느 원천(장별 query · 프로세스 합 · WDDM)인지 화면에 한 줄로 밝혀 주기를 요청합니다. F2-R은 판정하지 않았습니다.
- **F2-D(Global)**
  - 기관 레일 `Global ↗`은 `../global/index.html?locale=en`이고, 로그인 `?next=../global/…`을 허용합니다.
  - **정식 요청: `landxi/assets/data/portal.js` TENANTS에 kgz 기관 한 줄 추가**(예: `{ id:'kgz-agri', scope:'global', name:'Kyrgyz Ministry of Agriculture', home:… }`). 지금은 이 줄이 없어서 **제품에서 `Global ↗`이 보이는 곳이 0**입니다. 셸 분기는 준비되어 있어 줄이 생기면 바로 섭니다. 지금 확인은 테스트 주입(`f2r-portal-survey`)으로만 했습니다.

## 7. 세 사용자 자기 점검
- **LX 직원:** 로그인 → 레일 7 → '지도 서비스'를 누르면 3.5 s 안에 새 XI맵이 부팅되고 역할이 `LX 직원`으로 표시됩니다. 통계 서랍에 포털 크롬이 한 픽셀도 없고, 기간 칩도 동작합니다. 카드 계보는 모델 → 카드 버전 → 배포본 → 작업까지 한 줄로 이어집니다. **좋음.** 아쉬운 점: XI맵에 '카드 ↗' 칩이 없어 영상에서는 같은 URL을 직접 열었습니다(F2-A).
- **LX 관리자:** 로그인하면 결재 대기(2 · 1 · 6)가 있는 운영 현황에 서고, 레일 첫 줄 '운영 현황'이 현재로 표시됩니다. 어느 관리자 화면에서든 한 번에 돌아올 수 있습니다. 관제 넷은 '관제 현황 · 인프라 관제 · 기관·할당 · 배포 제어'로 이어지고 GPU 두 장 실측 화면으로 갑니다. 다만 관제 로그인을 한 번 더 해야 합니다(2차).
- **지자체 공무원(남원):** '지도' 탭이 본문 전폭 XI맵 실태조사(의심 20,852 필지 · 규칙 6 · 39/39 읍면동)로 섭니다. 카드끼리 겹치지 않습니다. 필지 표는 바로 아래에 있습니다. '의심 큐 ↗'를 누르면 XI맵이 R1–R6 · A/B/C 필터가 있는 큐 서랍을 연 채로 섭니다. 체크 → 배정 · 보고서 초안까지 업무가 이어집니다. **좋음.** 아쉬운 점: 큐가 서는 데 약 9 s가 걸립니다(F2-A).
- **시민/영업 시연:** 첫 화면이 곧바로 XI맵(`영업 · 시연`)이고 관리 메뉴는 보이지 않습니다. 막힌 화면으로 가면 XI맵으로 돌아오지만 **안내가 없어** 왜 왔는지 모릅니다(F2-A 토스트 요청 · 테스트 대기 중).

## 8. 2차로 미룸(정직)
- 4173과 8702 사이 자동 세션 인계
- 구 `ximap.html` 폐기 여부(p0926 결과 뒤 사용자 결정). 지금은 직접 URL로 열리고, 그 화면의 레일도 새 XI맵을 가리킵니다.
- XI맵의 `denied` 토스트 · '카드 ↗' 칩 · `EMBED_CSS` 제거(F2-A) · 관제 로그인 폼 폴백 · GPU 값 원천 표기(F2-C) · kgz 기관 줄(F2-D)

## 9. 판정 1차 반영(2026-09-27)

| 지적 | 조치 | 증거 |
|---|---|---|
| 관리자 홈 admin-home 레일 고립 · admin-home에서 '서비스 관리'가 현재로 표시됨 | `shell.js NAV`에 `home`(운영 현황 → `admin-home.html`)을 되살렸습니다. 관제 항목은 '관제 현황'으로 이름을 갈랐습니다(title `LX/OPS 운영 현황`). `roles.js` admin menus를 10개로 늘리고 `SCREEN_MENU['admin-home.html']='home'`으로 바꿨습니다. `RAIL_ACTIVE` 표를 새로 두어 화면 파일의 정본 키가 `active`보다 먼저 서게 했습니다. admin-home.js(소유 밖)의 `active:'admin'`을 고치지 않고 키 정리로 해결한 것입니다. `shell-gate.js` 미러도 같게 맞췄습니다. 아이콘이 겹쳐서 `infra` 아이콘을 `run`으로 바꿨습니다. | `f2r-rail` '관리자 홈 고립 0'(admin-home `aria-current=page`는 home 하나뿐 · dataset · admin-publish · produce · admin-notice · mypage 레일 모두에 admin-home 링크 · 클릭 왕복) · `rail-admin-1440.png` · still `06-admin-rail10` · 영상 `admin.home {rail:10, current:'home'}` |
| 포털 지도 탭 iframe 720×560 HUD 겹침 | 실태조사 보기에서만 iframe을 본문 전폭 · 높이 `max(720px, 100vh−250px)`로 세웁니다. 필지 표는 아래로 내리고(높이 640) 판은 스크롤합니다. 결과 지도 보기는 원래 두 칸 한 화면 그대로입니다. `proto-portal` 한 화면 규칙에는 이 판 하나만 예외로 두었고, 결과 지도 보기는 6개 해상도에서 계속 잽니다. | `f2r-portal-survey` 1: iframe 1254×718 이상 · 표 y ≥ 지도 아래 · **iframe 안 HUD 최상위 7개 교차 0**(실측) · `portal-map-xi-survey.png` · still `09` |
| '의심 큐 ↗' 죽은 버튼(`drawer=findings` → 판독 모드 · 큐 0) | 링크를 XI맵 실태조사 규약 `…&queue=1`로 바꿨습니다(survey-mode restore → openQueue). | `f2r-portal-survey` 2: 클릭 → `data-xmode=survey` · `#fdrawer` 보임 · '의심 큐' · 합계 `20,872` · 첫 줄 보임 · `portal-queue-arrive.png` · still `11-xi-queue` |
| 관제 로그인 GET 비밀번호 노출 | 관제 파일은 F2-C 소유입니다. §6에서 정식으로 요청했습니다. F2-R 녹화는 `data-lx=ready`를 기다린 뒤 제출하고 `pwInUrl:false`를 기록합니다. | `marks.json` `ops.after.login` |
| XI맵 denied 안내 0 | F2-A에 요청했습니다(§6). 단언은 자동으로 켜지게 추가했습니다. | `f2r-rail` '영업 → 막힌 화면'(지금 skip · F2-A) |
| 관제 GPU0 값 불일치 | F2-C 확인 요청과 실측 값을 적었습니다(§6). | 이 문서 §6 |
| 결과 문서 정직화 | 콘솔 401(F2-E/F2-A)을 명시했습니다. `Global ↗` 현재 노출 0(테스트 주입만) + F2-D 요청 · 영상 44.8 s(로딩 두 구간만 4배속 · 원본 `f2r-full.mp4` 병기). | 머리말 · §2 · §6 |

## §10 판정 2차 반영 (2026-09-27)
- 판정 영상의 4배속 두 조각에 `drawtext` 띠를 넣었습니다(`4× 배속 · 이 구간 실시간 N s` + 실시간 경과 카운터 + 원본 구간). `marks.json`에 `edit.map` · `t_out`을 추가했고, 다시 녹화해 `f2r.mp4` 45.4 s / `f2r-full.mp4` 56.8 s를 만들었습니다.
- kgz `Global ↗` 제품 경로 e2e(주입 0)를 `f2r-portal-survey`에 신설했습니다. portal.js에 scope global 줄과 `login`이 들어오면 자동으로 실행되고, 지금은 skip입니다. 통합자가 portal.js 줄을 넣을 때 `shell-gate.js TENANT_HOME['kgz-agri']` 미러 한 줄도 같이 넣어야 합니다. 먼저 넣으면 `tenantById` 폴백(LX · menus all) 구멍이 생겨 보류했습니다.
- 재녹화 실측: 포털 임베드 실태조사 복원 8.4 s · 큐 첫 줄 8.7 s(F2-A 기준 5 s 미달 · 소유 밖)입니다.
