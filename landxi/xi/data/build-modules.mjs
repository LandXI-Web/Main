// build-modules.mjs — XI맵 선택 모듈 존재 표(landxi/xi/data/modules.json).
// 다른 에픽이 만드는 모듈(F2-E 에이전트 패널 등)은 도착 전일 수 있다 — 화면은 이 표로 '있을 때만' import 한다
// (서비스 워커가 없어도 404 요청 0 · 콘솔 오류 0). 실행: node landxi/xi/data/build-modules.mjs (통합 단계 · 배포 전)
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const MODS = [
  { id: 'agent', path: '/landxi/agent/panel.js', owner: 'F2-E', export: 'mount(XI)' },
];
const items = MODS.map((m) => {
  const f = path.join(ROOT, m.path);
  if (!fs.existsSync(f)) return { ...m, present: false };
  const b = fs.readFileSync(f);
  return { ...m, present: true, bytes: b.length, sha1: crypto.createHash('sha1').update(b).digest('hex').slice(0, 12), mtime: fs.statSync(f).mtime.toISOString() };
});
const out = { built_at: new Date().toISOString(), note: '선택 모듈 존재 표 — present:false 면 화면이 import 하지 않는다(404 0). 서비스 워커가 있으면 sw.js 가 빈 모듈로 한 번 더 막는다.', items };
fs.writeFileSync(path.join(ROOT, 'landxi/xi/data/modules.json'), JSON.stringify(out, null, 1) + '\n');
console.log(JSON.stringify(items));
