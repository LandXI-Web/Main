#!/usr/bin/env node
// AI Hub(NIA) 학습 데이터 받기 도구 — Land-XI 표준 층 공유 데이터로 들이기 위한 것.
//
// 공식 내려받기 도구 aihubshell(v0.6, https://api.aihub.or.kr/api/aihubshell.do)과 같은 주소를 쓴다.
//   목록      GET https://api.aihub.or.kr/info/dataset.do          (키 없이)
//   파일 목록 GET https://api.aihub.or.kr/info/{번호}.do            (키 없이 · 파일 이름 · 용량 · filekey)
//   내려받기  GET https://api.aihub.or.kr/down/0.6/{번호}.do?fileSn={filekey,…|all}  머리글 apikey: {키}
//             → tar 묶음. 풀면 큰 파일이 *.partN 으로 쪼개져 있어 이어 붙여야 한다.
//             사전 조건: aihub.or.kr 데이터셋 페이지에서 '다운로드' 눌러 이용신청 → 승인 완료(데이터셋마다).
//
// 키: 환경 변수 AIHUB_APIKEY 또는 server/.env 의 AIHUB_APIKEY= 한 곳. 값은 화면 · 기록 어디에도 찍지 않는다.
// 윈도우에서도 WSL 없이 동작(tar 는 윈도우 기본 tar · 조각 이어 붙이기는 Node · 분할 zip 은 반디집/7-Zip).
//
// 명령
//   node aihub.mjs catalog [--all] [--out 파일]       공개 목록(키 없이). 기본은 영상 · 공간 관련만 거름
//   node aihub.mjs tree <번호> [--json]               파일 목록 · 용량 · filekey(키 없이)
//   node aihub.mjs meta <번호>                        소개 페이지에서 판(버전) · 갱신 · 내국인 제한
//   node aihub.mjs survey [--out 파일]                candidates.json 전부 tree+meta → 한 파일
//   node aihub.mjs compare [번호] [--local 폴더] [--out 파일]  이 PC 보유본과 공식 파일 이름 대조(키 없이)
//   node aihub.mjs plan <번호> [--only 정규식] [--dest 폴더] [--cap GB]
//                                                    받을 용량 · 디스크 여유(용량 x3) · 한도 확인. 받지 않음
//   node aihub.mjs status <번호>                      (키 필요) 이용신청 승인 여부 — 가장 작은 파일로 응답만 보고 끊음
//   node aihub.mjs get <번호> [--only 정규식 | --filekey a,b] [--dest 폴더] [--cap GB] [--unzip] --yes
//                                                    (키 · 승인 필요) 이어 받기 → 풀기 → 이어 붙이기 → 자산 대장 등록
import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..');           // 01. 디자인
const BASE = 'https://api.aihub.or.kr';
const VER = '0.6';                                      // aihubshell 25.09.19 v0.6 의 내려받기 주소 판
const VIEW = (k) => `https://www.aihub.or.kr/aihubdata/data/view.do?currMenu=115&topMenu=100&dataSetSn=${k}`;
const TERMS_URL = 'https://aihub.or.kr/intrcn/guid/usagepolicy.do';
const TERMS = {
  출처: 'AI 허브(한국지능정보사회진흥원)',
  이용목적: '영리 · 비영리 연구 · 개발 가능. 학습한 모델 · 서비스는 상업적 이용 가능',
  출처표시: '모델 · 결과물에 데이터셋 이름과 한국지능정보사회진흥원 사업 결과임을 밝힘',
  재배포: '원본 · 가공본(편집 · 추출 · 분할 · 형식 변환 포함)을 제3자에게 제공 · 판매 금지 — 플랫폼 안 공유만',
  국외: '국외 반출 · 국외 기관 이용은 수행기관 · 한국지능정보사회진흥원과 별도 합의',
  신청자격: '데이터셋 페이지 표기: 내국인만 신청 가능',
  원문: TERMS_URL,
};
const GEO_RE = /위성|항공|드론|토지|피복|건물|농경|작물|비닐|도로 정비|하천|산림|수종|탄소|해안|쓰레기|변화|재난|재해|피해|침수|홍수|수변|국립공원|태양광|3차원|공간|습지|비점/;

