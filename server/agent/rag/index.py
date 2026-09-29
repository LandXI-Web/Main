"""법령 원문 저장 · bm25 색인 · 검색(파일 기반 · 법령은 기관 경계가 없어 RLS 불필요).

    LX_DATA_ROOT/law/raw/<파일>      관리자가 올린 원문 그대로
    LX_DATA_ROOT/law/chunks.jsonl     조·항 조각(색인 만들 때 다시 쓴다)
    LX_DATA_ROOT/law/meta.json        법령 목록 · 조각 수 · 마지막 색인 시각

    add_file(name, raw)   → 원문 저장 + 파싱 검사(조각 수)
    rebuild()             → raw 전부 파싱 → chunks.jsonl · meta.json → 메모리 색인
    status()              → {acts, n_acts, n_articles, n_chunks, built_at, pending}
    search(query, acts)   → {"found": bool, "hits": [조각 + ref + score], "reason"}
    article(act, 조, 항)  → 조각(정확 조회 · 보고서 법령 근거 칸)

토큰 = 낱말 + 한글 두 글자 조각(형태소 분석기 없이 조사·어미 변화에 강하게). 임베딩은 선택이며 여기선 쓰지 않는다.
찾는 법령이 색인에 없거나 겹침이 낮으면 found=False — 답은 '법령 데이터에 없습니다'(지어내기 0).
"""
from __future__ import annotations

import datetime as dt
import json
import re
import threading
from pathlib import Path

from . import parse as P

KST = dt.timezone(dt.timedelta(hours=9))
_LOCK = threading.RLock()
_MEM: dict = {}

# 흔히 쓰는 줄임말 → 색인의 정식 이름(색인에 없으면 '없음'으로 판정)
ALIASES = {
    "국토계획법": "국토의 계획 및 이용에 관한 법률",
    "국토법": "국토의 계획 및 이용에 관한 법률",
    "실태조사 요령": "농업경영에 이용하지 않는 농지 등의 처분관련 업무처리요령",
    "실태조사요령": "농업경영에 이용하지 않는 농지 등의 처분관련 업무처리요령",
    "농지이용실태조사 요령": "농업경영에 이용하지 않는 농지 등의 처분관련 업무처리요령",
    "농지 이용실태조사 요령": "농업경영에 이용하지 않는 농지 등의 처분관련 업무처리요령",
    "처분관련 업무처리요령": "농업경영에 이용하지 않는 농지 등의 처분관련 업무처리요령",
}
STOP = {"조문", "근거", "근거조문", "무엇", "뭐야", "뭔가", "알려", "알려줘", "알려 줘", "관련", "어떻게", "있나", "있어", "규정", "내용", "해당",
        "법령", "법률", "조항", "인가요", "인지", "대한", "에서", "무엇인가요", "뭐", "좀", "주세요", "줘", "은", "는", "이", "가", "의", "상", "에"}
MIN_COVER = 0.34
SIDE = re.compile(r"특례|취소|의제|준용|위임|위탁|벌칙|과태료|수수료|양벌|청문|매수|해제|보고|권한")          # 질문 핵심 두 글자 조각 중 1위 조각에 들어 있는 비율 하한


def root() -> Path:
    from landxi_api import config
    d = Path(config.DATA_ROOT) / "law"
    (d / "raw").mkdir(parents=True, exist_ok=True)
    return d


def _now() -> str:
    return dt.datetime.now(KST).isoformat(timespec="seconds")


def safe_name(name: str) -> str:
    base = Path(str(name or "law")).name
    base = re.sub(r"[^0-9A-Za-z가-힣._()\- ]+", "_", base).strip(" .") or "law"
    return base[:120]


# ── 토큰 ────────────────────────────────────────────────────────────────
def tokens(s: str) -> list[str]:
    s = (s or "").replace("ㆍ", "·")
    out = []
    for w in re.findall(r"[0-9A-Za-z]+|[가-힣]+", s):
        wl = w.lower()
        if wl in STOP:
            continue
        out.append(wl)
        if re.fullmatch(r"[가-힣]+", w) and len(w) > 2:
            out.extend(w[i:i + 2] for i in range(len(w) - 1))
    return out


