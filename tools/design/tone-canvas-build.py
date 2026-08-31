# 톤앤매너 캔버스 빌드 — 작업본(design-canvas/tone/*.dc.html, /*@FONTS@*/ 자리표시자)에
# Paperlogy·Pretendard 서브셋을 data URI 로 심어 build/ 에 조립본을 만든다.
# 캔버스(아티팩트)는 외부 폰트 호스트를 막으므로(구글 폰트만 허용) 실제 서체를 보려면 이 단계가 필요하다.
import glob, os, subprocess, base64, sys, shutil, urllib.request
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SRC  = os.path.join(ROOT, "design-canvas", "tone")
BUILD= os.path.join(SRC, "build")
CACHE= os.path.join(SRC, ".fontcache")
URLS = {
 "Paperlogy-7Bold.woff2":      "https://fastly.jsdelivr.net/gh/projectnoonnu/2408-3@1.0/Paperlogy-7Bold.woff2",
 "Paperlogy-8ExtraBold.woff2": "https://fastly.jsdelivr.net/gh/projectnoonnu/2408-3@1.0/Paperlogy-8ExtraBold.woff2",
 "Pretendard-Regular.woff2":   "https://cdn.jsdelivr.net/npm/pretendard@1.3.9/dist/web/static/woff2/Pretendard-Regular.woff2",
 "Pretendard-Medium.woff2":    "https://cdn.jsdelivr.net/npm/pretendard@1.3.9/dist/web/static/woff2/Pretendard-Medium.woff2",
}
FACES = [("Paperlogy-7Bold.woff2","Paperlogy",700),("Paperlogy-8ExtraBold.woff2","Paperlogy",800),
         ("Pretendard-Regular.woff2","Pretendard",400),("Pretendard-Medium.woff2","Pretendard",500)]

os.makedirs(CACHE, exist_ok=True); os.makedirs(BUILD, exist_ok=True)
for fn, url in URLS.items():
    p = os.path.join(CACHE, fn)
    if not os.path.exists(p) or os.path.getsize(p) < 10000:
        urllib.request.urlretrieve(url, p); print("downloaded", fn, os.path.getsize(p)//1024, "KB")

# 글리프 집합 = 아트보드 텍스트 + 제품 UI 에서 쓰는 한글(편집해도 글자가 깨지지 않도록)
chars = set()
for f in glob.glob(os.path.join(SRC, "*.dc.html")): chars |= set(open(f, encoding="utf-8").read())
for pat in ["landxi/proto/*.js","landxi/proto/*.html","landxi/proto/*.css","design/system.md","tools/design/gen-b5*.mjs"]:
    for f in glob.glob(os.path.join(ROOT, pat)):
        try: chars |= set(open(f, encoding="utf-8").read())
        except Exception: pass
keep = {c for c in chars if 0x20 <= ord(c) < 0x7f or 0xAC00 <= ord(c) <= 0xD7A3 or 0x3130 <= ord(c) <= 0x318F}
keep |= set("0123456789.,%/·×—–‹›≒㎡㎞㎢°…‘’“”±≥≤•→←")
txt = os.path.join(CACHE, "chars.txt"); open(txt, "w", encoding="utf-8").write("".join(sorted(keep)))
print("glyphs:", len(keep))

css = []
for fn, fam, w in FACES:
    out = os.path.join(CACHE, "sub-" + fn)
    r = subprocess.run([sys.executable, "-m", "fontTools.subset", os.path.join(CACHE, fn),
        "--text-file=" + txt, "--flavor=woff2", "--layout-features=*", "--no-hinting",
        "--desubroutinize", "--output-file=" + out], capture_output=True, text=True)
    if r.returncode: sys.exit("subset failed: " + fn + "\n" + r.stderr[-400:])
    b = open(out, "rb").read()
    print(f"  {fam} {w}: {len(b)//1024} KB")
    css.append("@font-face{font-family:'%s';font-weight:%d;font-style:normal;font-display:block;"
               "src:url(data:font/woff2;base64,%s) format('woff2')}" % (fam, w, base64.b64encode(b).decode()))
face = "\n".join(css)

n = 0
for f in glob.glob(os.path.join(SRC, "*.dc.html")):
    s = open(f, encoding="utf-8").read()
    if "/*@FONTS@*/" not in s: sys.exit("자리표시자 없음: " + f)
    open(os.path.join(BUILD, os.path.basename(f)), "w", encoding="utf-8").write(s.replace("/*@FONTS@*/", face))
    n += 1
for extra in glob.glob(os.path.join(SRC, "*.jpg")) + glob.glob(os.path.join(SRC, "*.png")) + [os.path.join(SRC, "canvas.json")]:
    if os.path.exists(extra): shutil.copy2(extra, BUILD)
print(f"built {n} artboards →", BUILD)
