"""R3 r3-law-report — 법령 본 조문 먼저(M9) · 영어 법령 질문 · 보고서 가드(M10) · 공문은 보고서로 안내(M15 → 원칙 40) · docx 규칙 코드·중복(M16).

    cd server && python -m pytest agent/tests/test_r3_law_report.py -q

법령 색인은 임시 폴더에 국가법령정보센터 공개 원문 7개(픽스처 = 운영 색인에 올린 파일과 같은 원문)로 만든다. 지어낸 조문 0.
보고서·공문 docx 시험은 실제 실태조사 결과(PostGIS)를 읽는다 — DB 가 없으면 그 시험만 건너뛴다.
"""
import asyncio
import re
import sys
from pathlib import Path
from types import SimpleNamespace

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))      # server/
from agent import report as AR  # noqa: E402
from agent.rag import index as L  # noqa: E402
from agent.tools.ext import law as LT  # noqa: E402
from agent.tools.ext import report as RT  # noqa: E402
from landxi_api.deps import CAPS, Principal  # noqa: E402

FIX = Path(__file__).resolve().parents[1] / "rag" / "tests" / "fixtures"
LAWS = ["농지법.xml", "농지법_시행령.xml", "농지법_시행규칙.xml", "건축법.xml", "국토의_계획_및_이용에_관한_법률.xml", "산지관리법.xml",
        "농지처분_업무처리요령.xml"]
GJ = Principal("tenant", "manager", "gwangju-jeonnam", "u_gj", caps=CAPS[("tenant", "manager")])
NW = Principal("tenant", "manager", "namwon", "u_nw", caps=CAPS[("tenant", "manager")])
ADMIN = Principal("lx", "admin", None, "u_lx_admin", caps=CAPS[("lx", "admin")])
KANGJIN, NAMWON = "12780", "52190"


@pytest.fixture(scope="module")
def law7(tmp_path_factory):
    d = tmp_path_factory.mktemp("law")
    (d / "raw").mkdir()
    old = L.root
    L.root = lambda: d
    L._MEM.clear()
    for f in LAWS:
        assert L.add_file(f, (FIX / f).read_bytes())["ok"], f
    st = L.rebuild()
    assert st["n_acts"] == 7
    yield st
    L.root = old
    L._MEM.clear()


def top(q):
    r = L.search(q, None, 3)
    assert r["found"], (q, r["reason"])
    h = r["hits"][0]
    return h["act"], h["article"], r["hits"]


# ── M9 본 조문 먼저 ─────────────────────────────────────────────────────
@pytest.mark.parametrize("q,act,art", [
    ("개발행위허가 대상 조문은?", "국토의 계획 및 이용에 관한 법률", "제56조"),      # 곁가지 제60조(이행 보증) 아님
    ("산지전용허가 기준 조문은?", "산지관리법", "제18조"),                          # 제18조의4(충족 여부 확인) 아님
    ("농지 전용 신고 조문은?", "농지법", "제35조"),                                 # 시행규칙 제31조 아님
    ("농지 처분의무 조문은?", "농지법", "제10조"),                                  # 업무처리요령 아님
])
def test_m9_main_article_first(law7, q, act, art):
    assert top(q)[:2] == (act, art)


@pytest.mark.parametrize("q,act,art", [
    ("건축허가 조문은?", "건축법", "제11조"),
    ("농업진흥지역 지정 조문은?", "농지법", "제28조"),
    ("용도지역 지정 조문은?", "국토의 계획 및 이용에 관한 법률", "제36조"),
    ("농지취득자격증명 조문은?", "농지법", "제8조"),
    ("산지전용 신고 조문은?", "산지관리법", "제15조"),
    ("농지 전용 허가 조문은?", "농지법", "제34조"),                                # 시행규칙 제29조(농지전용허가) 아님
    ("농지를 임대할 수 있는 경우 조문은?", "농지법", "제23조"),                    # 회귀(2차 실증 정답)
    ("농지를 무단 전용하면 원상회복을 명할 수 있는 조문은?", "농지법", "제42조"),
    ("건축물 용도변경 조문은?", "건축법", "제19조"),
])
def test_m9_new_questions_main_article(law7, q, act, art):
    assert top(q)[:2] == (act, art)


