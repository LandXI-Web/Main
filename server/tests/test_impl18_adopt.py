"""바퀴 5 · 개선 후보 — 시스템이 고칠 방법을 미리 정한다(원칙 197 고침 · 10-11 18:52) + 관리자 배포 '결과 확인'(원칙 198 · 제안 2 · 3).

① 제안 규칙(코드만 · 언어 모델 0): 다른 이름 · 질문 뜻 연결 · 답 문구 · 개발 요청(단동 · 연동 같은 없는 분류 · 없는 기능).
② 목록의 새로 옴 줄마다 suggest(한 줄 · 근거) · '이대로 반영'(use=suggest) = 서버가 정한 그대로 표 한 줄 → 다음 질문부터 → 되돌리기.
   시험 줄(source 'test')은 목록에 보이고, 바로 반영 줄도 시험 줄로 남는다(끝나면 지움).
③ 개발 요청 제안인 줄은 '이대로 반영'이 409 · 개발 요청은 제안 방법 그대로 '확인 대기'.
④ 관리자 배포(GET /deploys?with=health) — 정밀도 '표본 k/100' 대신 결과 확인(지도에서 봤음 · 누가 · 언제) · 다음 행동 '결과 확인'.
실행: python -m pytest server/tests/test_impl18_adopt.py -q   (게이트웨이 :8700 · GPU 0 — 질문은 요약 직행 경로)
"""
import secrets

import httpx
import psycopg
import pytest

from landxi_api import config
from landxi_api import improve as I

from conftest import B, H
from test_impl16_adopt import Q_ALIAS, Q_TARGET, ask

V = {"classes": {"건물", "주차장", "경작지", "비닐하우스", "비닐하우스_단동", "비닐하우스_다동", "비경작지", "곤포사일리지", "차량"},
     "words": {"비닐하우스 분석서비스", "경작·휴경 분석서비스", "곤포사일리지 분석서비스", "건축물 분석서비스", "비닐하우스 단동", "비닐하우스 다동"}}


def _sql(q, args=()):
    with psycopg.connect(config.PG_ADMIN_DSN, autocommit=True) as c:
        cur = c.execute(q, args)
        return cur.fetchone() if cur.description else None


def sg(kind, gist, ex=()):
    return I.suggest({"kind": kind, "gist": gist, "examples": list(ex), "n_sum": 2}, V, [])


def test_rules():
    s = sg("other", "온실 분석서비스는 어디")
    assert s["mode"] == "alias" and (s["src"], s["dst"]) == ("온실", "비닐하우스") and s["quick"]
    assert s["line"] == "'온실'을 '비닐하우스'로 알아듣게 합니다" and "결과 분류에 있음" in s["why"] and "같은 질문 2번" in s["why"]
    s = sg("other", "영농 현황")
    assert s["mode"] == "alias" and s["dst"] == "경작·휴경" and "서비스 이름에 있음" in s["why"]
    s = sg("other", "비닐하우스 동네별 개수 알려")
    assert s["mode"] == "intent" and s["dst"] == "비닐하우스 읍면동별로 세어 줘"
    s = sg("other", "○○ 비닐하우스 읍면동별로 통계 내")          # 도구는 알아듣는 말 — 결과 층이 없던 자리 → 답 문구
    assert s["mode"] == "phrase" and "결과 층을 켠 뒤" in s["text"] and s["try"] is None
    s = sg("scope", "기관이 '전역 분석 실행'을 말함", ["전역 분석 실행"])
    assert s["mode"] == "phrase" and "분석 요청" in s["text"]
    for g in ("비닐하우스 단동만 펼쳐", "비닐하우스 연동 몇 개"):      # 단동 · 연동 = 개발 요청(분류)
        s = sg("nodata", g)
        assert s["mode"] == "dev" and not s["quick"] and s["line"].startswith("개발 요청 — ")
    assert sg("action", "지도를 흑백으로 바꾸기")["mode"] == "dev"        # 없는 기능
    s = sg("action", "분석 결과를 GeoJSON 으로 내려받고 싶어")           # 이미 있는 기능(지도 서비스 층마다 내려받기) → 답 문구
    assert s["mode"] == "phrase" and "내려받기" in s["text"]
    assert sg("server", "아무 질문")["mode"] == "dev"
    assert sg("other", "곤포 몇 개")["mode"] == "dev"                    # '곤포'는 이미 서비스 이름 앞머리 — 바꾸면 겹친다 → 애매하면 개발 요청
    # 이미 켜진 다른 이름은 다시 내지 않는다
    assert I.suggest({"kind": "other", "gist": "온실 분석서비스는 어디", "examples": []}, V, [{"mode": "alias", "src": "온실"}])["mode"] != "alias"


