"""범위 검사기(CHATGEO-DEV-ORDER WP-1 · P1–P3) — 답에 실린 숫자의 범위(지역 · 읍면동 · 분류)가 질문의 범위와 같은지 내보내기 직전에 맞춘다.

  asked_scope(ctx, msg)       질문이 말한 지역 · 읍면동 · 분류 · 지표(P2 ①) — talk.regions_in · 읍면동 경계 이름 · 분류 낱말 한 표(result_scope.CLASS_WORDS)
  env_scope(ctx, eid)         봉투 범위 — 도구가 Out.scope / Out.env(scope=) 로 적은 것 · 없으면 봉투 뜻 글에서(지역 이름 · 분류 낱말 · 지표 낱말)
  check(ctx, md, blocks)      → (고친 답, 고친 블록, 범위 dict) — 질문과 다른 범위의 숫자 · 파일은 빼고, 남는 숫자가 없으면 P3 문장
                              "물으신 {지역} {분류} 결과는 없습니다 — 있는 것은 {분류 목록}."
지역 · 지명 고정값 0(지역 표 · 읍면동 경계 · 분류 표에서 읽는다). LLM 0.
"""
from __future__ import annotations

import asyncio
import re

ENV_RX = re.compile(r"\{\{env:(e\d+)\}\}")
# 지표(분류가 아닌 숫자) — 이 말이 봉투 뜻에 있으면 그 지표 숫자다. 질문이 그 지표를 말하지 않고 분류를 말하면 다른 숫자로 본다(WP-1 ③).
METRIC_WORDS = [("결과 확인 대기", "review"), ("확인 대기", "review"), ("기관 신고", "report"), ("의심", "suspect"), ("현장 확인", "suspect"),
                ("국토 변화", "change"), ("어긋", "ledger"), ("대장", "ledger"), ("연속지적", "parcels"), ("지적 필지", "parcels")]
METRIC_ASK = {"review": r"확인\s*대기|검수", "report": r"신고", "suspect": r"의심|실태\s*조사|현장\s*확인|위반|무허가|불법",
              "change": r"변화|바뀐|새로\s*생긴|늘어|줄어|없어진", "ledger": r"대장|어긋|불부합", "parcels": r"필지|지적|지번"}
EMD_RX = re.compile(r"(?<![가-힣])([가-힣]{1,5}(?:읍|면|동|가))(?=만|에서|의|에|은|는|이|가|을|를|과|와|도|\s|,|$)")
EMD_SKIP = {"읍면동", "단동", "연동", "다동", "이동", "자동", "행동", "변동", "활동", "작동", "운동", "공동", "가동", "표면", "전면", "측면", "화면", "지면",
            "평면", "이면", "정면", "단면", "동네", "방면", "내면", "외면", "우리동"}
CITY_WIDE_KINDS = {"det", "suspect", "review", "report", "change", "ledger", None}


def _classes():
    from landxi_api import result_scope as RSC
    return RSC.CLASS_WORDS


def classes_in(text: str) -> set[str]:
    """글 안 분류 → 분류 이름 집합(한 표 · 같은 뜻은 같은 이름)."""
    t = text or ""
    out = set()
    for rx, name, _parent in _classes():
        if re.search(rx, t):
            out.add(name)
    return out


def family(names: set[str]) -> set[str]:
    """분류 + 위 분류(논 · 밭 · 과수원 → 경작지 · 휴경지 ↔ 경작지)."""
    out = set(names)
    for _rx, name, parent in _classes():
        if name in names and parent:
            out.add(parent)
    if "경작지" in out:
        out.add("휴경지")
    if "휴경지" in out:
        out.add("경작지")
    return out


def metrics_in(text: str) -> set[str]:
    return {k for w, k in METRIC_WORDS if w in (text or "")}


def asked_metrics(msg: str) -> set[str]:
    return {k for k, rx in METRIC_ASK.items() if re.search(rx, msg or "")}


