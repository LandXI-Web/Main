"""구현 33 · 받은 한글 문서(.hwpx) 점검 — 형식(공용 점검 hwpx.check) + 화면 숫자 = 문서 숫자(run.json 의 화면 값) + 내부 글자 0.
python docs/superpowers/final/process/impl-33/hwpx-all/check.py   → check.txt"""
import json
import os
import re
import sys
import zipfile

D = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.abspath(os.path.join(D, "../../../../../../server")))
from landxi_api import hwpx as HX  # noqa: E402

GOT = os.path.join(D, "got")
run = json.load(open(os.path.join(D, "run.json"), encoding="utf8"))
BAD = re.compile(r"(/api/|\.json\b|\.py\b|run_[0-9a-z]|job_|task_id|[A-Z]:\\|\bGPU\b|\b\d+\s?ms\b|docx|Word)")
out, nbad = [], 0
for key in sorted(run["got"]):
    g = run["got"][key]
    blob = open(os.path.join(GOT, g["file"]), "rb").read()
    z = zipfile.ZipFile(os.path.join(GOT, g["file"]))
    pics = [n for n in z.namelist() if n.startswith("BinData/")]
    fmt = HX.check(blob)
    txt = HX.text_of(blob)
    flat = re.sub(r"\s+", " ", txt)
    checks = []
    if key == "A":
        s = g["screen"]
        checks.append(("합계(화면 data-v)", f"{int(s['total']):,}", f"{int(s['total']):,}" in txt))
        for r in s["rows"]:
            if r and r[0] and not r[0].startswith("그 밖"):   # 화면은 10줄 + '그 밖 n곳'로 접고, 문서는 읍면동 전부(합계 줄로 같은지 본다)
                checks.append((f"읍면동 줄 {r[0]}", " · ".join(r), all(c in txt for c in r if c)))
    if key == "B":
        for lb, v in g["json"]["cites"][:6]:
            vs = f"{v:,}" if isinstance(v, int) else str(v)
            checks.append((f"인용 {lb}", vs, vs in txt))
    if key == "C":
        for p in g["paras"]:
            checks.append(("화면 문단(띄어쓰기 빼고)", p[:40] + "…", re.sub(r"\s+", "", p) in re.sub(r"\s+", "", flat)))
    if key == "D":
        nums = re.findall(r"결과\s*([\d,]+)\s*건", g["answer"])
        for n in nums[:1]:
            checks.append(("답 결과 수", n + "건", f"{n}건" in txt))
    if key == "F":
        for k in g["screen"]["kpis"]:
            k2 = k.replace("km²", "㎢")
            checks.append(("큰 숫자", k2, k2 in txt))
    checks.append(("내부 글자 0(경로 · 작업 id · docx · Word)", "", not BAD.search(txt)))
    checks.append(("파일 이름 .hwpx", g["name"], g["name"].endswith(".hwpx")))
    ok = not fmt and all(c[2] for c in checks)
    nbad += 0 if ok else 1
    out.append(f"■ {key} {g['where']} → {g['name']} ({g['bytes']:,} bytes)")
    out.append(f"  형식: {'정상' if not fmt else fmt} · mimetype 첫 항목 · 압축 없음 · 필수 파일 · XML · 그림 {len(pics)}장 PNG · 머리 모양 참조")
    for c in checks:
        out.append(f"  {'같음' if c[2] else '다름'} · {c[0]}{': ' + c[1] if c[1] else ''}")
    m = BAD.search(txt)
    if m:
        out.append(f"  내부 글자: {m.group(0)}")
out.append(f"결과: {'통과' if not nbad else f'{nbad}개 문서 다름'}")
open(os.path.join(D, "check.txt"), "w", encoding="utf8").write("\n".join(out) + "\n")
sys.stdout.reconfigure(encoding="utf-8")
print("\n".join(out))
sys.exit(1 if nbad else 0)
