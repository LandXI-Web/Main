import test from 'node:test'; import assert from 'node:assert/strict';
import { statusOf, STATUS_KEYS } from '../../landxi/assets/js/ui/status.js';
test('analysis job statuses map to the 6 keys', () => {
  assert.equal(statusOf('job', 'PENDING').key, 'found');
  assert.equal(statusOf('job', 'RUNNING').key, 'doing');
  assert.equal(statusOf('job', 'SUCCEEDED').key, 'done');
  assert.equal(statusOf('job', 'FAILED').key, 'error');
});
test('card publishing statuses', () => {
  assert.equal(statusOf('card', '대기').key, 'found');
  assert.equal(statusOf('card', '검토중').key, 'doing');
  assert.equal(statusOf('card', '승인').key, 'done');
  assert.equal(statusOf('card', '반려').key, 'error');
  assert.equal(statusOf('card', '비공개').key, 'hold');
});
test('upload statuses', () => {
  assert.equal(statusOf('upload', '대기중').key, 'hold');
  assert.equal(statusOf('upload', '업로드중').key, 'doing');
  assert.equal(statusOf('upload', '완료').key, 'done');
  assert.equal(statusOf('upload', '중단됨').key, 'error');
});
test('every key has label, color and cssVar', () => {
  for (const k of STATUS_KEYS) { const s = statusOf('key', k); assert.ok(s.label && /^#/.test(s.color) && s.cssVar.startsWith('--s-')); }
});
test('unknown raw value falls back to hold', () => { assert.equal(statusOf('job', '???').key, 'hold'); });

/* ── 색의 단일 출처는 tokens.css (Task 8b 리뷰 지적) ────────────────────────
   CI 블루를 #2457D6 → #006DF7 로 바꿨을 때 JS 하드코딩이 따라오지 않아 옛 파랑이
   지도·상태색에 그대로 남았다. 아래 두 테스트가 그 재발을 막는다. */
import fs from 'node:fs';

const TOKENS = fs.readFileSync('landxi/assets/css/tokens.css', 'utf8');
const tokenValue = name => {
  const m = TOKENS.match(new RegExp(`${name}\s*:\s*([^;]+);`));
  if (!m) return null;
  const v = m[1].trim();
  const ref = v.match(/^var\(\s*(--[\w-]+)\s*\)$/);      // --s-info:var(--lx) 같은 참조를 따라간다
  return ref ? tokenValue(ref[1]) : v;
};

test('status color literals match their tokens.css values', () => {
  // statusOf() 는 DOM 이 없으면 META 의 리터럴을 돌려준다. 그 리터럴이 tokens.css 와
  // 어긋나면 브라우저와 노드가 서로 다른 색을 말하게 된다.
  for (const k of STATUS_KEYS) {
    const s = statusOf('key', k);
    assert.equal(s.color.toUpperCase(), tokenValue(s.cssVar).toUpperCase(), `${k} (${s.cssVar})`);
  }
  assert.equal(statusOf('key', 'info').color, '#006DF7');
  assert.equal(tokenValue('--s-info'), tokenValue('--lx'));   // 정보색 = 주색
});

test('the retired CI blue is gone from shipped css and js', () => {
  const files = [];
  const walk = d => fs.readdirSync(d, { withFileTypes: true }).forEach(e => {
    const p = `${d}/${e.name}`;
    if (e.isDirectory()) { if (e.name !== 'tiles') walk(p); }
    else if (/\.(css|js)$/.test(e.name)) files.push(p);
  });
  walk('landxi');
  const hits = files.filter(f => /#2457D6|rgba\(\s*36\s*,\s*87\s*,\s*214|#193FA3|#E8EEFB/i
    .test(fs.readFileSync(f, 'utf8').replace(/^\s*\/\/.*$/gm, '')));   // 주석은 제외
  assert.deepEqual(hits, [], `옛 CI 파랑이 남아 있다: ${hits.join(', ')}`);
});
