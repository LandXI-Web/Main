"""XI ChatGEO 시험 질문마다: 그동안 두 번째 장(GPU1)이 전국 칩 묶음을 돌렸나(비킴 확인) · 응답 시간. python chat_yield.py 'FROM' 'TO'"""
import datetime as dt, json, os, re, sys
HERE = os.path.dirname(os.path.abspath(__file__))
a, b = (dt.datetime.fromisoformat(x).timestamp() for x in sys.argv[1:3])
lines = []
for line in open(os.path.join(HERE, "worker-lines.log"), encoding="utf-8", errors="ignore"):
    m = re.match(r"^(\d{4}-\d\d-\d\d) (\d\d:\d\d:\d\d) \[a6000-1\] 전국 묶음 시간", line)
    if m:
        lines.append(dt.datetime.fromisoformat(m.group(1) + " " + m.group(2)).timestamp())
out = []
for l in open(os.path.join(HERE, "chat-probe.jsonl"), encoding="utf-8"):
    j = json.loads(l)
    if not (a <= j["at"] <= b) or j.get("first_token_s") is None:
        continue
    t0, t1 = j["at"], j["at"] + j["total_s"]
    n_in = sum(1 for t in lines if t0 + 1 <= t <= t1)          # 질문 1초 뒤부터 답 끝까지 GPU1 칩 묶음 수
    n_before = sum(1 for t in lines if t0 - 10 <= t < t0)
    out.append({"at": dt.datetime.fromtimestamp(t0).strftime("%H:%M:%S"), "first_token_s": j["first_token_s"], "total_s": j["total_s"],
                "gpu1_batches_10s_before": n_before, "gpu1_batches_during": n_in})
sys.stdout.reconfigure(encoding="utf-8")
print(json.dumps(out, ensure_ascii=False, indent=0))
