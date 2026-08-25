// 기존 남원 스마트빌리지 프로토타입(GitHub Pages)에서 이미지·목업 데이터를 그대로 이관한다.
// 네트워크 실패는 목록으로 출력하고 계속 진행한다(작업 자체는 실패시키지 않음).
import fs from 'node:fs';
import path from 'node:path';

const BASE = 'https://mini531.github.io/namwon-smart-village/landxi7/';

// { url: BASE 기준 원본 경로, dest: 리포지토리 내 저장 경로 }
const FILES = [
  { url: 'assets/images/landing/lp-map.png', dest: 'landxi/assets/images/landing/lp-map.png' },
  { url: 'assets/images/landing/lp-multisource.png', dest: 'landxi/assets/images/landing/lp-multisource.png' },
  { url: 'assets/images/landing/lp-results.png', dest: 'landxi/assets/images/landing/lp-results.png' },
  { url: 'assets/images/landxi-main/vs01_01original.png', dest: 'landxi/assets/images/landxi-main/vs01_01original.png' },
  { url: 'assets/images/landxi-main/vs01_02result.png', dest: 'landxi/assets/images/landxi-main/vs01_02result.png' },
  { url: 'assets/images/usecase/uc-farm-nongview.png', dest: 'landxi/assets/images/usecase/uc-farm-nongview.png' },
  { url: 'assets/images/usecase/uc-road-safety.png', dest: 'landxi/assets/images/usecase/uc-road-safety.png' },
  { url: 'assets/images/logo_landxi_dark.png', dest: 'landxi/assets/images/logo_landxi_dark.png' },
  { url: 'assets/images/lx_symbol.png', dest: 'landxi/assets/images/lx_symbol.png' },
  { url: 'assets/images/favicon_landxi.png', dest: 'landxi/assets/images/favicon_landxi.png' },
  { url: 'assets/data/support-data.js', dest: 'landxi/assets/data/support-data.js' },
  // 원본 저장소에는 assets/js/ 아래 있다(assets/data/ 경로는 404) — 이관 목적지는 브리프대로 assets/data 유지.
  { url: 'assets/js/ai-project-data.js', dest: 'landxi/assets/data/ai-project-data.js' },
];

async function fetchOne({ url, dest }) {
  const full = new URL(url, BASE).toString();
  const res = await fetch(full);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, buf);
  return buf.length;
}

async function main() {
  const failed = [];
  for (const f of FILES) {
    try {
      const bytes = await fetchOne(f);
      console.log(`OK   ${f.dest}  (${bytes.toLocaleString()} bytes)  ← ${f.url}`);
    } catch (err) {
      failed.push({ ...f, error: err.message });
      console.log(`FAIL ${f.dest}  ← ${f.url}  (${err.message})`);
    }
  }
  console.log('');
  if (failed.length) {
    console.log(`${failed.length}/${FILES.length}건 다운로드 실패:`);
    for (const f of failed) console.log(`  - ${f.url} (${f.error})`);
    console.log('네트워크 문제일 수 있으니 재실행하거나 수동으로 이관하세요. (작업은 계속 진행됩니다.)');
  } else {
    console.log(`${FILES.length}건 모두 이관 완료.`);
  }
}

await main();
