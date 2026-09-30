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


_NOUN_GA = re.compile(r"(허가|평가|단가|시가|지가|농가|대가|주가|휴가|추가)$")


def _strip_noun(w: str) -> str:
    """조사 떼기 — '점용허가'·'개발행위허가'의 '가'는 조사가 아니다."""
    return w if _NOUN_GA.search(w) else _strip(w)


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
        if _not_topic(w):                                 # 받는 · 다른 · 쓰려고 — 서술어를 건너 붙인다('전용 받는 허가' → '전용허가')
            continue
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


# 동사 관형형(내줄 · 보는 · 받을 · 따른) — 대상 말이 아니다. 줄기 + 는/은/을/던, 또는 받침 없는 줄기에 ㄴ·ㄹ 받침.
_VSTEM = ("내어주", "내주", "살펴보", "알아보", "적용되", "적용하", "검토하", "확인하", "판단하", "정하", "따르", "고르", "가리", "내리",
          "빌려주", "빌리", "세우", "만들", "바꾸", "옮기", "걸리", "쓰이", "주", "보", "쓰", "하", "되", "두", "받", "있", "없", "않", "묻",
          "찾", "살피", "들", "짓", "팔", "놓", "쌓", "깎", "허물", "부수", "메우", "캐", "파")

# 풀어 쓴 말 → 조문 말(로컬 표 · 긴 꼴부터). 공무원이 흔히 풀어 묻는 꼴만 — 뜻이 하나로 정해지는 것만 넣는다.
PLAIN = [
    (re.compile(r"(?:다른|딴)\s*(?:용도|목적)\s*(?:으로|로)\s*(?:쓰|사용하|이용하|바꾸|바꿔|전환하)[가-힣]*"), "전용"),   # 농지를 다른 용도로 쓰려고 → 농지 전용
    (re.compile(r"용도\s*(?:를|을)?\s*(?:바꾸|바꿔|바뀌|변경하)[가-힣]*"), "용도변경"),
    (re.compile(r"농사\s*(?:를|도)?\s*(?:짓|지으|지을|지은|안\s*짓|않)[가-힣]*"), "경작"),                     # '짓 → 건축'보다 먼저
    (re.compile(r"(?<![가-힣])(?:짓[가-힣]*|지으[가-힣]*|지을|지은)(?=\s|$)"), "건축"),                          # 건축물을 짓기 전에 → 건축물 건축
    (re.compile(r"(?<![가-힣])(?:빌려\s*주[가-힣]*|빌려\s*줄|빌[려리린릴][가-힣]*)(?=\s|$)"), "임대차"),    # 농지를 빌려주는 · 빌려서 → 농지 임대차
    (re.compile(r"(?<![가-힣])임대(?=[을를은는이가의도]?(?:\s|$))"), "임대차"),                                  # '농지 임대 조문' = 임대차
    (re.compile(r"(?<![가-힣])(?:사려고|사려면|사기|살\s*때|사서|구입하[가-힣]*|매입하[가-힣]*)(?=\s|$)"), "취득"),   # 농지를 사기 전에 → 농지 취득
    (re.compile(r"(?<![가-힣])(?:건물|집)(?=[을를은는이가의에도]?(?:\s|$))"), "건축물"),
    (re.compile(r"(?<![가-힣])(?:산|임야)(?=[을를은는이가의에도]?(?:\s|$))"), "산지"),
    (re.compile(r"(?<![가-힣])땅(?=[을를은는이가의에도과와]?(?:\s|$))"), "토지"),
    (re.compile(r"(?<![가-힣])(?:나누|쪼개|쪼갤|나눌)[가-힣]*"), "분할"),
]
# 대상 말이 아닌 관형사·때를 나타내는 말(다른 · 전에 · 먼저 …) — 주제 명사가 아니다.
FUNC = {"다른", "모든", "같은", "여러", "각종", "새로운", "이런", "그런", "저런", "이러한", "그러한", "전에", "후에", "뒤에", "다음에",
        "이전에", "이후에", "때에", "동안", "먼저", "미리", "이미", "다시", "함께", "직접", "새로", "처음", "우선", "전", "후", "뒤", "남",
        "남의", "남에게", "제가", "우리", "저희", "사람", "경우는", "때는"}
