/**
 * 重建 data/episodes.js（第 19 轮分集补完）
 * ------------------------------------------------------------
 * 1. 备份原文件到 .tmp/episodes.bak.js
 * 2. 保留原有 1–13 集条目原样
 * 3. 用 REPLACE 纠正 4 条「剧情单元」的集数标注（原 19/24/30/47 有误）
 * 4. 追加 ADD 中的新集
 * 5. 按 ep 排序后，按手写风格序列化输出
 * ------------------------------------------------------------
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.dirname(__dirname);
const SRC = path.join(ROOT, 'data', 'episodes.js');
const BAK = path.join(ROOT, '.tmp', 'episodes.bak.js');

const old = require(SRC);
const nd = require('./episodes-patch-data.js');

if (!fs.existsSync(BAK)) {
  fs.copyFileSync(SRC, BAK);
  console.log('已备份 ->', BAK);
} else {
  console.log('备份已存在，跳过覆盖 ->', BAK);
}

/* ---------------- 合并 ---------------- */

/** 旧「剧情单元」并入某一集：rituals 合并过去，条目本身删除 */
const MERGE_INTO = { arc_army: 'ep12' };

const merged = [];
old.EPISODES.forEach((e) => {
  if (nd.REPLACE[e.id]) {
    merged.push(nd.REPLACE[e.id]);
    console.log('替换', e.id, '-> ep' + nd.REPLACE[e.id].ep);
  } else if (MERGE_INTO[e.id]) {
    const target = merged.filter((x) => x.id === MERGE_INTO[e.id])[0] ||
      old.EPISODES.filter((x) => x.id === MERGE_INTO[e.id])[0];
    if (target) {
      target.rituals = (target.rituals || []).concat(e.rituals || []);
      console.log('并入', e.id, '->', MERGE_INTO[e.id], '(+' + (e.rituals || []).length + ' 条礼学)');
    }
  } else {
    merged.push(e);
  }
});
/* 追加新集（已存在的 id 跳过，避免重复跑脚本时叠加） */
const seen = {};
merged.forEach((e) => { seen[e.id] = true; });
nd.ADD.forEach((e) => {
  if (!seen[e.id]) { merged.push(e); seen[e.id] = true; }
});

/* 兜底去重：同一 id 只保留一份 */
const uniq = [];
const seen2 = {};
merged.forEach((e) => {
  if (!seen2[e.id]) { uniq.push(e); seen2[e.id] = true; } else { console.log('去重', e.id); }
});
merged.length = 0;
uniq.forEach((e) => merged.push(e));

merged.sort((a, b) => a.ep - b.ep);

const miss = [];
for (let i = 1; i <= 47; i++) {
  if (!merged.some((e) => e.ep === i)) miss.push(i);
}
console.log('合并后条目数', merged.length, '| 缺失集数', miss.length ? miss.join(',') : '无');

const withRitual = merged.filter((e) => (e.rituals || []).length).length;
const ritualTotal = merged.reduce((n, e) => n + (e.rituals || []).length, 0);
console.log('含礼学条目的集数', withRitual, '| 礼学条目合计', ritualTotal);

/* ---------------- 序列化 ---------------- */

const FIELD_ORDER = ['id', 'ep', 'epLabel', 'part', 'title', 'arc', 'keywords', 'summary', 'rituals'];
const RITUAL_ORDER = ['term', 'image', 'category', 'source', 'explain', 'inPlot'];

function q(s) {
  return "'" + String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";
}

function pad(n) {
  return new Array(n + 1).join(' ');
}

/** 短数组（keywords）压成一行，超过 60 字符就换行 */
function serShortArray(arr, ind) {
  const one = '[' + arr.map(q).join(', ') + ']';
  if (ind + one.length <= 92) return one;
  return '[\n' + arr.map((x) => pad(ind + 2) + q(x)).join(',\n') + '\n' + pad(ind) + ']';
}

function serEp(e) {
  const L = [];
  const keys = FIELD_ORDER.filter((k) => e[k] !== undefined);
  const extra = Object.keys(e).filter((k) => FIELD_ORDER.indexOf(k) < 0);
  (keys.concat(extra)).forEach((k) => {
    const v = e[k];
    if (k === 'summary') {
      L.push('    summary: [\n' + v.map((s) => pad(6) + q(s)).join(',\n') + '\n' + pad(4) + ']');
    } else if (k === 'rituals') {
      L.push('    rituals: [\n' + v.map(serRitual).join(',\n') + '\n' + pad(4) + ']');
    } else if (k === 'keywords') {
      L.push('    keywords: ' + serShortArray(v, 15));
    } else if (typeof v === 'number' || typeof v === 'boolean') {
      L.push('    ' + k + ': ' + v);
    } else {
      L.push('    ' + k + ': ' + q(v));
    }
  });
  return '  {\n' + L.join(',\n') + '\n  }';
}

