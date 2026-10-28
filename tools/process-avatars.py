# -*- coding: utf-8 -*-
"""
头像后处理脚本
------------------------------------------------------------
输入：.raw-avatars/ 下 AI 生成的原始 PNG（1024x1024，右下角带平台水印）
输出：
  images/characters/{角色id}.jpg   主要角色头像（420x420 JPEG，压缩后单张约 30-50KB）
  images/generic/{性别-年龄段}.png  通用头像（340x340 PNG，保留透明通道）

处理内容：
  1. 裁掉底部 9%（去除平台水印）
  2. 居中裁正方形（主要角色顶部对齐，保住脸部；通用头像按内容包围盒）
  3. 缩放到目标尺寸并压缩，控制小程序主包体积
------------------------------------------------------------
运行：python tools/process-avatars.py
"""
import os
import sys
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, '.raw-avatars')
OUT_MAIN = os.path.join(ROOT, 'images', 'characters')
OUT_GEN = os.path.join(ROOT, 'images', 'generic')

os.makedirs(OUT_MAIN, exist_ok=True)
os.makedirs(OUT_GEN, exist_ok=True)

# (文件名片段, 时间戳) -> 输出文件名
MAIN_MAP = [
    ('一位十六七岁的年轻女子', '05-26-31', 'shen_jialan'),
    ('一位二十四五岁的青年男', '05-27-25', 'lin_jinqi'),
    ('一位二十出头的青年书生', '05-27-32', 'han_liang'),
    ('一位二十出头的年轻妇人', '05-27-33', 'zhao_xingtang'),
    ('一位二十岁上下的年轻女', '05-27-33', 'du_cuique'),
    ('一位四十多岁的中年妇人', '05-27-25', 'guo_ke_yu_role'),
    ('一位四十多岁的中年男子', '05-27-31', 'xu_wanquan'),
    ('一位六十多岁的老年男子', '05-27-52', 'lin_zhaoxiang'),
    ('一位十五六岁的少女_明', '05-27-56', 'lin_xiuwan'),
    ('一位十五六岁的少女_明', '05-28-01', 'lin_xiushu'),
    ('一位十八九岁的年轻侍女', '05-27-59', 'yu_chan'),
    ('一位二十岁上下的年轻女', '05-28-00', 'lv_jier'),
    ('一位二十岁出头的年轻女', '05-27-55', 'gan_tang'),
    ('一位三十多岁的青年官员', '05-28-26', 'lu_xie'),
    ('一位四十多岁的中年贵妇', '05-28-20', 'qin_shunhua'),
    ('一位二十五岁左右的青年', '05-28-24', 'huangdi'),
    ('一位四十多岁的中年亲王', '05-28-22', 'hanwang'),
    ('一位二十二岁的青年公子', '05-28-24', 'qian_shaozhe'),
    ('一位七十岁上下的老年贵', '05-28-22', 'shen_lao_furen'),
    ('一位五十多岁的老年文臣', '05-28-48', 'shen_qihan'),
    ('一位四十岁上下的中年妇', '05-28-53', 'cui_shi'),
    ('一位六十多岁的老年贵妇', '05-28-52', 'lin_lao_furen'),
    ('一位二十三四岁的青年男', '05-28-51', 'lin_jinlan'),
    ('一位十六七岁的年轻侍女', '05-28-44', 'xiao_lian'),
]

GENERIC_MAP = [
    ('一位无名年轻男子', '05-29-15', 'm-young'),
    ('一位无名中年男子', '05-29-16', 'm-middle'),
    ('一位无名老年男子', '05-29-10', 'm-old'),
    ('一位无名年轻女子', '05-29-14', 'f-young'),
    ('一位无名中年女子', '05-29-15', 'f-middle'),
    ('一位无名老年女子', '05-29-14', 'f-old'),
]


def find_file(fragment, stamp):
    """按文件名片段 + 时间戳唯一定位原始文件"""
    hits = [f for f in os.listdir(RAW) if fragment in f and stamp in f]
    if len(hits) != 1:
        raise SystemExit('!! 无法唯一定位: %s @ %s -> %d 个匹配 %s' % (fragment, stamp, len(hits), hits))
    return os.path.join(RAW, hits[0])


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


def process_main(src, dst, size=420, quality=85):
    im = Image.open(src).convert('RGB')
    im = square_top(strip_watermark(im))
    im = im.resize((size, size), Image.LANCZOS)
    im.save(dst, 'JPEG', quality=quality, optimize=True, progressive=True)
    return os.path.getsize(dst)


