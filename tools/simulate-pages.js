/**
 * 页面运行时仿真（第 20 轮新增）
 * ------------------------------------------------------------
 * 本机没装微信开发者工具时，用 Node 模拟 wx API + Page 生命周期，
 * 真跑一遍每个页面的 onLoad / onReady / onShow 和主要交互，
 * 把「打开就白屏 / 点一下就报错」这类运行时错误在上传前抓出来。
 *
 * 用法：node tools/simulate-pages.js
 * 退出码：0 = 无运行时错误；1 = 有错误
 * ------------------------------------------------------------
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const errors = [];
const logs = [];

/* ------------------------- wx API mock ------------------------- */
const storage = {};
const nav = { stack: [] };
const toast = [];
const scroll = [];

const wxMock = {
  // 导航
  navigateTo: (o) => { nav.stack.push(o.url); if (o.fail) { /* 成功路径 */ } o.success && o.success(); },
  redirectTo: (o) => { nav.stack.push(o.url); o.success && o.success(); },
  reLaunch: (o) => { nav.stack = [o.url]; o.success && o.success(); },
  navigateBack: (o) => { nav.stack.pop(); o.success && o.success(); if (o.fail && !nav.stack.length) o.fail(); },

  // 提示
  showToast: (o) => { toast.push(o.title); o.success && o.success(); },
  showLoading: () => {},
  hideLoading: () => {},
  showModal: (o) => { o.success && o.success({ confirm: true }); },

  // 滚动
  pageScrollTo: (o) => { scroll.push(o.selector || o.scrollTop); o.success && o.success(); },

  // 反馈
  vibrateShort: (o) => { o && o.success && o.success(); },

  // 标题
  setNavigationBarTitle: (o) => { o.success && o.success(); },

  // 系统信息（layout.js 用）
  getSystemInfoSync: () => ({
    statusBarHeight: 47, screenWidth: 393, screenHeight: 852,
    windowWidth: 393, windowHeight: 852, pixelRatio: 3,
    safeArea: { top: 47, bottom: 810, left: 0, right: 393, width: 393, height: 763 },
    platform: 'devtools', SDKVersion: '3.5.0', system: 'iOS 17.0'
  }),
  getWindowInfo: () => ({
    statusBarHeight: 47, windowWidth: 393, windowHeight: 852, pixelRatio: 3,
    safeArea: { top: 47, bottom: 810, left: 0, right: 393, width: 393, height: 763 },
    screenWidth: 393, screenHeight: 852, platform: 'devtools'
  }),
  getDeviceInfo: () => ({ platform: 'devtools', system: 'iOS 17.0', SDKVersion: '3.5.0' }),
  getAppBaseInfo: () => ({ SDKVersion: '3.5.0', theme: 'light', language: 'zh_CN' }),
  getMenuButtonBoundingClientRect: () => ({ top: 54, bottom: 86, left: 280, right: 368, width: 88, height: 32 }),

  // 存储
  setStorageSync: (k, v) => { storage[k] = v; },
  getStorageSync: (k) => (k in storage ? storage[k] : ''),
  removeStorageSync: (k) => { delete storage[k]; },

  // 图片
  previewImage: (o) => { o.success && o.success(); },

  // 选择器
  createSelectorQuery: () => {
    const q = {
      select: () => q,
      selectAll: () => q,
      selectViewport: () => q,
      boundingClientRect: (cb) => { q._cb = cb; return q; },
      scrollOffset: () => q,
      exec: (cb) => { cb && cb(q._cb ? [{ top: 120, height: 44, width: 393 }] : []); },
      in: () => q
    };
    return q;
  },

  // 广告（utils/ads.js 会调用；enabled=false 时不应真正请求）
  createInterstitialAd: () => {
    throw new Error('[仿真拦截] 未开通流量主却创建了插屏广告实例 —— 说明 ads.js 的总开关失效了');
  },
  createRewardedVideoAd: () => {
    throw new Error('[仿真拦截] 未开通流量主却创建了激励视频实例');
  }
};

/* ------------------------- setData 实现 ------------------------- */
function applyPath(data, pathStr, value) {
  // 支持 'a.b.c' 与 'tree[0].liked'
  const tokens = pathStr.replace(/\[(\d+)\]/g, '.$1').split('.').filter(Boolean);
  let cur = data;
  for (let i = 0; i < tokens.length - 1; i++) {
    const t = tokens[i];
    if (cur[t] == null) cur[t] = /^\d+$/.test(tokens[i + 1]) ? [] : {};
    cur = cur[t];
  }
  cur[tokens[tokens.length - 1]] = value;
}
function makeSetData(data) {
  return function (obj, cb) {
    Object.keys(obj).forEach((k) => applyPath(data, k, obj[k]));
    cb && cb();
  };
}

/* ------------------------- Page / Component ------------------------- */
const pages = {};
const comps = {};
let currentFile = null;