def _strip(w: str) -> str:
    """조사 떼기 — 세 글자 이상일 때만(‘허가’의 ‘가’를 조사로 보지 않게)."""
    if len(w) < 3:
        return w
    return re.sub(r"(으로|에서|에게|이란|이라|은요|는요|란|은|는|이|가|을|를|의|에|과|와|도|상)$", "", w) or w


def _core(q: str) -> set[str]:
    """덮임 검사용 질문 핵심 조각(낱말 두 글자 조각 · 법령 이름 · 불용어 제외)."""
    q2 = q
    for a in list(ALIASES) + [x for x in _acts()]:
        q2 = q2.replace(a, " ")
    q2 = re.sub(r"제\s*\d+\s*조(의\s*\d+)?|제\s*\d+\s*항|[①-⑳]", " ", q2)
    out = set()
    for w in re.findall(r"[가-힣]+", q2):
        if w in STOP or len(w) < 2:
            continue
        w = _strip(w)
        if len(w) < 2 or w in STOP:
            continue
        out.update(w[i:i + 2] for i in range(len(w) - 1))
    return out


# ── 저장 ────────────────────────────────────────────────────────────────
def add_file(name: str, raw: bytes) -> dict:
    """원문 저장 + 파싱 검사. 조각 0 이면 저장하지 않고 사유를 돌려준다."""
    nm = safe_name(name)
    try:
        meta, chunks = P.parse_file(nm, raw)
    except P.ParseError as e:
        return {"ok": False, "file": nm, "reason": str(e)}
    if not chunks:
        return {"ok": False, "file": nm, "reason": "조문을 찾지 못했습니다"}
    with _LOCK:
        (root() / "raw" / nm).write_bytes(raw)
    return {"ok": True, "file": nm, "act": meta["act"], "kind": meta.get("kind"), "effective": meta.get("effective"),
            "articles": len({c["article"] for c in chunks}), "chunks": len(chunks)}


def remove_file(name: str) -> bool:
    p = root() / "raw" / safe_name(name)
    if p.exists():
        p.unlink()
        return True
    return False


def rebuild() -> dict:
    t0 = dt.datetime.now()
    d = root()
    chunks, acts, errors = [], {}, []
    for f in sorted((d / "raw").iterdir()):
        if not f.is_file():
            continue
        try:
            meta, ch = P.parse_file(f.name, f.read_bytes())
        except P.ParseError as e:
            errors.append({"file": f.name, "reason": str(e)})
            continue
        act = meta["act"]
        if act in acts:                                   # 같은 법령을 두 번 올리면 나중 파일(이름순 뒤)이 이긴다
            chunks = [c for c in chunks if c["act"] != act]
        seen = set()
        for c in ch:
            if c["id"] in seen:
                k = 2
                while f"{c['id']}~{k}" in seen:
                    k += 1
                c["id"] = f"{c['id']}~{k}"
            seen.add(c["id"])
        chunks.extend(ch)
        acts[act] = {"act": act, "kind": meta.get("kind"), "effective": meta.get("effective"), "file": f.name,
                     "articles": len({c["article"] for c in ch}), "chunks": len(ch)}
    with _LOCK:
        tmp = d / "chunks.jsonl.tmp"
        with tmp.open("w", encoding="utf-8") as fh:
            for c in chunks:
                fh.write(json.dumps(c, ensure_ascii=False) + "\n")
        tmp.replace(d / "chunks.jsonl")
        meta = {"acts": sorted(acts.values(), key=lambda a: a["act"]), "n_acts": len(acts), "n_chunks": len(chunks),
                "n_articles": sum(a["articles"] for a in acts.values()), "built_at": _now(), "errors": errors,
                "ms": round((dt.datetime.now() - t0).total_seconds() * 1000)}
        (d / "meta.json").write_text(json.dumps(meta, ensure_ascii=False, indent=1), encoding="utf-8")
        _MEM.clear()
    _load()
    return status()


