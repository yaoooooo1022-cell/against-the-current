/**
 * 提审前运行时审计（第 20 轮新增）
 * ------------------------------------------------------------
 * 目的：在上传提审前，用 Node 静态 + 数据仿真的方式把「人工看不出来」的问题扫一遍：
 *   A. 数据完整性  角色 / 关系死链 / 分集 / 礼学出处 / 历史人物 / 演员代表作
 *   B. 资源引用    头像 / 礼学配图 / 分享背景图 是否真实存在
 *   C. 模板绑定    WXML 里用到的字段是否在页面 data 里有初值（防 undefined 渲染）
 *   D. 页面配置    usingComponents 指向的组件是否都存在
 *   E. 交互死链    跳转目标 id 是否都能取到数据
 *
 * 用法：node tools/audit-runtime.js
 * 退出码：0 = 无阻断项；1 = 存在 ERROR
 * ------------------------------------------------------------
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const db = require(path.join(ROOT, 'utils/db.js'));

const errors = [];
const warns = [];
const oks = [];

function E(msg) { errors.push(msg); }
function W(msg) { warns.push(msg); }
function OK(msg) { oks.push(msg); }
function exists(p) { return fs.existsSync(path.join(ROOT, p)); }

/* ============ 辅助：花括号计数取对象字面量（不用 regex，regex 不处理嵌套） ============ */
function readObjectLiteral(src, startIdx) {
  // startIdx 指向 '{'
  let i = src.indexOf('{', startIdx);
  let depth = 0, inStr = null, esc = false;
  for (; i < src.length; i++) {
    const ch = src[i];
    if (inStr) {
      if (esc) { esc = false; continue; }
      if (ch === '\\') { esc = true; continue; }
      if (ch === inStr) inStr = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') { inStr = ch; continue; }
    if (ch === '{') depth++;
    else if (ch === '}') { depth--; if (depth === 0) return src.slice(startIdx, i + 1); }
  }
  return null;
}

function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/[^\n]*/g, '$1');
}

/* ==================================================================
 * A. 数据完整性
 * ================================================================== */
console.log('\n========== A. 数据完整性 ==========');

const rawChars = db.getCharacters();
const chars = rawChars.map(db.decorate);
console.log('角色总数：' + chars.length);

// A1 intro 覆盖
const noIntro = chars.filter((c) => !c.hasIntro);
if (noIntro.length) W('A1 有 ' + noIntro.length + ' 位角色无简介（详情页会隐藏该区块）：' + noIntro.slice(0, 5).map((c) => c.name).join('、'));
else OK('A1 全部 ' + chars.length + ' 位角色均有简介');

// A1b 空壳简介：intro 有值但内容是占位文案 —— 会原样渲染给用户，是最像未完成品的痕迹
const PLACEHOLDER_INTRO = /资料待补充|待补充|资料暂缺|暂无资料|^剧中人物[。.]?$|内容位已预留/;
const shellIntro = chars.filter((c) => c.intro && PLACEHOLDER_INTRO.test(String(c.intro).trim()));
if (shellIntro.length) E('A1b ' + shellIntro.length + ' 位角色简介是占位空壳：' + shellIntro.slice(0, 8).map((c) => c.name + '「' + c.intro + '」').join('、'));
else OK('A1b 无占位空壳简介');

// A1c 过短简介（<8 字）提示复核
const tooShort = chars.filter((c) => c.intro && String(c.intro).trim().length < 8);
if (tooShort.length) W('A1c ' + tooShort.length + ' 位角色简介少于 8 字：' + tooShort.slice(0, 6).map((c) => c.name + '「' + c.intro + '」').join('、'));

// A2 关系死链
const idSet = {};
rawChars.forEach((c) => { idSet[c.id] = true; });
let deadCount = 0; const deadSamples = [];
rawChars.forEach((c) => {
  (c.relations || []).forEach((r) => {
    if (!idSet[r.id]) {
      deadCount++;
      if (deadSamples.length < 8) deadSamples.push(c.name + ' → ' + r.id);
    }
  });
});
if (deadCount) E('A2 关系死链 ' + deadCount + ' 处：' + deadSamples.join('、'));
else OK('A2 人物关系无死链');

// A3 关系无标签
let noLabel = 0;
rawChars.forEach((c) => { (c.relations || []).forEach((r) => { if (!r.label) noLabel++; }); });
if (noLabel) W('A3 有 ' + noLabel + ' 条关系缺 label（会渲染空白关系名）');
else OK('A3 关系标签齐全');