# ── M9 실증 1차 must_fix — 풀어 쓴 질문(서술어 섞임) · 처분명령 본 조문 ──────────────────
@pytest.mark.parametrize("q,act,art", [
    ("개발행위허가를 내줄 때 보는 기준 조문은?", "국토의 계획 및 이용에 관한 법률", "제58조"),   # 1차: '법령 데이터에 없습니다'
    ("산지전용허가를 내줄 때 따르는 기준 조문은?", "산지관리법", "제18조"),
    ("농지 전용 신고를 받을 때 보는 조문은?", "농지법", "제35조"),
    ("건축허가를 받을 때 따르는 조문은?", "건축법", "제11조"),
    ("처분명령을 내릴 때 보는 조문은?", "농지법", "제11조"),
])
def test_m9_paraphrased_question_finds_main_article(law7, q, act, art):
    assert top(q)[:2] == (act, art)


@pytest.mark.parametrize("q", ["개발행위허가를 내줄 때 보는 기준 조문은?", "산지전용허가를 내줄 때 따르는 기준 조문은?"])
def test_m9_predicates_are_not_key_nouns(q):
    ns = L.key_nouns(q)
    assert not {"내줄", "보는", "따르", "따르는"} & set(ns), ns


def test_adnominal_forms():
    for w in ["내줄", "내준", "보는", "볼", "받을", "받는", "따른", "따르는", "할", "되는"]:
        assert L.is_adnominal(w), w
    for w in ["기준", "처분", "허가", "농지", "신고", "보전", "주택"]:
        assert not L.is_adnominal(w), w


@pytest.mark.parametrize("q", ["농지 처분명령 조문은?", "농지법 처분명령 조문은?", "처분명령 조문은?"])
def test_m9_disposal_order_main_article_11(law7, q):
    """1차: 요령 Ⅳ.1 또는 제12조(처분명령의 유예)가 1순위 → 본 조문 제11조(처분명령과 매수 청구)가 1순위."""
    assert top(q)[:2] == ("농지법", "제11조")


def test_m9_disposal_order_deferral_still_12(law7):
    """'유예'를 물으면 제12조(처분명령의 유예)."""
    assert top("농지 처분명령 유예 조문은?")[:2] == ("농지법", "제12조")


def test_title_heads():
    assert L.title_heads({"article_title": "처분명령과 매수 청구"}) == {"처분명령", "매수청구"}
    assert L.title_heads({"article_title": "처분명령의 유예"}) == set()
    assert L.title_heads({"article_title": "용도지역 및 용도지구에서의 건축물의 건축 제한 등"}) == set()


def test_law_tool_disposal_order_answer_has_article_11(law7):
    out = asyncio.run(LT.law_search({"query": "농지 처분명령 조문은?"}, SimpleNamespace(lang="ko")))
    first = out.data["조문"][0]["조문"]
    assert first.startswith("「농지법」 제11조"), first


def test_m9_first_paragraph_first(law7):
    """1순위 조문은 제1항부터(맞은 항이 ② 여도)."""
    _, _, hits = top("건축 신고 조문은?")
    assert hits[0]["act"] == "건축법" and hits[0]["article"] == "제14조" and hits[0]["para"] == "①"


def test_m9_subordinate_top_brings_parent(law7):
    """시행령이 1순위가 될 질문 → 모법 본 조문이 1순위, 시행령은 함께 볼 조문."""
    _, _, hits = top("농업진흥구역에서 할 수 있는 행위 조문은?")
    assert (hits[0]["act"], hits[0]["article"]) == ("농지법", "제32조")
    assert any(h["act"] == "농지법 시행령" and h["article"] == "제29조" for h in hits[1:])


def test_m9_explicit_act_is_kept(law7):
    """법령 이름을 직접 부르면 그 법령 답 그대로(모법 올림 없음)."""
    act, art, _ = top("실태조사 요령에서 조사 방법은?")
    assert act.endswith("업무처리요령") and art == "Ⅱ-3"


@pytest.mark.parametrize("q", ["개발제한구역 건축 허가 조문은?", "묘지 설치 허가 조문은?", "문화재 현상변경 허가 조문은?",
                               "폐기물 처리업 허가 조문은?", "공장 설립 승인 받아야 하는 근거 조문은?", "주차장 설치 의무 근거 조문 알려 줘"])
def test_m9_off_index_still_not_found(law7, q):
    assert L.search(q, None, 3)["found"] is False


def test_norm_and_level():
    assert L.norm_ko("개발행위의 허가") == L.norm_ko("개발행위허가") == "개발행위허가"
    assert L.norm_ko("농지전용 신고") == "농지전용신고"
    assert [L.level(a) for a in ("농지법", "농지법 시행령", "농지법 시행규칙", "농업경영에 이용하지 않는 농지 등의 처분관련 업무처리요령")] == [1, 2, 3, 4]


