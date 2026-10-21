import fs from 'node:fs'; import path from 'node:path'; import { createRequire } from 'node:module'; import { pathToFileURL, fileURLToPath } from 'node:url';
export const ROOT = 'E:/Land-XI 플랫폼/01. 디자인';
const HW = 'C:/Users/User/AppData/Local/ms-playwright';
if (fs.existsSync(path.join(HW, 'chromium-1234'))) process.env.PLAYWRIGHT_BROWSERS_PATH = HW;
if (!process.env.DEV_PASSWORD) { const m = fs.readFileSync(path.join(ROOT, 'server/.env'), 'utf8').match(/^DEV_PASSWORD=(.*?)\s*$/m); if (m) process.env.DEV_PASSWORD = m[1]; }
process.env.LX_PW ||= process.env.DEV_PASSWORD;
export const { chromium } = createRequire(path.join(ROOT, 'package.json'))('playwright');
export const { frontDoor } = await import(pathToFileURL(path.join(ROOT, 'landxi/v3/kit/lint/forbidden.mjs')).href);
export const HERE = path.dirname(fileURLToPath(import.meta.url));
export const SHOTS = path.join(HERE, 'shots');
