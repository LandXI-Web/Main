"""법령 RAG — 원문 파싱(조·항·시행일) · bm25 색인 · 검색 · 없는 법령 '법령 데이터에 없습니다' · law_search 도구 · 보고서 법령 근거 칸.

    cd server && python -m pytest agent/rag/tests -q

픽스처 = 국가법령정보센터 공개 원문 그대로(농지법 XML · 농업경영에 이용하지 않는 농지 등의 처분관련 업무처리요령 XML). 지어낸 조문 0.
색인은 임시 폴더에 만든다(운영 색인 LX_DATA_ROOT/law 는 건드리지 않는다).
"""
import asyncio
import sys
from pathlib import Path
from types import SimpleNamespace

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))      # server/
from agent.rag import index as L  # noqa: E402
from agent.rag import parse as P  # noqa: E402

FIX = Path(__file__).resolve().parent / "fixtures"
NONGJI = FIX / "농지법.xml"
YORYEONG = FIX / "농지처분_업무처리요령.xml"


@pytest.fixture()
def law_root(tmp_path, monkeypatch):
    d = tmp_path / "law"
    (d / "raw").mkdir(parents=True)
    monkeypatch.setattr(L, "root", lambda: d)
    L._MEM.clear()
    yield d
    L._MEM.clear()


@pytest.fixture()
def built(law_root):
    for f in (NONGJI, YORYEONG):
        assert L.add_file(f.name, f.read_bytes())["ok"]
    return L.rebuild()


def test_parse_law_xml_article_paragraph_effective():
    meta, ch = P.parse_file(NONGJI.name, NONGJI.read_bytes())
    assert meta["act"] == "농지법" and meta["effective"] and len(meta["effective"]) == 10
    c = next(x for x in ch if x["article"] == "제34조" and x["para"] == "①")
    assert c["article_title"] == "농지의 전용허가ㆍ협의"
    assert c["text"].startswith("①농지를 전용하려는 자는")           # 원문 그대로
    assert c["effective"] == meta["effective"] or len(c["effective"]) == 10
    assert len({x["id"] for x in ch}) == len(ch)                      # 조·항 id 겹침 0
    assert not [x for x in ch if "제1장" in x["text"][:6]]            # 장 제목 줄은 조각이 아니다


def test_parse_admrul_sections():
    meta, ch = P.parse_file(YORYEONG.name, YORYEONG.read_bytes())
    assert meta["act"].endswith("업무처리요령") and meta["kind"] == "예규"
    arts = [x["article"] for x in ch]
    assert "Ⅱ-1" in arts and "Ⅱ-3" in arts and len(arts) == len(set(arts))
    assert not [x for x in ch if "재검토기한" in x["text"]]          # 부칙은 조각이 아니다


def test_parse_text_format():
    txt = "농지법\n[시행 2026. 9. 18.]\n제34조(농지의 전용허가ㆍ협의) ①농지를 전용하려는 자는 허가를 받아야 한다.\n② 협의를 하여야 한다.\n제35조(농지전용신고) 신고하여야 한다."
    meta, ch = P.parse_file("n.txt", txt.encode("utf-8"))
    assert meta["act"] == "농지법" and meta["effective"] == "2026-09-18"
    assert [(x["article"], x["para"]) for x in ch] == [("제34조", "①"), ("제34조", "②"), ("제35조", None)]


def test_bad_file_rejected(law_root):
    r = L.add_file("x.txt", "아무 글".encode("utf-8"))
    assert r["ok"] is False and r["reason"]
    assert not list((law_root / "raw").iterdir())


def test_index_status(built):
    st = built
    assert st["n_acts"] == 2 and st["n_articles"] > 80 and st["n_chunks"] > 200
    assert st["built_at"] and st["pending"] == 0
    assert {a["act"] for a in st["acts"]} == {"농지법", "농업경영에 이용하지 않는 농지 등의 처분관련 업무처리요령"}


def test_search_cites_article_paragraph_effective(built):
    r = L.search("농지법상 농지 전용 허가 근거 조문은?")
    assert r["found"]
    h = r["hits"][0]
    assert h["ref"]["law"] == "농지법" and h["ref"]["article"] == "제34조" and h["ref"]["para"] == "제1항"
    assert h["ref"]["effective"] and "시행" in h["ref"]["label"]


def test_search_exact_article(built):
    r = L.search("농지법 제10조")
    assert r["found"] and r["reason"] == "exact" and all(h["article"] == "제10조" for h in r["hits"])


def test_search_alias_guideline(built):
    r = L.search("실태조사 요령에서 조사 방법은?")
    assert r["found"] and r["hits"][0]["act"].endswith("업무처리요령")


def test_search_unindexed_act_is_not_found(built):
    for q in ("도로법 도로 점용허가 조문은?", "하천법 점용허가 근거 조문", "건축법상 무허가 건축물 근거 조문은?"):
        r = L.search(q)
        assert r["found"] is False and r["reason"] == "act_not_indexed", q


