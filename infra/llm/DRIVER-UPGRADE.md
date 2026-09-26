# NVIDIA 드라이버 갱신 안내 (사용자 조치 U1)

- 작성: 2026-09-26 · 대상: 워크스테이션 노드 1 (RTX A6000 48GB ×2, Windows 11 Pro 26200)
- **드라이버 설치·재부팅은 사용자가 한다.** 이 문서는 절차와 확인 명령만 담는다.
- 왜 필요한가: 현재 드라이버 **522.06(CUDA 11.8 상한)** [실측 2026-09-26]. vLLM 공식 이미지 `vllm/vllm-openai:v0.30.0`은 **CUDA 13.0.2** 빌드(`NVIDIA_REQUIRE_CUDA=cuda>=13.0`) [실측: 레지스트리 이미지 설정], `-cu129` 변형은 CUDA 12.9 빌드다. 522.06으로는 둘 다 GPU에서 돌지 않는다. CPU 모드 대체 기동은 하지 않는다.

## 1. 설치할 버전

| 항목 | 값 |
|---|---|
| 브랜치 | **NVIDIA RTX Enterprise Production Branch R580** (장기 안정판, 워크스테이션·Studio 용도 권장) |
| 권장 버전 | **R580 U11 — 582.78** (2026-07-30 공개, WHQL). 같은 브랜치의 데이터센터 짝은 Linux 580.178.04 |
| CUDA 상한 | 13.x (R580은 Ampere 포함 전 아키텍처 CUDA 13 지원) → v0.30.0 기본 이미지 사용 가능 |
| 대안 | 더 최신 R580 업데이트가 목록에 있으면 그것(582.78 이상). 신기능 브랜치(NFB)·Game Ready는 쓰지 않는다 |
| 최소치 | 기본 이미지 = R580 이상 · `-cu129` 이미지 = R575 이상 (`launch-vllm.ps1`이 이 기준으로 점검) |

**공식 다운로드 경로** (다른 사이트 재배포본 쓰지 말 것)
1. https://www.nvidia.com/en-us/drivers/ → 제품 유형 **NVIDIA RTX / Quadro** · 시리즈 **NVIDIA RTX Series** · 제품 **RTX A6000** · OS **Windows 11** · 다운로드 유형 **Production Branch / Studio** → 검색
2. 브랜치 목록(직접 링크): https://www.nvidia.com/Download/processFind.aspx?psid=74&pfid=847&osid=57&lid=1&whql=1&lang=en-us&dtcid=1 → 맨 위 `R580 U11 (582.78)`
3. 582.78 상세: https://www.nvidia.com/download/driverResults.aspx/274521/en-us
4. 릴리스 노트(짝 데이터센터판): https://docs.nvidia.com/datacenter/tesla/tesla-release-notes-580-178-04/index.html

설치 시 **사용자 지정(고급) → 클린 설치** 권장. 추가 구성요소(GeForce Experience/NVIDIA App 등)는 선택 해제해도 된다.

## 2. 설치 전 확인 — 기존 CUDA 11.8 작업은 그대로 돈다

NVIDIA 드라이버는 **하위 호환**이다. 드라이버가 올라가도 예전 CUDA 툴킷으로 빌드된 프로그램은 그대로 돈다(반대 방향, 즉 옛 드라이버 + 새 CUDA 앱만 안 된다). 이 PC의 파이썬 환경은 PyTorch 휠이 **CUDA 런타임을 자체 포함**(`torch/lib/cudart64_*.dll`, cuDNN, cuBLAS)하므로 시스템 CUDA 툴킷 버전과 무관하고, 드라이버만 "그 런타임 이상"이면 된다.

| 환경 (local-llm.md §4 실측) | torch | 새 드라이버(R580)에서 |
|---|---|---|
| Windows 전역 Python 3.11 (`server/workers/gpu_worker.py`) | 2.5.1+cu118 | 동작 (11.8 ≤ 13.x) |
| conda `gcs` | 2.5.1+cu118 | 동작 |
| conda `yolo` | 2.7.0+cu118 | 동작 |
| conda `lx` | 1.12.1+cu113 | 동작 (sm_86 네이티브 커널 포함) |
| conda `geo` / anaconda base | 2.2.1 / 2.0.1 | 동작(CPU 빌드면 무관) |
| Ollama 0.32.15 (llama-server) | 자체 CUDA 런타임 | 동작 — 재부팅 뒤 자동 재기동, 모델은 첫 요청 때 다시 적재 |
| Docker Desktop / WSL2 | `/usr/lib/wsl/lib/libcuda.so`는 Windows 드라이버가 제공 | 드라이버 설치만으로 자동 갱신(WSL 안에 드라이버 설치 금지) |

