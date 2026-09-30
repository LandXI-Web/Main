"""도구 ledger_findings(F3 §3 S-10) — 대장 × AI × 연속지적이 어긋난 필지(대장 규칙) · 개수 봉투 · 읍면동별 · 지도 도착.

읍면동 집계(by=emd · 기본 상위 8, by=emd 면 상위 20)는 봉투로만 내고, 두 곳 이상이면 명령 바 막대 차트 블록(plan 3.3 · 값 = 봉투 key)을 붙인다.

대장이 없으면 '이 기관에 농지대장이 없습니다 → 올리기' 한 줄(의심 0 · 지어내지 않음). 타 기관 403.
"""
from __future__ import annotations

import json
import re

from . import Out, ToolError
from . import scope as S
from .ledger_ingest import KIND_KO, latest_import, tenant_for

RULE_KIND = {"L1": "farm_ledger", "L2": "farm_ledger", "L3": "dev_permit"}

# ── 물어본 대장 지목(r3-fusion 실증 2차) — '논인데 AI가 건물' 은 대장 지목 답만 센다(조건을 빼고 답하지 않는다) ──
# 논 = 답 · 밭 = 전 · 과수원. 결과마다 규칙 근거(evidence.ledger.value = 그 필지의 대장 지목)로 거른다.
JIMOK = ("답", "전", "과수원")
JM_SAY = {"답": "답(논)", "전": "전(밭)", "과수원": "과수원"}
_T = r"(?=인|이|은|에|과|와|을|도|만|중|으|\s|[·,/]|$)"
_J = r"(?=인데|이고|이며|이면|인\s|인$|으로|\s*[·,/]|\s*(?:과|와|이나|또는)\s)"
_JM_RX = {
    "답": [re.compile(r"(?<![가-힣])논" + _T), re.compile(r"(?<![가-힣])답" + _J),
          re.compile(r"(?:대장|지목)(?:상|에서|이|은|의|이\s)?\s*답(?=인|이|으|\s|$|[·,/])"),
          re.compile(r"(?:^|[^가-힣])(?:전|논|밭)\s*[·,/]\s*답(?=인|이|으|중|[^가-힣]|$)")],
    "전": [re.compile(r"(?<![가-힣])밭" + _T), re.compile(r"(?<![가-힣])전" + _J),
          re.compile(r"(?:대장|지목)(?:상|에서|이|은|의|이\s)?\s*전(?=인|이|으|\s|$|[·,/])"),
          re.compile(r"(?:^|[^가-힣])(?:답|논|밭)\s*[·,/]\s*전(?=인|이|으|중|[^가-힣]|$)")],
    "과수원": [re.compile(r"과수원|과원")],
}


def asked_jimok(text: str | None) -> list[str]:
    """질문 속 대장 지목(논 · 밭 · 답 · 전 · 과수원) → ['답', '전', '과수원'] 중. 세 가지 모두(= 농지)면 빈 목록(거르지 않음)."""
    s = str(text or "")
    got = [k for k in JIMOK if any(rx.search(s) for rx in _JM_RX[k])]
    return [] if len(got) == len(JIMOK) else got


def jimok_of(v) -> str | None:
    """대장 지목 값 → 답 · 전 · 과수원(논 · 밭 · 과 같은 다른 표기 포함) · 모르면 None."""
    s = str(v or "").strip()
    if not s:
        return None
    if s.startswith("과수") or s in ("과", "과원"):
        return "과수원"
    if s[0] in ("답", "논"):
        return "답"
    if s[0] in ("전", "밭"):
        return "전"
    return s


def _rule_name(rid: str) -> str:
    """규칙 이름(규칙 파일) — 화면·답에는 코드(L1) 대신 이름."""
    try:
        from landxi_api.ledger import ledger_rules
        return (ledger_rules().get(rid) or {}).get("name") or "대장과 다른 필지"
    except Exception:
        return "대장과 다른 필지"


