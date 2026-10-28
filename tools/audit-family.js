/**
 * 族谱关系核查（第 21 轮）
 * ------------------------------------------------------------
 * 只做「可疑项筛查」，不自动改任何数据 —— 所有条目都要用户确认后才动。
 *
 * 检查：
 *   ① 姓氏 vs 所属家族不一致
 *   ② relation 单向（A 认了 B，B 没认 A）
 *   ③ 亲属称谓与 gen 辈分矛盾
 *   ④ intro 提到的亲属没有落到 relations
 *   ⑤ title 与所属家族矛盾
 *   ⑥ 同一角色被多家认领（intro 里出现别的家族）
 *   ⑦ relations 数组空洞（脚本插入遗留的 `},,` 会造成稀疏数组，
 *      JSON.stringify 显示成 null，但 forEach/map 会跳过 —— 极难肉眼发现）
 * ------------------------------------------------------------
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const db = require(path.join(ROOT, 'utils/db.js'));

const cs = db.getCharacters();
const byId = {};
cs.forEach((c) => { byId[c.id] = c; });
const famName = {};
db.getFamilies().forEach((f) => { famName[f.id] = f.name; });

function rel(c) { return c.relations || []; }
function N(id) { return byId[id] ? byId[id].name : id; }

const out = [];
function push(cat, level, msg) { out.push({ cat, level, msg }); }

/* ---------- ① 姓氏 vs 家族 ---------- */
const FAM_SURNAME = { shen: '沈', lin: '林', zhao: '赵', xu: '许', han: '韩', du: '杜' };
/**
 * 姓氏检查要过滤掉「本来就该不同姓」的情况，否则全是噪音：
 *   - 时期变体名：「少年沈嘉兰」「青年林锦岐」取真名再比
 *   - 外姓媳妇 / 姨娘 / 母亲：本姓不同是正常的
 *   - 仆役（丫鬟、管事、侍卫、嬷嬷、家奴）：不姓主家姓
 */
const ERA_PREFIX = /^(少年|青年|成年|童年|少女|幼年|老年)/;
const OTHER_SURNAME_OK = /之妻|之母|夫人|姨娘|正妻|继妻|祖母|祖父|母亲|外祖母|丫鬟|管事|侍卫|嬷嬷|家奴|仆|戏班|亲属|幕僚|家族|表兄|表弟|表姐|表妹/;

cs.forEach((c) => {
  const sn = FAM_SURNAME[c.family];
  if (!sn) return;
  let name = c.name || '';
  if (ERA_PREFIX.test(name)) name = name.replace(ERA_PREFIX, '');
  const first = name.charAt(0);
  if (!first || first === sn) return;
  const tag = (c.title || '') + '｜' + (c.intro || '').slice(0, 24);
  if (OTHER_SURNAME_OK.test(tag)) return;   // 外姓媳妇 / 仆役 → 正常
  push('姓氏不符', 'WARN',
    c.name + '（id=' + c.id + '）姓「' + first + '」但归属' + famName[c.family] + '「' + sn + '」｜title=' + (c.title || '—'));
});

/* ---------- ② 关系单向 ---------- */
const PAIR_MAP = {
  '夫妻': '夫妻', '前夫妻': '前夫妻', '母子': '母子', '母女': '母女',
  '父子': '父子', '父女': '父女', '祖孙': '祖孙', '兄妹': '兄妹',
  '姐弟': '姐弟', '姐妹': '姐妹', '兄弟': '兄弟', '堂姐妹': '堂姐妹',
  '表兄妹': '表兄妹', '主仆': '主仆', '知己': '知己', '情敌': '情敌'
};
/**
 * 用户已确认「保持各自视角」的称谓对（第 21 轮拍板）。
 * 这些组合字面没有共同内核，但描述的是同一段关系的两个侧面，不该报 WARN。
 *   [A 侧说法, B 侧说法, 说明]
 */
const VIEWPOINT_PAIRS = [
  ['府中纠葛', '图谋为妾', '杜翠雀图谋为妾 → 与林锦岐之间的府中纠葛（同一段纠葛的两侧）'],
  ['堂亲', '林锦岐同辈', '与林锦岐同辈的堂亲（同一层亲缘的两种描述）']
];
function viewpointNote(a, b) {
  for (let i = 0; i < VIEWPOINT_PAIRS.length; i++) {
    const p = VIEWPOINT_PAIRS[i];
    if ((p[0] === a && p[1] === b) || (p[0] === b && p[1] === a)) return p[2];
  }
  return null;
}