def test_law_tool_answer_parent_and_see_also(law7):
    out = asyncio.run(LT.law_search({"query": "농지 처분의무 조문은?"}, SimpleNamespace(lang="ko")))
    first = out.answer.split("\n\n")[1]
    assert first.startswith("「농지법」 제10조(농업경영에 이용하지 아니하는 농지 등의 처분) 제1항")
    assert "함께 볼 조문:" in out.answer and "법령 데이터에 없습니다" not in out.answer



# ── M9 실증 2차 must_fix — 풀어 쓴 질문의 다른 꼴(명사형 · 때 말 · 관형사 · 조사 · 연결형) · 임대차 본 조문 ─────
@pytest.mark.parametrize("q,act,art", [
    ("건축물을 짓기 전에 받는 건축허가 조문은?", "건축법", "제11조"),              # 2차: 두 계정 모두 '법령 데이터에 없습니다'
    ("건축물 짓기 전에 받는 허가 조문은?", "건축법", "제11조"),
    ("집을 짓기 전에 받아야 하는 허가 조문은?", "건축법", "제11조"),
    ("농지를 다른 용도로 쓰려고 받는 허가 조문은?", "농지법", "제34조"),           # 2차: '없습니다'
    ("농지를 다른 용도로 사용하려면 받아야 하는 허가 조문은?", "농지법", "제34조"),
    ("농지를 빌려주는 임대차 조문은?", "농지법", "제23조"),                        # 2차: '없습니다'
    ("농지를 남에게 빌려주려면 보는 조문은?", "농지법", "제23조"),
    ("산을 깎아 다른 용도로 쓰려고 받는 허가 조문은?", "산지관리법", "제14조"),
    ("건물 용도를 바꾸려면 보는 조문은?", "건축법", "제19조"),
    ("농사를 짓지 않는 농지를 처분해야 하는 조문은?", "농지법", "제10조"),
    ("농지를 사기 전에 받는 증명 조문은?", "농지법", "제8조"),
])
def test_m9_paraphrase_forms_find_main_article(law7, q, act, art):
    assert top(q)[:2] == (act, art)


@pytest.mark.parametrize("q,bad", [
    ("건축물을 짓기 전에 받는 건축허가 조문은?", {"짓기", "전에"}),
    ("농지를 다른 용도로 쓰려고 받는 허가 조문은?", {"다른", "용도로", "쓰려고"}),
    ("농지를 빌려주는 임대차 조문은?", {"빌려주", "빌려주는"}),
])
def test_m9_non_topic_words_are_not_key_nouns(q, bad):
    ns = L.key_nouns(q)
    assert not bad & set(ns), ns


@pytest.mark.parametrize("q", ["농지 임대차 조문은?", "농지 임대 조문은?", "농지 사용대차 조문은?"])
def test_m9_lease_main_article_23_not_24_2(law7, q):
    """2차: '농지 임대차 조문은?' 1순위가 곁가지 제24조의2(임대차 기간) → 본 조문 제23조(농지의 임대차 또는 사용대차)."""
    assert top(q)[:2] == ("농지법", "제23조")


def test_m9_lease_period_still_24_2(law7):
    """'기간'을 물으면 제24조의2(임대차 기간)."""
    assert top("농지 임대차 기간 조문은?")[:2] == ("농지법", "제24조의2")


def test_title_heads_lead_modifier():
    assert L.title_heads({"article_title": "농지의 임대차 또는 사용대차"}) == {"임대차", "사용대차", "농지임대차", "농지사용대차"}
    assert L.title_heads({"article_title": "임대차 기간"}) == set()


def test_law_tool_lease_answer_ko_matches_en(law7):
    """한국어 '농지 임대차 조문은?'과 영어 farmland lease 가 같은 조문(제23조)을 인용한다."""
    ko = asyncio.run(LT.law_search({"query": "농지 임대차 조문은?"}, SimpleNamespace(lang="ko")))
    assert ko.data["조문"][0]["조문"].startswith("「농지법」 제23조"), ko.data["조문"][0]
    assert "법령 데이터에 없습니다" not in ko.answer

# ── 영어 법령 질문 ───────────────────────────────────────────────────────
def test_en_query_glossary():
    assert L.ko_query("Which article of the Farmland Act covers farmland lease?") == "농지법 농지 임대차 조문"
    assert L.ko_query("What is the legal basis for a development permit?") == "개발행위허가 조문"
    assert L.ko_query("Which law article covers river occupancy permits?") is None          # 표에 없는 말(river) → 없음
    assert L.ko_query("농지 임대 조문") == "농지 임대 조문"                                   # 한국어는 그대로


