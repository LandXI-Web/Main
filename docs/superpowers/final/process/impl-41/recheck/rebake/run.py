"""다시 굽기(CPU) — todo.json 의 파일을 pmtiles_light.lighten 으로. 되돌림 사본은 backup 폴더. 로그 한 줄 = 파일 하나."""
import json, sys, time, os
sys.path.insert(0, r"E:/Land-XI 플랫폼/01. 디자인/server")
from pathlib import Path
from multiprocessing import Pool

BK = Path(sys.argv[3])

def low():
    try:
        import psutil
        psutil.Process().nice(psutil.BELOW_NORMAL_PRIORITY_CLASS)
    except Exception:
        pass

def one(p):
    from pipelines.pmtiles_light import lighten
    try:
        if time.time() - Path(p).stat().st_mtime < 600:
            return {"path": p, "skip": "recent"}
        return lighten(Path(p), backup_dir=BK)
    except Exception as e:  # noqa: BLE001
        return {"path": p, "error": repr(e)[:300]}

if __name__ == "__main__":
    todo = [x["path"] for x in json.load(open(sys.argv[1], encoding="utf-8"))]
    n = int(sys.argv[4]) if len(sys.argv) > 4 else 6
    t0 = time.time()
    with Pool(n, initializer=low) as pool, open(sys.argv[2], "a", encoding="utf-8") as log:
        for i, r in enumerate(pool.imap_unordered(one, todo, chunksize=4), 1):
            log.write(json.dumps(r, ensure_ascii=False) + "\n"); log.flush()
            if i % 200 == 0:
                print(i, len(todo), round(time.time() - t0), flush=True)
    print("done", len(todo), round(time.time() - t0), flush=True)