def chart_block(title: str, by_emd: list[dict]) -> dict | None:
    """막대 차트 블록 — 값은 봉투 key 로만(숫자 직접 금지). 읍면동이 두 곳 이상일 때만."""
    if len(by_emd) < 2:
        return None
    return {"kind": "bar", "title": title, "rows": [{"label": r["읍면동"], "env": r["건수"]} for r in by_emd]}


async def emd_rows(ctx, out: Out, import_id: str, rid: str, rn: str, top: int) -> list[dict]:
    """읍면동별 어긋난 필지 수(GET /survey/stats?by=emd&ledger=) → 봉투 emd_n + 차트 블록."""
    st = await ctx.http.get("/survey/stats", params={"by": "emd", "ledger": import_id})
    by_emd: list[dict] = []
    if st.status_code != 200:
        return by_emd
    rows = [x for x in st.json().get("items") or [] if ((x.get("ledger_findings") or {}).get(rid) or {}).get("value")]
    rows.sort(key=lambda x: -x["ledger_findings"][rid]["value"])
    for i, x in enumerate(rows[:top], 1):
        out.env(f"emd_{i}", f"{x['key']} {rn}", x["ledger_findings"][rid])
        by_emd.append({"읍면동": x["key"], "건수": f"emd_{i}"})
    ch = chart_block(f"읍면동별 {rn}", by_emd)
    if ch is not None and hasattr(out, "blocks"):
        out.blocks.append({"type": "chart", **ch})
    return by_emd


def jimok_asked(args: dict, ctx, kind: str) -> list[str]:
    """인자 jimok(목록 · 쉼표) → 없으면 이 질문(ctx.state.msg)에서. 농지대장 규칙만."""
    if kind != "farm_ledger":
        return []
    v = args.get("jimok")
    if v:
        vals = v if isinstance(v, list) else str(v).split(",")
        got = sorted({jimok_of(x) for x in vals if jimok_of(x) in JIMOK}, key=JIMOK.index)
        return [] if len(got) == len(JIMOK) else got
    st = getattr(ctx, "state", None)
    return asked_jimok(st.get("msg") if isinstance(st, dict) else None)


def _ledger_value(it: dict):
    ev = it.get("evidence")
    if isinstance(ev, str):
        try:
            ev = json.loads(ev)
        except ValueError:
            ev = None
    return ((ev or {}).get("ledger") or {}).get("value") if isinstance(ev, dict) else None


async def by_jimok(ctx, rid: str, import_id: str, first: dict, jm: list[str]) -> list[dict] | None:
    """이 대장의 규칙 결과 전체를 읽어 대장 지목이 jm 인 것만(점수순 그대로). 전체를 못 읽거나 지목 모르는 결과가 있으면 None."""
    tot = int(((first.get("total") or {}).get("value")) or 0)
    items = list(first.get("items") or [])
    off = len(items)
    while len(items) < tot:
        r = await ctx.http.get("/survey/findings", params={"rule": rid, "ledger": import_id, "sort": "score", "limit": 2000, "offset": off})
        if r.status_code != 200:
            return None
        got = r.json().get("items") or []
        if not got:
            break
        items += got
        off += len(got)
    if len(items) < tot:
        return None
    vals = [jimok_of(_ledger_value(it)) for it in items]
    if any(v is None for v in vals):
        return None
    return [it for it, v in zip(items, vals) if v in jm]


def emd_rows_of(out: Out, items: list[dict], rn: str, top: int, t0: dict) -> list[dict]:
    """거른 결과의 읍면동별 수(결과 행의 읍면동) → 봉투 emd_n + 차트 블록 — emd_rows 와 같은 모양."""
    cnt: dict[str, int] = {}
    for it in items:
        k = it.get("emd")
        if k:
            cnt[k] = cnt.get(k, 0) + 1
    by_emd: list[dict] = []
    for i, (k, n) in enumerate(sorted(cnt.items(), key=lambda x: -x[1])[:top], 1):
        out.env(f"emd_{i}", f"{k} {rn}", {"value": n, "unit": "필지", "basis": t0.get("basis") or "inferred", "as_of": t0.get("as_of"),
                                          "source": t0.get("source") or "survey_findings", "note": "물어본 지목만"})
        by_emd.append({"읍면동": k, "건수": f"emd_{i}"})
    ch = chart_block(f"읍면동별 {rn}", by_emd)
    if ch is not None and hasattr(out, "blocks"):
        out.blocks.append({"type": "chart", **ch})
    return by_emd


