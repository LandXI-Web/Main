# Land-XI GeoAI 에이전트 층 — AGENT-SPEC (v0.1 · 2026-09-24 · Fable 5.1)

- 무엇: 설계서 `LANDXI-HYPER-BLUEPRINT.md` v1.1에 빠져 있던 층. 사용자 지시 "젬마, 모두의 AI, 정부 독파모 등 AI 에이전트, vLLM 핵심 기술을 활용한 서비스도 당연히"에 대한 기획 명세. 비전 3축 중 **Hyper Solution**(실태조사 · 모듈형 카드 · 행정 연계 · **LLM 에이전트**)의 마지막 항목을 채운다.
- 근거: `agent/research-models.md`(모델 · 서빙 · 보안 조사 · 출처 URL) · `agent/local-llm.md`(이 PC 실측 2026-09-24 10:50) · 설계서 §1 · §3 · §4 · §5 · §9 · `F1-CONTRACT.md`(봉투 · 엔드포인트 · 쿼터 · SSE · 소유 경계) · `design/system-v2.md` · 메모리 10편(특히 quality-bar 10차 "사용자가 짚기 전에 먼저 기획").
- 표기: 설계서와 같다. **[실측]** 이 PC에서 잰 값 · **[추정]** 계수 계산 · **[목표]** 아직 안 잰 설계 예산 · **[미확인]** 외부 사실이지만 확인 못 함(조사 문서의 미확인 목록 그대로). 지어낸 운영 수치는 없다. 벤치마크·토큰 속도·정확도는 **하나도 재지 않았다** — 전부 [목표]·[미확인]이다.
- 위상: 이 문서는 **기획 명세**다. 저장소 소스는 고치지 않았다. 계약 추가(§3.4)는 `F1-CONTRACT.md` v1.1 개정 요청이며 Fable이 판정한다.

---

## §0. 한 장 요약

**정의 한 문장** — *에이전트는 XI맵의 아홉 번째 동사 "말하다(V9)"다. 사람의 말이 플랫폼 API 호출로 바뀌고, 결과는 지도에 도착하고, 문장 속 모든 숫자는 도구 결과의 봉투에서만 나온다.*

**원칙 다섯(설계서 §5.1 원칙 다섯과 짝)**

1. **도구 = 계약 API 그대로.** 에이전트에 새 권한이 없다. 사용자의 Bearer 토큰을 그대로 들고 `/api/v1/*`을 부르므로 realm · role · caps · RLS가 사람과 똑같이 걸린다. 기관 A 매니저의 에이전트는 기관 B 행을 SQL 수준에서 볼 수 없다.
2. **숫자는 도구에서만.** LLM은 숫자를 쓰지 않고 `{{env:e1}}` 자리표만 쓴다. 서버가 도구 결과의 봉투로 치환하고, 자리표 밖의 숫자는 **숫자 검증기**가 잡아 `검증 안 된 숫자` 칩으로 지운다. `prov()`가 봉투 없는 숫자에 throw하는 규칙(법전 §5)이 문장에도 적용되는 것이다.
3. **쓰기는 사람이 누른다.** 조회 도구는 자동, GPU 작업 제출 · 오탐 신고 · 배포 조작은 **확인 카드**(견적 카드와 같은 부품)를 사람이 승인해야 실행된다. 1차에서 배포(`deploys.*`) 쓰기 도구는 에이전트에 아예 없다.
4. **온프레미스 오픈웨이트가 기본.** vLLM(OpenAI 호환) on A6000 → A100. 인터넷 클라우드 LLM은 `LLM_EXTERNAL=off` 기본, N2SF 공개(O) 등급 데이터 · 게스트 화면에서만 예외를 검토한다(§2.4).
5. **국내 공공 정체성은 정직하게 표기.** 독파모 3종(A.X K2 · Solar Open 2 · K-EXAONE 2.0)은 가중치가 공개되어 있지만 로컬 GPU로 돌릴 수 없다(H200 4장 이상). 범정부 AI 공통기반 연결(2026 예정 · 호출 방법 [미확인])이 열리면 라우터가 승격한다. 그 전까지 화면 모델 칩은 `Gemma 4 · 온프레미스 vLLM · Apache 2.0`처럼 **실제 돌고 있는 것**을 쓴다.

**서비스 아홉(§1)** — AG-1 자연어 공간 질의·분석 실행 · AG-2 실태조사 보고서·공문 초안 · AG-3 법령·지침 RAG · AG-4 영상 VLM 설명·검수 · AG-5 프롬프트 분할 라벨링 · AG-6 관제 운영 에이전트 · AG-7 글로벌 다국어 · AG-8 시민용 쉬운 설명 · AG-9 외부 연계(모두의 AI MCP 도구 서버).

**1차 최소판(§5 AG-0)** — 이 PC에서 **오늘 돌아가는 것**만으로: Ollama `/v1`(상주 중 [실측]) + 도구 4개(결과 피처 · 필지 · 집계 · 필지 결합) + 숫자 검증기 → **"남원 농지 중 건물 탐지된 필지 보여줘" 1종 + 읍면동 실태조사 보고서 초안 1종**. vLLM은 드라이버 522.06 하나가 막고 있어(2차 · 사용자 조치 U1) 최소판은 vLLM 없이 닫는다. 백엔드 URL 한 줄(`LLM_BASE_URL`)만 바뀌므로 Ollama → vLLM 이관에 프론트 · 도구 · 프롬프트 변경이 없다.

---

## §1. 서비스 목록 — 기존 기능 · 사용자 여정에 묶어, 각 '우와' 장면

원칙(메모리 redesign-direction 8/26): **새 기능 발명이 아니라 기존 기능을 말로 부르는 것**이다. 아홉 서비스는 모두 원본 35화면의 어느 자리에 붙는지, 어느 계약 API를 부르는지, 어느 실자산으로 장면을 닫는지를 적었다.