def test_en_farmland_lease_cites_article_23(law7):
    q = "Which article of the Farmland Act covers farmland lease?"
    assert LT.ROUTE(q, None) == {"tool": "law_search", "args": {"query": q}}
    out = asyncio.run(LT.law_search({"query": q}, SimpleNamespace(lang="en")))
    assert out.answer.startswith("The provision on this is Article 23 of the Farmland Act")
    assert "「농지법」 제23조(농지의 임대차 또는 사용대차) 제1항" in out.answer                  # 원문(한국어) 인용
    assert out.citations[0]["law_ref"]["조"] == "제23조"
    assert "Not in the law data" not in out.answer


def test_en_unknown_topic_not_found(law7):
    out = asyncio.run(LT.law_search({"query": "Which law article covers river occupancy permits?"}, SimpleNamespace(lang="en")))
    assert out.answer == "Not in the law data." and not out.citations


# ── M10 보고서 가드 ──────────────────────────────────────────────────────
def _ctx(p, lang="ko"):
    return SimpleNamespace(principal=p, context={}, lang=lang, state={}, run_id="pytest-r3-law-report")


@pytest.fixture()
def visible(monkeypatch):
    """실태조사 결과가 있는 시군구 = 광주전남 강진·여수 · 전북 남원(관할 안 해남·나주·담양·순창은 결과 없음)."""
    rows = {"gwangju-jeonnam": [{"sgg_cd": KANGJIN, "name": "강진군"}, {"sgg_cd": "12130", "name": "여수시"}],
            "namwon": [{"sgg_cd": NAMWON, "name": "남원시"}]}

    async def fake(ctx):
        p = ctx.principal
        sg = rows.get(p.tenant_id) if p.realm == "tenant" else [x for v in rows.values() for x in v]
        return list(sg or []), []
    monkeypatch.setattr(AR, "_visible", fake)


@pytest.mark.parametrize("name", ["해남군", "나주시", "담양군"])
def test_m10_in_jurisdiction_no_result_is_no_data(visible, name):
    out = asyncio.run(RT.report_draft({"request": f"{name} 보고서 초안 써 줘", "kind": "report"}, _ctx(GJ)))
    assert out.data == {"status": "no_data", "text": "해당 지역 데이터가 없습니다", "next": f"XI맵에서 {name} AI 분석을 먼저 실행하세요"}
    assert out.answer == f"해당 지역 데이터가 없습니다. XI맵에서 {name} AI 분석을 먼저 실행하세요."
    assert "아닙니다" not in out.answer and not out.blocks


def test_m10_jeonbuk_no_result_for_lx(visible):
    """전북 결과 없는 시군구(순창) — 전국 관할 LX 계정에서도 no_data + 다음 할 일."""
    out = asyncio.run(RT.report_draft({"request": "순창군 보고서 초안 써 줘"}, _ctx(ADMIN)))
    assert out.data["status"] == "no_data" and "순창군" in out.data["next"]


@pytest.mark.parametrize("name", ["전주시", "여수시"])
def test_m10_outside_jurisdiction(visible, name):
    out = asyncio.run(RT.report_draft({"request": f"{name} 보고서 초안 써 줘"}, _ctx(NW)))
    assert out.data == {"status": "outside", "text": "이 기관의 데이터가 아닙니다"}
    assert out.answer == "이 기관의 데이터가 아닙니다."


def test_m10_letter_guard_same(visible):
    out = asyncio.run(RT.report_draft({"request": "해남군 현장 조사 공문 초안 써 줘"}, _ctx(GJ)))
    assert out.data["status"] == "no_data" and out.data["next"] == "XI맵에서 해남군 AI 분석을 먼저 실행하세요"


def test_m10_english_guard(visible):
    out = asyncio.run(RT.report_draft({"request": "Draft a report for 해남군"}, _ctx(GJ, "en")))
    assert out.data["status"] == "no_data" and out.answer.startswith("No data for this area yet.")


# ── M15 공문 → 보고서로 안내(원칙 40 · 확인 대장 FR-15 반려 — 공문 서식 · 공문 경로 없음) ─────────────
@pytest.mark.parametrize("msg,letter", [("강진군 현장 조사 공문 초안 써 줘", True), ("남원시 현장조사 협조 요청 공문 작성해 줘", True),
                                        ("구례군 시행문 초안 만들어 줘", True), ("강진군 보고서 초안 써 줘", False)])
