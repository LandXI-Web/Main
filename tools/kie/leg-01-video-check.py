# -*- coding: utf-8 -*-
"""Leg 1 영상 체크리스트 계측기.

  ~/anaconda3/envs/yolo/python.exe tools/kie/leg-01-video-check.py

원본 mp4 를 ffmpeg rawvideo(rgb24)로 통째로 스트리밍해서 **모든 프레임**을 잰다.
(중간 png 파일을 쓰지 않으므로 jpeg 재압축이 순백 판정을 오염시키지 않는다.)

프레임마다:
  - 배경 순백    : 4모서리 16x16 블록 min RGB, 바깥 4px 테두리 min RGB / max(R-B)
  - 지구본 원반  : 비-흰색(어느 채널이든 <245) 마스크의 행별 폭으로 지름 D 를 찾고,
                   폭 >= 0.2D 인 행 범위를 원반 상/하단으로 본다(얇은 황동 링 배제).
  - 링/위성 이탈 : 원반 상단 위쪽에 남은 비-흰색 픽셀 수
  - 플리커       : 전체 평균 휘도, 원반 내부 평균 휘도의 프레임 간 차이
"""
import json
import os
import subprocess
import sys

import numpy as np

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
IN = sys.argv[1] if len(sys.argv) > 1 else os.path.join(
    ROOT, 'landxi', 'assets', 'proto', 'film', 'legs', 'gen',
    'ch1-leg-01-globe.mp4')
OUT = os.path.join(ROOT, 'shots', 'kie',
                   ('leg01-video-check-' + os.path.splitext(os.path.basename(IN))[0] + '.json')
                   if len(sys.argv) > 1 else 'leg01-video-check.json')


def ff(name):
    base = os.path.join(os.environ.get('USERPROFILE') or os.environ['HOME'],
                        'AppData', 'Local', 'Microsoft', 'WinGet', 'Packages')
    if os.path.isdir(base):
        for d in os.listdir(base):
            if not d.startswith('Gyan.FFmpeg'):
                continue
            for b in os.listdir(os.path.join(base, d)):
                c = os.path.join(base, d, b, 'bin', name + '.exe')
                if os.path.exists(c):
                    return c
    return name


pr = json.loads(subprocess.check_output(
    [ff('ffprobe'), '-v', 'error', '-print_format', 'json', '-show_streams', IN]))
v = [s for s in pr['streams'] if s['codec_type'] == 'video'][0]
W, H = int(v['width']), int(v['height'])
fn, fd = (list(map(int, v['r_frame_rate'].split('/'))) + [1])[:2]
FPS = fn / float(fd)

proc = subprocess.Popen([ff('ffmpeg'), '-v', 'error', '-i', IN,
                         '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'],
                        stdout=subprocess.PIPE)
