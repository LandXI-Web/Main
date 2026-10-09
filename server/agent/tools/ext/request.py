"""기관의 '분석 실행'은 분석 요청 카드로(화면 말 '분석 요청' · 원칙 113 — 서버 이름은 request · /requests 그대로)(확인 16차 대화-1 규칙 ⑦ · 대화-2 ⓑ 첫째 묶음 · 원칙 60 · expand 8).

  request_send(service_id, imagery_id)   확인 카드('분석 요청 보내기' · '취소') → 승인하면 POST /requests(공유 영상 · 무상) → LX 관리자 결재함.
                                          분석은 LX 관리자가 확인한 뒤에야 돈다(GPU 는 이 도구가 쓰지 않는다).
ROUTE(기관 계정만): '분석 실행 · 분석 돌려 · 분석 요청 보내 줘'
  · 서비스를 말했거나 켜진 서비스가 하나면 → 그 서비스 · 그 서비스 범위에 걸치는 공유 영상 중 가장 최근(분석할 수 있고 아직 그 서비스로 요청 · 분석하지 않은 것)으로 카드
  · 서비스가 여럿인데 말하지 않았으면 → 되묻는 문장 대신 서비스 버튼(정말 고를 수 없을 때만 — 규칙 ③ 5)
  · 공유 영상이 없으면 → 이유 한 줄 + '분석 요청 화면 열기'(우리 영상을 올려 요청)
'실태조사 결과 만들기'(survey_build)는 그대로 runner.tenant_run_route 몫.
"""
from __future__ import annotations

import re

from .. import Out, ToolError

SPECS = {
    "request_send": {"description": "기관 계정의 AI 분석 요청 보내기(공유 영상 · 무상) — 사람이 확인 카드로 승인해야 보낸다. 분석은 LX 관리자 확인 뒤.",
                     "properties": {"service_id": {"type": "string"}, "imagery_id": {"type": "string"}, "title": {"type": "string"}, "line": {"type": "string"},
                                    "ok_label": {"type": "string"}, "region": {"type": "string"}}, "required": ["service_id", "imagery_id"]},
}
HANDLERS: dict = {}
WRITE = {"request_send"}
CONFIRM = {"request_send"}
CLIENT: set[str] = set()
WHY = {"request_send": "분석 요청 보내기 — 사람 승인 필요"}
SAY = {"request_send": "분석 요청 보내기"}
HINT = "기관 계정의 '분석 실행해 줘'는 분석 요청이다 — request_send(확인 카드 '분석 요청 보내기'). 기관은 분석을 직접 실행하지 않는다. 답에는 '의뢰' 대신 '분석 요청'이라고 쓴다."
GOV_REQ = "/landxi/v3/gov-request/"


def allowed(name: str, p) -> bool:
    return getattr(p, "realm", None) == "tenant" and getattr(p, "role", None) not in ("demo",)


RUN_RX = re.compile(r"분석.{0,10}(실행|돌려|시작|해\s*줘|해줘|해\s*주세요|진행|의뢰|요청|맡겨|맡기)|(돌려|실행해)\s*(줘|주세요)|의뢰\s*(보내|해|넣어)")
NOT_RX = re.compile(r"보고서|차트|몇|건수|목록|결과\s*(보여|알려|요약)|설명|법|조문|실태조사|범위.{0,8}그려|그려서")


async def _j(ctx, method: str, path: str, **kw):
    res = await ctx.http.request(method, path, **kw)
    try:
        j = res.json()
    except Exception:  # noqa: BLE001
        j = {}
    if res.status_code >= 400:
        e = (j or {}).get("error") or {}
        raise ToolError(e.get("code") or f"http_{res.status_code}", e.get("message") or f"http {res.status_code}", res.status_code)
    return j


def _over(a, b) -> bool:
    return bool(a and b and not (a[2] < b[0] or a[0] > b[2] or a[3] < b[1] or a[1] > b[3]))


_GENERIC = {"국토", "탐지", "관리", "서비스", "행정서비스", "위험요소", "안전관리", "분석", "실태조사"}


def _words(name: str) -> list[str]:
    """서비스 이름 → 부르는 낱말(일반 낱말 제외 · 두 글자 이상) — '비닐하우스 서비스' → 비닐하우스 · '영농관리 행정서비스' → 영농관리 · 영농."""
    out = []
    for w in re.split(r"[\s·,/()]+", name):
        if len(w) < 2 or w in _GENERIC:
            continue
        out.append(w)
        if w.endswith("관리") and len(w) >= 4:
            out.append(w[:-2])
    return out


