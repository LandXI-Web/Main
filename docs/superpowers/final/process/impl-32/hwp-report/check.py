"""구현 32 · 받은 한글 문서(.hwpx) 점검 — 형식(zip · 필수 XML · 그림) + 화면 숫자 = 문서 숫자(run.json 의 화면 값).
python docs/superpowers/final/process/impl-32/hwp-report/check.py <받은 폴더>   → check.txt"""
import io, json, os, re, sys, zipfile
from xml.etree import ElementTree as ET
D = os.path.dirname(os.path.abspath(__file__))
GOT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(D, "got")
run = json.load(open(os.path.join(D, "run.json"), encoding="utf8"))
HP = "{http://www.hancom.co.kr/hwpml/2011/paragraph}"
NEED = ["mimetype", "version.xml", "Contents/header.xml", "Contents/section0.xml", "Contents/content.hpf", "META-INF/container.xml", "META-INF/manifest.xml", "META-INF/container.rdf", "settings.xml"]
out, bad = [], 0
for name, d in run["dash"].items():
    z = zipfile.ZipFile(os.path.join(GOT, d["file"]))
    f = {n: z.read(n) for n in z.namelist()}
    first = z.infolist()[0]
    fmt = first.filename == "mimetype" and first.compress_type == 0 and f["mimetype"] == b"application/hwp+zip"
    miss = [n for n in NEED if n not in f]
    xml_ok = all(ET.fromstring(b) is not None for n, b in f.items() if n.endswith((".xml", ".hpf", ".rdf")))
    pics = [n for n in f if n.startswith("BinData/")]
    png_ok = all(f[n][:4] == b"\x89PNG" for n in pics)
    txt = "\n".join((t.text or "") for t in ET.fromstring(f["Contents/section0.xml"]).iter(HP + "t"))
    checks = []
    for k in d["kpis"]:
        want = f"{k['v']}{k['u'] or ''}"
        checks.append((f"큰 숫자 {k['l']}", want, want in txt))
    for s in d["say"]:
        s2 = s.replace("km²", "㎢")
        checks.append(("해석 줄", s2, s2 in txt))
    for n, v in d["rank"]:
        if n and v:
            checks.append((f"순위 {n}", v, v in txt and n in txt))
    ok = fmt and not miss and xml_ok and png_ok and all(c[2] for c in checks)
    bad += 0 if ok else 1
    out.append(f"■ {d['q']} → {d['file']} ({d['bytes']:,} bytes)")
    out.append(f"  형식: mimetype 첫 항목·압축 없음 {fmt} · 필수 파일 빠짐 {miss or '없음'} · XML 읽힘 {xml_ok} · 그림 {len(pics)}장 PNG {png_ok}")
    for c in checks:
        out.append(f"  {'같음' if c[2] else '다름'} · {c[0]}: {c[1]}")
out.append(f"결과: {'통과' if not bad else f'{bad}개 문서 다름'}")
open(os.path.join(D, "check.txt"), "w", encoding="utf8").write("\n".join(out) + "\n")
print("\n".join(out))
sys.exit(1 if bad else 0)
