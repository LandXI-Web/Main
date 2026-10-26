"""넓게 보기 시험(10-26 · 운영 반영 없음) — 카드 예시와 같은 영상 · 같은 범위 · 같은 모델로 입력 축척(upsample)만 바꿔 대기열에 넣는다.
upsample u < 1 = 원본 창 1024/u px 을 1024 로 줄여 넣음(한 칸이 더 넓은 땅을 봄). 카드에 묶지 않음(card_id 없음) · 신뢰도 0.25(원래 결과 전부 남김 · 하한은 나중에).
  python infer_scale.py growth|production U [--wide] [--go]"""
import sys, json
sys.path.insert(0, r"E:\Land-XI 플랫폼\01. 디자인\server"); sys.stdout.reconfigure(encoding="utf-8")
from landxi_api import config
import httpx, psycopg
B = f"http://127.0.0.1:{config.API_PORT}/api/v1"
REF = {"growth": "job_01M5Q21ZHFPT6F3TC22KKTWRBM", "production": "job_01M5Q2202Q8D5CCKZVYZ7GE1AH"}   # 카드 예시(1배)
NAME = {"growth": "생육기", "production": "생산기"}
kind, u = sys.argv[1], float(sys.argv[2])
with psycopg.connect(config.PG_DSN) as c:
    c.execute("SELECT set_config('app.realm','lx',false), set_config('app.tenant_id','',false), set_config('app.user_id','',false)")
    mid, iid, aoi, opts = c.execute("SELECT model_id, imagery_id, ST_AsGeoJSON(aoi), options FROM jobs WHERE id=%s", (REF[kind],)).fetchone()
aoi = aoi if isinstance(aoi, dict) else json.loads(aoi)
WIDE = "--wide" in sys.argv          # 넓은 틀 그림용 — 예시 범위의 바깥 네모(약 1.5 × 1.4 km)
if WIDE:
    from shapely.geometry import shape, box, mapping
    aoi = mapping(box(*shape(aoi).bounds))
t = httpx.post(B + "/auth/login", json={"realm": "lx", "login": "lxadmin@lx.or.kr", "password": config.DEV_PASSWORD}, timeout=30).json()
H = {"Authorization": "Bearer " + (t.get("token") or t.get("access_token"))}
body = {"kind": "infer", "model_id": mid, "imagery_id": iid, "label": f"시험 · 넓게 보기 · {NAME[kind]} · 축척 {u:g}" + (" · 넓은 네모" if WIDE else ""), "aoi": aoi,
        "options": {"chip": 1024, "overlap": 0.125, "conf": 0.25, "upsample": u, "sgg_cd": opts.get("sgg_cd"), "max_km2": 5}}
q = httpx.post(B + "/jobs/quote", headers=H, json=body, timeout=120).json()
print(kind, u, q.get("allowed"), q.get("reasons"), {k: q.get(k) for k in ("shards", "eta_s", "upsample")})
if q.get("allowed") and "--go" in sys.argv:
    r = httpx.post(B + "/jobs", headers=H, json=body, timeout=120)
    print(r.status_code, r.json()["job"]["id"] if r.status_code < 300 else r.text[:300])
