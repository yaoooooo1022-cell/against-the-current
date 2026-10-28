/**
 * 广告位统一管理
 * ------------------------------------------------------------
 * ⚠️ 2026-10-10 现状：**UI 已全部下线**，原因是尚未达到开通流量主的门槛。
 *    页面里不再有任何广告容器，本文件只是「保留实现」以便之后一键恢复。
 *
 * 恢复方法（三步）：
 *   1. 流量主门槛达成后，按下面第 9–11 行拿到真实 adUnitId；
 *   2. graph.wxml 恢复三处（搜索「广告位（已下线）」注释块）+ graph.json 注册 adbanner 组件；
 *   3. graph.js 恢复 tryInterstitial() 调用（onReady / onShow 各一处）。
 *   详见「小程序项目档案.md」第十八章。
 *
 * ------------------------------------------------------------
 * 三个位置（对应需求）：
 *   ① bannerDock    进入小程序 —— 插屏广告（wx.createInterstitialAd），带频次控制
 *   ② bannerDock    底部固定 Banner（准确说是 units.bannerDock，用 <ad> 组件渲染）
 *   ③ bannerShare   分享弹层底部 Banner
 *
 * 上线前必做（否则一律不展示任何广告）：
 *   1. 在微信公众平台 → 流量主 开通广告位（需满足累计独立访客等门槛）；
 *   2. 分别创建「插屏广告」「Banner 广告」拿到真实的 adUnitId（形如 adunit-xxxxxxxxxxxxxxxx）；
 *   3. 把下面的 CONFIG.enabled 改成 true，并把 adUnitId 填进 CONFIG.units。
 *
 * 未配置 / 未开通 / 拉取失败时：不展示任何真实广告，只在 CONFIG.placeholder 为 true 时
 * 渲染一个虚线占位框，便于评审版式；上线前把 placeholder 置 false 即可彻底静默。
 *
 * 频次规则（rulse.rules）：避免一进页面就弹、一天弹太多次被投诉。
 * ------------------------------------------------------------
 */

/* ---------------- 配置区：上线前改这里 ---------------- */

const CONFIG = {
  /** 总开关：没拿到真实 adUnitId 之前保持 false，绝不会去请求广告 */
  enabled: false,

  /** 未取到广告时是否显示虚线占位框（评审版式用；2026-10-12 提审前置 false，包内不留占位痕迹） */
  placeholder: false,

  units: {
    /** 底部固定 Banner（<ad> 组件） */
    bannerDock: '',
    /** 分享弹层底部 Banner（<ad> 组件） */
    bannerShare: '',
    /** 进入小程序时弹出的插屏广告（wx.createInterstitialAd） */
    interstitial: '',
    /** 激励视频（预留，暂未接入 UI） */
    rewarded: ''
  },

  rules: {
    launchDelay: 1200,      // 进入后延迟多久才允许弹插屏（ms）
    minInterval: 60000,     // 两次插屏之间的最小间隔（ms）
    maxPerSession: 2,       // 单次使用（冷启动到退出）最多弹几次
    maxPerDay: 6            // 同一天最多弹几次
  }
};

/* ---------------- 内部状态 ---------------- */

const KEY_LAST = 'lxrg_ad_last_v1';   // 上次弹插屏的时间戳
const KEY_DAY = 'lxrg_ad_day_v1';     // { day: 'YYYY-MM-DD', count: n }

const session = {
  interstitialShown: 0,
  interAd: null,
  rewardAd: null,
  hiddenDock: false       // 用户点了「收起」后，本次使用不再显示底部 Banner
};

/* ---------------- 工具 ---------------- */

function log() {
  if (!CONFIG.enabled) return;
  try {
    console.log('[ads]', Array.prototype.slice.call(arguments).join(' '));
  } catch (e) {}
}

function today() {
  const d = new Date();
  return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
}

function readStore(key, fallback) {
  try {
    const v = wx.getStorageSync(key);
    return v === '' || v === undefined || v === null ? fallback : v;
  } catch (e) {
    return fallback;
  }
}

function writeStore(key, val) {
  try {
    wx.setStorageSync(key, val);
  } catch (e) {}
}

/** 真实 adUnitId 形如 adunit-xxxxxxxx；占位值一律视为无效，避免拿了假 id 去请求 */
function isRealUnit(id) {
  return !!id && /^adunit-[0-9a-zA-Z_-]{6,}$/.test(String(id));
}

function unitOf(place) {
  return CONFIG.units[place] || '';
}

/* ---------------- 对外 API ---------------- */

