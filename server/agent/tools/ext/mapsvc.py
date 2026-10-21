"""지도 서비스 · XI맵을 말로 — 세부 거르기 · AI 분석 결과 보고서(원칙 193 · 확인 대장 10-11 Q5 ⓑ · QA-고침-5).

  map_filter(cls?, area_min?, area_op_min?, area_max?, area_op_max?, emd?, clear?)
      '비닐하우스 단동만 펼쳐줘' · '면적 1,000㎡ 넘는 것만' · '운봉읍만' · '조건 풀어 줘' → 지금 지도에 켜진 결과 층(화면이 context.sets 로 알린 것)를
      결과 타일 속성(cls · area_m2 · emd)으로 거른다. 서버는 그 층의 실제 결과(detections — 타일과 같은 행)에 그 값이 있는지 먼저 본다:
      없는 값(예: 단동 · 연동 구분이 없는 결과)은 거르지 않고 '없다'고 답하며, 그 질문은 개선 고리(improve · '자료 없음')로 간다.
      맞는 수 = 같은 행을 같은 조건으로 센 값(봉투) · 화면은 ui_action map_filter 로 같은 조건을 바로 건다(모델 호출 0 · 1초 안 목표).
  map_task(task?, clear?)
      XI맵 '○○만 보여 줘'(분류 이름만 · 면적 · 읍면동 조건 없음) → 업무 거르기: 그 업무 결과만 지도에 남긴다(서비스 결과 · 시군구 전역 분석 · 전국 분석 모두).
      '원래대로' · '다 보여 줘' → 모두. 숫자 = XI맵 첫 화면과 같은 출처(전국 결과 장부 + 전국 분석 진행 장부). (10-14 원칙 239)
  ai_report(request)
      '보고서 초안 만들어 줘'(LX 계정) → AI 분석 결과 보고서 한글 문서(.hwpx · 10-14 원칙 250) — 읍면동별 개수 · 면적 · 지도 그림 · 영상 시점 · AI 모델 정확도.
      의심 필지 · 현장 확인 개념 없음(원칙 135). 대상 = 질문의 지역(그 지역의 결과 — 통계 답과 같은 세트 선택 · results._set)
      → 지금 화면에 켜진 층(context.sets) → 화면 지역(context.region) → 없으면 묻는다. 숫자 = 지도 서비스와 같은 행(지운 결과 제외).
ROUTE 는 모델 앞 직행(LLM 0). 지역 · 지명 고정값 0.
"""
from __future__ import annotations

import asyncio
import datetime as dt
import io
import json
import re

from .. import Out, ToolError

SPECS = {
    "map_filter": {
        "description": "지도에 켜진 AI 분석 결과 층을 분류 · 면적 · 읍면동 조건으로 거른다('비닐하우스 단동만' · '1,000㎡ 넘는 것만' · '○○면만' · '조건 풀어 줘').",
        "properties": {"cls": {"type": "string", "description": "분류(예 '비닐하우스' · '비닐하우스 단동')"},
                       "area_min": {"type": "number"}, "area_op_min": {"type": "string", "enum": [">", ">="]},
                       "area_max": {"type": "number"}, "area_op_max": {"type": "string", "enum": ["<", "<="]},
                       "emd": {"type": "string", "description": "읍면동 이름"}, "clear": {"type": "boolean"},
                       "clear_only": {"type": "string", "description": "하나씩 풀기 — 'area' · 'emd' · 'cls'(쉼표)"}, "request": {"type": "string"}}},
    "map_stats": {
        "description": "켜진 결과 층(지금 걸린 조건 그대로)의 읍면동별 개수 · 면적 — 대상 층 · 조건을 답 첫 줄에.",
        "properties": {"request": {"type": "string", "description": "사용자 문장 원문"}}},
    "map_task": {
        "description": "XI맵에서 한 업무(비닐하우스 · 경작지 · 건물 · 주차장 · 곤포사일리지 · 토지피복 · 국토 변화 · 해양쓰레기) 결과만 지도에 남기거나('○○만 보여 줘') 모두 다시 보인다('원래대로').",
        "properties": {"task": {"type": "string", "description": "업무 이름"}, "clear": {"type": "boolean"}, "request": {"type": "string"}}},
    "ai_report": {
        "description": "AI 분석 결과 보고서 초안(한글 문서) — 읍면동별 개수 · 면적 · 지도 그림 · 영상 시점 · AI 모델 정확도. 지역이 없으면 지금 화면의 결과 층 · 지역.",
        "properties": {"request": {"type": "string", "description": "사용자 문장 원문"}}},
}
WRITE: set[str] = set()
CONFIRM: set[str] = set()
CLIENT = {"map_filter", "map_task"}
NO_LLM = {"map_filter", "map_task", "map_stats", "ai_report"}
WHY = {"map_filter": "켜진 결과 층 거르기", "map_task": "XI맵 업무 거르기", "map_stats": "켜진 결과 층 읍면동 통계", "ai_report": "AI 분석 결과 보고서 한글 문서 만들기"}
SAY = {"map_filter": "조건으로 거르기", "map_task": "업무 거르기", "map_stats": "읍면동별로 세기", "ai_report": "AI 분석 결과 보고서 만들기"}
HINT = ("켜진 결과 층을 분류 · 면적 · 읍면동으로 거르는 말('○○만 보여 줘' · '1,000㎡ 넘는 것만')은 map_filter. "
        "LX 계정의 보고서 초안은 ai_report(AI 분석 결과 보고서).")


def allowed(name: str, p) -> bool:
    realm = getattr(p, "realm", None)
    if name == "map_task":
        return realm == "lx"
    if name == "ai_report":                       # 기관: 지도 위 결과 층 보고서(통계 답과 같은 대상 · 10-18) — 관할 밖은 범위 가드 · 층 소유 검사가 막는다
        return realm in ("lx", "tenant")
    return realm in ("lx", "tenant")


# ── 말 → 조건 ─────────────────────────────────────────────────────────────────────
def _cls_words() -> list[tuple[str, str]]:
    """분류 낱말 한 표(landxi_api.result_scope.CLASS_WORDS · WP-5) — (말, 분류 이름). 표를 못 읽으면 예전 여섯 가지."""
    try:
        from landxi_api.result_scope import CLASS_WORDS
        return [(rx, nm) for rx, nm, _p in CLASS_WORDS if nm not in ("토지피복", "곤포사일리지", "해양쓰레기")]
    except Exception:  # noqa: BLE001
        return [(r"비닐\s*하우스|온실|하우스", "비닐하우스"), (r"건물|건축물", "건물"), (r"경작지|농경지|논밭", "경작지"), (r"주차장", "주차장"),
                (r"차량|자동차", "차량"), (r"스티로폼", "스티로폼")]


CLS_WORDS = _cls_words()
CLS_PARENT = {"논": "경작지", "밭": "경작지", "과수원": "경작지"}
NEAR_RX = re.compile(r"([가-힣\s]{1,12}?)\s*(?:근처|주변|인근|가까이)\s*(\d[\d,]*)\s*(m|미터|km|킬로)\s*(?:안|이내|내)?")
BOTH_RX = re.compile(r"([가-힣]{1,8})\s*이면서\s*")


def unapplied(t: str, applied=("cls", "area_min", "area_max", "emd")) -> list[str]:
    """거르기 · 통계가 알아듣지 못한 조건 조각(WP-6 · P4) — '주차장 근처 100m' · 둘째 분류 · 상한 면적. applied = 이 도구가 건 조건 종류."""
    t = re.sub(r"\s+", " ", t or "")
    out = []
    near = []
    for m in NEAR_RX.finditer(t):
        w = re.sub(r".*이면서\s*", "", m.group(1).strip()).split()
        what = " ".join(w[-2:]) if w and w[-1] in ("시설", "곳", "땅") else (w[-1] if w else "")
        near.append(what)
        out.append(f"{what} 근처 {m.group(2)}{'m' if m.group(3) in ('m', '미터') else 'km'}".strip())
    names = [nm for rx, nm in CLS_WORDS if re.search(rx, t)]
    if "cls" in applied and len(names) >= 2 and BOTH_RX.search(t) and not any(names[1] in x or x in names[1] for x in near):
        out.append(f"둘째 분류({names[1]})")
    elif "cls" not in applied and names:
        out.append(f"분류({' · '.join(names[:2])})")
    areas = list(AREA_RX.finditer(t))
    for m in areas:
        v, side, op = _area(m)
        if f"area_{side}" not in applied:
            out.append(f"{_nf(v)}㎡ {'이상' if side == 'min' else '이하'}")
    return out
SUB_WORDS = [(r"단동", "단동"), (r"연동|다동", "다동")]
SUB_KO = {"단동": "단동", "다동": "연동"}
UNIT = r"(㎡|m2|m²|제곱\s*미터|평방\s*미터|평|ha|헥타르)"
NUM = r"(\d[\d,]*(?:\.\d+)?)\s*(천|만)?\s*"
AREA_RX = re.compile(NUM + UNIT + r"\s*(?:(?:이|가|을|를)(?![상하]))?\s*(이상|넘는|넘은|넘게|초과|보다\s*큰|보다\s*넓은|큰|넓은|이하|미만|안\s*되는|보다\s*작은|보다\s*좁은|작은|좁은)?")
ONLY_RX = re.compile(r"만\s*(?:보여|펼쳐|펴|남겨|켜|표시|그려|띄워|줘|$)|만$|만\s*[.!?]|(?:이상|넘는|넘은|초과|이하|미만|작은|큰)\s*(?:것|거|결과|건|하우스|건물)?\s*(?:만|들)?\s*(?:보여|펼쳐|남겨|표시|그려|줘|$)")
CLEAR_RX = re.compile(r"(?:조건|거르기|필터)\S*\s*(?:다\s*)?(?:풀|없애|지워|해제|빼)|(?:모두|전부|다)\s*(?:다시\s*)?(?:보여|펼쳐|켜)|원래대로")
NOT_RX = re.compile(r"보고서|통계|차트|그래프|법령|조문|분석\s*(?:실행|돌려|해\s*줘)|내려\s*받|요약")
EMD_RX = re.compile(r"(?<![가-힣])([가-힣]{1,6}(?:읍|면|동|리|가))(?=만|에서|의|에|은|는|\s|,|$)")
EMD_SKIP = {"단동", "연동", "다동", "이동", "자동", "행동", "변동", "활동", "작동", "운동", "공동", "가동", "표면", "전면", "측면", "화면", "지면", "평면", "이면", "정면", "단면"}


