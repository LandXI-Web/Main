"""말로 지도 제어(C2 ①) — 클라이언트 도구 4개. 서버는 실행하지 않고 ui_actions 로만 내려보낸다(plan 3.2 · kit:agent-action).

  map_region(name | sgg_cd)          시군구로 이동. 결과(실태조사 · AI 분석)가 없어도 경계 범위로 간다. 범위는 regions 에서 읽기만.
                                     기관 계정은 관할 안만(관할 밖이면 '이 기관의 데이터가 아닙니다').
  map_zoom(zoom | delta)             확대·축소(절대 줌 또는 ±단계)
  map_view(pitch, bearing | preset)  시점 — preset '3d'(입체 · XI맵 '입체' 버튼과 같은 값) · 'top'(위에서)
  map_layer(layer, on)               층 켜기·끄기 — imagery(영상) · results(AI 분석 결과) · findings(현장 확인 필요) · parcels(지적선)

숫자는 내지 않는다(봉투 0) — 지도 동작만. 지역 문자열 하드코딩 0(이름은 regions 표에서 찾는다).
"""
from __future__ import annotations

import re

from .. import Out, ToolError

REGION_ARG = {"type": "string", "description": "시군구 이름(예: '○○군') 또는 5자리 코드"}

SPECS: dict[str, dict] = {
    "map_region": {
        "description": "지도를 시군구로 옮긴다. AI 분석 결과가 없는 지역도 경계로 이동한다. '○○ 보여 줘' · '○○로 가 줘' · '○○로 이동'.",
        "properties": {"name": REGION_ARG, "sgg_cd": {"type": "string", "description": "5자리 시군구 코드(이름 대신)"}}},
    "map_zoom": {
        "description": "지도 확대·축소. '확대해 줘' = delta +1(더 크게 +2) · '축소' = delta -1 · '줌 14로' = zoom 14.",
        "properties": {"zoom": {"type": "number", "description": "절대 줌(5–19)"},
                       "delta": {"type": "number", "description": "지금 줌에서 더하거나 뺄 단계(-4–4)"}}},
    "map_view": {
        "description": "지도 시점. '3D로 · 입체로 · 기울여' = preset 3d, '위에서 · 평면으로 · 똑바로' = preset top. 각도를 말하면 pitch·bearing.",
        "properties": {"preset": {"type": "string", "enum": ["3d", "top"]},
                       "pitch": {"type": "number", "description": "기울기 0–70도"},
                       "bearing": {"type": "number", "description": "방향 -180–180도"}}},
    "map_layer": {
        "description": "지도 층 켜기·끄기. imagery=항공·드론 영상 · results=AI 분석 결과 · findings=현장 확인 필요 필지 · parcels=지적선. "
                       "'영상 켜 줘' = imagery on true · '결과 꺼 줘' = results on false.",
        "properties": {"layer": {"type": "string", "enum": ["imagery", "results", "findings", "parcels"]},
                       "on": {"type": "boolean", "description": "켜기 true · 끄기 false(기본 true)"}},
        "required": ["layer"]},
    "screen_open": {
        "description": "XI맵(전국·해외 영상 AI 분석 지도) 화면을 연다. 'XI맵 열어 줘' · 'XI맵으로 가 줘'. 지금 화면의 지역을 이어 간다.",
        "properties": {"region": {"type": "string", "description": "이어 갈 시군구(없으면 지금 화면 지역)"}}, "route_only": True},
}
HANDLERS: dict = {}
WRITE: set[str] = set()
CONFIRM: set[str] = set()
CLIENT = set(SPECS)
WHY = {"map_region": "지역으로 이동", "map_zoom": "확대·축소", "map_view": "시점 바꾸기", "map_layer": "층 켜기·끄기", "screen_open": "XI맵 열기"}
SAY = {"map_region": "지역으로 이동", "map_zoom": "지도 확대·축소", "map_view": "시점 바꾸기", "map_layer": "층 켜기·끄기", "screen_open": "XI맵 열기"}
HINT = ("지도 이동·확대·축소·시점(3D·위에서)·층(영상·결과) 요청은 map_region · map_zoom · map_view · map_layer 를 부른다. "
        "지역 이동은 결과가 없어도 map_region 으로 한다. 이 도구를 부르지 않았으면 '이동했습니다·켰습니다' 같은 동작 문장을 쓰지 않는다.")

