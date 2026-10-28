// 1. 仆从 gen→0（不进辈分层，走单独仆从段）
// 2. 家族成员补 branch 字段（大房/二房）
const fs = require('fs');
const TARGET = 'C:/Users/sy.ye/WorkBuddy/小程序/data/characters.js';
const lines = fs.readFileSync(TARGET, 'utf8').split('\n');

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
    if (lines[i].trim().startsWith(field + ':')) {
      lines[i] = lines[i].match(/^\s*/)[0] + field + ': ' + val + ',';
      return;
    }
  }
  lines.splice(obj.be, 0, '    ' + field + ': ' + val + ',');
}
function addField(cid, field, val) {
  // 只在字段不存在时添加
  const obj = findObj(cid); if (!obj) return;
  for (let i = obj.bs; i <= obj.be; i++) {
    if (lines[i].trim().startsWith(field + ':')) return; // 已有
  }
  lines.splice(obj.be, 0, '    ' + field + ': ' + val + ',');
}

console.log('=== 仆从 gen→0 + 补 servantRole ===');
const servants = [
  ['yu_chan', "'一等丫鬟'"], ['bao_gai', "'二等丫鬟'"], ['gan_tang', "'三等丫鬟'"],
  ['xiao_lian', "'三等丫鬟'"], ['lv_jier', "'三等丫鬟'"], ['qing_xiang', "'二等丫鬟'"],
  ['hong_liao', "'丫鬟'"], ['jin_zhan', "'丫鬟'"], ['lu_ccao', "'丫鬟'"], ['yin_hai', "'丫鬟'"],
  ['wu_suaner', "'管事嬷嬷'"], ['yang_zhong', "'老管事'"],
  ['jiu_gao', "'贴身侍卫'"], ['nan_ke', "'贴身侍卫'"],
  ['ling_dang', "'贴身丫鬟'"], ['tong_cao', "'心腹丫鬟'"], ['di_er', "'丫鬟'"],
];
servants.forEach(([id, role]) => {
  patch(id, 'gen', '0');
  addField(id, 'servantRole', role);
  console.log('  ✓ ' + id);
});

console.log('\n=== 林家补 branch ===');
const branches = {
  // gen 2
  'lin_changzheng': "'大房'", 'qin_shunhua': "'大房'", 'zhou_guizhi': "'大房'",
  'qiao_hongdou': "'大房'", 'bao_yiniang': "'大房'",
  'lin_changmin': "'二房'", 'wang_lingxiao': "'二房'",
  // gen 3
  'lin_jinqi': "'大房'", 'lin_jinlan': "'大房'", 'lin_xiulai': "'大房'",
  'lin_xiuru': "'大房'", 'lin_xiushu': "'大房'", 'tan_shi': "'大房'",
  'lin_jinqiao': "'二房'", 'lin_xiuwan': "'二房'", 'lin_jincen': "'二房'", 'cheng_fengxian': "'二房'",
  // gen 4
  'lin_zhangjun': "'大房'", 'lin_zhangcheng': "'大房'",
};
Object.entries(branches).forEach(([id, val]) => addField(id, 'branch', val));

fs.writeFileSync(TARGET, lines.join('\n'), 'utf8');
console.log('\n写入完成');
