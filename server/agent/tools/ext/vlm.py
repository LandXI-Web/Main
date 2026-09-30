"""도구 crop_tiles · vlm_describe(C2 ⑥ 영상 검수 보조 · c2-vlm-global) — plan.md 3.1 확장 자리 계약.

· crop_tiles    필지(지번 · PNU · 의심 건) 또는 AI 결과 피처 경계로 등록 영상 조각(최대 4시점 · 경계선 겹침 · PNG)을 만든다.
· vlm_describe  조각 + 필지 정보를 vLLM Gemma 4 비전에 보내 '보이는 것 · AI 결과와 맞는지 · 오탐 가능성' 세 줄을 받는다.
  명령 바에 image 블록(꼬리표 'AI 의견 · 근거 아님')으로 낸다. 이미지 토큰도 run 토큰에 더해져 기관 사용량(llm_tokens)으로 계량된다.
· 관할: 기관 세션은 관할 시군구(regions.tenant_scope · 옛/새 코드) 안 필지만. 밖이면 403 '이 기관의 데이터가 아닙니다'. 해외 기관은 쓰지 않는다.
· 조각은 run 산출 폴더(LX_DATA_ROOT/agent/{run_id}/)에만 두고 run 소유 기관만 내려받는다(원본·타일 제공 아님).
  기본값(c2-vlm-global · 기록): 등록 영상의 내보내기 정책이 'never' 여도 관할 필지 조각(한 변 약 200 m 이하)은 만든다.
  LX_VLM_TENANT_POLICY=strict 이면 기관 세션은 'tenant'·'public' 정책 영상만 쓴다.
"""
from __future__ import annotations

import asyncio
import json
import os
import re

from agent.tools import Out, ToolError

TAG = {"ko": "AI 의견 · 근거 아님", "en": "AI opinion · not evidence"}
PARA = chr(10) * 2                    # 답 문단 나눔(명령 바가 빈 줄을 줄바꿈으로 그린다)
TARGET = {
    "jibun": {"type": "string", "description": "지번(읍면동 · 리 · 번지, 예: '운봉읍 준향리 824-9')"},
    "pnu": {"type": "string", "description": "19자리 PNU"},
    "finding_id": {"type": "string", "description": "의심 건 id"},
}
SPECS = {
    "vlm_describe": {
        "description": "필지 영상 설명(영상 검수 보조) — 필지(지번 · PNU · 의심 건)의 등록 영상 조각(최대 4시점)을 AI 비전이 보고 "
                       "'보이는 것 · AI 결과와 맞는지 · 오탐 가능성' 세 줄 의견을 낸다(근거 아님). "
                       "'○○ 영상 보고 설명해 줘' · '이 필지 영상 설명' · '영상 설명' 요청은 반드시 이것 하나로 답한다.",
        "properties": {**TARGET, "emd": {"type": "string", "description": "읍면동 이름 — 필지를 말하지 않고 '의심 필지 영상'만 말하면 그 읍면동(없으면 관할) 의심 필지 1위"},
                       "suspect_top": {"type": "boolean", "description": "필지를 말하지 않은 '의심 필지 영상 설명' — 우선순위 1위 의심 필지"},
                       "rank": {"type": "integer", "description": "직전 답(목록)의 n위 필지 — '1위 필지 영상' · '세 번째 필지 영상'"},
                       "prev": {"type": "boolean", "description": "'그 · 이 · 해당 필지 영상' — 직전 답이 말한 필지"}}},
    "crop_tiles": {
        "description": "필지 또는 AI 결과 피처 경계로 등록 영상 조각(최대 4시점 · 경계선 겹침)을 만들어 보인다(설명 없음). '영상 조각 보여 줘'.",
        "properties": {**TARGET, "feature_id": {"type": "string", "description": "AI 결과 피처 id(숫자)"}}},
}
HANDLERS: dict = {}
WRITE: set = set()
CONFIRM: set = set()
CLIENT: set = set()
WHY = {"vlm_describe": "영상 조각 → AI 비전 의견(근거 아님)", "crop_tiles": "영상 조각(최대 4시점)"}
HINT = ("필지 영상을 보고 설명해 달라는 요청('영상 보고 설명' · '영상 설명' · '영상 확인')은 vlm_describe 를 한 번만 부른다(지번 · PNU · 직전 목록의 순위 rank · '그 필지'면 prev). "
        "답은 도구가 준 세 줄을 그대로 옮기고 'AI 의견 · 근거 아님'을 덧붙인다. 비전 의견에는 숫자를 쓰지 않는다. "
        "vlm_describe 를 부르지 않았으면 영상을 보거나 분석한 것처럼 쓰지 않고 그 꼬리표도 쓰지 않는다.")

AI_CLS_OF_RULE = {"R1": "건물", "R3": "비닐하우스", "R4": "주차장", "R5": "경작지", "R6": "건물", "L1": "건물", "L3": "건물", "R2": "경작지", "L2": "경작지"}


