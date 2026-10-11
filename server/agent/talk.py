"""XI ChatGEO 답하는 법(확인 16차 대화-1 · 대화-2 ⓑ · 설계 design-r7/chatgeo-talk/rules.md · expand.md) — 답 한 벌의 모양을 서버가 채운다.

답 한 벌 = [문장 1–2] · [지도 동작 줄(계획 줄 ✓ · ! · 이미)] · [표 · 차트 · 파일] · [다음 버튼 0–3] · [꼬리 '다른 뜻이면 ○○' 1]
답의 상태는 넷뿐 — 했음 · 일부 했음 · 못 함(이유 한 줄 + 대신 이것 + 버튼) · 확인 필요(실행 카드). '할 수 없습니다'로 끝나는 다섯째 상태는 없다.

여기서 하는 일(모델 없이 · 지역 고정값 0 · 숫자는 도구 봉투로만):
  · 버튼(next) · 꼬리(alt) — agent.done / agent.rejected 의 `next` · `alt` 로 나간다. 버튼 = {label, q}(누르면 그 말을 보냄) | {label, href}(화면 열기)
  · 지역 고르기 — 지명 > 지금 화면 지역 > 직전 답의 지역 · 같은 이름이 여러 곳이면 관할 · 지금 보는 시도 · 결과 있는 곳 순으로 하나 + 다른 곳은 꼬리
  · 지도 없는 화면(context.has_map == False)의 지도 동작 → 'XI맵을 ○○에서 열기' + 그 지역 대표 숫자 한 줄
  · 못 하는 요청(검증기가 지운 동작 문장 · 모델이 쓴 '아직 없는 기능') → 이유 한 줄 + 할 수 있는 것 버튼
  · 거절 범주별 다음 버튼 · 자료 없음 · 관할 밖 · 취소 뒤 문장
"""
from __future__ import annotations

import json
import re
from urllib.parse import urlencode

XI = "/landxi/v3/xi-clean/"
NA_RX = re.compile(r"그\s*지도\s*동작은\s*아직\s*(?:할\s*수\s*없습니다|없는\s*기능입니다)\.?|That map action isn't available yet\.?")


# ── 버튼 ────────────────────────────────────────────────────────────────
def btn(label: str, q: str | None = None, href: str | None = None) -> dict:
    b = {"label": str(label)[:40]}
    if href:
        b["href"] = href
    else:
        b["q"] = str(q or label)[:120]
    return b


def set_next(ctx, buttons, *, front: bool = False):
    """이 답의 다음 버튼(최대 3 · 같은 글 한 번) — 앞에 둔 것이 채움 버튼(가장 가까운 일)."""
    if not isinstance(getattr(ctx, "state", None), dict):
        return
    have = list(ctx.state.get("next") or [])
    new = [b for b in (buttons or []) if b]
    merged = (new + have) if front else (have + new)
    out, seen = [], set()
    for b in merged:
        k = b.get("label")
        if k in seen:
            continue
        seen.add(k)
        out.append(b)
    ctx.state["next"] = out[:3]


def set_alt(ctx, label: str, q: str | None = None, href: str | None = None):
    """꼬리 한 줄 '다른 뜻이면 ○○'(버튼 하나 · 되묻지 않는다)."""
    if isinstance(getattr(ctx, "state", None), dict):
        ctx.state["alt"] = btn(label, q, href)


def realm(ctx) -> str:
    return getattr(ctx.principal, "realm", None) or ""


def role(ctx) -> str:
    return getattr(ctx.principal, "role", None) or ""


def lx_ai(ctx) -> bool:
    """원칙 135 — 답은 '현장 확인 필요' 대신 AI 분석 결과로. LX 계정(10-09) · 기관 계정까지(10-10 확인 8 ⓐ) — 모든 계정 같은 답.
    현장 확인 계산(survey_counts.field_check · 이력)은 서버에 그대로 있고, 답에서만 쓰지 않는다(이름은 옛 호출 그대로 둠)."""
    return True


AI_LABEL = "AI 분석 결과"