def _region_codes(r: dict) -> set[str]:
    from landxi_api.regions import city_children
    cds = {r["sgg_cd"]}
    if r.get("prev_cd"):
        cds.add(r["prev_cd"])
    if r.get("parent_cd"):
        cds.add(r["parent_cd"])
    for c in city_children(r["sgg_cd"]):
        cds.add(c["sgg_cd"])
    return cds


def _emd_names(sgg: str | None) -> set[str]:
    if not sgg:
        return set()
    try:
        from landxi_api.regions import emd_index
        ix = emd_index(sgg)
        return {str(n) for n in (ix.names if ix is not None else []) if n}
    except Exception:  # noqa: BLE001
        return set()


async def asked_scope(ctx, msg: str) -> dict:
    """질문 → {sgg:{코드}, names:[이름], emd:[이름], cls:{분류}, metric:{지표}, home:bool}. 질문이 말하지 않은 칸은 비운다(화면 · 켜진 층으로 채우지 않는다 — 그건 도구가)."""
    from . import talk
    t = re.sub(r"\s+", " ", msg or "")
    out: dict = {"sgg": set(), "names": [], "emd": [], "cls": classes_in(t), "metric": asked_metrics(t)}
    for g in talk.regions_in(t):
        r, _alts = talk.pick(ctx, g)
        if r:
            out["sgg"] |= _region_codes(r)
            out["names"].append((r.get("name") or "").split(" ")[0] if " " in (r.get("name") or "") and len(g) > 1 else (r.get("name") or ""))
    if not out["sgg"] and talk.says_home(t):
        try:
            h = await talk.home(ctx)
        except Exception:  # noqa: BLE001
            h = None
        if h:
            out["sgg"] |= _region_codes(h)
            out["names"].append(h.get("name") or "")
            out["home"] = True
    base = None
    if out["sgg"]:
        base = sorted(out["sgg"])[0]
    else:
        cur = talk.here(ctx)
        base = (cur or {}).get("sgg_cd")
    names = _emd_names(base) if base else set()
    for m in EMD_RX.finditer(t):
        e = m.group(1)
        if e in EMD_SKIP or any(e.startswith(n.split(" ")[0][:-1]) and len(n.split(" ")[0]) >= 3 for n in out["names"] if n):
            continue
        if e in names:                                # 그 시군구 읍면동 경계 이름에 있을 때만('합치면' · '측면' 같은 말 오인 0)
            if e not in out["emd"]:
                out["emd"].append(e)
    return out


def _regions_text(text: str) -> set[str]:
    from . import talk
    cds = set()
    for g in talk.regions_in(text or ""):
        if len({(c.get("full") or "").split(" ")[0] for c in g}) == 1:
            for c in g:
                cds.add(c["sgg_cd"])
    return cds


def env_scope(ctx, eid: str) -> dict:
    """봉투 범위 — 도구가 적은 것이 먼저 · 빈 칸은 봉투 뜻 글로 채운다."""
    sc = dict((getattr(ctx, "env_scope", None) or {}).get(eid) or {})
    mean = str((ctx.env_meta or {}).get(eid) or "")
    if "cls" not in sc:
        c = classes_in(mean)
        if c:
            sc["cls"] = c
    elif sc["cls"] is not None:
        norm = set()
        for c in sc["cls"] or []:
            norm |= classes_in(str(c)) or {str(c)}
        sc["cls"] = norm or None
    if "kind" not in sc:
        m = metrics_in(mean)
        sc["kind"] = next(iter(m)) if len(m) == 1 else ("det" if "AI 분석 결과" in mean or "AI 탐지" in mean or sc.get("cls") else None)
    if "sgg" not in sc:
        cds = _regions_text(mean)
        if cds:
            sc["sgg"] = cds
    elif sc["sgg"] not in (None, "nation"):
        sc["sgg"] = set(sc["sgg"])
    if "emd" not in sc:
        e = [m.group(1) for m in EMD_RX.finditer(mean) if m.group(1) not in EMD_SKIP]
        if e:
            sc["emd"] = e
    return sc


