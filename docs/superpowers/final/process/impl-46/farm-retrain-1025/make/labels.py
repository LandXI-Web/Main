import json,glob,os
def load_labels(area):
    """sample json(no → pnu) + lab txt(no → code) → {pnu: code}. 같은 영역의 추가 묶음(s{area}b.json · lab{area}b.txt …)도 합친다."""
    out={}
    for tag in ("","b","c","d"):
        sj=f"s{area}{tag}.json"; lt=f"lab{area}{tag}.txt"
        if not (os.path.exists(sj) and os.path.exists(lt)): continue
        items={i["no"]:i for i in json.load(open(sj,encoding="utf-8"))}
        for l in open(lt):
            if l.strip():
                n,c=l.split(); out[items[int(n)]["pnu"]]=c
    return out