@pytest.fixture()
def items():
    """시험 줄 둘(새로 옴 · source 'test' — 목록에 보이고 시험 표시) — 끝나면 지운다."""
    a, d = "ic_t18" + secrets.token_hex(4), "ic_t18" + secrets.token_hex(4)
    _sql("INSERT INTO improve_items(id, key, kind, gist, note, source) VALUES (%s,%s,'other','온실 분석서비스는 어디','시험 줄(바퀴 5 · 끝나면 지움)','test')",
         (a, "other|t18·" + a))
    _sql("INSERT INTO improve_items(id, key, kind, gist, note, source) VALUES (%s,%s,'nodata','비닐하우스 단동만 펼쳐','시험 줄(바퀴 5 · 끝나면 지움)','test')",
         (d, "nodata|t18·" + d))
    yield a, d
    _sql("DELETE FROM improve_items WHERE id = ANY(%s)", ([a, d],))


def test_apply_suggest_then_revert(tok, items):
    a, d = items
    A, S = H(tok["admin"]), tok["staff"]
    lst = httpx.get(B + "/improve/items", headers=A, timeout=60).json()["items"]
    x = next(i for i in lst if i["id"] == a)
    assert x["state"] == "new" and x["test_item"] and x["suggest"]["mode"] == "alias" and x["can"]["apply"] and x["can"]["dev"] and x["can"]["hold"]
    y = next(i for i in lst if i["id"] == d)
    assert y["suggest"]["mode"] == "dev" and not y["can"]["apply"]
    before, target = ask(S, Q_ALIAS), ask(S, Q_TARGET)
    assert before != target
    r = httpx.post(B + f"/improve/items/{a}/adopt", headers=A, json={"use": "suggest"}, timeout=30)
    assert r.status_code == 200, r.text
    it = r.json()["item"]
    assert it["state"] == "adopted" and it["adopt"]["mode"] == "alias" and it["adopt"]["rule"]["test"]              # 시험 줄 → 시험 표시 줄
    assert it["adopt"]["rule"]["src"] == "온실" and it["adopt"]["rule"]["dst"] == "비닐하우스" and it["can"]["revert"]
    assert ask(S, Q_ALIAS) == target                                                                                 # 다음 질문부터
    r = httpx.post(B + f"/improve/items/{a}/revert", headers=A, timeout=30)
    assert r.status_code == 200 and r.json()["item"]["state"] == "new"
    assert ask(S, Q_ALIAS) == before
    # 개발 요청 제안 줄 — 이대로 반영은 막히고, 개발 요청은 제안 방법 그대로
    r = httpx.post(B + f"/improve/items/{d}/adopt", headers=A, json={"use": "suggest"}, timeout=30)
    assert r.status_code == 409
    r = httpx.post(B + f"/improve/items/{d}/adopt", headers=A, json={"mode": "dev"}, timeout=30)
    it = r.json()["item"]
    assert it["ledger"] == "확인 대기" and "단동" in it["how"] and not it["adopt"]["quick"]


def test_deploy_review_column(tok):
    j = httpx.get(B + "/deploys?with=health", headers=H(tok["admin"]), timeout=60).json()
    hs = [x["health"] for x in j["items"] if x.get("health")]
    assert hs and all("review" in h for h in hs)
    assert all(h["next_action"] in ("retrain", "review", "update_deploy", "none") for h in hs)                     # 표본 검수 없음
    for h in hs:
        if h["review"]:
            assert set(h["review"]) >= {"done", "by", "at"} and (h["review"]["done"] == bool(h["review"]["at"]))