// A4 分集
const eps = db.getEpisodes();
const epsOn = eps.filter((e) => !e.unit);
const epsUnit = eps.filter((e) => e.unit);
console.log('分集条目：' + eps.length + '（正式集 ' + epsOn.length + ' / 剧情单元 ' + epsUnit.length + '）');
const epNums = epsOn.map((e) => e.ep).sort((a, b) => a - b);
const missing = [];
for (let i = 1; i <= 47; i++) if (epNums.indexOf(i) < 0) missing.push(i);
if (missing.length) E('A4 分集缺号：第 ' + missing.join('、') + ' 集');
else OK('A4 第 1—47 集全部齐备');

const dupEp = {};
const dupList = [];
epsOn.forEach((e) => { if (dupEp[e.ep]) dupList.push(e.ep); dupEp[e.ep] = true; });
if (dupList.length) E('A4b 集号重复：' + dupList.join('、'));
else OK('A4b 无重复集号');

// A5 礼学出处
let ritualTotal = 0, ritualNoSource = 0, ritualNoTitle = 0;
const ritualIds = {}; const dupRitual = [];
eps.forEach((e) => {
  (e.rituals || []).forEach((r) => {
    ritualTotal++;
    if (!r.source) ritualNoSource++;
    if (!r.term) ritualNoTitle++;
    if (r.id) { if (ritualIds[r.id]) dupRitual.push(r.id); ritualIds[r.id] = true; }
  });
});
console.log('礼学条目：' + ritualTotal);
if (ritualNoSource) E('A5 有 ' + ritualNoSource + ' 条礼学缺典籍出处（违反写作原则）');
else OK('A5 礼学条目 ' + ritualTotal + ' 条全部带出处');
if (ritualNoTitle) W('A5b 有 ' + ritualNoTitle + ' 条礼学缺标题');
if (dupRitual.length) W('A5c 礼学 id 重复：' + dupRitual.slice(0, 5).join('、'));

// A6 分集正文
const epNoBody = eps.filter((e) => !e.body && !e.summary && !e.text);
if (epNoBody.length) W('A6 有 ' + epNoBody.length + ' 条分集无正文：' + epNoBody.map((e) => e.id).slice(0, 5).join('、'));
else OK('A6 分集正文齐备');

// A7 历史人物
const hist = db.getAllHistorical();
console.log('历史人物：' + hist.length + ' 条');
if (hist.length <= 1) W('A7 历史参考人物仅 ' + hist.length + ' 条，页面内容单薄（可能被审核认为不完整）');
else OK('A7 历史人物 ' + hist.length + ' 条');

// A8 演员代表作覆盖
const actorsWithName = chars.filter((c) => c.actor);
let actorNoWorks = 0;
const actorSample = [];
actorsWithName.forEach((c) => {
  const w = db.getActorWorks(c.actor);
  if (!w || !w.length) { actorNoWorks++; if (actorSample.length < 10) actorSample.push(c.actor); }
});
console.log('有演员名：' + actorsWithName.length + ' 位；有代表作：' + (actorsWithName.length - actorNoWorks) + ' 位');
if (actorNoWorks > 0) {
  const rate = Math.round((actorsWithName.length - actorNoWorks) / actorsWithName.length * 100);
  // 2026-10-12 起：无代表作时详情页隐藏该区块，不再显示「演员资料待补充」空态
  W('A8 ' + actorNoWorks + ' 位演员无代表作（覆盖率 ' + rate + '%）——详情页已隐藏代表作区块，不影响观感，但可作为后续补数据的方向');
}

// A9 家族归属
const fams = db.getFamilies();
const famIds = {}; fams.forEach((f) => { famIds[f.id] = true; });
const badFam = chars.filter((c) => c.family && !famIds[c.family]);
if (badFam.length) E('A9 ' + badFam.length + ' 位角色 family 指向不存在的家族：' + badFam.slice(0, 5).map((c) => c.name + '/' + c.family).join('、'));
else OK('A9 家族归属全部有效');

/* ==================================================================
 * B. 资源引用
 * ================================================================== */
console.log('\n========== B. 资源引用 ==========');

// B1 主角头像
let avMissing = 0; const avSamples = [];
chars.forEach((c) => {
  if (c.avatar && c.avatar.indexOf('/images/') === 0) {
    if (!exists(c.avatar)) { avMissing++; if (avSamples.length < 10) avSamples.push(c.avatar); }
  }
});
if (avMissing) E('B1 ' + avMissing + ' 张头像文件缺失：' + avSamples.join('、'));
else OK('B1 主角头像文件全部存在');

// B2 通用头像
const genList = ['m-young', 'm-middle', 'm-old', 'f-young', 'f-middle', 'f-old'];
const genMissing = genList.filter((g) => !exists('/images/generic/' + g + '.png'));
if (genMissing.length) E('B2 通用头像缺失：' + genMissing.join('、'));
else OK('B2 通用头像 6 张齐备');

