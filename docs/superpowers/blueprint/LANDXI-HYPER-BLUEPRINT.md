# Land-XI 하이퍼 GeoAI 플랫폼 — 최종 설계서 (LANDXI-HYPER-BLUEPRINT)

- 작성 2026-09-24 · Fable 5.1(수석 플랫폼 기획자·디자인 디렉터) · 세 설계안(`proposal-product.md` · `proposal-system.md` · `proposal-visual.md`) 심사 후 통합.
- 근거: 메모리 9편 · `recon-0924/`(ASSET-LEDGER · env · vworld · stack · global-map · e-projects · e-landcover · d-drive · aihub-shortlist) · `specs/2026-09-20-{two-tier,platform-roles,card-architecture,production}.md` · `audit-0923/{MASTER-PLAN,strategy}.md` · `specs/2026-08-26-landxi7-function-inventory.md` · `design/system.md` · `wave0/E0-S-result.md` · `landxi/assets/data/{infra,cards,portal}.js`.
- 표기: 자산은 ASSET-LEDGER ID(A01~E04). 수치는 **[실측]**(파일·API·이 PC에서 잰 값) / **[추정]**(계수 계산) / **[시연]**(결과를 남기지 않는 연출) / **[목표]**(아직 안 잰 설계 예산). 이 네 표기 없는 숫자는 recon 원문 인용이다. 지어낸 운영 수치는 없다.
- 변경 없는 전제: 기능은 원본 landxi7 35화면 1:1(추가·삭제 없음) · 구조는 자유 · 기관 계정 완전 별도(Q1) · 관리자 = 잉크 반전 다른 집(Q3) · 영업 = 시연 실행(Q4) · 영상 생성 크레딧 0(Q6).

## 개정 이력

| 판 | 일자 | 무엇을 | 근거 |
|---|---|---|---|
| v1.0 | 2026-09-24 오전 | 세 설계안 통합 초판(§0–부록 D) + 완결성·현실성 비평(§10, 추가만) | – |
| **v1.1** | **2026-09-24 오후** | **§10 비평 반영 개정 + 사용자 결정 반영.** 아래 R1–R14. 본문 각 자리에 `[v1.1]` 표식. 정본 계약은 `blueprint/F1-CONTRACT.md`, 법전 v2는 `design/system-v2.md`, 에픽 브리프는 `blueprint/f1/F1-{A,B,C,D}.md` | §10.0 X1–X5 · §10.5–10.7 · 사용자 결정(디자인 법전 v2 채택 · 게스트 원본 영상 금지 · Ollama 종료 금지 · FastAPI+Redis+PostGIS) · `recon-0924/pipeline-run.md`(P1·P3·P4·P5·P6 실행 완료) |

**v1.1 개정 항목**

| # | 결함/누락 | 개정 | 자리 |
|---|---|---|---|
| R1 | X1 남원 1cm 하강 → 2,098필지 도착이 지리적으로 성립하지 않음 | 도착 장면 = **남원 전역(z12–13) · P3 2023 25cm 타일(88,404타일 · 100% 커버) 위에 P4 재추론 129,420 폴리곤**(건물 49,800 · 경작지 76,215 · 주차장 2,677 · 비닐하우스 728 · `AI 추론 · 검수 전`) 도착. cm 하강은 **드론 AOI(A01 0.8×0.9km) 안의 실제 결과**(A02 농경지 5필지 + A04 변화 456건 + 4시점 스크럽)로만. 2,098·1,674는 시 단위 열람 층의 수 | §0 목표1 · §1 P-1 · §3.3 · §8.1 F1-A |
| R2 | X1 후속 — 비닐하우스는 `E:\best.pt`가 25cm에서 728건뿐(약함) | **남원 전용 YOLO11x-seg 비닐하우스 모델(`namwon/Vinyl_house/train2` · mask mAP50 .938)로 25cm 전역 재추론을 워커 작업(J2b)으로 큐에 제출**. 결과는 `도메인 이식(드론 cm 학습 → 항공 25cm) · 검수 전` 표기, A02 1,674(2025 드론 AOI)와 읍면동별 대조표를 낸다 | §3.3 · §8.1 F1-B |
| R3 | X2 배포 제어(단계 배포·롤백·이식)가 1차에 없음 · `POST /deploys` 없음 | F1-C에 **배포 제어 화면 1면 + 장면 2(R-1 롤백 · P-1 이식)** 편입. API `GET/POST /deploys` · `POST /deploys/{id}/port` · `rollout/rollback/approve/pin` 추가 | §4 ④ · §5.2 · §8.1 F1-C |
| R4 | X3 글로벌이 사전 수집 열람뿐 | F1-D에 **작업 큐를 거치는 글로벌 분석 1건**(G-J1: 으슥아타 북부 평원 AOI, CPU 워커 `adapters/global/ndvi_pc.py`가 Sentinel-2 월별 NDVI + WorldCover 클래스 통계를 계산, shard = 월). 표기는 `지수 계산 · 모델 추론 아님` | §3.3 · §8.1 F1-D |
| R5 | X4 소쿨룩·`kgz-land` 카드 없음 | 시나리오 B(비슈케크·소쿨룩 시가지 확산 = Esri LULC 2017→2025 built 차이 + Overture 건물 밀도 + geoBoundaries) 편입. `kgz-land`에는 **`card-change`(국토 변화 탐지)를 이식한 배포본** `dp-kgz-land-change-26`(F1-C 이식 장면과 같은 행). 연속지적 시범지 경계 = `경계 미확보` | §1 · §3.2 · §8.1 F1-D |
| R6 | X5 공개 모드 원본 영상 노출(보안·권리) | **사용자 결정: 게스트/공개 화면에 자체 고해상 원본 영상(25cm·cm급) 금지 — V-World 위성(xdworld) + AI 결과 벡터만. 원본 영상은 로그인 사용자에게만.** `imagery.export_policy`에 `security_review` · `rights_holder` 칸. 서버 `build=public` 가드 | §2.2 · §3.2 · §5.3 · §9 Q-E |
| R7 | 종이 무대가 1차 영상에 없음 | F1-C `admin-login`(종이 무대 플랫폼 소개 + 관제 요약 한 줄) → 로그인 뒤 **잉크 반전 전환 1600ms**를 영상 앞 15s에 | §8.1 F1-C · 부록 A L-1 |
| R8 | D0 계약이 없어 "파일 소유 겹침 없음 = 병렬"이 성립하지 않음 | **`F1-CONTRACT.md` 고정**(엔드포인트 JSON · SSE · 봉투 · 타일 URL · 테넌트·쿼터 · 배포 · 포트 · Redis 키 · 어댑터 인터페이스 · off 모드 리플레이). 공유 부품 `landxi/shared/api-v1.js` · `landxi/assets/css/v2/tokens-v2.css`는 Fable이 작성·동결 | §5.2 · 부록 B |
| R9 | 콘티 표기 위반 | HUD 예시 → `[예시]` · DEPLOYS `비닐하우스 9,664 동` 출처 없음 → countCheck 제외·화면 미표시 · `status:'운영'` → `basis:'history'` · "4090 96fps" → `[실측 · 다른 PC]` · 사업국 수 `목록 확인 36` · NDVI 장면 수 T43TEH만 따로 셈 · J1 GT 정의(황등 AOI 안 GT 수 · 라벨 있는 칩 안 P/R · IoU≥0.5) | §0 · §3.3 · §6.2 · §8.1 |
| R10 | GPU 점유 = Ollama `llama-server` 4개(장당 23,396 MiB) | **사용자 결정: Ollama 절대 종료 금지. 남는 메모리(장당 약 24GB)만 쓴다.** 워커는 로드 전 `memory.used`를 읽어 batch를 정하고, 관제 GPU 행에 `외부 점유` 띠를 항상 그린다. bench 값에는 `외부 점유 23.4GB 동시` 조건을 적는다 | §3.3 · §4 ② · §5.5 |
| R11 | Prometheus·exporter 미설치 · 0.5일로 불가 | 1차는 **FastAPI가 폴러(nvidia-smi 2s · `du` 60s)를 직접 가짐**. Prometheus/Alertmanager는 Phase 1 | §4 ② · §5.1 |
| R12 | 서명 URL 10분 + pmtiles 세션 중 만료 | 서명 유효 **12h** + `GET /tiles/sign` 갱신 · 프론트 `pmtiles` 프로토콜에 재서명 훅 | §5.6 |
| R13 | 국내 사다리에 '위성' 층 없음(요구2 전국 위성) | 국내 사다리 z9–13에 **GIBS HLS S30 30m(일자별)** 층 추가 → 위성 → 항공 → 드론 세 층이 실제로 이어진다. 국토위성(CAS500) = `미확보` | §3.2 |
| R14 | '운영 가능' 정의 없음 · 공공 요건 없음 | 1차 = **로컬 · LX 내부망 · 시연 규모**로 정의. 망 구성·보안 인증·RPO/RTO·KWCAG는 3차 완료 기준, §7 루브릭에 '운영 요건' 행 | §7 · §8.2 |

---

## 심사 결과 — 무엇을 뼈대로 삼았나

| 기준 | 제품·UX안(P) | 시스템안(S) | 비주얼안(V) | 채택 |
|---|---|---|---|---|
| 요구 1 운영 가능 완성형 + WebGL | 화면 문법(프레임→실행→도착→열람) 명확, 백엔드는 얇음(Node + SQLite 큐) | **"한 흐름이 실데이터로 끝까지 닫힌다"**를 아키텍처로 증명 | WebGL 매체를 막은 법전 6줄을 정확히 짚음 | S 뼈대 + V 법전 |
| 요구 2 XI맵 실시간 프레임 | **여덟 동사**(V1~V8)·URL 상태·역할별 켜짐 표 — 가장 완성된 조작 문법 | shard 스트리밍·`demo:true`=진짜 GPU·job-theater가 실측 이벤트를 그림 | 7문법(도착·스캔·압출·시계열·스와이프·필라멘트·프로비넌스) | P 동사 + S 계약 + V 재질 |
| 요구 3 A6000×2 → A100×4×2 | 계약 동일·노드 추가 원칙만 | **Redis Streams·풀·MIG·k3s·MinIO**, 단계 사이 불변 인터페이스 명시 | 워커 8개 등록 한 줄 | S |
| 요구 4 관리자 관제·쿼터·배포 제어 | 관제 3면을 **1급 화면**으로 승격(admin-infra/tenants/deploys) | 별도 origin :8702 · nodes/quotas/deploys/approvals 스키마 · 경보 규칙 | OPS-GRID 무대·잉크 반전 토큰, 단 `produce.html` 탭 안에 둠(요구 4와 어긋남) | P 화면 + S 데이터 + V 무대 |
| 요구 5 기관 완전 별도 | 세션 키 상호 배타 | **PostGIS RLS + 서명 URL + 파일 접두어 + 원본 라우트 0**(다섯 겹) | – | S |
| 요구 6 전문가급 디자인 | 법전 개정 4항(판 1단 깊이) | 문서 층/지도 층 분리 제안 | **3무대·깊이 4단·빛 문법·이징 3·레이아웃 +3·아이콘 44·Inter 글로벌** — 근거 표 완비 | V |
| 요구 7 콘티 원칙 | `prov()` 4꼬리표 | **숫자 봉투 `{value,unit,basis,as_of,source}` 서버 강제** | 프로비넌스 칩 | S + P |
| 실데이터 결속 | 화면×장면×자산 부록 표 | J1~J5 실추론 조합·P1~G6 파이프라인 | 4.8 줌 사다리 URL 전부 | 셋 모두 |
| '우와' 장면 설득력 | 13장면(P-1 … M-1) 사용자별 | Phase 0 90초 영상 정의(반화면 관제) | 도착 카메라 pitch 0→35°·124px 숫자 | P 장면 + S 영상 정의 + V 재질 |

**판정**: 뼈대 = **S(시스템안)**. 목업 판정의 절반은 디자인이지만 나머지 절반은 "보이는 동작 뒤에 진짜 계산이 없다"는 것이고, 이것을 고치지 않으면 어떤 재질도 다시 목업으로 읽힌다. 그 위에 P의 정보구조·여덟 동사·결정적 장면을 화면 층으로, V의 디자인 언어 v2를 법전으로 접붙인다. 세 안이 서로 어긋난 지점 9곳은 §부록 C에 결정과 근거를 적었다.

---

## §0. 한 장 요약

**비전 한 문장** — *Land-XI는 지도 위에 프레임을 씌우면 LX의 GPU가 그 안을 읽고, 결과가 그 자리에 도착하는 국가급 GeoAI 플랫폼이다. 남원의 1cm 드론 정사영상과 키르기스스탄의 Sentinel-2가 한 지도에서 열리고, 같은 순간 관제실의 GPU 게이지가 실측으로 움직인다.*

**사이트 구성(다섯, 문법 하나)**

```
① 공개 사이트(게스트)      scrub/index.html 필름 → 착지 = XI맵 공개 모드(ximap.html?public=1)
② LX 워크벤치(직원·영업)   login.html → 대시보드 · 데이터 · 프로젝트 · 분석 서비스 · XI맵 · 서비스 지원 · MY
③ LX/OPS 관제(관리자)      ops.<host> :8702 admin-login → 운영 현황 · 인프라 관제 · 기관·할당 · 배포 제어 · 카드 발행 · 데이터 관리 · 서비스 관리 · MY
④ 기관 포털 × n(지자체)    portal-login-<tenant> → 카드 덱 → 작업공간 5탭(현황·결과·지도·통계·보고서)
⑤ Land-XI Global(해외)     portal-login-<tenant>?locale=en|ru → 같은 골격 · EPSG:4326 · 위성 사다리 · Inter 표시체
```
②~⑤는 한 벌의 지도 엔진(`landxi/engine/lx-map.js`)과 한 벌의 문법(**프레임 → 실행 → 도착 → 열람**)을 공유한다. ③은 별도 origin이다.

**XI맵 정의** — 사용자 정의 그대로: *전국·해외 위성/항공/드론 정사영상을 실시간 분석할 수 있는 프레임과 그 결과를 보는 핵심 글로벌 GeoAI 맵.* 엔진 인스턴스 하나에 무대 프리셋 둘(국내 사다리·글로벌 사다리), 여덟 동사(내려가다·프레임을 씌우다·실행하다·도착하다·시점을 끌다·가르다·세우다·열람하다), 실시간 분석 프레임은 **실제 작업 큐 + GPU 워커의 shard 이벤트**로만 그린다.

**이번 차수(1차 플래그십) 목표** — 1440×900 동작 영상 **한 편(≈120초)** 으로 세 사용자와 관리자가 동시에 "우와" 하게 만든다:
1. **[v1.1 R1]** XI맵 남원 운영판 — 글로브 → 위성(HLS) → 남원 전역 z12.5, **2023 25cm 항공(P3) 위에 P4 재추론 129,420 폴리곤이 스캔 스윕으로 도착**(`AI 추론 · 검수 전 · 2023`) → 읍면동을 누르면 집계(운봉읍 경작지 1,324.8ha [실측]) → 드론 AOI(운봉 0.8×0.9km)로 cm 하강, 배경이 25cm → 1.08cm로 갈리며 **AOI 안 실제 결과**(A02 농경지 5필지 · A04 변화 456건) 도착 → 필지 카드(C04 PMTiles · `2021-12 기준`) → 4시점 스크럽 → 스와이프.
2. 실추론 최소판 — 익산 황등 1.36cm(B04) 위 프레임 → A6000 두 장이 **Ollama 옆 남는 VRAM에서** 차량 OBB(B05)를 실제로 추론 → shard마다 결과 도착 → 황등 AOI GT n건(P15에서 셈) 대비 P/R [실측 · IoU≥0.5 · 라벨 있는 칩 안]. 큐에는 **J2b 남원 비닐하우스 재추론**(YOLO11x-seg `Vinyl_house/train2` × 25cm)이 P1 우선순위로 뒤따른다.
3. **[v1.1 R3·R7]** 관리자 관제 — 종이 무대 `admin-login`(15s) → 잉크 반전 → 같은 시각 :8702 관제 판에서 nvidia-smi 게이지(외부 점유 23.4GB 띠 포함)·큐·시연 기관 할당 막대가 실측으로 움직인다 → **배포 제어: `dp-nw-farm-25` v2.1 → v2.0 롤백(R-1) · `card-change` → `kgz-land` 소쿨룩 이식(P-1)**.
4. **[v1.1 R4·R5]** 글로벌 — 같은 지도가 키르기스스탄 으슥아타로 내려가 월별 Sentinel-2 모자이크 · WorldCover 농경지 33.0% [실측 · 비율만] · **작업 큐를 거친 NDVI 월별 지수(G-J1 · CPU 워커 · shard = 월 8칸)**가 도착 → 소쿨룩·비슈케크 시가지 확산(Esri LULC 2017→2025 + Overture) → 미얀마 EMSR798 전후 스와이프.

완료 기준은 §8.1과 `f1/F1-*.md`. 영상 생성 API 호출 0. 게스트/공개 화면에는 원본 영상이 나오지 않는다(R6).

---

## §1. 사용자와 여정

판정 기준(사용자 9차): "실제 전문가가 이쁘고 세련되게, 공무원·일반인·LX 직원이 우와할 정도로." 각 사용자마다 첫 15초에 일어나야 하는 일과 그 장면을 닫는 실자산을 못 박는다.

