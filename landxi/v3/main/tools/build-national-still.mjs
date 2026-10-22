/* 게스트 메인 ① 전국 결과 지도 — 공개 그림 한 장 만들기(10-22 now21 첫인상-메인 ⓐ · 옆문 규칙).
   LX 직원 계정으로 로그인 폼(바깥 주소)을 지나 XI맵 전국 결과(농지 전수 · 하천 · 계곡 결과 면)만 남기고 대한민국 범위를 한 번 찍는다.
   그다음 칸마다 가장 가까운 종류 색(경작지 · 비닐하우스 · 하천 · 계곡 건물)으로 맞추고 4색 PNG(약 1km 칸 · 속성 0)로 줄인다.
   결과: data/national-result-2025.png + data/national-result.json(범위 bounds · 크기 · 종류 색).
   사용: node landxi/v3/main/tools/build-national-still.mjs   (Python 3 + Pillow + numpy 필요 · 비밀번호는 server/.env 에서 읽는다 — 출력하지 않음) */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../../..');
const OUT = path.resolve(HERE, '../data');
const C = await import(pathToFileURL(path.join(ROOT, 'tools/check/common.mjs')).href);
const KOREA = [124.6, 33.1, 130.95, 38.62];
const YEAR = 2025;

const b = await C.launch();
const s = await C.login(b, 'app', { width: 1480, height: 1764 });   // 지도 판 1400 × 1700
const p = s.page;
await p.goto(s.home + '/landxi/v3/xi-clean/', { waitUntil: 'domcontentloaded' });
await p.waitForFunction(() => window.__xc?.boot?.shown, null, { timeout: 60000 });
await p.waitForTimeout(1500);
const r = await p.evaluate(async (KOREA) => {
  const m = window.__xc.map;
  for (const l of m.getStyle().layers) if (!/^xn-(farm|river)-face$/.test(l.id)) m.setLayoutProperty(l.id, 'visibility', 'none');
  m.setPadding({ top: 0, left: 0, right: 0, bottom: 0 });
  m.fitBounds(KOREA, { padding: 0, duration: 0 });
  await new Promise((ok) => { const t0 = performance.now(); const tick = () => { if ((m.areTilesLoaded() && !m.isMoving() && performance.now() - t0 > 2500) || performance.now() - t0 > 60000) ok(); else setTimeout(tick, 200); }; tick(); });
  const url = await new Promise((ok) => { m.once('render', () => ok(m.getCanvas().toDataURL('image/png'))); m.triggerRepaint(); });
  const bb = m.getBounds();
  // 숫자 = XI맵과 같은 진행 장부(GET /national/progress) — 공개 API(/public/national)가 없을 때 메인이 읽는 사본
  const tok = JSON.parse(localStorage.getItem('lx_api_session') || 'null')?.token;
  const pj = await fetch('/api/v1/national/progress', { headers: { authorization: 'Bearer ' + tok } }).then((r) => r.json());
  const v = (e) => (e && typeof e === 'object' ? e.value : e);
  const pick = (a, cls) => { const c = pj.assets?.[a]?.counts?.[cls]; return c ? { n: v(c.net ?? c.n), km2: v(c.km2) } : null; };
  const counts = { farm: pick('farm', '경작지'), greenhouse: pick('farm', '비닐하우스'), river: pick('river', '건물') };
  return { url, bounds: [bb.getWest(), bb.getSouth(), bb.getEast(), bb.getNorth()], counts, as_of: pj.assets?.farm?.pct?.as_of };
}, KOREA);
await b.close();

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lx-natstill-'));
fs.writeFileSync(path.join(tmp, 'cap.png'), Buffer.from(r.url.split(',')[1], 'base64'));
const py = `
import json, math, sys, numpy as np
from PIL import Image
tmp, out, W, S, E, N = sys.argv[1], sys.argv[2], *map(float, sys.argv[3:7])
im = Image.open(tmp + '/cap.png').convert('RGBA'); w, h = im.size
x0, y0, x1, y1 = im.getbbox(); x0 -= 4; y0 -= 4; x1 += 4; y1 += 4
mx = lambda l: (l + 180) / 360
my = lambda a: 0.5 - math.log((1 + math.sin(math.radians(a))) / (1 - math.sin(math.radians(a)))) / (4 * math.pi)
ilng = lambda x: x * 360 - 180
ilat = lambda y: math.degrees(math.atan(math.exp((0.5 - y) * 2 * math.pi))) * 2 - 90
X0, X1, Y0, Y1 = mx(W), mx(E), my(N), my(S)
fx = lambda px: X0 + (X1 - X0) * px / w
fy = lambda py: Y0 + (Y1 - Y0) * py / h
bounds = [round(ilng(fx(x0)), 5), round(ilat(fy(y1)), 5), round(ilng(fx(x1)), 5), round(ilat(fy(y0)), 5)]
c = im.crop((x0, y0, x1, y1)); tw = 900; c = c.resize((tw, round(tw * c.size[1] / c.size[0])), Image.LANCZOS)
a = np.array(c).astype(np.int32)
pal = np.array([[0x2E, 0x9E, 0x5B], [0xF5, 0x9F, 0x00], [0x31, 0x82, 0xF6]])
k = ((a[..., None, :3] - pal[None, None]) ** 2).sum(-1).argmin(-1)
o = np.zeros(a.shape, np.uint8); m = a[..., 3] > 40
o[m, :3] = pal[k[m]]; o[m, 3] = 235
Image.fromarray(o, 'RGBA').quantize(colors=4, method=Image.FASTOCTREE).save(out + '/national-result-${YEAR}.png', optimize=True)
for i, nm in enumerate(('farm', 'greenhouse', 'river')):   # 종류마다 한 장(메인이 하나씩 켜고 끈다)
    oi = np.zeros(a.shape, np.uint8); mi = m & (k == i); oi[mi, :3] = pal[i]; oi[mi, 3] = 235
    Image.fromarray(oi, 'RGBA').quantize(colors=2, method=Image.FASTOCTREE).save(out + f'/national-result-${YEAR}-{nm}.png', optimize=True)
print(json.dumps({'bounds': bounds, 'size': list(c.size)}))
`;
const q = spawnSync('python', ['-c', py, tmp, OUT, ...r.bounds.map(String)], { encoding: 'utf8' });
if (q.status !== 0) { process.stderr.write(q.stderr); process.exit(1); }
const meta = JSON.parse(q.stdout.trim().split('\n').pop());
const J = path.join(OUT, 'national-result.json');
const prev = JSON.parse(fs.readFileSync(J, 'utf8'));
const classes = prev.classes.map((c) => ({ ...c, png: `national-result-${YEAR}-${c.key}.png`, ...(r.counts[c.key] || {}) }));
fs.writeFileSync(J, JSON.stringify({ ...prev, year: YEAR, png: `national-result-${YEAR}.png`, bounds: meta.bounds, size: meta.size, classes, as_of: r.as_of, made:new Date().toISOString().slice(0, 10) }, null, 1) + '\n');
fs.rmSync(tmp, { recursive: true, force: true });
process.stdout.write(`전국 결과 공개 그림 ${meta.size.join('×')} · 범위 ${meta.bounds.join(', ')}\n`);
