import sys, asyncio
from rt import one, pair_sheet
from specs import S
keys = sys.argv[1:] or list(S)
for k in keys:
    v = S[k]
    try:
        asyncio.run(one(k, v["source"], v["bbox"], **v.get("opts", {}))); pair_sheet(k)
    except Exception as e:
        print(k, "ERR", repr(e)[:300])
