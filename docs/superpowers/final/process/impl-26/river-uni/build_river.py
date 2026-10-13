"""하천 범위 다시 만들기 — 시군구를 N 묶음으로 나눠 national.targets --asset river --force 를 동시에(CPU만)."""
import subprocess, sys, os
from pathlib import Path
SRV = Path(r"E:/Land-XI 플랫폼/01. 디자인/server")
sys.path.insert(0, str(SRV))
from national.common import pg, settings
from national.targets import order_regions
N = int(sys.argv[1]) if len(sys.argv) > 1 else 4
with pg() as c:
    regs = order_regions(settings(c))
codes = [r["sgg_cd"] for r in regs]
LOG = Path(r"E:/Land-XI 플랫폼/02. 데이터/national")
env = dict(os.environ, PYTHONIOENCODING="utf-8")
ps = []
for k in range(N):
    args = [sys.executable, "-m", "national.targets", "--asset", "river", "--force"]
    for cd in codes[k::N]:
        args += ["--sgg", cd]
    ps.append(subprocess.Popen(args, cwd=SRV, env=env, stdout=open(LOG / f"river-uni-build-{k}.log", "w", encoding="utf-8"), stderr=subprocess.STDOUT))
print("시군구", len(codes), "묶음", N, flush=True)
for p in ps: p.wait()
print("끝", [p.returncode for p in ps])
