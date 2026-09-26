# 로컬 LLM 실행 환경 실측 — vLLM 서빙 경로

- 실측일: 2026-09-24 10:50 KST (읽기·조회만. 설치·종료·설정 변경 없음. Ollama `llama-server`는 건드리지 않음)
- 대상: 워크스테이션 노드 1 (Threadripper 3995WX 64C · 512GB · RTX A6000 48GB×2 · Windows 11 Pro 26200)
- 표기: **[실측]** 이 문서 작성 중 명령으로 확인 · **[추론]** 실측값에서 끌어낸 판단(실행 안 함) · **[미검증]** 외부 사실, 도입 전 확인 필요

---

## 0. 결론 (먼저)

1. **지금 이 순간 vLLM은 돌지 않는다.** 막는 것은 딱 하나, **NVIDIA 드라이버 522.06(CUDA 11.8 상한)** 이다 [실측]. 현행 vLLM(공식 Docker 이미지·pip 휠)은 CUDA 12.x 빌드라 드라이버 R570 이상이 필요하다 [미검증: 버전별 정확한 하한은 설치 시 이미지 태그로 확인]. cu118용 옛 vLLM(0.6대)은 Gemma 3·HyperCLOVAX SEED·EXAONE 4 계열을 지원하지 않아 쓸모가 없다 [미검증].
2. **나머지 경로는 이미 다 깔려 있다.** WSL2(Ubuntu 26.04, 커널 6.18) 안에서 `nvidia-smi`가 A6000 두 장을 본다. Docker Desktop 29.6.2에 `nvidia` 런타임이 등록돼 있고, `docker run --gpus all`로 컨테이너 안에서 두 GPU가 보인다 [실측]. Docker 한도 = 128 CPU · 270GB RAM [실측].
3. **따라서 권장 경로 = Docker Desktop(WSL2 백엔드) + `vllm/vllm-openai` 컨테이너.** 드라이버만 갱신하면 곧바로 OpenAI 호환 `/v1` 엔드포인트가 선다. WSL Ubuntu에 직접 pip 설치(경로 B)는 Python 3.14뿐이라 vLLM 휠 호환이 불확실해서 차선이다.
4. **VRAM 예산은 GPU당 약 22GB.** 각 GPU 48GB 중 24.5GB를 Ollama 4모델 + Land-XI `gpu_worker.py` 2개가 이미 쓰고 있다 [실측]. "Ollama 종료 금지" 결정(블루프린트 v1.1 R10)을 지키면 vLLM은 `--gpu-memory-utilization 0.45` 전후(≈22GB)로 들어가야 하고, 그러면 **Land-XI 추론 워커의 여유가 0에 가까워진다.** 셋이 공존하려면 Ollama `keep_alive`(현재 사용자 환경변수 `OLLAMA_KEEP_ALIVE=4h`)를 줄이거나, 두 GPU의 역할(GPU0 = 비전 워커, GPU1 = LLM)을 나눠야 한다. 이건 사용자가 정할 일이다.

### 사용자 조치 (이 순서대로)

| # | 조치 | 영향 | 왜 사용자만 할 수 있나 |
|---|---|---|---|
| U1 | **NVIDIA 드라이버 522.06 → R570 이상(권장: 최신 Production Branch, RTX A6000용)으로 갱신** + 재부팅 | 설치하는 동안 Ollama·`gpu_worker.py`·Chrome GPU가 끊긴다. 블루프린트 Q-E ④와 같은 항목이므로 앞당길지 결정이 필요하다 | 시스템 드라이버 변경, 재부팅 |
| U2 | GPU 역할 분리 또는 Ollama 상주 정책 조정(예: `OLLAMA_KEEP_ALIVE` 4h → 10m, 혹은 Ollama를 GPU1로 제한) | Land-XI 워커 처리량과 LLM 동시 운용 | Ollama 종료 금지 결정의 주인 |
| U3 | (Gemma 계열을 쓸 때) Hugging Face 계정에서 Gemma 라이선스 동의, 읽기 토큰 발급 → `HF_TOKEN` | 게이트된 모델 다운로드 | 개인 계정 동의 |
| U4 | `vllm/vllm-openai` 이미지 pull(약 10GB대 [미검증]) 허용, 모델 캐시 위치 결정(권장: `E:\DockerData` 또는 `E:\hf-cache` — C: 여유 124GB) | 디스크 | 설치 승인 |
| U5 | (선택) `%USERPROFILE%\.wslconfig` 작성 — 현재 **파일이 없다** [실측]. WSL 기본 한도(메모리 251GB 보임)로도 충분하므로 필수는 아니다 | — | 설정 변경 |

