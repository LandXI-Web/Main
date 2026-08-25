// 3D 모델 빌드 파이프라인:  Blender 절차적 생성 → glTF-Transform 정리 → 프리뷰 스크린샷.
//   node tools/models/build.mjs              (전부)
//   node tools/models/build.mjs drone        (하나만)
//   node tools/models/build.mjs --no-shot    (스크린샷 생략)
//
// Draco 는 쓰지 않는다 — three.js 쪽에 CDN 디코더 의존성이 생기기 때문. 대신 dedup/weld/prune 만.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const OUT = path.join(ROOT, 'landxi/assets/proto/models');

const BLENDER = process.env.BLENDER ||
  'C:\\Program Files\\Blender Foundation\\Blender 5.2\\blender.exe';

const args = process.argv.slice(2);
const noShot = args.includes('--no-shot');
const names = args.filter(a => !a.startsWith('-'));
const models = names.length ? names : ['satellite', 'drone', 'aircraft'];

const run = (cmd, argv, opt = {}) =>
  execFileSync(cmd, argv, { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], ...opt }).toString();
// Node 24 는 셸 없이 .cmd 를 못 띄우므로 npx 는 shell 경유로 부른다.
const gt = (...a) => run('npx', ['-y', '@gltf-transform/cli@4', ...a.map(s => `"${s}"`)], { shell: true });

if (!fs.existsSync(BLENDER)) {
  console.error(`Blender 를 찾을 수 없다: ${BLENDER}\nBLENDER 환경변수로 경로를 지정하라.`);
  process.exit(1);
}

for (const m of models) {
  const script = path.join(HERE, `${m}.py`);
  if (!fs.existsSync(script)) { console.error(`skip ${m}: ${script} 없음`); continue; }

  const log = run(BLENDER, ['-b', '-P', script]);
  const line = log.split('\n').find(l => l.includes('[lxbuild] wrote'));
  console.log((line || `${m}: 빌드 로그를 찾지 못함`).trim());

  // dedup(중복 accessor/material 병합) → weld(정점 병합) → prune(미사용 리소스 제거)
  const glb = path.join(OUT, `${m}.glb`);
  const tmp = [1, 2, 3].map(i => path.join(OUT, `_${m}.${i}.glb`));
  fs.copyFileSync(glb, tmp[0]);
  try {
    gt('dedup', tmp[0], tmp[1]);
    gt('weld', tmp[1], tmp[2]);
    gt('prune', tmp[2], glb);
  } finally {
    tmp.forEach(f => fs.existsSync(f) && fs.unlinkSync(f));
  }
  const kb = fs.statSync(glb).size / 1024;
  console.log(`  → ${path.relative(ROOT, glb)}  ${kb.toFixed(1)} KB${kb > 250 ? '  ⚠ 250KB 초과' : ''}`);
}

if (!noShot) {
  console.log(run(process.execPath, [path.join(HERE, 'shot.mjs'), ...models]).trim());
}