async def plan(ctx, text: str) -> dict:
    """문장 → {service, imagery} | {choose: [서비스…]} | {none: 이유}. 서버 값만(지어내기 0)."""
    sv = (await _j(ctx, "GET", "/requests/services")).get("items") or []
    if not sv:
        return {"none": "이 기관에 켜진 분석 서비스가 없습니다."}
    t = re.sub(r"\s+", "", text or "")
    hit = [s for s in sv if any(w in t for w in _words(s.get("name") or ""))]
    if len(hit) != 1:
        if len(sv) == 1:
            hit = sv
        else:
            return {"choose": sv}
    s = hit[0]
    im = (await _j(ctx, "GET", "/requests/shared-imagery")).get("items") or []
    cand = [x for x in im if x.get("analyzable") and s["id"] not in (x.get("result_services") or []) and (not s.get("bbox") or _over(x.get("bbox"), s["bbox"]))]
    if not cand:
        return {"service": s, "none": "LX가 이 기관에 공유한 영상 중 이 서비스로 새로 분석할 영상이 없습니다."}
    cand.sort(key=lambda x: (-(x.get("year") or 0), x.get("gsd_m") or 9))
    return {"service": s, "imagery": cand[0]}


async def ROUTE(msg: str, ctx):
    from ... import talk
    p = ctx.principal
    if not allowed("request_send", p):
        return None
    t = re.sub(r"\s+", " ", msg or "").strip()
    if not t or len(t) > 80 or not RUN_RX.search(t) or NOT_RX.search(t):
        return None
    try:
        pl = await plan(ctx, t)
    except ToolError:
        return None
    if pl.get("choose"):
        return {"tool": "request_send", "args": {"service_id": "", "imagery_id": ""}, "reply_choose": [s.get("name") for s in pl["choose"]][:3]}
    if pl.get("none"):
        return {"tool": "request_send", "args": {"service_id": "", "imagery_id": ""}, "reply_none": pl["none"]}
    s, im = pl["service"], pl["imagery"]
    r = None
    try:
        from landxi_api.regions import region_of
        r = region_of(s.get("sgg_cd")) if s.get("sgg_cd") else None
    except Exception:  # noqa: BLE001
        r = None
    nm = (r or {}).get("name") or ""
    svc = s.get("name") or "분석"
    return {"tool": "request_send", "args": {
        "service_id": s["id"], "imagery_id": im["id"], "region": (r or {}).get("sgg_cd") or "",
        "title": f"{nm + ' ' if nm else ''}{svc} 분석 요청을 보낼까요?",
        "line": f"{im.get('name') or '공유 영상'}으로 요청합니다 · 분석은 LX 관리자가 확인한 뒤에 합니다.",   # 'LX 관리자'는 한 덩이(줄바꿈 규칙)
        "ok_label": "분석 요청 보내기"}}


async def request_send(args: dict, ctx) -> Out:
    """승인 뒤에만 불린다(runner.confirm_then) — 의뢰 한 건(결재 대기)."""
    from ... import talk
    body = {"service_id": args["service_id"], "source": "shared", "imagery_id": args["imagery_id"], "memo": "XI ChatGEO에서 보낸 분석 요청"}
    j = await _j(ctx, "POST", "/requests", json=body)
    out = Out(source="분석 요청(승인 대기)")
    rid = (j.get("request") or j).get("id") if isinstance(j, dict) else None
    out.data = {"분석 요청": "보냄 — LX 관리자 승인 대기", "번호": "개발자 서랍에만"}
    out.raw = {"request_id": rid}
    out.answer = "분석 요청을 보냈습니다. LX 관리자가 확인하면 분석되고, 결과는 이 서비스에 새 시점으로 쌓입니다."
    talk.set_next(ctx, [talk.btn("내 분석 요청 보기", href=GOV_REQ)])
    return out


def prepare(args: dict, ctx) -> dict:
    """확인 카드 전 — 서비스 · 영상이 정해졌는지만(정하는 일은 ROUTE 가 서버 값으로 했다)."""
    if not args.get("service_id") or not args.get("imagery_id"):
        raise ToolError("bad_request", "분석을 요청할 서비스와 영상을 먼저 정해야 합니다", 400)
    return args


PREPARE = {"request_send": prepare}
HANDLERS.update({"request_send": request_send})
