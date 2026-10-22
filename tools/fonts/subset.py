"""글꼴 나눠 받기(10-22 now21 인프라-글꼴 ⓐ) — 한글 글꼴(Pretendard 400 · 500 · Paperlogy 700 · 800)을 '자주 쓰는 글자' 한 조각 + 나머지 여러 조각으로 나눈다.
브라우저는 화면에 나온 글자가 든 조각만 받는다(unicode-range). 자주 쓰는 글자 = 화면 코드 · 화면 자료(landxi/v3)의 모든 글자 + 행정구역 이름(DB).
나머지 글자는 코드 순서로 약 400자씩 — 주소 · 사람 이름처럼 드문 글자가 나오면 그 조각만 더 받는다.

    python tools/fonts/subset.py            # landxi/assets/fonts/sub/ 에 조각 + fonts.css · tokens 에 넣을 @font-face 를 다시 만든다
화면 글이 크게 바뀌면 다시 돌린다(안 돌려도 글자는 나머지 조각에서 받아 보인다 — 깨지지 않음)."""
from __future__ import annotations

import re
import sys
from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont

REPO = Path(__file__).resolve().parents[2]
SRC = REPO / "landxi" / "assets" / "fonts"
OUT = SRC / "sub"
FONTS = [("Pretendard", 400, "Pretendard-Regular.woff2"), ("Pretendard", 500, "Pretendard-Medium.woff2"),
         ("Paperlogy", 700, "Paperlogy-7Bold.woff2"), ("Paperlogy", 800, "Paperlogy-8ExtraBold.woff2")]
CHUNK = 400
BASIC = set(range(0x20, 0x7F)) | set(range(0xA0, 0x100)) | set(range(0x2000, 0x2070)) | set(range(0x2190, 0x2200)) | \
    set(range(0x2460, 0x2500)) | set(range(0x25A0, 0x2700)) | set(range(0x3000, 0x3040)) | set(range(0x3130, 0x3190)) | \
    {0x20A9, 0x2103, 0x2116, 0x2122, 0x33A1, 0x33A5, 0x33DC, 0xFF5E, 0x00B7, 0x2027}


def used_chars() -> set[int]:
    cs: set[int] = set()
    for p in (REPO / "landxi" / "v3").rglob("*"):
        if p.suffix.lower() in (".js", ".mjs", ".html", ".css", ".json", ".md") and "node_modules" not in p.parts and p.stat().st_size < 30_000_000:
            try:
                cs |= {ord(c) for c in p.read_text(encoding="utf-8", errors="ignore") if ord(c) >= 0x20}
            except OSError:
                pass
    try:                                                   # 행정구역 이름(시도 · 시군구 · 읍면동) — DB 에서(없으면 건너뜀)
        sys.path.insert(0, str(REPO / "server"))
        import psycopg
        from landxi_api import config
        with psycopg.connect(config.PG_WORKER_DSN.replace("@localhost:", "@127.0.0.1:")) as c:
            c.execute("SELECT set_config('app.realm','lx',true)")
            for q in ("SELECT string_agg(DISTINCT name, '') FROM survey_emd", "SELECT string_agg(DISTINCT name, '') FROM survey_sgg",
                      "SELECT string_agg(DISTINCT emd, '') FROM survey_parcels"):
                try:
                    s = c.execute(q).fetchone()[0] or ""
                    cs |= {ord(ch) for ch in s}
                except Exception:  # noqa: BLE001
                    c.rollback()
    except Exception as e:  # noqa: BLE001
        print("DB 이름은 건너뜀:", type(e).__name__)
    return cs


def ranges(cps: list[int]) -> str:
    out, cps = [], sorted(cps)
    i = 0
    while i < len(cps):
        j = i
        while j + 1 < len(cps) and cps[j + 1] == cps[j] + 1:
            j += 1
        out.append(f"U+{cps[i]:X}" if i == j else f"U+{cps[i]:X}-{cps[j]:X}")
        i = j + 1
    return ",".join(out)


def make(src: Path, cps: list[int], dst: Path):
    o = subset.Options()
    o.flavor = "woff2"
    o.layout_features = ["*"]
    o.name_IDs = ["*"]
    o.notdef_outline = True
    f = TTFont(src)
    s = subset.Subsetter(o)
    s.populate(unicodes=cps)
    s.subset(f)
    f.flavor = "woff2"
    f.save(dst)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for old in OUT.glob("*.woff2"):
        old.unlink()
    used = used_chars()
    css, preload = [], {}
    total = {}
    for fam, w, fn in FONTS:
        src = SRC / fn
        have = set(TTFont(src).getBestCmap())
        core = sorted((used | BASIC) & have)
        rest = sorted(have - set(core))
        parts = [core] + [rest[i:i + CHUNK] for i in range(0, len(rest), CHUNK)]
        stem = f"{fam}-{w}"
        size = 0
        for k, cps in enumerate(parts):
            name = f"{stem}-{k}.woff2"
            make(src, cps, OUT / name)
            size += (OUT / name).stat().st_size
            css.append((fam, w, name, ranges(cps), k))
        preload[stem] = f"{stem}-0.woff2"
        total[stem] = (len(core), (OUT / f"{stem}-0.woff2").stat().st_size, len(parts), size)
    def block(prefix: str) -> str:
        return "\n".join(f"@font-face{{font-family:'{fam}';font-weight:{w};font-display:swap;src:url('{prefix}{name}') format('woff2');unicode-range:{ur}}}"
                         for fam, w, name, ur, k in css)
    (OUT / "fonts.css").write_text("/* 생성 파일 — tools/fonts/subset.py (글꼴 나눠 받기 · 10-22). 손으로 고치지 말 것 */\n" + block("./") + "\n", encoding="utf-8")
    for k, v in total.items():
        print(f"{k}: 자주 쓰는 글자 {v[0]}자 · 첫 조각 {v[1] / 1024:.0f}KB · 조각 {v[2]}개 · 합 {v[3] / 1024:.0f}KB")


if __name__ == "__main__":
    main()
