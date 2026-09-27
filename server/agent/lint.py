"""숫자 검증기(number-lint · F1-CONTRACT v1.1-25 · AGENT-SPEC §3.5).

answer_md 의 자리표({{env:eN}}) 밖 숫자를 전부 찾아 도구 봉투 값과 대조한다.
  일치(단위·천단위·반올림·만/억·% 허용) → 자리표로 자동 승격({{env:eN}})
  불일치 → {{unv:uN}} + unverified[] (프론트: 취소선 + '검증 안 된 숫자' 칩 + 가장 가까운 봉투)
화이트리스트(구조 숫자): 연도 · 날짜 · 좌표 · PNU(19자리) · 지번(n-n · 도구가 준 주소 안 숫자) · 조문(제n조·n항·n호) · 규칙 코드(R1) · 인용 [n] · 목록 번호
  · 구조 코드(AG-6 · F2-E) · 차수(2차) · 포트(:8702).

승격 범위(scope · 2차 판정 뒤): 값이 같다고 아무 봉투로나 승격하지 않는다. 숫자가 든 **그 문장의 인용 [n]** 에 속한 봉투(citation.env)만 후보,
엄격 모드가 아니면 첫 도구의 주 봉투(집계 · 목록 총계 · 필지별 값 아님)도 후보. % 는 그 문장이 인용한 필지의 ratio 봉투일 때만.
보고서 경로는 strict(인용 봉투만). nearest(취소선 옆 칩): ① 같은 답에서 이미 쓴 자리표 ② 주 봉투 ③ 값 근접(뜻 라벨 필수 · nearest_by='value').
"""
from __future__ import annotations

import math
import re
from dataclasses import dataclass, field

PH = re.compile(r"\{\{\s*(env|unv)\s*:\s*([A-Za-z0-9_]+)\s*\}\}")
CITE = re.compile(r"\[(\d{1,2})(?:\s*[,·]\s*\d{1,2})*\]")
NUM = re.compile(
    r"(?<![A-Za-z0-9_.,])"
    r"(?P<num>\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)"
    r"(?:(?P<mul>\s?(?:만|억|천))(?P<rest>\s?\d{1,4}(?![\d,]))?)?"
    r"(?P<pct>\s?%|\s?퍼센트)?"
)
UNIT_AFTER = {
    "m2": r"\s?(?:㎡|m²|m2|제곱미터)", "필지": r"\s?(?:필지|개\s?필지)", "count": r"\s?(?:건(?!물)|개(?![발간선]))", "polygons": r"\s?(?:개(?![발간선])|동(?![네안])|건(?!물))",
    "ha": r"\s?(?:ha|헥타르)", "km2": r"\s?(?:㎢|km²|km2)", "%": r"\s?%", "ratio": r"", "gpu_s": r"\s?(?:GPU·s|GPU 초|gpu_s)", "s": r"\s?초",
    "ms": r"\s?ms", "tokens": r"\s?토큰", "features": r"\s?(?:개|건)", "krw_m2": r"\s?(?:원/㎡|원)", "score": r"\s?점",
}
COUNT_UNITS = re.compile(r"^\s?(건|필지|개|동|㎡|m²|m2|%|ha|명|곳|배|퍼센트)")
MUL = {"만": 1e4, "억": 1e8, "천": 1e3}


@dataclass
class LintResult:
    answer_md: str
    unverified: list[dict] = field(default_factory=list)
    promoted: list[dict] = field(default_factory=list)
    whitelisted: list[str] = field(default_factory=list)
    placeholders: list[str] = field(default_factory=list)

    @property
    def unverified_numbers(self) -> list[str]:
        return [u["text"] for u in self.unverified]


def _val(m: re.Match) -> tuple[float, int, bool]:
    s = m.group("num").replace(",", "")
    x = float(s)
    k = len(s.split(".")[1]) if "." in s else 0
    if m.group("mul"):
        x = x * MUL[m.group("mul").strip()]
        if m.group("rest"):
            x += float(m.group("rest").strip())
    return x, k, bool(m.group("pct"))