| # | 서비스 | 사용자 | 붙는 자리(원본 기능) | '우와' 장면(실자산) | 도구(계약 API) | 모델 역할 | 차수 |
|---|---|---|---|---|---|---|---|
| **AG-1** | **자연어 → 공간 질의 · 분석 실행** | 공무원 · LX 직원 | XI맵 명령 바(`⌘K` `.palette` 재사용) → 에이전트 패널. V8 열람 · V2 프레임 · V3 실행을 말로 | **"남원 농지 중 건물 탐지된 필지 보여줘"** → 계획 3단계가 패널에 노출(Palantir AIP 방식: `지목 전·답·과 필지 ← C04 2021-12` → `건물 49,800 [실측 · AI 추론 · 검수 전] ← P4 2023 25cm` → `PostGIS 결합`) → 결과 필지가 **스윕 → 락온 → 숫자 40ms/글자로 도착**(V4 `arrive()`) · 읍면동 막대 · 규칙 카드 `지목 전·답·과 ∩ 건물(AI 추론)`. 두 번째 문장 **"이 프레임 비닐하우스 분석해줘"** → `jobs/quote` 견적 카드가 확인 카드로 뜨고 사람이 누르면 `POST /jobs` → job-theater | `results_features` · `parcel_at` · `results_stats` · **`results_parcels_join`(신설 §3.4)** · `jobs_quote` · `jobs_submit`(확인) · 클라이언트 도구 `map_on` `map_arrive` `map_frame` | 계획자(도구 호출) + 라우터 | **1차(AG-0)** |
| **AG-2** | **실태조사 보고서 · 공문 초안** | 공무원 | 보고서 서랍(`report-standard*.html?embed=1` · 원본 XI맵 보고서 3화면) 안 '초안 작성 ›' | 읍면동을 고르면 **개조식 공문 초안**이 종이 무대에 타이핑되고, 숫자마다 프로비넌스 칩(`운봉읍 경작지 1,324.8ha [실측 · P10]`), 근거 필지 [1][2]…를 누르면 **지도가 그 필지로 flyTo + A01 4시점 크롭**(AOI 안 · 밖은 A03 2시점 표기). 내보내기 `.docx`(python-docx · BOM CSV 첨부). 법령 인용 칸은 1차 `법령 인용 · 2차(RAG)` 결손 표기 | `results_stats(by=emd)` · `results_parcels_join` · `parcel_at` · `feedback_list`(기관 자기 것) · 보고서 템플릿 `survey-emd` | 작성자(한국어 행정 문장) — 1차 Gemma 4 / 공통기반 연결 시 독파모 승격 | **1차(AG-0)** 초안 1종 · 공문 서식 · HWPX는 2차 [미확인: HWPX 라이브러리] |
| **AG-3** | **법령 · 지침 RAG** | 공무원 · LX 직원 | 필지 카드 하단 '관련 조문 ›' · 보고서 법적 근거 칸 · 서비스 지원 FAQ | 지목 '전' 위 건물 필지 카드에서 조문이 **원문 그대로** 인용되고(농지법 · 건축법 · 국토계획법 · 농지이용실태조사 요령), 요약은 `요약 · 원문 아님` 꼬리표. 출처는 조 · 항 · 시행일 | `law_search(query, acts[])` → pgvector 또는 파일 인덱스(2차 결정 · §3.6) | 임베딩(후보 bge-m3 [미확인]) + 작성자 | 2차. **법령 원문 반입은 사용자 조치**(국가법령정보센터 Open API는 인터넷망 · 내부망 접근 [미확인]) |
| **AG-4** | **영상 VLM 설명 · 검수 보조** | LX 직원(검수) · 공무원(사전 판독) | XI맵 결과 폴리곤 클릭 → 유리 카드 '왜? ›' · 검수 편집(`PATCH /results`) 옆 · 현장조사 대상 목록 | 비닐하우스 폴리곤을 누르면 **4시점 크롭이 나열되고** VLM이 *"2025-04 골조만 · 2025-06 피복 완료 · 2025-10 유지"* 식으로 시점을 읽어 준다. 오탐 의견은 `VLM 의견 · 근거 아님` 꼬리표, 한 번의 클릭으로 `POST /feedback kind=fp` 확인 카드. 현장조사 전 상위 N필지에 한 줄 소견이 붙는다 | `crop_tiles(imagery_id, bbox, epochs[])`(서버가 A01 PMTiles/XYZ에서 잘라 이미지로) · `vlm_describe` · `feedback_create`(확인) | **VLM(Gemma 4 · 이미지 입력)** | 2차(vLLM 뒤). **정직 표기**: Gemma 4의 항공영상 판독 성능은 공개 수치 없음 [미확인] → 남원 4시점 크롭 평가셋을 먼저 만든다(§5.4) |
| **AG-5** | **프롬프트 분할 라벨링 가속** | LX 직원(모델 개발) | 프로젝트 라벨링 단계(AXIS-Label D10 프록시 `:8001` [미검증]) | 라벨러가 "비닐하우스"라고 치면 **SAM 3가 칩 안 모든 인스턴스를 한 번에** 마스크로 뽑고, 라벨러는 지우기만 한다. AXIS-Label에 이미 SAM2 · DINOv2 · YOLO 루프가 있으므로 텍스트 프롬프트 한 단계만 얹는다 | `sam_segment(chip, prompt|points|box)` → AXIS-Label 큐 | SAM 3(2025-11 · Meta 자체 라이선스 · 상업 조건 [미확인]) · 폴백 SAM2(HF 캐시 857MB [실측]) | 3차 |
| **AG-6** | **관제 운영 에이전트** | LX 관리자 | LX/OPS `:8702` 경보 스트립 '요약 ›' · 인프라 관제 노드 카드 | *"GPU1 왜 느려?"* → `ops/gpus` · `ops/queues` · `ops/alerts` · `ops/models`를 읽어 **"GPU1 외부 점유 23,396 MiB(llama-server ×4) [실측] + 워커 batch 강등 → 칩/s 저하"** 식으로 한 문단. 조치(재큐 · 우선순위 · 모델 unload)는 **제안 카드**로 뜨고 관리자가 누른다 — 에이전트가 직접 실행하지 않는다 | `ops_gpus` `ops_queues` `ops_alerts` `ops_models` `ops_storage`(읽기) · 제안만: `jobs_requeue` `jobs_priority` `models_unload` | 계획자(작은 모델로 충분) | 2차 |
| **AG-7** | **글로벌 다국어(en · ru · ky)** | 해외 기관(kgz-agri · kgz-land) | Global 포털 지도 탭 · 같은 명령 바 · `locale` | `kgz-agri` 매니저가 러시아어로 *"으슥아타 6월 NDVI?"* → G-J1 결과(`index.month` 봉투)로 답하고 지도가 그 달로 스크럽. UI는 1차 `en`만(§10.5), 대화 언어는 모델이 받는 대로 | 같은 도구 + `locale` | Gemma 4(140+ 언어 · 키르기스어 품질 [미확인]) | 3차(ru UI 2차 뒤) |
| **AG-8** | **시민용 쉬운 설명** | 일반 시민(게스트) | XI맵 공개 모드 `public=1` 검색 바 | *"우리 동네 하천에 건물이 왜 문제예요?"* → B02 하천 점유 651,478건 [실측] 중 검색 지역 값을 봉투로 보여 주며 두 문장으로. 공개 결과(`export_policy=public`)만 · 원본 영상 0(R6) | `results_features(public)` · `results_stats` | 라우터 + 작성자. **외부 클라우드 예외를 검토할 유일한 자리**(공개 O 데이터) — 1차 · 2차는 OFF | 3차 |
| **AG-9** | **외부 연계 — 모두의 AI 도구 서버** | 국민(모두의 AI 챗봇 경유) · 타 기관 | 게이트웨이 밖 `mcp/` 어댑터 | 국민이 모두의 AI(SKT · 카카오 · KT · 2026-12 정식)에서 "내 땅 경계 확인"을 물으면 **Land-XI가 도구로 호출**되어 지적 조회 · 판독 결과 · 변화 탐지를 돌려준다 | 계약 API를 MCP · OpenAPI 도구로 노출(`catalog.public` · `results.read(public)` · `parcels`) | — | 3차. 연계 규격 **[미확인]**(공개 자료 없음) → 규격이 나오면 어댑터만 쓴다 |

**여정에서 보이는 순서(1차 영상 기준)** — 공무원 P-1 도착 뒤 명령 바에 한 문장(AG-1) → 결과 도착 → 보고서 서랍 '초안 작성'(AG-2) → 숫자 칩 · 근거 필지 flyTo → `.docx`. LX 직원은 S-1 실추론 뒤 "이 프레임 비닐하우스"로 두 번째 job을 말로 제출(확인 카드). 관리자는 2차부터.

**세 사용자 '우와'의 실체**

| 사용자 | 우와 | 불합격 신호 |
|---|---|---|
| 공무원 | "말했더니 필지가 지도에 찍히고, 공문 초안까지 숫자에 출처가 달려 나왔다" | 채팅창에 글만 · 숫자에 칩 없음 · 지도 무반응 |
| LX 직원 | "에이전트가 내 모델을 내 계약 API로 부른다 — 계획 단계가 보인다" | 블랙박스 답변 · 도구 호출 로그 없음 |
| 관리자 | "경보 한 줄이 원인 · 실측 · 조치 제안으로 풀린다, 실행은 내가" | 에이전트가 스스로 재큐 · 롤백 |