async def ai_result(ctx, sgg: str | None = None) -> dict | None:
    """AI 분석 결과 한 묶음 — 화면 XI맵 큰 숫자와 같은 출처 · 같은 계산(landxi/v3/lx-console/summary.js aiResult).
    요약(summary.build) 항목 중 detected_counted(필지 · 물체 단위로 다듬은 결과)만 · 셈 단위가 다르면 더하지 않고
    운영 단계가 앞선 쪽 → 수가 큰 쪽 한 묶음. → {env, unit, names, others} · 결과 없음 None. 숫자를 지어내지 않는다."""
    from landxi_api.deps import db
    from .tools.summary_lookup import build, tenant_arg
    async with db(ctx.principal) as conn:
        j = await build(conn, tenant_arg(ctx.principal), region=sgg)
    its = []
    for i in (j or {}).get("items") or []:
        v = ((i.get("metrics") or {}).get("detected") or {}).get("value")
        if i.get("detected_counted") and isinstance(v, (int, float)) and v > 0:
            its.append(i)
    if not its:
        return None
    rank = ["운영", "시범", "첫 결과 전"]
    by: dict = {}
    for i in its:
        by.setdefault(str(i["metrics"]["detected"].get("unit") or "건"), []).append(i)

    def rk(g):
        return min((rank.index(i.get("stage")) + 9) % 9 if i.get("stage") in rank else 8 for i in g)

    def total(g):
        return sum(i["metrics"]["detected"]["value"] for i in g)
    groups = sorted(by.items(), key=lambda kv: (rk(kv[1]), -total(kv[1])))
    unit, g = groups[0]
    m0 = g[0]["metrics"]["detected"]
    weak = ["demo", "history", "estimate", "inferred", "recorded", "measured"]
    bases = sorted([i["metrics"]["detected"].get("basis") for i in g if i["metrics"]["detected"].get("basis")],
                   key=lambda b: weak.index(b) if b in weak else 9)
    as_of = sorted([str(i["metrics"]["detected"].get("as_of")) for i in g if i["metrics"]["detected"].get("as_of")] or [str(j.get("as_of") or "")])[-1]
    names = list(dict.fromkeys(i.get("card_name") for i in g if i.get("card_name")))
    others = len({i.get("card") or i.get("card_name") for _u, x in groups[1:] for i in x})
    env = {"value": total(g), "unit": unit, "basis": bases[0] if bases else "measured", "as_of": as_of,
           "source": str(m0.get("source") or AI_LABEL)}
    return {"env": env, "unit": unit, "names": names, "others": others}


def ai_services(r: dict) -> str:
    """'영농관리 행정서비스 외 1개 서비스' — XI맵 큰 숫자 아랫줄과 같은 글."""
    n = len(r.get("names") or []) + int(r.get("others") or 0)
    nm = (r.get("names") or [None])[0]
    return (nm + (f" 외 {n - 1}개 서비스" if n > 1 else "")) if nm else ""


def ai_btn(nm: str | None) -> dict:
    """LX 계정의 다음 버튼 — '{지역} AI 분석 결과 몇 건'(원칙 135)."""
    nm = (nm or "").strip()
    return btn(f"{nm} AI 분석 결과 몇 건".strip(), q=f"{nm} AI 분석 결과 몇 건이야?".strip())


def can_xi(ctx) -> bool:
    """XI맵(xi-clean)을 열 수 있는 계정 — auth-gate 의 xi-clean 과 같다(LX 직원 · 관리자 · 영업 · 기관 지역 담당)."""
    return realm(ctx) == "lx" or (realm(ctx) == "tenant" and role(ctx) in ("demo", "local"))


def xi_href(ctx, region: str | None = None, **params) -> str | None:
    """'XI맵에서 보기' 주소 — 지역 · 규칙 · 가르기(compare) · 범위 그리기(tool)를 이어 간다. 열 수 없는 계정이면 기관 지도 화면."""
    q = {k: v for k, v in {"region": region, **params}.items() if v not in (None, "", False)}
    if can_xi(ctx):
        return XI + ("?" + urlencode(q) if q else "")
    if realm(ctx) == "tenant":
        return "/landxi/v3/gov-fusion/" + ("?" + urlencode({"region": region}) if region else "")
    return None


