"""숏츠 2판 한 컷 그리기 — PC 화면 그림(2880×1620 · CSS 1920×1080 × 1.5)을 세로 1080×1920 에:
위 무대(1080×1620) = 카메라 창(가운데 x · y · 폭 — PC 화면 CSS 좌표 · 높이 = 폭 × 1.5)을 무대에 맞춰 확대(사이는 ease-in-out · 폭은 로그로 보간),
창이 화면보다 크면 남는 곳은 같은 그림을 흐리고 밝게(차분한 바탕 · 밝은 톤) · 화면 둘레에 옅은 그림자,
아래 띠(1620–1920)는 더 밝게 + 자막 PNG(투명 · 들어오고 나갈 때 0.25초 흐려짐).
python shorts-v2-render.py spec.json   (spec: {src, out, dur, cam:[[t,cx,cy,w],...], cap: png|null})"""
import json, math, subprocess, sys
import numpy as np, cv2

SW, SH, OW, OH, STAGE, D = 2880, 1620, 1080, 1920, 1620, 1.5
spec = json.load(open(sys.argv[1], encoding='utf-8'))
cam = spec['cam']; dur = spec['dur']; n = int(round(dur * 30))

def ease(u): return 2 * u * u if u < 0.5 else 1 - (-2 * u + 2) ** 2 / 2
def at(t):
    if t <= cam[0][0]: return cam[0][1:]
    for a, b in zip(cam, cam[1:]):
        if t <= b[0]:
            u = ease((t - a[0]) / max(1e-6, b[0] - a[0]))
            return [a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u, math.exp(math.log(a[3]) + (math.log(b[3]) - math.log(a[3])) * u)]
    return cam[-1][1:]

cap = None
if spec.get('cap'):
    c = cv2.imdecode(np.fromfile(spec['cap'], np.uint8), cv2.IMREAD_UNCHANGED).astype(np.float32)   # 한글 경로
    cap = (c[:, :, :3], c[:, :, 3:4] / 255.0)

dec = subprocess.Popen(['ffmpeg', '-loglevel', 'error', '-i', spec['src'], '-f', 'rawvideo', '-pix_fmt', 'bgr24', '-vf', f'scale={SW}:{SH}', '-'], stdout=subprocess.PIPE)
enc = subprocess.Popen(['ffmpeg', '-loglevel', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'bgr24', '-s', f'{OW}x{OH}', '-r', '30', '-i', '-',
                        '-c:v', 'libx264', '-preset', 'slow', '-crf', '13', '-pix_fmt', 'yuv420p', '-r', '30', spec['out']], stdin=subprocess.PIPE)
last = None
for i in range(n):
    buf = dec.stdout.read(SW * SH * 3)
    if len(buf) == SW * SH * 3: last = np.frombuffer(buf, np.uint8).reshape(SH, SW, 3)
    fr = last
    t = i / 30
    cx, cy, w = at(t)
    k = OW / (w * D)                                   # 그림 화소 → 무대 화소
    x0, y0 = cx * D - w * D / 2, cy * D - w * D * 1.5 / 2
    # 바탕 — 같은 그림을 작게 · 흐리게 · 세로 화면 덮기 · 밝게
    sm = cv2.GaussianBlur(cv2.resize(fr, (240, 135), interpolation=cv2.INTER_AREA), (0, 0), 5)
    bw = int(OH * 240 / 135)
    bg = cv2.resize(sm, (bw, OH), interpolation=cv2.INTER_LINEAR)[:, (bw - OW) // 2:(bw - OW) // 2 + OW].astype(np.float32)
    bg = bg * 0.42 + 255 * 0.58
    # 화면 자리(무대 좌표)
    X0, Y0 = -x0 * k, -y0 * k; X1, Y1 = X0 + SW * k, Y0 + SH * k
    # 그림자(화면이 무대보다 작을 때만 보임)
    sh = np.zeros((OH // 4, OW // 4), np.float32)
    cv2.rectangle(sh, (int(X0 / 4), int((Y0 + 10) / 4)), (int(X1 / 4), int((Y1 + 10) / 4)), 1.0, -1)
    sh = cv2.resize(cv2.GaussianBlur(sh, (0, 0), 7), (OW, OH))[:, :, None]
    bg = bg * (1 - 0.22 * sh)
    out = bg
    # 화면(무대 1080×1620 안)
    if k < 1:
        small = cv2.resize(fr, (max(1, int(round(SW * k))), max(1, int(round(SH * k)))), interpolation=cv2.INTER_AREA)
        M = np.float32([[1, 0, X0], [0, 1, Y0]])
        fg = cv2.warpAffine(small, M, (OW, STAGE), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT)
        ms = cv2.warpAffine(np.full(small.shape[:2], 255, np.uint8), M, (OW, STAGE), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT)
    else:
        M = np.float32([[k, 0, X0], [0, k, Y0]])
        fg = cv2.warpAffine(fr, M, (OW, STAGE), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_CONSTANT)
        ms = cv2.warpAffine(np.full((SH, SW), 255, np.uint8), M, (OW, STAGE), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT)
    a = (ms.astype(np.float32) / 255.0)[:, :, None]
    out[:STAGE] = out[:STAGE] * (1 - a) + fg.astype(np.float32) * a
    # 아래 띠 — 더 밝게(자막 읽기) · 위 경계는 부드럽게
    band = out[STAGE:]
    out[STAGE:] = band * 0.12 + 255 * 0.88
    if cap is not None:
        fa = min(1.0, max(0.0, (t - 0.15) / 0.25)) * min(1.0, max(0.0, (dur - 0.2 - t) / 0.25))
        rgb, al = cap; al = al * fa
        out = out * (1 - al) + rgb * al
    enc.stdin.write(np.clip(out, 0, 255).astype(np.uint8).tobytes())
enc.stdin.close(); enc.wait(); dec.stdout.close(); dec.kill()
print(json.dumps({'out': spec['out'], 'frames': n}))