def _drop_why(asked: dict, sc: dict) -> str | None:
    if not sc:
        return None
    s = sc.get("sgg")
    if asked["sgg"]:
        if s == "nation":
            return "region"
        if isinstance(s, set) and s and not (s & asked["sgg"]):
            return "region"
    if asked["emd"] and sc.get("emd") is None and sc.get("kind") in CITY_WIDE_KINDS and "emd" in sc:
        return "emd"                                  # 도구가 '시 전체'(emd=None)라고 적은 숫자
    if asked["emd"] and sc.get("emd") and not any(a in e or e in a for a in asked["emd"] for e in sc["emd"]):
        return "emd"
    k = sc.get("kind")
    if k == "suspect" and "change" in asked["metric"]:
        return None                                   # '농지가 ○○로 바뀐 곳' = 실태조사 의심 필지(용도 바뀜 규칙) — 답에 그 이름을 밝힌다(note_kind)
    if asked["cls"] and "change" not in asked["metric"]:   # '○○로 바뀐 곳'은 의심 필지 규칙 결과로 답한다(분류 결과가 아님 — _notes 가 밝힘)
        c = sc.get("cls")
        if c and not (family(set(c)) & family(asked["cls"])):
            return "cls"
        if k in ("review", "report", "suspect", "change", "ledger") and k not in asked["metric"] and not c:
            return "cls"
    elif asked["metric"] and k in ("review", "report") and k not in asked["metric"]:
        return "metric"
    return None


def _sentences(md: str) -> list[str]:
    parts = re.split(r"(?<=[.!?。])(\s+)|(\n)", md or "")
    out, buf = [], ""
    for p in parts:
        if p is None:
            continue
        buf += p
        if re.search(r"[.!?。]\s*$|\n$", buf):
            out.append(buf)
            buf = ""
    if buf:
        out.append(buf)
    return out


def _file_regions(blocks: list[dict]) -> list[tuple[int, set[str]]]:
    out = []
    for i, b in enumerate(blocks or []):
        if b.get("type") in ("file", "report"):
            out.append((i, _regions_text(str(b.get("label") or ""))))
    return out


async def have_line(ctx, asked: dict) -> str:
    """P3 의 '있는 것은 …' — 그 지역(없으면 화면 지역)의 결과 분류 이름(숫자 없이 · 같은 출처는 XI맵 통계 판 · 기관은 볼 수 있는 층)."""
    from . import talk
    sgg = None
    for cd in sorted(asked["sgg"]):
        sgg = cd
        break
    if not sgg:
        sgg = (talk.here(ctx) or {}).get("sgg_cd")
    names: list[str] = []
    try:
        if getattr(ctx.principal, "realm", None) == "lx" and sgg:
            from landxi_api import xdash as XD
            t = await asyncio.wait_for(XD.agg_task(sgg), 4)
            names = [r["k"] for r in t.get("rows") or [] if r.get("n")]
        else:
            from .tools.ext import mapsvc as MS
            jobs = await MS._jobs_on(ctx)
            if jobs:
                cls, _ = await asyncio.wait_for(MS._avail(jobs), 4)
                names = [MS._ko(c) for c in cls]
            try:                                       # 기관 — 지도 위 층 + 우리 서비스(결과가 있는 카드) 이름
                from landxi_api.deps import db
                from .tools import summary_lookup as SL
                async with db(ctx.principal) as conn:
                    res = await asyncio.wait_for(SL.build(conn, SL.tenant_arg(ctx.principal), region=sgg), 4)
                for it in res.get("items") or []:
                    if it.get("stage") != "첫 결과 전":
                        names.append(re.sub(r"\s*분석\s*서비스$", "", str(it.get("card_name") or "")))
            except Exception:  # noqa: BLE001
                pass
    except Exception:  # noqa: BLE001
        names = []
    seen = []
    for n in names:
        b = re.sub(r"\s*\(.*?\)$", "", str(n))
        if b and b not in seen:
            seen.append(b)
    return " · ".join(seen[:5])


