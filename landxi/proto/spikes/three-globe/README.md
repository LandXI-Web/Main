# SPIKE — three.js 스크롤 글로브 (Path C)

정적 파일만 쓴다. 빌드 없음. three 0.185.1 importmap + GSAP ScrollTrigger + Lenis (CDN).

## 실행

```bash
node tools/serve.mjs                       # http://localhost:4173
node landxi/proto/spikes/three-globe/tools/make-textures.mjs   # tex/ 생성 (1회, 수 분)
# 브라우저에서 http://localhost:4173/landxi/proto/spikes/three-globe/
```

`tex/` 는 5 MB 를 넘으므로 커밋하지 않는다. 위 스크립트가 공개 키리스 소스에서 다시 만든다.

## 디버그 훅

- `window.__spike.seek(p)` — p∈[0,1] 스크롤 진행도로 카메라/연출을 강제 이동
- `window.__spike.fps()` — 최근 프레임 평균 FPS
