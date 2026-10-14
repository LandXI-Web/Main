"""분석 결과를 말로 내려받기 — XI ChatGEO 정기 개선 바퀴 1회차 새 도구(원칙 249 · impl-32 chatgeo-loop · 개선 후보 '분석 결과를 GeoJSON 으로 내려받고 싶어').

  result_files(request, fmt?)
      '분석 결과를 GeoJSON 으로 내려받고 싶어' · '결과 SHP 로 줘' · '필지 엑셀로 받을래' (LX 계정)
      → 지도 서비스의 그 결과 층 '내려받기'와 같은 길(GET /me/analyses/{job}/download — 같은 행 · 동의 · 내려받기 기록 그대로)을 파일 단추로 붙인다.
      대상 = 질문의 지역(이 사람의 지도 서비스 결과 가운데 그 시군구 · 가장 최근) → 화면에 켜진 결과 층(context.sets) → 화면 지역 → 가장 최근 결과.
      숫자 = 그 결과의 찾은 수(지도 서비스 목록과 같은 값 · staff_home._item). 동의를 아직 안 했으면 파일 대신 동의 한 줄과 지도 서비스 길.
ROUTE 는 모델 앞 직행(LLM 0). 지역 · 지명 고정값 0.
"""
from __future__ import annotations

import re

from .. import Out

SPECS = {
    "result_files": {
        "description": "AI 분석 결과를 파일(GeoJSON · SHP · 필지 엑셀)로 내려받는 단추 — 지도 서비스 층 내려받기와 같은 길(LX 계정).",
        "properties": {"request": {"type": "string", "description": "사용자 문장 원문"},
                       "fmt": {"type": "string", "enum": ["geojson", "shp", "parcels"]}},
        "route_only": True},
}
WRITE: set[str] = set()
CONFIRM: set[str] = set()
CLIENT: set[str] = set()
GATED = {"result_files"}
WHY = {"result_files": "분석 결과 파일 내려받기 단추"}
SAY = {"result_files": "결과 파일 내려받기"}

DL_ASK = re.compile(r"내려\s*받|다운\s*로드|다운\s*받|download|파일로\s*(?:줘|받|저장|뽑|만들)|(?:geojson|shp|쉐이프|셰이프|엑셀)\s*(?:로|으로)?\s*(?:줘|받|저장|뽑|만들|내보내)", re.I)
DL_WHAT = re.compile(r"결과|분석|탐지|geojson|shp|쉐이프|셰이프|엑셀|층|레이어", re.I)
DL_NOT = re.compile(r"보고서|리포트|지도\s*(?:화면|그림)|이미지|그림\s*파일|캡처|법령|조문|대장\s*양식|서식")
FMT = [(re.compile(r"shp|쉐이프|셰이프", re.I), "shp"), (re.compile(r"엑셀|xlsx|필지\s*목록", re.I), "parcels"), (re.compile(r"geo\s*json|지오\s*제이슨", re.I), "geojson")]
FMT_KO = {"geojson": "GeoJSON", "shp": "SHP", "parcels": "필지 엑셀"}
EXT = {"geojson": "geojson", "shp": "zip", "parcels": "xlsx"}


def allowed(name: str, p) -> bool:
    return getattr(p, "realm", None) == "lx" and getattr(p, "role", None) != "sales"


def parse(t: str) -> dict | None:
    t = re.sub(r"\s+", " ", t or "").strip()
    if not t or len(t) > 100 or not DL_ASK.search(t) or not DL_WHAT.search(t) or DL_NOT.search(t):
        return None
    fmt = next((f for rx, f in FMT if rx.search(t)), "geojson")
    return {"request": t, "fmt": fmt}


def ROUTE(msg: str, ctx):
    if getattr(ctx, "lang", "ko") == "en":
        return None
    a = parse(msg)
    if a and allowed("result_files", getattr(ctx, "principal", None)):
        return {"tool": "result_files", "args": a, "intent": "map"}
    return None


