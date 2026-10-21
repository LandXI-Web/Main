"""XI ChatGEO 400문 판정기(LLM 0 · CHATGEO-DEV-ORDER §3-1) — 질문 한 줄(chatgeo-400.jsonl) + 저장된 답 한 건 → 통과 · 실패 · 까닭.

성질(expect 키)은 build_400.py EXPECT · PER_N 표가 정한다. 모든 질문에 공통으로 보는 것:
  · 끝 사건이 있고(실패 · 시간 초과 0) 답 글이 비지 않음 · 남은 자리표 '{{' 0
  · 내부 도구 이름(registry.SPECS · snake_case) 0
  · 기관 계정 답에 관할 밖 시군 숫자 0(권한 밖 새어 나감)
"""
from __future__ import annotations

import json
import re
import sys
from functools import lru_cache
from pathlib import Path

SERVER = Path(__file__).resolve().parents[3]
if str(SERVER) not in sys.path:
    sys.path.insert(0, str(SERVER))

TOOL_RX = re.compile(r"\b[a-z]{2,}_[a-z_]{2,}\b")
ENV_RX = re.compile(r"\{\{env:(e\d+)\}\}")
CLS = {  # 분류 낱말 → 묶음 이름(같은 뜻은 같은 이름)
    "비닐하우스": "gh", "하우스": "gh", "온실": "gh",
    "건물": "bld", "건축물": "bld",
    "경작지": "farm", "경작": "farm", "논": "farm", "밭": "farm", "과수원": "farm", "농경지": "farm",
    "휴경지": "fallow", "휴경": "fallow",
    "창고": "store", "농막": "hut", "축사": "barn", "주차장": "park", "태양광": "solar", "나대지": "bare",
    "토지피복": "lc", "해양쓰레기": "litter",
}
CLS_RX = re.compile(r"(?<![가-힣])(" + "|".join(sorted(CLS, key=len, reverse=True)) + r")(?=[^가-힣]|[은는이가을를에의과와도만로으]|$)")
NONCLS = {"결과 확인 대기": "review", "의심": "suspect", "국토 변화": "change", "기관 신고": "report", "어긋": "ledger", "대장": "ledger"}
REFUSE_RX = re.compile(r"없습니다|할 수 없습니다|하지 않습니다|않습니다|못했습니다|볼 수 없습니다|cannot|not available|no data", re.I)
COUNT_RX = re.compile(r"\d[\d,]*(?:\.\d+)?\s?(?:건|필지|곳|개|동|㎡|ha|㏊|%)")
METRO = {"서울": "서울특별시", "부산": "부산광역시", "대구": "대구광역시", "인천": "인천광역시", "광주": "광주광역시", "대전": "대전광역시", "울산": "울산광역시"}


@lru_cache(maxsize=1)
def specs() -> frozenset:
    try:
        import agent.runner  # noqa: F401 — 확장 도구까지 등록
        from agent.tools import registry
        return frozenset(registry.SPECS)
    except Exception:  # noqa: BLE001
        return frozenset()


@lru_cache(maxsize=1)
def regions() -> list[dict]:
    from landxi_api.regions import regions_base
    regs, _, _ = regions_base()
    return regs


def fmt(v) -> str:
    if isinstance(v, bool) or v is None:
        return "?"
    if isinstance(v, float) and not v.is_integer():
        return f"{v:,.1f}"
    try:
        return f"{int(v):,}"
    except Exception:  # noqa: BLE001
        return str(v)


def render(rec: dict) -> str:
    envs = rec.get("envs") or {}
    return ENV_RX.sub(lambda m: fmt((envs.get(m.group(1)) or {}).get("value")), str(rec.get("answer_md") or ""))


def nums(text: str) -> list[float]:
    out = []
    for m in re.finditer(r"(?<![\d.])\d[\d,]*(?:\.\d+)?", text):
        try:
            out.append(float(m.group(0).replace(",", "")))
        except ValueError:
            pass
    return out


def _city(r: dict) -> str:
    return (r.get("name") or "").split(" ")[0]