def _percentile(hist, total, p):
    """从灰度直方图取分位数对应的亮度值"""
    cum = 0
    threshold = total * p / 100.0
    for v, c in enumerate(hist):
        cum += c
        if cum >= threshold:
            return v
    return 255


def process_generic(src, dst, size=320):
    """
    通用头像：提取「墨色剪影」（自适应阈值版）。
    模型即使指定透明底也常输出白底卡片，且各图墨色深浅差异极大
    （实测亮度从 8 到 226 不等），因此不能用固定阈值，必须按图自适应：
      背景色 = 高分位亮度（约 92% 分位）
      墨色   = 低分位亮度（约 3% 分位）
    在两者之间做非线性过渡，越接近墨色越不透明。
    输出单色墨线剪影，叠在家族色圆形底上。
    """
    im = Image.open(src).convert('RGB')
    im = strip_watermark(im)

    # 内缩 3% 去掉模型偶尔画出的边框伪影
    w, h = im.size
    ix, iy = int(w * 0.03), int(h * 0.03)
    im = im.crop((ix, iy, w - ix, h - iy))

    lum = im.convert('L')
    hist = lum.histogram()
    total = sum(hist)
    bg = _percentile(hist, total, 92)     # 背景亮度
    ink = _percentile(hist, total, 3)     # 最深墨色
    if bg - ink < 24:                     # 对比度不足，退化为全不透明兜底
        ink = bg - 24

    span = float(bg - ink)
    lut = []
    for v in range(256):
        d = bg - v                        # 距背景的深度
        if d <= 14:
            a = 0                         # 噪声地板：滤掉纸纹与量化抖动
        else:
            t = min(1.0, (d - 14) / span) ** 0.7
            a = int(t * 255)
        lut.append(a)
    alpha = lum.point(lut)
    # 中值滤波压掉源图自带的纸纹 / 半调网点，再补一次噪声地板
    from PIL import ImageFilter
    alpha = alpha.filter(ImageFilter.MedianFilter(5))
    alpha = alpha.point(lambda a: 0 if a < 40 else a)

    ink_r, ink_g, ink_b = 62, 56, 48      # 暖墨色
    out = Image.new('RGBA', im.size, (ink_r, ink_g, ink_b, 0))
    out.putalpha(alpha)

    # 按内容包围盒裁掉多余空白，再补成正方形画布
    bbox = out.split()[3].getbbox()
    if bbox:
        out = out.crop(bbox)
    w, h = out.size
    side = int(max(w, h) * 1.06)          # 留 6% 呼吸边
    canvas = Image.new('RGBA', (side, side), (0, 0, 0, 0))
    canvas.paste(out, ((side - w) // 2, (side - h) // 2), out)
    canvas = canvas.resize((size, size), Image.LANCZOS)

    # 单色剪影用少色量化，PNG 体积可降一个数量级；关闭抖动避免棋盘纹
    try:
        canvas = canvas.quantize(colors=32, method=Image.FASTOCTREE, dither=Image.Dither.NONE)
    except TypeError:                     # 旧版 Pillow 无 dither 参数
        canvas = canvas.quantize(colors=32, method=Image.FASTOCTREE)
    canvas.save(dst, 'PNG', optimize=True)
    return os.path.getsize(dst)


def main():
    total = 0
    print('--- 主要角色头像 ---')
    for frag, stamp, cid in MAIN_MAP:
        src = find_file(frag, stamp)
        dst = os.path.join(OUT_MAIN, cid + '.jpg')
        n = process_main(src, dst)
        total += n
        print('  %-18s %6.1f KB' % (cid, n / 1024.0))

    print('--- 通用头像 ---')
    for frag, stamp, name in GENERIC_MAP:
        src = find_file(frag, stamp)
        dst = os.path.join(OUT_GEN, name + '.png')
        n = process_generic(src, dst)
        total += n
        print('  %-12s %6.1f KB' % (name, n / 1024.0))

    print('---')
    print('合计 %.1f KB（%.2f MB）' % (total / 1024.0, total / 1024.0 / 1024.0))
    if total > 1.5 * 1024 * 1024:
        print('!! 超过 1.5MB 预算，建议降低尺寸或质量')
        sys.exit(2)


if __name__ == '__main__':
    main()