// ---------- 공통 ----------
function args(argv) {
  const o = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const k = a.slice(2);
      const v = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
      o[k] = v;
    } else o._.push(a);
  }
  return o;
}
function readEnv(name) {
  if (process.env[name]) return process.env[name].trim();
  const f = path.join(REPO, 'server', '.env');
  if (!fs.existsSync(f)) return '';
  for (const line of fs.readFileSync(f, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && m[1] === name) return m[2].replace(/^["']|["']$/g, '').trim();
  }
  return '';
}
function apiKey() {
  const k = readEnv('AIHUB_APIKEY');
  if (!k) {
    console.error('AI Hub 키가 없습니다. server/.env 의 AIHUB_APIKEY= 에 사용자가 직접 넣어 주세요(값은 어디에도 적지 않음).');
    process.exit(2);
  }
  return k;
}
function defaultDest() {
  return readEnv('AIHUB_DIR') || path.join(readEnv('LX_DATA_ROOT') || path.resolve(REPO, '..', '02. 데이터'), 'training', 'aihub');
}
function get(url, headers = {}) {
  return new Promise((res, rej) => {
    https.get(url, { headers: { 'User-Agent': 'Land-XI aihub tool', ...headers } }, (r) => {
      if (r.statusCode >= 300 && r.statusCode < 400 && r.headers.location) {
        r.resume(); return get(new URL(r.headers.location, url).href, headers).then(res, rej);
      }
      const bufs = []; r.on('data', (d) => bufs.push(d));
      r.on('end', () => res({ status: r.statusCode, headers: r.headers, body: Buffer.concat(bufs).toString('utf8') }));
    }).on('error', rej);
  });
}
const UNIT = { B: 1, KB: 1024, MB: 1024 ** 2, GB: 1024 ** 3, TB: 1024 ** 4 };
const gb = (b) => (b / 1024 ** 3).toFixed(b < 10 * 1024 ** 3 ? 2 : 0);
function freeBytes(dir) {
  let d = path.resolve(dir);
  while (!fs.existsSync(d)) d = path.dirname(d);
  const s = fs.statfsSync(d);
  return s.bavail * s.bsize;
}

// ---------- 목록 ----------
async function catalog() {
  const r = await get(`${BASE}/info/dataset.do`);
  const items = [];
  for (const line of r.body.split(/\r?\n/)) {
    const m = line.match(/^\s*(\d+)\s*,\s*(.+?)\s*$/);
    if (m) items.push({ key: Number(m[1]), name: m[2] });
  }
  return items;
}
// 파일 트리: "│  ├─이름.zip | 4 GB | 524255" — 들여쓰기 칸 위치로 부모를 찾는다.
function parseTree(text) {
  const files = []; const stack = []; const notice = [];
  let inNotice = false;
  for (const raw of text.split(/\r?\n/)) {
    if (/공지사항/.test(raw)) { inNotice = true; continue; }
    if (/^=+\s*$/.test(raw.trim())) { inNotice = false; continue; }
    const m = raw.match(/^(.*?)(├─|└─)(.*)$/);
    if (!m) { if (inNotice && raw.trim()) notice.push(raw.trim()); continue; }
    const col = m[1].length; const body = m[3].trim();
    while (stack.length && stack[stack.length - 1].col >= col) stack.pop();
    const parts = body.split('|').map((s) => s.trim());
    if (parts.length >= 3) {
      const sm = parts[1].match(/([\d.]+)\s*(B|KB|MB|GB|TB)/i);
      const size = sm ? Math.round(parseFloat(sm[1]) * UNIT[sm[2].toUpperCase()]) : 0;
      files.push({ path: [...stack.map((s) => s.name), parts[0]].join('/'), size, sizeText: parts[1], filekey: parts[2] });
    } else stack.push({ col, name: body });
  }
  return { files, notice };
}
async function tree(key) {
  const r = await get(`${BASE}/info/${key}.do`);
  const t = parseTree(r.body);
  return { key: Number(key), ...t, total: t.files.reduce((a, f) => a + f.size, 0) };
}
async function meta(key) {
  const r = await get(VIEW(key));
  const t = r.body.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, '\n')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/[ \t\r]+/g, ' ');
  const pick = (re) => (t.match(re) || [])[1] || null;
  // 변경이력 표의 첫 줄(가장 최근 판)
  const hist = t.match(/데이터 변경이력[\s\S]*?비고\s*\n\s*([\d.]+)\s*\n\s*(\d{4}-\d{2}-\d{2})/);
  return {
    key: Number(key),
    built: pick(/구축년도\s*:\s*(\d{4})/),
    updated: pick(/갱신년월\s*:\s*([\d-]+)/),
    version: hist ? hist[1] : null,
    versionDate: hist ? hist[2] : null,
    koreanOnly: /내국인만 데이터 신청이 가능/.test(t),
    page: VIEW(key),
  };
}