| 사용자 | 진입 | 첫 15초 | "우와"의 실체 | 결정적 장면 | 실자산 |
|---|---|---|---|---|---|
| **지자체 공무원**(남원 농정과) | `portal-login-namwon` → 카드 덱 → 지도 탭 | **[v1.1 R1]** 시 전역 z12.5 · 2023 25cm(P3) 위에 청록 스캔 스윕이 지나며 **129,420 폴리곤(P4 · 검수 전)**이 도착하고 읍면동 집계가 붙는다. 이어 운봉 드론 AOI로 1,250ms 하강, 배경이 25cm → 1.08cm로 갈리고 AOI 안 **실제 결과 5필지 + 변화 456건**이 도착 | "내 관내 전체가 판독됐고, 내 동네는 1cm까지" | **P-1** 시 전역 판독 도착 → 1cm 하강 · **P-2** 필지를 누르면 PNU·지목·면적·공시지가(C04 PMTiles · `2021-12 기준`) + 판독 conf + **A01 타일 실시간 크롭 4시점(AOI 안 5필지만 · 밖은 A03 2시점으로 대체 표기)** | P3 · P4 · A01 · A02 · A04 · C04 · (E01 키 복구 시 GetFeature 덧댐) |
| **일반 시민**(게스트) | `scrub/index.html` 필름 | 필름 마지막 프레임과 XI맵 공개 모드 첫 프레임의 카메라가 같아 점프 0. 검색 '남원시 운봉읍' → 공개 결과 도착 | "영상이 진짜 지도였다" · "우리 하천이 전국 지도에 있다" | **G-1** 필름이 지도였다(`sessionStorage.lx_cam`) · **G-2** z6 전국 하천 벡터타일(A05) 위 하천 점유 건물 651,478건(B02) 단계구분도 [실측] | 필름 레그(재렌더 0) · A05 · B02 · A11 · A07 |
| **LX 직원**(모델 개발자) | `login.html` → 대시보드 → 프로젝트 → XI맵 | 프레임을 그리고 실행하면 shard 격자가 켜지고 결과가 칸마다 도착, HUD에 `탐지 n · shard 96/240 · GPU0 71% · 1.9칩/s` [실측·지금] | "내가 만든 모델이 진짜 영상 위에서 돌아간다" | **S-1** 프레임을 그리면 GPU가 답한다 · **S-2** 학습이 심장처럼 뛴다(B01 results.csv 실곡선·PR·F1·혼동행렬) | B04 · B05 · B03 · B01 · D10 AXIS-Label |
| **LX 관리자**(관제) | `admin-login.html`(:8702 · 종이 무대) → 잉크 반전 1600ms | 잉크 반전 관제실에서 A6000 #0/#1 사용률·VRAM(외부 점유 띠 포함)·온도 링이 2s 수집·값 변화 시 40ms 현상으로 갱신, 큐 행이 노드 카드로 리더선을 그리며 배정 | "인프라가 살아 있다 · 배포를 내 손으로 돌린다" | **A-1** 숫자가 살아 있다 · **T-1** 쿼터를 돌리면 링이 따라온다 · **[v1.1 R3] R-1** 롤백이 지도에서 보인다(v2.1 → v2.0 · 스냅샷 교체) · **P-1(이식)** `card-change`를 `kgz-land` 소쿨룩에 심으면 매트릭스에 새 셀이 draft로 도착 · A-2 승인 데스크는 2차 | env.md [실측] · `/api/v1/ops/*` · `deploys`·`usage_events`·`card_versions` |
| **해외 기관**(키르기스 농업부 `kgz-agri` · 토지자원청 `kgz-land`) | `portal-login-kgz-agri?locale=en` | 글로브(GIBS 어제 영상·LX 사업국 채색 `목록 확인 36`) → 으슥아타 군 하강 → 월별 S2 모자이크 스크럽 → WorldCover 비율 · **[v1.1 R4] 큐를 거친 NDVI 월별 지수 도착(shard = 월)** | "우리 나라 데이터로 이미 돌아간다" | **K-1** 우리 군의 한 해가 흐른다 · **[v1.1 R5] K-3** 소쿨룩·비슈케크 외곽의 신축 확산(2017→2025 built + Overture 밀도 · `연속지적 시범지 경계 미확보`) · **K-2** 재해 전후가 한 선으로(미얀마 EMSR798) | geoBoundaries · Planetary Computer · WorldCover · Esri LULC · EMS · Maxar(CC BY-NC 시연 한정) · Overture |
| **영업**(시연 실행) | `login.html`(sales) → XI맵 결과 켜진 채 | 같은 파이프라인이 실제 GPU로 돌되 DB·계량 기록만 건너뛴다(`demo:true`). 워커 없으면 저장 결과 재생 | "진짜로 돌아가는데 세션에 아무것도 남지 않는다" | S-1의 시연 변형 · 활용 사례 2시점 스와이프 | 위와 동일 + `results.js` 재생 |

**두 층 경계(two-tier 유지)**: LX는 판독까지(V2 프레임·V3 실행은 LX 몫), 기관은 열람·행정 가공·오류 신고(`POST /feedback`). 기관 세션은 LX 셸에, LX 세션은 기관 작업공간에 들어가지 못한다 — 브라우저 관문이 아니라 서버 realm과 RLS가 막는다(§5.6).

---

## §2. 정보구조 — 사이트 지도

### 2.1 원본 35화면 1:1 대응(추가·삭제 없음)

| 원본(인벤토리 §) | 자리 | 구조가 달라지는 것 | 파일 |
|---|---|---|---|
| 홈(§12) | ① 필름 + 꼬리 3칸 + XI맵 공개 모드 착지 | Hero·노코드 4노드·Before/After(A01 2504↔2510 스와이프)·특징 3(A12 크롭)·라인업 15칩·사례(DEPLOYS 7)·문의·푸터를 필름 뒤 꼬리에 실자산으로 | `proto/scrub/index.html` · `scrub-tail.js` · `site/*` |
| 로그인·가입·찾기 4(§11) | ② 입구(직원·영업 2칸 + '관리자 사이트 ›') · ③ `admin-login` · ④⑤ `portal-login-*` | 로그인 = 플랫폼 소개(모토·3축·비전) + 실결과 얼굴판(정적 스냅샷) | `login.html` · `auth.js` · `portal-login.js` |
| 대시보드(§2) | ② 직원 첫 화면 = AI 양산 라인 계기판 | 지도 없음(사용자 확정). 큰 숫자 밴드 + 네 띠(만드는 것·발행 대기·어디에 깔렸나·다음 것) + 작은 격자 판(셀 점등 S1) + 원본 위젯 헤어라인. '7일 방문' 제거(Q8) | `proto/dashboard.*` · `db-*.js` |
| 데이터 관리 4탭(§3) | ② ③ 공유 · 판이 주인공 | 4탭 = 파이프라인 단계. 발행 4/4가 판 위에서 전이(M-1). 자산 등급(`ASSET_TIERS`) 공유 모달 | `proto/dataset.*` · `ds-plate.js` |
| 프로젝트 8단계(§4) | ② LX 작업실 | 라벨링 = AXIS-Label 실백엔드(D10 프록시) · 학습 = results.csv 실곡선(B01) · 분석 = XI맵 프레임 호출 | `proto/ai-project*.html` · `project-*.js` |
| 분석 서비스 3탭(§5) | ② 카드 진열대 · 실행은 지도 위에서 | 실행 탭 = `#run-plate` 위 스캔 프레임(실 큐) · 영업 = 시연 실행 · 완료 = 결과가 판독한 영상 위에 | `proto/analysis-ai.html` · `analysis-*.js` |
| **XI맵**(§6) | ②④⑤ 플래그십 | 3비교 모드 → 한 축(V5 스크럽 + V6 스와이프, 탭 라벨은 원본 유지) · 통계/보고서 = 우 서랍(`?embed=1` 프로토콜 유지) · 국내◉/글로벌○ = 같은 지도의 카메라 이동 | `proto/ximap.html` + `landxi/engine/*` |
| 서비스 지원 5(§7) | ② · 기관은 포털 안 `portal-support-<t>` | 문의 = 오탐 신고 + 지도 위치 첨부(`pick`) → LX 라벨링 큐(피드백 고리) · 사례 = 2시점 스와이프 | `proto/notice.html` 등 |
| 카드 발행 관리 3(§8) | ③ 검토 데스크 | 승인 = 증거판 → 카드 현상 → 기관 덱 미리보기(Q3) → `deploys` 행 | `proto/admin-publish.html` |
| 서비스 관리 5(§9) + 생산 관리 6탭 | ③ 사용자·공지·문의·FAQ·지도 속성 + **인프라 관제·기관·할당·배포 제어**(생산 관리 인프라·매칭·능동 운영·포털 생산 탭을 1급 화면으로 승격 — 새 메뉴 아님) | 잉크 반전 OPS-GRID | `landxi/ops/*.html` |
| 마이페이지(§10) | ② ③ ④ 각 집의 MY | 디스크 = 기관 쿼터와 같은 부품(`/api/v1/t/{tenant}/usage`) | `proto/mypage.html` |
| XI맵 통계·보고서 3(embed) | 우 서랍 + 단독 페이지 유지 | 기간 칩이 `analyzedAt`로 실제 필터 | `stats-standard.html` · `report-standard*.html` |

### 2.2 사이트별 레일

| 사이트 | 레일 | 무대(§6) | 세션 |
|---|---|---|---|
| ① 공개 | 마스트만(레일 없음) | Paper → Imagery(착지 판) — **[v1.1 R6] 영상 층 = xdworld 위성만 · 결과 벡터만. C01·A01·A03 등 자체 영상은 `build=public`에서 서버가 제외** | 없음 |
| ② LX 직원 | 대시보드 · 데이터 · 프로젝트 · 분석 · **지도(XI맵)** · 서비스 지원 · MY (7) | Paper · Imagery | `realm=lx` role=staff |
| ② LX 영업 | 분석 서비스 · 활용 사례 · XI맵 · MY (4) — 첫 화면 XI맵 | Paper · Imagery | `realm=lx` role=sales, `demo:true`만 |
| ③ LX/OPS | 운영 현황 · **인프라 관제 · 기관·할당 · 배포 제어** · 카드 발행 · 데이터 관리 · 서비스 관리 · MY (8) | **Ops** | `realm=lx` role=admin, origin :8702, IP allowlist |
| ④ 기관 | 홈(덱) · 작업공간(현황·결과·지도·통계·보고서) · 서비스 지원 · MY | Paper · Imagery(지도 탭) | `realm=tenant`, `tenant_id` 일치 |
| ⑤ Global | ④와 동일 골격 · `locale=en|ru` · 단위 ha/km² · EPSG:4326 표기 | Paper · Imagery · GLOBE-STAGE | `realm=tenant` scope=global |

---

## §3. XI맵 시스템

### 3.1 여덟 동사(조작 문법 — 화면은 이 동사만 안다)

| # | 동사 | 조작 | 결과 | 부품 | 자산 |
|---|---|---|---|---|---|
| V1 | **내려가다**(줌 사다리) | 휠·핀치·검색·카드 클릭 | 줌 구간마다 배경이 자동으로 갈린다. `raster-fade-duration 500` + 줌 보간, HUD 출처 칩이 바뀐다(`V-World 위성 z14` → `LX 항공 25cm 2023` → `LX 드론 1.08cm 2025-04`) | `engine/sources.js` 사다리 표(§3.2) | 국내·글로벌 사다리 |
| V2 | **프레임을 씌우다** | 사각 드래그 · 폴리곤 · 행정경계(A11 읍면동 / geoBoundaries ADM2) | 프레임 안 영상 층·면적·shard 수·예상 GPU·s [추정]·할당 잔여를 `POST /jobs/quote`가 즉시 계산. 프레임 밖 무채 디밍 | `engine/fx/frame.js` | A11 · C04 · geoBoundaries |
| V3 | **실행하다** | '이 프레임 분석 ›' → 카드·모델(현재 층과 `kind.input`이 맞는 것만 활성) | `POST /jobs` → shard 격자 점등 → SSE | `engine/fx/job-theater.js` | B05 · C09 · B01 · D11 |
| V4 | **도착하다**(S1) | 자동 | 스윕(청록 수직선 1.0s, 지나간 뒤에만 결과) → 락온 380(180→앰버 80→청록 120) → 숫자 40ms/글자 → `frame()` 900–1250 선행. **입력이 shard.done 이벤트일 수 있다** | `engine/fx/arrive.js`(E0-S `ximap-signature.js:285` 승격) | A02 · A04 · A06 · 실추론 결과 |
| V5 | **시점을 끌다**(S3) | 하단 유리 스크러버 0–3 소수 · 재생 6s 주기 · 정수 750ms 자동 정지 · ←/→ ±0.25 · `?epoch=1.5` | 두 raster 크로스페이드 · 변화 지수(비지도) 윤곽 · 스크러버 위 변화 히스토그램(A04 `pair` [실측]) | `engine/fx/timescrub.js` | A01 4시점 · A03 2시점 · A09 2비행 · C02 3.67→1.44cm · PC 월별 모자이크 |
| V6 | **가르다**(S6) | 핸들 · ←/→ ±4% · `?swipe=42` | 좌 원본 / 우 원본+결과 또는 시점 A/B. 캔버스 2 동기. 양쪽 상단 출처 칩 | `engine/fx/swipe.js` | 전 자산 · Maxar 전후 |
| V7 | **세우다**(3D · Q9 답) | 배경지도 서브메뉴 '지형·입체' 1개 · 기본 OFF · T1 pitch ≤ 60 / T2 ≤ 45 | 결과 `fill-extrusion`(높이 = conf, height_m은 [추정] 표기) + `raster-dem` terrarium. 지형은 장면 단위만(SwiftShader 2.4fps 절벽 [실측]) | `lx-map.js setTerrain` 옵션 | A02 비닐하우스 1,674(최고 3D 자산) · A08 · E02 · B03 DSM · C02 DSM |
| V8 | **열람하다** | 결과 체크 · 표 3종(지목별/필지별/도로지점별 = `준비 중 · 도로 결과 없음`) · 심각도 · 페이저 · 통계·보고서 서랍 · 내보내기(GeoJSON·CSV BOM, `export_policy` 검사) | 표 행 ↔ 도형 ↔ 막대 삼각 호버 · 필지 카드 · 크롭 clip-path 1s | `map.js` · `map-stats.js` · `map-report.js` | A02 · A12 · C04 · stats JSON(P10) |

**URL 상태**: `?on=<resultId>&epoch=1.5&swipe=42&frame=<b64geojson>&card=&model=&pick=frame|point&public=1&svc=<deployId>&result=<id>&job=<id>&embed=1&locale=` — 새로고침 복원·딥링크·대시보드/포털/분석에서 수신.

**역할별 켜짐**: 게스트 = V1 V5 V6 V8(공개 결과만) · 직원 = 전부 · 영업 = V1 V3(`demo:true`) V4 V5 V6 V8 · 기관 = V1 V4 V5 V6 V8 + 필지 카드 + 오류 신고(V2 V3은 LX 몫 — two-tier) · 해외 기관 = 글로벌 사다리 + locale.

### 3.2 영상 층 스택(줌 사다리) — 글로벌 → 전국 → 지역, 실자산 ID

한 지도, 두 반구. 카메라 중심의 국가 코드(Natural Earth hit-test)로 사다리를 고른다. 페이지 이동 없음.

**국내**

| 줌 | 배경 | 전환 조건 | 자산 · 소스 |
|---|---|---|---|
| 0–5 | GIBS VIIRS NOAA-20 TrueColor **어제 날짜** | 글로브(`vertical-perspective`) | `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_NOAA20_CorrectedReflectance_TrueColor/default/{YYYY-MM-DD}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg` (CORS `*`) |
| 5–19 | xdworld Satellite(키 없음 · 2026-03 갱신 · z19 ≈ 0.25m) — **공개 모드에서 유일한 영상 층(R6)** | 기본 | A13 — `maxZoom 18.4 → 19` 교정 · Hybrid 라벨 z6–19 토글 |
| 9–13 | **[v1.1 R13] GIBS HLS S30 30m 일자별**(Sentinel-2 계열 위성 · 키 없음 · CORS `*` · 2026-09-24 검증) — 위성 → 항공 → 드론 세 층을 실제로 잇는 국내 위성 층. 국토위성 CAS500 = `미확보` | 토글 · 날짜 스크러버 | `…/HLS_S30_Nadir_BRDF_Adjusted_Reflectance/default/{date}/GoogleMapsCompatible_Level12/{z}/{y}/{x}.png` |
| 10–18 | **2023 25cm 비도시 항공(남원 159도엽 · 100% 커버 · 권리 확인 중 — 'LX 보유' 표현 보류)** · 전주·익산·김제는 같은 스크립트로 추가(7분/지구) | 카탈로그 footprint 안 · **로그인 사용자만** | C01 → P3 완료 `02. 데이터/tiles/pmtiles/namwon_ap25_2023.pmtiles`(88,404타일 · 946MB · z10–18 [실측]) |
| 11–17 | 남원 전역 2시점(2m 웹) | footprint 안 | A03 |
| 12–19(22) | 남원 AOI 4시점 1.08~1.69cm · 국산리 5cm · 본사 3.42cm · AXIS 익산 1.36cm · 석면 3세트 | footprint 안 | A01 · A09 · B03 · B04 · B06 (COG → TiTiler 동적 또는 PMTiles) |
| 필지 | **국토정보기본도 2.0 PMTiles z12–17(PNU·지목·공시지가, 키 없음)** → V-World 키 복구 시 `LP_PA_CBND_BUBUN` WMS·GetFeature 덧댐(프록시) | z15+ | C04(P8) · E01 |
| 참조 | 전국 하천 벡터타일(변환 없음) · 하천 점유 651,478 · 시도/시군구/읍면동 · 드론맵 커버리지 136,025셀 | 토글 | A05 · B02 · A11 · B07 |
| 지형 | 로컬 terrain-namwon z9–13 → AWS Terrarium z≤15 → 본사·용지 DSM terrarium(cm급) | V7 장면만 | A08 · E02 · B03 · C02 |
| 폐쇄망 폴백 | EOX s2cloudless-2017(CC BY) 한국 z0–10 로컬 PMTiles + C01/A03 + A11 무채 채움 · 캡션 `오프라인 · 로컬 배경` | 외부 호스트 실패 | MASTER-PLAN E3-3 |

**글로벌**

| 줌 | 배경 | 오버레이 |
|---|---|---|
| 0–5 | GIBS TrueColor 어제 | Natural Earth 국경(`cdn.jsdelivr.net/npm/world-atlas@2/countries-50m.json`) · **LX 사업국 38+1 채색**(ISO3) · USGS `all_day.geojson` 1분 폴링 · GIBS 화재 · EMS 최신 활성화(사전 수집) |
| 5–9 | EOX `s2cloudless-2025`(비상업 · 공공 시연) / **`-2017`(CC BY · 수출 배포본 기본값)** | geoBoundaries KGZ ADM1/ADM2(`media.githubusercontent.com/.../geoBoundaries-KGZ-ADM2_simplified.geojson`) · Terrarium hillshade |
| 9–14 | PC Sentinel-2 L2A **월별 모자이크**(`mosaic/register` → searchid) · GIBS HLS 30m | WorldCover(PC item 타일 `colormap_name=esa-worldcover`) · NDVI(`expression=(B08-B04)/(B08+B04)&asset_as_band=true&rescale=-0.2,0.8&colormap_name=rdylgn`) · Esri LULC 2017→2025 |
| 14–18 | PC S2 장면(10m) → **Maxar Open Data 0.5m**(미얀마만 · CC BY-NC 시연 한정) | Overture buildings PMTiles(`overturemaps-extras-us-west-2.s3.us-west-2.amazonaws.com/tiles/2026-09-23.0/buildings.pmtiles` · 높이 포함) · EMS 피해 점(사전 수집) |

라이선스 가드는 **서버**가 지킨다: 카탈로그 `license`가 `CC-BY-NC*`이면 `build=export`에서 게이트웨이가 목록에서 뺀다. z/x/y 순서 차이(EOX·GIBS = `{z}/{y}/{x}`, xdworld = `{z}/{x}/{y}`)는 `sources.js` 한 곳에서만 처리.