PRESET = {"3d": {"pitch": 55.0, "bearing": -14.0}, "top": {"pitch": 0.0, "bearing": 0.0}}   # XI맵 '입체' 버튼(toggleTilt)과 같은 값
LAYER_KO = {"imagery": "영상", "results": "AI 분석 결과", "findings": "현장 확인 필요", "parcels": "지적선"}


def allowed(name: str, p) -> bool:
    realm = getattr(p, "realm", None)
    if name == "screen_open":
        return realm == "lx" or (realm == "tenant" and getattr(p, "role", None) in ("demo", "local"))
    return realm in ("lx", "tenant")


def _clamp(v, lo, hi):
    return max(lo, min(hi, float(v)))


def resolve_region(args: dict, ctx) -> dict:
    """이름·코드·화면 지역 → regions 한 행(sgg_cd · name · full · bbox · center). 여러 곳이면 되묻게 bad_request."""
    from landxi_api.regions import find, region_of
    cd = str(args.get("sgg_cd") or "").strip()
    nm = str(args.get("name") or args.get("region") or "").strip()
    r = None
    if cd:
        r = region_of(cd)
    if r is None and nm:
        if nm.isdigit():
            r = region_of(nm)
        else:
            hits = find(nm)
            if len(hits) > 1:                               # '○구'처럼 여러 시도에 있는 이름 — 시도까지 맞으면 그것, 아니면 되묻는다
                full = [h for h in hits if (h.get("full") or "").replace(" ", "") == nm.replace(" ", "")]
                if len(full) == 1:
                    hits = full
                else:
                    sido = {h["full"].split(" ")[0] for h in hits}
                    if len(sido) > 1 and len({h["full"].split(" ")[0] + h["name"].split(" ")[0] for h in hits}) > 1:
                        raise ToolError("bad_request", "같은 이름의 시군구가 여러 곳입니다: " + " · ".join(h["full"] for h in hits[:5]))
            r = hits[0] if hits else None
    if r is None and not cd and not nm:
        r = region_of((ctx.context or {}).get("region"))
    if r is None:
        raise ToolError("not_found", f"'{nm or cd}' 시군구를 찾지 못했습니다", 404)
    guard_region(r, ctx)
    return r


def guard_region(r: dict, ctx):
    """관할 가드 — 기관 계정은 관할 시군구만(regions.tenant_scope · 기존 scope_guard 와 같은 판정)."""
    p = ctx.principal
    if getattr(p, "realm", None) != "tenant":
        return
    from landxi_api.regions import in_scope, tenant_scope
    if not in_scope(r["sgg_cd"], tenant_scope(p.tenant_id)) and not (r.get("prev_cd") and in_scope(r["prev_cd"], tenant_scope(p.tenant_id))):
        raise ToolError("out_of_scope", "이 기관의 데이터가 아닙니다", 403)


def region_action(r: dict) -> dict:
    return {"op": "map_region", "sgg_cd": r["sgg_cd"], "prev_cd": r.get("prev_cd"), "name": r["name"], "full": r.get("full"),
            "bbox": r.get("bbox"), "center": r.get("center")}


async def map_region(args: dict, ctx) -> Out:
    r = resolve_region(args, ctx)
    out = Out(source="지도 동작(브라우저)")
    out.ui_actions.append(region_action(r))
    out.whitelist |= {r["sgg_cd"]}
    out.data = {"이동": r.get("full") or r["name"], "실행": "됨 — 브라우저가 지도를 이 지역으로 옮겼다"}
    return out


async def map_zoom(args: dict, ctx) -> Out:
    z, d = args.get("zoom"), args.get("delta")
    if z is None and d is None:
        d = 1
    a = {"op": "map_zoom"}
    if z is not None:
        a["zoom"] = _clamp(z, 5, 19)
    else:
        a["delta"] = _clamp(d, -4, 4)
    out = Out(source="지도 동작(브라우저)")
    out.ui_actions.append(a)
    out.data = {"동작": "줌 지정" if "zoom" in a else ("확대" if a["delta"] > 0 else "축소"), "실행": "됨"}
    return out