def test_search_empty_index(law_root):
    assert L.search("농지 전용")["found"] is False


def _ctx():
    return SimpleNamespace(principal=SimpleNamespace(realm="tenant", role="manager", tenant_id="namwon"), lang="ko", state={}, context={})


def test_law_search_tool_quotes_original(built):
    from agent.tools.ext import law as X
    out = asyncio.run(X.law_search({"query": "농지 전용 허가 근거 조문은?"}, _ctx()))
    assert "「농지법」 제34조" in out.answer and "시행" in out.answer
    assert "농지를 전용하려는 자는" in out.answer                        # 원문 그대로 인용
    assert out.citations and out.citations[0]["law_ref"]["조"] == "제34조"
    miss = asyncio.run(X.law_search({"query": "도로법 점용허가 조문은?"}, _ctx()))
    assert miss.answer.startswith("법령 데이터에 없습니다") and not miss.citations


def test_law_route():
    from agent.tools.ext import law as X
    ctx = _ctx()
    for q in ("건축법상 무허가 건축물 근거 조문은?", "농지법 제34조 알려 줘", "실태조사 요령에서 조사 시기는?", "산지관리법상 산지전용 허가는?"):
        assert X.ROUTE(q, ctx) == {"tool": "law_search", "args": {"query": q}}, q
    for q in ("분석 방법은?", "운봉읍 보고서 초안 써 줘", "의심 필지 몇 건?", "지도 확대해 줘"):
        assert X.ROUTE(q, ctx) is None, q


def test_report_route():
    from agent.tools.ext import report as X
    ctx = _ctx()
    assert X.ROUTE("여수시 보고서 초안 써 줘", ctx)["tool"] == "report_draft"
    assert X.ROUTE("운봉읍 무허가 건축 보고서 초안", ctx)["args"]["rule"] == "R1"
    assert X.ROUTE("보고서 법령 근거 조문은?", ctx) is None
    assert X.ROUTE("의심 필지 몇 건?", ctx) is None


def test_report_law_basis_from_index(built):
    from survey import report as R
    rows = R.law_basis(["R1", "R2", "R6"])
    by = {x["label"].split(" · ")[0]: x for x in rows}
    n34 = next(x for x in rows if x["law"] == "농지법" and x["article"] == "제34조")
    assert n34["status"] == "조문 인용" and n34["text"].startswith("①농지를 전용하려는 자는")
    assert any(x["status"] == "법령 데이터에 없습니다" and "도로법" in x["label"] for x in rows)     # 색인에 없는 법은 지어내지 않는다
    assert any(x["law"].endswith("업무처리요령") and x["status"] == "조문 인용" for x in rows)
    assert by


# ── 실증 1차 must_fix 회귀: 법령 이름 없이 묻는 색인 밖 주제 → '법령 데이터에 없습니다'(엉뚱한 '관련 조문' 0) ──
OFF_INDEX = ("하천 점용허가 받아야 하는 조문 알려 줘", "도로를 점용하려면 허가를 받아야 하는 근거 조문은?")


def test_search_off_index_topic_without_act_name(built):
    for q in OFF_INDEX:
        r = L.search(q)
        assert r["found"] is False and not r["hits"], q
        assert r["reason"] == "act_not_indexed", q
    assert L.search(OFF_INDEX[0])["missing"] == ["하천법"]
    assert L.search(OFF_INDEX[1])["missing"] == ["도로법"]


def test_law_search_tool_off_index_topic_answers_not_in_data(built):
    from agent.tools.ext import law as X
    for q in OFF_INDEX:
        assert X.ROUTE(q, _ctx())["tool"] == "law_search", q
        out = asyncio.run(X.law_search({"query": q}, _ctx()))
        assert out.answer.startswith("법령 데이터에 없습니다") and not out.citations, q


def test_topic_acts_map_and_exclusions():
    assert L.topic_acts("하천구역에서 건축하려면 허가 필요한 조문?") == ["하천법"]
    assert L.topic_acts("소하천 점용 허가 조문") == ["소하천정비법"]
    assert L.topic_acts("공유수면 점용허가 근거 조문은?") == ["공유수면 관리 및 매립에 관한 법률"]
    assert L.topic_acts("농지 지목 변경 제한 조문") == []                 # 농지 질문은 색인된 농지법이 받는다
    assert L.topic_acts("농지 전용 허가 근거 조문은?") == []
    assert L.topic_acts("건축물이 접한 도로 요건 조문은?") == []          # 도로 '점용'이 아니면 도로법으로 보내지 않는다


