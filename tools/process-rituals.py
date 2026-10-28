# -*- coding: utf-8 -*-
"""
礼学考究配图 · 后处理脚本
------------------------------------------------------------
输入：.raw-rituals/*.png   （ImageGen 生成的 1536×1024 原图）
输出：packageEpisodes/images/rituals/<key>.jpg  （16:9 · 720×405 · JPEG）

处理步骤：
  1) 居中裁切为 16:9（保留构图中心，去掉上下各 80px）
  2) LANCZOS 缩放至 720×405
  3) 右下角压一枚「AI 生成」角标
  4) JPEG q=76 渐进式保存

为什么要自己压角标：原图自带的 WORKBUDDY 水印在缩到 720px 后已不可辨认，
而《人工智能生成合成内容标识办法》要求生成内容带显式标识，故按同一语义重绘。
------------------------------------------------------------
运行：C:/Users/sy.ye/.workbuddy/binaries/python/envs/default/Scripts/python.exe tools/process-rituals.py
"""
import os
import sys
import glob

from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, '.raw-rituals')
DST = os.path.join(ROOT, 'packageEpisodes', 'images', 'rituals')

OUT_W, OUT_H = 720, 405
CROP_TOP = 80          # 1536×1024 → 1536×864（16:9）
QUALITY = 76

# 原图文件名关键词 → 输出名（key）
MAP = [
    ('一枚_人胜',          'ren-sheng'),
    ('四枚不同形制的_彩胜', 'cai-sheng'),
    ('鸳鸯印',             'yuan-yang-yin'),
    ('经折装佛经',         'jing-zhe-jing'),
    ('名帖',               'ming-tie'),
    ('狐裘披肩',           'hu-qiu'),
    ('头绳',               'tou-sheng'),
    ('身契',               'shen-qi'),
    ('姿势示意',           'xing-li'),
    ('发笄',               'ji-ji'),
    ('婚书',               'hun-shu'),
    ('酒筹',               'jiu-ling'),
    ('七宝羹',             'qi-bao-geng'),
    ('簪花',               'zan-hua'),
    ('大明律',             'da-ming-lv'),
    ('大杖与令签',         'da-zhang'),
]

FONT_CANDIDATES = [
    r'C:\Windows\Fonts\msyhbd.ttc',
    r'C:\Windows\Fonts\msyh.ttc',
    r'C:\Windows\Fonts\simhei.ttf',
    r'C:\Windows\Fonts\Deng.ttf',
]


def load_font(size):
    for p in FONT_CANDIDATES:
        if os.path.exists(p):
            try:
                return ImageFont.truetype(p, size)
            except Exception:
                continue
    return ImageFont.load_default()


def stamp(im):
    """右下角「AI 生成」角标：半透明圆角底 + 白字"""
    d = ImageDraw.Draw(im, 'RGBA')
    font = load_font(21)
    text = 'AI 生成'
    pad_x, pad_y = 12, 6
    box = d.textbbox((0, 0), text, font=font)
    tw, th = box[2] - box[0], box[3] - box[1]
    bw, bh = tw + pad_x * 2, th + pad_y * 2
    x1, y1 = im.width - bw - 12, im.height - bh - 12

    mask = Image.new('L', (bw, bh), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, bw - 1, bh - 1], radius=bh // 2, fill=150)
    layer = Image.new('RGBA', (bw, bh), (24, 24, 24, 0))
    layer.putalpha(mask)
    im.paste(layer, (x1, y1), layer)

    d.text((x1 + pad_x - box[0], y1 + pad_y - box[1]), text, font=font, fill=(255, 255, 255, 235))


def main():
    if not os.path.isdir(SRC):
        print('✗ 找不到 .raw-rituals 目录')
        return 1
    os.makedirs(DST, exist_ok=True)

    files = sorted(glob.glob(os.path.join(SRC, '*.png')))
    if not files:
        print('✗ .raw-rituals 下没有 PNG')
        return 1

    done, used = [], set()
    for f in files:
        base = os.path.basename(f)
        key = None
        for kw, k in MAP:
            if kw in base and k not in used:
                key = k
                break
        if not key:
            print('  · 跳过（无匹配或已用）：' + base[:40])
            continue
        used.add(key)

        im = Image.open(f).convert('RGB')
        w, h = im.size
        target_h = int(round(w * 9 / 16))
        top = min(max((h - target_h) // 2, 0), max(h - target_h, 0))
        # 原图 1024 高、目标 864 高 → top=80，与 CROP_TOP 一致
        im = im.crop((0, top, w, top + target_h))
        im = im.resize((OUT_W, OUT_H), Image.LANCZOS)
        stamp(im)

        out = os.path.join(DST, key + '.jpg')
        im.save(out, 'JPEG', quality=QUALITY, optimize=True, progressive=True)
        kb = os.path.getsize(out) / 1024
        done.append((key, kb))
        print('  ✓ %-14s %6.1f KB   ← %s' % (key, kb, base[:34]))

    missing = [k for _, k in MAP if k not in used]
    total = sum(kb for _, kb in done)
    print('-' * 62)
    print('总计 %d 张 / %.1f KB（平均 %.1f KB）' % (len(done), total, total / max(len(done), 1)))
    if missing:
        print('⚠ 未匹配到原图：' + ', '.join(missing))
    return 0


if __name__ == '__main__':
    sys.exit(main())