def _area(m) -> tuple[float, str, str] | None:
    v = float(m.group(1).replace(",", ""))
    if m.group(2) == "천":
        v *= 1000
    elif m.group(2) == "만":
        v *= 10000
    u = re.sub(r"\s+", "", m.group(3))
    if u in ("ha", "헥타르"):
        v *= 10000
    elif u == "평":
        v *= 3.305785
    w = re.sub(r"\s+", "", m.group(4) or "")
    if w in ("이하", "미만", "안되는", "보다작은", "보다좁은", "작은", "좁은"):
        return v, "max", "<=" if w == "이하" else "<"
    return v, "min", ">=" if w == "이상" else ">"


def _clear_keys(t: str) -> list[str]:
    ks = []
    if re.search(r"면적|넓이|크기|㎡|m2|제곱|평(?![가-힣])", t):
        ks.append("area")
    if re.search(r"읍면동|지역|동네", t) or [x for x in EMD_RX.findall(t) if x not in EMD_SKIP]:
        ks.append("emd")
    if re.search(r"분류|종류", t) or any(re.search(rx, t) for rx, _ in CLS_WORDS + SUB_WORDS):
        ks.append("cls")
    return [] if re.search(r"(?:모두|전부|다)\s*(?:다시\s*)?(?:풀|보여|펼쳐|켜|없애|지워)|원래대로", t) else ks


def parse_filter(t: str) -> dict | None:
    """문장 → 거르기 인자 · 거르기 말이 아니면 None."""
    t = re.sub(r"\s+", " ", t or "").strip()
    if not t or len(t) > 100 or NOT_RX.search(t):
        return None
    if CLEAR_RX.search(t):
        ks = _clear_keys(t)                                # '면적 조건만 풀어 줘' → 그 조건 하나만(조건은 쌓인다 · GPT3-3)
        return {"clear": True, **({"clear_only": ",".join(ks)} if ks else {})}
    m = AREA_RX.search(t)
    if not (ONLY_RX.search(t) or (m and m.group(4))):
        return None
    a: dict = {}
    for mm in AREA_RX.finditer(t):                     # '500㎡ 이상 3,000㎡ 이하' — 아래 · 위 둘 다(WP-6)
        v, side, op = _area(mm)
        if f"area_{side}" not in a:
            a[f"area_{side}"] = round(v, 1)
            a[f"area_op_{side}"] = op
    sub = next((k for rx, k in SUB_WORDS if re.search(rx, t)), None)
    base = next((k for rx, k in CLS_WORDS if re.search(rx, t)), None)
    if sub:
        a["cls"] = f"{base or '비닐하우스'} {sub}"
    elif base:
        a["cls"] = base
    rest = AREA_RX.sub(" ", t)
    em = [x for x in EMD_RX.findall(rest) if x not in EMD_SKIP and not any(re.search(rx, x) for rx, _ in CLS_WORDS + SUB_WORDS)]
    if em:
        a["emd"] = em[0]
    if not any(k in a for k in ("cls", "emd", "area_min", "area_max")):
        return None
    a["request"] = t
    return a


# ── XI맵 업무 거르기(10-14) — 업무 이름 하나만 고른 말 ─────────────────────────────────────
TASK_WORDS = [(r"비닐\s*하우스|온실|하우스", "비닐하우스"), (r"건물|건축물", "건물"), (r"경작지|농경지|논밭|경작|휴경", "경작지"), (r"주차장", "주차장"),
              (r"곤포|사일리지", "곤포사일리지"), (r"토지\s*피복", "토지피복"), (r"국토\s*변화", "국토 변화"), (r"해양\s*쓰레기", "해양쓰레기")]
TASK_UNIT = {"경작지": "곳", "비닐하우스": "동", "건물": "동", "주차장": "곳", "곤포사일리지": "개", "토지피복": "개", "국토 변화": "곳", "해양쓰레기": "개"}
TASK_OF = {"경작·휴경": "경작지", "경작": "경작지", "건축물": "건물"}
NAT_CLS = {"farm": ("경작지", "비닐하우스"), "river": ("건물",)}       # 전국 분석 — 자산마다 한 분류씩(겹쳐 세지 않게 · XI맵 첫 화면 합계와 같은 규칙)


def parse_task(t: str) -> dict | None:
    """XI맵 문장 → 업무 거르기 인자. 면적 · 읍면동 · 단동/연동 조건이 있으면 None(그건 map_filter)."""
    t = re.sub(r"\s+", " ", t or "").strip()
    if not t or len(t) > 60 or NOT_RX.search(t):
        return None
    if CLEAR_RX.search(t):
        return None if _clear_keys(t) else {"clear": True, "request": t}
    if not ONLY_RX.search(t) or AREA_RX.search(t) or any(re.search(rx, t) for rx, _ in SUB_WORDS):
        return None
    try:                                               # 지역 이름이 있는 질문은 전국 업무 거르기가 아니다(WP-7 · P2)
        from ... import talk
        if talk.regions_in(t):
            return None
    except Exception:  # noqa: BLE001
        pass
    hits = [k for rx, k in TASK_WORDS if re.search(rx, t)]
    rest = t
    for rx, _ in TASK_WORDS:
        rest = re.sub(rx, " ", rest)
    if len(set(hits)) != 1 or [x for x in EMD_RX.findall(rest) if x not in EMD_SKIP]:
        return None
    return {"task": hits[0], "request": t}


async def _task_count(task: str) -> tuple[int, int]:
    """(서비스 결과 수, 전국 분석 수) — 전국 결과 장부(GET /ximap/board) · 전국 분석 진행 장부(GET /national/progress)와 같은 출처."""
    from landxi_api import ximap as XM
    from landxi_api.deps import Principal, db
    if not XM._BOARD.get("v"):
        await XM._rebuild(Principal(realm="lx", role="staff", user_id="system"))
    bd = XM._BOARD.get("v") or {}
    svc = sum(int((s.get("n") or {}).get("value") or 0) for s in bd.get("services", []) if TASK_OF.get(s.get("name"), s.get("name")) == task)
    nat = 0
    assets = [a for a, cs in NAT_CLS.items() if task in cs]
    if assets:
        async with db(realm="lx") as c:
            from landxi_api.national import _settings
            year = int((await _settings(c))[0]["year"])
            nat = int(await c.fetchval(
                "SELECT coalesce(sum((counts->$1->>'n')::bigint), 0) FROM national_cells WHERE year=$2 AND NOT test AND state='done' AND asset = ANY($3::text[])",
                task, year, assets) or 0)
    return svc, nat


async def map_task(args: dict, ctx) -> Out:
    from landxi_api.envelope import env
    out = Out(source="전국 결과 장부 + 전국 분석 진행 장부")
    ctx.state["talk_kind"] = None
    if args.get("clear"):
        out.ui_actions.append({"op": "map_task", "clear": True})
        if (getattr(ctx, "context", None) or {}).get("filter"):
            out.ui_actions.append({"op": "map_filter", "clear": True})
        out.data = {"status": "clear"}
        out.answer = "모든 업무 결과를 다시 보여 줍니다."
        return out
    task = str(args.get("task") or "")
    if task not in TASK_UNIT:
        out.data = {"status": "none"}
        out.answer = "어느 업무 결과를 보여 드릴까요?"
        return out
    svc, nat = await _task_count(task)
    n = svc + nat
    if not n:
        ctx.state["cannot"] = {"kind": "nodata"}
        out.data = {"status": "missing"}
        out.answer = f"{task} 결과가 아직 없습니다. 지도는 그대로 두었습니다."
        return out
    u = TASK_UNIT[task]
    out.ui_actions.append({"op": "map_task", "task": task, "n": n})
    out.env("n", f"{task} AI 분석 결과", env(n, u, "inferred", "전국 결과 장부 + 전국 분석 진행 장부(끝난 읍면동) — XI맵 첫 화면 합계와 같은 셈"))
    out.data = {"status": "ok", "업무": task, "수": "n"}
    out.answer = f"{task}만 지도에 남겼습니다 — AI 분석 결과 {{{{n}}}}."
    return out


REPORT_ASK = re.compile(r"보고서|리포트|report", re.I)
REPORT_DO = re.compile(r"초안|써\s*줘|써줘|작성|만들어|뽑아|요약|한\s*장|draft|write", re.I)
# 기관 지도 화면의 '○○ 현황 문서 · 한글로 · 엑셀로 내려받기'(WP-4) — 분류 · 통계 말이 있으면 실태조사 초안이 아니라 지도 위 결과 층 보고서
DOC_ASK = re.compile(r"문서|한글\s*(?:로|파일|문서)|hwpx|엑셀|xlsx|pdf", re.I)
DOC_DO = re.compile(r"내려\s*받|뽑아|만들|줘|싶어", re.I)