def allowed(name: str, p) -> bool:
    if p.realm == "lx":
        return p.role in ("staff", "admin")
    if p.realm == "tenant":
        try:
            from landxi_api.regions import tenant_scope
            return tenant_scope(p.tenant_id) is not None          # 해외 기관(global) = None → 국내 필지 영상 도구 없음
        except Exception:
            return False
    return False


def lang_of_ctx(ctx) -> str:
    for v in (getattr(ctx, "lang", None), (getattr(ctx, "state", None) or {}).get("lang"), (ctx.context or {}).get("lang"),
              (ctx.context or {}).get("locale")):
        if v in ("ko", "en"):
            return v
    return "ko"


def _prefixes(p) -> list[str] | None:
    """기관 관할 PNU 접두(옛/새 코드 포함). LX = [] (전국)."""
    if p.realm == "lx":
        return []
    from landxi_api.regions import sgg_codes, tenant_scope
    sc = tenant_scope(p.tenant_id)
    if sc is None:
        return None
    out = set()
    for px in sc:
        out.add(px)
        if len(px) == 5:
            out.update(sgg_codes(px))
    return sorted(out)


def in_scope(pnu: str, prefixes: list[str] | None) -> bool:
    if prefixes is None:
        return False
    if prefixes == []:
        return True
    if any(pnu.startswith(x) for x in prefixes):
        return True
    try:                                              # 옛/새 코드(예: 45190 ↔ 52190)
        from landxi_api.regions import sgg_codes
        return any(c.startswith(tuple(prefixes)) for c in sgg_codes(pnu[:5]))
    except Exception:
        return False


def _context_codes(ctx) -> list[str] | None:
    """LX 세션 — 화면 문맥 지역(시군구 코드 · 이름)으로 지번 색인 범위를 좁힌다(전국 동명 읍면동 오인 방지)."""
    reg = (ctx.context or {}).get("region") or (ctx.context or {}).get("sgg")
    if not reg:
        return None
    try:
        from agent.tools import scope as S
        rows = S.resolve(str(reg))
        codes = sorted({c for r in rows for c in S.codes_of(r.get("sgg_cd"))})
        return codes or None
    except Exception:
        return None


async def top_suspect(prefixes: list[str], emd: str = "") -> str | None:
    """관할 접두(없으면 전국) · 읍면동 이름(선택) → 우선순위 1위 의심 필지 PNU(열린 건)."""
    from landxi_api.deps import db
    where, params = ["pnu IS NOT NULL", "coalesce(state,'open') IN ('open','assigned')"], []
    if prefixes:
        params.append([p for p in prefixes])
        where.append(f"substr(pnu,1,5) LIKE ANY (SELECT x || '%' FROM unnest(${len(params)}::text[]) x)")
    if emd:
        params.append(emd)
        where.append(f"emd = ${len(params)}")
    async with db(realm="lx") as conn:
        return await conn.fetchval("SELECT pnu FROM survey_findings WHERE " + " AND ".join(where) + " ORDER BY rank NULLS LAST, score DESC NULLS LAST LIMIT 1",
                                   *params)


def _rank_of(v) -> int:
    try:
        n = int(v or 0)
    except (TypeError, ValueError):
        return 0
    return n if 1 <= n <= 50 else 0


def _parcels_of(cites) -> list[str]:
    """인용 목록 → 필지 PNU(순서 = 답의 순위 · 중복 제거)."""
    if isinstance(cites, str):
        try:
            cites = json.loads(cites)
        except Exception:
            cites = []
    out = []
    for c in cites or []:
        pnu = str((c or {}).get("pnu") or "") if isinstance(c, dict) else ""
        if len(pnu) == 19 and pnu not in out:
            out.append(pnu)
    return out


PREV_WINDOW_MIN = 120                                  # 직전 답을 찾는 범위(분)
VLM_TOOLS = ("vlm_describe", "crop_tiles")


def _is_list(cites) -> bool:
    """인용이 목록 답인지 — 목록 표시(kind='list') 또는 필지 2개 이상."""
    if isinstance(cites, str):
        try:
            cites = json.loads(cites)
        except Exception:
            cites = []
    if any(isinstance(c, dict) and c.get("kind") == "list" for c in cites or []):
        return True
    return len(_parcels_of(cites)) >= 2


def _prev_pick(row, rank: int, want_list: bool) -> list[str]:
    """바로 앞 답 한 건 → 필지 목록. 끝난(done) 답만. 순위는 목록 답일 때만(필지 1개짜리 답으로 대신하지 않음)."""
    if not row or row.get("state") != "done":
        return []
    got = _parcels_of(row.get("citations"))
    if not got:
        return []
    if not want_list:
        return got
    return got if _is_list(row.get("citations")) and len(got) >= max(rank, 1) else []


RANK_MISS = "어느 필지인지 찾지 못했습니다 — 지번으로 말씀해 주세요(예: '○○면 ○○리 123 영상 설명해 줘')"
RANK_MISS_EN = "I couldn't tell which parcel you mean — please name it by lot number (e.g. 'describe the imagery of ○○-ri 123')."


