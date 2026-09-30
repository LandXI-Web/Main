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


# 기관 스트림(v1.1-16) — ops 스트림에 나가는 이 이벤트들은 data.tenant_id 기관의 스트림에도 같은 모양으로 복사한다.
# finding.state 는 F2-S 가 tenant_event() 를 직접 부른다(여기서 복사하지 않음 — 중복 0).
TENANT_MIRROR = ("job.state", "usage.delta", "deploy.changed")
TENANT_MAXLEN = 10000
TENANT_REPLAY_S = 24 * 3600


def tenant_event(tenant_id: str | None, event: str, data: dict) -> str | None:
    """기관 스트림 events:tenant:{tenant_id} 에 한 줄(MAXLEN 10,000 · 24h 재생). GET /api/v1/events/tenant 가 tail 한다.

    시그니처(F2-S · F2-E 가 import 해 쓴다): bus.tenant_event(tenant_id, event, data) -> entry id | None
    - tenant_id 가 비면 아무것도 안 한다. data 에 tenant_id 가 없으면 채운다. 'at' 이 없으면 지금(ms).
    """
    if not tenant_id:
        return None
    d = {**data}
    d.setdefault("tenant_id", tenant_id)
    d.setdefault("at", now_iso(ms=True))
    k = f"events:tenant:{tenant_id}"
    eid = r().xadd(k, {"event": event, "data": json.dumps(d, ensure_ascii=False)}, maxlen=TENANT_MAXLEN, approximate=True)
    try:   # 24h 보다 오래된 항목은 잘라낸다(MINID · Redis ≥ 6.2)
        r().xtrim(k, minid=f"{int((time.time() - TENANT_REPLAY_S) * 1000)}-0", approximate=True)
    except Exception:
        pass
    return eid


def ops_event(event: str, data: dict):
    r().xadd("ops:events", {"event": event, "data": json.dumps(data, ensure_ascii=False)}, maxlen=5000, approximate=True)
    if event in TENANT_MIRROR and data.get("tenant_id"):
        tenant_event(data["tenant_id"], event, data)


# ── nvidia-smi 경로(v1.1-18) — LX_NVSMI > DriverStore 최신 > config.NVIDIA_SMI ─────────────────
_nvsmi: list = []


def nvsmi() -> str:
    if _nvsmi:
        return _nvsmi[0]
    import glob
    import os
    cand = os.environ.get("LX_NVSMI") or config.get("LX_NVSMI")
    if not cand or not os.path.exists(cand):
        found = glob.glob("C:/Windows/System32/DriverStore/FileRepository/nv*/nvidia-smi.exe")
        cand = max(found, key=os.path.getmtime) if found else config.NVIDIA_SMI
    _nvsmi.append(cand)
    return cand


def pid_alive(pid: int | str | None) -> bool | None:
    """같은 호스트의 PID 가 살아 있는가(None = 모름). 재부팅·kill 뒤 하트비트 TTL(30s)을 기다리지 않고 판정."""
    try:
        pid = int(pid)
    except (TypeError, ValueError):
        return None
    try:
        import psutil
        if not psutil.pid_exists(pid):
            return False
        p = psutil.Process(pid)
        return "python" in (p.name() or "").lower()
    except Exception:
        return None


def worker_alive(worker_id: str, max_age_s: float = 30) -> bool:
    """worker:{id}:hb 가 있고 ts 가 30s 안이며(같은 호스트면) PID 가 살아 있으면 True."""
    import socket
    h = r().hgetall(f"worker:{worker_id}:hb")
    if not h:
        return False
    if time.time() - float(h.get("ts") or 0) > max_age_s:
        return False
    if h.get("node") in (None, "", config.NODE_ID) and (h.get("host") in (None, "", socket.gethostname())):
        alive = pid_alive(h.get("pid"))
        if alive is False:
            return False
    return True


# ── shard 비행 기록(v1.1-14 고아 감시) — inflight:{pool} 해시 {job_id}|{shard_id} → {entry, attempt, ts, worker} ──────
def inflight_start(pool: str, job_id: str, shard_id: str, entry: dict, worker: str) -> int:
    k = f"inflight:{pool}"
    f = f"{job_id}|{shard_id}"
    att = int(entry.get("attempt") or 0)
    r().hset(k, f, json.dumps({"entry": entry, "attempt": att, "ts": time.time(), "worker": worker}, ensure_ascii=False))
    return att


LLM_REQ = "power:llm_request"
LLM_CALLS = "power:llm_calls"          # 지금 도는 LLM 호출(ZSET 이름 → 만료 시각 · r3-ops) — 한 호출이 먼저 끝나도 다른 호출이 도는 동안 예고가 지워지지 않게
LLM_OVERLAP = "power:llm_overlap"      # 기다려도 다른 GPU 가 내려가지 않은 채 시작한 호출 기록(최근 200)