_VERBAL = re.compile(r"(으려고|려고|고자|으러|도록|면서|거나|지만|(?:려|아|어|여|워|와|해)주[는은을던]?|(?:려|아|어|여|워|와|해)줄)$")


def plain_query(q: str) -> str:
    """풀어 쓴 질문을 조문 말로 — '농지를 다른 용도로 쓰려고' → '농지를 전용', '빌려주는 임대차' → '임대차 임대차'."""
    for rx, rep in PLAIN:
        q = rx.sub(rep, q)
    return q


def _not_topic(w: str) -> bool:
    """주제 말이 아닌 낱말 — 동사 관형형(받는) · 관형사·때 말(다른 · 전에) · 명사형(짓기) · 연결형(쓰려고 · 빌려주는) · 서술어(되나요)."""
    return (w in FUNC or is_adnominal(w) or _nominal_ki(w) or bool(_PRED.search(w))
            or (len(w) >= 3 and bool(_VERBAL.search(w))))


def _nominal_ki(w: str) -> bool:
    """동사 명사형 '-기'(짓기 · 쓰기 · 받기)와 연결형(깎아 · 받아서 · 짓고) — 명사 '시기'·'전기'·'용기'는 False(줄기가 동사 목록에 있을 때만)."""
    if w.endswith("기") and w[:-1] in _VSTEM:
        return True
    if len(w) >= 2 and w[-1] in "아어서고게지" and w[:-1] in _VSTEM:
        return True
    return len(w) >= 3 and w[-2:] in ("아서", "어서", "고서") and w[:-2] in _VSTEM


def _jong(ch: str, j: int) -> str:
    """받침 없는 글자 ch 에 받침 j(4=ㄴ · 8=ㄹ)를 붙인 글자."""
    o = ord(ch) - 0xAC00
    return chr(ord(ch) + j) if 0 <= o < 11172 and o % 28 == 0 else ""


def is_adnominal(w: str) -> bool:
    """'내줄'·'보는'·'받을'·'따른' 같은 동사 관형형이면 True(명사 '기준'·'처분'은 False — 낱말 전체가 줄기 + 어미일 때만)."""
    for st in _VSTEM:
        if w in (st + "는", st + "은", st + "을", st + "던"):
            return True
        if len(w) == len(st) and w[:-1] == st[:-1] and w[-1] in (_jong(st[-1], 4), _jong(st[-1], 8)):
            return True
    return False


def key_nouns(q: str) -> list[str]:
    """질문의 대상 말(핵심 명사) — 법령 이름·조문 번호·불용어·흔한 절차 말·서술어를 뺀 낱말(조사 뗌)."""
    q2 = re.sub(r"「[^」]*」", " ", q or "")
    for a in sorted(set(ALIASES) | set(_acts()), key=len, reverse=True):
        q2 = q2.replace(a, " ")
    q2 = re.sub(r"[가-힣]{1,20}(?:법률|법)(?=\s|상|에|의|을|은|이|$)", " ", q2)          # 색인 밖 법령 이름도 대상 말이 아니다
    q2 = re.sub(r"제\s*\d+\s*조(의\s*\d+)?|제\s*\d+\s*항|[①-⑳]", " ", q2)
    out = []
    for w in re.findall(r"[가-힣]+", q2):
        if w in STOP or w in GENERIC or w in FUNC or is_adnominal(w) or _nominal_ki(w) or (len(w) >= 3 and _VERBAL.search(w)):
            continue                                      # 다른 · 전에 · 짓기 · 쓰려고 · 빌려주는 — 대상 말 아님
        if not re.search(r"(허가|평가|단가|시가|지가|농가|대가|주가|휴가|추가)$", w):
            w = _strip(w)                                 # '점용허가'의 '가'는 조사가 아니다
            if len(w) >= 3 and w.endswith("로") and not w.endswith("으로"):
                w = w[:-1]                                # 용도로 → 용도(진입로 → 진입: 더 짧은 말이라 조문 찾기가 좁아지지 않는다)
        if w in FUNC or _nominal_ki(w):
            continue
        if len(w) == 2 and w[1] in "할한":                  # 명할 · 정한 같은 한 글자 서술어
            continue
        if is_adnominal(w):                               # 내줄 · 보는 · 받을 — 서술어(대상 말 아님)
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