U1 이후 첫 스모크 테스트(이미 받아 둔 HyperCLOVAX 1.5B로 다운로드 없이 가능):

```bash
# [추론] 드라이버 갱신 후. GPU1 하나, 약 20GB 예산
docker run --rm --gpus '"device=1"' -p 8000:8000 --ipc=host \
  -v C:/Users/User/.cache/huggingface:/root/.cache/huggingface \
  vllm/vllm-openai:latest \
  --model naver-hyperclovax/HyperCLOVAX-SEED-Text-Instruct-1.5B \
  --gpu-memory-utilization 0.40 --max-model-len 8192
curl http://localhost:8000/v1/models
```

두 장 텐서 병렬(TP=2)은 WSL2에서 GPU 간 P2P가 없으므로 `-e NCCL_P2P_DISABLE=1`, 필요하면 `--disable-custom-all-reduce`를 붙인다 [미검증: WSL 멀티 GPU NCCL 동작은 드라이버 갱신 후 확인].

---

## 1. GPU · 드라이버 [실측]

| 항목 | 값 |
|---|---|
| GPU | RTX A6000 ×2 (Ampere, sm_86) · WDDM 모드 |
| 드라이버 | **522.06** · CUDA 상한 **11.8** |
| 사용 중 VRAM | GPU0 24,524 / 49,140 MiB · GPU1 24,524 / 49,140 MiB · 사용률 0%(P8 유휴) |
| GPU 프로세스 | GPU0: `python.exe workers/gpu_worker.py --gpu 0`(PID 147832) · GPU1: `llama-server.exe` ×4(PID 108656·128956·140012·146332) + `gpu_worker.py --gpu 1`(PID 145992) |
| 프로세스별 VRAM | WDDM이라 N/A |

`gpu_worker.py`는 이 저장소의 `server/workers/gpu_worker.py`(Land-XI F1 추론 워커)다. Ollama `api/ps` 합계는 약 25.7GB이고, 두 GPU에 나뉘어 올라간 것으로 보인다(nvidia-smi 프로세스 목록상 llama-server는 GPU1에만 보이지만 VRAM은 두 장이 같다 → Ollama가 레이어를 양쪽에 분산했을 가능성 [추론]).

## 2. Ollama [실측]

- 버전 0.32.15 · `ollama serve` PID 110404 · `OLLAMA_KEEP_ALIVE=4h`(사용자 환경변수) · `OLLAMA_MODELS`/`OLLAMA_HOST` 미설정(기본값)
- 설치 모델 (`ollama list`)

| 모델 | 디스크 | 상주 VRAM(`api/ps`) | 양자화 | ctx |
|---|---|---|---|---|
| qwen3:4b-instruct | 2.5GB | 7.50GB | Q4_K_M | 8192 |
| qwen3:1.7b | 1.4GB | 5.05GB | Q4_K_M | 8192 |
| exaone3.5:7.8b | 4.8GB | 9.05GB | Q4_K_M | 8192 |
| exaone3.5:2.4b | 1.6GB | 4.14GB | Q4_K_M | 8192 |

네 모델이 모두 상주 중(만료 11:17 KST). OpenAI 호환 `http://localhost:11434/v1`도 이미 쓸 수 있으므로 **vLLM 이전의 에이전트 프로토타입은 Ollama로 바로 시작할 수 있다.** 단 동시 요청 처리량·연속 배칭·구조화 출력(guided decoding)은 vLLM이 유리하다.