def _meta() -> dict:
    p = root() / "meta.json"
    if not p.exists():
        return {"acts": [], "n_acts": 0, "n_chunks": 0, "n_articles": 0, "built_at": None, "errors": []}
    return json.loads(p.read_text(encoding="utf-8"))


def status() -> dict:
    m = _meta()
    d = root() / "raw"
    indexed = {a["file"] for a in m.get("acts") or []}
    built = m.get("built_at")
    files = []
    for f in sorted(d.iterdir()):
        if f.is_file():
            mt = dt.datetime.fromtimestamp(f.stat().st_mtime, KST).isoformat(timespec="seconds")
            files.append({"file": f.name, "bytes": f.stat().st_size, "uploaded_at": mt,
                          "indexed": f.name in indexed and bool(built) and mt <= built})
    return {"acts": m.get("acts") or [], "n_acts": m.get("n_acts", 0), "n_articles": m.get("n_articles", 0), "n_chunks": m.get("n_chunks", 0),
            "built_at": built, "files": files, "pending": sum(1 for f in files if not f["indexed"]), "errors": m.get("errors") or []}


# ── 메모리 색인 ─────────────────────────────────────────────────────────
def _load() -> dict:
    with _LOCK:
        m = _meta()
        if _MEM.get("built_at") == m.get("built_at") and "bm25" in _MEM:
            return _MEM
        p = root() / "chunks.jsonl"
        chunks = [json.loads(x) for x in p.read_text(encoding="utf-8").splitlines() if x.strip()] if p.exists() else []
        _MEM.clear()
        _MEM.update(built_at=m.get("built_at"), chunks=chunks, acts=[a["act"] for a in m.get("acts") or []])
        if chunks:
            from rank_bm25 import BM25Okapi
            docs = [tokens(f"{c['act']} {c['article']} " + (" " + _title(c)) * 3 + " " + c["text"]) for c in chunks]
            _MEM["bm25"] = BM25Okapi(docs)
        else:
            _MEM["bm25"] = None
        return _MEM


def _title(c: dict) -> str:
    return re.sub(r"[ㆍ·,]", " ", c.get("article_title") or "")


SYN = {"무허가": ["허가", "위반"], "불법": ["위반"], "미신고": ["신고", "위반"], "휴경": ["휴경", "처분"], "전용": ["전용"],
       "개간": ["전용", "개간"], "주차장": ["주차장", "전용"]}


def _expand(q: str) -> str:
    extra = [w for k, v in SYN.items() if k in q for w in v]
    return q + (" " + " ".join(extra) if extra else "")


def _phrases(q: str) -> list[str]:
    """이웃 낱말 둘을 붙인 말(조사 뗌) — '산지전용 허가' → '산지전용허가'."""
    q2 = q
    for a in list(ALIASES) + _acts():
        q2 = q2.replace(a, " ")
    ws = []
    for w in re.findall(r"[가-힣]+", q2):
        w = _strip(w)
        if len(w) >= 2 and w not in STOP:
            ws.append(w)
    return [a + b for a, b in zip(ws, ws[1:])]


def _acts() -> list[str]:
    try:
        return list(_load().get("acts") or [])
    except Exception:  # noqa: BLE001
        return []


def resolve_act(name: str | None) -> str | None:
    """이름·줄임말 → 색인의 정식 법령 이름(없으면 None)."""
    if not name:
        return None
    n = str(name).strip()
    acts = _acts()
    if n in acts:
        return n
    full = ALIASES.get(n) or ALIASES.get(n.replace(" ", ""))
    if full and full in acts:
        return full
    return next((a for a in acts if a.replace(" ", "") == n.replace(" ", "")), None)


NOT_ACT_END = re.compile(r"(불법|위법|적법|합법|탈법|편법|방법|용법|기법|해법|문법|명령|법령|수령|발령|지령|훈령|사령|요령서)$")
ACT_MENTION = re.compile(r"「?([가-힣A-Za-z·ㆍ\s]{1,30}?(?:법률|법|령|규칙|요령|지침|규정|고시))(?:\s*(시행령|시행규칙))?」?")


