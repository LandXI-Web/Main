# infra/llm — Land-XI 로컬 LLM 플레인 (vLLM)

AGENT-SPEC §3.1 `LLM PLANE ② vLLM :8000/v1 (Docker vllm/vllm-openai · GPU1)`의 구성 파일. 저장소 코드(`landxi/` · `server/`)는 건드리지 않는다. 게이트웨이(:8700)는 `LLM_BASE_URL` 한 줄로 붙는다.

> **현재 상태 (2026-09-26 실측)**: 구성·가중치 **준비 완료**, GPU 기동 **불가**. 드라이버 522.06(CUDA 11.8 상한) < vLLM v0.30.0 요구치(CUDA 13.0 → R580). 드라이버 갱신은 사용자 조치 → [DRIVER-UPGRADE.md](DRIVER-UPGRADE.md). 그때까지 에이전트는 **Ollama `:11434/v1`** 로 돈다(AG-0 설계 그대로). CPU 모드 대체 기동은 하지 않는다.

## 파일

| 파일 | 내용 |
|---|---|
| `docker-compose.vllm.yml` | 서비스 `gemma`(:8000) · `router`(:8001, profile `router`). 이미지 `vllm/vllm-openai:v0.30.0@sha256:5f5e5352…` 고정, TP=1, 단일 GPU, `restart: "no"` |
| `.env.example` | GPU 번호·포트·VRAM 비율·이미지(cu129 대안) → `.env`로 복사해 사용(`launch-vllm.ps1`이 없으면 자동 복사) |
| `launch-vllm.ps1` | **기동은 이것으로.** 드라이버 → 다른 GPU 부하 → 대상 GPU 부하 → 여유 VRAM → 가중치 순으로 점검 후 `docker compose up`. `-Check` `-Status` `-Smoke` `-Stop` |
| `wsl-vllm.sh` | 대안 경로 B(WSL Ubuntu + uv venv Python 3.12 + `vllm==0.30.0`). 이미지 pull이 불가할 때·디버깅용 |
| `download_models.py` | 가중치 미리 받기(리비전 고정, 재실행 시 이어받기). 로그 `logs/download-*.log` |
| `DRIVER-UPGRADE.md` | 드라이버 R580 U11(582.78) 갱신 절차·전력 제한·재부팅 후 검증 |
| `logs/` | 다운로드·기동 로그 |

## 실행 경로 판단 [실측 2026-09-26]

| 경로 | 확인 결과 | 판단 |
|---|---|---|
| **A. Docker Desktop 29.6.2 (WSL2 백엔드) + `nvidia` 런타임** | `docker run --gpus …` 컨테이너에서 A6000 ×2 · 드라이버 522.06 보임. E: 한글 경로 바인드 마운트·HF 캐시 상대 심볼릭 링크가 컨테이너 안에서 정상 해석됨. CPU 128 · RAM 270GB | **기본 경로** |
| B. WSL2 Ubuntu 26.04 | `nvidia-smi -L`에 GPU 보임 · `libcuda.so` 있음 · Python 3.14.4 · vLLM 미설치 | 대안(`wsl-vllm.sh`) |
| 공통 제약 | 드라이버 522.06 → 두 경로 모두 vLLM GPU 기동 불가 | U1 |

**주의 — GPU 격리**: Docker Desktop(WSL2)은 `--gpus device=1`로 한 장만 넘겨도 컨테이너에 **두 장이 다 보인다** [실측]. 그래서 compose가 `CUDA_DEVICE_ORDER=PCI_BUS_ID` + `CUDA_VISIBLE_DEVICES=${VLLM_GPU}`로 한 장만 보이게 한다. 이 번호는 Windows `nvidia-smi` 번호와 같다(GPU0 = PCI 2D:00.0, GPU1 = PCI 41:00.0 [실측]).

## 모델 (받아 둠 · `E:\Land-XI 플랫폼\_env\models\hf-cache`)

| 역할 | 저장소 @ 리비전 | 크기 | 라이선스 | vLLM 이름 |
|---|---|---|---|---|
| **두뇌** (계획자·도구 호출·작성자·VLM) | `google/gemma-4-12B-it-qat-w4a16-ct` @ `1d2c2d7f` | 10.3GB | Apache 2.0 · 게이트 아님 | `gemma-4-12b-it` |
| **라우터** (의도·도구 선택·언어 감지) | `naver-hyperclovax/HyperCLOVAX-SEED-Text-Instruct-1.5B` @ `0728a47d` | 3.2GB | HyperCLOVAX SEED 라이선스(`LICENSE` 동봉) · auto-gate(계정 `teajin`으로 통과) | `hyperclovax-seed-1.5b` |