def regions_in(text: str, asked: bool = False) -> set[str]:
    """글 안 시군구(시 단위 이름: '전주시' · '강남구' · '광주광역시 북구'). asked=True 면 어간('홍성' · '제주')도 본다."""
    t = text or ""
    out = set()
    metro_hit = set()
    for short, full in METRO.items():
        for m in re.finditer(r"(?:" + re.escape(short) + r"|" + re.escape(full) + r")\s*([가-힣]{1,3}구)", t):
            out.add(f"{full} {m.group(1)}")
            metro_hit.add(short)
    for r in regions():
        city = _city(r)
        if len(city) < 3 or (city.endswith("구") and len(city) <= 2):
            continue
        if city.endswith("구") and (r.get("sido") or "").endswith(("특별시", "광역시")):
            sd = r.get("sido") or ""
            if any(f"{sd} {city}" in x for x in out):
                continue
            if len(city) <= 2:
                continue
        if re.search(r"(?<![가-힣])" + re.escape(city), t):
            out.add(city)
            continue
        if asked and city[-1] in "시군" and len(city) >= 3:
            stem = city[:-1]
            if stem in metro_hit:
                continue
            if re.search(r"(?<![가-힣])" + re.escape(stem) + r"(?=[\s,·?에은는의과와도만이가을를서]|$)", t):
                out.add(city)
    # 광역시 구가 잡히면 같은 이름의 다른 도 시('광주' → 경기 광주시)는 뺀다
    if any(x.startswith("광주광역시") for x in out):
        out.discard("광주시")
    return out


def children_ok(asked: set[str], found: set[str]) -> set[str]:
    """물은 시의 구(전주시 → 전주시 완산구 · 완산구)는 같은 곳으로 본다 · 광역시 구는 짧은 이름(서울특별시 강남구 → 강남구)도."""
    ok = set(asked) | {a.split(" ")[-1] for a in asked if " " in a}
    for r in regions():
        nm = r.get("name") or ""
        if " " in nm and nm.split(" ")[0] in asked:
            ok.add(nm.split(" ")[1])
            ok.add(nm)
    return ok


def sentences(md: str) -> list[str]:
    return [s for s in re.split(r"(?<=[.!?。])\s+|\n+|\s—\s", md or "") if s.strip()]


def cls_of(text: str) -> set[str]:
    return {CLS[m.group(1)] for m in CLS_RX.finditer(text or "")}


def relabel_hits(rec: dict) -> list[str]:
    """봉투 뜻의 분류와 같은 문장에 쓴 분류가 다르면 이름표 바뀜(예: 결과 확인 대기 1,038 → '건물 1,038건')."""
    envs = rec.get("envs") or {}
    out = []
    for s in sentences(str(rec.get("answer_md") or "")):
        ids = ENV_RX.findall(s)
        if not ids:
            continue
        plain = ENV_RX.sub(" ", s)
        said = cls_of(plain)
        if not said:
            continue
        for eid in ids:
            mean = str((envs.get(eid) or {}).get("meaning") or "")
            have = cls_of(mean)
            non = {v for k, v in NONCLS.items() if k in mean}
            if non and not have:
                if not any(k in plain for k, v in NONCLS.items() if v in non) and said:
                    out.append(f"{mean[:24]}→{'/'.join(sorted(said))}")
                continue
            if have and not (have & said) and not ({"farm"} & have and said & {"fallow"}) and not ({"fallow"} & have and said & {"farm"}):
                out.append(f"{mean[:24]}→{'/'.join(sorted(said))}")
    return out


def law_cites(text: str) -> list[tuple[str, str]]:
    out = []
    for m in re.finditer(r"「([^」]+)」\s*(?:제\s*(\d+)\s*조)?", text or ""):
        out.append((m.group(1), m.group(2) or ""))
    for m in re.finditer(r"(?<![「가-힣])((?:[가-힣]+\s)?[가-힣]+법(?:\s시행령|\s시행규칙)?)\s*제\s*(\d+)\s*조", text or ""):
        out.append((m.group(1), m.group(2)))
    return out


