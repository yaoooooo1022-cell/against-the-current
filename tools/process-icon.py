"""
小程序头像后处理
------------------------------------------------------------
用法： python tools/process-icon.py

做的事：
  1. 取 .raw-icon/ 里的 AI 原图（脚本顶部 SRC 指定）
  2. 抹掉右下角的 AI 平台水印（用邻近干净背景水平翻转平铺覆盖）
  3. 居中裁正方形
  4. 主版内缩 88% 留米色边距 —— 微信头像按圆形显示，内缩能让窗棂金环完整不被圆裁切平
  5. 输出 1024 / 512 / 144 到 app-icon/，另出满版（fullbleed）与带 AI 角标版备用

产物：
  app-icon/app-icon-144.png        ← 直接上传到微信公众平台当小程序头像
  app-icon/app-icon-512.png        ← 备用（宣传、应用市场）
  app-icon/app-icon-1024.png       ← 母版留档
  app-icon/app-icon-512-marked.png ← 带「AI」角标的合规备用版
  app-icon/*-fullbleed-*.png       ← 满版（不留边距）对比用
  app-icon/preview-sizes.png       ← 512/256/192/144 尺寸对照
  app-icon/preview-round.png       ← 圆形裁切对照（微信实际显示效果）

图片由 AI 生成，按项目约定属 AI 生成内容；显式标识由小程序内免责声明承担，
需要在图片本体标识时用 marked 版。
"""

import os
import sys
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW_DIR = os.path.join(ROOT, '.raw-icon')
OUT_DIR = os.path.join(ROOT, 'app-icon')

# 用哪张原图（月洞圆窗那版；改文件名即可换）
SRC = 'A_minimalist_Chinese_style_app_2026-10-10T05-08-58.png'

SIZES = [1024, 512, 144]
INNER = 0.88          # 主版内缩比例：0.88 = 图案占 88%，四周留 6% 米边


def clean_watermark(im):
    """右下角水印（AI生成 WORKBUDDY）：用左侧同高度的干净背景水平翻转覆盖。"""
    w, h = im.size
    x0, y0 = int(w * 0.78), int(h * 0.90)
    box_w, box_h = w - x0, h - y0
    sx0 = max(0, x0 - box_w - int(w * 0.02))
    patch = im.crop((sx0, y0, sx0 + box_w, y0 + box_h))
    im.paste(patch.transpose(Image.FLIP_LEFT_RIGHT), (x0, y0))
    return im


def corner_bg(im):
    """取四角平均色当补边底色，避免出现色带。"""
    w, h = im.size
    pts = [(6, 6), (w - 7, 6), (6, h - 7), (w - 7, h - 7)]
    cols = [im.getpixel(p) for p in pts]
    return tuple(sum(c[i] for c in cols) // len(cols) for i in range(3))


def pad_scale(im, scale, bg):
    """整体缩到 scale 倍并居中补底 —— 圆裁时四边留白，图案不被切。"""
    w, h = im.size
    inner = im.resize((int(w * scale), int(h * scale)), Image.LANCZOS)
    out = Image.new('RGB', (w, h), bg)
    out.paste(inner, ((w - inner.width) // 2, (h - inner.height) // 2))
    return out


def circle(im, size, bg=(233, 228, 217)):
    """裁成圆形，模拟微信头像的实际显示。"""
    im = im.resize((size, size), Image.LANCZOS)
    big = 4
    mask = Image.new('L', (size * big, size * big), 0)
    ImageDraw.Draw(mask).ellipse((0, 0, size * big - 1, size * big - 1), fill=255)
    mask = mask.resize((size, size), Image.LANCZOS)
    out = Image.new('RGB', (size, size), bg)
    out.paste(im, (0, 0), mask)
    return out


def add_ai_mark(im):
    """右下角加一枚克制的「AI」角标（合规备用版）。"""
    im = im.copy()
    d = ImageDraw.Draw(im, 'RGBA')
    w, h = im.size
    size = max(9, int(w * 0.055))
    font = None
    for name in ('arialbd.ttf', 'arial.ttf', 'msyhbd.ttc', 'msyh.ttc'):
        try:
            font = ImageFont.truetype('C:/Windows/Fonts/' + name, size)
            break
        except Exception:
            continue
    if font is None:
        font = ImageFont.load_default()

    pad = max(3, int(size * 0.35))
    tx, ty = w - size * 1.7 - pad * 2, h - size - pad * 3
    d.rounded_rectangle(
        [tx, ty, tx + size * 1.7 + pad, ty + size + pad],
        radius=max(2, size // 3),
        fill=(245, 241, 232, 190),
        outline=(176, 141, 87, 170),
        width=max(1, size // 12),
    )
    d.text((tx + pad * 0.8, ty + pad * 0.4), 'AI', font=font, fill=(140, 43, 43, 235))
    return im


def save(im, name):
    p = os.path.join(OUT_DIR, name)
    im.save(p, 'PNG', optimize=True)
    print('  写出 %-34s %4d×%-4d  %6.1f KB' % (name, im.width, im.height, os.path.getsize(p) / 1024))


def main():
    src_path = os.path.join(RAW_DIR, SRC)
    if not os.path.exists(src_path):
        print('找不到原图：', src_path, '\n.raw-icon/ 里现有的文件：')
        for f in sorted(os.listdir(RAW_DIR)):
            print('  ', f)
        sys.exit(1)

    os.makedirs(OUT_DIR, exist_ok=True)

    im = Image.open(src_path).convert('RGB')
    im = clean_watermark(im)

    # 居中裁正方形
    w, h = im.size
    side = min(w, h)
    im = im.crop(((w - side) // 2, (h - side) // 2, (w - side) // 2 + side, (h - side) // 2 + side))

    bg = corner_bg(im)
    inner = pad_scale(im, INNER, bg)

    # 主版（内缩留边，圆裁后金环完整）
    for s in SIZES:
        save(inner.resize((s, s), Image.LANCZOS), 'app-icon-%d.png' % s)

    # 满版对比（不留边距）
    save(im.resize((512, 512), Image.LANCZOS), 'app-icon-fullbleed-512.png')
    save(im.resize((144, 144), Image.LANCZOS), 'app-icon-fullbleed-144.png')

    # 合规备用版
    save(add_ai_mark(inner.resize((512, 512), Image.LANCZOS)), 'app-icon-512-marked.png')

    # 尺寸对照
    THUMBS = [144, 192, 256]
    canvas = Image.new('RGB', (512 + 20 + sum(THUMBS) + 10 * len(THUMBS) + 20, 552), (233, 228, 217))
    canvas.paste(inner.resize((512, 512), Image.LANCZOS), (20, 20))
    x = 552
    for s in THUMBS:
        canvas.paste(inner.resize((s, s), Image.LANCZOS), (x, 20 + (512 - s) // 2))
        x += s + 10
    save(canvas, 'preview-sizes.png')

    # 圆形对照：上排内缩版（主推），下排满版
    rc = Image.new('RGB', (512 + 20 + 144 + 40, 512 * 2 + 60), (233, 228, 217))
    rc.paste(circle(inner, 512), (20, 20))
    rc.paste(circle(inner, 144), (552, 20 + (512 - 144) // 2))
    rc.paste(circle(im, 512), (20, 552))
    rc.paste(circle(im, 144), (552, 552 + (512 - 144) // 2))
    save(rc, 'preview-round.png')

    print('\n完成。上传用 app-icon/app-icon-144.png（内缩版，圆裁更好看）')


if __name__ == '__main__':
    main()
