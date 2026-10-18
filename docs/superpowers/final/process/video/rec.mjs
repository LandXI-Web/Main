// CDP 화면 녹화(원칙 297 소개 영상): jpeg 프레임 + 시각 → ffmpeg 로 30fps mp4
import fs from 'node:fs'; import path from 'node:path'; import { execFileSync } from 'node:child_process';
export const CURSOR = `(() => { if (window.__cur) return; const mk = () => { if (!document.body || document.getElementById('__cur')) return;
  const d = document.createElement('div'); d.id = '__cur';
  d.style.cssText = 'position:fixed;left:0;top:0;width:22px;height:22px;margin:-11px 0 0 -11px;border-radius:50%;background:rgba(49,130,246,.28);border:2px solid rgba(255,255,255,.95);box-shadow:0 1px 6px rgba(0,0,0,.35);pointer-events:none;z-index:2147483647;transition:transform .12s ease, background .12s;transform:translate(-100px,-100px)';
  document.body.appendChild(d); window.__cur = d; };
  const st = { x: -100, y: -100, s: 1 };
  const ap = () => { const d = document.getElementById('__cur'); if (d) d.style.transform = 'translate(' + st.x + 'px,' + st.y + 'px) scale(' + st.s + ')'; };
  addEventListener('mousemove', (e) => { mk(); st.x = e.clientX; st.y = e.clientY; ap(); }, true);
  addEventListener('mousedown', () => { st.s = .7; ap(); }, true);
  addEventListener('mouseup', () => { st.s = 1; ap(); }, true);
  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', mk); else mk();
  try { const s = JSON.parse(sessionStorage.getItem('__curpos') || 'null'); if (s) { st.x = s[0]; st.y = s[1]; setTimeout(ap, 50); } } catch {}
  addEventListener('mousemove', (e) => { try { sessionStorage.setItem('__curpos', JSON.stringify([e.clientX, e.clientY])); } catch {} }, true);
})();`;
export class Rec {
  constructor(page, dir) { this.page = page; this.dir = dir; this.frames = []; this.on = false; }
  async start() {
    fs.rmSync(this.dir, { recursive: true, force: true }); fs.mkdirSync(this.dir, { recursive: true });
    this.cdp = await this.page.context().newCDPSession(this.page); this.n = 0; this.on = true; this.t0 = null;
    this.cdp.on('Page.screencastFrame', async (f) => {
      try { await this.cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }); } catch {}
      if (!this.on) return;
      const ts = f.metadata.timestamp; if (this.t0 === null) this.t0 = ts;
      const fn = `f${String(this.n++).padStart(6, '0')}.jpg`;
      fs.writeFileSync(path.join(this.dir, fn), Buffer.from(f.data, 'base64')); this.frames.push([fn, ts - this.t0]);
    });
    await this.cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: 1920, maxHeight: 1080, everyNthFrame: 1 });
  }
  mark(name) { const t = this.t0 === null ? 0 : Date.now() / 1000 - this.t0; (this.marks ||= {})[name] = +t.toFixed(2); return t; }
  async stop(out) {
    // 마지막 프레임 유지 시간 확보
    const tEnd = this.t0 === null ? 0 : Date.now() / 1000 - this.t0; this.on = false;
    try { await this.cdp.send('Page.stopScreencast'); } catch {}
    const F = this.frames; if (!F.length) throw new Error('no frames');
        let s = '';
    for (let i = 0; i < F.length; i++) { const d = (i + 1 < F.length ? F[i + 1][1] : Math.max(F[i][1] + 0.1, tEnd)) - F[i][1]; s += `file '${F[i][0]}'\nduration ${Math.max(d, 0.001).toFixed(4)}\n`; }
    s += `file '${F[F.length - 1][0]}'\n`;
    fs.writeFileSync(path.join(this.dir, 'list.txt'), s);
    fs.writeFileSync(path.join(this.dir, 'frames.json'), JSON.stringify(F));
    fs.writeFileSync(out.replace(/\.mp4$/, '.marks.json'), JSON.stringify(this.marks || {}, null, 1));
    execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', 'list.txt', '-vf', 'scale=1920:1080:flags=lanczos,fps=30,format=yuv420p', '-c:v', 'libx264', '-preset', 'slow', '-crf', '14', '-r', '30', path.resolve(out)], { cwd: this.dir });
    if (!process.env.KEEP_FRAMES) fs.rmSync(this.dir, { recursive: true, force: true });
    return { frames: F.length, dur: +tEnd.toFixed(2) };
  }
}
