"""카드 그림 자동 후보(card_cover_pick.candidates · 규칙 기반) → 후보마다 원본 · 결과 그림 + 한 장 비교표(눈 확인용).
  python cands.py TAG SOURCE_JSON OUTDIR [N] [--classes a,b] [--width M]"""
import sys, os, json, asyncio
from pathlib import Path
SERVER = Path(r"E:\Land-XI 플랫폼\01. 디자인\server"); sys.path.insert(0, str(SERVER)); os.chdir(SERVER); sys.stdout.reconfigure(encoding="utf-8")
from landxi_api import config, card_cover as CC, card_cover_pick as PK
import asyncpg
from PIL import Image, ImageDraw
tag, src, out = sys.argv[1], json.loads(sys.argv[2]), Path(sys.argv[3]); out.mkdir(parents=True, exist_ok=True)
n = int(sys.argv[4]) if len(sys.argv) > 4 and sys.argv[4].isdigit() else 6
cls = sys.argv[sys.argv.index("--classes") + 1].split(",") if "--classes" in sys.argv else None
if "--width" in sys.argv:                       # 틀 너비(m) 고정 — 산사태처럼 기준(태양광 · 길)이 함께 보여야 같은 곳임을 알 때
    _w = float(sys.argv[sys.argv.index("--width") + 1]); PK._frame_w = lambda *a, **k: _w
async def main():
    c = await asyncpg.connect(config.PG_DSN)
    async with c.transaction(readonly=True):
        await c.execute("SELECT set_config('app.realm','lx',true), set_config('app.tenant_id','',true), set_config('app.user_id','',true)")
        if cls:
            orig = PK._objects
            async def only(conn, s):
                m = await orig(conn, s); m["objs"] = [o for o in m["objs"] if o[1] in cls]; m["opts"] = {"classes": cls}; return m
            PK._objects = only
        cs = await PK.candidates(c, src, n)
        rec = []
        for i, k in enumerate(cs):
            r = await CC.render(c, src, k["bbox"], k["opts"])
            (out / f"{tag}-{i}-a.jpg").write_bytes(r["base"]); (out / f"{tag}-{i}-b.jpg").write_bytes(r["result"])
            rec.append({"i": i, "bbox": k["bbox"], "score": k["score"], "why": k["why"], "opts": k["opts"], "labels": r["labels"], "legend": r["legend"], "frame": r["frame"], "n": r["n"]})
    await c.close()
    json.dump({"source": src, "cands": rec}, open(out / f"{tag}.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    sh = Image.new("RGB", (1200, 450 * max(1, len(rec))), "white"); d = ImageDraw.Draw(sh)
    for i, _ in enumerate(rec):
        sh.paste(Image.open(out / f"{tag}-{i}-a.jpg").resize((600, 450)), (0, i * 450)); sh.paste(Image.open(out / f"{tag}-{i}-b.jpg").resize((600, 450)), (600, i * 450))
        d.rectangle([0, i * 450, 70, i * 450 + 22], fill=(0, 0, 0)); d.text((5, i * 450 + 5), f"#{i} {rec[i]['score']}", fill=(255, 255, 0))
    sh.save(out / f"{tag}-sheet.jpg", quality=80)
    print(json.dumps([(x["i"], x["score"], x["why"], x["n"]) for x in rec], ensure_ascii=False))
asyncio.run(main())
