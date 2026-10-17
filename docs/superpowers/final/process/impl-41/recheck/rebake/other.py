"""다른 직원 결과 — 결과 파일마다 서버 API /jobs/{id} 로 끝난 작업인지(시험 아님) 확인 → lx_light 판 2 아닌 것만 todo."""
import httpx, json, sys, os, collections
sys.path.insert(0, r"E:/Land-XI 플랫폼/01. 디자인/server")
from pmtiles.reader import Reader
S = r"C:/Users/User/AppData/Local/Temp/claude/E--Land-XI----/8755e9e1-c9d4-4ccc-ae31-8eb0e35a24df/scratchpad/rebake/"
pw = [l.split('=', 1)[1].strip() for l in open(r'E:/Land-XI 플랫폼/01. 디자인/server/.env', encoding='utf-8') if l.startswith('DEV_PASSWORD=')][0]
B = "http://127.0.0.1:8700/api/v1"
tok = httpx.post(B + "/auth/login", json={"login": "lxadmin@lx.or.kr", "password": pw, "site": "admin"}, timeout=30).json()["token"]
H = {"authorization": "Bearer " + tok}
files = json.load(open(S + "other-files.json", encoding="utf-8"))
todo, cnt = [], collections.Counter()
with httpx.Client(headers=H, timeout=30) as cl:
    for f in files:
        jid = os.path.basename(f)[:-8]
        r = cl.get(B + f"/jobs/{jid}")
        if r.status_code != 200:
            cnt[f"api{r.status_code}"] += 1; continue
        j = r.json()
        if j.get("state") != "done" or j.get("test"):
            cnt[f"state:{j.get('state')}/test:{bool(j.get('test'))}"] += 1; continue
        with open(f, "rb") as fh:
            def get(o, l): fh.seek(o); return fh.read(l)
            try:
                rd = Reader(get); m = rd.metadata(); h = rd.header()
            except Exception:
                cnt["bad"] += 1; continue
        from pmtiles.tile import TileType
        if h["tile_type"] != TileType.MVT:
            cnt["not-mvt"] += 1; continue
        mk = m.get("lx_light")
        v = mk.get("v") if isinstance(mk, dict) else None
        cnt[f"v{v}"] += 1
        if v != 2:
            todo.append({"path": f, "job": jid, "kind": j.get("kind"), "by": j.get("submitted_by")})
print(dict(cnt), len(todo))
print(collections.Counter(t["by"] for t in todo).most_common(10))
json.dump(todo, open(S + "other-todo.json", "w", encoding="utf-8"), ensure_ascii=False)
