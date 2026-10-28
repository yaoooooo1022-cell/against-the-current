/**
 * 命令行上传小程序代码（不用打开开发者工具 GUI）
 * ------------------------------------------------------------
 * 用法： node tools/ci-upload.js [选项]
 *
 *   --ver=1.0.0        版本号（默认 1.0.0）
 *   --desc=说明文字    项目备注（默认按版本号自动生成）
 *   --robot=1          CI 机器人编号 1–30（默认 1，需在后台开通时才指定）
 *   --key=路径         指定上传密钥私钥文件路径
 *   --dry              只做环境与参数自检，不真正上传
 *   --no-proxy         忽略系统代理环境变量（怀疑代理出口 IP 导致白名单拦截时试这个）
 *   --qr               不上传，只把当前代码编译成开发版并生成预览二维码（微信扫码即用）
 *   --page=pages/…     --qr 时的落地页，默认 pages/graph/graph
 *
 * 前置一次性准备：
 *   1. mp 后台 → 开发管理 → 开发设置 → 「小程序代码上传密钥」→ 生成并下载私钥文件
 *   2. 把私钥文件放到本项目根目录，命名为 .ci-private.key（本脚本会自动找它）
 *   3. 执行： node tools/ci-upload.js
 *
 * 安全约定：私钥文件已加入 project.config.json 的 packOptions.ignore，不会进代码包；
 *           也请勿将其上传到任何 Git 仓库。
 * ------------------------------------------------------------
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

/* ---------------- 读参数 ---------------- */

function arg(name, def) {
  // 支持两种写法：--ver=1.0.3 与 --ver 1.0.3
  // （原先只认等号写法，用空格传参会静默回退默认值 —— 曾导致版本号永远停在 1.0.2）
  const hit = process.argv.find((a) => a.indexOf('--' + name + '=') === 0);
  if (hit) return hit.slice(name.length + 3);
  const sp = process.argv.indexOf('--' + name);
  if (sp >= 0 && sp + 1 < process.argv.length && process.argv[sp + 1].indexOf('--') !== 0) {
    return process.argv[sp + 1];
  }
  return def;
}
const version = arg('ver', '1.0.2');
const robot = parseInt(arg('robot', '1'), 10);
const dry = process.argv.indexOf('--dry') >= 0;
const qr = process.argv.indexOf('--qr') >= 0;                 // 生成预览二维码，不上传新版本
const pagePath = arg('page', 'pages/graph/graph');            // --qr 时的落地页

// 走不走系统代理：影响微信侧看到的出口 IP（配了 IP 白名单时很关键）
if (process.argv.indexOf('--no-proxy') >= 0) {
  ['HTTP_PROXY', 'HTTPS_PROXY', 'http_proxy', 'https_proxy', 'ALL_PROXY', 'all_proxy'].forEach((k) => {
    delete process.env[k];
  });
  console.log('  已忽略系统代理环境变量（--no-proxy）');
}

const desc = arg(
  'desc',
  '角色图谱 / 剧情介绍（47 集全） / 礼学考究 89 条 / 支持榜（命令行 CI 上传）'
);

/* ---------------- 找密钥 ---------------- */

const KEY_CANDIDATES = [
  arg('key', '') || '',
  process.env.MINIPROGRAM_CI_KEY || '',
  path.join(ROOT, '.ci-private.key'),
  path.join(ROOT, 'private.key'),
].filter(Boolean);

const keyPath = KEY_CANDIDATES.find((p) => fs.existsSync(p));

/* ---------------- 读 AppID ---------------- */

const projCfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'project.config.json'), 'utf8'));
const appid = projCfg.appid || '';

if (!/^wx[0-9a-f]{16}$/.test(appid)) {
  fail('project.config.json 里的 appid 不是正式号（当前：' + (appid || '空') + '）');
}

