/* 학습 데이터 묶음(zip) 올리기 한 곳 — 프로젝트 학습데이터 구축(lx-train/flow.js)과 LX 관리자 '공유 데이터 · 학습 데이터 올리기'가 같은 길.
   형식: images/ · labels/(YOLO txt) · dataset.yaml 또는 classes.txt(클래스 이름) · 그림 200장 이하 · 서버 /training/uploads(나눠 올리기). */
import { api, API, session } from './util.js';
import { devlog } from './dev-drawer.js';

export const MAX_IMAGES = 200;
const IMG_RE = /\.(jpe?g|png|tiff?|bmp)$/;
const MB = (b) => (b / 1048576).toFixed(b < 10485760 ? 1 : 0);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** zip 목차(끝부분 중앙 디렉터리)만 읽어 그림·라벨·클래스 이름 파일을 센다 — 올리기 전에 거절 사유를 알린다(파일 전체를 읽지 않음).
    ZIP64 · 읽기 실패면 null(서버가 판정). */
export async function zipPeek(file) {
  try {
    const tl = Math.min(file.size, 65557);
    const tail = new DataView(await file.slice(file.size - tl).arrayBuffer());
    let e = -1;
    for (let i = tl - 22; i >= 0; i--) if (tail.getUint32(i, true) === 0x06054b50) { e = i; break; }
    if (e < 0) return { bad: true };
    const n = tail.getUint16(e + 10, true), size = tail.getUint32(e + 12, true), off = tail.getUint32(e + 16, true);
    if (n === 0xffff || off === 0xffffffff || size === 0xffffffff) return null;
    if (off + size > file.size) return { bad: true };
    const cd = await file.slice(off, off + size).arrayBuffer();
    const v = new DataView(cd), dec = new TextDecoder('utf-8');
    let p = 0, images = 0, labels = 0, names = false;
    for (let k = 0; k < n && p + 46 <= cd.byteLength; k++) {
      if (v.getUint32(p, true) !== 0x02014b50) break;
      const fl = v.getUint16(p + 28, true), xl = v.getUint16(p + 30, true), cl = v.getUint16(p + 32, true);
      const low = dec.decode(new Uint8Array(cd, p + 46, fl)).replace(/\\/g, '/').toLowerCase();
      if (!low.endsWith('/') && !low.startsWith('__macosx')) {
        const parts = low.split('/');
        if (parts.includes('images') && IMG_RE.test(low)) images++;
        else if (parts.includes('labels') && low.endsWith('.txt') && !low.endsWith('classes.txt')) labels++;
        else if (/\.ya?ml$/.test(low) || low.endsWith('classes.txt')) names = true;
      }
      p += 46 + fl + xl + cl;
    }
    return { images, labels, names };
  } catch { return null; }
}

/** 목차로 본 거절 사유(없으면 null) */
export function peekWhy(pk) {
  return !pk ? null : pk.bad ? 'zip 파일을 열 수 없습니다' : !pk.images ? '그림(images 폴더)이 없습니다'
    : !pk.labels ? '라벨(labels 폴더)이 없습니다' : pk.images > MAX_IMAGES ? `그림이 ${pk.images.toLocaleString('ko-KR')}장입니다 — 한 번에 ${MAX_IMAGES}장 이하입니다`
      : !pk.names ? '클래스 이름(dataset.yaml)이 없습니다' : null;
}

/** 나눠 올리기 — 조각마다 한 요청(바깥 주소 앞단의 요청 한 번 100초 한도 · 한 번에 올리면 큰 묶음이 끊겼다).
    조각 크기는 잰 속도로 약 30초 분량(256 KB–8 MB). 끊기면 받은 자리부터 이어 간다(같은 파일을 다시 골라도).
    onStart(st) = 서버가 알려 준 한도 · onProg(받은 바이트, 전체, 남은 초) → 다 받으면 표본(GET /training/samples/{id} 와 같은 모양) */
export async function sendChunked(f, body, onProg, onStart) {
  const tok = session.get()?.token;
  const st = await api('/training/uploads', { method: 'POST', body: { ...body, filename: f.name, size: f.size, key: `${f.name}|${f.size}|${f.lastModified}` } });
  onStart?.(st);
  const maxC = st.chunk?.max?.size || 8 * 1048576;
  let off = st.bytes || 0, chunk = Math.min(maxC, 512 * 1024), fails = 0;
  const t0 = performance.now(), off0 = off;
  onProg(off, f.size, null);
  while (off < f.size) {
    const end = Math.min(f.size, off + chunk);
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 95000);
    const ts = performance.now();
    let r = null;
    try {
      r = await fetch(API.prefix + `/training/uploads/${encodeURIComponent(st.id)}?offset=${off}`, { method: 'PUT', body: f.slice(off, end), signal: ac.signal,
        headers: { 'content-type': 'application/octet-stream', ...(tok ? { authorization: 'Bearer ' + tok } : {}) } });
    } catch { r = null; }
    clearTimeout(timer);
    const j = r ? await r.json().catch(() => null) : null;
    if (r && r.ok && j) {
      const sec = Math.max(0.2, (performance.now() - ts) / 1000);
      chunk = Math.max(256 * 1024, Math.min(maxC, Math.round(((j.bytes - off) / sec) * 30)));   // 다음 조각 ≈ 30초 분량
      off = j.bytes; fails = 0;
    } else if (r && r.status === 409 && j?.error?.detail?.bytes != null) {
      off = j.error.detail.bytes;                                        // 서버가 받은 자리부터
    } else if (r && [400, 401, 403, 404, 413].includes(r.status)) {
      throw Object.assign(new Error(j?.error?.message || 'upload'), { user: r.status === 401 ? '로그인이 끝났습니다 — 다시 로그인해 주세요' : j?.error?.message });
    } else {
      fails++; chunk = Math.max(256 * 1024, Math.round(chunk / 2));
      devlog('upload', `조각 실패 ${fails} · ${r ? r.status : '연결 끊김'} · 다음 조각 ${MB(chunk)} MB`);
      if (fails > 5) throw Object.assign(new Error('network'), { user: `연결이 여러 번 끊겨 멈췄습니다 — ${MB(f.size)} MB 중 ${MB(off)} MB 올림. 다시 누르면 이어서 올립니다` });
      await wait(1500 * fails);
    }
    const bps = (off - off0) / Math.max(0.5, (performance.now() - t0) / 1000);
    onProg(off, f.size, bps > 0 ? (f.size - off) / bps : null);
  }
  return api(`/training/uploads/${encodeURIComponent(st.id)}/finish`, { method: 'POST', body: {} });
}