def ROUTE(msg: str, ctx):
    t = re.sub(r"\s+", " ", msg or "").strip()
    if not t or getattr(ctx, "lang", "ko") == "en":
        return None
    p = getattr(ctx, "principal", None)
    c = getattr(ctx, "context", None) or {}
    if getattr(p, "realm", None) == "lx" and len(t) <= 120 and (REPORT_ASK.search(t) or DOC_ASK.search(t)) and (REPORT_DO.search(t) or DOC_DO.search(t)) \
            and not re.search(r"법령|조문|근거\s*조", t) and not re.search(r"실태\s*조사|의심", t):
        return {"tool": "ai_report", "args": {"request": t}, "intent": "report"}
    if getattr(p, "realm", None) == "tenant" and c.get("page") in ("xi-clean", "lx-map") and len(t) <= 120 and (REPORT_ASK.search(t) or DOC_ASK.search(t)) \
            and (REPORT_DO.search(t) or DOC_DO.search(t)) \
            and (STATS_RX.search(t) or STATUS_RX.search(t) or DOC_ASK.search(t) or any(re.search(rx, t) for rx, _ in CLS_WORDS)) \
            and not re.search(r"법령|조문|근거\s*조|실태\s*조사|의심|필지|공문|협조\s*요청|시행문", t):
        # 기관 지도 화면의 '○○ 통계 보고서' = 지도 위 결과 층 보고서(통계 답과 같은 대상 · 같은 행) — 실태조사(의심 필지) 보고서는 그 말을 할 때만(10-18)
        return {"tool": "ai_report", "args": {"request": t}, "intent": "report"}
    ch = CHANGE_RX.search(t)
    if ch and len(t) <= 60 and not REPORT_ASK.search(t):   # '농지가 ○○로 바뀐 곳' = 실태조사 의심 필지 상위(WP-12 · 답에 '○○ 분류 결과가 아니라' 한 줄)
        from ... import talk
        rule = next((r for rx, r in CHANGE_RULE if re.search(rx, ch.group(1))), "R1")
        g = talk.regions_in(t)
        a = {"rule": rule, "top": 5}
        if g:
            r0 = talk.pick(ctx, g[0])[0]
            if r0:
                a["region"] = r0["sgg_cd"]
        em = [x for x in EMD_RX.findall(t) if x not in EMD_SKIP]
        if em:
            a["emd"] = em[0]
        return {"tool": "survey_findings", "args": a, "intent": "map"}
    if c.get("page") == "xi-clean" and getattr(p, "realm", None) == "lx":
        try:                                             # XI맵 통계 · 현황 · 비교 질문 = 융합 대시보드(dash.py · 10-14 11:02) — 지도 서비스 통계(map_stats)보다 먼저
            from .dash import ROUTE as _dash
            d = _dash(t, ctx)
            if d:
                return d
        except Exception:  # noqa: BLE001
            pass
        k = parse_task(t)
        if k:
            return {"tool": "map_task", "args": k, "intent": "map"}
    if c.get("page") in ("lx-map", "xi-clean") or c.get("sets") is not None:
        a = parse_filter(t)
        if a:
            return {"tool": "map_filter", "args": a, "intent": "map"}
        if c.get("sets") and len(t) <= 80 and STATS_RX.search(t) and not REPORT_ASK.search(t) and not re.search(r"법령|조문|실태\s*조사|의심|신고", t):
            return {"tool": "map_stats", "args": {"request": t}, "intent": "map"}
        # 기관 지도: '남원시 비닐하우스 현황 보여 줘' = 통계 답(직원 XI맵 '현황'이 통계 판인 것과 같게 · 10-18) — 분류 낱말이 있을 때만(서비스 운영 요약은 그대로)
        if getattr(p, "realm", None) == "tenant" and c.get("sets") and len(t) <= 80 and STATUS_RX.search(t) and any(re.search(rx, t) for rx, _ in CLS_WORDS) \
                and not REPORT_ASK.search(t) and not re.search(r"법령|조문|실태\s*조사|의심|신고|요청|진행|처리", t):
            return {"tool": "map_stats", "args": {"request": t}, "intent": "map"}
    return None


CHANGE_RX = re.compile(r"(?:농지|논|밭|경작지|땅)[가이]?\s*([가-힣\s]{1,10}?)(?:으로|로)\s*바뀐\s*(?:곳|데|필지)")
CHANGE_RULE = [(r"비닐|하우스|온실", "R3"), (r"주차장", "R4"), (r"휴경|묵", "R2"), (r"산지|임야", "R5")]
STATUS_RX = re.compile(r"현황|분포|어디(?:가|에|서)?\s*(?:제일|가장)?\s*많|많은\s*(?:곳|동네)|얼마나\s*있|몇\s*(?:곳|개|동|채|군데)|건수|순위|면적|넓이|크기|합치면")   # '몇 곳' = 통계 답(10-21)


STATS_RX = re.compile(r"통계|집계|읍면동\s*(?:별|마다)|(?:개수|면적)\s*(?:별로|나눠|나누어)|별로\s*(?:개수|면적|세어|나눠)")


def ROUTE_FIRST(msg: str, ctx):
    return ROUTE(msg, ctx)


def _route_front():
    """파일 이름순 ROUTE 보다 앞(운영 직행 다음)에 — '○○면만'이 요약 · 숫자 직행에, '보고서 초안'이 실태조사 보고서 직행에 먹히지 않게."""
    try:
        from . import ROUTES
    except Exception:  # noqa: BLE001
        return
    ROUTES[:] = [r for r in ROUTES if r[0] not in ("mapsvc", "mapsvc_first")]
    at = 1 if ROUTES and ROUTES[0][0] == "ops" else 0
    ROUTES.insert(at, ("mapsvc_first", ROUTE_FIRST))
    hl = [r for r in ROUTES if r[0] == "hl"]          # 답 ↔ 지도 이어 묻기(hl.py · 원칙 292 '그중 송동면만')는 그보다 앞 — 앞 답에 고를 목록이 있을 때만 잡는다
    if hl:
        ROUTES.remove(hl[0])
        ROUTES.insert(at, hl[0])


# ── 켜진 층 ───────────────────────────────────────────────────────────────────
_SET = re.compile(r"^results/[\w.-]+/(job_[0-9A-Z]{20,32})$")


async def _jobs_on(ctx) -> list[str]:
    """화면이 알린 켜진 결과 층(context.sets) → 이 계정이 볼 수 있는 작업 id(최대 12). 모르는 모양 · 남의 기관 것은 버린다."""
    sets = (getattr(ctx, "context", None) or {}).get("sets") or []
    ids = []
    for s in sets[:24] if isinstance(sets, list) else []:
        m = _SET.match(str(s))
        if m and m.group(1) not in ids:
            ids.append(m.group(1))
    if not ids:
        return []
    from landxi_api.deps import db
    p = ctx.principal
    async with db(realm="lx") as c:
        rows = await c.fetch("SELECT id, tenant_id FROM jobs WHERE id = ANY($1::text[]) AND kind IN ('infer','reinfer') AND state='done'", ids)
    ok = {r["id"] for r in rows if getattr(p, "realm", None) == "lx" or r["tenant_id"] in (getattr(p, "tenant_id", None), "lx")}
    from landxi_api import result_scope as RSC
    return (await RSC.latest_only([x for x in ids if x in ok]))[:12]      # 같은 서비스 × 지역은 최신 분석 하나(옛 분석은 시점 비교용 — 더하지 않는다)


def _nf(v: float) -> str:
    return f"{int(round(v)):,}" if abs(v - round(v)) < 0.05 else f"{v:,.1f}"


async def _avail(jobs: list[str]) -> tuple[list[str], list[str]]:
    from landxi_api import result_scope as RSC
    from landxi_api.deps import db
    await RSC.only_cls()
    a: list = [jobs]
    w = "".join(" AND " + x for x in RSC.only_sql(jobs, a))    # 서비스 분류만 보이는 층은 그 분류만 '있는 분류'(통계 · 보고서와 같은 범위 · 10-21 재검수 D)
    async with db(realm="lx") as c:
        av = await c.fetch("SELECT cls, coalesce(emd, '') AS emd, count(*) AS n FROM detections WHERE job_id = ANY($1::text[]) AND edit_state <> 'deleted'" + w + " GROUP BY 1, 2", *a)
    return sorted({r["cls"] for r in av if r["cls"]}), sorted({r["emd"] for r in av if r["emd"]})


async def _count(jobs: list[str], cond: dict) -> tuple[int, float]:
    from landxi_api import result_scope as RSC
    from landxi_api.deps import db
    a: list = [jobs]
    w = ["job_id = ANY($1::text[])", "edit_state <> 'deleted'"] + RSC.sql(cond, a) + RSC.clip_sql(jobs, a)
    async with db(realm="lx") as c:
        r = await c.fetchrow(f"SELECT count(*) AS n, coalesce(sum(area_m2), 0) AS m2 FROM detections WHERE {' AND '.join(w)}", *a)
    return int(r["n"]), float(r["m2"] or 0)


def _want_cls(word: str, classes: list[str]) -> tuple[list[str], str | None]:
    base, _, sub = str(word).partition(" ")
    if not sub and base in CLS_PARENT:                 # 논 · 밭 · 과수원 — 결과에 따로 없으면 위 분류(경작지)로(답에 '나누지 않습니다' 한 줄)
        w = [c for c in classes if c == base or c.startswith(base + "_")]
        if w:
            return w, None
        par = CLS_PARENT[base]
        w = [c for c in classes if c == par or c.startswith(par + "_")]
        return w, (None if w else f"{base} 결과가 없습니다")
    if sub:
        w = [c for c in classes if c.startswith(base) and sub in c]
        if not w:
            has_base = any(c.startswith(base) for c in classes)
            return [], (f"{base} {SUB_KO.get(sub, sub)} 구분이 없습니다" + (f" — AI가 '{base}' 한 가지로만 찾은 결과입니다" if has_base else ""))
        return w, None
    w = [c for c in classes if c == base or c.startswith(base + "_")]
    return w, (None if w else f"{base} 결과가 없습니다")


KIND_KO = {"cls": "분류", "area": "면적", "emd": "읍면동"}