// ---------- 받을 계획 ----------
function select(files, o) {
  if (o.filekey) { const ks = String(o.filekey).split(','); return files.filter((f) => ks.includes(f.filekey)); }
  if (o.only) { const re = new RegExp(o.only); return files.filter((f) => re.test(f.path)); }
  return files;
}
async function plan(key, o) {
  const t = await tree(key);
  const sel = select(t.files, o);
  const bytes = sel.reduce((a, f) => a + f.size, 0);
  const dest = path.resolve(o.dest || defaultDest());
  const free = freeBytes(dest);
  const need = bytes * 3; // 공식 안내: 받는 용량의 2~3배 여유
  const capGB = o.cap ? Number(o.cap) : Number(readEnv('AIHUB_CAP_GB') || 0);
  const used = fs.existsSync(dest) ? dirBytes(dest) : 0;
  const capOk = !capGB || used + bytes <= capGB * 1024 ** 3;
  return { key: Number(key), files: sel, bytes, dest, free, need, diskOk: free >= need, capGB: capGB || null, used, capOk, notice: t.notice };
}
function dirBytes(d) {
  let s = 0;
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    s += e.isDirectory() ? dirBytes(p) : fs.statSync(p).size;
  }
  return s;
}
function printPlan(p) {
  console.log(`데이터셋 ${p.key} · 파일 ${p.files.length}개 · 약 ${gb(p.bytes)} GB`);
  console.log(`받을 곳 ${p.dest}`);
  console.log(`디스크 여유 ${gb(p.free)} GB / 필요(용량 x3) ${gb(p.need)} GB → ${p.diskOk ? '충분' : '부족'}`);
  if (p.capGB) console.log(`한도 ${p.capGB} GB · 이미 ${gb(p.used)} GB → ${p.capOk ? '안' : '넘음'}`);
  if (p.notice.length) console.log('AI Hub 공지:', p.notice.join(' / '));
}