### 3.3 실시간 분석 프레임 — 요청 → 쿼터 → 큐 → GPU 워커 → 타일 스트리밍 도착

```
XI맵 V2 프레임 / 카드·모델·영상 선택
 └▶ POST /api/v1/jobs/quote   면적·shard 수·예상 GPU·s [추정, models.perf 실측 계수]·할당 잔여·허용 여부 → 견적 카드(봉투)
 └▶ POST /api/v1/jobs          할당 통과 → jobs 행 + Redis XADD jobs:{pool}
      scheduler   AOI → shard(1024px 칩 · 20% 겹침, car_v1/infer_orthomosaic.ipynb 방식) → XADD shards:{pool}
                  우선순위 P0 시연/대화형 · P1 기관 배치 · P2 재학습 · P3 backfill · 기관 가중 공정 분배(deficit RR) · VRAM 인지 입장
      gpu_worker  (GPU 1장 = 프로세스 1, CUDA_VISIBLE_DEVICES) XREADGROUP → rasterio window read(COG 로컬 또는 /vsicurl/)
                  → 배치 추론 → 칩 내 NMS → 폴리곤(원 CRS→4326) → COPY detections(ON CONFLICT DO NOTHING)
                  → XADD events:{job} shard.done{bbox,n,polys_url} · 계량 usage_events(gpu_s, basis=measured)
      cpu_worker  전 shard 완료 → 전역 NMS → PMTiles 스냅샷(ogr2ogr -f PMTiles) → snapshot.ready
 └▶ GET /events/jobs/{id} (SSE)  queued → shard.started → shard.done → job.done{counts} → snapshot.ready
 └▶ job-theater  shard 격자(대기 점선 → 실행 청록 스캔 빔 → 완료 = 칸이 걷히고 그 칸의 결과가 S1 락온으로 도착)
                 HUD `탐지 1,284 · shard 96/240 · GPU0 71% · 1.9칩/s` [실측·지금]
```

- **[v1.1 R9]** 위 HUD 문구 `탐지 1,284 · shard 96/240 · GPU0 71% · 1.9칩/s`는 **[예시]**다. 잰 값은 F1-B bench 뒤에만 쓴다. 지금 알려진 실측은 P4 재추론의 **1024칩 약 26칩/초/GPU(읽기 포함 · best.pt · Ollama 23.4GB 동시 점유 조건)** 하나다.
- **[v1.1 R10]** GPU는 Ollama `llama-server` 4개가 장당 23,396 MiB를 쓰고 있다 [실측 2026-09-24]. **종료하지 않는다.** 워커는 시작 시 `memory.used`를 읽어 예산 `free − 2GB` 안에서 batch를 정하고(`workers/vram.py`), 관제 GPU 행은 `외부 점유` 띠를 항상 그린다. bench 결과에는 `external_used_mib` 조건이 같이 기록된다.
- **[v1.1 R2] J2b 비닐하우스 재추론**: `namwon/Vinyl_house/train2`(YOLO11x-seg · 단동/다동 · mask mAP50 .938 · 드론 cm 학습)를 P3 25cm 남원 159도엽에 워커 작업으로 돌린다(`kind:'reinfer'` · P1 우선순위 · 어댑터 `yolo_seg` · 옵션 `upsample: 2|4`를 A/B로 한 도엽 먼저). 결과 `results/lx/namwon-greenhouse-2023-vh` · 표기 `도메인 이식(드론 → 항공 25cm) · 검수 전`. A02 1,674(2025 드론 AOI)·기록상 27,676과의 대조는 읍면동 표로만 낸다 — 어느 쪽도 정답이 아니다.
- **[v1.1 R4] G-J1 글로벌 지수 계산**: 같은 `POST /jobs` → SSE 경로로 CPU 워커가 돈다. `kind:'index'` · 어댑터 `global/ndvi_pc`(PC STAC 검색 → SAS 토큰 → B04·B08 창 읽기 → 농지 마스크(WorldCover 40) 안 평균 NDVI) · shard = 2025-03 … 10 월 8칸 · `shard.done{month, ndvi_mean, n_scenes}`. HUD 표기 `지수 계산 · 모델 추론 아님`. PC 장애 시 `basis:'recorded'`로 G2 캐시를 같은 이벤트 형식으로 재생.
- **`demo:true`(영업)**: 같은 파이프라인이 실제 GPU로 돌되 `detections` COPY와 기관 `usage_events`를 건너뛴다 — **[v1.1 §10.4] 단 `tenant_id='lx-demo'` 계량 행은 남긴다**(관제 스윔레인·GPU 합계 정합). 워커가 없는 환경(외부 시연 노트북)에서는 `api.js`가 저장 결과(A02 등)를 같은 이벤트 형식으로 재생하고 마스트에 `시연 · 저장 결과 재생`을 단다. 두 경우 모두 `basis:'demo'`.
- **실패 회복**: 워커 하트비트 10s · 30s 끊기면 `XAUTOCLAIM`으로 shard 회수 · shard id `{job}:{row}:{col}` 멱등.
- **첫 실추론 조합(Phase 0)**: J1 = B04 익산 황등 1.36cm × B05 차량 OBB(mAP50 .992) — 추론 노트북이 완성돼 있고 검수 라벨 2,462건(GT)이 있어 **정답 대비 일치율을 화면에 실측으로 낼 수 있다**. J2 = C01 25cm 남원 도엽 × C09 4클래스 — 이 PC에 없는 비닐하우스 27,676건 결과를 **실제 재추론으로 대체**. J3 = B03 본사 3.42cm × B05 + D11 SAM2. J5 = Maxar 메이크틸라 사후 COG × C09 [시연 · 도메인 이식 실험].
- 처리량은 아직 한 번도 재지 않았다. `server/bench/throughput.py`가 모델 × A6000 칩/s를 재서 `models.perf`에 쓰는 것이 Phase 0의 **첫 작업**이다. 화면의 "예상 소요"는 이 값에서만 나온다.

### 3.4 결과 층 — 누적 · 시계열 · 검수 · 통계 · 보고서

| 층 | 내용 | 정본 → 전달 |
|---|---|---|
| 누적 | 배포본별 결과 job이 쌓인다. 레이어 패널은 카드 배포본 순으로 결과 목록 · 실자료 있는 줄만 켜진다(없는 줄 = `시연 · 지도 미연결`) | PostGIS `detections`(RLS) → 불변 PMTiles 스냅샷 `results/{tenant}/{job}.pmtiles` |
| 시계열 | V5 스크럽 + 변화 지수(비지도 · 학습 결과 아님 표기) · 변화 히스토그램 | A04 · 재추론 diff(§4.3 shadow) |
| 검수 | 편집(선택·이동·삭제)은 **LX staff만**(`PATCH /results/{job}/features/{fid}`), 기관은 `POST /feedback`(오탐·누락 · fid · pnu · lnglat) → LX 라벨링 큐 | `edit_state raw|edited|deleted` · `feedback` |
| 통계 | 우 서랍 `stats-standard?task=&embed=1` — 지역별/클래스별 · 기간 칩이 `analyzedAt` 실필터 · 읍면동 집계는 P10 사전 계산 + 서버 `stats` | `stats` 테이블 |
| 보고서 | 우 서랍 `report-standard-issue/-standard` — 접수→생성→완료(`flow.js` 시계, 시연 표기) · CSV BOM · 요청자 = 현재 계정 | – |
| 프로비넌스 | 모든 숫자 봉투 `{value, unit, basis, as_of, source}` → `provenance.js`가 칩으로 렌더, 봉투 없으면 그리지 않는다 | 서버 직렬화기 강제 |

### 3.5 연계

- **분석 서비스 → XI맵**: `analysis-ai` 실행 탭 '지도에서 프레임 잡기 ›' → `ximap.html?card=&model=&pick=frame` → 프레임 확정 → `?frame=` 회수 → `POST /jobs`.
- **프로젝트 → XI맵**: `ai-project-work?tab=analysis`가 같은 pick 프로토콜. 학습(`/api/train` 큐, Phase 1)은 `flow.js` 시계 → 실 epoch 이벤트로 교체.
- **대시보드 → XI맵**: 격자 판 배포본 셀 클릭 → `ximap.html?result=`.
- **필름 → XI맵**: `sessionStorage.lx_cam {center, zoom, bearing:0, pitch:0, t}` 규약(S4). 카메라를 끊지 않는다.
- **포털 → XI맵**: 카드 덱 호버 → 배포본 범위로 flyTo · 지도 탭 = XI맵 기관 모드(`?svc=`).
- **서비스 지원 → XI맵 → 프로젝트**: 문의(오탐) `pick=point` → `feedback` → 검토 데스크 '라벨링 큐로 보내기 ›'.
- **관제 → XI맵**: 운영 현황 배포 지도의 실행 중 job AOI 점 클릭 → 그 job의 XI맵(`?job=`).

---

## §4. 관리자 관제 — LX/OPS(:8702 · 잉크 반전 · OPS-GRID)

관리자 사이트는 별도 origin(:8702, Phase 1 `ops.` 호스트명 + 터널)이다. LX 직원 쿠키로는 열리지 않고 IP allowlist 안에서만 연다. 화면 8, 전부 **실측 · 측정 시각 표기**. 관제·할당·배포 세 기둥은 같은 `deploys` · `usage_events` 행에서 계산한다.

| # | 화면 | 구성 | 실측 데이터 출처 | 제어 |
|---|---|---|---|---|
| ① | **운영 현황**(첫 화면) | 중앙 판 = 전국/세계 배포 지도(잉크 스타일 · DEPLOYS 7점 상태색 · 실행 중 job AOI 점 S1 도착 · `actionsFor` high = 긴급 맥동 6s) · 좌 결재 대기(실카운트) · 우 노드 요약·최근 경보 | `deploys` · `jobs` · `ops_alerts` · `approvals` | 결재 → 검토 데스크 |
| ② | **인프라 관제** | 노드 카드(호스트 · GPU 행: 이름 · 사용률 스파크라인 60s · VRAM 링 used/total · 온도 · 전력 · 현재 job) — 지금 노드 1(Threadripper 3995WX 64C · 512GB · A6000 48GB×2), **향후 노드 2(A100 80GB×4 각) = `등록 대기` 점선 자리** · 작업 대기열 스윔레인(행 = GPU · 가로 = 최근 30분 · 블록 = job) · 모델 배치 매트릭스(모델 × GPU 상주 · VRAM 막대 · 처리량 bench) · 스토리지 링(E: 2,085GB 여유 / D: 363 / C: 124 [실측] · 등급별 raw/tile/result · 기관별) · **[v1.1 R10] GPU 행마다 `외부 점유` 띠(Ollama llama-server · 23,396 MiB [실측] · 프로세스 이름만 — WDDM이라 프로세스별 VRAM은 N/A)** · 경보 스트립 · 용량 계획(`infra.js capacityPlan` **[추정]** 별도 칸) · 타일 트래픽은 2차 | **[v1.1 R11]** nvidia-smi 폴러 2s(`C:\Windows\System32\DriverStore\FileRepository\nv_dispui.inf_amd64_f2b06cc19dadc00f\nvidia-smi.exe --query-gpu=index,name,utilization.gpu,memory.used,memory.total,temperature.gpu,power.draw --format=csv,noheader,nounits` [실측 경로] + `--query-compute-apps=pid,process_name`) → **Redis `ops:gpu:{idx}` 해시 + `ops:gpu` 스트림(F1-C `server/ops/gpu_poller.py`)** → 게이트웨이 `GET /api/v1/ops/gpus` · `GET /events/ops`(SSE 2s) · Redis `XINFO` · `du` 60s 캐시. Prometheus는 Phase 1 | 취소·재큐·우선순위·선점 · 모델 상주 고정/해제 · 풀 이동 · 노드 가입 토큰 발급(`POST /ops/nodes/join-token`) · drain |
| ③ | **기관·할당** | 좌 기관 목록(lx · namwon · gwangju-jeonnam · kgz-agri · kgz-land) · 우 쿼터 링 6(storage_gb · gpu_s_month · area_km2_month · concurrent_jobs · egress_gb_month · vworld_calls_day) 사용 실측 vs 한도 · 초과 정책(queue_low · reject · notify) · **데이터 격리 표시**(`tenants/{id}/` 접두어 · RLS · 서명 URL · "LX 원본 보관 · 타일만 공유") · 견적 대비 실측 ±% · 포털 CI 라이브 미리보기 · 화면 요구(REQUESTS) 타임라인 | `quotas` · `usage_events`(월 파티션) · `du` | 한도·정책 편집(승인 기록) — **T-1**: 슬라이더를 끌면 링 여유 구간 500ms로 자라고 초과 예상 월이 [추정] 점선 고스트 |
| ④ | **배포 제어** — **[v1.1 R3] 1차 범위(F1-C)** | 카드 × 기관 매트릭스(행 = CARDS 9 · 열 = TENANTS 6 · 셀 = stage 색 + 버전 칩) · 셀 열람 판: 버전 고정(`VERSION_RULE` major/minor/patch) · 단계 배포(`draft → shadow → canary → ga`) · 롤백(직전 스냅샷 PMTiles로 즉시) · **이식(`POST /deploys {from_deploy_id, tenant_id, region_profile, aoi}` = 같은 카드 버전으로 배포본 하나 더 · draft로 시작 · 결과 0)** · 모듈 on/off(공통 7 잠금 · 전용 n) · 모델 교체(mAP 실측 비교 — `best.pt`는 `체크포인트 내장 지표 .886`만 있어 비교 대상 표기) · GPU 풀 배치 · 승인 흐름(2인 승인은 정책 — Q-E ③) · 계보 띠(S2) · shadow diff S6 검토(2차) · 능동 운영 판(2차) | `card_versions` · `deploys` · `approvals` · `audit_log` · `models.metrics` | rollout · rollback · approve · pin · modules · model · gpu_pool · **port** — **R-1**: 롤백 시 배포 지도 점이 앰버 380 → 이전 버전 색으로 정착, 계보 띠 한 칸 되감김, 결과 층 스냅샷이 `snapshot_prev`로 바뀐다 · **P-1(이식)**: 소쿨룩 경계로 draft 셀이 S1 도착 |
| ⑤ | **카드 발행 관리**(검토 데스크) | 승인 = 증거판(요청 지역 실결과 S1 도착) → 카드 clip-path 1s 현상 → **기관 카드 덱 미리보기**(Q3) → `deploys` 행 · 반려 = 행 clip-path 750 퇴장 — **A-2** | `approvals` | 승인·반려·재요청 |
| ⑥ | 데이터 관리(공유) · ⑦ 서비스 관리 5 · ⑧ MY | 원본 기능 그대로 · 잉크 반전 골격 | – | – |

**경보 규칙(초기 `config/alerts.yaml` · 임계는 [목표], 운영 2주 뒤 실측 분포로 조정)**: GPU 온도 > 85°C 5분 · VRAM > 95% 5분 · 워커 하트비트 30s 누락 · 큐 대기 p95 > 10분 · E: 여유 < 200GB · V-World 일일 호출 80% · PC API 오류율 > 10%(15분) · job 실패율 > 5%(1시간) · 백업 실패.

**`infra.js` 교정**: `CAPACITY.gpuCards: 4`는 실장비(A6000×2)와 다르다 → `nodes` 테이블의 등록 장비로 대체. 견적 계수(`RATES` 2.8 GB/km² · 0.9 GPU·h/km²)는 `quota/estimator.py`로 옮겨 **견적**으로만 쓰고 bench·계량 실측으로 보정한다. 관제 화면은 견적과 실측을 나란히 두고 차이를 숨기지 않는다.

**관제 화면 원칙(V 채택)**: 값이 바뀔 때만 움직인다(2s 폴링 · 40ms 현상) · 앰버 = 주의(임계 80% 초과) 글자·눈금 상시 허용(Ops 무대 한정) · 빨강 = 장애 · 데이터 잉크 차트 · Grafana 임베드 없음(게이트웨이가 PromQL 대리 질의 → 우리 문법으로 그린다).

---

## §5. 백엔드 아키텍처

### 5.1 컴포넌트도

```
┌──────────────── EXPERIENCE PLANE (정적 배포 · 빌드 없음 · 오프라인 벤더링) ─────────────────┐
│ ① scrub 필름  ② LX 워크벤치  ③ LX/OPS(:8702 별도 origin)  ④ 기관 포털×n  ⑤ Global(locale)   │
│      └── landxi/engine: lx-map.js(MapLibre 5.6.0 globe·terrain·sky) + deck 9.3.10 interleaved      │
│          + three 0.185.1 CustomLayer + pmtiles 4.5.0 · fx/{arrive,timescrub,swipe,frame,           │
│          job-theater,extrude,filament,provenance,lineage} · tier.js(T1/T2/T3) · api.js(봉투·SSE·폴백) │
└────────────┬──────────────────────────────────────────────────────┬──────────────────────────────┘
             │ HTTPS /api/v1/* · /tiles/* · SSE /events/*             │ :8702 admin only · IP allowlist
┌────────────┴──────────────── SERVICE PLANE · FastAPI 게이트웨이 :8700 ┴──────────────────────────────┐
│ auth(realm=lx|tenant) · catalog(STAC 유사 · license·gsd·epoch·crs·tier) · tiles(PMTiles Range · COG=TiTiler lx만) │
│ proxy(V-World 키 주입·캐시 · PC · GIBS · FIRMS/EMS 크론) · jobs(quote·submit·SSE) · results(편집=lx만·feedback) │
│ registry(models·cards·versions·lineage) · deploy(rollout·rollback·approve) · quota(estimator·집행·계량) · ops    │
│ label(AXIS-Label D10 프록시 :8001)                                                                            │
└──────┬───────────────────────┬─────────────────────────────┬────────────────────────┬────────────────────────┘
       │ Redis Streams :6380   │ PostgreSQL 16 + PostGIS 3   │ E:/landxi-data/        │ Prometheus :9090
┌──────┴──────────┐  ┌────────┴──────────────┐  ┌───────────┴─────────────┐  ┌───────┴──────────────────┐
│ COMPUTE PLANE   │  │ :5433 · RLS           │  │ DATA PLANE              │  │ OBSERVABILITY            │
│ scheduler       │  │ tenants·users·quotas· │  │ raw/(경로 목록만 · 라우트 0)│  │ nvidia-smi 폴러 2s       │
│ gpu_worker×GPU  │─▶│ usage_events·imagery· │  │ cog/ · pmtiles/{basemap,  │  │ (Phase 2 DCGM exporter)  │
│ (A6000×2 →      │  │ models·cards·versions·│  │  imagery,reference,results}│  │ windows_exporter         │
│  A100×4 ×2)     │  │ deploys·approvals·    │  │ parquet/ · cache/ · models/│  │ Alertmanager → ops_alerts │
│ cpu_worker      │  │ jobs·detections(분할)·│  │ tenants/{id}/ · _tmp/     │  │ JSON 로그 job/tenant/shard│
│ (타일링·스냅샷) │  │ feedback·nodes·alerts │  │ (Phase 2: MinIO S3)       │  │ (Phase 1 OTel trace_id)   │
└─────────────────┘  └───────────────────────┘  └─────────────────────────┘  └──────────────────────────┘
```