def mentioned_acts(q: str) -> tuple[list[str], list[str]]:
    """질문이 부른 법령 → (색인에 있는 정식 이름들, 색인에 없는 이름들)."""
    have, miss = [], []
    rest = q
    for a in sorted(set(ALIASES) | set(_acts()), key=len, reverse=True):     # 긴 이름부터(‘농지법 시행령’ 이 ‘농지법’ 보다 먼저)
        if a in rest:
            full = resolve_act(a)
            (have if full else miss).append(full or a)
            rest = rest.replace(a, " ")
    for m in ACT_MENTION.finditer(rest):
        nm = (m.group(1) + (" " + m.group(2) if m.group(2) else "")).strip()
        nm = re.sub(r"^(어느|무슨|이|그|관련|해당|위반|근거|어떤)\s*", "", nm).strip()
        if len(nm) < 2 or nm in ("법", "법률", "법령", "규정", "시행령", "시행규칙", "조례"):
            continue
        if re.search(r"(무슨|어떤|어느)", m.group(1)):
            continue
        if NOT_ACT_END.search(nm):                        # '농지 불법 전용' · '처분명령' 은 법령 이름이 아니다
            continue
        full = resolve_act(nm)
        if full:
            have.append(full)
        else:
            miss.append(nm)
    return list(dict.fromkeys(have)), list(dict.fromkeys(miss))


# 주제어 → 소관 법령(법령 이름 없이 물어도 그 법령의 질문으로 본다). 그 법령이 색인에 없으면 '법령 데이터에 없습니다'.
# (정규식, 소관 법령, 이 말이 함께 있으면 적용하지 않음) — 색인된 법령(농지·산지·건축·국토계획)의 본 주제와 겹치면 비켜 간다.
TOPIC_ACTS: list[tuple[re.Pattern, str, re.Pattern | None]] = [
    (re.compile(r"소하천"), "소하천정비법", None),
    (re.compile(r"하천.{0,10}(점용|구역|공사|사용|행위|허가|굴착|골재|부지)|(점용|구역|공사|굴착).{0,6}하천"), "하천법", None),
    (re.compile(r"도로.{0,10}(점용|굴착|연결\s*허가)|점용.{0,6}도로|접도\s*구역"), "도로법", None),
    (re.compile(r"공유\s*수면.{0,10}(점용|사용|매립\s*(면허|허가))"), "공유수면 관리 및 매립에 관한 법률", None),
    (re.compile(r"(문화재|국가유산|문화유산).{0,12}(현상\s*변경|허가|보호\s*구역|발굴)"), "문화유산의 보존 및 활용에 관한 법률", None),
    (re.compile(r"(개발\s*제한\s*구역|그린벨트).{0,12}(행위|허가|건축|설치|신고)"), "개발제한구역의 지정 및 관리에 관한 특별조치법", None),
    (re.compile(r"지목\s*변경|토지\s*이동|지적\s*공부|지적\s*측량"), "공간정보의 구축 및 관리 등에 관한 법률", re.compile(r"농지|산지")),
    (re.compile(r"(묘지|분묘|봉안).{0,10}(설치|허가|신고)"), "장사 등에 관한 법률", re.compile(r"산지")),
    (re.compile(r"폐기물"), "폐기물관리법", re.compile(r"농지|산지")),
    (re.compile(r"가축\s*분뇨"), "가축분뇨의 관리 및 이용에 관한 법률", None),
    (re.compile(r"자연\s*공원"), "자연공원법", None),
    (re.compile(r"도시\s*공원"), "도시공원 및 녹지 등에 관한 법률", None),
    (re.compile(r"(입목|나무|산림).{0,8}(벌채|베)"), "산림자원의 조성 및 관리에 관한 법률", re.compile(r"산지\s*전용|산지\s*일시")),
]
# ── 질문의 대상 말(핵심 명사) — 고정 목록이 아니라 질문에서 뽑는다 ──────────────────
# 답 조문의 제목·본문(다른 법 인용 「…」 제n조 를 뺀 글)에 질문의 대상 말이 모두 있고, 그중 하나 이상이
# 조문 제목(그 조문의 주제)에 있어야 '관련 조문'이다. 아니면 found=False → '법령 데이터에 없습니다'(‘허가’·‘승인’ 같은 흔한 말만 겹친 엉뚱한 조문 차단).
# GENERIC = 어느 법에나 나오는 절차·서술 말(주제가 아니다). 주제어 사전이 아니라 말의 성격 목록이다.
GENERIC = {"허가", "승인", "신고", "설치", "의무", "근거", "조문", "위반", "경우", "대상", "기준", "요건", "제한", "절차", "방법",
           "사유", "범위", "행위", "관계", "규정", "조치", "신청", "필요", "가능", "여부", "내용", "사항", "조건", "무단", "불법",
           "무허가", "미신고", "위법", "처벌", "적용", "관련", "해당", "어떤", "무슨", "어느", "무엇", "언제", "얼마", "누가", "어디",
           "받아야", "해야", "하는", "있는", "없는", "없이", "알려", "설명", "정리", "요약", "찾아", "보여", "조항", "법적", "법상",
           "받으려면", "하려면", "되는", "경우에", "때", "시", "등", "및", "또는", "관한", "대해", "대하여", "따른", "따라", "위한"}
