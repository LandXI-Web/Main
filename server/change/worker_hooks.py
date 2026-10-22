"""변화 탐지 작업의 진행 · 멈춤 · 숨 쉬기(워커 쪽) — 어댑터가 작업마다 다시 읽는다(고쳐도 워커 재시작 없음).

작업 해시 job:{작업}(Redis)에 화면이 읽는 값을 적는다(게이트웨이 GET /change/runs/{작업} 가 상태 · 진행률 · 남은 시간으로 바꾼다):
  chg_stage(영상 · 분석 · 폴리곤 · 소유 · 썸네일) · chg_k / chg_K(영상 칸 블록) · chg_frac(0~1) · chg_hb(마지막 숨 · epoch) · chg_error(사람 말 사유)
멈춤: 작업 상태가 취소됨 · 실패(시간초과 포함)면 다음 칸 사이에서 JobStopped 를 던져 GPU 를 바로 놓는다.
전력 조절기(PowerThrottle)는 작업 시작 때 시계 · 쉼 빚을 되돌리고, 한 번에 쉬는 빚을 5초로 묶는다
(10-22 결함: 앞 작업 뒤 2시간 쉰 시간을 '일한 시간'으로 세어 새 작업이 2시간 쉼 — 사전 계산 범위에서는 드러나지 않음).
"""
from __future__ import annotations

import json
import time

STAGE_FRAC = {"prepare": (0.0, 0.03), "imagery": (0.03, 0.8), "infer": (0.03, 0.8), "polygons": (0.8, 0.83), "owner": (0.83, 0.87),
              "thumbs": (0.87, 1.0)}
STAGE_WORD = {"prepare": "준비", "imagery": "영상 받기", "infer": "토지피복 AI 분석", "polygons": "변화 폴리곤 만들기", "owner": "필지 · 소유구분 겹치기",
              "thumbs": "두 해 썸네일 만들기"}


class JobStopped(Exception):
    """작업이 취소됨 · 실패(시간초과)로 바뀌었다 — 계산을 멈추고 GPU 를 놓는다."""


class Control:
    def __init__(self, job_id: str, shard_id: str, *, thr=None, touch=None, emit=None, llm_wanted=None):
        from workers import bus
        self.bus, self.job_id, self.shard_id = bus, job_id, shard_id
        self.thr, self.touch, self.emit, self.llm_wanted = thr, touch, emit, llm_wanted
        self.t_hb = 0.0
        self.t_emit = 0.0
        self.t_state = 0.0
        if thr is not None:
            try:
                thr.reset_clock()
                thr.debt = 0.0
            except Exception:  # noqa: BLE001
                pass
        self.set(chg_stage="prepare", chg_frac=0.0, chg_started=time.time(), chg_hb=time.time(), chg_error="")
        self._beat()

    def _beat(self):
        """숨 실 — 워커 프로세스가 살아 있는 동안 5초마다 chg_hb(소유구분 조회처럼 칸 사이가 긴 단계에서도).
        작업이 끝나거나(chg_stage done · failed) 상태가 바뀌면(취소 · 실패) 저절로 멈춘다. 프로세스가 죽으면 숨도 끊긴다(감시가 시간초과로)."""
        import threading

        def run():
            t0 = time.time()
            while time.time() - t0 < 30 * 60:
                time.sleep(5)
                try:
                    h = self.bus.r().hmget(f"job:{self.job_id}", "state", "chg_stage")
                    st, stage = (h[0] or ""), (h[1] or "")
                    if isinstance(st, bytes):
                        st, stage = st.decode(), stage.decode() if isinstance(stage, bytes) else stage
                    if st not in ("queued", "running") or stage in ("done", "failed"):
                        return
                    self.set(chg_hb=time.time())
                except Exception:  # noqa: BLE001
                    pass

        threading.Thread(target=run, name=f"chg-hb-{self.job_id}", daemon=True).start()

    def set(self, **kw):
        try:
            self.bus.r().hset(f"job:{self.job_id}", mapping={k: (json.dumps(v) if isinstance(v, (dict, list)) else v) for k, v in kw.items()})
        except Exception:  # noqa: BLE001
            pass

    def check(self):
        now = time.time()
        if self.touch:
            self.touch()
        if now - self.t_hb >= 1.0:
            self.t_hb = now
            self.set(chg_hb=now)
        if now - self.t_state >= 1.0:
            self.t_state = now
            st = (self.bus.job(self.job_id) or {}).get("state")
            if st in ("cancelled", "failed"):
                raise JobStopped(st)

    def pause(self):
        self.check()
        while self.llm_wanted and self.llm_wanted():          # XI ChatGEO 그림 · 말 요청이 이 장을 원하면 잠깐 비킨다
            time.sleep(0.5)
            self.check()
        if self.thr is not None:
            try:
                self.thr.debt = min(float(self.thr.debt or 0.0), 5.0)
            except Exception:  # noqa: BLE001
                pass
            self.thr(self.check, "변화 탐지")

    def progress(self, stage: str, i: int, n: int):
        self.check()
        lo, hi = STAGE_FRAC.get(stage, (0.0, 1.0))
        n = max(1, int(n or 1))
        part = (i + (0.5 if stage == "infer" else 0.0)) / n if stage in ("imagery", "infer") else i / n
        frac = round(lo + (hi - lo) * min(1.0, max(0.0, part)), 4)
        if stage in ("imagery", "infer", "owner", "thumbs") and self.thr is not None:
            try:
                self.thr.reset_clock()                            # 영상 받기 · 필지 겹치기 · 썸네일은 GPU 일이 아니다 — 쉼 빚에 넣지 않는다(infer = 그 직전까지가 영상 받기)
            except Exception:  # noqa: BLE001
                pass
        kw = {"chg_stage": stage, "chg_frac": frac}
        if stage in ("imagery", "infer"):
            kw.update(chg_k=min(n, i + (1 if stage == "infer" else 0)), chg_K=n)
        self.set(**kw)
        now = time.time()
        if self.emit and (now - self.t_emit > 1.0 or i >= n):
            self.t_emit = now
            try:
                self.emit(self.job_id, "change.progress", {"job_id": self.job_id, "stage": stage, "i": i, "n": n, "frac": frac})
            except Exception:  # noqa: BLE001
                pass

    def failed(self, e: BaseException):
        """사람 말 사유 — 화면 · 채팅이 그대로 보인다."""
        s = f"{type(e).__name__}: {e}"
        if "out of memory" in s.lower():
            why = "분석 장비 메모리가 모자랐습니다 — 잠시 뒤 다시 시도해 주세요"
        elif "range" in s.lower() and "없음" in s:
            why = "대상지를 찾지 못했습니다"
        elif "imagery" in s.lower() or "tile" in s.lower() or "requests" in s.lower() or "timeout" in s.lower():
            why = "국토지리정보원 영상을 받지 못했습니다 — 영상 서버가 응답하지 않습니다"
        elif "weights" in s.lower() or "load" in s.lower():
            why = "분석 모델을 불러오지 못했습니다"
        else:
            why = "분석 중 오류가 났습니다 — 다시 시도해 주세요"
        self.set(chg_error=why, chg_stage="failed")
        return why