def _rank_miss_out(e: Exception, ctx, lang: str):
    """순위·'그 필지'를 바로 앞 목록으로 풀지 못한 경우 → 다른 필지로 대신하지 않고 안내 한 줄로 답(직행이면 모델을 다시 부르지 않음)."""
    if not (isinstance(e, ToolError) and e.code == "not_found" and (getattr(ctx, "state", None) or {}).get("vlm_rank_miss")):
        return None
    msg = RANK_MISS if lang == "ko" else RANK_MISS_EN
    out = Out(source="직전 답")
    out.answer = msg
    out.data = {("안내" if lang == "ko" else "notice"): msg, ("지시" if lang == "ko" else "instruction"):
                ("이 안내만 그대로 전하고 다른 필지를 찾거나 설명하지 않는다." if lang == "ko" else "Relay this notice only; do not pick or describe any other parcel.")}
    return out


async def prev_parcels(ctx, rank: int = 1, want_list: bool = True) -> list[str]:
    """같은 사용자의 **바로 앞 답 한 건**(이 run 제외 · 2시간 안) → 그 답이 인용한 필지 목록(답의 순서).
    순위('n위', want_list=True): 영상 설명 답만 건너뛴 바로 앞 답이 끝난 목록 답일 때만. 거절·실패·진행 중·필지 1개 답이면 [] —
    오래된 답이나 다른 답으로 풀지 않는다(2차 실증: 곡성 거절 뒤 '1위'가 강진 필지로 풀림).
    '그 필지'(want_list=False): 바로 앞 답(영상 설명 답 포함)이 필지를 인용했을 때 그 필지. 관할 검사는 resolve_pnu 가 한다."""
    p = ctx.principal
    uid = getattr(p, "user_id", None)
    if not uid:
        return []
    from landxi_api.deps import db
    prev = str((ctx.context or {}).get("prev_run") or "").strip()      # 화면이 직전 run id 를 주면 그 답이 먼저(같은 계정 여러 창에서도 정확)
    try:
        async with db(realm="lx") as conn:
            if prev and prev != ctx.run_id:           # 이 창의 바로 앞 답 — 영상 설명 답이 아니면 그것으로 끝(다른 창 · 다른 확인자의 답으로 넘어가지 않음)
                r = await conn.fetchrow("SELECT r.state, r.citations, (coalesce(r.intent,'')='vlm' OR EXISTS(SELECT 1 FROM agent_tool_calls t "
                                        "WHERE t.run_id=r.id AND t.tool = ANY($4::text[]))) AS vlm FROM agent_runs r "
                                        "WHERE r.id=$1 AND r.user_id=$2 AND r.realm=$3", prev, uid, p.realm, list(VLM_TOOLS))
                if r and not (want_list and r["vlm"]):
                    return _prev_pick(dict(r), rank, want_list)
            rows = await conn.fetch(
                "SELECT r.id, r.state, r.citations, (coalesce(r.intent,'')='vlm' OR EXISTS(SELECT 1 FROM agent_tool_calls t "
                "WHERE t.run_id=r.id AND t.tool = ANY($5::text[]))) AS vlm FROM agent_runs r "
                "WHERE r.user_id=$1 AND r.realm=$2 AND r.id<>$3 AND r.created_at > now() - make_interval(mins => $4) "
                "AND r.created_at <= coalesce((SELECT created_at FROM agent_runs WHERE id=$3), now()) "
                "ORDER BY r.created_at DESC LIMIT 8", uid, p.realm, ctx.run_id, PREV_WINDOW_MIN, list(VLM_TOOLS))
    except Exception:
        return []
    rows = [dict(r) for r in rows]
    if want_list:                                     # 순위: 영상 설명 답만 건너뛰고 바로 앞 답 한 건
        rows = [r for r in rows if not r.get("vlm")]
    return _prev_pick(rows[0] if rows else None, rank, want_list)