_PART_SP = re.compile(r"(?<=[가-힣])(?:에서의|에\s*관한|에\s*대한|의)(?=\s)")


def norm_ko(s: str) -> str:
    """띄어쓰기·조사('의'·'에 관한')·가운뎃점을 없앤 비교용 글 — '개발행위의 허가' = '개발행위허가', '농지전용 신고' = '농지전용신고'."""
    s = (s or "").replace("ㆍ", " ").replace("·", " ")
    s = _PART_SP.sub("", s + " ")
    return re.sub(r"[\s,()「」『』\"'“”]", "", s)


def _title_n(c: dict) -> str:
    """조문 제목(비교용) — 끝의 '등'은 뺀다('산지전용허가기준 등' = '산지전용허가기준')."""
    return re.sub(r"등$", "", norm_ko(c.get("article_title") or ""))


def _bigrams(s: str) -> set[str]:
    return {s[i:i + 2] for i in range(len(s) - 1)} if len(s) >= 2 else ({s} if s else set())


def _q_norm(q: str) -> str:
    """질문(비교용) — 법령 이름·조문 번호·불용어를 빼고 낱말마다 조사를 뗀 뒤 붙인 글('개발행위허가 대상 조문은?' → '개발행위허가대상')."""
    q2 = q
    for a in sorted(set(ALIASES) | set(_acts()), key=len, reverse=True):
        q2 = q2.replace(a, " ")
    q2 = re.sub(r"제\s*\d+\s*조(의\s*\d+)?|제\s*\d+\s*항|[①-⑳]", " ", q2)
    ws = []
    for w in re.findall(r"[가-힣]+", q2):
        if is_adnominal(w) or _PRED.search(w) or w in FUNC or _nominal_ki(w) or (len(w) >= 3 and _VERBAL.search(w)):
            continue                                      # 내줄 · 보는 · 되나요 · 다른 · 짓기 — 제목 비교에서 뺀다
        w = _strip_noun(w)
        if len(w) >= 2 and w not in STOP and not is_adnominal(w):
            ws.append(w)
    return "".join(ws)


def title_fit(c: dict, qn: str) -> float:
    """조문 제목과 질문 말이 얼마나 같은가 — (제목 조각 중 질문에 있는 비율 + 질문 조각 중 제목에 있는 비율) / 2.
    제목 전체가 질문 말이면(‘개발행위의 허가’ ↔ ‘개발행위허가 대상’) 1.2 배(본 조문)."""
    tb, qb = _bigrams(_title_n(c)), _bigrams(qn)
    if not tb or not qb:
        return 0.0
    both = tb & qb
    f = 0.5 * len(both) / len(tb) + 0.5 * len(both) / len(qb)
    return f * 1.2 if both == tb else f


_COORD = re.compile(r"(?<=[가-힣])(?:과|와)\s+|\s+(?:및|또는)\s+")        # 가운뎃점은 나누지 않는다('임대차ㆍ사용대차 계약 방법'은 한 주제)


_PLAIN_NOT = re.compile(r"(의|에|에서|에게|으로|로|을|를|은|는|한|된|치는|하는|되는|대한|관한|따른)$")