**원칙 다섯**: (1) 단계가 바뀌어도 API 경로·스키마·스트림 이름·저장 키·프론트 코드는 같다. (2) 프론트는 빌드 없는 정적 배포, 서버가 죽어도 `[시연 · 서버 연결 없음]` 폴백. (3) 원본은 LX 밖으로 나가지 않는다 — 게이트웨이에 원본 라우트가 없다(R7). (4) 모든 숫자는 출처 봉투를 가진다. (5) 관제·할당·배포는 한 기록에서 나온다.

**실행 환경(이 PC)**: 게이트웨이·워커 env = `landxi-srv`(`gcs` 복제: GDAL 3.12.4 · rasterio 1.4.4 · rio-cogeo · geopandas · torch 2.5.1+cu118 + fastapi · uvicorn · asyncpg · redis · titiler.core · pmtiles · argon2 · prometheus-client · ultralytics 8.3.234). 포트 :8700/:8702/:6380/:5433/:9090 — 80·443·6379는 cleanriver Docker가 쓴다 [실측]. Redis = 로컬 `redis:7-alpine` 이미지의 별개 인스턴스 · PostGIS = `postgis/postgis:16-3.4`(1회 pull) · Docker 29.6.2 가동 중 [실측]. `tools/serve.mjs`는 그대로 두고 `/api` `/tiles` `/events`만 :8700으로 역프록시(20줄).

### 5.2 API 목록(v1)

| 메서드 · 경로 | realm | 무엇 | 실데이터 |
|---|---|---|---|
| `POST /auth/login` · `/logout` · `GET /me` | lx · tenant(별도 표) | 세션(argon2 · SameSite=strict). 응답에 realm·role·tenant_id | Q1 ②를 서버가 강제 |
| `GET /catalog/layers?bbox=&z=&locale=&build=` | 공통 | 소스 사다리 + 보유 영상 + 결과 레이어. 항목마다 license·attribution·gsd·epoch·crs·tier(raw/tile/result) · **비상업 항목은 export 빌드에서 제외** | A01–A13 · C01 · 글로벌 URL |
| `GET /catalog/imagery/{id}` | 공통(원본 경로는 lx admin만) | 영상 메타 | imagery.js 이관 |
| `GET /tiles/pmtiles/{set}.pmtiles` | 서명 URL(HMAC 10분) | Range 206. 기관 전용 세트는 서명 필수, 공용 참조(A05 등)만 무서명 | P1 산출 |
| `GET /tiles/cog/{item}/{z}/{x}/{y}.webp` | lx | TiTiler 동적 타일 — **COG 사본**만 연다 | B03 · B04 · B06 · C01 |
| `GET /proxy/vworld/{wmts|wms|data|search|address}` | 공통 | 키 서버 주입 · `domain` 주입 · 디스크 캐시 · ACAO · 일일 한도 계량 | E01(키 갱신 대기) |
| `GET /proxy/pc/{stac|tiles|stats|mosaic}` · `/proxy/{gibs|usgs}` · `/feeds/{firms|ems}` | 공통 | PC 호출 한 곳(무SLA → 캐시 + 자체 TiTiler 전환점) · FIRMS/EMS는 크론 정적 JSON | global-map §1 |
| `POST /jobs/quote` | lx · tenant | 면적 · shard 수 · 예상 GPU·s [추정] · 할당 잔여 · 허용 여부 | `quota.estimator` |
| `POST /jobs` | staff · tenant(권한) · sales는 `demo:true`만 | 제출. `demo:true` = 결과 미기록 | – |
| `GET /events/jobs/{id}`(SSE) | 제출자 · admin | `queued → shard.started → shard.done{bbox,n,polys_url} → job.done{counts} → snapshot.ready` | job-theater 입력 |
| `DELETE /jobs/{id}` · `POST /jobs/{id}/{requeue,priority}` | 제출자 · admin | 취소 · 재큐 · 우선순위 | – |
| `GET /results/{job}/features?bbox=` · `PATCH /results/{job}/features/{fid}` | 조회 권한자 / 편집 **lx staff만** | 결과 조회 · 수정(품질 책임 = LX) | – |
| `POST /feedback` | tenant | 오탐·누락 신고(fid · pnu · lnglat · kind) → 라벨링 큐 | 피드백 고리 |
| `GET /registry/{models|cards|lineage/{id}}` | lx | 모델·카드·계보(데이터셋→run→모델→카드 버전→배포본→기관→job) | B01 · D03 · D04 · B05 · C09 |
| **[v1.1 R3]** `GET /deploys` · `GET /deploys/{id}` · **`POST /deploys`**(신규 = 이식: `from_deploy_id` 또는 `card_version_id` + `tenant_id` + `region_profile` + `aoi` → stage `draft`) · `POST /deploys/{id}/{rollout|rollback|approve|pin|modules|model|gpu}` | lx admin(GET은 lx 전체 · 기관은 자기 것) | 목록 · 이식 · 단계 배포 · 롤백(스냅샷 `current ↔ prev`) · 승인 · 버전 고정 · 모듈 · 모델 교체 · 풀 | cards.js DEPLOYS 이관(`basis:'history'`) · 요청/응답 JSON은 `F1-CONTRACT.md §6` |
| **[v1.1 R8]** `GET /events/ops`(SSE 2s) · `GET /tiles/sign?set=` | lx admin / 조회 권한자 | 관제 텔레메트리 스트림 · 서명 URL 갱신(12h) | `F1-CONTRACT.md §4·§5` |
| `GET /ops/{nodes|gpus|queues|storage|alerts|models}` · `POST /ops/nodes/join-token` · `POST /ops/models/{id}/{load,unload}` | lx admin(:8702만) | 관제(§4) | nvidia-smi · Redis · PG · df |
| `GET /t/{tenant}/usage` · `PUT /tenants/{id}/quota`(admin) | tenant 본인 / admin | 기관 포털 MY 사용량 · 한도 편집 | `usage_events` · `quotas` |
| `GET /api/label/*` | lx staff | AXIS-Label(D10 FastAPI+SQLite+SAM2·DINOv2·YOLO) 프록시 :8001 | B04 라벨 2,662 |

모든 숫자 필드는 봉투로 나간다. 예: `{"value":2098,"unit":"필지","basis":"measured","as_of":"2026-06-08","source":"results/namwon-farmland-2025.geojson"}`. 개발 모드에서 봉투 없는 숫자는 500.

### 5.3 저장소

```sql
tenants(id, name, kind 'maker'|'user', scope 'local'|'global', crs, locale, profile_id)
lx_users(id, login, pw_hash, role 'admin'|'staff'|'sales', status)
tenant_users(id, tenant_id fk, login, pw_hash, role 'manager'|'viewer', status)       -- LX users 와 다른 표(Q1 ②)
quotas(tenant_id, dim, soft, hard, policy 'queue_low'|'reject'|'notify')
usage_events(id, tenant_id, dim, amount, job_id, basis 'measured'|'estimate', at)     -- 월 파티션
imagery(id, name, tier 'raw'|'tile'|'result', gsd_m, epoch, crs, footprint geom, path_internal, pmtiles_set,
        license, attribution, export_policy 'never'|'tenant'|'public',
        security_review 'pending'|'cleared'|'n/a', rights_holder, asset_ref)        -- [v1.1 R6] public 은 security_review='cleared' 일 때만
models(id, family, version, weights_uri, sha256, task 'seg'|'obb'|'det'|'index', classes, metrics, perf /*bench + external_used_mib*/, status,
       image, tile_size, infer_shape)                                                -- [v1.1 §10.6] 원본 카드 편집 폼 필드(도커 이미지·타일링 크기)
deploys(…, from_deploy_id, snapshot_current, snapshot_prev)                           -- [v1.1 R3] 이식 계보 · 롤백 스냅샷
cards(id, name, scope, domain, kind)  card_versions(id, card_id, version, model_ids[], modules, changelog, approved_by, approved_at)
deploys(id, tenant_id, card_version_id, region_profile, aoi geom, status, stage 'draft'|'shadow'|'canary'|'ga'|'rolled_back', pinned, gpu_pool)
approvals(id, subject_type, subject_id, requested_by, decided_by, decision, reason, at)
jobs(id, tenant_id, deploy_id, card_version_id, source_imagery_id, aoi geom, priority 0..3, demo, state, shards_total, shards_done, gpu_s_measured, …)
detections(id bigserial, tenant_id, job_id, cls, conf, area_m2, geom MultiPolygon 4326, pnu, emd, edited_by, edit_state) PARTITION BY LIST (tenant_id)
feedback(id, tenant_id, job_id, fid, pnu, lnglat, kind 'fp'|'fn'|'other', state, at)
nodes(id, hostname, role, gpus jsonb, pool, joined_at, last_seen)  ops_alerts(…)  audit_log(…)  stats(…)
```

- **PostGIS = 편집 가능한 정본, PMTiles = 불변 전달 스냅샷, GeoParquet = 보관·교환, GeoJSON/GPKG = 기관 다운로드.** 결과는 편집되므로(LX 품질 책임) 트랜잭션 저장소가 필요하고, 지도 전달은 불변 스냅샷이 빠르고 캐시가 쉽다.
- 파일 배치 `E:/landxi-data/{raw,cog,pmtiles/{basemap,imagery,reference,results/{tenant}},parquet,cache/{vworld,pc,gibs,ems,firms},models,tenants/{id}/{uploads,exports},_tmp}` (E: 여유 2,085GB · C:는 124GB뿐이라 `CPL_TMPDIR=E:\_tmp` [실측]).
- 시드: `seed_from_cards_js.py`가 cards.js MODULES/CARDS/DEPLOYS와 results GeoJSON을 그대로 적재하고 `countCheck()`를 서버 unit 테스트로 이식 — 2,098 · 1,674 등 건수가 1건이라도 다르면 실패(콘티 정합).

### 5.4 전처리 파이프라인(멱등 스크립트 · 산출물은 카탈로그 자동 등록)

| ID | 입력 → 산출 | 소요[추정] | 차수 |
|---|---|---|---|
| P1 | A01–A10 XYZ 12세트 6,822파일 → MBTiles → `pmtiles convert`(go-pmtiles 설치) → 12 .pmtiles | 0.5일 | 1차 |
| P3 | C01 전북비도시 남원·익산 도엽 → `gdalbuildvrt -a_srs EPSG:5186`(TFW에 CRS 없음) → `gdal raster tile` WEBP z10–18 → PMTiles + COG | 0.5–1일 | 1차 |
| P6 | B01 5종 `results.csv`·PR·confusion·val_pred → `models` 행 + WebP | 0.5일 | 1차 |
| P8 | C04 국토정보기본도 2.0 남원 → `ogr2ogr -t_srs EPSG:4326 -f PMTiles -dsco MINZOOM=12 -dsco MAXZOOM=17` → `parcels_namwon.pmtiles` | 0.5일 | 1차 |
| P15 | B04 AXIS 2장 → COG · `axis.db` 라벨 픽셀→5186→4326 GT GeoJSON(J1 비교용) | 0.5일 | 1차 |
| P17 | nvidia-smi 폴러 + Prometheus + windows_exporter | 0.5일 | 1차 |
| G1 · G2 · G4 | geoBoundaries KGZ ADM0–2 정적 · PC statistics 캐시(`ysykata-landcover.json` · `ysykata-ndvi-2025.json`) · EMS EMSR798 AOI11/04 ZIP → `builtUpP` GeoJSON → Overture 최근접 조인 15m → `mm-meiktila-damage.geojson` | 0.8일 | 1차 |
| P4(=J2) | P3 × C09 → 작업 큐로 실행 → `results/lx/namwon-landcover-2023` | GPU [측정 과제] | 1차 말 |
| P9 | V-World 프록시 + 캐시(키 갱신 시 즉시 활성) | 0.5일 | 1차 |
| P10 · P13 · P14 · P5 · P11 · P12 · G3 · G5 · G6 | 읍면동 집계 · B02 하천 점유 PMTiles(tippecanoe WSL) · B03 본사 COG/DSM terrarium/OBJ→GLB · B09 GT 모자이크 · Terrarium 미러 · 벤더링 · MS 건물 KGZ · Maxar PMTiles · FIRMS/EMS 크론 | 4–5일 | 2차 |

설치할 도구: go-pmtiles exe · WSL `tippecanoe` · Node `obj2gltf` · (선택) PDAL. ECW(C05·C07)는 QGIS 3.28.3으로 GeoTIFF 변환 후.

### 5.5 확장 경로 — A6000×2 → A100×4 × 2

| 단계 | 배치 | 바뀌는 것 | 바뀌지 않는 것 |
|---|---|---|---|
| **Phase 0**(이 PC · 약 2주) | Docker Redis/PostGIS · 게이트웨이 · GPU 워커 2 · `pool:a6000` · serve.mjs 역프록시 · NSSM 서비스 상주 | – | – |
| **Phase 1**(단일 노드 운영 · 4–6주) | nginx TLS·역프록시 · cloudflared 터널(별도 호스트명) · 관제 ②–⑧ · 쿼터 집행 · shadow/canary/rollback · 포털이 API를 읽음 · `pg_dump` 일 1회 + PMTiles D: 주 1회 · WSL2 워커 이관 검토(드라이버 522.06은 CUDA 12 이미지와 맞지 않을 수 있음 — 갱신은 사용자 승인) | 배치 위치 | API · 스키마 · 스트림 · 저장 키 · 프론트 |
| **Phase 2**(A100×4 서버 2대) | 제어 평면(게이트웨이·PG·Redis·Prometheus·MinIO 메타)은 별도 VM 또는 현 Threadripper — GPU 노드에 상태 없음 · GPU 노드 n1/n2 = k3s 에이전트 + NVIDIA device plugin · **MIG**로 작은 모델(OBB 118MB · n-seg) 슬라이스, x-seg·SAM2·재학습은 풀 GPU · `pool:a100-n1/n2` 가입 토큰 등록 · 현 PC = `pool:a6000` 개발·시연 전용(P0 시연이 운영 배치와 간섭 없음) · MinIO(S3 API, 경로 = 객체 키) · 노드 간 25GbE [목표] · compose → Helm | 오케스트레이션 · 저장 어댑터 1개 | 스케줄러·워커 코드 · 모든 인터페이스 |

Redis Streams + 자체 워커(약 600줄)를 Celery/Ray 대신 쓰는 이유: GPU 상주 모델·shard 스트리밍·선점을 다루기 쉽고, Windows Phase 0에서 돌며, 다중 노드 소비자 그룹을 그대로 지원한다. Ray Serve가 필요해지면 교체 지점은 `workers/` 한 폴더.

**서버 성능 예산 [목표 · Phase 0 운영 2주 뒤 실측으로 교체]**: API p95 ≤ 150ms(LAN) · PMTiles 타일 p95 ≤ 80ms · P0 시연 첫 shard 결과 ≤ 5s(AOI ≤ 0.25km² · 모델 상주) · SSE 지연 ≤ 500ms · 10만 피처 스냅샷 ≤ 60s · 동시 세션 Phase 1 ≥ 200 · Phase 2 ≥ 2,000.

### 5.6 보안·격리(다섯 겹)

1. **세션**: `realm=lx|tenant` 쿠키 분리. LX 셸 라우트는 realm=lx만, `/api/v1/t/{tenant}/*`는 realm=tenant이면서 id 일치일 때만.
2. **DB**: RLS `USING (tenant_id = current_setting('app.tenant_id') OR current_setting('app.realm')='lx')` — 요청마다 `SET LOCAL`. 기관 A 세션으로 기관 B 행을 볼 수 있는 경로는 SQL 수준에서 0.
3. **파일**: `tenants/{id}/` 접두어 밖 경로 거부.
4. **타일**: 기관 결과 PMTiles는 HMAC 서명 URL만 — **[v1.1 R12] 유효 12h + `GET /tiles/sign?set=` 갱신**(pmtiles 프로토콜이 헤더를 한 번 읽고 같은 URL로 Range를 이어 보내므로 10분은 세션 중 403이 난다). 프론트 `api-v1.js`의 `signedPmtiles()`가 만료 30분 전에 재서명한다.
5. **원본**: `imagery.tier='raw'` 서빙 라우트 없음 · COG 동적 타일은 realm=lx만 · 기관에는 구운 `tile` 등급만(R7).

추가: 키는 `server/.env`에만(V-World · SESSION_SECRET) — 현행 `env.js` 평문 주입은 운영 빌드에서 404 · gitleaks 스캔 · CSP `script-src 'self'`는 **[v1.1 §10.1] 2차 이후**(deck·three·gsap·lenis가 아직 CDN이고 pmtiles는 미벤더 — 1차에서 잠그면 화면이 깨진다) · CSRF 토큰 · 관리자 origin 분리 + IP allowlist + 세션 30분 + **2인 승인**(GA · 롤백 · 한도 상향) · 전 쓰기 작업 `audit_log` · 라이선스 가드 서버 강제.

---

## §6. 디자인 언어 v2 — `design/system-v2.md`

### 6.1 진단과 논지

현행 화면이 목업으로 읽히는 시각적 원인은 `design/system.md`의 여섯 줄 — 그림자 0 · 유리 0 · 이징 1 · 유휴 요소 1 · 3D 보류(D22) · 회전·피치 잠금 — 이 **인쇄물의 규칙으로 WebGL 매체를 묶은 것**이다(스크린샷 근거: `shots/audit-0923/map/crit-01-info-side-1440.png` 좌 목록판 48% · 불투명 흰 계기 · 평면 GIS 뷰어 / `shots/w0/E0-S/01-s1-arrived-1440.png` 방향은 맞으나 pitch 0 · 하드 엣지 HUD · 글로우 0 = "잘 만든 도면"). 게이트는 사용자 기준이 아니라 법전 기준으로 합격을 냈다.

v2 = **"밝은 종이 · 어두운 영상 · 빛나는 판독"** 세 무대(stage). 한 세트의 서체·액센트·모션 사다리·아이콘을 공유하므로 한 제품으로 읽히고, 무대마다 깊이·빛·재질 규칙이 달라 "지도는 살아 있고, 문서는 단정하고, 관제실은 어둡다"가 된다. `<body data-stage="paper|imagery|ops">` 하나로 토큰 세트가 바뀐다.

### 6.2 처분표 — 유지 · 폐기→개정 · 신설(근거 포함)

**유지(사용자 확정 · 그대로)**

