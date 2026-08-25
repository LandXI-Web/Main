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
