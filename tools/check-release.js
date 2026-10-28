/**
 * 上线体检脚本
 * ------------------------------------------------------------
 * 跑一遍： node tools/check-release.js
 *
 * 检查内容：页面四件套 / 组件完整性 / JSON 合法性 / 隐私与网络扫描 /
 *          图片资源是否存在 / 广告开关 / 主包分包体积
 * 只读脚本，不改任何文件。退出码 0 = 全部通过。
 *
 * 体积统计以 project.config.json 的 packOptions.ignore 为准，
 * 被忽略的目录（tools / .raw-* / app-icon / preview.html …）不计入。
 * ------------------------------------------------------------
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SKIP_DIRS = ['tools', 'node_modules', '.git', '.workbuddy'];
// 不参与源码关键字扫描的文件（文档与预览稿不算小程序代码）
const NON_CODE_FILES = ['preview.html', '小程序项目档案.md', '上线清单.html'];

function read(f) {
  try { return fs.readFileSync(f, 'utf8'); } catch (e) { return ''; }
}

const results = [];
const ok = (k, pass, note) => results.push({ key: k, pass: !!pass, note: note || '' });

/* ---------------- 0. 打包忽略表（体积统计的唯一依据） ---------------- */

const projConfig = JSON.parse(read(path.join(ROOT, 'project.config.json')));
const ignoreSet = new Set(((projConfig.packOptions || {}).ignore || []).map((x) => x.value));

function ignored(rel) {
  if (ignoreSet.has(rel)) return true;
  for (const v of ignoreSet) {
    if (rel.indexOf(v + '/') === 0) return true; // 目录被忽略 → 其下全部忽略
  }
  return false;
}

function walk(dir, rel, filterFn) {
  let out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.indexOf(e.name) >= 0) continue;
    const r = rel ? rel + '/' + e.name : e.name;
    if (ignored(r)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out = out.concat(walk(p, r, filterFn));
    else if (filterFn(p)) out.push(p);
  }
  return out;
}

/* ---------------- 0.5 AppID 是否为正式号 ---------------- */

const appid = projConfig.appid || '';
const isRealAppid = /^wx[0-9a-f]{16}$/.test(appid);
ok(
  '已配置正式 AppID（非游客号）',
  isRealAppid,
  isRealAppid ? appid + '（可真机预览 / 上传）' : '当前为「' + (appid || '空') + '」—— 只能开模拟器'
);

/* ---------------- 0.6 上传 CI 的安全性 ---------------- */

const ciScript = fs.existsSync(path.join(ROOT, 'tools', 'ci-upload.js'));
if (ciScript) {
  const excluded = ignored('.ci-private.key') && ignored('private.key') && ignored('node_modules');
  ok(
    '上传密钥不会进代码包（安全）',
    excluded,
    excluded ? '.ci-private.key / private.key / node_modules 均已在忽略表' : '忽略表缺少密钥项，上传前务必补上'
  );

  // 只判断格式，绝不打印密钥内容
  const keyFile = ['.ci-private.key', 'private.key']
    .map((f) => path.join(ROOT, f))
    .filter((p) => fs.existsSync(p))[0];

  if (!keyFile) {
    ok('上传密钥状态', true, '尚未配置 —— 上传前到后台「开发设置 → 小程序代码上传密钥」下载 .key 文件放根目录');
  } else {
    const raw = read(keyFile).trim();
    if (!raw) {
      ok('上传密钥状态', false, '文件是空的');
    } else if (!/^-----BEGIN/.test(raw)) {
      ok(
        '上传密钥状态',
        false,
        /^[0-9a-fA-F]{32}$/.test(raw)
          ? '这是 AppSecret（32 位十六进制），不是上传密钥 —— 需换成后台下载的 PEM 私钥文件'
          : '不是 PEM 格式（应以 -----BEGIN 开头）'
      );
    } else {
      ok('上传密钥状态', true, '已就位且格式正确');
    }
  }
}

/* ---------------- 1. 结构完整性 ---------------- */

const appJson = JSON.parse(read(path.join(ROOT, 'app.json')));

const missed = [];
const pageList = appJson.pages.concat(
  (appJson.subPackages || []).reduce((a, s) => a.concat(s.pages.map((p) => s.root + '/' + p)), [])
);
for (const p of pageList) {
  for (const ext of ['js', 'json', 'wxml', 'wxss']) {
    if (!fs.existsSync(path.join(ROOT, p + '.' + ext))) missed.push(p + '.' + ext);
  }
}
ok('页面四件套齐全', missed.length === 0, missed.length ? '缺文件：' + missed.join(', ') : pageList.length + ' 个页面');

const compMiss = [];
const comps = Object.keys(appJson.usingComponents || {});
for (const name of comps) {
  const v = appJson.usingComponents[name];
  for (const ext of ['js', 'json', 'wxml', 'wxss']) {
    if (!fs.existsSync(path.join(ROOT, v + '.' + ext))) compMiss.push(v + '.' + ext);
  }
}
ok('自定义组件四件套', compMiss.length === 0, compMiss.length ? '缺文件：' + compMiss.join(', ') : comps.length + ' 个组件');

/* ---------------- 2. JSON 合法性 ---------------- */

const jsonBad = [];
for (const f of walk(ROOT, '', (p) => p.endsWith('.json'))) {
  try { JSON.parse(read(f)); } catch (e) { jsonBad.push(path.relative(ROOT, f)); }
}
ok('所有 JSON 可解析', jsonBad.length === 0, jsonBad.length ? jsonBad.join(', ') : '含 app.json / 各页面 json / sitemap');