| 조항 | 내용 | 출처 |
|---|---|---|
| 서체 | Paperlogy 700/800 + Pretendard 400/500 + Inter 400/500 tabular · 바닥 14px · +2 스케일 | 2026-08-27 T3 |
| 색 역할 | 바탕 #FFFFFF · 잉크 #010102 · 액센트 #006DF7 · 틴트 #E8F1FF/#D6E6FF · **청록 #0FA9A0 = AI 결과 · 앰버 #FFB633 = 탐지 순간 · 경고 #D1352B = 조치 글자만** · 채운 파란 버튼 없음 | T3 · 대시보드 리밸런싱 |
| 라운드 0(종이 무대) · 그리드(레일 72 · 마스트 64 · 마진 56 · 12열/24 · 원장 372 · 브래킷 12) | – | Vantor 실측 · 8/26 A안 |
| 콘티 원칙 · 메인 = 디오라마 필름 · 로그인 = 플랫폼 소개 · 대시보드 = 지도 없음 축소형 · 영상 크레딧 0 | – | 8/26 · 9/24 |

**폐기 → 개정**

| 현행 | 왜 목업을 만들었나 | v2 | 레퍼런스 장치 |
|---|---|---|---|
| 그림자 0 | 지도 위 패널이 판과 한 평면에 붙어 "지도 옆 표"로 읽힘(4·7차) | **깊이 4단**: elev-0 판(그림자 0) · elev-1 헤어라인 카드(종이) · **elev-2 떠 있는 패널(영상 무대 전용)** `background:rgba(255,255,255,.78); backdrop-filter:blur(16px) saturate(1.2); border:1px solid rgba(255,255,255,.55); box-shadow:0 1px 0 rgba(1,1,2,.06),0 12px 32px rgba(1,1,2,.14)` · elev-3 모달 `0 24px 64px rgba(1,1,2,.22)` + 딤 .35 | Apple Maps 시트(vibrancy) · Linear 패널 · kepler.gl 사이드 패널 |
| 유리 금지 | 사용자 원 확정(8/25)은 "밝은 지도 + **흰 유리 패널**" — 법전이 뒤집었다 | 영상 무대에서만 허용(위 elev-2). 문서 화면은 금지 | Mapbox Studio · Palantir Foundry Map |
| 그라디언트 0 | 데이터 램프·글로우·스캔까지 막아 AI 결과가 평면 채움 | UI 장식 그라디언트 0 유지. **데이터 표현(신뢰도 램프 · 이중 스트로크 글로우 · 스윕 꼬리 · 필라멘트 · NDVI 색상표)은 예외** | kepler 색 램프 · all4land 글로우 스트로크 |
| 이징 하나 | UI 반응·결과 도착·카메라는 물리가 다르다 | **이징 3**: `--e-ui (.22,1,.36,1)` 180 · `--e-arrive (0.15,1,0.3,1)` 500/750/1000/1250 · `--e-cam (.16,1,.3,1)` 1600/2400 | Apple 스프링 · scroll-craft lerp .12 |
| 지속 4단만 | 락온 380 · 호버 180 · 카메라 1600/2400이 이미 예외로 새고 있었다(E0-S) | **사다리 확장**: 40·60·80·120·180·380 / 500·750·1000·1250 / 1600·2400 | E0-S 실측 사용값 승격 |
| 유휴 요소 1개 | 지도 판은 타일 페이드·큐 맥박·카메라 관성이 본질적으로 동시에 움직인다 | **개수 규칙 → 예산 + 정직성 규칙**: Paper 1개 · Imagery는 **실데이터 이벤트(SSE·계측)에 묶인 것만** 프레임 예산 T1 2ms / T2 1ms 안에서 · Ops = 텔레메트리 갱신만(값 변화 시). 장식 모션은 여전히 0 | job-theater · kepler 시간 재생 · NASA Worldview |
| D22 3D 보류 · `dragRotate:false` | "WebGL급"의 90%는 카메라 연속성과 깊이. 평면 잠금이 GIS 뷰어 느낌의 원인 | **해제**. `mode:'2d'|'3d'|'globe'` · T1 pitch ≤ 60 / T2 ≤ 45 · 지형은 장면 단위만 · S4 인계는 2D 유지 | 사용자 8/25 "입체적인 Geo-AI" · 4090 96fps **[실측 · 다른 PC(사무실) · 이 PC는 F1-A가 Chrome GPU 확인 뒤 다시 잼]** |
| 색 분량 90/8/2 전 화면 | 사진이 바탕인 화면에 종이 비율 강제 → 계기가 흰 덩어리 | **무대별**: Paper 90/8/2 · Imagery = 사진 바탕 + 흰 유리 ≤ 15% + 청록/파랑 ≤ 3% · Ops = 잉크 88 / 흰 10 / 청록·파랑 2 | Vantor 컬러웨이 스왑 |
| 앰버 380ms만 | 관제실은 임계 근접(주의) 상태색이 필요, 빨강은 장애에 예약 | **Ops 무대 한정** 앰버 = 주의(임계 80% 초과) 글자·눈금 상시. 종이·영상 무대는 380 규칙 유지 | Blueprint intent 2단 |
| 명명 레이아웃 5종 | 지도 풀블리드·관제 밀집·글로브 무대에 이름이 없어 각자 해석 | **+3**: `CANVAS-FULL`(캔버스 ≥ 90% · 좌상 유리 레이어 패널 360/접힘 48 · 우상 HUD ≤ 420 · 하단 스크러버 60% · 우하 헤어라인 계기) · `OPS-GRID`(12열 거터 16 · 행 8배수 · 밝은 경계 elev-1 · `LX/OPS` 마크) · `GLOBE-STAGE`(순백 배경 글로브 · 국가 면 채색 · 상단 날짜 스크러버 · 우 사업국 목록) | Mapbox Studio · Linear · kepler 데모 |
| 3-비평가 입력 = 스크린샷 | 시간 축의 품질을 사진 한 장으로 가름 | **Craft 입력 = 영상 클립 + 100ms 프레임 스트립 + 세 사용자 관점 체크**(§7) | 사용자 8·9차 |

**신설**: 무대 선언 · 빛 문법(§6.4) · 아이콘 v2 44종(24 그리드 · 1.5px · 16/20/24) · 데이터 시각화 문법(데이터 잉크 · 색 역할 4 · 램프 2 · 차트 7 · 파이/도넛/3D 차트 금지 · 프로비넌스 칩 필수) · 글로벌판 타이포(§6.6) · 판정 루브릭(§7).

### 6.3 토큰 — `landxi/assets/css/v2/tokens-v2.css`(기존 `tokens.css`는 건드리지 않고 `data-stage` 셀렉터로 덮어쓴다)

```css
:root, [data-stage="paper"]{
  --cw-bg:#FFFFFF; --cw-ink:#010102; --cw-sub:#686868; --cw-rule:#DDDDDD;
  --cw-panel:#FFFFFF; --cw-accent:#006DF7; --cw-tint:#E8F1FF; --cw-tint-2:#D6E6FF;
  --cw-ai:#0FA9A0; --cw-lock:#FFB633; --cw-warn:#D1352B;
}
[data-stage="imagery"]{                       /* 지도 판 위 — 바탕은 사진 */
  --cw-bg:transparent; --cw-sub:rgba(1,1,2,.62); --cw-rule:rgba(1,1,2,.14);
  --cw-panel:rgba(255,255,255,.78); --cw-panel-blur:16px;
  --cw-hud-ink:#FFFFFF; --cw-hud-rule:rgba(255,255,255,.28);
  --cw-ai-glow:rgba(15,169,160,.35);
}
[data-stage="ops"]{                            /* 관제실 — 명도 반전, 색 추가 0(대비 보정만) */
  --cw-bg:#010102; --cw-ink:#FFFFFF; --cw-sub:#CCCCCC; --cw-rule:#272727; --cw-panel:#0E1116;
  --cw-accent:#4E9BFF;  /* #006DF7 의 잉크 위 4.5:1 보정판 */
  --cw-tint:rgba(78,155,255,.10); --cw-tint-2:rgba(78,155,255,.18);
  --cw-ai:#2BD9CF; --cw-warn:#FF5A4E; --cw-caution:#FFB633;
}
/* 모션 사다리 */
--e-ui:cubic-bezier(.22,1,.36,1); --e-arrive:cubic-bezier(.15,1,.3,1); --e-cam:cubic-bezier(.16,1,.3,1);
--d-40:40ms;--d-60:60ms;--d-80:80ms;--d-120:120ms;--d-180:180ms;--d-380:380ms;
--d-500:500ms;--d-750:750ms;--d-1000:1000ms;--d-1250:1250ms;--d-1600:1600ms;--d-2400:2400ms;
/* 빛 */
--glow-ai: 위 line 1.2px #0FA9A0 blur 1.5 + 아래 line 4px rgba(15,169,160,.25);   /* 이중 스트로크 */
--glow-fill: fill-opacity .18 → hover .42 · fill-extrusion-opacity .72;
--sweep: 청록 수직선 1px + 24px 꼬리 rgba(15,169,160,0→.28) · 1.0s;
--filament: 1px 수직선 · 높이=값 · 알파 .35~.9 · 하단 흰→상단 청록;
--conf-0..5: #BFD9FF → #003B85(유지);  --det-0..9: Roboflow ColorLookup(검출 전용 · 유지);
--fs-hud:124px;   /* 영상 무대 HUD 큰 숫자 · Vantor 본문 대비 7.75배 실측 */
```
규칙: **채도 높은 색은 결과 위에만 터진다**(planet 공통분모). 크롬(패널·버튼·레일)은 잉크·흰·슬레이트·액센트만. Ops 액센트 `#4E9BFF`·경고 `#FF5A4E`는 hue 동일한 명도 보정이며 색 추가가 아니다.

### 6.4 모션 문법과 지도 위 AI 표현(7문법 · 한 부품씩 · 지도 판을 가진 모든 화면이 같은 함수를 부른다)

| # | 문법 | 무엇 | v2 재질 | 데이터 | 레퍼런스 |
|---|---|---|---|---|---|
| 1 | **도착**(arrive) | frame 1250 → 스윕 1.0s(지나간 뒤에만 현상 500) → 락온 3곳 380 → 숫자 40ms/글자. E0-S 실측 p95 16.8ms · 도착 4.0s | + 이중 스트로크 글로우 · 도착 카메라 pitch 0→35° 1600 동시 · HUD elev-2 유리 · 숫자 124px | A02 · A04 · A06 · B06 · 실추론 | all4land 브래킷·DETECTED·스윕·카운트업 · FUI 락온 |
| 2 | **스캔 프레임**(job-theater) | AOI 헤어라인 → shard 격자 점선 → 완료 shard마다 `--sweep`이 그 칸을 훑고 결과 현상 → HUD `218/640 · a6000-0 · 00:41` [실측] → 전체 완료 시 도착. **`setInterval` 진행 오버레이 폐기** | 스캔 빔 = three 셰이더 또는 deck `SolidPolygonLayer` 알파 램프 | SSE `shard.done` | Roboflow 타일별 추론 · Palantir AIP 단계 노출 |
| 3 | **압출**(extrude) | `fill-extrusion-height = conf × 상수` · pitch 35~50 · 호버 시 그 필지 +20% 솟고 유리 카드(pnu·emd·conf·area) | 기본 OFF · 장면 단위 | A02 비닐하우스 1,674 · A08(height_m [추정] 상시) · A06 grid100 ColumnLayer · A07 HexagonLayer | kepler 3D 틸트 · Vantor WorldView |
| 4 | **시계열**(timescrub) | 유리 스크러버 · 크로스페이드 · 정수 750 정지 · 재생 6s · 변화 윤곽 도착·소멸 | + 스크러버 위 **변화 지수 히스토그램**(A04 `pair` [실측]) — kepler brush 문법 | A01 · A03 · A10 · C02 · PC 월별 모자이크 | kepler 시간 재생 · scroll-craft deadband |
| 5 | **스와이프**(swipe) | 지도 2개 동기 · `clip-path inset(0 0 0 var(--swipe))` · ±4% | 핸들 = 헤어라인 흰 선 + 중앙 브래킷 그립 · 양쪽 출처 칩(`원본 · 2025.06 드론 1.69cm` / `AI 판독 · 비닐하우스 v2.1`) | A01↔A02 · B09 GT↔C09 · Maxar 전후 | planet 비교 뷰 |
| 6 | **필라멘트**(filament) | 격자 집계값을 1px 수직 빛 기둥 높이·알파로 — 밀도가 스스로 코로플레스가 된다. 글로브·전국 z5~9만 | deck `ColumnLayer` radius 최소 또는 three CustomLayer(`renderingMode:'3d'` 실측 동작) | B02 시군구 252 · A07 9,032 · B07 136,025 · C08 칩 중심점 | all4land ⑦ 데이터 레인 |
| 7 | **프로비넌스·계보**(provenance · lineage) | 칩 `실측 · namwon-farmland-2025.geojson · 2026.06.08 · 1.69cm · EPSG:4326` → 호버 브래킷 카드 · 유휴 6s 링 1회(화면당 1) · 계보 띠 `비닐하우스 v2.1 ─ 영농관리 v2.1 ─ 남원 2025 배포본 ─ 남원시 GeoVision` | 서버 봉투 · `/registry/lineage/{id}` | 전 숫자 · cards/registry | Palantir P3·P13 |

공통 모션 규칙: 텍스트 인 `translateY(20px)→0` 600/60 스태거 · 이미지 `clip-path inset(100% 0 0)→inset(0)` 1s · 호버 180 물리 반응(색만 바꾸는 호버 금지) · **카메라는 점프하지 않는다**(화면 전환 = 같은 지도의 카메라 이동) · `prefers-reduced-motion` = `jumpTo` + 도착 1s 안 완료 · MapLibre 기본 전이 300ms는 스타일 전체에서 0.

### 6.5 관리자 다크(Ops 무대)

Vantor 컬러웨이 스왑 문법(6토큰 반전) — 색을 더하지 않고 명도를 뒤집는다. elev-2는 어두운 유리 `rgba(14,17,22,.82) blur(12px)` + 밝은 1px 경계 `rgba(255,255,255,.08)`(그림자 대신). 슬레이트 램프 `--sl-1..15`(Blueprint · 이미 `tokens.css`에 있음)를 표·축·비활성에. 차트 = 데이터 잉크(스파크라인 24px · 헤어라인 막대 · 링) · 값이 바뀔 때만 움직인다 · 앰버 = 주의 상시 · 빨강 = 장애 · 명령 팔레트 `⌘K`는 현행 `.palette` 재사용. 레퍼런스: Vantor 다크 기본 ↔ By The Numbers 라이트 반전 · Palantir Blueprint dark `#1C2127` · Linear 밀도 · f1-dash/NASA Worldview 텔레메트리.

### 6.6 글로벌 타이포

| 역할 | 국문판 | 글로벌판(`<html lang="en|ru">` 한 줄 스왑 · `fonts-v2.css`) | 이유 |
|---|---|---|---|
| 표시(H1~H3 · KPI) | Paperlogy 700/800 | **Inter 600/700** −0.01em · 1.10~1.25 | Paperlogy 라틴은 한글 짝의 보조 글리프 — 영문 장문 헤드라인에서 자간·굵기 리듬이 무너진다(심미 판단 · `fonts.html` 방식으로 나란히 렌더 후 사용자 승인). Inter는 이미 400/500 벤더링 → **600/700 두 파일만 추가**(@fontsource/inter · OFL). 제3 서체 추가가 아니다 |
| 본문 · 라벨 · 숫자 | Pretendard 400/500 · Inter tabular | Inter 400 16/23 · 500 14 `capitalize` · tabular 동일 | Vantor 본문 실측치 |
| 키릴 | – | Inter 키릴 지원 → `Ысык-Ата` · `Бишкек` · `Сокулук` 현지 표기 병기 | L1·L2 사업 |
| 미얀마어 | – | **미정** — Inter 미지원. 재해 카드는 영문 라벨만. Noto Sans Myanmar는 별도 결정 | 없는 것은 없다고 적는다 |

한글이 섞인 화면(LX 직원이 글로벌 카드를 볼 때)은 국문판 그대로. 골격·간격은 `LOCKED` 유지.

### 6.7 레퍼런스 장치 인용(이름 붙여 눈에 보이게 투입 — 7차 피드백 규칙)

Vantor(124px 숫자 · 반전 섹션 · clip-path · 컬러웨이 스왑) · kepler.gl(3D 틸트 · 시간 재생 brush · 색 램프 · 유리 사이드 패널) · planet.com(사진으로 대접 · 비교 뷰 · 카메라 점프 없음) · Palantir(디밍 · AIP 단계 노출 · 관계 순회 · 이력 상시 · Blueprint dark) · Roboflow(이미지 1급 · 타일별 추론 진행 · 클래스 고정색) · all4land/FUI(스캔 스트립 · 브래킷 · DETECTED 칩 · LIVE · 데이터 레인) · Apple Maps(vibrancy 시트) · Linear(패널 그림자 · 밀도 · ⌘K) · NASA Worldview/f1-dash(텔레메트리는 값이 바뀔 때만) · scroll-craft ORRERY(lerp .12 deadband · 필름 스크럽 손짓이 제품 스크러버로 이어진다).

---

## §7. 판정 방식 — 세 사용자 관점 Craft 게이트 + 동작 영상

법전 체크리스트 통과 ≠ 합격(사용자 7·8차). 판정은 **동작 영상**(Playwright `recordVideo` webm · 크레딧 0)을 `SendUserFile`로 보내고(사용자는 로컬 서버를 못 본다), 아래 루브릭으로 본다. Craft 비평가는 구현에 참여하지 않은 최상위 모델(Fable 5.1 · Opus 5.5 로테이션).

**제출 묶음(화면·조각당)**: 영상 8–120s + 100ms 프레임 스트립 ≥ 12장(연속 상이 쌍 ≥ 8) + 정지 화면(1280/1440/1920) + `motion-law.spec.mjs` 기계 측정(락온 380±20 · 스윕 1000 · 정지 750±40 · 타일 페이드 500) + perf(`p95 ≤ 20ms` T1) + 콘솔 오류 0 + **비교 레퍼런스 나란히**(같은 구도의 레퍼런스 스크린샷 1장 옆에 우리 프레임 1장 — Vantor/kepler/planet/Palantir/Roboflow 중 그 화면의 벤치).

