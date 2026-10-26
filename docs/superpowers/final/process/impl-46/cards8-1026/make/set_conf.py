"""카드 판 modules.conf 적기 — python set_conf.py test|main [--go]  (백업 → 쓰기 · DSN 먼저 출력)"""
import sys, os, json, re, datetime as dt
sys.path.insert(0, r"E:\Land-XI 플랫폼\01. 디자인\server"); sys.stdout.reconfigure(encoding="utf-8")
from landxi_api import config
import psycopg
WANT = {"card-d8fc01": 0.8, "card-6f7050": 0.8, "card-4d8d6f": 0.8, "card-f31e5f": 0.6}
which = sys.argv[1]
d = config.PG_ADMIN_DSN if which == "main" else config.PG_ADMIN_DSN.rsplit("/", 1)[0] + "/" + (config.get("PG_TEST_DB") or "landxi_test")
print("DSN:", re.sub(r"://([^:@/]+):[^@]*@", r"://\1:***@", d))
BK = config.DATA_ROOT / "_backup" / "cards8-1026"; BK.mkdir(parents=True, exist_ok=True)
with psycopg.connect(d) as c:
    rows = c.execute("SELECT id, card_id, modules FROM card_versions WHERE card_id = ANY(%s)", (list(WANT),)).fetchall()
    print([(r[0], (r[2] or {}).get("conf")) for r in rows])
    if "--go" not in sys.argv:
        sys.exit()
    (BK / f"card_versions.{which}.{dt.datetime.now():%H%M%S}.json").write_text(json.dumps(rows, ensure_ascii=False, default=str), encoding="utf-8")
    for vid, cid, mods in rows:
        c.execute("UPDATE card_versions SET modules = coalesce(modules,'{}'::jsonb) || jsonb_build_object('conf', %s::float) WHERE id=%s", (WANT[cid], vid))
    c.commit()
    print("쓰기 끝", [(r[0], r[1]) for r in c.execute("SELECT id, modules->>'conf' FROM card_versions WHERE card_id = ANY(%s)", (list(WANT),)).fetchall()])
