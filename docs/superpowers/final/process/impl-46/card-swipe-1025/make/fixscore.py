import sys, os, asyncio, asyncpg, re, pathlib, json
HERE = pathlib.Path(__file__).resolve().parent; sys.path.insert(0, str(HERE))
from specs import S
SRV = "E:/Land-XI 플랫폼/01. 디자인/server"; sys.path.insert(0, SRV); os.chdir(SRV)
from landxi_api import card_cover_pick as PK
DSN = re.search(r"^PG_ADMIN_DSN=(.*)$", pathlib.Path(SRV + "/.env").read_text(encoding="utf-8"), re.M).group(1).strip()
async def m():
    c = await asyncpg.connect(DSN)
    for cid, v in S.items():
        if cid == "card-marine": continue
        sw = json.loads(await c.fetchval("select swipe::text from card_info where card_id=$1", cid) or "null")
        if not sw or not sw.get("cover"): continue
        sw["source"] = v["source"]
        if "parcels" in v["source"]:
            sw["cands"] = []; sw["newer"] = False; sw["score"] = None
        else:
            sc = await PK.score_frame(c, v["source"], [float(x) for x in str(sw["frame"]).split(",")])
            best = max([x.get("score") or 0 for x in sw.get("cands") or []] or [0])
            sw["score"] = sc; sw["newer"] = bool(sc is not None and best > sc + 5)
        await c.execute("update card_info set swipe=$2::jsonb where card_id=$1", cid, json.dumps(sw, ensure_ascii=False))
        print(cid, sw.get("score"), [x.get("score") for x in sw.get("cands") or []], sw["newer"])
    await c.close()
asyncio.run(m())
