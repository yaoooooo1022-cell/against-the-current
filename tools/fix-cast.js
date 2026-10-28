// 对照演员表批量补缺：沈家缺人、郑家/显国公府新建、韩家缺姊、杜家缺丫鬟、永昌侯府缺三叔、方域/红蓼/金盏/露草/银海/铃铛/童年林锦岐
const fs = require('fs');

const TARGET = 'C:/Users/sy.ye/WorkBuddy/小程序/data/characters.js';
const lines = fs.readFileSync(TARGET, 'utf8').split('\n');

// ── 工具 ──
function findObj(cid) {
  let idx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes("id: '" + cid + "'") && !lines[i].includes('label:')) { idx = i; break; }
  }
  if (idx < 0) return null;
  let bs = -1; for (let i = idx; i >= 0; i--) { if (lines[i].trim() === '{') { bs = i; break; } }
  let d = 0, be = -1;
  for (let i = bs; i < lines.length; i++) {
    d += (lines[i].match(/\{/g) || []).length - (lines[i].match(/\}/g) || []).length;
    if (d === 0) { be = i; break; }
  }
  return { bs, be };
}

function patch(cid, field, val) {
  const obj = findObj(cid); if (!obj) { console.log('  ✗ ' + cid); return; }
  for (let i = obj.bs; i <= obj.be; i++) {
    const t = lines[i].trim();
    if (t.startsWith(field + ':')) {
      lines[i] = lines[i].match(/^\s*/)[0] + field + ': ' + val + ',';
      console.log('  ✓ ' + cid + '.' + field);
      return;
    }
  }
  console.log('  ✗ ' + cid + ' 无 ' + field);
}

