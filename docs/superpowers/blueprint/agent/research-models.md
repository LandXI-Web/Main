# Land-XI LLM·AI 에이전트 층: 모델·서빙·보안 조사

- 조사일: 2026-09-24 (웹 검색 기준, 출처 URL 병기)
- 원칙: 확인된 사실만 적음. 확인하지 못한 항목은 **미확인**으로 표시함.

---

## 1. 정부 '독자 AI 파운데이션 모델'(독파모) 프로젝트

### 1-1. 단계별 경과

| 시점 | 내용 | 출처 |
|---|---|---|
| 2026-01-15 | 1차 평가에서 **네이버클라우드·NC AI 탈락**. 업스테이지·SKT·LG AI연구원 통과. 네이버 탈락 사유는 Qwen 인코더·가중치 사용으로 '독자성' 기준 미충족. 정예팀 1곳 추가 선발(패자부활) 예고 | https://m.news.nate.com/view/20260115n26387 |
| 2026 상반기 | 추가 선발로 **모티프테크놀로지스** 합류, 4개 팀 체제 | https://www.korea.kr/briefing/policyBriefingView.do?newsId=156745273 |
| 2026-08-18 | 2차 단계평가 결과: **SKT 70.6점(1위), 업스테이지 69.9, LG AI연구원 69.0 진출 / 모티프 65.8 탈락**. 배점은 벤치마크 40, 전문가 35, 사용자 25 | https://www.korea.kr/briefing/policyBriefingView.do?newsId=156774781 , https://www.newspim.com/news/view/20260827001289 |
| 3단계 | 일정은 예산 확정 뒤 발표 예정(현재 미정). 진출팀 GPU는 B200 768장(26년 상반기)에서 약 1,000장(26년 하반기)으로 확대 계획 | 위 브리핑 |

### 1-2. 잔류 3개 팀의 공개 모델

| 팀 | 모델(2차) | 규모 | 모달리티 | 라이선스 | HuggingFace | 출처 |
|---|---|---|---|---|---|---|
| SKT | **A.X K2** | 688B(자체 SGA 희소 어텐션), 이전 K1은 519B | 텍스트 | **Apache 2.0**(가중치·추론 코드) | skt 조직. NVFP4·EAGLE3 파생판도 공개 | https://www.aitimes.com/news/articleView.html?idxno=213289 , https://zdnet.co.kr/view/?no=20260813173231 |
| SKT | A.X K2 파생 경량 3종 | VL Light-Preview / ALM / Raon-Speech-21B-A3B | **VL Light-Preview는 비전(문서·매뉴얼·현장 이미지)**. 나머지 둘은 음성 | VL의 라이선스·공개 경로는 **미확인** | skt/A.X-K2-ALM, KRAFTON/A.X-K2-Raon-Speech-21B-A3B | https://www.aitimes.kr/news/articleView.html?idxno=41213 |
| 업스테이지 | **Solar Open 2** | 250B MoE(활성 15B), 1M 토큰 컨텍스트 | **텍스트 전용** | Upstage Solar License. 상업 이용 가능, 파생 모델은 'Solar' 접두어와 "Built with Solar" 표기 의무 | upstage/Solar-Open2-250B (2026-07-22) | https://huggingface.co/upstage/Solar-Open2-250B |
| LG AI연구원 | **K-EXAONE 2.0** | 750B MoE(활성 37B), 256K 컨텍스트 | 텍스트 | **Apache 2.0**으로 전환 | LGAI-EXAONE/K-EXAONE-2.0-750B-A37B (FP8·NVFP4판 있음) | https://huggingface.co/LGAI-EXAONE/K-EXAONE-2.0-750B-A37B , https://www.seoul.co.kr/news/economy/industry/2026/07/31/20260731500074 |
| LG AI연구원 | **EXAONE 4.5** (VLM, 독파모 산출물은 아님) | 33B(비전 인코더 1.29B + EXAONE 4.0 31.7B), 262K | **비전+텍스트**(문서 이해 중심) | **EXAONE AI Model License 1.2 – NC(비상업)**. 공공기관의 내부 이용이 '비상업'에 해당하는지는 LG와 확인 필요 | LGAI-EXAONE/EXAONE-4.5-33B (AWQ·GGUF판 있음) | https://huggingface.co/LGAI-EXAONE/EXAONE-4.5-33B |