선택 근거
- AGENT-SPEC §2.2는 2차 계획자·VLM을 **Gemma 4 12B**로, §3.2는 "1 GPU 예산 22GB 안: E4B BF16 또는 12B int4, 12B BF16(24GB)은 불가"로 정했다.
- 12B int4 중 **Google 공식 QAT(양자화 인식 학습) 체크포인트의 compressed-tensors W4A16판**을 골랐다. 모델 카드: "vLLM 네이티브 추론용", BF16에 가까운 품질. Ampere(A6000)는 FP8 연산이 없지만 W4A16은 Marlin 커널로 돈다. 아키텍처 `Gemma4UnifiedForConditionalGeneration`은 vLLM v0.30.0 레지스트리에 있다 [확인: 소스]. 이미지 입력 포함.
- E4B BF16(16GB)은 12B int4보다 무겁고(파라미터 효율 낮음) 품질은 낮다 → 받지 않았다. 필요하면 `download_models.py`의 `MODELS`에 `google/gemma-4-E4B-it`을 추가.
- 26B A4B · 31B는 GPU 한 장 + Ollama 공존 예산에 안 들어간다(§3.2).
- HyperCLOVAX 라이선스의 공공 서비스 적합성은 [미확인] — AGENT-SPEC 라이선스 확인 목록 그대로. 확인 전 화면 표기 금지.

## VRAM · 전력 예산

| 항목 | 값 |
|---|---|
| GPU 1장 | 49,140 MiB · Ollama 등 기존 점유 ~24,586 MiB [실측] → 여유 ~24,555 MiB |
| 예비 | 2,048 MiB (`workers/vram.py`와 같은 규칙) |
| 라우터 | `0.09` × 49,140 ≈ 4.4GB |
| Gemma | 남는 예산 ≈ 18.1GB → `--gpu-memory-utilization ≈ 0.368` (상한 0.45, 하한 14GB 미만이면 기동 거부) |
| 동시성 억제 | Gemma `--max-num-seqs 8 --max-num-batched-tokens 4096`, 컨텍스트 16K · 이미지 ≤4장 · 이미지당 560토큰 |
| 전력 | GPU당 `nvidia-smi -pl 200`(현재 200W 적용됨, 재부팅 시 풀림 → DRIVER-UPGRADE §4) |

**스케줄러(가변형 자동 조율, Q-AG2)가 지킬 전력 규칙**
1. **동시 고부하 GPU ≤ 1.** "고부하" = `utilization.gpu ≥ 30%` 또는 LLM/추론 배치 실행 중. 한 GPU가 고부하면 다른 GPU에는 새 고부하 작업(추론 워커 배치·vLLM 기동·벤치)을 배정하지 않는다. `launch-vllm.ps1`은 이 조건에서 **종료 코드 3**으로 거부한다.
2. vLLM은 **한 번에 한 GPU에만** 존재한다(두뇌·라우터 같은 GPU). 다른 GPU로 옮길 때는 `-Stop` → `-Gpu 0` 기동. TP=2는 쓰지 않는다.
3. **Ollama 종료 금지.** VRAM이 모자라면 vLLM을 줄이거나 올리지 않는다(종료 코드 4). Ollama 상주 축소(`OLLAMA_KEEP_ALIVE`)는 사용자 결정 사항.
4. vLLM이 적재돼 있어도 요청이 없으면 GPU는 유휴(P8 수준)다 — "적재"와 "고부하"를 구분해 관제에 표시한다(`LLM(vLLM)` 띠 · AGENT-SPEC §4).
5. 부하 시험·벤치는 사용자가 지정한 시간대에만, 다른 GPU가 유휴일 때만.

`launch-vllm.ps1` 종료 코드: `0` 성공 · `2` 드라이버 미달 · `3` 전력 규칙(다른/대상 GPU 고부하) · `4` VRAM 부족 · `5` 가중치 없음.

## 명령

PowerShell, 이 폴더에서:

```powershell
cd "E:\Land-XI 플랫폼\01. 디자인\infra\llm"

.\launch-vllm.ps1 -Check -Router     # 점검만 (현재: 드라이버 522.06 으로 종료 코드 2)
.\launch-vllm.ps1                    # 두뇌만 GPU1
.\launch-vllm.ps1 -Router            # 두뇌 + 라우터 GPU1
.\launch-vllm.ps1 -Gpu 0 -Router     # 스케줄러가 GPU0 을 LLM 에 배정했을 때
.\launch-vllm.ps1 -Status            # 컨테이너 · GPU · :8000/:8001 /v1/models
.\launch-vllm.ps1 -Smoke             # 짧은 요청 3개(모델 목록 · 한국어 한 문장 · 도구 호출 1회 · 라우터 1회)
.\launch-vllm.ps1 -Stop              # vLLM 컨테이너만 내림(GPU 메모리 반환). Ollama 는 그대로

docker logs -f landxi-vllm-gemma     # 첫 기동은 가중치 적재·컴파일로 수 분
docker compose -f docker-compose.vllm.yml --env-file .env --profile router ps
```