const KEY_HELP = [
  '找不到「小程序代码上传密钥」私钥文件。还没生成也没关系，按下面的步骤做一次即可：',
  '',
  '  ① mp 后台 → 开发管理 → 开发设置 → 「小程序代码上传密钥」→ 生成并下载',
  '  ② 把下载到的 key 文件放到项目根目录，命名为：  ' + path.join(ROOT, '.ci-private.key'),
  '',
  '也可以：用 --key=路径 指定位置，或设置环境变量 MINIPROGRAM_CI_KEY。',
  '注意：密钥若配了 IP 白名单，只能从白名单内的网络上传。',
].join('\n');

if (!keyPath && !dry) fail(KEY_HELP);

/* ---------------- 校验密钥格式（最容易搞混的一步） ---------------- */
/* 上传密钥是 mp 后台下载的 PEM 私钥文件，内容以 -----BEGIN 开头；
   32 位十六进制那个是 AppSecret，两者完全不同，提早报错省得白排队。 */

if (keyPath) {
  let raw = '';
  try {
    raw = fs.readFileSync(keyPath, 'utf8').trim();
  } catch (e) {
    fail('读不到密钥文件：' + keyPath);
  }

  if (!/^-----BEGIN/.test(raw)) {
    if (/^[0-9a-fA-F]{32}$/.test(raw)) {
      fail([
        '这个文件内容是「AppSecret」（32 位十六进制），不是「小程序代码上传密钥」。',
        '',
        '两者完全不同：',
        '   AppSecret        —— 32 位字符串，用于调用微信服务端 API（code2session 等）',
        '   代码上传密钥      —— 后台下载的一个 PEM 私钥文件，内容以 -----BEGIN 开头',
        '',
        '正确取法：mp 后台 → 开发管理 → 开发设置 → 「小程序代码上传密钥」',
        '        → 点「生成」→ 下载那个 .key 文件（不能用复制 CD 出来的文本替代）',
        '        → 放到项目根目录并命名为 .ci-private.key',
        '',
        '另外：AppSecret 已经在不安全的地方露过一次，建议到后台「开发设置 → AppSecret」重置。',
      ].join('\n'));
    }

    fail([
      '密钥文件格式不对：不是 PEM 私钥（应以 -----BEGIN 开头）。',
      '请换成 mp 后台「开发设置 → 小程序代码上传密钥」下载的那个 .key 文件本身，',
      '不要手敲内容、也不要用别处复制来的文本。',
    ].join('\n'));
  }
}

let ci;
try {
  ci = require('miniprogram-ci');
} catch (e) {
  fail([
    '未安装 miniprogram-ci。在项目根目录执行一次：',
    '  npm install miniprogram-ci',
    '然后重跑本脚本。',
  ].join('\n'));
}

/* ---------------- 执行上传 ---------------- */