async def map_filter(args: dict, ctx) -> Out:
    """조건은 쌓인다(GPT3-3 · 10-11) — 새 조건은 지금 걸린 조건(화면이 context.filter 로 알림) 위에 더해지고, 같은 종류(분류 · 면적 · 읍면동)는 바꿔 끼운다.
    '조건 풀어 줘' = 모두 · '면적 조건만 풀어 줘' = 하나만. 답 첫 줄 = 대상(켜진 층 · 이름) · 지금 걸린 조건 전부 · 맞는 수."""
    from landxi_api import result_scope as RSC
    from landxi_api.envelope import env
    out = Out(source="켜진 결과 층(결과 타일과 같은 행)")
    ctx.state["talk_kind"] = None
    prev = RSC.clean((getattr(ctx, "context", None) or {}).get("filter"))
    jobs = await _jobs_on(ctx)
    cond, new_note = None, ""
    req = str(args.get("request") or ctx.state.get("msg") or "")
    named = await _named_regions(ctx, req)
    if named and jobs and not args.get("clear"):          # 지역을 말했으면 켜진 층 가운데 그 지역 층만(WP-6 ① · P2) — 없으면 거르지 않고 '결과 없음'
        mine = [x["job"] for x in await RSC.layer_names(jobs) if str(x.get("sgg") or "") in named["codes"]]
        if not mine:
            ctx.state["cannot"] = {"kind": "nodata"}
            out.data = {"status": "missing", "missing": [named["name"]]}
            what = " · ".join(nm for _rx, nm in CLS_WORDS if re.search(_rx, req))[:20]
            out.answer = (f"{named['name']}에는 켜진 결과 층이 없어 거르지 않았습니다"
                          + (f" — {named['name']} {what} 결과는 지도 위 층으로 켜야 셀 수 있습니다." if what else "."))
            return out
        jobs = mine
    if args.get("clear"):
        keys = [k for k in str(args.get("clear_only") or "").split(",") if k in KIND_KO]
        gone = [k for k in keys if any(c["k"] == k for c in RSC.chips(prev))]
        if keys and not gone:
            out.data = {"status": "nothing"}
            out.answer = (f"{' · '.join(KIND_KO[k] for k in keys)} 조건은 걸려 있지 않습니다. "
                          + (f"지금 걸린 조건: {RSC.label(prev)}." if prev else "지금 걸린 조건이 없습니다."))
            return out
        cond = RSC.drop(prev, keys) if keys else {}
        if not cond:
            out.ui_actions.append({"op": "map_filter", "clear": True})
            out.data = {"status": "clear"}
            if jobs:
                names = await RSC.layer_names(jobs)
                n, _ = await _count(jobs, {})
                out.env("n", "켜진 결과 층의 AI 분석 결과(조건 없음)", env(n, "count", "inferred", "켜진 결과 층(지운 결과 제외)"))
                out.answer = RSC.scope_line(names, {}) + " — {{n}}건\n" + (
                    "조건을 모두 풀었습니다 — 켜진 층의 결과를 모두 보여 줍니다." if not keys
                    else f"{' · '.join(KIND_KO[k] for k in gone)} 조건을 풀었습니다 — 남은 조건이 없어 모두 보여 줍니다.")
            else:
                out.answer = "조건을 모두 풀었습니다 — 켜진 층의 결과를 모두 보여 줍니다."
            return out
        new_note = f"{' · '.join(KIND_KO[k] for k in gone)} 조건을 풀었습니다 — 남은 조건은 그대로입니다."
    if not jobs:
        ctx.state["cannot"] = {"kind": "screen"}
        out.data = {"status": "none"}
        out.answer = "지금 지도에 켜진 결과 층이 없습니다. 왼쪽에서 층을 켠 뒤 다시 말씀해 주세요."
        return out
    names = await RSC.layer_names(jobs)
    classes, emds = await _avail(jobs)
    if cond is None:
        miss, add = [], {}
        if args.get("cls"):
            w, m = _want_cls(args["cls"], classes)
            if m:
                miss.append(m)
            else:
                add["cls"] = w
        if args.get("emd"):
            e = str(args["emd"])
            w = [x for x in emds if x == e or (len(e) >= 2 and x.startswith(e))]
            if w:
                add["emd"] = w
            else:
                miss.append(f"{e} 결과가 없습니다")
        for side in ("min", "max"):
            if args.get(f"area_{side}") is not None:
                add[f"area_{side}"] = float(args[f"area_{side}"])
                add[f"area_op_{side}"] = args.get(f"area_op_{side}") or (">" if side == "min" else "<")
        if miss:
            ctx.state["cannot"] = {"kind": "nodata"}           # 개선 고리 — '자료 없음'(못 거른 조건)으로 모인다(원칙 193 자동 진화 관리)
            have = " · ".join(_ko(c) for c in classes[:4])
            out.data = {"status": "missing", "missing": miss, "classes": classes[:8]}
            out.answer = (RSC.scope_line(names, prev) + "\n켜진 층에는 " + " · ".join(miss) + ". 지도는 그대로 두었습니다."
                          + (f" 지금 결과의 분류: {have}." if have else ""))
            return out
        # 쌓기 — 같은 종류는 바꿔 끼우고(면적은 위 · 아래를 한 조건으로), 다른 종류는 더한다
        kinds_new = {("area" if k.startswith("area") else k) for k in add}
        cond = RSC.drop(prev, kinds_new)
        cond.update(add)
        old = {c["k"]: c["label"] for c in RSC.chips(prev)}
        new = {c["k"]: c["label"] for c in RSC.chips(cond)}
        swapped = [f"{KIND_KO[k]} {old[k]} → {new[k]}" for k in ("cls", "area", "emd") if k in kinds_new and k in old and old[k] != new.get(k)]
        kept = [old[k] for k in ("cls", "area", "emd") if k in old and k not in kinds_new]
        added = [new[k] for k in ("cls", "area", "emd") if k in kinds_new and k not in old]
        bits = []
        if kept and added:
            bits.append(f"앞 조건({' · '.join(kept)})에 {' · '.join(added)} 조건을 더했습니다.")
        elif added:
            bits.append("조건을 걸었습니다.")
        if swapped:
            bits.append(f"같은 종류 조건은 쌓지 않고 바꿔 끼웠습니다({' · '.join(swapped)}).")
        if not bits:
            bits.append("같은 조건이 이미 걸려 있습니다.")
        new_note = " ".join(bits)
    # 앞 조건의 값이 지금 켜진 층에 없으면 뺀다(레이어를 바꾼 경우)
    if cond.get("cls"):
        cond["cls"] = [c for c in cond["cls"] if c in classes]
        if not cond["cls"]:
            cond.pop("cls")
    if cond.get("emd"):
        cond["emd"] = [e for e in cond["emd"] if e in emds]
        if not cond["emd"]:
            cond.pop("emd")
    n, m2 = await _count(jobs, cond)
    chips = RSC.chips(cond)
    label = RSC.label(cond)
    out.scope = {"sgg": [str(x.get("sgg") or "") for x in names if x.get("sgg")], "emd": list(cond.get("emd") or []) or None,
                 "cls": [_ko(c) for c in (cond.get("cls") or classes)] or None, "kind": "det"}
    if not out.scope["sgg"]:
        out.scope.pop("sgg")
    miss_c = unapplied(req, applied=tuple(k for k in ("cls", "emd", "area_min", "area_max") if args.get(k) is not None or (k in ("cls", "emd") and cond.get(k))))
    if miss_c:                                         # 걸지 못한 조건은 늘 말한다(WP-6 ② · P4) — '조건을 걸었습니다'만 남기지 않게
        new_note = (new_note + " " if new_note else "") + f"걸지 못한 조건: {' · '.join(miss_c)}."
    act = {"op": "map_filter", "label": label, "n": n, "chips": chips, **{k: v for k, v in cond.items() if k in RSC.KEYS},
           **({"unapplied": miss_c} if miss_c else {})}
    out.ui_actions.append(act)
    out.env("n", f"조건({label or '없음'})에 맞는 AI 분석 결과", env(n, "count", "inferred", "켜진 결과 층(지운 결과 제외)"))
    out.env("m2", f"조건({label or '없음'})에 맞는 결과 면적 합", env(round(m2), "m2", "inferred", "켜진 결과 층(지운 결과 제외)"))
    out.data = {"status": "ok", "조건": label, "맞는 수": "n", "조건 칩": [c["label"] for c in chips]}
    tail = "" if len(chips) < 2 else "\n조건은 쌓입니다 — '조건 풀어 줘'로 모두, '면적 조건만 풀어 줘'처럼 하나씩 풉니다."
    out.answer = (RSC.scope_line(names, cond) + (" — {{n}}건" if n else " — 0건") + "\n" + new_note
                  + (" 맞는 결과가 없어 지도에는 아무것도 남지 않습니다." if not n else "") + tail)
    return out


async def _named_regions(ctx, t: str) -> dict | None:
    """질문의 시군구 → {name, codes}(한 시의 여러 구 · 옛 코드 포함). 없으면 None."""
    try:
        from ... import talk
        from landxi_api.regions import city_children
        g = talk.regions_in(t)
        if not g:
            return None
        r, _ = talk.pick(ctx, g[0])
        if not r:
            return None
        codes = {str(c["sgg_cd"]) for c in g[0]} | {str(r["sgg_cd"])} | {str(c.get("prev_cd")) for c in g[0] if c.get("prev_cd")}
        for c in list(codes):
            codes |= {x["sgg_cd"] for x in city_children(c)}
        nm = (r.get("name") or "").split(" ")[0] if len(g[0]) > 1 else (r.get("name") or "")
        return {"name": nm, "codes": codes}
    except Exception:  # noqa: BLE001
        return None


async def _subject(ctx, t: str, jobs: list[str], why: str) -> tuple[list[str], dict]:
    """통계 · 보고서가 함께 쓰는 대상 — 고른 층 + 지도에 걸린 조건 + 질문의 분류(그 분류가 있는 층만) · 읍면동(10-18 · 숫자 한 출처).
    '남원시 경작지 통계 보고서'가 켜진 비닐하우스 층까지 싣지 않게: 질문이 분류를 말하면 그 분류가 있는 층 · 그 분류 행만."""
    from landxi_api import result_scope as RSC
    cond = RSC.clean((getattr(ctx, "context", None) or {}).get("filter")) if why == "켜진 층" else {}
    classes, emds = await _avail(jobs)
    cw = next((k for rx, k in CLS_WORDS if re.search(rx, t)), None)
    if cw:
        w, _m = _want_cls(cw, classes)
        if w:
            cond = {**cond, "cls": w}
            have = await _jobs_with(jobs, w)
            jobs = [j for j in jobs if j in have] or jobs
        elif why == "켜진 층":
            ctx.state["subject_miss"] = _m or f"{cw} 결과가 없습니다"     # 물은 분류가 켜진 층에 없다 — 다른 층(비닐하우스) 숫자로 대신 답하지 않는다(10-21 재검수 B)
    em = [x for x in EMD_RX.findall(t) if x not in EMD_SKIP and x != "읍면동"]
    if em:
        w = [x for x in emds if x == em[0] or x.startswith(em[0])]
        if w:
            cond = {**cond, "emd": w}
    return jobs, cond


async def _jobs_with(jobs: list[str], cls: list[str]) -> set[str]:
    from landxi_api.deps import db
    from landxi_api import result_scope as RSC
    await RSC.only_cls()
    a: list = [jobs, cls]
    w = "".join(" AND " + x for x in RSC.only_sql(jobs, a))
    async with db(realm="lx") as c:
        rows = await c.fetch("SELECT DISTINCT job_id FROM detections WHERE job_id = ANY($1::text[]) AND cls = ANY($2::text[]) AND edit_state <> 'deleted'" + w, *a)
    return {r["job_id"] for r in rows}