def test_m15_route_letter_goes_to_report(msg, letter):
    r = RT.ROUTE(msg, None)
    assert r and r["tool"] == "report_draft" and "kind" not in r["args"]          # 보고서 도구 하나 · 공문 종류 인자 없음
    assert RT.asked_letter(msg) is letter
    assert "kind" not in RT.SPECS["report_draft"]["properties"]


def test_m15_no_letter_format():
    from survey import report as S
    assert not any(hasattr(S, x) for x in ("render_letter", "collect_letter", "letter_json", "letter_filename"))
    assert not hasattr(AR, "compose_letter")


def test_m15_law_route_skips_letter():
    assert LT.ROUTE("강진군 현장 조사 공문 초안 써 줘", None) is None


# ── M16 사용자 말(규칙 코드 0) · 지역 이름 겹침 ─────────────────────────────
def test_plain_rules_and_dev_words():
    from survey.report import dev_words, plain_rules
    assert plain_rules("R1 무허가 건축 의심 12건") == "무허가 건축 의심 12건"
    assert plain_rules("강진군 R4 건수") == "강진군 농지 전용 의심(주차장) 건수"
    assert plain_rules("규칙 R1–R6") == "규칙 전체 규칙"
    assert "R1" in dev_words("규칙 R1") and "L1" in dev_words("L1 대장") and not dev_words("PNU 4681025021")


def test_dedupe_place():
    assert AR.dedupe_place("도암면의 도암면 의심 필지는 {{env:e3}}건입니다 [2].") == "도암면 의심 필지는 {{env:e3}}건입니다 [2]."
    assert AR.dedupe_place("강진군 도암면 의심") == "강진군 도암면 의심"


# ── DB 시험(실태조사 결과) — 보고서 docx · 공문 docx (서로 다른 시도 두 곳) ─────────────────
def _db():
    try:
        from survey.report import _conn
        with _conn("lx", "") as c:
            return c.execute("SELECT count(*) n FROM survey_sgg WHERE sgg_cd = ANY(%s) AND state='done'", ([KANGJIN, NAMWON],)).fetchone()["n"] == 2
    except Exception:  # noqa: BLE001
        return False


needs_db = pytest.mark.skipif(not _db(), reason="실태조사 DB 없음")
CODE = re.compile(r"\b[RL]\d\b")


@needs_db
@pytest.mark.parametrize("code,tenant,place", [(KANGJIN, "gwangju-jeonnam", "강진군"), (NAMWON, "namwon", "남원시")])
def test_m16_report_docx_no_codes_no_dupes(code, tenant, place):
    from survey import report as S
    d = S.collect(code, None, 10, "tenant", tenant)
    blob, name = S.render_docx(d)
    text = S.docx_text(blob)
    j = S.as_json(d)
    assert not CODE.findall(text), CODE.findall(text)[:5]                  # 규칙 코드 0
    pn = [x["pnu"] for x in j["top_items"]]
    assert len(pn) == len(set(pn)) == 10                                  # 같은 필지 중복 0
    assert j["citations"][0]["label"] == f"{place} 연속지적 필지 수"        # 인용 [1] = 요청 지역
    assert name.startswith(f"실태조사_초안_{place}_")
    assert not [w for w in S.dev_words(text) if w != "덕과면"]


@needs_db
@pytest.mark.parametrize("code,tenant,place", [(KANGJIN, "gwangju-jeonnam", "강진군"), (NAMWON, "namwon", "남원시")])
def test_m15_letter_request_gets_report_docx(code, tenant, place):
    """공문을 청하면 공문은 만들지 않는다는 한 줄 + 같은 지역 실태조사 보고서 초안(.docx) — 보고서 서식에 배정 · 시정명령 · 공문 0."""
    from survey import report as S
    d = S.collect(code, None, 10, "tenant", tenant)
    blob, name = S.render_docx(d)
    text = S.docx_text(blob)
    assert name.startswith(f"실태조사_초안_{place}_")
    for w in ("배정", "시정명령", "이행강제금", "원상복구", "공문", "협조 요청"):
        assert w not in text, w


@needs_db
def test_m15_letter_answer_points_to_report(visible):
    """말로 공문을 청하면 — '공문은 만들지 않습니다' 한 줄 + 같은 지역 보고서 초안 파일(원칙 40)."""
    out = asyncio.run(RT.report_draft({"request": "강진군 현장 조사 공문 초안 써 줘"}, _ctx(GJ)))
    assert out.answer.startswith("공문은 만들지 않습니다") and "실태조사 보고서 초안" in out.answer
    assert out.blocks and out.blocks[0]["label"].startswith("실태조사_초안_강진군_")