**하드웨어상 현실**: 독파모 주력 3종(250B~750B MoE)은 RTX A6000 48GB나 A100 1~2장으로 서빙할 수 없음. Solar Open 2만 해도 최소 H200 4장을 권장함. Land-XI 로컬 개발에서는 쓸 수 없고, **범정부 AI 공통기반 API나 기관 GPU 클러스터를 거쳐 호출**하는 방식이 현실적임.

### 1-3. 공공 활용 정책

| 항목 | 내용 | 출처 |
|---|---|---|
| 범정부 AI 공통기반 | 행정망 안에서 민간 AI(삼성SDS·네이버클라우드 등)를 쓰는 공통기반. 2025-11~2026-02 시범 운영 후 2026-06 본격 가동 보도 | https://zdnet.co.kr/view/?no=20251124173901 , https://m.news.nate.com/view/20260624n26249 |
| 독파모 모델 연계 | 2026년 중 독파모 선정 모델을 공통기반에 연결해 민간 모델과 함께 쓸 수 있게 할 계획 | 위 ZDNet 기사 |
| 2차 브리핑 | 모델을 반도체·판례분석·소재·정부행정·R&D 예산심사 등에 적용 중 | korea.kr 브리핑(위) |

---

## 2. '모두의 AI'

| 항목 | 내용 | 출처 |
|---|---|---|
| 정체 | 과기정통부 **대국민 무료 AI 서비스 사업**. 비용·이용량 제한 없는 범용 AI 챗봇과 **공공 AI 에이전트**(복잡한 행정 절차 대행)를 구축 | https://www.aitimes.com/news/articleView.html?idxno=212718 , https://www.seoul.co.kr/news/economy/2026/08/28/20260828500069 |
| 사업자 | 2026-08-28 **SKT·카카오·KT 컨소시엄** 선정. 올해 B200 512장 지원, 2027년부터 서비스 비용 지원 | https://www.khan.co.kr/article/202608281601001 |
| 컨소시엄별 | SKT: 인증부터 결제까지 처리하는 실행형 AI, 전화·문자 에이전트 / 카카오: 카톡 기반, 국산 모델(카나나, 엑사원) 사용 / KT: '이음' 서비스, 10여 개 분야 특화 에이전트, TokenFactory로 국산 모델 자동 연결 | https://view.asiae.co.kr/article/2026090409295580927 |
| 일정 | 11월까지 베타, **2026-12 정식 출시** | 위 아시아경제 |
| 공공기관 연계 방식 | 외부 기관이 에이전트·API로 붙는 공식 규격은 **미확인**(공개 자료 없음). '공공 AI 에이전트 연계'가 중점 과제라고만 명시됨 | 위 아시아경제 |

**Land-XI 시사점**: 국민이 '모두의 AI' 챗봇에서 "내 땅 경계·지적 확인"을 요청하면 LX 서비스가 도구로 호출되는 구조가 가능함. 이를 위해 Land-XI가 **MCP 또는 OpenAPI 형태의 공공 도구 엔드포인트**(지적 조회, 영상 판독 결과, 변화탐지)를 제공할 수 있게 설계해 둘 것. 연계 규격은 공개되는 대로 확인해야 함.

---

## 3. Gemma 4 (Google)

| 항목 | 내용 | 출처 |
|---|---|---|
| 크기 | E2B(유효 2.3B), E4B(4.5B), 12B(11.95B), 26B A4B(MoE, 활성 3.8B/총 25.2B), 31B Dense(30.7B) | https://ai.google.dev/gemma/docs/core/model_card_4 |
| 컨텍스트 | E2B·E4B 128K, 12B·26B·31B 256K | 동일 |
| 입력 | 전 모델 텍스트·이미지(가변 해상도, OCR·차트에 강함). 오디오는 E2B·E4B·12B만. 동영상은 프레임 추출 방식 | 동일, https://docs.vllm.ai/projects/recipes/en/stable/Google/Gemma4.html |
| 도구 호출 | 네이티브 function calling, 설정 가능한 thinking 모드 | 모델카드 |
| 라이선스 | **Apache 2.0**(Gemma 3까지의 Gemma Terms에서 전환). 상업 이용 가능 | https://www.ghacks.net/2026/04/06/google-releases-gemma-4-in-four-model-sizes-under-apache-2-0-license/ |
| 공개 시점 | 2026-04 네 가지 크기 공개, 12B는 이후 추가(vLLM Day-0 지원) | ghacks, https://x.com/vllm_project/status/2062228047324201166 |
| 성능(31B) | MMLU-Pro 85.2, MMMU-Pro 76.9 | 모델카드 |
| 한국어 | 140여 개 언어 지원, 35개 이상 언어로 사전학습. **한국어 전용 벤치마크 수치는 미확인** | 모델카드 |
| HF | google/gemma-4 컬렉션(예: google/gemma-4-31B-it, google/gemma-4-E4B) | https://huggingface.co/google/gemma-4-E4B |

