// B5-DataMgmt · B5-Dashboard 타일 크롭 — landxi/assets/proto/crops/** 실자산 → design-canvas/v2/img/tile-*.jpg (480×294, ≤40 KB)
import { chromium } from '@playwright/test';
import fs from 'node:fs'; import path from 'node:path';
const root = process.cwd();
const src = (p) => 'data:image/jpeg;base64,' + fs.readFileSync(path.join(root, 'landxi/assets/proto/crops', p)).toString('base64');
const out = path.join(root, 'design-canvas/v2/img');
const TILES = {
  'tile-up-live':   ['namwon-farmland-2025/3-clean.jpg', '50% 50%'],
  'tile-up-pause':  ['namwon-farmland-2025/5-clean.jpg', '50% 50%'],
  'tile-up-abort':  ['namwon-farmland-2025/7-clean.jpg', '50% 50%'],
  'tile-up-wait':   ['namwon-epoch/1.jpg', '50% 50%'],
  'tile-done-x':    ['namwon-greenhouse-2025/1-clean.jpg', '50% 50%'],
  'tile-done-ecw':  ['namwon-greenhouse-2025/3-clean.jpg', '50% 50%'],
  'tile-pub-1':     ['namwon-farmland-2025/2.jpg', '50% 50%'],
  'tile-pub-fail':  ['namwon-greenhouse-2025/2.jpg', '50% 50%'],
  'tile-pub-3':     ['kuksan-change/2.jpg', '50% 50%'],
  'tile-pub-4':     ['kuksan-change/4.jpg', '50% 50%'],
  'tile-pub-5':     ['namwon-farmland-2025/8.jpg', '50% 50%'],
  'tile-arc-a':     ['namwon-farmland-2025/1-clean.jpg', '50% 50%'],
  'tile-arc-hid':   ['namwon-epoch/3.jpg', '50% 50%'],
  'tile-arc-jeju':  ['jeju-illegal/2-clean.jpg', '50% 50%'],
  'tile-arc-yeosu': ['yeosu-marine-2026-drone/1.jpg', '50% 50%'],
  'tile-done-2':    ['namwon-greenhouse-2025/4-clean.jpg', '50% 50%'],
  // B5-Dashboard 스택용(2026-08-26): 결과 판은 -clean(폴리곤은 판 위에 청록으로 다시 그린다), 학습데이터 판은 시점별 원본
  'tile-farm-clean':        ['namwon-farmland-2025/2-clean.jpg', '50% 50%'],
  'tile-gh-clean':          ['namwon-greenhouse-2025/1-clean.jpg', '50% 50%'],
  'tile-arc-yeosu-air':     ['yeosu-marine-2025-aerial/1-clean.jpg', '50% 50%'],
  'tile-yeosu-drone-clean': ['yeosu-marine-2026-drone/1-clean.jpg', '50% 50%'],
  'tile-ep-1':              ['namwon-epoch/1.jpg', '50% 50%'],
  'tile-ep-2':              ['namwon-epoch/2.jpg', '50% 50%'],
  'tile-ep-4':              ['namwon-epoch/4.jpg', '50% 50%'],
  'tile-kuksan-1':          ['kuksan-change/1.jpg', '50% 50%'],
  'tile-arc-jeju':          ['jeju-illegal/2-clean.jpg', '50% 50%'],
};
const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage();
await page.setContent('<canvas id=c width=480 height=294></canvas>');
for (const [name, [rel, pos]] of Object.entries(TILES)) {
  const data = await page.evaluate(async ([href]) => {
    const img = new Image(); img.src = href; await img.decode();
    const c = document.getElementById('c'), g = c.getContext('2d');
    const s = Math.max(c.width / img.width, c.height / img.height);
    const w = img.width * s, h = img.height * s;
    g.drawImage(img, (c.width - w) / 2, (c.height - h) / 2, w, h);
    for (let q = 0.82; q > 0.3; q -= 0.05) { const d = c.toDataURL('image/jpeg', q); if (d.length * 0.75 <= 40 * 1024) return d; }
    return c.toDataURL('image/jpeg', 0.3);
  }, [src(rel)]);
  const buf = Buffer.from(data.split(',')[1], 'base64');
  fs.writeFileSync(path.join(out, name + '.jpg'), buf);
  console.log(name, buf.length);
}
await browser.close();