def title_heads(c: dict) -> set[str]:
    """조문 제목의 나란한 주제(비교용) — '처분명령과 매수 청구' → {처분명령, 매수청구} · '처분명령의 유예' → set()(주제는 '유예').
    맨 앞 한 낱말 꾸밈('농지의 임대차 또는 사용대차')은 모든 주제에 걸리므로 떼고 본다 → {임대차, 사용대차, 농지임대차, 농지사용대차}."""
    t = c.get("article_title") or ""
    lead = ""
    m = re.match(r"^([가-힣]{2,})의\s+(.+)$", t)
    if m and len(_COORD.split(m.group(2))) >= 2:
        lead, t = m.group(1), m.group(2)
    if len(_COORD.split(t)) < 2 or any(_PLAIN_NOT.search(w) for w in re.findall(r"[가-힣]+", _COORD.sub(" ", t))):
        return set()                                       # 나란한 주제가 아니다('용도지역 및 용도지구에서의 건축 제한' · '처분명령의 유예')
    out = set()
    for part in _COORD.split(t):
        n = re.sub(r"등$", "", norm_ko(part))
        if len(n) >= 2:
            out.add(n)
            if lead:
                out.add(lead + n)
    return out


def head_match(c: dict, objs: list[str], qn: str) -> bool:
    """질문 말(대상 말 하나 또는 질문 전체)이 조문 제목의 나란한 주제 하나와 같다 = 그 말을 다루는 본 조문."""
    heads = title_heads(c)
    return bool(heads & ({norm_ko(o) for o in objs} | ({qn} if qn else set())))


def level(act: str) -> int:
    """법령 위계 — 1 법률 · 2 시행령 · 3 시행규칙 · 4 지침·요령·고시 등(같은 점수면 낮은 수가 먼저)."""
    a = (act or "").strip()
    if a.endswith("시행령"):
        return 2
    if a.endswith("시행규칙"):
        return 3
    if re.search(r"(법|법률)$", a):
        return 1
    return 4


LEVEL_W = {1: 1.0, 2: 0.85, 3: 0.75, 4: 0.7}
# 모법 이름이 법령 이름에서 드러나지 않는 행정규칙 → 그 규칙이 '법 제n조'로 부르는 법률(색인에 있을 때만 쓴다)
PARENT_ACTS = {"농업경영에 이용하지 않는 농지 등의 처분관련 업무처리요령": "농지법"}
_CITE_UP = re.compile(r"(?<![가-힣」])(법|영)\s*제\s*(\d+)\s*조(?:\s*의\s*(\d+))?(?:\s*제\s*(\d+)\s*항)?")


def parents_of(act: str) -> dict[str, str]:
    """하위 법령이 '법 제n조'·'영 제n조' 로 부르는 법령 → {'법': 법률 이름, '영': 시행령 이름}(색인에 있는 것만)."""
    acts = set(_acts())
    base = re.sub(r"\s*(시행령|시행규칙)$", "", act or "")
    if level(act) == 4:
        base = PARENT_ACTS.get(act) or ""
        if not base:                                       # 모르면: 그 규칙 본문이 가장 많이 부르는 색인 법률
            cnt: dict[str, int] = {}
            for c in _load().get("chunks") or []:
                if c["act"] == act:
                    for m in re.findall(r"「([^」]+)」", c["text"]):
                        if m in acts and level(m) == 1:
                            cnt[m] = cnt.get(m, 0) + 1
            base = max(cnt, key=cnt.get) if cnt else ""
    out = {}
    if base in acts:
        out["법"] = base
    if f"{base} 시행령" in acts:
        out["영"] = f"{base} 시행령"
    return out


def _chunk(act: str, art: str, para: str | None) -> dict | None:
    rows = [c for c in _load().get("chunks") or [] if c["act"] == act and c["article"] == art]
    if not rows:
        return None
    return next((c for c in rows if c.get("para") == para), None) if para else rows[0]