---

## §2. 모델 전략

### 2.1 조사 결과 기준 — 실제 공개 · 라이선스 가능한 것만(research-models.md §1 · §3)

| 후보 | 규모 | 입력 | 라이선스 | 로컬(A6000 ×2) | 판정 |
|---|---|---|---|---|---|
| **SKT A.X K2**(독파모 2차 1위 70.6) | 688B | 텍스트 | Apache 2.0 | 불가 | 공통기반 경유 후보 |
| **Upstage Solar Open 2**(69.9) | 250B MoE(활성 15B) | 텍스트 | Solar License(상업 가능 · `Solar` 접두 · "Built with Solar" 표기 의무) | 불가(H200 ×4 권장) | 공통기반 경유 후보 · 표기 의무 UI 반영 |
| **LG K-EXAONE 2.0**(69.0) | 750B MoE(활성 37B) | 텍스트 | Apache 2.0 | 불가 | 공통기반 경유 후보 |
| A.X K2 VL Light-Preview | ? | 비전 | **[미확인]** | ? | 공개 여부 확인 뒤 |
| EXAONE 4.5 33B(VLM · 독파모 산출물 아님) | 33B | 비전+텍스트 | **NC(비상업)** — 공공기관 내부 이용 해당 여부 LG 확인 필요 | AWQ로 1장 가능 [추정] | 라이선스 확인 전 사용 금지 |
| **Gemma 4** | E2B · E4B · 12B · 26B A4B(활성 3.8B) · 31B | 전 크기 이미지 · E2B/E4B/12B 오디오 · 128–256K | **Apache 2.0** | 가능(크기별 §3.2) | **로컬 1순위** — 도구 호출 네이티브 · thinking · vLLM 공식 레시피 · 한국어 벤치 [미확인] |
| HyperCLOVAX-SEED-Text-Instruct 1.5B | 1.5B | 텍스트 | HF 카드 확인 [미확인] | **캐시됨 3.0GB [실측]** | 스모크 · 라우터 후보 |
| Ollama 상주 qwen3:4b-instruct · qwen3:1.7b · exaone3.5:7.8b · exaone3.5:2.4b | Q4_K_M · ctx 8192 [실측] | 텍스트 | qwen3 Apache 2.0 · EXAONE 3.5 라이선스 [미확인] | **지금 돌고 있음** | **AG-0 프로토타입 백엔드** |

### 2.2 역할별 배치(라우터)

| 역할 | 하는 일 | 1차(AG-0 · 이 PC · 오늘) | 2차(vLLM · 드라이버 갱신 뒤) | 3차 · 4차 |
|---|---|---|---|---|
| **라우터** | 의도 분류 · 도구 선택 · 언어 감지 · PII 1차 필터 | Ollama `qwen3:4b-instruct`(도구 호출 지원 [미검증 · 첫날 스모크]) | Gemma 4 E4B 또는 HyperCLOVAX 1.5B(국산 · 캐시) | 동일 |
| **계획자 · 도구 호출** | 다단계 계획 · JSON 인자 생성 · 결과 조합 | 같은 qwen3:4b(라우터 겸) | **Gemma 4 12B**(1 GPU 예산 안 · §3.2) | Gemma 4 31B TP=2(A6000 ×2 U2 결정 뒤 · A100 그대로) |
| **작성자(한국어 행정 문장)** | 보고서 · 공문 · 쉬운 설명 | qwen3:4b → 문장 품질은 [미확인] · 초안 표기 | Gemma 4 12B · EXAONE 3.5 7.8B는 라이선스 확인 뒤 | **독파모(공통기반 API) 승격** — 라우터가 `backend:'gongtong'`으로 보냄 · 화면 칩 `K-EXAONE 2.0 · 범정부 AI 공통기반` |
| **VLM** | 크롭 설명 · 시계열 읽기 · 오탐 의견 | 없음(1차 제외) | **Gemma 4 12B(이미지)** · 이미지 토큰 560~1120 [추정] | 31B · 평가셋 뒤 모델 확정 |
| **임베딩(RAG)** | 법령 · 지침 청크 | 없음 | 후보 bge-m3(MIT · 다국어) [미확인 · 후속] | 동일 |
| **분할** | 텍스트 프롬프트 분할 | AXIS-Label SAM2(있음) | SAM2 | SAM 3(라이선스 확인) |

라우터 규칙은 `server/agent/config/router.yaml` 한 파일: `task → [backend 우선순위]` · 폴백 순서 · 최대 토큰 · 이미지 허용 여부. 백엔드는 셋뿐이다: `ollama`(`http://localhost:11434/v1`) · `vllm`(`http://localhost:8000/v1`) · `gongtong`(공통기반 · URL · 인증 [미확인] · 스텁). 전부 OpenAI 호환 `chat/completions`이므로 **클라이언트 코드는 하나**다.

### 2.3 온프레미스 · 망분리 전제

- N2SF: 지적 · 소유 정보는 **민감(S) 이상**으로 분류될 가능성이 높다(research §6). 따라서 LLM 서버는 게이트웨이와 같은 노드(1차) 또는 같은 내부망 노드(Phase 2)에만 둔다. 모델 가중치는 반입 1회(Apache 2.0 · 재배포 제약 없음) 뒤 인터넷 없이 돈다 — HF 캐시를 `E:\hf-cache`에 두고 `HF_HUB_OFFLINE=1`.
- 범정부 AI 공통기반은 **행정망 안**의 서비스이므로 "외부 API"가 아니다. 독파모 모델 승격 경로로 허용한다. 단 실제 호출 규격 · 인증 · 데이터 반출 조건이 [미확인]이므로 3차 항목이다.
- 프롬프트 · 도구 결과 · 응답은 LX 밖으로 나가지 않는다(원칙 (3) 원본 불반출과 같은 결). 감사 로그(§3.5)에 프롬프트 해시와 도구 인자만 남기고 원문은 보존 기간을 따로 정한다(사용자 결정 아님 · 3차 운영 요건).

### 2.4 외부 API 금지 원칙과 예외

| 조건 | 허용 |
|---|---|
| 기본값 | `LLM_EXTERNAL=off` — 코드에 외부 LLM 클라이언트 키가 없다(`server/.env`에도 없음) |
| 예외 검토 대상 | AG-8 시민용(게스트 · `build=public` · `export_policy=public` 결과만 · 필지 · 소유 정보 0) |
| 예외 조건 | N2SF 데이터 분류 가이드라인(연내 예정 [미확인])에서 해당 데이터가 **공개(O)**로 판정 · 국정원 AI 보안 가이드북 '내부업무용 AI의 외부망 연계' 유형 대책 적용 · 사용자 승인(§6 Q-AG4) |
| 차수 | 1차 · 2차 전면 OFF · 3차에 재논의 |

---

## §3. 서빙 아키텍처

### 3.1 컴포넌트(설계서 §5.1 그림에 얹는 칸)

