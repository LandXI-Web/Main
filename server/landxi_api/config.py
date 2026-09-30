"""Land-XI 설정 — server/.env(없으면 .env.example) + 환경변수. 게이트웨이·워커·파이프라인이 같이 쓴다."""
from __future__ import annotations

import os
from pathlib import Path

SERVER_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = SERVER_ROOT.parent


def _load_env() -> dict[str, str]:
    out: dict[str, str] = {}
    for name in (".env.example", ".env"):          # .env 가 이긴다
        p = SERVER_ROOT / name
        if not p.exists():
            continue
        for line in p.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            out[k.strip()] = v.strip()
    out.update({k: v for k, v in os.environ.items() if k in out or k.startswith("LX_")})
    return out


ENV = _load_env()


def get(key: str, default: str | None = None) -> str | None:
    v = os.environ.get(key, ENV.get(key))
    return v if v not in (None, "") else default


DATA_ROOT = Path(get("LX_DATA_ROOT", "E:/Land-XI 플랫폼/02. 데이터"))
DEV = get("LX_DEV", "1") == "1"
API_PORT = int(get("LX_API_PORT", "8700"))
MOCK_PORT = int(get("LX_MOCK_PORT", "8701"))
PUBLIC_BASE = get("LX_PUBLIC_BASE", f"http://localhost:{API_PORT}")
REDIS_URL = get("REDIS_URL", "redis://localhost:6380/0")
PG_DSN = get("PG_DSN", "postgresql://landxi_app:landxi-dev-app@localhost:5433/landxi")
PG_WORKER_DSN = get("PG_WORKER_DSN", "postgresql://landxi_worker:landxi-dev-worker@localhost:5433/landxi")
PG_ADMIN_DSN = get("PG_ADMIN_DSN", "postgresql://postgres:landxi-dev-admin@localhost:5433/landxi")
DEV_PASSWORD = get("DEV_PASSWORD", "landxi-dev-2026")
SESSION_SECRET = (get("SESSION_SECRET", "change-me") or "").encode()
VWORLD_KEY = get("VWORLD_KEY", "")
VWORLD_DOMAIN = get("VWORLD_DOMAIN", "")
GDAL_BIN = Path(get("GDAL_BIN", "C:/Users/User/anaconda3/envs/gcs/Library/bin"))
NVIDIA_SMI = get("NVIDIA_SMI", "C:/Windows/System32/nvidia-smi.exe")
NODE_ID = get("LX_NODE_ID", "node-tr3995wx")
POOL = get("LX_POOL", "a6000")
VRAM_RESERVE_MIB = int(get("LX_VRAM_RESERVE_MIB", "2048"))
APPROVALS_REQUIRED = int(get("APPROVALS_REQUIRED", "1"))
# 바깥 주소(Cloudflare 터널 → tools/public-gate.mjs) — 이 이름으로 들어온 요청은 https 기준 주소로 서명한다
PUBLIC_HOSTS = [h.strip().lower() for h in (get("LX_PUBLIC_HOSTS", "app.land-xi.dev,admin.land-xi.dev,gov.land-xi.dev") or "").split(",") if h.strip()]
CORS_ORIGINS = ["http://localhost:4173", "http://localhost:8702", "http://127.0.0.1:4173", "http://127.0.0.1:8702",
                "https://landxi-web.github.io"] + [f"https://{h}" for h in PUBLIC_HOSTS]
OPS_ORIGIN = "http://localhost:8702"
VERSION = "0.1.0"
CONFIG_DIR = SERVER_ROOT / "config"


_yaml_cache: dict[str, tuple[float, object]] = {}


def load_yaml(name: str):
    """config/{name}.yaml — 파일이 바뀌면 다시 읽는다."""
    import yaml
    p = CONFIG_DIR / f"{name}.yaml"
    mt = p.stat().st_mtime
    c = _yaml_cache.get(name)
    if c and c[0] == mt:
        return c[1]
    d = yaml.safe_load(p.read_text(encoding="utf-8"))
    _yaml_cache[name] = (mt, d)
    return d


def manifest() -> dict:
    import json
    p = DATA_ROOT / "manifest.json"
    mt = p.stat().st_mtime
    c = _yaml_cache.get("__manifest")
    if c and c[0] == mt:
        return c[1]
    d = json.loads(p.read_text(encoding="utf-8"))
    d["_by_id"] = {i["id"]: i for i in d.get("items", [])}
    _yaml_cache["__manifest"] = (mt, d)
    return d


def gdal_env() -> dict[str, str]:
    """conda gcs 의 GDAL CLI 를 서브프로세스로 부를 때 환경(env.md)."""
    e = dict(os.environ)
    lib = GDAL_BIN.parent
    e["PATH"] = str(GDAL_BIN) + os.pathsep + e.get("PATH", "")
    e["GDAL_DATA"] = str(lib / "share" / "gdal")
    e["PROJ_DATA"] = str(lib / "share" / "proj")
    e["PROJ_LIB"] = str(lib / "share" / "proj")
    tmp = str(DATA_ROOT / "_tmp")
    if tmp.isascii():            # GDAL 은 환경변수를 ANSI 로 읽는다 — 한글 경로면 넣지 않는다(출력 옆에 임시 파일 · E:)
        e["CPL_TMPDIR"] = tmp
    else:
        e.pop("CPL_TMPDIR", None)
    return e


def gdal_exe(name: str) -> str:
    return str(GDAL_BIN / (name + ".exe"))