async def resolve_pnu(args: dict, ctx) -> str:
    p = ctx.principal
    prefixes = _prefixes(p)
    if prefixes is None:
        raise ToolError("tool_forbidden", "이 기관의 데이터가 아닙니다", 403)
    pnu = re.sub(r"\D", "", str(args.get("pnu") or ""))
    fid = str(args.get("finding_id") or "").strip()
    jibun = str(args.get("jibun") or "").strip()
    if not pnu and fid:
        from landxi_api.deps import db
        async with db(realm="lx") as conn:
            pnu = await conn.fetchval("SELECT pnu FROM survey_findings WHERE id=$1", fid) or ""
        if not pnu:
            raise ToolError("not_found", "의심 건을 찾지 못했습니다", 404)
    if not pnu and jibun:
        from landxi_api.ledger import ParcelIndex, parse_jibun
        pj = parse_jibun(jibun) or parse_jibun(jibun_in(jibun) or "")
        if not pj:
            raise ToolError("bad_request", "지번을 읽지 못했습니다(읍면동 · 리 · 번지)")
        ix = await ParcelIndex.get(prefixes or _context_codes(ctx) or None)
        got, why = ix.from_jibun(pj)
        if not got:
            if prefixes and why and "관할" in why:
                raise ToolError("tool_forbidden", "이 기관의 데이터가 아닙니다", 403)
            raise ToolError("not_found", f"필지를 찾지 못했습니다({why})" if why else "필지를 찾지 못했습니다", 404)
        pnu = got
    rank = _rank_of(args.get("rank"))
    if not pnu and (rank or args.get("prev") or (args.get("suspect_top") and not args.get("emd"))):   # 모델이 '1위 필지'를 prev 로 부르는 등 — 질문이 순위를 말했으면 질문이 이긴다
        n, said = ref_rank(question_only(str((getattr(ctx, "state", None) or {}).get("msg") or "")))
        if said:
            rank = n
    if not pnu and not rank and args.get("prev") and not (ctx.context or {}).get("pnu") and not _parcels_of(getattr(ctx, "citations", []) or []):
        got = await prev_parcels(ctx, 1, want_list=False)          # '그 · 이 필지 영상' — 직전 답이 말한 필지(화면 선택 · 같은 run 인용이 없을 때)
        if not got:
            if isinstance(getattr(ctx, "state", None), dict):
                ctx.state["vlm_rank_miss"] = True
            raise ToolError("not_found", RANK_MISS, 404)
        pnu = got[0]
    if not pnu and rank:                              # '1위 · 세 번째 필지 영상' — 같은 run 의 목록, 없으면 직전 run(같은 사용자) 목록의 n위
        got = _parcels_of(getattr(ctx, "citations", []) or [])
        if len(got) < max(rank, 2):
            got = await prev_parcels(ctx, rank)
        if len(got) < rank:
            if isinstance(getattr(ctx, "state", None), dict):
                ctx.state["vlm_rank_miss"] = True
            raise ToolError("not_found", RANK_MISS, 404)
        pnu = got[rank - 1]
    if not pnu:                                       # 같은 run 에서 앞서 인용한 필지('이 필지')
        c = next((c for c in reversed(getattr(ctx, "citations", []) or []) if c.get("pnu")), None)
        pnu = (c or {}).get("pnu") or str((ctx.context or {}).get("pnu") or "")
    if not pnu and (args.get("suspect_top") or args.get("emd")):   # '(○○면) 의심 필지 영상 설명' — 관할(또는 화면 지역) 의심 필지 1위
        if (getattr(ctx, "state", None) or {}).get("vlm_rank_miss"):     # 이 run 에서 '1위 필지'를 못 풀었으면 다른 필지로 대신하지 않는다
            raise ToolError("not_found", RANK_MISS, 404)
        pnu = await top_suspect(prefixes or _context_codes(ctx) or [], str(args.get("emd") or "").strip())
        if not pnu:
            raise ToolError("not_found", "해당 지역 데이터가 없습니다", 404)
    if len(pnu) != 19:
        raise ToolError("bad_request", "지번 또는 PNU 가 필요합니다")
    if not in_scope(pnu, prefixes):
        raise ToolError("tool_forbidden", "이 기관의 데이터가 아닙니다", 403)
    return pnu


async def load_target(pnu: str | None, feature_id: str | None = None) -> dict:
    """경계 · 필지 정보 · 의심 규칙 · AI 윤곽. 관할 검사는 끝난 뒤(시스템 읽기)."""
    from landxi_api.deps import db
    async with db(realm="lx") as conn:
        if feature_id:
            r = await conn.fetchrow("SELECT id, cls, conf, pnu, ST_AsGeoJSON(geom) g FROM detections WHERE id=$1", int(feature_id))
            if not r:
                raise ToolError("not_found", "결과 피처를 찾지 못했습니다", 404)
            geom = json.loads(r["g"])
            return {"kind": "피처", "pnu": r["pnu"], "geom": geom, "addr": None, "jimok": None, "cls": r["cls"], "ratio": None,
                    "rule_nm": None, "ai": [], "ai_year": None, "area_m2": None}
        r = await conn.fetchrow("SELECT pnu, addr, jimok, jimok_nm, area_m2, ST_AsGeoJSON(geom) g FROM survey_parcels WHERE pnu=$1 LIMIT 1", pnu)
        if not r or not r["g"]:
            raise ToolError("not_found", "필지 경계를 찾지 못했습니다(실태조사 필지 적재 전)", 404)
        f = await conn.fetchrow("SELECT id, rule, rule_nm, evidence, img_date, evid_m2, parcel_m2, emd FROM survey_findings WHERE pnu=$1 "
                                "ORDER BY rank NULLS LAST LIMIT 1", pnu)
        cls, ratio, year = None, None, None
        if f:
            ev = f["evidence"]
            try:
                evj = json.loads(ev) if isinstance(ev, str) and ev.strip().startswith("{") else None
            except Exception:
                evj = None
            if evj and isinstance(evj.get("ai"), dict):
                cls = evj["ai"].get("cls")
                ratio = evj["ai"].get("ratio")
                year = evj["ai"].get("year")
            cls = cls or AI_CLS_OF_RULE.get(str(f["rule"] or "")[:2])
            if ratio is None and f["evid_m2"] and f["parcel_m2"]:
                ratio = float(f["evid_m2"]) / float(f["parcel_m2"])
            m = re.search(r"(19|20)\d{2}", str(f["img_date"] or ""))
            year = year or (int(m.group(0)) if m else None)
        ai_rows = await conn.fetch("SELECT d.cls, ST_AsGeoJSON(ST_Intersection(d.geom, s.geom)) g FROM detections d, survey_parcels s "
                                   "WHERE s.pnu=$1 AND ST_Intersects(d.geom, s.geom) LIMIT 120", pnu)
    ai = [json.loads(x["g"]) for x in ai_rows if x["g"] and (cls is None or str(x["cls"]).startswith(cls))]
    return {"kind": "필지", "pnu": pnu, "geom": json.loads(r["g"]), "addr": r["addr"], "jimok": r["jimok_nm"] or r["jimok"],
            "cls": cls, "ratio": ratio, "rule_nm": f["rule_nm"] if f else None, "finding_id": f["id"] if f else None,
            "ai": ai[:80], "ai_year": year or 2023, "area_m2": r["area_m2"]}