async def map_stats(args: dict, ctx) -> Out:
    """켜진 결과 층(지금 걸린 조건 그대로)의 읍면동별 개수 · 면적 — 보고서 · 거르기와 같은 범위 · 같은 행(GPT3-4 · 원칙 3).
    질문에 지역이 있으면 그 지역의 켜진 층만, 켜진 층에 그 지역이 없으면 그 지역의 결과(보고서와 같은 고르기)."""
    from landxi_api import result_scope as RSC
    from landxi_api.deps import db
    from landxi_api.envelope import env
    out = Out(source="켜진 결과 층(결과 타일과 같은 행)")
    t = re.sub(r"\s+", " ", args.get("request") or ctx.state.get("msg") or "").strip()
    try:
        jobs, why = await _target_jobs(ctx, t)
    except ToolError as e:
        if e.status == 404:
            out.data = {"status": "no_data", "text": "해당 지역 데이터가 없습니다"}
            out.answer = "그 지역은 아직 AI 분석 결과가 없습니다."
            return out
        raise
    if not jobs:
        ctx.state["cannot"] = {"kind": "screen"}
        out.data = {"status": "none"}
        out.answer = "지금 지도에 켜진 결과 층이 없습니다. 왼쪽에서 층을 켠 뒤 다시 말씀해 주세요."
        return out
    jobs, cond = await _subject(ctx, t, jobs, why)
    names = await RSC.layer_names(jobs)
    if (miss := ctx.state.pop("subject_miss", None)):
        ctx.state["cannot"] = {"kind": "nodata"}
        out.data = {"status": "missing", "missing": [miss]}
        out.answer = RSC.scope_line(names, {}, why) + f"\n켜진 층에는 {miss}. 물으신 분류의 결과 층을 켠 뒤 다시 말씀해 주세요."
        return out
    a: list = [jobs]
    w_ = ["job_id = ANY($1::text[])", "edit_state <> 'deleted'"] + RSC.sql(cond, a) + RSC.clip_sql(jobs, a)
    async with db(realm="lx") as c:
        rows = await c.fetch(f"SELECT coalesce(nullif(emd, ''), '읍면동 밖') AS emd, job_id, count(*) AS n, coalesce(sum(area_m2), 0) AS m2 FROM detections "
                             f"WHERE {' AND '.join(w_)} GROUP BY 1, 2", *a)
    by: dict[str, list] = {}
    per: dict[str, int] = {}
    for r in rows:
        e = by.setdefault(r["emd"], [0, 0.0])
        e[0] += int(r["n"])
        e[1] += float(r["m2"])
        per[r["job_id"]] = per.get(r["job_id"], 0) + int(r["n"])
    tot = sum(v[0] for v in by.values())
    cls_av, _e = await _avail(jobs)
    out.scope = {"sgg": [str(x.get("sgg") or "") for x in names if x.get("sgg")] or None, "emd": list(cond.get("emd") or []) or None,
                 "cls": [_ko(c) for c in (cond.get("cls") or cls_av)] or None, "kind": "det"}
    if not out.scope["sgg"]:
        out.scope.pop("sgg")
    out.env("total", "대상 층의 AI 분석 결과 수(지금 조건 · 지운 결과 제외)", env(tot, "count", "inferred", "detections"))
    out.env("emds", "결과가 있는 읍면동 수", env(len([k for k in by if k != "읍면동 밖"]), "곳", "inferred", "detections"))
    top = sorted(by.items(), key=lambda x: (-x[1][0], x[0]))
    rows_c = []
    for i, (e, v) in enumerate(top[:12]):
        out.env(f"e{i}", f"{e} AI 분석 결과 수", env(v[0], "count", "inferred", "detections"), scope={"emd": [e]})
        rows_c.append({"label": e, "env": f"e{i}"})
    if rows_c:
        out.blocks.append({"type": "chart", "kind": "bar", "title": "읍면동별 개수", "rows": rows_c})
    line = RSC.scope_line(names, cond, why) + " — 결과 {{total}}건 · 읍면동 {{emds}}곳"
    body = " · ".join(f"{e} {{{{e{i}}}}}건" for i, (e, _v) in enumerate(top[:5]))
    lay = ""
    if len(names) > 1:
        for i, x in enumerate(names):
            out.env(f"l{i}", f"{x['name']} 결과 수", env(per.get(x["job"], 0), "count", "inferred", "detections"))
        lay = "\n층별: " + " · ".join(f"{x['name']} {{{{l{i}}}}}건" for i, x in enumerate(names))
    out.data = {"status": "ok", "대상": [x["name"] for x in names], "조건": RSC.label(cond), "읍면동": [e for e, _ in top[:12]]}
    out.answer = line + (f"\n많은 곳: {body}" if body else "\n맞는 결과가 없습니다(0건).") + lay
    return out


def _ko(c: str) -> str:
    from landxi_api.spaces import class_ko
    s = class_ko(c)
    return s.replace("다동", "연동")


# ── AI 분석 결과 보고서 ───────────────────────────────────────────────────────────
CLS_COLOR = {"경작지": "#0FA9A0", "비닐하우스": "#07706A", "건물": "#2B3440", "주차장": "#8F99A8"}
NOTICE = "AI 분석 결과(검수 전)는 참고자료입니다 — 처분은 담당자가 정합니다."
NEED = "어느 지역의 보고서를 만들까요? 지역 이름을 함께 말씀하시거나, 지도 서비스에서 결과 층을 켠 뒤 다시 말씀해 주세요."


async def _target_jobs(ctx, text: str) -> tuple[list[str], str]:
    """보고서 · 읍면동 통계 대상 작업 — 같은 질문 맥락이면 같은 범위(GPT3-4 · 원칙 3).
    ① 질문의 지역: 켜진 층 가운데 그 지역 것이 있으면 그 레이어들(켜진 층) · 없으면 그 지역의 결과(results._set)
    ② 켜진 층 전부 ③ 화면 지역. → (작업 id 들, 어디서 골랐는지 '켜진 층' | '질문의 지역' | '지금 보는 지역')."""
    from ... import talk
    from .. import results as RS
    from landxi_api import result_scope as RSC
    groups = talk.regions_in(text)
    named = [talk.pick(ctx, g)[0] for g in groups if g]
    named = [x for x in named if x]
    cls = next((k for rx, k in CLS_WORDS if re.search(rx, text)), None)
    on = await _jobs_on(ctx)
    if named:
        if on:
            want = {x["sgg_cd"] for x in named}
            mine = [x["job"] for x in await RSC.layer_names(on) if x["sgg"] in want]
            if mine:
                return mine, "켜진 층"
        s = await RS._set({"region": named[0]["sgg_cd"], **({"cls": cls} if cls else {})}, ctx)
        return [s.rsplit("/", 1)[-1]], "질문의 지역"
    if on:
        return on[:12], "켜진 층"
    if (ctx.context or {}).get("region"):
        s = await RS._set({**({"cls": cls} if cls else {})}, ctx)
        return [s.rsplit("/", 1)[-1]], "지금 보는 지역"
    return [], ""


async def _job_data(job: str, cond: dict | None = None) -> dict | None:
    from landxi_api.deploys import gsd_word
    from landxi_api.deps import db
    from landxi_api.regions import region_of
    from landxi_api.release import acc_of, _acc_at
    async with db(realm="lx") as c:
        j = await c.fetchrow("SELECT j.id, j.card_id, j.model_id, j.options, j.counts, j.finished_at, c.name->>'ko' AS cname, i.name AS iname, i.year, i.epoch, "
                             "i.gsd_m, m.metrics, pr.name AS pname FROM jobs j LEFT JOIN cards c ON c.id=j.card_id LEFT JOIN imagery i ON i.id=j.imagery_id "
                             "LEFT JOIN models m ON m.id=j.model_id LEFT JOIN projects pr ON pr.id = j.options->>'project_id' WHERE j.id=$1", job)
        if not j:
            return None
        from landxi_api import result_scope as RSC
        ca: list = [job]
        cw = RSC.sql(cond or {}, ca) + RSC.clip_sql(job, ca)       # 지금 걸린 조건(켜진 층 보고서 · 지도 서비스와 같은 범위)
        rows = await c.fetch("SELECT coalesce(nullif(emd, ''), '') AS emd, cls, count(*) AS n, coalesce(sum(area_m2), 0) AS m2 FROM detections "
                             "WHERE job_id=$1 AND edit_state <> 'deleted'" + "".join(" AND " + x for x in cw) + " GROUP BY 1, 2", *ca)
    o = j["options"] if isinstance(j["options"], dict) else json.loads(j["options"] or "{}")
    mt = j["metrics"] if isinstance(j["metrics"], dict) else json.loads(j["metrics"] or "{}") if j["metrics"] else {}
    iname = j["iname"]
    if isinstance(iname, str) and iname.startswith("{"):
        iname = json.loads(iname)
    iname = (iname or {}).get("ko") if isinstance(iname, dict) else (iname or "")
    yr = str(j["year"] or (str(j["epoch"])[:4] if j["epoch"] else ""))
    rg = region_of(o.get("sgg_cd")) if o.get("sgg_cd") else None
    proj = bool(o.get("project_infer"))
    if o.get("scope_full"):
        scope = f"전역 · 읍면동 {o.get('emd_total')}곳" if o.get("emd_total") else "전역"
    elif o.get("coverage") is not None:
        pc = float(o["coverage"]) * 100
        scope = "영상 있는 1% 미만" if pc < 1 else f"영상 있는 {round(pc)}%"
    else:
        scope = "배포 전 모델" if proj else ""
    return {"job": job, "service": f"프로젝트 추론 — {j['pname']}" if proj else (j["cname"] or "분석 서비스"),
            "region": " ".join(x for x in ((rg or {}).get("name") or "", o.get("range_name") or "" if proj else "") if x) or "—",
            "sgg": (rg or {}).get("sgg_cd") or o.get("sgg_cd"), "scope": scope,
            "imagery": {"name": iname or "", "year": yr, "word": " ".join(x for x in (yr, gsd_word(j["gsd_m"])) if x)},
            "finished": j["finished_at"], "acc": acc_of(mt), "acc_at": _acc_at(mt),
            "found": sum(int(v or 0) for v in (j["counts"] if isinstance(j["counts"], dict) else json.loads(j["counts"] or "{}")).values()),
            "rows": [dict(r) for r in rows]}


