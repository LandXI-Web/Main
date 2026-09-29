// c2-xi 3차 — 스트림 호스트는 API 호스트와 절대 겹치지 않는다(로컬 게이트웨이 = s1–s4.localhost) · 운영 주소는 그대로.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const store = new Map();
globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
const { streamBase, API } = await import('../../landxi/shared/api-v1.js');

const host = (u) => new URL(u).host;
for (const base of ['http://localhost:8700', 'http://127.0.0.1:8700', 'http://localhost.:8700']) {
  test(`stream host never equals API host (${base})`, () => {
    store.set('lx_api_base', base);
    const seen = new Set();
    for (let i = 0; i < 12; i++) {
      const s = streamBase();
      assert.match(host(s), /^s[1-4]\.localhost:8700$/);
      assert.notEqual(host(s), host(API.prefix));
      assert.ok(!['localhost:8700', '127.0.0.1:8700', 'localhost.:8700'].includes(host(s)));
      seen.add(host(s));
    }
    assert.equal(seen.size, 4);             // 네 이름에 나눠 연다(24칸)
  });
}
test('non-local gateway keeps its own address', () => {
  store.set('lx_api_base', 'https://api.landxi.example');
  assert.equal(streamBase(), 'https://api.landxi.example/api/v1');
});