async def map_view(args: dict, ctx) -> Out:
    pre = args.get("preset")
    if pre in PRESET:
        pitch, bearing = PRESET[pre]["pitch"], PRESET[pre]["bearing"]
    else:
        if args.get("pitch") is None and args.get("bearing") is None:
            pre = "3d"
            pitch, bearing = PRESET["3d"]["pitch"], PRESET["3d"]["bearing"]
        else:
            pitch = _clamp(args.get("pitch") if args.get("pitch") is not None else 0, 0, 70)
            bearing = _clamp(args.get("bearing") if args.get("bearing") is not None else 0, -180, 180)
    out = Out(source="지도 동작(브라우저)")
    out.ui_actions.append({"op": "map_view", "pitch": pitch, "bearing": bearing, "preset": pre or ("3d" if pitch > 0 else "top")})
    out.data = {"시점": "입체(3D)" if pitch > 0 else "위에서", "실행": "됨 — 지도 시점을 바꿨다"}
    return out


async def map_layer(args: dict, ctx) -> Out:
    layer = args.get("layer")
    if layer not in LAYER_KO:
        raise ToolError("bad_request", "layer 는 imagery|results|findings|parcels")
    on = args.get("on")
    on = True if on is None else (on if isinstance(on, bool) else str(on).lower() not in ("false", "0", "off", "끄기"))
    out = Out(source="지도 동작(브라우저)")
    out.ui_actions.append({"op": "map_layer", "layer": layer, "on": on})
    out.data = {"층": LAYER_KO[layer], "켜기": on, "실행": "됨"}
    return out


async def screen_open(args: dict, ctx) -> Out:
    """XI맵 열기 — 브라우저가 그 주소로 간다(키트 cmdk 'screen_open'). 지역은 말한 곳 → 지금 화면 지역. 관할 가드는 map_region 과 같다."""
    href = "/landxi/v3/xi-clean/"
    r = None
    if args.get("region") or (ctx.context or {}).get("region"):
        try:
            r = resolve_region({"name": args.get("region")} if args.get("region") else {}, ctx)
        except ToolError as e:
            if e.code == "out_of_scope":
                raise
            r = None
    if r:
        href += "?region=" + r["sgg_cd"]
    out = Out(source="화면 열기(브라우저)")
    out.ui_actions.append({"op": "screen_open", "screen": "xi-clean", "href": href})
    if r:
        out.whitelist |= {r["sgg_cd"]}
    out.data = {"화면": "XI맵", **({"지역": r.get("full") or r["name"]} if r else {}), "실행": "됨"}
    out.answer = "XI맵을 엽니다." + (f" {r['name']}에서 시작합니다." if r else "")
    return out


# ── 모델 앞 결정적 직행(ROUTE) · 가드 통과(GUARD_PASS) ─────────────────────────────────────────────
# 지도 동작만 있는 짧은 문장은 도구 선택을 모델에 맡기지 않는다(지어낸 동작 0 · 1초 안). 두 가지 이상 섞이면(이동 + 3D 등) 모델 경로.
# 결과가 없는 지역으로의 이동은 '해당 지역 데이터가 없습니다' 가드를 건너뛴다(관할 밖 가드는 그대로).
DATA_WORDS = r"의심|필지|결과|몇|현황|요약|보고서|차트|대장|건수|통계|분석|목록|상위|얼마|어때|알려|설명|법|조문"
MOVE_RX = re.compile(r"이동|(으로|로)\s*가\s*(줘|자|봐|주세요)|가\s*줘|옮겨|날아가|넘어가|찾아\s*가")
SHOW_RX = re.compile(r"보여\s*(줘|주세요|줄래)|띄워\s*(줘|주세요)|열어\s*(줘|주세요)")
ZOOM_IN = re.compile(r"확대|줌\s*인|zoom\s*in|크게\s*(보여|해)|가까이")
ZOOM_OUT = re.compile(r"축소|줌\s*아웃|zoom\s*out|작게\s*(보여|해)|멀리")
ZOOM_ABS = re.compile(r"줌\s*(?:레벨)?\s*(\d{1,2}(?:\.\d)?)")
VIEW_3D = re.compile(r"3\s*[dD]|입체|기울|비스듬|tilt", re.I)
VIEW_TOP = re.compile(r"위에서|평면|똑바로|수직|정사\s*시점|2\s*[dD]|원래\s*시점")
LAYER_RX = {"imagery": re.compile(r"(영상|항공|정사|드론|위성)\s*(사진|층|레이어)?"), "results": re.compile(r"(ai|AI)?\s*(분석)?\s*결과\s*(층|레이어)"),
            "parcels": re.compile(r"지적\s*(선|도|층)?"), "findings": re.compile(r"현장\s*확인\s*(필요)?\s*(층|레이어)?")}