cs.forEach((c) => {
  rel(c).forEach((r) => {
    const t = byId[r.id];
    if (!t) { push('关系死链', 'ERROR', c.name + ' --' + r.label + '--> ' + r.id + '（目标不存在）'); return; }
    const back = rel(t).filter((x) => x.id === c.id);
    const sameLabel = back.some((x) => x.label === r.label || x.label === (PAIR_MAP[r.label] || r.label));
    if (!back.length) {
      push('关系单向', 'WARN', c.name + ' --' + r.label + '--> ' + t.name + '，但 ' + t.name + ' 的关系列表里没有回指');
    } else if (!sameLabel) {
      // 用户已拍板「保持各自视角」：双向措辞允许不同。
      // 但只要两个说法还有共同内核，就属于正常的视角差异（INFO）；
      // 完全没有交集才可能是真的标错了（WARN）。
      const reverse = back.map((x) => x.label).join('/');
      const kernel = coreLabel(r.label).filter((k) => coreLabel(reverse).some((k2) => k === k2 || k.indexOf(k2) >= 0 || k2.indexOf(k) >= 0));
      if (kernel.length) {
        push('称谓视角差（INFO）', 'INFO',
          c.name + ' ↔ ' + t.name + '：「' + r.label + '」/「' + reverse + '」——各自视角描述，内核一致（' + kernel[0] + '）');
      } else {
        const note = viewpointNote(r.label, reverse);
        if (note) {
          push('称谓视角差（INFO）', 'INFO',
            c.name + ' ↔ ' + t.name + '：「' + r.label + '」/「' + reverse + '」——' + note);
        } else {
          push('称谓不一致', 'WARN',
            c.name + ' 称 ' + t.name + ' 为「' + r.label + '」，反向却是「' + reverse + '」——两者无共同内核，建议核对');
        }
      }
    }
  });
});

/**
 * 取称谓「内核」：拆分分隔符 + 去掉括号修饰，用于判断两种说法是否其实在说同一件事
 *   「婚约 · 夫妻」      -> ['婚约', '夫妻']
 *   「原配夫妻（后休）」 -> ['原配夫妻', '夫妻']
 */
function coreLabel(label) {
  const out = [String(label)];
  // 去括号内容，同时也保留括号内的词作为内核候选
  String(label).replace(/[（(]([^）)]*)[）)]/g, function (_, inner) { out.push(inner); return ''; });
  const stripped = String(label).replace(/[（(][^）)]*[）)]/g, '').trim();
  out.push(stripped);
  stripped.split(/[·・/、,，\s]+/).forEach(function (p) { if (p) out.push(p); });
  return Array.from(new Set(out.filter(Boolean)));
}

/* ---------- ③ 称谓 vs 辈分 ---------- */
// gen: 1 祖辈 / 2 父辈 / 3 主辈 / 4 晚辈 / 0 未分
const EXPECT = {
  '母子': [2, 3], '母女': [2, 3], '父子': [2, 3], '父女': [2, 3],
  '祖孙': [1, 3], '兄弟': [3, 3], '姐妹': [3, 3], '兄妹': [3, 3],
  '夫妻': [3, 3], '主仆': null
};
/**
 * 辈分口径（GEN_LABEL）：1=第一代·祖辈（最大） 2=父辈 3=主辈 4=晚辈
 * 即：gen 越小辈分越高。
 * 故对「母女/父子/祖孙」这类「前位是晚辈、后位是长辈」的称谓，
 * 正确形态是 target.gen 【小于】 source.gen；target.gen >= source.gen 才是真倒挂。
 */
/**
 * 辈分差的绝对值检查（与称谓方向无关 —— 数据里「母女」既有子女→父母也有父母→子女两种写法）。
 * gen 口径：1=祖辈 2=父辈 3=主辈 4=晚辈，即 gen 越小辈分越高。
 *   祖孙      应差 2 代
 *   母子/父女 应差 1 代
 *   夫妻/兄弟姐妹/堂表 应差 0 代（同辈）
 */
const EXPECTED_GAP = {
  '祖孙': 2,
  '母子': 1, '母女': 1, '父子': 1, '父女': 1, '祖孙 / 亲族': 2,
  '夫妻': 0, '前夫妻': 0, '兄妹': 0, '姐弟': 0, '姐妹': 0, '兄弟': 0,
  '堂姐妹': 0, '堂兄妹': 0, '表兄妹': 0, '堂亲': 0, '林锦岐同辈': 0
};
const GAP_LABEL = { 0: '同辈', 1: '差1代', 2: '差2代' };

cs.forEach((c) => {
  rel(c).forEach((r) => {
    const t = byId[r.id];
    if (!t) return;
    const exp = EXPECTED_GAP[r.label];
    if (exp === undefined) return;
    if (!c.gen || !t.gen) return;
    const gap = Math.abs(c.gen - t.gen);
    if (gap !== exp) {
      push('辈分不符', 'ERROR',
        c.name + '(gen' + c.gen + ') --' + r.label + '--> ' + t.name + '(gen' + t.gen + ')：' +
        '实际' + GAP_LABEL[gap === 0 ? 0 : 1] + '差 ' + gap + ' 代，该称谓应' + (GAP_LABEL[exp] || ('差' + exp + '代')));
    }
  });
});