function serRitual(r) {
  const L = [];
  RITUAL_ORDER.filter((k) => r[k] !== undefined).forEach((k) => {
    const v = r[k];
    if (typeof v === 'string' && v.length > 56) {
      L.push('        ' + k + ':\n' + pad(10) + q(v));
    } else if (typeof v === 'number') {
      L.push('        ' + k + ': ' + v);
    } else {
      L.push('        ' + k + ': ' + q(v));
    }
  });
  return '      {\n' + L.join(',\n') + '\n' + pad(6) + '}';
}

function serCats(cats) {
  const keys = Object.keys(cats);
  return (
    'const EPISODE_RITUAL_CATEGORIES = {\n' +
    keys
      .map((k) => {
        const c = cats[k];
        return "  " + k + ": { key: " + q(c.key) + ", name: " + q(c.name) + ", color: " + q(c.color) + " }";
      })
      .join(',\n') +
    '\n};'
  );
}

function serParts(parts) {
  const keys = Object.keys(parts);
  return (
    'const EPISODE_PARTS = {\n' +
    keys
      .map((k) => {
        const c = parts[k];
        return (
          '  ' + k + ': { key: ' + q(c.key) + ', label: ' + q(c.label) + ', range: ' + q(c.range) + ' }'
        );
      })
      .join(',\n') +
    '\n};'
  );
}

const HEADER = `/**
 * 分集介绍 · 礼学考究
 * ------------------------------------------------------------
 * 数据说明（务必与页面上的「说明」区块保持一致）：
 *  1. 分集剧情依据公开报道整理（香港01 剧集逐集更新页为主，参腾讯视频剧集页 /
 *     新浪娱乐等），共 47 集，第 1—47 集已全部补齐；集数与分集细节以实际播出为准。
 *     本剧分上下两部，上部《兰香如故》31 集，下部《香传》16 集。
 *  2. 剧情为整理者依据公开报道改写概括，非原文照搬，亦非片方官方解说。
 *  3. 礼学考究为「观剧延伸阅读」，引《礼记》《仪礼》《大明律》《大明会典》
 *     《大戴礼记》《武备志》《丸经》等典籍作注，属整理者解读。
 *  4. 剧中礼学体系由剧组礼学指导统一设定（据新浪娱乐报道为张晓龙，曾任
 *     《甄嬛传》礼仪指导），行礼轻重、器物形制皆有范本。
 * ------------------------------------------------------------
 * 字段：
 *   id / ep / part / title / arc / keywords[] / summary[] / rituals[]
 *   rituals[]: { term, image?, category, source, explain, inPlot }
 *   category 取值见 EPISODE_RITUAL_CATEGORIES（rite / season / estate / law / object）
 * ------------------------------------------------------------
 */
`;

const out = [
  HEADER,
  '/** 礼学条目分类（key -> 名称 + 主色） */',
  serCats(old.EPISODE_RITUAL_CATEGORIES),
  '',
  '/** 上部 / 下部 */',
  serParts(old.EPISODE_PARTS),
  '',
  'const EPISODES = [\n' + merged.map(serEp).join(',\n') + '\n];',
  '',
  "/** 页面顶部的「说明」文案（与数据同源，避免两处不一致） */",
  "const EPISODE_NOTES = {",
  "  title: '关于本页',",
  "  parts: [",
  "    '本剧分上下两部：上部《兰香如故》31 集，下部《香传》16 集，共 47 集。',",
  "    '第 1—47 集分集剧情已全部补齐，依据公开报道整理改写（香港01 剧集页为主，参腾讯视频剧集页、新浪娱乐等），集数与细节以实际播出为准。',",
  "    '「礼学考究」为观剧延伸阅读：典籍出处如实标注，条目解读属整理者分析，非片方官方解说。',",
  "    '剧中礼学体系由剧组礼学指导统一设定（据新浪娱乐报道为张晓龙，曾任《甄嬛传》礼仪指导），行礼轻重与器物形制皆有范本。'",
  "  ]",
  '};',
  '',
  'module.exports = {',
  '  EPISODES: EPISODES,',
  '  EPISODE_RITUAL_CATEGORIES: EPISODE_RITUAL_CATEGORIES,',
  '  EPISODE_PARTS: EPISODE_PARTS,',
  '  EPISODE_NOTES: EPISODE_NOTES',
  '}',
  ''
].join('\n');

fs.writeFileSync(SRC, out, 'utf8');
console.log('已写出', SRC, out.length, '字节');
