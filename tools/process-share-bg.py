# -*- coding: utf-8 -*-
"""
分享卡片背景图 · 后处理
输入：.raw-share/*.png   （ImageGen 生成的 1024×1536 原图）
输出：images/share/bg.jpg （750×1125 JPEG q82，已带 AI 生成水印）
"""
import os
import sys
import glob

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, '.raw-share')
DST = os.path.join(ROOT, 'images', 'share')

OUT_W, OUT_H = 750, 1125
QUALITY = 82


def main():
    if not os.path.isdir(SRC):
        print('✗ 找不到 .raw-share 目录')
        return 1
    os.makedirs(DST, exist_ok=True)

    files = sorted(glob.glob(os.path.join(SRC, '*.png')))
    if not files:
        print('✗ .raw-share 下没有 PNG')
        return 1

    src = files[0]
    im = Image.open(src).convert('RGB')
    print('原图:', os.path.basename(src), im.size)

    out = im.resize((OUT_W, OUT_H), Image.LANCZOS)
    dst = os.path.join(DST, 'bg.jpg')
    out.save(dst, 'JPEG', quality=QUALITY, optimize=True, progressive=True)
    print('输出:', os.path.relpath(dst, ROOT), out.size, '%.1f KB' % (os.path.getsize(dst) / 1024))
    return 0


if __name__ == '__main__':
    sys.exit(main())