def _map_png(job: str, sgg: str | None, rows_geo: list, counts: dict | None = None, w_in=7.0, h_in=5.2) -> bytes | None:
    """지도 그림 — 읍면동 경계(연한 선 · 이름) + AI 분석 결과(분류 색 · 지도 서비스 범례와 같은 색). 결과가 많으면 점으로."""
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    from matplotlib.collections import PolyCollection
    import numpy as np
    from shapely import wkb
    from shapely.geometry import shape
    from matplotlib import font_manager
    have = {f.name for f in font_manager.fontManager.ttflist}
    plt.rcParams["font.family"] = [next((f for f in ("Malgun Gothic", "NanumGothic", "Noto Sans CJK KR", "AppleGothic") if f in have), "sans-serif")]
    plt.rcParams["axes.unicode_minus"] = False
    fig, ax = plt.subplots(figsize=(w_in, h_in), dpi=160)
    ax.set_facecolor("#F7F8FA")
    fc = None
    if sgg:
        try:
            from landxi_api.regions import emd_fc
            fc = emd_fc(sgg)
        except Exception:  # noqa: BLE001
            fc = None
    for f in (fc or {}).get("features") or []:
        try:
            g = shape(f["geometry"])
        except Exception:  # noqa: BLE001
            continue
        for poly in getattr(g, "geoms", [g]):
            x, y = poly.exterior.xy
            ax.fill(x, y, facecolor="#FFFFFF", edgecolor="#C5CBD3", linewidth=0.6, zorder=1)
        nm = (f.get("properties") or {}).get("name") or (f.get("properties") or {}).get("emd_kor_nm") or ""
        n = (counts or {}).get(nm)
        if nm and n:                                  # 결과가 있는 읍면동만 이름 · 개수(보고서 표와 같은 값)
            pt = g.representative_point()
            ax.text(pt.x, pt.y, nm + "\n" + f"{n:,}건", fontsize=6, color="#3A4651", ha="center", va="center", zorder=4,
                    bbox={"boxstyle": "round,pad=0.2", "fc": (1, 1, 1, 0.75), "ec": "none"})
    by: dict[str, list] = {}
    pts: dict[str, list] = {}
    many = len(rows_geo) > 15000
    for cls, b in rows_geo:
        try:
            g = wkb.loads(bytes(b))
        except Exception:  # noqa: BLE001
            continue
        k = next((n for n in CLS_COLOR if str(cls or "").startswith(n)), "비닐하우스")
        if many:
            c = g.centroid
            pts.setdefault(k, []).append((c.x, c.y))
            continue
        for poly in getattr(g, "geoms", [g]):
            by.setdefault(k, []).append(np.asarray(poly.exterior.coords)[:, :2])   # 꼭짓점 배열(PolyCollection — 패치 객체 없이 · 15천 개 5초 → 1초대)
    for k, ps in by.items():
        ax.add_collection(PolyCollection(ps, closed=True, facecolor=CLS_COLOR[k], edgecolor=CLS_COLOR[k], linewidth=0.9, alpha=0.9, zorder=3))
    for k, ps in pts.items():
        xs, ys = zip(*ps)
        ax.scatter(xs, ys, s=0.6, c=CLS_COLOR[k], zorder=3, linewidths=0)
    ax.autoscale_view()
    if fc and fc.get("features"):
        from shapely.ops import unary_union
        try:
            u = unary_union([shape(f["geometry"]) for f in fc["features"]]).bounds
            ax.set_xlim(u[0], u[2])
            ax.set_ylim(u[1], u[3])
        except Exception:  # noqa: BLE001
            pass
    import math
    lat = sum(ax.get_ylim()) / 2
    ax.set_aspect(1 / max(0.2, math.cos(math.radians(lat))))
    ax.set_xticks([])
    ax.set_yticks([])
    for s in ax.spines.values():
        s.set_visible(False)
    from matplotlib.patches import Patch
    hs = [Patch(facecolor=CLS_COLOR[k], label=k) for k in (by or pts)]
    if hs:
        ax.legend(handles=hs, loc="lower right", fontsize=7, frameon=True, framealpha=0.9)
    fig.tight_layout(pad=0.3)
    buf = io.BytesIO()
    fig.savefig(buf, format="png")
    plt.close(fig)
    return buf.getvalue()


def _emd_counts(d: dict) -> dict:
    out: dict = {}
    for r in d["rows"]:
        if r["emd"]:
            out[r["emd"]] = out.get(r["emd"], 0) + int(r["n"])
    return out


def _hwpx(parts: list[dict], pngs: list[bytes | None], made: str, now: dt.datetime | None = None) -> tuple[bytes, str]:
    """AI 분석 결과 보고서 — 한글 문서(공용 서식 landxi_api.hwpx · 10-14 원칙 250). 숫자 = 지도 서비스 결과 층과 같은 행."""
    from landxi_api import hwpx as HX
    from landxi_api.envelope import split_round
    head = parts[0]
    title = f"{head['region']} {head['service']} AI 분석 결과 보고서(초안)" if len(parts) == 1 else f"AI 분석 결과 보고서(초안) — 결과 층 {len(parts)}개"
    doc = HX.Doc()
    doc.title("AI 분석 결과 보고서(초안)",                     # 제목은 짧게(두 줄 넘김 · 글자 중간 끊김 0) — 지역 · 서비스는 부제
              f"{head['region']} · {head['service']} · 결과 확인 전" if len(parts) == 1 else f"결과 층 {len(parts)}개 · 결과 확인 전")
    doc.notice(NOTICE)
    for k, (d, png) in enumerate(zip(parts, pngs), 1):
        tot_n = sum(int(r["n"]) for r in d["rows"])
        tot_m2 = sum(float(r["m2"]) for r in d["rows"])
        doc.heading("개요" if len(parts) == 1 else f"{d['region']} · {d['service']}")
        fin = d["finished"].astimezone(dt.timezone(dt.timedelta(hours=9))).strftime("%Y.%m.%d") if d["finished"] else "—"
        img = (d["imagery"]["name"] if d["imagery"]["word"] and d["imagery"]["word"] in (d["imagery"]["name"] or "")
               else " · ".join(x for x in (d["imagery"]["word"], d["imagery"]["name"]) if x) or "—")
        acc = (f"{d['acc']}%" + (f" (학습 끝 검증 · {d['acc_at'].replace('-', '.')})" if d.get("acc_at") else "")) if d["acc"] is not None else "기록 없음"
        doc.overview([("분석 서비스", d["service"]), ("지역", d["region"] + (f" · {d['scope']}" if d["scope"] else "")),
                      *([("조건", d["cond"])] if d.get("cond") else []), ("영상 시점", img), ("분석한 날", fin), ("AI 모델 정확도", acc),
                      ("찾은 결과", f"{tot_n:,}건 · 면적 합 {round(tot_m2):,}㎡ ({tot_m2 / 1e4:,.1f}ha)"), ("만든 날짜", made)], cols=1)
        sv = re.sub(r"\s*분석\s*서비스$", "", d["service"])
        doc.figure(png, f"{d['region']} {sv} AI 분석 결과", max_w=int(HX.TEXT_W * 0.82), note="읍면동 경계 위에 AI가 찾은 결과를 칠했습니다")
        by_emd: dict[str, list] = {}
        for r in d["rows"]:
            e = by_emd.setdefault(r["emd"] or "읍면동 밖", [0, 0.0])
            e[0] += int(r["n"])
            e[1] += float(r["m2"])
        el = sorted(by_emd.items(), key=lambda x: (-x[1][0], x[0]))
        m2s = split_round([v[1] for _, v in el], 0, round(tot_m2))          # 줄 합 = 합계(최대 나머지 · GPT5-3)
        pcs = split_round([v[0] / tot_n * 100 if tot_n else 0 for _, v in el], 1, 100 if tot_n else 0)
        rows = [["읍면동", "개수(건)", "면적(㎡)", "개수 비율"]] + [[e, f"{v[0]:,}", f"{m2s[i]:,}", f"{pcs[i]:.1f}%"] for i, (e, v) in enumerate(el)]
        rows.append(["합계", f"{tot_n:,}", f"{round(tot_m2):,}", "100%" if tot_n else "—"])
        doc.table(rows, [30, 22, 26, 22], aligns=["l", "r", "r", "r"], total_row=True, caption="읍면동별 개수 · 면적")
        cls_set = sorted({r["cls"] for r in d["rows"] if r["cls"]})
        if len(cls_set) > 1:
            crow = []
            for cl in cls_set:
                n = sum(int(r["n"]) for r in d["rows"] if r["cls"] == cl)
                m2 = sum(float(r["m2"]) for r in d["rows"] if r["cls"] == cl)
                crow.append([_ko(cl), n, m2])
            for x, m in zip(crow, split_round([x[2] for x in crow], 0)):   # 분류 칸 합 = 반올림 전 합을 한 번 반올림
                x[2] = m
            doc.table([["분류", "개수(건)", "면적(㎡)"]] + [[a, f"{b:,}", f"{c:,}"] for a, b, c in crow], [40, 30, 30], aligns=["l", "r", "r"], caption="분류별")
    doc.source("Land-XI AI 분석 결과 — 개수 · 면적은 AI가 그린 결과의 수와 넓이입니다(결과 확인 전 · 지운 결과 제외). 지도 서비스의 결과 층 · 내려받기 파일과 같은 값입니다.", made)
    svc = re.sub(r"\s*분석\s*서비스$", "", head["service"]) if len(parts) == 1 else "결과층"
    name = HX.safe_name(f"{head['region']}_{svc}_AI분석보고서_{made[:10].replace('.', '')}")
    return doc.package(title, now), name


