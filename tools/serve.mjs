import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const root = path.resolve('.'); const port = Number(process.env.PORT) || 4173;
// 투명 1×1 PNG — 성긴 타일셋의 빈 칸용
const BLANK = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
const types = { '.html':'text/html; charset=utf-8', '.css':'text/css', '.js':'text/javascript', '.mjs':'text/javascript', '.json':'application/json', '.geojson':'application/geo+json', '.svg':'image/svg+xml', '.png':'image/png', '.jpg':'image/jpeg', '.webp':'image/webp', '.ico':'image/x-icon', '.mp4':'video/mp4', '.webm':'video/webm' };

// 프로토타입 전용: .env.local 의 VWORLD_KEY 를 브라우저에 주입한다(소스에는 키를 두지 않는다).
function envJs() {
  let key = '';
  try {
    const raw = fs.readFileSync(path.join(root, '.env.local'), 'utf8');
    const m = raw.match(/^\s*VWORLD_KEY\s*=\s*(.+?)\s*$/m);
    if (m) key = m[1].replace(/^["']|["']$/g, '');
  } catch { /* 파일 없음 → 키 없는 폴백 */ }
  return `window.VWORLD_KEY=${JSON.stringify(key)};\n`;
}

http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p === '/favicon.ico') { res.writeHead(204); return res.end(); }
  // 프로토타입 전용: 병렬 작업 산출물(모델·구름·변화지수)이 도착했는지 알려준다.
  // 브라우저가 404 로 존재를 확인하면 콘솔 오류가 남으므로 서버가 목록으로 답한다.
  if (p === '/landxi/proto/assets.json') {
    const has = (rel) => fs.existsSync(path.join(root, rel));
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    return res.end(JSON.stringify({
      satellite: has('landxi/assets/proto/models/satellite.glb'),
      drone: has('landxi/assets/proto/models/drone.glb'),
      clouds: has('landxi/assets/proto/clouds/cloud_mid.webp'),
      change: has('landxi/assets/data/geo/namwon-change.geojson'),
      results: has('landxi/assets/data/results.js'),
      changeGrid: has('landxi/assets/data/geo/namwon-change-grid.geojson'),
      // 병렬 작업 산출물 — 브라우저가 404 로 존재를 확인하면 콘솔 오류가 남으므로 여기서 답한다.
      film: has('landxi/assets/proto/film/hero.mp4'),
      crops: has('landxi/assets/data/crops.js'),
      // 스크럽 모듈(landxi/proto/scrub/)의 레그 매니페스트 — 도착하면 필름→지도 핸드오프가 켜진다.
      filmLegs: has('landxi/assets/proto/film/legs/manifest.json'),
    }));
  }
  if (p === '/landxi/proto/env.js') {
    res.writeHead(200, { 'content-type': 'text/javascript', 'cache-control': 'no-store' });
    return res.end(envJs());
  }
  if (p.endsWith('/')) p += 'index.html';
  const f = path.join(root, p);
  if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) {
    // 정사영상 타일셋은 촬영 범위가 사각형이 아니라 성기다. 없는 타일에 404 를 주면
    // MapLibre 가 콘솔 오류를 남기므로, 타일 서버의 관례대로 투명 1×1 을 돌려준다.
    if (/^\/landxi\/assets\/tiles\//.test(p)) {
      res.writeHead(200, { 'content-type': 'image/png', 'cache-control': 'public, max-age=3600' });
      return res.end(BLANK);
    }
    res.writeHead(404); return res.end('404');
  }
  const type = types[path.extname(f)] || 'application/octet-stream';
  const size = fs.statSync(f).size;
  /* Range 응답 — 이게 없으면 <video> 의 seekable 이 비어서 currentTime 을 못 준다.
     히어로 필름은 스크롤에 스크럽으로 물려 있으므로(재생이 아니라) Range 가 필수다. */
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
  if (range && size) {
    let start = range[1] === '' ? null : Number(range[1]);
    let end = range[2] === '' ? null : Number(range[2]);
    if (start === null) { start = Math.max(0, size - (end || 0)); end = size - 1; }
    if (end === null || end >= size) end = size - 1;
    if (!Number.isFinite(start) || start > end) {
      res.writeHead(416, { 'content-range': `bytes */${size}` });
      return res.end();
    }
    res.writeHead(206, {
      'content-type': type, 'accept-ranges': 'bytes',
      'content-range': `bytes ${start}-${end}/${size}`,
      'content-length': end - start + 1,
    });
    return fs.createReadStream(f, { start, end }).pipe(res);
  }
  res.writeHead(200, { 'content-type': type, 'accept-ranges': 'bytes', 'content-length': size });
  fs.createReadStream(f).pipe(res);
}).listen(port, () => console.log('serve http://localhost:' + port + '/landxi/'));