## 3. Hugging Face 캐시 `C:\Users\User\.cache\huggingface\hub` [실측]

| 저장소 | 크기 | 비고 |
|---|---|---|
| naver-hyperclovax/HyperCLOVAX-SEED-Text-Instruct-1.5B | 3.0GB | `model.safetensors`·tokenizer 완비 → vLLM 스모크 테스트용 |
| facebook/sam2-hiera-large | 857MB | 비전(분할), LLM 아님 |
| skt/kogpt2-base-v2 | 493MB | 구형 |
| bert-base-uncased | 421MB | 임베딩/분류 |
| openai/gpt-4-korean | 0 | 빈 디렉터리(존재하지 않는 저장소 시도 흔적) |

Gemma·EXAONE(HF 원본)·A.X·Solar 계열은 캐시에 없다.

## 4. Python 환경별 LLM 패키지 [실측: site-packages dist-info]

| 환경 | torch | transformers | vLLM | SGLang | llama-cpp | 기타 |
|---|---|---|---|---|---|---|
| **Windows 전역 Python 3.11** (`gpu_worker` 실행 환경) | 2.5.1+cu118 | **5.14.1** | 없음 | 없음 | **llama_cpp_python 0.3.35** | accelerate 1.14 · sentence_transformers 5.6.1 · fastapi 0.136 · ultralytics 8.3.234 |
| anaconda base | 2.0.1 | 4.29.2 | 없음 | 없음 | 없음 | |
| gcs | 2.5.1+cu118 | — | 없음 | 없음 | 없음 | |
| geo | 2.2.1 | — | 없음 | 없음 | 없음 | |
| lx | 1.12.1+cu113 | 4.27.4 | 없음 | 없음 | 없음 | openai 0.27.4(구 SDK) |
| lx_wav · river · pycaret | — | — | 없음 | 없음 | 없음 | |
| yolo | 2.7.0+cu118 | — | 없음 | 없음 | 없음 | |
| WSL Ubuntu | Python 3.14.4 · pip 패키지 없음 · `nvcc` 없음 | | | | | |

vLLM·SGLang은 **어디에도 없다.** Windows 네이티브는 vLLM 공식 지원 대상이 아니므로 설치 후보에서 뺀다. Windows에서 당장 쓸 수 있는 LLM 런타임은 Ollama와 `llama_cpp_python`(전역 3.11) 두 가지다.

## 5. WSL2 · Docker [실측]

| 항목 | 값 |
|---|---|
| WSL | 2.7.11.0 · 커널 6.18.33.2-2 |
| 배포판 | `docker-desktop`(Running, v2, 기본) · `Ubuntu`(Running, v2) = Ubuntu 26.04 LTS |
| WSL Ubuntu GPU | `nvidia-smi`로 A6000 ×2 보임 · `/usr/lib/wsl/lib/libcuda.so` 있음 |
| WSL Ubuntu 자원 | 메모리 251GB 보임(기본 50%) · `/` 1007GB 중 953GB 여유 |
| `.wslconfig` | 없음 |
| Docker | Desktop 29.6.2 · 런타임 `io.containerd.runc.v2`·`nvidia`·`runc` (기본 runc, `--gpus`로 nvidia 주입) |
| GPU 통과 | `docker run --rm --gpus all python:3.12-slim nvidia-smi` → A6000 ×2, 522.06 보임 |
| 기존 이미지 | alpine · aquasec/trivy · certbot · cleanriver-flask(:latest·:lx·:lx-20260910) · nginx(1.27-alpine·alpine) · postgis/postgis:16-3.4 · python:3.12-slim · redis:7-alpine — **CUDA·vLLM 이미지 없음** |
| 실행 중 컨테이너 | landxi-redis · landxi-postgis · cleanriver-nginx · cleanriver-flask · cleanriver-redis |

## 6. 기존 코드의 LLM/에이전트 흔적 [실측: grep `ollama|openai|vllm|langchain|gemma|exaone|hyperclova|llama_cpp|langgraph`]