def has_map(ctx) -> bool | None:
    """화면이 알려 준 지도 유무(채팅창이 context.has_map 으로 보낸다) — 모르면 None(지금까지처럼 화면이 판정)."""
    v = (ctx.context or {}).get("has_map")
    return v if isinstance(v, bool) else None


def on_xi(ctx) -> bool:
    """지금 화면이 XI맵인가(채팅창이 context.page 로 보낸다)."""
    return str((ctx.context or {}).get("page") or "") == "xi-clean"


def josa(word: str, pair: tuple[str, str]) -> str:
    """받침에 맞는 조사 — ('으로','로') · ('을','를') · ('은','는') · ('이','가') · ('과','와')."""
    ch = (word or "").strip()[-1:] or ""
    if not ("가" <= ch <= "힣"):
        return pair[1]
    b = (ord(ch) - 0xAC00) % 28
    if pair[0] == "으로":
        return "로" if b in (0, 8) else "으로"
    return pair[0] if b else pair[1]


def short(r: dict | None) -> str:
    return (r or {}).get("name") or ""


# ── 지역 고르기(규칙 ③) ─────────────────────────────────────────────────
_HOME_RX = re.compile(r"우리\s*(?:시|군|구|지역|기관|관할|동네)|관할\s*(?:지역|안|전체)?|우리\s*쪽")


def says_home(text: str) -> bool:
    return bool(_HOME_RX.search(text or ""))


def regions_in(text: str) -> list[list[dict]]:
    """문장 속 시군구 — 이름(어간)마다 후보 목록(같은 이름이 여러 시도에 있으면 여러 개). runner.scope_guard 와 같은 낱말 규칙."""
    try:
        from landxi_api.regions import regions_base
    except Exception:  # noqa: BLE001
        return []
    t = re.sub(r"\s+", " ", text or "")
    regs, _, _ = regions_base()
    by: dict[str, list[dict]] = {}
    for r in regs:
        nm = r.get("name") or ""
        city = nm.split(" ")[0]
        for key in {nm, city}:
            if not key:
                continue
            stem = key[:-1] if len(key) >= 3 and key[-1] in "시군" else None
            if re.search(r"(^|[\s·,(])" + re.escape(key), t) or (stem and re.search(r"(^|[\s·,(])" + re.escape(stem) + r"(?![가-힣]{2,}[시군구])", t)):
                by.setdefault(key, []).append(r)
                break
    # 긴 이름이 짧은 이름을 품으면(예: '고성' ⊂ '고성군') 긴 쪽만
    keys = sorted(by, key=len, reverse=True)
    out, used = [], set()
    for k in keys:
        if any(k in u for u in used):
            continue
        used.add(k)
        # 한 시의 여러 구(전주시 완산구 · 덕진구)는 같은 시도 — 한 묶음
        out.append(by[k])
    return out


def _has_data_sync(sgg: str) -> bool:
    try:
        from landxi_api.regions import _derived
        dv = _derived.get("data") or {}
        return sgg in (dv.get("parcels") or {}) or any(not d.get("_test") and d.get("stage") in ("ga", "canary") for d in (dv.get("dp") or {}).get(sgg, []))
    except Exception:  # noqa: BLE001
        return False


def pick(ctx, cands: list[dict]) -> tuple[dict | None, list[dict]]:
    """같은 이름 후보 → (고른 곳, 다른 곳들). 관할(기관) > 지금 보는 시도 > 결과가 있는 곳 > 첫 곳."""
    if not cands:
        return None, []
    if len({(c.get("full") or "").split(" ")[0] for c in cands}) <= 1:
        return cands[0], []
    pool = list(cands)
    if realm(ctx) == "tenant":
        try:
            from landxi_api.regions import in_scope, tenant_scope
            sc = tenant_scope(ctx.principal.tenant_id)
            mine = [c for c in pool if in_scope(c["sgg_cd"], sc)]
            if mine:
                pool = mine
        except Exception:  # noqa: BLE001
            pass
    cur = here(ctx)
    if cur and len(pool) > 1:
        sido = (cur.get("full") or "").split(" ")[0]
        same = [c for c in pool if (c.get("full") or "").split(" ")[0] == sido]
        if same:
            pool = same
    if len(pool) > 1:
        withd = [c for c in pool if _has_data_sync(c["sgg_cd"])]
        if withd:
            pool = withd
    chosen = pool[0]
    return chosen, [c for c in cands if c["sgg_cd"] != chosen["sgg_cd"]]


