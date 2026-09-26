"""Land-XI 로컬 LLM 가중치 미리 받기 (vLLM 용).

- 대상 캐시: E:/Land-XI 플랫폼/_env/models/hf-cache  (HF 표준 hub 캐시 구조
  → vLLM 컨테이너에 /root/.cache/huggingface/hub 로 그대로 마운트)
- 리비전(커밋 sha) 고정 → 재현 가능. 이미 받은 파일은 건너뜀(재실행 안전).
- 진행 로그: infra/llm/logs/download-YYYYMMDD-HHMMSS.log
- GPU 를 쓰지 않는다(네트워크·디스크만).

사용:  python download_models.py            # 전부
       python download_models.py gemma      # 이름에 'gemma' 포함된 것만
"""
from __future__ import annotations

import datetime as dt
import os
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
CACHE = Path(os.environ.get("LANDXI_HF_CACHE", r"E:/Land-XI 플랫폼/_env/models/hf-cache"))
os.environ.setdefault("HF_HUB_DISABLE_PROGRESS_BARS", "1")
# hf_transfer / xet 가 있으면 huggingface_hub 가 알아서 사용

from huggingface_hub import HfApi, snapshot_download  # noqa: E402
from huggingface_hub.errors import GatedRepoError, RepositoryNotFoundError  # noqa: E402

# (repo, revision, 역할) — 선택 근거는 README.md §모델
MODELS = [
    ("google/gemma-4-12B-it-qat-w4a16-ct", "1d2c2d7f2466070e69d6fb3fd5ce9a7d75f2f6ee",
     "두뇌(계획자·작성자·VLM) — Google 공식 QAT W4A16 compressed-tensors, Apache-2.0, ~10.3GB"),
    ("naver-hyperclovax/HyperCLOVAX-SEED-Text-Instruct-1.5B", "0728a47d632019a8da5f53b663db1c175dc04115",
     "라우터(의도 분류·도구 선택·언어 감지) — HyperCLOVAX SEED 라이선스, ~3.2GB"),
]

LOG_DIR = HERE / "logs"
LOG_DIR.mkdir(exist_ok=True)
LOG = LOG_DIR / f"download-{dt.datetime.now():%Y%m%d-%H%M%S}.log"


def log(msg: str) -> None:
    line = f"[{dt.datetime.now():%Y-%m-%d %H:%M:%S}] {msg}"
    print(line, flush=True)
    with LOG.open("a", encoding="utf-8") as f:
        f.write(line + "\n")


def repo_dir(repo: str) -> Path:
    return CACHE / ("models--" + repo.replace("/", "--"))


def dir_size(p: Path) -> int:
    return sum(f.stat().st_size for f in p.rglob("*") if f.is_file() and not f.is_symlink()) if p.exists() else 0


def main() -> int:
    only = sys.argv[1].lower() if len(sys.argv) > 1 else ""
    CACHE.mkdir(parents=True, exist_ok=True)
    api = HfApi()
    log(f"cache={CACHE}")
    rc = 0
    for repo, rev, role in MODELS:
        if only and only not in repo.lower():
            continue
        log(f"== {repo}@{rev[:10]}  ({role})")
        try:
            info = api.model_info(repo, revision=rev, files_metadata=True)
            total = sum((s.size or 0) for s in info.siblings)
            log(f"   gated={info.gated} files={len(info.siblings)} total={total/1e9:.2f}GB")
        except GatedRepoError:
            log("   GATED: 라이선스 동의 필요 — huggingface.co 에서 동의 후 재실행 (사용자 조치)")
            rc = 2
            continue
        except RepositoryNotFoundError:
            log("   NOT FOUND")
            rc = 1
            continue
        t0 = time.time()
        try:
            path = snapshot_download(repo, revision=rev, cache_dir=str(CACHE), max_workers=8)
        except GatedRepoError:
            log("   GATED(다운로드 거부): 라이선스 동의 필요 — 사용자 조치")
            rc = 2
            continue
        except Exception as e:  # 네트워크 끊김 등 — 재실행하면 이어받음
            log(f"   FAIL {type(e).__name__}: {e}")
            rc = 1
            continue
        dtm = time.time() - t0
        got = dir_size(repo_dir(repo))
        log(f"   OK {path}  on-disk={got/1e9:.2f}GB  {dtm:.0f}s  ({got/1e6/max(dtm,1):.0f} MB/s)")
    log(f"done rc={rc}")
    return rc


if __name__ == "__main__":
    sys.exit(main())
