"""20명 동시 접속 부하 시험 — 바깥 주소(app/namwon.land-xi.dev)로만. 읽기 요청만(저장 · 제출 0).
사용: python load.py rec0.json out.json [--stages 1:30,5:45,10:60,20:240] [--chat 6]
"""
import asyncio, json, random, re, statistics, sys, time, os
from urllib.parse import urlparse
import httpx

REC, OUT = sys.argv[1], sys.argv[2]
args = sys.argv[3:]
STAGES = [(1, 30), (5, 45), (10, 60), (20, 240)]
CHAT_N = 6
for i, a in enumerate(args):
    if a == "--stages": STAGES = [tuple(int(x) for x in s.split(":")) for s in args[i + 1].split(",")]
    if a == "--chat": CHAT_N = int(args[i + 1])
ENV = open("E:/Land-XI 플랫폼/01. 디자인/server/.env", encoding="utf-8").read()
PW = os.environ.get("LX_PW") or re.search(r"^DEV_PASSWORD=(.*?)\s*$", ENV, re.M).group(1)
APP, ORG = "https://app.land-xi.dev", "https://namwon.land-xi.dev"
rec = json.load(open(REC, encoding="utf-8"))

def page_urls(name):
    p = next(x for x in rec["pages"] if x["name"] == name)
    out = []
    for r in p["reqs"]:
        u = urlparse(r["u"])
        if r["m"] != "GET" or u.hostname not in ("app.land-xi.dev", "namwon.land-xi.dev"): continue
        if u.path.startswith("/cdn-cgi") or re.fullmatch(r"/[0-9a-f-]{36}", u.path) or "/tiles/sign/undefined" in u.path: continue
        out.append(u.path + (("?" + u.query) if u.query else ""))
    return list(dict.fromkeys(out))

PAGES = {n: page_urls(n) for n in ("staff-home", "ximap", "gov-main", "gov-farm", "gov-ximap")}

def key(path):
    p = path.split("?")[0]
    if p.startswith("/api/"):
        return "API " + re.sub(r"job_\w+|img-[\w-]+|/\d+(?=/|$)", "*", p)
    if p.startswith("/tiles/"):
        return "TILE /" + "/".join(p.split("/")[2:3])
    if p.endswith("/"): return "HTML " + p
    return "STATIC"

LOG = []          # (t, vu, key, status, ms)
CHAT = []         # dict per question
T0 = time.time()
STOP = asyncio.Event()

async def get(c, vu, path, hdr=None):
    t = time.perf_counter(); st = 0
    try:
        r = await c.get(path, headers=hdr or {}, timeout=60)
        await r.aread(); st = r.status_code
    except Exception as e:
        st = -1 if not isinstance(e, httpx.TimeoutException) else -2
    LOG.append((round(time.time() - T0, 2), vu, key(path), st, round((time.perf_counter() - t) * 1000)))
    return st

async def fetch_page(c, vu, name, tok, first, conc=6):
    urls = PAGES[name]
    hdr = {"authorization": "Bearer " + tok}
    if not first:   # 브라우저 캐시 — 두 번째부터는 화면 글(HTML) · API · 지도 조각만
        urls = [u for u in urls if key(u) != "STATIC"]
    sem = asyncio.Semaphore(conc)
    async def one(u):
        async with sem:
            h = dict(hdr) if (u.startswith("/api") or u.startswith("/tiles")) else {}
            if ".pmtiles" in u:   # 브라우저(pmtiles.js)처럼 조각만 — 머리 16KB + 무작위 64KB
                off = random.choice([0, random.randrange(0, 1_500_000)]); h["range"] = f"bytes={off}-{off + (16383 if off == 0 else 65535)}"
            await get(c, vu, u, h or None)
    t = time.perf_counter()
    await asyncio.gather(*(one(u) for u in urls))
    LOG.append((round(time.time() - T0, 2), vu, "PAGE " + name + (" first" if first else ""), 200, round((time.perf_counter() - t) * 1000)))

async def login(c, vu, gov):
    body = {"site": "gov", "realm": "tenant", "tenant_id": "namwon", "login": "lxadmin@lx.or.kr", "password": PW} if gov else \
           {"realm": "lx", "login": "test@lx.or.kr", "password": PW}
    t = time.perf_counter()
    try:
        r = await c.post("/api/v1/auth/login", json=body, timeout=60); st = r.status_code
        tok = r.json().get("token") or r.json().get("access_token") if st == 200 else None
        if st == 200 and not tok:
            j = r.json(); tok = next((v for k, v in j.items() if isinstance(v, str) and v.startswith("lx")), None)
    except Exception:
        st, tok = -1, None
    LOG.append((round(time.time() - T0, 2), vu, "API /api/v1/auth/login", st, round((time.perf_counter() - t) * 1000)))
    return tok