_NOUN_KEEP_MYEON = re.compile(r"(수면|도면|지면|측면|방면|전면|평면|입면|단면|표면|사면|장면|국면|이면)$")
_HADA = re.compile(r"^([가-힣]{2,}?)(하려면|하면|하는|하여|해서|해야|하고|하게|하려|할|했|된|되는|되면|되어|시키|받는|받을|받아)$")
_PRED = re.compile(r"(으면|려면|아야|어야|는데|는지|을까|할까|나요|까요|어요|아요|해요|세요|니까|는가|인가|이야|이다|이며|하며|줘|죠|네|냐)$")
_ITEM = re.compile(r"^\s*(\d+(의\d+)?\.|[가-하]\.|\d+\)|[가-하]\))")                  # 호(1.)·목(가.) 줄
_OTHER_CITE = re.compile(r"「([^」]{1,80})」(?:\s*(?:제\s*\d+\s*조(?:의\s*\d+)?|제\s*\d+\s*항|제\s*\d+\s*호|[·ㆍ,및또는]|\s)+)*")


def key_nouns(q: str) -> list[str]:
    """질문의 대상 말(핵심 명사) — 법령 이름·조문 번호·불용어·흔한 절차 말·서술어를 뺀 낱말(조사 뗌)."""
    q2 = re.sub(r"「[^」]*」", " ", q or "")
    for a in sorted(set(ALIASES) | set(_acts()), key=len, reverse=True):
        q2 = q2.replace(a, " ")
    q2 = re.sub(r"[가-힣]{1,20}(?:법률|법)(?=\s|상|에|의|을|은|이|$)", " ", q2)          # 색인 밖 법령 이름도 대상 말이 아니다
    q2 = re.sub(r"제\s*\d+\s*조(의\s*\d+)?|제\s*\d+\s*항|[①-⑳]", " ", q2)
    out = []
    for w in re.findall(r"[가-힣]+", q2):
        if w in STOP or w in GENERIC:
            continue
        if not re.search(r"(허가|평가|단가|시가|지가|농가|대가|주가|휴가|추가)$", w):
            w = _strip(w)                                 # '점용허가'의 '가'는 조사가 아니다
        if len(w) == 2 and w[1] in "할한":                  # 명할 · 정한 같은 한 글자 서술어
            continue
        m = _HADA.match(w)
        if m:                                             # 임대할 → 임대 · 전용하면 → 전용 · 점용하려면 → 점용
            w = m.group(1)
        elif _PRED.search(w) or (len(w) >= 3 and w.endswith("면") and not _NOUN_KEEP_MYEON.search(w)):
            continue                                      # 바꾸면 · 쌓으면 · 받아야 같은 서술어
        if len(w) < 2 or w in STOP or w in GENERIC:
            continue
        out.append(w)
    return list(dict.fromkeys(out))