def judge(row: dict, rec: dict) -> dict:
    ex = row.get("expect") or {}
    why = []
    ev = rec.get("event")
    md = str(rec.get("answer_md") or "")
    txt = render(rec)
    refused = ev == "agent.rejected" or bool(REFUSE_RX.search(txt))
    if ev not in ("agent.done", "agent.rejected"):
        why.append(f"끝 사건 {ev}")
    if not txt.strip():
        why.append("빈 답")
    if "{{" in txt:
        why.append("자리표 남음")
    tools = sorted({t for t in TOOL_RX.findall(txt) if t in specs() or t.count("_") >= 1})
    tools = [t for t in tools if not re.match(r"^(?:e\d+|u\d+)$", t)]
    if tools:
        why.append("도구 이름 " + ",".join(tools[:3]))
    asked = regions_in(row["q"], asked=True)
    if not asked and row["persona"] == "namwon":
        asked = {"남원시"}
    found = regions_in(txt)
    if row["persona"] == "namwon":            # 권한 밖 새어 나감 — 기관 답의 숫자 문장에 관할 밖 시군
        for s in sentences(txt):
            other = regions_in(s) - children_ok({"남원시"}, regions_in(s))
            if other and COUNT_RX.search(s) and not REFUSE_RX.search(s):
                why.append("새어 나감 " + ",".join(sorted(other)))
                rec["_leak"] = True
    if ex.get("nonempty") and not txt.strip():
        pass
    if ex.get("refuse") is True and not refused:
        why.append("거절했어야 함")
    if ex.get("refuse") is False and ev == "agent.rejected":
        why.append("미리 거절")
    for rx in ex.get("no_text") or []:
        if re.search(rx, txt, re.M):
            why.append("금지 문구 /" + rx[:24] + "/")
    if ex.get("need_any"):
        hay = txt + " " + " ".join(f"{b.get('label') or ''} {b.get('href') or ''}" for b in (rec.get("next") or []) + (rec.get("blocks") or []))
        if not any(re.search(rx, hay) for rx in ex["need_any"]):
            why.append("필요 문구 없음")
    if ex.get("buttons_min") and len(rec.get("next") or []) < ex["buttons_min"]:
        why.append("단추 없음")
    if ex.get("no_counts") and COUNT_RX.search(txt):
        why.append("숫자 나감")
    if ex.get("region_only") and asked:
        ok = children_ok(asked, found)
        extra = {f for f in found if f not in ok}
        file_labels = " ".join(str(b.get("label") or "") for b in rec.get("blocks") or [])
        extra |= {f for f in regions_in(file_labels) if f not in ok}
        if extra:
            why.append("다른 지역 " + ",".join(sorted(extra)[:3]))
    if ex.get("need_region") and asked and not (found & children_ok(asked, found)) and not any(a.split(" ")[-1] in txt for a in asked):
        why.append("물은 지역 이름 없음")
    if ex.get("relabel"):
        h = relabel_hits(rec)
        if h:
            why.append("이름표 바뀜 " + h[0])
    if ex.get("forbid_review_as"):
        for s in sentences(md):
            for eid in ENV_RX.findall(s):
                mean = str(((rec.get("envs") or {}).get(eid) or {}).get("meaning") or "")
                if "결과 확인 대기" in mean and "결과 확인 대기" not in s:
                    why.append("결과 확인 대기 값이 다른 이름으로")
    if ex.get("emd_only"):
        emd = re.findall(r"([가-힣]{1,4}(?:읍|면|동))(?=[에서의은는이가을를\s]|$)", row["q"])
        if emd and COUNT_RX.search(txt) and not any(e in txt for e in emd):
            why.append("읍면동을 버림")
    if ex.get("suspect_one"):
        bad = suspect_bad(rec)
        if bad:
            why.append("의심 필지 값 " + bad)
    if ex.get("timeseries"):
        if not (re.search(r"시점|변화량|추이|늘었|줄었|비교", txt) and REFUSE_RX.search(txt)) and "map_compare" not in (rec.get("ui_ops") or []):
            why.append("시점 비교 없이 지금 숫자")
    if ex.get("law") or ex.get("law_ok") is not None:
        cites = law_cites(txt)
        allow = ex.get("law_ok")
        nf = bool(re.search(r"찾지 못|없습니다", txt))
        if allow is not None:
            good = [c for c in cites if any(a in c[0] and (not b or c[1] == b) for a, b in allow)]
            if cites and not good:
                why.append("다른 조문 " + "·".join(f"{a} {b}" for a, b in cites[:2]))
            if not cites and not nf:
                why.append("조문 · 찾지 못 둘 다 없음")
            if not allow and cites and not nf:
                why.append("색인에 없는 주제에 조문")
    if ex.get("law_path"):
        if COUNT_RX.search(re.sub(r"「[^」]*」[^.]*", "", txt)) and not law_cites(txt):
            why.append("법 질문에 지도 숫자")
    if ex.get("layer_claim"):
        ask_c = cls_of(row["q"])
        m = re.search(r"([가-힣·]+?)\s*(?:분석\s*)?(?:결과\s*)?층을\s*켰습니다", txt)
        if m and ask_c and not (cls_of(m.group(1)) & ask_c):
            why.append("다른 층을 켰다고 함")
    if ex.get("two_regions"):
        a2 = regions_in(row["q"], asked=True)
        if len(a2) >= 2 and not all(x in children_ok({x}, found) or x in txt for x in a2) and not re.search(r"부분|만 실었|결과가 없어", txt):
            why.append("한 지역만 답하고 부분 답 표시 없음")
    if ex.get("values_any"):
        vs = set(nums(txt))
        if COUNT_RX.search(txt) and not any(float(v) in vs for v in ex["values_any"]):
            why.append("통계 판 값과 다름")
    return {"ok": not why, "why": why}