async def ledger_findings(args: dict, ctx) -> Out:
    tenant = tenant_for(ctx, args)
    rid = (args.get("rule_id") or args.get("rule") or "L1").upper()
    kind = RULE_KIND.get(rid, "farm_ledger")
    imp = None
    if args.get("import_id"):                             # 화면의 대장(context.ledger) — 규칙 종류가 같을 때만
        imp = await latest_import(ctx, tenant, None, str(args["import_id"]))
        if imp and imp.get("kind") and imp.get("kind") != kind:
            imp = None
    imp = imp or await latest_import(ctx, tenant, kind)
    out = Out(source="GET /api/v1/survey/findings?ledger=latest")
    if not imp or imp.get("state") != "matched":
        out.data = {"안내": f"이 기관에 {KIND_KO.get(kind, '대장')}이 없습니다 → 올리기" if not imp else "대장을 필지에 이어 붙이는 중입니다"}
        out.ui_actions.append({"op": "drawer_open", "kind": "ledger", "tab": "upload"})
        return out
    ai = imp.get("ai") if isinstance(imp.get("ai"), dict) else None
    if ai is not None and not ai.get("has"):              # 대장은 붙었지만 그 시군구에 AI 결과가 없다 — 0 필지가 아니라 'AI 분석 전'
        names = [x.get("name") for x in ai.get("sgg") or [] if x.get("name")] or [x.get("name") for x in imp.get("sgg") or [] if x.get("name")]
        out.data = {"대장": KIND_KO.get(kind), "지역": names, "상태": "AI 분석 전",
                    "안내": "이 지역은 아직 AI 분석 결과가 없어 대장과 대조하지 못했습니다(영상 등록 · 전역 분석 뒤 자동 대조)"}
        out.env("rows", "올린 대장 행 수", imp["rows"])
        return out
    top = max(1, min(int(args.get("top") or 10), 50))
    res = await ctx.http.get("/survey/findings", params={"rule": rid, "ledger": imp["import_id"], "sort": "score", "limit": 200})
    if res.status_code == 403:
        raise ToolError("tool_forbidden", "이 기관의 데이터가 아닙니다", 403)
    if res.status_code >= 400:
        raise ToolError("upstream_error", "의심 목록을 읽지 못했습니다", res.status_code)
    j = res.json()
    items = j.get("items") or []
    rn = _rule_name(rid)
    top_emd = 20 if str(args.get("by") or "").lower() == "emd" else 8
    jm = jimok_asked(args, ctx, kind)
    jm_miss = None
    if jm:                                                # 물어본 지목만 센다 — 못 거르면 조건을 뺐다고 밝힌다(지목 조건 없이 센 값)
        got = await by_jimok(ctx, rid, imp["import_id"], j, jm)
        if got is None:
            jm_miss = "·".join(JM_SAY[x] for x in jm)
        else:
            items = got
            rn = f"{rn} · 대장 지목 {'·'.join(JM_SAY[x] for x in jm)}"
    t0 = j.get("total") or {}
    if jm and not jm_miss:
        out.env("total", f"{rn} 필지(올린 대장 × AI 대조 · 물어본 지목만)", {"value": len(items), "unit": "필지", "basis": t0.get("basis") or "inferred",
                                                                        "as_of": t0.get("as_of"), "source": t0.get("source") or "survey_findings",
                                                                        "note": "규칙 근거의 대장 지목으로 거름 · 검수 전"})
    else:
        lab = f"{rn} 필지(올린 대장 × AI 대조 · 조건에 맞는 전체" + (" · 지목 조건 없이)" if jm_miss else ")")
        out.env("total", lab, {**t0, "unit": "필지"})     # 규칙 결과 = 필지당 1건
    out.env("shown", "그중 지도에 표시한 필지(근거 면적 상위 · 표시 상한)", {"value": min(top, len(items)), "unit": "필지", "basis": "measured",
                                                         "as_of": t0.get("as_of"), "source": "GET /api/v1/survey/findings · 상위", "note": "반환 행 수"})
    if jm and not jm_miss:
        by_emd = emd_rows_of(out, items, rn, top_emd, t0)
    else:
        by_emd = await emd_rows(ctx, out, imp["import_id"], rid, rn, top_emd)
    feats, xs, ys, rows_out = [], [], [], []
    from .survey import _geoms
    geo = await _geoms(ctx, [it["pnu"] for it in items[:top]])          # 필지 폴리곤(사용자 RLS) — 없으면 대표점
    for n, it in enumerate(items[:top], 1):
        ll = it.get("lnglat") or [None, None]
        addr = S.short_addr(it.get("addr"))
        k = f"evid_{n}"
        out.env(k, f"[{n}] AI 근거 면적", it["evid_m2"])
        rows_out.append({"n": n, "pnu": it["pnu"], "주소": addr, "지목": it.get("jimok"), "근거면적": k, "등급": it.get("priority")})
        for t in (addr, it["pnu"]):
            for m in __import__("re").findall(r"\d+(?:-\d+)?", str(t)):
                out.whitelist.add(m)
        if ll[0] is not None:
            bb = [ll[0] - 0.0006, ll[1] - 0.0005, ll[0] + 0.0006, ll[1] + 0.0005]
            xs += [bb[0], bb[2]]
            ys += [bb[1], bb[3]]
            out.citations.append({"kind": "parcel", "pnu": it["pnu"], "finding_id": it["id"], "addr": addr, "bbox": bb, "center": ll,
                                  "rule": rid, "set": "survey/findings", "sgg_cd": str(it["pnu"])[:5], "import_id": imp["import_id"],
                                  "label": f"{addr} · {rn}", "env_keys": [k]})
            g = (geo.get(it["pnu"]) or {})
            if g.get("_bbox"):
                bb = g["_bbox"]
                xs[-2:], ys[-2:] = [bb[0], bb[2]], [bb[1], bb[3]]
            feats.append({"type": "Feature", "geometry": g.get("_geom") or {"type": "Point", "coordinates": ll},
                          "properties": {"n": n, "pnu": it["pnu"], "rule": rid, "priority": it.get("priority")}})
    sggs = sorted({str(it.get("pnu") or "")[:5] for it in items if it.get("pnu")})
    out.data = {"조건": rn, "대장": KIND_KO.get(kind), "지역": [S.name_of(c) or c for c in sggs], "items": rows_out, "읍면동별": by_emd,
                "비고": "대장 × AI 분석 × 연속지적 대조 · 검수 전 · 위법 판정 아님"}
    if jm_miss:
        out.data["지목"] = f"지목별로는 나누지 못했습니다 — '{jm_miss}' 조건 없이 센 값입니다"
    out.citations.insert(0, {"kind": "list", "rule": rid, "import_id": imp["import_id"], "sgg_cd": sggs[0] if len(sggs) == 1 else None,
                             "label": f"{rn} · {KIND_KO.get(kind)} 대조", "env_keys": ["total"]})
    if xs:
        out.raw = {"bbox": [min(xs), min(ys), max(xs), max(ys)], "features": feats, "count_key": "shown", "total_key": "total", "set": "survey/findings",
                   "filter": {"rule": rid, "ledger": imp["import_id"], "sgg_cd": sggs[0] if len(sggs) == 1 else None, "sgg_cds": sggs},
                   "label": f"물어본 조건 · {rn}"}
    return out