def _josa(w: str, a: str, b: str) -> str:
    c = (w or " ")[-1]
    if "가" <= c <= "힣":
        return a if (ord(c) - 0xAC00) % 28 else b
    return b


PART_RX = re.compile(r"(\{\{env:(e\d+)\}\})\s*(?:필지|건|곳)?\s*중\s*(?:에서\s*)?(\{\{env:(e\d+)\}\})\s*(?:이|가|은|는)?\s*(?:실태조사\s*)?의심\s*필지로\s*분류되었습니다")
PART2_RX = re.compile(r"(\{\{env:(e\d+)\}\})\s*(?:필지|건|곳)?\s*중\s*(?:에서\s*)?(?:의심\s*필지(?:는|가)?\s*)?(\{\{env:(e\d+)\}\})")


def no_part_of(ctx, md: str) -> str:
    """'AI 분석 결과 n 중 m 이 의심'(WP-2) — 의심 필지는 AI 분석 결과의 부분이 아니다(세는 범위가 다르다). 두 숫자를 나란히 쓴다."""
    def fix(m):
        a, b = m.group(2), m.group(4)
        ma, mb = str(ctx.env_meta.get(a) or ""), str(ctx.env_meta.get(b) or "")
        if "의심" in mb and "의심" not in ma:
            return f"{m.group(1)} · 의심 필지 {m.group(3)}"
        return m.group(0)
    md = PART_RX.sub(lambda m: fix(m) + "입니다", md or "")
    return PART2_RX.sub(fix, md)


