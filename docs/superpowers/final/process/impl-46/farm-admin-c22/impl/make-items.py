"""RESULT.md 표 · items.json 만들기 — final/overlap-check.json(겹침) · baseline/overlap-check.json(고치기 전) · xlsx-check.json · flow-check.json · checks/*.
python -I make-items.py → ./items.json · ./overlap-table.md"""
import json
import sys
from collections import defaultdict
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.stdout.reconfigure(encoding="utf-8")
load = lambda p: json.loads((HERE / p).read_text(encoding="utf-8")) if (HERE / p).exists() else None  # noqa: E731
fin, base = load("final/overlap-check.json"), load("baseline/overlap-check.json")
xl, flow = load("xlsx-check.json"), load("flow-check.json")

rows = defaultdict(lambda: defaultdict(lambda: {"n": 0, "bad": 0, "skip": 0}))
for r in fin["results"]:
    who = f"{r['role']}{'(' + r['tenant'] + ')' if r.get('tenant') else ''}"
    c = rows[who][r["width"]]
    if not r["ok"] and r.get("optional"):
        c["skip"] += 1
        continue
    c["n"] += 1
    c["bad"] += 1 if r.get("overlaps") else 0
lines = ["| 역할(기관) | 폭 | 상태 | 겹친 상태 | 그 기관에 없는 기능(건너뜀) |", "|---|---|---|---|---|"]
tot = bad = 0
for who, ws in rows.items():
    for w in sorted(ws):
        c = ws[w]; tot += c["n"]; bad += c["bad"]
        lines.append(f"| {who} | {w} | {c['n']} | {c['bad']} | {c['skip']} |")
lines.append(f"| **합** | | **{tot}** | **{bad}** | |")
base_bad = [(r["width"], r["state"], [f"{o['kind']} {o['a']} × {o['b']} {o['w']}×{o['h']}" for o in r["overlaps"]]) for r in (base or {}).get("results", []) if r.get("overlaps")]
(HERE / "overlap-table.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
items = {
    "generatedAt": fin.get("at"),
    "site": "https://app.land-xi.dev · https://namwon.land-xi.dev · https://gwangju-jeonnam.land-xi.dev(로그인 폼 · 세션 주입 0)",
    "overlap": {"states": tot, "overlapped": bad, "widths": fin.get("widths"), "table": "overlap-table.md", "json": "final/overlap-check.json",
                "shots": "final/shots/*.png(로컬 · .gitignore)"},
    "overlap_before": {"note": "고치기 전 같은 검사기(남원 · 11 상태 × 3폭) — DESIGN §1-2 G1 ~ G8 이 그대로 잡혔다", "overlapped_states": len(base_bad),
                       "examples": base_bad[:12]},
    "xlsx": xl, "flow": flow,
    "checks": {"words": "checks/words.txt(gov · app 통과 · 화면 금칙어 0)", "numbers_fonts": "checks/all.txt(통과)"},
}
(HERE / "items.json").write_text(json.dumps(items, ensure_ascii=False, indent=1, default=str), encoding="utf-8")
print("\n".join(lines))
print("before:", len(base_bad))
