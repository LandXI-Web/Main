import { chromium } from 'file:///F:/Land-XI%20%ED%94%8C%EB%9E%AB%ED%8F%BC/01.%20%EB%94%94%EC%9E%90%EC%9D%B8/node_modules/playwright-core/index.mjs';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const dir = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const server = http.createServer((req, res) => {
  const f = path.join(dir, req.url === '/' ? (process.env.PAGE||'probe.html') : decodeURIComponent(req.url.split('?')[0]));
  fs.readFile(f, (e, b) => { if (e) { res.writeHead(404); res.end(); } else { res.writeHead(200, {'Content-Type': f.endsWith('.html') ? 'text/html' : 'application/javascript'}); res.end(b); } });
});
await new Promise(r => server.listen(8899, r));

const EXE='C:/Users/oem/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe';
const SW = process.argv.includes('--sw');
const browser = await chromium.launch({
  executablePath: EXE,
  headless: true,
  args: SW ? ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']
           : ['--use-angle=d3d11','--ignore-gpu-blocklist','--enable-gpu-rasterization','--enable-zero-copy','--disable-frame-rate-limit','--disable-gpu-vsync']
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const logs = [];
page.on('console', m => logs.push(m.type() + ': ' + m.text().slice(0, 300)));
page.on('pageerror', e => logs.push('PAGEERROR: ' + e.message.slice(0, 300)));
await page.goto('http://localhost:8899/'+(process.env.PAGE||'probe.html')+'');
try {
  await page.waitForFunction(() => window.__probe && window.__probe.done, { timeout: 150000 });
} catch (e) { logs.push('TIMEOUT waiting for done'); }
const r = await page.evaluate(() => window.__probe);
await page.screenshot({ path: path.join(dir, (process.env.PAGE||'probe')+'.png') });
console.log(JSON.stringify({ result: r, logs: logs.slice(0, 60) }, null, 2));
await browser.close();
server.close();