| 관점 | 첫 5초 | 손을 대면 | 끝나는가 | 불합격 신호 |
|---|---|---|---|---|
| **지자체 공무원** | 내 지역 정사영상이 사진처럼 선명하게 뜨고 결과가 도착한다 | 필지를 누르면 pnu·읍면동·면적·공시지가·신뢰도와 출처가 유리 카드로 | 결과 → 표 → 보고서 발급 3클릭 안 | "업무 시스템 같다" · 결과가 놓여만 있다 |
| **일반 시민** | 필름 → 판 → 같은 카메라로 우리 동네까지(컷 없음) | 시점을 끌면 계절이 바뀌고 변화가 스스로 멈춘다 | AI가 무엇을 봤는지가 숫자 아닌 **빛**으로 읽힌다 | 점프 · 빈 화면 · 설명 없는 숫자 |
| **LX 직원** | 분석 실행을 누르면 진행이 **실측**(shard·GPU 노드·경과)으로 판 위에서 돈다 | 모델 카드 학습 곡선이 results.csv 실측 · 계보 띠로 어느 기관에 깔렸는지 | 관제실에서 GPU·큐·쿼터·배포를 한 화면에서 제어 | `setInterval` 진행 · 상수 인프라 % |
| **공통(Craft)** | 정지 화면 어느 프레임을 잘라도 "잘 만든 제품 스크린샷"인가 | 콘솔 0 · p95 ≤ 20ms · 14px 미만 0 · WebGL 캔버스 ≤ 2 | 지어낸 수치 0 · 모든 숫자에 프로비넌스 · 시연/추정/준비 중 꼬리표 | 원본 재스킨으로 읽힘 |
| **[v1.1 R14] 운영 요건** | 1차 정의 = 로컬 · LX 내부망 · 시연 규모(게이트웨이 1 · GPU 2 · 동시 세션 ≤ 20) | 게스트에 원본 영상 0(R6) · 키는 `server/.env`에만 · 기관 A 세션으로 B 행 0건(스키마·RLS는 1차, e2e는 2차) | 3차: 망 구성(행정망/인터넷망) · 보안 인증 대상 판정 · 백업 RPO 24h/RTO 4h [목표] · KWCAG 2.2 | 게스트 화면에 25cm·cm 영상 · 평문 키 · 폴백 없는 서버 의존 |

게이트 순서: Brief(원본 1:1 인벤토리 대조) → System(v2 법전 위반 0) → **Craft(영상 + 세 사용자 + 레퍼런스 나란히)** → 사용자 전송. 불합격이면 보고 금지. 스펙 통과가 아니라 **사용자의 "우와"가 합격선**이다.

---

## §8. 로드맵

### 8.1 1차 플래그십(약 3–4주 [추정]) — 수직 조각 넷, 영상 한 편

교훈(8차): 감사 → 화면별 버그수정 팬아웃은 '고친 목업'만 낳는다. 한 화면을 운영 수준으로 끝까지 만들어 영상으로 판정받고 확산한다. 네 조각은 파일 소유가 겹치지 않아 병렬이며, 마지막 주에 한 영상으로 잇는다.

> **[v1.1]** 아래 표는 v1.0 원문이다. **정본은 `blueprint/f1/F1-{A,B,C,D}.md` 브리프**(소유 파일 · 완료 기준 · 영상 시나리오)이며, 계약은 `blueprint/F1-CONTRACT.md`, 법전은 `design/system-v2.md`. v1.1에서 바뀐 핵심: F1-A 도착 = 남원 전역 25cm × P4 129,420(R1) · F1-B에 J2b 비닐하우스 재추론(R2) · F1-C에 배포 제어(롤백·이식)와 종이 무대 admin-login(R3·R7) · F1-D에 큐를 거치는 G-J1 지수 계산과 소쿨룩 시나리오 B(R4·R5) · `ru`·USGS 폴링·화재·EMS 크론 제외(§10.5) · 모든 조각은 새 경로(`landxi/xi/` `server/` `landxi/ops/` `landxi/global/`)만 만들고 `landxi/proto/*`는 읽기·import만. 기간은 D0 계약 + 설치 스모크 1일을 더해 **4–5주 [추정]**.

| 조각 | 범위 | 완료 기준(영상에서 보여야 하는 것) | 자산 · 파이프라인 | 투입 모델 | 기간[추정] |
|---|---|---|---|---|---|
| **F1-A XI맵 남원 운영판** | E0-S 스파이크(S1·S3·S6 실측 합격)를 `engine/`으로 승격 · V1 사다리(xdworld z19 → C01 25cm → A03 → A01) · V2 프레임 도구 · V5 히스토그램 · V6 출처 칩 · V7 압출 스파이크(A02 1,674 · 기본 OFF) · V8 필지 카드(C04 PMTiles) · 유리 HUD elev-2 · 124px 숫자 · pitch 0→35° 도착 카메라 · 통계/보고서 서랍 · `public=1` 공개 모드 · 필름 `lx_cam` 인계 | 글로브 → 남원 하강 중 배경 3번 갈림(출처 칩 바뀜) → 2,098필지 도착 4s 안 → 필지 클릭 380ms 후 PNU·지목·공시지가·conf·4시점 크롭 → 스크럽 재생 6s(정수 정지) → 스와이프 → 필름 마지막 프레임 = 지도 첫 프레임(점프 0) · p95 ≤ 20ms · 캔버스 ≥ 90% | A01 A02 A03 A04 A08 A11 A12 A13 C01(P3) C04(P8) · P1 · tokens-v2 · system-v2.md · CANVAS-FULL | 설계·법전·Craft = **Fable 5.1** · 엔진·fx 부품·XI맵 = **Opus 5.5** · P1/P3/P8 배치·벤더링 = **Sonnet** | 8–10일 |
| **F1-B 실추론 최소판** | Docker Redis :6380 · PostGIS :5433 · `landxi-srv` env · 마이그레이션 · 시드(cards.js → DB · countCheck unit) · 게이트웨이 최소 라우트(auth · catalog · tiles · jobs · events · results) · scheduler · gpu_worker(yolo_obb 어댑터 · 하트비트 · 계량) · cpu_worker(전역 NMS · PMTiles 스냅샷) · **bench** · `job-theater.js` · `api.js` 폴백 · serve.mjs 역프록시 · `demo:true` | 익산 황등(B04 1.36cm COG)으로 하강 → AOI 긋기 → 견적 카드(면적·shard·GPU·s [추정]·할당 잔여) → 실행 → shard 격자 점등, **A6000 두 장이 실제로 추론**, 칸마다 결과 도착, HUD 탐지 수·칩/s 실측 상승 → 완료 → GT 2,462건 S6 스와이프 → `정답 대비 일치 n% [실측]` · 첫 shard ≤ 5s [목표] · 영업 계정으로 같은 흐름 `demo:true`(DB 행 0 확인) | B04(P15) B05 · J1 · (J2 남원 C09×C01은 큐로 제출해 1차 말 결과 스냅샷) | 게이트웨이·스케줄러·워커 = **Opus 5.5** · 어댑터·bench·시드 = **Opus 5** · Docker·env·NSSM = **Sonnet** | 10–12일 |
| **F1-C 관리자 GPU 관제 실측** | :8702 origin · `admin-login` · OPS-GRID · Ops 토큰 · 운영 현황(배포 지도 + 실행 중 job 점) · **인프라 관제**(노드 카드 · GPU 링·스파크라인 · 큐 스윔레인 · 모델 배치 · 스토리지 링 · 경보 스트립 · A100 노드 등록 대기 자리) · 기관·할당(쿼터 링 · 사용 실측 · T-1) · nvidia-smi 폴러 + Prometheus · `infra.js CAPACITY` 교정 | F1-B 실행과 **같은 시각** 반화면에서 GPU 0/1 사용률·VRAM·온도가 오르고 내린다(값 변화 시 40ms 현상) · 큐 행 → 노드 카드 리더선 · 대기열이 비고 시연 기관 할당 막대(gpu_s_month)가 줄어든다 · 경보 스트립 `경보 없음 · 마지막 점검 hh:mm` · 향후 노드 2자리 점선 | env.md [실측] · P17 · `ops/*` API | 관제 화면·데이터 잉크 차트 = **Opus 5** · 폴러·exporter = **Sonnet** · Ops 무대 판정 = **Fable 5.1** | 6–8일 |
| **F1-D 글로벌(키르기스스탄 + 미얀마)** | GLOBE-STAGE(순백 글로브 · GIBS 어제 · LX 사업국 38+1 채색 · USGS 1분 폴링) · 글로벌 사다리(EOX → PC 월별 모자이크 → WorldCover · NDVI → Maxar) · 국가 코드 hit-test 무대 전환 · 카드 2(`card-global-farm` · `card-global-disaster`) · 테넌트 2(kgz-agri · kgz-land, scope global) · `locale=en|ru` · Inter 600/700 · G1·G2·G4 사전 수집 · 라이선스 가드 | 남원에서 글로브로 후퇴 2400ms → 비슈케크·으슥아타 하강(같은 지도 · 페이지 이동 0) → 시점 스크러버 2025-03→10 월별 S2 모자이크 크로스페이드 + 농지 마스크 NDVI 곡선(107장면 [실측]) + WorldCover 비율 막대(농경지 33.0% [실측 · 비율만 유효]) · 작물 분류 = `AI 과업 · 학습데이터 필요` 정직 표기 → 미얀마 메이크틸라 Maxar 전후 스와이프 + EMS 피해 점 38(Damaged 23 · Destroyed 4 · Possibly 11) Overture 등급 채색 · 출처 칩 CC BY-NC 시연 한정 · `Ысык-Ата` 키릴 병기 | global-map §1·§3 URL(2026-09-24 검증) · geoBoundaries · PC · WorldCover · EMS · Maxar · Overture | 글로브 무대·사다리 = **Opus 5.5** · 사전 수집·i18n·카드 데이터 = **Sonnet** · 글로벌 서체 나란히 렌더 판정 = **Fable 5.1** | 7–9일 |
| **F1-∑ 통합 영상** | 네 조각을 한 영상(≈120s · 1440×900 · Playwright)으로 잇고 세 사용자 + 관리자 체크 · 레퍼런스 나란히 · `SendUserFile` | §0 목표 1~4 전부 · 콘솔 0 · 크레딧 0 · 지어낸 수치 0 | – | Craft = **Fable 5.1** · 녹화 스크립트 = **Sonnet** | 2일 |

공통 완료 기준: 콘솔 오류 0 · 실패 요청 0 · 14px 미만 0 · v2 법전 위반 0 · 소유 파일 밖 수정 0 · 자기 e2e 스펙 소유(`LX_API=off/on` 두 프로젝트로 기존 573건 회귀 보호) · 영상 생성 API 호출 0.

### 8.2 이후 차수

| 차수 | 내용 | 모델 |
|---|---|---|
| **2차 확산(4–6주)** | 기관 포털 남원 farm-25(P-1 · P-2 · 로그인 얼굴판 · 카드 덱 flyTo) · 게스트 공개 모드(G-2 하천 651,478 · A07) · 배포 제어(shadow·canary·rollback · R-1 · A-2 검토 데스크 미리보기) · J2 남원 재추론 결과 편입 · J3 본사 트윈(P14) · V-World 프록시(키 갱신 시) · 프로젝트 라벨링 실백엔드(AXIS-Label 프록시) · 데이터 관리 판(M-1) · 대시보드 계기판(D-1) · 서비스 지원 피드백 고리 · 아이콘 v2 교체 · nginx TLS · 터널 · 백업 | XL = Opus 5.5 · L/M = Opus 5 · S = Sonnet · 판정 = Fable 5.1 |
| **3차 운영화(4주)** | Phase 1 완료: 쿼터 집행 · 경보 규칙 실측 조정 · 관제 ②–⑧ 전부 · 포털이 API를 읽음 · T2 iGPU 성능 측정과 티어 강등 · 폐쇄망 폴백 사다리 · 반응형(1100 하단 탭바 · 390) · 접근성 · J4 석면 학습→배포→추론 전 주기 · MASTER-PLAN Wave 1–3 잔여 결손 0 | 동일 |
| **4차 클러스터(장비 도착 시)** | Phase 2: k3s + MIG · MinIO · 노드 가입 · DCGM · Helm · 데이터 거주(residency) 접두어 분리 | Opus 5.5 + 인프라 검토 Fable 5.1 |

---

## §9. 사용자 결정 질문(최대 5 · 추천안 포함)

| # | 질문 | 선택지 | **추천** · 근거 |
|---|---|---|---|
| **Q-A 법전 v2 채택 범위** | 세 무대·깊이 4단·영상 무대 유리·이징 3·유휴 예산 규칙·D22 해제(pitch ≤ 60)·앰버 Ops 상시를 채택하는가 | ① 전부 채택 ② 판 1단 깊이 + 유리만(제품안 최소 개정) ③ 현행 유지 | **①** — 사용자 원 확정(8/25 "밝은 지도 + 흰 유리 패널", "입체적인 Geo-AI")을 되살리는 것이고, 종이 무대(문서·표·폼)는 그대로다. F1-A 영상에 **전(현행 법전)/후(v2) 같은 장면**을 나란히 넣어 확정 |
| **Q-B 첫 실추론 대상** | 영상에 실릴 첫 GPU 실추론 | ① 익산 황등 1.36cm × 차량 OBB(GT 2,462건 · 노트북 완성) ② 남원 25cm × C09 4클래스(플래그십 지역 · 27,676 결손 대체) ③ 둘 다 | **③, 순서는 ① → ②** — ①은 정답 대비 일치율을 실측으로 낼 수 있어 "진짜 돈다"의 증거가 되고, ②는 남원 서사를 닫는다. 영상 주 장면은 ①, ②는 큐에 제출해 1차 말 스냅샷으로 편입. 처리량 bench가 느리면 AOI를 줄이고 정직하게 표기 |
| **Q-C 백엔드 스택** | Phase 0부터 FastAPI + Redis Streams + PostGIS(RLS)로 가는가, Node + SQLite 파일 큐로 가볍게 시작하는가 | ① FastAPI 스택(Docker 2컨테이너) ② Node + SQLite → A100 때 Redis ③ Node 게이트웨이 + Python 워커만 | **①** — 기관 격리(RLS)·봉투 강제·다중 노드 소비자 그룹이 처음부터 서고, 워커·타일러·AXIS-Label이 모두 Python이라 게이트웨이도 같은 env가 맞다. 이미지(`redis:7-alpine`)와 Docker 데몬은 이 PC에 있다 [실측]. 리스크 = 초기 설치 2–3일 |
| **Q-D 글로벌 라이선스·서체** | (a) EOX 2018+ 비상업 · Maxar CC BY-NC를 공공 시연에 쓰고 수출 배포본은 2017판/GIBS/PC로 자동 스왑하는가 (b) 글로벌 표시체를 Inter 600/700으로 바꾸는가 | (a) ① 자동 스왑 채택 ② 처음부터 CC BY만 (b) ① Inter 600/700 ② Paperlogy 라틴 유지 ③ 나란히 렌더 후 결정 | **(a) ①** — 서버 라이선스 가드가 `build=export`에서 제외하므로 위반 경로가 없다. **(b) ③ → ① 예상** — Paperlogy 라틴 품질 판단은 심미 판단이지 실측이 아니므로 `fonts.html` 방식으로 나란히 렌더해 승인 뒤 확정. 미얀마어 서체는 미정으로 남긴다 |
| **Q-E 사용자 액션 묶음** | 사용자만 할 수 있는 것 | ① V-World 운영키 재발급/기간 연장(+ Data API 유형 추가 신청) ② 시연 기관 쿼터 초기값 승인(`infra.js` 견적 × 1.5 · `[추정 기반 초기값]` 표기) ③ 관리자 2인 승인 규칙(GA·롤백·한도 상향) 채택 ④ 드라이버 522.06 갱신(Phase 1 WSL 이관 시) **[v1.1 R6·R10]** ⑤ C01 25cm·A01 드론 영상의 **공개 권리·보안 처리** 확인(확인 전까지 로그인 사용자 한정 — 결정됨) ⑥ C04 국토정보기본도(Mobility Convergence 사업 자료)의 Land-XI 사용 가능 여부 ⑦ TCC 전환 여부(프로세스별 VRAM · 디스플레이 출력 끊김) ⑧ Ollama 상주 정책(**결정: 종료 금지 · 남는 VRAM만 사용**) | **①·②·③·⑤·⑥ 지금, ④·⑦은 Phase 1에 다시 묻는다, ⑧은 결정됨** — ①은 필지 GetFeature·검색·현행 경계를 여는 P0(C04 PMTiles가 있어 없이도 1차는 닫힌다 · 2026-09-24 현재 Data API 권한 미반영, 5분 간격 확인 중 · 프록시 코드는 준비만). ②·③은 정책이라 발주자 몫. ④·⑦은 다른 업무에 영향 |

---

## 부록 A. 화면 × 결정적 장면 × 자산

| 화면 | 장면 | 한 줄 | 자산 / URL |
|---|---|---|---|
| 게스트 필름 → XI맵 | G-1 | 필름 마지막 프레임 = 지도 첫 프레임 | 필름 레그 · `lx_cam` |
| XI맵 공개 | G-2 | 전국 하천 벡터타일 + 하천 점유 단계구분도(필라멘트) | A05 · B02 · A11 |
| 포털 지도 | P-1 | 시 전역 → 1cm 하강 3단 + 스캔 도착 | A03 · C01 · A01 · A02 |
| 포털 필지 | P-2 | 필지 클릭 → PNU·지목·공시지가 + 4시점 크롭 | C04 · A12 · E01 |
| XI맵/프로젝트 분석 | S-1 | 프레임 → shard 실추론 → SSE 도착(실측 진행) | B04 · B05 · B03 |
| 프로젝트 학습 | S-2 | results.csv 실곡선 + PR/F1/혼동행렬 | B01 · D04 |
| 관제 인프라 | A-1 | nvidia-smi 실측 게이지 · 큐 → 노드 리더선 | env.md · `/ops/gpus` |
| 관제 운영 현황 | A-2 | 승인 → 배포 지도 점 도착 · 반려 → 행 퇴장 | `deploys` · `approvals` |
| 관제 기관·할당 | T-1 | 쿼터 슬라이더 → 링 500ms · 초과 월 [추정] 고스트 | `quotas` · `usage_events` |
| 관제 배포 제어 | R-1 | 롤백 → 점 앰버 380 → 이전 버전 정착 · 계보 되감김 | `card_versions` · PMTiles 스냅샷 |
| 글로벌 농지 | K-1 | 월별 S2 모자이크 스크럽 + 농지 NDVI 곡선 107장면 | PC STAC/mosaic · WorldCover · geoBoundaries |
| 글로벌 재해 | K-2 | Maxar 전후 스와이프 + EMS 38점 → Overture 등급 | EMSR798 · Maxar · Overture |
| 대시보드 | D-1 | 양산 라인 네 띠 · 배포 셀 6s 점등 | cards/registry · flow.js |
| 데이터 관리 | M-1 | 발행 4/4 판 위 전이(실타일 fade-in → 청록 도착) | A01~A10 · B07 · C01 |
| 로그인 | L-1 | 얼굴판 실결과 미니맵 · 관제 요약 한 줄 | A01 · A02 · `/ops` |

## 부록 B. 신설·격상 파일