설치 전에 할 일
1. Land-XI 추론 워커(`gpu_worker.py`) 작업이 **대기열에 없을 때** 진행. 워커 정지는 평소 방식대로.
2. Ollama는 **종료 금지 원칙**이지만, 드라이버 설치 자체가 GPU 프로세스를 끊는다 → 재부팅 후 자동 재기동을 확인만 한다(아래 §5).
3. 현재 상태 기록(롤백 판단용):
   ```powershell
   nvidia-smi --query-gpu=index,name,driver_version,memory.used,power.limit --format=csv > "$env:USERPROFILE\Desktop\gpu-before.csv"
   foreach ($e in 'gcs','yolo','lx') { conda run -n $e python -c "import torch;print('$e', torch.__version__, torch.version.cuda)" }
   ```
4. 롤백 대비: 522.06 설치 파일(또는 장치 관리자 "드라이버 롤백")이 가능한지 확인.

## 3. 설치

1. 관리자 권한으로 설치 파일 실행 → 사용자 지정 → 클린 설치 → 완료.
2. **재부팅** (사용자).

## 4. 전력 제한 (필수 권장 — 2026-09-26 전력 부족 셧다운 재발 방지)

A6000 기본 상한은 300W(최소 100W · 최대 300W). 두 장 동시 풀로드 = 600W + CPU(3995WX 280W). 한 장당 **200W**로 묶으면 성능 손실은 작고(추론은 메모리 대역 위주) 피크 전력이 크게 준다.

```powershell
# 관리자 PowerShell
nvidia-smi -i 0 -pl 200
nvidia-smi -i 1 -pl 200
nvidia-smi --query-gpu=index,power.limit,power.default_limit --format=csv
```

- 2026-09-26 20:37 실측에서 두 장 모두 이미 `power.limit = 200W`였다(같은 날 20:32에는 300W → 그 사이 적용됨). **Windows에서는 이 설정이 재부팅·드라이버 재설치 때 300W로 돌아간다.** 드라이버 갱신 뒤 반드시 다시 건다.
- 부팅할 때마다 자동 적용(관리자 PowerShell에서 1회 등록):
  ```powershell
  schtasks /Create /TN "LandXI-GPU-PowerLimit-200W" /SC ONSTART /RU SYSTEM /RL HIGHEST /F `
    /TR "C:\Windows\System32\nvidia-smi.exe -pl 200"
  schtasks /Run /TN "LandXI-GPU-PowerLimit-200W"
  ```
- 운영 규칙은 그대로: **동시 고부하 GPU ≤ 1.** 전력 제한은 이 규칙을 대신하지 않고 보강한다.

## 5. 재부팅 후 검증 (순서대로, 모두 가벼운 명령)

```powershell
# 1) 드라이버·CUDA 상한·전력
nvidia-smi                                   # 헤더: Driver 582.78 · CUDA Version 13.x
nvidia-smi --query-gpu=index,driver_version,power.limit,memory.used --format=csv   # power.limit 200 (아니면 §4)

# 2) 기존 CUDA 11.8 환경이 GPU를 보는지 (계산 부하 없음)
python -c "import torch;print(torch.__version__, torch.version.cuda, torch.cuda.is_available(), torch.cuda.get_device_name(0))"
conda run -n yolo python -c "import torch;print(torch.cuda.is_available())"

# 3) Ollama 자동 재기동
Invoke-RestMethod http://localhost:11434/api/version
Invoke-RestMethod http://localhost:11434/api/ps          # 모델은 첫 요청 때 다시 적재됨

# 4) Docker / WSL GPU 통과
docker run --rm --gpus all python:3.12-slim nvidia-smi -L
wsl -d Ubuntu -- nvidia-smi -L

# 5) vLLM 사전 점검 → 기동 → 짧은 확인 3건 (infra/llm 에서)
cd "E:\Land-XI 플랫폼\01. 디자인\infra\llm"
.\launch-vllm.ps1 -Check -Router
docker pull vllm/vllm-openai:v0.30.0          # 약 8.7GB (U4 승인 뒤)
.\launch-vllm.ps1 -Router
.\launch-vllm.ps1 -Status                      # :8000 / :8001 OK 뜰 때까지 (첫 기동 수 분)
.\launch-vllm.ps1 -Smoke
```

그 다음 Land-XI 워커를 평소대로 다시 올리고, 관제(`:8702`) GPU 행에서 외부 점유 띠가 정상인지 본다.

## 6. 문제가 생기면

| 증상 | 조치 |
|---|---|
| 기존 환경 `torch.cuda.is_available()` False | 드라이버 설치 실패 가능성 → 장치 관리자에서 드라이버 버전 확인, 재설치. 그래도 안 되면 522.06 롤백 |
| `docker run --gpus` 에서 GPU 안 보임 | Docker Desktop 재시작 → `wsl --shutdown` 뒤 Docker Desktop 다시 실행 |
| vLLM 로그 `CUDA driver version is insufficient` | 드라이버가 R580 미만 → 버전 재확인. R575~579면 `.env`의 `VLLM_IMAGE`를 `-cu129` 줄로 |
| vLLM `insufficient free memory` | Ollama 상주가 늘었거나 워커가 적재 중 → `launch-vllm.ps1`이 다시 계산하게 재실행(Ollama 종료 금지) |
