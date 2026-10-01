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
        "description": "지도를 시군구(또는 읍면동)로 옮긴다. AI 분석 결과가 없는 지역도 경계로 이동한다. '○○ 보여 줘' · '○○로 가 줘' · '○○로 이동'. "
                       "읍·면·동 이름을 말하면 emd 에 넣는다(예: '○○면으로 이동' → emd '○○면').",
        "properties": {"name": REGION_ARG, "sgg_cd": {"type": "string", "description": "5자리 시군구 코드(이름 대신)"},
                       "emd": {"type": "string", "description": "읍면동 이름(말했을 때만 · 예: '○○면')"}}},
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
                       "on": {"type": "boolean", "description": "켜기 true · 끄기 false(기본 true)"},
                       "only": {"type": "string", "description": "그 층만(결과 층이면 서비스 낱말 · 예 '비닐하우스')"}},
        "required": ["layer"]},
    "map_compare": {
        "description": "두 시점 영상을 좌우로 나란히(XI맵 가르기) — '2023년과 2025년 영상 비교' · '두 시점 나란히'. 연도를 말하면 그 해(없으면 가까운 해).",
        "properties": {"region": REGION_ARG, "years": {"type": "array", "items": {"type": "integer"}, "description": "말한 연도(앞 · 뒤)"}}},
    "map_draw": {
        "description": "XI맵 분석 범위 그리기를 켠다 — '범위를 그려서 그 안만 분석' · '그린 곳만 분석'. 그리면 분석 확인 카드가 뜬다(LX 직원 · 관리자).",
        "properties": {"region": REGION_ARG}},
    "map_snapshot": {
        "description": "지금 보이는 지도 한 장을 그림 파일(PNG)로 — '지도 화면을 이미지로 저장' · '지도 캡처'.",
        "properties": {}},
    "screen_open": {
        "description": "XI맵(전국·해외 영상 AI 분석 지도) 화면을 연다. 'XI맵 열어 줘' · 'XI맵으로 가 줘'. 지금 화면의 지역을 이어 간다.",
        "properties": {"region": {"type": "string", "description": "이어 갈 시군구(없으면 지금 화면 지역)"}}, "route_only": True},
}
HANDLERS: dict = {}
WRITE: set[str] = set()
CONFIRM: set[str] = set()
CLIENT = set(SPECS)
WHY = {"map_region": "지역으로 이동", "map_zoom": "확대·축소", "map_view": "시점 바꾸기", "map_layer": "층 켜기·끄기", "screen_open": "XI맵 열기",
       "map_compare": "두 시점 나란히", "map_draw": "범위 그리기 켜기", "map_snapshot": "지도 그림 파일"}
SAY = {"map_region": "지역으로 이동", "map_zoom": "지도 확대·축소", "map_view": "시점 바꾸기", "map_layer": "층 켜기·끄기", "screen_open": "XI맵 열기",
       "map_compare": "두 시점 나란히 놓기", "map_draw": "범위 그리기 켜기", "map_snapshot": "지도 그림 파일 만들기"}