const ads = {
  /** 当前配置（供调试面板 / 预览稿使用） */
  config() {
    return CONFIG;
  },

  /** 是否真的接了广告位 */
  usable(place) {
    return !!CONFIG.enabled && isRealUnit(unitOf(place));
  },

  /**
   * 给 <ad> 组件用的 unit-id。取不到真实 id 时返回空串，
   * 组件据此改渲染占位框（不传空 unit-id 给 <ad>，否则微信会报错）
   */
  bannerUnitId(place) {
    if (ads.usable(place)) return unitOf(place);
    if (isRealUnit(unitOf(place)) && !CONFIG.enabled) return '';   // 有 id 但总开关没开
    return '';
  },

  /** 是否渲染占位框 */
  showPlaceholder() {
    return !!CONFIG.placeholder;
  },

  /** 底部 Banner 是否被用户收起（本次使用内有效） */
  dockHidden() {
    return session.hiddenDock;
  },

  hideDock() {
    session.hiddenDock = true;
  },

  showDock() {
    session.hiddenDock = false;
  },

  /**
   * 进入小程序 → 弹插屏广告
   * 调用时机：首页 onReady / onShow，内部自己判频，重复调用无害。
   */
  maybeShowInterstitial() {
    if (!ads.usable('interstitial')) return false;
    if (session.interstitialShown >= CONFIG.rules.maxPerSession) return false;

    const now = Date.now();
    const last = Number(readStore(KEY_LAST, 0)) || 0;
    if (last && now - last < CONFIG.rules.minInterval) return false;

    const day = readStore(KEY_DAY, { day: '', count: 0 }) || {};
    if (day.day === today() && day.count >= CONFIG.rules.maxPerDay) return false;

    const ad = ads._interstitial();
    if (!ad) return false;

    const self = ads;
    setTimeout(() => {
      try {
        ad.load().then(() => ad.show()).catch((err) => {
          log('插屏展示失败', err && (err.errMsg || err.errCode));
        });
      } catch (e) {
        log('插屏调用异常', e);
      }
    }, CONFIG.rules.launchDelay);

    session.interstitialShown += 1;
    writeStore(KEY_LAST, now);
    writeStore(KEY_DAY, { day: today(), count: (day.day === today() ? day.count : 0) + 1 });
    return true;
  },

  /** 懒创建插屏实例（一个实例可多次 show） */
  _interstitial() {
    if (session.interAd) return session.interAd;
    try {
      if (typeof wx.createInterstitialAd !== 'function') return null;
      const ad = wx.createInterstitialAd({ adUnitId: unitOf('interstitial') });
      ad.onClose && ad.onClose(() => log('插屏已关闭'));
      ad.onError && ad.onError((err) => log('插屏错误', err && err.errMsg));
      session.interAd = ad;
      return ad;
    } catch (e) {
      log('创建插屏失败', e);
      return null;
    }
  },

  /**
   * 激励视频（预留能力，UI 暂未接入）
   * 返回 Promise<boolean>：true 表示完整看完可以发奖励
   */
  showRewarded() {
    return new Promise((resolve) => {
      if (!ads.usable('rewarded')) return resolve(false);
      try {
        if (typeof wx.createRewardedVideoAd !== 'function') return resolve(false);
        let ad = session.rewardAd;
        if (!ad) {
          ad = wx.createRewardedVideoAd({ adUnitId: unitOf('rewarded') });
          session.rewardAd = ad;
        }
        const done = (ok) => {
          try { ad.offClose && ad.offClose(onClose); } catch (e) {}
          resolve(ok);
        };
        const onClose = (res) => {
          // res.isEnded 为 true 表示完整看完
          done(!!(res && res.isEnded));
        };
        ad.onClose(onClose);
        ad.onError && ad.onError(() => done(false));
        ad.load().then(() => ad.show()).catch(() => done(false));
      } catch (e) {
        log('激励视频异常', e);
        resolve(false);
      }
    });
  },

  /**
   * 运行时注入配置（接其配置来源时用；不影响默认行为）
   *   ads.setup({ enabled: true, units: { bannerDock: 'adunit-xxx' } })
   */
  setup(patch) {
    if (!patch) return CONFIG;
    if (typeof patch.enabled === 'boolean') CONFIG.enabled = patch.enabled;
    if (typeof patch.placeholder === 'boolean') CONFIG.placeholder = patch.placeholder;
    if (patch.units) Object.keys(patch.units).forEach((k) => {
      CONFIG.units[k] = patch.units[k] || '';
    });
    if (patch.rules) Object.keys(patch.rules).forEach((k) => {
      CONFIG.rules[k] = patch.rules[k];
    });
    return CONFIG;
  }
};

module.exports = ads;