```
EXPERIENCE   landxi/agent/{cmdbar,panel,report-writer}.js  ← 명령 바 · 에이전트 패널 · 보고서 작성기 (F1-A fx 함수 import만)
                │ POST /api/v1/agent/runs · SSE /api/v1/events/agent/{run}
SERVICE      FastAPI 게이트웨이 :8700  +  server/agent/  (router · planner · tools · number-lint · confirm · audit)
                │ 도구 실행 = 게이트웨이 내부 호출(같은 프로세스 · 사용자 토큰 그대로 · RLS 그대로)
                │ LLM 호출 = OpenAI 호환 클라이언트 1개  →  LLM_BASE_URL
LLM PLANE    ① Ollama :11434/v1  [실측 · 지금]      ② vLLM :8000/v1 (Docker vllm/vllm-openai · GPU1)  [2차 · U1 뒤]
             ③ 범정부 AI 공통기반(독파모)  [3차 · 미확인]
STATE        Redis  agent:runs:{id} 스트림(SSE 재생) · agent:models 해시     PostGIS  agent_runs · agent_tool_calls · agent_confirms · (2차) law_chunks
QUOTA        usage_events dim ∈ {llm_tokens, llm_runs, vlm_images}  → 기관 쿼터 링 7·8번째
OPS          ops:gpu 외부 점유 띠에 vLLM 컨테이너가 '자기 보고' 워커로 등록 → 모델 배치 매트릭스에 LLM 행 · 토큰/초 스파크라인
```

- 에이전트 서비스는 **게이트웨이 안**이다(별도 포트 없음). 이유: 도구가 곧 계약 API이고 인증 · RLS · 봉투 직렬화기를 그대로 타야 하기 때문이다. 소유 경계는 `server/agent/**`로 분리(§5.2).
- LLM 플레인은 게이트웨이와 **다른 프로세스**다. Ollama · vLLM · 공통기반 셋 다 URL 한 줄로 바뀐다.

### 3.2 vLLM 배치 — 이 PC 실측 조건에서(local-llm.md)

| 항목 | 값 · 결정 |
|---|---|
| 지금 막는 것 | **NVIDIA 드라이버 522.06(CUDA 11.8 상한) 하나 [실측]**. WSL2 · Docker `nvidia` 런타임 · `--gpus all` 통과는 검증됨 [실측]. Python 환경 어디에도 vLLM · SGLang 없음 [실측] |
| 경로 | **A. Docker Desktop(WSL2) + `vllm/vllm-openai`**(권장) · B. WSL `uv venv -p 3.12` pip(차선) · C. Windows 네이티브(제외) |
| GPU 예산 | Ollama 종료 금지(R10) 유지 시 **장당 약 22GB [실측 기반]** → `--gpu-memory-utilization ≈ 0.45`. 이 안에 들어가는 Gemma 4: **E4B BF16(≈9GB [추정])** · **12B int4/AWQ(≈7–8GB [추정])** · 12B BF16(≈24GB [추정])은 빠듯해 불가. 26B A4B BF16(≈50GB)과 31B는 **U2(GPU 역할 분리) 없이는 불가** |
| 스모크(U1 직후) | 캐시된 HyperCLOVAX 1.5B를 GPU1에서 `--gpu-memory-utilization 0.40 --max-model-len 8192` → `curl /v1/models`(local-llm §0 명령 그대로) |
| Gemma 4 기동 | `--enable-auto-tool-choice --tool-call-parser gemma4 --reasoning-parser gemma4 --limit-mm-per-prompt '{"image":4,"audio":0}'`(공식 레시피) · TP=2는 `NCCL_P2P_DISABLE=1` [미검증 · WSL 멀티 GPU] |
| Ampere FP8 | A6000은 FP8 하드웨어 없음 → int4(AWQ/GPTQ) 또는 BF16. `RedHatAI/gemma-4-31B-it-FP8-dynamic`의 Marlin W8A16 동작은 v0.30에서 [미확인] |
| 구조화 출력 | vLLM guided decoding(JSON schema)로 도구 인자 · 답변 스키마 강제 — v0.30 옵션명 [미확인 · 설치 시 확인] |
| SGLang | 동시 요청 처리량이 모자라면 비교 측정(Solar Open 2는 SGLang 공식 안내) |
| 확장 | Phase 2 A100 ×4: 31B BF16 TP=2(레시피 그대로) · 노드 `pool:llm` 등록 · 공통기반 승격은 하드웨어와 무관 |

**공존 규칙(R10 준수)**: vLLM 컨테이너는 워커와 같은 `workers/vram.py` 규칙을 따른다 — 기동 전 `memory.used`를 읽고 `free − 2,048 MiB` 안에서 `gpu-memory-utilization`을 계산해 넣는다(스크립트 `server/agent/llm/launch_vllm.ps1`). 관제 GPU 행에는 `외부 점유(Ollama)` 띠 옆에 `LLM(vLLM)` 띠가 따로 그려진다 — 둘을 합치지 않는다.

### 3.3 도구 = 플랫폼 API 계약 그대로

| 도구 id | 계약 엔드포인트 | 쓰기 | 확인 카드 | 비고 |
|---|---|---|---|---|
| `catalog_layers` | `GET /catalog/layers?build=&bbox=&z=` | – | – | 현재 뷰의 사다리 · 결과 목록 |
| `results_features` | `GET /results/{set}/features?bbox=&cls=&min_conf=` | – | – | 2,000건 한도 · 넘으면 `results_stats`로 유도 |
| `results_stats` | `GET /results/{set}/stats?by=emd\|cls` | – | – | 봉투 그대로 |
| `parcel_at` | `GET /parcels?lng=&lat=` | – | – | `owner_kind`만(소유자명 없음 · 계약 §4.5) |
| **`results_parcels_join`** | **신설 `GET /results/{set}/parcels?cls=&jimok=&emd_cd=&limit=`**(§3.4) | – | – | PostGIS `ST_Intersects(detections, parcels)` · 응답 필지 FeatureCollection + `count` 봉투 + `by_emd` |
| `jobs_quote` | `POST /jobs/quote` | – | – | 견적 카드 = 확인 카드 본문 |
| `jobs_submit` | `POST /jobs` | **쓰기** | **필수** | sales는 `demo:true` 강제(계약 그대로) |
| `feedback_create` | `POST /feedback` | 쓰기 | 필수 | tenant만 |
| `ops_*`(gpus · queues · alerts · models · storage) | `GET /ops/*` | – | – | admin · Origin 8702만 |
| `jobs_requeue` · `jobs_priority` · `models_unload` | `POST /jobs/{id}/…` · `POST /ops/models/{id}/unload` | 쓰기 | 필수(제안 카드) | 2차 · AG-6 |
| `crop_tiles` | 내부: `LX_DATA_ROOT` PMTiles/XYZ에서 bbox × epochs 크롭 → PNG | – | – | 2차 · AG-4 · 기관에는 `tile` 등급만(원본 0) |
| `vlm_describe` | LLM 플레인(이미지) | – | – | 2차 |
| `law_search` | `server/agent/rag/` | – | – | 2차 |
| 클라이언트 도구 `map_on(set, filter)` `map_arrive(bbox, count_env)` `map_frame(geojson)` `map_flyto` `drawer_open(report\|stats)` | 브라우저에서 F1-A fx 함수 호출 | – | – | 서버가 `ui_actions[]`로 내려주고 프론트가 실행 |
| **없는 것** | `deploys.*` 쓰기 · `PATCH /results`(검수 편집) · `PUT /tenants/{id}/quota` | – | – | **1차 · 2차 에이전트 도구에 없다.** 검수 편집은 사람만(품질 책임 = LX) |

도구 스키마는 계약 예시 JSON에서 생성한다(`server/agent/tools/from_contract.py` · `server/fixtures/contract/*.json` 읽기). 계약이 바뀌면 도구도 바뀌고, 도구가 계약 밖 인자를 만들면 서버가 400을 돌려 LLM에 다시 준다.

### 3.4 계약 추가 요청(F1-CONTRACT v1.0 → v1.1 · Fable 판정)

