#!/usr/bin/env bash
# Land-XI vLLM — WSL2 대안 경로(B). 기본 경로는 Docker(launch-vllm.ps1). 디버깅·이미지 pull 불가 시에만.
#
# 전제 [실측 2026-09-26]: WSL Ubuntu 26.04 · Python 3.14.4(시스템) · /usr/lib/wsl/lib/libcuda.so 있음 · nvcc 없음(불필요)
# vLLM 휠은 Python 3.10~3.14 지원이지만 시스템 파이썬 대신 uv 로 3.12 가상환경을 따로 만든다(시스템 오염 방지).
#
# 사용 (WSL Ubuntu 셸에서, 드라이버 R580 갱신 뒤):
#   bash "/mnt/e/Land-XI 플랫폼/01. 디자인/infra/llm/wsl-vllm.sh" setup    # 1회: uv + venv + vllm==0.30.0 (~수 GB, 사용자 승인 후)
#   bash ".../wsl-vllm.sh" check                                           # 드라이버·GPU·VRAM 점검만
#   bash ".../wsl-vllm.sh" gemma  [GPU=1] [UTIL=0.36]                      # 두뇌 :8000
#   bash ".../wsl-vllm.sh" router [GPU=1] [UTIL=0.09]                      # 라우터 :8001
#   bash ".../wsl-vllm.sh" stop
#
# 전력 규칙: GPU 한 장만(CUDA_VISIBLE_DEVICES 한 개), TP=1. 다른 GPU 고부하면 거부. CPU 대체 기동 없음.
set -euo pipefail

VENV="${LANDXI_VLLM_VENV:-$HOME/.venvs/landxi-vllm}"      # WSL ext4(빠름). /mnt/e 에 두지 않는다
MODELS="/mnt/e/Land-XI 플랫폼/_env/models/hf-cache"
GEMMA="$MODELS/models--google--gemma-4-12B-it-qat-w4a16-ct/snapshots/1d2c2d7f2466070e69d6fb3fd5ce9a7d75f2f6ee"
HCX="$MODELS/models--naver-hyperclovax--HyperCLOVAX-SEED-Text-Instruct-1.5B/snapshots/0728a47d632019a8da5f53b663db1c175dc04115"
VLLM_VERSION="0.30.0"
GPU="${GPU:-1}"
MIN_DRIVER=580
BUSY=30
LOGDIR="/mnt/e/Land-XI 플랫폼/01. 디자인/infra/llm/logs"
mkdir -p "$LOGDIR"

export CUDA_DEVICE_ORDER=PCI_BUS_ID CUDA_VISIBLE_DEVICES="$GPU"
export HF_HUB_OFFLINE=1 TRANSFORMERS_OFFLINE=1 VLLM_NO_USAGE_STATS=1 DO_NOT_TRACK=1 NCCL_P2P_DISABLE=1

check() {
  local drv; drv=$(nvidia-smi --query-gpu=driver_version --format=csv,noheader | head -1)
  echo "driver $drv"
  if [ "${drv%%.*}" -lt "$MIN_DRIVER" ]; then
    echo "중단: 드라이버 $drv < R$MIN_DRIVER — vLLM $VLLM_VERSION(CUDA 13) GPU 기동 불가. CPU 대체 기동 안 함. DRIVER-UPGRADE.md 참고." >&2
    exit 2
  fi
  local other=$(( 1 - GPU ))
  local ou; ou=$(CUDA_VISIBLE_DEVICES= nvidia-smi -i "$other" --query-gpu=utilization.gpu --format=csv,noheader,nounits | tr -d ' ')
  if [ "$ou" -ge "$BUSY" ]; then echo "중단: GPU$other 고부하(${ou}%) — 동시 고부하 GPU ≤ 1" >&2; exit 3; fi
  nvidia-smi -i "$GPU" --query-gpu=index,memory.used,memory.total,utilization.gpu,power.limit --format=csv
}

case "${1:-}" in
  setup)
    command -v uv >/dev/null || { echo "uv 설치: curl -LsSf https://astral.sh/uv/install.sh | sh  (사용자 승인 후)"; exit 1; }
    uv venv -p 3.12 "$VENV"
    # shellcheck disable=SC1091
    . "$VENV/bin/activate"
    uv pip install "vllm==$VLLM_VERSION" --torch-backend=auto
    python -c "import vllm, torch; print('vllm', vllm.__version__, 'torch', torch.__version__, 'cuda', torch.version.cuda)"
    ;;
  check) check ;;
  gemma)
    check; . "$VENV/bin/activate"
    nohup vllm serve "$GEMMA" --served-model-name gemma-4-12b-it \
      --host 127.0.0.1 --port 8000 --tensor-parallel-size 1 \
      --gpu-memory-utilization "${UTIL:-0.36}" --max-model-len 16384 \
      --max-num-seqs 8 --max-num-batched-tokens 4096 \
      --enable-auto-tool-choice --tool-call-parser gemma4 --reasoning-parser gemma4 \
      --default-chat-template-kwargs '{"enable_thinking": false}' \
      --limit-mm-per-prompt '{"image": 4, "audio": 0}' \
      --mm-processor-kwargs '{"max_soft_tokens": 560}' \
      > "$LOGDIR/wsl-gemma.log" 2>&1 &
    echo $! > /tmp/landxi-vllm-gemma.pid; echo "started pid $(cat /tmp/landxi-vllm-gemma.pid) · log $LOGDIR/wsl-gemma.log"
    ;;
  router)
    check; . "$VENV/bin/activate"
    nohup vllm serve "$HCX" --served-model-name hyperclovax-seed-1.5b \
      --host 127.0.0.1 --port 8001 --tensor-parallel-size 1 \
      --gpu-memory-utilization "${UTIL:-0.09}" --max-model-len 4096 --max-num-seqs 8 \
      --dtype bfloat16 --enforce-eager \
      > "$LOGDIR/wsl-router.log" 2>&1 &
    echo $! > /tmp/landxi-vllm-router.pid; echo "started pid $(cat /tmp/landxi-vllm-router.pid) · log $LOGDIR/wsl-router.log"
    ;;
  stop)
    for f in /tmp/landxi-vllm-gemma.pid /tmp/landxi-vllm-router.pid; do
      [ -f "$f" ] && kill "$(cat "$f")" 2>/dev/null && rm -f "$f" && echo "stopped $f"
    done; true
    ;;
  *) sed -n '2,16p' "$0" ;;
esac
