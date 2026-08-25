// 모델 프리뷰 스크린샷.  node tools/models/shot.mjs [satellite drone aircraft]
// 자체 정적 서버(포트 4399)를 띄우므로 tools/serve.mjs 와 무관하게 단독 실행된다.
import { chromium } from '@playwright/test';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PORT = Number(process.env.MODEL_PORT) || 4399;
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.glb': 'model/gltf-binary',
  '.png': 'image/png', '.svg': 'image/svg+xml',
};

const server = http.createServer((req, res) => {
  const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/+/, '');
  const file = path.join(ROOT, rel);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404).end('not found: ' + rel);
    return;
  }
  res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise(r => server.listen(PORT, r));

const names = process.argv.slice(2).filter(a => !a.startsWith('-'));
const models = names.length ? names : ['satellite', 'drone', 'aircraft'];
const W = Number(process.env.SHOT_W) || 1600;
const H = Number(process.env.SHOT_H) || 1100;

const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
page.on('console', m => { if (m.type() === 'error') console.log('  [console]', m.text()); });
page.on('pageerror', e => console.log('  [pageerror]', e.message));

fs.mkdirSync(path.join(ROOT, 'shots/models'), { recursive: true });
for (const m of models) {
  const q = process.env.SHOT_Q ? '&' + process.env.SHOT_Q : '';
  const url = `http://localhost:${PORT}/tools/models/preview.html?m=${m}${q}`;
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction('window.__ready === true', null, { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(1400);
  const info = await page.evaluate(() => window.__modelInfo || null);
  const out = path.join(ROOT, 'shots/models', `${m}${process.env.SHOT_SUFFIX || ''}.png`);
  await page.screenshot({ path: out });
  console.log(`saved ${out}`, info ? `tris=${info.tris} meshes=${info.meshes} nodes=[${info.nodes}] bbox=${info.size.map(v => v.toFixed(2))}` : '(no info — load failed?)');
}
await browser.close();
server.close();