def _structural(text: str, m: re.Match, wl: set[str]) -> str | None:
    """구조 숫자면 이유(화이트리스트), 아니면 None."""
    raw = m.group("num")
    s, e = m.span()
    before, after = text[max(0, s - 3):s], text[e:e + 6]
    digits = raw.replace(",", "")
    if re.fullmatch(r"\d{19}", digits):
        return "pnu"
    if "," not in raw and re.fullmatch(r"\d{8}|\d{10}", digits):
        return "admin_code"                             # 법정동 코드(8·10자리)
    if after.startswith("-") and re.match(r"-\d", after) or before.endswith("-") and re.search(r"\d-$", before):
        return "jibun"                                  # 1053-12 · 2025-04 · 산 27-10
    if raw in wl:
        return "tool_text"
    if re.search(r"[A-Za-z]{1,4}\d?-$", before):
        return "code"                                   # AG-6 · F2-E 같은 구조 코드
    if before.endswith(":") and re.fullmatch(r"\d{2,5}", digits):
        return "port"                                   # :8702
    if not m.group("mul") and re.match(r"차(?![이량선액])", after) and float(digits) < 20:
        return "ordinal"                                # 2차 · 3차
    if re.search(r"제\s?$", before) and re.match(r"\s?(조|항|호|장|절)", after):
        return "law"
    if re.match(r"\s?(조|항|호)(?![가-힣])", after) and "제" in before:
        return "law"
    if "." in raw and len(raw.split(".")[1]) >= 3 and (30 <= float(digits) <= 45 or 120 <= float(digits) <= 135):
        return "coord"
    if not m.group("mul") and not m.group("pct") and "," not in raw and re.fullmatch(r"(19|20)\d\d", raw) and not COUNT_UNITS.match(after):
        return "year"
    if re.match(r"\s?(년|월|일|시|분)(?![가-힣]*\s?(건|필지))", after) and not m.group("mul"):
        v = float(digits)
        if v <= 31 or re.match(r"\s?년", after):
            return "date"
    if s == 0 or text[s - 1] == "\n":
        if re.match(r"[.)]\s", after):
            return "list"
    if re.match(r"\s?(단계|번째|차례|등(?![급록])|위(?![치험반원성]))", after):
        return "ordinal"
    return None


def _num_of(e: dict):
    v = e.get("value") if isinstance(e, dict) else None
    return v if isinstance(v, (int, float)) and not isinstance(v, bool) else None


def _match(x: float, k: int, pct: bool, mul: bool, envs: dict[str, dict]) -> str | None:
    best = None
    for eid, e in envs.items():
        v = _num_of(e)
        if v is None:
            continue
        u = e.get("unit")
        cands = []
        if pct:
            if u == "ratio":
                cands.append((v * 100, x))
            elif u == "%":
                cands.append((v, x))
            else:
                continue
        else:
            cands.append((v, x))
        for vv, xx in cands:
            if mul:
                # '약 2만' 식 반올림: 텍스트 유효 자리수로 비교
                mag = 10 ** math.floor(math.log10(abs(xx))) if xx else 1
                if round(vv / mag) * mag == xx or abs(vv - xx) < 0.5:
                    best = best or eid
            elif round(vv, k) == round(xx, k) or (k == 0 and round(vv) == xx):
                best = best or eid
    return best


def _unit_ok(e: dict, pct: bool) -> bool:
    return (e.get("unit") in ("ratio", "%")) if pct else (e.get("unit") not in ("ratio", "%"))


def _closest(x: float, pct: bool, envs: dict[str, dict], ids) -> str | None:
    best, bd = None, None
    for eid in ids:
        e = envs.get(eid)
        v = _num_of(e) if e else None
        if v is None or v <= 0 or x <= 0 or not _unit_ok(e, pct):
            continue
        vv = v * 100 if (pct and e.get("unit") == "ratio") else v
        d = abs(math.log(vv / x))
        if bd is None or d < bd:
            best, bd = eid, d
    return best if bd is not None and bd < 2.5 else None


def _nearest(x: float, pct: bool, envs: dict[str, dict], used=(), primary=()) -> tuple[str | None, str | None]:
    """취소선 옆 '도구 봉투' — ① 같은 답에서 이미 쓴 자리표 ② 첫 도구 주 봉투 ③ 값 근접(뜻 라벨 필수). 반환 (eid, by)."""
    for ids, by in ((list(dict.fromkeys(used)), "used"), (list(primary), "primary"), (list(envs), "value")):
        eid = _closest(x, pct, envs, ids)
        if eid:
            return eid, by
    return None, None


@dataclass
class Scope:
    """승격 범위. cite_envs = {인용 n: {eN…}} · parcel_cites = 필지 인용 n · primary = 인용 없이도 승격 가능한 주 봉투(집계·총계) · strict = 인용 봉투만."""
    cite_envs: dict = field(default_factory=dict)
    parcel_cites: set = field(default_factory=set)
    primary: list = field(default_factory=list)
    strict: bool = False


