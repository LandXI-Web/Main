// 구름 스파이크 — 외부 텍스처 내려받기 (5MB 초과 파일은 저장소에 커밋하지 않는다)
// 사용: node landxi/proto/spikes/clouds/fetch-textures.mjs
import fs from 'node:fs'; import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'tex');
fs.mkdirSync(DIR, { recursive: true });

// name → { url, licence, commit }  commit:false 는 .gitignore 대상(5MB 초과)
export const TEX = {
  'earth_clouds_8k.jpg': {
    url: 'https://www.solarsystemscope.com/textures/download/8k_earth_clouds.jpg',
    licence: 'CC BY 4.0 — Solar System Scope (INOVE), NASA 영상 기반',
    commit: false,
  },
  'earth_clouds_2k.jpg': {
    url: 'https://www.solarsystemscope.com/textures/download/2k_earth_clouds.jpg',
    licence: 'CC BY 4.0 — Solar System Scope (INOVE)',
    commit: true,
  },
  'earth_day_2k.jpg': {
    url: 'https://www.solarsystemscope.com/textures/download/2k_earth_daymap.jpg',
    licence: 'CC BY 4.0 — Solar System Scope (INOVE) · EOX 재투영 실패 시 폴백',
    commit: true,
  },
  'nasa_cloud_combined_2048.jpg': {
    url: 'https://eoimages.gsfc.nasa.gov/images/imagerecords/57000/57747/cloud_combined_2048.jpg',
    licence: 'Public Domain — NASA Visible Earth / Blue Marble Next Generation (BMNG)',
    commit: true,
  },
};

if (process.argv[1] && process.argv[1].endsWith('fetch-textures.mjs')) {
  for (const [name, t] of Object.entries(TEX)) {
    const f = path.join(DIR, name);
    if (fs.existsSync(f)) { console.log('skip', name, (fs.statSync(f).size / 1e6).toFixed(2) + 'MB'); continue; }
    const r = await fetch(t.url);
    if (!r.ok) { console.error('FAIL', name, r.status); continue; }
    fs.writeFileSync(f, Buffer.from(await r.arrayBuffer()));
    console.log('ok  ', name, (fs.statSync(f).size / 1e6).toFixed(2) + 'MB', '·', t.licence);
  }
}