// B3 分享背景
if (!exists('/images/share/bg.jpg')) E('B3 分享卡背景图缺失');
else OK('B3 分享卡背景图存在');

// B4 礼学配图（分包）
const epRoot = path.join(ROOT, 'packageEpisodes');
let ritImgMissing = 0; const ritSamples = [];
let ritImgTotal = 0;
eps.forEach((e) => {
  (e.rituals || []).forEach((r) => {
    if (r.image) {
      ritImgTotal++;
      const p = r.image.indexOf('/') === 0 ? path.join(ROOT, r.image) : path.join(epRoot, r.image);
      if (!fs.existsSync(p)) { ritImgMissing++; if (ritSamples.length < 8) ritSamples.push(r.image); }
    }
  });
});
console.log('礼学配图：' + ritImgTotal + ' 张');
if (ritImgMissing) E('B4 ' + ritImgMissing + ' 张礼学配图缺失：' + ritSamples.join('、'));
else OK('B4 礼学配图全部存在');

/* ==================================================================
 * C. 模板绑定字段 vs 页面 data
 * ================================================================== */
console.log('\n========== C. 模板绑定 ==========');

const PAGES = [
  { name: 'pages/graph/graph', dir: 'pages/graph' },
  { name: 'pages/character/character', dir: 'pages/character' },
  { name: 'pages/historical/historical', dir: 'pages/historical' },
  { name: 'packageEpisodes/pages/episodes/episodes', dir: 'packageEpisodes/pages/episodes' }
];

// WXML 里 wx:for 产生的临时变量名，不算未定义（每页重新初始化，避免跨页累积）
const FOR_VARS_BASE = ['item', 'index'];

