// 바퀴 15 시간 표 — 지난 재검수(impl-36 recheck time-after*.json 가운데 값) · 이번 전(time-before.json) · 이번 후(time-after*.json 가운데 값) + 서버 시간(X-LX-Time-ms 가장 긴 요청 · 합)
//   node table.mjs → time-table.md
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const P36 = path.join(HERE, '../../impl-36/recheck');
const rd = (f) => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : {});
const runs = (dir, re) => fs.readdirSync(dir).filter((f) => re.test(f)).map((f) => rd(path.join(dir, f)));
const prev = runs(P36, /^time-after\d*\.json$/), before = [rd(path.join(HERE, 'time-before.json'))], after = runs(HERE, /^time-after\d*\.json$/);
const med = (a) => { const v = a.filter((x) => x != null).sort((x, y) => x - y); return v.length ? v[Math.floor((v.length - 1) / 2)] : null; };
const NAME = {
  's-dash': 'LX 직원 대시보드', 's-projects': '프로젝트 목록', 's-project': '프로젝트 한 장', 's-ingest': '데이터 올리기', 's-label': '학습데이터 구축', 's-train': '학습', 's-infer': '추론',
  's-review': '결과 확인(지도)', 's-publish': '배포 신청', 's-analyze': '분석하기', 's-cards': '서비스 카드', 's-mapsvc': '지도 서비스', 's-ximap': 'XI맵(전국 · 지도 다 그려짐까지)', 's-inbox': '요청함', 's-help': '지원',
  'a-dash': 'LX 관리자 대시보드', 'a-req': '요청 관리 — 분석 요청', 'a-req-approve': '요청 관리 — 승인 요청', 'a-req-api': '요청 관리 — API 키 신청', 'a-infra': '인프라', 'a-tenants': '기관 목록', 'a-tenant1': '기관 한 곳(남원)',
  'a-dep-req': '배포 신청', 'a-dep-share': '기관 공유', 'a-dep-usage': '사용 현황', 'a-dep-cat': '분야', 'a-dep-api': 'API', 'a-dep-rt': 'XI 재학습', 'a-dep-tpl': '학습 서식', 'a-dep-imp': '개선 후보',
  'a-shared-img': '공유 데이터 — 영상', 'a-shared-detail': '공유 데이터 — 영상 상세 판', 'a-shared-train': '공유 데이터 — 학습 데이터', 'a-shared-admin': '공유 데이터 — 행정 자료', 'a-accounts': '계정(관리자)',
  'g-list': '남원 · 내 서비스', 'g-dash': '남원 · 서비스 대시보드', 'g-hist': '남원 · 이력', 'g-stats': '남원 · 통계·보고서', 'g-req': '남원 · 요청하기 — 분석 요청', 'g-shoot': '남원 · 요청하기 — 촬영 요청', 'g-sent': '남원 · 요청하기 — 보낸 요청',
  'g-report': '남원 · 보고서', 'g-parcels': '남원 · 필지 목록', 'g-fusion': '남원 · 행정정보와 비교', 'g-map': '남원 · 지도(XI맵 · 다 그려짐까지)', 'g-org': '남원 · 기관 정보', 'g-accounts': '남원 · 계정',
  'j-list': '전남광주 · 내 서비스', 'j-dash': '전남광주 · 서비스 대시보드', 'j-hist': '전남광주 · 이력', 'j-map': '전남광주 · 지도(XI맵 · 다 그려짐까지)', 'j-org': '전남광주 · 기관 정보',
  'm-main': '메인', 'm-login': '로그인', 'm-govhome': '기관 메인', 'x-global': '해외 첫 화면(지역 착지 · 큰 숫자까지)' };
const s = (ms) => (ms == null ? '40초+' : (ms / 1000).toFixed(1));
const agg = (rs, id, pass) => { const xs = rs.map((x) => x[id]?.[pass]).filter(Boolean); return xs.length ? { done: med(xs.map((x) => x.done ?? 40000)), ld: med(xs.map((x) => x.ldMs)), srv: med(xs.map((x) => x.srvMax)), sum: med(xs.map((x) => x.srvSum)) } : null; };
const cell = (r) => (r ? `${s(r.done)}${r.ld ? ` (불러오는 중 ${(r.ld / 1000).toFixed(1)})` : ''}` : '—');
const srv = (r) => (r && r.srv != null ? `${(r.srv / 1000).toFixed(2)} · ${(r.sum / 1000).toFixed(2)}` : '—');
const lines = ['| 화면 | 지난 재검수 후 처음 · 다시 | 이번 전 처음 · 다시 | 이번 후 처음 · 다시 | 서버(가장 긴 요청 · 합, 초) 처음 |', '|---|---|---|---|---|'];
const slow = [];
for (const id of Object.keys(NAME)) {
  const p = [agg(prev, id, 'first'), agg(prev, id, 'again')], b = [agg(before, id, 'first'), agg(before, id, 'again')], a = [agg(after, id, 'first'), agg(after, id, 'again')];
  if (!b[0] && !a[0]) continue;
  const last = a[0] ? a : b;
  lines.push(`| ${NAME[id]} | ${cell(p[0])} · ${cell(p[1])} | ${cell(b[0])} · ${cell(b[1])} | ${cell(a[0])} · ${cell(a[1])} | ${srv(last[0])} |`);
  const worse = p[0] && last[0] && last[0].done - p[0].done > 1000;
  if ((last[0]?.done ?? 40000) > 2000 || worse) slow.push({ id, name: NAME[id], prev: p[0]?.done, now: last[0]?.done, again: last[1]?.done, srv: last[0]?.srv, worse });
}
fs.writeFileSync(path.join(HERE, 'time-table.md'), lines.join('\n') + '\n');
fs.writeFileSync(path.join(HERE, 'time-slow.json'), JSON.stringify(slow, null, 1));
console.log(lines.join('\n'));