/* ---------- ④ intro 提到的亲属没落到 relations ---------- */
const KIN_WORDS = /外祖母|祖母|祖父|外公|外婆|舅舅|姨母|姑母|表兄|表哥|表妹|堂兄|堂妹|堂姐|孪生|双生|同父异母|嫡母|生母|继母|养母|乳母/;
cs.forEach((c) => {
  const intro = c.intro || '';
  if (!KIN_WORDS.test(intro)) return;
  if (!rel(c).length) {
    push('亲属无连线', 'WARN', c.name + ' 的简介提到亲属称谓，但 relations 为空｜' + intro.slice(0, 60));
  }
});

/* ---------- ⑤ title 家族归属 ---------- */
const FAM_TITLE_CHECK = ['other'];
cs.forEach((c) => {
  const t = c.title || '';
  const f = famName[c.family] || '';
  if (!f || c.family === 'other') return;
  // 在别家当差是本分（家奴 / 管事 / 幕僚等），姓氏独立成户也很正常，不算归属存疑
  if (/家奴|仆|管事|幕僚|门客|供奉|掌柜|佃户/.test(t)) return;
  // title 里提到别的家族名
  db.getFamilies().forEach((fam) => {
    if (fam.id === c.family || fam.id === 'other') return;
    if (t.indexOf(fam.name.charAt(0) + '家') >= 0 && t.indexOf(f) < 0) {
      push('归属存疑', 'WARN', c.name + ' 归属' + f + '，但 title「' + t + '」提到' + fam.name);
    }
  });
});

/**
 * ⑦ relations 数组空洞检查
 * ------------------------------------------------------------
 * 稀疏数组的 hole：`[{a},,{b}]`
 *   - JSON.stringify 会渲染成 null —— 肉眼可见
 *   - forEach / map / filter 会【跳过】hole —— 所有基于遍历的检测都会漏掉它
 *   - 因此必须用 arr.length 与紧凑化后长度对比来识别
 * ------------------------------------------------------------
 */
function holesOf(arr) {
  const n = [];
  for (let i = 0; i < arr.length; i++) if (!(i in arr)) n.push(i);
  return n;
}
cs.forEach((c) => {
  const hs = holesOf(rel(c));
  if (hs.length) {
    push('数组空洞', 'ERROR',
      c.name + '（id=' + c.id + '）relations 第 ' + hs.map((i) => i + 1).join('、') +
      ' 位是空洞（源码疑似双逗号 `},,`），声明长度 ' + rel(c).length + '，实际 ' + (rel(c).length - hs.length) + ' 条');
  }
});

/* ---------- ⑥ 家族成员一览 ---------- */
console.log('\n================ 各家族成员一览 ================\n');
db.getFamilies().forEach((fam) => {
  const members = cs.filter((c) => c.family === fam.id);
  if (!members.length) return;
  console.log('【' + fam.name + '】' + members.length + ' 人');
  members.slice().sort((a, b) => (a.gen - b.gen)).forEach((c) => {
    const rs = rel(c).map((r) => r.label + '→' + N(r.id)).join('；');
    console.log('  gen' + c.gen + '  ' + c.name + (c.title ? '（' + c.title + '）' : '') +
      (rs ? '\n         ' + rs : ''));
  });
  console.log('');
});

/* ---------- 输出可疑项 ---------- */
console.log('================ 可疑项筛查 ================\n');
/* 严重度排序：ERROR > WARN > INFO */
const ORDER = { ERROR: 0, WARN: 1, INFO: 2 };
const cats = Array.from(new Set(out.map((o) => o.cat))).sort(function (a, b) {
  const la = Math.min.apply(null, out.filter((o) => o.cat === a).map((o) => ORDER[o.level]));
  const lb = Math.min.apply(null, out.filter((o) => o.cat === b).map((o) => ORDER[o.level]));
  return la - lb || a.localeCompare(b, 'zh');
});
cats.forEach((cat) => {
  const list = out.filter((o) => o.cat === cat);
  const lvl = Math.min.apply(null, list.map((o) => ORDER[o.level]));
  console.log('--- ' + cat + '（' + list.length + '）---');
  list.forEach((o) => console.log('  [' + o.level + '] ' + o.msg));
  console.log('');
});
const errN = out.filter((o) => o.level === 'ERROR').length;
const warnN = out.filter((o) => o.level === 'WARN').length;
const infoN = out.filter((o) => o.level === 'INFO').length;
console.log('合计 ' + out.length + ' 项｜ERROR ' + errN + ' ／ WARN ' + warnN + ' ／ INFO ' + infoN);
if (errN) { console.log('\n存在 ERROR，请修复后再提交审核。'); process.exitCode = 1; }