async def check(ctx, md: str, blocks: list[dict]) -> tuple[str, list[dict], dict]:
    """→ (답, 블록, 범위). 범위 = {region, emd, cls, dropped:[{env, why}]}(agent.done.scope)."""
    md = no_part_of(ctx, md)
    md = re.sub(r"(?:으므로|으니|아서|어서|아|어)?\s*확인되지\s*않음(?:입니다)?(?=[.\s]|$)", " 확인할 수 없습니다", md or "")   # 모델이 쓴 '확인되지 않음'(자리표 아님)
    msg = ctx.state.get("msg") or ""
    asked = await asked_scope(ctx, msg)
    nd = NODATA_RX.match((md or "").strip())
    if nd and (JIBUN_RX.search(msg) or ((asked["sgg"] or asked["emd"] or asked["cls"]) and _region_has(ctx, asked))):   # 뭉뚱그린 '데이터 없음' → 무엇이 없는지(P3 · WP-5 ② · WP-8 ②)
        return await _p3(ctx, msg, asked, blocks), blocks, {"region": " · ".join(n for n in asked["names"] if n) or None,
                                                            "emd": asked["emd"] or None, "cls": sorted(asked["cls"]) or None, "dropped": []}
    if len([n for n in asked["names"] if n]) == 1 and not asked.get("home") and "해당 지역" in (md or ""):   # '해당 지역' 대신 물은 지역 이름(무엇을 셌는지 · P3)
        md = md.replace("해당 지역", asked["names"][0])
    scope = {"region": " · ".join(n for n in asked["names"] if n) or None, "emd": asked["emd"] or None,
             "cls": sorted(asked["cls"]) or None, "dropped": []}
    if not (asked["sgg"] or asked["emd"] or asked["cls"] or asked["metric"]):
        return md, blocks, scope
    drop: dict[str, str] = {}
    for eid in dict.fromkeys(ENV_RX.findall(md or "")):
        why = _drop_why(asked, env_scope(ctx, eid))
        if why:
            drop[eid] = why
    bad_blocks = set()
    if asked["sgg"]:
        for i, cds in _file_regions(blocks):
            if cds and not (cds & asked["sgg"]):
                bad_blocks.add(i)
    steps = {i for (i, _k), eid in (ctx.keymap or {}).items() if eid in drop}
    for i, b in enumerate(blocks or []):
        if b.get("type") in ("file", "report", "chart", "table") and b.get("step") in steps:
            rows = [r for r in (b.get("rows") or []) if r.get("env") not in drop]
            if b.get("type") in ("file", "report") or not rows:
                bad_blocks.add(i)
    if not drop and not bad_blocks:
        return _notes(ctx, md, asked), blocks, scope
    scope["dropped"] = [{"env": k, "why": v} for k, v in drop.items()] + [{"block": i, "why": "region"} for i in sorted(bad_blocks)]
    blocks = [b for i, b in enumerate(blocks or []) if i not in bad_blocks]
    kept = [s for s in _sentences(md) if not (set(ENV_RX.findall(s)) & set(drop))]
    left = "".join(kept).strip()
    if left and ENV_RX.search(left) and not bad_blocks:
        return _notes(ctx, left, asked), blocks, scope
    where = " ".join(x for x in (" · ".join(n for n in asked["names"] if n), " · ".join(asked["emd"])) if x)
    if not where:
        cur = None
        try:
            from . import talk
            cur = talk.here(ctx)
        except Exception:  # noqa: BLE001
            cur = None
        where = (cur or {}).get("name") or ""
    what = " · ".join(_ask_words(msg)) or ""
    whys = set(drop.values())
    if whys == {"emd"} and not bad_blocks and asked["emd"]:   # 읍면동을 물었는데 시 전체 숫자만 — 다시 세기로 잇는다(그 읍면동 결과가 없다고 하지 않는다)
        e0 = asked["emd"][0]
        ctx.state["cannot"] = {"kind": "other"}
        try:
            from . import talk
            talk.set_next(ctx, [talk.btn(f"{e0} {what} 몇 곳".strip(), q=f"{e0} {what} 몇 곳이야?".replace("  ", " "))], front=True)
        except Exception:  # noqa: BLE001
            pass
        return f"이 답의 숫자는 시 전체 숫자라 뺐습니다 — {e0}만 세려면 아래 단추를 눌러 주세요.", blocks, scope
    have = await have_line(ctx, asked)
    text = (f"{where}에는 " if where else "") + (f"물으신 {what} 결과가 없습니다" if what else "물으신 범위의 결과가 없습니다")
    text += f" — 있는 것은 {have}." if have else "."
    ctx.state["cannot"] = {"kind": "nodata"}
    try:
        from . import talk
        nm = (asked["names"] or [None])[0] or where.split(" ")[0]
        if nm and not ctx.state.get("next"):
            talk.set_next(ctx, [talk.btn(f"{nm} 결과 요약", q=f"{nm} 결과 요약해 줘")])
    except Exception:  # noqa: BLE001
        pass
    return text, blocks, scope


def _ask_words(msg: str) -> list[str]:
    """질문에 쓴 분류 낱말 그대로(사용자 말) — '논' · '창고' · '휴경지'."""
    out = []
    for rx, name, _p in _classes():
        m = re.search(rx, msg or "")
        if m and name not in out:
            out.append(m.group(0) if (len(m.group(0)) <= 6 and " " not in m.group(0)) else name)
    return out