def cited_parents(c: dict, depth: int = 2) -> list[dict]:
    """하위 법령 조문이 부르는 모법 조문(법 제n조 · 영 제n조 → 그 영이 부르는 법 제n조)을 위계 높은 순으로. 없으면 []."""
    if depth <= 0 or level(c["act"]) == 1:
        return []
    ups = parents_of(c["act"])
    out, seen = [], set()
    for m in _CITE_UP.finditer(f"{c.get('article_title') or ''} {c.get('text') or ''}"):
        act = ups.get(m.group(1))
        if not act:
            continue
        art = f"제{m.group(2)}조" + (f"의{m.group(3)}" if m.group(3) else "")
        para = P.CIRCLED[int(m.group(4)) - 1] if m.group(4) and 0 < int(m.group(4)) <= 20 else None
        hit = _chunk(act, art, para) or _chunk(act, art, None)
        if not hit or hit["id"] in seen:
            continue
        seen.add(hit["id"])
        if level(hit["act"]) == 1:
            out.append(hit)
        else:                                              # 영 제n조 → 그 조문이 부르는 법 제n조
            up = cited_parents(hit, depth - 1)
            out.extend(x for x in up if x["id"] not in seen)
            seen.update(x["id"] for x in up)
            if not up:
                out.append(hit)
    return sorted(out, key=lambda x: level(x["act"]))


# ── 영어 질문 → 한국어 검색어(로컬 용어 표 · 번역 모델 없음) ─────────────────────────
# (영어 정규식, 한국어) — 긴 말부터. 표에 없는 영어 질문은 한국어 검색어가 없어 '법령 데이터에 없습니다'(지어내기 0).
EN_ACTS = [
    (r"enforcement\s+decree\s+of\s+the\s+farm\s*land\s+act|farm\s*land\s+act\s+enforcement\s+decree", "농지법 시행령"),
    (r"enforcement\s+(?:rules?|regulations?)\s+of\s+the\s+farm\s*land\s+act", "농지법 시행규칙"),
    (r"farm\s*land\s+(?:act|law)|agricultural\s+land\s+act", "농지법"),
    (r"building\s+(?:act|law)|architecture\s+act", "건축법"),
    (r"(?:national\s+)?land\s+planning(?:\s+and\s+utili[sz]ation)?\s+act|planning\s+act", "국토계획법"),
    (r"mountainous\s+districts?\s+management\s+act|mountain(?:ous)?\s+(?:districts?|lands?|areas?)\s+(?:management\s+)?act|forest\s*land\s+act", "산지관리법"),
    (r"(?:farmland\s+)?(?:use\s+)?survey\s+(?:guideline|manual|rules?)", "실태조사 요령"),
]
EN_TERMS = [
    (r"farm\s*land\s+(?:lease|leasing|rental|renting)|(?:lease|leasing|rental|renting)\s+(?:of\s+)?farm\s*land", "농지 임대차"),
    (r"development\s+(?:activity\s+)?permits?|permits?\s+for\s+development", "개발행위허가"),
    (r"(?:farm\s*land|agricultural\s+land)\s+conversion|conver(?:sion|ting)\s+(?:of\s+)?(?:farm\s*land|agricultural\s+land)", "농지 전용"),
    (r"(?:mountain(?:ous)?\s+(?:district|land|area)|forest\s*land)\s+conversion|conver(?:sion|ting)\s+(?:of\s+)?(?:mountain(?:ous)?\s+(?:districts?|lands?|areas?)|forest\s*land)", "산지전용"),
    (r"temporary\s+use\s+of\s+(?:mountain(?:ous)?\s+(?:districts?|lands?)|forest\s*land)", "산지일시사용"),
    (r"building\s+permits?|construction\s+permits?", "건축허가"),
    (r"change\s+(?:of|in)\s+(?:the\s+)?use|use\s+change", "용도변경"),
    (r"agricultural\s+promotion\s+(?:areas?|zones?|districts?)", "농업진흥구역"),
    (r"(?:farm\s*land\s+)?acquisition\s+(?:qualification\s+)?certificates?", "농지취득자격증명"),
    (r"zoning|use\s+(?:districts?|zones?|areas?)", "용도지역"),
    (r"(?:obligation|duty)\s+to\s+dispose|disposal\s+(?:obligation|duty|order)", "처분의무"),
    (r"restor(?:e|ation|ing)|reinstat(?:e|ement)", "원상회복"),
    (r"survey\s+methods?|how\s+to\s+survey", "조사 방법"),
    (r"lease|leasing|rent(?:al|ing)?", "임대차"),
    (r"dispos(?:e|al|ing)", "처분"),
    (r"conver(?:sion|t|ting)", "전용"),
    (r"reports?|reporting|notif(?:y|ication)", "신고"),
    (r"criteria|standards?|requirements?", "기준"),
    (r"permits?|permission|licen[cs]es?|approval", "허가"),
    (r"unauthori[sz]ed|illegal|without\s+(?:a\s+)?permit", "무허가"),
    (r"buildings?|structures?", "건축물"),
    (r"farm\s*land|agricultural\s+land", "농지"),
]


