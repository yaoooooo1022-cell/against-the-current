/**
 * 广告位容器
 * ------------------------------------------------------------
 * 为什么要包一层组件：
 *   1. <ad> 组件的 unit-id 不能为空，空值会直接报错；这里统一判断，取不到真实 id 就渲染占位框；
 *   2. 底部固定位要补 iOS Home 指示条的安全区；
 *   3. 用户点「收起」后本次使用不再出现，避免一直挡着内容。
 *
 * 用法：
 *   <adbanner place="bannerDock" dock closable />    // 底部固定 Banner
 *   <adbanner place="bannerShare" />                 // 内嵌 Banner（分享弹层里）
 * ------------------------------------------------------------
 */
const ads = require('../../utils/ads.js');
const layout = require('../../utils/layout.js');

Component({
  properties: {
    /** 对应 utils/ads.js 里 CONFIG.units 的 key */
    place: { type: String, value: 'bannerDock' },
    /** 占位框上的小标题 */
    label: { type: String, value: '推广位' },
    /** 底部固定模式：固定在视口底部 + 白底 + 上阴影 */
    dock: { type: Boolean, value: false },
    /** 是否显示右侧收起按钮 */
    closable: { type: Boolean, value: false },
    /** 是否显示 publishes 占位框（默认跟随 utils/ads.js 的全局开关） */
    placeholder: { type: Boolean, value: true }
  },

  data: {
    unitId: '',
    showPh: false,
    closed: false,
    failed: false,
    L: null
  },

  lifetimes: {
    attached() {
      this._sync();
    },
    show() {
      this._sync();
    }
  },

  methods: {
    _sync() {
      const unitId = ads.bannerUnitId(this.data.place);
      const showPh = this.data.placeholder && ads.showPlaceholder() && !unitId;
      const L = layout.get();
      const closed = this.data.dock ? ads.dockHidden() : false;
      this.setData({ unitId: unitId, showPh: showPh, closed: closed, L: L, failed: false });
    },

    onAdLoad() {
      this.setData({ failed: false });
    },

    /** 拉取失败（未开通流量主 / 测试号 / 网络问题）：降级为占位框或整体隐藏 */
    onAdError(e) {
      const detail = (e && e.detail) || {};
      console.warn('[adbanner] 广告拉取失败', this.data.place, detail.errCode, detail.errMsg);
      this.setData({
        failed: true,
        unitId: '',
        showPh: this.data.placeholder && ads.showPlaceholder()
      });
    },

    onClose() {
      this.setData({ closed: true });
      if (this.data.dock) ads.hideDock();
      this.triggerEvent('close');
    }
  }
});
