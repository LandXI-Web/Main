// SPIKE 텍스처 빌더 — 키 없는 공개 소스 + 우리 정사영상 타일에서 텍스처를 만든다.
// 결과물은 5 MB 를 넘으므로 커밋하지 않는다(.gitignore). 필요할 때 다시 돌린다.
//   node tools/serve.mjs &   # 4173
//   node landxi/proto/spikes/three-globe/tools/make-textures.mjs
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(process.cwd());
const OUT = path.join(ROOT, 'landxi/proto/spikes/three-globe/tex');
const DATA = path.join(ROOT, 'landxi/proto/spikes/three-globe/data');
const PORT = process.env.PORT || 4173;
fs.mkdirSync(OUT, { recursive: true }); fs.mkdirSync(DATA, { recursive: true });

const save = (name, dataUrl) => {
  const buf = Buffer.from(dataUrl.split(',')[1], 'base64');
  fs.writeFileSync(path.join(OUT, name), buf);
  console.log('  →', name, (buf.length / 1e6).toFixed(2), 'MB');
};

const b = await chromium.launch({ channel: 'chrome' });
const p = await b.newPage({ viewport: { width: 400, height: 300 } });
p.on('console', m => { if (m.type() === 'log') console.log('   [page]', m.text()); });
await p.goto(`http://localhost:${PORT}/landxi/proto/spikes/three-globe/tools/builder.html`);
await p.waitForFunction('window.__ready === 1');

const only = process.argv.slice(2);
const want = (k) => only.length === 0 || only.includes(k);

if (want('day'))    { console.log('day (EOX Sentinel-2 cloudless z5)…');   save('earth_day.jpg', await p.evaluate(() => build.day(5))); }
if (want('night'))  { console.log('night (NASA Black Marble z4)…');        save('earth_night.jpg', await p.evaluate(() => build.night(4))); }
if (want('terrain')){ console.log('bump+spec (AWS terrarium z5)…');
  const t = await p.evaluate(() => build.terrain(5)); save('earth_bump.jpg', t.bump); save('earth_spec.jpg', t.spec); }
if (want('clouds')) { console.log('clouds (NASA Visible Earth via turban/webgl-earth)…');
  const c = await p.evaluate(() => build.clouds()); if (c) save('earth_clouds.png', c); else console.log('  ! 구름 텍스처 실패 — 절차적 폴백 사용됨'); }
if (want('korea'))  { console.log('korea patch (V-World 위성 z8)…');
  const k = await p.evaluate(() => build.korea()); save('korea_z8.jpg', k.data);
  fs.writeFileSync(path.join(DATA, 'korea-bounds.json'), JSON.stringify(k.bounds)); }
if (want('ortho'))  {
  // 남원 금지면 127.39, 35.41 — 우리 정사영상 namwon_city_2510
  for (const [z, name] of [[13, 'ortho_z13.jpg'], [15, 'ortho_z15.jpg']]) {
    console.log(`ortho z${z} (namwon_city_2510)…`);
    const o = await p.evaluate(([z]) => build.ortho(z, 127.39, 35.41, 16), [z]);
    save(name, o.data);
    fs.writeFileSync(path.join(DATA, name.replace('.jpg', '-bounds.json')), JSON.stringify(o.bounds));
  }
}
await b.close();
console.log('done');