**Land-XI 적합성**: 로컬 GPU(A6000 48GB)에서 돌릴 수 있는 비전+도구호출 에이전트의 1순위 후보임. 26B A4B는 활성 3.8B라 빠르고, 31B는 품질이 가장 높음. 둘 다 Apache 2.0이라 공공 배포에 제약이 없음.

---

## 4. vLLM과 SGLang

### 4-1. vLLM 현황

| 항목 | 내용 | 출처 |
|---|---|---|
| 최신 버전 | **v0.30.0 (2026-09-22)**, Python 3.10~3.14 | https://pypi.org/project/vllm/ |
| Windows | **공식 네이티브 미지원**(Linux x86-64·ARM64 휠만 제공). 권장 경로는 **WSL2**. Docker Desktop의 Docker Model Runner가 WSL2+NVIDIA에서 vLLM 지원. 커뮤니티 포크 SystemPanic/vllm-windows가 있으나 비공식 | https://docs.vllm.ai/en/stable/getting_started/installation/gpu/ , https://www.docker.com/blog/docker-model-runner-vllm-windows/ , https://fazm.ai/t/vllm-windows-support-2026 |
| API | OpenAI 호환 서버(`/v1/chat/completions`), 이미지 입력, 도구 호출(`--enable-auto-tool-choice --tool-call-parser gemma4`), reasoning 파서 | https://docs.vllm.ai/projects/recipes/en/stable/Google/Gemma4.html |
| 구조화 출력 | vLLM은 JSON schema 등의 guided decoding을 지원함(일반 기능). **v0.30 기준 세부 옵션명은 이번 조사에서 재확인하지 못함** | https://docs.vllm.ai/en/latest/ |

### 4-2. Gemma 4 31B 공식 레시피 (2×A100/H100)

```bash
vllm serve google/gemma-4-31B-it \
  --tensor-parallel-size 2 --max-model-len 16384 --gpu-memory-utilization 0.90 \
  --enable-auto-tool-choice --reasoning-parser gemma4 --tool-call-parser gemma4 \
  --chat-template examples/tool_chat_template_gemma4.jinja \
  --limit-mm-per-prompt '{"image": 4, "audio": 0}' --async-scheduling
```
출처: https://recipes.vllm.ai/Google/gemma-4-31B-it
- 이미지 1장당 토큰: 70/140/280/560/1120 중 선택. 정사영상 타일 판독에는 560~1120 권장(추론)
- 양자화판: `RedHatAI/gemma-4-31B-it-FP8-dynamic`, `nvidia/gemma-4-31B-it-NVFP4`(NVFP4는 Blackwell 전용). `--kv-cache-dtype fp8`로 KV 메모리 약 50% 절감

### 4-3. 보유 GPU별 권장 구성 (추정치이므로 실측 필요)

| GPU | 권장 모델·설정 | 비고 |
|---|---|---|
| RTX A6000 48GB × 1 | **Gemma 4 26B A4B**(BF16 약 50GB로 빠듯함). 양자화판을 쓰거나 31B는 4bit(AWQ/GPTQ) | A6000(Ampere)은 FP8 연산을 하드웨어로 지원하지 않음. vLLM은 Ampere에서 FP8을 Marlin 가중치 전용(W8A16)으로 돌리는 것으로 알려졌으나 **v0.30 문서에서 재확인하지 못함** |
| RTX A6000 × 2 | Gemma 4 31B, TP=2, FP8-dynamic 또는 BF16, max-model-len 16K~32K | 레시피의 2×A100 구성에 준함 |
| A100 80GB × 1~2 | 31B BF16 TP=2(레시피 그대로) 또는 1장 + FP8 | |
| 경량 엣지 | E4B(오디오 포함), 현장 태블릿이나 온디바이스 | |
| EXAONE 4.5 33B(VLM) | AWQ판으로 A6000 1장 | NC 라이선스 확인 필요 |
| 독파모 대형 3종 | 로컬 서빙 불가(H200 4장 이상) | 공통기반 API로 호출 |

