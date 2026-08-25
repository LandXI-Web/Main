// 스파이크 전용 정적 서버 래퍼 — 포트를 고정해 백그라운드로 띄운다.
process.env.PORT = process.env.PORT || '4181';
await import('../../tools/serve.mjs');