def here(ctx) -> dict | None:
    """지금 화면의 시군구(context.region)."""
    cd = str((ctx.context or {}).get("region") or "").strip()
    if not cd:
        return None
    try:
        from landxi_api.regions import region_of
        return region_of(cd)
    except Exception:  # noqa: BLE001
        return None


async def home(ctx) -> dict | None:
    """기관 계정의 '우리 시' — 관할 시군구가 하나면 그곳 · 여럿이면 지금 화면 지역(관할 안) · 그다음 실태조사가 있는 관할 첫 곳."""
    if realm(ctx) != "tenant":
        return None
    try:
        from landxi_api.regions import in_scope, regions_base, tenant_scope
        sc = tenant_scope(ctx.principal.tenant_id)
        regs, _, _ = regions_base()
        mine = [r for r in regs if in_scope(r["sgg_cd"], sc)] if sc else []
    except Exception:  # noqa: BLE001
        return None
    if len(mine) == 1:
        return mine[0]
    cur = here(ctx)
    if cur and any(m["sgg_cd"] == cur["sgg_cd"] for m in mine):
        return cur
    withd = [m for m in mine if _has_data_sync(m["sgg_cd"])]
    return (withd or mine or [None])[0]


async def prev_region(ctx) -> dict | None:
    """직전 답의 지역(같은 창의 prev_run · Redis 24h) — 지명도 화면 지역도 없을 때만 쓴다."""
    prev = str((getattr(ctx, "context", None) or {}).get("prev_run") or "").strip()
    if not prev or getattr(ctx, "r", None) is None:
        return None
    try:
        cd = await ctx.r.get(f"agent:runs:{prev}:region")
        if not cd:
            return None
        from landxi_api.regions import region_of
        return region_of(cd)
    except Exception:  # noqa: BLE001
        return None


async def remember(ctx, sgg: str | None):
    """이 답이 다룬 지역(다음 질문의 '직전 지역')."""
    if not sgg or getattr(ctx, "r", None) is None:
        return
    try:
        await ctx.r.set(f"agent:runs:{ctx.run_id}:region", str(sgg)[:5], ex=86400)
    except Exception:  # noqa: BLE001
        pass


async def resolve(ctx, text: str, *, allow_prev: bool = True) -> tuple[dict | None, str, list[dict]]:
    """지명 > 지금 화면 지역 > 직전 지역 — (지역, 출처 'named'|'home'|'screen'|'prev'|'', 다른 후보). 둘 이상 말하면 첫 곳."""
    groups = regions_in(text)
    if groups:
        r, alts = pick(ctx, groups[0])
        return r, "named", alts
    if says_home(text):
        h = await home(ctx)
        if h:
            return h, "home", []
    cur = here(ctx)
    if cur:
        return cur, "screen", []
    if realm(ctx) == "tenant":
        h = await home(ctx)
        if h:
            return h, "home", []
    if allow_prev:
        p = await prev_region(ctx)
        if p:
            return p, "prev", []
    return None, "", []


# ── 지도 없는 화면의 지도 동작(규칙 ④ · expand 12) ────────────────────────────────────────────
OP_WORD = {"map_region": "옮기지", "map_zoom": "확대하지", "map_view": "기울이지", "map_layer": "층을 켜지", "map_compare": "두 시점을 나란히 놓지",
           "map_draw": "범위 그리기를 켜지", "map_snapshot": "그림 파일로 만들지", "map_arrive": "지도에 표시하지", "map_on": "지도에 칠하지"}
OP_PARAM = {"map_compare": "compare", "map_draw": "tool"}