PAGES.forEach((p) => {
  const wxmlPath = path.join(ROOT, p.dir, path.basename(p.name) + '.wxml');
  const jsPath = path.join(ROOT, p.dir, path.basename(p.name) + '.js');
  if (!fs.existsSync(wxmlPath) || !fs.existsSync(jsPath)) { E('C0 ' + p.name + ' 缺少 wxml/js'); return; }

  const wxml = fs.readFileSync(wxmlPath, 'utf8');
  const jsRaw = fs.readFileSync(jsPath, 'utf8');
  const js = stripComments(jsRaw);

  // 取 data: { ... }
  const di = js.indexOf('\n  data:');
  let dataKeys = {};
  if (di >= 0) {
    const lit = readObjectLiteral(js, di);
    if (lit) {
      // 顶层 key（深度 1）
      let depth = 0, inStr = null, esc = false, key = '', expectKey = true;
      const body = lit.slice(1, -1);
      for (let i = 0; i < body.length; i++) {
        const ch = body[i];
        if (inStr) {
          if (esc) { esc = false; continue; }
          if (ch === '\\') { esc = true; continue; }
          if (ch === inStr) inStr = null;
          continue;
        }
        if (ch === '"' || ch === "'" || ch === '`') { inStr = ch; continue; }
        if (ch === '{' || ch === '[') depth++;
        else if (ch === '}' || ch === ']') { depth--; continue; }
        if (depth === 0 && expectKey) {
          if (/[A-Za-z_$]/.test(ch)) {
            let k = '';
            while (i < body.length && /[A-Za-z0-9_$]/.test(body[i])) { k += body[i]; i++; }
            i--;
            dataKeys[k] = true;
            // 跳到下一个逗号
            const comma = body.indexOf(',', i);
            if (comma < 0) break;
            i = comma;
            expectKey = true;
          }
        }
      }
    }
  }
  // setData 里动态写入的顶层 key 也算已定义
  const sdRe = /setData\(\s*\{([^}]*)/g;
  let m;
  while ((m = sdRe.exec(js))) {
    m[1].split(',').forEach((seg) => {
      const km = seg.match(/^\s*['"]?([A-Za-z_$][\w$]*)['"]?\s*:/);
      if (km) dataKeys[km[1]] = true;
    });
  }
  // patch['xx'] 形式
  const pkRe = /\[\s*['"]([A-Za-z_$][\w$]*)['"]\s*\]/g;
  while ((m = pkRe.exec(js))) dataKeys[m[1]] = true;

  /**
   * 抽 WXML 绑定里的「顶层变量」——
   * 只取前面不是 '.' 的标识符，属性路径（r.term / item.char.id）的第二段起一律跳过，
   * 否则会把字段名误报成未定义变量。
   */
  const bindRe = /\{\{([^}]+)\}\}/g;
  const used = {};
  while ((m = bindRe.exec(wxml))) {
    const expr = m[1];
    const clean = expr.replace(/'[^']*'/g, "''").replace(/"[^"]*"/g, '""');
    const idRe = /(^|[^.\w$\[])([A-Za-z_$][\w$]*)/g;
    let im;
    while ((im = idRe.exec(clean))) {
      const name = im[2];
      if (['true', 'false', 'null', 'undefined', 'in', 'of', 'typeof', 'return', 'new'].indexOf(name) >= 0) continue;
      used[name] = true;
    }
  }

  // wx:for-item / wx:for-index 自定义名 → 白名单
  const FOR_VARS = FOR_VARS_BASE.slice();
  const fiRe = /wx:for-item=(?:"|')([^"']+)(?:"|')/g;
  while ((m = fiRe.exec(wxml))) FOR_VARS.push(m[1]);
  const fxRe = /wx:for-index=(?:"|')([^"']+)(?:"|')/g;
  while ((m = fxRe.exec(wxml))) FOR_VARS.push(m[1]);

  // layout.attach(this) 会把 nav 注入 data，不算未定义
  if (/layout\.attach/.test(js) || /attach\(this\)/.test(js)) dataKeys['nav'] = true;

  const undefinedFields = Object.keys(used).filter(
    (k) => !dataKeys[k] && FOR_VARS.indexOf(k) < 0
  );
  if (undefinedFields.length) {
    W('C1 ' + path.basename(p.name) + ' WXML 用到但 data 无初值的字段：' + undefinedFields.join('、'));
  } else {
    OK('C1 ' + path.basename(p.name) + ' 模板字段均在 data 中有定义');
  }
});

/* ==================================================================
 * D. 页面配置
 * ================================================================== */
console.log('\n========== D. 页面配置 ==========');

const appJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'app.json'), 'utf8'));
const globalComp = appJson.usingComponents || {};

function checkPageJson(p) {
  const jp = path.join(ROOT, p.dir, path.basename(p.name) + '.json');
  if (!fs.existsSync(jp)) { E('D0 ' + p.name + ' 缺 .json'); return; }
  let j;
  try { j = JSON.parse(fs.readFileSync(jp, 'utf8')); }
  catch (e) { E('D1 ' + p.name + ' .json 解析失败：' + e.message); return; }
  const uc = Object.assign({}, globalComp, j.usingComponents || {});
  Object.keys(uc).forEach((k) => {
    let v = uc[k];
    if (v.indexOf('/') === 0) v = v.slice(1);
    const base = path.join(ROOT, v);
    ['js', 'json', 'wxml'].forEach((ext) => {
      if (!fs.existsSync(base + '.' + ext)) E('D2 组件 ' + k + ' 缺 ' + ext + '：' + v);
    });
  });
  if (j.navigationStyle !== 'custom') W('D3 ' + path.basename(p.name) + ' navigationStyle 非 custom（与自定义导航不一致）');
}
PAGES.forEach(checkPageJson);
// 分包 json
const subJsonPath = path.join(ROOT, 'packageEpisodes', 'pages', 'episodes', 'episodes.json');
if (fs.existsSync(subJsonPath)) {
  try { JSON.parse(fs.readFileSync(subJsonPath, 'utf8')); OK('D4 分包页面 json 可解析'); }
  catch (e) { E('D4 分包 json 解析失败：' + e.message); }
}

/* ==================================================================
 * E. 交互死链
 * ================================================================== */
console.log('\n========== E. 交互死链 ==========');

// E1 分集 chips 的 id 都能取到
const chips = db.getEpisodeChips();
const epsById = {}; eps.forEach((e) => { epsById[e.id] = true; });
const badChip = chips.filter((c) => !epsById[c.id]);
if (badChip.length) E('E1 chips 指向不存在的分集：' + badChip.map((c) => c.id).join('、'));
else OK('E1 分集 chips ' + chips.length + ' 个全部有效');

// E2 角色详情页可达性：所有角色 id 都能 decorate
const unreachable = [];
chars.forEach((c) => { if (!c.name) unreachable.push(c.id); });
if (unreachable.length) E('E2 有角色缺 name：' + unreachable.join('、'));
else OK('E2 全部角色 id 可正常渲染详情');

// E3 stats
const stats = db.getStats ? db.getStats() : {};
console.log('统计：' + JSON.stringify(stats));

/* ==================================================================
 * 输出
 * ================================================================== */
console.log('\n================ 审计结果 ================');
oks.forEach((s) => console.log('  [OK]   ' + s));
if (warns.length) {
  console.log('');
  warns.forEach((s) => console.log('  [WARN] ' + s));
}
if (errors.length) {
  console.log('');
  errors.forEach((s) => console.log('  [ERROR]' + s));
}
console.log('\n通过 ' + oks.length + ' 项 / 警告 ' + warns.length + ' 项 / 阻断 ' + errors.length + ' 项');
process.exit(errors.length ? 1 : 0);