@lru_cache(maxsize=1)
def suspect_oracle() -> dict:
    """남원(예시 지역) 의심 필지 한 출처 — landxi_api.survey.survey_counts(시군 전체 · 카드별)."""
    import asyncio

    async def go():
        from landxi_api.deps import db
        from landxi_api import survey as S
        out = {}
        async with db(realm="lx") as conn:
            out["total"] = (await S.survey_counts(conn, "52190")).get("suspect")
            for cid in [r["id"] for r in await conn.fetch("SELECT id FROM cards")]:
                try:
                    out[cid] = (await S.survey_counts(conn, "52190", cid)).get("suspect")
                except Exception:  # noqa: BLE001
                    pass
            out["survey_sgg"] = await conn.fetchval("SELECT findings FROM survey_sgg WHERE sgg_cd='52190'")
        return out
    try:
        return asyncio.run(go())
    except Exception as e:  # noqa: BLE001
        return {"error": str(e)[:120]}


def suspect_bad(rec: dict) -> str:
    o = suspect_oracle()
    allowed = {v for k, v in o.items() if k not in ("survey_sgg", "error") and isinstance(v, int)}
    if not allowed:
        return ""
    envs = rec.get("envs") or {}
    for eid, e in envs.items():
        mean = str(e.get("meaning") or "")
        if "의심" in mean and not re.search(r"[가-힣]+(?:읍|면|동)\b|순위|상위|\d+위", mean):
            v = e.get("value")
            if isinstance(v, (int, float)) and int(v) not in allowed:
                return f"{fmt(v)}(한 출처 {','.join(fmt(x) for x in sorted(allowed))})"
    return ""


def summarize(rows: dict, results: list[dict]) -> dict:
    by = {}
    leaks = 0
    slow = 0
    for rec in results:
        row = rows.get(rec["n"])
        if not row:
            continue
        v = judge(row, rec)
        c = by.setdefault(row["cluster"], {"sev": row["sev"], "rank": row["rank"], "n": 0, "pass": 0, "fail": [], "ms": []})
        c["n"] += 1
        c["ms"].append(rec.get("ms") or 0)
        if v["ok"]:
            c["pass"] += 1
        else:
            c["fail"].append({"n": rec["n"], "why": v["why"][:3]})
        if rec.get("_leak"):
            leaks += 1
        if (rec.get("ms") or 0) > 10000:
            slow += 1
    tiers = {}
    for cid, c in by.items():
        t = tiers.setdefault(c["sev"], {"n": 0, "pass": 0})
        t["n"] += c["n"]
        t["pass"] += c["pass"]
        ms = sorted(c["ms"])
        c["p50"] = ms[len(ms) // 2] if ms else 0
        c["max"] = ms[-1] if ms else 0
        del c["ms"]
    return {"clusters": by, "tiers": tiers, "leaks": leaks, "over10s": slow, "total": sum(c["n"] for c in by.values()),
            "pass": sum(c["pass"] for c in by.values())}


TIER_KO = {"top": "최고", "high": "높음", "mid": "보통", "normal": "정상 · 권한 밖"}


def markdown(s: dict, base: dict | None, doc: dict) -> str:
    L = [f"# XI ChatGEO 400문 판정 ({doc.get('at')})", "",
         f"- 통과 {s['pass']} / {s['total']} · 권한 밖 새어 나감 {s['leaks']} · 10초 넘음 {s['over10s']}", ""]
    L.append("| 등급 | 질문 | 통과 | 비율 |" + (" 기준선 |" if base else ""))
    L.append("|---|---|---|---|" + ("---|" if base else ""))
    for t in ("top", "high", "mid", "normal"):
        x = s["tiers"].get(t)
        if not x:
            continue
        b = (base or {}).get("tiers", {}).get(t)
        L.append(f"| {TIER_KO[t]} | {x['n']} | {x['pass']} | {100 * x['pass'] // max(1, x['n'])}% |"
                 + (f" {100 * b['pass'] // max(1, b['n'])}% |" if b else (" — |" if base else "")))
    L += ["", "| 묶음 | 등급 | 질문 | 통과 | 기준선 | 가운데 ms | 최대 ms | 실패(번호: 까닭) |", "|---|---|---|---|---|---|---|---|"]
    for cid, c in sorted(s["clusters"].items(), key=lambda kv: kv[1]["rank"]):
        b = (base or {}).get("clusters", {}).get(cid)
        fails = " · ".join(f"{f['n']}: {', '.join(f['why'])[:60]}" for f in c["fail"][:6])
        L.append(f"| {cid} | {TIER_KO[c['sev']]} | {c['n']} | {c['pass']} | {b['pass'] if b else '—'} | {c['p50']} | {c['max']} | {fails} |")
    return "\n".join(L) + "\n"