def nomap_text(ctx, op: str, r: dict | None, extra: dict | None = None) -> tuple[str, list[dict]]:
    """'이 화면에는 지도가 없어 옮기지 못했습니다. XI맵을 열면 ○○에서 시작합니다.' + [XI맵을 ○○에서 열기] [○○ 결과 요약 보기]."""
    w = OP_WORD.get(op, "지도에 그리지")
    nm = short(r)
    href = xi_href(ctx, r["sgg_cd"] if r else None, **(extra or {}))
    xi_name = "XI맵" if can_xi(ctx) else "지도 화면"
    # 두 문장 안(규칙 ⑥) — ① 못 한 까닭 — 여는 곳 ② (덤) 그 지역 대표 숫자 또는 결과 없음
    s1 = f"이 화면에는 지도가 없어 {w} 못했습니다" + ((f" — {xi_name}을 열면 {nm}에서 시작합니다." if nm else f" — {xi_name}에서 크게 볼 수 있습니다.") if href else ".")
    s2 = ""
    nxt = []
    if href:
        nxt.append(btn(f"{xi_name}을 {nm}에서 열기" if nm else f"{xi_name} 열기", href=href))
    if nm and _has_data_sync(r["sgg_cd"]):
        nxt.append(btn(f"{nm} 결과 요약 보기", q=f"{nm} 결과 요약해 줘"))
    elif nm:                                             # expand 10 — 결과 없는 지역은 그렇다고 말하고 역할별 다음 일
        s2 = no_data_text(nm)
        nxt += no_data_next(ctx, nm, r["sgg_cd"])
    return " ".join(x for x in (s1, s2) if x), nxt


# ── 못 하는 요청(규칙 ②) ─────────────────────────────────────────────────
CAN_MAP = ["두 시점 영상 나란히 비교해 줘", "지도 화면을 이미지로 저장해 줘", "3D로 보여 줘"]


def cannot_text(ctx, r: dict | None = None) -> tuple[str, list[dict]]:
    """모델이 할 수 없는 지도 동작을 말했을 때 — 이유(없는 기능) 한 줄 + 할 수 있는 것 버튼(지도 없는 화면이면 XI맵 열기 먼저)."""
    hm = has_map(ctx)
    nxt = []
    if hm is False:
        href = xi_href(ctx, r["sgg_cd"] if r else None)
        if href:
            nxt.append(btn("XI맵에서 보기" if can_xi(ctx) else "지도 화면 열기", href=href))
        nxt += [btn("어느 지역에 어떤 결과가 있어?")]
    else:
        nxt += [btn(q) for q in CAN_MAP]
    return "말씀하신 지도 동작은 아직 없는 기능입니다. 지도에서 할 수 있는 일을 아래에 두었습니다.", nxt


def fill_cannot(ctx, md: str, r: dict | None = None) -> str:
    """답에 남은 '그 지도 동작은 아직 할 수 없습니다'(검증기 · 모델) → 규칙 ② 틀(이유 한 줄 + 버튼). 다른 문장이 함께 있으면 그 문장만 바꾼다."""
    if not NA_RX.search(md or ""):
        return md
    text, nxt = cannot_text(ctx, r)
    set_next(ctx, nxt)
    ctx.state["talk_kind"] = "cannot"
    rest = NA_RX.sub("", md).strip()
    if len(rest) < 4:
        return text
    first = text.split(". ")[0] + "."
    out = NA_RX.sub(first, md, count=1)
    return NA_RX.sub("", out).strip()


# ── 거절 · 자료 없음 · 관할 밖 · 취소 ───────────────────────────────────────────
GUARD_TEXT_FIX = [(re.compile(r"AI\s*도우미"), "XI ChatGEO"), (re.compile(r"검수\s*편집\(결과 수정·삭제\)"), "결과 수정 · 삭제"),
                  (re.compile(r"검수"), "결과 확인")]


def guard_text_fix(text: str) -> str:
    for rx, rep in GUARD_TEXT_FIX:
        text = rx.sub(rep, text)
    return text