/* ---------------- 3. 源码关键字扫描（隐私 / 网络 / 支付） ---------------- */

const srcFiles = walk(ROOT, '', (p) => /\.(js|wxml|json)$/.test(p) && NON_CODE_FILES.indexOf(path.basename(p)) < 0);
const src = srcFiles.map(read).join('\n');

const scanAbsent = (label, re, hitNote) => {
  const m = src.match(re) || [];
  ok(label, m.length === 0, m.length ? (hitNote || '命中 ' + m.length + ' 处，需人工复核') : '未使用');
};

scanAbsent('未调用手机号/用户信息等隐私接口', /wx\.(getUserProfile|getUserInfo|getPhoneNumber|getLocation|chooseAddress|openSetting)/g);
scanAbsent('未调用订阅消息接口', /requestSubscribeMessage/g);
scanAbsent('无网络请求（无需配置 request 合法域名）', /wx\.(request|uploadFile|downloadFile)\s*\(/g);
scanAbsent('无支付能力（不涉及虚拟支付限制）', /wx\.requestPayment/g);
scanAbsent('无 web-view 外链', /<web-view/g);
scanAbsent('无相册保存（不涉及相册权限）', /saveImageToPhotosAlbum|canvasToTempFilePath/g);

const remoteHits = (src.match(/https?:\/\/(?!developers\.weixin|mp\.weixin)[^\s'",)]+/g) || []);
ok('无外链图片 / 远程资源', remoteHits.length === 0, remoteHits.length ? '存在远端 URL：' + remoteHits.slice(0, 3).join(', ') : '未使用');

/* ---------------- 4. 图片资源 ---------------- */

const imgFiles = walk(ROOT, '', (p) => /\.(png|jpg|jpeg|webp)$/.test(p));
const missingImg = [];
const dbSrc = read(path.join(ROOT, 'utils', 'db.js'));
for (const m of dbSrc.matchAll(/['"`](\/[^'"`]*?\.(?:png|jpg|jpeg))['"`]/g)) {
  if (!fs.existsSync(path.join(ROOT, m[1]))) missingImg.push(m[1]);
}
ok('数据里引用的图片都存在', missingImg.length === 0, missingImg.length ? missingImg.join(', ') : imgFiles.length + ' 张本地图片');

/* ---------------- 5. 广告开关 ---------------- */

const ads = read(path.join(ROOT, 'utils', 'ads.js'));
// 先剥注释，否则头部说明里的 "形如 adunit-xxxxx" 会被误判成已配置
const adsCode = ads.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const unitBlock = (adsCode.match(/units:\s*\{([\s\S]*?)\}/) || ['', ''])[1];
const enabled = /enabled:\s*false/.test(adsCode);
const placeholder = /placeholder:\s*true/.test(adsCode);
const hasUnit = /'adunit-[^']+'/.test(unitBlock);
ok(
  '广告总开关默认关闭（不请求真实广告）',
  enabled,
  hasUnit ? '已填 adUnitId，投放前把 enabled 置 true' : '未填 adUnitId —— 当前不会请求任何真实广告'
);
ok('未投放时占位框状态', true, placeholder ? 'placeholder: true（正式上线建议置 false）' : 'placeholder: false');

// 2026-10-10 起广告 UI 已下线（未达流量主门槛）：页面里不应再出现广告容器
const wxmlFiles = []
  .concat(walk(path.join(ROOT, 'pages'), '', (f) => /\.wxml$/.test(f)))
  .concat(walk(path.join(ROOT, 'packageEpisodes'), '', (f) => /\.wxml$/.test(f)));
const adTags = wxmlFiles.filter((f) => /<adbanner[\s>]/.test(read(f)));
ok(
  '页面未残留广告容器（UI 已下线）',
  adTags.length === 0,
  adTags.length ? '这些页面还有 <adbanner>：' + adTags.map((f) => path.relative(ROOT, f)).join(', ') : '恢复方式见 utils/ads.js 顶部与档案第十八章'
);

/* ---------------- 6. 包体积（按 ignore 表统计） ---------------- */

const packed = walk(ROOT, '', () => true);
const bytesOf = (files) => files.reduce((a, f) => a + fs.statSync(f).size, 0);
const PKG_DIR = path.join(ROOT, 'packageEpisodes');
const pkgFiles = packed.filter((f) => f.indexOf(PKG_DIR) === 0);
const mainFiles = packed.filter((f) => f.indexOf(PKG_DIR) !== 0);
const mainB = bytesOf(mainFiles);
const pkgB = bytesOf(pkgFiles);

ok('主包体积 < 2MB', mainB < 2 * 1024 * 1024, (mainB / 1048576).toFixed(2) + ' MB（' + mainFiles.length + ' 个文件）');
ok('分包体积 < 2MB', pkgB < 2 * 1024 * 1024, (pkgB / 1048576).toFixed(2) + ' MB（' + pkgFiles.length + ' 个文件）');

/* ---------------- 输出 ---------------- */

const pass = results.filter((r) => r.pass).length;
console.log('\n================ 《兰香如故》角色图谱 · 上线体检 ================\n');
for (const r of results) {
  console.log((r.pass ? ' [通过] ' : ' [待办] ') + r.key + (r.note ? '  —  ' + r.note : ''));
}
console.log('\n------------------------------');
console.log(' 通过 ' + pass + ' / ' + results.length);
if (pass === results.length) console.log(' 结论：代码层面无阻塞项，可以进入开发者工具上传。');
else console.log(' 结论：上述「待办」项需处理后再提交审核。');
console.log('--------------------------------\n');

process.exit(pass === results.length ? 0 : 1);