async def load_sources(bb: list[float], principal) -> list:
    from landxi_api import config as gcfg
    from landxi_api.catalog import resolve_set_path
    from landxi_api.deps import db
    from agent.vlm import crop as C
    async with db(realm="lx") as conn:
        rows = [dict(r) for r in await conn.fetch(C.SQL_SOURCES.replace("SELECT id,", "SELECT export_policy, id,"), *bb)]
    if principal.realm == "tenant" and os.environ.get("LX_VLM_TENANT_POLICY", "crop") == "strict":
        rows = [r for r in rows if r.get("export_policy") in ("tenant", "public")]
    return C.sources_from_rows(rows, gcfg.DATA_ROOT, resolve_set_path)


def _run_dir(ctx):
    from agent import config as acfg
    return acfg.ARTIFACT_DIR / ctx.run_id


def file_href(run_id: str, name: str) -> str:
    """run 산출 파일 내려받기 주소(게이트웨이 GET /agent/runs/{run}/files/{name} · run 소유 기관만) — 화면에는 주소 글자를 내지 않는다."""
    return f"/agent/runs/{run_id}/files/{name}"


async def make_crops(args: dict, ctx):
    from agent.vlm import crop as C
    fid = str(args.get("feature_id") or "").strip()
    if fid:
        if not fid.isdigit():
            raise ToolError("bad_request", "결과 피처 id 는 숫자")
        t = await load_target(None, fid)
        if t.get("pnu") and not in_scope(t["pnu"], _prefixes(ctx.principal)):
            raise ToolError("tool_forbidden", "이 기관의 데이터가 아닙니다", 403)
        if not t.get("pnu") and ctx.principal.realm != "lx":
            raise ToolError("tool_forbidden", "이 기관의 데이터가 아닙니다", 403)
    else:
        pnu = await resolve_pnu(args, ctx)
        t = await load_target(pnu)
    bb = C.padded_bbox(C.bbox_of(t["geom"]))
    srcs = await load_sources(bb, ctx.principal)
    if not srcs:
        raise ToolError("no_imagery", "이 필지를 덮는 등록 영상이 없습니다(영상 등록 필요)", 404)
    res = await asyncio.to_thread(C.crop_views, srcs, t["geom"], t["ai"], t["ai_year"])
    if not res.views:
        raise ToolError("no_imagery", "이 필지를 덮는 등록 영상이 없습니다(영상 등록 필요)", 404)
    views = await asyncio.to_thread(C.save_views, res, _run_dir(ctx), (t.get("pnu") or "f" + fid)[-10:] + "-" + ctx.run_id[-6:])
    return t, views


def _short(addr) -> str:
    from agent.tools import scope as S
    return S.short_addr(addr)


def _center(g: dict):
    from agent.vlm import crop as C
    b = C.bbox_of(g)
    return [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2], b


def _blocks(ctx, views, caption: str, lang: str, lines: list[str] | None = None) -> list[dict]:
    out = []
    for k, v in enumerate(views):
        out.append({"type": "image", "src": file_href(ctx.run_id, v.name), "caption": v.source.label if k else caption,
                    "label": v.source.label, "tag": TAG[lang], "lines": lines if k == 0 else None, "w": 512})
    return out


def _attach_blocks(out: Out, blocks: list[dict]):
    """명령 바 블록(plan 3.3 image) — Out.blocks 로 낸다(러너가 agent.tool.result · agent.done 에 싣는다)."""
    out.blocks.extend(blocks)