async def guard_next(ctx, category: str, region_name: str | None = None) -> list[dict]:
    """거절 범주별 '대신 할 수 있는 것' 버튼(이유는 이미 한 줄 있다)."""
    lx = realm(ctx) == "lx"
    if category in ("cross_tenant", "cross_tenant_region"):
        h = await home(ctx)
        nm = short(h)
        return [btn(f"{nm} 결과 요약 보기", q=f"{nm} 결과 요약해 줘"),
                ai_btn(nm) if lx_ai(ctx) else btn(f"{nm} 현장 확인 필요 필지 몇 건", q="우리 시 현장 확인 필요 필지 몇 건이야?")] if nm else []
    if category == "raw_imagery":
        return [btn("지금 지도를 그림 파일로", q="지도 화면을 이미지로 저장해 줘")] if has_map(ctx) is not False else []
    if category == "deploys_forbidden":
        return [btn("배포 화면 열기", href="/landxi/v3/lx-deploy/")] if lx and role(ctx) in ("staff", "admin") else []
    if category == "results_edit":
        if lx and role(ctx) in ("staff", "admin"):
            return [btn("결과 확인 화면 열기", href="/landxi/v3/lx-review/")]
        return [btn("필지 카드에서 검토 요청 보내기", href=xi_href(ctx) or "/landxi/v3/gov-fusion/")] if realm(ctx) == "tenant" else []
    if category == "owner_pii":
        pnu = (ctx.context or {}).get("pnu")
        return [btn("이 필지 대장 보기", q="이 필지 대장 지목 면적 알려 줘")] if pnu else []
    if category == "quota_write":
        return [btn("기관별 사용량 보기", q="기관별 사용량 보여 줘")] if lx and role(ctx) == "admin" else []
    if category == "no_region_data":
        return no_data_next(ctx, region_name)
    return []


def no_data_next(ctx, region_name: str | None, sgg: str | None = None) -> list[dict]:
    """자료 없는 지역 — 역할별 다음 일(LX: 그 지역 전역 분석 · 영상 등록 · 결과 있는 지역 / 기관: 분석 요청 · 결과 있는 지역)."""
    nm = (region_name or "").split(" ")[-1] if region_name else ""
    if realm(ctx) == "lx" and role(ctx) in ("staff", "admin"):
        q = "?" + urlencode({"region": sgg}) if sgg else ""
        return ([btn(f"{nm} 전역 분석 실행", q=f"{nm} 전역 분석 실행해 줘")] if nm else []) +             [btn("영상 등록하기", href="/landxi/v3/lx-ingest/" + q), btn("결과 있는 지역 보기", q="어느 지역에 어떤 결과가 있어?")]
    if realm(ctx) == "tenant":
        return [btn("분석 요청 보내기", q="분석 요청 보내 줘"), btn("결과 있는 지역 보기", q="어느 지역에 어떤 결과가 있어?")]
    return [btn("결과 있는 지역 보기", q="어느 지역에 어떤 결과가 있어?")]


def no_data_text(region_name: str | None) -> str:
    nm = (region_name or "").split(" ")[-1] if region_name else ""
    return f"{nm}{josa(nm, ('은', '는'))} 아직 AI 분석 결과가 없습니다." if nm else "이 지역은 아직 AI 분석 결과가 없습니다."


def outside_text(region_name: str | None) -> str:
    nm = (region_name or "").split(" ")[-1] if region_name else ""
    return f"{nm}{josa(nm, ('은', '는'))} 이 기관 계정에서 볼 수 없습니다." if nm else "이 기관 계정에서 볼 수 없는 지역입니다."


def cancel_next(ctx, r: dict | None, tool: str | None = None) -> list[dict]:
    nm = short(r)
    if tool == "request_send":
        return [btn("분석 요청 화면 열기", href="/landxi/v3/gov-request/")] + ([btn(f"{nm} 결과 요약 보기", q=f"{nm} 결과 요약해 줘")] if nm else [])
    if not nm:
        return [btn("어느 지역에 어떤 결과가 있어?")]
    return [btn("지금 있는 결과 요약", q=f"{nm} 결과 요약해 줘"), btn("읍면동별 차트", q=f"{nm} 의심 필지 읍면동별 차트로 보여 줘")]


# ── 지도 동작 문장(런타임 직행 · 모델 0) ─────────────────────────────────────────────
def move_word(place: str) -> str:
    return f"{place}{josa(place, ('으로', '로'))} 옮기고"


def chain_sentence(parts: list[str]) -> str:
    """['구례군으로 옮기고', '한 단계 확대했습니다.'] → '구례군으로 옮기고 한 단계 확대했습니다.'"""
    return " ".join(p.strip() for p in parts if p and p.strip())


def dumps(x) -> str:
    return json.dumps(x, ensure_ascii=False)
