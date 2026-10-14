"""구현 32 · 융합 대시보드 '보고서로' — 한글 문서(HWPX · OWPML) (10-14 원칙 247).
① 꾸러미 형식: 첫 항목 mimetype(압축 없음 · application/hwp+zip) · 필수 파일 · 모든 XML 이 바르게 읽힘 · 목록(content.hpf)의 그림이 실제로 있음 · PNG
② 머리(header.xml)에 없는 글자/문단/테두리 모양을 본문이 부르지 않음 · 한글 기본 글꼴(함초롬바탕 · 함초롬돋움)
③ 숫자 = 화면 사양 값 그대로(큰 숫자 · 해석 줄 · 순위 · 표) · 그림 수 = 차트 수
④ 문서에 코드 · 경로 · 작업 id · 내부 규칙 이름이 없음
데이터는 지금 데이터베이스(읽기만). 지역은 데이터에서 고른다."""
import asyncio
import io
import re
import zipfile
from xml.etree import ElementTree as ET

import pytest

from agent.tools.ext import dash as D
from landxi_api import xreport as R
from landxi_api.deps import db

LOOP = asyncio.new_event_loop()


def run(co):
    return LOOP.run_until_complete(co)


async def _pick():
    async with db(realm="lx") as c:
        return await c.fetchval(
            "SELECT f.sgg_cd FROM survey_findings f JOIN national_cells n ON n.sgg_cd=f.sgg_cd AND n.state='done' AND NOT n.test "
            "GROUP BY 1 ORDER BY count(*) DESC LIMIT 1")


@pytest.fixture(scope="module")
def specs():
    sgg = run(_pick())
    if not sgg:
        pytest.skip("전국 분석 · 실태조사가 함께 있는 시군구가 없음")
    out = {k: run(D.build({"kind": k, "region": sgg})) for k in ("overview", "survey", "jimok")}
    out["task"] = run(D.build({"kind": "task", "region": sgg, "task": "비닐하우스"}))
    out["sgg"] = sgg
    return out


NEED = ["mimetype", "version.xml", "Contents/header.xml", "Contents/section0.xml", "Contents/content.hpf",
        "META-INF/container.xml", "META-INF/manifest.xml", "META-INF/container.rdf", "settings.xml"]
HP = "{http://www.hancom.co.kr/hwpml/2011/paragraph}"
HH = "{http://www.hancom.co.kr/hwpml/2011/head}"


def _open(blob):
    z = zipfile.ZipFile(io.BytesIO(blob))
    return z, {n: z.read(n) for n in z.namelist()}


def _text(sec_xml: bytes) -> str:
    root = ET.fromstring(sec_xml)
    return "\n".join((t.text or "") for t in root.iter(HP + "t"))


@pytest.mark.parametrize("kind", ["overview", "survey", "jimok", "task"])
def test_package(specs, kind):
    blob, name = R.build_hwpx(specs[kind])
    assert name.endswith(".hwpx") and "/" not in name
    z, f = _open(blob)
    first = z.infolist()[0]
    assert first.filename == "mimetype" and first.compress_type == zipfile.ZIP_STORED and f["mimetype"] == b"application/hwp+zip"
    for n in NEED:
        assert n in f, n
    for n, b in f.items():
        if n.endswith((".xml", ".hpf", ".rdf")):
            ET.fromstring(b)                                       # 바르게 읽힘
    hpf = f["Contents/content.hpf"].decode()
    for href in re.findall(r'href="([^"]+)"', hpf):
        assert href in f, href
    for n in f:
        if n.startswith("BinData/"):
            assert f[n][:8] == b"\x89PNG\r\n\x1a\n", n
            assert f'href="{n}"' in hpf
    # 머리에 있는 모양만 부름
    head = ET.fromstring(f["Contents/header.xml"])
    ids = {k: {e.get("id") for e in head.iter(HH + k)} for k in ("charPr", "paraPr", "borderFill")}
    sec = f["Contents/section0.xml"].decode()
    assert set(re.findall(r'charPrIDRef="(\d+)"', sec)) <= ids["charPr"]
    assert set(re.findall(r'paraPrIDRef="(\d+)"', sec)) <= ids["paraPr"]
    assert set(re.findall(r'borderFillIDRef="(\d+)"', sec)) <= ids["borderFill"]
    faces = {e.get("face") for e in head.iter(HH + "font")}
    assert faces == {"함초롬바탕", "함초롬돋움"}
    # 그림 수 = 그릴 수 있는 차트 수 · 그림 번호가 차례로
    charts = [p for p in specs[kind]["panels"] if p["type"] in R.CHART]
    pics = sec.count("<hp:pic ")
    assert pics == len([n for n in f if n.startswith("BinData/")]) and 1 <= pics <= len(charts)
    txt = _text(f["Contents/section0.xml"])
    for i in range(1, pics + 1):
        assert f"그림 {i}. " in txt


@pytest.mark.parametrize("kind", ["overview", "survey", "jimok", "task"])
def test_numbers_same_as_screen(specs, kind):
    s = specs[kind]
    blob, _ = R.build_hwpx(s)
    _, f = _open(blob)
    txt = _text(f["Contents/section0.xml"])
    assert s["title"] in txt
    for k in s["kpis"][:4]:
        assert f"{R.nf(k['value'], k.get('d') or 0)}{k.get('unit') or ''}" in txt, k
    for line in s.get("say") or []:
        assert line in txt, line
    for p in s["panels"]:
        if p["type"] == "rank":
            for r in p["rows"]:
                assert R.nf(r["v"]) in txt and r["label"] in txt
        if p["type"] == "table":
            for row in p["rows"]:
                assert str(row[0]) in txt


def test_nf_matches_screen():
    """dash.js nf(toLocaleString ko-KR · 소수 최대 d 자리) 와 같은 글자."""
    assert R.nf(272560) == "272,560"
    assert R.nf(2765.94, 1) == "2,765.9"
    assert R.nf(6.0, 1) == "6"
    assert R.nf(None) == "—"
    assert R.nf(0.5) == "1" and R.nf(2.5) == "3" and R.nf(-1234.25, 1) == "-1,234.3"


def test_no_internal(specs):
    bad = re.compile(r"(/api/|\.json|\.py|run_|task_id|[A-Z]:\\|\bB1\b|\bH1\b|\bM1\b|\bR1\b|GPU|ms\b)")
    for kind in ("overview", "survey", "jimok", "task"):
        blob, _ = R.build_hwpx(specs[kind])
        _, f = _open(blob)
        txt = _text(f["Contents/section0.xml"])
        assert not bad.search(txt), (kind, bad.search(txt).group(0))
        assert specs["sgg"] not in txt                              # 시군구 코드 0


def test_bad_spec():
    from fastapi.testclient import TestClient
    from landxi_api.main import app
    c = TestClient(app)
    r = c.post("/api/v1/ximap/report.hwpx", json={"spec": {"title": "x"}})
    assert r.status_code in (401, 403)                               # 로그인 없이는 못 받음