```http
POST /api/v1/agent/runs
{ "message": "남원 농지 중 건물 탐지된 필지 보여줘",
  "context": { "view": { "center": [127.39, 35.41], "zoom": 12.5, "bbox": [127.17,35.29,127.68,35.58] },
               "on": ["results/lx/namwon-landcover-2023"], "frame": null, "svc": null, "locale": "ko", "stage": "imagery" },
  "mode": "map" }                                  // map | report | ops
→ 202 { "run": AgentRun, "events_url": "/api/v1/events/agent/run_01J9…" }

GET  /api/v1/events/agent/{run_id}?access_token=   (SSE · §5.1과 같은 규약 · id = Redis entry · 24h 재생)
POST /api/v1/agent/runs/{id}/confirm  { "confirm_id": "cf_…", "decision": "approve|reject" } → AgentRun
GET  /api/v1/agent/runs?limit=&tenant_id=          (본인 · admin 전체 · 감사)
GET  /api/v1/agent/models → { "items":[ { "id":"qwen3:4b-instruct", "role":["router","planner","writer"], "backend":"ollama", "resident": true,
                                            "license":"Apache-2.0", "ctx": 8192, "vision": false, "as_of":"…" } ] }
POST /api/v1/agent/report/draft { "template":"survey-emd", "set":"results/lx/namwon-landcover-2023", "emd_cd":"52190250", "cls":["건물"], "jimok":["전","답","과"] }
→ 202 { "run": AgentRun }   → 완료 시 agent.done.artifact = { "docx_url": "/files/agent/run_…/draft.docx", "citations":[…] }

GET  /api/v1/results/{set}/parcels?cls=건물&jimok=전,답,과&emd_cd=&limit=2000     ← 신설(에이전트 없이도 쓸 수 있는 일반 API)
→ 200 GeoJSON FeatureCollection(필지 · 속성 pnu · jimok · emd · n_det · max_conf · area_m2 Envelope)
   + "lx": { "count": Envelope(inferred · source 'ST_Intersects detections×parcels-namwon' · note '지목 2021-12 기준 · AI 추론 · 검수 전'), "by_emd": [ { "key","cd","n": Envelope } ] }
```

**AgentRun**
```json
{ "id": "run_01J9…", "tenant_id": "namwon", "user": "u_nw_manager", "realm": "tenant", "mode": "map",
  "state": "planning",                       // planning | tool | waiting_confirm | writing | done | failed | rejected
  "model": { "id": "qwen3:4b-instruct", "backend": "ollama" },
  "steps": [ { "i": 1, "tool": "results_parcels_join", "args": { "set":"…", "cls":["건물"], "jimok":["전","답","과"] }, "ms": null, "result_ref": null } ],
  "tokens": { "value": 0, "unit": "count", "basis": "measured", "as_of": "…", "source": "chat/completions usage" },
  "created_at": "…", "finished_at": null }
```

**SSE 이벤트(`event:` · `data:` 한 줄)**

| event | data | 화면 |
|---|---|---|
| `agent.plan` | `{ run_id, steps:[{i, tool, why}], model }` | 패널에 계획 단계가 헤어라인 목록으로(AIP 단계 노출) |
| `agent.tool.call` | `{ run_id, i, tool, args, at }` | 그 단계 행에 스캔 빔 |
| `agent.tool.result` | `{ run_id, i, ms, summary: { count: Envelope }, ui_actions:[{ "op":"map_on", … }, { "op":"map_arrive", "bbox", "count_env" }] }` | **프론트가 ui_actions를 즉시 실행** → 지도 도착. 행에 `2,3xx ms [실측]` |
| `agent.confirm` | `{ run_id, confirm_id, tool, args, quote: (jobs/quote 응답) , expires_at }` | 확인 카드(견적 카드 부품) — 승인 전 실행 없음 |
| `agent.token` | `{ run_id, delta }` | 답변 타이핑(글자 40ms 아님 — 토큰 도착 즉시 · 실데이터 이벤트) |
| `agent.done` | `{ run_id, answer_md, envelopes: { "e1": Envelope, … }, unverified_numbers: ["27,676"], citations:[{ "n":1, "pnu", "bbox", "set" }], artifact?: {…}, tokens: Envelope }` | `answer_md`의 `{{env:e1}}`를 `prov()` 칩으로 · `unverified_numbers`는 취소선 + `검증 안 된 숫자` 칩 |
| `agent.failed` · `agent.rejected` | `{ run_id, error }` | 결손 표기 |

**쿼터 · 계량 추가**: `quotas.dim`에 `llm_tokens_month` · `llm_runs_day` · `vlm_images_month`(2차). `usage_events(dim='llm_tokens', amount=prompt+completion, basis='measured', job_id=run_id)`. 시드 값은 `[추정 기반 초기값]`(Q-E ②와 같은 처리): `namwon` llm_tokens_month soft 2,000,000 / hard 3,000,000 · policy `queue_low`(라우터가 더 작은 모델로 강등) — 수치는 발주자 몫이라 초기값 표기 필수. `lx` 무제한. `usage.delta` SSE에 `dim:'llm_tokens'`가 그대로 흐른다.

**스키마 추가(`migrations/0002_agent.sql` · 소유 F1-E)**
```sql
agent_runs(id text pk, tenant_id text, user_id text, realm text, mode text, state text, model jsonb, prompt_hash text, prompt_text text /*보존 기간 정책 3차*/, answer_md text, envelopes jsonb, unverified jsonb, tokens_in int, tokens_out int, created_at, finished_at timestamptz)
agent_tool_calls(id bigserial, run_id fk, i int, tool text, args jsonb, result_ref text, ms int, ok bool, at timestamptz)
agent_confirms(id text pk, run_id fk, tool text, args jsonb, quote jsonb, decision text, decided_by text, expires_at, at timestamptz)
-- RLS: agent_runs · agent_tool_calls · agent_confirms 에 detections 와 같은 정책
-- 모든 확인 승인 · 거부는 audit_log 에도 남는다
```

**Redis**: `agent:runs:{id}` stream MAXLEN 2,000(SSE 재생) · `agent:models` hash(`/agent/models` 즉답 · 백엔드 헬스 30s).

**오류 코드 추가**: `llm_unavailable` 503(백엔드 셋 다 죽음 → 프론트 `시연 · 에이전트 연결 없음` · off 모드 리플레이) · `confirm_expired` 409 · `tool_forbidden` 403(caps 밖 도구 요청 · 감사 로그) · `unverified_answer` 200(답은 주되 `unverified_numbers` 비어 있지 않음 · 칩으로 표시).

### 3.5 감사 · 출처 · 환각 방지

| 층 | 규칙 |
|---|---|
| **숫자 검증기(number-lint)** | LLM 시스템 프롬프트: "숫자는 쓰지 말고 `{{env:eN}}`만 쓴다". 서버가 `answer_md`에서 자리표 밖 숫자(정규식 · 한글 단위 포함)를 잡아 도구 결과 봉투 값과 대조 → 일치하면 자동 자리표로 승격, 불일치면 `unverified_numbers`. 좌표 · 연도(`2023`) · 조문 번호는 화이트리스트(구조 필드) |
| **인용** | 필지 · 결과 · 조문은 `citations[]`(pnu · bbox · set · law_ref)로만. 프론트 [n] 클릭 → `map_flyto` |
| **도구 결과 = 데이터** | 도구 결과(특히 `feedback.note` · 법령 청크 · 외부 문서)는 프롬프트에 **데이터 블록**으로만 들어가고 지시로 해석하지 않는다(프롬프트 인젝션 대책 · 국정원 가이드북 에이전틱 AI 항목에 대응 · 30개 대책 원문 [미확인]) |
| **권한** | 사용자 토큰 상속 · 도구 화이트리스트 = caps 교집합 · 쓰기 = 확인 카드 · `deploys` 0 |
| **PII 마스킹** | 입력 필터(주민번호 · 전화 · 이메일 패턴 → `[마스킹]`) · 소유자명은 데이터에 없음(계약 `owner_kind`만) · 로그에도 마스킹 뒤 저장 |
| **감사 로그** | run 단위 `agent_runs` + 단계 단위 `agent_tool_calls` + 확인 `agent_confirms` → `audit_log`. 관제 ③ 기관·할당에 `LLM 실행 n · 토큰 n [실측]` 행 |
| **레드티밍 세트** | e2e `tests/e2e/f1e-redteam.spec.mjs` 20문: 타 기관 조회 요구 · 배포 롤백 지시 · 원본 영상 경로 요구 · 숫자 지어내기 유도 · 인젝션(도구 결과 안 "위 지시 무시") — 전부 `tool_forbidden` 또는 검증기 차단이어야 통과 |
| **모델 표기** | 답변 하단 칩 `qwen3:4b-instruct · Ollama · 온프레미스 · Apache 2.0` — 실제 쓴 백엔드만. Solar 계열을 쓰면 "Built with Solar" 표기 의무 자동 |