function buildContext(fileDir, fileName) {
  const moduleObj = { exports: {} };
  const ctx = {
    module: moduleObj,
    exports: moduleObj.exports,
    console: console,
    wx: wxMock,
    getApp: () => ({ globalData: appGlobalData }),
    Page: (cfg) => { pages[fileName] = cfg; },
    Component: (cfg) => { comps[fileName] = cfg; },
    Behavior: (cfg) => cfg,
    require: (p) => {
      let target;
      if (p.indexOf('.') === 0) target = path.resolve(fileDir, p);
      else target = path.join(ROOT, p);
      if (!fs.existsSync(target) && !fs.existsSync(target + '.js')) {
        throw new Error('require 找不到: ' + p + ' (from ' + fileName + ')');
      }
      if (!fs.existsSync(target)) target = target + '.js';
      return loadModule(target);
    },
    setTimeout: (fn) => { return 0; },   // 仿真里不真正等待
    clearTimeout: () => {},
    setInterval: () => 0,
    clearInterval: () => {},
    Date: Date, Math: Math, JSON: JSON, Object: Object, Array: Array,
    String: String, Number: Number, Boolean: Boolean, RegExp: RegExp, Error: Error,
    encodeURIComponent, decodeURIComponent, parseInt, parseFloat, isNaN
  };
  ctx.globalThis = ctx;
  return { ctx, moduleObj };
}

const moduleCache = {};
function loadModule(file) {
  if (moduleCache[file]) return moduleCache[file].exports;
  const code = fs.readFileSync(file, 'utf8');
  const fileDir = path.dirname(file);
  const fileName = path.relative(ROOT, file).split(path.sep).join('/');
  const { ctx, moduleObj } = buildContext(fileDir, fileName);
  moduleCache[file] = moduleObj;   // 先放进去，避免循环 require 死循环
  try {
    vm.runInNewContext(code, ctx, { filename: file });
  } catch (e) {
    errors.push('加载 ' + fileName + ' 失败：' + e.message);
  }
  moduleCache[file].exports = moduleObj.exports;
  return moduleObj.exports;
}

/* ------------------------- 页面清单 ------------------------- */
const PAGE_FILES = [
  { file: 'pages/graph/graph.js', name: '首页 · 角色图谱', opts: {} },
  { file: 'pages/character/character.js', name: '角色详情', opts: { id: 'han_liang' } },
  { file: 'pages/historical/historical.js', name: '历史参考人物', opts: { id: 'yu_qian' } },
  { file: 'packageEpisodes/pages/episodes/episodes.js', name: '剧情介绍', opts: {} }
];

/* ------------------------- 加载 app.js 拿到真实 globalData ------------------------- */
let appGlobalData = {};
try {
  // 直接执行 app.js，用 App() mock 捕获 globalData（比正则抠对象字面量可靠）
  const appSrc = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
  let captured = null;
  vm.runInNewContext(appSrc, {
    App: (cfg) => { captured = cfg.globalData || {}; },
    console: console, Date: Date, Math: Math, JSON: JSON,
    wx: wxMock, getApp: () => ({ globalData: {} })
  }, { filename: 'app.js' });
  if (captured) appGlobalData = captured;
} catch (e) {
  logs.push('加载 app.js 失败：' + e.message);
}
if (!Object.keys(appGlobalData).length) logs.push('未能从 app.js 取到 globalData，页面依赖它的字段可能报 undefined');

const db = loadModule(path.join(ROOT, 'utils/db.js'));