EN_STOP = set("""which what whats where when who whom whose how why does did do is are was were be been the a an of for to in on at by from with
about under into this that these those article articles section sections clause clauses provision provisions law laws act acts statute statutes
legal basis cover covers covered covering govern governs governed governing regulate regulates regulated regulation apply applies
applicable relevant related relating relate tell show find give please can could would should may might must need needed
korean korea korean's rule there any case cases required require requires requirement its it their them they you your our we me my
and or not no yes also other such than then""".split())


def ko_query(q: str) -> str | None:
    """영어 법령 질문 → 한국어 검색어(법령 이름 + 용어 · 질문 순서). 한글이 있으면 그대로, 용어가 하나도 없으면 None."""
    t = (q or "").strip()
    if re.search(r"[가-힣]", t):
        return t
    low = " " + t.lower() + " "
    acts, terms = [], []
    for rx, ko in EN_ACTS:
        m = re.search(rx, low)
        if m:
            acts.append(ko)
            low = low[:m.start()] + " " * (m.end() - m.start()) + low[m.end():]
    found = []
    for rx, ko in EN_TERMS:
        for m in re.finditer(r"\b(?:" + rx + r")\b", low):
            found.append((m.start(), ko))
            low = low[:m.start()] + " " * (m.end() - m.start()) + low[m.end():]
    for _, ko in sorted(found):
        if ko not in terms:
            terms.append(ko)
    left = [w for w in re.findall(r"[a-z]+", low) if w not in EN_STOP and len(w) > 2]
    if not terms or left:                                  # 표에 없는 영어 말이 남았다(river · occupancy …) → 모르는 주제 = '없음'(흔한 말 '허가'만으로 엉뚱한 조문 금지)
        return None
    return " ".join(list(dict.fromkeys(acts)) + terms + ["조문"])


def own_text(c: dict) -> str:
    """조문 제목 + 본문에서 다른 법 인용을 뺀 글(비교용 · 띄어쓰기·조사 '의' 없음) — 대상 말 검사용.
    다른 법을 인용한 호·목 줄(「주차장법」 제19조에 따른 부설주차장의 설치)은 그 법의 주제이므로 줄째 빼고,
    본문 문장 속 인용(「…법」 제n조)은 인용 부분만 뺀다."""
    act = c.get("act")
    keep = []
    for ln in (c.get("text") or "").splitlines():
        other = [m for m in _OTHER_CITE.finditer(ln) if m.group(1).strip() != act]
        if other and _ITEM.match(ln):
            continue
        keep.append(_OTHER_CITE.sub(lambda m: " " if m.group(1).strip() != act else m.group(0), ln))
    return norm_ko(f"{c.get('article_title') or ''} {' '.join(keep)}")


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
    q = plain_query((query or "").strip())               # 풀어 쓴 말 → 조문 말(다른 용도로 쓰려고 → 전용)
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
    qn = _q_norm(q)
    explicit = bool([a for a in want if a] or have)        # 법령 이름을 직접 불렀다 → 그 법령 안에서만(모법 올림 없음)
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
        head = head_match(c, objs, qn)
        side = SIDE.search(title)
        if side and side.group(0) not in q and not head:  # 본 조문(허가·제한)을 특례·취소·벌칙 조문보다 먼저(제목 주제가 질문 말이면 곁가지 아님)
            rank *= 0.6
        tf = max(title_fit(c, qn), 1.0 if head else 0.0)  # 제목이 질문 말로 다 채워지는 조문 = 본 조문('개발행위의 허가' ↔ '개발행위허가 대상')
        rank *= (1 + 4 * tf * tf) * LEVEL_W[level(c["act"])]   # 같은 점수면 법 > 시행령 > 시행규칙 > 지침·요령
        if head:                                          # '처분명령과 매수 청구'(주제 = 처분명령)를 '처분명령의 유예'(주제 = 유예)보다 먼저
            rank *= 1.6
        hits.append({**c, "ref": ref_of(c), "score": round(float(scores[i]), 3), "cover": round(cover, 2), "tfit": round(tf, 2),
                     "rank": round(rank, 3), "head": head})
        if len(hits) >= max(k * 10, 120):
            break
    hits = [h for h in hits if h["cover"] >= MIN_COVER]
    if objs:                                              # 질문의 대상 말이 조문(다른 법 인용 뺀 글)에 모두 있고, 하나 이상은 조문 제목(주제)에 있어야 관련 조문
        hits = [h for h in hits if all(_has(o, own_text(h)) for o in objs) and any(_has(o, norm_ko(_title(h))) for o in objs)]
    hits.sort(key=lambda h: (h["rank"], -level(h["act"])), reverse=True)
    if not hits:
        return {"found": False, "hits": [], "reason": "off_topic" if objs else "low_match"}
    hits = _parent_first(hits, core, explicit)
    hits = _first_para(hits)
    return {"found": True, "hits": hits[:k], "reason": "bm25"}