async def _mine(p) -> list[dict]:
    """이 사람의 지도 서비스 결과(목록과 같은 판정 · 같은 줄 · 최근 순)."""
    from landxi_api.deps import db
    from landxi_api.staff_home import MY_ANALYSES_SQL, _item
    async with db(realm="lx") as conn:
        rows = await conn.fetch(MY_ANALYSES_SQL, p.user_id, "", False)
    out = []
    for r in rows:
        _, gname, _, it = _item(r, p)
        out.append({**it, "group": gname})
    return out


def _pick(items: list[dict], text: str, ctx) -> dict | None:
    if not items:
        return None
    try:
        from agent import talk
        hits = talk.regions_in(text) or []
        names = [h[0] for h in hits if h]
    except Exception:  # noqa: BLE001
        names = []
    for g in names:                                   # 질문의 지역
        codes = {str(g.get("sgg_cd") or g.get("code") or "")[:5]}
        nm = str(g.get("name") or g.get("full") or "")
        got = [x for x in items if not x["empty"] and ((x.get("sgg_cd") or "")[:5] in codes or (nm and nm.split()[-1] in x["region"]))]
        if got:
            return got[0]
    c = getattr(ctx, "context", None) or {}
    jobs = [str(s).rsplit("/", 1)[-1] for s in (c.get("sets") or []) if isinstance(s, str)]
    got = [x for x in items if x["job"] in jobs and not x["empty"]]
    if got:
        return got[0]
    sgg = str(c.get("region") or "")[:5]
    got = [x for x in items if sgg and (x.get("sgg_cd") or "")[:5] == sgg and not x["empty"]]
    if got:
        return got[0]
    return next((x for x in items if not x["empty"]), None)


async def result_files(args: dict, ctx) -> Out:
    from landxi_api.deps import db
    from landxi_api.staff_home import DL_CONSENT_VER
    p = ctx.principal
    out = Out(source="지도 서비스 결과 목록(GET /me/analyses) · 내려받기(GET /me/analyses/{job}/download)")
    fmt = args.get("fmt") if args.get("fmt") in FMT_KO else "geojson"
    x = _pick(await _mine(p), str(args.get("request") or ""), ctx)
    if not x:
        ctx.state["cannot"] = {"kind": "nodata"}
        out.data = {"status": "none"}
        out.answer = "내려받을 AI 분석 결과가 아직 없습니다. 지도 서비스에 결과가 생기면 같은 말로 받을 수 있습니다."
        return out
    async with db(realm="lx") as conn:
        v = await conn.fetchval("SELECT ver FROM space_consents WHERE tenant_id='lx' AND user_id=$1", p.user_id)
    out.env("n", f"{x['region']} {x['group']} AI 분석 결과", x["found"])
    what = f"{x['region']} {x['group']}"
    if not v or v < DL_CONSENT_VER:
        out.data = {"status": "consent", "결과": what}
        out.answer = (f"{what} 결과 {{{{n}}}}입니다. 처음 내려받기 전에 지도 서비스에서 동의 한 번이 필요합니다 — "
                      "지도 서비스에서 그 층의 '내려받기'를 누르면 동의 뒤 바로 받습니다.")
        return out
    day = (x.get("finished_at") or "")[:10].replace("-", "")
    label = re.sub(r'[\\/:*?"<>|\s]+', "_", f"{x['region']}_{x['group']}_AI분석_{day}").strip("_") + "." + EXT[fmt]
    out.blocks.append({"type": "file", "label": label, "href": f"/api/v1/me/analyses/{x['job']}/download?fmt={fmt}"})
    out.data = {"status": "ok", "결과": what, "형식": FMT_KO[fmt], "수": "n"}
    out.answer = f"{what} 결과 {{{{n}}}}을 {FMT_KO[fmt]} 파일로 받을 수 있게 아래에 두었습니다."
    return out


HANDLERS = {"result_files": result_files}
