import { chromium } from '@playwright/test';
export const BASE = 'http://localhost:4173/landxi/proto/';
import { fileURLToPath } from 'url'; import path from 'path';
export const OUT = path.dirname(fileURLToPath(import.meta.url)) + path.sep;
export async function launch() { return chromium.launch({ channel: 'chrome' }); }
export async function ctx(browser, role = 'staff', vp = { width: 1440, height: 900 }) {
  const c = await browser.newContext({ viewport: vp });
  await c.addInitScript((r) => { try { localStorage.setItem('lx_logged_in', '1'); localStorage.setItem('lx_role', r); } catch {} }, role);
  return c;
}
export function watch(page, log) {
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') log.push({ t: 'console-' + m.type(), url: page.url(), text: m.text().slice(0, 300) }); });
  page.on('pageerror', (e) => log.push({ t: 'pageerror', url: page.url(), text: String(e).slice(0, 300) }));
  page.on('requestfailed', (r) => log.push({ t: 'reqfail', url: r.url(), text: r.failure()?.errorText }));
  page.on('response', (r) => { if (r.status() >= 400) log.push({ t: 'http' + r.status(), url: r.url() }); });
}
export async function measure(page) {
  return page.evaluate(() => {
    const out = { hOverflow: document.documentElement.scrollWidth - innerWidth, vOverflow: document.documentElement.scrollHeight - innerHeight, small: [], shadow: [], radius: [], gradient: [], blur: [], clipped: [] };
    const seen = new Set();
    for (const el of document.querySelectorAll('body *')) {
      const cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden') continue;
      const r = el.getBoundingClientRect(); if (!r.width || !r.height) continue;
      if (el.closest('.maplibregl-map canvas')) continue;
      const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
      const lab = (el.tagName + '.' + (el.className?.baseVal ?? el.className)).slice(0, 60) + ' «' + (el.textContent || '').trim().slice(0, 30) + '»';
      if (own && parseFloat(cs.fontSize) < 14 && !seen.has(lab)) { seen.add(lab); out.small.push(cs.fontSize + ' ' + lab); }
      if (cs.boxShadow !== 'none') out.shadow.push(cs.boxShadow.slice(0, 40) + ' ' + lab);
      if (parseFloat(cs.borderTopLeftRadius) > 0 && !/maplibregl/.test(el.className)) out.radius.push(cs.borderTopLeftRadius + ' ' + lab);
      if (/gradient/.test(cs.backgroundImage)) out.gradient.push(lab);
      if (cs.backdropFilter && cs.backdropFilter !== 'none') out.blur.push(lab);
      if (own && (el.scrollWidth > el.clientWidth + 1) && (cs.overflow === 'hidden' || cs.textOverflow === 'ellipsis') ) out.clipped.push(lab);
    }
    for (const k of ['small', 'shadow', 'radius', 'gradient', 'blur', 'clipped']) out[k + 'N'] = out[k].length, out[k] = out[k].slice(0, 25);
    return out;
  });
}