async def crop_tiles(args: dict, ctx) -> Out:
    lang = lang_of_ctx(ctx)
    try:
        t, views = await make_crops(args, ctx)
    except ToolError as e:
        miss = _rank_miss_out(e, ctx, lang)
        if miss is None:
            raise
        return miss
    addr = _short(t.get("addr")) if t.get("addr") else ("결과 피처" if lang == "ko" else "result feature")
    out = Out(source="등록 영상 조각(CPU)")
    for m in re.findall(r"\d+(?:-\d+)?", addr + " " + " ".join(v.source.label for v in views)):
        out.whitelist.add(m)
    center, b = _center(t["geom"])
    if t.get("pnu"):
        out.citations.append({"kind": "parcel", "pnu": t["pnu"], "addr": addr, "bbox": b, "center": center, "label": addr, "env_keys": []})
    labels = [v.source.label for v in views]
    _attach_blocks(out, _blocks(ctx, views, labels[0], lang))
    out.ui_actions.append({"op": "map_flyto", "bbox": b, "center": center, "pnu": t.get("pnu")})
    out.data = {"대상": addr, "영상 조각": labels, "비고": "명령 바에 조각을 보였습니다(설명 없음)" if lang == "ko" else "crops shown in the command bar"}
    return out


async def vlm_describe(args: dict, ctx) -> Out:
    from agent.vlm import call as VC
    from agent.vlm import prompt as VP
    lang = lang_of_ctx(ctx)
    try:
        t, views = await make_crops(args, ctx)
    except ToolError as e:
        miss = _rank_miss_out(e, ctx, lang)
        if miss is None:
            raise
        return miss
    labels = [v.source.label for v in views]
    sysm, user = VP.build(t, labels, bool(views and views[0].ai_overlay), lang)
    try:
        vr = await VC.describe([v.png for v in views], user, system=sysm, r=getattr(ctx, "r", None), run_id=ctx.run_id)
    except VC.VlmBusy:
        raise ToolError("gpu_busy", "영상 AI 분석 작업이 GPU 를 쓰는 중입니다 — 끝난 뒤 다시 요청해 주세요" if lang == "ko"
                        else "The imagery AI job is using the GPU — please ask again when it finishes", 503)
    except VC.VlmUnavailable:
        raise ToolError("llm_unavailable", "지금은 영상 설명을 할 수 없습니다" if lang == "ko" else "Image review is not available right now", 503)
    ctx.tokens_in += int(vr.usage.get("prompt_tokens") or 0)            # 기관 사용량(llm_tokens) = run 토큰 합계(러너 finish → meter)
    ctx.tokens_out += int(vr.usage.get("completion_tokens") or 0)
    st = getattr(ctx, "state", None)
    if isinstance(st, dict):
        st["vlm_tokens"] = int(st.get("vlm_tokens") or 0) + vr.tokens
    keep = {re.sub(r"\D", "", x) for x in labels for x in re.findall(r"\d{4}", x)}
    pr = VP.parse(vr.text, lang, keep)
    addr = _short(t.get("addr")) if t.get("addr") else ("결과 피처" if lang == "ko" else "result feature")
    out = Out(source=f"등록 영상 조각 · {vr.model}", note=TAG[lang])
    for m in re.findall(r"\d+(?:-\d+)?", addr + " " + " ".join(labels)):
        out.whitelist.add(m)
    center, b = _center(t["geom"])
    if t.get("pnu"):
        out.citations.append({"kind": "parcel", "pnu": t["pnu"], "addr": addr, "bbox": b, "center": center, "label": addr, "env_keys": []})
    _attach_blocks(out, _blocks(ctx, views, labels[0], lang, pr["lines"]))
    out.ui_actions.append({"op": "map_flyto", "bbox": b, "center": center, "pnu": t.get("pnu")})
    out.raw = {**(out.raw or {}), "vlm": {"lines": pr["lines"], "risk": pr["risk_level"], "match": pr["match_level"], "tokens": vr.tokens,
                                          "power_ok": vr.power.get("ok"), "gpu_jobs_at_start": vr.gpu_jobs_at_start}}
    out.answer = PARA.join([("대상: " if lang == "ko" else "Target: ") + addr] + pr["lines"] + [f"({TAG[lang]})"])      # 직행(ROUTE)일 때 런타임 답 = 세 줄 그대로 + 꼬리표(LLM 한 번 더 부르지 않음)
    out.data = {("대상" if lang == "ko" else "target"): addr, ("영상" if lang == "ko" else "images"): labels,
                ("의견 세 줄" if lang == "ko" else "three lines"): pr["lines"],
                ("꼬리표" if lang == "ko" else "tag"): TAG[lang],
                ("지시" if lang == "ko" else "instruction"): ("첫 줄에 대상 필지를 말하고, 세 줄을 그대로 옮기고 꼬리표를 붙인다. 숫자는 대상 지번 말고 쓰지 않는다." if lang == "ko"
                                                              else "Name the target parcel first, relay the three lines as they are and add the tag. No other numbers.")}
    return out


HANDLERS.update({"vlm_describe": vlm_describe, "crop_tiles": crop_tiles})