### 4-4. SGLang 대안

| 항목 | 내용 | 출처 |
|---|---|---|
| 최신 | v0.5.20 계열(2026-09) | https://github.com/sgl-project/sglang/releases |
| 지원 | Solar Open 2가 vLLM과 함께 SGLang 서빙을 공식 안내. OpenAI 호환 서버 제공 | https://huggingface.co/upstage/Solar-Open2-250B |
| 판단 | Gemma 4는 vLLM 공식 레시피가 가장 잘 갖춰져 있어 **1차 선택은 vLLM**. 동시 요청이 많은 에이전트 워크로드에서 성능이 모자라면 SGLang으로 비교 측정 | (판단) |

---

## 5. 원격탐사·지리 VLM과 에이전트

| 구분 | 이름 | 요점 | 출처 |
|---|---|---|---|
| RS VLM | GeoChat (CVPR 2024) | 영역 단위로 근거를 대는(grounded) 원격탐사 대화 모델. 1세대 기준선 | https://www.researchgate.net/publication/385038529 |
| RS VLM | EarthDial (CVPR 2025) | 다중센서(광학·SAR·다분광) 대화형 | GEOBench 목록(아래) |
| RS VLM | EarthMind, GeoPix, VHM | 교차센서, 픽셀 단위 이해, '정직한' RS VLM | https://arxiv.org/html/2506.01667v1/ |
| 벤치마크 | GEOBench-VLM, VLRS-Bench(2026-02), RRS-10K(2026-07), GeoChrono(시계열) | 범용 VLM의 지리 과업 성능 측정. **Qwen3-VL(2B~30B)이 주요 비교 대상** | https://arxiv.org/pdf/2411.19325 , https://arxiv.org/html/2602.07045v2 , https://arxiv.org/pdf/2607.24810 , https://arxiv.org/pdf/2607.15768 |
| 범용 VLM | Qwen3-VL / Qwen3.5(2026-02 오픈웨이트, 네이티브 멀티모달) | 원격탐사 변화 VQA(2시점 비교) 연구에서 직접 평가됨 | https://arxiv.org/abs/2604.18429 , https://qwen.ai/blog?id=qwen3.5 |
| 범용 VLM | Gemma 4 | **항공영상 전용 벤치마크 수치는 미확인**. 따라서 남원 4시점 정사영상으로 자체 평가셋을 만들어야 함 | - |
| 에이전트 | Google Earth AI + Geospatial Reasoning | Gemini 에이전트가 질의를 분해해 영상·인구·기상 모델을 조율. BigQuery와 Gemini Enterprise Agent Platform으로 기업에 제공(클라우드 전용, 망분리 환경 불가) | https://research.google/blog/google-earth-ai-unlocking-geospatial-insights-with-foundation-models-and-cross-modal-reasoning/ , https://ai.google/earth-ai/ |
| 에이전트 | Esri ArcGIS AI assistants | 2026-02에 Pro·Notebooks 어시스턴트(베타), 2026-06에 Survey123·BA GA. JS Maps SDK용 **AI components(베타)**로 에이전트형 웹지도를 구성 | https://www.esri.com/arcgis-blog/products/arcgis-online/geoai/whats-new-in-ai-assistants-june-2026 , https://www.esri.com/arcgis-blog/products/js-api-arcgis/developers/introducing-ai-components-beta-in-the-js-maps-sdk |
| 분할 | **SAM 3** (2025-11) | 명사구·예시 이미지로 개념 단위 분할(모든 인스턴스를 한 번에), 점·박스 프롬프트도 지원. Meta 자체 라이선스 | https://github.com/facebookresearch/sam3 , https://docs.ultralytics.com/models/sam-3 |
| 분할 | SAM 3.1 (2026-03-27) | Object Multiplex로 다객체 영상 추적 가속(128객체에서 약 7배) | https://ai.meta.com/blog/segment-anything-model-3/ |

