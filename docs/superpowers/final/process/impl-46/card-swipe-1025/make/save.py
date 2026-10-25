"""바깥과 같은 게이트웨이(:8700)의 POST /cards/{id}/cover 로 카드 그림 한 쌍을 만들어 저장 — 서버 함수가 그린다"""
import sys, json, urllib.request, re, pathlib, time
sys.path.insert(0, str(pathlib.Path(__file__).parent))
from specs import S
BASE = "http://127.0.0.1:8700/api/v1"
PW = re.search(r"^DEV_PASSWORD=(.*)$", pathlib.Path("E:/Land-XI 플랫폼/01. 디자인/server/.env").read_text(encoding="utf-8"), re.M).group(1).strip()
def call(path, body, tok=None):
    req = urllib.request.Request(BASE + path, data=json.dumps(body).encode(), headers={"content-type": "application/json", **({"authorization": "Bearer " + tok} if tok else {})})
    try:
        return 200, json.loads(urllib.request.urlopen(req, timeout=300).read())
    except urllib.error.HTTPError as e:
        return e.code, e.read()[:300].decode("utf-8", "replace")
_, j = call("/auth/login", {"realm": "lx", "login": "lxadmin@lx.or.kr", "password": PW}); tok = j["token"]
res = {}
for k in (sys.argv[1:] or list(S)):
    v = S[k]; t0 = time.time()
    body = {"source": v["source"], "bbox": v["bbox"], "save": True, "region": v["region"], "caption": v["caption"], **v.get("opts", {}), **({"labels": v["labels"]} if v.get("labels") else {})}
    st, out = call(f"/cards/{k}/cover", body, tok)
    if st == 200:
        sc = out.get("scene") or {}
        res[k] = {"scene": sc.get("src"), "base": (sc.get("swipe") or {}).get("before"), "labels": (sc.get("swipe") or {}).get("labels"), "legend": (sc.get("swipe") or {}).get("legend"),
                  "source": v["source"], "frame": (out.get("swipe") or {}).get("frame"), "s": round(time.time() - t0, 1)}
    else:
        res[k] = {"error": st, "msg": out}
    print(k, json.dumps(res[k], ensure_ascii=False)[:300])
json.dump(res, open(pathlib.Path(__file__).parent / "saved.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