def scope_of(ctx, strict: bool = False) -> Scope:
    """run 컨텍스트 → Scope. 주 봉투 = 첫 도구가 준 봉투 + 목록 총계(필지별 값 [k] … 제외)."""
    ce, pc = {}, set()
    for c in ctx.citations:
        ce[c["n"]] = set(c.get("env") or [])
        if c.get("kind") == "parcel":
            pc.add(c["n"])
    for c in ctx.citations:           # 집계 인용 = 그 단계가 준 봉투 전부
        if c.get("kind") == "stats" and not ce.get(c["n"]):
            ce[c["n"]] = {eid for (i, _k), eid in ctx.keymap.items() if i == c.get("step")}
    per_parcel = set().union(*[ce[n] for n in pc]) if pc else set()
    first = min((i for (i, _k) in ctx.keymap), default=None)
    primary = [eid for (i, k), eid in sorted(ctx.keymap.items(), key=lambda kv: int(kv[1][1:]))
               if eid not in per_parcel and (i == first or k in ("suspects", "total", "shown", "count"))]
    return Scope(cite_envs=ce, parcel_cites=pc, primary=primary, strict=strict)


_SPAN = re.compile(r"[^.!?。\n]*(?:[.!?。](?:[ \t]*\[\d{1,2}(?:\s*[,·]\s*\d{1,2})*\])*|\n|$)")


def _sentence_spans(text: str) -> list[tuple[int, int, set]]:
    """(시작, 끝, 인용 번호 집합) — '문장 끝 [n].' 과 '문장. [n]' 둘 다 그 문장으로."""
    out = []
    for m in _SPAN.finditer(text):
        if m.start() == m.end():
            continue
        seg = m.group(0)
        ns = {int(x) for c in CITE.finditer(seg) for x in re.findall(r"\d{1,2}", c.group(0))}
        out.append((m.start(), m.end(), ns))
    return out


def _allowed(scope: "Scope | None", cites: set, envs: dict, pct: bool) -> dict:
    if scope is None:
        return envs
    ids = set()
    for n in cites:
        if pct and n not in scope.parcel_cites:
            continue
        ids |= scope.cite_envs.get(n, set())
    if not scope.strict and not pct:
        ids |= set(scope.primary)
    return {k: v for k, v in envs.items() if k in ids}


def lint(answer: str, envelopes: dict[str, dict], whitelist: set[str] | None = None, scope: "Scope | None" = None) -> LintResult:
    wl = set(whitelist or set())
    res = LintResult(answer_md="")
    out = []
    pos = 0
    n_unv = 0
    spans = _sentence_spans(answer) if scope is not None else []

    def cites_at(p: int) -> set:
        for a, b, ns in spans:
            if a <= p < b:
                return ns
        return set()
    # 자리표 단위로 나눠 평문 조각만 검사
    for m in PH.finditer(answer):
        out.append(("text", answer[pos:m.start()], pos))
        out.append(("ph", m, m.start()))
        pos = m.end()
    out.append(("text", answer[pos:], pos))
    parts = []
    pending = []          # nearest 는 전체를 본 뒤(① 같은 답에서 쓴 자리표)
    for kind, v, off in out:
        if kind == "ph":
            typ, eid = v.group(1), v.group(2)
            if typ == "env" and eid in envelopes:
                parts.append("{{env:%s}}" % eid)
                res.placeholders.append(eid)
            else:
                n_unv += 1
                uid = f"u{n_unv}"
                res.unverified.append({"id": uid, "text": v.group(0), "value": None, "reason": "unknown_placeholder", "nearest": None})
                parts.append("{{unv:%s}}" % uid)
            continue
        text = v
        # 인용 [n] 은 가린 채 검사
        masked = CITE.sub(lambda mm: "\u0000" * len(mm.group(0)), text)
        buf, last = [], 0
        for nm in NUM.finditer(masked):
            if "\u0000" in masked[nm.start():nm.end()]:
                continue
            why = _structural(masked, nm, wl)
            if why:
                res.whitelisted.append(f"{nm.group(0).strip()}:{why}")
                continue
            x, k, pct = _val(nm)
            cand = _allowed(scope, cites_at(off + nm.start()), envelopes, pct)
            eid = _match(x, k, pct, bool(nm.group("mul")), cand)
            buf.append(text[last:nm.start()])
            end = nm.end()
            if eid:
                # 뒤따르는 단위 말은 칩이 표기하므로 삼킨다
                u = envelopes[eid].get("unit")
                um = re.match(UNIT_AFTER.get(u, r"(?!)"), text[end:]) if not pct else None
                if um and um.group(0):
                    end += len(um.group(0))
                buf.append("{{env:%s}}" % eid)
                res.promoted.append({"text": text[nm.start():end].strip(), "env": eid, "scope": "global" if scope is None else "cited"})
                res.placeholders.append(eid)
            else:
                n_unv += 1
                uid = f"u{n_unv}"
                tail = re.match(r"\s?(건|필지|개|㎡|m²|ha|%)", text[end:])
                shown = text[nm.start():nm.end()].strip()
                same = _match(x, k, pct, bool(nm.group("mul")), envelopes) if scope is not None else None
                u = {"id": uid, "text": shown, "value": x if not pct else x / 100, "pct": pct,
                     "unit_text": tail.group(1) if tail else None, "nearest": None, "nearest_by": None,
                     "reason": "value_outside_citation" if same else "no_envelope"}
                if same:
                    u["same_value_env"] = same           # 값은 어느 봉투와 같지만 그 문장의 인용 봉투가 아님 → 뜻 확인 전 승격 안 함
                res.unverified.append(u)
                pending.append((u, x, pct))
                buf.append("{{unv:%s}}" % uid)
            last = end
        buf.append(text[last:])
        parts.append("".join(buf))
    for u, x, pct in pending:
        u["nearest"], u["nearest_by"] = _nearest(x, pct, envelopes, res.placeholders, scope.primary if scope else ())
    md = "".join(parts)

    # 자리표 뒤에 LLM 이 단위를 또 붙인 경우 정리({{env:e1}}건 → {{env:e1}})
    def _strip_unit(mm):
        eid = mm.group(1)
        u = (envelopes.get(eid) or {}).get("unit")
        return "{{env:%s}}" % eid if u else mm.group(0)
    md = re.sub(r"\{\{env:([A-Za-z0-9_]+)\}\}(?:\s?(?:개\s?필지|필지|㎡|m²|ha|%)|\s?건(?!물)|\s?개(?![발간선])|점(?=\s?이상|\s?이하|[,.\s]))", _strip_unit, md)
    res.answer_md = md
    return res