HINT = ("지도 이동·확대·축소·시점(3D·위에서)·층(영상·결과) 요청은 map_region · map_zoom · map_view · map_layer 를 부른다. "
        "두 시점 영상 비교는 map_compare · 범위 그려 분석은 map_draw · 지도 그림 저장은 map_snapshot. "
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
            if len(hits) > 1:                               # '○구'처럼 여러 시도에 있는 이름 — 시도까지 맞으면 그것, 아니면 되묻지 않고 하나(규칙 ③)
                full = [h for h in hits if (h.get("full") or "").replace(" ", "") == nm.replace(" ", "")]
                if len(full) == 1:
                    hits = full
                else:
                    sido = {h["full"].split(" ")[0] for h in hits}
                    if len(sido) > 1 and len({h["full"].split(" ")[0] + h["name"].split(" ")[0] for h in hits}) > 1:
                        from ... import talk
                        chosen, alts = talk.pick(ctx, hits)
                        if alts:
                            a0 = alts[0]
                            talk.set_alt(ctx, a0.get("full") or a0["name"], q=f"{a0.get('full') or a0['name']}{talk.josa(a0['name'], ('으로', '로'))} 이동해 줘")
                        hits = [chosen]
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


def region_action(r: dict, emd: dict | None = None) -> dict:
    a = {"op": "map_region", "sgg_cd": r["sgg_cd"], "prev_cd": r.get("prev_cd"), "name": r["name"], "full": r.get("full"),
         "bbox": r.get("bbox"), "center": r.get("center")}
    if emd:                                                # 읍면동 이동(r3-xi) — 화면은 이 경계로 간다 · 모르는 화면은 bbox(읍면동 범위)로
        a.update({"emd_cd": emd["emd_cd"], "emd_name": emd["name"], "emd_bbox": emd["bbox"], "sgg_bbox": r.get("bbox"), "bbox": emd["bbox"]})
    return a


# ── 읍면동 찾기(r3-xi) — 말한 시군구 → 지금 지도 시군구 안에서 먼저, 없으면 실태조사 읍면동 표 · 받아 둔 경계 파일(전국)에서 ─────────
EMD_RX = re.compile(r"([가-힣]{1,6}\d{0,2}(?:읍|면|동))(?=\s|으로|로|에|을|를|은|는|의|,|\.|$)")
EMD_STOP = {"이동", "자동", "연동", "행동", "활동", "변동", "작동", "가동", "운동", "측면", "화면", "전면", "방면", "표면", "단면", "정면", "평면",
            "지면", "도면", "수면", "내면", "외면", "이면", "반면", "대면", "장면", "당면", "직면", "전동", "진동", "읍면동"}


def emd_names_in(msg: str) -> list[str]:
    out = []
    for m in EMD_RX.finditer(msg or ""):
        w = m.group(1)
        if w in EMD_STOP:
            continue
        if w not in out:
            out.append(w)
    return out


def _emds_of(sgg_cd: str) -> list[dict]:
    from landxi_api.regions import emd_index
    ix = emd_index(sgg_cd)
    if ix is None:
        return []
    return [{"emd_cd": c, "name": n, "bbox": [round(v, 6) for v in g.bounds], "sgg_cd": sgg_cd} for c, n, g in zip(ix.codes, ix.names, ix.geoms)]


def _same(a: str, b: str) -> bool:
    a, b = (a or "").replace(" ", ""), (b or "").replace(" ", "")
    return bool(a) and a == b


async def _emd_candidates(name: str) -> list[dict]:
    """전국에서 이 이름의 읍면동(실태조사 읍면동 표 + 받아 둔 읍면동 경계 파일) → [{emd_cd, name, sgg_cd}]."""
    import json as _json
    from landxi_api import config as gcfg
    hits: dict[str, dict] = {}
    try:
        from landxi_api.deps import db
        async with db(realm="lx") as conn:
            rows = await conn.fetch("SELECT emd_cd, name, sgg_cd FROM survey_emd WHERE replace(name,' ','') = $1 OR name LIKE $2", name, f"% {name}")
        for x in rows:
            nm = str(x["name"] or "").split(" ")[-1]
            if _same(name, nm):
                hits[str(x["emd_cd"])[:8]] = {"emd_cd": str(x["emd_cd"]), "name": nm, "sgg_cd": str(x["sgg_cd"] or str(x["emd_cd"])[:5])}
    except Exception:                                      # noqa: BLE001 — 표가 없으면 경계 파일만
        pass
    d = gcfg.DATA_ROOT / "cache" / "regions"
    for f in (sorted(d.glob("emd-*.geojson")) if d.exists() else []):
        try:
            fc = _json.loads(f.read_text(encoding="utf-8"))
        except Exception:                                  # noqa: BLE001
            continue
        for ft in fc.get("features") or []:
            pr = ft.get("properties") or {}
            if _same(name, pr.get("name")):
                cd = str(pr.get("emd_cd") or "")
                hits.setdefault(cd[:8], {"emd_cd": cd, "name": pr.get("name"), "sgg_cd": f.stem.split("-", 1)[1]})
    return list(hits.values())


async def resolve_emd(name: str, ctx, sgg: dict | None = None) -> tuple[dict, dict]:
    """읍면동 이름 → (시군구 행, {emd_cd, name, bbox}). 순서: 말한 시군구 → 지금 지도 시군구 → 전국(한 곳일 때만 · 여러 곳이면 되묻는다)."""
    from landxi_api.regions import region_of
    order = []
    if sgg:
        order.append(sgg)
    cur = region_of((ctx.context or {}).get("region")) if (ctx.context or {}).get("region") else None
    if cur and not sgg:
        order.append(cur)
    for r in order:
        hit = next((e for e in _emds_of(r["sgg_cd"]) if _same(name, e["name"])), None)
        if hit:
            guard_region(r, ctx)
            return r, hit
    if sgg:
        raise ToolError("not_found", f"{sgg['name']}에서 '{name}'을 찾지 못했습니다", 404)
    cands = await _emd_candidates(name)
    regs: dict = {}
    for c in cands:
        r = region_of(c["sgg_cd"])
        if r:
            regs.setdefault(r["sgg_cd"], (r, c))
    if not regs:
        raise ToolError("not_found", f"'{name}' 읍면동을 찾지 못했습니다", 404)
    if len(regs) > 1:
        raise ToolError("bad_request", f"'{name}'이 여러 시군구에 있습니다: " + " · ".join((r.get("full") or r["name"]) for r, _ in list(regs.values())[:5]))
    r, c = next(iter(regs.values()))
    guard_region(r, ctx)
    hit = next((e for e in _emds_of(r["sgg_cd"]) if _same(name, e["name"]) or e["emd_cd"][:8] == c["emd_cd"][:8]), None)
    if not hit:
        raise ToolError("not_found", f"'{name}' 읍면동 경계를 받을 수 없습니다", 404)
    return r, hit


async def map_region(args: dict, ctx) -> Out:
    emd_nm = str(args.get("emd") or "").strip()
    if emd_nm:
        sgg = resolve_region(args, ctx) if (args.get("sgg_cd") or args.get("name") or args.get("region")) else None
        r, e = await resolve_emd(emd_nm, ctx, sgg)
    else:
        r, e = resolve_region(args, ctx), None
    out = Out(source="지도 동작(브라우저)")
    out.ui_actions.append(region_action(r, e))
    out.whitelist |= {r["sgg_cd"]} | ({e["emd_cd"]} if e else set())
    where = (r.get("full") or r["name"]) + (f" {e['name']}" if e else "")
    out.data = {"이동": where, "실행": "됨 — 브라우저가 지도를 이 지역으로 옮겼다"}
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
    a = {"op": "map_layer", "layer": layer, "on": on}
    only = args.get("only")
    if only not in (None, "", False):
        a["only"] = True if only in (True, "true", "1") else str(only)[:20]
    out.ui_actions.append(a)
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


# ── 둘째 묶음(확인 16차 대화-2 ⓑ · expand 4 · 5 · 6) — 두 시점 나란히 · 범위 그리기 · 지도 그림 저장 ─────────────────────
COMPARE_RX = re.compile(r"(나란히|좌우|양옆|비교|견줘|가르기|스와이프).{0,24}(영상|시점|사진|해)|(영상|시점|사진).{0,24}(나란히|좌우|비교|견줘)|"
                        r"\d{4}\s*년?.{0,10}\d{4}\s*년?.{0,24}(비교|나란히|좌우)|두\s*시점")
COMPARE_NOT = re.compile(r"의심|필지|건수|몇|현장\s*확인|대장|사용량|차트")
DRAW_RX = re.compile(r"범위.{0,10}(그려|그리|그린|그리기)|그려서.{0,12}(분석|맡기)|그린\s*(곳|범위|영역).{0,10}(분석|만)|(영역|범위)\s*지정")
SNAP_RX = re.compile(r"(지도|화면).{0,14}(이미지|그림\s*파일|그림으로|사진으로|캡처|png|PNG|내려받|저장)|캡처\s*(해|떠)|스크린\s*샷")
SNAP_NOT = re.compile(r"보고서|공문|조문|법")
FIND_ONLY = re.compile(r"현장\s*확인\s*필요\s*(필지)?\s*(만|층|레이어)?\s*(보여|켜|표시|띄워)")
SERVICE_WORDS = re.compile(r"비닐하우스|건물|경작지|휴경지|주차장|해양쓰레기|방치\s*쓰레기|불법\s*소각|폐가|포트홀|도로\s*시설")
ONLY_RESULT = re.compile(r"결과\s*(만|층)|만\s*(보여|켜|표시)")
YEAR_RX = re.compile(r"(20\d{2})\s*년?")


def _years(t: str) -> list[int]:
    out = []
    for m in YEAR_RX.finditer(t or ""):
        y = int(m.group(1))
        if 2000 <= y <= 2100 and y not in out:
            out.append(y)
    return out[:2]


async def route_map(msg: str, ctx) -> dict | None:
    """지도 동작 문장 → {tool, args[, then]}. 지명이 있으면 먼저 그곳으로 옮기고 나서 확대 · 층 · 시점(규칙 ③ · expand 1).
    두 시점 · 범위 그리기 · 그림 저장(둘째 묶음)도 여기서 모델 없이 고른다. 섞인 자료 질문이면 None(모델 · 다른 직행)."""
    t = re.sub(r"\s+", " ", msg or "").strip()
    if t and len(t) <= 40 and XI_OPEN.search(t) and allowed("screen_open", ctx.principal):
        regs = _regions_in(t)
        return {"tool": "screen_open", "args": {"region": regs[0]["sgg_cd"]} if len({h["_key"] for h in regs}) == 1 else {}}
    if not t or len(t) > 80:
        return None
    from ... import talk
    groups = talk.regions_in(t)
    # 둘째 묶음 — 한 문장 한 동작
    if COMPARE_RX.search(t) and not COMPARE_NOT.search(t) and len(groups) <= 1:
        return {"tool": "map_compare", "args": {**({"region": talk.pick(ctx, groups[0])[0]["sgg_cd"]} if groups else {}), "years": _years(t)}}
    if DRAW_RX.search(t) and len(groups) <= 1:
        return {"tool": "map_draw", "args": {"region": talk.pick(ctx, groups[0])[0]["sgg_cd"]} if groups else {}}
    if SNAP_RX.search(t) and not SNAP_NOT.search(t):
        return {"tool": "map_snapshot", "args": {}}
    # '현장 확인 필요 필지만 보여 줘' — 층 켜기(숫자 질문은 다른 직행)
    if FIND_ONLY.search(t) and not re.search(r"몇|건수|얼마|목록|상위|차트|보고서", t):
        cand = [{"tool": "map_layer", "args": {"layer": "findings", "on": True, "only": True}}]
        return _with_place(t, groups, cand, ctx)
    # '○○읍으로 이동해서 비닐하우스 결과만 보여 줘' — 이동 먼저 + 그 서비스 결과 층만(expand 1)
    svc = SERVICE_WORDS.search(t)
    if svc and ONLY_RESULT.search(t) and (MOVE_RX.search(t) or SHOW_RX.search(t)) and not re.search(r"몇|건수|얼마|목록|상위|차트|보고서|대장|요약", t):
        cand = [{"tool": "map_layer", "args": {"layer": "results", "on": True, "only": re.sub(r"\s+", "", svc.group(0))}}]
        return _with_place(t, groups, cand, ctx, force_move=True)
    if re.search(DATA_WORDS, t) and not re.search(r"(분석\s*)?결과\s*(층|레이어)", t):
        return None
    cand = []
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
    if cand:
        return _with_place(t, groups, cand, ctx)
    # 이동만 — '○○로 이동' · '○○읍 보여 줘'
    regs = _regions_in(t)
    names = {h["_key"] for h in regs}
    emds = emd_names_in(t) if (MOVE_RX.search(t) or SHOW_RX.search(t)) else []
    if len(emds) == 1 and len(groups) <= 1:
        sg = talk.pick(ctx, groups[0])[0] if groups else None
        return {"tool": "map_region", "args": {**({"sgg_cd": sg["sgg_cd"]} if sg else {}), "emd": emds[0]}}
    if len(groups) == 1 and (MOVE_RX.search(t) or SHOW_RX.search(t)):
        sg, alts = talk.pick(ctx, groups[0])
        if alts:                                           # 같은 이름이 여러 곳 — 되묻지 않고 하나로 가고, 다른 곳은 꼬리 버튼(규칙 ③ 3)
            a0 = alts[0]
            talk.set_alt(ctx, a0.get("full") or a0["name"], q=f"{a0.get('full') or a0['name']}{talk.josa(a0['name'], ('으로', '로'))} 이동해 줘")
        if SHOW_RX.search(t) and not MOVE_RX.search(t) and len(names) == 1 and await _has_data(sg["sgg_cd"]):
            return None                                    # '○○ 보여 줘' — 결과가 있는 지역은 요약 직행(이동 + 대표 수치)
        return {"tool": "map_region", "args": {"sgg_cd": sg["sgg_cd"], "name": sg["name"]}}
    return None


def _with_place(t: str, groups: list, cand: list[dict], ctx, force_move: bool = False) -> dict | None:
    """지명(시군구 · 읍면동)이 있으면 그곳으로 먼저 옮기고 동작을 잇는다 — {tool: map_region, args, then: [동작…]}. 지명이 없으면 동작만."""
    from ... import talk
    if len(groups) > 1:
        return None
    emds = emd_names_in(t)
    move = None
    if len(emds) == 1:
        sg = talk.pick(ctx, groups[0])[0] if groups else None
        move = {"tool": "map_region", "args": {**({"sgg_cd": sg["sgg_cd"]} if sg else {}), "emd": emds[0]}}
    elif groups:
        sg, alts = talk.pick(ctx, groups[0])
        move = {"tool": "map_region", "args": {"sgg_cd": sg["sgg_cd"], "name": sg["name"]}}
        if alts:
            a0 = alts[0]
            talk.set_alt(ctx, a0.get("full") or a0["name"], q=f"{a0.get('full') or a0['name']}{talk.josa(a0['name'], ('으로', '로'))} 이동해 줘")
    if move is None:
        return dict(cand[0]) if len(cand) == 1 else None      # 지명 없이 동작 둘 이상은 지금처럼 모델 경로
    if len(cand) > 1:
        return None
    return {**move, "then": cand}                             # 이동 먼저 + 동작 하나(expand 1)


async def _has_data(sgg_cd: str) -> bool:
    """scope_guard 와 같은 판정(필지 적재 또는 공개 배포본) — 결과가 있는 지역인가."""
    try:
        from landxi_api.regions import derived
        dv = await derived()
        return sgg_cd in (dv.get("parcels") or {}) or any(not d.get("_test") and d.get("stage") in ("ga", "canary") for d in (dv.get("dp") or {}).get(sgg_cd, []))
    except Exception:
        return False


# ── 둘째 묶음 도구(확인 16차 대화-2 ⓑ) — 브라우저가 실행하고 끝 신호로 확인한다(그린 뒤에만 '놓았습니다') ─────────────────────
def _ko_epoch(e: dict) -> str:
    return f"{e['year']}년" + (f" {e['month']}월" if e.get("month") else "")


async def region_for(args: dict, ctx) -> dict | None:
    """도구 지역 — 인자 > 지명 > '우리 시' > 화면 지역 > 직전 지역(talk.resolve)."""
    from ... import talk
    if args.get("region") or args.get("sgg_cd") or args.get("name"):
        return resolve_region({"sgg_cd": args.get("sgg_cd"), "name": args.get("region") or args.get("name")}, ctx)
    r, _src, _alts = await talk.resolve(ctx, (ctx.state or {}).get("msg") or "")
    if r:
        guard_region(r, ctx)
    return r


async def imagery_epochs(ctx, r: dict) -> list[dict]:
    """그 시군구를 덮는 등록 영상 — 시점(연)마다 하나(덮는 넓이 큰 것 → 늦은 달 → 고운 해상도). 외부 바탕 · 결과 래스터는 뺀다(카탈로그 그대로)."""
    build = "tenant" if getattr(ctx.principal, "realm", None) == "tenant" else "lx"
    try:
        res = await ctx.http.get("/catalog/layers", params={"stage": "domestic", "build": build, "locale": "ko"})
        items = (res.json() or {}).get("items") or []
    except Exception:                                      # noqa: BLE001
        items = []
    bb = r.get("bbox")
    if not bb:
        return []
    area = max(1e-12, (bb[2] - bb[0]) * (bb[3] - bb[1]))
    rows = []
    for it in items:
        if it.get("role") != "imagery" or it.get("source") == "external" or re.search(r"change|landcover|lc-gt|gibs|xdworld", str(it.get("id"))):
            continue
        b = it.get("bounds")
        m = re.match(r"(\d{4})(?:-(\d{2}))?", str(it.get("epoch") or ""))
        if not b or not m or it.get("tile_ready") is False:
            continue
        ix = [max(bb[0], b[0]), max(bb[1], b[1]), min(bb[2], b[2]), min(bb[3], b[3])]
        cov = max(0.0, ix[2] - ix[0]) * max(0.0, ix[3] - ix[1]) / area
        if cov <= 0:
            continue
        rows.append({"id": it["id"], "year": int(m.group(1)), "month": int(m.group(2)) if m.group(2) else None, "cov": round(cov, 4),
                     "gsd": it.get("gsd_m"), "name": (it.get("name") or {}).get("ko") or it["id"]})
    wide = [x for x in rows if x["cov"] >= 0.05]
    pool = wide if len({x["year"] for x in wide}) >= 2 else rows
    best: dict = {}
    for x in sorted(pool, key=lambda x: (-x["cov"], -(x["month"] or 0), x["gsd"] or 9)):
        best.setdefault(x["year"], x)
    return sorted(best.values(), key=lambda x: (x["year"], x["month"] or 0))


def pick_pair(epochs: list[dict], want: list[int]) -> tuple[dict, dict, list[int]]:
    """말한 연도 → (앞, 뒤, 없던 연도). 없으면 가까운 해(앞은 이른 쪽 · 뒤는 늦은 쪽). 말하지 않으면 가장 최근 두 시점."""
    ys = [e["year"] for e in epochs]
    by = {e["year"]: e for e in epochs}

    def near(y, prefer_late):
        return sorted(ys, key=lambda v: (abs(v - y), -v if prefer_late else v))[0]
    missing = [y for y in want if y not in by]
    if len(want) >= 2:
        a, b = near(want[0], False), near(want[1], True)
        if a == b:
            rest = [v for v in ys if v != a]
            b = sorted(rest, key=lambda v: abs(v - want[1]))[0]
        a, b = min(a, b), max(a, b)
    elif len(want) == 1:
        b = near(want[0], True)
        rest = [v for v in ys if v != b]
        a = max([v for v in rest if v < b] or rest)
        a, b = min(a, b), max(a, b)
    else:
        a, b = ys[-2], ys[-1]
    return by[a], by[b], missing


async def map_compare(args: dict, ctx) -> Out:
    from ... import talk
    r = await region_for(args, ctx)
    if r is None:
        raise ToolError("bad_request", "어느 지역 영상을 비교할지 정하지 못했습니다", 400)
    eps = await imagery_epochs(ctx, r)
    out = Out(source="영상 목록(카탈로그)")
    out.whitelist |= {r["sgg_cd"]} | {str(e["year"]) for e in eps} | {str(e["month"]) for e in eps if e.get("month")}
    nm = r["name"]
    if len(eps) < 2:
        only = _ko_epoch(eps[0]) if eps else None
        out.data = {"지역": r.get("full") or nm, "시점": [only] if only else [], "실행": "안 함 — 시점이 둘 이상 없음"}
        out.answer = (f"{nm}에는 영상이 {only} 한 시점뿐이라 나란히 볼 수 없습니다." if only else f"{nm}에는 등록된 영상이 없어 나란히 볼 수 없습니다.")
        talk.set_next(ctx, talk.no_data_next(ctx, r.get("full"), r["sgg_cd"]))
        ctx.state["cannot"] = {"kind": "nodata"}
        return out
    want = [int(y) for y in (args.get("years") or []) if str(y).isdigit()][:2]
    a, b, missing = pick_pair(eps, want)
    out.ui_actions.append({"op": "map_compare", "sgg_cd": r["sgg_cd"], "prev_cd": r.get("prev_cd"), "name": nm, "full": r.get("full"), "bbox": r.get("bbox"),
                           "left": {"id": a["id"], "label": _ko_epoch(a), "year": a["year"], "month": a.get("month")},
                           "right": {"id": b["id"], "label": _ko_epoch(b), "year": b["year"], "month": b.get("month")}})
    out.data = {"지역": r.get("full") or nm, "왼쪽": _ko_epoch(a), "오른쪽": _ko_epoch(b), "실행": "브라우저가 가르기에 두 시점을 놓는다"}
    claim = f"{nm} {_ko_epoch(a)} · {_ko_epoch(b)} 영상을 좌우로 나눠 놓았습니다 — 가운데 선을 끌어 비교하세요."
    lead = ""
    if missing:
        got = [e for e in (a, b) if e["year"] not in want]
        lead = f"{' · '.join(str(y) + '년' for y in missing)} 영상은 없어 가까운 {' · '.join(_ko_epoch(e) for e in got)} 영상을 두었습니다."
    out.answer = (lead + " " + claim).strip()
    ctx.state["act_claims"] = [claim]
    others = [e for e in eps if e["id"] not in (a["id"], b["id"])]
    if others:
        o = others[-1]
        x, y = sorted([o, b], key=lambda e: (e["year"], e.get("month") or 0))
        talk.set_alt(ctx, f"{_ko_epoch(x)} · {_ko_epoch(y)} 비교", q=f"{nm} {x['year']}년과 {y['year']}년 영상을 나란히 비교해 줘")
    talk.set_next(ctx, [talk.btn(f"{nm} 현장 확인 필요 필지 몇 건", q=f"{nm} 현장 확인 필요 필지 몇 건이야?"),
                        talk.btn("지도 화면을 이미지로 저장해 줘")])
    return out


async def map_draw(args: dict, ctx) -> Out:
    from ... import talk
    r = await region_for(args, ctx)
    out = Out(source="지도 동작(브라우저)")
    p = ctx.principal
    if getattr(p, "realm", None) == "tenant" and getattr(p, "role", None) != "demo":
        # 기관은 분석을 실행하지 않는다(LX 가 한다) — 범위를 정해 맡기는 길은 분석 요청(규칙 ⑦ · 원칙 60 · 113)
        out.data = {"실행": "안 함 — 기관은 분석 요청으로"}
        out.answer = "분석은 LX가 합니다. 범위를 정해 분석을 맡기는 일은 분석 요청으로 합니다."
        talk.set_next(ctx, [talk.btn("분석 요청 보내기", q="분석 요청 보내 줘"), talk.btn("분석 요청 화면 열기", href="/landxi/v3/gov-request/")])
        ctx.state["cannot"] = {"kind": "scope"}
        return out
    a = {"op": "map_draw"}
    if r:
        a.update({"sgg_cd": r["sgg_cd"], "prev_cd": r.get("prev_cd"), "name": r["name"], "full": r.get("full"), "bbox": r.get("bbox")})
        out.whitelist |= {r["sgg_cd"]}
    out.ui_actions.append(a)
    out.data = {"지역": (r or {}).get("full") or "지금 지도", "실행": "브라우저가 분석 범위 그리기를 켠다"}
    claim = (f"{r['name']}에서 범위 그리기를 켰습니다 — " if r else "범위 그리기를 켰습니다 — ") + "지도 위에 분석할 범위를 끌어서 그리면 그 안만 분석할지 확인 카드가 뜹니다."
    out.answer = claim
    ctx.state["act_claims"] = [claim]
    if r:
        talk.set_next(ctx, [talk.btn(f"{r['name']} 전체 분석", q=f"{r['name']} 전역 분석 실행해 줘")])
    return out


async def map_snapshot(args: dict, ctx) -> Out:
    from ... import talk
    r = talk.here(ctx)
    out = Out(source="지도 동작(브라우저)")
    import datetime as _dt
    day = _dt.datetime.now(_dt.timezone(_dt.timedelta(hours=9))).strftime("%Y%m%d-%H%M")
    out.ui_actions.append({"op": "map_snapshot", "filename": f"지도_{(r or {}).get('name') or '화면'}_{day}.png", "caption": (r or {}).get("full") or ""})
    out.data = {"실행": "브라우저가 지금 지도 한 장을 그림 파일로 만든다"}
    claim = "지금 보이는 지도 한 장을 그림 파일로 만들었습니다(아래 내려받기)."
    out.answer = claim
    ctx.state["act_claims"] = [claim]
    if r:
        talk.set_next(ctx, [talk.btn(f"{r['name']} 보고서 초안 만들기", q=f"{r['name']} 보고서 초안 만들어 줘")])
    return out


ROUTE = route_map


HANDLERS.update({"map_region": map_region, "map_zoom": map_zoom, "map_view": map_view, "map_layer": map_layer, "screen_open": screen_open,
                 "map_compare": map_compare, "map_draw": map_draw, "map_snapshot": map_snapshot})