FSZ = W * H * 3
rows = []
prev_lum = None
prev_disc = None
while True:
    buf = proc.stdout.read(FSZ)
    if len(buf) < FSZ:
        break
    a = np.frombuffer(buf, dtype=np.uint8).reshape(H, W, 3).astype(np.int16)
    i = len(rows)

    # --- 배경 순백 -------------------------------------------------------
    cor = {'tl': a[:16, :16], 'tr': a[:16, -16:], 'bl': a[-16:, :16], 'br': a[-16:, -16:]}
    corner_min = int(min(int(c.min()) for c in cor.values()))
    corner_rb = int(max(int(abs(c[:, :, 0].astype(int) - c[:, :, 2].astype(int)).max())
                        for c in cor.values()))
    border = np.concatenate([a[:4].reshape(-1, 3), a[-4:].reshape(-1, 3),
                             a[:, :4].reshape(-1, 3), a[:, -4:].reshape(-1, 3)])
    border_min = int(border.min())
    border_rb = int(np.abs(border[:, 0].astype(int) - border[:, 2].astype(int)).max())

    # --- 비-흰색 마스크 --------------------------------------------------
    m = (a.min(axis=2) < 245)
    any_row = m.any(axis=1)
    if not any_row.any():
        rows.append({'i': i, 'empty': True})
        continue
    xs = np.where(m.any(axis=0))[0]
    idx = np.where(any_row)[0]
    x0 = np.argmax(m, axis=1)
    xl = np.where(any_row, x0, W)
    xr = np.where(any_row, W - 1 - np.argmax(m[:, ::-1], axis=1), -1)
    width = np.where(any_row, xr - xl + 1, 0)
    D = int(width.max())
    thick = np.where(width >= 0.2 * D)[0]
    top, bot = int(thick.min()), int(thick.max())
    eq = int(np.argmax(width))
    cx = (int(xl[eq]) + int(xr[eq])) / 2.0
    cy = (top + bot) / 2.0
    disc_h = bot - top + 1

    # --- 원반 위쪽 잔여물(링/위성) ---------------------------------------
    above = int(m[:max(top, 0)].sum()) if top > 0 else 0

    # --- 플리커 ----------------------------------------------------------
    lum = a.mean(axis=2)
    mean_lum = float(lum.mean())
    dm = np.zeros((H, W), dtype=bool)
    yy, xx = np.ogrid[:H, :W]
    r = disc_h / 2.0 * 0.7
    dm = ((yy - cy) ** 2 + (xx - cx) ** 2) <= r * r
    disc_lum = float(lum[dm].mean())

    rows.append({
        'i': i, 't': round(i / FPS, 3),
        'cornerMin': corner_min, 'cornerMaxRB': corner_rb,
        'borderMin': border_min, 'borderMaxRB': border_rb,
        'discTop': top, 'discBottom': bot, 'discHeightPx': int(disc_h),
        'discHeightFrac': round(disc_h / float(H), 4),
        'discWidthPx': D, 'centerX': round(cx, 1),
        'centerXFrac': round(cx / float(W), 4),
        'centerYFrac': round(cy / float(H), 4),
        'nonWhiteAboveDisc': above,
        'bboxLeft': int(xs.min()), 'bboxRight': int(xs.max()),
        'bboxTop': int(idx.min()), 'bboxBottom': int(idx.max()),
        'meanLum': round(mean_lum, 3), 'discLum': round(disc_lum, 3),
        'dMeanLum': None if prev_lum is None else round(mean_lum - prev_lum, 3),
        'dDiscLum': None if prev_disc is None else round(disc_lum - prev_disc, 3),
    })
    prev_lum, prev_disc = mean_lum, disc_lum

proc.stdout.close()
proc.wait()

good = [r for r in rows if not r.get('empty')]
summary = {
    'file': os.path.basename(IN), 'width': W, 'height': H, 'fps': FPS,
    'frames': len(rows),
    'cornerMinOverall': min(r['cornerMin'] for r in good),
    'cornerMaxRBOverall': max(r['cornerMaxRB'] for r in good),
    'borderMinOverall': min(r['borderMin'] for r in good),
    'borderMaxRBOverall': max(r['borderMaxRB'] for r in good),
    'discHeightFracFirst': good[0]['discHeightFrac'],
    'discHeightFracLast': good[-1]['discHeightFrac'],
    'discHeightFracMax': max(r['discHeightFrac'] for r in good),
    'centerXFracFirst': good[0]['centerXFrac'],
    'centerXFracLast': good[-1]['centerXFrac'],
    'nonWhiteAboveDiscFirst': good[0]['nonWhiteAboveDisc'],
    'nonWhiteAboveDiscLast': good[-1]['nonWhiteAboveDisc'],
    'maxAbsDMeanLum': max(abs(r['dMeanLum']) for r in good if r['dMeanLum'] is not None),
    'maxAbsDDiscLum': max(abs(r['dDiscLum']) for r in good if r['dDiscLum'] is not None),
}
os.makedirs(os.path.dirname(OUT), exist_ok=True)
with open(OUT, 'w', encoding='utf-8') as f:
    json.dump({'summary': summary, 'frames': rows}, f, indent=2)

print(json.dumps(summary, indent=2))
print()
hdr = 'i     t   cMin cRB  bMin bRB   top  bot  hFrac  cxFrac cyFrac above   dLum  dDisc'
print(hdr)
step = max(1, len(good) // 24)
for r in good[::step] + [good[-1]]:
    print('%3d %5.2f %5d %4d %5d %4d %5d %4d %6.3f %6.3f %6.3f %6d %6s %6s' % (
        r['i'], r['t'], r['cornerMin'], r['cornerMaxRB'], r['borderMin'], r['borderMaxRB'],
        r['discTop'], r['discBottom'], r['discHeightFrac'], r['centerXFrac'],
        r['centerYFrac'], r['nonWhiteAboveDisc'],
        r['dMeanLum'], r['dDiscLum']))