# ── 봉투 뜻 검사(2차 판정 뒤) — 진짜 봉투를 틀린 뜻으로 쓴 문장 ─────────────────────
RI = re.compile(r"[가-힣]{1,4}리(?![가-힣])")
_AGG = re.compile(r"(평균|전체|합계|모든)[가-힣\s]{0,10}$")


def meaning_rules(md: str, ctx, rule: str | None = None) -> list[dict]:
    """결정적 뜻 검사. 반환 [{sentence, envs, reason, by:'rule'}].
    ① 리 이름·지번 바로 뒤(주어 자리)에 읍면동 집계 봉투(연속지적 필지 수 · 의심 건수 · 등급 건수)
    ② 보고서 규칙과 다른 규칙의 건수 봉투(문장이 그 규칙을 말하지 않는데)
    ③ 필지 k 의 봉투를 다른 필지 인용 문장에 씀
    ④ '평균·전체·총' 주어에 필지 한 개의 값(필지별 봉투)"""
    parcel_env: dict[str, int] = {}
    for c in ctx.citations:
        if c.get("kind") == "parcel":
            for e in c.get("env") or []:
                parcel_env[e] = c["n"]
    parcel_ns = {c["n"] for c in ctx.citations if c.get("kind") == "parcel"}
    agg_keys = {eid for (i, k), eid in ctx.keymap.items() if k in ("parcels", "suspects", "suspect_parcels", "total")
                or k.startswith("rule_") or (k.startswith("pri_"))}
    flags = []
    for para in md.split("\n"):
        if not para.strip() or para.strip().startswith("#"):
            continue
        for a, b, ns in _sentence_spans(para):
            s = para[a:b]
            if not s.strip():
                continue
            ids = [m.group(2) for m in PH.finditer(s) if m.group(1) == "env"]
            if not ids:
                continue
            bad = []
            for m in PH.finditer(s):
                if m.group(1) != "env":
                    continue
                eid = m.group(2)
                meaning = ctx.env_meta.get(eid, "")
                pre = s[max(0, m.start() - 14):m.start()]
                if eid in agg_keys and eid not in parcel_env and (RI.search(pre) or re.search(r"\d+(?:-\d+)?\s*(번지)?\s*$", pre)):
                    bad.append((eid, f"'{RI.search(pre).group(0) if RI.search(pre) else pre.strip()}' 뒤에 읍면동 집계 '{meaning}'"))
                    continue
                rm = re.search(r"\b(R[1-6])\b", meaning)
                if rule and rm and rm.group(1) != rule and rm.group(1) not in s.replace(m.group(0), ""):
                    bad.append((eid, f"보고서 규칙 {rule} 문장에 다른 규칙 봉투 '{meaning}'"))
                    continue
                if eid in parcel_env and ns & parcel_ns and parcel_env[eid] not in ns:
                    bad.append((eid, f"필지 [{parcel_env[eid]}] 봉투 '{meaning}' 를 다른 필지 인용 {sorted(ns & parcel_ns)} 문장에"))
                    continue
                if eid in parcel_env and _AGG.search(pre) and _AGG.search(pre).group(1) not in meaning:
                    bad.append((eid, f"'{_AGG.search(pre).group(1)}' 주어에 필지 한 개의 값 '{meaning}'"))
            if bad:
                flags.append({"sentence": s.strip(), "envs": [x[0] for x in bad], "reason": " · ".join(x[1] for x in bad), "by": "rule"})
    return flags