# ── 직행(ROUTE · plan 3.1) — '○○ 영상 보고 설명해 줘' · 필지 카드 '영상 설명' 버튼 문장은 모델 앞에서 vlm_describe 로 ──
VLM_ASK = re.compile(r"(영상|사진|이미지|항공|드론).{0,8}(설명|보고|보면|봐\s*줘|봐줘|확인해|검수|판단|어떤\s*모습|어떻게\s*보)|"
                     r"(describe|explain|check|review).{0,24}(image|imagery|photo|aerial)|(image|imagery|photo).{0,16}(describe|explain)", re.I)
_PNU = re.compile(r"(?<!\d)(\d{19})(?!\d)")


JIBUN_IN = re.compile(r"((?:[가-힣]+(?:시|군|구)\s+)*(?:[가-힣0-9]+(?:읍|면|동|가)\s*)?(?:[가-힣0-9]+리\s*)?(?:산\s*)?\d{1,4}(?:\s*-\s*\d{1,4})?)(?:\s*번지)?")


AREA_HINT = re.compile(r"\s*\((?:Current area|Area):[^()]*\)\s*$", re.I)


def question_only(msg: str) -> str:
    """화면이 붙이는 문맥 꼬리('(Current area: …)')를 떼고 질문만."""
    return AREA_HINT.sub("", str(msg or "").split(chr(10) + "(")[0]).strip()


def jibun_in(text: str) -> str | None:
    """문장 속 지번 조각('운봉읍 준향리 824-9') — 읍면동 또는 리 이름이 붙은 번지만."""
    for m in JIBUN_IN.finditer(text or ""):
        j = m.group(1).strip()
        if re.search(r"(읍|면|동|가|리)\s*(산\s*)?\d", j):
            return j
    return None


_KNUM = {"첫": 1, "두": 2, "세": 3, "네": 4, "다섯": 5, "여섯": 6, "일곱": 7, "여덟": 8, "아홉": 9, "열": 10}
_ENUM = {"first": 1, "second": 2, "third": 3, "fourth": 4, "fifth": 5, "top": 1}
REF_RANK = re.compile(r"(?<![\d-])(\d{1,2})\s*(?:위|번째|등)(?![가-힣])|(?<![\d-])(\d{1,2})\s*번\s*(?:필지|의심)|(첫|두|세|네|다섯|여섯|일곱|여덟|아홉|열)\s*번째|"
                      r"\b(first|second|third|fourth|fifth|top)\b(?:[\s-]*(?:ranked|flagged|suspect))*\s+(?:parcel|lot|district|one)|\b(?:no\.?|#)\s*(\d{1,2})\b|"
                      r"(?<![\d-])(\d{1,2})(?:st|nd|rd|th)\b(?:[\s-]*(?:ranked|flagged|suspect))*\s+(?:parcel|lot|district|one)|"
                      r"\b(?:parcel|rank|number)\s+(?:no\.?\s*|#\s*)?(\d{1,2})\b(?!\s*-)", re.I)
REF_THIS = re.compile(r"(?:(?<![가-힣])(?:그|이|저)|해당|방금|앞의?|위의?|선택한|고른|말한|찾은)\s*(?:의심\s*)?필지|\b(?:that|this|the same|selected)\s+parcel", re.I)


def ref_rank(q: str) -> tuple[int, bool]:
    """직전 답을 가리키는 말 → (순위, 순위를 말했는지). '1위'·'세 번째'·'top parcel' = (n, True) · '그/이 필지' = (1, False) · 없으면 (0, False)."""
    m = REF_RANK.search(q or "")
    if m:
        if m.group(1) or m.group(2):
            return int(m.group(1) or m.group(2)), True
        if m.group(3):
            return _KNUM[m.group(3)], True
        if m.group(4):
            return _ENUM[m.group(4).lower()], True
        if m.group(5) or m.group(6) or m.group(7):
            return int(m.group(5) or m.group(6) or m.group(7)), True
    return (1, False) if REF_THIS.search(q or "") else (0, False)


def ROUTE(msg: str, ctx):
    q = question_only(msg)
    if not VLM_ASK.search(q):
        return None
    m = _PNU.search(q)
    if m:
        return {"tool": "vlm_describe", "args": {"pnu": m.group(1)}, "intent": "vlm"}
    j = jibun_in(q)
    if j:
        return {"tool": "vlm_describe", "args": {"jibun": j}, "intent": "vlm"}
    n, said = ref_rank(q)
    if n and said:                                    # 'n위 필지 영상' — 직전 답 목록의 n위(화면 선택보다 먼저)
        return {"tool": "vlm_describe", "args": {"rank": n}, "intent": "vlm"}
    if (ctx.context or {}).get("pnu") or any(c.get("pnu") for c in getattr(ctx, "citations", []) or []):
        return {"tool": "vlm_describe", "args": {}, "intent": "vlm"}   # 화면에서 고른 필지(문맥 pnu) · 같은 run 인용
    if n:                                             # '그 · 이 필지 영상' — 직전 답이 말한 필지
        return {"tool": "vlm_describe", "args": {"prev": True}, "intent": "vlm"}
    if "의심" in q or re.search(r"flagged|suspect", q, re.I):          # '(○○면) 의심 필지 영상 설명해 줘' — 1위 의심 필지
        m = re.search(r"([가-힣0-9]+(?:읍|면|동))(?=\s|$|의|에)", q)
        return {"tool": "vlm_describe", "args": {"suspect_top": True, **({"emd": m.group(1)} if m else {})}, "intent": "vlm"}
    return None


