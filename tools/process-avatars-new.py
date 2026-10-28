# -*- coding: utf-8 -*-
"""
新增角色头像后处理（第 19 轮）
------------------------------------------------------------
输入：.raw-avatars-new/{角色id}.png   AI 生成的 1024x1024 原图（右下角带平台水印）
输出：images/characters/{角色id}.jpg  290x290 JPEG

与旧图（420px / q85 / 约 33KB）不同，本轮新增 48 张若沿用旧规格会把主包
撑到 2.8MB 以上。故统一压到 290px：
  - 族谱 / 详情页头像最大显示 220rpx = 110px 逻辑像素，290px 在 2x 屏已够清晰
  - 目标单张 <= 13KB，48 张合计约 620KB，主包可控制在 2MB 以内

处理：裁掉底部 9%（水印）→ 顶部对齐裁正方 → 缩放 290 → 质量自适应压缩
------------------------------------------------------------
运行：python tools/process-avatars-new.py
"""
import os
import io
import sys
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, '.raw-avatars-new')
OUT = os.path.join(ROOT, 'images', 'characters')

SIZE = 290
TARGET = 13 * 1024      # 单张目标上限（字节）
QUALITY = 82            # 起始质量，超限时逐级下调

os.makedirs(OUT, exist_ok=True)


def strip_watermark(im, ratio=0.09):
    """裁掉底部 ratio 比例（平台水印位于右下角）"""
    w, h = im.size
    return im.crop((0, 0, w, int(h * (1 - ratio))))


def square_top(im):
    """居中取正方形，顶部对齐（人像脸部偏上）"""
    w, h = im.size
    side = min(w, h)
    left = (w - side) // 2
    return im.crop((left, 0, left + side, side))


def encode(im, quality):
    buf = io.BytesIO()
    im.save(buf, 'JPEG', quality=quality, optimize=True, progressive=True)
    return buf.getvalue()


def main():
    if not os.path.isdir(RAW):
        raise SystemExit('!! 找不到原图目录：' + RAW)

    files = sorted([f for f in os.listdir(RAW) if f.lower().endswith('.png')])
    if not files:
        raise SystemExit('!! 原图目录为空：' + RAW)

    total = 0
    oversize = []
    for fn in files:
        cid = os.path.splitext(fn)[0]
        src = os.path.join(RAW, fn)
        im = Image.open(src).convert('RGB')
        im = square_top(strip_watermark(im))
        im = im.resize((SIZE, SIZE), Image.LANCZOS)

        q = QUALITY
        data = encode(im, q)
        while len(data) > TARGET and q > 60:
            q -= 4
            data = encode(im, q)

        dst = os.path.join(OUT, cid + '.jpg')
        with open(dst, 'wb') as f:
            f.write(data)

        total += len(data)
        flag = ''
        if len(data) > TARGET:
            oversize.append((cid, len(data)))
            flag = '  [超限]'
        print('  %-22s %5.1f KB  q=%d%s' % (cid, len(data) / 1024.0, q, flag))

    print('\n共 %d 张，合计 %.0f KB，平均 %.1f KB' % (len(files), total / 1024.0, total / 1024.0 / len(files)))
    if oversize:
        print('超限（仍超过 %d KB）：%s' % (TARGET / 1024, oversize))


if __name__ == '__main__':
    main()
