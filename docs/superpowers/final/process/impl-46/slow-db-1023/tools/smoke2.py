# 새 코드를 이 프로세스 안에서만(ASGI · 기동 작업 없음 · 듣는 포트 없음) 불러 핵심 GET 을 확인한다 — 운영 게이트웨이는 건드리지 않는다.
import asyncio, os, sys, time
os.environ["LX_PG_POOL_MAX"] = "4"
sys.path.insert(0, r"E:\Land-XI 플랫폼\01. 디자인\server")
import httpx
from landxi_api import config
from landxi_api.main import app
from landxi_api import deps
PW = config.get("DEV_PASSWORD")
GOV = ["/me", "/survey/stats?by=emd", "/survey/stats?by=rule", "/regions?limit=400", "/regions?geom=1", "/regions/52190/results", "/summary?region=52190", "/catalog/layers?stage=domestic&build=tenant&locale=ko", "/ximap/boot"]
APP = ["/me", "/summary", "/change/ranges", "/cards/deck", "/ximap/board", "/national/progress", "/xdash/jimok?sgg=52190"]
async def main():
    tr = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=tr, base_url="http://t/api/v1", timeout=120) as c:
        res = []
        for who, body, paths in (("gov", {"realm": "tenant", "tenant_id": "namwon", "login": "lxadmin@lx.or.kr", "password": PW}, GOV),
                                 ("app", {"realm": "lx", "login": "test@lx.or.kr", "password": PW}, APP)):
            r = await c.post("/auth/login", json=body); assert r.status_code == 200, (who, r.status_code, r.text[:200])
            H = {"authorization": "Bearer " + r.json()["token"]}
            for p in paths:
                t = time.time(); x = await c.get(p, headers=H); res.append((who, p, x.status_code, round((time.time() - t) * 1000)))
            if who == "app":
                rs = (await c.get("/change/ranges", headers=H)).json().get("items") or []
                if rs:
                    for p in (f"/change/ranges/{rs[0]['id']}", f"/change/ranges/{rs[0]['id']}/imagery"):
                        t = time.time(); x = await c.get(p, headers=H); res.append((who, p.replace(rs[0]['id'], ':id'), x.status_code, round((time.time() - t) * 1000)))
        for r in res: print(*r)
    await deps.close()
asyncio.run(main())