# ── 영상 판독 흉내 가드(실증 must_fix) — vlm_describe 를 부르지 않은 run 의 답에 '영상을 분석한 결과…' 같은 판독 문장이나
#    'AI 의견 · 근거 아님' 꼬리표가 나오면 그 문장들을 지우고 '영상 설명을 다시 요청' 안내로 바꾼다.
#    러너의 동작 대조(lint.action_check · 모델이 쓴 답에만 적용)에 덧붙인다 — 직행 답(런타임 문장)은 건드리지 않는다.
TAG_RX = re.compile(r"\(?\s*AI\s*의견\s*[·ㆍ・.,]\s*근거\s*아님\s*\)?|\(?\s*AI\s+opinion\s*[·.,]\s*not\s+evidence\s*\)?", re.I)
IMG_CLAIM = re.compile(
    r"(?:영상|사진|이미지|조각)(?:을|를)?\s*(?:분석|판독|살펴|확인|보|검토)[^.!?\n]{0,10}결과"
    r"|(?:영상|사진|이미지|조각)\s*(?:에서|상으로|상|을\s*보면|을\s*보니|으로\s*보아|을\s*보아)[^.!?\n]{0,40}(?:보입|보이|보여|관찰|판독|식별|육안)"
    r"|(?:영상|사진|이미지)\s*(?:설명|판독|검수)\s*(?:결과|의견)"
    r"|(?:보이는\s*것|AI\s*결과와\s*맞는지|오탐\s*가능성)\s*[:：]"
    r"|\b(?:the|this)\s+(?:image|imagery|photo|aerial(?:\s+image)?)\s+(?:shows|reveals|suggests|indicates|appears)"
    r"|\blooking at the (?:image|imagery|photo|crop)\b"
    r"|\b(?:what is visible|false[- ]positive (?:risk|likelihood))\s*:", re.I)
IMG_LOOK = re.compile(r"확인되|확인됩|보입|보이|보여|관찰|형태|추정|appears?|visible|seen|looks?\b", re.I)
IMG_NA = {"ko": "영상 설명은 영상 조각을 보고 나서만 드립니다. '○○리 지번 영상 설명해 줘'처럼 필지를 말해 다시 요청해 주세요.",
          "en": "I can describe imagery only after viewing the image crop. Please ask again with the parcel, e.g. 'describe the image of parcel …'."}


def image_guard(md: str, lang: str = "ko") -> tuple[str, list[dict]]:
    """영상 판독 문장·꼬리표가 있으면 → 그 문장과 겉모습 서술(숫자 칩 없는 '확인되며 · 보입니다')을 지우고 안내 한 줄. 반환 (답, 바꾼 목록)."""
    from agent import lint
    text = md or ""
    if not (TAG_RX.search(text) or IMG_CLAIM.search(text)):
        return text, []
    flags, paras = [], []
    for para in text.split("\n"):
        keep = []
        for a, b, _ns in lint._sentence_spans(para):
            s = para[a:b]
            hit = TAG_RX.search(s) or IMG_CLAIM.search(s) or ("{{env:" not in s and IMG_LOOK.search(s))
            if hit:
                flags.append({"sentence": s.strip(), "claims": ["image"]})
                s = TAG_RX.sub("", s) if not (IMG_CLAIM.search(s) or ("{{env:" not in s and IMG_LOOK.search(s))) else ""
            if s.strip():
                keep.append(s)
        paras.append("".join(keep).rstrip())
    na = IMG_NA.get(lang, IMG_NA["ko"])
    body = "\n".join(paras).strip()
    body = re.sub(r"\n{3,}", "\n\n", body)
    return ((body + "\n\n" if body else "") + na), flags


def install_guard() -> bool:
    """lint.action_check 를 한 번 감싼다(vlm_describe 가 성공하지 않은 run 에만 image_guard). 이미 감쌌으면 그대로."""
    try:
        from agent import lint
    except Exception:
        return False
    base = lint.action_check
    if getattr(base, "_vlm_guard", False):
        return True

    def action_check(md, did, lang="ko"):
        md, flags = base(md, did, lang)
        if "vlm_describe" not in set(did or ()):
            md, more = image_guard(md, lang)
            flags = [*flags, *more]
        return md, flags
    action_check._vlm_guard = True
    action_check.__doc__ = base.__doc__
    lint.action_check = action_check
    return True


install_guard()