def _first_para(hits: list[dict]) -> list[dict]:
    """1순위 조문은 제1항(본문)부터 — 맞은 항이 ②·⑤ 여도 그 조의 ① 을 앞에 둔다(맞은 항은 바로 뒤)."""
    top = hits[0]
    if top.get("para") in (None, "①"):
        return hits
    one = _chunk(top["act"], top["article"], "①")
    if not one:
        return hits
    rest = [h for h in hits if h.get("id") != one["id"]]
    return [{**one, "ref": ref_of(one), "score": None, "cover": None, "rank": None, "match": "first_para"}] + rest


def _parent_first(hits: list[dict], core: set[str], explicit: bool) -> list[dict]:
    """1순위가 하위 법령(시행령·시행규칙·요령)이면 모법 본 조문을 찾는다.
    ① 1순위 조문이 부르는 모법 조문(법 제n조 · 영 제n조 → 법 제n조) 가운데 제목이 질문 말과 가장 많이 겹치는 것
    ② 없으면 후보 가운데 모법(법률) 조문으로 제목이 질문 말과 겹치고 제목 맞음이 1순위의 0.8 배 이상인 것
    → 모법 조문을 1순위로 올리고 하위 조문은 '함께 볼 조문'으로. 모법 조문은 있지만 질문 말과 겹치지 않으면 '함께 볼 조문' 2순위에 넣는다.
    법령 이름을 직접 부른 질문('실태조사 요령에서 ~')은 그 법령 답을 그대로 둔다."""
    top = hits[0]
    if explicit or level(top["act"]) == 1:
        return hits
    same = lambda a, b: a["act"] == b["act"] and a["article"] == b["article"]      # noqa: E731
    mk = lambda c, why: {**c, "ref": ref_of(c), "score": None, "cover": None, "rank": None, "match": why}   # noqa: E731
    over = lambda c: len(_bigrams(_title_n(c)) & core)                              # noqa: E731
    ups = cited_parents(top)
    up = max(ups, key=over) if ups else None
    if up is not None and over(up):
        return [mk(up, "parent")] + [h for h in hits if not same(h, up)]
    law = parents_of(top["act"]).get("법")
    tf0 = top.get("tfit") or 0.0
    alt = next((h for h in hits[1:] if h["act"] == law and h.get("head")), None)          # 제목 주제가 질문 말인 모법 조문(처분명령과 매수 청구)
    if alt is None:
        alt = next((h for h in hits[1:] if h["act"] == law and over(h) and (h.get("tfit") or 0.0) >= 0.8 * tf0), None)
    if alt is not None:
        return [alt] + [h for h in hits if h is not alt]
    if up is not None:
        return [top, mk(up, "parent_see_also")] + [h for h in hits[1:] if not same(h, up)]
    return hits
