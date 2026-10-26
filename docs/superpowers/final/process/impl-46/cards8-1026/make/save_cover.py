"""고른 그림 한 쌍을 카드 그림으로 — 바깥과 같은 게이트웨이 API: 장면 올리기(원본 · 결과) → PUT swipe(밀어 보기 짝). 바꾸기 전 그림은 카드 후보 첫 줄로 남는다(되돌리기).
  python save_cover.py PLAN.json"""
import sys, json
from pathlib import Path
sys.path.insert(0, r"E:\Land-XI 플랫폼\01. 디자인\server"); sys.stdout.reconfigure(encoding="utf-8")
from landxi_api import config
import httpx
B = f"http://127.0.0.1:{config.API_PORT}/api/v1"
t = httpx.post(B + "/auth/login", json={"realm": "lx", "login": "lxadmin@lx.or.kr", "password": config.DEV_PASSWORD}, timeout=30).json()
H = {"Authorization": "Bearer " + (t.get("token") or t.get("access_token"))}
out = {}
for it in json.load(open(sys.argv[1], encoding="utf-8")):
    cid = it["card"]; srcs = []
    for f in (it["before"], it["after"]):
        r = httpx.post(f"{B}/cards/{cid}/scene", headers=H, files={"file": (Path(f).name, open(f, "rb"), "image/jpeg")},
                       data={"region": it.get("region", ""), "caption": it.get("caption", ""), "use": "0"}, timeout=120)
        r.raise_for_status()
        import hashlib
        from landxi_api.cards import _normalize_scene      # 서버와 같은 정규화 → 같은 이름(scene-해시12)
        nm = f"scene-{hashlib.sha256(_normalize_scene(open(f, 'rb').read())).hexdigest()[:12]}.jpg"
        assert (config.DATA_ROOT / "cards" / cid / nm).exists(), nm
        srcs.append(f"/api/v1/cards/files/{cid}/{nm}")
    body = {"swipe": {"before": srcs[0], "after": srcs[1], "labels": it["labels"], "legend": it["legend"]}}
    r = httpx.put(f"{B}/cards/{cid}", headers=H, json=body, timeout=120)
    out[cid] = {"status": r.status_code, "before": srcs[0], "after": srcs[1], "msg": None if r.status_code < 300 else r.text[:300]}
    print(cid, out[cid], flush=True)
json.dump(out, open(Path(sys.argv[1]).with_suffix(".saved.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