async def ai_report(args: dict, ctx) -> Out:
    from landxi_api.deps import db
    from landxi_api.envelope import env
    from ... import config
    from ...report import file_href
    t = re.sub(r"\s+", " ", args.get("request") or ctx.state.get("msg") or "").strip()
    c0 = getattr(ctx, "context", None) or {}
    if c0.get("page") == "xi-clean" and getattr(ctx.principal, "realm", None) == "lx" and getattr(ctx, "lang", "ko") == "ko":
        o = await _dash_report(ctx, t)                          # XI맵: '통계 보기' 판 · '보고서로'와 같은 사양 · 같은 문서(10-18)
        if o is not None:
            return o
    out = Out(source="AI 분석 결과(지도 서비스와 같은 행)")
    try:
        jobs, why = await _target_jobs(ctx, t)
    except ToolError as e:
        if e.status == 404:
            from ... import talk
            g = talk.regions_in(t)
            nm = (talk.pick(ctx, g[0])[0] or {}).get("full") if g else None
            out.data = {"status": "no_data", "text": "해당 지역 데이터가 없습니다", **({"next": f"XI맵에서 {nm} AI 분석을 먼저 실행하세요"} if nm else {})}
            out.answer = f"{nm or '그 지역'}은 아직 AI 분석 결과가 없습니다."
            return out
        raise
    if not jobs:
        ctx.state["cannot"] = {"kind": "other"}
        out.data = {"status": "need_region"}
        out.answer = NEED
        return out
    from landxi_api import result_scope as RSC
    jobs, cond = await _subject(ctx, t, jobs, why)            # 통계 답(map_stats)과 같은 대상 · 같은 조건 — 질문의 분류 · 읍면동까지
    if (miss := ctx.state.pop("subject_miss", None)):
        ctx.state["cannot"] = {"kind": "nodata"}
        out.data = {"status": "missing", "missing": [miss]}
        out.answer = RSC.scope_line(await RSC.layer_names(jobs), {}, why) + f"\n켜진 층에는 {miss} — 다른 분류 숫자로 보고서를 만들지 않았습니다. 물으신 분류의 결과 층을 켠 뒤 다시 말씀해 주세요."
        return out
    parts = [d for d in await asyncio.gather(*(_job_data(j, cond) for j in jobs)) if d and d["rows"]]   # 층마다 동시에(층 둘 · 보고서 시간 줄이기)
    if not parts:
        out.data = {"status": "no_data", "text": "해당 지역 데이터가 없습니다"}
        out.answer = RSC.scope_line(await RSC.layer_names(jobs), cond, why) + "\n고른 대상에 맞는 결과가 없어(0건) 보고서를 만들지 않았습니다."
        return out
    lb = RSC.label(cond)
    for d in parts:
        d["cond"] = lb
        if cond.get("emd") and len(cond["emd"]) == 1:
            d["region"] = f"{d['region']} {cond['emd'][0]}"
    geos = []
    async with db(realm="lx") as c:
        for d in parts:
            ga: list = [d["job"]]
            gw = RSC.sql(cond, ga) + RSC.clip_sql(d["job"], ga)
            q = "SELECT cls, ST_AsBinary(ST_SimplifyPreserveTopology(geom, 0.000005)) AS b FROM detections WHERE job_id=$1 AND edit_state <> 'deleted'"
            rows = await c.fetch(q + "".join(" AND " + x for x in gw) + " LIMIT 60000", *ga)
            geos.append([(r["cls"], r["b"]) for r in rows])
    now = dt.datetime.now(dt.timezone(dt.timedelta(hours=9)))
    made = now.strftime("%Y.%m.%d %H:%M")

    def build():
        pngs = [_map_png(d["job"], d["sgg"], g, _emd_counts(d)) for d, g in zip(parts, geos)]
        blob, name = _hwpx(parts, pngs, made, now)
        return blob, name, pngs
    blob, name, pngs = await asyncio.to_thread(build)
    d0 = config.ARTIFACT_DIR / ctx.run_id
    d0.mkdir(parents=True, exist_ok=True)
    (d0 / name).write_bytes(blob)
    (d0 / "draft.hwpx").write_bytes(blob)
    if pngs and pngs[0]:
        (d0 / "ai-report-map.png").write_bytes(pngs[0])
    tot = sum(int(r["n"]) for d in parts for r in d["rows"])
    n_emd = len({r["emd"] for d in parts for r in d["rows"] if r["emd"]})       # 읍면동 이름 수(층이 둘이어도 한 번 · 통계 답과 같은 셈)
    out.scope = {"sgg": [str(d.get("sgg") or "") for d in parts if d.get("sgg")] or None, "emd": list(cond.get("emd") or []) or None,
                 "cls": sorted({_ko(r["cls"]) for d in parts for r in d["rows"] if r.get("cls")}) or None, "kind": "det"}
    if not out.scope["sgg"]:
        out.scope.pop("sgg")
    out.env("total", "보고서의 AI 분석 결과 수(지도 서비스 결과 층과 같은 행 · 지운 결과 제외)", env(tot, "count", "inferred", "detections"))
    out.env("emds", "보고서에 실린 읍면동 수", env(n_emd, "곳", "inferred", "detections"))
    try:
        rb = await asyncio.to_thread(_write_view, ctx, _parts_spec(parts, why), now, name)   # 보고서 보기(원칙 299) — 문서 표와 같은 행
    except Exception:  # noqa: BLE001
        rb = None
    if rb:
        out.blocks.append(rb)
    out.blocks.append({"type": "file", "label": name, "href": file_href(ctx.run_id, name)})
    if pngs and pngs[0]:
        out.blocks.append({"type": "image", "src": file_href(ctx.run_id, "ai-report-map.png"), "caption": "보고서 지도 그림", "tag": "AI 분석 결과"})
    ctx.state["artifact"] = {"file_url": f"/api/v1/agent/runs/{ctx.run_id}/draft.hwpx", "href": file_href(ctx.run_id, name), "filename": name,
                             "place": parts[0]["region"]}
    out.data = {"보고서": name, "대상": [f"{d['region']} {d['service']}" for d in parts], "고른 곳": why}
    names = await RSC.layer_names(jobs)                     # 대상 = 고른 레이어 전부(조건에 0건인 레이어도 — 통계 첫 줄과 같은 대상)
    top = _top_emd(parts)
    _hl_counts(ctx, parts, top)                              # 지도 강조(원칙 292) — 보고서의 많은 곳을 지도에서도
    out.whitelist |= {e for e, _n in top}
    out.answer = (RSC.scope_line(names, cond, why) + " — 결과 {{total}}건 · 읍면동 {{emds}}곳\n"
                  "AI 분석 결과 보고서 초안을 만들었습니다" + (f"(많은 곳: {' · '.join(e for e, _n in top)})." if top else "."))
    return out


def _write_view(ctx, spec: dict, now: dt.datetime, hwpx_name: str) -> dict | None:
    """보고서 보기 한 벌(report.json) + 엑셀(같은 사양) — run 폴더에. 돌려주는 것 = 채팅 '보고서 보기' 블록(10-21 원칙 299)."""
    from landxi_api import xreport as XR
    from ... import config
    from ...report import file_href
    try:
        d0 = config.ARTIFACT_DIR / ctx.run_id
        d0.mkdir(parents=True, exist_ok=True)
        files = {"hwpx": {"href": file_href(ctx.run_id, hwpx_name), "name": hwpx_name}}
        try:
            xb, xn = XR.build_xlsx(spec, now)
            (d0 / xn).write_bytes(xb)
            files["xlsx"] = {"href": file_href(ctx.run_id, xn), "name": xn}
        except Exception:  # noqa: BLE001 — 엑셀이 안 되면 엑셀만 빼고
            pass
        (d0 / "report.json").write_text(json.dumps(XR.view_doc(spec, now, files), ensure_ascii=False, default=str), encoding="utf-8")
        return {"type": "report", "label": str(spec.get("title") or "통계 보고서"), "href": file_href(ctx.run_id, "report.json")}
    except Exception:  # noqa: BLE001
        return None


def _parts_spec(parts: list[dict], why: str = "") -> dict:
    """켜진 결과 층 보고서(기관 · 지도 서비스) → 보고서 보기 사양 — 한글 문서의 '읍면동별 개수 · 면적' 표와 같은 행(다시 세지 않음)."""
    from . import dash as D
    head = parts[0]
    svc = re.sub(r"\s*(?:AI\s*)?분석\s*서비스$", "", head["service"]).strip() or head["service"]
    by: dict[str, list] = {}
    for d in parts:
        for r in d["rows"]:
            e = by.setdefault(r["emd"] or "읍면동 밖", [0, 0.0])
            e[0] += int(r["n"])
            e[1] += float(r["m2"])
    el = sorted(by.items(), key=lambda x: (-x[1][0], x[0]))
    tot = sum(v[0] for _, v in el)
    m2 = sum(v[1] for _, v in el)
    code: dict[str, str] = {}
    sggs = {d.get("sgg") for d in parts if d.get("sgg")}
    sgg = next(iter(sggs)) if len(sggs) == 1 else None
    if sgg:
        try:
            from landxi_api.regions import emd_index, region_of
            rg = region_of(sgg)
            ix = emd_index(rg["sgg_cd"]) if rg else None
            if ix:
                code = {str(n): str(c) for n, c in zip(ix.names, ix.codes) if n}
                sgg = rg["sgg_cd"]
        except Exception:  # noqa: BLE001
            code = {}
    rows = [{"k": code.get(e) or e, "label": e, "v": v[0], "m2": round(v[1])} for e, v in el]
    named = [r for r in rows if r["label"] != "읍면동 밖"]
    region = head["region"] if len(parts) == 1 or len({d["region"] for d in parts}) == 1 else "결과 층 여러 곳"
    unit = "건"
    kp = [{"label": svc, "value": tot, "unit": unit}, {"label": "결과가 있는 읍면동", "value": len(named), "unit": "곳"},
          {"label": "면적 합", "value": round(m2 / 1e4, 1), "unit": "ha", "d": 1}]
    panels = [{"type": "bar", "title": f"읍면동별 {svc}", "unit": unit, "rows": named[:16], "pick": "emd", "scale": D.scale_for([r["v"] for r in named[:16]], "count")}]
    if len(parts) > 1:
        panels.append({"type": "donut", "title": "결과 층별", "unit": unit,
                       "rows": [{"k": str(i), "label": f"{d['service']}" + (f" · {d['imagery']['year']}" if d["imagery"].get("year") else ""), "v": sum(int(r["n"]) for r in d["rows"])} for i, d in enumerate(parts)]})
    panels.append({"type": "rank", "title": "읍면동 순위", "unit": unit, "rows": named[:10], "pick": "emd"})
    mp = None
    if sgg and code:
        vals = {r["k"]: r["v"] for r in named if r["k"] in code.values()}
        mp = {"level": "emd", "sgg": sgg, "title": f"{svc} 수", "unit": unit, "values": vals, "labels": {r["k"]: r["label"] for r in named},
              "scale": D.scale_for(list(vals.values()), "count"), "meaning": "count"}
    say = []
    if named:
        top = named[:3]
        say.append(f"{D.J(svc, '은', '는')} " + " · ".join(f"{r['label']} {r['v']:,}{unit}" for r in top) + " 순으로 많습니다.")
        if tot and len(named) > 3:
            say.append(f"위 세 곳이 전체의 {round(sum(r['v'] for r in top) / tot * 100)}%를 차지합니다.")
    fin = max((d["finished"] for d in parts if d.get("finished")), default=None)
    im = head["imagery"]
    img = im.get("name") if im.get("word") and im["word"] in (im.get("name") or "") else " · ".join(x for x in (im.get("word"), im.get("name")) if x)   # 한글 문서 개요와 같은 말
    means = [["지역", region], ["업무", svc]] + ([["영상", img]] if img else []) + ([["분석한 날", fin.astimezone(dt.timezone(dt.timedelta(hours=9))).strftime("%Y. %m. %d.")]] if fin else [])
    return {"kind": "layer", "title": f"{region} · {svc}", "means": means, "fuse": ["AI 분석 결과"], "kpis": kp, "panels": panels, "map": mp, "say": say,
            "sgg": sgg, "main": {"label": svc, "value": tot, "unit": unit}, "emd_rows": rows,
            **({"emd": [r["label"] for r in named]} if (parts[0].get("cond") and len(named) <= 3) else {})}