def own_text(c: dict) -> str:
    """조문 제목 + 본문에서 다른 법 인용을 뺀 글(공백 제거) — 대상 말 검사용.
    다른 법을 인용한 호·목 줄(「주차장법」 제19조에 따른 부설주차장의 설치)은 그 법의 주제이므로 줄째 빼고,
    본문 문장 속 인용(「…법」 제n조)은 인용 부분만 뺀다."""
    act = c.get("act")
    keep = []
    for ln in (c.get("text") or "").splitlines():
        other = [m for m in _OTHER_CITE.finditer(ln) if m.group(1).strip() != act]
        if other and _ITEM.match(ln):
            continue
        keep.append(_OTHER_CITE.sub(lambda m: " " if m.group(1).strip() != act else m.group(0), ln))
    return f"{c.get('article_title') or ''} {' '.join(keep)}".replace(" ", "")


def _has(noun: str, text: str) -> bool:
    if noun in text:
        return True
    if len(noun) >= 4:                                    # 붙은 말(무단전용 · 공장설립)은 두 동강이 모두 있으면 인정
        h = len(noun) // 2
        return noun[:h] in text and noun[h:] in text
    return False


def topic_acts(q: str) -> list[str]:
    """법령 이름 없이 묻는 질문의 주제어 → 소관 법령 이름(색인 여부와 무관)."""
    out = []
    for rx, act, unless in TOPIC_ACTS:
        if rx.search(q) and not (unless and unless.search(q)):
            out.append(act)
            if act == "소하천정비법":
                break                                     # '소하천'이 '하천' 규칙에 다시 걸리지 않게
    return list(dict.fromkeys(out))


def ref_of(c: dict) -> dict:
    """인용 칩 · 보고서용 law_ref{법령, 조, 항, 시행일} + 사람이 읽는 한 줄."""
    art = c["article"]
    para = c.get("para")
    if art.startswith("제"):
        hang = f"제{P.CIRCLED.index(para) + 1}항" if para and para in P.CIRCLED else None
        label = f"「{c['act']}」 {art}" + (f"({c['article_title']})" if c.get("article_title") else "") + (f" {hang}" if hang else "")
    else:
        hang = None
        ch, _, no = art.partition("-")
        label = f"「{c['act']}」 {ch}. {no}. {c.get('article_title') or ''}".rstrip()
    eff = c.get("effective")
    return {"law": c["act"], "article": art, "para": hang, "effective": eff, "title": c.get("article_title"),
            "label": label + (f" · 시행 {eff}" if eff else "")}


def article(act: str, art: str, para: str | int | None = None) -> dict | None:
    """정확 조회 — act(이름·줄임말) · art('제34조' · '34' · '34의2') · para(1 · '①' · None=첫 항)."""
    full = resolve_act(act)
    if not full:
        return None
    a = str(art).strip()
    if re.fullmatch(r"\d+(의\d+)?", a):
        a = f"제{a.split('의')[0]}조" + (f"의{a.split('의')[1]}" if "의" in a else "")
    if isinstance(para, int) or (isinstance(para, str) and para.isdigit()):
        para = P.CIRCLED[int(para) - 1]
    rows = [c for c in _load()["chunks"] if c["act"] == full and c["article"] == a]
    if not rows:
        return None
    hit = next((c for c in rows if c.get("para") == para), None) if para else rows[0]
    return {**hit, "ref": ref_of(hit)} if hit else None