> **[v1.1 R8]** 아래는 v1.0 원문. **1차 실제 경로는 `F1-CONTRACT.md §11`(소유 경계)이 정본** — `landxi/engine/` → `landxi/xi/engine/`, `landxi/ops/` 유지, 글로벌은 `landxi/global/`, 공유 부품은 `landxi/shared/api-v1.js`, 토큰은 `landxi/assets/css/v2/tokens-v2.css`. `landxi/proto/ximap.html(재구성)` · `analysis-*.js` · `portal-*.js` 수정은 **2차**(1차는 proto 수정 0).

```
design/system-v2.md                                  법전 v2(§6)
landxi/assets/css/v2/{tokens-v2,fonts-v2,canvas-full,ops-grid,globe-stage}.css
landxi/assets/fonts/Inter-{600,700}.woff2            (Q-D 승인 후)
landxi/assets/icons-v2.svg                           44종 헤어라인
landxi/engine/{lx-map,sources,tier,api}.js
landxi/engine/fx/{arrive,timescrub,swipe,frame,job-theater,extrude,filament,provenance,lineage,glass-panel}.js
landxi/engine/i18n/{ko,en,ru}.json
landxi/ops/{index,infra,tenants,deploys,login}.html + ops/js/*                :8702 루트
landxi/proto/ximap.html(재구성) · analysis-*.js · portal-*.js(API 소스로)
landxi/assets/data/geo/global/{kgz-adm1,kgz-adm2,ysykata-landcover,ysykata-ndvi-2025,mm-meiktila-damage,lx-countries}.json
landxi/proto/vendor/{deck.gl@9.3.10,three@0.185.1,pmtiles@4.5.0,gsap@3.15.0,lenis@1.3.26,h3-js@4}/
server/docker-compose.phase0.yml · landxi_api/{main,auth,catalog,tiles,proxy,jobs,results,registry,deploy,quota,ops,label}/
server/workers/{scheduler,gpu_worker,cpu_worker,join}.py · adapters/{yolo_seg,yolo_obb,sam2,stats_pc,ndvi}.py
server/pipelines/{P1,P3,P6,P8,P10,P13,P14,P15,G1..G6,seed_from_cards_js}.py · bench/throughput.py · migrations/0001_init.sql
server/config/{pools,quotas,sources,alerts}.yaml · .env(저장소 제외)
tools/serve.mjs(+역프록시 20줄) · tools/gen/portal-gen.mjs(locale·crs·ladder 3축)
tests/e2e/{proto-ximap-frame,proto-job-theater,ops-infra,proto-global}.spec.mjs · motion-law.spec.mjs · server/tests/count_check.py
E:/landxi-data/                                      데이터 평면(저장소 밖)
```

## 부록 C. 세 안이 어긋난 9곳 — 결정과 근거

| # | 쟁점 | P | S | V | 결정 |
|---|---|---|---|---|---|
| 1 | 관제 화면의 자리 | 1급 화면(admin-infra 등) | 별도 origin :8702 | `produce.html` 탭 | **별도 origin + 1급 레일 8 + OPS-GRID** — 사용자 요구 4 "관리자 = 인프라 관제"가 명시적 |
| 2 | 작업 큐 | SQLite → Redis 승격 | Redis Streams 처음부터 | Redis Streams | **Redis Streams 처음부터** — 인터페이스 불변 원칙 · 이미지 있음 |
| 3 | 게이트웨이 | Node serve.mjs 확장 | FastAPI :8700 | Node server/index.mjs | **FastAPI** + serve.mjs 정적·역프록시 유지 — Python 생태(rasterio·torch·AXIS) 정합 |
| 4 | 영업 시연 실행 | 저장 결과 재생 | 실제 GPU · 기록 0 | 캐시 재생 | **둘 다**: 워커 있으면 실제 GPU(`demo:true`), 없으면 재생 — 둘 다 `basis:'demo'` |
| 5 | GPU 폴링 | 6s | 2s | 2s | **2s 수집 · 값 변화 시만 40ms 현상** |
| 6 | pitch 상한 | ≤ 45 | ≤ 60 | ≤ 60 | **T1 ≤ 60 · T2 ≤ 45** · 지형 장면 단위 |
| 7 | 깊이 | 판 1단 | 문서 층/지도 층 분리 | 4단 | **4단(V), 영상 무대 한정** — S의 층 분리 논리가 근거 |
| 8 | 첫 수직 조각 | V0 XI맵 남원(스파이크 승격) | Phase 0 익산 실추론 | 주1 XI맵 남원 | **병렬 4조각 + 통합 영상**(§8.1) — 남원 운영판과 실추론을 둘 다 첫 영상에 |
| 9 | 필지 카드 | C04 먼저 · V-World 덧댐 | C04(P8) | C04 + 프록시 | **C04 PMTiles 먼저(키 없이)** · 키 복구 시 GetFeature 덧댐 — 세 안 일치 |

## 부록 D. 리스크 · 미확정(지어내지 않는다)

- **처리량 미측정** — "실시간"의 속도가 실제로 얼마인지 모른다 → Phase 0 첫 작업 = bench. 느리면 AOI 축소·n/m 모델로 정직하게.
- **GPU 장당 약 23GB 이미 사용 중 [실측]** → VRAM 인지 입장 · 관제 ③에서 점유 프로세스 표시.
- **iGPU(공무원 노트북) 미측정** → T2 측정 1회를 1차 안에(Tailscale로 이 PC 접속), 티어 강등 규칙.
- **V-World 키 만료(E01)** → C04·A11 로컬로 1차 닫힘 · 키 복구 시 프록시 즉시 활성.
- **남원 비닐하우스 27,676 결과 없음** → J2 실재추론으로 대체(결과 수는 새로 잰 값).
- **Planetary Computer 무SLA · Terrascope 차단** → 프록시 캐시 + G2 사전 수집 · Phase 2 자체 TiTiler.
- **라이선스(EOX 2018+ · Maxar 비상업)** → 서버 가드 · 수출본 자동 스왑.
- **Windows 서비스 상주 · 드라이버 522.06** → NSSM · WSL 이관·드라이버 갱신은 사용자 승인.
- **인파관리(crowd-27) · 도로 좌표 결과 없음** → 갤러리·모델 카드만, 지도 결과 `준비 중 · 이유`.
- **A08 건물 높이는 추정** → `[추정]` 상시 · V-World `LT_C_SPBD` 층수는 Data API 유형 추가 후.
- **쿼터 정책 값은 발주자 몫** → 초기값 `[추정 기반 초기값]` 표기, 사용량만 실측.
- **미얀마어 서체 · 작물 6종 분류(공개 데이터 불가)** → 미정 · `gap` 명시.
- **백엔드 도입이 정적 프로토(e2e 573)를 깨뜨림** → `api.js` 폴백 · `LX_API=off/on` 두 프로젝트.

---

## §10. 비평 — 완결성·현실성 (2026-09-24 · 완결성·현실성 비평가 · 추가만 함, §0–부록 D는 고치지 않음)

근거: 메모리 9편 · recon-0924 전편 · specs 2026-09-20 네 편 · audit-0923 · 기능 인벤토리 · 저장소 파일 대조 · **이 PC에서 새로 잰 값**(§10.1). 표기는 본문과 같은 [실측]/[추정]/[미검증]을 쓴다.

### 10.0 판정 한 줄과 치명 결함 다섯

뼈대(실추론 + 관제 + 격리 + 법전 v2)는 요구 1~8을 대부분 덮는다. 그러나 **1차 영상의 첫 장면이 지리적으로 성립하지 않고**, 요구 4의 세 번째 기둥(배포 제어·이식)과 요구 2의 '위성 실시간 분석'이 1차에서 빠져 있다. 아래 다섯 가지를 고치기 전에는 착수하면 안 된다.

| # | 결함 | 근거 | 조치 |
|---|---|---|---|
| X1 | **남원 1cm 하강 → 2,098필지 도착 → 4시점 크롭 장면이 성립하지 않는다.** A02 농경지 2,098건 중 A01 cm AOI(0.8×0.9km) 안에 있는 것은 **5건**, 비닐하우스 1,674건은 **0건**이다 [실측 · 이번 대조]. A02는 남원 전역에 퍼져 있다 | `namwon-farmland-2025.geojson` · `namwon-greenhouse-2025.geojson`의 첫 꼭짓점 × A01 bbox | 도착은 **시 단위(A03 2m / C01 25cm, z12–15)** 에서 2,098·1,674로 하고, cm 하강은 AOI 안 5필지 + A04 변화 456건으로 연출한다. P-2의 '4시점 크롭'과 V7 비닐하우스 압출은 AOI 밖에서는 A03 2시점으로 대체하고 그렇게 표기한다. §0 목표 1 · §1 P-1 · F1-A 완료 기준 문구를 다시 쓴다 |
| X2 | **요구 4 '배포 제어'(단계 배포·롤백·이식·모델 교체)가 1차에 없다.** F1-C는 인프라·할당만 한다. '이식'은 API에도 없다. §5.2 `/deploy/{id}/*`는 있는 배포본만 조작하고, 새 기관·지역에 배포본을 만드는 `POST /deploys`(card-architecture §1의 "이식 = 같은 cardId로 배포본을 하나 더")가 없다 | §4 ④ · §5.2 · §8.1 F1-C | F1-C에 **R-1 롤백 한 장면 + 이식(남원 farm-25 → 시연 기관 복제) 한 장면**을 넣거나, 1차 영상에서 "배포 제어 = 2차"라고 밝힌다. API에 `POST /deploys`(from_deploy_id, region_profile, aoi, thresholds, cycle)와 `POST /deploys/{id}/port`를 추가한다 |
| X3 | **글로벌은 '실시간 분석 프레임'이 아니라 사전 수집 통계 열람뿐이다.** F1-D의 WorldCover 비율·NDVI 곡선은 PC 타일러의 결과를 캐시한 것이고, LX GPU 큐를 거치는 글로벌 job은 J5(Maxar × C09, [시연 · 도메인 이식 실험 · 성능 미확인]) 하나뿐이며 1차 범위에도 없다 | §3.3 J1–J5 · §8.1 F1-D | 1차에 **글로벌 프레임 1건**을 넣는다. 가장 현실적인 것은 S2 장면 위 `adapters/ndvi.py`(GPU 불필요, CPU 워커)를 같은 `POST /jobs` → SSE 경로로 돌리는 것이다. 모델 추론이라고 부르지 말고 `지수 계산` 으로 표기한다. 아니면 Overture × S2 건물 변화(시나리오 B)를 CPU job으로 돌린다 |
| X4 | **소쿨룩(Sokuluk)이 빠졌다.** 요구 2는 비슈케크·으슥아타·소쿨룩 세 곳을 명시했다. 설계서에서 소쿨룩은 §6.6 키릴 표기 예시로만 나오고, 비슈케크는 카메라가 지나가는 곳일 뿐이다. `kgz-land`(토지자원청) 테넌트를 만들지만 보여 줄 카드가 없다. LX가 실제로 키르기스에서 하는 일은 **연속지적도 시범 구축**이다(global-map L1) | global-map §3 시나리오 B · L1 | 시나리오 B(비슈케크·소쿨룩 시가지 확산 = Esri LULC 2017→2025 built 차이 + Overture 건물 밀도 + geoBoundaries 경계)를 F1-D에 넣고 `kgz-land`에 연결한다. 연속지적 시범지 경계는 로컬 PPT·PDF에 있다고 기록돼 있을 뿐 벡터로는 확인되지 않았으므로 `경계 미확보`로 표기한다 |
| X5 | **공개 모드에서 정사영상을 공개하는 문제(보안·라이선스)가 한 줄도 없다.** `public=1`은 게스트에게 25cm 항공(C01)과 1cm 드론(A01)을 보여 준다. 국가 항공사진·정사영상은 공개하기 전에 보안 처리(국가보안시설 가림)를 거쳐야 하고, C01의 배포 권리(원 생산기관·사업 목적)도 확인되지 않았다. C04 국토정보기본도는 다른 사업 폴더(`Mobility Convergence`)에 있던 자료다 | ledger C01·C04 경로 · §2.2 ① | 카탈로그 `export_policy`에 `public` 판정 근거 칸(`security_review`, `rights_holder`)을 추가한다. 1차 공개 모드는 xdworld + A03 2m + 결과 벡터만 쓰고, C01·A01은 로그인 사용자에게만 연다. 권리 확인은 사용자 액션(Q-E)에 추가한다 |

### 10.1 이 PC에서 새로 잰 사실 (2026-09-24, 읽기 전용)

| 항목 | 값 | 설계서에 주는 영향 |
|---|---|---|
| GPU 드라이버 모드 | A6000 두 장 모두 **WDDM** [실측] | WDDM에서는 `nvidia-smi --query-compute-apps`의 프로세스별 `used_gpu_memory`가 **N/A**로 나온다 [실측]. 부록 D "관제 ③에서 점유 프로세스 표시"는 **프로세스 이름만** 보여 줄 수 있고 프로세스별 VRAM은 보여 줄 수 없다. TCC로 바꾸면 디스플레이 출력이 끊기므로 사용자 승인 사항이다 |
| 장당 23,408 MiB 점유의 정체 | **Ollama `llama-server.exe` 4개** [실측] | "워커 VRAM 인지 입장"만으로는 부족하다. 시연·녹화 중에 Ollama가 GPU 연산을 나눠 쓰면 bench 값과 실측 칩/s가 흔들린다. 녹화 전 Ollama 언로드 절차, 또는 관제 화면에 `외부 프로세스 점유` 행이 필요하다 |
| Docker 이미지 | `redis:7-alpine` 있음 · **`postgis/postgis` 없음** [실측] | 본문 "1회 pull"은 맞다. 네트워크가 필요한 단계이므로 Phase 0 D-1 체크리스트에 올린다 |
| cleanriver 컨테이너 | nginx 80/443 공개, redis 6379는 **컨테이너 내부만** [실측] | :6380 선택은 안전하다. 같은 데몬을 운영 서비스(cleanriver)와 공유하므로 `docker compose down` 계열 명령의 대상을 프로젝트 이름으로 반드시 한정한다 |
| MapLibre 벤더 | `vendor/maplibre` **v5.6.0** 있음. deck 9.3.10 · three 0.185.1 · gsap · lenis는 **jsdelivr CDN**에서 로드 · pmtiles는 아직 어떤 HTML에도 없다 [실측] | §5.6 "CSP `script-src 'self'`(벤더링이라 가능)"와 §5.1 "오프라인 벤더링"은 **아직 사실이 아니다**. P12(벤더링)가 2차로 밀려 있으므로 CSP는 2차 이후에나 가능하다. 1차에서 `self`로 잠그면 화면이 깨진다 |

### 10.2 사용자 요구 1~8 대조

| 요구 | 덮는 정도 | 빠진 것 · 약한 것 |
|---|---|---|
| 1 운영 가능 완성형 + 실데이터 | 부분 | 1차가 끝나도 35화면 중 XI맵·관제 2면만 실백엔드에 붙는다. 나머지(데이터 관리 업로드·프로젝트·서비스 지원·관리)는 12주 뒤인 3차에 붙는다. '운영 가능'을 "이 PC 로컬, LX 내부망, 시연 규모"로 **범위를 먼저 정의**해야 한다. 공공기관 운영에 필요한 **보안 인증·망 구성**(지자체 행정망/인터넷망 분리 접속, 클라우드 보안인증 대상 여부, 개인정보 영향 — 필지 소유구분), **백업·복구 목표(RPO/RTO)**, **KWCAG 접근성**이 모두 없거나 3차로 밀려 있다. 이 항목들은 판정 루브릭(§7)에도 없다 |
| 2 XI맵 = 글로벌 실시간 분석 프레임 | 부분 | X1 · X3 · X4. **'전국 위성'**: 국내 사다리에 위성 층이 사실상 없다. xdworld Satellite는 항공 모자이크이고 GIBS·S2는 글로벌 사다리에만 있다. 국토위성(CAS500-1) 등 국내 위성은 대장에 없으므로 `미확보`로 적거나, S2/HLS를 국내 사다리 z9–14에도 넣어 "위성 → 항공 → 드론" 세 층을 실제로 잇는다 |
| 3 A6000×2 → A100×4×2 | 충분 | §10.4의 WDDM·Ollama·MIG 전제만 보완하면 된다. **A100 서버 도착 전에 k3s·MIG를 검증할 방법이 없다**는 점(4차는 전부 [미검증])을 로드맵에 적는다. 노드 간 저장소를 공유하는 방식(MinIO 전 Phase 1에서 n1/n2가 E:를 어떻게 읽나: SMB/NFS 또는 사전 복제)이 비어 있다 |
| 4 관리자 관제·쿼터·배포 제어 | 부분 | X2. 이 밖에 ① 경보를 받는 곳(Alertmanager → 메일/사내 메신저/SMS)이 정의되지 않았다. ② MY '디스크 증량 신청'(원본 §3·§10)이 쿼터 상향 결재와 이어지지 않았다 — 요구 4의 '할당 제어'가 원본 기능으로 들어올 수 있는 자리다. ③ 신규 기관 생성 → CI 등록 → 포털 생성(production spec §3 `PRODUCE` 4자동/2수동)이 관제 ③의 동작에 없다 |
| 5 기관 완전 별도 · 관리자 다른 집 · 영업 = 시연 | 충분 | 다만 두 가지가 충돌한다. ① 서명 URL 10분과 pmtiles 프로토콜: MapLibre는 PMTiles 헤더를 한 번 읽고 같은 URL로 Range 요청을 이어 보낸다. **10분이 지나면 세션 도중 타일이 403**이 된다. URL을 갱신하는 커스텀 `Source` 또는 쿠키 기반 서명이 필요하다. ② production spec `LOCKED`(포털 라운드 0 · 그림자 0)와 v2 elev-2 유리가 부딪친다. 기관 지도 탭에 유리를 허용하려면 `brand.js LOCKED`를 개정해야 하고, 개정한다고 적어야 한다 |
| 6 전문가급 디자인 · 레퍼런스·서체·필름 존중 | 충분(법전) / 부분(검증) | 1차 영상은 **종이 무대 화면을 한 장면도 보여 주지 않는다**(로그인·대시보드·데이터 관리). 공무원과 LX 직원이 매일 보는 곳이 판정되지 않는다. 아이콘 v2(7차 피드백 "아이콘까지 달라야")는 2차에 있어 1차 영상에 옛 아이콘이 찍힌다. **필름 → 지도 '점프 0'**은 필름이 AI 생성 디오라마 mp4(미니어처 룩)라는 사실과 부딪친다. 카메라 좌표가 같아도 재질이 바뀌므로 컷 또는 크로스페이드가 생긴다. "점프 0"을 "카메라 좌표 연속 + 재질 크로스페이드 N ms"로 다시 정의해야 한다 |
| 7 콘티 원칙 | 대체로 충족 | ① §0·§3.3·§1의 HUD 예시 `탐지 1,284 · shard 96/240 · GPU0 71% · 1.9칩/s`에 **[실측·지금] 꼬리표가 붙어 있지만 잰 값이 아니라 예시**다. 자기 규칙을 어긴 것이므로 `[예시]`로 바꾼다. ② `deploys` 시드에 들어갈 cards.js DEPLOYS의 `scale: '비닐하우스 9,664 동'`은 A02 1,674 · 결손 27,676 어느 쪽과도 맞지 않는다. 출처가 없는 수이므로 countCheck에 포함하거나 지운다. ③ DEPLOYS의 `status:'운영'`을 관제 '운영 현황'에 실시간 상태처럼 올리면 운영 서사를 지어낸 것이 된다. `basis:'history'`(발주자 구술 사업 연혁)로 구분해 표시한다. ④ "4090 96fps [실측]"(§6.2 D22 해제 근거)은 **사무실 PC**(8/25 `perf-thispc`)에서 잰 값이다. 이 PC(A6000 + RX 5700 XT)에서는 재지 않았고, Chrome이 어느 GPU로 그리는지도 확인하지 않았다 → `[실측 · 다른 PC]` |
| 8 영상 크레딧 0 | 충족 | Playwright 녹화만 쓴다. 이상 없음 |