// ---------- 키 필요 ----------
function downloadUrl(key, filekeys) { return `${BASE}/down/${VER}/${key}.do?fileSn=${filekeys}`; }
async function status(key) {
  const k = apiKey();
  const t = await tree(key);
  if (!t.files.length) { console.log('파일 목록이 비었습니다(번호 확인).'); return; }
  const smallest = [...t.files].sort((a, b) => a.size - b.size)[0];
  await new Promise((res) => {
    const go = (u, hop = 0) => { const req = https.get(u, { headers: { apikey: k, 'User-Agent': 'Land-XI aihub tool' } }, (r) => {
      // 승인되면 서버가 실제 파일 주소로 넘긴다(302) — 따라가서 본다(주소는 출력하지 않음)
      if (r.statusCode >= 300 && r.statusCode < 400 && r.headers.location && hop < 5) { r.resume(); return go(new URL(r.headers.location, u).href, hop + 1); }
      const ct = r.headers['content-type'] || '';
      if (r.statusCode === 200 && !/json|html|text/.test(ct)) {
        console.log(`승인됨 — 받기 가능(응답 ${r.statusCode}). 확인만 하고 끊었습니다.`);
        r.destroy(); req.destroy(); return res();
      }
      let b = ''; r.on('data', (d) => { b += d; if (b.length > 4000) r.destroy(); });
      r.on('close', () => { console.log(`받을 수 없음 — 응답 ${r.statusCode}${hop ? ' (넘겨받은 뒤)' : ''}: ${b.replace(/\s+/g, ' ').slice(0, 300)}`); res(); });
    });
    req.on('error', (e) => { console.log('연결 오류', e.message); res(); }); };
    go(downloadUrl(key, smallest.filekey));
  });
}
function downloadResume(url, k, out) {
  return new Promise((res, rej) => {
    const have = fs.existsSync(out) ? fs.statSync(out).size : 0;
    const headers = { apikey: k, 'User-Agent': 'Land-XI aihub tool' };
    if (have) headers.Range = `bytes=${have}-`;
    const go = (u) => https.get(u, { headers }, (r) => {
      if (r.statusCode >= 300 && r.statusCode < 400 && r.headers.location) { r.resume(); return go(new URL(r.headers.location, u).href); }
      if (r.statusCode === 416) { r.resume(); return res({ resumed: have, done: true }); }
      if (r.statusCode !== 200 && r.statusCode !== 206) {
        let b = ''; r.on('data', (d) => (b += d)); r.on('end', () => rej(new Error(`응답 ${r.statusCode}: ${b.slice(0, 300)}`))); return;
      }
      const append = r.statusCode === 206 && have > 0;          // 서버가 이어 받기를 받아 주면 덧붙임, 아니면 처음부터
      const ws = fs.createWriteStream(out, { flags: append ? 'a' : 'w' });
      let n = append ? have : 0; let last = Date.now();
      r.on('data', (d) => { n += d.length; if (Date.now() - last > 5000) { last = Date.now(); process.stdout.write(`\r  ${gb(n)} GB 받음`); } });
      r.pipe(ws);
      ws.on('finish', () => { process.stdout.write('\n'); res({ resumed: append ? have : 0, bytes: n }); });
      r.on('error', rej);
    }).on('error', rej);
    go(url);
  });
}
function mergeParts(root) {
  const groups = new Map();
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else { const m = e.name.match(/^(.*)\.part(\d+)$/); if (m) { const k = path.join(d, m[1]); if (!groups.has(k)) groups.set(k, []); groups.get(k).push({ p, n: Number(m[2]) }); } }
    }
  };
  walk(root);
  for (const [target, parts] of groups) {
    parts.sort((a, b) => a.n - b.n);
    const fd = fs.openSync(target, 'w');
    const buf = Buffer.allocUnsafe(64 * 1024 * 1024);   // 조각이 커도 메모리에 다 올리지 않음
    for (const { p } of parts) {
      const rd = fs.openSync(p, 'r'); let n;
      while ((n = fs.readSync(rd, buf, 0, buf.length, null)) > 0) fs.writeSync(fd, buf, 0, n);
      fs.closeSync(rd);
    }
    fs.closeSync(fd);
    if (fs.statSync(target).size === 0) throw new Error(`이어 붙인 파일 크기 0: ${target}`);
    for (const { p } of parts) fs.unlinkSync(p);
    console.log(`  이어 붙임 ${path.basename(target)} (${parts.length}조각)`);
  }
  return groups.size;
}
// zip 풀기 — AI Hub 원천은 분할 zip(TS.z01 · TS.z02 · TS.zip)이 많아 윈도우 기본 tar 로는 못 푼다.
// 반디집 명령줄(bz.exe) → 7-Zip → (분할 아닌 것만) tar 순서로 찾는다. 한글 파일 이름도 반디집 · 7-Zip 이 처리.
function unzipAll(dir) {
  const cands = [process.env.AIHUB_UNZIP, 'C:/Program Files/Bandizip/bz.exe', 'C:/Program Files/7-Zip/7z.exe'].filter(Boolean);
  const tool = cands.find((p) => fs.existsSync(p));
  const zips = [];
  const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (/\.zip$/i.test(e.name)) zips.push(p); } };
  walk(dir);
  for (const z of zips) {
    const out = z.replace(/\.zip$/i, '');
    const split = fs.existsSync(z.replace(/\.zip$/i, '.z01'));
    let r;
    if (tool && /bz\.exe$/i.test(tool)) r = spawnSync(tool, ['x', '-y', `-o:${out}`, z], { stdio: 'inherit' });
    else if (tool) r = spawnSync(tool, ['x', '-y', `-o${out}`, z], { stdio: 'inherit' });
    else if (!split) { fs.mkdirSync(out, { recursive: true }); r = spawnSync('tar', ['-xf', z, '-C', out], { stdio: 'inherit' }); }
    else { console.log(`  분할 zip 은 반디집 또는 7-Zip 이 있어야 풉니다: ${path.basename(z)}`); continue; }
    console.log(`  ${r.status === 0 ? '풀림' : '풀기 실패'} ${path.basename(z)}${split ? '(분할)' : ''}`);
  }
}
async function getCmd(key, o) {
  const p = await plan(key, o);
  printPlan(p);
  if (!p.files.length) { console.log('받을 파일이 없습니다.'); return; }
  if (!p.diskOk || !p.capOk) { console.log('디스크 여유 또는 한도가 모자라 멈춥니다.'); process.exit(3); }
  if (!o.yes) { console.log('계획만 보였습니다. 실제로 받으려면 --yes 를 붙이세요(LX 관리자 확인 뒤).'); return; }
  const k = apiKey();
  const m = await meta(key);
  const dir = path.join(p.dest, String(key)); fs.mkdirSync(dir, { recursive: true });
  const keys = p.files.length === (await tree(key)).files.length ? 'all' : p.files.map((f) => f.filekey).join(',');
  const tarPath = path.join(dir, `download-${keys === 'all' ? 'all' : p.files.length + 'files'}.tar`);
  console.log('받는 중(끊겨도 같은 명령으로 이어 받음)…');
  await downloadResume(downloadUrl(key, keys), k, tarPath);
  console.log('풀기…');
  const tr = spawnSync('tar', ['-xf', tarPath, '-C', dir], { stdio: 'inherit' });
  if (tr.status !== 0) throw new Error('tar 풀기 실패');
  mergeParts(dir);
  fs.unlinkSync(tarPath);
  if (o.unzip) unzipAll(dir);          // 기본은 zip 그대로 보관(클래스 층 만들 때 필요한 것만 풂)
  const entry = {
    key: Number(key), name: (await catalog()).find((c) => c.key === Number(key))?.name || null,
    source: TERMS.출처, terms: TERMS, version: m.version, versionDate: m.versionDate, updated: m.updated,
    receivedAt: new Date().toISOString(), dir,
    files: p.files.map((f) => ({ path: f.path, filekey: f.filekey, sizeText: f.sizeText })),
    layer: '표준 후보', classLayer: '아직(클래스 층 만들기 전)',
  };
  fs.writeFileSync(path.join(dir, 'SOURCE.json'), JSON.stringify(entry, null, 2));
  const ledgerPath = path.join(p.dest, 'ledger.json');
  const ledger = fs.existsSync(ledgerPath) ? JSON.parse(fs.readFileSync(ledgerPath, 'utf8')) : [];
  ledger.push(entry); fs.writeFileSync(ledgerPath, JSON.stringify(ledger, null, 2));
  console.log(`대장 등록 ${ledgerPath}`);
}