| 경로 | 결과 |
|---|---|
| `E:\land-xi.dev` | `개설.md`에 "기본은 강사 PC에 올린 EXAONE" 문구, `site/data.json`에 언급 — **문서뿐, 호출 코드 없음** |
| `E:\rivercheck-app` | 없음 |
| `E:\Auto_Label_project` | 없음 |
| `E:\Land-XI 플랫폼\01. 디자인\server` | `landxi_api/ops.py`는 `llama-server`/`ollama` 프로세스 이름을 **GPU 외부 점유로 표시**하는 용도, `workers/vram.py`는 남는 VRAM 계산 — **LLM을 호출하는 코드는 없다** |

즉 에이전트·LLM 서비스 코드는 현재 **0줄**이다. 설계 문서(`LANDXI-HYPER-BLUEPRINT.md`)도 Ollama를 "종료하면 안 되는 외부 점유"로만 다룬다.

---

## 7. 모델 배치안 (드라이버 갱신 후 · GPU당 약 22GB 예산 기준) [추론]

| 역할 | 후보 | 형식 | 배치 | 비고 |
|---|---|---|---|---|
| 스모크·경량 라우터 | HyperCLOVAX-SEED-Text-Instruct-1.5B | bf16 ≈3GB | GPU1 단독 | 이미 캐시됨 |
| 한국어 행정 문장·보고서 | EXAONE 3.5 7.8B (또는 후속 EXAONE 4.x) | bf16 ≈16GB | GPU1 단독, ctx 16k | 라이선스 비상업 조건 확인 [미검증] |
| 다국어·비전(항공영상 캡션) | Gemma 3 12B / 27B | 12B bf16 ≈24GB → TP=2 · 27B는 AWQ/GPTQ int4 ≈15–17GB → TP=2 | 두 장 | Gemma 약관 동의 필요(U3) · Ampere는 FP8 연산 미지원이라 int4/bf16 권장 |
| 국가 독자 AI 파운데이션 모델(독파모) 계열 | LG EXAONE · SKT A.X · Upstage Solar 등 공개 가중치 | 모델별 | 모델별 | 참여 컨소시엄·공개 여부·라이선스는 도입 시점에 확인 [미검증] |

48GB를 모두 쓰는 구성(예: Gemma 3 27B bf16 TP=2)은 Ollama와 `gpu_worker`를 비워야만 가능하다 → U2 결정 사항.

## 8. 대안 경로 비교

| 경로 | 지금 가능? | 막는 것 | 판단 |
|---|---|---|---|
| **A. Docker Desktop + `vllm/vllm-openai`** | 아니오 | 드라이버 522.06 | **권장.** GPU 통과·nvidia 런타임 검증 완료, 기존 Land-XI 컨테이너(PostGIS·Redis)와 같은 compose로 묶을 수 있다 |
| B. WSL Ubuntu에 pip/uv로 vLLM | 아니오 | 드라이버 + Python 3.14(휠 호환 불확실) | `uv venv -p 3.12`로 우회 가능. 디버깅용 차선 |
| C. Windows 네이티브 vLLM | 아니오 | 공식 미지원 | 제외 |
| D. Ollama(현행) | **예** | — | 에이전트 프로토타입·도구 호출 시험은 오늘 바로. 동시성·처리량은 vLLM 이관 후 bench |
| E. `llama_cpp_python` 0.3.35(전역 3.11) | 예 [추론: CUDA 빌드 여부 미확인] | — | D와 겹친다 |

## 9. 다음 확인 (드라이버 갱신 직후)

1. `nvidia-smi` 헤더의 CUDA 버전이 12.8 이상인지.
2. 위 스모크 명령으로 HyperCLOVAX 1.5B `/v1/chat/completions` 응답.
3. TP=2(`--tensor-parallel-size 2`, `NCCL_P2P_DISABLE=1`)로 Gemma 3 12B 기동 → WSL 멀티 GPU NCCL 동작 확인.
4. Ollama·`gpu_worker`와 동시 부하에서 토큰/초와 Land-XI 칩/초 동시 측정 → 블루프린트 R10 bench 조건(`external_used_mib`)에 vLLM 점유 추가.
