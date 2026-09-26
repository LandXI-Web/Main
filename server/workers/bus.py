"""워커 공용(동기) — Redis 키(F1-CONTRACT §5.3) · 이벤트 발행 · PG 연결 · 로그."""
from __future__ import annotations

import datetime as dt
import json
import sys
import time
from pathlib import Path

import redis

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from landxi_api import config  # noqa: E402

KST = dt.timezone(dt.timedelta(hours=9))
_r: redis.Redis | None = None


def r() -> redis.Redis:
    global _r
    if _r is None:
        from redis.backoff import ExponentialBackoff
        from redis.retry import Retry
        _r = redis.Redis.from_url(config.REDIS_URL, decode_responses=True, socket_timeout=15, socket_connect_timeout=5,
                                  socket_keepalive=True, health_check_interval=15, retry_on_timeout=True,
                                  retry=Retry(ExponentialBackoff(cap=4, base=0.2), 6))
    return _r


REDIS_ERRORS = (redis.ConnectionError, redis.TimeoutError)


def redis_hiccup(who: str, e: Exception, n: list = [0]):
    """Docker(WSL) Redis 가 잠깐 멈추면 워커가 죽지 않고 기다린다(2026-09-26 20:48 TimeoutError 로 워커 2개가 죽은 뒤 추가)."""
    n[0] += 1
    log(who, f"redis 일시 장애 {type(e).__name__} · {n[0]}회 · 2s 뒤 재시도")
    time.sleep(2)


def now_iso(ms: bool = False) -> str:
    return dt.datetime.now(KST).isoformat(timespec="milliseconds" if ms else "seconds")


def log(who: str, *a):
    print(time.strftime("%H:%M:%S"), f"[{who}]", *a, flush=True)


def emit(job_id: str, event: str, data: dict) -> str:
    return r().xadd(f"events:{job_id}", {"event": event, "data": json.dumps(data, ensure_ascii=False)}, maxlen=10000, approximate=True)


def ops_event(event: str, data: dict):
    r().xadd("ops:events", {"event": event, "data": json.dumps(data, ensure_ascii=False)}, maxlen=5000, approximate=True)


def env(value, unit, basis, source, note=None, as_of=None):
    e = {"value": value, "unit": unit, "basis": basis, "as_of": as_of or now_iso(), "source": source}
    if note:
        e["note"] = note
    return e


def sign(key: str, ttl_s: int = 12 * 3600) -> str:
    """landxi_api.tiles.sign 과 같은 HMAC — 브라우저가 헤더 없이 여는 URL(shard GeoJSON · 서명 세트)용 쿼리."""
    import hashlib
    import hmac
    exp = int(time.time()) + ttl_s
    s = hmac.new(config.SESSION_SECRET, f"{key}|{exp}".encode(), hashlib.sha256).hexdigest()[:40]
    return f"exp={exp}&sig={s}"


def job(job_id: str) -> dict:
    return r().hgetall(f"job:{job_id}")


def ensure_group(stream: str, group: str):
    try:
        r().xgroup_create(stream, group, id="0", mkstream=True)
    except redis.ResponseError as e:
        if "BUSYGROUP" not in str(e):
            raise


def pg():
    import psycopg
    return psycopg.connect(config.PG_WORKER_DSN, autocommit=False)


def lx_tx(conn):
    """RLS: 워커는 시스템 작업 — realm lx."""
    conn.execute("SELECT set_config('app.realm','lx',true), set_config('app.tenant_id','',true)")


def shard_dir(tenant: str, job_id: str, demo: bool) -> Path:
    if demo:
        return config.DATA_ROOT / "cache" / "demo" / job_id / "shards"
    return config.DATA_ROOT / "results" / tenant / job_id / "shards"


def job_dir(tenant: str, job_id: str, demo: bool) -> Path:
    if demo:
        return config.DATA_ROOT / "cache" / "demo" / job_id
    return config.DATA_ROOT / "results" / tenant / job_id


def snapshot_path(tenant: str, job_id: str, demo: bool) -> Path:
    if demo:
        return config.DATA_ROOT / "cache" / "demo" / f"{job_id}.pmtiles"
    return config.DATA_ROOT / "results" / tenant / f"{job_id}.pmtiles"


def lane(worker: str, block: dict):
    """관제 스윔레인 — lane:{worker} 최근 50 블록(같은 job 이면 갱신)."""
    k = f"lane:{worker}"
    # 작업이 섞여 돌면(공정 분배) 머리가 다른 작업일 수 있다 — 최근 50 블록에서 같은 job 을 찾아 갱신
    for i, cur in enumerate(r().lrange(k, 0, 49)):
        c = json.loads(cur)
        if c.get("job_id") == block.get("job_id"):
            c.update({kk: v for kk, v in block.items() if v is not None})
            r().lset(k, i, json.dumps(c, ensure_ascii=False))
            return
    # 새 블록 — 계약 §4.8 LaneBlock 키(from · tenant_id)를 빠짐없이
    if not block.get("from"):
        block = {**block, "from": now_iso()}
    if not block.get("tenant_id") and block.get("job_id"):
        block = {**block, "tenant_id": r().hget(f"job:{block['job_id']}", "tenant_id")}
    block.setdefault("to", None)
    r().lpush(k, json.dumps(block, ensure_ascii=False))
    r().ltrim(k, 0, 49)