가중치 다시 받기·확인: `python download_models.py` (이미 받은 파일은 건너뜀).

## 게이트웨이(:8700)가 붙을 엔드포인트 — OpenAI 호환

| 백엔드 | `base_url` | 모델 이름 | 용도 |
|---|---|---|---|
| `vllm` | `http://127.0.0.1:8000/v1` | `gemma-4-12b-it` | 계획자 · 도구 호출(`tools`, `tool_choice:"auto"`) · 작성자 · VLM(`image_url`) |
| `vllm-router` | `http://127.0.0.1:8001/v1` | `hyperclovax-seed-1.5b` | 라우터(의도 분류 · 언어 감지) |
| `ollama` (폴백 · 현재 기본) | `http://127.0.0.1:11434/v1` | `qwen3:4b-instruct` 등 상주 모델 | vLLM 미기동·기동 실패·VRAM 부족 시 |

- 인증: 기본 `127.0.0.1` 바인드 · 키 없음. 다른 노드에 열 때만 `.env`에서 `VLLM_BIND=0.0.0.0` + `VLLM_API_KEY` 설정 → 게이트웨이는 `Authorization: Bearer <키>`.
- 헬스: `GET /health`(200) · 모델: `GET /v1/models` · 지표: `GET /metrics`(Prometheus, 관제 토큰/초 스파크라인용 · AGENT-SPEC §4).
- Thinking: 서버 기본 **꺼짐**(`enable_thinking:false`, 도구 호출 지연 최소화). 요청별로 켜기: `"chat_template_kwargs": {"enable_thinking": true}` → 응답 `reasoning_content` 필드(파서 `gemma4`).
- 구조화 출력(라우터 JSON 등): vLLM `response_format: {"type":"json_schema", ...}` — 게이트웨이 구현 때 실측.
- 이미지 토큰 예산: `.env`의 `GEMMA_IMAGE_TOKENS`(70/140/280/560/1120). 요청별 조정은 `mm_processor_kwargs`.
- vLLM 공식 레시피의 도구 호출용 템플릿(`/vllm-workspace/examples/tool_chat_template_gemma4.jinja`, 이미지 안 경로 [추론: Dockerfile `WORKDIR /vllm-workspace` + `COPY examples`])은 기본으로 쓰지 않고 모델 동봉 `chat_template.jinja`를 쓴다. 도구 호출이 어긋나면 `.env`에 `GEMMA_EXTRA_ARGS=--chat-template /vllm-workspace/examples/tool_chat_template_gemma4.jinja`.

**폴백 순서(라우터 설정 `server/agent/config/router.yaml` 제안 — 게이트웨이 팀 소유)**: `vllm` → `ollama`. 판정은 `GET :8000/health` 2초 타임아웃. 라우터 역할은 `vllm-router` → `vllm`(Gemma로 겸임) → `ollama`.

## 드라이버 갱신 뒤 첫날 순서 (사용자 승인 필요 항목 ★)

1. ★ 드라이버 R580 U11(582.78) 설치 · 재부팅 · `nvidia-smi -pl 200` 재적용 — [DRIVER-UPGRADE.md](DRIVER-UPGRADE.md)
2. ★ `docker pull vllm/vllm-openai:v0.30.0` (약 8.7GB, C: Docker 디스크)
3. `.\launch-vllm.ps1 -Check -Router` → `.\launch-vllm.ps1 -Router` → `-Status` → `-Smoke`
4. 게이트웨이 `LLM_BASE_URL=http://127.0.0.1:8000/v1` 전환(게이트웨이 팀)

## 아직 확인하지 못한 것

- 실제 GPU 기동·메모리 적합(0.368 비율에서 16K 컨텍스트 KV 확보량) — 드라이버 갱신 전에는 확인 불가.
- 이미지 안 예제 템플릿 경로 — 이미지를 받지 않아 추론.
- `--kv-cache-dtype fp8`의 Ampere 동작 — 기본값 끔.
- HyperCLOVAX SEED 라이선스의 공공 서비스 적용 조건.