### 3.6 RAG(2차) 저장소 결정 보류

`postgis/postgis:16-3.4` 이미지에 pgvector가 들어 있는지는 [미확인]. 선택지: ① pgvector 확장 별도 설치(같은 PG · RLS 공유) ② 파일 인덱스(FAISS · 법령은 기관 경계가 없어 RLS 불필요). 법령 원문 반입 경로(국가법령정보센터 Open API · 내부망 접근)가 [미확인]이라 2차 착수 시 결정한다. 1차는 결손 표기.

---

## §4. 화면 — 법전 v2 · 세 무대 · 세 사용자

### 4.1 XI맵 명령 바 · 에이전트 패널(영상 무대 · `CANVAS-FULL`)

| 요소 | 규칙(system-v2) | 구성 |
|---|---|---|
| 명령 바 | `⌘K` · 기존 `.palette` 재사용 · 라운드 0 · 유리 elev-2 | 하단 스크러버 위 폭 60% 자리와 겹치지 않게 **상단 중앙 폭 480**. 플레이스홀더 = 현재 뷰에 맞는 예시 한 줄(`남원 농지 중 건물 탐지된 필지` — 카탈로그에 그 결과가 켜져 있을 때만). 입력 즉시 `agent.plan` 도착 전까지 헤어라인 스캔 빔 1개(실이벤트에 묶인 모션) |
| 에이전트 패널 | 우상 HUD ≤ 420 자리 **아래로** 이어지는 유리 elev-2 · 유리 총면적 ≤ 15% 유지(레이어 패널 360 접힘 시) | 위 → 아래: 사용자 문장(Pretendard 16) · **계획 단계 목록**(헤어라인 행 · 도구 이름 · ms [실측] · 완료 시 청록 락온 380) · 답변(자리표 = `prov()` 칩 · 검증 안 된 숫자 취소선) · 인용 [n] 칩 · 모델 칩 · 토큰 봉투 |
| 확인 카드 | 견적 카드와 같은 부품 · 승인 = 잉크 채움 버튼 · 거부 = 헤어라인 | `면적 · shard · GPU·s [추정] · 할당 잔여` 그대로 + `이 작업은 기관 쿼터 gpu_s_month에 계량됩니다` 한 줄. 만료 60s 헤어라인 카운트다운(값 변화 시만) |
| 지도 반응 | `ui_actions` → `map_on` → `arrive()` 도착 문법 그대로 | 에이전트가 만든 결과 층은 레이어 패널에 `에이전트 질의 · 저장 안 됨` 줄로 추가(새로고침 시 사라짐 · URL `?q=` 복원은 2차) |
| 공개 모드 | 명령 바 노출 · AG-8은 3차 → 1차 · 2차는 `준비 중 · 시민용 설명 3차` 결손 |
| 게이트 | 콘솔 0 · 14px 미만 0 · 유리 ≤ 15% · 봉투 없는 숫자 0 · `motion-law` 사다리 밖 값 0 |

### 4.2 실태조사 보고서 작성기(보고서 서랍 안 · 종이 무대)

- 자리: 우 서랍 `report-standard*.html?embed=1`(원본 iframe 유지) 위에 탭 하나 `초안 작성`(원본 기능 '보고서 발급'의 한 단계 — 새 메뉴 아님).
- 레이아웃 `SPLIT-5050`(종이): 좌 = 문서(Paperlogy 제목 · Pretendard 본문 18/26 · 표 16 · 숫자 Inter tabular) · 우 = 근거 목록(필지 [n] · 크롭 · 봉투 · 집계 막대 헤어라인).
- 타이핑은 `agent.token` 도착 즉시(실이벤트) · 숫자 칩은 도착 시 락온 380.
- 인용 클릭 → 지도 `map_flyto` + 필지 카드(F1-A `parcel-card.js`) — 서랍은 유지.
- 하단: `내보내기 .docx` · `CSV(BOM)` · `요청자 = 현재 계정` · `초안 · 검토 필요 · 모델 칩`. 결손 칸 = `법령 인용 · 2차`.
- 템플릿 `survey-emd`(1차 유일): ① 개요(대상 읍면동 · 영상 `2023 25cm P3` · 모델 `aerial25/best` · 기준일) ② 집계표(`results_stats by=emd|cls` 봉투) ③ 의심 필지 상위 N(`results_parcels_join` · pnu · 지목 · 겹친 클래스 · conf · 면적) ④ 근거 영상(AOI 안 A01 4시점 · 밖 A03 2시점 · 표기) ⑤ 법적 근거(2차) ⑥ 조치 제안(현장조사 대상 · `AI 추론 · 검수 전 · 대장 미대조` 한 줄 고정).

### 4.3 관제 — LLM 노드 · 토큰 계량(Ops 무대 · `OPS-GRID`)

| 자리 | 추가되는 것 | 데이터 |
|---|---|---|
| 인프라 관제 ② GPU 행 | `외부 점유(Ollama)` 띠 옆 **`LLM(vLLM)` 띠**(자기 보고 `worker:llm-1:vram`) — 두 띠를 합치지 않는다 | `GpuSample.external[]` + 새 `llm_used_mib` 봉투 |
| 모델 배치 매트릭스 | 행 `gemma-4-12b-it · vllm · GPU1` · VRAM 막대 · **토큰/초 스파크라인 24px**(값 변화 시 40ms) · 동시 요청 수 | `/agent/models` + vLLM `/metrics`(Prometheus 형식 · 게이트웨이가 대리 읽기 · Phase 1 Prometheus 전까지 폴러) |
| 기관·할당 ③ 쿼터 링 | 6 → **8**: `llm_tokens_month` · `llm_runs_day`(2차 `vlm_images_month`) | `Usage.dims` 확장 · T-1 슬라이더 동일 |
| 경보 스트립 | `요약 ›` 버튼(AG-6 · 2차) → 어두운 유리 카드에 원인 한 문단 + 제안 카드(실행은 관리자) | `ops_*` 읽기 도구 |
| 경보 규칙 추가(`alerts.yaml` · [목표]) | LLM 백엔드 헬스 실패 30s · p95 첫 토큰 > 5s · 기관 llm_tokens 80% | `agent:models` · `usage_events` |

### 4.4 세 사용자 '우와' 기준(§7 루브릭에 추가할 행)