def llm_power_request(holder: str = "llm", llm_gpu: int = 1, ttl_s: int = 30, wait_max_s: float = 12.0, limit_w: float = 100.0) -> dict:
    """GPU1 LLM(vLLM · Ollama) 호출 **전에** 부르는 협조 헬퍼(전력 규칙 · 두 장 동시 고부하 금지).
    ① power:llm_request 를 건다(+ 도는 호출 목록에 holder) → gpu_worker 가 칸 묶음 사이에서 즉시 멈춤(묶음 안 게이트)
    ② 다른 GPU 의 드라이버 평균 전력(nvidia-smi power.draw 와 같은 값)이 limit_w 아래로 내려갈 때까지 최대 wait_max_s 기다린다.
       (r3-ops: 6 s → 12 s — 작업기가 칸 묶음을 끝내고 멈추는 데 실측 2–4 s · 넘기면 LLM_OVERLAP 에 남긴다)
    → {waited_s, other_w, ok}. 호출이 끝나면 llm_power_done(). 긴 세션은 ttl_s 안에 다시 부르면 갱신된다.
    GPU0 가 놀고 있으면 기다림 0 s(추가 지연 없음)."""
    now = time.time()
    p = r().pipeline()
    p.zadd(LLM_CALLS, {holder: now + ttl_s})               # 같은 holder 로 다시 부르면(재시도 · 긴 세션 갱신) 한 줄로 갱신된다
    p.expire(LLM_CALLS, 600)                               # 줄마다 만료 시각(점수)이 있다 — 집합 자체는 넉넉히
    p.zrange(LLM_CALLS, -1, -1, withscores=True)
    last = p.execute()[2]
    until = max([ttl_s + now] + [sc for _h, sc in last])
    r().set(LLM_REQ, holder, ex=max(1, int(until - now)))  # 예고는 도는 호출 중 가장 늦은 만료까지
    t0 = time.time()
    other = {}
    try:
        from workers import nvml_power
        while True:
            v = nvml_power.read_avg()
            other = {i: w for i, w in v.items() if i != llm_gpu}
            if not other or max(other.values()) < limit_w or time.time() - t0 >= wait_max_s:
                break
            time.sleep(0.1)
    except Exception:
        pass
    ok = not other or max(other.values()) < limit_w
    if not ok:
        try:
            r().lpush(LLM_OVERLAP, json.dumps({"at": now_iso(), "holder": holder, "other_w": other,
                                               "waited_s": round(time.time() - t0, 2)}, ensure_ascii=False))
            r().ltrim(LLM_OVERLAP, 0, 199)
        except Exception:
            pass
    return {"waited_s": round(time.time() - t0, 2), "other_w": other, "ok": ok}


def llm_power_done(holder: str = "llm"):
    """이 호출을 목록에서 빼고, 도는 호출이 하나도 없으면 예고를 지운다. 남아 있으면 예고를 그 호출 이름·남은 시간으로 이어 둔다.
    (옛 방식: 같은 이름이면 지움 — 두 세션이 같은 'agent:vllm' 으로 겹치면 먼저 끝난 쪽이 다른 쪽 생성 중에 예고를 지웠다)"""
    now = time.time()
    try:
        p = r().pipeline()
        p.zrem(LLM_CALLS, holder)
        p.zremrangebyscore(LLM_CALLS, "-inf", now)
        p.zrange(LLM_CALLS, -1, -1, withscores=True)
        rest = p.execute()[2]
    except Exception:
        rest = []
    if not rest:
        r().delete(LLM_REQ, LLM_CALLS)
        return
    h, until = rest[0]
    r().set(LLM_REQ, h, ex=max(1, int(until - now)))


def inflight_touch(pool: str, job_id: str, shard_id: str):
    """비행 기록 ts 갱신 — 전력 게이트로 멈춘 칸을 고아 감시가 타임아웃으로 재배정하지 않게."""
    k = f"inflight:{pool}"
    v = r().hget(k, f"{job_id}|{shard_id}")
    if v:
        try:
            d = json.loads(v)
            d["ts"] = time.time()
            r().hset(k, f"{job_id}|{shard_id}", json.dumps(d, ensure_ascii=False))
        except Exception:
            pass


def inflight_owned(pool: str, job_id: str, shard_id: str, attempt: int) -> bool:
    """이 시도의 결과를 써도 되는가 — 감시자가 타임아웃으로 재배정했으면(attempt 가 바뀜) 늦게 온 결과는 버린다."""
    v = r().hget(f"inflight:{pool}", f"{job_id}|{shard_id}")
    if not v:
        return True
    try:
        return int(json.loads(v).get("attempt", 0)) == int(attempt)
    except Exception:
        return True


def inflight_end(pool: str, job_id: str, shard_id: str):
    r().hdel(f"inflight:{pool}", f"{job_id}|{shard_id}")


def shard_ms_record(key: str, ms: int):
    """kind 별 shard ms 최근 200 — 견적 eta_s(v1.1-11) 중앙값 재료."""
    k = f"perf:shard_ms:{key}"
    r().lpush(k, int(ms))
    r().ltrim(k, 0, 199)


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