(async function main() {
  console.log('');
  console.log('  项目目录  ' + ROOT);
  console.log('  AppID     ' + appid);
  console.log('  版本号    ' + version + (robot ? '   （机器人 ' + robot + '）' : ''));
  console.log('  备注      ' + desc);

  // 自检模式：在创建 Project 之前返回，避免缺密钥时直接抛错
  if (dry) {
    console.log('');
    console.log('  [dry-run] 环境与参数自检，未真正上传。');
    console.log('    miniprogram-ci  已安装 ✓');
    console.log('    AppID           合法 ✓');
    console.log('    上传密钥        ' + (keyPath ? '已找到 ✓  ' + keyPath : '未配置 ✗  需先放到项目根目录并命名为 .ci-private.key'));
    if (keyPath) {
      console.log('');
      console.log('  一切就绪，去掉 --dry 即可真正上传：  node tools/ci-upload.js');
      console.log('');
    } else {
      console.log('');
      console.log('  密钥还没配，按下面三步做一次即可：');
      console.log('    ① mp 后台 → 开发管理 → 开发设置 → 「小程序代码上传密钥」→ 生成并下载');
      console.log('    ② 把 key 文件放到项目根目录，命名为 .ci-private.key');
      console.log('    ③ 去掉 --dry 重跑： node tools/ci-upload.js');
      console.log('');
    }
    return;
  }

  const project = new ci.Project({
    appid: appid,
    type: 'miniProgram',
    projectPath: ROOT,
    privateKeyPath: keyPath,
    // 这些目录/文件在 packOptions.ignore 里已排除，这里再兜一层，绝不进包
    ignores: [
      'node_modules/**/*',
      'tools/**/*',
      '.raw-*/**/*',
      '.tmp/**/*',
      'app-icon/**/*',
      'preview.html',
      '*.html',
      '*.md',
      '*.key',
      '*.bak*',
    ],
  });

  console.log('');
  console.log('  项目目录  ' + ROOT);
  console.log('  AppID     ' + appid);
  console.log('  密钥      ' + keyPath);
  console.log('');

  /* ---------------- 预览二维码模式（--qr） ----------------
     不上传新版本，直接把当前代码编译成一次「开发版」并生成二维码，
     微信扫码即可在真机上体验。适合「改完想马上在手机上看一眼」。
     注意：扫码者需是该小程序的开发者或体验成员；二维码有效期较短，
     长期给他人体验请改用「上传 → mp 后台设为体验版」。 */
  if (qr) {
    const outDir = path.join(ROOT, '.tmp');
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
    const dest = path.join(outDir, 'preview-qrcode.png');

    await ci.preview({
      project,
      version: version,
      desc: desc,
      robot: robot,
      setting: (projCfg.setting || {}),
      qrcodeFormat: 'image',
      qrcodeOutputDest: dest,
      pagePath: pagePath,
      searchQuery: '',
      onProgressUpdate: (task) => {
        const st = task && task._status;
        if (st && st.status === 'uploading') {
          process.stdout.write('\r  编译中… ' + (st.percentage || 0) + '%');
        }
      },
    });

    console.log('\n  预览二维码已生成：' + dest);
    console.log('  用微信扫一扫即可在手机上打开（需是开发者或体验成员）。');
    console.log('  二维码有效期较短；要长期给他人体验，请走「上传 → mp 后台设为体验版」。\n');
    return;
  }

  await ci.upload({
    project,
    version: version,
    desc: desc,
    robot: robot,
    setting: (projCfg.setting || {}),
    onProgressUpdate: (task) => {
      const st = task && task._status;
      if (st && st.status === 'uploading') {
        process.stdout.write(
          '\r  上传中… ' + (st.percentage || 0) + '%'
        );
      }
    },
  });

  console.log('\n  上传成功：版本 ' + version);
  console.log('  下一步：mp 后台 → 管理 / 版本管理 → 开发版本 → 设为体验版自测，或直接提交审核。');
  console.log('  只想自己手机上看一眼？跑： node tools/ci-upload.js --qr\n');
})().catch((e) => {
  const raw = String((e && e.stack) || (e && e.message) || e);

  // IP 白名单拦截：微信会把当前出口 IP 回显出来，直接告诉用户该加哪个
  const ipHit = raw.match(/invalid ip:\s*([\d.]+)/i);
  if (ipHit) {
    console.error('\n  上传失败：当前出口 IP 不在白名单内 —— ' + ipHit[1]);
    console.error('');
    console.error('  解决（二选一，都在 mp 后台）：');
    console.error('    开发管理 → 开发设置 → 小程序代码上传密钥 → IP 白名单');
    console.error('      ① 把下面这个 IP 加进去，然后重跑 node tools/ci-upload.js');
    console.error('           ' + ipHit[1]);
    console.error('      ② 或者干脆清空白名单（不限制来源）—— 自己一个人开发时更省事');
    console.error('');
    console.error('  注意：IP 是运营商分配的，可能会变。换了网络环境再上传时，');
    console.error('        用报错里最新的那个 IP 为准。');
    console.error('');
    process.exit(1);
  }

  console.error('\n  上传失败：', (e && e.message) || e);
  console.error('\n  常见原因：');
  console.error('   ① 密钥与 AppID 不匹配（重新生成一次密钥）');
  console.error('   ② 密钥配了 IP 白名单，当前网络不在白名单内');
  console.error('   ③ 版本号必须比线上/开发版更高（已传过 1.0.0 就改 1.0.1）');
  console.error('   ④ 未安装 miniprogram-ci\n');
  process.exit(1);
});

function fail(msg) {
  console.error('\n  ' + msg.split('\n').join('\n  ') + '\n');
  process.exit(1);
}