SENT = re.compile(r"[^.!?。\n]+[.!?。]?")


def uncited_sentences(md: str, min_len: int = 12) -> list[str]:
    """보고서 서술: 인용 [n] 없는 문장(고정 문구·제목 제외)."""
    out = []
    md = attach_trailing_cites(md)
    for para in md.split("\n"):
        p = para.strip()
        if not p or p.startswith("#"):
            continue
        for s in SENT.findall(p):
            s = s.strip()
            if len(s) >= min_len and not CITE.search(s) and "위법 판정 아님" not in s:
                out.append(s)
    return out


_TRAIL = re.compile(r"([.!?。])[ \t]*((?:\[\d{1,2}(?:\s*[,·]\s*\d{1,2})*\][ \t]*)+)")


def attach_trailing_cites(md: str) -> str:
    """'…습니다. [2]' → '…습니다 [2].' — 마침표 뒤에 붙은 인용을 앞 문장으로."""
    return _TRAIL.sub(lambda m: " " + m.group(2).strip() + m.group(1) + " ", md)


def fix_cites(md: str, valid: set[int]) -> tuple[str, list[int]]:
    """없는 인용 번호([13] 등 — 모델이 봉투 번호와 헷갈린 것)를 지운다. 남은 번호만 [a, b] 로 다시 쓴다."""
    bad: list[int] = []

    def sub(m):
        ns = [int(x) for x in re.split(r"\s*[,·]\s*", m.group(0)[1:-1])]
        ok = [n for n in ns if n in valid]
        bad.extend(n for n in ns if n not in valid)
        return ("[" + ", ".join(map(str, ok)) + "]") if ok else ""
    out = CITE.sub(sub, md)
    out = re.sub(r"[ 	]+([.!?。])", r"", out)
    return out, sorted(set(bad))


_MORE = re.compile(r"(보다|에 비해|대비)\s*[가-힣\s]{0,8}(많|크|높|넘|초과)")
_LESS = re.compile(r"(보다|에 비해|대비)\s*[가-힣\s]{0,8}(적|작|낮|못 미|미만)")


def compare_check(md: str, envs: dict, unverified: list[dict]) -> list[dict]:
    """'봉투 X 는 말씀하신 N 보다 많다' 식 비교 문장 — 방향이 실제 값과 반대면 뜻 어긋남(비교 방향)."""
    U = {u["id"]: u for u in unverified}
    flags = []
    last_env = None
    for para in md.split("\n"):
        for a, b, _ns in _sentence_spans(para):
            s = para[a:b]
            envs_in = [m.group(2) for m in PH.finditer(s) if m.group(1) == "env" and _num_of(envs.get(m.group(2)) or {}) is not None]
            unvs = [U[m.group(2)] for m in PH.finditer(s) if m.group(1) == "unv" and m.group(2) in U and U[m.group(2)].get("value") is not None]
            if not envs_in and last_env and unvs:
                envs_in = [last_env]                    # 주어 생략('말씀하신 500건보다 많은 수치') → 앞 문장의 봉투
            if envs_in:
                last_env = envs_in[-1]
            if not envs_in or not unvs:
                continue
            v, x = _num_of(envs[envs_in[0]]), unvs[0]["value"]
            said_more, said_less = bool(_MORE.search(s)), bool(_LESS.search(s))
            # '봉투는 사용자 숫자보다 많다' 로 읽는다(주어 = 봉투 · 비교 대상 = 사용자 숫자)
            if (said_more and v <= x) or (said_less and v >= x):
                flags.append({"sentence": s.strip(), "envs": envs_in[:1], "reason": f"비교 방향이 실제 값과 반대(봉투 {v:,} · 말씀하신 {x:,.0f})", "by": "rule"})
    return flags