### 10.3 실자산 대장과 어긋난 주장

| 설계서 주장 | 대장·실측 | 판정 |
|---|---|---|
| J1 "GT 2,462건 대비 일치율 [실측]"(§0·§3.3·F1-B) | `axis.db`의 자동차 2,462건은 **두 영상(익산 황등 + 경북 47720_001) 합계**다. 황등만의 건수는 모른다. 라벨은 AXIS 자동 라벨 루프(YOLO + SAM 정제, round 2)에서 나왔고, 전수 라벨인지는 확인되지 않았다. 라벨은 SAM 폴리곤이고 예측은 OBB다 | **분모와 순환성 문제.** ① 황등 AOI 안의 GT 건수를 먼저 센다. ② 라벨이 없는 칩에서 나온 탐지를 오탐으로 세지 않도록 '라벨이 있는 칩 안에서의 재현율·정밀도'로 정의한다. ③ AXIS 루프가 car 모델을 썼다면 일치율은 정확도가 아니라 **자기 일치**다 → `audit` 이력으로 확인한 뒤 표기를 정한다. ④ 매칭 규칙(OBB ↔ 폴리곤 IoU ≥ 0.5 등)을 측정 정의에 적는다 |
| C01 "LX 보유 2023 25cm 항공(남원·**전주**·익산·김제 도엽)" | C01은 **비도시** 정사다. 전주 시가지, 남원·익산 도심이 빠져 있을 가능성을 대장 §6이 경고했다(TFW 인덱스 확인이 P3의 선행 작업) | 사다리의 25cm 층을 '비도시 도엽 footprint 안'으로 한정하고, 빈 곳은 xdworld로 떨어지는 것을 출처 칩으로 보여 준다. 전주는 확인 전까지 목록에서 뺀다. 'LX 보유'라는 표현도 권리를 확인하기 전까지 쓰지 않는다(X5) |
| C04 P8 "국토정보기본도 2.0 **남원**" | 대장은 "전국 17개 시도 · 예: 제주시 517,280필지"만 확인했다. `<시도>/<시군>` 폴더에 남원이 있는지는 보지 않았다. 기준 시점은 2021-12(공시지가 2021) | 필지 카드에 `2021-12 기준` 을 반드시 표기한다. P8 전에 남원 폴더가 있는지 확인한다 |
| C09 J2 "27,676건을 실제 재추론으로 대체" | `E:\best.pt`는 학습 run·검증 지표가 없다(대장 1.6) | J2 결과에 `모델 지표 미확인` 을 상시 표기한다. 관제 ④ '모델 교체(mAP 실측 비교)'의 비교 대상이 될 수 없다 |
| A12 "4시점 크롭" | A12는 크롭 144장이다. 필지마다 있는 4시점 크롭이 아니다 | 크롭은 A01 타일에서 실시간으로 잘라야 한다. 그러면 AOI 안 5필지만 가능하다(X1) |
| B01 "학습이 심장처럼 뛴다(results.csv 실곡선)" | results.csv는 끝난 학습의 기록이다 | '실시간 학습'이 아니라 **기록 재생**이다. `[기록 · 2026-01 학습]`으로 표기한다. 실 epoch 이벤트는 Phase 1 `/api/train` 뒤에 나온다(본문 §3.5도 그렇게 적었으니 S-2 장면 문구만 맞춘다) |
| "LX 사업국 38+1 채색" | global-map의 목록에 이름이 **36개**만 있다. 그중 **사할린은 나라가 아니다**(ISO3로 칠하면 러시아 전체가 칠해진다) | 목록을 다시 세고, 사할린은 점 표기로 바꾸거나 뺀다. 표기는 `LX 사업국 n (2023 내부자료 · 목록 확인 36)`로 한다 |
| "NDVI 곡선 107장면 [실측]" | 107은 T43TEH(으슥아타)와 **T43TDH(비슈케크 서쪽)** 두 타일을 합한 수다 | 으슥아타 농지 마스크 곡선에는 T43TEH 장면만 쓰고, 그 수를 따로 센다 |
| AXIS-Label 프록시 `:8001` · `landxi-srv = gcs 복제 + ultralytics 8.3.234` | 대장에 포트 기록이 없다. `gcs`에는 ultralytics가 **없다**(env.md). 8.3.234는 시스템 Py3.11에 있다 | 포트는 [미검증]. gcs를 복제한 뒤 ultralytics를 설치하면 opencv·numpy·torch가 충돌할 수 있으므로 **설치 스모크를 Phase 0 첫날에** 한다. 대안은 워커만 시스템 Py3.11로 돌리는 것이다 |

### 10.4 검증되지 않았거나 이 PC에서 성립하기 어려운 기술 주장

| 주장 | 문제 | 필요한 것 |
|---|---|---|
| "관제 ③ 점유 프로세스 VRAM" | WDDM에서는 N/A [실측] | 프로세스 이름과 전체 used만 표시한다. 프로세스별 VRAM이 필요하면 TCC 전환(사용자 승인) 또는 Phase 2 Linux DCGM |
| TiTiler(`titiler.core`)를 conda `gcs`에 설치 | pip의 rasterio 휠은 자체 GDAL을 번들한다. conda GDAL 3.12.4와 섞이면 드라이버나 PROJ 경로가 깨질 수 있다 [미검증] | `pip install --no-deps` 확인 또는 별도 env. Phase 0 첫날 스모크 |
| Prometheus + windows_exporter + Alertmanager | 이 PC에 하나도 설치되어 있지 않다 [env.md] | P17은 0.5일로는 부족하다. Docker로 띄우면 `host.docker.internal`에서 폴러를 스크랩해야 한다. **1차는 FastAPI가 폴러를 직접 가지고 `ops_alerts`에 쓰도록** 줄이고, Prometheus는 Phase 1로 미룰 것을 권한다 |
| SSE가 `serve.mjs` 역프록시(20줄)를 통과 | Node 프록시가 응답을 버퍼링하거나 압축하면 SSE가 멈춘다. `serve.mjs`의 Range(206) 지원도 [미검증](stack.md) | 역프록시에 `flushHeaders` · 압축 제외 · keep-alive 테스트를 e2e로 넣는다 |
| MIG로 작은 모델을 슬라이스 · k3s · 25GbE · Helm | A100이 오기 전에는 전부 [미검증]이다. MIG를 켜면 그 GPU에 풀 GPU 작업(x-seg 재학습)을 섞을 수 없다. 재구성하려면 GPU를 비워야 한다 | 풀을 **정적으로** 분할하는 표(예: n1 = MIG 추론, n2 = 풀 GPU 학습·SAM2)를 Phase 2 설계에 미리 적는다 |
| Phase 1 멀티 노드 전 데이터 접근 | 워커가 `rasterio window read(COG 로컬 또는 /vsicurl/)`로 읽는데, n1/n2가 이 PC의 E:를 읽는 경로가 없다 | Phase 2 전까지 원격 워커는 게이트웨이의 `/tiles/cog` 내부 라우트 또는 사전 복제로 읽는다고 명시한다 |
| 서명 URL 10분 + pmtiles | 세션 도중 만료(§10.2 요구 5) | 갱신 가능한 `Source` 또는 HttpOnly 쿠키 서명 |
| `demo:true` = 실 GPU + 기록 0 | GPU·s는 실제로 쓰이는데 `usage_events`에 남지 않으면 관제 스윔레인과 쿼터 합계가 어긋난다 | 기관 쿼터에는 넣지 않되 `tenant='lx-demo'` 계량 행은 남긴다. 그래야 관제가 정직하다 |
| "첫 shard ≤ 5s(AOI ≤ 0.25km²)" [목표] | 황등 1.36cm에서 0.25km²는 약 1.35×10⁹ px이고, 1024 칩·20% 겹침이면 약 2,000칩이다 [추정]. 첫 shard 5s는 가능해 보이지만, **영상 한 편(≈120s) 안에 끝까지 도착하는 것**은 bench 전에는 모른다 | 영상용 AOI는 bench 뒤에 "완료 ≤ 40s" 기준으로 역산한다 |

### 10.5 1차 범위 — 과한 것 · 모자란 것

**과한 것(줄여도 판정력이 떨어지지 않는다)**
- F1-D의 `ru` 로케일 · USGS 1분 폴링 · GIBS 화재 · EMS 최신 활성화 크론: 영상에서 몇 초도 안 나오는데 i18n·폴링·크론 세 벌이 붙는다 → `en`만 남기고, 글로브 오버레이는 사업국 채색 + 어제 GIBS로 끝낸다.
- F1-C의 Prometheus·windows_exporter·타일 트래픽·용량 계획 칸: 반화면 녹화에서 보이는 것은 GPU 링·큐·할당 막대뿐이다 → 폴러 직결로 줄인다(§10.4).
- F1-B의 PostGIS RLS 다섯 겹 전체: 1차 영상에 기관 세션이 나오지 않는다. 스키마와 RLS 정책은 만들되, **격리 e2e(기관 A로 B 행 0건)** 는 2차 포털 조각의 완료 기준으로 옮겨도 된다.

**모자란 것(요구와 판정에 직접 걸린다)**
- 배포 제어·이식 한 장면(X2) — 요구 4의 세 기둥 중 하나다.
- 글로벌 GPU/CPU job 한 건(X3), 소쿨룩·`kgz-land`(X4).
- 종이 무대 한 장면(로그인 얼굴판 또는 대시보드 계기판 15s) — v2 법전의 절반이 판정되지 않는다(§10.2 요구 6).
- **계약 먼저 하는 날(D0)**: §8.1은 "네 조각은 파일 소유가 겹치지 않아 병렬"이라고 하지만 F1-A의 V2 프레임은 `/jobs/quote`, F1-C는 `jobs`·`usage_events`·SSE에 **데이터로 의존**한다. 파일 충돌이 없다고 의존이 없는 것이 아니다. `api.js` 계약(봉투·이벤트 스키마·목(mock) 서버)을 D0에 고정하는 단계를 추가한다.
- 녹화 전 GPU 정리 절차(Ollama 언로드)와 녹화 해상도·GPU 선택 확인(§10.1).

**기간**: 네 조각 합 31–39일 [본문 추정]을 3–4주로 병렬 처리하고 통합 2일을 붙이는 계획이다. D0 계약, 설치 스모크(TiTiler·ultralytics·PostGIS pull), Q-A~Q-E 답을 기다리는 시간이 빠져 있다. **4–5주 [추정]** 이 현실적이다.

### 10.6 기존 기능 인벤토리(원본 35화면) 대비 누락

전제는 "원본 1:1"인데 §2.1 표는 화면 단위로만 대응시켰다. **서버 계약(§5.2 API · §5.3 스키마)** 에 다음 원본 기능의 자리가 없다. 이대로 가면 이 기능들은 localStorage 목업으로 남아 요구 1("운영 가능")과 부딪친다.

| 원본 기능(인벤토리 §) | 빠진 것 |
|---|---|
| 데이터 업로드(§3): 형식 필터, **일시정지·재개·이어 올리기**, 레이어 발행 폼(발행유형·기준일자·출처·**공유권한 표**), 발행 취소, 아카이브 공유·공간 편집·삭제 | 이어 올리기 업로드 API(tus 류) · `uploads` 표 · 업로드 → COG/PMTiles → 카탈로그 등록 파이프라인(P 시리즈는 배치 스크립트만 있다) · 레이어 발행/취소 API |
| **공유 설정 모달**(§3 아카이브 · §4 라벨링 · §5 분석 완료 두 변형) · 분석 실행중 '내 것/공유받은 것' 필터 | 사용자 간 공유 ACL 표가 스키마에 없다(RLS는 기관 경계만 막는다) |
| 계정 신청(signup 다단계) · 아이디/비밀번호 찾기(§11) · 관리자 사용자 승인/거부 · 로그인 이력 · 비밀번호 변경 이력(§9) · 대시보드 KPI '가입 승인 대기' | `/auth/signup` · `/auth/find-*` · `lx_users.status` 승인 흐름 API · `login_history` · `pw_history` 표 |
| 공지·FAQ·문의·활용사례·매뉴얼 CRUD(§7·§9) · 대시보드 '미답변 문의' · `?notice=` 딥링크 | `notices` · `faqs` · `inquiries` · `usecases` 표와 API가 없다. §3.4 `feedback`(오탐 신고)은 문의의 한 종류일 뿐이다 |
| 프로젝트(§4): 목록·검색·생성 마법사·구성원 초대(편집자/뷰어)·파일 업로드·데이터셋·**AI 모델 등록**·**카드 발행 요청 이력** | `projects` · `project_members` 표 없음. `/registry`는 GET뿐이라 모델 등록과 발행 요청(→ `approvals`)을 쓰는 경로가 없다 |
| 카드 편집 폼(§8): **도커 이미지명·태그** · 탐지형태 · **타일링 크기** · 사용여부 | `models`에 `weights_uri`만 있다. 원본은 **컨테이너 이미지를 배포 단위**로 본다. 요구 4의 '모듈형 배포·이식'과 직결되는 필드다 → `models.image`, `models.tile_size`, `models.infer_shape` 추가를 권한다 |
| 지도 속성 관리 `admin-map`(§9): 표시 스타일·기본 배경·**탐지 결과 색·두께** | v2 토큰(`--det-*`, `--conf-*`)과 관리자 설정 중 무엇이 우선하는지 정해지지 않았다. `map_props` 표 + 토큰 덮어쓰기 규칙이 필요하다 |
| MY(§10): 회원정보 수정 · 비밀번호 변경 · **디스크 증량 신청 이력** · 브랜드 심볼 업로드 · 탈퇴 | 증량 신청 → 관제 ③ 한도 결재(§10.2 요구 4) · 심볼 업로드는 기관 CI(`brand.js`)와 역할이 겹친다 |
| 홈(§12): 서비스 라인업 **13종 칩**(원본) vs 설계서 15칩 · 정부 표준 푸터 · 문의 폼 | 15는 7차 피드백(산림 훼손·탄소 흡수량 `준비 중` 포함)이다. 원본과 다른 이유를 §2.1에 적는다. 문의 폼 저장소가 없다 |
| 딥링크 `?pid` · `?status` · `?open` · `?notice` · `?tab`(§13) | §3.1 URL 상태는 XI맵만 다룬다. 원본 딥링크 보존표가 필요하다 |

### 10.7 설계서에 더할 것 — 착수 전 순서

1. **X1 장면 재작성**(시 단위 도착 · AOI 5필지 cm 연출) — F1-A 완료 기준 교체.
2. **D0 계약일**: `api.js` 봉투·SSE 이벤트·목 서버 · §10.6 표를 반영한 `migrations/0001`(projects · uploads · shares · notices · faqs · inquiries · usecases · map_props · login_history · model image 필드).
3. **Phase 0 설치 스모크 1일**: PostGIS pull · TiTiler와 gcs 공존 · ultralytics 설치 · serve.mjs Range/SSE · Chrome이 쓰는 GPU 확인 · Ollama 언로드 절차.
4. F1-C에 배포 제어 R-1 + 이식 한 장면(X2). F1-D에 시나리오 B · 소쿨룩 · 글로벌 job 1건(X3·X4). `ru`·USGS·화재·크론은 뺀다.
5. 영상에 종이 무대 15s를 추가한다.
6. 콘티 표기 교정: HUD 예시 `[예시]` · DEPLOYS 9,664 · `basis:'history'` · 4090 `[실측 · 다른 PC]` · 사업국 수 · 107장면 분리 · J1 GT 정의.
7. Q-E에 사용자 액션 추가: ⑤ C01 25cm·A01 드론 영상의 **공개 권리·보안 처리** 확인 ⑥ C04(Mobility Convergence 사업 자료)를 Land-XI에 써도 되는지 ⑦ TCC 전환 여부(프로세스별 VRAM) ⑧ Ollama 상주 정책.
8. '운영 가능'의 정의(로컬 · 내부망 · 시연 규모)와 공공 운영 요건(망 구성 · 보안 인증 · 백업 RPO/RTO · KWCAG)을 3차 완료 기준으로 명시하고, §7 루브릭에 '운영 요건' 행을 추가한다.


---
## 부록 V — 비전·모토 확정 (2026-09-24 사용자)
**Hyper Performance · Hyper Solution · Hyper GeoAI 통합 플랫폼 서비스.** 로그인 3축·메인 마감·글로벌 영문 히어로에 그대로 사용. Performance=GPU 실시간 추론·대용량 영상(실측) / Solution=실태조사·모듈형 카드·행정 연계·LLM 에이전트 / Hyper GeoAI 통합=위성·항공·드론·글로벌을 한 XI맵에.


---
## 포지셔닝 확정 (2026-09-26 사용자)
**"공공기관(LX)이 제공하는 유일한 GeoAI 솔루션 — 정부 부처·지자체의 실태조사 업무를 지원하는 특화 솔루션."**
- 제품의 중심 축 = 실태조사(SURVEY-SPEC). XI맵·생산·관제·에이전트는 모두 실태조사를 끝까지 해결하기 위해 존재한다.
- 부처별 실태조사 카탈로그로 서비스를 편성: 농식품부(농지이용실태조사·농지전용)·국토부(개발행위 사후관리·토지이용·지목불부합)·행안부(공유재산 실태조사)·환경부(하천점용·방치폐기물)·산림청(산림훼손)·해수부(해양쓰레기)·지자체(무허가건축물·개발제한구역).
- "유일함"의 근거: 지적(필지)·측량 공공기관 LX 의 공신력 + 연속지적 PNU 결합 + 실추론 GPU + 대장 대조 규칙 + 현장조사 연계. 민간 GeoAI(Esri·Google)가 못 하는 필지 단위 행정 실태조사.
- 화면 언어: 첫 화면·로그인·글로벌판에서 "실태조사 특화"가 즉시 읽혀야 한다.