// 在数组末尾（]; 之前）插入新角色
function appendChars(chars) {
  // 找 ]; 行
  let closeIdx = -1;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].trim() === '];') { closeIdx = i; break; }
  }
  if (closeIdx < 0) { console.log('  ✗ 未找到 ];'); return; }

  // 找前一个对象的闭合 } 行
  let prevClose = closeIdx - 1;
  while (prevClose >= 0 && lines[prevClose].trim() === '') prevClose--;

  const blocks = chars.map(c => [
    '  {',
    "    id: '" + c.id + "',",
    "    name: '" + c.name + "',",
    "    alias: '" + (c.alias || '') + "',",
    "    actor: '" + (c.actor || '') + "',",
    "    family: '" + c.family + "',",
    "    gen: " + c.gen + ",",
    "    title: '" + (c.title || '') + "',",
    "    role: '" + (c.role || 'minor') + "',",
    "    intro: '" + (c.intro || '剧中人物，资料待补充。').replace(/'/g, "\\'") + "',",
    "    relations: " + JSON.stringify(c.relations || []).replace(/"/g, "'") + ",",
    "    historicalId: null,",
    "    variantOf: " + (c.variantOf ? "'" + c.variantOf + "'" : 'null') + ",",
    "    inferred: " + (c.inferred ? 'true' : 'false'),
    '  },',
  ].join('\n'));

  lines.splice(closeIdx, 0, ...blocks.join('\n').split('\n'));
  console.log('  ✓ 插入 ' + chars.length + ' 个角色');
}

console.log('=== 修复现有角色 ===');

// 郑百川 → zheng
patch('zheng_baichuan', 'family', "'zheng'");
patch('zheng_baichuan', 'gen', '2');
patch('zheng_baichuan', 'role', "'support'");
patch('zheng_baichuan', 'title', "'显国公 · 后军都督府都督'");

// 郑匀 → zheng
patch('zheng_yun', 'family', "'zheng'");
patch('zheng_yun', 'gen', '3');

// 韦田旋 → zheng
patch('wei_tianxuan', 'family', "'zheng'");
patch('wei_tianxuan', 'gen', '2');
patch('wei_tianxuan', 'title', "'显国公夫人 · 郑蔓宜之母'");

// 青年林锦岐 → 标记为 variant
patch('lin_jinqi_young', 'variantOf', "'lin_jinqi'");

console.log('\n=== 新增角色 ===');

appendChars([
  // 沈家
  { id: 'shen_zhongli', name: '沈仲礼', family: 'shen', gen: 2, actor: '', role: 'minor',
    title: '沈家二子 · 沈嘉莲之父', gender: 'm',
    intro: "沈其翰次子，徐莼（沈二夫人）之夫，沈嘉莲之父。沈家蒙难后与女眷一同赴死。",
    relations: [{ id: 'shen_qihan', label: '父子' }, { id: 'shen_er_furen', label: '夫妻' }, { id: 'shen_jialian', label: '父女' }],
    inferred: true },
  { id: 'shen_jialian', name: '沈嘉莲', family: 'shen', gen: 3, actor: '李祉默', role: 'minor',
    title: '沈家二小姐 · 沈嘉兰堂妹', gender: 'f',
    intro: "沈仲礼与徐莼之女，沈嘉兰的堂妹。沈家遭查抄后，年幼的她随祖母及沈家女眷一同赴死。",
    relations: [{ id: 'shen_zhongli', label: '父女' }, { id: 'shen_er_furen', label: '母女' }, { id: 'shen_jialan', label: '堂姐妹' }] },
  { id: 'shen_shuci', name: '沈叔辞', family: 'shen', gen: 2, actor: '', role: 'minor',
    title: '沈家三子 · 沈三夫人之夫', gender: 'm',
    intro: "沈其翰三子，楚蘅（沈三夫人）之夫。沈家蒙难后与女眷一同赴死。",
    relations: [{ id: 'shen_qihan', label: '父子' }, { id: 'shen_san_furen', label: '夫妻' }],
    inferred: true },

  // 郑家/显国公府
  { id: 'zheng_manyi', name: '郑蔓宜', family: 'zheng', gen: 3, actor: '嘉泽', role: 'support',
    title: '显国公之女', gender: 'f',
    intro: "显国公郑百川的小女儿，原为秦舜华替林锦岐选定的未婚妻。发现林锦岐以玉蝉名义送兰花给兰香后，对兰香心生怨恨，企图设局诬陷她与韩粱私通。计划未成后，其父将兰香打晕卖至扬州妓院。后郑家因谋反全家入狱，女眷被贬入教坊司，她不甘受辱在监狱门口自尽。",
    relations: [{ id: 'zheng_baichuan', label: '父女' }, { id: 'wei_tianxuan', label: '母女' }] },

  // 韩家
  { id: 'han_zhi', name: '韩苢', family: 'han', gen: 3, actor: '张欢欢', role: 'minor',
    title: '韩粱之姊', gender: 'f',
    intro: "韩粱的姊姊。原已出嫁，丈夫去世后成为寡妇。亡夫家人为逃避赋役企图强行将她带回夫家守孝，韩粱出面阻止，将她接回韩家生活。",
    relations: [{ id: 'han_liang', label: '姐弟' }, { id: 'han_mu', label: '母女' }] },

  // 永昌侯府
  { id: 'yuan_sanshu', name: '袁三叔', family: 'yuan', gen: 2, actor: '孙靖淳', role: 'minor',
    title: '永昌侯府三叔', gender: 'm',
    intro: "袁家三叔，永昌侯府长辈。",
    relations: [{ id: 'yuan_shaohui', label: '叔侄' }], inferred: true },

  // 林府童年
  { id: 'lin_jinqi_child', name: '童年林锦岐', family: 'lin', gen: 3, actor: '杨云汉', role: 'minor',
    title: '林锦岐童年时期', gender: 'm',
    intro: "林锦岐童年时期。",
    relations: [{ id: 'lin_jinqi', label: '同一角色 · 童年版' }], variantOf: 'lin_jinqi' },

  // other 角色
  { id: 'fang_yu', name: '方域', family: 'other', gen: 0, actor: '吴晓东', role: 'minor',
    title: '汉王谋士', gender: 'm',
    intro: "汉王帐下谋士，为汉王出谋划策、拉拢朝臣。汉王叛乱失败后随之覆灭。",
    relations: [{ id: 'hanwang', label: '幕僚' }] },
  { id: 'ling_dang', name: '铃铛', family: 'other', gen: 0, actor: '敖华晓', role: 'minor',
    title: '杜翠雀贴身丫鬟', gender: 'f',
    intro: "杜翠雀的贴身丫鬟，听命于杜翠雀。趁茶水房仆人宝盖疏忽之际，暗中在兰香的洗澡水中投入南疆秘毒。下毒一事遭兰香识破后，最终被杜翠雀毒害身亡。",
    relations: [{ id: 'du_cuique', label: '主仆' }] },
  { id: 'hong_liao', name: '红蓼', family: 'other', gen: 0, actor: '宁丽君', role: 'minor',
    title: '', gender: 'f', intro: "剧中人物，资料待补充。" },
  { id: 'jin_zhan', name: '金盏', family: 'other', gen: 0, actor: '杨葵葵', role: 'minor',
    title: '', gender: 'f', intro: "剧中人物，资料待补充。" },
  { id: 'lu_ccao', name: '露草', family: 'other', gen: 0, actor: '蔡含旭', role: 'minor',
    title: '', gender: 'f', intro: "剧中人物，资料待补充。" },
  { id: 'yin_hai', name: '银海', family: 'other', gen: 0, actor: '江玲', role: 'minor',
    title: '', gender: 'f', intro: "剧中人物，资料待补充。" },
]);

fs.writeFileSync(TARGET, lines.join('\n'), 'utf8');
console.log('\n写入完成');