**Land-XI 권장 조합(설계안)**: 에이전트 두뇌는 Gemma 4 31B/26B(vLLM, 도구 호출)가 맡음. 영상 판독 도구는 SAM 3("비닐하우스", "해양쓰레기"처럼 텍스트로 지정한 대상을 분할)과 기존 세그멘테이션 모델을 함께 씀. 지적·공간 질의 도구는 PostGIS/지적 API. 고난도 한국어 행정 문서 생성은 독파모 모델(공통기반 API)로 넘김. MCP 도구 서버로 감싸 '모두의 AI' 연계에 대비함.

---

## 6. 공공 적용 보안

| 항목 | 내용 | 출처 |
|---|---|---|
| N2SF(국가 망 보안체계) | 획일적 물리 망분리 대신 정보를 **기밀(C)·민감(S)·공개(O)**로 분류하고 등급별로 통제를 달리 적용. 6개 영역 280여 개 통제항목. 가이드라인 1.0 정식판 공개. 데이터 분류 가이드라인은 연내 마련 예정 | https://www.ncsc.go.kr:4018/main/cop/bbs/selectBoardArticle.do?bbsId=Notification_main&nttId=218022&menuNo=010000&subMenuNo=010300&thirdMenuNo= , https://www.etnews.com/20260511000310 |
| 국정원 AI 보안 가이드북(2025-12) | 15개 보안위협 유형과 30개 대책. 구축 유형을 3가지(예: '내부업무용 AI의 외부망 연계')로 나눠 중점 대책 제시. **에이전틱·피지컬 AI 위협도 포함**. AI 레드티밍 가이드라인과 AI 보안 플레이북 별도 배포 | https://www.aikorea.go.kr/web/board/brdDetail.do?menu_cd=000011&num=144 |
| 등급이 다른 망 간 사용 | 단말과 AI 서버의 보안 등급이 다르면 입력 실시간 필터링, 출력 DRM 등을 적용 | https://www.comtrue.com/comtrue/gen_ai_14/ (2차 요약 자료) |
| 2023 생성형 AI 가이드라인 | 비공개·개인정보 입력 금지 등 기본 원칙(초기 가이드) | https://nsp.nanet.go.kr/plan/main/detail.do?nationalPlanControlNo=PLAN0000039282 |
| 평가 반영 | 차년도(기사 기준 '내년', 정확한 연도는 미확인) 공공기관 보안 실태평가에 AI 보안과 N2SF 구축 여부를 대거 반영 | https://m.boannews.com/html/detail.html?idx=140878 |

**Land-XI 시사점**
1. 지적·개인 소유 정보는 '민감(S)' 이상으로 분류될 가능성이 높음. 따라서 **온프레미스 vLLM(오픈웨이트)을 기본으로** 하고, 외부 클라우드 LLM은 공개(O) 데이터에만 씀.
2. Apache 2.0 모델(Gemma 4, A.X K2, K-EXAONE 2.0)은 폐쇄망 반입과 재배포에 제약이 없음. EXAONE 4.5(NC)는 라이선스 검토 전에는 쓰지 않음.
3. 에이전트의 도구 호출에는 권한 범위 제한, 감사 로그, 입출력 필터(개인정보 마스킹)를 설계 단계부터 넣음(가이드북의 에이전틱 AI 대책 대응).
4. 가이드북 원문 PDF의 세부 30개 대책은 이번 조사에서 전문을 읽지 못함(**미확인**). 원문 확인 필요.

---

## 미확인 목록 (후속 확인 필요)
- A.X K2 VL Light-Preview의 공개 여부와 라이선스
- '모두의 AI' 공공 에이전트 연계 기술 규격(API/MCP 등)
- 독파모 3단계 일정과 공통기반에 연결된 독파모 모델의 실제 호출 방법
- Gemma 4의 한국어 벤치마크와 항공·정사영상 판독 성능
- vLLM v0.30에서 Ampere(A6000)의 FP8 동작 방식, 구조화 출력 옵션명
- 국정원 AI 보안 가이드북 30개 대책 원문
