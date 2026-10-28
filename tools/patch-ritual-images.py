# -*- coding: utf-8 -*-
"""
为 data/episodes.js 中的礼学条目挂上配图路径（一次性脚本，跑完即可）
条目 term → 图片 key（图片在 packageEpisodes/images/rituals/<key>.jpg）
"""
import io
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TARGET = os.path.join(ROOT, 'data', 'episodes.js')
PREFIX = '/packageEpisodes/images/rituals/'

MAP = {
    '及笄礼': 'ji-ji',
    '退婚书 · 六礼': 'hun-shu',
    '身契 · 奴婢征召': 'shen-qi',
    '头绳定级': 'tou-sheng',
    '跪拜与行礼轻重': 'xing-li',
    '佛经装帧与夹藏': 'jing-zhe-jing',
    '私印与对牌': 'yuan-yang-yin',
    '狐裘与赐衣': 'hu-qiu',
    '名帖（名刺）': 'ming-tie',
    '主杀奴婢之罪': 'da-ming-lv',
    '人胜 · 人日戴胜': 'ren-sheng',
    '彩胜 · 花胜 · 华胜 · 方胜': 'cai-sheng',
    '男子簪花': 'zan-hua',
    '七宝羹': 'qi-bao-geng',
    '酒令': 'jiu-ling',
    '杖刑': 'da-zhang',
}

with io.open(TARGET, 'r', encoding='utf-8') as f:
    lines = f.read().split('\n')

out, hits = [], {}
for ln in lines:
    out.append(ln)
    s = ln.strip()
    if not s.startswith('term:') or 'image:' in s:
        continue
    for term, key in MAP.items():
        if s == u"term: '%s'," % term:
            indent = ln[:len(ln) - len(ln.lstrip())]
            out.append(u"%simage: '%s%s.jpg'," % (indent, PREFIX, key))
            hits[term] = key
            break

with io.open(TARGET, 'w', encoding='utf-8') as f:
    f.write('\n'.join(out))

print(u'已挂图 %d / %d 条' % (len(hits), len(MAP)))
for term, key in MAP.items():
    print(u'  %s %-24s → %s' % (u'✓' if term in hits else u'✗', term, key))
miss = [t for t in MAP if t not in hits]
print(u'未命中：%s' % (u'、'.join(miss) if miss else u'无'))
sys.exit(0)
