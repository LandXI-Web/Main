"""해외 경작지 모델 다시 학습 → 나라 전체 다시 돌리기 → 결과 판 다시 쓰기(10-18 원칙 289 · 사용자 승인 '경작지 모델 다시 학습 + 나라 전체 다시 돌리기').

  python -m overseas.retrain train            3판 판 파일로 학습 작업을 게이트웨이 대기열에 넣고 끝까지 기다림(GPU 규칙은 작업 장비가 지킴)
  python -m overseas.retrain switch <모델>     나라 작업 모델을 바꿈(설정 overseas.run.model) — 작업기가 칸마다 새 모델로 다시 돈다
  python -m overseas.retrain chain            나라 작업이 다 끝나길 기다렸다가: 군 장부(publish) · 지도 조각(z11 · z13) ·
                                              2017 건물(같은 모델 · 2025 분위수에 맞춘 합성) · 건물 변화 격자(sprawl) 차례로
GPU 는 게이트웨이 작업 대기열로만(학습 · 분석) — 이 파일은 넣고 기다리기만 한다.
"""
from __future__ import annotations

import json
import subprocess
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from national.common import pg  # noqa: E402
from national.runner import Gate  # noqa: E402

SRV = Path(__file__).resolve().parents[1]
DATASET = "overseas/kgz/train/dataset-v3.npz"


def log(*a):
    print(time.strftime("%m-%d %H:%M:%S"), *a, flush=True)


def train() -> str:
    g = Gate()
    g.login()
    body = {"kind": "train", "priority": 3, "label": "overseas/kgz/retrain-v3",
            "options": {"trainer": "train/s2unet", "dataset": DATASET, "country": "kgz", "epochs": 40, "batch": 32}}
    r = g.call("POST", "/jobs", json=body)
    if r.status_code >= 300:
        raise SystemExit(f"학습 넣기 실패 {r.status_code} {r.text[:300]}")
    jid = r.json()["job"]["id"]
    log("학습 작업", jid)
    while True:
        time.sleep(20)
        v = g.call("GET", f"/jobs/{jid}").json()
        v = v.get("job", v)
        if v.get("state") in ("done", "failed", "cancelled"):
            log("학습", v.get("state"), str(v.get("error") or "")[:300])
            break
    return f"overseas/{jid}"


def switch(model: str):
    with pg() as c:
        row = c.execute("SELECT value FROM lx_settings WHERE key='overseas.run'").fetchone()
        cur = (json.loads(row[0]) if isinstance(row[0], str) else row[0]) if row else {}
        prev = cur.get("model")
        cur.update(model=model, year=2025, enabled=True, previous_model=prev)
        c.execute("INSERT INTO lx_settings(key, value) VALUES ('overseas.run', %s::jsonb) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value",
                  (json.dumps(cur, ensure_ascii=False),))
    log("나라 작업 모델", prev, "→", model)


def _settings() -> dict:
    with pg() as c:
        row = c.execute("SELECT value FROM lx_settings WHERE key='overseas.run'").fetchone()
        return (json.loads(row[0]) if isinstance(row[0], str) else row[0]) if row else {}


def _set(**kw):
    cur = _settings()
    cur.update(kw)
    with pg() as c:
        c.execute("UPDATE lx_settings SET value=%s::jsonb WHERE key='overseas.run'", (json.dumps(cur, ensure_ascii=False),))


def _left(year: int, model: str) -> int:
    with pg() as c:
        return c.execute("SELECT count(*) FROM overseas_cells WHERE country='kgz' AND year=%s AND NOT test AND (state<>'done' OR model_id IS DISTINCT FROM %s)",
                         (year, model)).fetchone()[0]


def _run(*args):
    log("실행", " ".join(args))
    r = subprocess.run([sys.executable, "-m", *args], cwd=SRV)
    log("끝", " ".join(args), r.returncode)
    return r.returncode


def chain():
    model = _settings()["model"]
    log("기다림 — 2025 나라 작업", model)
    while _left(2025, model):
        time.sleep(300)
    _run("overseas.publish")
    _run("overseas.croptiles")
    _run("overseas.croptiles", "--z", "13")
    # 2017 건물 — 같은 모델 · 2025 분위수에 맞춘 합성(작업기가 해 설정을 읽는다)
    _set(year=2017)
    try:
        _run("overseas.runner", "--loop")
    finally:
        _set(year=2025)
    _run("overseas.sprawl")
    log("모두 끝")


if __name__ == "__main__":
    a = sys.argv[1]
    if a == "train":
        print(train())
    elif a == "switch":
        switch(sys.argv[2])
    elif a == "chain":
        chain()