def search(query: str, acts: list[str] | None = None, k: int = 3) -> dict:
    mem = _load()
    q = (query or "").strip()
    if not mem.get("chunks"):
        return {"found": False, "hits": [], "reason": "empty_index"}
    have, miss = mentioned_acts(q)
    want = [resolve_act(a) for a in (acts or [])]
    if acts and not any(want):
        return {"found": False, "hits": [], "reason": "act_not_indexed", "missing": list(acts)}
    scope = [a for a in want if a] or have
    if miss and not have and not [a for a in want if a]:
        return {"found": False, "hits": [], "reason": "act_not_indexed", "missing": miss}
    if not scope and not miss:                            # 법령 이름 없이 물었다 → 주제어의 소관 법령부터 본다
        topics = topic_acts(q)
        if topics:
            t_have = [resolve_act(a) for a in topics]
            if not any(t_have):
                return {"found": False, "hits": [], "reason": "act_not_indexed", "missing": topics}
            scope = [a for a in t_have if a]
    objs = key_nouns(q)
    # 조문 번호를 직접 부르면 정확 조회
    m = re.search(r"제\s*(\d+)\s*조(?:\s*의\s*(\d+))?(?:\s*제?\s*(\d+)\s*항)?", q)
    if m and scope:
        art = f"제{m.group(1)}조" + (f"의{m.group(2)}" if m.group(2) else "")
        rows = [c for c in mem["chunks"] if c["act"] in scope and c["article"] == art]
        if m.group(3):
            want_p = P.CIRCLED[int(m.group(3)) - 1] if 0 < int(m.group(3)) <= 20 else None
            rows = [c for c in rows if c.get("para") == want_p] or rows
        if rows:
            return {"found": True, "hits": [{**c, "ref": ref_of(c), "score": None, "match": "exact"} for c in rows[:k]], "reason": "exact"}
        return {"found": False, "hits": [], "reason": "article_not_indexed"}
    toks = tokens(_expand(q))
    if not toks:
        return {"found": False, "hits": [], "reason": "empty_query"}
    scores = mem["bm25"].get_scores(toks)
    order = sorted(range(len(scores)), key=lambda i: scores[i], reverse=True)
    core = _core(q)
    phrases = _phrases(q)
    hits = []
    for i in order:
        c = mem["chunks"][i]
        if scope and c["act"] not in scope:
            continue
        if scores[i] <= 0:
            break
        body = f"{c.get('article_title') or ''} {c['text']}".replace(" ", "")
        title = _title(c).replace(" ", "")
        cover = (sum(1 for t in core if t in body) / len(core)) if core else 0.0
        tcov = (sum(1 for t in core if t in title) / len(core)) if core else 0.0
        rank = float(scores[i]) * (0.5 + cover) * (1 + 1.5 * tcov) * (1.15 if c.get("para") in (None, "①") else 1.0)
        tp = [ph for ph in phrases if ph in title]
        if tp:                                            # 질문의 붙은 말('전용 허가' → 전용허가)이 조문 제목에 그대로 있다
            share = min(1.0, sum(len(ph) for ph in tp) / max(len(title), 1))
            rank *= 1.5 + 1.5 * share
        elif any(ph in body for ph in phrases):
            rank *= 1.3
        side = SIDE.search(title)
        if side and side.group(0) not in q:               # 본 조문(허가·제한)을 특례·취소·벌칙 조문보다 먼저
            rank *= 0.6
        hits.append({**c, "ref": ref_of(c), "score": round(float(scores[i]), 3), "cover": round(cover, 2), "rank": round(rank, 3)})
        if len(hits) >= max(k * 10, 40):
            break
    hits = [h for h in hits if h["cover"] >= MIN_COVER]
    if objs:                                              # 질문의 대상 말이 조문(다른 법 인용 뺀 글)에 모두 있고, 하나 이상은 조문 제목(주제)에 있어야 관련 조문
        hits = [h for h in hits if all(_has(o, own_text(h)) for o in objs) and any(_has(o, _title(h).replace(" ", "")) for o in objs)]
    hits.sort(key=lambda h: h["rank"], reverse=True)
    if not hits:
        return {"found": False, "hits": [], "reason": "off_topic" if objs else "low_match"}
    return {"found": True, "hits": hits[:k], "reason": "bm25"}
