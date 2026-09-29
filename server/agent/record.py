"""실제 run 녹음 → 리플레이 ndjson(off 모드 · llm_unavailable 재생용).

    python -m agent.record run_… landxi/agent/data/replay/<이름>.ndjson      (cwd = server/)

Redis 스트림 agent:runs:{id}(24h) 를 그대로 옮긴다. t = 첫 이벤트 뒤 ms(Redis entry id 의 ms 부분 = 서버 발행 시각 · 실측).
첫 줄 replay.meta = {run_id, message(PII 마스킹 뒤), recorded_at, model, events}. 값은 바꾸지 않는다(합성 0).
"""
from __future__ import annotations

import asyncio
import datetime as dt
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


async def record(run_id: str, out: Path) -> int:
    import asyncpg
    import redis.asyncio as aioredis

    from landxi_api import config
    r = aioredis.from_url(config.REDIS_URL, decode_responses=True)
    rows = await r.xrange(f"agent:runs:{run_id}", "-", "+")
    await r.aclose()
    if not rows:
        raise SystemExit(f"스트림 없음: agent:runs:{run_id} (24h 지남?)")
    t0 = int(rows[0][0].split("-")[0])
    con = await asyncpg.connect(config.PG_ADMIN_DSN)
    meta = await con.fetchrow("SELECT prompt_text, model, created_at, mode FROM agent_runs WHERE id=$1", run_id)
    await con.close()
    lines = [{"t": 0, "event": "replay.meta", "data": {
        "run_id": run_id, "message": meta["prompt_text"] if meta else None, "mode": meta["mode"] if meta else None,
        "model": json.loads(meta["model"]) if meta and isinstance(meta["model"], str) else (meta["model"] if meta else None),
        "recorded_at": dt.datetime.now().astimezone().isoformat(timespec="seconds"), "events": len(rows),
        "note": "실제 run 녹음(Redis agent:runs 스트림 그대로) · 재생 시 '기록 · 저장 결과 재생'"}}]
    for eid, f in rows:
        t = int(eid.split("-")[0]) - t0
        lines.append({"t": t, "event": f.get("event"), "data": json.loads(f.get("data") or "{}")})
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text("\n".join(json.dumps(x, ensure_ascii=False) for x in lines) + "\n", encoding="utf-8")
    return len(lines)


if __name__ == "__main__":
    n = asyncio.run(record(sys.argv[1], Path(sys.argv[2])))
    print(f"{n} lines → {sys.argv[2]}")
