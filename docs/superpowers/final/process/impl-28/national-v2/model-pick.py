"""구현 28 · 전국-새판 — 기관 영상 분석 · 분석하기 · 공개된 분석서비스가 고르는 모델 사진 찍기(등록 전 · 뒤 비교용).
실행: python model-pick.py before|after   → model-pick-{before|after}.json
서버의 실제 모델 고르기 함수(deploys.choose_model · jobs._pick_model)를 그대로 부른다. 읽기만(GPU 0 · 쓰기 0)."""
import asyncio, json, sys
from pathlib import Path
sys.path.insert(0, r"E:/Land-XI 플랫폼/01. 디자인/server")
from landxi_api import config  # noqa: E402
from landxi_api.deploys import choose_model  # noqa: E402
from landxi_api.jobs import _pick_model  # noqa: E402

GSDS = [None, 0.018, 0.12, 0.25, 0.51]


async def main(tag):
    import asyncpg
    c = await asyncpg.connect(config.PG_ADMIN_DSN)
    await c.set_type_codec("jsonb", encoder=json.dumps, decoder=json.loads, schema="pg_catalog")
    await c.set_type_codec("json", encoder=json.dumps, decoder=json.loads, schema="pg_catalog")
    out = {"deploys": {}, "analyze": {}, "card_models": {}}
    for d in await c.fetch("SELECT id, card_id, card_version_id, model_override FROM deploys WHERE NOT coalesce(test,false) ORDER BY id"):
        out["deploys"][d["id"]] = {str(g): (await choose_model(c, d["model_override"], d["card_id"], d["card_version_id"], g))["model_id"] for g in GSDS}
    for kind in ("ortho", "drone"):
        for g in GSDS[1:]:
            m = await _pick_model(c, kind, g)
            out["analyze"][f"{kind}@{g}"] = m["id"] if m else None
    for r in await c.fetch("SELECT id, model_ids FROM card_versions ORDER BY id"):
        out["card_models"][r["id"]] = list(r["model_ids"] or [])
    st = await c.fetch("SELECT id, status FROM models WHERE id IN ('aerial25/best','trained/job_01M4QKMB4X8F1JHJHD0D7HSR7Q')")
    out["models"] = {r["id"]: r["status"] for r in st}
    await c.close()
    p = Path(__file__).with_name(f"model-pick-{tag}.json")
    p.write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
    print(p.name, len(out["deploys"]), "deploys")


asyncio.run(main(sys.argv[1]))