def _notes(ctx, md: str, asked: dict) -> str:
    """덧붙임 한 줄(WP-12 · P4) — ① 두 지역 이상을 물었는데 일부만 답함 ② 분류를 물었는데 실태조사 의심 필지로 답함."""
    out = md or ""
    names = [n for n in asked.get("names") or [] if n]
    if len(names) >= 2 and ENV_RX.search(out):
        miss = [n for n in names if n not in out and (n[:-1] if n[-1] in "시군구" else n) not in out]
        if miss and len(miss) < len(names):
            out = out.rstrip() + f" 부분 답 — {' · '.join(miss)}{_josa(miss[-1], '은', '는')} 이 답에 싣지 않았습니다."
    kids = [nm for _rx, nm, parent in _classes() if parent and nm in asked.get("cls", set())]
    if kids and ENV_RX.search(out) and "나누지 않" not in out:   # 논 · 밭 · 과수원 — 숫자는 위 분류(경작지) 전체(이름표 바뀜 막기)
        ids = ENV_RX.findall(out)
        if all(not (env_scope(ctx, e).get("cls") or set()) & set(kids) for e in ids):
            out = out.rstrip() + f" {kids[0]}{_josa(kids[0], '은', '는')} 따로 나누지 않습니다 — 이 숫자는 경작지 전체입니다."
    if asked.get("cls") and "change" in asked.get("metric", set()):
        ids = ENV_RX.findall(out)
        kinds = {env_scope(ctx, e).get("kind") for e in ids}
        if ids and kinds <= {"suspect", None} and "suspect" in kinds:
            w = " · ".join(_ask_words(ctx.state.get("msg") or "")) or "그 분류"
            out = out.rstrip() + f" {w} 분류 결과가 아니라 실태조사 의심 필지입니다."
    return out


NODATA_RX = re.compile(r"^(?:해당\s*지역(?:의|에)?\s*(?:\S+\s*)?데이터가\s*없습니다|[가-힣\s]{1,20}(?:은|는)\s*(?:아직\s*)?AI\s*분석\s*결과가\s*없습니다)\.?$")
JIBUN_RX = re.compile(r"(?:[가-힣]+(?:리|동|가)|산)\s?\d+(?:-\d+)?")


async def _p3(ctx, msg: str, asked: dict, blocks) -> str:
    """'해당 지역 데이터가 없습니다' 대신 — 지번이면 '그 지번을 찾지 못함', 아니면 '○○에는 △△ 결과가 없습니다 — 있는 것은 □□'."""
    from . import talk
    ctx.state["cannot"] = {"kind": "nodata"}
    if JIBUN_RX.search(msg or ""):
        nm = (asked["names"] or [""])[0]
        has_parcels = False
        try:
            from landxi_api.regions import _derived
            pc = (_derived.get("data") or {}).get("parcels") or {}
            has_parcels = any(c in pc for c in asked["sgg"])
        except Exception:  # noqa: BLE001
            pass
        if nm and not has_parcels:
            talk.set_next(ctx, [talk.btn(f"{nm} 결과 요약", q=f"{nm} 현황 보여 줘")])
            return f"{nm}에는 연속지적 필지가 없어 지번으로 찾을 수 없습니다 — {nm} AI 분석 결과는 볼 수 있습니다."
        talk.set_next(ctx, [talk.btn("지번 찾는 법", q="ChatGEO로 뭘 할 수 있어?")])
        return (f"{nm}에서 " if nm else "") + "그 지번의 필지를 찾지 못했습니다 — 시군구 · 읍면동 · 지번을 함께 말씀해 주세요."
    where = " ".join(x for x in (" · ".join(n for n in asked["names"] if n), " · ".join(asked["emd"])) if x)
    if not where:
        where = (talk.here(ctx) or {}).get("name") or ""
    what = " · ".join(_ask_words(msg))
    have = await have_line(ctx, asked)
    nm = (asked["names"] or [where.split(" ")[0] if where else ""])[0]
    if nm and not ctx.state.get("next"):
        talk.set_next(ctx, [talk.btn(f"{nm} 결과 요약", q=f"{nm} 결과 요약해 줘")])
    return (f"{where}에는 " if where else "") + (f"물으신 {what} 결과가 없습니다" if what else "물으신 범위의 결과가 없습니다") + (f" — 있는 것은 {have}." if have else ".")


def _region_has(ctx, asked: dict) -> bool:
    """물은 시군구(없으면 화면 시군구)에 결과가 있나 — 결과가 정말 없는 곳의 '결과 없음'은 그대로 둔다(가드 문장 그대로 · M10)."""
    from . import talk
    cds = set(asked["sgg"]) or {(talk.here(ctx) or {}).get("sgg_cd")}
    return any(c and talk._has_data_sync(c) for c in cds)