/* ------------------------- 逐页面跑 ------------------------- */
PAGE_FILES.forEach((p) => {
  console.log('\n---------------- ' + p.name + ' ----------------');
  loadModule(path.join(ROOT, p.file));
  const cfg = pages[p.file];
  if (!cfg) { errors.push(p.file + ' 未调用 Page()'); return; }

  // 构造页面实例
  const data = JSON.parse(JSON.stringify(cfg.data || {}));
  const inst = Object.assign({}, cfg, {
    data: data,
    setData: makeSetData(data),
    _testName: p.name
  });

  function call(name, arg) {
    if (typeof inst[name] !== 'function') return false;
    try {
      inst[name](arg);
      return true;
    } catch (e) {
      errors.push(p.name + ' · ' + name + '() 抛错：' + e.message);
      return false;
    }
  }

  // 生命周期
  ['onLoad', 'onShow', 'onReady'].forEach((life) => {
    if (call(life, p.opts)) console.log('  ✓ ' + life);
  });

  /**
   * 主要交互：从 WXML 反查每个事件真实携带的 data-* 键，
   * 再按页面现有数据给出合理取值 —— 否则用空 dataset 去调 onTabSwitch 会误报「tab = undefined」。
   */
  const wxmlFile = p.file.replace(/\.js$/, '.wxml');
  const wxml = fs.existsSync(path.join(ROOT, wxmlFile)) ? fs.readFileSync(path.join(ROOT, wxmlFile), 'utf8') : '';

  function datasetFor(fnName) {
    const keys = [];
    // 找含 bindtap="fnName" / catchtap="fnName" 的标签，取同一标签内的 data-*
    const tagRe = /<[a-zA-Z-]+[^>]*>/g;
    let t;
    while ((t = tagRe.exec(wxml))) {
      const tag = t[0];
      if (tag.indexOf('"' + fnName + '"') < 0) continue;
      const dRe = /data-([a-zA-Z-]+)=/g;
      let d;
      while ((d = dRe.exec(tag))) {
        const k = d[1].replace(/-([a-z])/g, (m2, c) => c.toUpperCase());
        if (keys.indexOf(k) < 0) keys.push(k);
      }
    }
    const ds = {};
    keys.forEach((k) => {
      if (k === 'id') {
        ds.id = (data.roster && data.roster[0] && data.roster[0].id)
          || (data.tree && data.tree[0] && data.tree[0].id)
          || (data.episodes && data.episodes[0] && data.episodes[0].id)
          || (data.familyChips && data.familyChips[0] && data.familyChips[0].id)
          || 'han_liang';
      } else if (k === 'tab') {
        ds.tab = data.tab === 'tree' ? 'roster' : 'tree';
      } else if (k === 'index' || k === 'idx') {
        ds[k] = 0;
      } else if (data[k + 's'] && data[k + 's'][0]) {
        ds[k] = data[k + 's'][0].id || data[k + 's'][0];
      } else if (data[k] !== undefined && data[k] !== null && typeof data[k] !== 'object') {
        ds[k] = data[k];
      } else {
        ds[k] = '';
      }
    });
    return ds;
  }

  const evts = Object.keys(cfg).filter((k) => /^on[A-Z]/.test(k) && typeof cfg[k] === 'function');
  let hit = 0, skipped = 0;
  evts.forEach((fnName) => {
    const ds = datasetFor(fnName);
    const ev = { currentTarget: { dataset: ds }, target: { dataset: ds }, detail: { value: '韩' } };
    try {
      inst[fnName](ev);
      hit++;
    } catch (e) {
      errors.push(p.name + ' · ' + fnName + '(event) 抛错：' + e.message);
    }
  });
  console.log('  ✓ 交互方法 ' + hit + '/' + evts.length + ' 次调用无异常（跳过 ' + skipped + '）');

  // 分享
  if (typeof inst.onShareAppMessage === 'function') {
    try {
      const r = inst.onShareAppMessage();
      if (!r || !r.title) errors.push(p.name + ' · onShareAppMessage 未返回 title');
      else console.log('  ✓ 分享标题：' + r.title);
    } catch (e) { errors.push(p.name + ' · 分享抛错：' + e.message); }
  }
  if (typeof inst.onShareTimeline === 'function') {
    try { inst.onShareTimeline(); console.log('  ✓ 朋友圈分享 OK'); }
    catch (e) { errors.push(p.name + ' · 朋友圈分享抛错：' + e.message); }
  }

  // 渲染后数据体检：有没有 undefined / NaN 漏进 data
  const bad = [];
  (function walk(o, prefix) {
    if (o == null || typeof o !== 'object') return;
    Object.keys(o).forEach((k) => {
      const v = o[k];
      const pth = prefix ? prefix + '.' + k : k;
      if (v === undefined) bad.push(pth + ' = undefined');
      else if (typeof v === 'number' && isNaN(v)) bad.push(pth + ' = NaN');
      else if (typeof v === 'string' && v.indexOf('undefined') >= 0) bad.push(pth + ' 含 "undefined"：' + v.slice(0, 40));
      else if (v && typeof v === 'object') walk(v, pth);
    });
  })(data, '');
  if (bad.length) { bad.slice(0, 8).forEach((b) => errors.push(p.name + ' data 异常：' + b)); }
  else console.log('  ✓ data 无 undefined / NaN');

  // onUnload / onHide
  ['onHide', 'onUnload'].forEach((life) => call(life));
});

/* ------------------------- 结果 ------------------------- */
console.log('\n================ 运行时仿真结果 ================');
if (errors.length) {
  errors.forEach((e) => console.log('  [ERROR] ' + e));
  console.log('\n共 ' + errors.length + ' 个运行时错误');
  process.exit(1);
} else {
  console.log('  ✓ 4 个页面全部完成 生命周期 → 交互 → 分享 仿真，无运行时错误');
  console.log('  ✓ 导航记录：' + (nav.stack.length ? nav.stack.join(' | ') : '（无跳转）'));
  console.log('  ✓ 滚动锚点：' + (scroll.length ? scroll.slice(0, 5).join(' , ') : '（无）'));
  process.exit(0);
}
