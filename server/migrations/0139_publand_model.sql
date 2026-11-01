-- 0139 공공용지 무단점유 AI(11-01 PM 확인 "공공용지 무단점유 분석서비스 카드") · 멱등.
--   학습 없이 묶은 AI(조립 모델 · input.composed): 영상-문장 맞추기(CLIP ViT-L/14 · 전국 분석과 같은 문장) + 토지피복 U-Net(ap25 · 경계 · 두 시점 변화).
--   계산 change/publand.py · 설정 config/publand.yaml · 작업기 change/unet(가중치 = ap25 · CLIP 은 계산이 올림).
--   상태 candidate(결과 확인 전) — 프로젝트에 붙인 뒤 모델 등록 요청 → LX 관리자 승인 → 배포 신청 → 공개 승인(정식 흐름).
--   성능 칸은 비움(정답 표본으로 잰 값 없음 = '성능 미측정' · 센 값만).
-- 되돌리기: migrations/down/0139_publand_model.down.sql
SET LOCAL lock_timeout = '10s';
INSERT INTO models(id, family, version, weights_uri, task, classes, input, status, tile_size, adapter, name, metrics, created_at)
VALUES ('change-publand', 'clip-vitl14+landcover-unet', '20261101', 'E:\도로공사\geoai_roadland\models\ap25_best.pth', 'seg',
        '["무단적치 쓰레기", "불법 형질변경"]'::jsonb,
        '{"ortho": true, "composed": true, "change_types": "publand", "parts": ["영상-문장 맞추기 CLIP ViT-L/14", "토지피복 U-Net ap25"]}'::jsonb,
        'candidate', 1024, 'change/unet',
        '{"ko": "공공용지 무단점유 AI(영상-문장 맞추기 + 토지피복) 2026.11.01", "en": "Public land encroachment (CLIP + land-cover U-Net)"}'::jsonb,
        '{}'::jsonb, now())
ON CONFLICT (id) DO NOTHING;