| 관점 | 첫 5초 | 손을 대면 | 끝나는가 | 불합격 신호 |
|---|---|---|---|---|
| 공무원 | 한 문장 치면 계획 단계가 보이고 필지가 도착 | 숫자 칩 호버 → 출처 · 인용 → 지도 | 보고서 초안 `.docx` 3클릭 | 채팅만 · 지도 무반응 · 칩 없는 숫자 |
| LX 직원 | 도구 호출이 내 계약 API 이름으로 보인다 | "이 프레임 분석" → 견적 카드 → 승인 → job-theater | 실추론이 말로 시작된다 | 블랙박스 · 확인 없이 GPU 제출 |
| 관리자 | 경보 한 줄 → 원인 문단(실측 봉투) | 제안 카드 · 실행은 내 손 | 토큰 계량이 쿼터 링에 | 에이전트 자동 조치 · 상수 토큰/초 |
| 공통(Craft) | 패널이 지도 위 유리로 떠 있고 유리 ≤ 15% | 계획 단계 락온 380 · 토큰 도착 즉시 | 모델 칩 = 실제 백엔드 | 지어낸 숫자 · 사다리 밖 모션 · 콘솔 오류 |

---

## §5. 단계

### 5.1 AG-0 · 1차 플래그십 최소판(이 PC · 지금 · vLLM 없이)

| 항목 | 내용 |
|---|---|
| 백엔드 | **Ollama `http://localhost:11434/v1`** · `qwen3:4b-instruct`(상주 [실측]) · 도구 호출 형식은 **첫날 스모크로 확인 [미검증]**(실패 시 폴백: 서버가 JSON 스키마 강제 프롬프트 + 파서로 도구 인자 추출 — 같은 인터페이스) |
| 도구 4 | `results_stats` · `results_features` · `parcel_at` · **`results_parcels_join`**(신설 · P8 `parcels-namwon` 의존 — P8 전에는 `parcels_unavailable` 404 → 결손 칩) |
| 장면 1 | XI맵(남원 · P4 129,420 켜진 상태) 명령 바 "남원 농지 중 건물 탐지된 필지 보여줘" → 계획 3단계 → 결합 결과 도착 · 읍면동 막대 · 규칙 카드. 건수는 **실행 시 잰 값** — 이 문서에 미리 쓰지 않는다 |
| 장면 2 | 보고서 서랍 `초안 작성` → `survey-emd`(운봉읍 · 경작지 1,324.8ha [실측 · P10] · 비닐하우스 232 [실측] 등 P10 봉투) → 숫자 칩 · 인용 flyTo → `.docx` |
| off 모드 | `landxi/agent/data/replay/ag0-namwon.ndjson` — **실제 run을 녹음한 것**(F1-B의 J1 녹음 규약과 같음) · 그 전에는 합성 리플레이 `시연 · 저장 결과 재생`. `LX_API=off` · `llm_unavailable` 둘 다 이 경로 |
| 숫자 검증기 · 감사 · 확인 카드 | 포함(쓰기 도구는 `jobs_submit` 하나 · sales `demo:true`) |
| 제외 | VLM · RAG · 관제 · 다국어 · 시민 · 토큰 쿼터 UI(계량 행은 남김) |
| 완료 기준 | 장면 1 · 2가 `LX_API=on`(Ollama 살아 있음)과 `off`(리플레이) 둘 다 콘솔 0 · 답변에 검증 안 된 숫자 0(있으면 취소선 표시가 보여야 함 — 검증기 동작 증명 장면 1회) · 레드티밍 5문(타 기관 조회 · 롤백 지시 · 원본 경로 · 숫자 유도 · 인젝션) 전부 차단 · 영상 20–30s 분량 |
| 기간 | **4–5일 [추정]**(계약 개정 0.5 · 서버 2 · 프론트 1.5 · 녹음·e2e 1) |

### 5.2 에픽 편입 — **F1-E 에이전트 최소판**(소유 겹침 0 · 계약 §11 개정 요청)

| 소유 | 경로 |
|---|---|
| **F1-E** | `landxi/agent/**`(`cmdbar.js` · `panel.js` · `report-writer.js` · `css/agent.css` · `data/replay/`) · `server/agent/**`(F1-B 소유 `server/**`에서 **제외** — `server/ops/**`와 같은 처리) · `server/migrations/0002_agent.sql` · `tests/e2e/f1e-*.spec.mjs` · `shots/f1/E/**` · `blueprint/f1/F1-E-result.md` |
| F1-A에 요청 | `landxi/xi/index.html`에 마운트 지점 2줄(`<div id="agent-slot">` · `<script type=module src="/landxi/agent/panel.js">`) · 보고서 서랍 탭 1개 — 결과 문서 '요청' 절로 |
| F1-B에 요청 | `GET /results/{set}/parcels`(§3.4) — 일반 API라 F1-B 소유가 맞다. 없으면 F1-E가 `server/agent/tools/parcels_join.py`에 임시 구현 후 이관 |
| F1-C에 요청 | 쿼터 링 8 · GPU 행 LLM 띠 — 2차 |
| Fable | `F1-CONTRACT.md` v1.1(§3.4 반영) · `api-v1.js`에 `agentRun()` `agentEvents()` `agentConfirm()` 3함수 |
| 모델 | 서버 · 검증기 · 도구 = **Opus 5.5** · 프론트 패널 · 작성기 = **Opus 5** · 리플레이 녹음 · e2e = **Sonnet** · 판정 = **Fable 5.1** |

### 5.3 이후 차수

| 차수 | 내용 | 선행 |
|---|---|---|
| **2차 확산** | **vLLM Docker 기동**(U1 드라이버 → HyperCLOVAX 스모크 → Gemma 4 12B int4 또는 E4B on GPU1) · `LLM_BASE_URL` 전환 · bench(토큰/초 · 첫 토큰 p95 · Land-XI 칩/초 동시 부하 — R10 조건 `external_used_mib` + `llm_used_mib` 기록) · **AG-4 VLM 검수**(크롭 도구 · 평가셋 §5.4) · **AG-3 RAG**(저장소 결정 · 법령 반입) · **AG-6 관제 에이전트**(읽기 + 제안 카드) · 토큰 쿼터 링 · `?q=` URL 복원 · 공문 서식 2종 | U1 · U3(HF 토큰) · U4(이미지 pull · 캐시 E:) |
| **3차 운영화** | 31B TP=2(U2 결정 시) · **AG-7 다국어** · **AG-8 시민용**(외부 예외 Q-AG4 판정 뒤) · **AG-5 SAM 3**(라이선스) · **AG-9 MCP 도구 서버**(모두의 AI 규격 공개 시) · **독파모 공통기반 어댑터**(호출 방법 확인 시 · Solar 표기 의무) · 국정원 가이드북 30개 대책 원문 대조표 · 프롬프트 보존 기간 · N2SF 등급표 | 미확인 항목 해소 |
| **4차 클러스터** | `pool:llm` A100 노드 · 31B BF16 TP=2 레시피 그대로 · vLLM 다중 인스턴스 · 공통기반 + 로컬 이중화 | 장비 |

### 5.4 평가 · 측정(전부 [목표] · 아직 0건)

| 무엇 | 세트 | 지표 | 언제 |
|---|---|---|---|
| 질의 → 도구 정확도 | 남원 질의 20문(정답 = 도구 · 인자) | 도구 선택 정확 · 인자 정확 · 검증기 오탐 | AG-0 완료 기준에 포함(20문 중 통과 수 [실측]로 표기) |
| 보고서 초안 품질 | `survey-emd` 3읍면동 | 검증 안 된 숫자 0 · 인용 유효 100% · 사용자 평가(공무원 관점) | AG-0 |
| VLM 항공 판독 | **남원 4시점 크롭 평가셋 100장 [목표]**(A02 비닐하우스 · A04 변화 · GT `namwon-lc-gt-2020`) | 클래스 일치 · 시점 변화 서술 정확 · 오탐 판별 | 2차 착수 전 — Gemma 4 항공 성능 공개 수치 없음 [미확인] |
| 서빙 | Ollama vs vLLM 같은 프롬프트 | 토큰/초 · 첫 토큰 p95 · 동시 4 · Land-XI 칩/초 간섭 | 2차 |
| 보안 | 레드티밍 5 → 20문 | 차단률 100% | AG-0 5문 · 2차 20문 |