def test_object_word_must_be_in_cited_article(built):
    # '허가' 같은 흔한 말만 겹친 조문은 '관련 조문'이 아니다 — 대상 말(폐기물 등)이 조문에 없으면 없음
    r = L.search("농지에 폐기물을 쌓으면 어떤 조문 위반?")
    assert all("폐기물" in (h.get("article_title") or "") + h["text"] for h in r["hits"])
    r = L.search("농지를 무단 전용하면 원상회복을 명할 수 있는 조문은?")    # 색인 안 주제는 그대로 찾는다
    assert r["found"] and r["hits"][0]["article"] == "제42조"
    r = L.search("농지 지목 변경 제한 조문은?")
    assert r["found"] and r["hits"][0]["article"] == "제41조"


# ── 실증 2차 must_fix 회귀: 주제어 사전·대상 말 목록에 없는 색인 밖 주제도 '법령 데이터에 없습니다' ──
# 대상 말은 고정 목록이 아니라 질문의 핵심 명사에서 뽑고(key_nouns), 조문 제목·본문에서 다른 법 인용(「주차장법」 제19조 …)을 뺀 글로 검사한다.
GEONCHUK = FIX / "건축법.xml"          # 국가법령정보센터 공개 원문(시행 2026-02-27) 그대로
OFF_INDEX_2 = (
    "공장 설립 승인 받아야 하는 근거 조문은?",          # 실증 2차 재현(농지법 제40조가 나왔다)
    "주차장 설치 의무 근거 조문 알려 줘",               # 실증 2차 재현(건축법 제74조 — 본문의 「주차장법」 인용으로 통과했다)
    "옥외광고물 표시 허가 근거 조문은?",
    "소음 배출시설 신고 근거 조문은?",
    "대기오염물질 배출시설 설치 허가 조문 알려 줘",
    "유흥주점 영업 허가 근거 조문은?",
)
IN_INDEX_2 = (
    ("농지를 임대할 수 있는 경우 조문은?", "농지법", "제23조"),
    ("농지 전용 허가 근거 조문은?", "농지법", "제34조"),
    ("농지를 무단 전용하면 원상회복을 명할 수 있는 조문은?", "농지법", "제42조"),
    ("건축물 용도변경 조문은?", "건축법", "제19조"),
    ("건축허가 받아야 하는 조문은?", "건축법", "제11조"),
    ("건축법상 무허가 건축물 근거 조문은?", "건축법", "제79조"),
)


@pytest.fixture()
def built3(law_root):
    for f in (NONGJI, YORYEONG, GEONCHUK):
        assert L.add_file(f.name, f.read_bytes())["ok"]
    return L.rebuild()


def test_off_index_topics_outside_dictionary_are_not_found(built3):
    for q in OFF_INDEX_2:
        assert L.topic_acts(q) == [], q                   # 주제어 사전에 없는 주제 — 사전이 아니라 대상 말 검사가 막아야 한다
        r = L.search(q)
        assert r["found"] is False and not r["hits"], (q, [h["ref"]["label"] for h in r["hits"]])


def test_law_search_tool_off_index_topics_answer_not_in_data(built3):
    from agent.tools.ext import law as X
    for q in OFF_INDEX_2:
        assert X.ROUTE(q, _ctx())["tool"] == "law_search", q
        out = asyncio.run(X.law_search({"query": q}, _ctx()))
        assert out.answer.startswith("법령 데이터에 없습니다") and not out.citations, (q, out.answer[:80])


def test_in_index_questions_still_cite_article(built3):
    for q, act, art in IN_INDEX_2:
        r = L.search(q)
        assert r["found"], q
        top = r["hits"][0]
        assert (top["act"], top["article"]) == (act, art), (q, top["ref"]["label"])
        assert top["ref"]["effective"] and top["ref"]["label"].startswith(f"「{act}」 {art}"), q


def test_key_nouns_from_question_not_fixed_list():
    assert L.key_nouns("공장 설립 승인 받아야 하는 근거 조문은?") == ["공장", "설립"]
    assert L.key_nouns("주차장 설치 의무 근거 조문 알려 줘") == ["주차장"]
    assert L.key_nouns("농지를 임대할 수 있는 경우 조문은?") == ["농지", "임대"]
    assert L.key_nouns("하천 점용허가 받아야 하는 조문 알려 줘") == ["하천", "점용허가"]      # '허가'의 '가'는 조사가 아니다
    assert L.key_nouns("허가 없이 건축물 용도를 바꾸면 어떤 조문 위반이야?") == ["건축물", "용도"]  # 서술어(바꾸면) 제외


def test_own_text_drops_other_act_citations(built3):
    c = L.article("건축법", "제74조", 1)
    assert c and "주차장" in c["text"]                  # 원문에는 「주차장법」 인용 줄이 있다
    assert "주차장" not in L.own_text(c)                 # 다른 법 인용 줄을 뺀 글에는 없다
    assert "특별건축구역" in L.own_text(c)


def test_act_mention_ignores_common_words(built):
    assert L.mentioned_acts("농지 불법 전용 처벌 조문은?") == ([], [])
    assert L.mentioned_acts("농지 처분명령 조문은?") == ([], [])
    assert L.mentioned_acts("도로법 점용허가 조문은?")[1] == ["도로법"]
