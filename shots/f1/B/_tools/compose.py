"""marks.json 으로 두 녹화(터미널 480×900 · F1-A 1440×900)를 T0 에 맞춰 자르고 1440×900 한 화면으로 합성 → f1b.webm · f1b.mp4
+ F1-A 화면만 1440×900 mp4 · 100ms 프레임 스트립. 배속·편집 없음(실시간)."""
import json
import subprocess
from pathlib import Path

OUT = Path("E:/Land-XI 플랫폼/01. 디자인/shots/f1/B")
RAW = OUT / "_raw"
FF = "ffmpeg"
FONT = "C\\:/Windows/Fonts/malgunbd.ttf"
m = json.loads((RAW / "marks.json").read_text(encoding="utf-8"))
t = m["t"]
T0 = t["T0"]
offA = (T0 - t["ctxA"]) / 1000
offT = (T0 - t["ctxT"]) / 1000
dur = (t["end"] - T0) / 1000 + 0.8
rel = {k: round((v - T0) / 1000, 2) for k, v in t.items()}
scenes = [
    (0, rel["fly"], "① 서버 확인 — compose(redis·postgis) · 워커 VRAM 예산 · Ollama llama-server 생존"),
    (rel["fly"], rel["run"], "② 직원 세션 — 익산 황등 1.36cm 하강 · 사각 프레임 → 견적(면적 실측 · GPU·s = bench 추정)"),
    (rel["run"], rel["snapshot"], "③ 실행 — A6000 0번 실추론 · 워커 shard.done 로그 ↔ 화면 칸 동기 · HUD 실측"),
    (rel["snapshot"], rel["sales"], "④ job.done · snapshot.ready 교체 · 가르기 · 정답(AXIS 라벨) 대비 P/R 봉투"),
    (rel["sales"], dur, "⑤ 영업 세션 demo:true → '시연' · detections 0행 · usage_events lx-demo"),
]


def esc(s):
    return s.replace("\\", "\\\\").replace(":", "\\:").replace("'", "\u2019").replace(",", "\\,")


dt = []
for a, b, s in scenes:
    dt.append(f"drawtext=fontfile='{FONT}':text='{esc(s)}':x=500:y=58:fontsize=19:fontcolor=white:enable='between(t,{a},{b})'")
head = f"drawtext=fontfile='{FONT}':text='{esc('Land-XI · F1-B 실추론 백엔드 × F1-A XI맵 — 실시간 녹화(배속·편집 없음)')}':x=500:y=22:fontsize=15:fontcolor=0x9fb3c8"
clock = f"drawtext=fontfile='{FONT}':text='%{{pts\\:hms}}':x=1340:y=22:fontsize=15:fontcolor=0x9fb3c8"
foot = f"drawtext=fontfile='{FONT}':text='{esc('job ' + m['job'] + ' · 시연 job ' + m['demoJob'] + ' · :8700 · redis :6380 · postgis :5433')}':x=500:y=812:fontsize=13:fontcolor=0x7b8594"
fc = (f"[0:v]trim=start={offT:.3f}:duration={dur:.3f},setpts=PTS-STARTPTS,scale=480:900[t];"
      f"[1:v]trim=start={offA:.3f}:duration={dur:.3f},setpts=PTS-STARTPTS,scale=940:588:flags=lanczos[a];"
      f"color=c=0x0c0f14:s=1440x900:r=25:d={dur:.3f}[bg];"
      f"[bg][t]overlay=0:0[b1];[b1][a]overlay=490:200,{head},{clock},{','.join(dt)},{foot}[v]")
vt, va = m["videoT"], m["videoA"]
base = [FF, "-y", "-loglevel", "error", "-i", vt, "-i", va, "-filter_complex", fc, "-map", "[v]", "-r", "25"]
subprocess.run(base + ["-c:v", "libvpx-vp9", "-b:v", "0", "-crf", "30", "-row-mt", "1", "-deadline", "good", "-cpu-used", "4", str(OUT / "f1b.webm")], check=True)
subprocess.run(base + ["-c:v", "libx264", "-crf", "20", "-preset", "medium", "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(OUT / "f1b.mp4")], check=True)
# F1-A 화면만 1440×900
subprocess.run([FF, "-y", "-loglevel", "error", "-ss", f"{offA:.3f}", "-i", va, "-t", f"{dur:.3f}", "-c:v", "libx264", "-crf", "18", "-preset", "medium",
                "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(OUT / "f1b-screen-1440x900.mp4")], check=True)
subprocess.run([FF, "-y", "-loglevel", "error", "-ss", f"{offT:.3f}", "-i", vt, "-t", f"{dur:.3f}", "-c:v", "libx264", "-crf", "20", "-pix_fmt", "yuv420p",
                str(OUT / "f1b-terminal-480x900.mp4")], check=True)
# 100ms 프레임 스트립 — 실행 직후(칸 점등) · 스냅샷 직전 · 영업 시연
strips = {"strip-run": rel["run"] + 2.0, "strip-mid": rel["mid"], "strip-snapshot": rel["snapshot"] - 0.8, "strip-sales": rel["sales"] + 10.5}
for name, s in strips.items():
    subprocess.run([FF, "-y", "-loglevel", "error", "-ss", f"{s:.2f}", "-i", str(OUT / "f1b.mp4"), "-frames:v", "1", "-update", "1", "-vf", "fps=10,scale=480:-1,tile=4x2:padding=4:color=white",
                    str(OUT / f"f1b-{name}-100ms.png")], check=True)
(OUT / "f1b-timeline.json").write_text(json.dumps({"rel_s": rel, "dur_s": round(dur, 2), "offsets": {"screen": offA, "term": offT}, "scenes": scenes,
                                                   "job": m["job"], "demo_job": m["demoJob"], "hud": m.get("hud"), "sales": m.get("salesHud"), "quote": m.get("quote"),
                                                   "page_errors": m.get("errs")}, ensure_ascii=False, indent=1), encoding="utf-8")
print(json.dumps({"dur": dur, "rel": rel}, ensure_ascii=False))