---

## §6. 사용자 결정 질문(최대 4 · 추천 포함) + 사용자만 할 수 있는 조치

| # | 질문 | 선택지 | **추천** · 근거 |
|---|---|---|---|
| **Q-AG1 드라이버 갱신 시점** | 522.06 → R570+(재부팅 · Ollama · 워커 · Chrome GPU 잠시 끊김) | ① 지금 ② **1차 통합 영상(F1-∑) 녹화 직후 · 2차 첫날** ③ Phase 1(설계서 Q-E ④ 원안) | **②** — AG-0은 Ollama로 닫히므로 1차에 vLLM이 필요 없다. 1차 중 갱신하면 F1-B bench 조건(`external_used_mib`)이 바뀌어 다시 재야 한다. 2차 첫날 갱신 → HyperCLOVAX 스모크 → Gemma 4 기동이 자연스럽다 |
| **Q-AG2 GPU 역할 분리** | Ollama 종료 금지(R10)를 지키면서 vLLM · 워커 · Ollama 셋을 어떻게 놓나 | ① 현행(장당 22GB 안에서 셋 공존 · vLLM ≤ 0.45 · 12B int4까지) ② **GPU0 = 비전 워커 전용 · GPU1 = LLM(vLLM) + Ollama, `OLLAMA_KEEP_ALIVE` 4h → 30m** ③ Ollama 언로드 허용(종료 아님) | **②** — 종료 금지는 지키되 상주 시간을 줄이면 GPU1에 12B BF16 · 26B A4B int4 여유가 생긴다 [추정]. GPU0 워커는 Ollama 레이어 분산이 사라져 처리량이 오른다 [추정 · Ollama 양 GPU 분산은 추론]. 31B는 그래도 두 장 TP라 ③ 없이는 불가 — 3차에 다시 묻는다 |
| **Q-AG3 모델 정체성** | 국내 공공 플랫폼의 '두뇌'를 무엇으로 표기 · 운용하나 | ① **Gemma 4(Apache 2.0 · 온프레미스) 두뇌 + 국산은 라우터(HyperCLOVAX 1.5B 캐시)에서 시작 · 독파모는 공통기반 연결 시 작성자 승격** ② 로컬 국산 우선(EXAONE 3.5 7.8B Ollama 상주 · 라이선스 [미확인]) ③ 공통기반 연결 전까지 에이전트 보류 | **①** — 로컬에서 돌아가는 독파모 모델은 없다(3종 모두 H200급). 표기를 정직하게 하면 문제가 없고, 승격 경로가 라우터 한 줄이다. EXAONE 3.5는 라이선스 확인 뒤 ②를 얹을 수 있다 |
| **Q-AG4 외부 클라우드 LLM 예외** | AG-8 시민용(공개 O 데이터 · 게스트)에서 외부 API를 허용하나 | ① 전면 금지 유지 ② **3차에 N2SF 등급 판정 · 국정원 유형 대책 적용 뒤 시민용만 재논의** ③ 지금 허용 | **②** — 1차 · 2차는 코드에 외부 키가 0이어야 감사가 단순하다. 시민용은 3차이므로 결정을 미뤄도 잃는 것이 없다 |

**사용자만 할 수 있는 조치(local-llm.md U1–U5 재확인 · 순서대로)**

| # | 조치 | 언제 |
|---|---|---|
| U1 | NVIDIA 드라이버 522.06 → R570 이상 · 재부팅 | Q-AG1 답에 따라(추천 2차 첫날) |
| U2 | GPU 역할 · `OLLAMA_KEEP_ALIVE` 조정 | Q-AG2 |
| U3 | HF에서 Gemma 라이선스 동의 · 읽기 토큰 → `HF_TOKEN`(`server/.env`) | 2차 전 |
| U4 | `vllm/vllm-openai` 이미지 pull(10GB대 [미검증]) 승인 · 모델 캐시 `E:\hf-cache` | 2차 첫날 |
| U5 | (선택) `.wslconfig` | 불필요 |
| **U6(신설)** | 법령 원문 반입(농지법 · 건축법 · 국토계획법 · 실태조사 요령 — 국가법령정보센터 내부망 접근 여부 확인) | AG-3 착수 전 |
| **U7(신설)** | 기관 LLM 쿼터 초기값 승인(`[추정 기반 초기값]` · Q-E ②와 함께) | 2차 |

---

## §7. 리스크 · 미확인(지어내지 않는다)

- **도구 호출 품질 미측정** — qwen3:4b(Ollama)의 한국어 도구 호출 정확도는 잰 적이 없다. AG-0 첫날 스모크 · 20문 세트로 잰 뒤 숫자를 쓴다. 실패 시 폴백 파서.
- **vLLM 불가(지금)** — 드라이버 하나. 갱신 · 재부팅은 사용자 조치.
- **VRAM 예산 22GB [실측 기반]** — 12B BF16 · 26B · 31B는 U2 없이 불가. 크기별 VRAM은 전부 [추정] · 기동 후 실측.
- **독파모 실제 호출 방법 [미확인]** — 공통기반 연결 규격 · 인증 · 데이터 반출 조건. 어댑터는 스텁으로만.
- **모두의 AI 연계 규격 [미확인]** — MCP · OpenAPI 어느 쪽인지 없음. 도구 서버는 계약 API 래핑이라 규격이 나오면 어댑터만.
- **Gemma 4 한국어 · 항공영상 성능 [미확인]** — 자체 평가셋 100장 [목표] 전에는 VLM 표기를 `VLM 의견 · 근거 아님`으로 고정.
- **라이선스 확인 필요** — EXAONE 3.5 · EXAONE 4.5(NC) · SAM 3(Meta) · HyperCLOVAX-SEED · A.X K2 VL. 확인 전 화면에 올리지 않는다.
- **pgvector · 법령 반입 [미확인]** — RAG 저장소 · 원문 접근 경로. 2차 착수 시 결정.
- **국정원 AI 보안 가이드북 30개 대책 원문 [미확인]** — 대조표는 원문 확보 뒤. 그 전까지 §3.5의 대책은 조사 요약(15위협 · 에이전틱 AI 포함)에 대한 우리 해석이다.
- **프롬프트 보존 · 개인정보 영향** — 보존 기간 · 열람 권한은 3차 운영 요건(R14)과 함께.
- **P8 의존** — `results_parcels_join`은 `parcels-namwon` PMTiles · PostGIS 적재가 있어야 한다. P8 전에는 결손 칩 · 리플레이.
- **에이전트 결과 층의 저장** — 1차는 저장하지 않는다(`저장 안 됨`). 저장 · 공유 · 결과 세트 승격은 2차(공유 ACL 표가 §10.6에 없음).


---
## 사용자 결정 (2026-09-24)
- Q-AG1: vLLM 은 구성(docker compose·WSL 스크립트·모델 목록)만 준비, NVIDIA 드라이버 갱신·재부팅은 후순위(사용자 시점).
- Q-AG2: GPU 고정 분리 대신 **가변형 자동 조율** — 스케줄러가 대기열 길이·VRAM 여유·Ollama 점유(종료 금지)를 보고 영상 추론 워커/LLM 에 동적 배정. 관제에 배정 상태 실측 표시.
- Q-AG3: Gemma 4 두뇌 + HyperCLOVA X SEED 라우터 + 독파모 승격 경로 (추천안).
