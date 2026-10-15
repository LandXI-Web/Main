"""작은 U-Net(설계 30차 실측에서 가장 좋았던 모양 · 폭 32 · 내려가기 2번) — 학습 · 분석이 같은 정의를 쓴다."""
from __future__ import annotations

import torch
import torch.nn as nn
import torch.nn.functional as F


def _blk(a: int, b: int) -> nn.Sequential:
    return nn.Sequential(nn.Conv2d(a, b, 3, padding=1), nn.BatchNorm2d(b), nn.ReLU(True),
                         nn.Conv2d(b, b, 3, padding=1), nn.BatchNorm2d(b), nn.ReLU(True))


class UNet(nn.Module):
    def __init__(self, cin: int, c: int = 6, w: int = 32):
        super().__init__()
        self.e1, self.e2, self.e3 = _blk(cin, w), _blk(w, 2 * w), _blk(2 * w, 4 * w)
        self.d2, self.d1 = _blk(6 * w, 2 * w), _blk(3 * w, w)
        self.o = nn.Conv2d(w, c, 1)

    def forward(self, x):
        a = self.e1(x)
        b = self.e2(F.max_pool2d(a, 2))
        c = self.e3(F.max_pool2d(b, 2))
        u = self.d2(torch.cat([F.interpolate(c, scale_factor=2), b], 1))
        u = self.d1(torch.cat([F.interpolate(u, scale_factor=2), a], 1))
        return self.o(u)


def load(path: str, device: str = "cpu"):
    """저장 파일 → (모델, 정규화 mu · sd(채널), 설정)."""
    ck = torch.load(path, map_location="cpu", weights_only=False)
    cfg = ck["cfg"]
    net = UNet(cfg["cin"], cfg["classes"], cfg.get("width", 32))
    net.load_state_dict(ck["state"])
    net.eval().to(device)
    mu = torch.tensor(ck["mu"], dtype=torch.float32).view(1, -1, 1, 1).to(device)
    sd = torch.tensor(ck["sd"], dtype=torch.float32).view(1, -1, 1, 1).to(device)
    return net, mu, sd, cfg