QS_STAFF = ["남원시 경작지 현황 보여 줘", "읍면동별 의심 건수 순위 보여줘", "경작지랑 휴경지 차이를 쉽게 설명해 줘", "비닐하우스와 축사를 항공사진에서 어떻게 구분하는지 설명해 줘"]
QS_GOV = ["남원시 경작지 현황 보여 줘", "남원시 의심 필지 몇 건이야?", "경작지랑 휴경지 차이를 쉽게 설명해 줘", "휴경지를 다시 경작지로 바꾸려면 무엇을 확인해야 하는지 알려 줘"]

async def ask(c, vu, tok, q, gov, tag):
    hdr = {"authorization": "Bearer " + tok}
    ctx = {"page": "xi-clean" if gov else "lx-map", "test": True, "has_map": True, "region": "52190", "region_name": "전북특별자치도 남원시", "sets": []}
    t0 = time.time(); first_tok = None; ev = None; n = 0; be = None
    try:
        r = await c.post("/api/v1/agent/runs", json={"message": q, "mode": "map", "context": ctx}, headers=hdr, timeout=60)
        if r.status_code >= 400:
            CHAT.append({"tag": tag, "vu": vu, "q": q, "status": r.status_code, "event": "http_error", "ms": int((time.time() - t0) * 1000)}); return
        rid = r.json()["run"]["id"]; after = None
        while time.time() - t0 < 150:
            rr = await c.get(f"/api/v1/agent/runs/{rid}/events", params={"after": after} if after else None, headers=hdr, timeout=30)
            j = rr.json()
            for x in j.get("items", []):
                after = x["id"]; e = x["event"]; n += 1
                if e == "agent.route": be = x["data"].get("backend")
                if e == "agent.token" and first_tok is None: first_tok = time.time() - t0
                if e == "agent.confirm":
                    await c.post(f"/api/v1/agent/runs/{rid}/confirm", json={"confirm_id": x["data"].get("confirm_id"), "decision": "reject"}, headers=hdr, timeout=30)
                if e in ("agent.done", "agent.failed", "agent.rejected"):
                    ev = e; break
            if ev: break
            await asyncio.sleep(0.7)
    except Exception as e:
        ev = "exception:" + type(e).__name__
    CHAT.append({"tag": tag, "vu": vu, "q": q, "event": ev or "timeout", "backend": be, "first_token_s": round(first_tok, 1) if first_tok else None,
                 "ms": int((time.time() - t0) * 1000), "events": n, "at": round(t0 - T0, 1)})

async def vu_loop(vu, gov, chatter):
    host = ORG if gov else APP
    async with httpx.AsyncClient(base_url=host, http2=False, limits=httpx.Limits(max_connections=6), headers={"user-agent": "LandXI-load20/1", "accept-encoding": "gzip, br"}) as c:
        await get(c, vu, "/landxi/v3/login/" if not gov else "/")
        tok = await login(c, vu, gov)
        if not tok: return
        first = {k: True for k in PAGES}
        pages = ["gov-main", "gov-farm", "gov-ximap"] if gov else ["staff-home", "ximap"]
        i = 0
        while not STOP.is_set():
            pg = pages[i % len(pages)]; i += 1
            await fetch_page(c, vu, pg, tok, first[pg]); first[pg] = False
            if chatter and chatter.is_set():
                await ask(c, vu, tok, random.choice(QS_GOV if gov else QS_STAFF), gov, "load")
            await asyncio.sleep(random.uniform(3, 8))   # 사람이 화면을 보는 시간

async def main():
    global T0
    # 기준: 혼자 물을 때 ChatGEO 2번
    async with httpx.AsyncClient(base_url=APP, timeout=60) as c:
        tok = await login(c, "base", False)
        for q in QS_STAFF:
            await ask(c, "base", tok, q, False, "solo")
    print("solo:", [(x["q"], x["event"], x["ms"]) for x in CHAT], flush=True)
    T0 = time.time()
    chatter = asyncio.Event()
    tasks, n = [], 0
    stage_marks = []
    for (target, dur) in STAGES:
        while n < target:
            gov = (n % 5) in (1, 3)          # 20명 중 8명 = 기관(남원) · 12명 = LX 직원
            chat = n < CHAT_N if target >= 20 else False
            tasks.append(asyncio.create_task(vu_loop(f"vu{n:02d}{'g' if gov else 's'}", gov, chatter if n < CHAT_N else None)))
            n += 1
            await asyncio.sleep(0.3)
        if target >= 20: chatter.set()
        stage_marks.append({"vus": target, "start": round(time.time() - T0, 1), "dur": dur})
        print(f"stage {target} VU at {time.time()-T0:.0f}s", flush=True)
        await asyncio.sleep(dur)
    STOP.set(); chatter.clear()
    await asyncio.wait(tasks, timeout=160)
    json.dump({"stages": stage_marks, "log": LOG, "chat": CHAT, "pages": {k: len(v) for k, v in PAGES.items()}}, open(OUT, "w", encoding="utf-8"))
    print("done", len(LOG), "requests", len(CHAT), "chats", flush=True)

asyncio.run(main())
