// 자리 화면 데이터 + 자리 파일 생성 — canvas.json(제목) + masters.mjs STATUS(카테고리·상태·메모)에서 landxi/proto/stub-data.json 을 만들고,
// 원본 파일명 그대로의 자리 HTML 을 landxi/proto/ (과 landxi/ 리다이렉트)에 쓴다. 멱등. usage: node tools/review/stub-data.mjs
import fs from 'node:fs';
const V = 'design-canvas/v2/';
const canvas = JSON.parse(fs.readFileSync(V + 'canvas.json', 'utf8'));
const src = fs.readFileSync('tools/review/masters.mjs', 'utf8');
const STATUS = {}; for (const m of src.matchAll(/^\s*'([^']+)':\s*\['([^']*)',\s*'(apply|review|drop)',\s*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')\]/gm)) STATUS[m[1]] = { cat: m[2], st: m[3], note: JSON.parse(m[4].startsWith("'") ? '"' + m[4].slice(1, -1).replace(/"/g, '\\"') + '"' : m[4]) };
const titleOf = (id) => canvas.artboards.find((a) => a.file === id + '.dc.html')?.title || id;
const rank = (id, s) => (/권장/.test(s.note) ? 0 : /-Opt\d/.test(id) ? 1 : 2);
const live = (f) => Object.entries(STATUS).sort((x, y) => rank(x[0], x[1]) - rank(y[0], y[1])).filter(([id, s]) => s.st !== 'drop' && f(id, s) && fs.existsSync(`${V}renders/${id}.png`)).map(([id, s]) => ({ id, title: titleOf(id), short: titleOf(id).split(' — ').pop().split(' · ').slice(0, 2).join(' · ').slice(0, 40), note: s.note }));
const GROUPS = {
  project: { name: '프로젝트', rail: 'project', decision: 'D5 · 원판 검토 중 (+ 지도 작업공간 컨셉 선택 1·2·3)', boards: [...live((id, s) => s.cat === '프로젝트'), ...live((id, s) => s.cat === '지도 작업공간(컨셉)')] },
  analysis: { name: '분석 서비스', rail: 'analysis', decision: 'D10 · 원판 검토 중', boards: live((id, s) => s.cat === '분석 서비스') },
  map: { name: '지도 서비스', rail: 'map', decision: 'D13 · 원판 검토 중', boards: live((id, s) => s.cat === '지도 서비스') },
  support: { name: '서비스 지원', rail: 'support', decision: 'D23 · 2026-09-20 자동 설계 · 선택 1·2·3', boards: live((id, s) => s.cat === '서비스 지원') },
  publish: { name: '카드 발행 관리', rail: 'publish', decision: 'D24 · 2026-09-20 자동 설계 · 선택 1·2·3', boards: live((id, s) => s.cat === '카드 발행 관리') },
  admin: { name: '서비스 관리', rail: 'admin', decision: 'D25 · 2026-09-20 자동 설계 · 선택 1·2·3', boards: live((id, s) => s.cat === '서비스 관리') },
  my: { name: '마이 페이지', rail: 'my', decision: 'D26 · 2026-09-20 자동 설계 · 선택 1·2·3', boards: live((id) => id.startsWith('B6-My-')) },
  auth: { name: '계정 신청 · 아이디 · 비밀번호 찾기', rail: '', decision: 'D26 · 로그인 카드 가족', boards: live((id) => id.startsWith('B6-Auth-')) },
};
for (const [k, g] of Object.entries(GROUPS)) if (!g.boards.length) { console.warn('빈 그룹', k); g.boards = [{ id: 'B5-Login', title: '원판 준비 중', short: '준비 중', note: '' }]; }
fs.writeFileSync('landxi/proto/stub-data.json', JSON.stringify({ generated: new Date().toISOString().slice(0, 10), groups: GROUPS }, null, 1) + '\n');

// 자리 HTML: [파일, 그룹, 처음 열 원판 id 조각]
const PAGES = [
  ['ai-project.html', 'project', ''], ['ai-project-create.html', 'project', 'Project-Create'], ['analysis-ai.html', 'analysis', ''], ['ximap.html', 'map', ''],
  ['notice.html', 'support', 'Notice'], ['faq.html', 'support', 'FAQ'], ['contact.html', 'support', 'Contact'], ['usecase.html', 'support', 'Usecase'], ['manual.html', 'support', 'Manual'],
  ['admin-publish.html', 'publish', ''], ['ai-card.html', 'publish', 'Cards'],
  ['admin-notice.html', 'admin', 'Notice'], ['admin-inquiry.html', 'admin', 'Inquiry'], ['admin-faq.html', 'admin', 'Faq'], ['admin-users.html', 'admin', 'Users'], ['admin-map.html', 'admin', 'Map'],
  ['mypage.html', 'my', ''], ['signup.html', 'auth', 'Signup'], ['find-id.html', 'auth', 'FindId'], ['find-password.html', 'auth', 'FindPw'],
];
const html = (key, first) => `<!doctype html><html lang="ko" data-stub="${key}" data-first="${first}" data-base=""><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>설계 원판 — Land-XI</title><link rel="icon" href="../assets/images/favicon_landxi.png"><link rel="stylesheet" href="fonts-system.css"><link rel="stylesheet" href="stub.css"></head><body><script type="module" src="stub.js"></script><noscript>이 메뉴는 아직 구현 전입니다. <a href="review/masters.html">원판 갤러리</a>에서 설계 원판을 볼 수 있습니다.</noscript></body></html>\n`;
// 구현된 화면은 덮어쓰지 않는다 — data-stub 표식이 있는 자리 파일(또는 없는 파일)만 쓴다
for (const [f, key, first] of PAGES) { const t = 'landxi/proto/' + f; if (fs.existsSync(t) && !/data-stub=/.test(fs.readFileSync(t, 'utf8'))) continue; fs.writeFileSync(t, html(key, first)); }
// landxi/ 레벨로 나가는 링크(../notice.html · ../mypage.html · ../admin-*.html)는 proto/ 의 자리 화면으로 보낸다
for (const [f] of PAGES.filter(([f]) => /^(notice|mypage|admin-)/.test(f))) { const p = 'landxi/' + f; if (fs.existsSync(p) && !/stub-redirect/.test(fs.readFileSync(p, 'utf8'))) continue; fs.writeFileSync(p, `<!doctype html><meta charset="utf-8"><!-- stub-redirect --><title>Land-XI</title><script>location.replace('proto/${f}' + location.search + location.hash)</script><a href="proto/${f}">이동</a>\n`); }
console.log(Object.entries(GROUPS).map(([k, g]) => `${k} ${g.boards.length}`).join(' · '), '· pages', PAGES.length);