ON_RX, OFF_RX = re.compile(r"켜|보이게|표시|띄워|올려"), re.compile(r"꺼|끄|숨겨|안\s*보이게|내려|지워")
GUARD_PASS = re.compile(r"(XI|xi|엑스아이)\s*맵|이동|가\s*줘|옮겨|확대|축소|줌|3\s*[dD]|입체|기울|위에서|평면|(영상|층|레이어|지적).{0,8}(켜|꺼|끄|보이|표시)|"
                        r"분석.{0,8}(실행|돌려|시작|해\s*줘|해줘)|실태조사.{0,10}(만들|생성)|"
                        r"^(?!.*(" + DATA_WORDS + r")).*(보여\s*줘|보여줘|띄워)")


def _regions_in(msg: str) -> list[dict]:
    try:
        from ..summary_lookup import match_regions
        return match_regions(msg)
    except Exception:
        return []


XI_OPEN = re.compile(r"(XI|xi|엑스아이|Xi)\s*맵.{0,8}(열|가|이동|들어|띄워|보여|켜)|(open|go\s*to)\s+(the\s+)?XI\s*map", re.I)


async def route_map(msg: str, ctx) -> dict | None:
    """지도 동작 한 가지만 있는 문장 → {tool, args}. 섞이거나 자료 질문이면 None(모델 · 다른 직행)."""
    t = re.sub(r"\s+", " ", msg or "").strip()
    if t and len(t) <= 40 and XI_OPEN.search(t) and allowed("screen_open", ctx.principal):
        regs = _regions_in(t)
        return {"tool": "screen_open", "args": {"region": regs[0]["sgg_cd"]} if len({h["_key"] for h in regs}) == 1 else {}}
    if not t or len(t) > 60 or re.search(DATA_WORDS, t) and not re.search(r"(분석\s*)?결과\s*(층|레이어)", t):
        return None
    cand = []
    regs = _regions_in(t)
    names = {h["_key"] for h in regs}
    if len(names) == 1 and (MOVE_RX.search(t) or SHOW_RX.search(t)):
        cand.append({"tool": "map_region", "args": {"sgg_cd": regs[0]["sgg_cd"], "name": regs[0]["_key"]}})
    m = ZOOM_ABS.search(t)
    if m:
        cand.append({"tool": "map_zoom", "args": {"zoom": float(m.group(1))}})
    elif ZOOM_IN.search(t):
        cand.append({"tool": "map_zoom", "args": {"delta": 2 if re.search(r"더\s*많이|크게\s*더|많이", t) else 1}})
    elif ZOOM_OUT.search(t):
        cand.append({"tool": "map_zoom", "args": {"delta": -2 if re.search(r"더\s*많이|많이", t) else -1}})
    if VIEW_3D.search(t):
        cand.append({"tool": "map_view", "args": {"preset": "3d"}})
    elif VIEW_TOP.search(t):
        cand.append({"tool": "map_view", "args": {"preset": "top"}})
    if ON_RX.search(t) or OFF_RX.search(t):
        for layer, rx in LAYER_RX.items():
            if rx.search(t):
                cand.append({"tool": "map_layer", "args": {"layer": layer, "on": not OFF_RX.search(t)}})
                break
    if len(cand) != 1:
        return None
    if cand[0]["tool"] == "map_region" and SHOW_RX.search(t) and not MOVE_RX.search(t):
        # '○○ 보여 줘' — 결과가 있는 지역은 요약 직행(이동 + 대표 수치)이 더 낫다 → 결과가 없는 지역만 여기서 이동
        if await _has_data(regs[0]["sgg_cd"]):
            return None
    return cand[0]


async def _has_data(sgg_cd: str) -> bool:
    """scope_guard 와 같은 판정(필지 적재 또는 공개 배포본) — 결과가 있는 지역인가."""
    try:
        from landxi_api.regions import derived
        dv = await derived()
        return sgg_cd in (dv.get("parcels") or {}) or any(not d.get("_test") and d.get("stage") in ("ga", "canary") for d in (dv.get("dp") or {}).get(sgg_cd, []))
    except Exception:
        return False


ROUTE = route_map


HANDLERS.update({"map_region": map_region, "map_zoom": map_zoom, "map_view": map_view, "map_layer": map_layer, "screen_open": screen_open})
