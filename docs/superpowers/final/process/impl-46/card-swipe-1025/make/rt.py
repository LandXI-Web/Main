"""오프라인 시험 — 서버 card_cover.render 를 그대로 불러 그림 두 장(미리보기 시트)"""
import sys, os, asyncio, asyncpg, re, pathlib, json
SRV = "E:/Land-XI 플랫폼/01. 디자인/server"
sys.path.insert(0, SRV); os.chdir(SRV)
from landxi_api import card_cover as CC
from pyproj import Transformer
DSN = re.search(r"^PG_ADMIN_DSN=(.*)$", pathlib.Path(SRV + "/.env").read_text(encoding="utf-8"), re.M).group(1).strip()
OUT = pathlib.Path(sys.argv[0]).resolve().parent / "out"; OUT.mkdir(exist_ok=True)
def bb(cx, cy, w, crs=5186):
    t = Transformer.from_crs(crs, 4326, always_xy=True).transform
    h = w * 0.75
    (a, b), (c, d) = t(cx - w/2, cy - h/2), t(cx + w/2, cy + h/2)
    return [a, b, c, d]
async def one(name, source, bbox, **opts):
    c = await asyncpg.connect(DSN)
    try:
        o = await CC.render(c, source, bbox, opts)
    finally:
        await c.close()
    (OUT / f"{name}-a.jpg").write_bytes(o["base"]); (OUT / f"{name}-b.jpg").write_bytes(o["result"])
    print(name, o["labels"], o["legend"], o["n"], o["people"], o["frame"])
    return o
def pair_sheet(name):
    from PIL import Image
    a, b = Image.open(OUT / f"{name}-a.jpg"), Image.open(OUT / f"{name}-b.jpg")
    s = Image.new("RGB", (1200, 450)); s.paste(a.resize((600, 450)), (0, 0)); s.paste(b.resize((600, 450)), (600, 0)); s.save(OUT / f"{name}-ab.jpg", quality=85)
if __name__ == "__main__":
    spec = json.loads(sys.argv[1])
    for k, v in spec.items():
        asyncio.run(one(k, v["source"], v["bbox"], **v.get("opts", {}))); pair_sheet(k)
