"""필지 눈 판정 → 설정별 맞음 · 틀림(필지 단위). 판정 = 그림만 보고(설정 · 예측 숨김) '풀 · 곡류 작물이 덮은 필지'면 1.
설정의 필지 판정 = 그 설정 결과가 필지 넓이의 SHARE 이상을 덮으면 1(drone_eval 의 필지 묶기와 같은 규칙).
  python parcel_score.py PKL ORDER.json JUDGE.json OUT.json"""
import sys, json, pickle
pk = pickle.load(open(sys.argv[1], "rb")); order = json.load(open(sys.argv[2]))["order"]; judge = json.load(open(sys.argv[3]))
out = {"n": len(order), "truth_pos": sum(judge), "runs": {}}
for t, g in pk["geo"].items():
    pl = g["plab"]; tp = fp = fn = tn = 0
    for pnu, y in zip(order, judge):
        p = 1 if pnu in pl else 0
        tp += p and y; fp += p and not y; fn += (not p) and y; tn += (not p) and (not y)
    out["runs"][t] = {"tp": tp, "fp": fp, "fn": fn, "tn": tn, "precision": round(tp / max(1, tp + fp), 3), "recall": round(tp / max(1, tp + fn), 3),
                      "acc": round((tp + tn) / len(order), 3)}
json.dump(out, open(sys.argv[4], "w"), indent=1); print(json.dumps(out))