// ---------- 실행 ----------
const o = args(process.argv.slice(2));
const [cmd, key] = o._;
try {
  if (cmd === 'catalog') {
    let items = await catalog();
    if (!o.all) items = items.filter((i) => GEO_RE.test(i.name));
    if (o.out) fs.writeFileSync(o.out, JSON.stringify({ fetchedAt: new Date().toISOString(), items }, null, 2));
    else for (const i of items) console.log(`${i.key}\t${i.name}`);
    console.error(`${items.length}건`);
  } else if (cmd === 'tree') {
    const t = await tree(key);
    if (o.json) console.log(JSON.stringify(t, null, 2));
    else { for (const f of t.files) console.log(`${f.filekey}\t${f.sizeText}\t${f.path}`); console.log(`합계 약 ${gb(t.total)} GB · ${t.files.length}개`); }
  } else if (cmd === 'meta') {
    console.log(JSON.stringify(await meta(key), null, 2));
  } else if (cmd === 'survey') {
    const cand = JSON.parse(fs.readFileSync(path.join(HERE, 'candidates.json'), 'utf8')).candidates;
    const cat = await catalog();
    const out = [];
    for (const c of cand) {
      const t = await tree(c.key); const m = await meta(c.key);
      const lab = t.files.filter((f) => /라벨|label|TL_|VL_/i.test(f.path)).reduce((a, f) => a + f.size, 0);
      const { localDir, ...pub } = c; out.push({ ...pub, inOpenList: cat.some((x) => x.key === c.key), files: t.files.length, totalGB: Number(gb(t.total)), labelGB: Number(gb(lab)), version: m.version, versionDate: m.versionDate, built: m.built, updated: m.updated, koreanOnly: m.koreanOnly, page: m.page });
      console.error(`${c.key} ${c.name} · ${gb(t.total)} GB · 판 ${m.version}`);
      await new Promise((r) => setTimeout(r, 400));
    }
    const res = { checkedAt: new Date().toISOString(), terms: TERMS, items: out };
    if (o.out) fs.writeFileSync(o.out, JSON.stringify(res, null, 2)); else console.log(JSON.stringify(res, null, 2));
  } else if (cmd === 'compare') {
    // 이 PC 보유본과 공식 파일 목록을 파일 이름으로 대조(받기 전에 '이미 가진 것'을 빼기 위함)
    const cand = JSON.parse(fs.readFileSync(path.join(HERE, 'candidates.json'), 'utf8')).candidates;
    const list = key ? cand.filter((c) => c.key === Number(key)) : cand.filter((c) => c.localDir);
    const res = [];
    for (const c of list) {
      const dir = o.local || c.localDir;
      if (!dir || !fs.existsSync(dir)) { res.push({ key: c.key, local: null }); continue; }
      const names = new Map();
      const walk = (d, depth) => { if (depth > 8) return; for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p, depth + 1); else names.set(e.name.normalize('NFC'), p); } };
      walk(dir, 0);
      const t = await tree(c.key);
      const have = t.files.filter((f) => names.has(path.basename(f.path).normalize('NFC')));
      const miss = t.files.filter((f) => !names.has(path.basename(f.path).normalize('NFC')));
      const r = { key: c.key, name: c.name, officialFiles: t.files.length, haveFiles: have.length, haveGB: Number(gb(have.reduce((a, f) => a + f.size, 0))), missGB: Number(gb(miss.reduce((a, f) => a + f.size, 0))), missing: miss.map((f) => f.path) };
      res.push(r);
      console.error(`${c.key} ${c.name}: 공식 ${r.officialFiles}개 중 이름 일치 ${r.haveFiles}개 · 없는 것 약 ${r.missGB} GB`);
    }
    if (o.out) fs.writeFileSync(o.out, JSON.stringify({ checkedAt: new Date().toISOString(), items: res }, null, 2));
  } else if (cmd === 'plan') {
    printPlan(await plan(key, o));
  } else if (cmd === 'status') {
    await status(key);
  } else if (cmd === 'get') {
    await getCmd(key, o);
  } else {
    console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(1, 24).join('\n'));
  }
} catch (e) { console.error('오류:', e.message); process.exit(1); }
