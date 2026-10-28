/**
 * 适配层：屏幕 / 状态栏 / 胶囊按钮 / 安全区
 * ------------------------------------------------------------
 * 解决问题：
 *   1. iOS 刘海屏 / 灵动岛：自定义导航条要按 statusBarHeight 让位，
 *      并让导航内容行与右侧「胶囊按钮」视觉居中对齐；
 *   2. iOS Home 指示条：底部固定元素（如底部 Banner 广告）要补 safe-area-inset-bottom；
 *   3. 不同机型 rpx 换算比不同，涉及「按屏幕实时算尺寸」的地方统一走这里。
 *
 * 用法：
 *   const layout = require('../../utils/layout.js');
 *   const L = layout.get();                 // 结果已缓存，随便调
 *   layout.attach(this);                    // 挂到页面 data.nav，WXML 直接用 {{nav.barH}}
 *
 * 说明：wx.getSystemInfoSync 在新版基础库已不推荐，这里优先用 wx.getWindowInfo /
 *      wx.getDeviceInfo，取不到再回退；任何一步失败都不会抛错，只降级到兜底值。
 * ------------------------------------------------------------
 */

let cache = null;

/** 包一层，避免个别机型 / 低版本基础库上某个 API 直接抛错导致白屏 */
function safeCall(fn, fallback) {
  try {
    const v = fn();
    return v === undefined || v === null ? fallback : v;
  } catch (e) {
    return fallback;
  }
}

function sysInfo() {
  return safeCall(() => (wx.getSystemInfoSync ? wx.getSystemInfoSync() : null), {}) || {};
}

function winInfo() {
  const w = safeCall(() => (wx.getWindowInfo ? wx.getWindowInfo() : null), null);
  return w || sysInfo();
}

function devInfo() {
  const d = safeCall(() => (wx.getDeviceInfo ? wx.getDeviceInfo() : null), null);
  return d || sysInfo();
}

function baseInfo() {
  const a = safeCall(() => (wx.getAppBaseInfo ? wx.getAppBaseInfo() : null), null);
  return a || sysInfo();
}

/** 右上角胶囊按钮的位置尺寸（部分机型 / 开发者工具拿不到，返回 null） */
function capsuleRect() {
  const r = safeCall(() => (wx.getMenuButtonBoundingClientRect ? wx.getMenuButtonBoundingClientRect() : null), null);
  if (!r || !r.width || !r.height) return null;
  return r;
}

function num(v, fallback) {
  const n = Number(v);
  return isNaN(n) ? fallback : n;
}

function compute() {
  const s = sysInfo();
  const w = winInfo();
  const d = devInfo();
  const a = baseInfo();

  const windowWidth = num(w.windowWidth != null ? w.windowWidth : s.windowWidth, 375);
  const windowHeight = num(w.windowHeight != null ? w.windowHeight : s.windowHeight, 667);
  const pixelRatio = num(w.pixelRatio != null ? w.pixelRatio : s.pixelRatio, 2);
  const statusBarH = num(w.statusBarHeight != null ? w.statusBarHeight : s.statusBarHeight, 20);

  const system = String(d.system || s.system || '');
  const platform = String(d.platform || s.platform || '');
  const isIOS = /ios|iphone|ipad|ipod/i.test(system) || platform === 'ios';
  const isDevtools = /devtools/i.test(platform) || /devtools/i.test(system);
  const theme = String(a.theme || s.theme || 'light');

  /* ---- 底部安全区（Home 指示条高度，px） ---- */
  let safeBottom = 0;
  const area = w.safeArea || s.safeArea;
  if (area && typeof area.bottom === 'number' && area.bottom > 0) {
    safeBottom = Math.max(0, Math.round(windowHeight - area.bottom));
  }

  /* ---- 自定义导航条几何 ---- */
  const cap = capsuleRect();
  let barH;        // 导航条总高（含状态栏）
  let contentH;    // 导航内容行高（不含状态栏）
  let sideW;       // 左右预留区宽度（保证标题真正居中）
  let capGap;      // 胶囊右侧外边距

  if (cap) {
    capGap = Math.max(0, Math.round(windowWidth - cap.right));
    contentH = Math.round(cap.height + Math.max(0, cap.top - statusBarH) * 2);
    barH = Math.round(cap.bottom + Math.max(0, cap.top - statusBarH));
    sideW = Math.round(cap.width + capGap * 2);
  } else {
    // 拿不到胶囊（部分安卓 / 模拟器 / 开发者工具）时的兜底
    capGap = 8;
    contentH = 44;
    barH = Math.round(statusBarH + 44);
    sideW = Math.round(Math.min(windowWidth * 0.32, 112));
  }

  return {
    isIOS: isIOS,
    isDevtools: isDevtools,
    theme: theme,
    windowWidth: windowWidth,
    windowHeight: windowHeight,
    pixelRatio: pixelRatio,
    statusBarH: statusBarH,
    safeBottom: safeBottom,
    barH: barH,
    contentH: contentH,
    sideW: sideW,
    capGap: capGap,
    rpxRatio: 750 / windowWidth
  };
}

/** px → rpx（页面 setData 里要给 WXML 用 rpx 值时走这里） */
function px2rpx(px) {
  return Math.round(px * (750 / layoutApi.get().windowWidth));
}

/** rpx → px */
function rpx2px(rpx) {
  return Math.round((rpx * layoutApi.get().windowWidth) / 750);
}

const layoutApi = {
  /** 量取结果已缓存，可放心高频调用 */
  get() {
    if (!cache) cache = compute();
    return cache;
  },

  /** 屏幕旋转 / 分屏等场景需要重新量取时调用 */
  refresh() {
    cache = null;
    return this.get();
  },

  /** 把结果挂到页面或组件的 data.nav 上 */
  attach(ctx) {
    const L = this.get();
    if (ctx && ctx.setData) ctx.setData({ nav: L });
    return L;
  },

  px2rpx: px2rpx,
  rpx2px: rpx2px
};

module.exports = layoutApi;
