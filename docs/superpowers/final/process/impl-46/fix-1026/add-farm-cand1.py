# 경작·휴경 카드 '그림 후보'에 10-25 후보 1(남원 2025.08 드론 · AI 분석 · 필지 단위)을 올린다 — 표지는 바꾸지 않는다.
# 사용: python add-farm-cand1.py test|live   (test = landxi_test · 그림 파일은 임시 폴더 / live = 운영 · 먼저 backup/ 에 그 카드 행을 JSON 으로 남김)
import asyncio, sys, os, json, pathlib
mode = sys.argv[1]
ROOT = pathlib.Path(r"E:/Land-XI 플랫폼/01. 디자인"); sys.path.insert(0, str(ROOT / "server")); os.chdir(ROOT / "server")
if mode == "test":
    from landxi_api import config as _cf
    for k in ("PG_DSN", "PG_WORKER_DSN"): os.environ[k] = getattr(_cf, k).rsplit("/", 1)[0] + "/landxi_test"   # 같은 계정 · 같은 비밀번호 · 데이터베이스 이름만 바꿈
    os.environ["LX_DATA_ROOT"] = os.environ.get("TEST_DATA", str(ROOT / "docs/superpowers/final/process/impl-46/fix-1026/test-data"))
from landxi_api import cards as C
from landxi_api.deps import Principal, db
SH = ROOT / "docs/superpowers/final/process/impl-46/nodata-1025/shots"
CID = "card-farm"
async def main():
    sysp = Principal(realm="lx", role="admin", user_id=None, name="system")
    async with db(realm="lx") as conn:
        row = await conn.fetchrow("SELECT swipe, scenes FROM card_info WHERE card_id=$1", CID)
        print("행", bool(row))
        if not row: return
        if mode == "live":
            (ROOT / "docs/superpowers/final/process/impl-46/fix-1026/backup/card-farm-card_info-before.json").write_text(json.dumps({"swipe": C._obj(row["swipe"]), "scenes": C._obj(row["scenes"])}, ensure_ascii=False, indent=1), encoding="utf8")
    try: _c, _m, mine = await C._one(sysp, CID)
    except Exception as e: print("_one 실패", type(e).__name__, e); mine = []
    b = await C._store_scene(sysp, CID, mine, (SH / "farm08-cand1-base.jpg").read_bytes(), "52190", "", False, {"pair": "cand-base"})
    r = await C._store_scene(sysp, CID, mine, (SH / "farm08-cand1-result.jpg").read_bytes(), "52190", "", False, {"pair": "cand-result"})
    async with db(realm="lx") as conn:
        sw = C._obj(await conn.fetchval("SELECT swipe FROM card_info WHERE card_id=$1", CID)) or {}
        cands = [c for c in (sw.get("cands") or []) if c.get("after") != r["src"]]
        cand = {"before": b["src"], "after": r["src"], "labels": ["원본", "AI 결과"], "legend": [["#2E9E5B", "경작"], ["#E8590C", "휴경"]],
                "why": ["남원 2025.08 드론 · 필지 단위"], "keep": True, "source": {"note": "10-25 후보 1 · 8월 드론 영상 AI 분석 · 필지 단위(nodata-1025)"}}
        sw["cands"] = [cand] + cands
        await conn.execute("UPDATE card_info SET swipe=$2, updated_at=now() WHERE card_id=$1", CID, sw)
        await C.audit(conn, sysp, "card.cover.cands", CID, None, {"state": "keep", "added": r["src"]})
    print("cover", (sw.get("after") or "")[-24:], "cands", [(c["after"] or "")[-20:] for c in sw["cands"]])
asyncio.run(main())