def _top_emd(parts: list[dict], k: int = 3) -> list[tuple[str, int]]:
    by: dict[str, int] = {}
    for d in parts:
        for r in d["rows"]:
            if r["emd"]:
                by[r["emd"]] = by.get(r["emd"], 0) + int(r["n"])
    return sorted(by.items(), key=lambda x: (-x[1], x[0]))[:k]


def _hl_counts(ctx, parts: list[dict], top: list) -> None:
    """보고서 읍면동별 개수 → 지도 강조 목록(한 시군구일 때만 · 값 = 보고서 표와 같은 값)."""
    sggs = {d.get("sgg") for d in parts if d.get("sgg")}
    if len(sggs) != 1:
        return
    try:
        from landxi_api.regions import emd_index, region_of
        from . import hl as HL
        r = region_of(next(iter(sggs)))
        ix = emd_index(r["sgg_cd"]) if r else None
        if not ix:
            return
        code = {str(n): str(c) for n, c in zip(ix.names, ix.codes) if n}
        by: dict[str, int] = {}
        for d in parts:
            for row in d["rows"]:
                if row["emd"] in code:
                    by[row["emd"]] = by.get(row["emd"], 0) + int(row["n"])
        items = [{"k": code[e], "name": e, "v": float(n)} for e, n in sorted(by.items(), key=lambda x: -x[1])]
        refs = HL._scoped(ctx, {"level": "emd", "sgg": r["sgg_cd"], "unit": "", "what": "AI 분석 결과", "items": items, "src": "report"})
        if refs:
            ctx.state["map_refs"] = refs
            ctx.state["map_refs_base"] = refs
    except Exception:  # noqa: BLE001
        return


REP_WORDS = re.compile(r"보고서|리포트|초안|만들어\s*(?:줘|주세요|줄래)?|써\s*(?:줘|주세요)|작성(?:해\s*(?:줘|주세요))?|뽑아\s*(?:줘|주세요)?")


async def _dash_report(ctx, t: str) -> Out | None:
    """XI맵(LX)의 '○○ 통계 보고서 만들어 줘' — 대상 = 질문의 업무(없으면 앞 답의 업무) · 지역(질문 → 앞 답 → 화면) · 읍면동(질문 → 앞 답에서 고른 곳 → 지도 조건).
    사양 = 통계 도구(dash.build)가 '통계 보기' 판에 주는 그것 · 문서 = 판의 '보고서로'와 같은 함수(xreport.build_hwpx) — 숫자 한 출처.
    업무를 알 수 없으면 None(켜진 층 보고서 길)."""
    from landxi_api import result_scope as RSC
    from landxi_api import xreport as XR
    from landxi_api.envelope import env
    from ... import config, talk
    from ...report import file_href
    from . import dash as D
    from . import hl as HL
    c = getattr(ctx, "context", None) or {}
    base = await HL._base(ctx) or {}
    tasks = list(dict.fromkeys(k for rx, k in D.TASK_WORDS if re.search(rx, t)))
    sub = None
    if not tasks:                                      # 분류 낱말 한 표(WP-5) — 논 · 밭 · 과수원 = 경작지 · 업무가 아닌 분류(창고 · 축사 …)는 '결과 없음'
        for rx, nm, parent in RSC.CLASS_WORDS:
            if re.search(rx, t):
                if parent:
                    tasks, sub = [parent], nm
                elif nm not in [k for _rx, k in D.TASK_WORDS]:
                    g = talk.regions_in(t)
                    r0 = talk.pick(ctx, g[0])[0] if g else talk.here(ctx)
                    if r0:
                        from landxi_api import xdash as XD
                        have = [x["k"] for x in (await XD.agg_task(r0["sgg_cd"])).get("rows") or [] if x.get("n")]
                        nm0 = (r0.get("name") or "").split(" ")[0] if g and len(g[0]) > 1 else r0.get("name")
                        o = Out(source="XI맵 통계")
                        ctx.state["cannot"] = {"kind": "nodata"}
                        o.data = {"status": "missing"}
                        hv = " · ".join(dict.fromkeys(re.sub(r"\s*\(.*?\)$", "", h) for h in have[:5]))
                        o.answer = f"{nm0}에는 {nm} 결과가 없습니다" + (f" — 있는 것은 {hv}." if hv else ".") + " 보고서를 만들지 않았습니다."
                        return o
                break
    task = tasks[0] if len(tasks) == 1 else (None if tasks else base.get("task"))
    if not task:
        return None
    q = re.sub(r"내려\s*받\S*|다운\s*로드\S*|엑셀\S*|한글\s*(?:로|파일)\S*|hwpx\S*|xlsx|csv\S*|pdf\S*|파일\S*", " ", REP_WORDS.sub(" ", t), flags=re.I)
    gg = [g for g in talk.regions_in(t) if g]
    named = bool(gg)
    if len(q) > 60:                                    # 긴 문장(조건 · 동작 여럿)은 지역 이름 + 업무로만 묻는다(통계 말 120자 제한)
        q = " ".join(((g[0].get("full") or "").split(" ", 1)[-1] if len(g) == 1 else (g[0].get("name") or "").split(" ")[0]) for g in gg)
    a = D.parse(f"{q} {task} 통계", None if named else c.get("region")) or {}
    reg = (a.get("region") or "").split(",")[0]
    if not reg and not named:
        reg = (base.get("sgg") if base.get("src") == "dash" else None) or str(c.get("region") or "")
    if not reg:
        return None
    em = [x for x in EMD_RX.findall(q) if x not in EMD_SKIP and x != "읍면동"]
    same = not named or str(base.get("sgg") or "") == reg
    only = em or (list(base.get("sel") or []) if same else []) or (list(RSC.clean(c.get("filter")).get("emd") or []) if same else [])
    args = {"request": t, "region": reg, "task": task, "kind": "task", **({"emd": only} if only else {})}
    off = D.off_classes(ctx)
    spec = await D.build(args, off)
    out = Out(source="XI맵 통계('통계 보기' 판과 같은 집계)")
    if spec.get("missing") or (spec.get("note") and str(spec.get("note")).endswith("결과가 아직 없습니다.")):
        ctx.state["cannot"] = {"kind": "nodata"}
        out.data = {"status": "no_data", "text": spec["note"]}
        out.answer = spec["note"] + " 보고서를 만들지 않았습니다."
        return out
    now = dt.datetime.now(dt.timezone(dt.timedelta(hours=9)))
    blob, name = await asyncio.to_thread(XR.build_hwpx, spec, now)
    d0 = config.ARTIFACT_DIR / ctx.run_id
    d0.mkdir(parents=True, exist_ok=True)
    (d0 / name).write_bytes(blob)
    (d0 / "draft.hwpx").write_bytes(blob)
    rb = await asyncio.to_thread(_write_view, ctx, spec, now, name)       # 보고서 보기(대시보드 모양 · 원칙 299) — 같은 사양 · 같은 숫자
    m = spec.get("main") or {}
    emds = next((k.get("value") for k in spec.get("kpis") or [] if k.get("label") in ("결과가 있는 읍면동", "고른 읍면동")), None)
    out.env("n", f"{spec['title']} {m.get('label') or ''}".strip(), env(m.get("value") or 0, m.get("unit") or "개", "inferred", "XI맵 통계 — '통계 보기' 판 큰 숫자와 같은 값"))
    if emds is not None:
        out.env("emds", "보고서에 실린 읍면동 수", env(emds, "곳", "inferred", "XI맵 통계"))
    if rb:
        out.blocks.append(rb)
    out.blocks.append({"type": "file", "label": name, "href": file_href(ctx.run_id, name)})
    ctx.state["artifact"] = {"file_url": f"/api/v1/agent/runs/{ctx.run_id}/draft.hwpx", "href": file_href(ctx.run_id, name), "filename": name,
                             "place": dict(spec.get("means") or []).get("지역") or spec["title"]}
    # 지도 강조(원칙 292) — 보고서가 다룬 곳을 지도에서도(고른 읍면동이면 그곳만)
    try:
        full = spec if not spec.get("emd") else await D.build({**args, "emd": None}, off)
        refs = HL._scoped(ctx, HL._from_dash(full))
        if refs:
            ctx.state["map_refs_base"] = refs
            sel = [it for it in refs["items"] if it["name"] in (spec.get("emd") or [])]
            ctx.state["map_refs"] = {**refs, "items": sel, "mode": "only", "focus": sel[0]["k"] if len(sel) == 1 else None} if sel else refs
    except Exception:  # noqa: BLE001
        pass
    out.data = {"status": "ok", "보고서": name, "대상": spec["title"], "수": "n"}
    bar = next((p for p in spec.get("panels") or [] if p.get("pick") == "emd" and p.get("type") in ("bar", "rank")), None)
    top = [str(r.get("label")) for r in sorted((bar or {}).get("rows") or [], key=lambda r: -(r.get("v") or 0))[:3] if r.get("label")]
    if spec.get("emd"):
        top = []                                              # 고른 읍면동은 제목에 이미 있음
    out.whitelist |= set(top)
    out.answer = (f"{spec['title']} 통계 보고서를 만들었습니다 — {m.get('label') or ''} {{{{n}}}}"
                  + (" · 읍면동 {{emds}}곳" if emds is not None else "") + (f"(많은 곳: {' · '.join(top)})." if top else "."))
    return out


HANDLERS = {"map_filter": map_filter, "map_task": map_task, "map_stats": map_stats, "ai_report": ai_report}
_route_front()
