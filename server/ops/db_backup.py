"""매일 DB 백업(오픈 전 필수 6-2 · 원칙 300) — PostGIS 컨테이너 안 pg_dump -Fc → E: 02. 데이터/_backup/db/.

    python server/ops/db_backup.py                 # 백업 → 목록 읽기 시험(pg_restore -l) → 보관 정리(매일 7 · 매주 4)
    python server/ops/db_backup.py --restore-test  # + 임시 DB(landxi_restore_check)에 실제로 되살려 표 · 행 수를 맞춰 본 뒤 지운다
    python server/ops/db_backup.py --status        # 마지막 결과만

- 덤프는 컨테이너 안에서 만들고 표준 출력으로 받아 E: 에 바로 쓴다(C: · 컨테이너 디스크에 임시 파일 0). 비밀번호는 쓰지 않는다
  (컨테이너 안 로컬 접속 · postgres). 역할(landxi_app · landxi_worker 등)은 globals-*.sql 로 따로 남긴다(RLS 가 역할에 기대므로).
- 결과는 status.json(마지막 성공 · 실패 · 크기 · 걸린 시간) + backup.log 한 줄. 게이트웨이 경보(ops.evaluate_alerts_once)가
  status.json 을 읽어 'DB 백업 실패' · 'DB 백업 30시간 넘음'을 C: 여유 경보와 같은 길(ops_alerts · 관리자 경보 화면)로 띄운다.
- 매주(월요일이 시작인 ISO 주) 첫 성공본을 weekly/ 에 하드링크로 남긴다(같은 디스크 · 공간 추가 0).
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import re
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(os.environ.get("LX_BACKUP_DIR") or "E:/Land-XI 플랫폼/02. 데이터/_backup/db")
DAILY, WEEKLY = ROOT / "daily", ROOT / "weekly"
STATUS, LOG = ROOT / "status.json", ROOT / "backup.log"
CONTAINER = os.environ.get("LX_PG_CONTAINER") or "landxi-postgis"
DB = os.environ.get("LX_PG_DB") or "landxi"
KEEP_DAILY, KEEP_WEEKLY = 7, 4
NOWIN = getattr(subprocess, "CREATE_NO_WINDOW", 0)
KST = dt.timezone(dt.timedelta(hours=9))


def now() -> dt.datetime:
    return dt.datetime.now(KST)


def log(line: str) -> None:
    ROOT.mkdir(parents=True, exist_ok=True)
    with open(LOG, "a", encoding="utf-8") as f:
        f.write(f"{now().isoformat(timespec='seconds')} {line}\n")
    print(line, flush=True)


def read_status() -> dict:
    try:
        return json.loads(STATUS.read_text(encoding="utf-8"))
    except Exception:  # noqa: BLE001
        return {}


def write_status(st: dict) -> None:
    tmp = STATUS.with_suffix(".tmp")
    tmp.write_text(json.dumps(st, ensure_ascii=False, indent=1), encoding="utf-8")
    os.replace(tmp, STATUS)


def dexec(args: list[str], *, stdin=None, stdout=None, timeout: float = 7200) -> subprocess.CompletedProcess:
    cmd = ["docker", "exec", *(["-i"] if stdin is not None else []), CONTAINER, *args]
    return subprocess.run(cmd, stdin=stdin if stdin is not None else subprocess.DEVNULL, stdout=stdout if stdout is not None else subprocess.PIPE, stderr=subprocess.PIPE,
                          timeout=timeout, creationflags=NOWIN)


def psql(sql: str, db: str = DB) -> str:
    r = dexec(["psql", "-U", "postgres", "-d", db, "-v", "ON_ERROR_STOP=1", "-tAc", sql], timeout=600)
    if r.returncode:
        raise RuntimeError(f"psql: {r.stderr.decode('utf-8', 'replace')[:300]}")
    return r.stdout.decode("utf-8", "replace").strip()


def dump(dest: Path) -> None:
    part = dest.with_suffix(".part")
    with open(part, "wb") as f:
        r = dexec(["pg_dump", "-U", "postgres", "-d", DB, "-Fc", "-Z", "6"], stdout=f, timeout=4 * 3600)
    if r.returncode:
        part.unlink(missing_ok=True)
        raise RuntimeError(f"pg_dump 종료 {r.returncode}: {r.stderr.decode('utf-8', 'replace')[:400]}")
    os.replace(part, dest)
    g = dexec(["pg_dumpall", "-U", "postgres", "--globals-only", "--no-role-passwords"], timeout=300)
    if g.returncode == 0:
        (dest.parent / dest.name.replace(".dump", "-globals.sql")).write_bytes(g.stdout)


def toc_check(path: Path) -> dict:
    """pg_restore -l — 덤프의 목차를 끝까지 읽을 수 있는지 · 표 데이터 항목 수."""
    with open(path, "rb") as f:
        r = dexec(["pg_restore", "-l"], stdin=f, timeout=3600)
    if r.returncode:
        raise RuntimeError(f"pg_restore -l 실패: {r.stderr.decode('utf-8', 'replace')[:300]}")
    lines = [x for x in r.stdout.decode("utf-8", "replace").splitlines() if x and not x.startswith(";")]
    n_data = sum(1 for x in lines if " TABLE DATA " in x)
    n_table = sum(1 for x in lines if re.search(r"\d+ TABLE \S+ ", x))
    if n_data == 0:
        raise RuntimeError("pg_restore -l: 표 데이터 항목 0")
    return {"toc_entries": len(lines), "tables": n_table, "table_data": n_data}


def restore_test(path: Path) -> dict:
    """임시 DB 에 실제로 되살려 본다 — 표 수 · 큰 표 몇 개의 행 수를 원본과 맞춘다. 끝나면 임시 DB 를 지운다."""
    tmp = "landxi_restore_check"
    t0 = time.time()
    psql(f"DROP DATABASE IF EXISTS {tmp}", "postgres")
    psql(f"CREATE DATABASE {tmp}", "postgres")
    try:
        with open(path, "rb") as f:
            r = dexec(["pg_restore", "-U", "postgres", "-d", tmp, "--no-owner", "--exit-on-error"], stdin=f, timeout=6 * 3600)
        err = r.stderr.decode("utf-8", "replace")
        if r.returncode:
            raise RuntimeError(f"pg_restore 실패: {err[:400]}")
        q_tables = "SELECT count(*) FROM pg_tables WHERE schemaname NOT IN ('pg_catalog','information_schema')"
        src_t, dst_t = int(psql(q_tables)), int(psql(q_tables, tmp))
        checks = {}
        for t in ("public.jobs", "public.sessions", "public.audit_log", "public.deploys", "public.detections"):
            try:
                a = int(psql(f"SELECT count(*) FROM {t}"))
                b = int(psql(f"SELECT count(*) FROM {t}", tmp))
                checks[t] = {"live": a, "restored": b}
            except Exception as e:  # noqa: BLE001
                checks[t] = {"error": str(e)[:120]}
        ok = src_t == dst_t
        return {"ok": ok, "tables_live": src_t, "tables_restored": dst_t, "rows": checks, "seconds": round(time.time() - t0)}
    finally:
        try:
            psql(f"DROP DATABASE IF EXISTS {tmp}", "postgres")
        except Exception as e:  # noqa: BLE001
            log(f"임시 DB 지우기 실패 {e!r}")


def prune() -> dict:
    ds = sorted(DAILY.glob("landxi-*.dump"))
    gone = []
    for p in ds[:-KEEP_DAILY]:
        for q in (p, p.parent / p.name.replace(".dump", "-globals.sql")):
            if q.exists():
                q.unlink()
        gone.append(p.name)
    ws = sorted(WEEKLY.glob("landxi-*.dump"))
    for p in ws[:-KEEP_WEEKLY]:
        p.unlink()
        gone.append("weekly/" + p.name)
    return {"removed": gone, "daily": len(list(DAILY.glob("landxi-*.dump"))), "weekly": len(list(WEEKLY.glob("landxi-*.dump")))}


def weekly_link(p: Path) -> str | None:
    y, w, _ = now().isocalendar()
    name = f"landxi-{y}-W{w:02d}.dump"
    dst = WEEKLY / name
    if dst.exists():
        return None
    WEEKLY.mkdir(parents=True, exist_ok=True)
    try:
        os.link(p, dst)
    except OSError:
        import shutil
        shutil.copy2(p, dst)
    return name


def run(restore: bool) -> int:
    DAILY.mkdir(parents=True, exist_ok=True)
    st = read_status()
    t0 = time.time()
    stamp = now().strftime("%Y%m%d-%H%M")
    dest = DAILY / f"landxi-{stamp}.dump"
    st.update(last_run_at=now().isoformat(timespec="seconds"), running=True)
    write_status(st)
    try:
        dump(dest)
        size = dest.stat().st_size
        t_dump = round(time.time() - t0)
        toc = toc_check(dest)
        wk = weekly_link(dest)
        rt = restore_test(dest) if restore else None
        if rt is not None and not rt["ok"]:
            raise RuntimeError(f"되살리기 시험 불일치 {rt}")
        pr = prune()
        st.update(running=False, ok=True, last_ok_at=now().isoformat(timespec="seconds"), last_error=None,
                  file=str(dest), size_mb=round(size / 2**20, 1), dump_s=t_dump, total_s=round(time.time() - t0), toc=toc,
                  weekly_added=wk, kept=pr, **({"restore_test": {**rt, "at": now().isoformat(timespec="seconds")}} if rt else {}))
        write_status(st)
        log(f"OK {dest.name} {st['size_mb']} MB · 덤프 {t_dump}s · 목차 {toc['toc_entries']} · 표 데이터 {toc['table_data']}"
            + (f" · 매주 {wk}" if wk else "") + (f" · 되살리기 시험 {rt['seconds']}s 표 {rt['tables_restored']}/{rt['tables_live']}" if rt else "")
            + f" · 보관 매일 {pr['daily']} 매주 {pr['weekly']}")
        return 0
    except Exception as e:  # noqa: BLE001
        st.update(running=False, ok=False, last_error=str(e)[:500], last_fail_at=now().isoformat(timespec="seconds"))
        write_status(st)
        log(f"FAIL {e!r}"[:600])
        return 1


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--restore-test", action="store_true")
    ap.add_argument("--status", action="store_true")
    a = ap.parse_args()
    if a.status:
        print(json.dumps(read_status(), ensure_ascii=False, indent=1))
        return 0
    restore = a.restore_test or os.environ.get("LX_BACKUP_RESTORE_TEST") == "1"
    return run(restore)


if __name__ == "__main__":
    sys.exit(main())
